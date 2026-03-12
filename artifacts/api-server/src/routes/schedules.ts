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
import { eq, and } from "drizzle-orm";
import { requireRole } from "../lib/auth.js";

const router = Router();

function requirePlanificateur(req: any, res: any, next: any) {
  if (req.session?.user?.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (req.session.user.adminSubRole !== "planificateur") {
    return res.status(403).json({ error: "Réservé au Planificateur" });
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

router.get("/", requireRole("admin"), async (req, res) => {
  try {
    const semesterId = req.query.semesterId ? parseInt(req.query.semesterId as string) : undefined;
    const classId = req.query.classId ? parseInt(req.query.classId as string) : undefined;
    const entries = await getEnrichedEntries({ semesterId, classId });
    res.json(entries);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/", requirePlanificateur, async (req, res) => {
  try {
    const { teacherId, subjectId, classId, roomId, semesterId, dayOfWeek, startTime, endTime } = req.body;
    if (!teacherId || !subjectId || !classId || !roomId || !semesterId || !dayOfWeek || !startTime || !endTime) {
      return res.status(400).json({ error: "Tous les champs sont requis" });
    }
    const [entry] = await db
      .insert(scheduleEntriesTable)
      .values({ teacherId, subjectId, classId, roomId, semesterId, dayOfWeek, startTime, endTime })
      .returning();

    const enriched = await getEnrichedEntries();
    const result = enriched.find((e) => e.id === entry.id);
    res.status(201).json(result);
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
