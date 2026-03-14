import { useState, useMemo, useRef, useEffect } from "react";
import { AppLayout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  useListScheduleEntries,
  useListSemesters,
  useGetStudentMe,
  useListSchedulePublications,
} from "@workspace/api-client-react";
import { CalendarDays, Clock, MapPin, ChevronLeft, ChevronRight, BookOpen, Eye, EyeOff } from "lucide-react";

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

export default function StudentSchedule() {
  const { data: me } = useGetStudentMe();
  const { data: semesters = [] } = useListSemesters();
  const classId = (me as any)?.classId ?? null;

  const { data: allEntries = [], isLoading } = useListScheduleEntries(
    classId ? { params: { classId } } : {},
    { query: { enabled: !!classId } } as any
  );

  const [filterSemester, setFilterSemester] = useState<string>("all");

  const pubParams = useMemo(() => ({
    classId: classId ?? undefined,
    semesterId: filterSemester !== "all" ? parseInt(filterSemester) : undefined,
  }), [classId, filterSemester]);

  const { data: publications = [] } = useListSchedulePublications(
    pubParams,
    { enabled: !!classId } as any
  );

  const activePub = useMemo(() => {
    const now = new Date();
    return (publications as any[]).find((p: any) => {
      return new Date(p.publishedFrom) <= now && new Date(p.publishedUntil) >= now;
    }) ?? null;
  }, [publications]);

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

  const filteredEntries = useMemo(() => {
    return (allEntries as any[]).filter((e) => {
      if (filterSemester !== "all" && e.semesterId !== parseInt(filterSemester)) return false;
      return true;
    });
  }, [allEntries, filterSemester]);

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
                <p className="text-xs text-muted-foreground mt-0.5">{entry.teacherName}</p>
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
    <AppLayout allowedRoles={["student"]}>
      <div className="space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Mon Emploi du Temps</h1>
          <p className="text-muted-foreground">
            {(me as any)?.className
              ? <span>Classe : <strong>{(me as any).className}</strong></span>
              : "Vous n'êtes inscrit dans aucune classe."}
          </p>
        </div>

        {/* Publication status banner */}
        {classId && (
          activePub ? (
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <Eye className="w-5 h-5 text-green-600 shrink-0" />
              <p className="text-green-800 text-sm">
                Emploi du temps disponible jusqu'au{" "}
                <strong>{new Date(activePub.publishedUntil).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</strong>
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <EyeOff className="w-5 h-5 text-amber-600 shrink-0" />
              <p className="text-amber-800 text-sm">
                Aucun emploi du temps publié pour le moment. Contactez votre administration.
              </p>
            </div>
          )
        )}

        {!classId ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <BookOpen className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-base font-medium">Aucune classe associée à votre compte.</p>
            <p className="text-sm mt-1">Contactez l'administration pour être inscrit dans une classe.</p>
          </div>
        ) : (
          <>
            {/* Filters + View mode */}
            <div className="flex gap-3 flex-wrap items-center justify-between">
              <Select value={filterSemester} onValueChange={setFilterSemester}>
                <SelectTrigger className="w-52">
                  <SelectValue placeholder="Tous les semestres" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les semestres</SelectItem>
                  {(semesters as any[]).map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

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
              <Button variant="outline" size="sm" className="text-xs" onClick={() => setStartDate(getMondayOfCurrentWeek())}>
                Aujourd'hui
              </Button>
              <Button variant="outline" size="icon" onClick={() => navigate(1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            {/* Schedule grid */}
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
                    {filteredEntries.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                        <CalendarDays className="w-10 h-10 mb-3 opacity-30" />
                        <p className="text-sm font-medium">Aucun cours publié.</p>
                        <p className="text-xs mt-1">L'emploi du temps n'a pas encore été publié.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {[1, 2, 3, 4, 5, 6].map((day) => (
                          <DayCard key={day} day={day} weekStart={weekStart} />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
