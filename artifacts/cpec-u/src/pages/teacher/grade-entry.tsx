import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout";
import { useGetTeacherAssignments, useGetTeacherGrades, useSubmitGradesBulk, SubmitGradeRequest } from "@workspace/api-client-react";
import { useListSubjectApprovals, useGetClassStudents } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useOfflineGrades } from "@/lib/offline-sync";
import { WifiOff, Save, CheckCircle2, CloudFog, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";

export default function GradeEntry() {
  const { data: assignments } = useGetTeacherAssignments();
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>("");

  const selectedAssignment = assignments?.find(a => a.id.toString() === selectedAssignmentId);

  const { data: initialGrades, isLoading } = useGetTeacherGrades(
    {
      subjectId: selectedAssignment?.subjectId,
      semesterId: selectedAssignment?.semesterId,
      classId: selectedAssignment?.classId
    },
    { query: { enabled: !!selectedAssignment } as any }
  );

  // Fetch enrolled students for the selected class
  const { data: enrolledStudents = [] } = useGetClassStudents(
    selectedAssignment?.classId ?? 0,
    { query: { enabled: !!selectedAssignment } } as any
  );

  // Merge enrolled students with existing grades → one row per student
  const studentRows = useMemo(() => {
    if (!selectedAssignment) return [];
    const gradesMap = new Map((initialGrades ?? []).map((g: any) => [g.studentId, g]));
    return (enrolledStudents as any[]).map((s: any) => {
      const existing = gradesMap.get(s.id);
      return {
        studentId: s.id,
        studentName: s.name,
        subjectId: selectedAssignment.subjectId,
        semesterId: selectedAssignment.semesterId,
        value: existing?.value ?? null,
      };
    });
  }, [enrolledStudents, initialGrades, selectedAssignment]);

  // Check if subject is approved (locked)
  const { data: approvals = [] } = useListSubjectApprovals(
    selectedAssignment
      ? { semesterId: selectedAssignment.semesterId, classId: selectedAssignment.classId }
      : undefined,
    { enabled: !!selectedAssignment }
  );
  const isLocked = (approvals as any[]).some(
    (a) => a.subjectId === selectedAssignment?.subjectId && a.classId === selectedAssignment?.classId
  );

  const [localGrades, setLocalGrades] = useState<Record<number, string>>({});
  const { isOnline, pendingGrades, savePendingGrade, clearPendingGrades } = useOfflineGrades();
  const submitBulk = useSubmitGradesBulk();
  const { toast } = useToast();

  useEffect(() => {
    if (studentRows.length > 0) {
      const map: Record<number, string> = {};
      studentRows.forEach(g => {
        const pending = pendingGrades.find(p => p.studentId === g.studentId && p.subjectId === g.subjectId && p.semesterId === g.semesterId);
        map[g.studentId] = pending ? pending.value.toString() : (g.value !== null && g.value !== undefined ? g.value.toString() : "");
      });
      setLocalGrades(map);
    }
  }, [studentRows, pendingGrades]);

  useEffect(() => {
    if (isOnline && pendingGrades.length > 0) {
      const sync = async () => {
        try {
          await submitBulk.mutateAsync({ data: { grades: pendingGrades } });
          clearPendingGrades();
          toast({ title: "Synchronisation réussie", description: "Vos notes saisies hors ligne ont été envoyées." });
        } catch {
          // Silent fail
        }
      };
      sync();
    }
  }, [isOnline, pendingGrades]);

  const handleGradeChange = (studentId: number, value: string) => {
    if (isLocked) return;
    if (value !== "" && (parseFloat(value) < 0 || parseFloat(value) > 20)) return;
    setLocalGrades(prev => ({ ...prev, [studentId]: value }));
  };

  const handleSave = async () => {
    if (!selectedAssignment || isLocked) return;

    const gradesToSubmit: SubmitGradeRequest[] = Object.entries(localGrades)
      .filter(([_, val]) => val !== "")
      .map(([studentId, val]) => ({
        studentId: parseInt(studentId),
        subjectId: selectedAssignment.subjectId,
        semesterId: selectedAssignment.semesterId,
        value: parseFloat(val)
      }));

    if (gradesToSubmit.length === 0) return;

    if (isOnline) {
      try {
        await submitBulk.mutateAsync({ data: { grades: gradesToSubmit } });
        toast({ title: "Notes enregistrées avec succès" });
      } catch (e: any) {
        const msg = e?.message ?? "Erreur lors de l'enregistrement";
        toast({ title: msg.includes("verrouillées") ? "Notes verrouillées par le Assistant(e) de Direction." : msg, variant: "destructive" });
      }
    } else {
      gradesToSubmit.forEach(savePendingGrade);
      toast({
        title: "Mode hors ligne actif",
        description: "Notes sauvegardées localement. Synchronisation automatique au retour de la connexion."
      });
    }
  };

  return (
    <AppLayout allowedRoles={["teacher"]}>
      <div className="space-y-6 max-w-4xl mx-auto pb-24">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-serif font-bold text-foreground">Saisie des Notes</h1>
          {!isOnline && (
            <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-3 rounded-lg border border-amber-200">
              <WifiOff className="w-5 h-5" />
              <span className="font-semibold text-sm">Connexion perdue. Vos saisies seront sauvegardées sur cet appareil.</span>
            </div>
          )}
        </div>

        <Card className="p-4 shadow-sm border-border bg-card sticky top-4 z-20">
          <label className="text-sm font-semibold text-muted-foreground block mb-2">Choisir la classe et matière</label>
          <Select value={selectedAssignmentId} onValueChange={setSelectedAssignmentId}>
            <SelectTrigger className="h-14 text-lg">
              <SelectValue placeholder="Sélectionner une affectation..." />
            </SelectTrigger>
            <SelectContent>
              {assignments?.map(a => (
                <SelectItem key={a.id} value={a.id.toString()} className="py-3">
                  {a.subjectName} — {a.className} ({a.semesterName})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Card>

        {/* Locked banner */}
        {isLocked && selectedAssignment && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
            <Lock className="w-5 h-5 text-red-500 shrink-0" />
            <div>
              <p className="font-semibold text-red-800 text-sm">Notes approuvées — lecture seule</p>
              <p className="text-xs text-red-600 mt-0.5">
                Le Assistant(e) de Direction a validé les notes de cette matière. Contactez-le pour toute modification exceptionnelle.
              </p>
            </div>
          </div>
        )}

        {selectedAssignment && (
          <div className="space-y-4 mt-8">
            <div className="flex justify-between items-end mb-4 px-2">
              <h3 className="font-bold text-xl">Liste des étudiants</h3>
              <span className="text-sm text-muted-foreground font-semibold">{studentRows.length} étudiant{studentRows.length > 1 ? "s" : ""}</span>
            </div>

            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Chargement de la liste...</div>
            ) : studentRows.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">Aucun étudiant inscrit dans cette classe.</div>
            ) : (
              <div className="space-y-3">
                {studentRows.map(grade => {
                  const val = localGrades[grade.studentId];
                  const isPending = pendingGrades.some(p => p.studentId === grade.studentId && p.subjectId === grade.subjectId && p.semesterId === grade.semesterId);

                  return (
                    <div key={grade.studentId} className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-card rounded-xl border shadow-sm gap-4 transition-colors ${isLocked ? "opacity-75 border-red-100" : "border-border hover:border-primary/50"}`}>
                      <div className="flex-1">
                        <p className="font-bold text-lg text-foreground">{grade.studentName}</p>
                        {isPending && <p className="text-xs text-amber-500 font-semibold flex items-center gap-1 mt-1"><CloudFog className="w-3 h-3" /> Non synchronisé</p>}
                      </div>
                      <div className="flex items-center gap-3">
                        <Input
                          type="number"
                          step="0.5"
                          min="0"
                          max="20"
                          placeholder=" / 20"
                          value={val !== undefined ? val : ""}
                          onChange={(e) => handleGradeChange(grade.studentId, e.target.value)}
                          readOnly={isLocked}
                          className={`w-24 text-center font-mono font-bold text-lg h-12 focus:ring-primary/30 ${isLocked ? "bg-muted cursor-not-allowed" : ""}`}
                        />
                        {isLocked
                          ? <Lock className="w-5 h-5 text-red-400" />
                          : val !== "" && val !== undefined && !isPending && <CheckCircle2 className="w-6 h-6 text-emerald-500 opacity-50" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Save button — hidden when locked */}
        {selectedAssignment && !isLocked && (
          <div className="fixed bottom-6 left-0 right-0 px-4 md:static md:px-0 md:mt-8 z-30">
            <Button
              size="lg"
              className="w-full h-16 text-lg font-bold shadow-xl shadow-primary/30 md:shadow-none hover:-translate-y-1 transition-transform"
              onClick={handleSave}
              disabled={submitBulk.isPending}
            >
              <Save className="w-5 h-5 mr-2" />
              {submitBulk.isPending ? "Enregistrement..." : "Tout Enregistrer ( / 20)"}
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
