import { AppLayout } from "@/components/layout";
import {
  useGetCurrentUser,
  useListUsers,
  useListClasses,
  useListSubjects,
  useListSemesters,
  useListRooms,
  useListScheduleEntries,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, School, BookOpen, Calendar, DoorOpen, CalendarDays, GraduationCap, CheckCircle } from "lucide-react";
import { motion } from "framer-motion";

export default function AdminDashboard() {
  const { data: currentUser } = useGetCurrentUser();
  const adminSubRole = (currentUser as any)?.adminSubRole as string | null;
  const isPlanificateur = adminSubRole === "planificateur";

  const { data: users } = useListUsers();
  const { data: classes } = useListClasses();
  const { data: subjects } = useListSubjects();
  const { data: semesters } = useListSemesters();
  const { data: rooms } = useListRooms();
  const { data: scheduleEntries } = useListScheduleEntries();

  const scolariteStats = [
    { title: "Étudiants Inscrits", value: users?.filter(u => u.role === "student").length || 0, icon: Users, color: "text-blue-500", bg: "bg-blue-500/10" },
    { title: "Enseignants Actifs", value: users?.filter(u => u.role === "teacher").length || 0, icon: GraduationCap, color: "text-amber-500", bg: "bg-amber-500/10" },
    { title: "Classes Déclarées", value: classes?.length || 0, icon: School, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { title: "Matières Dispensées", value: subjects?.length || 0, icon: BookOpen, color: "text-purple-500", bg: "bg-purple-500/10" },
  ];

  const planificateurStats = [
    { title: "Salles Disponibles", value: rooms?.length || 0, icon: DoorOpen, color: "text-blue-500", bg: "bg-blue-500/10" },
    { title: "Créneaux Planifiés", value: scheduleEntries?.length || 0, icon: CalendarDays, color: "text-amber-500", bg: "bg-amber-500/10" },
    { title: "Classes", value: classes?.length || 0, icon: School, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { title: "Semestres Actifs", value: semesters?.filter((s: any) => !s.published).length || 0, icon: Calendar, color: "text-purple-500", bg: "bg-purple-500/10" },
  ];

  const stats = isPlanificateur ? planificateurStats : scolariteStats;
  const recentSemesters = semesters?.slice().sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 3) || [];

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-8">
        <div>
          <h1 className="text-4xl font-serif font-bold text-foreground">Tableau de bord</h1>
          <p className="text-muted-foreground mt-2">
            {isPlanificateur
              ? "Gestion de la programmation et des emplois du temps."
              : "Vue d'ensemble de la scolarité et des résultats."}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
              <Card className="border-none shadow-lg hover:shadow-xl transition-all duration-300">
                <CardContent className="p-6 flex items-center gap-4">
                  <div className={`p-4 rounded-2xl ${stat.bg}`}>
                    <stat.icon className={`w-8 h-8 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground">{stat.title}</p>
                    <h3 className="text-3xl font-bold text-foreground mt-1">{stat.value}</h3>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card className="shadow-md border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                Semestres Récents
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentSemesters.map((sem: any) => (
                  <div key={sem.id} className="flex items-center justify-between p-4 rounded-xl bg-secondary/50">
                    <div>
                      <p className="font-semibold text-foreground">{sem.name} - {sem.academicYear}</p>
                      <p className="text-sm text-muted-foreground">Créé le {new Date(sem.createdAt).toLocaleDateString("fr-FR")}</p>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-xs font-bold ${sem.published ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                      {sem.published ? "Publié" : "Brouillon"}
                    </div>
                  </div>
                ))}
                {recentSemesters.length === 0 && <p className="text-muted-foreground text-center py-4">Aucun semestre trouvé.</p>}
              </div>
            </CardContent>
          </Card>

          {isPlanificateur ? (
            <Card className="shadow-md border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DoorOpen className="w-5 h-5 text-primary" />
                  Inventaire des Salles
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {rooms?.slice(0, 4).map((room) => (
                    <div key={room.id} className="flex items-center justify-between p-3 rounded-xl bg-secondary/50">
                      <div>
                        <p className="font-semibold text-sm">{room.name}</p>
                        <p className="text-xs text-muted-foreground">{room.type}</p>
                      </div>
                      <span className="text-sm font-medium text-muted-foreground">{room.capacity} places</span>
                    </div>
                  ))}
                  {(!rooms || rooms.length === 0) && <p className="text-muted-foreground text-center py-4">Aucune salle enregistrée.</p>}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="shadow-md border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-primary" />
                  Résultats Publiés
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {semesters?.filter((s: any) => s.published).slice(0, 4).map((sem: any) => (
                    <div key={sem.id} className="flex items-center justify-between p-3 rounded-xl bg-emerald-50">
                      <div>
                        <p className="font-semibold text-sm">{sem.name}</p>
                        <p className="text-xs text-muted-foreground">{sem.academicYear}</p>
                      </div>
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full">Publié</span>
                    </div>
                  ))}
                  {(!semesters || semesters.filter((s: any) => s.published).length === 0) && (
                    <p className="text-muted-foreground text-center py-4">Aucun résultat publié.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
