import { Router } from "express";
import { db } from "@workspace/db";
import {
  teacherAssignmentsTable,
  usersTable,
  subjectsTable,
  classesTable,
  semestersTable,
  scheduleEntriesTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
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

async function getEnriched() {
  const rows = await db
    .select({
      id: teacherAssignmentsTable.id,
      teacherId: teacherAssignmentsTable.teacherId,
      teacherName: usersTable.name,
      subjectId: teacherAssignmentsTable.subjectId,
      subjectName: subjectsTable.name,
      classId: teacherAssignmentsTable.classId,
      className: classesTable.name,
      semesterId: teacherAssignmentsTable.semesterId,
      semesterName: semestersTable.name,
      plannedHours: teacherAssignmentsTable.plannedHours,
      createdAt: teacherAssignmentsTable.createdAt,
    })
    .from(teacherAssignmentsTable)
    .innerJoin(usersTable, eq(usersTable.id, teacherAssignmentsTable.teacherId))
    .innerJoin(subjectsTable, eq(subjectsTable.id, teacherAssignmentsTable.subjectId))
    .innerJoin(classesTable, eq(classesTable.id, teacherAssignmentsTable.classId))
    .innerJoin(semestersTable, eq(semestersTable.id, teacherAssignmentsTable.semesterId));
  return rows;
}

// Compute hours done from schedule entries (each entry = 1 slot, duration computed)
async function computeHoursDone(assignmentId: number, ta: any) {
  const entries = await db
    .select()
    .from(scheduleEntriesTable)
    .where(
      and(
        eq(scheduleEntriesTable.teacherId, ta.teacherId),
        eq(scheduleEntriesTable.subjectId, ta.subjectId),
        eq(scheduleEntriesTable.classId, ta.classId),
        eq(scheduleEntriesTable.semesterId, ta.semesterId),
      )
    );

  const totalHours = entries.reduce((sum, e) => {
    const [sh, sm] = e.startTime.split(":").map(Number);
    const [eh, em] = e.endTime.split(":").map(Number);
    return sum + (eh * 60 + em - sh * 60 - sm) / 60;
  }, 0);
  return Math.round(totalHours * 10) / 10;
}

router.get("/", requireRole("admin", "teacher"), async (req, res) => {
  try {
    const rows = await getEnriched();
    const withHours = await Promise.all(
      rows.map(async (r) => ({
        ...r,
        completedHours: await computeHoursDone(r.id, r),
      }))
    );
    res.json(withHours);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/", requirePlanificateur, async (req, res) => {
  try {
    const { teacherId, subjectId, classId, semesterId, plannedHours } = req.body;
    if (!teacherId || !subjectId || !classId || !semesterId) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }
    const [row] = await db
      .insert(teacherAssignmentsTable)
      .values({ teacherId, subjectId, classId, semesterId, plannedHours: plannedHours ?? 30 })
      .returning();
    const rows = await getEnriched();
    const result = rows.find((r) => r.id === row.id)!;
    res.status(201).json({ ...result, completedHours: 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/:id", requirePlanificateur, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { plannedHours } = req.body;
    const [row] = await db
      .update(teacherAssignmentsTable)
      .set({ plannedHours })
      .where(eq(teacherAssignmentsTable.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Not Found" });
    const rows = await getEnriched();
    const result = rows.find((r) => r.id === row.id)!;
    const completedHours = await computeHoursDone(id, result);
    res.json({ ...result, completedHours });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/:id", requirePlanificateur, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(teacherAssignmentsTable).where(eq(teacherAssignmentsTable.id, id));
    res.json({ message: "Affectation supprimée" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
