import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputMontant } from "@/components/ui/input-montant";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { motion } from "framer-motion";
import {
  Wallet, TrendingUp, AlertCircle, CheckCircle, Users,
  Plus, Trash2, Pencil, ChevronRight, Download, RefreshCw,
} from "lucide-react";
import { downloadHonorairesRecapPdf, downloadFicheHonorairesPdf } from "@/lib/pdf-engine/documents";

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, { credentials: "include", ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function fmtFCFA(n: number) {
  return Number(n).toLocaleString("fr-FR") + " FCFA";
}

export default function HonorairesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: teachers = [], isLoading } = useQuery({
    queryKey: ["/api/honoraires/teachers"],
    queryFn: () => apiFetch("/honoraires/teachers"),
  });

  const { data: stats } = useQuery({
    queryKey: ["/api/honoraires/stats"],
    queryFn: () => apiFetch("/honoraires/stats"),
  });

  const [selectedTeacher, setSelectedTeacher] = useState<any | null>(null);

  const { data: payments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ["/api/honoraires/payments", selectedTeacher?.id],
    queryFn: () => apiFetch(`/honoraires/payments/${selectedTeacher!.id}`),
    enabled: !!selectedTeacher,
  });

  const [feeDialog, setFeeDialog] = useState<any | null>(null);
  const [feeForm, setFeeForm] = useState({ totalAmount: "", periodLabel: "", notes: "" });

  const [payDialog, setPayDialog] = useState<any | null>(null);
  const [payForm, setPayForm] = useState({ amount: "", description: "", paymentDate: "" });

  const [pendingDeletePayment, setPendingDeletePayment] = useState<number | null>(null);
  const [recapPdfLoading, setRecapPdfLoading] = useState(false);
  const [fichePdfLoading, setFichePdfLoading] = useState(false);

  const handleDownloadRecapPdf = async () => {
    setRecapPdfLoading(true);
    try {
      await downloadHonorairesRecapPdf();
    } catch (e: any) {
      toast({ title: "Erreur PDF", description: e.message, variant: "destructive" });
    } finally {
      setRecapPdfLoading(false);
    }
  };

  const handleDownloadFichePdf = async (teacher: any) => {
    setFichePdfLoading(true);
    try {
      await downloadFicheHonorairesPdf(teacher.id, teacher.name);
    } catch (e: any) {
      toast({ title: "Erreur PDF", description: e.message, variant: "destructive" });
    } finally {
      setFichePdfLoading(false);
    }
  };

  const setFeeMutation = useMutation({
    mutationFn: (data: any) => apiFetch(`/honoraires/fees/${feeDialog!.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      toast({ title: "Honoraires enregistrés" });
      qc.invalidateQueries({ queryKey: ["/api/honoraires/teachers"] });
      qc.invalidateQueries({ queryKey: ["/api/honoraires/stats"] });
      setFeeDialog(null);
    },
    onError: () => toast({ title: "Erreur lors de l'enregistrement", variant: "destructive" }),
  });

  const addPaymentMutation = useMutation({
    mutationFn: (data: any) => apiFetch("/honoraires/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      toast({ title: "Paiement enregistré" });
      qc.invalidateQueries({ queryKey: ["/api/honoraires/teachers"] });
      qc.invalidateQueries({ queryKey: ["/api/honoraires/stats"] });
      qc.invalidateQueries({ queryKey: ["/api/honoraires/payments", payDialog?.id] });
      if (selectedTeacher?.id === payDialog?.id) {
        qc.invalidateQueries({ queryKey: ["/api/honoraires/payments", selectedTeacher?.id] });
      }
      setPayDialog(null);
    },
    onError: () => toast({ title: "Erreur lors de l'enregistrement du paiement", variant: "destructive" }),
  });

  const deletePaymentMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/honoraires/payments/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Paiement supprimé" });
      qc.invalidateQueries({ queryKey: ["/api/honoraires/teachers"] });
      qc.invalidateQueries({ queryKey: ["/api/honoraires/stats"] });
      qc.invalidateQueries({ queryKey: ["/api/honoraires/payments", selectedTeacher?.id] });
      setPendingDeletePayment(null);
    },
    onError: () => toast({ title: "Erreur lors de la suppression", variant: "destructive" }),
  });

  const handleSetFee = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(feeForm.totalAmount);
    if (isNaN(amount) || amount < 0) {
      toast({ title: "Montant invalide", variant: "destructive" }); return;
    }
    setFeeMutation.mutate({ totalAmount: amount, periodLabel: feeForm.periodLabel || null, notes: feeForm.notes || null });
  };

  const handleAddPayment = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(payForm.amount);
    if (isNaN(amount) || amount <= 0 || !payForm.paymentDate) {
      toast({ title: "Montant et date sont requis", variant: "destructive" }); return;
    }
    addPaymentMutation.mutate({
      teacherId: payDialog!.id,
      amount,
      description: payForm.description || null,
      paymentDate: payForm.paymentDate,
    });
  };

  const statusConfig: Record<string, { label: string; color: string }> = {
    paid: { label: "Réglé", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    partial: { label: "Partiel", color: "bg-amber-100 text-amber-700 border-amber-200" },
    unpaid: { label: "Non réglé", color: "bg-red-100 text-red-700 border-red-200" },
  };

  const s = stats as any;

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">Gestion des Honoraires</h1>
            <p className="text-muted-foreground mt-1">Suivez les rémunérations des enseignants et les paiements effectués.</p>
          </div>
          <Button variant="outline" size="sm" className="gap-2 shrink-0 mt-1" disabled={recapPdfLoading} onClick={handleDownloadRecapPdf}>
            {recapPdfLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Récapitulatif PDF
          </Button>
        </div>

        {/* Stats cards */}
        {s && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            <div className="bg-card border border-border rounded-2xl p-5 space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Total attendu</p>
              <p className="text-2xl font-bold text-foreground">{fmtFCFA(s.totalExpected ?? 0)}</p>
              <p className="text-xs text-muted-foreground">{s.teacherCount} enseignant{s.teacherCount > 1 ? "s" : ""} configuré{s.teacherCount > 1 ? "s" : ""}</p>
            </div>
            <div className="bg-card border border-emerald-200 rounded-2xl p-5 space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Total réglé</p>
              <p className="text-2xl font-bold text-emerald-600">{fmtFCFA(s.totalPaid ?? 0)}</p>
              <p className="text-xs text-muted-foreground">{s.fullyPaid ?? 0} enseignant{(s.fullyPaid ?? 0) > 1 ? "s" : ""} soldé{(s.fullyPaid ?? 0) > 1 ? "s" : ""}</p>
            </div>
            <div className="bg-card border border-red-200 rounded-2xl p-5 space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Reste à payer</p>
              <p className="text-2xl font-bold text-red-600">{fmtFCFA(s.totalRemaining ?? 0)}</p>
              <p className="text-xs text-muted-foreground">{(s.partial ?? 0) + (s.noPay ?? 0)} dossier{((s.partial ?? 0) + (s.noPay ?? 0)) > 1 ? "s" : ""} en attente</p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Taux de recouvrement</p>
                <span className={`text-lg font-bold ${(s.recoveryRate ?? 0) >= 75 ? "text-emerald-600" : (s.recoveryRate ?? 0) >= 40 ? "text-amber-600" : "text-red-600"}`}>
                  {s.recoveryRate ?? 0}%
                </span>
              </div>
              <Progress
                value={s.recoveryRate ?? 0}
                className="h-2"
              />
            </div>
          </motion.div>
        )}

        {/* Teachers table */}
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Enseignants
            </h2>
          </div>
          <div className="overflow-y-auto max-h-[calc(100vh-280px)]">
          <Table>
            <TableHeader className="bg-secondary/50 sticky top-0 z-10">
              <TableRow>
                <TableHead>Enseignant</TableHead>
                <TableHead className="text-right">Honoraires définis</TableHead>
                <TableHead className="text-right">Montant réglé</TableHead>
                <TableHead className="text-right">Reste</TableHead>
                <TableHead className="text-center">Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Chargement...</TableCell></TableRow>
              ) : (teachers as any[]).length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Aucun enseignant.</TableCell></TableRow>
              ) : (
                (teachers as any[]).map((t: any) => {
                  const cfg = statusConfig[t.status] ?? statusConfig.unpaid;
                  const pct = t.totalAmount > 0 ? Math.min(100, Math.round((t.totalPaid / t.totalAmount) * 100)) : 0;
                  return (
                    <TableRow key={t.id} className="hover:bg-muted/30">
                      <TableCell>
                        <div>
                          <p className="font-semibold text-foreground">{t.name}</p>
                          <p className="text-xs text-muted-foreground">{t.email}</p>
                          {t.periodLabel && <p className="text-xs text-muted-foreground">{t.periodLabel}</p>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {t.totalAmount > 0 ? fmtFCFA(t.totalAmount) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono text-emerald-600">
                        {t.totalPaid > 0 ? fmtFCFA(t.totalPaid) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {t.remaining > 0 ? (
                          <span className="text-red-600">{fmtFCFA(t.remaining)}</span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={`${cfg.color} border text-xs`}>{cfg.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost" size="sm"
                            className="text-muted-foreground hover:text-foreground gap-1.5"
                            onClick={() => {
                              setFeeDialog(t);
                              setFeeForm({
                                totalAmount: t.totalAmount > 0 ? String(t.totalAmount) : "",
                                periodLabel: t.periodLabel ?? "",
                                notes: t.notes ?? "",
                              });
                            }}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Définir
                          </Button>
                          <Button
                            variant="ghost" size="sm"
                            className="text-primary hover:text-primary/80 gap-1.5"
                            onClick={() => {
                              setSelectedTeacher(t);
                              setPayDialog(null);
                            }}
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                            Paiements
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          </div>
        </div>

        {/* Payment history panel */}
        {selectedTeacher && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/30">
                <div>
                  <h2 className="font-semibold text-foreground">Historique des paiements</h2>
                  <p className="text-sm text-muted-foreground">{selectedTeacher.name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={fichePdfLoading}
                    onClick={() => handleDownloadFichePdf(selectedTeacher)}
                  >
                    {fichePdfLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    Fiche PDF
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      setPayDialog(selectedTeacher);
                      setPayForm({ amount: "", description: "", paymentDate: new Date().toISOString().slice(0, 10) });
                    }}
                  >
                    <Plus className="w-4 h-4" />
                    Ajouter un paiement
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedTeacher(null)}>Fermer</Button>
                </div>
              </div>
              <Table>
                <TableHeader className="bg-secondary/50">
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead>Enregistré par</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentsLoading ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Chargement...</TableCell></TableRow>
                  ) : (payments as any[]).length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Aucun paiement enregistré.</TableCell></TableRow>
                  ) : (
                    (payments as any[]).map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(p.paymentDate).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                        </TableCell>
                        <TableCell>{p.description || <span className="text-muted-foreground italic">—</span>}</TableCell>
                        <TableCell className="text-right font-mono font-semibold text-emerald-600">{fmtFCFA(p.amount)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{p.recordedByName ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost" size="icon"
                            className="text-destructive hover:bg-destructive/10 w-7 h-7"
                            onClick={() => setPendingDeletePayment(p.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </motion.div>
        )}

        {/* Set fee dialog */}
        <Dialog open={!!feeDialog} onOpenChange={open => { if (!open) setFeeDialog(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Définir les honoraires — {feeDialog?.name}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSetFee} className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label>Montant total (FCFA) <span className="text-destructive">*</span></Label>
                <InputMontant
                  value={feeForm.totalAmount}
                  onChange={raw => setFeeForm(f => ({ ...f, totalAmount: raw }))}
                  placeholder="Ex: 250 000"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Période (optionnel)</Label>
                <Input
                  value={feeForm.periodLabel}
                  onChange={e => setFeeForm(f => ({ ...f, periodLabel: e.target.value }))}
                  placeholder="Ex: Semestre 1 — 2024/2025"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Notes (optionnel)</Label>
                <Input
                  value={feeForm.notes}
                  onChange={e => setFeeForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Remarques..."
                />
              </div>
              <Button type="submit" className="w-full" disabled={setFeeMutation.isPending}>
                {setFeeMutation.isPending ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Add payment dialog */}
        <Dialog open={!!payDialog} onOpenChange={open => { if (!open) setPayDialog(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Ajouter un paiement — {payDialog?.name}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddPayment} className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label>Montant (FCFA) <span className="text-destructive">*</span></Label>
                <InputMontant
                  value={payForm.amount}
                  onChange={raw => setPayForm(f => ({ ...f, amount: raw }))}
                  placeholder="Ex: 100 000"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Date de paiement <span className="text-destructive">*</span></Label>
                <Input
                  type="date"
                  value={payForm.paymentDate}
                  onChange={e => setPayForm(f => ({ ...f, paymentDate: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Description (optionnel)</Label>
                <Input
                  value={payForm.description}
                  onChange={e => setPayForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Ex: Acompte, Solde final..."
                />
              </div>
              <Button type="submit" className="w-full" disabled={addPaymentMutation.isPending}>
                {addPaymentMutation.isPending ? "Enregistrement..." : "Enregistrer le paiement"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={pendingDeletePayment !== null}
          onOpenChange={open => { if (!open) setPendingDeletePayment(null); }}
          onConfirm={() => deletePaymentMutation.mutate(pendingDeletePayment!)}
          title="Supprimer ce paiement"
          description="Ce paiement sera définitivement supprimé et les honoraires recalculés."
        />
      </div>
    </AppLayout>
  );
}
