import { pgTable, serial, varchar, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { classesTable } from "./classes";
import { semestersTable } from "./semesters";

export const teachingUnitsTable = pgTable("teaching_units", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 20 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  credits: integer("credits").notNull().default(3),
  coefficient: real("coefficient").notNull().default(1),
  classId: integer("class_id").references(() => classesTable.id, { onDelete: "cascade" }),
  semesterId: integer("semester_id").references(() => semestersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTeachingUnitSchema = createInsertSchema(teachingUnitsTable).omit({ id: true, createdAt: true });
export type InsertTeachingUnit = z.infer<typeof insertTeachingUnitSchema>;
export type TeachingUnit = typeof teachingUnitsTable.$inferSelect;
