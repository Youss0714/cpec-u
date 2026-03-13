import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle2, XCircle, Clock, ClipboardList } from "lucide-react";

async function apiFetch(path: string) {
  const res = await fetch(`/api${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const STATUS_CONFIG = {
  present: { label: "Présent(e)", icon: CheckCircle2, cls: "bg-emerald-100 text-emerald-700" },
  absent: { label: "Absent(e)", icon: XCircle, cls: "bg-red-100 text-red-700" },
  late: { label: "Retard", icon: Clock, cls: "bg-amber-100 text-amber-700" },
} as const;

export default function AdminAttendance() {
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["/api/admin/attendance/sessions"],
    queryFn: () => apiFetch("/admin/attendance/sessions"),
  });

  const { data: sessionDetail, isLoading: isDetailLoading } = useQuery({
    queryKey: ["/api/admin/attendance/sessions", selectedSessionId],
    queryFn: () => apiFetch(`/admin/attendance/sessions/${selectedSessionId}`),
    enabled: selectedSessionId !== null,
  });

  const selectedSession = (sessions as any[]).find((s: any) => s.id === selectedSessionId);
  const absentCount = (sessionDetail?.records ?? []).filter((r: any) => r.status === "absent").length;
  const lateCount = (sessionDetail?.records ?? []).filter((r: any) => r.status === "late").length;
  const presentCount = (sessionDetail?.records ?? []).filter((r: any) => r.status === "present").length;

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2">
            <ClipboardList className="w-8 h-8 text-primary" />
            Feuilles de Présence
          </h1>
          <p className="text-muted-foreground">
            Feuilles transmises par les enseignants à la scolarité.
          </p>
        </div>

        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          <div className="overflow-y-auto max-h-[calc(100vh-260px)]">
            <Table>
              <TableHeader className="bg-secondary/50 sticky top-0 z-10">
                <TableRow>
                  <TableHead>Enseignant</TableHead>
                  <TableHead>Matière</TableHead>
                  <TableHead>Classe</TableHead>
                  <TableHead>Semestre</TableHead>
                  <TableHead>Date du cours</TableHead>
                  <TableHead>Transmis le</TableHead>
                  <TableHead className="text-right">Détail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Chargement…
                    </TableCell>
                  </TableRow>
                ) : (sessions as any[]).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <ClipboardList className="w-8 h-8 opacity-20" />
                        <span>Aucune feuille de présence reçue.</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  (sessions as any[]).map((s: any) => (
                    <TableRow key={s.id} className="hover:bg-muted/40 cursor-pointer" onClick={() => setSelectedSessionId(s.id)}>
                      <TableCell className="font-medium">{s.teacherName}</TableCell>
                      <TableCell>{s.subjectName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{s.className}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{s.semesterName}</TableCell>
                      <TableCell className="font-mono text-sm">{new Date(s.sessionDate).toLocaleDateString("fr-FR")}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {s.sentAt ? new Date(s.sentAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedSessionId(s.id); }}>
                          Voir
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {(sessions as any[]).length > 0 && (
            <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
              {(sessions as any[]).length} feuille{(sessions as any[]).length > 1 ? "s" : ""} reçue{(sessions as any[]).length > 1 ? "s" : ""}
            </div>
          )}
        </div>
      </div>

      {/* Session Detail Dialog */}
      <Dialog open={selectedSessionId !== null} onOpenChange={(o) => { if (!o) setSelectedSessionId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-primary" />
              Feuille de présence
            </DialogTitle>
          </DialogHeader>

          {isDetailLoading ? (
            <div className="py-8 text-center text-muted-foreground">Chargement…</div>
          ) : sessionDetail ? (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground">Enseignant</p>
                  <p className="font-semibold">{selectedSession?.teacherName ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Matière</p>
                  <p className="font-semibold">{selectedSession?.subjectName ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Classe</p>
                  <p className="font-semibold">{selectedSession?.className ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Date du cours</p>
                  <p className="font-semibold font-mono">
                    {selectedSession?.sessionDate
                      ? new Date(selectedSession.sessionDate).toLocaleDateString("fr-FR")
                      : "—"}
                  </p>
                </div>
              </div>

              {/* Stats */}
              <div className="flex gap-2 flex-wrap">
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
                  {presentCount} présent{presentCount > 1 ? "s" : ""}
                </span>
                {absentCount > 0 && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-700">
                    {absentCount} absent{absentCount > 1 ? "s" : ""}
                  </span>
                )}
                {lateCount > 0 && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
                    {lateCount} en retard
                  </span>
                )}
              </div>

              {/* Records */}
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="overflow-y-auto max-h-72">
                  {(sessionDetail.records ?? []).map((r: any) => {
                    const cfg = STATUS_CONFIG[r.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.present;
                    const Icon = cfg.icon;
                    return (
                      <div key={r.studentId} className="flex items-center justify-between px-4 py-2.5 border-b border-border last:border-0">
                        <span className="text-sm font-medium">{r.studentName}</span>
                        <div className="flex items-center gap-2">
                          {r.note && <span className="text-xs text-muted-foreground italic">{r.note}</span>}
                          <span className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.cls}`}>
                            <Icon className="w-3.5 h-3.5" />
                            {cfg.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
