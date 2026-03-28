import crypto from "crypto";
import app from "./app";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function seedInitialAdmin() {
  try {
    const result = await db.execute(sql`SELECT COUNT(*) as count FROM users`);
    const rows = Array.from(result as Iterable<{ count: string }>);
    const count = parseInt(rows[0]?.count ?? "0", 10);

    if (count === 0) {
      const passwordHash = crypto
        .createHash("sha256")
        .update("password123" + "cpec-u-salt")
        .digest("hex");

      await db.insert(usersTable).values({
        email: "youss@gmail.com",
        name: "Youssouf Sawadogo",
        passwordHash,
        role: "admin",
        adminSubRole: "directeur",
        mustChangePassword: false,
      });

      console.log("✓ Compte administrateur initial créé : youss@gmail.com");
    }
  } catch (err) {
    console.error("Erreur lors du seeding initial :", err);
  }
}

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
  seedInitialAdmin();
});
