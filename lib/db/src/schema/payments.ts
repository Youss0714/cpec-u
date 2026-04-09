import { pgTable, serial, integer, real, text, varchar, date, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { classesTable } from "./classes";

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
  paymentMethod: varchar("payment_method", { length: 50 }),
  reference: varchar("reference", { length: 100 }),
  status: varchar("status", { length: 30 }).default("validé"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type StudentFee = typeof studentFeesTable.$inferSelect;
export type Payment = typeof paymentsTable.$inferSelect;

export const classFeesTable = pgTable("class_fees", {
  id: serial("id").primaryKey(),
  classId: integer("class_id").notNull().unique().references(() => classesTable.id, { onDelete: "cascade" }),
  totalAmount: real("total_amount").notNull().default(0),
  academicYear: varchar("academic_year", { length: 20 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ClassFee = typeof classFeesTable.$inferSelect;

export const paymentInstallmentsTable = pgTable("payment_installments", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 255 }),
  dueDate: date("due_date").notNull(),
  amount: real("amount").notNull(),
  paidAt: date("paid_at"),
  lastReminderAt: date("last_reminder_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type PaymentInstallment = typeof paymentInstallmentsTable.$inferSelect;

export const feeRemindersLogTable = pgTable("fee_reminders_log", {
  id: serial("id").primaryKey(),
  installmentId: integer("installment_id").notNull().references(() => paymentInstallmentsTable.id, { onDelete: "cascade" }),
  reminderType: varchar("reminder_type", { length: 20 }).notNull(),
  sentAt: date("sent_at").notNull(),
}, (t) => [unique().on(t.installmentId, t.reminderType)]);

export type FeeReminderLog = typeof feeRemindersLogTable.$inferSelect;
