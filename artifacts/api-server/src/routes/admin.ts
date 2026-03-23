import { Router } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { generateBulletinHTML } from "../lib/bulletin-html.js";
import { notifyStudentsOfClasses } from "./notifications.js";
import {
  usersTable,
  classesTable,
  classEnrollmentsTable,
  subjectsTable,
  semestersTable,
  gradesTable,
  teacherAssignmentsTable,
  subjectApprovalsTable,
  gradeSubmissionsTable,
  activityLogTable,
  attendanceTable,
  teachingUnitsTable,
  classFeesTable,
  studentFeesTable,
  studentProfilesTable,
  academicYearArchivesTable,
  ecolesInphbTable,
} from "@workspace/db";
import { eq, and, sql, count, inArray, desc, ne, isNotNull } from "drizzle-orm";
import { requireRole } from "../lib/auth.js";

const router = Router();

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "cpec-u-salt").digest("hex");
}

async function applyClassFeeToStudent(studentId: number, classId: number) {
  const [classFee] = await db.select().from(classFeesTable).where(eq(classFeesTable.classId, classId)).limit(1);
  if (!classFee) return;
  await db.insert(studentFeesTable).values({
    studentId,
    totalAmount: classFee.totalAmount,
    academicYear: classFee.academicYear,
    notes: classFee.notes,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [studentFeesTable.studentId],
    set: {
      totalAmount: classFee.totalAmount,
      academicYear: classFee.academicYear,
      notes: classFee.notes,
      updatedAt: new Date(),
    },
  });
}

