import { AppLayout } from "@/components/layout";
import { useListUsers, useListClasses, useListSubjects, useListSemesters } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, School, BookOpen, Calendar } from "lucide-react";
import { motion } from "framer-motion";

export default function AdminDashboard() {
  const { data: users } = useListUsers();
  const { data: classes } = useListClasses();
  const { data: subjects } = useListSubjects();
  const { data: semesters } = useListSemesters();

  const stats = [
    { title: "Étudiants Inscrits", value: users?.filter(u => u.role === 'student').length || 0, icon: Users, color: "text-blue-500", bg: "bg-blue-500/10" },
    { title: "Enseignants Actifs", value: users?.filter(u => u.role === 'teacher').length || 0, icon: Users, color: "text-amber-500", bg: "bg-amber-500/10" },
    { title: "Classes Déclarées", value: classes?.length || 0, icon: School, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { title: "Matières Dispensées", value: subjects?.length || 0, icon: BookOpen, color: "text-purple-500", bg: "bg-purple-500/10" },
  ];

  const recentSemesters = semesters?.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 3) || [];

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-8">
        <div>
          <h1 className="text-4xl font-serif font-bold text-foreground">Tableau de bord</h1>
          <p className="text-muted-foreground mt-2">Vue d'ensemble de l'établissement académique.</p>
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
                {recentSemesters.map(sem => (
                  <div key={sem.id} className="flex items-center justify-between p-4 rounded-xl bg-secondary/50">
                    <div>
                      <p className="font-semibold text-foreground">{sem.name} - {sem.academicYear}</p>
                      <p className="text-sm text-muted-foreground">Créé le {new Date(sem.createdAt).toLocaleDateString('fr-FR')}</p>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-xs font-bold ${sem.published ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {sem.published ? 'Publié' : 'Brouillon'}
                    </div>
                  </div>
                ))}
                {recentSemesters.length === 0 && <p className="text-muted-foreground text-center py-4">Aucun semestre trouvé.</p>}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
