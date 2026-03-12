import { useState } from "react";
import { AppLayout } from "@/components/layout";
import {
  useListClasses, useCreateClass, useDeleteClass,
  useGetClassStudents, useEnrollStudent, useUnenrollStudent,
  useListUsers, useUpdateClassConfig, useMoveClass,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Users, UserPlus, UserMinus, ChevronRight, BookOpen, ChevronUp, ChevronDown } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Textarea } from "@/components/ui/textarea";

type ClassItem = { id: number; name: string; description: string | null; studentCount: number; nextClassId: number | null };

function ClassStudentsSheet({
  cls, open, onClose, allClasses,
}: {
  cls: ClassItem; open: boolean; onClose: () => void;
  allClasses: ClassItem[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [savingNextClass, setSavingNextClass] = useState(false);
  const updateClassMutation = useUpdateClassConfig();

  const { data: students = [], isLoading } = useGetClassStudents(cls.id, {
    query: { enabled: open } as any,
  });
  const { data: allUsers = [] } = useListUsers(undefined, { query: { enabled: open } as any });
  const enrollMutation = useEnrollStudent();
  const unenrollMutation = useUnenrollStudent();

  const enrolledIds = new Set((students as any[]).map((s) => s.id));
  const availableStudents = (allUsers as any[]).filter(
    (u) => u.role === "student" && !enrolledIds.has(u.id)
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [`/api/admin/classes/${cls.id}/students`] });
    qc.invalidateQueries({ queryKey: ["/api/admin/classes"] });
  };

  const handleSetNextClass = async (nextClassIdStr: string) => {
    setSavingNextClass(true);
    try {
      const nextClassId = nextClassIdStr === "none" ? null : parseInt(nextClassIdStr);
      await updateClassMutation.mutateAsync({ id: cls.id, nextClassId });
      toast({ title: nextClassId ? "Classe supérieure configurée." : "Classe supérieure retirée." });
      qc.invalidateQueries({ queryKey: ["/api/admin/classes"] });
    } catch {
      toast({ title: "Erreur lors de la mise à jour.", variant: "destructive" });
    } finally {
      setSavingNextClass(false);
    }
  };

  const handleAdd = async () => {
    if (!selectedStudentId) return;
    try {
      await enrollMutation.mutateAsync({ data: { studentId: parseInt(selectedStudentId), classId: cls.id } });
      toast({ title: "Étudiant ajouté à la classe." });
      setSelectedStudentId("");
      invalidate();
    } catch {
      toast({ title: "Erreur lors de l'ajout.", variant: "destructive" });
    }
  };

  const handleRemove = async (studentId: number, studentName: string) => {
    if (!confirm(`Retirer ${studentName} de la classe ?`)) return;
    try {
      await unenrollMutation.mutateAsync({ data: { studentId, classId: cls.id } });
      toast({ title: `${studentName} retiré(e) de la classe.` });
      invalidate();
    } catch {
      toast({ title: "Erreur lors du retrait.", variant: "destructive" });
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4 border-b">
          <SheetTitle className="flex items-center gap-2 text-xl font-serif">
            <BookOpen className="w-5 h-5 text-primary" />
            {cls.name}
          </SheetTitle>
          {cls.description && (
            <p className="text-sm text-muted-foreground mt-1">{cls.description}</p>
          )}
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Next class config */}
          <div className="space-y-2 pb-4 border-b">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <span>Classe supérieure</span>
              {cls.nextClassId && <span className="text-xs font-normal bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full">Configurée</span>}
            </h3>
            <p className="text-xs text-muted-foreground">Les étudiants admis (≥ 12/20) pourront être promus vers cette classe depuis la page Résultats.</p>
            <Select
              value={cls.nextClassId ? String(cls.nextClassId) : "none"}
              onValueChange={handleSetNextClass}
              disabled={savingNextClass}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucune (pas de promotion)</SelectItem>
                {allClasses.filter((c) => c.id !== cls.id).map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Add student */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
              Ajouter un étudiant
            </h3>
            <div className="flex gap-2">
              <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder={
                    availableStudents.length === 0
                      ? "Aucun étudiant disponible"
                      : "Sélectionner un étudiant..."
                  } />
                </SelectTrigger>
                <SelectContent>
                  {availableStudents.map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      <div>
                        <p className="font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.email}</p>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleAdd}
                disabled={!selectedStudentId || enrollMutation.isPending}
                className="shrink-0"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Ajouter
              </Button>
            </div>
            {availableStudents.length === 0 && (
              <p className="text-xs text-muted-foreground italic">
                Tous les étudiants sont déjà inscrits dans une classe. Créez de nouveaux comptes depuis la page Utilisateurs.
              </p>
            )}
          </div>

          {/* Student list */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
                Étudiants inscrits
              </h3>
              <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                {(students as any[]).length}
              </span>
            </div>

            {isLoading ? (
              <p className="text-muted-foreground text-sm text-center py-6">Chargement...</p>
            ) : (students as any[]).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border-2 border-dashed border-border rounded-xl">
                <Users className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">Aucun étudiant dans cette classe.</p>
                <p className="text-xs mt-1">Utilisez le sélecteur ci-dessus pour en ajouter.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {(students as any[]).map((student) => (
                  <div
                    key={student.id}
                    className="flex items-center justify-between p-3 bg-secondary/40 rounded-xl border border-border/50 hover:bg-secondary/70 transition-colors group"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">{student.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{student.email}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 shrink-0"
                      onClick={() => handleRemove(student.id, student.name)}
                      disabled={unenrollMutation.isPending}
                    >
                      <UserMinus className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function AdminClasses() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null);
  const { data: classes, isLoading } = useListClasses();
  const createClass = useCreateClass();
  const deleteClass = useDeleteClass();
  const moveClass = useMoveClass();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleMove = async (e: React.MouseEvent, id: number, direction: "up" | "down") => {
    e.stopPropagation();
    await moveClass.mutateAsync({ id, direction });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/classes"] });
  };

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    try {
      await createClass.mutateAsync({
        data: {
          name: formData.get("name") as string,
          description: formData.get("description") as string || undefined,
        }
      });
      toast({ title: "Classe créée avec succès" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/classes"] });
      setIsDialogOpen(false);
    } catch {
      toast({ title: "Erreur lors de la création", variant: "destructive" });
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!confirm("Supprimer cette classe ? Les étudiants devront être réassignés.")) return;
    try {
      await deleteClass.mutateAsync({ id });
      toast({ title: "Classe supprimée" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/classes"] });
      if (selectedClass?.id === id) setSelectedClass(null);
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">Classes</h1>
            <p className="text-muted-foreground">Gérez les promotions et filières. Cliquez sur une classe pour voir ses étudiants.</p>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="shadow-md">
                <Plus className="w-4 h-4 mr-2" />
                Nouvelle Classe
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Créer une classe</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nom de la classe (ex: Licence 1 Info)</Label>
                  <Input id="name" name="name" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" name="description" rows={3} />
                </div>
                <Button type="submit" className="w-full" disabled={createClass.isPending}>
                  {createClass.isPending ? "Création..." : "Enregistrer"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {isLoading ? (
            <p className="text-muted-foreground">Chargement...</p>
          ) : (classes as any[])?.length === 0 ? (
            <p className="text-muted-foreground col-span-3 text-center py-12">Aucune classe créée.</p>
          ) : (
            (classes as any[])?.map((cls, idx, arr) => (
              <div
                key={cls.id}
                className="bg-card rounded-2xl p-6 shadow-sm border border-border hover:shadow-md hover:border-primary/40 transition-all group relative cursor-pointer"
                onClick={() => setSelectedClass(cls)}
              >
                {/* Order badge */}
                <div className="absolute top-4 left-4 w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                  {idx + 1}
                </div>

                {/* Actions (hover) */}
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center gap-0.5">
                  <Button
                    variant="ghost" size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted"
                    onClick={(e) => handleMove(e, cls.id, "up")}
                    disabled={idx === 0 || moveClass.isPending}
                    title="Monter"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost" size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted"
                    onClick={(e) => handleMove(e, cls.id, "down")}
                    disabled={idx === arr.length - 1 || moveClass.isPending}
                    title="Descendre"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost" size="icon"
                    className="h-7 w-7 text-destructive hover:bg-destructive/10 mt-1"
                    onClick={(e) => handleDelete(e, cls.id)}
                    title="Supprimer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>

                <h3 className="text-xl font-bold text-foreground pl-9 pr-10">{cls.name}</h3>
                <p className="text-sm text-muted-foreground mt-2 line-clamp-2 h-10">
                  {cls.description || "Aucune description"}
                </p>

                <div className="mt-6 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-primary bg-primary/5 px-3 py-1.5 rounded-lg">
                    <Users className="w-4 h-4" />
                    {cls.studentCount} Étudiant{cls.studentCount !== 1 ? "s" : ""}
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {selectedClass && (
        <ClassStudentsSheet
          cls={selectedClass}
          open={!!selectedClass}
          onClose={() => setSelectedClass(null)}
          allClasses={(classes as unknown as ClassItem[]) ?? []}
        />
      )}
    </AppLayout>
  );
}
