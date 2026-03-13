import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useListBlockedDates, useCreateBlockedDate, useDeleteBlockedDate } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, CalendarOff, Ban } from "lucide-react";

const QK = ["/api/admin/blocked-dates"];

const TYPE_LABELS: Record<string, string> = {
  vacances: "Vacances",
  ferie: "Jour Férié",
  autre: "Autre",
};

const TYPE_COLORS: Record<string, string> = {
  vacances: "bg-blue-100 text-blue-700 border-blue-200",
  ferie: "bg-red-100 text-red-700 border-red-200",
  autre: "bg-gray-100 text-gray-700 border-gray-200",
};

export default function BlockedDates() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: QK });

  const { data: dates = [], isLoading } = useListBlockedDates();
  const createDate = useCreateBlockedDate();
  const deleteDate = useDeleteBlockedDate();

  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({ date: "", reason: "", type: "vacances" as "vacances" | "ferie" | "autre" });
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.date || !form.reason) {
      toast({ title: "Remplissez tous les champs", variant: "destructive" });
      return;
    }
    try {
      await createDate.mutateAsync(form);
      toast({ title: "Date bloquée avec succès" });
      invalidate();
      setIsOpen(false);
      setForm({ date: "", reason: "", type: "vacances" });
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteDate.mutateAsync({ id });
      toast({ title: "Date supprimée" });
      invalidate();
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const grouped = dates.reduce((acc: Record<string, any[]>, d: any) => {
    const year = d.date.substring(0, 4);
    if (!acc[year]) acc[year] = [];
    acc[year].push(d);
    return acc;
  }, {});

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">Vacances & Jours Fériés</h1>
            <p className="text-muted-foreground">Bloquez des dates pour empêcher la planification de cours.</p>
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button className="shadow-md"><Ban className="w-4 h-4 mr-2" />Bloquer une date</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Bloquer une date</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={form.type} onValueChange={(v: any) => setForm({ ...form, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vacances">Vacances</SelectItem>
                      <SelectItem value="ferie">Jour Férié</SelectItem>
                      <SelectItem value="autre">Autre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Raison / Libellé</Label>
                  <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
                    placeholder="ex: Fête nationale, Vacances de Noël..." required />
                </div>
                <Button type="submit" className="w-full" disabled={createDate.isPending}>
                  {createDate.isPending ? "Enregistrement..." : "Bloquer la date"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground text-center py-8">Chargement...</p>
        ) : dates.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-12 text-center">
            <CalendarOff className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Aucune date bloquée. Ajoutez des congés ou jours fériés.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([year, items]) => (
              <div key={year} className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-secondary/40 px-5 py-3 border-b border-border">
                  <h2 className="font-semibold text-foreground">{year}</h2>
                </div>
                <div className="divide-y divide-border">
                  {(items as any[]).sort((a, b) => a.date.localeCompare(b.date)).map((d: any) => (
                    <div key={d.id} className="flex items-center justify-between px-5 py-4">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-xl bg-secondary flex flex-col items-center justify-center shrink-0">
                          <span className="text-xs text-muted-foreground font-medium uppercase">
                            {new Date(d.date).toLocaleDateString("fr-FR", { month: "short" })}
                          </span>
                          <span className="text-xl font-bold text-foreground leading-none">
                            {new Date(d.date).getDate().toString().padStart(2, "0")}
                          </span>
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">{d.reason}</p>
                          <p className="text-sm text-muted-foreground capitalize">{formatDate(d.date)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className={TYPE_COLORS[d.type]}>
                          {TYPE_LABELS[d.type]}
                        </Badge>
                        <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10"
                          onClick={() => setPendingDeleteId(d.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}
        onConfirm={() => handleDelete(pendingDeleteId!)}
        title="Supprimer la date bloquée"
        description="Cette période de vacances ou jour férié sera définitivement supprimée."
      />
    </AppLayout>
  );
}
