import { pgTable, serial, integer, boolean, text, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { semestersTable } from "./semesters";
import { subjectsTable } from "./subjects";
import { classesTable } from "./classes";

// Période d'évaluation — activée par l'admin
export const evaluationPeriodsTable = pgTable("evaluation_periods", {
  id: serial("id").primaryKey(),
  semesterId: integer("semester_id").notNull().references(() => semestersTable.id, { onDelete: "cascade" }),
  deadline: timestamp("deadline").notNull(),
  isActive: boolean("is_active").notNull().default(false),
  resultsVisible: boolean("results_visible").notNull().default(false),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Évaluations anonymes — aucun studentId stocké ici
export const teacherEvaluationsTable = pgTable("teacher_evaluations", {
  id: serial("id").primaryKey(),
  periodId: integer("period_id").notNull().references(() => evaluationPeriodsTable.id, { onDelete: "cascade" }),
  teacherId: integer("teacher_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  subjectId: integer("subject_id").notNull().references(() => subjectsTable.id, { onDelete: "cascade" }),
  classId: integer("class_id").notNull().references(() => classesTable.id, { onDelete: "cascade" }),
  clarityScore: integer("clarity_score").notNull(),
  masteryScore: integer("mastery_score").notNull(),
  availabilityScore: integer("availability_score").notNull(),
  programScore: integer("program_score").notNull(),
  punctualityScore: integer("punctuality_score").notNull(),
  overallScore: integer("overall_score").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Qui a soumis (pour éviter les doublons) — séparé de l'évaluation pour préserver l'anonymat
export const evaluationSubmissionsTable = pgTable("evaluation_submissions", {
  id: serial("id").primaryKey(),
  periodId: integer("period_id").notNull().references(() => evaluationPeriodsTable.id, { onDelete: "cascade" }),
  studentId: integer("student_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  teacherId: integer("teacher_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
}, (t) => ({
  uniqueSubmission: unique("eval_submission_unique").on(t.periodId, t.studentId, t.teacherId),
}));

export type EvaluationPeriod = typeof evaluationPeriodsTable.$inferSelect;
export type TeacherEvaluation = typeof teacherEvaluationsTable.$inferSelect;
export type EvaluationSubmission = typeof evaluationSubmissionsTable.$inferSelect;
