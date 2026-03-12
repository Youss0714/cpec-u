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
      })
      .from(teacherAssignmentsTable)
      .innerJoin(usersTable, eq(usersTable.id, teacherAssignmentsTable.teacherId))
      .innerJoin(subjectsTable, eq(subjectsTable.id, teacherAssignmentsTable.subjectId))
      .innerJoin(classesTable, eq(classesTable.id, teacherAssignmentsTable.classId))
      .innerJoin(semestersTable, eq(semestersTable.id, teacherAssignmentsTable.semesterId))
      .where(eq(teacherAssignmentsTable.teacherId, teacherId));
    res.json(assignments);
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

    const results = [];
    for (const g of grades) {
      const { studentId, subjectId, semesterId, value } = g;
      if (value < 0 || value > 20) continue;

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

export default router;
