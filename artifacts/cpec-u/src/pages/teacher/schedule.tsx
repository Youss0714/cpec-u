import { useState, useMemo, useRef, useEffect } from "react";
import { AppLayout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useGetTeacherSchedule, useListSemesters } from "@workspace/api-client-react";
import { CalendarDays, Clock, MapPin, ChevronLeft, ChevronRight, Users, Printer } from "lucide-react";

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

const CLASS_BADGE_COLORS = [
  "bg-blue-100 text-blue-800",
  "bg-green-100 text-green-800",
  "bg-purple-100 text-purple-800",
  "bg-orange-100 text-orange-800",
  "bg-pink-100 text-pink-800",
  "bg-teal-100 text-teal-800",
];

type ViewMode = "1week" | "2weeks" | "1month";

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
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

export default function TeacherSchedule() {
  const { data: allEntries = [], isLoading } = useGetTeacherSchedule();
  const { data: semesters = [] } = useListSemesters();

  const [filterSemester, setFilterSemester] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("1week");
  const [startDate, setStartDate] = useState<Date>(getMondayOfCurrentWeek);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const classColorMap = useMemo(() => {
    const map: Record<number, string> = {};
    let idx = 0;
    for (const e of allEntries as any[]) {
      if (!(e.classId in map)) {
        map[e.classId] = CLASS_BADGE_COLORS[idx % CLASS_BADGE_COLORS.length];
        idx++;
      }
    }
    return map;
  }, [allEntries]);

  const filteredEntries = useMemo(() => {
    return (allEntries as any[]).filter((e) => {
      if (filterSemester !== "all" && e.semesterId !== parseInt(filterSemester)) return false;
      return true;
    });
  }, [allEntries, filterSemester]);

  // Count entries in the currently visible period
  const visibleEntries = useMemo(() => {
    if (weeks.length === 0) return filteredEntries;
    const periodStart = toISODate(weeks[0]);
    const periodEnd = toISODate(addDays(weeks[weeks.length - 1], 6));
    return filteredEntries.filter((e: any) => e.sessionDate >= periodStart && e.sessionDate <= periodEnd);
  }, [filteredEntries, weeks]);

  const totalHoursVisible = useMemo(() => {
    let minutes = 0;
    for (const e of visibleEntries) {
      const [sh, sm] = e.startTime.split(":").map(Number);
      const [eh, em] = e.endTime.split(":").map(Number);
      minutes += (eh * 60 + em) - (sh * 60 + sm);
    }
    return Math.round(minutes / 60 * 10) / 10;
  }, [visibleEntries]);

  const DayCard = ({ day, weekStart }: { day: number; weekStart: Date }) => {
    const dayDate = addDays(weekStart, day - 1);
    const dayISO = toISODate(dayDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isToday = dayDate.getTime() === today.getTime();
    const dayEntries = filteredEntries
      .filter((e: any) => e.sessionDate === dayISO)
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
            dayEntries.map((entry: any) => (
              <div key={entry.id}
                className="bg-white/80 backdrop-blur-sm rounded-xl p-3 border border-white/60 shadow-xs">
                <p className="font-semibold text-sm text-foreground">{entry.subjectName}</p>
                <div className="flex gap-2 mt-1 flex-wrap items-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${classColorMap[entry.classId] ?? "bg-gray-100 text-gray-700"}`}>
                    <Users className="w-3 h-3 inline mr-1" />{entry.className}
                  </span>
                </div>
                <div className="flex gap-3 mt-1.5 flex-wrap">
                  <span className="text-xs flex items-center gap-1 text-muted-foreground">
                    <Clock className="w-3 h-3" />{entry.startTime}–{entry.endTime}
                  </span>
                  <span className="text-xs flex items-center gap-1 text-muted-foreground">
                    <MapPin className="w-3 h-3" />{entry.roomName}
                  </span>
                </div>
                {entry.notes && (
                  <p className="text-xs text-muted-foreground mt-1 italic">{entry.notes}</p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  return (
    <AppLayout allowedRoles={["teacher"]}>
      <div className="space-y-5">
        <div className="flex justify-between items-start flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">Mon Emploi du Temps</h1>
            <p className="text-muted-foreground">Consultez vos cours planifiés par semaine.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end print:hidden">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => window.print()}>
              <Printer className="w-4 h-4" />
              Imprimer
            </Button>
            <Select value={filterSemester} onValueChange={setFilterSemester}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Tous les semestres" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les semestres</SelectItem>
                {(semesters as any[]).map((s: any) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {visibleEntries.length > 0 && (
          <div className="flex gap-3 flex-wrap print:hidden">
            <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-2 text-sm">
              <span className="font-semibold text-primary">{visibleEntries.length}</span>
              <span className="text-muted-foreground ml-1">cours sur la période</span>
            </div>
            <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-2 text-sm">
              <span className="font-semibold text-primary">{totalHoursVisible}h</span>
              <span className="text-muted-foreground ml-1">sur la période</span>
            </div>
            {Object.keys(classColorMap).length > 1 && (
              <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-2 text-sm">
                <span className="font-semibold text-primary">{Object.keys(classColorMap).length}</span>
                <span className="text-muted-foreground ml-1">classes</span>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-4 flex-wrap print:hidden">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium min-w-[160px] text-center">
              {formatPeriodLabel(startDate, numWeeks)}
            </span>
            <Button variant="outline" size="icon" onClick={() => navigate(1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setStartDate(getMondayOfCurrentWeek())}>
              Aujourd'hui
            </Button>
          </div>
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            {(["1week", "2weeks", "1month"] as ViewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === m ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {m === "1week" ? "1 sem." : m === "2weeks" ? "2 sem." : "1 mois"}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-40 rounded-2xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <CalendarDays className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">Aucun cours planifié</p>
            <p className="text-sm mt-1">Votre emploi du temps apparaîtra ici une fois configuré par la direction pédagogique.</p>
          </div>
        ) : (
          <div className="space-y-8" ref={scrollRef}>
            {weeks.map((weekStart, wi) => (
              <div key={wi}>
                {numWeeks > 1 && (
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Semaine du {formatShortDate(weekStart)}
                  </p>
                )}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {[1, 2, 3, 4, 5, 6].map((day) => (
                    <DayCard key={day} day={day} weekStart={weekStart} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
