import { Router } from "express";
import { db } from "@workspace/db";
import {
  scheduleEntriesTable,
  schedulePublicationsTable,
  usersTable,
  subjectsTable,
  classesTable,
  roomsTable,
  semestersTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireRole } from "../lib/auth.js";
import { notifyStudentsOfClasses, notifyStudentsBySemester } from "./notifications.js";
import { sendPushToUser } from "./push.js";

const router = Router();

function requirePlanificateur(req: any, res: any, next: any) {
  if (req.session?.user?.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }
  const subRole = req.session.user.adminSubRole;
  if (subRole !== "planificateur" && subRole !== "directeur") {
    return res.status(403).json({ error: "Réservé au Responsable pédagogique ou au Directeur" });
  }
  next();
}

async function getEnrichedEntries(filters?: { semesterId?: number; classId?: number }) {
  const rows = await db
    .select({
      id: scheduleEntriesTable.id,
      teacherId: scheduleEntriesTable.teacherId,
      teacherName: usersTable.name,
      subjectId: scheduleEntriesTable.subjectId,
      subjectName: subjectsTable.name,
      classId: scheduleEntriesTable.classId,
      className: classesTable.name,
      roomId: scheduleEntriesTable.roomId,
      roomName: roomsTable.name,
      semesterId: scheduleEntriesTable.semesterId,
      semesterName: semestersTable.name,
      sessionDate: scheduleEntriesTable.sessionDate,
      startTime: scheduleEntriesTable.startTime,
      endTime: scheduleEntriesTable.endTime,
      notes: scheduleEntriesTable.notes,
      teamsLink: scheduleEntriesTable.teamsLink,
      published: scheduleEntriesTable.published,
      createdAt: scheduleEntriesTable.createdAt,
    })
    .from(scheduleEntriesTable)
    .innerJoin(usersTable, eq(usersTable.id, scheduleEntriesTable.teacherId))
    .innerJoin(subjectsTable, eq(subjectsTable.id, scheduleEntriesTable.subjectId))
    .innerJoin(classesTable, eq(classesTable.id, scheduleEntriesTable.classId))
    .innerJoin(roomsTable, eq(roomsTable.id, scheduleEntriesTable.roomId))
    .innerJoin(semestersTable, eq(semestersTable.id, scheduleEntriesTable.semesterId));

  let filtered = rows;
  if (filters?.semesterId) filtered = filtered.filter((r) => r.semesterId === filters.semesterId);
  if (filters?.classId) filtered = filtered.filter((r) => r.classId === filters.classId);

  return filtered.sort((a, b) =>
    a.sessionDate.localeCompare(b.sessionDate) || a.startTime.localeCompare(b.startTime)
  );
}

async function getActivePublications(classId?: number, semesterId?: number) {
  const now = new Date();
  const allPubs = await db
    .select()
    .from(schedulePublicationsTable);

  return allPubs.filter((p) => {
    const active = p.publishedFrom <= now && p.publishedUntil >= now;
    if (!active) return false;
    if (classId !== undefined && p.classId !== classId) return false;
    if (semesterId !== undefined && p.semesterId !== semesterId) return false;
    return true;
  });
}

