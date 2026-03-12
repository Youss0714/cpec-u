import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout";
import {
  useListSemesters, useListClasses, useGetSemesterResults, generateBulletin,
  useGetCurrentUser, usePublishSemesterResults,
} from "@workspace/api-client-react";
import {
  useListSubjectApprovals, useApproveSubject, useUnapproveSubject, useDerogateGrade,
  usePromoteAdmitted,
} from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Search, CheckCircle, Lock, Unlock, FileEdit, Globe, GlobeLock, TrendingUp, Users, GraduationCap } from "lucide-react";

export default function AdminResults() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: currentUser } = useGetCurrentUser();
  const adminSubRole = (currentUser as any)?.adminSubRole;
  const isScolarite = adminSubRole === "scolarite" || adminSubRole === "directeur";

  const { data: semesters } = useListSemesters();
  const { data: classes } = useListClasses();

  const [selectedSemester, setSelectedSemester] = useState<string>("");
  const [selectedClass, setSelectedClass] = useState<string>("all");

  const { data: results = [], isLoading } = useGetSemesterResults(
    selectedSemester ? parseInt(selectedSemester) : 0,
    { classId: selectedClass !== "all" ? parseInt(selectedClass) : undefined },
    { query: { enabled: !!selectedSemester } as any }
  );

  const { data: approvals = [] } = useListSubjectApprovals(
    selectedSemester
      ? { semesterId: parseInt(selectedSemester), ...(selectedClass !== "all" ? { classId: parseInt(selectedClass) } : {}) }
      : undefined,
    { enabled: !!selectedSemester }
  );

  const approveSubject = useApproveSubject();
  const unapproveSubject = useUnapproveSubject();
  const derogateGrade = useDerogateGrade();
  const publishMutation = usePublishSemesterResults();
  const promoteMutation = usePromoteAdmitted();
  const [promotionResult, setPromotionResult] = useState<{ promoted: { id: number; name: string }[]; fromClass: string } | null>(null);

  const [derogationTarget, setDerogationTarget] = useState<{
    studentId: number; studentName: string; semesterId: number;
    grades: { subjectId: number; subjectName: string; value: number | null }[];
    selectedSubjectId: string;
  } | null>(null);
  const [derogationValue, setDerogationValue] = useState("");
  const [derogationJustification, setDerogationJustification] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/admin/results"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/subject-approvals"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/semesters"] });
  };

  const currentSemester = (semesters as any[])?.find((s: any) => s.id === parseInt(selectedSemester));
  const isPublished = currentSemester?.published ?? false;
  const currentClass = (classes as any[])?.find((c: any) => String(c.id) === selectedClass);
  const isTerminalClass = !!currentClass?.isTerminal;
  const canPromote = isScolarite && !!selectedSemester && selectedClass !== "all" && !isTerminalClass && !!currentClass?.nextClassId;

  const handlePromote = async () => {
    if (!canPromote) return;
    const nextCls = (classes as any[])?.find((c: any) => c.id === currentClass.nextClassId);
    const confirmed = window.confirm(
      `Promouvoir tous les étudiants admis de "${currentClass?.name}" vers "${nextCls?.name ?? "classe supérieure"}" ?\n\nCette action est irréversible.`
    );
    if (!confirmed) return;
    try {
      const result = await promoteMutation.mutateAsync({
        semesterId: parseInt(selectedSemester),
        classId: parseInt(selectedClass),
      });
      setPromotionResult(result);
      qc.invalidateQueries({ queryKey: ["/api/admin/classes"] });
      qc.invalidateQueries({ queryKey: [`/api/admin/classes/${selectedClass}/students`] });
    } catch (e: any) {
      toast({ title: e?.message ?? "Erreur lors de la promotion.", variant: "destructive" });
    }
  };

  const approvedSet = useMemo(() => {
    const s = new Set<string>();
    (approvals as any[]).forEach((a) => s.add(`${a.subjectId}-${a.classId}`));
    return s;
  }, [approvals]);

  // Unique subject+class combos from results for approval panel
  const subjectCombos = useMemo(() => {
    const map = new Map<string, { subjectId: number; subjectName: string; classId: number; className: string }>();
    (results as any[]).forEach((r) => {
      (r.grades ?? []).forEach((g: any) => {
        const key = `${g.subjectId}-${r.classId}`;
        if (!map.has(key)) map.set(key, { subjectId: g.subjectId, subjectName: g.subjectName, classId: r.classId ?? 0, className: r.className });
      });
    });
    return Array.from(map.values());
  }, [results]);

  const handleApprove = async (subjectId: number, classId: number) => {
    if (!selectedSemester) return;
    try {
      await approveSubject.mutateAsync({ subjectId, classId, semesterId: parseInt(selectedSemester) });
      toast({ title: "Notes approuvées — la matière est verrouillée pour l'enseignant." });
      invalidate();
    } catch (e: any) {
      toast({ title: e?.message ?? "Erreur", variant: "destructive" });
    }
  };

  const handleUnapprove = async (subjectId: number, classId: number) => {
    const approval = (approvals as any[]).find((a) => a.subjectId === subjectId && a.classId === classId);
    if (!approval) return;
    try {
      await unapproveSubject.mutateAsync({ id: approval.id });
      toast({ title: "Approbation annulée — l'enseignant peut à nouveau modifier les notes." });
      invalidate();
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  const handleDerogate = async () => {
    if (!derogationTarget || !derogationValue || !derogationJustification.trim()) {
      toast({ title: "Tous les champs sont obligatoires.", variant: "destructive" });
      return;
    }
    const val = parseFloat(derogationValue);
    if (isNaN(val) || val < 0 || val > 20) {
      toast({ title: "La note doit être entre 0 et 20.", variant: "destructive" });
      return;
    }
    const subjectId = parseInt(derogationTarget.selectedSubjectId);
    try {
      await derogateGrade.mutateAsync({
        studentId: derogationTarget.studentId,
        subjectId,
        semesterId: derogationTarget.semesterId,
        value: val,
        justification: derogationJustification,
      });
      toast({ title: "Dérogation enregistrée dans le journal d'activité." });
      setDerogationTarget(null);
      setDerogationValue("");
      setDerogationJustification("");
      invalidate();
    } catch {
      toast({ title: "Erreur lors de la dérogation.", variant: "destructive" });
    }
  };

  const handlePublish = async (pub: boolean) => {
    if (!selectedSemester) return;
    try {
      await publishMutation.mutateAsync({ id: parseInt(selectedSemester), data: { published: pub } });
      toast({ title: pub ? "Résultats publiés — visibles par les étudiants." : "Résultats dépubliés." });
      invalidate();
    } catch {
      toast({ title: "Erreur lors de la publication.", variant: "destructive" });
    }
  };

  const handleDownloadPDF = async (studentId: number, semesterId: number, studentName: string) => {
    try {
      const blob = await generateBulletin(studentId, semesterId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Bulletin_${studentName.replace(/\s+/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Erreur de génération du PDF", variant: "destructive" });
    }
  };

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">Résultats Académiques</h1>
            <p className="text-muted-foreground">
              {isScolarite
                ? "Approuvez les notes, gérez les dérogations et publiez les résultats."
                : "Visualisez les moyennes par semestre."}
            </p>
          </div>
          {/* Publication toggle — scolarité only */}
          {isScolarite && selectedSemester && (
            <div className="flex items-center gap-3 bg-card border rounded-2xl px-5 py-3 shadow-sm shrink-0">
              <div className="text-right">
                <p className="text-sm font-semibold text-foreground">
                  {isPublished ? "Résultats publiés" : "Non publiés"}
                </p>
                <p className="text-xs text-muted-foreground">Visibles par les étudiants</p>
              </div>
              <Switch
                checked={isPublished}
                onCheckedChange={handlePublish}
                disabled={publishMutation.isPending}
                className="data-[state=checked]:bg-emerald-500"
              />
              {isPublished ? <Globe className="w-5 h-5 text-emerald-500" /> : <GlobeLock className="w-5 h-5 text-muted-foreground" />}
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 bg-card p-4 rounded-2xl shadow-sm border border-border">
          <div className="flex-1 space-y-2">
            <label className="text-sm font-semibold text-muted-foreground">Semestre</label>
            <Select value={selectedSemester} onValueChange={setSelectedSemester}>
              <SelectTrigger><SelectValue placeholder="Choisir un semestre" /></SelectTrigger>
              <SelectContent>
                {(semesters as any[])?.map((s: any) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name} ({s.academicYear})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 space-y-2">
            <label className="text-sm font-semibold text-muted-foreground">Classe (Optionnel)</label>
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger><SelectValue placeholder="Toutes les classes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les classes</SelectItem>
                {(classes as any[])?.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selectedSemester ? (
          <>
            {/* Approval panel — scolarité only */}
            {isScolarite && subjectCombos.length > 0 && (
              <div className="bg-card border rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b bg-secondary/30">
                  <h2 className="font-semibold text-foreground flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                    Validation des Notes par Matière
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Approuver verrouille la saisie pour l'enseignant. Les dérogations restent possibles depuis ce panneau.
                  </p>
                </div>
                <div className="divide-y">
                  {subjectCombos.map(({ subjectId, subjectName, classId, className }) => {
                    const key = `${subjectId}-${classId}`;
                    const approved = approvedSet.has(key);
                    const approval = (approvals as any[]).find((a) => a.subjectId === subjectId && a.classId === classId);
                    return (
                      <div key={key} className="flex items-center justify-between px-6 py-3 hover:bg-muted/30 transition-colors">
                        <div>
                          <span className="font-medium text-sm text-foreground">{subjectName}</span>
                          <span className="text-xs text-muted-foreground ml-2">— {className}</span>
                          {approved && (
                            <p className="text-xs text-emerald-600 mt-0.5">
                              ✓ Approuvé par {approval?.approvedByName} · {new Date(approval?.approvedAt).toLocaleDateString("fr-FR")}
                            </p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant={approved ? "outline" : "default"}
                          className={approved ? "border-emerald-300 text-emerald-700 hover:bg-emerald-50" : ""}
                          onClick={() => approved ? handleUnapprove(subjectId, classId) : handleApprove(subjectId, classId)}
                          disabled={approveSubject.isPending || unapproveSubject.isPending}
                        >
                          {approved
                            ? <><Unlock className="w-3 h-3 mr-1.5" />Déverrouiller</>
                            : <><Lock className="w-3 h-3 mr-1.5" />Approuver</>}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Promotion panel — scolarité only, specific class */}
            {isScolarite && selectedClass !== "all" && (
              isTerminalClass ? (
                /* Terminal class — fin de cycle */
                <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 shadow-sm p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                    <GraduationCap className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-amber-800 dark:text-amber-200">
                      Fin de cycle — {currentClass?.name}
                    </h3>
                    <p className="text-xs text-amber-700/80 dark:text-amber-300/80 mt-0.5">
                      Les étudiants admis dans cette classe terminent leur cycle et obtiennent leur diplôme. Aucune promotion automatique n'est effectuée.
                    </p>
                  </div>
                </div>
              ) : (
                /* Normal class — promotion possible or not configured */
                <div className={`rounded-2xl border shadow-sm p-5 flex items-center justify-between gap-4 ${canPromote ? "bg-violet-50 border-violet-200 dark:bg-violet-950/30 dark:border-violet-700" : "bg-muted/30 border-border"}`}>
                  <div>
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                      <TrendingUp className={`w-4 h-4 ${canPromote ? "text-violet-600" : "text-muted-foreground"}`} />
                      Promotion de classe
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {canPromote
                        ? `Les étudiants admis (≥ 12/20) seront transférés vers la classe supérieure.`
                        : `Aucune classe supérieure configurée. Configurez-la depuis la page Classes.`}
                    </p>
                  </div>
                  <Button
                    onClick={handlePromote}
                    disabled={!canPromote || promoteMutation.isPending}
                    className={canPromote ? "bg-violet-600 hover:bg-violet-700 text-white shrink-0" : "shrink-0"}
                    variant={canPromote ? "default" : "outline"}
                  >
                    <TrendingUp className="w-4 h-4 mr-2" />
                    {promoteMutation.isPending ? "Promotion en cours..." : "Promouvoir les admis"}
                  </Button>
                </div>
              )
            )}

            {/* Results table */}
            <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
              <Table>
                <TableHeader className="bg-secondary/50">
                  <TableRow>
                    <TableHead>Étudiant</TableHead>
                    <TableHead>Classe</TableHead>
                    <TableHead className="text-center">Moyenne</TableHead>
                    <TableHead className="text-center">Rang</TableHead>
                    <TableHead className="text-center">Décision</TableHead>
                    {isScolarite && <TableHead className="text-center">Dérogation</TableHead>}
                    <TableHead className="text-right">Bulletin PDF</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-12">Calcul des résultats en cours...</TableCell></TableRow>
                  ) : (results as any[]).length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-12">Aucun résultat trouvé pour cette sélection.</TableCell></TableRow>
                  ) : (
                    (results as any[]).map((res) => (
                      <TableRow key={res.studentId} className="hover:bg-muted/50">
                        <TableCell className="font-bold">{res.studentName}</TableCell>
                        <TableCell>{res.className}</TableCell>
                        <TableCell className="text-center font-mono font-bold text-lg">
                          {res.average !== null ? res.average?.toFixed(2) : "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          {res.rank ? `${res.rank} / ${res.totalStudents}` : "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          {res.decision === "Admis" && <Badge className="bg-emerald-500 hover:bg-emerald-600">Admis</Badge>}
                          {res.decision === "Ajourné" && <Badge variant="destructive">Ajourné</Badge>}
                          {res.decision === "En attente" && <Badge variant="secondary">En attente</Badge>}
                        </TableCell>
                        {isScolarite && (
                          <TableCell className="text-center">
                            <Button
                              variant="ghost" size="sm"
                              className="text-amber-600 hover:bg-amber-50"
                              onClick={() => {
                                const grades = (res.grades ?? []).map((g: any) => ({
                                  subjectId: g.subjectId, subjectName: g.subjectName, value: g.value,
                                }));
                                setDerogationTarget({
                                  studentId: res.studentId,
                                  studentName: res.studentName,
                                  semesterId: res.semesterId,
                                  grades,
                                  selectedSubjectId: grades[0]?.subjectId ? String(grades[0].subjectId) : "",
                                });
                                setDerogationValue("");
                                setDerogationJustification("");
                              }}
                            >
                              <FileEdit className="w-3.5 h-3.5 mr-1.5" />Dérogation
                            </Button>
                          </TableCell>
                        )}
                        <TableCell className="text-right">
                          {isScolarite ? (
                            <Button
                              variant="outline" size="sm"
                              className="border-primary text-primary hover:bg-primary hover:text-white transition-colors"
                              onClick={() => handleDownloadPDF(res.studentId, res.semesterId, res.studentName)}
                            >
                              <Download className="w-4 h-4 mr-2" />PDF
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">Réservé Scolarité</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground border-2 border-dashed border-border rounded-2xl">
            <Search className="w-12 h-12 mb-4 opacity-20" />
            <p className="text-lg">Veuillez sélectionner un semestre pour voir les résultats.</p>
          </div>
        )}
      </div>

      {/* Derogation modal */}
      <Dialog open={!!derogationTarget} onOpenChange={(o) => { if (!o) setDerogationTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileEdit className="w-5 h-5 text-amber-500" />
              Modifier une note — Dérogation
            </DialogTitle>
          </DialogHeader>
          {derogationTarget && (
            <div className="space-y-4 mt-2">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
                <p className="font-semibold">{derogationTarget.studentName}</p>
                <p className="text-xs mt-0.5">Cette action sera tracée dans le Journal d'Activité avec votre justification obligatoire.</p>
              </div>
              <div className="space-y-1">
                <Label>Matière concernée</Label>
                <Select
                  value={derogationTarget.selectedSubjectId}
                  onValueChange={(v) => setDerogationTarget((prev) => prev ? { ...prev, selectedSubjectId: v } : null)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {derogationTarget.grades.map((g) => (
                      <SelectItem key={g.subjectId} value={String(g.subjectId)}>
                        {g.subjectName} — note actuelle: {g.value ?? "—"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Nouvelle note <span className="text-muted-foreground text-xs">(0–20)</span></Label>
                <Input
                  type="number" step="0.5" min="0" max="20"
                  placeholder="Ex: 12.5"
                  value={derogationValue}
                  onChange={(e) => setDerogationValue(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Justification <span className="text-destructive">*</span></Label>
                <Textarea
                  placeholder="Suite à la délibération du jury du 12/03/2026..."
                  value={derogationJustification}
                  onChange={(e) => setDerogationJustification(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
              </div>
              <Button
                onClick={handleDerogate}
                disabled={derogateGrade.isPending}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white"
              >
                {derogateGrade.isPending ? "Enregistrement..." : "Valider la dérogation"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Promotion result modal */}
      <Dialog open={!!promotionResult} onOpenChange={(o) => { if (!o) setPromotionResult(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-violet-600" />
              Promotion effectuée
            </DialogTitle>
          </DialogHeader>
          {promotionResult && (
            <div className="space-y-4 mt-2">
              <div className="bg-violet-50 border border-violet-200 dark:bg-violet-950/30 dark:border-violet-700 rounded-xl p-4">
                <p className="text-sm font-semibold text-violet-900 dark:text-violet-100">
                  {promotionResult.promoted.length} étudiant{promotionResult.promoted.length !== 1 ? "s" : ""} promu{promotionResult.promoted.length !== 1 ? "s" : ""} depuis <strong>{promotionResult.fromClass}</strong>
                </p>
                <p className="text-xs text-violet-700 dark:text-violet-300 mt-1">
                  Les étudiants ont été transférés dans la classe supérieure. Cette action est enregistrée dans le Journal d'Activité.
                </p>
              </div>

              {promotionResult.promoted.length === 0 ? (
                <div className="flex flex-col items-center py-6 text-muted-foreground">
                  <Users className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-sm">Aucun étudiant admis dans cette classe pour ce semestre.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {promotionResult.promoted.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 p-2 rounded-lg bg-secondary/50">
                      <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span className="text-sm font-medium">{s.name}</span>
                    </div>
                  ))}
                </div>
              )}

              <Button className="w-full" onClick={() => setPromotionResult(null)}>
                Fermer
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
