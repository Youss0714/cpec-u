import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useListSemesters, useListClasses, useGetSemesterResults, generateBulletin } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Download, Search } from "lucide-react";

export default function AdminResults() {
  const { data: semesters } = useListSemesters();
  const { data: classes } = useListClasses();
  
  const [selectedSemester, setSelectedSemester] = useState<string>("");
  const [selectedClass, setSelectedClass] = useState<string>("all");
  
  const { data: results, isLoading } = useGetSemesterResults(
    selectedSemester ? parseInt(selectedSemester) : 0, 
    { classId: selectedClass !== "all" ? parseInt(selectedClass) : undefined },
    { query: { enabled: !!selectedSemester } }
  );

  const { toast } = useToast();

  const handleDownloadPDF = async (studentId: number, semesterId: number, studentName: string) => {
    try {
      const blob = await generateBulletin(studentId, semesterId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Bulletin_${studentName.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Erreur de génération du PDF", variant: "destructive" });
    }
  };

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Résultats Académiques</h1>
          <p className="text-muted-foreground">Visualisez les moyennes et générez les bulletins officiels.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 bg-card p-4 rounded-2xl shadow-sm border border-border">
          <div className="flex-1 space-y-2">
            <label className="text-sm font-semibold text-muted-foreground">Semestre</label>
            <Select value={selectedSemester} onValueChange={setSelectedSemester}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir un semestre" />
              </SelectTrigger>
              <SelectContent>
                {semesters?.map(s => <SelectItem key={s.id} value={s.id.toString()}>{s.name} ({s.academicYear})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 space-y-2">
            <label className="text-sm font-semibold text-muted-foreground">Classe (Optionnel)</label>
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger>
                <SelectValue placeholder="Toutes les classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les classes</SelectItem>
                {classes?.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selectedSemester ? (
          <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
            <Table>
              <TableHeader className="bg-secondary/50">
                <TableRow>
                  <TableHead>Étudiant</TableHead>
                  <TableHead>Classe</TableHead>
                  <TableHead className="text-center">Moyenne</TableHead>
                  <TableHead className="text-center">Rang</TableHead>
                  <TableHead className="text-center">Décision</TableHead>
                  <TableHead className="text-right">Bulletin PDF</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-12">Calcul des résultats en cours...</TableCell></TableRow>
                ) : results?.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-12">Aucun résultat trouvé pour cette sélection.</TableCell></TableRow>
                ) : (
                  results?.map(res => (
                    <TableRow key={res.studentId} className="hover:bg-muted/50">
                      <TableCell className="font-bold">{res.studentName}</TableCell>
                      <TableCell>{res.className}</TableCell>
                      <TableCell className="text-center font-mono font-bold text-lg">
                        {res.average !== null ? res.average?.toFixed(2) : '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        {res.rank ? `${res.rank} / ${res.totalStudents}` : '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        {res.decision === "Admis" && <Badge className="bg-emerald-500 hover:bg-emerald-600">Admis</Badge>}
                        {res.decision === "Ajourné" && <Badge variant="destructive">Ajourné</Badge>}
                        {res.decision === "En attente" && <Badge variant="secondary">En attente</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="border-primary text-primary hover:bg-primary hover:text-white transition-colors"
                          onClick={() => handleDownloadPDF(res.studentId, res.semesterId, res.studentName)}
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Télécharger PDF
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground border-2 border-dashed border-border rounded-2xl">
            <Search className="w-12 h-12 mb-4 opacity-20" />
            <p className="text-lg">Veuillez sélectionner un semestre pour voir les résultats.</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
