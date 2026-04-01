import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { db } from "@workspace/db";
import {
  usersTable,
  gradesTable,
  subjectsTable,
  semestersTable,
  classEnrollmentsTable,
  classesTable,
  studentProfilesTable,
  attendanceTable,
  absenceJustificationsTable,
  studentFeesTable,
  paymentsTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireRole } from "../lib/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, "../../uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const pdfUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const unique = `just-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
      cb(null, `${unique}${path.extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Seuls les fichiers PDF sont acceptés."));
  },
});

const router = Router();

router.get("/me", requireRole("student", "admin"), async (req, res) => {
  try {
    const studentId = req.session!.userId!;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, studentId)).limit(1);
    if (!user) { res.status(404).json({ error: "Not Found" }); return; }

    const [enroll] = await db
      .select({
        classId: classEnrollmentsTable.classId,
        className: classesTable.name,
        filiere: classesTable.filiere,
        isTerminal: classesTable.isTerminal,
      })
      .from(classEnrollmentsTable)
      .innerJoin(classesTable, eq(classesTable.id, classEnrollmentsTable.classId))
      .where(eq(classEnrollmentsTable.studentId, studentId))
      .limit(1);

    const [profile] = await db.select().from(studentProfilesTable).where(eq(studentProfilesTable.studentId, studentId)).limit(1);

    const activeSemester = await db
      .select({ id: semestersTable.id, name: semestersTable.name, startDate: semestersTable.startDate, endDate: semestersTable.endDate })
      .from(semestersTable)
      .orderBy(semestersTable.id)
      .then(rows => {
        const now = new Date();
        const active = rows.find(s => {
          if (!s.startDate || !s.endDate) return false;
          return new Date(s.startDate) <= now && now <= new Date(s.endDate);
        });
        return active ?? null;
      });

    res.json({
      id: user.id, name: user.name, email: user.email,
      classId: enroll?.classId ?? null,
      className: enroll?.className ?? null,
      filiere: enroll?.filiere ?? null,
      isTerminal: enroll?.isTerminal ?? false,
      photoUrl: profile?.photoUrl ?? null,
      matricule: profile?.matricule ?? null,
      dateNaissance: profile?.dateNaissance ?? null,
      lieuNaissance: profile?.lieuNaissance ?? null,
      phone: profile?.phone ?? null,
      address: profile?.address ?? null,
      parentName: profile?.parentName ?? null,
      parentPhone: profile?.parentPhone ?? null,
      parentEmail: profile?.parentEmail ?? null,
      parentAddress: profile?.parentAddress ?? null,
      activeSemester: activeSemester,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/photo", requireRole("student"), async (req, res) => {
  try {
    const studentId = req.session!.userId!;
    const { photoUrl } = req.body;
    if (!photoUrl || typeof photoUrl !== "string") {
      res.status(400).json({ error: "Bad Request", message: "photoUrl is required" });
      return;
    }
    if (photoUrl.length > 10 * 1024 * 1024) {
      res.status(400).json({ error: "Bad Request", message: "Image trop grande (max 7MB)" });
      return;
    }
    const [existing] = await db.select().from(studentProfilesTable).where(eq(studentProfilesTable.studentId, studentId)).limit(1);
    if (existing) {
      await db.update(studentProfilesTable).set({ photoUrl, updatedAt: new Date() }).where(eq(studentProfilesTable.studentId, studentId));
    } else {
      await db.insert(studentProfilesTable).values({ studentId, photoUrl, updatedAt: new Date() });
    }
    res.json({ photoUrl });
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

// ─── Absence Justifications (student) ────────────────────────────────────────

// Upload justification PDF
router.post("/justifications/upload", requireRole("student"), (req, res) => {
  pdfUpload.single("file")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message ?? "Erreur upload fichier." });
    }
    if (!req.file) {
      return res.status(400).json({ error: "Aucun fichier reçu." });
    }
    const fileUrl = `/api/uploads/${req.file.filename}`;
    return res.json({ fileUrl });
  });
});

