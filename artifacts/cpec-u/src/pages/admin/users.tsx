import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useListUsers, useCreateUser, useDeleteUser, useListClasses, useGetCurrentUser } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, ShieldCheck, GraduationCap, Crown } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  teacher: "Enseignant",
  student: "Étudiant",
};

const SUB_ROLE_LABELS: Record<string, string> = {
  scolarite: "Assistant(e) de Direction",
  planificateur: "Responsable pédagogique",
  directeur: "Directeur du Centre",
};

const SUB_ROLE_COLORS: Record<string, string> = {
  scolarite: "bg-blue-100 text-blue-700 border-blue-200",
  planificateur: "bg-amber-100 text-amber-700 border-amber-200",
  directeur: "bg-violet-100 text-violet-700 border-violet-200",
};

export default function AdminUsers() {
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>("student");
  const { data: currentUser } = useGetCurrentUser();
  const currentSubRole = (currentUser as any)?.adminSubRole as string | null;
  const isDirecteur = currentSubRole === "directeur";
  const isPlanificateur = currentSubRole === "planificateur";
  const { data: users, isLoading } = useListUsers();
  const { data: classes } = useListClasses();
  const createUser = useCreateUser();
  const deleteUser = useDeleteUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const filteredUsers = users?.filter(u => roleFilter === "all" || u.role === roleFilter) || [];

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const role = formData.get("role") as "admin" | "teacher" | "student";
    const classIdStr = formData.get("classId") as string;
    const adminSubRole = formData.get("adminSubRole") as string;

    try {
      await createUser.mutateAsync({
        data: {
          name: formData.get("name") as string,
          email: formData.get("email") as string,
          password: formData.get("password") as string,
          role,
          adminSubRole: role === "admin" && adminSubRole ? adminSubRole as any : undefined,
          classId: classIdStr && role === "student" ? parseInt(classIdStr) : undefined,
        }
      });
      toast({ title: "Utilisateur créé avec succès" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setIsDialogOpen(false);
      setSelectedRole("student");
    } catch (e: any) {
      const msg = e?.message ?? "Erreur lors de la création";
      toast({ title: msg.includes("Directeur") ? msg : "Erreur lors de la création", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Supprimer cet utilisateur ?")) return;
    try {
      await deleteUser.mutateAsync({ id });
      toast({ title: "Utilisateur supprimé" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  const canDeleteUser = (targetUser: any) => {
    if (targetUser.role === "admin") return isDirecteur;
    if (isPlanificateur) return targetUser.role !== "admin";
    return true;
  };

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">Utilisateurs</h1>
            <p className="text-muted-foreground">Gérez les accès et les profils de l'établissement.</p>
          </div>

          <div className="flex items-center gap-4">
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[180px] bg-background">
                <SelectValue placeholder="Filtrer par rôle" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les rôles</SelectItem>
                <SelectItem value="admin">Administrateur</SelectItem>
                <SelectItem value="teacher">Enseignant</SelectItem>
                <SelectItem value="student">Étudiant</SelectItem>
              </SelectContent>
            </Select>

            <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setSelectedRole("student"); }}>
              <DialogTrigger asChild>
                <Button className="shadow-md">
                  <Plus className="w-4 h-4 mr-2" />
                  Nouvel Utilisateur
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Créer un utilisateur</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nom complet</Label>
                    <Input id="name" name="name" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" name="email" type="email" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Mot de passe provisoire</Label>
                    <Input id="password" name="password" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Rôle</Label>
                    <Select name="role" value={selectedRole} onValueChange={setSelectedRole}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {isDirecteur && (
                          <SelectItem value="admin">
                            <div className="flex items-center gap-2">
                              <Crown className="w-4 h-4 text-violet-600" />
                              Administrateur
                            </div>
                          </SelectItem>
                        )}
                        {(isDirecteur || isPlanificateur) && (
                          <SelectItem value="teacher">Enseignant</SelectItem>
                        )}
                        <SelectItem value="student">Étudiant</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedRole === "admin" && isDirecteur && (
                    <div className="space-y-2">
                      <Label htmlFor="adminSubRole">Sous-rôle administrateur <span className="text-destructive">*</span></Label>
                      <Select name="adminSubRole" required defaultValue="scolarite">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="scolarite">
                            <div className="flex items-center gap-2">
                              <ShieldCheck className="w-4 h-4 text-blue-600" />
                              Assistant(e) de Direction (Scolarité)
                            </div>
                          </SelectItem>
                          <SelectItem value="planificateur">
                            <div className="flex items-center gap-2">
                              <GraduationCap className="w-4 h-4 text-amber-600" />
                              Responsable pédagogique
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Assistant(e) de Direction : gère les notes, résultats et bulletins. Responsable pédagogique : gère les emplois du temps et salles.
                      </p>
                    </div>
                  )}

                  {selectedRole === "student" && (
                    <div className="space-y-2">
                      <Label htmlFor="classId">Classe</Label>
                      <Select name="classId">
                        <SelectTrigger>
                          <SelectValue placeholder="Aucune" />
                        </SelectTrigger>
                        <SelectContent>
                          {classes?.map(c => (
                            <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <Button type="submit" className="w-full" disabled={createUser.isPending}>
                    {createUser.isPending ? "Création..." : "Enregistrer"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          <div className="overflow-y-auto max-h-[calc(100vh-260px)]">
          <Table>
            <TableHeader className="bg-secondary/50 sticky top-0 z-10">
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead>Sous-rôle / Classe</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Chargement...</TableCell></TableRow>
              ) : filteredUsers.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Aucun utilisateur trouvé.</TableCell></TableRow>
              ) : (
                filteredUsers.map(user => {
                  const subRole = (user as any).adminSubRole as string | null;
                  return (
                    <TableRow key={user.id} className="hover:bg-muted/50 transition-colors">
                      <TableCell className="font-medium text-foreground">{user.name}</TableCell>
                      <TableCell className="text-muted-foreground">{user.email}</TableCell>
                      <TableCell>
                        <Badge
                          variant={user.role === "admin" ? "destructive" : user.role === "teacher" ? "default" : "secondary"}
                          className="capitalize"
                        >
                          {ROLE_LABELS[user.role] ?? user.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {user.role === "admin" && subRole ? (
                          <span className={`text-xs font-medium px-2 py-1 rounded border ${SUB_ROLE_COLORS[subRole] ?? ""}`}>
                            {SUB_ROLE_LABELS[subRole] ?? subRole}
                          </span>
                        ) : user.role === "student" ? (
                          <span className="text-sm text-muted-foreground">{(user as any).className || "—"}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {canDeleteUser(user) && (
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(user.id)} className="text-destructive hover:bg-destructive/10">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
