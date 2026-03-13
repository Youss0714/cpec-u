import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout";
import { useGetTeacherAssignments, useGetClassStudents } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, Send, Save, CheckCircle2, XCircle, Clock } from "lucide-react";

const STATUS_CONFIG = {
  present: { label: "Présent(e)", icon: CheckCircle2, color: "bg-emerald-100 text-emerald-700 border-emerald-300", dot: "bg-emerald-500" },
  absent: { label: "Absent(e)", icon: XCircle, color: "bg-red-100 text-red-700 border-red-300", dot: "bg-red-500" },
  late: { label: "Retard", icon: Clock, color: "bg-amber-100 text-amber-700 border-amber-300", dot: "bg-amber-500" },
} as const;

type Status = keyof typeof STATUS_CONFIG;

type StudentRow = { studentId: number; studentName: string; status: Status; note: string };

function todayDate() {
  return new Date().toISOString().split("T")[0];
}

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`/api${path}`, { credentials: "include", ...options });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function TeacherAttendance() {
  const { data: assignments } = useGetTeacherAssignments();
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
  const [sessionDate, setSessionDate] = useState(todayDate());
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const { toast } = useToast();

  const selectedAssignment = useMemo(
    () => assignments?.find((a: any) => a.id.toString() === selectedAssignmentId),
    [assignments, selectedAssignmentId]
  );

  const { data: enrolledStudents = [] } = useGetClassStudents(
    selectedAssignment?.classId ?? 0,
    { query: { enabled: !!selectedAssignment } } as any
  );

  useEffect(() => {
    if (!selectedAssignment || !sessionDate) return;
    const students = enrolledStudents as any[];
    setRows(students.map((s: any) => ({ studentId: s.id, studentName: s.name, status: "present", note: "" })));
    setSentAt(null);

    const { subjectId, classId } = selectedAssignment;
    apiFetch(`/teacher/attendance?subjectId=${subjectId}&classId=${classId}&sessionDate=${sessionDate}`)
      .then(({ records, sentAt: sa }) => {
        setSentAt(sa);
        if (records.length > 0) {
          setRows(prev =>
            prev.map(row => {
              const found = records.find((r: any) => r.studentId === row.studentId);
              return found ? { ...row, status: found.status as Status, note: found.note ?? "" } : row;
            })
          );
        }
      })
      .catch(() => {});
  }, [selectedAssignment, sessionDate, (enrolledStudents as any[]).length]);

  const setStatus = (studentId: number, status: Status) => {
    setRows(prev => prev.map(r => r.studentId === studentId ? { ...r, status } : r));
  };
  const setNote = (studentId: number, note: string) => {
    setRows(prev => prev.map(r => r.studentId === studentId ? { ...r, note } : r));
  };

  const handleSave = async () => {
    if (!selectedAssignment) return;
    setIsSaving(true);
    try {
      await apiFetch("/teacher/attendance/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId: selectedAssignment.subjectId,
          classId: selectedAssignment.classId,
          semesterId: selectedAssignment.semesterId,
          sessionDate,
          records: rows.map(r => ({ studentId: r.studentId, status: r.status, note: r.note || undefined })),
        }),
      });
      toast({ title: "Présences sauvegardées" });
    } catch {
      toast({ title: "Erreur lors de la sauvegarde", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSend = async () => {
    if (!selectedAssignment) return;
    setIsSending(true);
    try {
      await apiFetch("/teacher/attendance/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId: selectedAssignment.subjectId,
          classId: selectedAssignment.classId,
          semesterId: selectedAssignment.semesterId,
          sessionDate,
          records: rows.map(r => ({ studentId: r.studentId, status: r.status, note: r.note || undefined })),
        }),
      });
      const { sentAt: sa } = await apiFetch("/teacher/attendance/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId: selectedAssignment.subjectId,
          classId: selectedAssignment.classId,
          semesterId: selectedAssignment.semesterId,
          sessionDate,
        }),
      });
      setSentAt(sa);
      toast({ title: "Feuille transmise à la scolarité ✓" });
    } catch {
      toast({ title: "Erreur lors de l'envoi", variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  const absentCount = rows.filter(r => r.status === "absent").length;
  const lateCount = rows.filter(r => r.status === "late").length;
  const presentCount = rows.filter(r => r.status === "present").length;

  return (
    <AppLayout allowedRoles={["teacher", "admin"]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2">
            <ClipboardCheck className="w-8 h-8 text-primary" />
            Gestion des Présences
          </h1>
          <p className="text-muted-foreground">Enregistrez les présences et absences de vos cours.</p>
        </div>

        {/* Session selector */}
        <Card className="border-border">
          <CardContent className="pt-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Cours</label>
                <Select value={selectedAssignmentId} onValueChange={setSelectedAssignmentId}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Sélectionner un cours…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(assignments as any[] ?? []).map((a: any) => (
                      <SelectItem key={a.id} value={a.id.toString()}>
                        {a.subjectName} — {a.className}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Date du cours</label>
                <Input
                  type="date"
                  value={sessionDate}
                  onChange={(e) => setSessionDate(e.target.value)}
                  className="bg-background"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Student list */}
        {selectedAssignment && rows.length > 0 && (
          <>
            {/* Stats + sent badge */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                {presentCount} présent{presentCount > 1 ? "s" : ""}
              </span>
              <span className="flex items-center gap-1.5 text-sm font-medium text-red-700 bg-red-50 border border-red-200 px-3 py-1 rounded-full">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                {absentCount} absent{absentCount > 1 ? "s" : ""}
              </span>
              {lateCount > 0 && (
                <span className="flex items-center gap-1.5 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  {lateCount} en retard
                </span>
              )}
              {sentAt && (
                <Badge variant="outline" className="border-primary/40 text-primary bg-primary/5 ml-auto">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                  Transmis le {new Date(sentAt).toLocaleDateString("fr-FR")}
                </Badge>
              )}
            </div>

            {/* Student cards */}
            <div className="space-y-2">
              {rows.map((row) => {
                const cfg = STATUS_CONFIG[row.status];
                return (
                  <div
                    key={row.studentId}
                    className="bg-card border border-border rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                      <span className="font-medium text-foreground truncate">{row.studentName}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                      {(["present", "absent", "late"] as Status[]).map((s) => {
                        const c = STATUS_CONFIG[s];
                        const active = row.status === s;
                        return (
                          <button
                            key={s}
                            onClick={() => setStatus(row.studentId, s)}
                            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
                              active ? c.color : "border-border text-muted-foreground hover:border-primary/40"
                            }`}
                          >
                            {c.label}
                          </button>
                        );
                      })}
                      {row.status !== "present" && (
                        <Input
                          value={row.note}
                          onChange={(e) => setNote(row.studentId, e.target.value)}
                          placeholder="Motif (optionnel)"
                          className="h-7 text-xs w-40 bg-background"
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button variant="outline" onClick={handleSave} disabled={isSaving} className="flex-1">
                <Save className="w-4 h-4 mr-2" />
                {isSaving ? "Sauvegarde…" : "Sauvegarder le brouillon"}
              </Button>
              <Button onClick={handleSend} disabled={isSending || isSaving} className="flex-1 bg-primary hover:bg-primary/90">
                <Send className="w-4 h-4 mr-2" />
                {isSending ? "Envoi…" : "Envoyer à l'Assistant de Direction"}
              </Button>
            </div>
          </>
        )}

        {selectedAssignment && rows.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">Aucun étudiant inscrit dans cette classe.</div>
        )}

        {!selectedAssignment && (
          <div className="text-center py-16 text-muted-foreground">
            <ClipboardCheck className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>Sélectionnez un cours pour commencer la saisie des présences.</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
