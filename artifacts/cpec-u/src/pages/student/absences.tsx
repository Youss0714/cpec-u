import { AppLayout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarOff, Clock, CheckCircle2, XCircle, AlertTriangle, BookOpen } from "lucide-react";

function useMyAttendance() {
  return useQuery({
    queryKey: ["/api/student/attendance/my"],
    queryFn: async () => {
      const res = await fetch("/api/student/attendance/my", { credentials: "include" });
      if (!res.ok) throw new Error("Erreur chargement absences");
      return res.json();
    },
  });
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  absent: { label: "Absent", color: "bg-red-100 text-red-700 border-red-200", icon: <XCircle className="w-3.5 h-3.5" /> },
  late:   { label: "Retard",  color: "bg-amber-100 text-amber-700 border-amber-200", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  present:{ label: "Présent", color: "bg-green-100 text-green-700 border-green-200", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
};

function calcHours(r: any): number {
  if (r.startTime && r.endTime) {
    const [sh, sm] = r.startTime.split(":").map(Number);
    const [eh, em] = r.endTime.split(":").map(Number);
    return Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60);
  }
  return 1;
}

export default function StudentAbsences() {
  const { data, isLoading } = useMyAttendance();
  const [filter, setFilter] = useState<"all" | "absent" | "late" | "present">("all");
  const [semesterFilter, setSemesterFilter] = useState<string>("all");

  const records: any[] = data?.records ?? [];
  const summary = data?.summary;

  const semesters = Array.from(new Map(records.map(r => [String(r.semesterId), r.semesterName])).entries());

  const filtered = records.filter(r =>
    (filter === "all" || r.status === filter) &&
    (semesterFilter === "all" || String(r.semesterId) === semesterFilter)
  );

  const statCards = [
    {
      label: "Heures d'absence",
      value: summary ? `${summary.totalAbsenceHours}h` : "—",
      sub: summary ? `${summary.totalAbsences} séance${summary.totalAbsences > 1 ? "s" : ""}` : "",
      icon: <CalendarOff className="w-5 h-5 text-red-500" />,
      bg: "bg-red-50",
      border: "border-red-100",
    },
    {
      label: "Absences justifiées",
      value: summary ? `${summary.justifiedHours}h` : "—",
      sub: "heures justifiées",
      icon: <CheckCircle2 className="w-5 h-5 text-green-500" />,
      bg: "bg-green-50",
      border: "border-green-100",
    },
    {
      label: "Absences non justifiées",
      value: summary ? `${summary.unjustifiedHours}h` : "—",
      sub: "heures non justifiées",
      icon: <XCircle className="w-5 h-5 text-red-500" />,
      bg: "bg-red-50",
      border: "border-red-100",
    },
    {
      label: "Retards",
      value: summary ? String(summary.totalLate) : "—",
      sub: "séances avec retard",
      icon: <AlertTriangle className="w-5 h-5 text-amber-500" />,
      bg: "bg-amber-50",
      border: "border-amber-100",
    },
  ];

  return (
    <AppLayout allowedRoles={["student"]}>
      <div className="space-y-6">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-bold font-serif text-foreground">Mes Absences</h1>
          <p className="text-muted-foreground text-sm mt-1">Historique de vos présences et absences par séance</p>
        </motion.div>

        {/* Summary cards */}
        <motion.div
          className="grid grid-cols-2 md:grid-cols-4 gap-3"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
        >
          {statCards.map((s, i) => (
            <Card key={i} className={`border ${s.border} shadow-sm`}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center flex-shrink-0`}>
                  {s.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground leading-tight">{s.label}</p>
                  <p className="text-xl font-bold text-foreground leading-tight">{s.value}</p>
                  {s.sub && <p className="text-xs text-muted-foreground truncate">{s.sub}</p>}
                </div>
              </CardContent>
            </Card>
          ))}
        </motion.div>

        {/* Filters */}
        <motion.div
          className="flex flex-wrap gap-3 items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
        >
          <Select value={semesterFilter} onValueChange={setSemesterFilter}>
            <SelectTrigger className="w-[200px] h-9 text-sm">
              <SelectValue placeholder="Tous les semestres" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les semestres</SelectItem>
              {semesters.map(([id, name]) => (
                <SelectItem key={id} value={id}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex gap-1.5">
            {([
              { key: "all", label: "Tout" },
              { key: "absent", label: "Absences" },
              { key: "late", label: "Retards" },
              { key: "present", label: "Présences" },
            ] as const).map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  filter === f.key
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-background border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <span className="text-xs text-muted-foreground ml-auto">{filtered.length} séance{filtered.length > 1 ? "s" : ""}</span>
        </motion.div>

        {/* Records table */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          {isLoading ? (
            <div className="text-center py-16 text-muted-foreground">Chargement…</div>
          ) : filtered.length === 0 ? (
            <Card className="border-border">
              <CardContent className="py-16 text-center">
                <CalendarOff className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="font-medium text-foreground">Aucune séance trouvée</p>
                <p className="text-sm text-muted-foreground mt-1">Aucune donnée pour ce filtre</p>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-2xl border border-border overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {["Date", "Matière", "Semestre", "Horaire", "Statut", "Justifié", "Remarque"].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r: any, i: number) => {
                    const cfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.present;
                    const hours = (r.status === "absent" || r.status === "late") ? calcHours(r) : null;
                    return (
                      <tr key={r.id} className={`border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors ${i % 2 === 0 ? "" : "bg-muted/5"}`}>
                        <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                          {new Date(r.sessionDate).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <BookOpen className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                            <span className="font-medium text-foreground">{r.subjectName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{r.semesterName}</td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {r.startTime && r.endTime ? (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />{r.startTime} – {r.endTime}
                              {hours !== null && <span className="ml-1 text-xs font-semibold text-red-600">({hours}h)</span>}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={`${cfg.color} border text-xs gap-1 flex items-center w-fit`}>
                            {cfg.icon}{cfg.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {r.status === "absent" ? (
                            r.justified
                              ? <span className="flex items-center gap-1 text-green-600 text-xs font-medium"><CheckCircle2 className="w-3.5 h-3.5" />Oui</span>
                              : <span className="flex items-center gap-1 text-red-500 text-xs font-medium"><XCircle className="w-3.5 h-3.5" />Non</span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs max-w-[180px] truncate">
                          {r.note ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      </div>
    </AppLayout>
  );
}
