import { AppLayout } from "@/components/layout";
import { useGetTeacherAssignments } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { BookOpen, PenTool, Calendar } from "lucide-react";
import { useOfflineGrades } from "@/lib/offline-sync";
import { Badge } from "@/components/ui/badge";

export default function TeacherDashboard() {
  const { data: assignments, isLoading } = useGetTeacherAssignments();
  const { isOnline, pendingGrades } = useOfflineGrades();

  return (
    <AppLayout allowedRoles={["teacher"]}>
      <div className="space-y-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">Espace Enseignant</h1>
            <p className="text-muted-foreground mt-2">Gérez vos classes et la saisie des notes.</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {!isOnline && <Badge variant="destructive" className="animate-pulse">Mode Hors Ligne</Badge>}
            {pendingGrades.length > 0 && (
              <Badge className="bg-amber-500 hover:bg-amber-600">
                {pendingGrades.length} note(s) en attente de synchro
              </Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="col-span-1 md:col-span-2 lg:col-span-3 bg-primary text-primary-foreground shadow-xl shadow-primary/20 border-none">
            <CardContent className="p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
              <div>
                <h2 className="text-2xl font-bold mb-2">Prêt pour la saisie ?</h2>
                <p className="text-primary-foreground/80 max-w-xl">
                  L'interface de saisie des notes est optimisée pour mobile et fonctionne même sans connexion internet. Vos saisies seront synchronisées automatiquement.
                </p>
              </div>
              <div className="flex gap-3 flex-wrap justify-center sm:justify-end">
                <Link href="/teacher/schedule" className="bg-white/20 border border-white/40 text-white px-5 py-3 rounded-xl font-semibold hover:bg-white/30 transition-all flex items-center gap-2 whitespace-nowrap">
                  <Calendar className="w-5 h-5" />
                  Mon planning
                </Link>
                <Link href="/teacher/grades" className="bg-white text-primary px-6 py-3 rounded-xl font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center gap-2 whitespace-nowrap">
                  <PenTool className="w-5 h-5" />
                  Saisir les notes
                </Link>
              </div>
            </CardContent>
          </Card>

          <div className="col-span-1 md:col-span-2 lg:col-span-3 mt-4">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              Vos classes et matières assignées
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {isLoading ? (
                <p className="text-muted-foreground">Chargement...</p>
              ) : assignments?.length === 0 ? (
                <p className="text-muted-foreground">Aucune classe ne vous a été assignée.</p>
              ) : (
                assignments?.map(a => (
                  <Card key={a.id} className="border-border hover:border-primary/50 transition-colors shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">{a.subjectName}</CardTitle>
                      <p className="text-sm text-muted-foreground font-semibold">Coef. {a.coefficient}</p>
                    </CardHeader>
                    <CardContent>
                      <div className="bg-secondary/50 rounded-lg p-3 space-y-2 mt-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Classe:</span>
                          <span className="font-bold">{a.className}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Semestre:</span>
                          <span className="font-medium flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {a.semesterName}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