// ─── Users ───────────────────────────────────────────────────────────────────
router.get("/users", requireRole("admin"), async (req, res) => {
  try {
    const { role } = req.query;
    let usersQuery = db.select().from(usersTable);
    const users = role
      ? await db.select().from(usersTable).where(eq(usersTable.role, role as any))
      : await usersQuery;

    const enrollments = await db
      .select({ studentId: classEnrollmentsTable.studentId, classId: classEnrollmentsTable.classId, className: classesTable.name })
      .from(classEnrollmentsTable)
      .innerJoin(classesTable, eq(classesTable.id, classEnrollmentsTable.classId));

    const enrollmentMap = new Map(enrollments.map((e) => [e.studentId, { classId: e.classId, className: e.className }]));

    const result = users.map((u) => {
      const enroll = enrollmentMap.get(u.id);
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        adminSubRole: u.adminSubRole ?? null,
        classId: enroll?.classId ?? null,
        className: enroll?.className ?? null,
        phone: u.phone ?? null,
        createdAt: u.createdAt,
      };
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/users", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session?.user as any;
    const { email, name, password, role, adminSubRole, classId, phone } = req.body;
    if (!email || !name || !password || !role) {
      res.status(400).json({ error: "Bad Request", message: "Missing required fields" });
      return;
    }
    if (role === "admin" && cu?.adminSubRole !== "directeur") {
      res.status(403).json({ error: "Forbidden", message: "Seul le Directeur du Centre peut créer un compte administrateur." });
      return;
    }
    if (role === "teacher" && cu?.adminSubRole === "scolarite") {
      res.status(403).json({ error: "Forbidden", message: "L'Assistant(e) de Direction ne peut créer que des comptes étudiants." });
      return;
    }
    const passwordHash = hashPassword(password);
    const [user] = await db.insert(usersTable).values({
      email, name, passwordHash, role,
      adminSubRole: role === "admin" ? (adminSubRole ?? null) : null,
      phone: phone?.trim() || null,
      mustChangePassword: true,
    }).returning();

    if (classId && role === "student") {
      await db.insert(classEnrollmentsTable).values({ studentId: user.id, classId }).onConflictDoNothing();
      await applyClassFeeToStudent(user.id, classId);
    }

    const enroll = classId ? await db.select({ className: classesTable.name }).from(classesTable).where(eq(classesTable.id, classId)).limit(1) : [];
    res.status(201).json({
      id: user.id, email: user.email, name: user.name, role: user.role,
      adminSubRole: user.adminSubRole ?? null,
      classId: classId ?? null, className: enroll[0]?.className ?? null, createdAt: user.createdAt,
    });
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "Conflict", message: "Email already exists" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/users/:id", requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (!user) { res.status(404).json({ error: "Not Found" }); return; }
    const [enroll] = await db.select({ classId: classEnrollmentsTable.classId, className: classesTable.name })
      .from(classEnrollmentsTable).innerJoin(classesTable, eq(classesTable.id, classEnrollmentsTable.classId))
      .where(eq(classEnrollmentsTable.studentId, id)).limit(1);
    res.json({ id: user.id, email: user.email, name: user.name, role: user.role, adminSubRole: user.adminSubRole ?? null, classId: enroll?.classId ?? null, className: enroll?.className ?? null, createdAt: user.createdAt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/users/:id", requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { email, name, password, role, adminSubRole, classId } = req.body;
    const updates: any = {};
    if (email) updates.email = email;
    if (name) updates.name = name;
    if (password) updates.passwordHash = hashPassword(password);
    if (role) updates.role = role;
    if (adminSubRole !== undefined) updates.adminSubRole = adminSubRole;
    if (role && role !== "admin") updates.adminSubRole = null;
    updates.updatedAt = new Date();

    const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
    if (!user) { res.status(404).json({ error: "Not Found" }); return; }

    if (classId !== undefined) {
      await db.delete(classEnrollmentsTable).where(eq(classEnrollmentsTable.studentId, id));
      if (classId !== null && user.role === "student") {
        await db.insert(classEnrollmentsTable).values({ studentId: id, classId }).onConflictDoNothing();
        await applyClassFeeToStudent(id, classId);
      }
    }

    const [enroll] = await db.select({ classId: classEnrollmentsTable.classId, className: classesTable.name })
      .from(classEnrollmentsTable).innerJoin(classesTable, eq(classesTable.id, classEnrollmentsTable.classId))
      .where(eq(classEnrollmentsTable.studentId, id)).limit(1);

    res.json({ id: user.id, email: user.email, name: user.name, role: user.role, adminSubRole: user.adminSubRole ?? null, classId: enroll?.classId ?? null, className: enroll?.className ?? null, createdAt: user.createdAt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/users/:id", requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const currentUser = req.session.user!;

    // Restrictions selon le sous-rôle
    if (currentUser.adminSubRole === "planificateur" || currentUser.adminSubRole === "scolarite") {
      const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
      if (target && target.role === "admin") {
        res.status(403).json({ error: "Action non autorisée : suppression d'un administrateur interdite." });
        return;
      }
      if (currentUser.adminSubRole === "planificateur" && target && target.role === "student") {
        res.status(403).json({ error: "Un responsable pédagogique ne peut pas supprimer un étudiant." });
        return;
      }
      if (currentUser.adminSubRole === "scolarite" && target && target.role === "teacher") {
        res.status(403).json({ error: "Un(e) assistant(e) de direction ne peut pas supprimer un enseignant." });
        return;
      }
    }

    await db.delete(usersTable).where(eq(usersTable.id, id));
    res.json({ message: "User deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Student Extended Profile (contact + parents) ────────────────────────────
router.get("/students/:id/profile", requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [profile] = await db.select().from(studentProfilesTable).where(eq(studentProfilesTable.studentId, id)).limit(1);
    res.json(profile ?? { studentId: id, phone: null, address: null, parentName: null, parentPhone: null, parentEmail: null, parentAddress: null, photoUrl: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/students/:id/profile", requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { phone, address, parentName, parentPhone, parentEmail, parentAddress } = req.body;
    const [existing] = await db.select().from(studentProfilesTable).where(eq(studentProfilesTable.studentId, id)).limit(1);
    const data: any = { phone: phone ?? null, address: address ?? null, parentName: parentName ?? null, parentPhone: parentPhone ?? null, parentEmail: parentEmail ?? null, parentAddress: parentAddress ?? null, updatedAt: new Date() };
    let profile;
    if (existing) {
      [profile] = await db.update(studentProfilesTable).set(data).where(eq(studentProfilesTable.studentId, id)).returning();
    } else {
      [profile] = await db.insert(studentProfilesTable).values({ studentId: id, ...data }).returning();
    }
    res.json(profile);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Classes ─────────────────────────────────────────────────────────────────
router.get("/classes", requireRole("admin", "teacher"), async (req, res) => {
  try {
    const { asc } = await import("drizzle-orm");
    const classes = await db.select().from(classesTable).orderBy(asc(classesTable.orderIndex), asc(classesTable.id));
    const enrollCounts = await db
      .select({ classId: classEnrollmentsTable.classId, cnt: count(classEnrollmentsTable.studentId) })
      .from(classEnrollmentsTable)
      .groupBy(classEnrollmentsTable.classId);
    const countMap = new Map(enrollCounts.map((e) => [e.classId, Number(e.cnt)]));
    const result = classes.map((c) => ({ ...c, studentCount: countMap.get(c.id) ?? 0 }));
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/classes", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session?.user as any;
    if (cu?.adminSubRole === "scolarite") {
      res.status(403).json({ error: "Forbidden", message: "L'Assistant(e) de Direction ne peut pas créer de classe." });
      return;
    }
    const { name, description } = req.body;
    if (!name) { res.status(400).json({ error: "Bad Request", message: "Name is required" }); return; }
    // New class gets orderIndex = max + 1
    const existing = await db.select({ o: classesTable.orderIndex }).from(classesTable);
    const maxOrder = existing.length > 0 ? Math.max(...existing.map((c) => c.o)) : 0;
    const [cls] = await db.insert(classesTable).values({ name, description, orderIndex: maxOrder + 1 }).returning();
    res.status(201).json({ ...cls, studentCount: 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Move a class up or down
router.post("/classes/:id/move", requireRole("admin"), async (req, res) => {
  try {
    const { asc } = await import("drizzle-orm");
    const id = parseInt(req.params.id);
    const { direction } = req.body as { direction: "up" | "down" };
    if (!["up", "down"].includes(direction)) {
      res.status(400).json({ error: "direction must be 'up' or 'down'" });
      return;
    }
    const allClasses = await db.select({ id: classesTable.id, orderIndex: classesTable.orderIndex })
      .from(classesTable).orderBy(asc(classesTable.orderIndex), asc(classesTable.id));
    const idx = allClasses.findIndex((c) => c.id === id);
    if (idx === -1) { res.status(404).json({ error: "Not Found" }); return; }
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= allClasses.length) {
      res.json({ message: "Already at boundary" }); return;
    }
    const current = allClasses[idx];
    const other = allClasses[swapIdx];
    // Swap orderIndex values
    await db.update(classesTable).set({ orderIndex: other.orderIndex }).where(eq(classesTable.id, current.id));
    await db.update(classesTable).set({ orderIndex: current.orderIndex }).where(eq(classesTable.id, other.id));
    res.json({ message: "Moved" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/classes/:id", requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description, nextClassId, isTerminal } = req.body;
    const updateData: any = { name, description };
    if (nextClassId !== undefined) {
      updateData.nextClassId = nextClassId === null || nextClassId === "" ? null : parseInt(nextClassId);
    }
    if (isTerminal !== undefined) {
      updateData.isTerminal = Boolean(isTerminal);
      if (updateData.isTerminal) updateData.nextClassId = null; // terminal classes cannot promote
    }
    const [cls] = await db.update(classesTable).set(updateData).where(eq(classesTable.id, id)).returning();
    if (!cls) { res.status(404).json({ error: "Not Found" }); return; }
    const [ec] = await db.select({ cnt: count() }).from(classEnrollmentsTable).where(eq(classEnrollmentsTable.classId, id));
    res.json({ ...cls, studentCount: Number(ec?.cnt ?? 0) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/classes/:id", requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(classesTable).where(eq(classesTable.id, id));
    res.json({ message: "Class deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/classes/:id/students", requireRole("admin", "teacher"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const students = await db
      .select({ id: usersTable.id, email: usersTable.email, name: usersTable.name, role: usersTable.role, createdAt: usersTable.createdAt })
      .from(classEnrollmentsTable)
      .innerJoin(usersTable, eq(usersTable.id, classEnrollmentsTable.studentId))
      .where(eq(classEnrollmentsTable.classId, id));
    res.json(students.map((s) => ({ ...s, classId: id, className: null })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Subjects ─────────────────────────────────────────────────────────────────
async function enrichSubjects(subjects: any[]) {
  const classes = await db.select().from(classesTable);
  const semesters = await db.select().from(semestersTable);
  const ues = await db.select().from(teachingUnitsTable);
  const classMap = new Map(classes.map((c) => [c.id, c.name]));
  const semesterMap = new Map(semesters.map((s) => [s.id, s.name]));
  const ueMap = new Map(ues.map((u) => [u.id, u]));
  const assignments = await db.select({
    subjectId: teacherAssignmentsTable.subjectId,
    teacherId: teacherAssignmentsTable.teacherId,
    teacherName: usersTable.name,
  }).from(teacherAssignmentsTable).innerJoin(usersTable, eq(usersTable.id, teacherAssignmentsTable.teacherId));
  const assignMap = new Map(assignments.map((a) => [a.subjectId, { teacherId: a.teacherId, teacherName: a.teacherName }]));
  return subjects.map((s) => {
    const ue = s.ueId ? ueMap.get(s.ueId) : null;
    return {
      ...s,
      className: s.classId ? (classMap.get(s.classId) ?? null) : null,
      semesterName: s.semesterId ? (semesterMap.get(s.semesterId) ?? null) : null,
      ueCode: ue?.code ?? null,
      ueName: ue?.name ?? null,
      teacherId: assignMap.get(s.id)?.teacherId ?? null,
      teacherName: assignMap.get(s.id)?.teacherName ?? null,
    };
  });
}

router.get("/subjects", requireRole("admin", "teacher"), async (req, res) => {
  try {
    const subjects = await db.select().from(subjectsTable);
    res.json(await enrichSubjects(subjects));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/subjects", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session?.user as any;
    if (cu?.adminSubRole === "scolarite") {
      res.status(403).json({ error: "Forbidden", message: "L'Assistant(e) de Direction ne peut pas créer de matière." });
      return;
    }
    const { name, coefficient, credits, description, ueId, classId, semesterId } = req.body;
    if (!name || coefficient === undefined) { res.status(400).json({ error: "Bad Request", message: "Name and coefficient are required" }); return; }
    const [subj] = await db.insert(subjectsTable).values({ name, coefficient, credits: credits ?? null, description, ueId: ueId ?? null, classId: classId ?? null, semesterId: semesterId ?? null }).returning();
    const [enriched] = await enrichSubjects([subj]);
    res.status(201).json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/subjects/:id", requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, coefficient, credits, description, ueId, classId, semesterId } = req.body;
    const [subj] = await db.update(subjectsTable).set({ name, coefficient, credits: credits ?? null, description, ueId: ueId ?? null, classId: classId ?? null, semesterId: semesterId ?? null }).where(eq(subjectsTable.id, id)).returning();
    if (!subj) { res.status(404).json({ error: "Not Found" }); return; }
    const [enriched] = await enrichSubjects([subj]);
    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/subjects/:id", requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(subjectsTable).where(eq(subjectsTable.id, id));
    res.json({ message: "Subject deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Teaching Units (UE) ──────────────────────────────────────────────────────
router.get("/teaching-units", requireRole("admin", "teacher"), async (req, res) => {
  try {
    const { classId, semesterId } = req.query;
    let ues = await db.select().from(teachingUnitsTable);
    if (classId) ues = ues.filter(u => u.classId === parseInt(classId as string));
    if (semesterId) ues = ues.filter(u => u.semesterId === parseInt(semesterId as string));
    const classes = await db.select().from(classesTable);
    const semesters = await db.select().from(semestersTable);
    const classMap = new Map(classes.map((c) => [c.id, c.name]));
    const semesterMap = new Map(semesters.map((s) => [s.id, s.name]));
    res.json(ues.map(u => ({
      ...u,
      className: u.classId ? (classMap.get(u.classId) ?? null) : null,
      semesterName: u.semesterId ? (semesterMap.get(u.semesterId) ?? null) : null,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/teaching-units", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session?.user as any;
    if (cu?.adminSubRole === "scolarite") {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    const { code, name, category, credits, coefficient, classId, semesterId } = req.body;
    if (!code || !name || credits === undefined || coefficient === undefined) {
      res.status(400).json({ error: "Bad Request", message: "code, name, credits and coefficient are required" }); return;
    }
    const [ue] = await db.insert(teachingUnitsTable).values({ code, name, category: category ?? null, credits, coefficient, classId: classId ?? null, semesterId: semesterId ?? null }).returning();
    const cls = classId ? await db.select({ name: classesTable.name }).from(classesTable).where(eq(classesTable.id, classId)).limit(1) : [];
    const sem = semesterId ? await db.select({ name: semestersTable.name }).from(semestersTable).where(eq(semestersTable.id, semesterId)).limit(1) : [];
    res.status(201).json({ ...ue, className: cls[0]?.name ?? null, semesterName: sem[0]?.name ?? null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/teaching-units/:id", requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { code, name, category, credits, coefficient, classId, semesterId } = req.body;
    const [ue] = await db.update(teachingUnitsTable).set({ code, name, category: category ?? null, credits, coefficient, classId: classId ?? null, semesterId: semesterId ?? null }).where(eq(teachingUnitsTable.id, id)).returning();
    if (!ue) { res.status(404).json({ error: "Not Found" }); return; }
    const cls = ue.classId ? await db.select({ name: classesTable.name }).from(classesTable).where(eq(classesTable.id, ue.classId)).limit(1) : [];
    const sem = ue.semesterId ? await db.select({ name: semestersTable.name }).from(semestersTable).where(eq(semestersTable.id, ue.semesterId)).limit(1) : [];
    res.json({ ...ue, className: cls[0]?.name ?? null, semesterName: sem[0]?.name ?? null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/teaching-units/:id", requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(teachingUnitsTable).where(eq(teachingUnitsTable.id, id));
    res.json({ message: "Teaching unit deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Semesters ────────────────────────────────────────────────────────────────
router.get("/semesters", requireRole("admin", "teacher", "student"), async (req, res) => {
  try {
    const semesters = await db.select().from(semestersTable).orderBy(semestersTable.createdAt);
    res.json(semesters);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/semesters", requireRole("admin"), async (req, res) => {
  try {
    const { name, academicYear, startDate, endDate } = req.body;
    if (!name || !academicYear) { res.status(400).json({ error: "Bad Request", message: "Name and academicYear are required" }); return; }
    const [sem] = await db.insert(semestersTable).values({ name, academicYear, startDate: startDate ?? null, endDate: endDate ?? null }).returning();
    res.status(201).json(sem);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/semesters/:id", requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, academicYear, startDate, endDate } = req.body;
    const [sem] = await db.update(semestersTable).set({ name, academicYear, startDate, endDate }).where(eq(semestersTable.id, id)).returning();
    if (!sem) { res.status(404).json({ error: "Not Found" }); return; }
    res.json(sem);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/semesters/:id/publish", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session.user!;
    if (cu.adminSubRole !== "scolarite" && cu.adminSubRole !== "directeur") {
      res.status(403).json({ error: "La publication des résultats est réservée au Directeur du Centre et à l'Assistant(e) de Direction." });
      return;
    }
    const id = parseInt(req.params.id);
    const { published } = req.body;
    const [sem] = await db.update(semestersTable).set({ published: !!published }).where(eq(semestersTable.id, id)).returning();
    if (!sem) { res.status(404).json({ error: "Not Found" }); return; }
    // Log to activity
    await db.insert(activityLogTable).values({
      userId: cu.id,
      action: published ? "publication_resultats" : "depublication_resultats",
      details: `Semestre ID ${id} — résultats ${published ? "publiés" : "dépubliés"}.`,
    });
    // Notify all enrolled students when results are published
    if (published) {
      const allClasses = await db.select({ id: classesTable.id }).from(classesTable);
      const classIds = allClasses.map(c => c.id);
      notifyStudentsOfClasses(
        classIds,
        "results_published",
        "Résultats disponibles",
        `Les résultats du semestre "${sem.name}" (${sem.academicYear}) sont désormais disponibles. Consultez votre espace étudiant.`
      ).catch(console.error);
    }
    res.json(sem);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Promote admitted students to next class
router.post("/semesters/:id/promote", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session.user!;
    if (cu.adminSubRole !== "scolarite" && cu.adminSubRole !== "directeur") {
      res.status(403).json({ error: "Réservé au Assistant(e) de Direction." });
      return;
    }
    const semesterId = parseInt(req.params.id);
    const { classId: classIdParam } = req.body;
    if (!classIdParam) {
      res.status(400).json({ error: "classId requis." });
      return;
    }
    const classId = parseInt(classIdParam);

    // Fetch class and its next class
    const [cls] = await db.select().from(classesTable).where(eq(classesTable.id, classId)).limit(1);
    if (!cls) { res.status(404).json({ error: "Classe introuvable." }); return; }
    if (cls.isTerminal) {
      res.status(400).json({ error: "Cette classe est marquée comme fin de cycle. Aucune promotion possible." });
      return;
    }
    if (!cls.nextClassId) {
      res.status(400).json({ error: "Aucune classe supérieure configurée pour cette classe." });
      return;
    }
    const nextClassId = cls.nextClassId;

    // Get all semesters of the same academic year (Rule 4: student must pass ALL semesters)
    const [currentSem] = await db.select().from(semestersTable).where(eq(semestersTable.id, semesterId)).limit(1);
    if (!currentSem) { res.status(404).json({ error: "Semestre introuvable." }); return; }

    const yearSemesters = await db
      .select({ id: semestersTable.id, name: semestersTable.name })
      .from(semestersTable)
      .where(eq(semestersTable.academicYear, currentSem.academicYear));

    // Get all students in this class
    const enrollments = await db
      .select({ studentId: classEnrollmentsTable.studentId })
      .from(classEnrollmentsTable)
      .where(eq(classEnrollmentsTable.classId, classId));

    const promoted: { id: number; name: string }[] = [];
    const notPromoted: { name: string; reason: string }[] = [];

    for (const { studentId } of enrollments) {
      // Rule 4: student must be "Admis" in ALL semesters of the academic year
      let isAnnuallyAdmis = true;
      const semesterDetails: string[] = [];

      for (const sem of yearSemesters) {
        const result = await computeStudentResult(studentId, sem.id);
        if (!result || result.decision !== "Admis") {
          isAnnuallyAdmis = false;
          semesterDetails.push(`${sem.name}: ${result?.decision ?? "Non calculé"}`);
        }
      }

      if (!isAnnuallyAdmis) {
        const [student] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, studentId)).limit(1);
        notPromoted.push({ name: student?.name ?? "Étudiant inconnu", reason: semesterDetails.join(", ") });
        continue;
      }

      // Remove from current class
      await db.delete(classEnrollmentsTable).where(
        and(eq(classEnrollmentsTable.studentId, studentId), eq(classEnrollmentsTable.classId, classId))
      );
      // Insert into next class (ignore if already enrolled)
      await db.insert(classEnrollmentsTable).values({ studentId, classId: nextClassId }).onConflictDoNothing();

      const [student] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, studentId)).limit(1);
      promoted.push({ id: studentId, name: student?.name ?? "Étudiant inconnu" });
    }

    // Log activity
    await db.insert(activityLogTable).values({
      userId: cu.id,
      action: "promotion_etudiants",
      details: `${promoted.length} étudiant(s) promus de "${cls.name}" vers la classe supérieure (année ${currentSem.academicYear}). Non promus: ${notPromoted.length}.`,
    });

    res.json({ promoted, fromClass: cls.name, toClassId: nextClassId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Annual Promotion ─────────────────────────────────────────────────────────

async function computeAnnualDecision(studentId: number, yearSemesters: { id: number; name: string }[]): Promise<{ decision: "Admis" | "Ajourné" | "En attente"; semesterDecisions: string[] }> {
  const semesterDecisions: string[] = [];
  let hasAjourné = false;
  let hasPending = false;
  for (const sem of yearSemesters) {
    const result = await computeStudentResult(studentId, sem.id);
    const d = result?.decision ?? "En attente";
    semesterDecisions.push(`${sem.name}: ${d}`);
    if (d === "Ajourné") hasAjourné = true;
    if (d === "En attente") hasPending = true;
  }
  const decision = hasAjourné ? "Ajourné" : hasPending ? "En attente" : "Admis";
  return { decision, semesterDecisions };
}

// GET /admin/annual-promotion/preview?academicYear=X — preview without changes
router.get("/annual-promotion/preview", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session.user!;
    if (cu.adminSubRole !== "scolarite" && cu.adminSubRole !== "directeur") {
      res.status(403).json({ error: "Réservé au Assistant(e) de Direction." }); return;
    }
    const { academicYear } = req.query;
    if (!academicYear) { res.status(400).json({ error: "academicYear requis." }); return; }

    const yearSemesters = await db
      .select({ id: semestersTable.id, name: semestersTable.name })
      .from(semestersTable)
      .where(eq(semestersTable.academicYear, academicYear as string));

    if (yearSemesters.length === 0) {
      res.status(404).json({ error: "Aucun semestre trouvé pour cette année académique." }); return;
    }

    const allClasses = await db.select().from(classesTable);
    const promotableClasses = allClasses.filter(c => !c.isTerminal && c.nextClassId);

    const classResults = await Promise.all(promotableClasses.map(async (cls) => {
      const nextCls = allClasses.find(c => c.id === cls.nextClassId);
      const enrollments = await db
        .select({ studentId: classEnrollmentsTable.studentId })
        .from(classEnrollmentsTable)
        .where(eq(classEnrollmentsTable.classId, cls.id));

      const students = await Promise.all(enrollments.map(async ({ studentId }) => {
        const [user] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, studentId)).limit(1);
        const { decision, semesterDecisions } = await computeAnnualDecision(studentId, yearSemesters);
        return { id: studentId, name: user?.name ?? "—", decision, semesterDecisions };
      }));

      return {
        classId: cls.id,
        className: cls.name,
        nextClassId: cls.nextClassId,
        nextClassName: nextCls?.name ?? "—",
        students,
        admittedCount: students.filter(s => s.decision === "Admis").length,
        deferredCount: students.filter(s => s.decision === "Ajourné").length,
        pendingCount: students.filter(s => s.decision === "En attente").length,
      };
    }));

    res.json({ academicYear, semesters: yearSemesters.map(s => s.name), classes: classResults });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /admin/annual-promotion — launch full annual promotion for all classes
router.post("/annual-promotion", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session.user!;
    if (cu.adminSubRole !== "scolarite" && cu.adminSubRole !== "directeur") {
      res.status(403).json({ error: "Réservé au Assistant(e) de Direction." }); return;
    }
    const { academicYear } = req.body;
    if (!academicYear) { res.status(400).json({ error: "academicYear requis." }); return; }

    const yearSemesters = await db
      .select({ id: semestersTable.id, name: semestersTable.name })
      .from(semestersTable)
      .where(eq(semestersTable.academicYear, academicYear as string));

    if (yearSemesters.length === 0) {
      res.status(404).json({ error: "Aucun semestre trouvé pour cette année académique." }); return;
    }

    const allClasses = await db.select().from(classesTable);
    const promotableClasses = allClasses.filter(c => !c.isTerminal && c.nextClassId);

    const results = [];
    let totalPromoted = 0;

    for (const cls of promotableClasses) {
      const nextCls = allClasses.find(c => c.id === cls.nextClassId)!;
      const enrollments = await db
        .select({ studentId: classEnrollmentsTable.studentId })
        .from(classEnrollmentsTable)
        .where(eq(classEnrollmentsTable.classId, cls.id));

      const promoted: { id: number; name: string }[] = [];
      const notPromoted: { name: string; reason: string }[] = [];

      for (const { studentId } of enrollments) {
        const [user] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, studentId)).limit(1);
        const { decision, semesterDecisions } = await computeAnnualDecision(studentId, yearSemesters);

        if (decision === "Admis") {
          await db.delete(classEnrollmentsTable).where(
            and(eq(classEnrollmentsTable.studentId, studentId), eq(classEnrollmentsTable.classId, cls.id))
          );
          await db.insert(classEnrollmentsTable).values({ studentId, classId: cls.nextClassId! }).onConflictDoNothing();
          promoted.push({ id: studentId, name: user?.name ?? "—" });
        } else {
          notPromoted.push({ name: user?.name ?? "—", reason: semesterDecisions.join(", ") });
        }
      }

      totalPromoted += promoted.length;
      results.push({
        classId: cls.id,
        className: cls.name,
        nextClassId: cls.nextClassId!,
        nextClassName: nextCls?.name ?? "—",
        promoted,
        notPromoted,
      });
    }

    await db.insert(activityLogTable).values({
      userId: cu.id,
      action: "promotion_annuelle",
      details: `Promotion annuelle ${academicYear} : ${totalPromoted} étudiant(s) promu(s) sur ${promotableClasses.length} classe(s).`,
    });

    res.json({ academicYear, results, totalPromoted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /admin/annual-promotion/rollback — reverse a previously launched promotion
router.post("/annual-promotion/rollback", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session.user!;
    if (cu.adminSubRole !== "scolarite" && cu.adminSubRole !== "directeur") {
      res.status(403).json({ error: "Réservé au Assistant(e) de Direction." }); return;
    }

    // Expects: { academicYear, results: [{classId, nextClassId, promoted: [{id}]}] }
    const { academicYear, results } = req.body as {
      academicYear: string;
      results: { classId: number; nextClassId: number; promoted: { id: number; name: string }[] }[];
    };

    if (!academicYear || !Array.isArray(results)) {
      res.status(400).json({ error: "Données de révocation invalides." }); return;
    }

    let totalReverted = 0;

    for (const entry of results) {
      for (const student of entry.promoted) {
        // Remove from promoted class
        await db.delete(classEnrollmentsTable).where(
          and(eq(classEnrollmentsTable.studentId, student.id), eq(classEnrollmentsTable.classId, entry.nextClassId))
        );
        // Restore to original class
        await db.insert(classEnrollmentsTable).values({ studentId: student.id, classId: entry.classId }).onConflictDoNothing();
        totalReverted++;
      }
    }

    await db.insert(activityLogTable).values({
      userId: cu.id,
      action: "revocation_promotion_annuelle",
      details: `Révocation promotion annuelle ${academicYear} : ${totalReverted} étudiant(s) remis dans leur classe d'origine.`,
    });

    res.json({ ok: true, totalReverted, academicYear });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Archive & Initialize Year ────────────────────────────────────────────────

// GET /admin/archives — list all archived academic years
router.get("/archives", requireRole("admin"), async (req, res) => {
  try {
    const archives = await db
      .select()
      .from(academicYearArchivesTable)
      .orderBy(desc(academicYearArchivesTable.archivedAt));
    res.json(archives);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /admin/archives/:academicYear — detailed view of an archived year
router.get("/archives/:academicYear", requireRole("admin"), async (req, res) => {
  try {
    const { academicYear } = req.params;
    const [archive] = await db
      .select()
      .from(academicYearArchivesTable)
      .where(eq(academicYearArchivesTable.academicYear, academicYear))
      .limit(1);
    if (!archive) { res.status(404).json({ error: "Archive non trouvée." }); return; }

    // Fetch all semesters of this year
    const semesters = await db
      .select()
      .from(semestersTable)
      .where(eq(semestersTable.academicYear, academicYear))
      .orderBy(semestersTable.id);

    // Fetch all classes (just names for reference)
    const classes = await db.select({ id: classesTable.id, name: classesTable.name }).from(classesTable);

    // Fetch all enrollments active during this year (students)
    const enrollments = await db
      .select({
        studentId: classEnrollmentsTable.studentId,
        studentName: usersTable.name,
        classId: classEnrollmentsTable.classId,
        className: classesTable.name,
      })
      .from(classEnrollmentsTable)
      .innerJoin(usersTable, eq(usersTable.id, classEnrollmentsTable.studentId))
      .innerJoin(classesTable, eq(classesTable.id, classEnrollmentsTable.classId));

    const semesterIds = semesters.map((s) => s.id);

    // Fetch grades aggregated per student per semester
    let gradeRows: { studentId: number; semesterId: number; average: number | null; decision: string | null }[] = [];
    if (semesterIds.length > 0) {
      const rawGrades = await db
        .select({
          studentId: gradesTable.studentId,
          semesterId: gradesTable.semesterId,
          grade: gradesTable.grade,
          coefficient: subjectsTable.coefficient,
        })
        .from(gradesTable)
        .innerJoin(subjectsTable, eq(subjectsTable.id, gradesTable.subjectId))
        .where(inArray(gradesTable.semesterId, semesterIds));

      // Compute averages per student per semester
      const map = new Map<string, { sum: number; totalCoef: number }>();
      for (const row of rawGrades) {
        if (row.grade === null || row.grade === undefined) continue;
        const key = `${row.studentId}-${row.semesterId}`;
        const entry = map.get(key) ?? { sum: 0, totalCoef: 0 };
        entry.sum += Number(row.grade) * Number(row.coefficient || 1);
        entry.totalCoef += Number(row.coefficient || 1);
        map.set(key, entry);
      }
      for (const [key, { sum, totalCoef }] of map.entries()) {
        const [studentId, semesterId] = key.split("-").map(Number);
        const average = totalCoef > 0 ? parseFloat((sum / totalCoef).toFixed(2)) : null;
        const decision = average === null ? null : average >= 10 ? "Admis" : "Ajourné";
        gradeRows.push({ studentId, semesterId, average, decision });
      }
    }

    res.json({
      archive,
      semesters,
      classes,
      enrollments,
      grades: gradeRows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /admin/annual-promotion/archive — mark an academic year as archived
router.post("/annual-promotion/archive", requireRole("admin"), async (req, res) => {
  try {
    const { academicYear } = req.body as { academicYear: string };
    if (!academicYear) { res.status(400).json({ error: "academicYear requis." }); return; }

    // Check year exists (has semesters)
    const yearSemesters = await db
      .select({ id: semestersTable.id })
      .from(semestersTable)
      .where(eq(semestersTable.academicYear, academicYear));
    if (yearSemesters.length === 0) { res.status(400).json({ error: "Aucun semestre trouvé pour cette année." }); return; }

    // Check not already archived
    const [existing] = await db
      .select()
      .from(academicYearArchivesTable)
      .where(eq(academicYearArchivesTable.academicYear, academicYear))
      .limit(1);
    if (existing) { res.status(409).json({ error: "Cette année est déjà archivée." }); return; }

    const userId = (req.session as any)?.userId;
    const [archive] = await db
      .insert(academicYearArchivesTable)
      .values({ academicYear, archivedById: userId ?? null })
      .returning();

    await db.insert(activityLogTable).values({
      userId: userId ?? null,
      action: "archive_year",
      targetType: "academic_year",
      targetId: null,
      details: `Année académique ${academicYear} archivée.`,
    });

    res.json(archive);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /admin/annual-promotion/initialize-year — create semesters for new academic year
router.post("/annual-promotion/initialize-year", requireRole("admin"), async (req, res) => {
  try {
    const { fromAcademicYear, toAcademicYear } = req.body as {
      fromAcademicYear: string;
      toAcademicYear: string;
    };
    if (!fromAcademicYear || !toAcademicYear) {
      res.status(400).json({ error: "fromAcademicYear et toAcademicYear requis." });
      return;
    }
    if (fromAcademicYear === toAcademicYear) {
      res.status(400).json({ error: "L'année cible doit être différente de l'année source." });
      return;
    }

    // Verify archive exists for fromYear
    const [archive] = await db
      .select()
      .from(academicYearArchivesTable)
      .where(eq(academicYearArchivesTable.academicYear, fromAcademicYear))
      .limit(1);
    if (!archive) {
      res.status(400).json({ error: "L'année source doit d'abord être archivée avant l'initialisation." });
      return;
    }

    // Check target year doesn't already have semesters
    const existing = await db
      .select({ id: semestersTable.id })
      .from(semestersTable)
      .where(eq(semestersTable.academicYear, toAcademicYear));
    if (existing.length > 0) {
      res.status(409).json({ error: `L'année ${toAcademicYear} possède déjà des semestres.` });
      return;
    }

    // Copy semester names from the source year
    const sourceSemesters = await db
      .select()
      .from(semestersTable)
      .where(eq(semestersTable.academicYear, fromAcademicYear))
      .orderBy(semestersTable.id);

    const userId = (req.session as any)?.userId;

    const newSemesters = await db
      .insert(semestersTable)
      .values(
        sourceSemesters.map((s) => ({
          name: s.name.replace(fromAcademicYear, toAcademicYear),
          academicYear: toAcademicYear,
          published: false,
        }))
      )
      .returning();

    // Update archive record with new year info
    await db
      .update(academicYearArchivesTable)
      .set({ newAcademicYear: toAcademicYear, initializedAt: new Date(), initializedById: userId ?? null })
      .where(eq(academicYearArchivesTable.academicYear, fromAcademicYear));

    await db.insert(activityLogTable).values({
      userId: userId ?? null,
      action: "initialize_year",
      targetType: "academic_year",
      targetId: null,
      details: `Nouvelle année académique ${toAcademicYear} initialisée (${newSemesters.length} semestre(s) créé(s)).`,
    });

    res.json({ ok: true, toAcademicYear, semestersCreated: newSemesters.length, semesters: newSemesters });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Results ──────────────────────────────────────────────────────────────────
async function computeStudentResult(studentId: number, semesterId: number) {
  const [semester] = await db.select().from(semestersTable).where(eq(semestersTable.id, semesterId)).limit(1);
  const [student] = await db.select().from(usersTable).where(eq(usersTable.id, studentId)).limit(1);
  if (!student || !semester) return null;

  const [enroll] = await db
    .select({ classId: classEnrollmentsTable.classId, className: classesTable.name })
    .from(classEnrollmentsTable)
    .innerJoin(classesTable, eq(classesTable.id, classEnrollmentsTable.classId))
    .where(eq(classEnrollmentsTable.studentId, studentId))
    .limit(1);

  const classId = enroll?.classId ?? null;
  const className = enroll?.className ?? "";

  const subjects = classId
    ? await db.select().from(subjectsTable).where(
        and(
          eq(subjectsTable.classId, classId),
          eq(subjectsTable.semesterId, semesterId)
        )
      )
    : [];

  // Fetch teaching units for this class/semester
  const ues = classId
    ? await db.select().from(teachingUnitsTable).where(
        and(
          eq(teachingUnitsTable.classId, classId),
          eq(teachingUnitsTable.semesterId, semesterId)
        )
      )
    : [];

  const studentGrades = await db
    .select()
    .from(gradesTable)
    .where(and(eq(gradesTable.studentId, studentId), eq(gradesTable.semesterId, semesterId)));

  // Group evaluations by subject and compute average
  const gradeMap = new Map<number, { value: number; evaluations: { evaluationNumber: number; value: number }[] }>();
  for (const g of studentGrades) {
    if (!gradeMap.has(g.subjectId)) {
      const evals = studentGrades.filter(e => e.subjectId === g.subjectId);
      const avg = evals.reduce((s, e) => s + e.value, 0) / evals.length;
      gradeMap.set(g.subjectId, {
        value: Math.round(avg * 100) / 100,
        evaluations: evals.map(e => ({ evaluationNumber: e.evaluationNumber, value: e.value })),
      });
    }
  }

  const grades = subjects.map((s) => ({
    subjectId: s.id,
    subjectName: s.name,
    coefficient: s.coefficient,
    credits: s.credits,
    ueId: s.ueId,
    value: gradeMap.get(s.id)?.value ?? null,
    evaluations: gradeMap.get(s.id)?.evaluations ?? [],
  }));

  // ── LMD: Group subjects by UE and compute UE averages ───────────────────────
  const ueResults = ues.map((ue) => {
    const ueSubjects = grades.filter(g => g.ueId === ue.id);
    const gradedUeSubjects = ueSubjects.filter(g => g.value !== null);
    let ueAverage: number | null = null;
    if (gradedUeSubjects.length > 0) {
      const totalCoeff = gradedUeSubjects.reduce((s, g) => s + g.coefficient, 0);
      const totalPoints = gradedUeSubjects.reduce((s, g) => s + g.value! * g.coefficient, 0);
      ueAverage = totalCoeff > 0 ? Math.round((totalPoints / totalCoeff) * 100) / 100 : null;
    }
    const acquis = ueAverage !== null && ueAverage >= 10;
    return {
      ueId: ue.id,
      ueCode: ue.code,
      ueName: ue.name,
      credits: ue.credits,
      coefficient: ue.coefficient,
      average: ueAverage,
      acquis,
      subjects: ueSubjects,
    };
  });

  // Subjects not assigned to any UE
  const unassignedGrades = grades.filter(g => !g.ueId || !ues.find(u => u.id === g.ueId));

  let average: number | null = null;
  let decision: "Admis" | "Ajourné" | "En attente" = "En attente";

  // Compute semester average from UE averages (weighted by UE credits) + unassigned subjects
  const gradedSubjects = grades.filter((g) => g.value !== null);
  if (ues.length > 0) {
    const gradedUes = ueResults.filter(u => u.average !== null);
    const unassignedGraded = unassignedGrades.filter(g => g.value !== null);
    const totalCredits = gradedUes.reduce((s, u) => s + u.credits, 0);
    const totalPoints = gradedUes.reduce((s, u) => s + u.average! * u.credits, 0);
    const unassignedCoeff = unassignedGraded.reduce((s, g) => s + g.coefficient, 0);
    const unassignedPoints = unassignedGraded.reduce((s, g) => s + g.value! * g.coefficient, 0);
    const totalWeight = totalCredits + unassignedCoeff;
    const total = totalPoints + unassignedPoints;
    average = totalWeight > 0 ? Math.round((total / totalWeight) * 100) / 100 : null;
  } else if (gradedSubjects.length > 0) {
    const totalCoeff = gradedSubjects.reduce((sum, g) => sum + g.coefficient, 0);
    const totalPoints = gradedSubjects.reduce((sum, g) => sum + (g.value! * g.coefficient), 0);
    average = totalCoeff > 0 ? Math.round((totalPoints / totalCoeff) * 100) / 100 : null;
  }

  // Credits validated = sum of UE credits where UE average >= 10
  const creditsValidated = ueResults.filter(u => u.acquis).reduce((s, u) => s + u.credits, 0);
  const totalCredits = ueResults.reduce((s, u) => s + u.credits, 0);

  // ── Absence deduction: -0.1 per complete hour of absence ────────────────────
  let absenceDeductionHours = 0;
  let absenceDeduction = 0;
  if (average !== null) {
    const absenceRecords = await db
      .select({ startTime: attendanceTable.startTime, endTime: attendanceTable.endTime })
      .from(attendanceTable)
      .where(
        and(
          eq(attendanceTable.studentId, studentId),
          eq(attendanceTable.semesterId, semesterId),
          ne(attendanceTable.status, "present"),
          eq(attendanceTable.justified, false),
          isNotNull(attendanceTable.startTime),
          isNotNull(attendanceTable.endTime)
        )
      );

    let totalMinutes = 0;
    for (const r of absenceRecords) {
      if (r.startTime && r.endTime) {
        const [sh, sm] = r.startTime.split(":").map(Number);
        const [eh, em] = r.endTime.split(":").map(Number);
        const diff = (eh * 60 + em) - (sh * 60 + sm);
        if (diff > 0) totalMinutes += diff;
      }
    }
    absenceDeductionHours = Math.floor(totalMinutes / 60);
    absenceDeduction = Math.round(absenceDeductionHours * 0.1 * 100) / 100;
    average = Math.max(0, Math.round((average - absenceDeduction) * 100) / 100);
  }

  if (ues.length > 0) {
    // Rule 3: Semester validated if (1) ALL UEs validated (avg >= 10) AND (2) semester avg >= 12
    const uesWithGrades = ueResults.filter(u => u.average !== null);
    if (uesWithGrades.length === 0) {
      decision = "En attente";
    } else if (uesWithGrades.length < ueResults.length) {
      // Some UEs still missing grades — can already fail if any graded UE is not acquis
      const allAcquisSoFar = uesWithGrades.every(u => u.acquis);
      decision = allAcquisSoFar ? "En attente" : "Ajourné";
    } else {
      // All UEs have grades — both conditions must hold
      const allUesAcquis = ueResults.every(u => u.acquis);
      const averageOk = average !== null && average >= 12;
      decision = (allUesAcquis && averageOk) ? "Admis" : "Ajourné";
    }
  } else if (average !== null) {
    // No UE structure: fall back to overall average threshold alone
    decision = average >= 12 ? "Admis" : "Ajourné";
  }

  // Rule 5: Identify failure reasons for non-validated semesters
  const failedUes = ueResults
    .filter(u => u.average !== null && !u.acquis)
    .map(u => ({ ueId: u.ueId, ueCode: u.ueCode, ueName: u.ueName, average: u.average, acquis: false }));
  const averageFailed = decision === "Ajourné" && average !== null && average < 12;

  return {
    studentId, studentName: student.name,
    classId, className,
    semesterId, semesterName: semester.name,
    average, decision, grades,
    ueResults, creditsValidated, totalCredits,
    absenceDeductionHours, absenceDeduction,
    failedUes, averageFailed,
    rank: null, totalStudents: null,
  };
}

router.get("/results/:semesterId", requireRole("admin"), async (req, res) => {
  try {
    const semesterId = parseInt(req.params.semesterId);
    const { classId } = req.query;

    let students: any[];
    if (classId) {
      students = await db
        .select({ id: usersTable.id })
        .from(classEnrollmentsTable)
        .innerJoin(usersTable, eq(usersTable.id, classEnrollmentsTable.studentId))
        .where(and(eq(classEnrollmentsTable.classId, parseInt(classId as string)), eq(usersTable.role, "student")));
    } else {
      students = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "student"));
    }

    const results = await Promise.all(students.map((s) => computeStudentResult(s.id, semesterId)));
    const validResults = results.filter(Boolean) as any[];

    // Compute ranks
    const ranked = [...validResults].filter(r => r.average !== null).sort((a, b) => b.average! - a.average!);
    const rankMap = new Map(ranked.map((r, i) => [r.studentId, i + 1]));

    const withRanks = validResults.map((r) => ({
      ...r,
      rank: r.average !== null ? (rankMap.get(r.studentId) ?? null) : null,
      totalStudents: validResults.filter(v => v.average !== null).length,
    }));

    res.json(withRanks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── HTML Bulletin ────────────────────────────────────────────────────────────
router.get("/bulletin/:studentId/:semesterId", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session.user!;
    if (cu.adminSubRole !== "scolarite" && cu.adminSubRole !== "directeur") {
      res.status(403).json({ error: "Réservé à la Scolarité et au Directeur." });
      return;
    }
    const studentId = parseInt(req.params.studentId);
    const semesterId = parseInt(req.params.semesterId);

    const result = await computeStudentResult(studentId, semesterId);
    if (!result) { res.status(404).json({ error: "Étudiant ou semestre introuvable." }); return; }

    const [semester] = await db.select().from(semestersTable).where(eq(semestersTable.id, semesterId)).limit(1);

    // Fetch UEs with categories for this class/semester (computeStudentResult doesn't expose category)
    const uesWithCategory = result.classId
      ? await db.select().from(teachingUnitsTable).where(
          and(
            eq(teachingUnitsTable.classId, result.classId),
            eq(teachingUnitsTable.semesterId, semesterId)
          )
        )
      : [];
    const ueCategMap = new Map(uesWithCategory.map(u => [u.id, u.category]));

    // Enrich ueResults with category
    const ueResults = result.ueResults.map(ue => ({
      ...ue,
      category: ueCategMap.get(ue.ueId) ?? null,
    }));

    // Compute rank in class
    let rank: number | null = null;
    let totalStudents: number | null = null;
    if (result.classId && result.average !== null) {
      const classStudents = await db
        .select({ studentId: classEnrollmentsTable.studentId })
        .from(classEnrollmentsTable)
        .where(eq(classEnrollmentsTable.classId, result.classId));

      const studentIds = classStudents.map(s => s.studentId);
      if (studentIds.length > 1) {
        const allGrades = await db
          .select({
            studentId: gradesTable.studentId,
            value: gradesTable.value,
            coefficient: subjectsTable.coefficient,
          })
          .from(gradesTable)
          .innerJoin(subjectsTable, eq(subjectsTable.id, gradesTable.subjectId))
          .where(
            and(
              inArray(gradesTable.studentId, studentIds),
              eq(gradesTable.semesterId, semesterId)
            )
          );

        const studentSums = new Map<number, { sum: number; totalCoef: number }>();
        for (const g of allGrades) {
          const e = studentSums.get(g.studentId) ?? { sum: 0, totalCoef: 0 };
          e.sum += (g.value ?? 0) * g.coefficient;
          e.totalCoef += g.coefficient;
          studentSums.set(g.studentId, e);
        }
        const avgs = [...studentSums.entries()]
          .filter(([, e]) => e.totalCoef > 0)
          .map(([id, e]) => ({ id, avg: e.sum / e.totalCoef }))
          .sort((a, b) => b.avg - a.avg);

        totalStudents = avgs.length;
        const pos = avgs.findIndex(a => a.id === studentId);
        rank = pos >= 0 ? pos + 1 : null;
      } else {
        rank = 1;
        totalStudents = 1;
      }
    }

    const editionDate = new Date().toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    // result.average is already the *nette* average (absence deduction already applied)
    // Brute average = nette + deduction
    const averageBrute = result.average !== null
      ? Math.round((result.average + result.absenceDeduction) * 100) / 100
      : null;

    // Fetch schools from DB for dynamic footer
    const schoolRows = await db
      .select({ acronym: ecolesInphbTable.acronym, name: ecolesInphbTable.name })
      .from(ecolesInphbTable)
      .orderBy(ecolesInphbTable.displayOrder);

    const html = generateBulletinHTML({
      studentName: result.studentName,
      studentMatricule: String(studentId).padStart(6, "0"),
      className: result.className,
      semesterName: result.semesterName,
      academicYear: semester?.academicYear ?? "",
      average: averageBrute,
      averageNette: result.average,
      decision: result.decision,
      rank,
      totalStudents,
      absenceDeductionHours: result.absenceDeductionHours,
      absenceDeduction: result.absenceDeduction,
      ueResults,
      unassignedSubjects: result.grades.filter((g: any) => !g.ueId || !ueResults.find(u => u.ueId === g.ueId)),
      editionDate,
      schools: schoolRows,
    });

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Teacher Assignments ──────────────────────────────────────────────────────
router.get("/assignments", requireRole("admin"), async (req, res) => {
  try {
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
      .innerJoin(semestersTable, eq(semestersTable.id, teacherAssignmentsTable.semesterId));
    res.json(assignments);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/assignments", requireRole("admin"), async (req, res) => {
  try {
    const { teacherId, subjectId, classId, semesterId } = req.body;
    if (!teacherId || !subjectId || !classId || !semesterId) {
      res.status(400).json({ error: "Bad Request", message: "All fields are required" });
      return;
    }
    const [assignment] = await db.insert(teacherAssignmentsTable)
      .values({ teacherId, subjectId, classId, semesterId })
      .onConflictDoNothing()
      .returning();

    if (!assignment) {
      res.status(409).json({ error: "Conflict", message: "Assignment already exists" });
      return;
    }

    const [full] = await db
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
      .where(eq(teacherAssignmentsTable.id, assignment.id));

    res.status(201).json(full);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/assignments/:id", requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(teacherAssignmentsTable).where(eq(teacherAssignmentsTable.id, id));
    res.json({ message: "Assignment deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Subject Approvals ───────────────────────────────────────────────────────

router.get("/subject-approvals", requireRole("admin"), async (req, res) => {
  try {
    const { semesterId, classId } = req.query;
    const conditions: any[] = [];
    if (semesterId) conditions.push(eq(subjectApprovalsTable.semesterId, parseInt(semesterId as string)));
    if (classId) conditions.push(eq(subjectApprovalsTable.classId, parseInt(classId as string)));

    const rows = conditions.length > 0
      ? await db.select({
          id: subjectApprovalsTable.id,
          subjectId: subjectApprovalsTable.subjectId,
          subjectName: subjectsTable.name,
          classId: subjectApprovalsTable.classId,
          className: classesTable.name,
          semesterId: subjectApprovalsTable.semesterId,
          approvedById: subjectApprovalsTable.approvedById,
          approvedByName: usersTable.name,
          approvedAt: subjectApprovalsTable.approvedAt,
        })
        .from(subjectApprovalsTable)
        .innerJoin(subjectsTable, eq(subjectsTable.id, subjectApprovalsTable.subjectId))
        .innerJoin(classesTable, eq(classesTable.id, subjectApprovalsTable.classId))
        .innerJoin(usersTable, eq(usersTable.id, subjectApprovalsTable.approvedById))
        .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      : await db.select({
          id: subjectApprovalsTable.id,
          subjectId: subjectApprovalsTable.subjectId,
          subjectName: subjectsTable.name,
          classId: subjectApprovalsTable.classId,
          className: classesTable.name,
          semesterId: subjectApprovalsTable.semesterId,
          approvedById: subjectApprovalsTable.approvedById,
          approvedByName: usersTable.name,
          approvedAt: subjectApprovalsTable.approvedAt,
        })
        .from(subjectApprovalsTable)
        .innerJoin(subjectsTable, eq(subjectsTable.id, subjectApprovalsTable.subjectId))
        .innerJoin(classesTable, eq(classesTable.id, subjectApprovalsTable.classId))
        .innerJoin(usersTable, eq(usersTable.id, subjectApprovalsTable.approvedById));
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/subject-approvals", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session.user!;
    if (cu.adminSubRole !== "scolarite" && cu.adminSubRole !== "directeur") {
      res.status(403).json({ error: "Réservé au Assistant(e) de Direction." });
      return;
    }
    const { subjectId, classId, semesterId } = req.body;
    if (!subjectId || !classId || !semesterId) {
      res.status(400).json({ error: "subjectId, classId, semesterId requis." });
      return;
    }
    const [row] = await db
      .insert(subjectApprovalsTable)
      .values({ subjectId, classId, semesterId, approvedById: cu.id })
      .onConflictDoNothing()
      .returning();
    await db.insert(activityLogTable).values({
      userId: cu.id,
      action: "approbation_notes",
      details: `Notes approuvées — matière ID ${subjectId}, classe ID ${classId}, semestre ID ${semesterId}.`,
    });
    res.status(201).json(row ?? { message: "Already approved" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/subject-approvals/:id", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session.user!;
    if (cu.adminSubRole !== "scolarite" && cu.adminSubRole !== "directeur") {
      res.status(403).json({ error: "Réservé au Assistant(e) de Direction." });
      return;
    }
    const id = parseInt(req.params.id);
    await db.delete(subjectApprovalsTable).where(eq(subjectApprovalsTable.id, id));
    res.json({ message: "Approval removed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Grade Submissions (pending teacher submissions for review) ────────────────

router.get("/grade-submissions/pending", requireRole("admin"), async (req, res) => {
  try {
    const { semesterId } = req.query;
    const submissions = await db
      .select()
      .from(gradeSubmissionsTable)
      .where(semesterId ? eq(gradeSubmissionsTable.semesterId, parseInt(semesterId as string)) : undefined);

    // Filter out those already approved
    const approvals = await db.select().from(subjectApprovalsTable);
    const approvedKeys = new Set(approvals.map((a) => `${a.subjectId}-${a.classId}-${a.semesterId}`));
    const pending = submissions.filter((s) => !approvedKeys.has(`${s.subjectId}-${s.classId}-${s.semesterId}`));

    res.json(pending);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/grade-submissions/pending-count", requireRole("admin"), async (req, res) => {
  try {
    const submissions = await db.select().from(gradeSubmissionsTable);
    const approvals = await db.select().from(subjectApprovalsTable);
    const approvedKeys = new Set(approvals.map((a) => `${a.subjectId}-${a.classId}-${a.semesterId}`));
    const count = submissions.filter((s) => !approvedKeys.has(`${s.subjectId}-${s.classId}-${s.semesterId}`)).length;
    res.json({ count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Dérogations (modification exceptionnelle de note) ────────────────────────

router.put("/grades/derogate", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session.user!;
    if (cu.adminSubRole !== "scolarite" && cu.adminSubRole !== "directeur") {
      res.status(403).json({ error: "Réservé au Assistant(e) de Direction." });
      return;
    }
    const { studentId, subjectId, semesterId, value, justification } = req.body;
    if (!studentId || !subjectId || !semesterId || value === undefined || !justification) {
      res.status(400).json({ error: "Tous les champs sont requis, y compris la justification." });
      return;
    }
    if (value < 0 || value > 20) {
      res.status(400).json({ error: "La note doit être comprise entre 0 et 20." });
      return;
    }

    // Fetch student and subject names for the log
    const [student] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, studentId)).limit(1);
    const [subject] = await db.select({ name: subjectsTable.name }).from(subjectsTable).where(eq(subjectsTable.id, subjectId)).limit(1);

    // Fetch old value
    const [old] = await db.select({ value: gradesTable.value }).from(gradesTable)
      .where(and(eq(gradesTable.studentId, studentId), eq(gradesTable.subjectId, subjectId), eq(gradesTable.semesterId, semesterId)))
      .limit(1);

    // Upsert grade (derogation applies to evaluation 1 by default)
    const evalNum = req.body.evaluationNumber ?? 1;
    await db.insert(gradesTable)
      .values({ studentId, subjectId, semesterId, evaluationNumber: evalNum, value })
      .onConflictDoUpdate({ target: [gradesTable.studentId, gradesTable.subjectId, gradesTable.semesterId, gradesTable.evaluationNumber], set: { value, updatedAt: new Date() } });

    // Log derogation
    await db.insert(activityLogTable).values({
      userId: cu.id,
      action: "derogation_note",
      details: `Dérogation — ${student?.name ?? studentId} | ${subject?.name ?? subjectId} | Ancienne note: ${old?.value ?? "—"} → Nouvelle: ${value} | Justification: ${justification}`,
    });

    res.json({ message: "Note modifiée avec dérogation enregistrée." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Journal d'Activité ───────────────────────────────────────────────────────

router.get("/activity-log", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session.user!;
    if (cu.adminSubRole !== "scolarite" && cu.adminSubRole !== "directeur") {
      res.status(403).json({ error: "Réservé au Assistant(e) de Direction." });
      return;
    }
    const rows = await db
      .select({
        id: activityLogTable.id,
        userId: activityLogTable.userId,
        userName: usersTable.name,
        action: activityLogTable.action,
        details: activityLogTable.details,
        createdAt: activityLogTable.createdAt,
      })
      .from(activityLogTable)
      .innerJoin(usersTable, eq(usersTable.id, activityLogTable.userId))
      .orderBy(desc(activityLogTable.createdAt))
      .limit(100);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Class Enrollments ───────────────────────────────────────────────────────
router.post("/class-enrollments", requireRole("admin"), async (req, res) => {
  try {
    const { studentId, classId } = req.body;
    if (!studentId || !classId) { res.status(400).json({ error: "Bad Request", message: "studentId and classId are required" }); return; }
    await db.delete(classEnrollmentsTable).where(eq(classEnrollmentsTable.studentId, studentId));
    await db.insert(classEnrollmentsTable).values({ studentId, classId }).onConflictDoNothing();
    res.status(201).json({ message: "Student enrolled" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/class-enrollments", requireRole("admin"), async (req, res) => {
  try {
    const { studentId, classId } = req.body;
    if (!studentId || !classId) { res.status(400).json({ error: "Bad Request", message: "studentId and classId are required" }); return; }
    await db.delete(classEnrollmentsTable).where(and(eq(classEnrollmentsTable.studentId, studentId), eq(classEnrollmentsTable.classId, classId)));
    res.json({ message: "Student removed from class" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
