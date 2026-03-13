import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useListSemesters, useCreateSemester, usePublishSemesterResults } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, CheckCircle, XCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/confirm-dialog";

export default function AdminSemesters() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [pendingUnpublishId, setPendingUnpublishId] = useState<number | null>(null);
  const { data: semesters, isLoading } = useListSemesters();
  const createSemester = useCreateSemester();
  const publishMutation = usePublishSemesterResults();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    try {
      await createSemester.mutateAsync({
        data: {
          name: formData.get("name") as string,
          academicYear: formData.get("academicYear") as string,
        }
      });
      toast({ title: "Semestre créé" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/semesters"] });
      setIsDialogOpen(false);
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  const doPublish = async (id: number, publish: boolean) => {
    try {
      await publishMutation.mutateAsync({ id, data: { published: publish } });
      toast({ title: `Résultats ${publish ? "publiés" : "retirés"} avec succès` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/semesters"] });
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  const pendingSemester = semesters?.find(s => s.id === pendingUnpublishId);

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">Semestres & Publications</h1>
            <p className="text-muted-foreground">Gérez les périodes académiques et la visibilité des notes.</p>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="shadow-md">
                <Plus className="w-4 h-4 mr-2" />
                Nouveau Semestre
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Ouvrir un semestre</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nom (ex: Semestre 1)</Label>
                  <Input id="name" name="name" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="academicYear">Année académique (ex: 2024-2025)</Label>
                  <Input id="academicYear" name="academicYear" required />
                </div>
                <Button type="submit" className="w-full" disabled={createSemester.isPending}>
                  {createSemester.isPending ? "Création..." : "Enregistrer"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {isLoading ? (
            <p>Chargement...</p>
          ) : semesters?.map((sem) => (
            <Card key={sem.id} className={`overflow-hidden border-2 transition-all ${sem.published ? 'border-emerald-500/50 shadow-emerald-500/10' : 'border-border'}`}>
              <div className={`h-2 w-full ${sem.published ? 'bg-emerald-500' : 'bg-muted'}`} />
              <CardContent className="p-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-2xl font-bold text-foreground">{sem.name}</h3>
                    <p className="text-lg text-muted-foreground font-serif">{sem.academicYear}</p>
                  </div>
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold ${sem.published ? 'bg-emerald-100 text-emerald-700' : 'bg-secondary text-muted-foreground'}`}>
                    {sem.published ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    {sem.published ? 'Résultats Publics' : 'Non Publiés'}
                  </div>
                </div>

                <div className="mt-8">
                  <Button
                    onClick={() => {
                      if (sem.published) {
                        setPendingUnpublishId(sem.id);
                      } else {
                        doPublish(sem.id, true);
                      }
                    }}
                    variant={sem.published ? "outline" : "default"}
                    className={`w-full font-bold ${sem.published ? 'hover:bg-destructive hover:text-white border-destructive text-destructive' : 'bg-primary hover:bg-primary/90'}`}
                    disabled={publishMutation.isPending}
                  >
                    {sem.published ? "Retirer la publication" : "Publier les résultats aux étudiants"}
                  </Button>
                  <p className="text-xs text-center mt-3 text-muted-foreground">
                    {sem.published
                      ? "Attention : Les étudiants peuvent voir leurs notes."
                      : "Les notes sont invisibles pour les étudiants."}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

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
