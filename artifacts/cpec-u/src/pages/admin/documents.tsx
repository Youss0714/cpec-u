import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Download, RefreshCw, Users, CalendarDays,
  ClipboardList, BarChart3, BookOpen, Gavel, Wallet,
  GraduationCap, ChevronDown, ChevronRight,
} from "lucide-react";
import {
  downloadBulletinPdf,
  downloadListeEtudiantsPdf,
  downloadAttestationPdf,
  downloadFicheEtudiantPdf,
  downloadEmploiDuTempsPdf,
  downloadBilanAbsencesPdf,
  downloadPvJuryPdf,
  downloadHonorairesRecapPdf,
  downloadResultatsClassePdf,
} from "@/lib/pdf-engine/documents";

function getApiBase() {
  return (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
}

async function apiFetch<T>(path: string): Promise<T> {
  const r = await fetch(`${getApiBase()}${path}`, { credentials: "include" });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? "Erreur"); }
  return r.json();
}

type DocItem = {
  id: string;
  label: string;
  description?: string;
  badge?: string;
  action: () => Promise<void>;
};

type DocSection = {
  id: string;
  title: string;
  icon: React.ReactNode;
  color: string;
  docs: DocItem[];
};

function usePdfButton() {
  const { toast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);

  async function run(id: string, fn: () => Promise<void>) {
    setLoading(id);
    try {
      await fn();
    } catch (err: any) {
      toast({ title: "Erreur PDF", description: err.message, variant: "destructive" });
    } finally {
      setLoading(null);
    }
  }

  return { loading, run };
}

