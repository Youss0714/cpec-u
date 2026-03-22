import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useListAssignments, useCreateAssignment, useDeleteAssignment, useListUsers, useListClasses, useListSubjects, useListSemesters } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

type FormState = { teacherId: string; subjectId: string; classId: string; semesterId: string };
const emptyForm: FormState = { teacherId: "", subjectId: "", classId: "", semesterId: "" };

export default function AdminAssignments() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const { data: assignments, isLoading } = useListAssignments();
  const { data: users } = useListUsers({ role: 'teacher' });
  const { data: classes } = useListClasses();
  const { data: subjects } = useListSubjects();
  const { data: semesters } = useListSemesters();
  
  const createAssignment = useCreateAssignment();
  const deleteAssignment = useDeleteAssignment();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleSubjectChange = (subjectId: string) => {
    const subject = (subjects as any[])?.find((s: any) => String(s.id) === subjectId);
    setForm(f => ({
      ...f,
      subjectId,
      classId: subject?.classId ? String(subject.classId) : f.classId,
      semesterId: subject?.semesterId ? String(subject.semesterId) : f.semesterId,
    }));
  };

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.teacherId || !form.subjectId || !form.classId || !form.semesterId) {
      toast({ title: "Veuillez remplir tous les champs", variant: "destructive" });
      return;
    }
    try {
      await createAssignment.mutateAsync({
        data: {
          teacherId: parseInt(form.teacherId),
          subjectId: parseInt(form.subjectId),
          classId: parseInt(form.classId),
          semesterId: parseInt(form.semesterId),
        }
      });
      toast({ title: "Affectation créée" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/assignments"] });
      setIsDialogOpen(false);
      setForm(emptyForm);
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteAssignment.mutateAsync({ id });
      toast({ title: "Affectation supprimée" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/assignments"] });
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">Affectations</h1>
            <p className="text-muted-foreground">Assignez les enseignants aux matières et classes.</p>
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={o => { setIsDialogOpen(o); if (!o) setForm(emptyForm); }}>
            <DialogTrigger asChild>
              <Button className="shadow-md">
                <Plus className="w-4 h-4 mr-2" />
                Nouvelle Affectation
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Créer une affectation</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Enseignant</Label>
                  <Select value={form.teacherId} onValueChange={v => setForm(f => ({ ...f, teacherId: v }))} required>
                    <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                    <SelectContent>
                      {users?.map(u => <SelectItem key={u.id} value={u.id.toString()}>{u.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Matière</Label>
                  <Select value={form.subjectId} onValueChange={handleSubjectChange} required>
                    <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                    <SelectContent>
                      {(subjects as any[])?.map((s: any) => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Classe
                    {form.classId && <span className="text-xs text-primary font-normal">(auto-rempli)</span>}
                  </Label>
                  <Select value={form.classId} onValueChange={v => setForm(f => ({ ...f, classId: v }))} required>
                    <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                    <SelectContent>
                      {classes?.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Semestre
                    {form.semesterId && <span className="text-xs text-primary font-normal">(auto-rempli)</span>}
                  </Label>
                  <Select value={form.semesterId} onValueChange={v => setForm(f => ({ ...f, semesterId: v }))} required>
                    <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                    <SelectContent>
                      {semesters?.map(s => <SelectItem key={s.id} value={s.id.toString()}>{s.name} ({s.academicYear})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full" disabled={createAssignment.isPending}>
                  {createAssignment.isPending ? "Création..." : "Affecter"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          <div className="max-h-[60vh] overflow-y-auto">
          <Table>
            <TableHeader className="bg-secondary/50 sticky top-0 z-10">
              <TableRow>
                <TableHead>Semestre</TableHead>
                <TableHead>Enseignant</TableHead>
                <TableHead>Matière</TableHead>
                <TableHead>Classe</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8">Chargement...</TableCell></TableRow>
              ) : assignments?.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8">Aucune affectation.</TableCell></TableRow>
              ) : (
                assignments?.map(a => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.semesterName}</TableCell>
                    <TableCell className="font-bold text-primary">{a.teacherName}</TableCell>
                    <TableCell>{a.subjectName} <span className="text-xs text-muted-foreground ml-1">(Coef. {a.coefficient})</span></TableCell>
                    <TableCell>{a.className}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => setPendingDeleteId(a.id)} className="text-destructive hover:bg-destructive/10">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}
        onConfirm={() => handleDelete(pendingDeleteId!)}
        title="Supprimer l'affectation"
        description="L'enseignant perdra l'accès à la saisie des notes pour cette configuration."
      />
    </AppLayout>
  );
}
