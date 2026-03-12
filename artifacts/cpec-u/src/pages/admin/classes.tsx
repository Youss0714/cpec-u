import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useListClasses, useCreateClass, useDeleteClass } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Textarea } from "@/components/ui/textarea";

export default function AdminClasses() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { data: classes, isLoading } = useListClasses();
  const createClass = useCreateClass();
  const deleteClass = useDeleteClass();
  const queryClient = useQueryClient();
  const { toast } = useToast();

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

  const handleDelete = async (id: number) => {
    if (!confirm("Supprimer cette classe ? Les étudiants devront être réassignés.")) return;
    try {
      await deleteClass.mutateAsync({ id });
      toast({ title: "Classe supprimée" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/classes"] });
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
            <p className="text-muted-foreground">Gérez les promotions et filières.</p>
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
          ) : classes?.map((cls) => (
            <div key={cls.id} className="bg-card rounded-2xl p-6 shadow-sm border border-border hover:shadow-md transition-all group relative">
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" onClick={() => handleDelete(cls.id)} className="h-8 w-8 text-destructive hover:bg-destructive/10">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              <h3 className="text-xl font-bold text-foreground pr-8">{cls.name}</h3>
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2 h-10">{cls.description || "Aucune description"}</p>
              
              <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-primary bg-primary/5 w-fit px-3 py-1.5 rounded-lg">
                <Users className="w-4 h-4" />
                {cls.studentCount} Étudiants
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