router.get("/publications", requireRole("admin", "teacher", "student"), async (req, res) => {
  try {
    const classId = req.query.classId ? parseInt(req.query.classId as string) : undefined;
    const semesterId = req.query.semesterId ? parseInt(req.query.semesterId as string) : undefined;
    const activePubs = await getActivePublications(classId, semesterId);
    res.json(activePubs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/", requireRole("admin", "teacher", "student"), async (req, res) => {
  try {
    const semesterId = req.query.semesterId ? parseInt(req.query.semesterId as string) : undefined;
    const classId = req.query.classId ? parseInt(req.query.classId as string) : undefined;
    const entries = await getEnrichedEntries({ semesterId, classId });
    const user = (req as any).session?.user;

    if (user?.role === "admin") {
      return res.json(entries);
    }

    // For students/teachers: only show entries from classes with active publications
    const activePubs = await getActivePublications();
    const activeClassSemesterPairs = new Set(
      activePubs.map((p) => `${p.classId}-${p.semesterId}`)
    );

    const visible = entries.filter(
      (e) => e.published && activeClassSemesterPairs.has(`${e.classId}-${e.semesterId}`)
    );
    res.json(visible);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/publish", requirePlanificateur, async (req, res) => {
  try {
    const { semesterId, published } = req.body;
    if (!semesterId || published === undefined) {
      return res.status(400).json({ error: "semesterId et published requis" });
    }
    await db
      .update(scheduleEntriesTable)
      .set({ published: Boolean(published) })
      .where(eq(scheduleEntriesTable.semesterId, semesterId));

    if (Boolean(published)) {
      const [sem] = await db.select({ name: semestersTable.name }).from(semestersTable).where(eq(semestersTable.id, parseInt(semesterId))).limit(1);
      await notifyStudentsBySemester(
        parseInt(semesterId),
        "schedule_published",
        "Emploi du temps disponible",
        `L'emploi du temps${sem ? ` du semestre ${sem.name}` : ""} a été publié. Consultez votre planning.`
      ).catch(console.error);
    }

    res.json({ message: published ? "Emploi du temps publié" : "Mis en brouillon" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/publish-period", requirePlanificateur, async (req, res) => {
  try {
    const { classId, semesterId, period } = req.body;
    if (!classId || !semesterId || !period) {
      return res.status(400).json({ error: "classId, semesterId et period sont requis" });
    }

    const validPeriods = ["today", "1week", "2weeks", "1month"];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({ error: "Période invalide" });
    }

    const now = new Date();
    const publishedUntil = new Date(now);
    if (period === "today") {
      publishedUntil.setHours(23, 59, 59, 999);
    } else if (period === "1week") {
      publishedUntil.setDate(publishedUntil.getDate() + 7);
    } else if (period === "2weeks") {
      publishedUntil.setDate(publishedUntil.getDate() + 14);
    } else if (period === "1month") {
      publishedUntil.setDate(publishedUntil.getDate() + 30);
    }

    await db
      .update(scheduleEntriesTable)
      .set({ published: true })
      .where(
        and(
          eq(scheduleEntriesTable.classId, parseInt(classId)),
          eq(scheduleEntriesTable.semesterId, parseInt(semesterId))
        )
      );

    const existing = await db
      .select()
      .from(schedulePublicationsTable)
      .where(
        and(
          eq(schedulePublicationsTable.classId, parseInt(classId)),
          eq(schedulePublicationsTable.semesterId, parseInt(semesterId))
        )
      );

    if (existing.length > 0) {
      await db
        .delete(schedulePublicationsTable)
        .where(eq(schedulePublicationsTable.id, existing[0].id));
    }

    const [pub] = await db
      .insert(schedulePublicationsTable)
      .values({
        classId: parseInt(classId),
        semesterId: parseInt(semesterId),
        publishedFrom: now,
        publishedUntil,
      })
      .returning();

    const [cls] = await db.select({ name: classesTable.name }).from(classesTable).where(eq(classesTable.id, parseInt(classId))).limit(1);
    const [sem] = await db.select({ name: semestersTable.name }).from(semestersTable).where(eq(semestersTable.id, parseInt(semesterId))).limit(1);
    const periodLabels: Record<string, string> = { today: "aujourd'hui", "1week": "1 semaine", "2weeks": "2 semaines", "1month": "1 mois" };
    await notifyStudentsOfClasses(
      [parseInt(classId)],
      "schedule_published",
      "Emploi du temps disponible",
      `L'emploi du temps${cls ? ` de la classe ${cls.name}` : ""}${sem ? ` (${sem.name})` : ""} est publié pour ${periodLabels[period] ?? period}.`
    ).catch(console.error);

    res.json({
      message: "Emploi du temps publié",
      publication: pub,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

async function notifyTeacherOfEntry(entryId: number, isNew: boolean) {
  try {
    const enriched = await getEnrichedEntries();
    const e = enriched.find((x) => x.id === entryId);
    if (!e || !e.teacherId) return;
    const dateLabel = new Date(e.sessionDate + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    const timeLabel = `${e.startTime.slice(0, 5)} – ${e.endTime.slice(0, 5)}`;
    const title = isNew ? "Nouveau cours programmé" : "Cours modifié";
    const body = `${e.subjectName} · ${e.className}\n${dateLabel} de ${timeLabel}`;
    sendPushToUser(e.teacherId, { title, body, type: "schedule_assigned" }).catch(() => {});
  } catch (_) {}
}

router.post("/", requirePlanificateur, async (req, res) => {
  try {
    const { teacherId, subjectId, classId, roomId, semesterId, sessionDate, startTime, endTime, notes, teamsLink } = req.body;
    if (!teacherId || !subjectId || !classId || !roomId || !semesterId || !sessionDate || !startTime || !endTime) {
      return res.status(400).json({ error: "Tous les champs sont requis" });
    }
    const [entry] = await db
      .insert(scheduleEntriesTable)
      .values({ teacherId, subjectId, classId, roomId, semesterId, sessionDate, startTime, endTime, notes: notes ?? null, teamsLink: teamsLink ?? null, published: false })
      .returning();
    notifyTeacherOfEntry(entry.id, true);
    const enriched = await getEnrichedEntries();
    res.status(201).json(enriched.find((e) => e.id === entry.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/:entryId", requirePlanificateur, async (req, res) => {
  try {
    const entryId = parseInt(req.params.entryId);
    const { teacherId, subjectId, classId, roomId, sessionDate, startTime, endTime, notes, teamsLink } = req.body;
    const [entry] = await db
      .update(scheduleEntriesTable)
      .set({ teacherId, subjectId, classId, roomId, sessionDate, startTime, endTime, notes: notes ?? null, teamsLink: teamsLink ?? null })
      .where(eq(scheduleEntriesTable.id, entryId))
      .returning();
    if (!entry) return res.status(404).json({ error: "Not Found" });
    notifyTeacherOfEntry(entry.id, false);
    const enriched = await getEnrichedEntries();
    res.json(enriched.find((e) => e.id === entry.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/:entryId", requirePlanificateur, async (req, res) => {
  try {
    const entryId = parseInt(req.params.entryId);
    await db.delete(scheduleEntriesTable).where(eq(scheduleEntriesTable.id, entryId));
    res.json({ message: "Créneau supprimé" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
