import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  gradesTable,
  subjectsTable,
  semestersTable,
  classEnrollmentsTable,
  classesTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireRole } from "../lib/auth.js";

const router = Router();

router.get("/me", requireRole("student", "admin"), async (req, res) => {
  try {
    const studentId = req.session!.userId!;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, studentId)).limit(1);
    if (!user) { res.status(404).json({ error: "Not Found" }); return; }

    const [enroll] = await db
      .select({ classId: classEnrollmentsTable.classId, className: classesTable.name })
      .from(classEnrollmentsTable)
      .innerJoin(classesTable, eq(classesTable.id, classEnrollmentsTable.classId))
      .where(eq(classEnrollmentsTable.studentId, studentId))
      .limit(1);

    res.json({
      id: user.id, name: user.name, email: user.email,
      classId: enroll?.classId ?? null, className: enroll?.className ?? null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/grades", requireRole("student"), async (req, res) => {
  try {
    const studentId = req.session!.userId!;
    const { semesterId } = req.query;

    if (!semesterId) {
      res.status(400).json({ error: "Bad Request", message: "semesterId is required" });
      return;
    }

    const semId = parseInt(semesterId as string);
    const [semester] = await db.select().from(semestersTable).where(eq(semestersTable.id, semId)).limit(1);
    if (!semester) { res.status(404).json({ error: "Not Found" }); return; }

    const [enroll] = await db
      .select({ classId: classEnrollmentsTable.classId })
      .from(classEnrollmentsTable)
      .where(eq(classEnrollmentsTable.studentId, studentId))
      .limit(1);

    const classId = enroll?.classId;
    const subjects = classId
      ? await db.select().from(subjectsTable).where(eq(subjectsTable.classId, classId))
      : [];

    const studentGrades = await db
      .select()
      .from(gradesTable)
      .where(and(eq(gradesTable.studentId, studentId), eq(gradesTable.semesterId, semId)));

    const gradeMap = new Map(studentGrades.map((g) => [g.subjectId, g.value]));

    const grades = subjects.map((s) => ({
      subjectId: s.id,
      subjectName: s.name,
      coefficient: s.coefficient,
      value: semester.published ? (gradeMap.get(s.id) ?? null) : null,
    }));

    let average: number | null = null;
    let decision: "Admis" | "Ajourné" | "En attente" | null = null;

    if (semester.published) {
      const gradedSubjects = grades.filter((g) => g.value !== null);
      if (gradedSubjects.length > 0) {
        const totalCoeff = gradedSubjects.reduce((sum, g) => sum + g.coefficient, 0);
        const totalPoints = gradedSubjects.reduce((sum, g) => sum + (g.value! * g.coefficient), 0);
        average = totalCoeff > 0 ? Math.round((totalPoints / totalCoeff) * 100) / 100 : null;
        if (average !== null) {
          decision = average >= 12 ? "Admis" : "Ajourné";
        }
      } else {
        decision = "En attente";
      }
    }

    res.json({
      semesterId: semester.id,
      semesterName: semester.name,
      published: semester.published,
      grades,
      average,
      decision,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/results", requireRole("student"), async (req, res) => {
  try {
    const studentId = req.session!.userId!;
    const { semesterId } = req.query;

    if (!semesterId) {
      res.status(400).json({ error: "Bad Request", message: "semesterId is required" });
      return;
    }

    const semId = parseInt(semesterId as string);
    const [semester] = await db.select().from(semestersTable).where(eq(semestersTable.id, semId)).limit(1);
    if (!semester || !semester.published) {
      res.status(403).json({ error: "Forbidden", message: "Results are not published yet" });
      return;
    }

    const [student] = await db.select().from(usersTable).where(eq(usersTable.id, studentId)).limit(1);
    if (!student) { res.status(404).json({ error: "Not Found" }); return; }

    const [enroll] = await db
      .select({ classId: classEnrollmentsTable.classId, className: classesTable.name })
      .from(classEnrollmentsTable)
      .innerJoin(classesTable, eq(classesTable.id, classEnrollmentsTable.classId))
      .where(eq(classEnrollmentsTable.studentId, studentId))
      .limit(1);

    const classId = enroll?.classId ?? null;
    const subjects = classId
      ? await db.select().from(subjectsTable).where(eq(subjectsTable.classId, classId))
      : [];

    const studentGrades = await db
      .select()
      .from(gradesTable)
      .where(and(eq(gradesTable.studentId, studentId), eq(gradesTable.semesterId, semId)));

    const gradeMap = new Map(studentGrades.map((g) => [g.subjectId, g.value]));
    const grades = subjects.map((s) => ({
      subjectId: s.id,
      subjectName: s.name,
      coefficient: s.coefficient,
      value: gradeMap.get(s.id) ?? null,
    }));

    let average: number | null = null;
    let decision: "Admis" | "Ajourné" | "En attente" = "En attente";
    const gradedSubjects = grades.filter((g) => g.value !== null);
    if (gradedSubjects.length > 0) {
      const totalCoeff = gradedSubjects.reduce((sum, g) => sum + g.coefficient, 0);
      const totalPoints = gradedSubjects.reduce((sum, g) => sum + (g.value! * g.coefficient), 0);
      average = totalCoeff > 0 ? Math.round((totalPoints / totalCoeff) * 100) / 100 : null;
      if (average !== null) {
        decision = average >= 12 ? "Admis" : "Ajourné";
      }
    }

    // Compute rank among classmates
    let rank: number | null = null;
    let totalStudents: number | null = null;

    if (classId && average !== null) {
      const classmates = await db
        .select({ studentId: classEnrollmentsTable.studentId })
        .from(classEnrollmentsTable)
        .where(eq(classEnrollmentsTable.classId, classId));

      const classmateAverages: { studentId: number; average: number }[] = [];
      for (const cm of classmates) {
        const cmGrades = await db
          .select({ value: gradesTable.value, coefficient: subjectsTable.coefficient })
          .from(gradesTable)
          .innerJoin(subjectsTable, eq(subjectsTable.id, gradesTable.subjectId))
          .where(and(eq(gradesTable.studentId, cm.studentId), eq(gradesTable.semesterId, semId)));

        if (cmGrades.length > 0) {
          const totalC = cmGrades.reduce((s, g) => s + g.coefficient, 0);
          const totalP = cmGrades.reduce((s, g) => s + (g.value * g.coefficient), 0);
          if (totalC > 0) {
            classmateAverages.push({ studentId: cm.studentId, average: totalP / totalC });
          }
        }
      }

      totalStudents = classmateAverages.length;
      classmateAverages.sort((a, b) => b.average - a.average);
      const idx = classmateAverages.findIndex((c) => c.studentId === studentId);
      rank = idx >= 0 ? idx + 1 : null;
    }

    res.json({
      studentId, studentName: student.name,
      classId, className: enroll?.className ?? "",
      semesterId: semester.id, semesterName: semester.name,
      average, rank, totalStudents, decision, grades,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
