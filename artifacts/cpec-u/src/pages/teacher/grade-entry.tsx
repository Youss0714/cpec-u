import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout";
import { useGetTeacherAssignments, useGetTeacherGrades, useSubmitGradesBulk } from "@workspace/api-client-react";
import { useListSubjectApprovals, useGetClassStudents } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { WifiOff, Save, CheckCircle2, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";

const EVAL_LABELS = ["Éval 1", "Éval 2", "Éval 3", "Éval 4"] as const;
const EVAL_COUNT = 4;

type GradeKey = `${number}_${number}`;
function gradeKey(studentId: number, evalNum: number): GradeKey {
  return `${studentId}_${evalNum}`;
}

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

  const { data: enrolledStudents = [] } = useGetClassStudents(
    selectedAssignment?.classId ?? 0,
    { query: { enabled: !!selectedAssignment } } as any
  );

  // Build one row per student with their existing evaluations
  const studentRows = useMemo(() => {
    if (!selectedAssignment) return [];
    // Group existing grades by studentId → Map<studentId, Map<evalNum, value>>
    const existingMap = new Map<number, Map<number, number>>();
    for (const g of (initialGrades ?? []) as any[]) {
      if (!existingMap.has(g.studentId)) existingMap.set(g.studentId, new Map());
      existingMap.get(g.studentId)!.set(g.evaluationNumber ?? 1, g.value);
    }
    return (enrolledStudents as any[]).map((s: any) => ({
      studentId: s.id,
      studentName: s.name,
      subjectId: selectedAssignment.subjectId,
      semesterId: selectedAssignment.semesterId,
      evalValues: existingMap.get(s.id) ?? new Map<number, number>(),
    }));
  }, [enrolledStudents, initialGrades, selectedAssignment]);

  // localGrades: key = `studentId_evalNum`, value = string input
  const [localGrades, setLocalGrades] = useState<Record<GradeKey, string>>({});

  const { toast } = useToast();
  const submitBulk = useSubmitGradesBulk();

  // Online detection
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

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

  // Populate localGrades from server data when studentRows change
  useEffect(() => {
    if (studentRows.length === 0) return;
    const map: Record<GradeKey, string> = {};
    for (const row of studentRows) {
      for (let e = 1; e <= EVAL_COUNT; e++) {
        const existing = row.evalValues.get(e);
        map[gradeKey(row.studentId, e)] = existing !== undefined ? existing.toString() : "";
      }
    }
    setLocalGrades(map);
  }, [studentRows]);

  const handleGradeChange = (studentId: number, evalNum: number, raw: string) => {
    if (isLocked) return;
    if (raw !== "" && (parseFloat(raw) < 0 || parseFloat(raw) > 20)) return;
    setLocalGrades(prev => ({ ...prev, [gradeKey(studentId, evalNum)]: raw }));
  };

  // Compute average for a student from current local inputs
  const getStudentAverage = (studentId: number): string => {
    const vals: number[] = [];
    for (let e = 1; e <= EVAL_COUNT; e++) {
      const v = localGrades[gradeKey(studentId, e)];
      if (v !== "" && v !== undefined) vals.push(parseFloat(v));
    }
    if (vals.length === 0) return "—";
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return avg.toFixed(2);
  };

  const handleSave = async () => {
    if (!selectedAssignment || isLocked) return;

    const gradesToSubmit: any[] = [];
    for (const row of studentRows) {
      for (let e = 1; e <= EVAL_COUNT; e++) {
        const val = localGrades[gradeKey(row.studentId, e)];
        if (val !== "" && val !== undefined) {
          const parsed = parseFloat(val);
          if (!isNaN(parsed) && parsed >= 0 && parsed <= 20) {
            gradesToSubmit.push({
              studentId: row.studentId,
              subjectId: row.subjectId,
              semesterId: row.semesterId,
              evaluationNumber: e,
              value: parsed,
            });
          }
        }
      }
    }

    if (gradesToSubmit.length === 0) {
      toast({ title: "Aucune note à enregistrer", variant: "destructive" });
      return;
    }

    try {
      await submitBulk.mutateAsync({ data: { grades: gradesToSubmit } });
      toast({ title: `${gradesToSubmit.length} note${gradesToSubmit.length > 1 ? "s" : ""} enregistrée${gradesToSubmit.length > 1 ? "s" : ""} avec succès` });
    } catch (e: any) {
      const msg = e?.message ?? "Erreur lors de l'enregistrement";
      toast({
        title: msg.includes("verrouillées") ? "Notes verrouillées par le Assistant(e) de Direction." : msg,
        variant: "destructive"
      });
    }
  };

  const filledCount = studentRows.reduce((count, row) => {
    let rowFilled = 0;
    for (let e = 1; e <= EVAL_COUNT; e++) {
      const v = localGrades[gradeKey(row.studentId, e)];
      if (v !== "" && v !== undefined) rowFilled++;
    }
    return count + rowFilled;
  }, 0);
  const totalFields = studentRows.length * EVAL_COUNT;

  return (
    <AppLayout allowedRoles={["teacher"]}>
      <div className="space-y-6 max-w-5xl mx-auto pb-24">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-serif font-bold text-foreground">Saisie des Notes</h1>
          {!isOnline && (
            <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-3 rounded-lg border border-amber-200">
              <WifiOff className="w-5 h-5" />
              <span className="font-semibold text-sm">Connexion perdue. Vos modifications seront perdues si vous quittez.</span>
            </div>
          )}
        </div>

        <Card className="p-4 shadow-sm border-border bg-card sticky top-4 z-20">
          <label className="text-sm font-semibold text-muted-foreground block mb-2">Choisir la classe et matière</label>
          <Select value={selectedAssignmentId} onValueChange={v => { setSelectedAssignmentId(v); setLocalGrades({}); }}>
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
              <span className="text-sm text-muted-foreground font-semibold">
                {studentRows.length} étudiant{studentRows.length > 1 ? "s" : ""} · {filledCount}/{totalFields} notes
              </span>
            </div>

            {/* Column headers */}
            {!isLoading && studentRows.length > 0 && (
              <div className="hidden sm:grid grid-cols-[1fr_repeat(4,5.5rem)_5rem] gap-2 px-4 pb-1">
                <span />
                {EVAL_LABELS.map(label => (
                  <span key={label} className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
                ))}
                <span className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Moy.</span>
              </div>
            )}

            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Chargement de la liste...</div>
            ) : studentRows.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">Aucun étudiant inscrit dans cette classe.</div>
            ) : (
              <div className="space-y-3">
                {studentRows.map(row => {
                  const avg = getStudentAverage(row.studentId);
                  const hasAll = Array.from({ length: EVAL_COUNT }, (_, i) => localGrades[gradeKey(row.studentId, i + 1)]).every(v => v !== "" && v !== undefined);

                  return (
                    <div
                      key={row.studentId}
                      className={`p-4 bg-card rounded-xl border shadow-sm transition-colors ${isLocked ? "opacity-75 border-red-100" : "border-border hover:border-primary/30"}`}
                    >
                      {/* Mobile: stacked layout */}
                      <div className="flex items-center justify-between mb-3 sm:hidden">
                        <p className="font-bold text-base text-foreground">{row.studentName}</p>
                        <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${avg === "—" ? "text-muted-foreground bg-muted" : parseFloat(avg) >= 10 ? "text-green-700 bg-green-50" : "text-red-700 bg-red-50"}`}>
                          Moy. {avg}/20
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:hidden">
                        {Array.from({ length: EVAL_COUNT }, (_, i) => i + 1).map(e => {
                          const k = gradeKey(row.studentId, e);
                          return (
                            <div key={e}>
                              <label className="text-xs text-muted-foreground font-semibold block mb-1">{EVAL_LABELS[e - 1]}</label>
                              <Input
                                type="number"
                                step="0.5"
                                min="0"
                                max="20"
                                placeholder="—"
                                value={localGrades[k] !== undefined ? localGrades[k] : ""}
                                onChange={ev => handleGradeChange(row.studentId, e, ev.target.value)}
                                readOnly={isLocked}
                                className={`text-center font-mono font-bold h-11 focus:ring-primary/30 ${isLocked ? "bg-muted cursor-not-allowed" : ""}`}
                              />
                            </div>
                          );
                        })}
                      </div>

                      {/* Desktop: row layout */}
                      <div className="hidden sm:grid grid-cols-[1fr_repeat(4,5.5rem)_5rem] gap-2 items-center">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-base text-foreground">{row.studentName}</p>
                          {hasAll && !isLocked && <CheckCircle2 className="w-4 h-4 text-emerald-500 opacity-60" />}
                          {isLocked && <Lock className="w-4 h-4 text-red-400" />}
                        </div>
                        {Array.from({ length: EVAL_COUNT }, (_, i) => i + 1).map(e => {
                          const k = gradeKey(row.studentId, e);
                          return (
                            <Input
                              key={e}
                              type="number"
                              step="0.5"
                              min="0"
                              max="20"
                              placeholder="—"
                              value={localGrades[k] !== undefined ? localGrades[k] : ""}
                              onChange={ev => handleGradeChange(row.studentId, e, ev.target.value)}
                              readOnly={isLocked}
                              className={`text-center font-mono font-bold h-11 focus:ring-primary/30 ${isLocked ? "bg-muted cursor-not-allowed" : ""}`}
                            />
                          );
                        })}
                        <div className={`text-center font-bold text-sm px-2 py-1 rounded-lg ${avg === "—" ? "text-muted-foreground" : parseFloat(avg) >= 10 ? "text-green-700 bg-green-50" : "text-red-700 bg-red-50"}`}>
                          {avg}/20
                        </div>
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
              {submitBulk.isPending ? "Enregistrement..." : `Tout Enregistrer (${filledCount}/${totalFields} notes)`}
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
