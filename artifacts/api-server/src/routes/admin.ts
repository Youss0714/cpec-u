import { Router } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { generateBulletinHTML } from "../lib/bulletin-html.js";
import { notifyStudentsOfClasses } from "./notifications.js";
import { sendPushToUser } from "./push.js";
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
  absenceJustificationsTable,
  notificationsTable,
  teachingUnitsTable,
  classFeesTable,
  studentFeesTable,
  studentProfilesTable,
  academicYearArchivesTable,
  ecolesInphbTable,
  paymentsTable,
  housingAssignmentsTable,
  housingRoomsTable,
  housingBuildingsTable,
  cahierDeTexteTable,
  retakeSessionsTable,
  retakeGradesTable,
  specialJurySessionsTable,
  specialJuryDecisionsTable,
} from "@workspace/db";
import { eq, and, sql, count, inArray, desc, ne, isNotNull, asc, ilike, or } from "drizzle-orm";
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
    const { role, search } = req.query;
    const conditions: any[] = [];
    if (role) conditions.push(eq(usersTable.role, role as any));

    let usersByText: typeof usersTable.$inferSelect[] = [];
    if (search && typeof search === "string" && search.trim()) {
      const term = `%${search.trim()}%`;
      // Search by name, email, or matricule (via join with student profiles)
      const nameEmailConditions = [...conditions, or(ilike(usersTable.name, term), ilike(usersTable.email, term))];
      const byText = await db.select().from(usersTable).where(and(...nameEmailConditions));

      // Also search by matricule
      const byMatricule = await db
        .select({ id: usersTable.id })
        .from(studentProfilesTable)
        .innerJoin(usersTable, eq(usersTable.id, studentProfilesTable.studentId))
        .where(and(
          ilike(studentProfilesTable.matricule, term),
          ...(role ? [eq(usersTable.role, role as any)] : [])
        ));
      const matriculeIds = new Set(byMatricule.map(r => r.id));
      const extraIds = [...matriculeIds].filter(id => !byText.some(u => u.id === id));
      let byMatriculeUsers: typeof usersTable.$inferSelect[] = [];
      if (extraIds.length) {
        byMatriculeUsers = await db.select().from(usersTable).where(inArray(usersTable.id, extraIds));
      }
      usersByText = [...byText, ...byMatriculeUsers];
    } else {
      usersByText = conditions.length
        ? await db.select().from(usersTable).where(and(...conditions))
        : await db.select().from(usersTable);
    }
    const users = usersByText;

    const enrollments = await db
      .select({ studentId: classEnrollmentsTable.studentId, classId: classEnrollmentsTable.classId, className: classesTable.name })
      .from(classEnrollmentsTable)
      .innerJoin(classesTable, eq(classesTable.id, classEnrollmentsTable.classId));
    const enrollmentMap = new Map(enrollments.map((e) => [e.studentId, { classId: e.classId, className: e.className }]));

    const profiles = await db.select({ studentId: studentProfilesTable.studentId, matricule: studentProfilesTable.matricule }).from(studentProfilesTable);
    const profileMap = new Map(profiles.map((p) => [p.studentId, p.matricule]));

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
        matricule: profileMap.get(u.id) ?? null,
        createdAt: u.createdAt,
      };
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── Helpers for student validation ────────────────────────────────────────────
function parseFrenchDate(dateStr: string): Date | null {
  const m = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
  if (d.getFullYear() !== parseInt(yyyy) || d.getMonth() !== parseInt(mm) - 1 || d.getDate() !== parseInt(dd)) return null;
  return d;
}
function isValidStudentPhone(phone: string): boolean {
  // At least 7 digits; may contain +, spaces, dashes, dots, parentheses
  return /^\+?[\d\s\(\)\-\.]{7,25}$/.test(phone) && /\d{7,}/.test(phone.replace(/\D/g, ""));
}