router.post("/justifications", requireRole("student"), async (req, res) => {
  try {
    const studentId = req.session!.userId!;
    const { attendanceId, reason, fileUrl } = req.body;
    if (!attendanceId || !reason?.trim()) {
      res.status(400).json({ error: "Bad Request", message: "attendanceId et raison sont obligatoires." });
      return;
    }
    // Verify the attendance record belongs to this student and is an absence/late
    const [record] = await db.select().from(attendanceTable)
      .where(and(eq(attendanceTable.id, attendanceId), eq(attendanceTable.studentId, studentId)))
      .limit(1);
    if (!record) { res.status(404).json({ error: "Absence introuvable." }); return; }
    if (record.status === "present") {
      res.status(400).json({ error: "Impossible de justifier une présence." }); return;
    }
    // Upsert: if a justification already exists, update; else insert
    const [existing] = await db.select().from(absenceJustificationsTable)
      .where(eq(absenceJustificationsTable.attendanceId, attendanceId)).limit(1);
    if (existing) {
      if (existing.status !== "pending") {
        res.status(409).json({ error: "Cette absence a déjà été traitée.", status: existing.status }); return;
      }
      const [updated] = await db.update(absenceJustificationsTable)
        .set({ reason: reason.trim(), fileUrl: fileUrl ?? existing.fileUrl, updatedAt: new Date() })
        .where(eq(absenceJustificationsTable.id, existing.id))
        .returning();
      res.json(updated); return;
    }
    const [created] = await db.insert(absenceJustificationsTable)
      .values({ attendanceId, studentId, reason: reason.trim(), fileUrl: fileUrl ?? null })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/justifications", requireRole("student"), async (req, res) => {
  try {
    const studentId = req.session!.userId!;
    const justifications = await db.select()
      .from(absenceJustificationsTable)
      .where(eq(absenceJustificationsTable.studentId, studentId));
    res.json(justifications);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── GET /student/balance — solde de scolarité de l'étudiant connecté ─────────
// ─── Cahier de texte étudiant (T002) ─────────────────────────────────────────

router.get("/cahier-de-texte", requireRole("student"), async (req, res) => {
  try {
    const studentId = req.session!.userId!;

    const enrollment = await db
      .select({ classId: classEnrollmentsTable.classId })
      .from(classEnrollmentsTable)
      .where(eq(classEnrollmentsTable.studentId, studentId))
      .orderBy(sql`enrolled_at DESC`)
      .limit(1);

    if (!enrollment.length) {
      res.json([]);
      return;
    }

    const classId = enrollment[0].classId;

    const entries = await db.execute(sql`
      SELECT
        c.id,
        c.session_date AS "sessionDate",
        c.title,
        c.contenu,
        c.devoirs,
        c.heures_effectuees AS "heuresEffectuees",
        s.name AS "subjectName",
        sem.name AS "semesterName",
        u.name AS "teacherName"
      FROM cahier_de_texte c
      INNER JOIN subjects s ON s.id = c.subject_id
      INNER JOIN semesters sem ON sem.id = c.semester_id
      INNER JOIN users u ON u.id = c.teacher_id
      WHERE c.class_id = ${classId}
      ORDER BY c.session_date DESC, s.name ASC
    `);

    res.json(entries.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/balance", requireRole("student"), async (req, res) => {
  try {
    const studentId = req.session!.userId!;

    const [fee] = await db
      .select()
      .from(studentFeesTable)
      .where(eq(studentFeesTable.studentId, studentId))
      .limit(1);

    const [paidRow] = await db
      .select({ totalPaid: sql<number>`COALESCE(SUM(${paymentsTable.amount}), 0)` })
      .from(paymentsTable)
      .where(eq(paymentsTable.studentId, studentId));

    const totalDue = fee ? Number(fee.totalAmount) : 0;
    const totalPaid = Number(paidRow?.totalPaid ?? 0);
    const remaining = Math.max(0, totalDue - totalPaid);

    const payments = await db
      .select({
        id: paymentsTable.id,
        amount: paymentsTable.amount,
        description: paymentsTable.description,
        paymentDate: paymentsTable.paymentDate,
        recordedByName: usersTable.name,
      })
      .from(paymentsTable)
      .leftJoin(usersTable, eq(usersTable.id, paymentsTable.recordedById))
      .where(eq(paymentsTable.studentId, studentId))
      .orderBy(paymentsTable.paymentDate);

    res.json({
      totalDue,
      totalPaid,
      remaining,
      academicYear: fee?.academicYear ?? null,
      status: totalDue === 0 ? "non_configure" : totalPaid >= totalDue ? "solde" : totalPaid > 0 ? "partiel" : "impaye",
      payments,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
