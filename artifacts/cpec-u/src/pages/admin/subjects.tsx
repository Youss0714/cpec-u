import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout";
import {
  useListSubjects,
  useCreateSubject,
  useUpdateSubject,
  useDeleteSubject,
  useListClasses,
  useListSemesters,
  useGetCurrentUser,
} from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Pencil, BookOpen } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

type SubjectFormData = { name: string; coefficient: string; classId: string; semesterId: string };

const emptyForm: SubjectFormData = { name: "", coefficient: "1", classId: "none", semesterId: "none" };

function resolveId(val: string): number | undefined {
  return val && val !== "none" ? parseInt(val) : undefined;
}

export default function AdminSubjects() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<any>(null);
  const [form, setForm] = useState<SubjectFormData>(emptyForm);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [filterClass, setFilterClass] = useState("all");
  const [filterSemester, setFilterSemester] = useState("all");

  const { data: subjects, isLoading } = useListSubjects();
  const { data: classes } = useListClasses();
  const { data: semesters } = useListSemesters();
  const { data: currentUser } = useGetCurrentUser();
  const isScolarite = (currentUser as any)?.adminSubRole === "scolarite";

  const createSubject = useCreateSubject();
  const updateSubject = useUpdateSubject();
  const deleteSubject = useDeleteSubject();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/admin/subjects"] });

  const filteredSubjects = useMemo(() => {
    if (!subjects) return [];
    return subjects.filter((s: any) => {
      const matchClass = filterClass === "all" || String((s as any).classId ?? "none") === filterClass;
      const matchSem = filterSemester === "all" || String((s as any).semesterId ?? "none") === filterSemester;
      return matchClass && matchSem;
    });
  }, [subjects, filterClass, filterSemester]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createSubject.mutateAsync({
        data: {
          name: form.name,
          coefficient: parseFloat(form.coefficient),
          classId: resolveId(form.classId),
          semesterId: resolveId(form.semesterId),
        } as any,
      });
      toast({ title: "Matière créée" });
      invalidate();
      setIsCreateOpen(false);
      setForm(emptyForm);
    } catch {
      toast({ title: "Erreur lors de la création", variant: "destructive" });
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubject) return;
    try {
      await updateSubject.mutateAsync({
        id: editingSubject.id,
        data: {
          name: form.name,
          coefficient: parseFloat(form.coefficient),
          classId: resolveId(form.classId),
          semesterId: resolveId(form.semesterId),
        } as any,
      });
      toast({ title: "Matière modifiée" });
      invalidate();
      setEditingSubject(null);
      setForm(emptyForm);
    } catch {
      toast({ title: "Erreur lors de la modification", variant: "destructive" });
    }
  };

  const openEdit = (sub: any) => {
    setEditingSubject(sub);
    setForm({
      name: sub.name,
      coefficient: String(sub.coefficient),
      classId: sub.classId ? String(sub.classId) : "none",
      semesterId: sub.semesterId ? String(sub.semesterId) : "none",
    });
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteSubject.mutateAsync({ id });
      toast({ title: "Matière supprimée" });
      invalidate();
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  const SubjectFormFields = ({
    onSubmit,
    isPending,
  }: {
    onSubmit: (e: React.FormEvent) => void;
    isPending: boolean;
  }) => (
    <form onSubmit={onSubmit} className="space-y-4 mt-4">
      <div className="space-y-2">
        <Label>Nom de la matière</Label>
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="ex: Mathématiques"
          required
        />
      </div>
      <div className="space-y-2">
        <Label>Coefficient (1 – 10)</Label>
        <Input
          type="number"
          step="0.5"
          min="1"
          max="10"
          value={form.coefficient}
          onChange={(e) => setForm({ ...form, coefficient: e.target.value })}
          required
        />
      </div>
      <div className="space-y-2">
        <Label>
          Classe <span className="text-muted-foreground text-xs">(optionnel)</span>
        </Label>
        <Select value={form.classId} onValueChange={(v) => setForm({ ...form, classId: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Toutes les classes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Toutes les classes</SelectItem>
            {classes?.map((c) => (
              <SelectItem key={c.id} value={c.id.toString()}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>
          Semestre <span className="text-muted-foreground text-xs">(optionnel)</span>
        </Label>
        <Select value={form.semesterId} onValueChange={(v) => setForm({ ...form, semesterId: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Tous les semestres" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Tous les semestres</SelectItem>
            {semesters?.map((s) => (
              <SelectItem key={s.id} value={s.id.toString()}>
                {s.name} {s.academicYear ? `(${s.academicYear})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Enregistrement..." : "Enregistrer"}
      </Button>
    </form>
  );

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">Matières</h1>
            <p className="text-muted-foreground">
              Unités d'enseignement par classe et semestre.
            </p>
          </div>

          {!isScolarite && (
            <Dialog
              open={isCreateOpen}
              onOpenChange={(o) => {
                setIsCreateOpen(o);
                if (!o) setForm(emptyForm);
              }}
            >
              <DialogTrigger asChild>
                <Button className="shadow-md">
                  <Plus className="w-4 h-4 mr-2" />
                  Nouvelle Matière
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Créer une matière</DialogTitle>
                </DialogHeader>
                <SubjectFormFields onSubmit={handleCreate} isPending={createSubject.isPending} />
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <Select value={filterClass} onValueChange={setFilterClass}>
            <SelectTrigger className="w-48 bg-card border-border">
              <SelectValue placeholder="Toutes les classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les classes</SelectItem>
              <SelectItem value="none">Sans classe</SelectItem>
              {classes?.map((c) => (
                <SelectItem key={c.id} value={c.id.toString()}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterSemester} onValueChange={setFilterSemester}>
            <SelectTrigger className="w-52 bg-card border-border">
              <SelectValue placeholder="Tous les semestres" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les semestres</SelectItem>
              <SelectItem value="none">Sans semestre</SelectItem>
              {semesters?.map((s) => (
                <SelectItem key={s.id} value={s.id.toString()}>
                  {s.name} {s.academicYear ? `(${s.academicYear})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          <div className="overflow-y-auto max-h-[calc(100vh-300px)]">
            <Table>
              <TableHeader className="bg-secondary/50 sticky top-0 z-10">
                <TableRow>
                  <TableHead>Matière</TableHead>
                  <TableHead>Coefficient</TableHead>
                  <TableHead>Classe</TableHead>
                  <TableHead>Semestre</TableHead>
                  {!isScolarite && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Chargement...
                    </TableCell>
                  </TableRow>
                ) : filteredSubjects.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <BookOpen className="w-8 h-8 opacity-30" />
                        <span>Aucune matière trouvée.</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSubjects.map((sub: any) => (
                    <TableRow key={sub.id}>
                      <TableCell className="font-semibold text-foreground">{sub.name}</TableCell>
                      <TableCell>
                        <span className="bg-primary/10 text-primary font-bold px-2 py-1 rounded-md text-sm">
                          Coef. {sub.coefficient}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {sub.className ?? (
                          <span className="text-muted-foreground/50 italic">Générale</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {sub.semesterName ? (
                          <span className="inline-flex items-center gap-1 bg-secondary px-2 py-0.5 rounded-full text-xs font-medium">
                            {sub.semesterName}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50 italic">—</span>
                        )}
                      </TableCell>
                      {!isScolarite && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEdit(sub)}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setPendingDeleteId(sub.id)}
                              className="text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {filteredSubjects.length > 0 && (
            <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
              {filteredSubjects.length} matière{filteredSubjects.length > 1 ? "s" : ""}
            </div>
          )}
        </div>
      </div>

      {/* Dialog d'édition */}
      <Dialog
        open={!!editingSubject}
        onOpenChange={(o) => {
          if (!o) {
            setEditingSubject(null);
            setForm(emptyForm);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier la matière</DialogTitle>
          </DialogHeader>
          <SubjectFormFields onSubmit={handleUpdate} isPending={updateSubject.isPending} />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
        onConfirm={() => handleDelete(pendingDeleteId!)}
        title="Supprimer la matière"
        description="Cette action est irréversible. La matière et ses données associées seront supprimées."
      />
    </AppLayout>
  );
}
