import { Router } from "express";
import { db } from "@workspace/db";
import { messagesTable, usersTable, classesTable, classEnrollmentsTable } from "@workspace/db";
import { eq, and, or, desc, isNull, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

// ─── Get all conversations for current user ──────────────────────────────────
router.get("/messages", requireAuth, async (req, res) => {
  try {
    const userId = req.session!.userId!;

    const rows = await db
      .select({
        id: messagesTable.id,
        senderId: messagesTable.senderId,
        senderName: sql<string>`sender.name`,
        senderRole: sql<string>`sender.role`,
        senderSubRole: sql<string>`sender.admin_sub_role`,
        recipientId: messagesTable.recipientId,
        recipientName: sql<string>`recipient.name`,
        recipientRole: sql<string>`recipient.role`,
        recipientSubRole: sql<string>`recipient.admin_sub_role`,
        content: messagesTable.content,
        readAt: messagesTable.readAt,
        createdAt: messagesTable.createdAt,
      })
      .from(messagesTable)
      .innerJoin(sql`users sender`, sql`sender.id = ${messagesTable.senderId}`)
      .innerJoin(sql`users recipient`, sql`recipient.id = ${messagesTable.recipientId}`)
      .where(
        or(
          eq(messagesTable.senderId, userId),
          eq(messagesTable.recipientId, userId)
        )
      )
      .orderBy(desc(messagesTable.createdAt));

    const convMap = new Map<number, any>();
    for (const r of rows) {
      const otherId = r.senderId === userId ? r.recipientId : r.senderId;
      if (!convMap.has(otherId)) {
        convMap.set(otherId, {
          userId: otherId,
          userName: r.senderId === userId ? r.recipientName : r.senderName,
          userRole: r.senderId === userId ? r.recipientRole : r.senderRole,
          userSubRole: r.senderId === userId ? r.recipientSubRole : r.senderSubRole,
          lastMessage: r.content,
          lastAt: r.createdAt,
          unreadCount: 0,
        });
      }
      if (r.recipientId === userId && !r.readAt) {
        convMap.get(otherId)!.unreadCount++;
      }
    }

    res.json(Array.from(convMap.values()));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Get unread count (MUST be before /:userId) ──────────────────────────────
router.get("/messages/unread/count", requireAuth, async (req, res) => {
  try {
    const userId = req.session!.userId!;
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messagesTable)
      .where(and(eq(messagesTable.recipientId, userId), isNull(messagesTable.readAt)));
    res.json({ count: row?.count ?? 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Get contacts list (MUST be before /:userId) ─────────────────────────────
router.get("/messages/contacts/list", requireAuth, async (req, res) => {
  try {
    const contacts = await db
      .select({ id: usersTable.id, name: usersTable.name, role: usersTable.role, adminSubRole: usersTable.adminSubRole })
      .from(usersTable)
      .where(
        or(
          eq(usersTable.role, "student"),
          eq(usersTable.role, "teacher")
        )
      )
      .orderBy(usersTable.name);
    res.json(contacts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Get classes list for broadcast (MUST be before /:userId) ────────────────
router.get("/messages/classes/list", requireAuth, async (req, res) => {
  try {
    const classes = await db
      .select({
        id: classesTable.id,
        name: classesTable.name,
        studentCount: sql<number>`count(ce.id)::int`,
      })
      .from(classesTable)
      .leftJoin(classEnrollmentsTable, eq(classEnrollmentsTable.classId, classesTable.id))
      .groupBy(classesTable.id, classesTable.name)
      .orderBy(classesTable.name);
    res.json(classes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Broadcast message to all students in a class ────────────────────────────
router.post("/messages/class/:classId", requireAuth, async (req, res) => {
  try {
    const senderId = req.session!.userId!;
    const classId = parseInt(req.params.classId);
    const { content } = req.body as { content: string };

    if (!content?.trim()) {
      res.status(400).json({ error: "content requis" });
      return;
    }

    // Get all students enrolled in this class
    const enrollments = await db
      .select({ studentId: classEnrollmentsTable.studentId })
      .from(classEnrollmentsTable)
      .where(eq(classEnrollmentsTable.classId, classId));

    if (enrollments.length === 0) {
      res.status(404).json({ error: "Aucun étudiant dans cette classe" });
      return;
    }

    // Insert a message for each student
    const values = enrollments.map((e) => ({
      senderId,
      recipientId: e.studentId,
      content: content.trim(),
    }));

    await db.insert(messagesTable).values(values);

    res.json({ sent: enrollments.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Get messages with a specific user ───────────────────────────────────────
router.get("/messages/:userId", requireAuth, async (req, res) => {
  try {
    const currentUserId = req.session!.userId!;
    const otherId = parseInt(req.params.userId);

    const messages = await db
      .select({
        id: messagesTable.id,
        senderId: messagesTable.senderId,
        senderName: sql<string>`sender.name`,
        recipientId: messagesTable.recipientId,
        content: messagesTable.content,
        readAt: messagesTable.readAt,
        createdAt: messagesTable.createdAt,
      })
      .from(messagesTable)
      .innerJoin(sql`users sender`, sql`sender.id = ${messagesTable.senderId}`)
      .where(
        or(
          and(eq(messagesTable.senderId, currentUserId), eq(messagesTable.recipientId, otherId)),
          and(eq(messagesTable.senderId, otherId), eq(messagesTable.recipientId, currentUserId))
        )
      )
      .orderBy(messagesTable.createdAt);

    await db
      .update(messagesTable)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(messagesTable.senderId, otherId),
          eq(messagesTable.recipientId, currentUserId),
          isNull(messagesTable.readAt)
        )
      );

    const [other] = await db
      .select({ id: usersTable.id, name: usersTable.name, role: usersTable.role, adminSubRole: usersTable.adminSubRole })
      .from(usersTable)
      .where(eq(usersTable.id, otherId))
      .limit(1);

    res.json({ messages, other });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Send a message ───────────────────────────────────────────────────────────
router.post("/messages", requireAuth, async (req, res) => {
  try {
    const senderId = req.session!.userId!;
    const { recipientId, content } = req.body as { recipientId: number; content: string };

    if (!recipientId || !content?.trim()) {
      res.status(400).json({ error: "recipientId et content requis" });
      return;
    }

    const [msg] = await db
      .insert(messagesTable)
      .values({ senderId, recipientId, content: content.trim() })
      .returning();

    res.json(msg);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
