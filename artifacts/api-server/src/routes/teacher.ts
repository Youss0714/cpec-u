import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  gradesTable,
  subjectsTable,
  classesTable,
  semestersTable,
  teacherAssignmentsTable,
  classEnrollmentsTable,
  subjectApprovalsTable,
  scheduleEntriesTable,
  roomsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireRole } from "../lib/auth.js";

const router = Router();

router.get("/assignments", requireRole("teacher", "admin"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;
    const assignments = await db
      .select({
        id: teacherAssignmentsTable.id,
        teacherId: teacherAssignmentsTable.teacherId,
        teacherName: usersTable.name,
        subjectId: teacherAssignmentsTable.subjectId,
        subjectName: subjectsTable.name,
        coefficient: subjectsTable.coefficient,
        classId: teacherAssignmentsTable.classId,
        className: classesTable.name,
        semesterId: teacherAssignmentsTable.semesterId,
        semesterName: semestersTable.name,
        plannedHours: teacherAssignmentsTable.plannedHours,
      })
      .from(teacherAssignmentsTable)
      .innerJoin(usersTable, eq(usersTable.id, teacherAssignmentsTable.teacherId))
      .innerJoin(subjectsTable, eq(subjectsTable.id, teacherAssignmentsTable.subjectId))
      .innerJoin(classesTable, eq(classesTable.id, teacherAssignmentsTable.classId))
      .innerJoin(semestersTable, eq(semestersTable.id, teacherAssignmentsTable.semesterId))
      .where(eq(teacherAssignmentsTable.teacherId, teacherId));

    // Compute scheduled hours per assignment from schedule entries
    const scheduleRows = await db
      .select({
        subjectId: scheduleEntriesTable.subjectId,
        classId: scheduleEntriesTable.classId,
        semesterId: scheduleEntriesTable.semesterId,
        startTime: scheduleEntriesTable.startTime,
        endTime: scheduleEntriesTable.endTime,
      })
      .from(scheduleEntriesTable)
      .where(eq(scheduleEntriesTable.teacherId, teacherId));

    const scheduledMap: Record<string, number> = {};
    for (const row of scheduleRows) {
      const key = `${row.subjectId}-${row.classId}-${row.semesterId}`;
      const [sh, sm] = row.startTime.split(":").map(Number);
      const [eh, em] = row.endTime.split(":").map(Number);
      const hours = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
      scheduledMap[key] = (scheduledMap[key] ?? 0) + hours;
    }

    const result = assignments.map((a) => ({
      ...a,
      scheduledHoursPerWeek: Math.round((scheduledMap[`${a.subjectId}-${a.classId}-${a.semesterId}`] ?? 0) * 10) / 10,
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/grades", requireRole("teacher", "admin"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;
    const { subjectId, semesterId, classId } = req.query;

    // Verify teacher is assigned to this subject/class/semester
    const conditions: any[] = [eq(teacherAssignmentsTable.teacherId, teacherId)];
    if (subjectId) conditions.push(eq(teacherAssignmentsTable.subjectId, parseInt(subjectId as string)));
    if (semesterId) conditions.push(eq(teacherAssignmentsTable.semesterId, parseInt(semesterId as string)));
    if (classId) conditions.push(eq(teacherAssignmentsTable.classId, parseInt(classId as string)));

    const assignments = await db
      .select({ subjectId: teacherAssignmentsTable.subjectId, classId: teacherAssignmentsTable.classId, semesterId: teacherAssignmentsTable.semesterId })
      .from(teacherAssignmentsTable)
      .where(conditions.length > 1 ? and(...conditions) : conditions[0]);

    if (assignments.length === 0) {
      res.json([]);
      return;
    }

    const gradeConditions: any[] = [];
    if (subjectId) gradeConditions.push(eq(gradesTable.subjectId, parseInt(subjectId as string)));
    if (semesterId) gradeConditions.push(eq(gradesTable.semesterId, parseInt(semesterId as string)));

    let query = db
      .select({
        id: gradesTable.id,
        studentId: gradesTable.studentId,
        studentName: usersTable.name,
        subjectId: gradesTable.subjectId,
        subjectName: subjectsTable.name,
        coefficient: subjectsTable.coefficient,
        semesterId: gradesTable.semesterId,
        semesterName: semestersTable.name,
        evaluationNumber: gradesTable.evaluationNumber,
        value: gradesTable.value,
        createdAt: gradesTable.createdAt,
        updatedAt: gradesTable.updatedAt,
      })
      .from(gradesTable)
      .innerJoin(usersTable, eq(usersTable.id, gradesTable.studentId))
      .innerJoin(subjectsTable, eq(subjectsTable.id, gradesTable.subjectId))
      .innerJoin(semestersTable, eq(semestersTable.id, gradesTable.semesterId));

    const grades = gradeConditions.length > 0
      ? await query.where(gradeConditions.length === 1 ? gradeConditions[0] : and(...gradeConditions))
      : await query;

    res.json(grades);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/grades", requireRole("teacher", "admin"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;
    const { studentId, subjectId, semesterId, value } = req.body;
    if (studentId === undefined || !subjectId || !semesterId || value === undefined) {
      res.status(400).json({ error: "Bad Request", message: "All fields are required" });
      return;
    }
    if (value < 0 || value > 20) {
      res.status(400).json({ error: "Bad Request", message: "Grade must be between 0 and 20" });
      return;
    }

    // Verify teacher assignment
    const [assignment] = await db
      .select()
      .from(teacherAssignmentsTable)
      .where(and(
        eq(teacherAssignmentsTable.teacherId, teacherId),
        eq(teacherAssignmentsTable.subjectId, subjectId),
        eq(teacherAssignmentsTable.semesterId, semesterId),
      ))
      .limit(1);

    if (!assignment && req.session!.role !== "admin") {
      res.status(403).json({ error: "Forbidden", message: "You are not assigned to this subject" });
      return;
    }

    const [grade] = await db
      .insert(gradesTable)
      .values({ studentId, subjectId, semesterId, value })
      .onConflictDoUpdate({
        target: [gradesTable.studentId, gradesTable.subjectId, gradesTable.semesterId],
        set: { value, updatedAt: new Date() },
      })
      .returning();

    const [student] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, studentId)).limit(1);
    const [subject] = await db.select({ name: subjectsTable.name, coefficient: subjectsTable.coefficient }).from(subjectsTable).where(eq(subjectsTable.id, subjectId)).limit(1);
    const [semester] = await db.select({ name: semestersTable.name }).from(semestersTable).where(eq(semestersTable.id, semesterId)).limit(1);

    res.json({
      id: grade.id, studentId, studentName: student?.name ?? "",
      subjectId, subjectName: subject?.name ?? "", coefficient: subject?.coefficient ?? 1,
      semesterId, semesterName: semester?.name ?? "",
      value: grade.value, createdAt: grade.createdAt, updatedAt: grade.updatedAt,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/grades/bulk", requireRole("teacher", "admin"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;
    const { grades } = req.body;
    if (!Array.isArray(grades) || grades.length === 0) {
      res.status(400).json({ error: "Bad Request", message: "Grades array is required" });
      return;
    }

    // Check approval on the first grade entry (all share same subject/class/semester for bulk entry)
    if (grades.length > 0 && req.session!.role !== "admin") {
      const first = grades[0];
      const [approval] = await db
        .select()
        .from(subjectApprovalsTable)
        .innerJoin(teacherAssignmentsTable, and(
          eq(teacherAssignmentsTable.subjectId, subjectApprovalsTable.subjectId),
          eq(teacherAssignmentsTable.classId, subjectApprovalsTable.classId),
          eq(teacherAssignmentsTable.semesterId, subjectApprovalsTable.semesterId),
        ))
        .where(and(
          eq(subjectApprovalsTable.subjectId, first.subjectId),
          eq(subjectApprovalsTable.semesterId, first.semesterId),
        ))
        .limit(1);
      if (approval) {
        res.status(403).json({ error: "Notes verrouillées. Cette matière a été approuvée par le Assistant(e) de Direction." });
        return;
      }
    }

    const results = [];
    for (const g of grades) {
      const { studentId, subjectId, semesterId, value, evaluationNumber = 1 } = g;
      if (value < 0 || value > 20) continue;
      if (evaluationNumber < 1 || evaluationNumber > 4) continue;

      const [grade] = await db
        .insert(gradesTable)
        .values({ studentId, subjectId, semesterId, evaluationNumber, value })
        .onConflictDoUpdate({
          target: [gradesTable.studentId, gradesTable.subjectId, gradesTable.semesterId, gradesTable.evaluationNumber],
          set: { value, updatedAt: new Date() },
        })
        .returning();

      const [student] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, studentId)).limit(1);
      const [subject] = await db.select({ name: subjectsTable.name, coefficient: subjectsTable.coefficient }).from(subjectsTable).where(eq(subjectsTable.id, subjectId)).limit(1);
      const [semester] = await db.select({ name: semestersTable.name }).from(semestersTable).where(eq(semestersTable.id, semesterId)).limit(1);

      results.push({
        id: grade.id, studentId, studentName: student?.name ?? "",
        subjectId, subjectName: subject?.name ?? "", coefficient: subject?.coefficient ?? 1,
        semesterId, semesterName: semester?.name ?? "",
        value: grade.value, createdAt: grade.createdAt, updatedAt: grade.updatedAt,
      });
    }

    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Teacher Schedule ─────────────────────────────────────────────────────────

router.get("/schedule", requireRole("teacher"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;
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
      .innerJoin(semestersTable, eq(semestersTable.id, scheduleEntriesTable.semesterId))
      .where(eq(scheduleEntriesTable.teacherId, teacherId));

    const sorted = rows.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
    res.json(sorted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
