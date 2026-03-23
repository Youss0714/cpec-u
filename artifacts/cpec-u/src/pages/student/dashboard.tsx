import { AppLayout } from "@/components/layout";
import { useGetStudentProfile, useListSemesters, useGetStudentResults } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { useState, useRef } from "react";
import { motion } from "framer-motion";
import {
  GraduationCap, Award, Book, Building2, CalendarDays, Camera, Upload,
  CheckCircle2, XCircle, FileText, CalendarOff, MessageSquare, Bell, ArrowRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

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
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);

  const latestPublished = (semesters ?? [])
    .filter((s: any) => s.published)
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  const { data: latestResults } = useGetStudentResults(
    { semesterId: latestPublished?.id ?? 0 },
    { query: { enabled: !!latestPublished, retry: false } as any }
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Fichier invalide. Veuillez choisir une image.", variant: "destructive" });
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast({ title: "Image trop grande. Maximum 4 Mo.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPhotoPreview(ev.target?.result as string);
      setPhotoDialogOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const handlePhotoSave = async () => {
    if (!photoPreview) return;
    setPhotoUploading(true);
    try {
      const res = await fetch("/api/student/photo", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ photoUrl: photoPreview }),
      });
      if (!res.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: ["/api/student/me"] });
      toast({ title: "Photo de profil mise à jour" });
      setPhotoDialogOpen(false);
      setPhotoPreview(null);
    } catch {
      toast({ title: "Erreur lors de l'envoi de la photo", variant: "destructive" });
    } finally {
      setPhotoUploading(false);
    }
  };

  const quickLinks = [
    { label: "Mes Résultats", href: "/student/grades", icon: FileText, color: "text-primary", bg: "bg-primary/10" },
    { label: "Mon Emploi du Temps", href: "/student/schedule", icon: CalendarDays, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Mes Absences", href: "/student/absences", icon: CalendarOff, color: "text-red-600", bg: "bg-red-50" },
    { label: "Messages", href: "/student/messages", icon: MessageSquare, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Notifications", href: "/student/notifications", icon: Bell, color: "text-amber-600", bg: "bg-amber-50" },
  ];

  return (
    <AppLayout allowedRoles={["student"]}>
      <div className="space-y-6 max-w-5xl mx-auto">

        {/* Photo Upload Dialog */}
        <Dialog open={photoDialogOpen} onOpenChange={open => { setPhotoDialogOpen(open); if (!open) setPhotoPreview(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Confirmer la photo de profil</DialogTitle></DialogHeader>
            {photoPreview && (
              <div className="flex flex-col items-center gap-4">
                <img src={photoPreview} alt="Aperçu" className="w-40 h-40 rounded-full object-cover border-4 border-primary/20 shadow-lg" />
                <p className="text-sm text-muted-foreground text-center">Cette photo sera visible par l'administration.</p>
                <div className="flex gap-2 w-full">
                  <Button variant="outline" className="flex-1" onClick={() => { setPhotoDialogOpen(false); setPhotoPreview(null); }}>Annuler</Button>
                  <Button className="flex-1 gap-2" onClick={handlePhotoSave} disabled={photoUploading}>
                    {photoUploading ? "Envoi…" : <><Upload className="w-4 h-4" /> Valider</>}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

        {/* Profile Hero */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative bg-primary rounded-3xl p-8 text-primary-foreground overflow-hidden shadow-2xl shadow-primary/20">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 opacity-10">
            <GraduationCap className="w-64 h-64" />
          </div>
          <div className="relative z-10 flex items-center gap-6">
            <div className="relative flex-shrink-0 group">
              <div className="w-24 h-24 rounded-full border-4 border-white/20 overflow-hidden bg-white/10 flex items-center justify-center shadow-xl">
                {(profile as any)?.photoUrl ? (
                  <img src={(profile as any).photoUrl} alt="Photo de profil" className="w-full h-full object-cover" />
                ) : (
                  <GraduationCap className="w-12 h-12 text-white/60" />
                )}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                title="Modifier la photo"
              >
                <Camera className="w-6 h-6 text-white" />
              </button>
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl sm:text-4xl font-serif font-bold mb-1 truncate">Bonjour, {profile?.name}</h1>
              <p className="text-primary-foreground/80 text-lg flex items-center gap-2">
                <Book className="w-5 h-5 flex-shrink-0" />
                <span className="truncate">{(profile as any)?.className || "Classe non assignée"}</span>
              </p>
              {(profile as any)?.matricule && (
                <p className="text-primary-foreground/60 text-sm mt-1 font-mono">{(profile as any).matricule}</p>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mt-3 text-xs text-white/60 hover:text-white/90 underline underline-offset-2 transition-colors flex items-center gap-1"
              >
                <Camera className="w-3 h-3" />
                {(profile as any)?.photoUrl ? "Modifier ma photo" : "Ajouter une photo de profil"}
              </button>
            </div>
          </div>
        </motion.div>

        {/* Quick links */}
        <motion.div
          className="grid grid-cols-2 sm:grid-cols-5 gap-3"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
        >
          {quickLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <Card className="border-border shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 cursor-pointer group">
                <CardContent className="p-4 flex flex-col items-center gap-2 text-center">
                  <div className={`w-10 h-10 rounded-xl ${link.bg} flex items-center justify-center`}>
                    <link.icon className={`w-5 h-5 ${link.color}`} />
                  </div>
                  <span className="text-xs font-semibold text-foreground leading-tight">{link.label}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </motion.div>

        {/* Housing Card */}
        {housing && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
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

        {/* Latest results summary */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
          <Card className="border-border shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 bg-secondary/20">
                <div className="flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-foreground text-sm">
                    {latestPublished ? `Résultats — ${latestPublished.name}` : "Résultats"}
                  </span>
                </div>
                <Link href="/student/grades">
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary hover:text-primary">
                    Voir tout <ArrowRight className="w-3 h-3" />
                  </Button>
                </Link>
              </div>

              {!latestPublished ? (
                <div className="px-5 py-8 text-center">
                  <p className="text-sm text-muted-foreground">Aucun résultat publié pour le moment.</p>
                </div>
              ) : !latestResults ? (
                <div className="px-5 py-8 text-center">
                  <p className="text-sm text-muted-foreground">Résultats non disponibles pour ce semestre.</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 divide-x divide-border/60">
                  {/* Average */}
                  <div className="px-5 py-5 text-center">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Moyenne</p>
                    <p className={`text-3xl font-bold font-mono ${
                      (latestResults.average ?? 0) >= 10 ? "text-emerald-600" : "text-destructive"
                    }`}>
                      {latestResults.average?.toFixed(2) ?? "—"}
                    </p>
                    {(latestResults as any).absenceDeduction > 0 && (
                      <p className="text-xs text-red-500 mt-0.5">−{(latestResults as any).absenceDeduction.toFixed(2)} abs.</p>
                    )}
                  </div>
                  {/* Rank */}
                  <div className="px-5 py-5 text-center">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Classement</p>
                    <p className="text-3xl font-bold font-mono text-foreground">{latestResults.rank ?? "—"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">/ {latestResults.totalStudents}</p>
                  </div>
                  {/* Decision */}
                  <div className="px-5 py-5 text-center flex flex-col items-center justify-center gap-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Décision</p>
                    <Badge className={`text-sm font-bold px-3 py-1 ${
                      latestResults.decision === "Admis" ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                      latestResults.decision === "Ajourné" ? "bg-red-100 text-red-700 border-red-200" :
                      "bg-secondary text-muted-foreground"
                    } border`}>
                      {latestResults.decision === "Admis" && <Award className="w-3.5 h-3.5 mr-1" />}
                      {latestResults.decision ?? "En attente"}
                    </Badge>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

      </div>
    </AppLayout>
  );
}
