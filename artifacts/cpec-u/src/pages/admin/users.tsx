import { useState } from "react";
import { AppLayout } from "@/components/layout";
import {
  useListUsers, useCreateUser, useDeleteUser, useListClasses, useGetCurrentUser,
  useGetScolariteStudents, useGetScolariteStats, useGetStudentPayments,
  useSetStudentFee, useAddPayment, useDeletePayment,
  useGetHonorairesTeachers, useGetHonorairesStats, useGetTeacherPayments,
  useSetTeacherHonorarium, useAddTeacherPayment, useDeleteTeacherPayment,
} from "@workspace/api-client-react";
import type { StudentFeeRow, StudentPayment, TeacherHonorariumRow, TeacherPayment } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, ShieldCheck, GraduationCap, BookOpen, Wallet, AlertCircle, CheckCircle2, Clock, PenLine, Pencil, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";

const ROLE_LABELS: Record<string, string> = { admin: "Admin", teacher: "Enseignant", student: "Étudiant" };
const SUB_ROLE_LABELS: Record<string, string> = {
  scolarite: "Assistant(e) de Direction",
  planificateur: "Responsable pédagogique",
  directeur: "Directeur du Centre",
  hebergement: "Responsable Hébergement",
};
const SUB_ROLE_COLORS: Record<string, string> = {
  scolarite: "bg-blue-100 text-blue-700 border-blue-200",
  planificateur: "bg-amber-100 text-amber-700 border-amber-200",
  directeur: "bg-violet-100 text-violet-700 border-violet-200",
  hebergement: "bg-teal-100 text-teal-700 border-teal-200",
};

type Tab = "teachers" | "students" | "scolarite" | "responsables" | "honoraires";

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <Card className={`p-4 flex flex-col gap-1 ${color ?? ""}`}>
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="text-2xl font-bold">{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </Card>
  );
}

function StatusBadge({ status }: { status: "paid" | "partial" | "unpaid" }) {
  if (status === "paid") return <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5"><CheckCircle2 className="w-3 h-3" /> Soldé</span>;
  if (status === "partial") return <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5"><Clock className="w-3 h-3" /> Partiel</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5"><AlertCircle className="w-3 h-3" /> Non payé</span>;
}

