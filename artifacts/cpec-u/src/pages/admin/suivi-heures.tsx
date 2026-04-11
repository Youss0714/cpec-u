import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Download, CheckCircle2, AlertTriangle, Clock, CircleDot } from "lucide-react";

async function apiFetch(path: string) {
  const res = await fetch(`/api${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function ProgressBar({ pct, planned }: { pct: number | null; planned: number }) {
  if (planned === 0) return <span className="text-xs text-muted-foreground italic">---</span>;
  const p = pct ?? 0;
  const color = p >= 100 ? "bg-emerald-500" : p >= 60 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, p)}%` }} />
      </div>
      <span className="text-xs font-mono text-muted-foreground w-9 text-right">{p}%</span>
    </div>
  );
}

function StatusBadge({ statut }: { statut: string }) {
  switch (statut) {
    case "A_JOUR":
      return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs"><CheckCircle2 className="w-3 h-3 mr-1" />A jour</Badge>;
    case "A_SURVEILLER":
      return <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs"><Clock className="w-3 h-3 mr-1" />A surveiller</Badge>;
    case "EN_RETARD":
      return <Badge className="bg-red-100 text-red-700 border-red-200 text-xs"><AlertTriangle className="w-3 h-3 mr-1" />En retard</Badge>;
    case "NON_DEMARRE":
    default:
      return <Badge variant="outline" className="text-xs text-muted-foreground"><CircleDot className="w-3 h-3 mr-1" />Non demarre</Badge>;
  }
}

export default function SuiviHeures() {
  const [semesterId, setSemesterId] = useState("");
  const [classId, setClassId] = useState("all");

  const { data: semesters = [] } = useQuery({
    queryKey: ["/api/admin/semesters"],
    queryFn: () => apiFetch("/admin/semesters"),
  });

  const { data: classes = [] } = useQuery({
    queryKey: ["/api/admin/classes"],
    queryFn: () => apiFetch("/admin/classes"),
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["/api/admin/suivi-heures", semesterId, classId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (semesterId) params.set("semesterId", semesterId);
      if (classId !== "all") params.set("classId", classId);
      return apiFetch(`/admin/suivi-heures?${params}`);
    },
    enabled: !!semesterId,
    refetchInterval: 30_000,
  });

  const data = rows as any[];

  const totalPlanned = data.reduce((s: number, r: any) => s + (r.plannedHours ?? 0), 0);
  const totalDone = data.reduce((s: number, r: any) => s + (r.heuresRealisees ?? 0), 0);
  const totalRemaining = Math.max(0, Math.round((totalPlanned - totalDone) * 10) / 10);
  const totalSessions = data.reduce((s: number, r: any) => s + (r.sessions ?? 0), 0);
  const globalPct = totalPlanned > 0 ? Math.round((totalDone / totalPlanned) * 100) : 0;

  const handleExportCSV = () => {
    if (!data.length) return;
    const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const header = ["Enseignant", "Matiere", "Classe", "Semestre", "Prevues", "Realisees", "Restantes", "Seances", "Avancement (%)", "Statut"];
    const statutLabels: Record<string, string> = { A_JOUR: "A jour", A_SURVEILLER: "A surveiller", EN_RETARD: "En retard", NON_DEMARRE: "Non demarre" };
    const csvData = data.map((r: any) => [
      r.teacherName,
      r.subjectName,
      r.className,
      r.semesterName,
      String(r.plannedHours ?? 0),
      String(r.heuresRealisees ?? 0),
      String(r.heuresRestantes ?? 0),
      String(r.sessions ?? 0),
      r.progressPct !== null ? String(r.progressPct) : "---",
      statutLabels[r.statut] ?? r.statut,
    ]);
    const bom = "\uFEFF";
    const csv = bom + [header, ...csvData].map(row => row.map(escape).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `suivi_heures.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2">
            <TrendingUp className="w-8 h-8 text-primary" />
            Suivi des Heures
          </h1>
          <p className="text-muted-foreground">
            Heures comptabilisees sur la base des feuilles de presence soumises par les enseignants.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="w-64 space-y-1.5">
            <label className="text-sm font-medium text-foreground">Semestre</label>
            <Select value={semesterId} onValueChange={setSemesterId}>
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Selectionner un semestre..." />
              </SelectTrigger>
              <SelectContent>
                {(semesters as any[]).map((s: any) => (
                  <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-52 space-y-1.5">
            <label className="text-sm font-medium text-foreground">Classe</label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Toutes les classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les classes</SelectItem>
                {(classes as any[]).map((c: any) => (
                  <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!semesterId && (
          <div className="text-center py-16 text-muted-foreground">
            <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>Selectionnez un semestre pour afficher le suivi.</p>
          </div>
        )}

        {semesterId && !isLoading && data.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>Aucune affectation trouvee pour les filtres selectionnes.</p>
          </div>
        )}

        {semesterId && data.length > 0 && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              {[
                { label: "Heures prevues", value: `${totalPlanned}h`, color: "text-foreground", icon: Clock },
                { label: "Heures realisees", value: `${totalDone}h`, color: "text-emerald-600", icon: CheckCircle2 },
                { label: "Heures restantes", value: `${totalRemaining}h`, color: "text-amber-600", icon: Clock },
                { label: "Seances tenues", value: totalSessions, color: "text-primary", icon: TrendingUp },
                { label: "Avancement global", value: `${globalPct}%`, color: globalPct >= 80 ? "text-emerald-600" : globalPct >= 50 ? "text-amber-600" : "text-red-600", icon: TrendingUp },
              ].map((s, i) => (
                <Card key={i} className="border-border shadow-sm">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">{s.label}</p>
                    <p className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-2">
                <Download className="w-4 h-4" />
                Exporter CSV
              </Button>
            </div>

            <Card className="border-border shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead>Enseignant</TableHead>
                      <TableHead>Matiere</TableHead>
                      <TableHead>Classe</TableHead>
                      <TableHead className="text-center">Prevues</TableHead>
                      <TableHead className="text-center">Realisees</TableHead>
                      <TableHead className="text-center">Restantes</TableHead>
                      <TableHead className="text-center">Seances</TableHead>
                      <TableHead>Avancement</TableHead>
                      <TableHead className="text-center">Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 9 }).map((__, j) => (
                            <TableCell key={j}>
                              <div className="h-4 bg-muted animate-pulse rounded" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : (
                      data.map((r: any) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.teacherName}</TableCell>
                          <TableCell className="text-sm">{r.subjectName}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{r.className}</TableCell>
                          <TableCell className="text-center font-mono text-sm">
                            {r.plannedHours > 0 ? `${r.plannedHours}h` : <span className="text-muted-foreground">---</span>}
                          </TableCell>
                          <TableCell className="text-center font-mono font-semibold">
                            <span className={r.heuresRealisees > 0 ? "text-emerald-600" : "text-muted-foreground"}>
                              {r.heuresRealisees > 0 ? `${r.heuresRealisees}h` : "0h"}
                            </span>
                          </TableCell>
                          <TableCell className="text-center font-mono text-sm text-amber-600">
                            {r.heuresRestantes > 0 ? `${r.heuresRestantes}h` : <span className="text-emerald-600">0h</span>}
                          </TableCell>
                          <TableCell className="text-center text-sm text-muted-foreground">
                            {r.sessions}/{r.totalSeances ?? "?"}
                          </TableCell>
                          <TableCell>
                            <ProgressBar pct={r.progressPct} planned={r.plannedHours} />
                          </TableCell>
                          <TableCell className="text-center">
                            <StatusBadge statut={r.statut} />
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
