import { pgTable, serial, integer, real, text, varchar, date, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const studentFeesTable = pgTable("student_fees", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().unique().references(() => usersTable.id, { onDelete: "cascade" }),
  totalAmount: real("total_amount").notNull().default(0),
  academicYear: varchar("academic_year", { length: 20 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  amount: real("amount").notNull(),
  description: varchar("description", { length: 255 }),
  paymentDate: date("payment_date").notNull(),
  recordedById: integer("recorded_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type StudentFee = typeof studentFeesTable.$inferSelect;
export type Payment = typeof paymentsTable.$inferSelect;