function DocCard({ section }: { section: DocSection }) {
  const [open, setOpen] = useState(true);
  const { loading, run } = usePdfButton();

  return (
    <Card className="overflow-hidden">
      <CardHeader
        className="pb-3 cursor-pointer select-none"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${section.color}`}>
              {section.icon}
            </div>
            <CardTitle className="text-base">{section.title}</CardTitle>
            <Badge variant="outline" className="text-xs font-normal">{section.docs.length} doc{section.docs.length > 1 ? "s" : ""}</Badge>
          </div>
          {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </div>
      </CardHeader>
      {open && (
        <CardContent className="pt-0 pb-3">
          <div className="space-y-2">
            {section.docs.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{doc.label}</div>
                  {doc.description && (
                    <div className="text-xs text-muted-foreground truncate mt-0.5">{doc.description}</div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {doc.badge && <Badge variant="secondary" className="text-xs">{doc.badge}</Badge>}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 gap-1.5 text-xs"
                    disabled={loading === doc.id}
                    onClick={() => run(doc.id, doc.action)}
                  >
                    {loading === doc.id
                      ? <RefreshCw className="w-3 h-3 animate-spin" />
                      : <Download className="w-3 h-3" />}
                    PDF
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function AdminDocuments() {
  const { data: classes } = useQuery<any[]>({
    queryKey: ["classes-list"],
    queryFn: () => apiFetch("/api/admin/classes"),
    retry: false,
  });

  const { data: semesters } = useQuery<any[]>({
    queryKey: ["semesters-list"],
    queryFn: () => apiFetch("/api/admin/semesters"),
    retry: false,
  });

  const { data: jurysessions } = useQuery<any[]>({
    queryKey: ["jury-sessions"],
    queryFn: () => apiFetch("/api/jury-special/sessions"),
    retry: false,
  });

  const latestSemester = semesters?.find((s) => s.published) ?? semesters?.[semesters.length - 1];
  const sections: DocSection[] = [
    {
      id: "resultats",
      title: "Résultats & Bulletins",
      icon: <BarChart3 className="w-4 h-4 text-white" />,
      color: "bg-blue-600",
      docs: [
        ...(classes?.slice(0, 3).map((c) => ({
          id: `resultats-${c.id}`,
          label: `Résultats — ${c.name}`,
          description: latestSemester?.name,
          badge: "Classe",
          action: async () => {
            if (!latestSemester) throw new Error("Aucun semestre disponible");
            await downloadResultatsClassePdf(latestSemester.id, latestSemester.name, c.id, c.name);
          },
        })) ?? []),
        ...(semesters?.slice(-2).map((s) => ({
          id: `resultats-sem-${s.id}`,
          label: `Résultats toutes classes — ${s.name}`,
          description: `Année ${s.academicYear}`,
          action: async () => {
            await downloadResultatsClassePdf(s.id, s.name);
          },
        })) ?? []),
      ],
    },
    {
      id: "etudiants",
      title: "Gestion des Étudiants",
      icon: <Users className="w-4 h-4 text-white" />,
      color: "bg-emerald-600",
      docs: [
        ...(classes?.slice(0, 4).map((c) => ({
          id: `liste-${c.id}`,
          label: `Liste — ${c.name}`,
          description: c.filiere ?? undefined,
          badge: "Classe",
          action: async () => {
            await downloadListeEtudiantsPdf(c.id, c.name, c.filiere);
          },
        })) ?? []),
      ],
    },
    {
      id: "emplois",
      title: "Emplois du Temps",
      icon: <CalendarDays className="w-4 h-4 text-white" />,
      color: "bg-violet-600",
      docs: [
        ...(classes?.slice(0, 4).map((c) => ({
          id: `edt-${c.id}`,
          label: `EDT — ${c.name}`,
          description: latestSemester?.name,
          badge: "Classe",
          action: async () => {
            await downloadEmploiDuTempsPdf({
              classId: c.id,
              className: c.name,
              semesterId: latestSemester?.id,
              semesterName: latestSemester?.name,
            });
          },
        })) ?? []),
      ],
    },
    {
      id: "absences",
      title: "Feuilles de Présence & Absences",
      icon: <ClipboardList className="w-4 h-4 text-white" />,
      color: "bg-orange-600",
      docs: [
        ...(semesters?.slice(-2).map((s) => ({
          id: `absences-${s.id}`,
          label: `Bilan absences — ${s.name}`,
          description: `Toutes classes`,
          action: async () => {
            await downloadBilanAbsencesPdf(s.id, s.name);
          },
        })) ?? []),
        ...(classes?.slice(0, 3).flatMap((c) =>
          semesters?.slice(-1).map((s) => ({
            id: `absences-${s.id}-${c.id}`,
            label: `Absences ${c.name} — ${s.name}`,
            badge: "Classe",
            action: async () => {
              await downloadBilanAbsencesPdf(s.id, s.name, c.id, c.name);
            },
          })) ?? []
        ) ?? []),
      ],
    },
    {
      id: "jury",
      title: "Jury Spécial",
      icon: <Gavel className="w-4 h-4 text-white" />,
      color: "bg-red-600",
      docs: [
        ...(jurysessions?.filter((s) => s.closedAt).slice(0, 3).map((s) => ({
          id: `pv-${s.id}`,
          label: `PV Jury — ${s.title}`,
          description: `Année ${s.academicYear}`,
          badge: "Officiel",
          action: async () => {
            await downloadPvJuryPdf(s.id);
          },
        })) ?? []),
      ],
    },
    {
      id: "honoraires",
      title: "Honoraires",
      icon: <Wallet className="w-4 h-4 text-white" />,
      color: "bg-yellow-600",
      docs: [
        {
          id: "honoraires-recap",
          label: "Récapitulatif honoraires",
          description: `Tous les enseignants — ${new Date().getFullYear()}`,
          action: async () => {
            await downloadHonorairesRecapPdf();
          },
        },
      ],
    },
  ].filter((s) => s.docs.length > 0);

  const totalDocs = sections.reduce((sum, s) => sum + s.docs.length, 0);

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Centre de Documents</h1>
            <p className="text-sm text-muted-foreground">
              Génération et téléchargement PDF — {totalDocs} documents disponibles
            </p>
          </div>
        </div>

        {/* Info banner */}
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="py-3 flex items-start gap-3">
            <BookOpen className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div className="text-sm">
              <span className="font-semibold text-primary">Service PDF centralisé</span>
              <span className="text-muted-foreground ml-1.5">
                Tous les documents sont générés directement dans votre navigateur avec un en-tête institutionnel, un pied de page et une référence unique. Les bulletins sont accessibles depuis la page Résultats, les fiches étudiants depuis le détail de chaque étudiant.
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Document grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {sections.map((section) => (
            <DocCard key={section.id} section={section} />
          ))}
        </div>

        {(!classes || classes.length === 0) && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              <GraduationCap className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Aucune classe configurée. Créez des classes pour accéder aux documents.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
