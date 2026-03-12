import { Router } from "express";
import { db } from "@workspace/db";
import {
  scheduleEntriesTable,
  usersTable,
  subjectsTable,
  classesTable,
  roomsTable,
  semestersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireRole } from "../lib/auth.js";

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
      dayOfWeek: scheduleEntriesTable.dayOfWeek,
      startTime: scheduleEntriesTable.startTime,
      endTime: scheduleEntriesTable.endTime,
      notes: scheduleEntriesTable.notes,
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

  return filtered.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
}

router.get("/", requireRole("admin", "teacher", "student"), async (req, res) => {
  try {
    const semesterId = req.query.semesterId ? parseInt(req.query.semesterId as string) : undefined;
    const classId = req.query.classId ? parseInt(req.query.classId as string) : undefined;
    const entries = await getEnrichedEntries({ semesterId, classId });
    const user = (req as any).session?.user;
    res.json(user?.role === "admin" ? entries : entries.filter((e) => e.published));
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
    res.json({ message: published ? "Emploi du temps publié" : "Mis en brouillon" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/", requirePlanificateur, async (req, res) => {
  try {
    const { teacherId, subjectId, classId, roomId, semesterId, dayOfWeek, startTime, endTime, notes } = req.body;
    if (!teacherId || !subjectId || !classId || !roomId || !semesterId || !dayOfWeek || !startTime || !endTime) {
      return res.status(400).json({ error: "Tous les champs sont requis" });
    }
    const [entry] = await db
      .insert(scheduleEntriesTable)
      .values({ teacherId, subjectId, classId, roomId, semesterId, dayOfWeek, startTime, endTime, notes: notes ?? null, published: false })
      .returning();
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
    const { teacherId, subjectId, classId, roomId, dayOfWeek, startTime, endTime, notes } = req.body;
    const [entry] = await db
      .update(scheduleEntriesTable)
      .set({ teacherId, subjectId, classId, roomId, dayOfWeek, startTime, endTime, notes: notes ?? null })
      .where(eq(scheduleEntriesTable.id, entryId))
      .returning();
    if (!entry) return res.status(404).json({ error: "Not Found" });
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
