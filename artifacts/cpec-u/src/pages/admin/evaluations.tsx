import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  useListEvaluationPeriods, useCreateEvaluationPeriod, useUpdateEvaluationPeriod,
  useGetEvaluationResults, useSendEvaluationReminder, useListSemesters,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Star, Plus, Bell, Eye, EyeOff, CheckCircle, Clock, BarChart3,
  MessageSquare, Trophy, ChevronDown, ChevronRight, Users, Lock,
} from "lucide-react";

const CRITERIA_LABELS = [
  { key: "avgClarity", label: "Clarté des explications" },
  { key: "avgMastery", label: "Maîtrise du cours" },
  { key: "avgAvailability", label: "Disponibilité" },
  { key: "avgProgram", label: "Respect du programme" },
  { key: "avgPunctuality", label: "Ponctualité" },
  { key: "avgOverall", label: "Appréciation générale" },
];

function StarRating({ value, max = 5 }: { value: number | null; max?: number }) {
  if (value === null) return <span className="text-muted-foreground text-xs">—</span>;
  const pct = (value / max) * 100;
  const color = value >= 4 ? "text-green-500" : value >= 3 ? "text-yellow-500" : "text-red-400";
  return (
    <span className={`font-bold tabular-nums ${color}`}>
      {value.toFixed(2)} <span className="text-yellow-400">★</span>
    </span>
  );
}

function ScoreBar({ value, max = 5 }: { value: number | null; max?: number }) {
  if (value === null) return null;
  const pct = Math.round((value / max) * 100);
  const color = value >= 4 ? "bg-green-500" : value >= 3 ? "bg-yellow-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold w-8 text-right tabular-nums">{value.toFixed(1)}</span>
    </div>
  );
}

