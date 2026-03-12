import { useMemo } from "react";
import { Link } from "wouter";
import { AppLayout } from "@/components/layout";
import {
  useGetCurrentUser, useListUsers, useListClasses, useListSubjects,
  useListSemesters, useListRooms, useListScheduleEntries,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Users, School, BookOpen, Calendar, DoorOpen, CalendarDays,
  GraduationCap, CheckCircle, AlertTriangle, BarChart, CalendarOff,
  ArrowRight,
} from "lucide-react";
import { motion } from "framer-motion";

function timesToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function countConflicts(entries: any[]) {
  const conflictIds = new Set<number>();
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i], b = entries[j];
      if (a.dayOfWeek !== b.dayOfWeek) continue;
      const aS = timesToMinutes(a.startTime), aE = timesToMinutes(a.endTime);
      const bS = timesToMinutes(b.startTime), bE = timesToMinutes(b.endTime);
      if (aS >= bE || bS >= aE) continue;
      if (a.teacherId === b.teacherId || a.roomId === b.roomId) {
        conflictIds.add(a.id);
        conflictIds.add(b.id);
      }
    }
  }
  return conflictIds.size;
}

const quickLinks = [
  { label: "Emplois du temps", href: "/admin/schedules", icon: CalendarDays, color: "text-blue-500", bg: "bg-blue-50" },
  { label: "Volumes Horaires", href: "/admin/planning-assignments", icon: BarChart, color: "text-purple-500", bg: "bg-purple-50" },
  { label: "Vacances & Fériés", href: "/admin/blocked-dates", icon: CalendarOff, color: "text-amber-500", bg: "bg-amber-50" },
  { label: "Gestion des Salles", href: "/admin/rooms", icon: DoorOpen, color: "text-emerald-500", bg: "bg-emerald-50" },
];

export default function AdminDashboard() {
  const { data: currentUser } = useGetCurrentUser();
  const adminSubRole = (currentUser as any)?.adminSubRole as string | null;
  const isPlanificateur = adminSubRole === "planificateur";

  const { data: users } = useListUsers();
  const { data: classes } = useListClasses();
  const { data: subjects } = useListSubjects();
  const { data: semesters } = useListSemesters();
  const { data: rooms } = useListRooms();
  const { data: scheduleEntries = [] } = useListScheduleEntries({});

  const conflictCount = useMemo(() => countConflicts(scheduleEntries as any[]), [scheduleEntries]);

  const scolariteStats = [
    { title: "Étudiants Inscrits", value: (users as any[])?.filter(u => u.role === "student").length || 0, icon: Users, color: "text-blue-500", bg: "bg-blue-500/10" },
    { title: "Enseignants Actifs", value: (users as any[])?.filter(u => u.role === "teacher").length || 0, icon: GraduationCap, color: "text-amber-500", bg: "bg-amber-500/10" },
    { title: "Classes Déclarées", value: (classes as any[])?.length || 0, icon: School, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { title: "Matières Dispensées", value: (subjects as any[])?.length || 0, icon: BookOpen, color: "text-purple-500", bg: "bg-purple-500/10" },
  ];

  const planificateurStats = [
    {
      title: "Créneaux Planifiés",
      value: (scheduleEntries as any[]).length || 0,
      icon: CalendarDays,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      title: "Conflits Détectés",
      value: conflictCount,
      icon: AlertTriangle,
      color: conflictCount > 0 ? "text-red-500" : "text-emerald-500",
      bg: conflictCount > 0 ? "bg-red-500/10" : "bg-emerald-500/10",
    },
    {
      title: "Salles Disponibles",
      value: (rooms as any[])?.length || 0,
      icon: DoorOpen,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
    {
      title: "Semestres Actifs",
      value: (semesters as any[])?.filter((s: any) => !s.published).length || 0,
      icon: Calendar,
      color: "text-purple-500",
      bg: "bg-purple-500/10",
    },
  ];

  const stats = isPlanificateur ? planificateurStats : scolariteStats;
  const recentSemesters = (semesters as any[])?.slice().sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 3) || [];

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

        {/* Stats */}
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

        {/* Conflict warning */}
        {isPlanificateur && conflictCount > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-center gap-4 bg-red-50 border border-red-200 rounded-2xl p-5">
              <div className="p-3 bg-red-100 rounded-xl shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-red-800">
                  {conflictCount} créneau{conflictCount > 1 ? "x" : ""} en conflit
                </p>
                <p className="text-sm text-red-600 mt-0.5">
                  Un ou plusieurs enseignants ou salles sont doublement réservés. Corrigez les conflits avant de publier.
                </p>
              </div>
              <Link href="/admin/schedules">
                <Button variant="outline" size="sm" className="border-red-300 text-red-700 hover:bg-red-50 shrink-0">
                  Voir l'emploi du temps <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>
          </motion.div>
        )}

        {/* Quick links — planificateur only */}
        {isPlanificateur && (
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">Accès Rapides</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {quickLinks.map((link, i) => (
                <motion.div key={link.href} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 + i * 0.08 }}>
                  <Link href={link.href}>
                    <Card className="cursor-pointer hover:shadow-md transition-all duration-200 border-border/50 hover:border-primary/30 group">
                      <CardContent className="p-5 flex flex-col items-center text-center gap-3">
                        <div className={`p-3 rounded-xl ${link.bg} group-hover:scale-110 transition-transform`}>
                          <link.icon className={`w-6 h-6 ${link.color}`} />
                        </div>
                        <p className="text-sm font-medium text-foreground leading-tight">{link.label}</p>
                      </CardContent>
                    </Card>
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Bottom cards */}
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
                      <p className="font-semibold text-foreground">{sem.name} — {sem.academicYear}</p>
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
                  {(rooms as any[])?.slice(0, 5).map((room: any) => (
                    <div key={room.id} className="flex items-center justify-between p-3 rounded-xl bg-secondary/50">
                      <div>
                        <p className="font-semibold text-sm">{room.name}</p>
                        <p className="text-xs text-muted-foreground">{room.type}</p>
                      </div>
                      <span className="text-sm font-medium text-muted-foreground">{room.capacity} places</span>
                    </div>
                  ))}
                  {(!rooms || (rooms as any[]).length === 0) && <p className="text-muted-foreground text-center py-4">Aucune salle enregistrée.</p>}
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
                  {(semesters as any[])?.filter((s: any) => s.published).slice(0, 4).map((sem: any) => (
                    <div key={sem.id} className="flex items-center justify-between p-3 rounded-xl bg-emerald-50">
                      <div>
                        <p className="font-semibold text-sm">{sem.name}</p>
                        <p className="text-xs text-muted-foreground">{sem.academicYear}</p>
                      </div>
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full">Publié</span>
                    </div>
                  ))}
                  {(!(semesters as any[]) || (semesters as any[]).filter((s: any) => s.published).length === 0) && (
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
