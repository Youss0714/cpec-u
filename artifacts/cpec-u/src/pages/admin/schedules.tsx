import { useState, useMemo, useRef, useEffect } from "react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  useListScheduleEntries, useCreateScheduleEntry, useDeleteScheduleEntry,
  useListRooms, useListClasses, useListSemesters, useListSubjects, useListUsers,
  usePublishSchedule, useUpdateScheduleEntry,
  usePublishSchedulePeriod, useListSchedulePublications,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus, Trash2, CalendarDays, Clock, MapPin, AlertTriangle, CheckCircle,
  Printer, Eye, EyeOff, Pencil, ChevronLeft, ChevronRight, Send, ChevronDown,
} from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";

const DAYS = ["", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const DAY_COLORS = [
  "",
  "bg-blue-50 border-blue-200",
  "bg-green-50 border-green-200",
  "bg-yellow-50 border-yellow-200",
  "bg-purple-50 border-purple-200",
  "bg-pink-50 border-pink-200",
  "bg-orange-50 border-orange-200",
];

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function todayISO(): string {
  return toISODate(new Date());
}

const emptyForm = {
  teacherId: "", subjectId: "", classId: "", roomId: "", semesterId: "",
  sessionDate: todayISO(), startTime: "08:00", endTime: "10:00", notes: "", teamsLink: "",
};

function timesToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function detectConflicts(entries: any[]) {
  const teacherConflicts = new Set<number>();
  const roomConflicts = new Set<number>();
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i], b = entries[j];
      if (a.sessionDate !== b.sessionDate) continue;
      const aStart = timesToMinutes(a.startTime), aEnd = timesToMinutes(a.endTime);
      const bStart = timesToMinutes(b.startTime), bEnd = timesToMinutes(b.endTime);
      if (aStart >= bEnd || bStart >= aEnd) continue;
      if (a.teacherId === b.teacherId) { teacherConflicts.add(a.id); teacherConflicts.add(b.id); }
      if (a.roomId === b.roomId) { roomConflicts.add(a.id); roomConflicts.add(b.id); }
    }
  }
  return { teacherConflicts, roomConflicts };
}

function isDateInPast(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dateStr) < today;
}