export default function AdminEvaluations() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/admin/evaluations/periods"] });

  const { data: periods = [], isLoading } = useListEvaluationPeriods();
  const { data: semesters = [] } = useListSemesters();
  const createPeriod = useCreateEvaluationPeriod();
  const updatePeriod = useUpdateEvaluationPeriod();
  const sendReminder = useSendEvaluationReminder();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [form, setForm] = useState({ semesterId: "", deadline: "", isActive: false });
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [expandedComments, setExpandedComments] = useState<Set<number>>(new Set());

  const { data: resultsData, isLoading: isResultsLoading, error: resultsError } =
    useGetEvaluationResults(selectedPeriodId);

  const selectedPeriod = (periods as any[]).find((p) => p.id === selectedPeriodId);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.semesterId || !form.deadline) {
      toast({ title: "Semestre et date limite sont requis", variant: "destructive" });
      return;
    }
    try {
      await createPeriod.mutateAsync({
        semesterId: parseInt(form.semesterId),
        deadline: new Date(form.deadline).toISOString(),
        isActive: form.isActive,
      });
      toast({ title: "Période d'évaluation créée" });
      invalidate();
      setIsCreateOpen(false);
      setForm({ semesterId: "", deadline: "", isActive: false });
    } catch {
      toast({ title: "Erreur lors de la création", variant: "destructive" });
    }
  };

  const handleToggleActive = async (period: any) => {
    try {
      await updatePeriod.mutateAsync({ id: period.id, isActive: !period.isActive });
      toast({ title: period.isActive ? "Période désactivée" : "Période activée et étudiants notifiés !" });
      invalidate();
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  const handleToggleResults = async (period: any) => {
    try {
      await updatePeriod.mutateAsync({ id: period.id, resultsVisible: !period.resultsVisible });
      toast({ title: period.resultsVisible ? "Résultats masqués" : "Résultats publiés !" });
      invalidate();
      if (selectedPeriodId === period.id) {
        qc.invalidateQueries({ queryKey: ["/api/admin/evaluations/periods", period.id, "results"] });
      }
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  const handleReminder = async (periodId: number) => {
    try {
      const result = await sendReminder.mutateAsync(periodId);
      toast({
        title: `Rappel envoyé à ${result.sent} étudiant${result.sent > 1 ? "s" : ""}`,
        description: result.sent === 0 ? "Tous les étudiants ont déjà soumis" : undefined,
      });
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  const toggleComments = (teacherId: number) => {
    setExpandedComments((prev) => {
      const next = new Set(prev);
      if (next.has(teacherId)) next.delete(teacherId);
      else next.add(teacherId);
      return next;
    });
  };

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">Évaluation des Enseignants</h1>
            <p className="text-muted-foreground">Gérez les périodes d'évaluation et consultez les résultats anonymes.</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="shadow-md"><Plus className="w-4 h-4 mr-2" />Nouvelle période</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Créer une période d'évaluation</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 mt-2">
                <div className="space-y-1">
                  <Label>Semestre</Label>
                  <Select value={form.semesterId} onValueChange={(v) => setForm(f => ({ ...f, semesterId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Choisir un semestre" /></SelectTrigger>
                    <SelectContent>
                      {(semesters as any[]).map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Date limite de soumission</Label>
                  <Input
                    type="datetime-local"
                    value={form.deadline}
                    onChange={(e) => setForm(f => ({ ...f, deadline: e.target.value }))}
                    min={new Date().toISOString().slice(0, 16)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={form.isActive}
                    onChange={(e) => setForm(f => ({ ...f, isActive: e.target.checked }))}
                    className="rounded"
                  />
                  <Label htmlFor="isActive">Activer immédiatement et notifier les étudiants</Label>
                </div>
                <Button type="submit" className="w-full" disabled={createPeriod.isPending}>
                  {createPeriod.isPending ? "Création..." : "Créer la période"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Periods list */}
        {isLoading ? (
          <p className="text-muted-foreground text-center py-10">Chargement...</p>
        ) : (periods as any[]).length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl">
            <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="font-semibold text-foreground">Aucune période d'évaluation</p>
            <p className="text-sm text-muted-foreground mt-1">Créez une période pour lancer les évaluations.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {(periods as any[]).map((period) => {
              const isPast = new Date(period.deadline) < new Date();
              const isSelected = selectedPeriodId === period.id;
              return (
                <div key={period.id}
                  className={`border rounded-2xl overflow-hidden shadow-sm transition-all ${isSelected ? "ring-2 ring-primary" : ""}`}>
                  <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground">{period.semesterName ?? `Semestre #${period.semesterId}`}</span>
                        {period.isActive ? (
                          <Badge className="bg-green-100 text-green-700 border border-green-300">
                            <CheckCircle className="w-3 h-3 mr-1" />Ouverte
                          </Badge>
                        ) : isPast ? (
                          <Badge variant="secondary">Clôturée</Badge>
                        ) : (
                          <Badge variant="outline">Inactive</Badge>
                        )}
                        {period.resultsVisible && (
                          <Badge className="bg-blue-50 text-blue-700 border border-blue-200">
                            <Eye className="w-3 h-3 mr-1" />Résultats publiés
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Limite : {new Date(period.deadline).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {period.submitterCount} étudiant{period.submitterCount !== 1 ? "s" : ""} — {period.evaluationCount} évaluation{period.evaluationCount !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Button variant="outline" size="sm" onClick={() => handleToggleActive(period)} disabled={updatePeriod.isPending}>
                        {period.isActive ? <><EyeOff className="w-3.5 h-3.5 mr-1" />Désactiver</> : <><CheckCircle className="w-3.5 h-3.5 mr-1" />Activer</>}
                      </Button>
                      {period.isActive && (
                        <Button variant="outline" size="sm" onClick={() => handleReminder(period.id)} disabled={sendReminder.isPending}>
                          <Bell className="w-3.5 h-3.5 mr-1" />Rappel
                        </Button>
                      )}
                      {(isPast || !period.isActive) && (
                        <Button variant="outline" size="sm" onClick={() => handleToggleResults(period)} disabled={updatePeriod.isPending}>
                          {period.resultsVisible ? <><Lock className="w-3.5 h-3.5 mr-1" />Masquer résultats</> : <><Eye className="w-3.5 h-3.5 mr-1" />Publier résultats</>}
                        </Button>
                      )}
                      <Button
                        variant={isSelected ? "default" : "secondary"}
                        size="sm"
                        onClick={() => setSelectedPeriodId(isSelected ? null : period.id)}
                      >
                        <BarChart3 className="w-3.5 h-3.5 mr-1" />{isSelected ? "Fermer" : "Résultats"}
                        {isSelected ? <ChevronDown className="w-3 h-3 ml-1" /> : <ChevronRight className="w-3 h-3 ml-1" />}
                      </Button>
                    </div>
                  </div>

                  {/* Results panel */}
                  {isSelected && (
                    <div className="border-t p-5 space-y-4 bg-muted/30">
                      {isResultsLoading ? (
                        <p className="text-muted-foreground text-sm text-center py-4">Chargement des résultats...</p>
                      ) : resultsError ? (
                        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl p-4">
                          <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                          <p className="text-amber-700 text-sm">{(resultsError as any)?.message ?? "Résultats non disponibles — la période est encore ouverte ou les résultats ne sont pas publiés."}</p>
                        </div>
                      ) : !resultsData ? null : resultsData.results.length === 0 ? (
                        <div className="text-center py-6 text-muted-foreground">
                          <p className="font-medium">Aucun résultat disponible</p>
                          <p className="text-xs mt-1">Un minimum de 5 évaluations par enseignant est requis pour afficher les résultats.</p>
                          {resultsData.hiddenCount > 0 && (
                            <p className="text-xs mt-1 text-amber-600">{resultsData.hiddenCount} enseignant{resultsData.hiddenCount > 1 ? "s" : ""} en dessous du seuil de 5 évaluations.</p>
                          )}
                        </div>
                      ) : (
                        <>
                          {resultsData.hiddenCount > 0 && (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2 text-sm text-amber-700">
                              <Lock className="w-4 h-4 shrink-0" />
                              {resultsData.hiddenCount} enseignant{resultsData.hiddenCount > 1 ? "s" : ""} masqué{resultsData.hiddenCount > 1 ? "s" : ""} (moins de 5 évaluations reçues).
                            </div>
                          )}
                          {/* Ranking */}
                          <div className="space-y-3">
                            <h3 className="font-semibold flex items-center gap-2 text-foreground">
                              <Trophy className="w-4 h-4 text-yellow-500" />Classement général
                            </h3>
                            {resultsData.results.map((r, idx) => (
                              <div key={`${r.teacherId}-${r.subjectId}`}
                                className="bg-background border border-border rounded-xl p-4 space-y-3">
                                <div className="flex items-start justify-between gap-2 flex-wrap">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className={`text-lg font-bold ${idx === 0 ? "text-yellow-500" : idx === 1 ? "text-slate-400" : idx === 2 ? "text-amber-600" : "text-muted-foreground"}`}>
                                        #{idx + 1}
                                      </span>
                                      <span className="font-semibold text-foreground">{r.teacherName}</span>
                                      <Badge variant="secondary" className="text-xs">{r.subjectName}</Badge>
                                      <Badge variant="outline" className="text-xs">{r.className}</Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5">{r.evaluationCount} évaluation{r.evaluationCount > 1 ? "s" : ""}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-2xl font-bold text-foreground">{r.globalAvg?.toFixed(2)}<span className="text-sm text-muted-foreground">/5</span></p>
                                    <div className="flex">
                                      {Array.from({ length: 5 }).map((_, i) => (
                                        <Star key={i} className={`w-3.5 h-3.5 ${i < Math.round(r.globalAvg ?? 0) ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/30"}`} />
                                      ))}
                                    </div>
                                  </div>
                                </div>
                                {/* Criteria bars */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {CRITERIA_LABELS.map((c) => (
                                    <div key={c.key}>
                                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                        <span>{c.label}</span>
                                      </div>
                                      <ScoreBar value={(r as any)[c.key]} />
                                    </div>
                                  ))}
                                </div>
                                {/* Comments */}
                                {r.comments.length > 0 && (
                                  <div>
                                    <button
                                      onClick={() => toggleComments(r.teacherId)}
                                      className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80"
                                    >
                                      <MessageSquare className="w-3.5 h-3.5" />
                                      {expandedComments.has(r.teacherId) ? "Masquer" : "Voir"} {r.comments.length} commentaire{r.comments.length > 1 ? "s" : ""}
                                    </button>
                                    {expandedComments.has(r.teacherId) && (
                                      <div className="mt-2 space-y-2">
                                        {r.comments.map((c, i) => (
                                          <div key={i} className="bg-muted/50 rounded-lg px-3 py-2 text-sm text-foreground italic border-l-2 border-primary/30">
                                            "{c}"
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
