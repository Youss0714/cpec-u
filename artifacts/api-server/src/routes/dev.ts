import { Router } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { activationKeysTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

const DEV_PASSWORD = process.env.DEV_MASTER_KEY ?? "dev-change-me";

function requireDev(req: any, res: any, next: any) {
  if (!req.session?.devAuthenticated) {
    return res.status(401).json({ error: "Unauthorized", message: "Espace développeur — accès refusé" });
  }
  next();
}

function generateKey(): string {
  return crypto.randomBytes(16).toString("hex").toUpperCase().replace(/(.{4})/g, "$1-").slice(0, 19);
}

function computeExpiry(duration: string): Date | null {
  const now = new Date();
  switch (duration) {
    case "1year":   { const d = new Date(now); d.setFullYear(d.getFullYear() + 1); return d; }
    case "2years":  { const d = new Date(now); d.setFullYear(d.getFullYear() + 2); return d; }
    case "5years":  { const d = new Date(now); d.setFullYear(d.getFullYear() + 5); return d; }
    case "10years": { const d = new Date(now); d.setFullYear(d.getFullYear() + 10); return d; }
    case "lifetime":
    default: return null;
  }
}

// --- Auth ---
router.post("/auth", (req, res) => {
  const { password } = req.body;
  if (!password || password !== DEV_PASSWORD) {
    return res.status(401).json({ error: "Mot de passe développeur incorrect" });
  }
  req.session!.devAuthenticated = true;
  res.json({ message: "Authentifié en tant que développeur" });
});

router.post("/logout", (req, res) => {
  req.session!.devAuthenticated = false;
  res.json({ message: "Déconnecté" });
});

router.get("/me", (req, res) => {
  if (!req.session?.devAuthenticated) {
    return res.status(401).json({ authenticated: false });
  }
  res.json({ authenticated: true });
});

// --- Keys CRUD ---
router.get("/keys", requireDev, async (_req, res) => {
  try {
    const keys = await db.select().from(activationKeysTable).orderBy(desc(activationKeysTable.createdAt));
    res.json(keys);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/keys", requireDev, async (req, res) => {
  try {
    const { duration, notes, count = 1 } = req.body;
    const validDurations = ["lifetime", "1year", "2years", "5years", "10years"];
    if (!duration || !validDurations.includes(duration)) {
      return res.status(400).json({ error: "Durée invalide" });
    }
    const num = Math.min(Math.max(parseInt(count) || 1, 1), 50);
    const inserted: any[] = [];
    for (let i = 0; i < num; i++) {
      const key = generateKey();
      const expiresAt = computeExpiry(duration);
      const [row] = await db.insert(activationKeysTable)
        .values({ key, duration: duration as any, expiresAt, notes: notes ?? null })
        .returning();
      inserted.push(row);
    }
    res.status(201).json(inserted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/keys/:id", requireDev, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(activationKeysTable).where(eq(activationKeysTable.id, id));
    res.json({ message: "Clé supprimée" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/keys/:id/revoke", requireDev, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [row] = await db.update(activationKeysTable)
      .set({ status: "revoked" })
      .where(eq(activationKeysTable.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Not Found" });
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/keys/:id/renew", requireDev, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [existing] = await db
      .select({ duration: activationKeysTable.duration })
      .from(activationKeysTable)
      .where(eq(activationKeysTable.id, id));
    if (!existing) return res.status(404).json({ error: "Not Found" });

    const newKey = generateKey();
    const newExpiry = computeExpiry(existing.duration);

    const [row] = await db.update(activationKeysTable)
      .set({
        key: newKey,
        status: "available",
        assignedToUserId: null,
        assignedAt: null,
        shownAt: null,
        expiresAt: newExpiry,
      })
      .where(eq(activationKeysTable.id, id))
      .returning();
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// --- User Management (directeurs only) ---

router.get("/directeurs", requireDev, async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        createdAt: usersTable.createdAt,
        firstLoginAt: usersTable.firstLoginAt,
      })
      .from(usersTable)
      .where(eq(usersTable.adminSubRole, "directeur"))
      .orderBy(desc(usersTable.createdAt));
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/reset-password", requireDev, async (req, res) => {
  try {
    const { userId, newPassword } = req.body;
    if (!userId || !newPassword) {
      return res.status(400).json({ error: "userId et newPassword sont requis" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: "Le mot de passe doit contenir au moins 6 caractères" });
    }
    const hash = crypto.createHash("sha256").update(newPassword + "cpec-u-salt").digest("hex");
    const [row] = await db.update(usersTable)
      .set({ passwordHash: hash, mustChangePassword: false, updatedAt: new Date() })
      .where(eq(usersTable.id, parseInt(userId)))
      .returning({ id: usersTable.id, name: usersTable.name, email: usersTable.email });
    if (!row) return res.status(404).json({ error: "Utilisateur introuvable" });
    res.json({ message: `Mot de passe réinitialisé pour ${row.name}`, user: row });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
