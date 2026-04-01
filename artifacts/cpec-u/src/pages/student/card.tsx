import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  CreditCard, Download, RefreshCw, CheckCircle2, XCircle,
  Clock, QrCode, User, Calendar, GraduationCap,
} from "lucide-react";
import { downloadCardAsPdf } from "@/lib/download-card-pdf";

function getApiBase() {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}

export default function StudentCard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const { data: card, isLoading, error } = useQuery<any>({
    queryKey: ["/api/student/card"],
    queryFn: () =>
      fetch(`${getApiBase()}/api/student/card`, { credentials: "include" })
        .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d))),
    retry: false,
  });

  const hasNoCard = (error as any)?.error?.includes("Aucune carte") ||
    (error as any)?.includes?.("Aucune carte");

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const r = await fetch(`${getApiBase()}/api/student/card/generate`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) throw new Error((await r.json()).error);
      toast({ title: "Carte générée !", description: "Votre carte étudiante est prête." });
      qc.invalidateQueries({ queryKey: ["/api/student/card"] });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async () => {
    if (!card) return;
    setDownloading(true);
    try {
      await downloadCardAsPdf({
        studentName: card.studentName,
        matricule: card.matricule,
        className: card.className,
        filiere: card.filiere,
        academicYear: card.academicYear,
        photoUrl: card.photoUrl,
        dateNaissance: card.dateNaissance,
        issuedAt: card.issuedAt,
        expiresAt: card.expiresAt,
        isValid: card.isValid,
        isExpired: card.isExpired,
        verifyUrl: card.verifyUrl,
      });
    } catch (err: any) {
      toast({ title: "Erreur PDF", description: "Impossible de générer le PDF. Réessayez.", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const isExpired = card?.isExpired;
  const isValid = card?.isValid;
  const statusColor = !isValid ? "text-red-600" : isExpired ? "text-orange-500" : "text-emerald-600";
  const statusLabel = !isValid ? "Invalidée" : isExpired ? "Expirée" : "Valide";
  const StatusIcon = !isValid ? XCircle : isExpired ? Clock : CheckCircle2;

  return (
    <AppLayout allowedRoles={["student"]}>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Ma Carte Étudiante</h1>
            <p className="text-sm text-muted-foreground">Carte numérique officielle CPEC-Digital</p>
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <Card>
            <CardContent className="py-12 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </CardContent>
          </Card>
        )}

        {/* No card yet */}
        {!isLoading && (hasNoCard || (!card && !isLoading)) && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto">
                <CreditCard className="w-8 h-8 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Aucune carte pour cette année</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Générez votre carte étudiante numérique pour l'année académique en cours.
                </p>
              </div>
              <Button onClick={handleGenerate} disabled={generating} className="mx-auto">
                {generating ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <CreditCard className="w-4 h-4 mr-2" />
                )}
                Générer ma carte étudiante
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Card exists */}
        {card && (
          <>
            {/* Status + Actions */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <StatusIcon className={`w-5 h-5 ${statusColor}`} />
                <span className={`font-semibold ${statusColor}`}>{statusLabel}</span>
                <Badge variant="outline" className="text-xs">
                  {card.academicYear}
                </Badge>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generating}>
                  <RefreshCw className={`w-4 h-4 mr-1.5 ${generating ? "animate-spin" : ""}`} />
                  Régénérer
                </Button>
                <Button size="sm" onClick={handleDownload} disabled={downloading}>
                  {downloading
                    ? <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
                    : <Download className="w-4 h-4 mr-1.5" />}
                  {downloading ? "Génération…" : "Télécharger PDF"}
                </Button>
              </div>
            </div>

            {/* Card preview — Recto */}
            <div>
              <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase mb-2">Recto</p>
              <div className="rounded-2xl overflow-hidden shadow-2xl" style={{
                background: "linear-gradient(135deg, #0f2547 0%, #1a3a6b 45%, #1e4d9b 100%)",
                aspectRatio: "85.6 / 54",
                maxWidth: "480px",
                position: "relative",
              }}>
                {/* Watermark */}
                <div style={{
                  position: "absolute", right: "-16px", bottom: "-20px",
                  fontSize: "120px", fontWeight: 900, color: "rgba(255,255,255,0.03)",
                  pointerEvents: "none", lineHeight: 1, letterSpacing: "-4px",
                }}>CPEC</div>

                {/* Header */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-yellow-400/30">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-md bg-white/20 flex items-center justify-center">
                      <GraduationCap className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <div className="text-white font-bold text-sm tracking-wide">CPEC-Digital</div>
                      <div className="text-yellow-300/90 text-[9px] font-semibold tracking-wider">INP-HB BOUAKÉ</div>
                    </div>
                  </div>
                  <div className="border border-yellow-400/50 text-yellow-300/90 text-[9px] font-bold px-2 py-0.5 rounded tracking-widest">
                    CARTE ÉTUDIANTE
                  </div>
                </div>

                {/* Body */}
                <div className="flex px-4 py-2 gap-3 flex-1">
                  {/* Photo */}
                  <div className="shrink-0">
                    {card.photoUrl ? (
                      <img
                        src={card.photoUrl}
                        alt="Photo"
                        className="rounded-lg border-2 border-yellow-400/40 object-cover"
                        style={{ width: "56px", height: "68px" }}
                      />
                    ) : (
                      <div className="rounded-lg border-2 border-dashed border-yellow-400/30 bg-white/10 flex flex-col items-center justify-center"
                        style={{ width: "56px", height: "68px" }}>
                        <User className="w-5 h-5 text-white/40" />
                        <span className="text-[7px] text-white/30 text-center mt-0.5">Photo manquante</span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex flex-col gap-1 flex-1 pt-0.5">
                    <div className="text-white font-black uppercase text-sm leading-tight tracking-wide">
                      {card.studentName}
                    </div>
                    {card.matricule && (
                      <div>
                        <div className="text-yellow-300/70 text-[8px] font-bold uppercase tracking-wider">Matricule</div>
                        <div className="text-white/90 text-xs font-semibold">{card.matricule}</div>
                      </div>
                    )}
                    {card.className && (
                      <div>
                        <div className="text-yellow-300/70 text-[8px] font-bold uppercase tracking-wider">Classe</div>
                        <div className="text-white/90 text-xs font-semibold">{card.className}</div>
                      </div>
                    )}
                    {card.filiere && (
                      <div>
                        <div className="text-yellow-300/70 text-[8px] font-bold uppercase tracking-wider">Filière</div>
                        <div className="text-white/90 text-xs font-semibold">{card.filiere}</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-4 py-1.5 border-t border-yellow-400/20 bg-yellow-400/10 absolute bottom-0 left-0 right-0">
                  <div className="text-yellow-300/90 font-black text-xs tracking-widest">{card.academicYear}</div>
                  <QrCode className="w-5 h-5 text-white/40" />
                </div>
              </div>
            </div>

            {/* Verso summary */}
            <div>
              <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase mb-2">Verso</p>
              <Card className="border-2">
                <CardContent className="pt-4 pb-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-0.5">Date de naissance</div>
                      <div className="font-semibold">{card.dateNaissance || "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-0.5">Année académique</div>
                      <div className="font-semibold">{card.academicYear}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-0.5">Délivrée le</div>
                      <div className="font-semibold">
                        {card.issuedAt ? new Date(card.issuedAt).toLocaleDateString("fr-FR") : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-0.5">Expire le</div>
                      <div className={`font-semibold ${isExpired ? "text-red-500" : ""}`}>
                        {card.expiresAt ? new Date(card.expiresAt).toLocaleDateString("fr-FR") : "—"}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* QR Verification info */}
            <Card className="bg-muted/30 border-dashed">
              <CardContent className="py-4 flex items-start gap-3">
                <QrCode className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">QR Code de vérification</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Le QR code sur votre carte permet à toute personne de vérifier son authenticité
                    sur la page de vérification officielle CPEC-Digital. Téléchargez le PDF pour voir le QR code.
                  </p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
