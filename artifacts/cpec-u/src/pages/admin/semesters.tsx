import { useState } from "react";
import { AppLayout } from "@/components/layout";
import {
  useListSemesters,
  useCreateSemester,
  usePublishSemesterResults,
  useGetCurrentUser,
  useUpdateSemester,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, CheckCircle, XCircle, CalendarDays, Pencil, Clock, CalendarCheck, CalendarOff } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import type { Semester } from "@workspace/api-client-react";

// ─── Semester status derived from dates ─────────────────────────────────────

type SemesterStatus = "en_cours" | "a_venir" | "termine" | "non_defini";

function getSemesterStatus(sem: Semester): SemesterStatus {
  if (!sem.startDate || !sem.endDate) return "non_defini";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(sem.startDate);
  const end = new Date(sem.endDate);
  if (today < start) return "a_venir";
  if (today > end) return "termine";
  return "en_cours";
}

const STATUS_CONFIG: Record<SemesterStatus, { label: string; icon: typeof Clock; color: string; dot: string }> = {
  en_cours:   { label: "En cours",    icon: CalendarCheck, color: "bg-blue-100 text-blue-700 border-blue-200",    dot: "bg-blue-500" },
  a_venir:    { label: "À venir",     icon: Clock,         color: "bg-amber-100 text-amber-700 border-amber-200",  dot: "bg-amber-400" },
  termine:    { label: "Terminé",     icon: CalendarOff,   color: "bg-secondary text-muted-foreground border-border", dot: "bg-muted-foreground" },
  non_defini: { label: "Non défini",  icon: CalendarDays,  color: "bg-secondary text-muted-foreground border-border", dot: "bg-muted-foreground/50" },
};

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Semester Form (reused for create & edit) ───────────────────────────────

type SemesterFormValues = {
  name: string;
  academicYear: string;
  startDate: string;
  endDate: string;
};

