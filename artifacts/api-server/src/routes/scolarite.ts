import { Router } from "express";
import { db } from "@workspace/db";
import {
  studentFeesTable,
  paymentsTable,
  usersTable,
  classEnrollmentsTable,
  classesTable,
  activityLogTable,
} from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { requireRole } from "../lib/auth.js";

const router = Router();

// Only scolarité and directeur can access
function requireScolariteOrDirecteur(req: any, res: any, next: any) {
  const sub = req.session?.user?.adminSubRole;
  if (sub !== "scolarite" && sub !== "directeur") {
    res.status(403).json({ error: "Réservé à l'Assistant(e) de Direction et au Directeur du Centre." });
    return;
  }
  next();
}

// ─── GET /api/scolarite/students ──────────────────────────────────────────────
// Returns all students with their fee info and total paid
router.get("/students", requireRole("admin"), requireScolariteOrDirecteur, async (req, res) => {
  try {
    const students = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        classId: classEnrollmentsTable.classId,
        className: classesTable.name,
      })
      .from(usersTable)
      .leftJoin(classEnrollmentsTable, eq(classEnrollmentsTable.studentId, usersTable.id))
      .leftJoin(classesTable, eq(classesTable.id, classEnrollmentsTable.classId))
      .where(eq(usersTable.role, "student"));

    if (students.length === 0) {
      res.json([]);
      return;
    }

    const studentIds = students.map(s => s.id);

    const fees = await db
      .select()
      .from(studentFeesTable)
      .where(inArray(studentFeesTable.studentId, studentIds));

    const feeMap = new Map(fees.map(f => [f.studentId, f]));

    // Sum paid per student
    const paidRows = await db
      .select({
        studentId: paymentsTable.studentId,
        totalPaid: sql<number>`COALESCE(SUM(${paymentsTable.amount}), 0)`,
      })
      .from(paymentsTable)
      .where(inArray(paymentsTable.studentId, studentIds))
      .groupBy(paymentsTable.studentId);

    const paidMap = new Map(paidRows.map(r => [r.studentId, Number(r.totalPaid)]));

    const result = students.map(s => {
      const fee = feeMap.get(s.id);
      const totalAmount = fee?.totalAmount ?? 0;
      const totalPaid = paidMap.get(s.id) ?? 0;
      const remaining = Math.max(0, totalAmount - totalPaid);
      let status: "paid" | "partial" | "unpaid" = "unpaid";
      if (totalAmount > 0) {
        if (totalPaid >= totalAmount) status = "paid";
        else if (totalPaid > 0) status = "partial";
      }
      return {
        id: s.id,
        name: s.name,
        email: s.email,
        classId: s.classId,
        className: s.className,
        feeId: fee?.id ?? null,
        totalAmount,
        totalPaid,
        remaining,
        academicYear: fee?.academicYear ?? null,
        notes: fee?.notes ?? null,
        status,
      };
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── GET /api/scolarite/stats ─────────────────────────────────────────────────
router.get("/stats", requireRole("admin"), requireScolariteOrDirecteur, async (req, res) => {
  try {
    const [totals] = await db
      .select({
        totalExpected: sql<number>`COALESCE(SUM(${studentFeesTable.totalAmount}), 0)`,
        studentCount: sql<number>`COUNT(${studentFeesTable.id})`,
      })
      .from(studentFeesTable);

    const [collected] = await db
      .select({
        totalPaid: sql<number>`COALESCE(SUM(${paymentsTable.amount}), 0)`,
      })
      .from(paymentsTable);

    // Students fully paid, partial, none
    const studentIds = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.role, "student"));

    const allIds = studentIds.map(s => s.id);
    const feeStudentIds = (await db.select({ studentId: studentFeesTable.studentId }).from(studentFeesTable)).map(f => f.studentId);

    const paidRows = allIds.length > 0
      ? await db
          .select({
            studentId: paymentsTable.studentId,
            totalPaid: sql<number>`COALESCE(SUM(${paymentsTable.amount}), 0)`,
          })
          .from(paymentsTable)
          .where(inArray(paymentsTable.studentId, allIds))
          .groupBy(paymentsTable.studentId)
      : [];

    const paidMap = new Map(paidRows.map(r => [r.studentId, Number(r.totalPaid)]));
    const fees = await db.select().from(studentFeesTable);
    const feeMap = new Map(fees.map(f => [f.studentId, f.totalAmount]));

    let fullyPaid = 0, partial = 0, noPay = 0;
    for (const id of feeStudentIds) {
      const fee = feeMap.get(id) ?? 0;
      const paid = paidMap.get(id) ?? 0;
      if (fee > 0) {
        if (paid >= fee) fullyPaid++;
        else if (paid > 0) partial++;
        else noPay++;
      }
    }

    const totalExpected = Number(totals?.totalExpected ?? 0);
    const totalPaid = Number(collected?.totalPaid ?? 0);
    const recoveryRate = totalExpected > 0 ? Math.round((totalPaid / totalExpected) * 1000) / 10 : 0;

    res.json({
      totalExpected,
      totalPaid,
      totalRemaining: Math.max(0, totalExpected - totalPaid),
      recoveryRate,
      studentCount: Number(totals?.studentCount ?? 0),
      fullyPaid,
      partial,
      noPay,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── PUT /api/scolarite/fees/:studentId ───────────────────────────────────────
// Set or update a student's total fee
router.put("/fees/:studentId", requireRole("admin"), requireScolariteOrDirecteur, async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const { totalAmount, academicYear, notes } = req.body;
    if (totalAmount === undefined || totalAmount < 0) {
      res.status(400).json({ error: "Montant invalide" });
      return;
    }
    const [student] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, studentId));
    const [row] = await db
      .insert(studentFeesTable)
      .values({ studentId, totalAmount, academicYear: academicYear ?? null, notes: notes ?? null })
      .onConflictDoUpdate({
        target: [studentFeesTable.studentId],
        set: { totalAmount, academicYear: academicYear ?? null, notes: notes ?? null, updatedAt: new Date() },
      })
      .returning();
    await db.insert(activityLogTable).values({
      userId: req.session!.userId!,
      action: "modification_frais_scolarite",
      details: `Frais de scolarité de ${student?.name ?? `ID ${studentId}`} définis à ${totalAmount.toLocaleString("fr-FR")} FCFA${academicYear ? ` (${academicYear})` : ""}.`,
    });
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── GET /api/scolarite/payments/:studentId ───────────────────────────────────
router.get("/payments/:studentId", requireRole("admin"), requireScolariteOrDirecteur, async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const rows = await db
      .select({
        id: paymentsTable.id,
        studentId: paymentsTable.studentId,
        amount: paymentsTable.amount,
        description: paymentsTable.description,
        paymentDate: paymentsTable.paymentDate,
        createdAt: paymentsTable.createdAt,
        recordedByName: usersTable.name,
      })
      .from(paymentsTable)
      .leftJoin(usersTable, eq(usersTable.id, paymentsTable.recordedById))
      .where(eq(paymentsTable.studentId, studentId))
      .orderBy(paymentsTable.paymentDate);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── POST /api/scolarite/payments ─────────────────────────────────────────────
router.post("/payments", requireRole("admin"), requireScolariteOrDirecteur, async (req, res) => {
  try {
    const { studentId, amount, description, paymentDate } = req.body;
    const recordedById = req.session!.userId!;
    if (!studentId || !amount || amount <= 0 || !paymentDate) {
      res.status(400).json({ error: "studentId, amount et paymentDate sont requis" });
      return;
    }
    const [student] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, studentId));
    const [row] = await db
      .insert(paymentsTable)
      .values({ studentId, amount, description: description ?? null, paymentDate, recordedById })
      .returning();
    await db.insert(activityLogTable).values({
      userId: recordedById,
      action: "enregistrement_paiement",
      details: `Paiement de ${Number(amount).toLocaleString("fr-FR")} FCFA enregistré pour ${student?.name ?? `ID ${studentId}`}${description ? ` — ${description}` : ""} (date : ${paymentDate}).`,
    });
    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── DELETE /api/scolarite/payments/:id ──────────────────────────────────────
router.delete("/payments/:id", requireRole("admin"), requireScolariteOrDirecteur, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [payment] = await db
      .select({ amount: paymentsTable.amount, studentId: paymentsTable.studentId, description: paymentsTable.description })
      .from(paymentsTable)
      .where(eq(paymentsTable.id, id));
    if (payment) {
      const [student] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, payment.studentId));
      await db.delete(paymentsTable).where(eq(paymentsTable.id, id));
      await db.insert(activityLogTable).values({
        userId: req.session!.userId!,
        action: "suppression_paiement",
        details: `Paiement de ${Number(payment.amount).toLocaleString("fr-FR")} FCFA supprimé pour ${student?.name ?? `ID ${payment.studentId}`}${payment.description ? ` (${payment.description})` : ""}.`,
      });
    } else {
      await db.delete(paymentsTable).where(eq(paymentsTable.id, id));
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
