import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useListSubjects, useCreateSubject, useDeleteSubject, useListClasses } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function AdminSubjects() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { data: subjects, isLoading } = useListSubjects();
  const { data: classes } = useListClasses();
  const createSubject = useCreateSubject();
  const deleteSubject = useDeleteSubject();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const classIdStr = formData.get("classId") as string;

    try {
      await createSubject.mutateAsync({
        data: {
          name: formData.get("name") as string,
          coefficient: parseFloat(formData.get("coefficient") as string),
          description: formData.get("description") as string || undefined,
          classId: classIdStr && classIdStr !== "none" ? parseInt(classIdStr) : undefined
        }
      });
      toast({ title: "Matière créée" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/subjects"] });
      setIsDialogOpen(false);
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Supprimer cette matière ?")) return;
    try {
      await deleteSubject.mutateAsync({ id });
      toast({ title: "Matière supprimée" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/subjects"] });
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">Matières</h1>
            <p className="text-muted-foreground">Unités d'enseignement et coefficients.</p>
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
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
              <form onSubmit={handleCreate} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nom de la matière</Label>
                  <Input id="name" name="name" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="coefficient">Coefficient (1 - 10)</Label>
                  <Input id="coefficient" name="coefficient" type="number" step="0.5" min="1" max="10" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="classId">Classe associée (Optionnel)</Label>
                  <Select name="classId">
                    <SelectTrigger>
                      <SelectValue placeholder="Générique" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Toutes les classes</SelectItem>
                      {classes?.map(c => (
                        <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full" disabled={createSubject.isPending}>
                  {createSubject.isPending ? "Création..." : "Enregistrer"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          <Table>
            <TableHeader className="bg-secondary/50">
              <TableRow>
                <TableHead>Matière</TableHead>
                <TableHead>Coefficient</TableHead>
                <TableHead>Classe Attitrée</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Chargement...</TableCell></TableRow>
              ) : subjects?.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Aucune matière.</TableCell></TableRow>
              ) : (
                subjects?.map(sub => (
                  <TableRow key={sub.id}>
                    <TableCell className="font-bold text-foreground">{sub.name}</TableCell>
                    <TableCell>
                      <span className="bg-primary/10 text-primary font-bold px-2 py-1 rounded-md">Coef. {sub.coefficient}</span>
                    </TableCell>
                    <TableCell>{sub.className || "Générale"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(sub.id)} className="text-destructive hover:bg-destructive/10">
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
    </AppLayout>
  );
}
