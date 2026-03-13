import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  subjectsTable,
  classesTable,
  semestersTable,
  teacherAssignmentsTable,
  classEnrollmentsTable,
  attendanceTable,
  attendanceSessionsTable,
  notificationsTable,
} from "@workspace/db";
import { eq, and, desc, isNotNull } from "drizzle-orm";
import { requireRole } from "../lib/auth.js";

const router = Router();

// ─── Teacher: get attendance for a session ───────────────────────────────────
router.get("/teacher/attendance", requireRole("teacher", "admin"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;
    const { subjectId, classId, sessionDate } = req.query as Record<string, string>;
    if (!subjectId || !classId || !sessionDate) {
      res.status(400).json({ error: "subjectId, classId, sessionDate requis" });
      return;
    }
    const sId = parseInt(subjectId);
    const cId = parseInt(classId);

    const records = await db
      .select({
        studentId: attendanceTable.studentId,
        status: attendanceTable.status,
        note: attendanceTable.note,
      })
      .from(attendanceTable)
      .where(
        and(
          eq(attendanceTable.teacherId, teacherId),
          eq(attendanceTable.subjectId, sId),
          eq(attendanceTable.classId, cId),
          eq(attendanceTable.sessionDate, sessionDate)
        )
      );

    const [session] = await db
      .select()
      .from(attendanceSessionsTable)
      .where(
        and(
          eq(attendanceSessionsTable.teacherId, teacherId),
          eq(attendanceSessionsTable.subjectId, sId),
          eq(attendanceSessionsTable.classId, cId),
          eq(attendanceSessionsTable.sessionDate, sessionDate)
        )
      )
      .limit(1);

    res.json({ records, sentAt: session?.sentAt ?? null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Teacher: save attendance for a session ───────────────────────────────────
router.post("/teacher/attendance/save", requireRole("teacher", "admin"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;
    const { subjectId, classId, semesterId, sessionDate, records } = req.body as {
      subjectId: number;
      classId: number;
      semesterId: number;
      sessionDate: string;
      records: { studentId: number; status: string; note?: string }[];
    };
    if (!subjectId || !classId || !semesterId || !sessionDate || !Array.isArray(records)) {
      res.status(400).json({ error: "Données manquantes" });
      return;
    }

    for (const r of records) {
      await db
        .insert(attendanceTable)
        .values({
          teacherId,
          subjectId,
          classId,
          semesterId,
          sessionDate,
          studentId: r.studentId,
          status: r.status || "present",
          note: r.note ?? null,
        })
        .onConflictDoUpdate({
          target: [
            attendanceTable.teacherId,
            attendanceTable.subjectId,
            attendanceTable.classId,
            attendanceTable.sessionDate,
            attendanceTable.studentId,
          ],
          set: { status: r.status || "present", note: r.note ?? null },
        });
    }

    res.json({ message: "Présences enregistrées" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Teacher: send session to scolarité ──────────────────────────────────────
router.post("/teacher/attendance/send", requireRole("teacher", "admin"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;
    const { subjectId, classId, semesterId, sessionDate } = req.body as {
      subjectId: number;
      classId: number;
      semesterId: number;
      sessionDate: string;
    };

    if (!subjectId || !classId || !semesterId || !sessionDate) {
      res.status(400).json({ error: "Données manquantes" });
      return;
    }

    const now = new Date();

    await db
      .insert(attendanceSessionsTable)
      .values({ teacherId, subjectId, classId, semesterId, sessionDate, sentAt: now })
      .onConflictDoUpdate({
        target: [
          attendanceSessionsTable.teacherId,
          attendanceSessionsTable.subjectId,
          attendanceSessionsTable.classId,
          attendanceSessionsTable.sessionDate,
        ],
        set: { sentAt: now },
      });

    const [teacher] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, teacherId)).limit(1);
    const [subject] = await db.select({ name: subjectsTable.name }).from(subjectsTable).where(eq(subjectsTable.id, subjectId)).limit(1);
    const [classe] = await db.select({ name: classesTable.name }).from(classesTable).where(eq(classesTable.id, classId)).limit(1);

    const scolariteAdmins = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.role, "admin"), eq(usersTable.adminSubRole, "scolarite")));

    const msgTitle = `Feuille de présence — ${subject?.name ?? ""}`;
    const msgBody = `${teacher?.name ?? "L'enseignant"} a transmis la feuille de présence pour ${classe?.name ?? ""} (${sessionDate}).`;

    for (const admin of scolariteAdmins) {
      await db.insert(notificationsTable).values({
        userId: admin.id,
        type: "attendance_submitted",
        title: msgTitle,
        message: msgBody,
        read: false,
      });
    }

    res.json({ message: "Feuille transmise à la scolarité", sentAt: now });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Admin: list all sent sessions ───────────────────────────────────────────
router.get("/admin/attendance/sessions", requireRole("admin"), async (req, res) => {
  try {
    const sessions = await db
      .select({
        id: attendanceSessionsTable.id,
        teacherId: attendanceSessionsTable.teacherId,
        teacherName: usersTable.name,
        subjectId: attendanceSessionsTable.subjectId,
        subjectName: subjectsTable.name,
        classId: attendanceSessionsTable.classId,
        className: classesTable.name,
        semesterId: attendanceSessionsTable.semesterId,
        semesterName: semestersTable.name,
        sessionDate: attendanceSessionsTable.sessionDate,
        sentAt: attendanceSessionsTable.sentAt,
      })
      .from(attendanceSessionsTable)
      .innerJoin(usersTable, eq(usersTable.id, attendanceSessionsTable.teacherId))
      .innerJoin(subjectsTable, eq(subjectsTable.id, attendanceSessionsTable.subjectId))
      .innerJoin(classesTable, eq(classesTable.id, attendanceSessionsTable.classId))
      .innerJoin(semestersTable, eq(semestersTable.id, attendanceSessionsTable.semesterId))
      .where(isNotNull(attendanceSessionsTable.sentAt))
      .orderBy(desc(attendanceSessionsTable.sentAt));

    res.json(sessions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Admin: get records for a specific session ───────────────────────────────
router.get("/admin/attendance/sessions/:id", requireRole("admin"), async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const [session] = await db
      .select()
      .from(attendanceSessionsTable)
      .where(eq(attendanceSessionsTable.id, sessionId))
      .limit(1);

    if (!session) { res.status(404).json({ error: "Session introuvable" }); return; }

    const records = await db
      .select({
        studentId: attendanceTable.studentId,
        studentName: usersTable.name,
        status: attendanceTable.status,
        note: attendanceTable.note,
      })
      .from(attendanceTable)
      .innerJoin(usersTable, eq(usersTable.id, attendanceTable.studentId))
      .where(
        and(
          eq(attendanceTable.teacherId, session.teacherId),
          eq(attendanceTable.subjectId, session.subjectId),
          eq(attendanceTable.classId, session.classId),
          eq(attendanceTable.sessionDate, session.sessionDate)
        )
      )
      .orderBy(usersTable.name);

    res.json({ session, records });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
