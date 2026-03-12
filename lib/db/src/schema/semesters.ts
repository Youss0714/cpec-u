import { pgTable, serial, varchar, boolean, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const semestersTable = pgTable("semesters", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  academicYear: varchar("academic_year", { length: 20 }).notNull(),
  published: boolean("published").notNull().default(false),
  startDate: date("start_date"),
  endDate: date("end_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSemesterSchema = createInsertSchema(semestersTable).omit({ id: true, createdAt: true, published: true });
export type InsertSemester = z.infer<typeof insertSemesterSchema>;
export type Semester = typeof semestersTable.$inferSelect;