function getMondayOfCurrentWeek(): Date {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function formatPeriodLabel(start: Date, numWeeks: number): string {
  const end = addDays(start, numWeeks * 7 - 1);
  return `${formatShortDate(start)} – ${formatShortDate(end)}`;
}

type ViewMode = "1week" | "2weeks" | "1month";

export default function AdminSchedules() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/admin/schedules"] });

  const { data: entries = [], isLoading } = useListScheduleEntries({});
  const { data: rooms = [] } = useListRooms();
  const { data: classes = [] } = useListClasses();
  const { data: semesters = [] } = useListSemesters();
  const { data: subjects = [] } = useListSubjects();
  const { data: allUsers = [] } = useListUsers();
  const teachers = (allUsers as any[]).filter((u) => u.role === "teacher");

  const createEntry = useCreateScheduleEntry();
  const deleteEntry = useDeleteScheduleEntry();
  const updateEntry = useUpdateScheduleEntry();
  const publishSchedule = usePublishSchedule();
  const publishPeriod = usePublishSchedulePeriod();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any>(null);
  const [filterSemester, setFilterSemester] = useState<string>("all");
  const [filterClass, setFilterClass] = useState<string>("all");
  const [form, setForm] = useState(emptyForm);
  const [viewMode, setViewMode] = useState<ViewMode>("1week");
  const [startDate, setStartDate] = useState<Date>(getMondayOfCurrentWeek);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const pubParams = useMemo(() => ({
    classId: filterClass !== "all" ? parseInt(filterClass) : undefined,
    semesterId: filterSemester !== "all" ? parseInt(filterSemester) : undefined,
  }), [filterClass, filterSemester]);

  const { data: publications = [], refetch: refetchPubs } = useListSchedulePublications(
    pubParams,
    { enabled: filterClass !== "all" && filterSemester !== "all" } as any
  );

  const activePub = useMemo(() => {
    const now = new Date();
    return (publications as any[]).find((p: any) => {
      return new Date(p.publishedFrom) <= now && new Date(p.publishedUntil) >= now;
    }) ?? null;
  }, [publications]);

  const numWeeks = viewMode === "1week" ? 1 : viewMode === "2weeks" ? 2 : 4;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, [startDate, viewMode]);

  const weeks = useMemo(() =>
    Array.from({ length: numWeeks }, (_, i) => addDays(startDate, i * 7)),
    [startDate, numWeeks]
  );

  const navigate = (dir: 1 | -1) => {
    setStartDate((prev) => addDays(prev, dir * numWeeks * 7));
  };

  const goToCurrentWeek = () => setStartDate(getMondayOfCurrentWeek());

  const filteredEntries = useMemo(() => (entries as any[]).filter((e) => {
    if (filterSemester !== "all" && e.semesterId !== parseInt(filterSemester)) return false;
    if (filterClass !== "all" && e.classId !== parseInt(filterClass)) return false;
    return true;
  }), [entries, filterSemester, filterClass]);

  const { teacherConflicts, roomConflicts } = useMemo(() => detectConflicts(filteredEntries), [filteredEntries]);
  const conflictIds = useMemo(() => new Set([...teacherConflicts, ...roomConflicts]), [teacherConflicts, roomConflicts]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDateInPast(form.sessionDate)) {
      toast({
        title: "Date déjà écoulée",
        description: "Il est impossible de programmer un cours à une date passée.",
        variant: "destructive",
      });
      return;
    }
    try {
      await createEntry.mutateAsync({
        data: {
          teacherId: parseInt(form.teacherId),
          subjectId: parseInt(form.subjectId),
          classId: parseInt(form.classId),
          roomId: parseInt(form.roomId),
          semesterId: parseInt(form.semesterId),
          sessionDate: form.sessionDate,
          startTime: form.startTime,
          endTime: form.endTime,
          teamsLink: form.teamsLink || null,
        },
      });
      toast({ title: "Créneau créé" });
      invalidate();
      setIsCreateOpen(false);
      setForm(emptyForm);
    } catch {
      toast({ title: "Erreur lors de la création", variant: "destructive" });
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry) return;
    try {
      await updateEntry.mutateAsync({
        entryId: editingEntry.id,
        data: {
          teacherId: parseInt(form.teacherId),
          subjectId: parseInt(form.subjectId),
          classId: parseInt(form.classId),
          roomId: parseInt(form.roomId),
          sessionDate: form.sessionDate,
          startTime: form.startTime,
          endTime: form.endTime,
          notes: form.notes || null,
          teamsLink: form.teamsLink || null,
        },
      });
      toast({ title: "Créneau mis à jour" });
      invalidate();
      setEditingEntry(null);
      setForm(emptyForm);
    } catch {
      toast({ title: "Erreur lors de la mise à jour", variant: "destructive" });
    }
  };

  const openEdit = (entry: any) => {
    setEditingEntry(entry);
    setForm({
      teacherId: String(entry.teacherId),
      subjectId: String(entry.subjectId),
      classId: String(entry.classId),
      roomId: String(entry.roomId),
      semesterId: String(entry.semesterId),
      sessionDate: entry.sessionDate,
      startTime: entry.startTime,
      endTime: entry.endTime,
      notes: entry.notes ?? "",
      teamsLink: entry.teamsLink ?? "",
    });
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteEntry.mutateAsync({ entryId: id });
      toast({ title: "Créneau supprimé" });
      invalidate();
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  const handlePublish = async (published: boolean) => {
    if (filterSemester === "all") {
      toast({ title: "Sélectionnez un semestre d'abord", variant: "destructive" });
      return;
    }
    try {
      await publishSchedule.mutateAsync({ semesterId: parseInt(filterSemester), published });
      toast({ title: published ? "Emploi du temps publié !" : "Emploi du temps mis en brouillon" });
      invalidate();
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  const handlePublishPeriod = async (period: "today" | "1week" | "2weeks" | "1month") => {
    if (filterClass === "all" || filterSemester === "all") {
      toast({ title: "Sélectionnez une classe et un semestre d'abord", variant: "destructive" });
      return;
    }
    const periodLabels: Record<string, string> = {
      today: "aujourd'hui",
      "1week": "1 semaine",
      "2weeks": "2 semaines",
      "1month": "1 mois",
    };
    try {
      await publishPeriod.mutateAsync({
        classId: parseInt(filterClass),
        semesterId: parseInt(filterSemester),
        period,
      });
      toast({ title: `Emploi du temps publié pour ${periodLabels[period]} !` });
      await refetchPubs();
      invalidate();
    } catch {
      toast({ title: "Erreur lors de la publication", variant: "destructive" });
    }
  };

  const isCreatingInPastWeek = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekEnd = addDays(startDate, numWeeks * 7 - 1);
    return weekEnd < today;
  }, [startDate, numWeeks]);

  const entryFormJSX = (onSubmit: (e: React.FormEvent) => void, isPending: boolean, hideMonth?: boolean) => (
    <form onSubmit={onSubmit} className="space-y-3 mt-4">
      {!hideMonth && isCreatingInPastWeek && (
        <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-sm text-destructive">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Vous consultez une période passée. Il est impossible de programmer un cours sur des dates déjà écoulées.</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Enseignant</Label>
          <Select value={form.teacherId} onValueChange={(v) => setForm(f => ({ ...f, teacherId: v }))}>
            <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
            <SelectContent>{teachers.map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Matière</Label>
          <Select value={form.subjectId} onValueChange={(v) => setForm(f => ({ ...f, subjectId: v }))}>
            <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
            <SelectContent>{subjects.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Classe</Label>
          <Select value={form.classId} onValueChange={(v) => setForm(f => ({ ...f, classId: v }))}>
            <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
            <SelectContent>{classes.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Salle</Label>
          <Select value={form.roomId} onValueChange={(v) => setForm(f => ({ ...f, roomId: v }))}>
            <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
            <SelectContent>{rooms.map((r: any) => <SelectItem key={r.id} value={String(r.id)}>{r.name} ({r.capacity}p)</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {!hideMonth && (
          <div className="space-y-1">
            <Label>Semestre</Label>
            <Select value={form.semesterId} onValueChange={(v) => setForm(f => ({ ...f, semesterId: v }))}>
              <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
              <SelectContent>{semesters.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1">
          <Label>Date du cours</Label>
          <Input
            type="date"
            value={form.sessionDate}
            onChange={(e) => setForm(f => ({ ...f, sessionDate: e.target.value }))}
            min={todayISO()}
          />
        </div>
        <div className="space-y-1">
          <Label>Début</Label>
          <Input type="time" value={form.startTime} onChange={(e) => setForm(f => ({ ...f, startTime: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label>Fin</Label>
          <Input type="time" value={form.endTime} onChange={(e) => setForm(f => ({ ...f, endTime: e.target.value }))} />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Notes <span className="text-muted-foreground text-xs">(optionnel)</span></Label>
        <Input value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Remarques..." />
      </div>
      <div className="space-y-1">
        <Label className="flex items-center gap-1.5">
          <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-[#4B53BC] shrink-0">
            <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 fill-white"><path d="M20.625 3H3.375A.375.375 0 0 0 3 3.375v17.25c0 .207.168.375.375.375h17.25A.375.375 0 0 0 21 20.625V3.375A.375.375 0 0 0 20.625 3zm-7.97 11.914a.375.375 0 0 1-.375.375H9.72a.375.375 0 0 1-.375-.375V8.086c0-.207.168-.375.375-.375h2.56c.207 0 .375.168.375.375v6.828z"/></svg>
          </span>
          Lien réunion Teams
          <span className="text-muted-foreground text-xs font-normal">(optionnel)</span>
        </Label>
        <Input
          value={form.teamsLink}
          onChange={(e) => setForm(f => ({ ...f, teamsLink: e.target.value }))}
          placeholder="https://teams.microsoft.com/l/meetup-join/..."
          type="url"
        />
        {form.teamsLink && !form.teamsLink.startsWith("https://teams.microsoft.com/") && (
          <p className="text-xs text-destructive mt-0.5">Le lien doit commencer par https://teams.microsoft.com/</p>
        )}
      </div>
      <Button
        type="submit"
        className="w-full"
        disabled={isPending || (!!form.teamsLink && !form.teamsLink.startsWith("https://teams.microsoft.com/"))}
      >
          {isPending ? "Enregistrement..." : "Enregistrer"}
      </Button>
    </form>
  );

  const DayCard = ({ day, weekStart }: { day: number; weekStart: Date }) => {
    const dayDate = addDays(weekStart, day - 1);
    const dayISO = toISODate(dayDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isToday = dayDate.getTime() === today.getTime();
    const dayEntries = filteredEntries
      .filter((e) => e.sessionDate === dayISO)
      .sort((a: any, b: any) => a.startTime.localeCompare(b.startTime));

    return (
      <div className={`border rounded-2xl overflow-hidden shadow-sm ${DAY_COLORS[day]} ${isToday ? "ring-2 ring-primary ring-offset-1" : ""}`}>
        <div className="px-4 py-3 border-b border-current/10 flex items-center justify-between">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <CalendarDays className="w-4 h-4" />
            <span>{DAYS[day]}</span>
            <span className={`text-xs font-normal ${isToday ? "text-primary font-bold" : "text-muted-foreground"}`}>
              {formatShortDate(dayDate)}
            </span>
          </h3>
          <Badge variant="secondary" className="text-xs">{dayEntries.length}</Badge>
        </div>
        <div className="p-3 space-y-2 min-h-[80px]">
          {dayEntries.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Aucun cours</p>
          ) : (
            dayEntries.map((entry: any) => {
              const hasTeacherConflict = teacherConflicts.has(entry.id);
              const hasRoomConflict = roomConflicts.has(entry.id);
              const hasConflict = hasTeacherConflict || hasRoomConflict;
              return (
                <div key={entry.id}
                  className={`bg-white/80 backdrop-blur-sm rounded-xl p-3 border shadow-xs group relative ${hasConflict ? "border-red-300 bg-red-50/80" : "border-white/60"}`}>
                  <div className="flex items-start justify-between gap-1">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">{entry.subjectName}</p>
                      <p className="text-xs text-muted-foreground truncate">{entry.teacherName}</p>
                      <div className="flex gap-3 mt-1 flex-wrap">
                        <span className="text-xs flex items-center gap-1 text-muted-foreground">
                          <Clock className="w-3 h-3" />{entry.startTime}–{entry.endTime}
                        </span>
                        <span className="text-xs flex items-center gap-1 text-muted-foreground">
                          <MapPin className="w-3 h-3" />{entry.roomName}
                        </span>
                      </div>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        <Badge variant="secondary" className="text-xs">{entry.className}</Badge>
                        {entry.published
                          ? <Badge variant="outline" className="text-xs border-green-300 text-green-700">Publié</Badge>
                          : <Badge variant="outline" className="text-xs border-amber-300 text-amber-700">Brouillon</Badge>}
                      </div>
                      {hasConflict && (
                        <div className="mt-1 space-y-0.5">
                          {hasTeacherConflict && <p className="text-xs text-red-600 font-medium">⚠ Conflit enseignant</p>}
                          {hasRoomConflict && <p className="text-xs text-red-600 font-medium">⚠ Conflit salle</p>}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        onClick={() => openEdit(entry)}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:bg-destructive/10"
                        onClick={() => setPendingDeleteId(entry.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex justify-between items-start flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">Emploi du Temps</h1>
            <p className="text-muted-foreground">Gérez, publiez et imprimez la grille des cours.</p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            {(() => {
              const selectedClass = (classes as any[]).find((c) => String(c.id) === filterClass);
              const selectedSemester = (semesters as any[]).find((s) => String(s.id) === filterSemester);
              const canPublish = filterClass !== "all" && filterSemester !== "all";
              return (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant={activePub ? "outline" : "default"}
                      disabled={publishPeriod.isPending}
                      className={activePub ? "border-green-400 text-green-700 hover:bg-green-50 gap-1" : "gap-1"}
                    >
                      {activePub
                        ? <><CheckCircle className="w-4 h-4 text-green-600" />Publié<ChevronDown className="w-3 h-3 ml-1" /></>
                        : <><Send className="w-4 h-4" />Publier<ChevronDown className="w-3 h-3 ml-1" /></>}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    {!canPublish ? (
                      <>
                        <div className="px-3 py-2.5 space-y-1">
                          <p className="text-xs font-semibold text-foreground">Sélectionner la classe</p>
                          <p className="text-xs text-muted-foreground leading-snug">
                            Choisissez une classe et un semestre dans les filtres ci-dessous pour publier l'emploi du temps correspondant.
                          </p>
                        </div>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem disabled className="text-muted-foreground/50 cursor-not-allowed">
                          <CalendarDays className="w-4 h-4 mr-2" />Aujourd'hui seulement
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled className="text-muted-foreground/50 cursor-not-allowed">
                          <CalendarDays className="w-4 h-4 mr-2" />1 semaine
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled className="text-muted-foreground/50 cursor-not-allowed">
                          <CalendarDays className="w-4 h-4 mr-2" />2 semaines
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled className="text-muted-foreground/50 cursor-not-allowed">
                          <CalendarDays className="w-4 h-4 mr-2" />1 mois
                        </DropdownMenuItem>
                      </>
                    ) : (
                      <>
                        <div className="px-3 py-2.5 space-y-0.5">
                          <p className="text-xs font-semibold text-foreground">
                            {selectedClass?.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {selectedSemester?.name} — Publier pour les étudiants
                          </p>
                        </div>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handlePublishPeriod("today")} className="cursor-pointer">
                          <CalendarDays className="w-4 h-4 mr-2 text-blue-500" />Aujourd'hui seulement
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handlePublishPeriod("1week")} className="cursor-pointer">
                          <CalendarDays className="w-4 h-4 mr-2 text-green-500" />1 semaine
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handlePublishPeriod("2weeks")} className="cursor-pointer">
                          <CalendarDays className="w-4 h-4 mr-2 text-orange-500" />2 semaines
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handlePublishPeriod("1month")} className="cursor-pointer">
                          <CalendarDays className="w-4 h-4 mr-2 text-purple-500" />1 mois
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            })()}
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-2" />Imprimer
            </Button>
            <Dialog open={isCreateOpen} onOpenChange={(o) => { setIsCreateOpen(o); if (!o) setForm(emptyForm); }}>
              <DialogTrigger asChild>
                <Button className="shadow-md"><Plus className="w-4 h-4 mr-2" />Nouveau Créneau</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Créer un créneau</DialogTitle></DialogHeader>
                {entryFormJSX(handleCreate, createEntry.isPending)}
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Edit dialog */}
        <Dialog open={!!editingEntry} onOpenChange={(o) => { if (!o) { setEditingEntry(null); setForm(emptyForm); } }}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Modifier le créneau</DialogTitle></DialogHeader>
            {entryFormJSX(handleUpdate, updateEntry.isPending, true)}
          </DialogContent>
        </Dialog>

        {/* Conflict alert */}
        {conflictIds.size > 0 && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
            <p className="text-red-700 font-medium">
              {conflictIds.size} créneau{conflictIds.size > 1 ? "x" : ""} en conflit —
              un enseignant ou une salle est doublement réservé(e) à la même date.
            </p>
          </div>
        )}

        {/* Filters + View controls */}
        <div className="flex gap-3 flex-wrap items-center justify-between">
          <div className="flex gap-3 flex-wrap items-center">
            <Select value={filterSemester} onValueChange={setFilterSemester}>
              <SelectTrigger className="w-52"><SelectValue placeholder="Tous les semestres" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les semestres</SelectItem>
                {semesters.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterClass} onValueChange={setFilterClass}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Toutes les classes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les classes</SelectItem>
                {classes.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {filterClass !== "all" && filterSemester !== "all" && (
              activePub ? (
                <Badge variant="outline" className="border-green-300 text-green-700 bg-green-50 gap-1">
                  <Eye className="w-3 h-3" />
                  Visible jusqu'au {new Date(activePub.publishedUntil).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                </Badge>
              ) : (
                <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50 gap-1">
                  <EyeOff className="w-3 h-3" />Non publié
                </Badge>
              )
            )}
          </div>

          {/* View mode toggle */}
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            {(["1week", "2weeks", "1month"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  viewMode === mode
                    ? "bg-background shadow text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {mode === "1week" ? "1 sem." : mode === "2weeks" ? "2 sem." : "1 mois"}
              </button>
            ))}
          </div>
        </div>

        {/* Date navigation */}
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1 text-center">
            <span className="font-semibold text-foreground">{formatPeriodLabel(startDate, numWeeks)}</span>
          </div>
          <Button variant="outline" size="sm" onClick={goToCurrentWeek} className="text-xs">
            Aujourd'hui
          </Button>
          <Button variant="outline" size="icon" onClick={() => navigate(1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Schedule grid — horizontal scroll snap */}
        {isLoading ? (
          <p className="text-muted-foreground text-center py-8">Chargement...</p>
        ) : (
          <div
            ref={scrollRef}
            className="flex overflow-x-auto gap-8 pb-4 -mx-1 px-1"
            style={{ scrollSnapType: "x mandatory", scrollBehavior: "smooth" }}
          >
            {weeks.map((weekStart, wi) => (
              <div
                key={wi}
                className="flex-none w-full"
                style={{ scrollSnapAlign: "start" }}
              >
                {numWeeks > 1 && (
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Semaine du {formatShortDate(weekStart)}
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {[1, 2, 3, 4, 5, 6].map((day) => (
                    <DayCard key={day} day={day} weekStart={weekStart} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}
        onConfirm={() => handleDelete(pendingDeleteId!)}
        title="Supprimer le créneau"
        description="Ce créneau d'emploi du temps sera définitivement supprimé."
      />
    </AppLayout>
  );
}
