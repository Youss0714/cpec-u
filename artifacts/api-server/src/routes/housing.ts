import { Router } from "express";
import { db } from "@workspace/db";
import {
  housingBuildingsTable,
  housingRoomsTable,
  housingAssignmentsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, desc, sql, ne } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

// ─── BUILDINGS ────────────────────────────────────────────────────────────────

router.get("/housing/buildings", requireAuth, async (req, res) => {
  try {
    const buildings = await db
      .select({
        id: housingBuildingsTable.id,
        name: housingBuildingsTable.name,
        description: housingBuildingsTable.description,
        floors: housingBuildingsTable.floors,
        createdAt: housingBuildingsTable.createdAt,
        roomCount: sql<number>`count(distinct ${housingRoomsTable.id})::int`,
        occupiedCount: sql<number>`count(distinct case when ${housingRoomsTable.status} = 'occupied' then ${housingRoomsTable.id} end)::int`,
      })
      .from(housingBuildingsTable)
      .leftJoin(housingRoomsTable, eq(housingRoomsTable.buildingId, housingBuildingsTable.id))
      .groupBy(housingBuildingsTable.id)
      .orderBy(housingBuildingsTable.name);
    res.json(buildings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/housing/buildings", requireAuth, async (req, res) => {
  try {
    const { name, description, floors } = req.body as { name: string; description?: string; floors?: number };
    if (!name?.trim()) { res.status(400).json({ error: "name requis" }); return; }
    const [b] = await db.insert(housingBuildingsTable).values({ name: name.trim(), description, floors: floors ?? 1 }).returning();
    res.json(b);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/housing/buildings/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description, floors } = req.body as { name?: string; description?: string; floors?: number };
    const [b] = await db
      .update(housingBuildingsTable)
      .set({ ...(name && { name }), ...(description !== undefined && { description }), ...(floors !== undefined && { floors }) })
      .where(eq(housingBuildingsTable.id, id))
      .returning();
    res.json(b);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/housing/buildings/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(housingBuildingsTable).where(eq(housingBuildingsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── ROOMS ────────────────────────────────────────────────────────────────────

router.get("/housing/rooms", requireAuth, async (req, res) => {
  try {
    const { buildingId } = req.query as { buildingId?: string };
    const rooms = await db
      .select({
        id: housingRoomsTable.id,
        buildingId: housingRoomsTable.buildingId,
        buildingName: housingBuildingsTable.name,
        roomNumber: housingRoomsTable.roomNumber,
        floor: housingRoomsTable.floor,
        capacity: housingRoomsTable.capacity,
        type: housingRoomsTable.type,
        pricePerMonth: housingRoomsTable.pricePerMonth,
        status: housingRoomsTable.status,
        description: housingRoomsTable.description,
      })
      .from(housingRoomsTable)
      .innerJoin(housingBuildingsTable, eq(housingBuildingsTable.id, housingRoomsTable.buildingId))
      .where(buildingId ? eq(housingRoomsTable.buildingId, parseInt(buildingId)) : sql`true`)
      .orderBy(housingBuildingsTable.name, housingRoomsTable.floor, housingRoomsTable.roomNumber);
    res.json(rooms);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/housing/rooms/available", requireAuth, async (req, res) => {
  try {
    const rooms = await db
      .select({
        id: housingRoomsTable.id,
        buildingName: housingBuildingsTable.name,
        roomNumber: housingRoomsTable.roomNumber,
        floor: housingRoomsTable.floor,
        capacity: housingRoomsTable.capacity,
        type: housingRoomsTable.type,
        pricePerMonth: housingRoomsTable.pricePerMonth,
      })
      .from(housingRoomsTable)
      .innerJoin(housingBuildingsTable, eq(housingBuildingsTable.id, housingRoomsTable.buildingId))
      .where(eq(housingRoomsTable.status, "available"))
      .orderBy(housingBuildingsTable.name, housingRoomsTable.roomNumber);
    res.json(rooms);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/housing/rooms", requireAuth, async (req, res) => {
  try {
    const { buildingId, roomNumber, floor, capacity, type, pricePerMonth, description } = req.body as any;
    if (!buildingId || !roomNumber?.trim()) { res.status(400).json({ error: "buildingId et roomNumber requis" }); return; }
    const [r] = await db.insert(housingRoomsTable).values({
      buildingId: parseInt(buildingId),
      roomNumber: roomNumber.trim(),
      floor: floor ?? 0,
      capacity: capacity ?? 1,
      type: type ?? "simple",
      pricePerMonth: pricePerMonth?.toString() ?? "0",
      description,
    }).returning();
    res.json(r);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/housing/rooms/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { roomNumber, floor, capacity, type, pricePerMonth, status, description } = req.body as any;
    const [r] = await db
      .update(housingRoomsTable)
      .set({
        ...(roomNumber && { roomNumber }),
        ...(floor !== undefined && { floor }),
        ...(capacity !== undefined && { capacity }),
        ...(type && { type }),
        ...(pricePerMonth !== undefined && { pricePerMonth: pricePerMonth.toString() }),
        ...(status && { status }),
        ...(description !== undefined && { description }),
      })
      .where(eq(housingRoomsTable.id, id))
      .returning();
    res.json(r);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/housing/rooms/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(housingRoomsTable).where(eq(housingRoomsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── ASSIGNMENTS ──────────────────────────────────────────────────────────────

router.get("/housing/assignments", requireAuth, async (req, res) => {
  try {
    const { status } = req.query as { status?: string };
    const assignments = await db
      .select({
        id: housingAssignmentsTable.id,
        studentId: housingAssignmentsTable.studentId,
        studentName: usersTable.name,
        studentEmail: usersTable.email,
        roomId: housingAssignmentsTable.roomId,
        roomNumber: housingRoomsTable.roomNumber,
        buildingName: housingBuildingsTable.name,
        buildingId: housingBuildingsTable.id,
        type: housingRoomsTable.type,
        pricePerMonth: housingRoomsTable.pricePerMonth,
        startDate: housingAssignmentsTable.startDate,
        endDate: housingAssignmentsTable.endDate,
        status: housingAssignmentsTable.status,
        notes: housingAssignmentsTable.notes,
        createdAt: housingAssignmentsTable.createdAt,
      })
      .from(housingAssignmentsTable)
      .innerJoin(usersTable, eq(usersTable.id, housingAssignmentsTable.studentId))
      .innerJoin(housingRoomsTable, eq(housingRoomsTable.id, housingAssignmentsTable.roomId))
      .innerJoin(housingBuildingsTable, eq(housingBuildingsTable.id, housingRoomsTable.buildingId))
      .where(status ? eq(housingAssignmentsTable.status, status) : sql`true`)
      .orderBy(desc(housingAssignmentsTable.createdAt));
    res.json(assignments);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/housing/assignments", requireAuth, async (req, res) => {
  try {
    const { studentId, roomId, startDate, endDate, notes } = req.body as any;
    if (!studentId || !roomId || !startDate) {
      res.status(400).json({ error: "studentId, roomId et startDate requis" }); return;
    }

    // Check no active assignment for this student
    const [existing] = await db
      .select({ id: housingAssignmentsTable.id })
      .from(housingAssignmentsTable)
      .where(and(eq(housingAssignmentsTable.studentId, studentId), eq(housingAssignmentsTable.status, "active")))
      .limit(1);
    if (existing) {
      res.status(409).json({ error: "Cet étudiant a déjà une chambre active" }); return;
    }

    const [a] = await db.insert(housingAssignmentsTable).values({
      studentId: parseInt(studentId),
      roomId: parseInt(roomId),
      startDate,
      endDate: endDate ?? null,
      notes,
    }).returning();

    // Mark room as occupied
    await db.update(housingRoomsTable).set({ status: "occupied" }).where(eq(housingRoomsTable.id, parseInt(roomId)));

    res.json(a);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/housing/assignments/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { endDate, status, notes } = req.body as any;

    const [a] = await db
      .update(housingAssignmentsTable)
      .set({
        ...(endDate !== undefined && { endDate }),
        ...(status && { status }),
        ...(notes !== undefined && { notes }),
      })
      .where(eq(housingAssignmentsTable.id, id))
      .returning();

    // If ended/cancelled, free the room
    if (status === "ended" || status === "cancelled") {
      // Check if any other active assignment uses this room
      const [otherActive] = await db
        .select({ id: housingAssignmentsTable.id })
        .from(housingAssignmentsTable)
        .where(and(
          eq(housingAssignmentsTable.roomId, a.roomId),
          eq(housingAssignmentsTable.status, "active"),
          ne(housingAssignmentsTable.id, id)
        ))
        .limit(1);
      if (!otherActive) {
        await db.update(housingRoomsTable).set({ status: "available" }).where(eq(housingRoomsTable.id, a.roomId));
      }
    }

    res.json(a);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── STATS (dashboard) ────────────────────────────────────────────────────────

router.get("/housing/stats", requireAuth, async (req, res) => {
  try {
    const [roomStats] = await db
      .select({
        totalRooms: sql<number>`count(*)::int`,
        available: sql<number>`count(*) filter (where status = 'available')::int`,
        occupied: sql<number>`count(*) filter (where status = 'occupied')::int`,
        maintenance: sql<number>`count(*) filter (where status = 'maintenance')::int`,
      })
      .from(housingRoomsTable);

    const [assignStats] = await db
      .select({
        totalActive: sql<number>`count(*)::int`,
      })
      .from(housingAssignmentsTable)
      .where(eq(housingAssignmentsTable.status, "active"));

    const [buildingStats] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(housingBuildingsTable);

    res.json({
      totalRooms: roomStats?.totalRooms ?? 0,
      available: roomStats?.available ?? 0,
      occupied: roomStats?.occupied ?? 0,
      maintenance: roomStats?.maintenance ?? 0,
      totalActive: assignStats?.totalActive ?? 0,
      totalBuildings: buildingStats?.count ?? 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── STUDENT: get own housing ─────────────────────────────────────────────────

router.get("/housing/my", requireAuth, async (req, res) => {
  try {
    const userId = req.session!.userId!;
    const [assignment] = await db
      .select({
        id: housingAssignmentsTable.id,
        roomNumber: housingRoomsTable.roomNumber,
        buildingName: housingBuildingsTable.name,
        floor: housingRoomsTable.floor,
        type: housingRoomsTable.type,
        capacity: housingRoomsTable.capacity,
        pricePerMonth: housingRoomsTable.pricePerMonth,
        startDate: housingAssignmentsTable.startDate,
        endDate: housingAssignmentsTable.endDate,
        status: housingAssignmentsTable.status,
      })
      .from(housingAssignmentsTable)
      .innerJoin(housingRoomsTable, eq(housingRoomsTable.id, housingAssignmentsTable.roomId))
      .innerJoin(housingBuildingsTable, eq(housingBuildingsTable.id, housingRoomsTable.buildingId))
      .where(and(eq(housingAssignmentsTable.studentId, userId), eq(housingAssignmentsTable.status, "active")))
      .limit(1);
    res.json(assignment ?? null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── STUDENTS without housing ─────────────────────────────────────────────────

router.get("/housing/unassigned-students", requireAuth, async (req, res) => {
  try {
    const assignedStudentIds = db
      .select({ id: housingAssignmentsTable.studentId })
      .from(housingAssignmentsTable)
      .where(eq(housingAssignmentsTable.status, "active"));

    const students = await db
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(and(
        eq(usersTable.role, "student"),
        sql`${usersTable.id} not in (${assignedStudentIds})`
      ))
      .orderBy(usersTable.name);
    res.json(students);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
