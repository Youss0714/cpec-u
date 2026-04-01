import { Router } from "express";
import { db } from "@workspace/db";
import {
  evaluationPeriodsTable,
  teacherEvaluationsTable,
  evaluationSubmissionsTable,
  classEnrollmentsTable,
  teacherAssignmentsTable,
  usersTable,
  semestersTable,
  subjectsTable,
  classesTable,
  notificationsTable,
} from "@workspace/db";
import { eq, and, inArray, count, avg, sql } from "drizzle-orm";
import { requireRole } from "../lib/auth.js";
import { sendPushToUser } from "./push.js";

const router = Router();

const CRITERIA = ["clarityScore", "masteryScore", "availabilityScore", "programScore", "punctualityScore", "overallScore"] as const;
const MIN_EVALUATIONS_FOR_DISPLAY = 5;

// ─── ADMIN ────────────────────────────────────────────────────────────────────

// GET /api/admin/evaluations/periods
router.get("/admin/evaluations/periods", requireRole("admin"), async (req, res) => {
  try {
    const periods = await db
      .select({
        id: evaluationPeriodsTable.id,
        semesterId: evaluationPeriodsTable.semesterId,
        semesterName: semestersTable.name,
        deadline: evaluationPeriodsTable.deadline,
        isActive: evaluationPeriodsTable.isActive,
        resultsVisible: evaluationPeriodsTable.resultsVisible,
        createdAt: evaluationPeriodsTable.createdAt,
      })
      .from(evaluationPeriodsTable)
      .leftJoin(semestersTable, eq(evaluationPeriodsTable.semesterId, semestersTable.id))
      .orderBy(sql`${evaluationPeriodsTable.createdAt} DESC`);

    // Attach submission counts
    const result = await Promise.all(periods.map(async (p) => {
      const [{ total }] = await db
        .select({ total: count() })
        .from(teacherEvaluationsTable)
        .where(eq(teacherEvaluationsTable.periodId, p.id));
      const [{ submitters }] = await db
        .select({ submitters: sql<number>`count(distinct ${evaluationSubmissionsTable.studentId})` })
        .from(evaluationSubmissionsTable)
        .where(eq(evaluationSubmissionsTable.periodId, p.id));
      return { ...p, evaluationCount: Number(total), submitterCount: Number(submitters) };
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /api/admin/evaluations/periods
router.post("/admin/evaluations/periods", requireRole("admin"), async (req, res) => {
  try {
    const { semesterId, deadline, isActive } = req.body;
    if (!semesterId || !deadline) {
      return res.status(400).json({ error: "semesterId et deadline sont requis" });
    }

    // Deactivate any other active period for the same semester
    if (isActive) {
      await db
        .update(evaluationPeriodsTable)
        .set({ isActive: false })
        .where(and(
          eq(evaluationPeriodsTable.semesterId, parseInt(semesterId)),
          eq(evaluationPeriodsTable.isActive, true)
        ));
    }

    const [period] = await db
      .insert(evaluationPeriodsTable)
      .values({
        semesterId: parseInt(semesterId),
        deadline: new Date(deadline),
        isActive: isActive ?? false,
        resultsVisible: false,
        createdBy: req.session.userId ?? null,
      })
      .returning();

    // If activating, notify all enrolled students of this semester
    if (isActive) {
      await notifyStudentsOfSemester(period.id, period.semesterId);
    }

    res.json(period);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// PATCH /api/admin/evaluations/periods/:id
router.patch("/admin/evaluations/periods/:id", requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { deadline, isActive, resultsVisible } = req.body;

    const existing = await db.select().from(evaluationPeriodsTable).where(eq(evaluationPeriodsTable.id, id)).limit(1);
    if (!existing.length) return res.status(404).json({ error: "Période introuvable" });

    // If activating, deactivate others for same semester
    if (isActive === true) {
      await db
        .update(evaluationPeriodsTable)
        .set({ isActive: false })
        .where(and(
          eq(evaluationPeriodsTable.semesterId, existing[0].semesterId),
          eq(evaluationPeriodsTable.isActive, true)
        ));
    }

    const updates: Partial<typeof evaluationPeriodsTable.$inferSelect> = {};
    if (deadline !== undefined) updates.deadline = new Date(deadline);
    if (isActive !== undefined) updates.isActive = isActive;
    if (resultsVisible !== undefined) updates.resultsVisible = resultsVisible;

    const [updated] = await db
      .update(evaluationPeriodsTable)
      .set(updates)
      .where(eq(evaluationPeriodsTable.id, id))
      .returning();

    // Notify students when period is activated
    if (isActive === true && !existing[0].isActive) {
      await notifyStudentsOfSemester(id, existing[0].semesterId);
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /api/admin/evaluations/periods/:id/results
router.get("/admin/evaluations/periods/:id/results", requireRole("admin"), async (req, res) => {
  try {
    const periodId = parseInt(req.params.id);
    const [period] = await db.select().from(evaluationPeriodsTable).where(eq(evaluationPeriodsTable.id, periodId)).limit(1);
    if (!period) return res.status(404).json({ error: "Période introuvable" });
    if (!period.resultsVisible && period.isActive) {
      return res.status(403).json({ error: "Les résultats ne sont pas encore disponibles — la période est encore ouverte" });
    }

    // Aggregate scores per teacher
    const rows = await db
      .select({
        teacherId: teacherEvaluationsTable.teacherId,
        teacherName: usersTable.name,
        subjectId: teacherEvaluationsTable.subjectId,
        subjectName: subjectsTable.name,
        classId: teacherEvaluationsTable.classId,
        className: classesTable.name,
        totalCount: count(teacherEvaluationsTable.id),
        avgClarity: avg(teacherEvaluationsTable.clarityScore),
        avgMastery: avg(teacherEvaluationsTable.masteryScore),
        avgAvailability: avg(teacherEvaluationsTable.availabilityScore),
        avgProgram: avg(teacherEvaluationsTable.programScore),
        avgPunctuality: avg(teacherEvaluationsTable.punctualityScore),
        avgOverall: avg(teacherEvaluationsTable.overallScore),
      })
      .from(teacherEvaluationsTable)
      .leftJoin(usersTable, eq(teacherEvaluationsTable.teacherId, usersTable.id))
      .leftJoin(subjectsTable, eq(teacherEvaluationsTable.subjectId, subjectsTable.id))
      .leftJoin(classesTable, eq(teacherEvaluationsTable.classId, classesTable.id))
      .where(eq(teacherEvaluationsTable.periodId, periodId))
      .groupBy(
        teacherEvaluationsTable.teacherId,
        usersTable.name,
        teacherEvaluationsTable.subjectId,
        subjectsTable.name,
        teacherEvaluationsTable.classId,
        classesTable.name,
      );

    // Apply minimum threshold: only return teachers with ≥5 evaluations
    const filtered = rows.filter((r) => Number(r.totalCount) >= MIN_EVALUATIONS_FOR_DISPLAY);

    // Fetch comments for qualifying teachers
    const qualifyingTeacherIds = filtered.map((r) => r.teacherId);
    const comments = qualifyingTeacherIds.length > 0
      ? await db
          .select({
            teacherId: teacherEvaluationsTable.teacherId,
            comment: teacherEvaluationsTable.comment,
          })
          .from(teacherEvaluationsTable)
          .where(and(
            eq(teacherEvaluationsTable.periodId, periodId),
            inArray(teacherEvaluationsTable.teacherId, qualifyingTeacherIds)
          ))
      : [];

    const commentsByTeacher: Record<number, string[]> = {};
    for (const c of comments) {
      if (c.comment) {
        if (!commentsByTeacher[c.teacherId]) commentsByTeacher[c.teacherId] = [];
        commentsByTeacher[c.teacherId].push(c.comment);
      }
    }

    const results = filtered.map((r) => ({
      teacherId: r.teacherId,
      teacherName: r.teacherName,
      subjectId: r.subjectId,
      subjectName: r.subjectName,
      classId: r.classId,
      className: r.className,
      evaluationCount: Number(r.totalCount),
      avgClarity: round2(r.avgClarity),
      avgMastery: round2(r.avgMastery),
      avgAvailability: round2(r.avgAvailability),
      avgProgram: round2(r.avgProgram),
      avgPunctuality: round2(r.avgPunctuality),
      avgOverall: round2(r.avgOverall),
      globalAvg: round2(
        ((Number(r.avgClarity) + Number(r.avgMastery) + Number(r.avgAvailability) +
          Number(r.avgProgram) + Number(r.avgPunctuality) + Number(r.avgOverall)) / 6).toString()
      ),
      comments: commentsByTeacher[r.teacherId!] ?? [],
    }));

    // Sort by globalAvg desc (ranking)
    results.sort((a, b) => (b.globalAvg ?? 0) - (a.globalAvg ?? 0));

    res.json({ period, results, hiddenCount: rows.length - filtered.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /api/admin/evaluations/periods/:id/notify-reminder
router.post("/admin/evaluations/periods/:id/notify-reminder", requireRole("admin"), async (req, res) => {
  try {
    const periodId = parseInt(req.params.id);
    const [period] = await db.select().from(evaluationPeriodsTable).where(eq(evaluationPeriodsTable.id, periodId)).limit(1);
    if (!period) return res.status(404).json({ error: "Période introuvable" });

    const sent = await sendReminderNotifications(periodId, period.semesterId);
    res.json({ sent });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── STUDENT ──────────────────────────────────────────────────────────────────

// GET /api/student/evaluations/current
router.get("/student/evaluations/current", requireRole("student"), async (req, res) => {
  try {
    const studentId = req.session.userId!;

    // Get student's class
    const [enrollment] = await db
      .select({ classId: classEnrollmentsTable.classId })
      .from(classEnrollmentsTable)
      .where(eq(classEnrollmentsTable.studentId, studentId))
      .limit(1);

    if (!enrollment) return res.json({ period: null, teachers: [], submissions: [] });

    const classId = enrollment.classId;

    // Find active period
    const periods = await db
      .select()
      .from(evaluationPeriodsTable)
      .where(eq(evaluationPeriodsTable.isActive, true))
      .limit(1);

    if (!periods.length) return res.json({ period: null, teachers: [], submissions: [] });

    const period = periods[0];

    // Check deadline
    const now = new Date();
    if (now > period.deadline) {
      return res.json({ period: { ...period, expired: true }, teachers: [], submissions: [] });
    }

    // Get teachers assigned to this student's class for this semester
    const assignments = await db
      .select({
        teacherId: teacherAssignmentsTable.teacherId,
        teacherName: usersTable.name,
        subjectId: teacherAssignmentsTable.subjectId,
        subjectName: subjectsTable.name,
      })
      .from(teacherAssignmentsTable)
      .leftJoin(usersTable, eq(teacherAssignmentsTable.teacherId, usersTable.id))
      .leftJoin(subjectsTable, eq(teacherAssignmentsTable.subjectId, subjectsTable.id))
      .where(and(
        eq(teacherAssignmentsTable.classId, classId),
        eq(teacherAssignmentsTable.semesterId, period.semesterId)
      ));

    // Get already-submitted evaluations for this student
    const mySubmissions = await db
      .select({ teacherId: evaluationSubmissionsTable.teacherId })
      .from(evaluationSubmissionsTable)
      .where(and(
        eq(evaluationSubmissionsTable.periodId, period.id),
        eq(evaluationSubmissionsTable.studentId, studentId)
      ));

    const submittedTeacherIds = new Set(mySubmissions.map((s) => s.teacherId));

    const teachers = assignments.map((a) => ({
      ...a,
      submitted: submittedTeacherIds.has(a.teacherId!),
    }));

    res.json({ period, teachers, classId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /api/student/evaluations/submit
router.post("/student/evaluations/submit", requireRole("student"), async (req, res) => {
  try {
    const studentId = req.session.userId!;
    const { periodId, teacherId, subjectId, classId, clarityScore, masteryScore, availabilityScore, programScore, punctualityScore, overallScore, comment } = req.body;

    if (!periodId || !teacherId || !subjectId || !classId) {
      return res.status(400).json({ error: "periodId, teacherId, subjectId, classId sont requis" });
    }
    for (const score of [clarityScore, masteryScore, availabilityScore, programScore, punctualityScore, overallScore]) {
      if (!score || score < 1 || score > 5) {
        return res.status(400).json({ error: "Chaque critère doit être noté de 1 à 5" });
      }
    }

    // Verify period exists and is active
    const [period] = await db.select().from(evaluationPeriodsTable).where(eq(evaluationPeriodsTable.id, parseInt(periodId))).limit(1);
    if (!period) return res.status(404).json({ error: "Période introuvable" });
    if (!period.isActive) return res.status(403).json({ error: "La période d'évaluation n'est pas active" });
    if (new Date() > period.deadline) return res.status(403).json({ error: "La date limite d'évaluation est dépassée" });

    // Verify student is enrolled in the class
    const [enrollment] = await db
      .select()
      .from(classEnrollmentsTable)
      .where(and(
        eq(classEnrollmentsTable.studentId, studentId),
        eq(classEnrollmentsTable.classId, parseInt(classId))
      ))
      .limit(1);
    if (!enrollment) return res.status(403).json({ error: "Vous n'êtes pas inscrit dans cette classe" });

    // Verify teacher is assigned to this student's class+semester
    const [assignment] = await db
      .select()
      .from(teacherAssignmentsTable)
      .where(and(
        eq(teacherAssignmentsTable.teacherId, parseInt(teacherId)),
        eq(teacherAssignmentsTable.subjectId, parseInt(subjectId)),
        eq(teacherAssignmentsTable.classId, parseInt(classId)),
        eq(teacherAssignmentsTable.semesterId, period.semesterId)
      ))
      .limit(1);
    if (!assignment) return res.status(403).json({ error: "Cet enseignant n'intervient pas dans votre classe pour ce semestre" });

    // Check for duplicate (409)
    const [existing] = await db
      .select()
      .from(evaluationSubmissionsTable)
      .where(and(
        eq(evaluationSubmissionsTable.periodId, parseInt(periodId)),
        eq(evaluationSubmissionsTable.studentId, studentId),
        eq(evaluationSubmissionsTable.teacherId, parseInt(teacherId))
      ))
      .limit(1);
    if (existing) return res.status(409).json({ error: "Vous avez déjà soumis une évaluation pour cet enseignant" });

    // Insert anonymous evaluation (no studentId)
    await db.insert(teacherEvaluationsTable).values({
      periodId: parseInt(periodId),
      teacherId: parseInt(teacherId),
      subjectId: parseInt(subjectId),
      classId: parseInt(classId),
      clarityScore: parseInt(clarityScore),
      masteryScore: parseInt(masteryScore),
      availabilityScore: parseInt(availabilityScore),
      programScore: parseInt(programScore),
      punctualityScore: parseInt(punctualityScore),
      overallScore: parseInt(overallScore),
      comment: comment || null,
    });

    // Track submission for duplicate prevention (separate from evaluation)
    await db.insert(evaluationSubmissionsTable).values({
      periodId: parseInt(periodId),
      studentId,
      teacherId: parseInt(teacherId),
    });

    res.json({ message: "Évaluation soumise avec succès" });
  } catch (err: any) {
    if (err?.code === "23505") return res.status(409).json({ error: "Évaluation déjà soumise" });
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── TEACHER ─────────────────────────────────────────────────────────────────

// GET /api/teacher/evaluations/results
router.get("/teacher/evaluations/results", requireRole("teacher"), async (req, res) => {
  try {
    const teacherId = req.session.userId!;

    // Find the most recent period where results are visible
    const periods = await db
      .select()
      .from(evaluationPeriodsTable)
      .where(eq(evaluationPeriodsTable.resultsVisible, true))
      .orderBy(sql`${evaluationPeriodsTable.createdAt} DESC`);

    if (!periods.length) return res.json({ results: [], message: "Aucun résultat disponible pour le moment" });

    const allResults = await Promise.all(periods.map(async (period) => {
      const rows = await db
        .select({
          subjectId: teacherEvaluationsTable.subjectId,
          subjectName: subjectsTable.name,
          classId: teacherEvaluationsTable.classId,
          className: classesTable.name,
          totalCount: count(teacherEvaluationsTable.id),
          avgClarity: avg(teacherEvaluationsTable.clarityScore),
          avgMastery: avg(teacherEvaluationsTable.masteryScore),
          avgAvailability: avg(teacherEvaluationsTable.availabilityScore),
          avgProgram: avg(teacherEvaluationsTable.programScore),
          avgPunctuality: avg(teacherEvaluationsTable.punctualityScore),
          avgOverall: avg(teacherEvaluationsTable.overallScore),
        })
        .from(teacherEvaluationsTable)
        .leftJoin(subjectsTable, eq(teacherEvaluationsTable.subjectId, subjectsTable.id))
        .leftJoin(classesTable, eq(teacherEvaluationsTable.classId, classesTable.id))
        .where(and(
          eq(teacherEvaluationsTable.periodId, period.id),
          eq(teacherEvaluationsTable.teacherId, teacherId)
        ))
        .groupBy(
          teacherEvaluationsTable.subjectId,
          subjectsTable.name,
          teacherEvaluationsTable.classId,
          classesTable.name,
        );

      const qualified = rows.filter((r) => Number(r.totalCount) >= MIN_EVALUATIONS_FOR_DISPLAY);

      const comments = qualified.length > 0
        ? await db
            .select({ comment: teacherEvaluationsTable.comment })
            .from(teacherEvaluationsTable)
            .where(and(
              eq(teacherEvaluationsTable.periodId, period.id),
              eq(teacherEvaluationsTable.teacherId, teacherId)
            ))
        : [];

      return {
        periodId: period.id,
        semesterId: period.semesterId,
        deadline: period.deadline,
        rows: qualified.map((r) => ({
          subjectId: r.subjectId,
          subjectName: r.subjectName,
          classId: r.classId,
          className: r.className,
          evaluationCount: Number(r.totalCount),
          avgClarity: round2(r.avgClarity),
          avgMastery: round2(r.avgMastery),
          avgAvailability: round2(r.avgAvailability),
          avgProgram: round2(r.avgProgram),
          avgPunctuality: round2(r.avgPunctuality),
          avgOverall: round2(r.avgOverall),
          globalAvg: round2(
            ((Number(r.avgClarity) + Number(r.avgMastery) + Number(r.avgAvailability) +
              Number(r.avgProgram) + Number(r.avgPunctuality) + Number(r.avgOverall)) / 6).toString()
          ),
        })),
        comments: comments.filter((c) => c.comment).map((c) => c.comment!),
        belowThreshold: rows.length - qualified.length > 0,
      };
    }));

    res.json({ results: allResults.filter((r) => r.rows.length > 0 || r.comments.length > 0) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function round2(val: string | null | undefined): number | null {
  if (val === null || val === undefined) return null;
  return Math.round(Number(val) * 100) / 100;
}

async function notifyStudentsOfSemester(periodId: number, semesterId: number) {
  try {
    // Get all students enrolled in classes that have teachers for this semester
    const assignedClassIds = await db
      .selectDistinct({ classId: teacherAssignmentsTable.classId })
      .from(teacherAssignmentsTable)
      .where(eq(teacherAssignmentsTable.semesterId, semesterId));

    if (!assignedClassIds.length) return;

    const classIds = assignedClassIds.map((r) => r.classId);
    const enrolled = await db
      .select({ studentId: classEnrollmentsTable.studentId })
      .from(classEnrollmentsTable)
      .where(inArray(classEnrollmentsTable.classId, classIds));

    const studentIds = [...new Set(enrolled.map((e) => e.studentId))];
    if (!studentIds.length) return;

    const title = "Évaluation des enseignants ouverte";
    const message = "La période d'évaluation des enseignants est maintenant ouverte. Votre avis est anonyme et contribue à l'amélioration de la qualité pédagogique.";

    await db.insert(notificationsTable).values(
      studentIds.map((uid) => ({ userId: uid, type: "info" as any, title, message }))
    );
    studentIds.forEach((uid) =>
      sendPushToUser(uid, { title, body: message, type: "info" }).catch(() => {})
    );
  } catch (err) {
    console.error("notifyStudentsOfSemester error:", err);
  }
}

async function sendReminderNotifications(periodId: number, semesterId: number): Promise<number> {
  try {
    // Students who have NOT submitted all evaluations
    const assignedClassIds = await db
      .selectDistinct({ classId: teacherAssignmentsTable.classId })
      .from(teacherAssignmentsTable)
      .where(eq(teacherAssignmentsTable.semesterId, semesterId));

    if (!assignedClassIds.length) return 0;
    const classIds = assignedClassIds.map((r) => r.classId);

    const enrolled = await db
      .select({ studentId: classEnrollmentsTable.studentId })
      .from(classEnrollmentsTable)
      .where(inArray(classEnrollmentsTable.classId, classIds));

    const allStudentIds = [...new Set(enrolled.map((e) => e.studentId))];

    // Find students who submitted ALL their teachers
    const submitted = await db
      .select({ studentId: evaluationSubmissionsTable.studentId })
      .from(evaluationSubmissionsTable)
      .where(eq(evaluationSubmissionsTable.periodId, periodId));

    const submittedStudents = new Set(submitted.map((s) => s.studentId));
    const pending = allStudentIds.filter((id) => !submittedStudents.has(id));

    if (!pending.length) return 0;

    const title = "Rappel : Évaluation des enseignants";
    const message = "N'oubliez pas de compléter votre évaluation des enseignants avant la date limite. Votre avis est anonyme.";

    await db.insert(notificationsTable).values(
      pending.map((uid) => ({ userId: uid, type: "info" as any, title, message }))
    );
    pending.forEach((uid) =>
      sendPushToUser(uid, { title, body: message, type: "info" }).catch(() => {})
    );

    return pending.length;
  } catch (err) {
    console.error("sendReminderNotifications error:", err);
    return 0;
  }
}

export default router;
