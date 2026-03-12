import { Router } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { usersTable, classEnrollmentsTable, classesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "cpec-u-salt").digest("hex");
}

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: "Bad Request", message: "Email and password are required" });
      return;
    }

    const users = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    const user = users[0];
    if (!user) {
      res.status(401).json({ error: "Unauthorized", message: "Invalid credentials" });
      return;
    }

    const hash = hashPassword(password);
    if (hash !== user.passwordHash) {
      res.status(401).json({ error: "Unauthorized", message: "Invalid credentials" });
      return;
    }

    let classId: number | null = null;
    let className: string | null = null;

    if (user.role === "student") {
      const enrollments = await db
        .select({ classId: classEnrollmentsTable.classId, className: classesTable.name })
        .from(classEnrollmentsTable)
        .innerJoin(classesTable, eq(classesTable.id, classEnrollmentsTable.classId))
        .where(eq(classEnrollmentsTable.studentId, user.id))
        .limit(1);
      if (enrollments[0]) {
        classId = enrollments[0].classId;
        className = enrollments[0].className;
      }
    }

    req.session!.userId = user.id;
    req.session!.role = user.role;
    req.session!.name = user.name;

    res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, classId, className },
      message: "Login successful",
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Login failed" });
  }
});

router.post("/logout", (req, res) => {
  req.session?.destroy(() => {});
  res.json({ message: "Logged out successfully" });
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const users = await db.select().from(usersTable).where(eq(usersTable.id, req.session!.userId!)).limit(1);
    const user = users[0];
    if (!user) {
      res.status(404).json({ error: "Not Found", message: "User not found" });
      return;
    }

    let classId: number | null = null;
    let className: string | null = null;

    if (user.role === "student") {
      const enrollments = await db
        .select({ classId: classEnrollmentsTable.classId, className: classesTable.name })
        .from(classEnrollmentsTable)
        .innerJoin(classesTable, eq(classesTable.id, classEnrollmentsTable.classId))
        .where(eq(classEnrollmentsTable.studentId, user.id))
        .limit(1);
      if (enrollments[0]) {
        classId = enrollments[0].classId;
        className = enrollments[0].className;
      }
    }

    res.json({ id: user.id, email: user.email, name: user.name, role: user.role, classId, className });
  } catch (err) {
    console.error("Get me error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export { hashPassword };
export default router;