function StudentPaymentModal({ student, onClose }: { student: StudentFeeRow; onClose: () => void }) {
  const { data: payments = [], isLoading } = useGetStudentPayments(student.id);
  const setFee = useSetStudentFee();
  const addPaymentMut = useAddPayment();
  const deletePaymentMut = useDeletePayment();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [feeAmount, setFeeAmount] = useState(student.totalAmount > 0 ? student.totalAmount.toString() : "");
  const [academicYear, setAcademicYear] = useState(student.academicYear ?? "");
  const [payAmount, setPayAmount] = useState("");
  const [payDesc, setPayDesc] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["scolarite"] });

  const handleSetFee = async () => {
    const amount = parseFloat(feeAmount);
    if (isNaN(amount) || amount < 0) { toast({ title: "Montant invalide", variant: "destructive" }); return; }
    try {
      await setFee.mutateAsync({ studentId: student.id, totalAmount: amount, academicYear: academicYear || undefined });
      toast({ title: "Frais mis à jour" });
      invalidate();
    } catch { toast({ title: "Erreur", variant: "destructive" }); }
  };

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0) { toast({ title: "Montant invalide", variant: "destructive" }); return; }
    try {
      await addPaymentMut.mutateAsync({ studentId: student.id, amount, description: payDesc || undefined, paymentDate: payDate });
      toast({ title: `${amount.toLocaleString("fr-FR")} FCFA enregistré` });
      setPayAmount(""); setPayDesc("");
      invalidate();
    } catch { toast({ title: "Erreur", variant: "destructive" }); }
  };

  const handleDeletePayment = async (id: number) => {
    await deletePaymentMut.mutateAsync(id);
    toast({ title: "Paiement supprimé" });
    invalidate();
  };

  const totalPaid = payments.reduce((s: number, p: StudentPayment) => s + p.amount, 0);
  const totalFee = parseFloat(feeAmount) || 0;
  const remaining = Math.max(0, totalFee - totalPaid);
  const progress = totalFee > 0 ? Math.min(100, (totalPaid / totalFee) * 100) : 0;

  return (
    <div className="space-y-5">
      <div>
        <p className="font-bold text-lg leading-tight">{student.name}</p>
        <p className="text-sm text-muted-foreground">{student.email}{student.className ? ` · ${student.className}` : ""}</p>
      </div>

      {/* Progress */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-sm font-semibold">
          <span>Progression du paiement</span>
          <span>{progress.toFixed(0)}%</span>
        </div>
        <div className="h-3 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Payé : {totalPaid.toLocaleString("fr-FR")} FCFA</span>
          <span>Reste : {remaining.toLocaleString("fr-FR")} FCFA</span>
        </div>
      </div>

      {/* Set fee */}
      <div className="space-y-2 border rounded-xl p-4 bg-muted/20">
        <p className="text-xs font-bold uppercase text-muted-foreground tracking-wide">Frais de scolarité total</p>
        <div className="flex gap-2">
          <Input type="number" value={feeAmount} onChange={e => setFeeAmount(e.target.value)} placeholder="Ex: 300000" className="flex-1" />
          <Input value={academicYear} onChange={e => setAcademicYear(e.target.value)} placeholder="Année (2024-25)" className="w-32" />
          <Button size="sm" onClick={handleSetFee} disabled={setFee.isPending}>
            <PenLine className="w-4 h-4 mr-1" /> Définir
          </Button>
        </div>
      </div>

      {/* Add payment */}
      <form onSubmit={handleAddPayment} className="space-y-2 border rounded-xl p-4 bg-muted/20">
        <p className="text-xs font-bold uppercase text-muted-foreground tracking-wide">Enregistrer un paiement</p>
        <div className="grid grid-cols-2 gap-2">
          <Input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="Montant (FCFA)" required min="1" />
          <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} required />
        </div>
        <Input value={payDesc} onChange={e => setPayDesc(e.target.value)} placeholder="Description (ex: 1ère tranche)" />
        <Button type="submit" size="sm" disabled={addPaymentMut.isPending} className="w-full">
          <Plus className="w-4 h-4 mr-1" /> Enregistrer
        </Button>
      </form>

      {/* History */}
      <div>
        <p className="text-xs font-bold uppercase text-muted-foreground tracking-wide mb-2">Historique</p>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Chargement...</p>
        ) : payments.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Aucun paiement enregistré</p>
        ) : (
          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {[...payments].reverse().map((p: StudentPayment) => (
              <div key={p.id} className="flex items-center justify-between p-3 bg-card rounded-lg border">
                <div>
                  <p className="font-semibold text-sm">{p.amount.toLocaleString("fr-FR")} FCFA</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(p.paymentDate).toLocaleDateString("fr-FR")}
                    {p.description ? ` · ${p.description}` : ""}
                    {p.recordedByName ? ` · par ${p.recordedByName}` : ""}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="text-red-400 hover:text-red-600 h-8 w-8" onClick={() => handleDeletePayment(p.id)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ScolariteTab() {
  const { data: students = [], isLoading } = useGetScolariteStudents();
  const { data: stats } = useGetScolariteStats();
  const [selectedStudent, setSelectedStudent] = useState<StudentFeeRow | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = students.filter((s: StudentFeeRow) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.className ?? "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const fmt = (n: number) => n.toLocaleString("fr-FR");

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Frais totaux attendus"
          value={`${fmt(stats?.totalExpected ?? 0)} F`}
          sub={`${stats?.studentCount ?? 0} étudiants avec frais`}
        />
        <StatCard
          label="Total encaissé"
          value={`${fmt(stats?.totalPaid ?? 0)} F`}
          color="border-green-200"
        />
        <StatCard
          label="Reste à recouvrer"
          value={`${fmt(stats?.totalRemaining ?? 0)} F`}
          color="border-red-100"
        />
        <StatCard
          label="Taux de recouvrement"
          value={`${stats?.recoveryRate ?? 0} %`}
          sub={`${stats?.fullyPaid ?? 0} soldés · ${stats?.partial ?? 0} partiels · ${stats?.noPay ?? 0} non payés`}
          color={(stats?.recoveryRate ?? 0) >= 75 ? "border-green-200" : (stats?.recoveryRate ?? 0) >= 40 ? "border-amber-200" : "border-red-100"}
        />
      </div>

      {/* Global progress */}
      {(stats?.totalExpected ?? 0) > 0 && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="font-semibold">Recouvrement global</span>
            <span className="font-bold text-primary">{stats?.recoveryRate ?? 0}%</span>
          </div>
          <div className="h-4 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${stats?.recoveryRate ?? 0}%`,
                background: (stats?.recoveryRate ?? 0) >= 75 ? "#22c55e" : (stats?.recoveryRate ?? 0) >= 40 ? "#f59e0b" : "#ef4444",
              }}
            />
          </div>
        </div>
      )}

      {/* Search + table */}
      <Input
        placeholder="Rechercher un étudiant ou une classe..."
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
        className="max-w-sm"
      />

      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground">Chargement...</div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Étudiant</TableHead>
                <TableHead>Classe</TableHead>
                <TableHead className="text-right">Frais total</TableHead>
                <TableHead className="text-right">Payé</TableHead>
                <TableHead className="text-right">Reste</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Aucun étudiant trouvé</TableCell></TableRow>
              ) : filtered.map((s: StudentFeeRow) => (
                <TableRow key={s.id} className="hover:bg-muted/30">
                  <TableCell className="font-semibold">{s.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{s.className ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {s.totalAmount > 0 ? `${fmt(s.totalAmount)} F` : <span className="text-muted-foreground text-xs">Non défini</span>}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-green-700">
                    {s.totalPaid > 0 ? `${fmt(s.totalPaid)} F` : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-red-600">
                    {s.remaining > 0 ? `${fmt(s.remaining)} F` : "—"}
                  </TableCell>
                  <TableCell><StatusBadge status={s.status} /></TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => setSelectedStudent(s)}>
                      <Wallet className="w-3.5 h-3.5" /> Gérer
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!selectedStudent} onOpenChange={open => !open && setSelectedStudent(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Gestion de la scolarité</DialogTitle></DialogHeader>
          {selectedStudent && <StudentPaymentModal student={selectedStudent} onClose={() => setSelectedStudent(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Teacher Payment Modal ────────────────────────────────────────────────────
function TeacherPaymentModal({ teacher, onClose }: { teacher: TeacherHonorariumRow; onClose: () => void }) {
  const { data: payments = [], isLoading } = useGetTeacherPayments(teacher.id);
  const setHonorarium = useSetTeacherHonorarium();
  const addPaymentMut = useAddTeacherPayment();
  const deletePaymentMut = useDeleteTeacherPayment();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [feeAmount, setFeeAmount] = useState(teacher.totalAmount > 0 ? teacher.totalAmount.toString() : "");
  const [periodLabel, setPeriodLabel] = useState(teacher.periodLabel ?? "");
  const [payAmount, setPayAmount] = useState("");
  const [payDesc, setPayDesc] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["honoraires"] });

  const handleSetFee = async () => {
    const amount = parseFloat(feeAmount);
    if (isNaN(amount) || amount < 0) { toast({ title: "Montant invalide", variant: "destructive" }); return; }
    try {
      await setHonorarium.mutateAsync({ teacherId: teacher.id, totalAmount: amount, periodLabel: periodLabel || undefined });
      toast({ title: "Honoraires mis à jour" });
      invalidate();
    } catch { toast({ title: "Erreur", variant: "destructive" }); }
  };

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0) { toast({ title: "Montant invalide", variant: "destructive" }); return; }
    try {
      await addPaymentMut.mutateAsync({ teacherId: teacher.id, amount, description: payDesc || undefined, paymentDate: payDate });
      toast({ title: `${amount.toLocaleString("fr-FR")} FCFA versé` });
      setPayAmount(""); setPayDesc("");
      invalidate();
    } catch { toast({ title: "Erreur", variant: "destructive" }); }
  };

  const handleDeletePayment = async (id: number) => {
    await deletePaymentMut.mutateAsync(id);
    toast({ title: "Paiement supprimé" });
    invalidate();
  };

  const totalPaid = payments.reduce((s: number, p: TeacherPayment) => s + p.amount, 0);
  const totalFee = parseFloat(feeAmount) || 0;
  const remaining = Math.max(0, totalFee - totalPaid);
  const progress = totalFee > 0 ? Math.min(100, (totalPaid / totalFee) * 100) : 0;

  return (
    <div className="space-y-5">
      <div>
        <p className="font-bold text-lg leading-tight">{teacher.name}</p>
        <p className="text-sm text-muted-foreground">{teacher.email}</p>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-sm font-semibold">
          <span>Progression du versement</span>
          <span>{progress.toFixed(0)}%</span>
        </div>
        <div className="h-3 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Versé : {totalPaid.toLocaleString("fr-FR")} FCFA</span>
          <span>Reste : {remaining.toLocaleString("fr-FR")} FCFA</span>
        </div>
      </div>

      <div className="space-y-2 border rounded-xl p-4 bg-muted/20">
        <p className="text-xs font-bold uppercase text-muted-foreground tracking-wide">Honoraires totaux</p>
        <div className="flex gap-2">
          <Input type="number" value={feeAmount} onChange={e => setFeeAmount(e.target.value)} placeholder="Ex: 150000" className="flex-1" />
          <Input value={periodLabel} onChange={e => setPeriodLabel(e.target.value)} placeholder="Période (ex: S1 2024)" className="w-36" />
          <Button size="sm" onClick={handleSetFee} disabled={setHonorarium.isPending}>
            <PenLine className="w-4 h-4 mr-1" /> Définir
          </Button>
        </div>
      </div>

      <form onSubmit={handleAddPayment} className="space-y-2 border rounded-xl p-4 bg-muted/20">
        <p className="text-xs font-bold uppercase text-muted-foreground tracking-wide">Enregistrer un versement</p>
        <div className="grid grid-cols-2 gap-2">
          <Input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="Montant (FCFA)" required min="1" />
          <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} required />
        </div>
        <Input value={payDesc} onChange={e => setPayDesc(e.target.value)} placeholder="Description (ex: avance sur honoraires)" />
        <Button type="submit" size="sm" disabled={addPaymentMut.isPending} className="w-full">
          <Plus className="w-4 h-4 mr-1" /> Enregistrer
        </Button>
      </form>

      <div>
        <p className="text-xs font-bold uppercase text-muted-foreground tracking-wide mb-2">Historique</p>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Chargement...</p>
        ) : payments.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Aucun versement enregistré</p>
        ) : (
          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {[...payments].reverse().map((p: TeacherPayment) => (
              <div key={p.id} className="flex items-center justify-between p-3 bg-card rounded-lg border">
                <div>
                  <p className="font-semibold text-sm">{p.amount.toLocaleString("fr-FR")} FCFA</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(p.paymentDate).toLocaleDateString("fr-FR")}
                    {p.description ? ` · ${p.description}` : ""}
                    {p.recordedByName ? ` · par ${p.recordedByName}` : ""}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="text-red-400 hover:text-red-600 h-8 w-8" onClick={() => handleDeletePayment(p.id)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Honoraires Tab ───────────────────────────────────────────────────────────
function HonorairesTab() {
  const { data: teachers = [], isLoading } = useGetHonorairesTeachers();
  const { data: stats } = useGetHonorairesStats();
  const [selectedTeacher, setSelectedTeacher] = useState<TeacherHonorariumRow | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = teachers.filter((t: TeacherHonorariumRow) =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const fmt = (n: number) => n.toLocaleString("fr-FR");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Honoraires totaux dus" value={`${fmt(stats?.totalExpected ?? 0)} F`} sub={`${stats?.teacherCount ?? 0} enseignants enregistrés`} />
        <StatCard label="Total versé" value={`${fmt(stats?.totalPaid ?? 0)} F`} color="border-green-200" />
        <StatCard label="Reste à verser" value={`${fmt(stats?.totalRemaining ?? 0)} F`} color="border-red-100" />
        <StatCard
          label="Taux de versement"
          value={`${stats?.recoveryRate ?? 0} %`}
          sub={`${stats?.fullyPaid ?? 0} soldés · ${stats?.partial ?? 0} partiels · ${stats?.noPay ?? 0} non versés`}
          color={(stats?.recoveryRate ?? 0) >= 75 ? "border-green-200" : (stats?.recoveryRate ?? 0) >= 40 ? "border-amber-200" : "border-red-100"}
        />
      </div>

      {(stats?.totalExpected ?? 0) > 0 && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="font-semibold">Versement global</span>
            <span className="font-bold text-primary">{stats?.recoveryRate ?? 0}%</span>
          </div>
          <div className="h-4 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${stats?.recoveryRate ?? 0}%`,
                background: (stats?.recoveryRate ?? 0) >= 75 ? "#22c55e" : (stats?.recoveryRate ?? 0) >= 40 ? "#f59e0b" : "#ef4444",
              }}
            />
          </div>
        </div>
      )}

      <Input placeholder="Rechercher un enseignant..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="max-w-sm" />

      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground">Chargement...</div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Enseignant</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">Honoraires</TableHead>
                <TableHead className="text-right">Versé</TableHead>
                <TableHead className="text-right">Reste</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Aucun enseignant trouvé</TableCell></TableRow>
              ) : filtered.map((t: TeacherHonorariumRow) => (
                <TableRow key={t.id} className="hover:bg-muted/30">
                  <TableCell className="font-semibold">{t.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{t.email}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {t.totalAmount > 0 ? `${fmt(t.totalAmount)} F` : <span className="text-muted-foreground text-xs">Non défini</span>}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-green-700">
                    {t.totalPaid > 0 ? `${fmt(t.totalPaid)} F` : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-red-600">
                    {t.remaining > 0 ? `${fmt(t.remaining)} F` : "—"}
                  </TableCell>
                  <TableCell><StatusBadge status={t.status} /></TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => setSelectedTeacher(t)}>
                      <Wallet className="w-3.5 h-3.5" /> Gérer
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!selectedTeacher} onOpenChange={open => !open && setSelectedTeacher(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Gestion des honoraires</DialogTitle></DialogHeader>
          {selectedTeacher && <TeacherPaymentModal teacher={selectedTeacher} onClose={() => setSelectedTeacher(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdminUsers() {
  const [activeTab, setActiveTab] = useState<Tab>("teachers");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>("student");
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [editUser, setEditUser] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", password: "" });
  const [editSaving, setEditSaving] = useState(false);
  const { data: currentUser } = useGetCurrentUser();
  const currentSubRole = (currentUser as any)?.adminSubRole as string | null;
  const isDirecteur = currentSubRole === "directeur";
  const isPlanificateur = currentSubRole === "planificateur";
  const { data: users, isLoading } = useListUsers();
  const { data: classes } = useListClasses();
  const createUser = useCreateUser();
  const deleteUser = useDeleteUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const teachers = users?.filter((u: any) => u.role === "teacher") || [];
  const students = users?.filter((u: any) => u.role === "student") || [];
  const admins = users?.filter((u: any) => u.role === "admin") || [];

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const role = formData.get("role") as "admin" | "teacher" | "student";
    const classIdStr = formData.get("classId") as string;
    const adminSubRole = formData.get("adminSubRole") as string;
    try {
      await createUser.mutateAsync({
        data: {
          name: formData.get("name") as string,
          email: formData.get("email") as string,
          password: formData.get("password") as string,
          role,
          classId: role === "student" && classIdStr ? parseInt(classIdStr) : undefined,
          adminSubRole: role === "admin" ? adminSubRole : undefined,
        },
      });
      toast({ title: "Utilisateur créé avec succès" });
      setIsDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    } catch (e: any) {
      toast({ title: e?.message ?? "Erreur lors de la création", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    const target = users?.find((u: any) => u.id === id);
    const isScolarite = currentSubRole === "scolarite";
    if (isScolarite && target?.role !== "student") {
      toast({ title: "L'Assistant(e) de Direction peut uniquement supprimer des étudiants.", variant: "destructive" });
      setPendingDeleteId(null);
      return;
    }
    if (isPlanificateur && target?.role !== "teacher") {
      toast({ title: "Le Responsable pédagogique peut uniquement supprimer des enseignants.", variant: "destructive" });
      setPendingDeleteId(null);
      return;
    }
    try {
      await deleteUser.mutateAsync({ id });
      toast({ title: "Utilisateur supprimé" });
      queryClient.invalidateQueries({ queryKey: ["users"] });
    } catch { toast({ title: "Erreur lors de la suppression", variant: "destructive" }); }
    setPendingDeleteId(null);
  };

  const canDelete = (u: any) => {
    if (isDirecteur) return true;
    if (currentSubRole === "scolarite") return u.role === "student";
    if (isPlanificateur) return u.role === "teacher";
    return false;
  };

  const canEdit = (u: any) => {
    if (isDirecteur) return true;
    if (isPlanificateur) return u.role === "teacher";
    return false;
  };

  const openEdit = (u: any) => {
    setEditForm({ name: u.name, email: u.email, password: "" });
    setEditUser(u);
  };

  const handleEditSave = async () => {
    if (!editUser) return;
    setEditSaving(true);
    try {
      const body: any = { name: editForm.name.trim(), email: editForm.email.trim() };
      if (editForm.password.trim()) body.password = editForm.password;
      const res = await fetch(`/api/admin/users/${editUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast({ title: "Utilisateur modifié avec succès" });
      setEditUser(null);
    } catch {
      toast({ title: "Erreur lors de la modification", variant: "destructive" });
    } finally {
      setEditSaving(false);
    }
  };

  const isScolarite = currentSubRole === "scolarite";

  const tabs: { key: Tab; label: string; icon: any; count?: number }[] = [
    { key: "teachers", label: "Enseignants", icon: BookOpen, count: teachers.length },
    { key: "students", label: "Étudiants", icon: GraduationCap, count: students.length },
    ...(isDirecteur ? [{ key: "responsables" as Tab, label: "Responsables", icon: ShieldCheck, count: admins.length }] : []),
    ...(!isPlanificateur ? [{ key: "scolarite" as Tab, label: "Scolarité", icon: Wallet }] : []),
    ...(!isScolarite ? [{ key: "honoraires" as Tab, label: "Honoraires", icon: Wallet }] : []),
  ];

  const listToShow = activeTab === "teachers" ? teachers : activeTab === "responsables" ? admins : students;

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-6 max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold">Utilisateurs</h1>
            <p className="text-muted-foreground text-sm mt-1">Gérez les accès et les profils de l'établissement.</p>
          </div>
          {(isDirecteur || isPlanificateur || isScolarite) && (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2 shrink-0"><Plus className="w-4 h-4" /> Nouvel Utilisateur</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Créer un utilisateur</DialogTitle></DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4 pt-2">
                  <div className="space-y-1"><Label>Nom complet</Label><Input name="name" required /></div>
                  <div className="space-y-1"><Label>Email</Label><Input name="email" type="email" required /></div>
                  <div className="space-y-1"><Label>Mot de passe</Label><Input name="password" type="password" required minLength={6} /></div>
                  <div className="space-y-1">
                    <Label>Rôle</Label>
                    <Select name="role" defaultValue={isPlanificateur ? "teacher" : "student"} onValueChange={setSelectedRole}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {!isPlanificateur && <SelectItem value="student">Étudiant</SelectItem>}
                        {!isScolarite && <SelectItem value="teacher">Enseignant</SelectItem>}
                        {isDirecteur && <SelectItem value="admin">Admin</SelectItem>}
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedRole === "student" && (
                    <div className="space-y-1">
                      <Label>Classe</Label>
                      <Select name="classId">
                        <SelectTrigger><SelectValue placeholder="Choisir une classe..." /></SelectTrigger>
                        <SelectContent>{classes?.map((c: any) => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  )}
                  {selectedRole === "admin" && (
                    <div className="space-y-1">
                      <Label>Sous-rôle</Label>
                      <Select name="adminSubRole" required defaultValue="scolarite">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="scolarite">Assistant(e) de Direction</SelectItem>
                          <SelectItem value="planificateur">Responsable pédagogique</SelectItem>
                          <SelectItem value="directeur">Directeur du Centre</SelectItem>
                          <SelectItem value="hebergement">Responsable Hébergement</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <Button type="submit" className="w-full" disabled={createUser.isPending}>
                    {createUser.isPending ? "Création..." : "Créer l'utilisateur"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === tab.key ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {tab.count !== undefined && (
                <span className={`text-xs rounded-full px-1.5 py-0.5 font-bold ${
                  activeTab === tab.key ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20 text-muted-foreground"
                }`}>{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Scolarité tab */}
        {activeTab === "scolarite" && <ScolariteTab />}

        {/* Honoraires tab */}
        {activeTab === "honoraires" && <HonorairesTab />}

        {/* Teachers / Students / Responsables tab */}
        {(activeTab === "teachers" || activeTab === "students" || activeTab === "responsables") && (
          <div className="rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Nom</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead>Sous-rôle / Classe</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Chargement...</TableCell></TableRow>
                ) : listToShow.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Aucun utilisateur</TableCell></TableRow>
                ) : listToShow.map((u: any) => (
                  <TableRow key={u.id} className="hover:bg-muted/30">
                    <TableCell className="font-semibold">{u.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{u.email}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full border ${
                        u.role === "admin" ? "bg-red-100 text-red-700 border-red-200"
                        : u.role === "teacher" ? "bg-green-100 text-green-700 border-green-200"
                        : "bg-purple-100 text-purple-700 border-purple-200"
                      }`}>
                        {u.role === "admin" ? <ShieldCheck className="w-3 h-3" />
                          : u.role === "teacher" ? <BookOpen className="w-3 h-3" />
                          : <GraduationCap className="w-3 h-3" />}
                        {ROLE_LABELS[u.role]}
                      </span>
                    </TableCell>
                    <TableCell>
                      {u.adminSubRole
                        ? <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${SUB_ROLE_COLORS[u.adminSubRole] ?? ""}`}>{SUB_ROLE_LABELS[u.adminSubRole]}</span>
                        : u.className
                        ? <span className="text-sm text-muted-foreground">{u.className}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canEdit(u) && (
                          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" onClick={() => openEdit(u)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                        )}
                        {canDelete(u) && (
                          <Button variant="ghost" size="icon" className="text-red-400 hover:text-red-600" onClick={() => setPendingDeleteId(u.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Edit User Dialog */}
        <Dialog open={editUser !== null} onOpenChange={open => { if (!open) setEditUser(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Modifier l'utilisateur</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1">
                <Label>Nom complet</Label>
                <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Nouveau mot de passe <span className="text-muted-foreground text-xs">(laisser vide pour ne pas changer)</span></Label>
                <Input type="password" value={editForm.password} onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setEditUser(null)}>Annuler</Button>
              <Button onClick={handleEditSave} disabled={editSaving || !editForm.name.trim() || !editForm.email.trim()}>
                {editSaving ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={pendingDeleteId !== null}
          title="Supprimer l'utilisateur"
          description="Cette action est irréversible. Toutes les données liées seront supprimées."
          onConfirm={() => pendingDeleteId !== null && handleDelete(pendingDeleteId)}
          onCancel={() => setPendingDeleteId(null)}
        />
      </div>
    </AppLayout>
  );
}