function SemesterForm({
  defaultValues,
  onSubmit,
  isPending,
  submitLabel,
}: {
  defaultValues?: Partial<SemesterFormValues>;
  onSubmit: (values: SemesterFormValues) => void;
  isPending: boolean;
  submitLabel: string;
}) {
  const [form, setForm] = useState<SemesterFormValues>({
    name: defaultValues?.name ?? "",
    academicYear: defaultValues?.academicYear ?? "",
    startDate: defaultValues?.startDate ?? "",
    endDate: defaultValues?.endDate ?? "",
  });

  const set = (k: keyof SemesterFormValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.startDate && form.endDate && form.endDate < form.startDate) return;
    onSubmit(form);
  };

  const dateError = form.startDate && form.endDate && form.endDate < form.startDate;

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-2">
      <div className="space-y-2">
        <Label htmlFor="name">Nom du semestre</Label>
        <Input id="name" value={form.name} onChange={set("name")} placeholder="ex : Semestre 1" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="academicYear">Année académique</Label>
        <Input id="academicYear" value={form.academicYear} onChange={set("academicYear")} placeholder="ex : 2024-2025" required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="startDate">Date de début</Label>
          <Input id="startDate" type="date" value={form.startDate} onChange={set("startDate")} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endDate">Date de fin</Label>
          <Input id="endDate" type="date" value={form.endDate} onChange={set("endDate")} min={form.startDate || undefined} required />
        </div>
      </div>
      {dateError && (
        <p className="text-xs text-destructive font-medium">La date de fin doit être après la date de début.</p>
      )}
      <Button type="submit" className="w-full" disabled={isPending || !!dateError}>
        {isPending ? "Enregistrement…" : submitLabel}
      </Button>
    </form>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function AdminSemesters() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingSem, setEditingSem] = useState<Semester | null>(null);
  const [pendingUnpublishId, setPendingUnpublishId] = useState<number | null>(null);

  const { data: semesters, isLoading } = useListSemesters();
  const { data: currentUser } = useGetCurrentUser();
  const canPublish = (currentUser as any)?.adminSubRole !== "planificateur";

  const createSemester = useCreateSemester();
  const updateSemester = useUpdateSemester();
  const publishMutation = usePublishSemesterResults();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/admin/semesters"] });

  const handleCreate = async (values: ReturnType<typeof Object.fromEntries> | any) => {
    try {
      await createSemester.mutateAsync({ data: values });
      toast({ title: "Semestre créé" });
      invalidate();
      setIsCreateOpen(false);
    } catch {
      toast({ title: "Erreur lors de la création", variant: "destructive" });
    }
  };

  const handleUpdate = async (values: any) => {
    if (!editingSem) return;
    try {
      await updateSemester.mutateAsync({ id: editingSem.id, data: values });
      toast({ title: "Semestre mis à jour" });
      invalidate();
      setEditingSem(null);
    } catch {
      toast({ title: "Erreur lors de la mise à jour", variant: "destructive" });
    }
  };

  const doPublish = async (id: number, publish: boolean) => {
    try {
      await publishMutation.mutateAsync({ id, data: { published: publish } });
      toast({ title: `Résultats ${publish ? "publiés" : "retirés"} avec succès` });
      invalidate();
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  const pendingSemester = semesters?.find(s => s.id === pendingUnpublishId);

  // Sort: en_cours first, then a_venir, then termine, then non_defini — then by startDate desc
  const sorted = [...(semesters ?? [])].sort((a, b) => {
    const order: SemesterStatus[] = ["en_cours", "a_venir", "non_defini", "termine"];
    const oa = order.indexOf(getSemesterStatus(a));
    const ob = order.indexOf(getSemesterStatus(b));
    if (oa !== ob) return oa - ob;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-6">

        {/* Page header */}
        <div className="flex justify-between items-start gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">Semestres & Publications</h1>
            <p className="text-muted-foreground">Gérez les périodes académiques et la visibilité des notes.</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="shadow-md flex-shrink-0">
                <Plus className="w-4 h-4 mr-2" />
                Nouveau Semestre
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Créer un semestre</DialogTitle>
              </DialogHeader>
              <SemesterForm
                onSubmit={handleCreate}
                isPending={createSemester.isPending}
                submitLabel="Créer le semestre"
              />
            </DialogContent>
          </Dialog>
        </div>

        {/* Edit dialog */}
        <Dialog open={!!editingSem} onOpenChange={(open) => { if (!open) setEditingSem(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Modifier le semestre</DialogTitle>
            </DialogHeader>
            {editingSem && (
              <SemesterForm
                defaultValues={{
                  name: editingSem.name,
                  academicYear: editingSem.academicYear,
                  startDate: editingSem.startDate ?? "",
                  endDate: editingSem.endDate ?? "",
                }}
                onSubmit={handleUpdate}
                isPending={updateSemester.isPending}
                submitLabel="Enregistrer les modifications"
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Semester cards */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-2xl">
            <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="font-semibold">Aucun semestre créé</p>
            <p className="text-sm mt-1">Commencez par créer un semestre pour organiser l'année académique.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {sorted.map((sem) => {
              const status = getSemesterStatus(sem);
              const cfg = STATUS_CONFIG[status];
              const StatusIcon = cfg.icon;

              return (
                <Card
                  key={sem.id}
                  className={`overflow-hidden border-2 transition-all ${
                    status === "en_cours"
                      ? "border-blue-300/60 shadow-blue-500/10 shadow-md"
                      : sem.published
                      ? "border-emerald-500/50 shadow-emerald-500/10"
                      : "border-border"
                  }`}
                >
                  {/* Color bar */}
                  <div className={`h-1.5 w-full ${
                    status === "en_cours" ? "bg-blue-500" :
                    status === "a_venir" ? "bg-amber-400" :
                    sem.published ? "bg-emerald-500" : "bg-muted"
                  }`} />

                  <CardContent className="p-6 space-y-5">
                    {/* Top row: title + edit */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-xl font-bold text-foreground truncate">{sem.name}</h3>
                        <p className="text-base text-muted-foreground font-serif">{sem.academicYear}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 flex-shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={() => setEditingSem(sem)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </div>

                    {/* Badges row */}
                    <div className="flex flex-wrap gap-2">
                      {/* Status badge */}
                      <Badge className={`flex items-center gap-1.5 px-2.5 py-1 font-semibold text-xs border ${cfg.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                        <StatusIcon className="w-3 h-3" />
                        {cfg.label}
                      </Badge>

                      {/* Published badge */}
                      <Badge className={`flex items-center gap-1.5 px-2.5 py-1 font-semibold text-xs border ${
                        sem.published
                          ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                          : "bg-secondary text-muted-foreground border-border"
                      }`}>
                        {sem.published ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {sem.published ? "Résultats publics" : "Résultats non publiés"}
                      </Badge>
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-secondary/40 rounded-xl px-4 py-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">Début</p>
                        <p className="text-sm font-semibold text-foreground">{formatDate(sem.startDate)}</p>
                      </div>
                      <div className="bg-secondary/40 rounded-xl px-4 py-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">Fin</p>
                        <p className="text-sm font-semibold text-foreground">{formatDate(sem.endDate)}</p>
                      </div>
                    </div>

                    {/* Duration bar (if dates defined) */}
                    {sem.startDate && sem.endDate && (
                      <div className="space-y-1.5">
                        {(() => {
                          const start = new Date(sem.startDate).getTime();
                          const end = new Date(sem.endDate).getTime();
                          const now = Date.now();
                          const total = end - start;
                          const elapsed = Math.max(0, Math.min(now - start, total));
                          const pct = total > 0 ? Math.round((elapsed / total) * 100) : 0;
                          const totalDays = Math.ceil(total / 86400000);
                          const daysLeft = Math.max(0, Math.ceil((end - now) / 86400000));
                          return (
                            <>
                              <div className="flex justify-between text-xs text-muted-foreground">
                                <span>{pct}% écoulé</span>
                                {status === "en_cours" && <span className="font-semibold text-blue-600">{daysLeft} j. restants</span>}
                                {status === "a_venir" && <span className="text-amber-600 font-semibold">Commence dans {Math.ceil((start - Date.now()) / 86400000)} j.</span>}
                                {status === "termine" && <span>{totalDays} j. au total</span>}
                              </div>
                              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    status === "en_cours" ? "bg-blue-500" :
                                    status === "termine" ? "bg-muted-foreground/40" : "bg-amber-400/30"
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}

                    {/* Publish button */}
                    {canPublish ? (
                      <Button
                        onClick={() => {
                          if (sem.published) setPendingUnpublishId(sem.id);
                          else doPublish(sem.id, true);
                        }}
                        variant={sem.published ? "outline" : "default"}
                        className={`w-full font-bold ${
                          sem.published
                            ? "hover:bg-destructive hover:text-white border-destructive text-destructive"
                            : "bg-primary hover:bg-primary/90"
                        }`}
                        disabled={publishMutation.isPending}
                      >
                        {sem.published ? "Retirer la publication" : "Publier les résultats aux étudiants"}
                      </Button>
                    ) : (
                      <p className="text-xs text-center text-muted-foreground bg-secondary/50 rounded-lg py-3 px-4">
                        La publication des résultats est réservée au Directeur du Centre et à l'Assistant(e) de Direction.
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Unpublish confirm */}
        <ConfirmDialog
          open={pendingUnpublishId !== null}
          onOpenChange={(open) => { if (!open) setPendingUnpublishId(null); }}
          title="Retirer la publication des résultats ?"
          description={`Les étudiants n'auront plus accès aux résultats du semestre "${pendingSemester?.name ?? ""}" (${pendingSemester?.academicYear ?? ""}). Cette action est réversible.`}
          confirmLabel="Retirer la publication"
          onConfirm={() => {
            if (pendingUnpublishId !== null) doPublish(pendingUnpublishId, false);
            setPendingUnpublishId(null);
          }}
        />
      </div>
    </AppLayout>
  );
}
