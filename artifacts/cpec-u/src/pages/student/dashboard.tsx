import { AppLayout } from "@/components/layout";
import { useGetStudentProfile, useListSemesters, useGetStudentResults } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { motion } from "framer-motion";
import { GraduationCap, Award, Book, AlertCircle, Building2, BedDouble, CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";

function useMyHousing() {
  return useQuery({
    queryKey: ["/api/housing/my"],
    queryFn: async () => {
      const res = await fetch("/api/housing/my", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  });
}

const ROOM_TYPES: Record<string, string> = {
  simple: "Simple",
  double: "Double",
};

export default function StudentDashboard() {
  const { data: profile } = useGetStudentProfile();
  const { data: semesters } = useListSemesters();
  const { data: housing } = useMyHousing();
  
  // Find latest published semester as default
  const latestPublished = semesters?.filter(s => s.published).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  
  const [selectedSemester, setSelectedSemester] = useState<string>("");

  // Set default once semesters load
  if (!selectedSemester && latestPublished) {
    setSelectedSemester(latestPublished.id.toString());
  }

  const { data: results, isLoading, isError } = useGetStudentResults(
    { semesterId: parseInt(selectedSemester) },
    { query: { enabled: !!selectedSemester, retry: false } as any }
  );

  return (
    <AppLayout allowedRoles={["student"]}>
      <div className="space-y-8 max-w-5xl mx-auto">
        
        {/* Profile Hero */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative bg-primary rounded-3xl p-8 text-primary-foreground overflow-hidden shadow-2xl shadow-primary/20">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 opacity-10">
            <GraduationCap className="w-64 h-64" />
          </div>
          <div className="relative z-10">
            <h1 className="text-4xl font-serif font-bold mb-2">Bonjour, {profile?.name}</h1>
            <p className="text-primary-foreground/80 text-lg flex items-center gap-2">
              <Book className="w-5 h-5" />
              {profile?.className || "Classe non assignée"}
            </p>
          </div>
        </motion.div>

        {/* Housing Card */}
        {housing && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="border-border shadow-sm overflow-hidden">
              <CardContent className="p-0">
                <div className="flex items-center gap-4 p-5">
                  <div className="w-12 h-12 rounded-2xl bg-teal-50 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-6 h-6 text-teal-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Mon Hébergement</p>
                    <p className="font-bold text-foreground">{housing.buildingName} — Chambre {housing.roomNumber}</p>
                    <p className="text-sm text-muted-foreground">Étage {housing.floor} · {ROOM_TYPES[housing.type] ?? housing.type} · {housing.capacity} pers.</p>
                  </div>
                  <div className="text-right flex-shrink-0 space-y-1">
                    <p className="font-bold text-teal-700">{parseFloat(housing.pricePerMonth).toLocaleString("fr-FR")} FCFA<span className="text-xs font-normal text-muted-foreground">/mois</span></p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end"><CalendarDays className="w-3 h-3" />Depuis le {new Date(housing.startDate).toLocaleDateString("fr-FR")}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Results Section */}
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h2 className="text-2xl font-bold font-serif text-foreground">Mes Résultats</h2>
            <Select value={selectedSemester} onValueChange={setSelectedSemester}>
              <SelectTrigger className="w-[250px] bg-card border-border/50 shadow-sm h-12">
                <SelectValue placeholder="Sélectionner un semestre" />
              </SelectTrigger>
              <SelectContent>
                {semesters?.map(s => (
                  <SelectItem key={s.id} value={s.id.toString()}>{s.name} ({s.academicYear})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
             <div className="py-24 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
          ) : isError || !results ? (
            <Card className="border-dashed border-2 border-border bg-transparent shadow-none">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <AlertCircle className="w-12 h-12 text-muted-foreground opacity-50 mb-4" />
                <h3 className="text-xl font-bold text-foreground">Résultats indisponibles</h3>
                <p className="text-muted-foreground mt-2">Les résultats de ce semestre ne sont pas encore publiés ou vous n'avez pas de notes.</p>
              </CardContent>
            </Card>
          ) : (
            <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6">
              
              {/* Highlight Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="bg-card shadow-sm border-border">
                  <CardContent className="p-6 text-center">
                    <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Moyenne Générale</p>
                    <p className="text-5xl font-bold font-mono text-primary">{results.average?.toFixed(2) || "-"}</p>
                    {(results as any).absenceDeduction > 0 && (
                      <p className="text-xs text-red-500 font-medium mt-1">
                        −{(results as any).absenceDeduction.toFixed(2)} ({(results as any).absenceDeductionHours}h d'absence)
                      </p>
                    )}
                  </CardContent>
                </Card>
                <Card className="bg-card shadow-sm border-border">
                  <CardContent className="p-6 text-center">
                    <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Rang</p>
                    <p className="text-5xl font-bold font-mono text-foreground">{results.rank || "-"}</p>
                    <p className="text-sm text-muted-foreground mt-1">sur {results.totalStudents}</p>
                  </CardContent>
                </Card>
                <Card className={`shadow-sm border-none flex flex-col justify-center items-center p-6 ${
                  results.decision === 'Admis' ? 'bg-emerald-500 text-white' : 
                  results.decision === 'Ajourné' ? 'bg-destructive text-white' : 'bg-secondary text-foreground'
                }`}>
                  <p className="text-sm font-semibold opacity-80 uppercase tracking-wider mb-2">Décision</p>
                  <p className="text-4xl font-bold flex items-center gap-2">
                    {results.decision === 'Admis' && <Award className="w-8 h-8" />}
                    {results.decision}
                  </p>
                </Card>
              </div>

              {/* Grades Table */}
              <Card className="overflow-hidden border-border shadow-sm">
                <Table>
                  <TableHeader className="bg-secondary/30">
                    <TableRow>
                      <TableHead className="w-1/2">Matière</TableHead>
                      <TableHead className="text-center">Coefficient</TableHead>
                      <TableHead className="text-right">Note / 20</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.grades?.map((g, i) => (
                      <TableRow key={i} className="hover:bg-muted/30">
                        <TableCell className="font-bold text-foreground py-4">{g.subjectName}</TableCell>
                        <TableCell className="text-center text-muted-foreground font-semibold">{g.coefficient}</TableCell>
                        <TableCell className="text-right font-mono font-bold text-lg">
                          {g.value !== null && g.value !== undefined ? (
                            <span className={g.value < 12 ? 'text-destructive' : 'text-emerald-600'}>
                              {g.value.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>

            </motion.div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
