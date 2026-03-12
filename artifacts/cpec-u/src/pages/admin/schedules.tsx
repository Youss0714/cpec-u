import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  useListScheduleEntries,
  useCreateScheduleEntry,
  useDeleteScheduleEntry,
  useListRooms,
  useListClasses,
  useListSemesters,
  useListSubjects,
  useListUsers,
} from "@workspace/api-client-react";
import { Plus, Trash2, CalendarDays, Clock, MapPin } from "lucide-react";

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

export default function AdminSchedules() {
  const { toast } = useToast();
  const { data: entries = [], isLoading, refetch } = useListScheduleEntries({});
  const { data: rooms = [] } = useListRooms();
  const { data: classes = [] } = useListClasses();
  const { data: semesters = [] } = useListSemesters();
  const { data: subjects = [] } = useListSubjects();
  const { data: allUsers = [] } = useListUsers();
  const teachers = (allUsers as any[]).filter((u) => u.role === "teacher");

  const createEntry = useCreateScheduleEntry();
  const deleteEntry = useDeleteScheduleEntry();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [filterSemester, setFilterSemester] = useState<string>("all");
  const [filterClass, setFilterClass] = useState<string>("all");
  const [form, setForm] = useState({
    teacherId: "", subjectId: "", classId: "", roomId: "", semesterId: "",
    dayOfWeek: "1", startTime: "08:00", endTime: "10:00",
  });

  const resetForm = () => setForm({
    teacherId: "", subjectId: "", classId: "", roomId: "", semesterId: "",
    dayOfWeek: "1", startTime: "08:00", endTime: "10:00",
  });

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (filterSemester !== "all" && e.semesterId !== parseInt(filterSemester)) return false;
      if (filterClass !== "all" && e.classId !== parseInt(filterClass)) return false;
      return true;
    });
  }, [entries, filterSemester, filterClass]);

  const entriesByDay = useMemo(() => {
    const map: Record<number, typeof filteredEntries> = {};
    for (let d = 1; d <= 6; d++) map[d] = [];
    filteredEntries.forEach((e) => {
      if (!map[e.dayOfWeek]) map[e.dayOfWeek] = [];
      map[e.dayOfWeek].push(e);
    });
    return map;
  }, [filteredEntries]);

  const handleCreate = () => {
    const { teacherId, subjectId, classId, roomId, semesterId, dayOfWeek, startTime, endTime } = form;
    if (!teacherId || !subjectId || !classId || !roomId || !semesterId || !startTime || !endTime) {
      toast({ title: "Erreur", description: "Tous les champs sont requis.", variant: "destructive" });
      return;
    }
    createEntry.mutate(
      {
        data: {
          teacherId: parseInt(teacherId), subjectId: parseInt(subjectId),
          classId: parseInt(classId), roomId: parseInt(roomId),
          semesterId: parseInt(semesterId), dayOfWeek: parseInt(dayOfWeek),
          startTime, endTime,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Créneau ajouté" });
          resetForm();
          setIsCreateOpen(false);
          refetch();
        },
        onError: () => toast({ title: "Erreur", description: "Impossible d'ajouter le créneau.", variant: "destructive" }),
      }
    );
  };

  const handleDelete = (id: number) => {
    if (!confirm("Supprimer ce créneau ?")) return;
    deleteEntry.mutate(
      { entryId: id },
      {
        onSuccess: () => { toast({ title: "Créneau supprimé" }); refetch(); },
        onError: () => toast({ title: "Erreur", variant: "destructive" }),
      }
    );
  };

  const activeDays = [1, 2, 3, 4, 5, 6].filter((d) => entriesByDay[d]?.length > 0);
  const displayDays = activeDays.length > 0 ? activeDays : [1, 2, 3, 4, 5];

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold font-serif tracking-tight">Emplois du Temps</h1>
            <p className="text-muted-foreground mt-1">Planifier les créneaux de cours par classe et semestre</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="w-4 h-4 mr-2" />
                Ajouter un Créneau
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Nouveau Créneau</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Semestre *</Label>
                    <Select value={form.semesterId} onValueChange={(v) => setForm({ ...form, semesterId: v })}>
                      <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
                      <SelectContent>
                        {(semesters as any[]).map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Classe *</Label>
                    <Select value={form.classId} onValueChange={(v) => setForm({ ...form, classId: v })}>
                      <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
                      <SelectContent>
                        {(classes as any[]).map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Enseignant *</Label>
                  <Select value={form.teacherId} onValueChange={(v) => setForm({ ...form, teacherId: v })}>
                    <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
                    <SelectContent>
                      {teachers.map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Matière *</Label>
                  <Select value={form.subjectId} onValueChange={(v) => setForm({ ...form, subjectId: v })}>
                    <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
                    <SelectContent>
                      {(subjects as any[]).map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Salle *</Label>
                  <Select value={form.roomId} onValueChange={(v) => setForm({ ...form, roomId: v })}>
                    <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
                    <SelectContent>
                      {rooms.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.name} ({r.capacity} places)</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Jour *</Label>
                  <Select value={form.dayOfWeek} onValueChange={(v) => setForm({ ...form, dayOfWeek: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 6].map((d) => <SelectItem key={d} value={String(d)}>{DAYS[d]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Heure de début *</Label>
                    <Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
                  </div>
                  <div>
                    <Label>Heure de fin *</Label>
                    <Input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
                  </div>
                </div>
                <Button onClick={handleCreate} disabled={createEntry.isPending} className="w-full">
                  {createEntry.isPending ? "Enregistrement..." : "Ajouter le créneau"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Label className="text-sm">Semestre :</Label>
            <Select value={filterSemester} onValueChange={setFilterSemester}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                {(semesters as any[]).map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm">Classe :</Label>
            <Select value={filterClass} onValueChange={setFilterClass}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                {(classes as any[]).map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="text-sm text-muted-foreground ml-auto">
            {filteredEntries.length} créneau{filteredEntries.length !== 1 ? "x" : ""}
          </div>
        </div>

        {/* Timetable Grid */}
        {isLoading ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Chargement...</CardContent></Card>
        ) : filteredEntries.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <CalendarDays className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground font-medium">Aucun créneau planifié</p>
              <p className="text-muted-foreground/60 text-sm mt-1">Cliquez sur "Ajouter un Créneau" pour commencer.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {displayDays.map((day) => (
              <Card key={day} className={`border-2 ${DAY_COLORS[day]}`}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">{DAYS[day]}</CardTitle>
                  <CardDescription>{entriesByDay[day]?.length ?? 0} créneau(x)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {entriesByDay[day]?.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Aucun cours</p>
                  ) : (
                    entriesByDay[day]
                      ?.sort((a, b) => a.startTime.localeCompare(b.startTime))
                      .map((entry) => (
                        <div key={entry.id} className="bg-white/80 rounded-lg p-3 border border-white shadow-sm">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm truncate">{entry.subjectName}</p>
                              <p className="text-xs text-muted-foreground truncate">{entry.teacherName}</p>
                              <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {entry.startTime} – {entry.endTime}
                                </span>
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {entry.roomName}
                                </span>
                              </div>
                              <div className="mt-1 text-xs font-medium text-primary/80">{entry.className}</div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                              onClick={() => handleDelete(entry.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