router.post("/users", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session?.user as any;
    const { email, name, firstName, lastName, password, role, adminSubRole, classId, phone,
            matricule, dateNaissance, lieuNaissance, parentName, parentPhone, sexe } = req.body;

    // ── Generic required fields ────────────────────────────────────────────
    const resolvedName = (role === "student" && (firstName || lastName))
      ? `${(firstName ?? "").trim()} ${(lastName ?? "").trim()}`.trim()
      : name;

    if (!email?.trim() || !resolvedName?.trim() || !password || !role) {
      res.status(400).json({ error: "Bad Request", message: "Les champs nom, email, mot de passe et rôle sont obligatoires." });
      return;
    }

    // ── Student-specific validation ────────────────────────────────────────
    if (role === "student") {
      if (!firstName?.trim()) {
        res.status(400).json({ error: "Bad Request", message: "Le prénom est obligatoire." });
        return;
      }
      if (!lastName?.trim()) {
        res.status(400).json({ error: "Bad Request", message: "Le nom est obligatoire." });
        return;
      }
      if (!matricule?.trim()) {
        res.status(400).json({ error: "Bad Request", message: "Le matricule est obligatoire pour un étudiant." });
        return;
      }
      if (!dateNaissance?.trim()) {
        res.status(400).json({ error: "Bad Request", message: "La date de naissance est obligatoire." });
        return;
      }
      const parsedDOB = parseFrenchDate(dateNaissance.trim());
      if (!parsedDOB) {
        res.status(400).json({ error: "Bad Request", message: "La date de naissance est invalide (format attendu : JJ/MM/AAAA)." });
        return;
      }
      if (parsedDOB >= new Date()) {
        res.status(400).json({ error: "Bad Request", message: "La date de naissance doit être antérieure à aujourd'hui." });
        return;
      }
      if (!lieuNaissance?.trim()) {
        res.status(400).json({ error: "Bad Request", message: "Le lieu de naissance est obligatoire." });
        return;
      }
      if (!parentName?.trim()) {
        res.status(400).json({ error: "Bad Request", message: "Le nom du parent/tuteur est obligatoire." });
        return;
      }
      if (!parentPhone?.trim()) {
        res.status(400).json({ error: "Bad Request", message: "Le contact du parent/tuteur est obligatoire." });
        return;
      }
      if (!isValidStudentPhone(parentPhone.trim())) {
        res.status(400).json({ error: "Bad Request", message: "Le contact du parent/tuteur n'est pas un numéro de téléphone valide." });
        return;
      }
      // Matricule uniqueness check
      const existingMatricule = await db
        .select({ id: studentProfilesTable.studentId })
        .from(studentProfilesTable)
        .where(eq(studentProfilesTable.matricule, matricule.trim()))
        .limit(1);
      if (existingMatricule.length > 0) {
        res.status(409).json({ error: "Conflict", message: "Ce matricule est déjà utilisé par un autre étudiant." });
        return;
      }
    }

    // ── Access control ─────────────────────────────────────────────────────
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
      email: email.trim(), name: resolvedName, passwordHash, role,
      adminSubRole: role === "admin" ? (adminSubRole ?? null) : null,
      mustChangePassword: true,
    }).returning();

    if (classId && role === "student") {
      await db.insert(classEnrollmentsTable).values({ studentId: user.id, classId }).onConflictDoNothing();
      await applyClassFeeToStudent(user.id, classId);
    }

    if (role === "student") {
      await db.insert(studentProfilesTable).values({
        studentId: user.id,
        matricule: matricule.trim(),
        dateNaissance: dateNaissance.trim(),
        lieuNaissance: lieuNaissance.trim(),
        parentName: parentName.trim(),
        parentPhone: parentPhone.trim(),
        sexe: sexe?.trim() || null,
      }).onConflictDoNothing();
    }

    const enroll = classId ? await db.select({ className: classesTable.name }).from(classesTable).where(eq(classesTable.id, classId)).limit(1) : [];
    res.status(201).json({
      id: user.id, email: user.email, name: user.name, role: user.role,
      adminSubRole: user.adminSubRole ?? null,
      classId: classId ?? null, className: enroll[0]?.className ?? null,
      matricule: matricule?.trim() || null,
      createdAt: user.createdAt,
    });
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "Conflict", message: "Un compte avec cet email existe déjà." });
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

    // Personne ne peut supprimer son propre compte
    if (id === currentUser.id) {
      res.status(403).json({ error: "Vous ne pouvez pas supprimer votre propre compte." });
      return;
    }

    // Restrictions selon le sous-rôle (le Directeur peut tout supprimer sauf lui-même)
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
    const { phone, address, parentName, parentPhone, parentEmail, parentAddress, matricule, dateNaissance, lieuNaissance, sexe } = req.body;
    const [existing] = await db.select().from(studentProfilesTable).where(eq(studentProfilesTable.studentId, id)).limit(1);
    const data: any = {
      matricule: matricule?.trim() || null,
      dateNaissance: dateNaissance?.trim() || null,
      lieuNaissance: lieuNaissance?.trim() || null,
      phone: phone ?? null, address: address ?? null,
      parentName: parentName ?? null, parentPhone: parentPhone ?? null,
      parentEmail: parentEmail ?? null, parentAddress: parentAddress ?? null,
      sexe: sexe?.trim() || null,
      updatedAt: new Date(),
    };
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
    const { name, description, filiere } = req.body;
    if (!name) { res.status(400).json({ error: "Bad Request", message: "Name is required" }); return; }
    // New class gets orderIndex = max + 1
    const existing = await db.select({ o: classesTable.orderIndex }).from(classesTable);
    const maxOrder = existing.length > 0 ? Math.max(...existing.map((c) => c.o)) : 0;
    const [cls] = await db.insert(classesTable).values({ name, description, filiere: filiere?.trim() || null, orderIndex: maxOrder + 1 }).returning();
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
    const { name, description, nextClassId, isTerminal, filiere } = req.body;
    const updateData: any = { name, description };
    if (filiere !== undefined) updateData.filiere = filiere?.trim() || null;
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
    // UE average is only calculated when ALL subjects in the UE have a grade
    const allSubjectsGraded = ueSubjects.length > 0 && ueSubjects.every(g => g.value !== null);
    let ueAverage: number | null = null;
    if (allSubjectsGraded) {
      const totalCoeff = ueSubjects.reduce((s, g) => s + g.coefficient, 0);
      const totalPoints = ueSubjects.reduce((s, g) => s + g.value! * g.coefficient, 0);
      ueAverage = totalCoeff > 0 ? Math.round((totalPoints / totalCoeff) * 100) / 100 : null;
    }
    // ── Règle éliminatoire : toute note ≤ 6/20 invalide automatiquement l'UE ──
    const eliminatorySubject = ueSubjects.find(g => g.value !== null && g.value <= 6) ?? null;
    const acquis = ueAverage !== null && ueAverage >= 10 && !eliminatorySubject;
    return {
      ueId: ue.id,
      ueCode: ue.code,
      ueName: ue.name,
      credits: ue.credits,
      coefficient: ue.coefficient,
      average: ueAverage,
      acquis,
      eliminatorySubjectName: eliminatorySubject ? eliminatorySubject.subjectName : null,
      subjects: ueSubjects,
    };
  });

  // Subjects not assigned to any UE
  const unassignedGrades = grades.filter(g => !g.ueId || !ues.find(u => u.id === g.ueId));

  let average: number | null = null;
  let decision: "Admis" | "Ajourné" | "En attente" = "En attente";

  // Compute semester average from UE averages (weighted by UE credits) + unassigned subjects
  // Semester average is ONLY calculated when ALL UEs have their average (cascade rule)
  if (ues.length > 0) {
    const allUesHaveAverage = ueResults.every(u => u.average !== null);
    const unassignedAllGraded = unassignedGrades.length === 0 || unassignedGrades.every(g => g.value !== null);
    if (allUesHaveAverage && unassignedAllGraded) {
      const totalCredits = ueResults.reduce((s, u) => s + u.credits, 0);
      const totalPoints = ueResults.reduce((s, u) => s + u.average! * u.credits, 0);
      const unassignedCoeff = unassignedGrades.reduce((s, g) => s + g.coefficient, 0);
      const unassignedPoints = unassignedGrades.reduce((s, g) => s + g.value! * g.coefficient, 0);
      const totalWeight = totalCredits + unassignedCoeff;
      const total = totalPoints + unassignedPoints;
      average = totalWeight > 0 ? Math.round((total / totalWeight) * 100) / 100 : null;
    }
    // If any UE is missing grades, average stays null
  } else {
    // No UE structure: semester average requires ALL subjects to be graded
    const allSubjectsGraded = grades.length > 0 && grades.every(g => g.value !== null);
    if (allSubjectsGraded) {
      const totalCoeff = grades.reduce((sum, g) => sum + g.coefficient, 0);
      const totalPoints = grades.reduce((sum, g) => sum + (g.value! * g.coefficient), 0);
      average = totalCoeff > 0 ? Math.round((totalPoints / totalCoeff) * 100) / 100 : null;
    }
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

  // Decision is only definitive when semester average is calculable (all grades present)
  if (average !== null) {
    if (ues.length > 0) {
      // Admis: ALL UEs validated (avg >= 10) AND semester avg >= 12
      const allUesAcquis = ueResults.every(u => u.acquis);
      decision = (allUesAcquis && average >= 12) ? "Admis" : "Ajourné";
    } else {
      decision = average >= 12 ? "Admis" : "Ajourné";
    }
  } else {
    // Grades incomplete → no decision yet
    decision = "En attente";
  }

  // Rule 5: Identify failure reasons for non-validated semesters
  const failedUes = ueResults
    .filter(u => u.average !== null && !u.acquis)
    .map(u => ({
      ueId: u.ueId,
      ueCode: u.ueCode,
      ueName: u.ueName,
      average: u.average,
      acquis: false,
      eliminatorySubjectName: u.eliminatorySubjectName ?? null,
    }));
  const averageFailed = decision === "Ajourné" && average !== null && average < 12;

  // ── Jury Spécial override: if a closed jury has validated this student for this semester ──
  let juryOverride: { newAverage: number; decision: string; justification: string } | null = null;
  const juryDecision = await db
    .select({
      newAverage: specialJuryDecisionsTable.newAverage,
      decision: specialJuryDecisionsTable.decision,
      justification: specialJuryDecisionsTable.justification,
      sessionStatus: specialJurySessionsTable.status,
    })
    .from(specialJuryDecisionsTable)
    .innerJoin(specialJurySessionsTable, eq(specialJurySessionsTable.id, specialJuryDecisionsTable.sessionId))
    .where(and(
      eq(specialJuryDecisionsTable.studentId, studentId),
      eq(specialJuryDecisionsTable.semesterId, semesterId),
      eq(specialJurySessionsTable.status, "closed")
    ))
    .orderBy(desc(specialJuryDecisionsTable.decidedAt))
    .limit(1);

  if (juryDecision.length > 0) {
    const jd = juryDecision[0];
    if ((jd.decision === "validated" || jd.decision === "conditional") && jd.newAverage !== null) {
      juryOverride = { newAverage: jd.newAverage, decision: "Admis", justification: jd.justification ?? "" };
    }
  }

  const finalAverage = juryOverride ? juryOverride.newAverage : average;
  const finalDecision = juryOverride ? (juryOverride.decision as any) : decision;

  return {
    studentId, studentName: student.name,
    classId, className,
    semesterId, semesterName: semester.name,
    average: finalAverage, decision: finalDecision, grades,
    ueResults, creditsValidated, totalCredits,
    absenceDeductionHours, absenceDeduction,
    failedUes, averageFailed: juryOverride ? false : averageFailed,
    juryOverride,
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

    // Fetch filière from classes table
    const [clsRow] = result.classId
      ? await db.select({ filiere: classesTable.filiere }).from(classesTable).where(eq(classesTable.id, result.classId)).limit(1)
      : [];
    const filiere = clsRow?.filiere ?? result.className ?? "";

    // Fetch schools from DB for dynamic footer
    const schoolRows = await db
      .select({ acronym: ecolesInphbTable.acronym, name: ecolesInphbTable.name })
      .from(ecolesInphbTable)
      .orderBy(ecolesInphbTable.displayOrder);

    // Fetch real matricule + naissance + sexe from student profile
    const [studentProfile] = await db
      .select({
        matricule: studentProfilesTable.matricule,
        dateNaissance: studentProfilesTable.dateNaissance,
        lieuNaissance: studentProfilesTable.lieuNaissance,
        sexe: studentProfilesTable.sexe,
      })
      .from(studentProfilesTable)
      .where(eq(studentProfilesTable.studentId, studentId))
      .limit(1);
    const studentMatricule = studentProfile?.matricule?.trim() || String(studentId).padStart(6, "0");

    const html = generateBulletinHTML({
      studentName: result.studentName,
      studentMatricule,
      dateNaissance: studentProfile?.dateNaissance ?? null,
      lieuNaissance: studentProfile?.lieuNaissance ?? null,
      sexe: studentProfile?.sexe ?? null,
      filiere,
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

// ─── Admin: grades for a specific subject/class/semester (live, no cache) ─────

router.get("/subject-grades", requireRole("admin"), async (req, res) => {
  try {
    const { subjectId, classId, semesterId } = req.query;
    if (!subjectId || !classId || !semesterId) {
      res.status(400).json({ error: "subjectId, classId et semesterId sont requis." });
      return;
    }
    const subId = parseInt(subjectId as string);
    const clId = parseInt(classId as string);
    const semId = parseInt(semesterId as string);

    // All students enrolled in the class
    const students = await db
      .select({ id: usersTable.id, name: usersTable.name })
      .from(classEnrollmentsTable)
      .innerJoin(usersTable, eq(usersTable.id, classEnrollmentsTable.studentId))
      .where(and(eq(classEnrollmentsTable.classId, clId), eq(usersTable.role, "student")));

    if (students.length === 0) { res.json([]); return; }

    const studentIds = students.map((s) => s.id);

    // Live grades from DB for this subject/semester
    const grades = await db
      .select({ studentId: gradesTable.studentId, evaluationNumber: gradesTable.evaluationNumber, value: gradesTable.value })
      .from(gradesTable)
      .where(and(
        inArray(gradesTable.studentId, studentIds),
        eq(gradesTable.subjectId, subId),
        eq(gradesTable.semesterId, semId),
      ));

    // Group by student and compute average of evaluations
    const gradeMap = new Map<number, { evaluations: { n: number; v: number }[]; average: number }>();
    for (const g of grades) {
      if (!gradeMap.has(g.studentId)) {
        const evals = grades.filter((e) => e.studentId === g.studentId);
        const avg = evals.reduce((s, e) => s + e.value, 0) / evals.length;
        gradeMap.set(g.studentId, {
          evaluations: evals.map((e) => ({ n: e.evaluationNumber, v: e.value })),
          average: Math.round(avg * 100) / 100,
        });
      }
    }

    const result = students
      .map((s) => ({
        studentId: s.id,
        studentName: s.name,
        value: gradeMap.get(s.id)?.average ?? null,
        evaluations: gradeMap.get(s.id)?.evaluations ?? [],
      }))
      .sort((a, b) => a.studentName.localeCompare(b.studentName, "fr"));

    res.json(result);
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

// ─── Absence Justifications (admin) ──────────────────────────────────────────

router.get("/justifications", requireRole("admin"), async (req, res) => {
  try {
    const { status } = req.query;
    const rows = await db
      .select({
        id: absenceJustificationsTable.id,
        attendanceId: absenceJustificationsTable.attendanceId,
        studentId: absenceJustificationsTable.studentId,
        studentName: usersTable.name,
        reason: absenceJustificationsTable.reason,
        status: absenceJustificationsTable.status,
        reviewedBy: absenceJustificationsTable.reviewedBy,
        reviewedAt: absenceJustificationsTable.reviewedAt,
        reviewNote: absenceJustificationsTable.reviewNote,
        fileUrl: absenceJustificationsTable.fileUrl,
        createdAt: absenceJustificationsTable.createdAt,
        sessionDate: attendanceTable.sessionDate,
        attendanceStatus: attendanceTable.status,
        subjectName: subjectsTable.name,
        className: classesTable.name,
      })
      .from(absenceJustificationsTable)
      .innerJoin(usersTable, eq(usersTable.id, absenceJustificationsTable.studentId))
      .innerJoin(attendanceTable, eq(attendanceTable.id, absenceJustificationsTable.attendanceId))
      .innerJoin(subjectsTable, eq(subjectsTable.id, attendanceTable.subjectId))
      .innerJoin(classesTable, eq(classesTable.id, attendanceTable.classId))
      .orderBy(absenceJustificationsTable.createdAt);

    const filtered = status ? rows.filter((r) => r.status === status) : rows;
    res.json(filtered);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/justifications/:id", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session?.user as any;
    if (cu?.adminSubRole !== "scolarite" && cu?.adminSubRole !== "directeur") {
      res.status(403).json({ error: "Réservé à la Scolarité et au Directeur." }); return;
    }
    const id = parseInt(req.params.id);
    const { status, reviewNote } = req.body;
    if (!["approved", "rejected"].includes(status)) {
      res.status(400).json({ error: "status doit être 'approved' ou 'rejected'." }); return;
    }
    const [just] = await db.select().from(absenceJustificationsTable)
      .where(eq(absenceJustificationsTable.id, id)).limit(1);
    if (!just) { res.status(404).json({ error: "Justificatif introuvable." }); return; }

    const [updated] = await db.update(absenceJustificationsTable)
      .set({ status, reviewedBy: cu.id, reviewedAt: new Date(), reviewNote: reviewNote?.trim() || null, updatedAt: new Date() })
      .where(eq(absenceJustificationsTable.id, id))
      .returning();

    // If approved → mark the attendance record as justified
    if (status === "approved") {
      await db.update(attendanceTable).set({ justified: true }).where(eq(attendanceTable.id, just.attendanceId));
    } else if (status === "rejected") {
      await db.update(attendanceTable).set({ justified: false }).where(eq(attendanceTable.id, just.attendanceId));
    }

    // Notify the student
    const notifTitle = status === "approved" ? "Justificatif approuvé" : "Justificatif refusé";
    const notifMessage = status === "approved"
      ? "Votre justificatif d'absence a été approuvé par la scolarité. L'absence est désormais marquée comme justifiée."
      : `Votre justificatif d'absence a été refusé.${reviewNote?.trim() ? ` Motif : ${reviewNote.trim()}` : ""}`;
    await db.insert(notificationsTable).values({
      userId: just.studentId,
      type: status === "approved" ? "justification_approved" : "justification_rejected",
      title: notifTitle,
      message: notifMessage,
    });

    sendPushToUser(just.studentId, { title: notifTitle, body: notifMessage, type: status === "approved" ? "justification_approved" : "justification_rejected" }).catch(() => {});

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── GET /admin/students/:id/detail — fiche complète d'un étudiant ───────────
router.get("/students/:id/detail", requireRole("admin"), async (req, res) => {
  try {
    const studentId = parseInt(req.params.id);

    // Info de base + profil
    const [userRow] = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        phone: studentProfilesTable.phone,
        address: studentProfilesTable.address,
        dateNaissance: studentProfilesTable.dateNaissance,
        lieuNaissance: studentProfilesTable.lieuNaissance,
        matricule: studentProfilesTable.matricule,
        photoUrl: studentProfilesTable.photoUrl,
      })
      .from(usersTable)
      .leftJoin(studentProfilesTable, eq(studentProfilesTable.studentId, usersTable.id))
      .where(and(eq(usersTable.id, studentId), eq(usersTable.role, "student")))
      .limit(1);

    if (!userRow) { res.status(404).json({ error: "Étudiant introuvable." }); return; }

    // Inscriptions (classes + années)
    const enrollments = await db
      .select({
        classId: classEnrollmentsTable.classId,
        className: classesTable.name,
        enrolledAt: classEnrollmentsTable.enrolledAt,
      })
      .from(classEnrollmentsTable)
      .innerJoin(classesTable, eq(classesTable.id, classEnrollmentsTable.classId))
      .where(eq(classEnrollmentsTable.studentId, studentId))
      .orderBy(desc(classEnrollmentsTable.enrolledAt));

    // Résultats par semestre (notes + décision)
    const semesters = await db.select().from(semestersTable).orderBy(semestersTable.startDate);
    const semesterResults: any[] = [];
    for (const sem of semesters) {
      const grades = await db
        .select({
          subjectId: gradesTable.subjectId,
          subjectName: subjectsTable.name,
          coefficient: subjectsTable.coefficient,
          value: gradesTable.value,
        })
        .from(gradesTable)
        .innerJoin(subjectsTable, eq(subjectsTable.id, gradesTable.subjectId))
        .where(and(eq(gradesTable.studentId, studentId), eq(gradesTable.semesterId, sem.id)));

      if (grades.length === 0) continue;

      const totalCoef = grades.reduce((s, g) => s + (g.coefficient ?? 1), 0);
      const average = totalCoef > 0
        ? grades.reduce((s, g) => s + (g.value ?? 0) * (g.coefficient ?? 1), 0) / totalCoef
        : null;

      semesterResults.push({
        semesterId: sem.id,
        semesterName: sem.name,
        academicYear: sem.academicYear,
        grades,
        average: average !== null ? Math.round(average * 100) / 100 : null,
        decision: average !== null ? (average >= 10 ? "Admis" : "Ajourné") : "En attente",
      });
    }

    // Absences (total non-justifiées)
    const absenceRows = await db
      .select({
        subjectId: attendanceTable.subjectId,
        subjectName: subjectsTable.name,
        className: classesTable.name,
        sessionDate: attendanceTable.sessionDate,
        status: attendanceTable.status,
        justified: attendanceTable.justified,
        semesterId: attendanceTable.semesterId,
      })
      .from(attendanceTable)
      .leftJoin(subjectsTable, eq(subjectsTable.id, attendanceTable.subjectId))
      .leftJoin(classesTable, eq(classesTable.id, attendanceTable.classId))
      .where(and(eq(attendanceTable.studentId, studentId), ne(attendanceTable.status, "present")))
      .orderBy(desc(attendanceTable.sessionDate));

    // Scolarité (frais + paiements)
    const [feeRow] = await db.select().from(studentFeesTable).where(eq(studentFeesTable.studentId, studentId)).limit(1);
    const payments = await db
      .select({
        id: paymentsTable.id,
        amount: paymentsTable.amount,
        description: paymentsTable.description,
        paymentDate: paymentsTable.paymentDate,
        createdAt: paymentsTable.createdAt,
      })
      .from(paymentsTable)
      .where(eq(paymentsTable.studentId, studentId))
      .orderBy(desc(paymentsTable.paymentDate));

    const totalPaid = payments.reduce((s, p) => s + (p.amount ?? 0), 0);
    const totalDue = feeRow?.totalAmount ?? 0;

    // Hébergement
    const housingRows = await db
      .select({
        assignmentId: housingAssignmentsTable.id,
        roomId: housingAssignmentsTable.roomId,
        roomNumber: housingRoomsTable.roomNumber,
        buildingName: housingBuildingsTable.name,
        floor: housingRoomsTable.floor,
        type: housingRoomsTable.type,
        pricePerMonth: housingRoomsTable.pricePerMonth,
        startDate: housingAssignmentsTable.startDate,
        endDate: housingAssignmentsTable.endDate,
        status: housingAssignmentsTable.status,
        notes: housingAssignmentsTable.notes,
      })
      .from(housingAssignmentsTable)
      .innerJoin(housingRoomsTable, eq(housingRoomsTable.id, housingAssignmentsTable.roomId))
      .innerJoin(housingBuildingsTable, eq(housingBuildingsTable.id, housingRoomsTable.buildingId))
      .where(eq(housingAssignmentsTable.studentId, studentId))
      .orderBy(desc(housingAssignmentsTable.startDate));

    res.json({
      student: userRow,
      enrollments,
      semesterResults,
      absences: absenceRows,
      scolarite: {
        totalDue,
        totalPaid: Math.round(totalPaid * 100) / 100,
        balance: Math.round((totalDue - totalPaid) * 100) / 100,
        academicYear: feeRow?.academicYear ?? null,
        payments,
      },
      housing: housingRows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── GET /admin/bulletin/class/:classId/:semesterId — bulletins masse ─────────
router.get("/bulletin/class/:classId/:semesterId", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session.user!;
    if (cu.adminSubRole !== "scolarite" && cu.adminSubRole !== "directeur") {
      res.status(403).json({ error: "Réservé à la Scolarité et au Directeur." });
      return;
    }
    const classId = parseInt(req.params.classId);
    const semesterId = parseInt(req.params.semesterId);

    const [classRow] = await db.select().from(classesTable).where(eq(classesTable.id, classId)).limit(1);
    const [semester] = await db.select().from(semestersTable).where(eq(semestersTable.id, semesterId)).limit(1);
    if (!classRow || !semester) { res.status(404).json({ error: "Classe ou semestre introuvable." }); return; }

    const enrolledStudents = await db
      .select({ studentId: classEnrollmentsTable.studentId, studentName: usersTable.name })
      .from(classEnrollmentsTable)
      .innerJoin(usersTable, eq(usersTable.id, classEnrollmentsTable.studentId))
      .where(eq(classEnrollmentsTable.classId, classId))
      .orderBy(usersTable.name);

    if (enrolledStudents.length === 0) {
      res.status(404).json({ error: "Aucun étudiant dans cette classe." });
      return;
    }

    // Compute results for all students
    const uesWithCategory = await db.select().from(teachingUnitsTable).where(
      and(eq(teachingUnitsTable.classId, classId), eq(teachingUnitsTable.semesterId, semesterId))
    );
    const ueCategMap = new Map(uesWithCategory.map(u => [u.id, u.category]));

    // Compute rank across class
    const allStudentIds = enrolledStudents.map(s => s.studentId);
    const allGradesForRank = await db
      .select({ studentId: gradesTable.studentId, value: gradesTable.value, coefficient: subjectsTable.coefficient })
      .from(gradesTable)
      .innerJoin(subjectsTable, eq(subjectsTable.id, gradesTable.subjectId))
      .where(and(inArray(gradesTable.studentId, allStudentIds), eq(gradesTable.semesterId, semesterId)));

    const studentSums = new Map<number, { sum: number; coef: number }>();
    for (const g of allGradesForRank) {
      const entry = studentSums.get(g.studentId) ?? { sum: 0, coef: 0 };
      entry.sum += (g.value ?? 0) * (g.coefficient ?? 1);
      entry.coef += g.coefficient ?? 1;
      studentSums.set(g.studentId, entry);
    }
    const avgMap = new Map<number, number>();
    for (const [sid, { sum, coef }] of studentSums) {
      if (coef > 0) avgMap.set(sid, sum / coef);
    }
    const sortedAvgs = [...avgMap.entries()].sort((a, b) => b[1] - a[1]);
    const rankMap = new Map<number, number>();
    sortedAvgs.forEach(([sid], i) => rankMap.set(sid, i + 1));

    // Fetch profiles for all students at once
    const profiles = await db
      .select({
        studentId: studentProfilesTable.studentId,
        matricule: studentProfilesTable.matricule,
        dateNaissance: studentProfilesTable.dateNaissance,
        lieuNaissance: studentProfilesTable.lieuNaissance,
        sexe: studentProfilesTable.sexe,
      })
      .from(studentProfilesTable)
      .where(inArray(studentProfilesTable.studentId, allStudentIds));
    const profileMap = new Map(profiles.map(p => [p.studentId, p]));

    const filiere = classRow.filiere ?? classRow.name ?? "";
    const schoolRows = await db
      .select({ acronym: ecolesInphbTable.acronym, name: ecolesInphbTable.name })
      .from(ecolesInphbTable)
      .orderBy(ecolesInphbTable.displayOrder);

    const bulletinHTMLParts: string[] = [];
    for (const { studentId } of enrolledStudents) {
      const result = await computeStudentResult(studentId, semesterId);
      if (!result) continue;

      const ueResults = result.ueResults.map(ue => ({
        ...ue,
        category: ueCategMap.get(ue.ueId) ?? null,
      }));

      const rank = rankMap.get(studentId) ?? null;
      const totalStudents = sortedAvgs.length;
      const profile = profileMap.get(studentId);
      const studentMatricule = profile?.matricule?.trim() || String(studentId).padStart(6, "0");
      const averageBrute = result.average !== null
        ? Math.round((result.average + result.absenceDeduction) * 100) / 100
        : null;
      const editionDate = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

      const html = generateBulletinHTML({
        studentName: result.studentName,
        studentMatricule,
        dateNaissance: profile?.dateNaissance ?? null,
        lieuNaissance: profile?.lieuNaissance ?? null,
        sexe: profile?.sexe ?? null,
        filiere,
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

      bulletinHTMLParts.push(html);
    }

    // Combine all bulletins into a single printable page
    const combinedHTML = `<!DOCTYPE html><html lang="fr"><head>
<meta charset="UTF-8">
<title>Bulletins — ${classRow.name} — ${semester.name}</title>
<style>
  body { margin: 0; padding: 0; }
  .bulletin-wrapper { page-break-after: always; }
  .bulletin-wrapper:last-child { page-break-after: avoid; }
  @media print { .no-print { display: none !important; } }
  .no-print {
    position: fixed; top: 16px; right: 16px; z-index: 9999;
    background: #1e40af; color: white; border: none; padding: 10px 20px;
    border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;
  }
</style>
</head><body>
<button class="no-print" onclick="window.print()">🖨️ Imprimer / Enregistrer PDF</button>
${bulletinHTMLParts.map(h => {
  // Extract just the body content from each bulletin
  const bodyMatch = h.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const content = bodyMatch ? bodyMatch[1] : h;
  // Remove individual print buttons
  const cleaned = content.replace(/<button[^>]*class="[^"]*no-print[^"]*"[^>]*>[\s\S]*?<\/button>/gi, "");
  return `<div class="bulletin-wrapper">${cleaned}</div>`;
}).join("\n")}
</body></html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(combinedHTML);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Paiements (T001) ─────────────────────────────────────────────────────────

router.post("/payments", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session?.user as any;
    if (cu?.adminSubRole !== "scolarite" && cu?.adminSubRole !== "directeur") {
      res.status(403).json({ error: "Réservé à la Scolarité et au Directeur." }); return;
    }
    const { studentId, amount, description, paymentDate } = req.body;
    if (!studentId || !amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      res.status(400).json({ error: "studentId et amount (positif) sont requis." }); return;
    }
    const [payment] = await db.insert(paymentsTable).values({
      studentId: parseInt(studentId),
      amount: Number(amount).toFixed(2),
      description: description?.trim() || null,
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      recordedById: cu.id,
    }).returning();
    await db.insert(activityLogTable).values({
      userId: cu.id,
      action: "payment_recorded",
      details: `Paiement de ${Number(amount).toFixed(0)} F enregistré pour l'étudiant #${studentId}.`,
    }).catch(() => {});
    res.status(201).json(payment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/payments/:id", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session?.user as any;
    if (cu?.adminSubRole !== "scolarite" && cu?.adminSubRole !== "directeur") {
      res.status(403).json({ error: "Réservé à la Scolarité et au Directeur." }); return;
    }
    const id = parseInt(req.params.id);
    const [deleted] = await db.delete(paymentsTable).where(eq(paymentsTable.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: "Paiement introuvable." }); return; }
    res.json({ message: "Paiement supprimé." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Suivi heures planifiées vs réalisées (T003) ──────────────────────────────

router.get("/suivi-heures", requireRole("admin"), async (req, res) => {
  try {
    const { semesterId, classId } = req.query;

    const conditions: any[] = [];
    if (semesterId) conditions.push(eq(teacherAssignmentsTable.semesterId, parseInt(semesterId as string)));
    if (classId) conditions.push(eq(teacherAssignmentsTable.classId, parseInt(classId as string)));

    const assignments = await db
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
      })
      .from(teacherAssignmentsTable)
      .innerJoin(usersTable, eq(usersTable.id, teacherAssignmentsTable.teacherId))
      .innerJoin(subjectsTable, eq(subjectsTable.id, teacherAssignmentsTable.subjectId))
      .innerJoin(classesTable, eq(classesTable.id, teacherAssignmentsTable.classId))
      .innerJoin(semestersTable, eq(semestersTable.id, teacherAssignmentsTable.semesterId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(usersTable.name), asc(subjectsTable.name));

    const result = await Promise.all(assignments.map(async (a) => {
      const [row] = await db
        .select({
          sessions: sql<number>`COUNT(*)`,
          heuresRealisees: sql<number>`COALESCE(SUM(${cahierDeTexteTable.heuresEffectuees}), 0)`,
        })
        .from(cahierDeTexteTable)
        .where(
          and(
            eq(cahierDeTexteTable.teacherId, a.teacherId),
            eq(cahierDeTexteTable.subjectId, a.subjectId),
            eq(cahierDeTexteTable.classId, a.classId),
            eq(cahierDeTexteTable.semesterId, a.semesterId),
          )
        );

      const planned = Number(a.plannedHours ?? 0);
      const done = Number(row?.heuresRealisees ?? 0);
      const pct = planned > 0 ? Math.round((done / planned) * 100) : null;

      return {
        ...a,
        plannedHours: planned,
        heuresRealisees: done,
        sessions: Number(row?.sessions ?? 0),
        progressPct: pct,
      };
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Alertes seuil d'absences (T007) ──────────────────────────────────────────

router.post("/absences/send-alerts", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session?.user as any;
    const { semesterId, classId, threshold = 3 } = req.body;
    if (!semesterId) { res.status(400).json({ error: "semesterId requis." }); return; }

    const threshNum = parseInt(String(threshold));
    const cond: any[] = [
      eq(attendanceTable.semesterId, parseInt(String(semesterId))),
      eq(attendanceTable.status, "absent"),
      eq(attendanceTable.justified, false),
    ];
    if (classId) cond.push(eq(attendanceTable.classId, parseInt(String(classId))));

    const absRows = await db
      .select({
        studentId: attendanceTable.studentId,
        studentName: usersTable.name,
        absenceCount: sql<number>`COUNT(*)`,
      })
      .from(attendanceTable)
      .innerJoin(usersTable, eq(usersTable.id, attendanceTable.studentId))
      .where(and(...cond))
      .groupBy(attendanceTable.studentId, usersTable.name)
      .having(sql`COUNT(*) >= ${threshNum}`);

    if (absRows.length === 0) {
      res.json({ sent: 0, message: "Aucun étudiant ne dépasse le seuil." });
      return;
    }

    await Promise.all(absRows.map(async (s) => {
      await db.insert(notificationsTable).values({
        userId: s.studentId,
        type: "absence_alert",
        title: "Alerte absences",
        message: `Vous avez ${s.absenceCount} absence(s) non justifiée(s) ce semestre (seuil : ${threshNum}). Veuillez régulariser votre situation auprès de la scolarité.`,
      });
      sendPushToUser(s.studentId, {
        title: "Alerte absences",
        body: `Vous avez ${s.absenceCount} absence(s) non justifiée(s). Contactez la scolarité.`,
        type: "absence_alert",
      }).catch(() => {});
    }));

    res.json({ sent: absRows.length, students: absRows.map(s => ({ id: s.studentId, name: s.studentName, absenceCount: s.absenceCount })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Alert count: students above absence threshold ────────────────────────────

router.get("/absences/alert-count", requireRole("admin"), async (req, res) => {
  try {
    const threshold = parseInt((req.query.threshold as string) ?? "3");
    const rows = Array.from(await db.execute(sql`
      SELECT COUNT(*)::int as count
      FROM (
        SELECT student_id
        FROM ${attendanceTable}
        WHERE status = 'absent'
        GROUP BY student_id
        HAVING COUNT(*) >= ${threshold}
      ) sub
    `));
    res.json({ count: (rows[0] as any)?.count ?? 0, threshold });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Director stats: class progression + financial recovery ───────────────────

router.get("/stats", requireRole("admin"), async (req, res) => {
  try {
    const progression = await db.execute(sql`
      SELECT
        c.id as class_id,
        c.name as class_name,
        COUNT(DISTINCT se.id)::int as planned_sessions,
        COUNT(DISTINCT cdt.id)::int as actual_sessions
      FROM classes c
      LEFT JOIN schedule_entries se ON se.class_id = c.id
      LEFT JOIN cahier_de_texte cdt ON cdt.class_id = c.id
      GROUP BY c.id, c.name
      ORDER BY c.name
    `);

    const financial = await db.execute(sql`
      SELECT
        c.id as class_id,
        c.name as class_name,
        COALESCE(SUM(sf.total_amount), 0)::numeric as total_due,
        COALESCE(SUM(p_agg.total_paid), 0)::numeric as total_paid
      FROM classes c
      LEFT JOIN class_enrollments ce ON ce.class_id = c.id
      LEFT JOIN student_fees sf ON sf.student_id = ce.student_id
      LEFT JOIN (
        SELECT student_id, SUM(amount)::numeric as total_paid
        FROM payments
        GROUP BY student_id
      ) p_agg ON p_agg.student_id = ce.student_id
      GROUP BY c.id, c.name
      ORDER BY c.name
    `);

    res.json({ progression: Array.from(progression), financial: Array.from(financial) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Cahier de texte (lecture seule admin) ────────────────────────────────────

router.get("/cahier-de-texte", requireRole("admin"), async (req, res) => {
  try {
    const { teacherId, classId, subjectId, semesterId } = req.query;

    const conditions: any[] = [];
    if (teacherId) conditions.push(eq(cahierDeTexteTable.teacherId, parseInt(teacherId as string)));
    if (classId) conditions.push(eq(cahierDeTexteTable.classId, parseInt(classId as string)));
    if (subjectId) conditions.push(eq(cahierDeTexteTable.subjectId, parseInt(subjectId as string)));
    if (semesterId) conditions.push(eq(cahierDeTexteTable.semesterId, parseInt(semesterId as string)));

    const query = db
      .select({
        id: cahierDeTexteTable.id,
        sessionDate: cahierDeTexteTable.sessionDate,
        title: cahierDeTexteTable.title,
        contenu: cahierDeTexteTable.contenu,
        devoirs: cahierDeTexteTable.devoirs,
        heuresEffectuees: cahierDeTexteTable.heuresEffectuees,
        subjectId: cahierDeTexteTable.subjectId,
        subjectName: subjectsTable.name,
        classId: cahierDeTexteTable.classId,
        className: classesTable.name,
        semesterId: cahierDeTexteTable.semesterId,
        semesterName: semestersTable.name,
        teacherId: cahierDeTexteTable.teacherId,
        teacherName: usersTable.name,
        createdAt: cahierDeTexteTable.createdAt,
        updatedAt: cahierDeTexteTable.updatedAt,
      })
      .from(cahierDeTexteTable)
      .innerJoin(subjectsTable, eq(subjectsTable.id, cahierDeTexteTable.subjectId))
      .innerJoin(classesTable, eq(classesTable.id, cahierDeTexteTable.classId))
      .innerJoin(semestersTable, eq(semestersTable.id, cahierDeTexteTable.semesterId))
      .innerJoin(usersTable, eq(usersTable.id, cahierDeTexteTable.teacherId))
      .orderBy(desc(cahierDeTexteTable.sessionDate), asc(usersTable.name));

    const entries = conditions.length > 0
      ? await query.where(conditions.length === 1 ? conditions[0] : and(...conditions))
      : await query;

    res.json(entries);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ===========================
// RETAKE SESSION ROUTES (Admin)
// ===========================

// GET /admin/retake-sessions — List all retake sessions
router.get("/retake-sessions", requireRole("admin"), async (req, res) => {
  try {
    const sessions = await db
      .select({
        id: retakeSessionsTable.id,
        label: retakeSessionsTable.label,
        status: retakeSessionsTable.status,
        semesterId: retakeSessionsTable.semesterId,
        semesterName: semestersTable.name,
        createdBy: retakeSessionsTable.createdBy,
        createdByName: usersTable.name,
        openedAt: retakeSessionsTable.openedAt,
        closedAt: retakeSessionsTable.closedAt,
        createdAt: retakeSessionsTable.createdAt,
      })
      .from(retakeSessionsTable)
      .leftJoin(semestersTable, eq(retakeSessionsTable.semesterId, semestersTable.id))
      .leftJoin(usersTable, eq(retakeSessionsTable.createdBy, usersTable.id))
      .orderBy(desc(retakeSessionsTable.createdAt));
    res.json(sessions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /admin/retake-sessions — Create and open a new retake session
router.post("/retake-sessions", requireRole("admin"), async (req, res) => {
  try {
    const adminId = req.session!.userId!;
    const { label, semesterId } = req.body;
    if (!label || !semesterId) return res.status(400).json({ error: "label et semesterId requis" });

    const [session] = await db.insert(retakeSessionsTable).values({
      label,
      semesterId: parseInt(semesterId),
      status: "open",
      createdBy: adminId,
      openedAt: new Date(),
    }).returning();

    // Notify all teachers of this semester
    const teachers = await db
      .select({ teacherId: teacherAssignmentsTable.teacherId })
      .from(teacherAssignmentsTable)
      .where(eq(teacherAssignmentsTable.semesterId, parseInt(semesterId)));

    const uniqueTeacherIds = [...new Set(teachers.map(t => t.teacherId))];
    if (uniqueTeacherIds.length > 0) {
      await db.insert(notificationsTable).values(
        uniqueTeacherIds.map(tid => ({
          userId: tid,
          type: "retake_session_open",
          title: "Session de rattrapage ouverte",
          message: `La session de rattrapage "${label}" est maintenant ouverte. Vous pouvez saisir les notes de rattrapage.`,
          read: false,
        }))
      );
      for (const tid of uniqueTeacherIds) {
        sendPushToUser(tid, {
          title: "Session de rattrapage ouverte",
          body: `La session "${label}" est maintenant ouverte.`,
          type: "retake_session_open",
        }).catch(() => {});
      }
    }

    res.status(201).json(session);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// PATCH /admin/retake-sessions/:id/close — Close a retake session
router.patch("/retake-sessions/:id/close", requireRole("admin"), async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const [updated] = await db
      .update(retakeSessionsTable)
      .set({ status: "closed", closedAt: new Date(), updatedAt: new Date() })
      .where(eq(retakeSessionsTable.id, sessionId))
      .returning();
    if (!updated) return res.status(404).json({ error: "Session introuvable" });

    // Notify teachers that session is closed
    const teachers = await db
      .select({ teacherId: retakeGradesTable.teacherId })
      .from(retakeGradesTable)
      .where(eq(retakeGradesTable.sessionId, sessionId));
    const uniqueTeacherIds = [...new Set(teachers.map(t => t.teacherId))];
    if (uniqueTeacherIds.length > 0) {
      await db.insert(notificationsTable).values(
        uniqueTeacherIds.map(tid => ({
          userId: tid,
          type: "retake_session_closed",
          title: "Session de rattrapage clôturée",
          message: `La session de rattrapage "${updated.label}" a été clôturée. Aucune modification n'est plus possible.`,
          read: false,
        }))
      );
    }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /admin/retake-sessions/:id/grades — View all submitted grades for a session
router.get("/retake-sessions/:id/grades", requireRole("admin"), async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const grades = await db
      .select({
        id: retakeGradesTable.id,
        studentId: retakeGradesTable.studentId,
        studentName: usersTable.name,
        subjectId: retakeGradesTable.subjectId,
        subjectName: subjectsTable.name,
        teacherId: retakeGradesTable.teacherId,
        value: retakeGradesTable.value,
        observation: retakeGradesTable.observation,
        submissionStatus: retakeGradesTable.submissionStatus,
        submittedAt: retakeGradesTable.submittedAt,
        validatedAt: retakeGradesTable.validatedAt,
      })
      .from(retakeGradesTable)
      .leftJoin(usersTable, eq(retakeGradesTable.studentId, usersTable.id))
      .leftJoin(subjectsTable, eq(retakeGradesTable.subjectId, subjectsTable.id))
      .where(eq(retakeGradesTable.sessionId, sessionId))
      .orderBy(asc(usersTable.name));
    res.json(grades);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /admin/retake-sessions/:id/validate — Validate submitted grades (copy to main grades table)
router.post("/retake-sessions/:id/validate", requireRole("admin"), async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);

    const session = await db.select().from(retakeSessionsTable).where(eq(retakeSessionsTable.id, sessionId)).limit(1);
    if (!session[0]) return res.status(404).json({ error: "Session introuvable" });

    const submittedGrades = await db
      .select()
      .from(retakeGradesTable)
      .where(and(eq(retakeGradesTable.sessionId, sessionId), eq(retakeGradesTable.submissionStatus, "submitted")));

    if (submittedGrades.length === 0) return res.status(400).json({ error: "Aucune note soumise à valider" });

    for (const rg of submittedGrades) {
      if (rg.value !== null && rg.value !== undefined) {
        // Upsert into main grades table with evaluationNumber=99 (rattrapage)
        await db
          .insert(gradesTable)
          .values({
            studentId: rg.studentId,
            subjectId: rg.subjectId,
            semesterId: session[0].semesterId,
            evaluationNumber: 99,
            value: rg.value,
          })
          .onConflictDoUpdate({
            target: [gradesTable.studentId, gradesTable.subjectId, gradesTable.semesterId, gradesTable.evaluationNumber],
            set: { value: rg.value, updatedAt: new Date() },
          });
      }

      // Mark as validated
      await db
        .update(retakeGradesTable)
        .set({ submissionStatus: "validated", validatedAt: new Date(), updatedAt: new Date() })
        .where(eq(retakeGradesTable.id, rg.id));

      // Notify student
      if (rg.value !== null && rg.value !== undefined) {
        const subject = await db.select({ name: subjectsTable.name }).from(subjectsTable).where(eq(subjectsTable.id, rg.subjectId)).limit(1);
        await db.insert(notificationsTable).values({
          userId: rg.studentId,
          type: "retake_grade_validated",
          title: "Note de rattrapage publiée",
          message: `Votre note de rattrapage en ${subject[0]?.name ?? "matière"} est de ${rg.value}/20.`,
          read: false,
        });
        sendPushToUser(rg.studentId, {
          title: "Note de rattrapage publiée",
          body: `Votre note de rattrapage en ${subject[0]?.name ?? "matière"} est de ${rg.value}/20.`,
          type: "retake_grade_validated",
        }).catch(() => {});
      }
    }

    res.json({ validated: submittedGrades.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
