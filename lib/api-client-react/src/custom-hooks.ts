import { useMutation, useQuery } from "@tanstack/react-query";
import type { UseMutationOptions, UseQueryOptions } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

// ─── Types for planning assignments (volume horaire) ──────────────────────────

export type PlanningAssignment = {
  id: number;
  teacherId: number;
  teacherName: string;
  subjectId: number;
  subjectName: string;
  classId: number;
  className: string;
  semesterId: number;
  semesterName: string;
  plannedHours: number;
  completedHours: number;
  createdAt: string;
};

export type CreatePlanningAssignmentRequest = {
  teacherId: number;
  subjectId: number;
  classId: number;
  semesterId: number;
  plannedHours?: number;
};

export type BlockedDate = {
  id: number;
  date: string;
  reason: string;
  type: "vacances" | "ferie" | "autre";
  createdAt: string;
};

export type CreateBlockedDateRequest = {
  date: string;
  reason: string;
  type?: "vacances" | "ferie" | "autre";
};

export type PublishScheduleRequest = {
  semesterId: number;
  published: boolean;
};

export type UpdateScheduleEntryRequest = {
  teacherId: number;
  subjectId: number;
  classId: number;
  roomId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  notes?: string | null;
};

// ─── Planning Assignments ─────────────────────────────────────────────────────

export const listPlanningAssignments = (): Promise<PlanningAssignment[]> =>
  customFetch<PlanningAssignment[]>("/api/admin/teacher-assignments");

export const useListPlanningAssignments = (options?: UseQueryOptions<PlanningAssignment[]>) =>
  useQuery<PlanningAssignment[]>({
    queryKey: ["/api/admin/teacher-assignments"],
    queryFn: listPlanningAssignments,
    ...options,
  });

export const createPlanningAssignment = (data: CreatePlanningAssignmentRequest): Promise<PlanningAssignment> =>
  customFetch<PlanningAssignment>("/api/admin/teacher-assignments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const useCreatePlanningAssignment = (options?: UseMutationOptions<PlanningAssignment, unknown, CreatePlanningAssignmentRequest>) =>
  useMutation<PlanningAssignment, unknown, CreatePlanningAssignmentRequest>({
    mutationKey: ["createPlanningAssignment"],
    mutationFn: createPlanningAssignment,
    ...options,
  });

export const updatePlanningAssignment = ({ id, plannedHours }: { id: number; plannedHours: number }): Promise<PlanningAssignment> =>
  customFetch<PlanningAssignment>(`/api/admin/teacher-assignments/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plannedHours }),
  });

export const useUpdatePlanningAssignment = (options?: UseMutationOptions<PlanningAssignment, unknown, { id: number; plannedHours: number }>) =>
  useMutation<PlanningAssignment, unknown, { id: number; plannedHours: number }>({
    mutationKey: ["updatePlanningAssignment"],
    mutationFn: updatePlanningAssignment,
    ...options,
  });

export const deletePlanningAssignment = ({ id }: { id: number }): Promise<{ message: string }> =>
  customFetch<{ message: string }>(`/api/admin/teacher-assignments/${id}`, { method: "DELETE" });

export const useDeletePlanningAssignment = (options?: UseMutationOptions<{ message: string }, unknown, { id: number }>) =>
  useMutation<{ message: string }, unknown, { id: number }>({
    mutationKey: ["deletePlanningAssignment"],
    mutationFn: deletePlanningAssignment,
    ...options,
  });

// ─── Blocked Dates ─────────────────────────────────────────────────────────────

export const listBlockedDates = (): Promise<BlockedDate[]> =>
  customFetch<BlockedDate[]>("/api/admin/blocked-dates");

export const useListBlockedDates = (options?: UseQueryOptions<BlockedDate[]>) =>
  useQuery<BlockedDate[]>({
    queryKey: ["/api/admin/blocked-dates"],
    queryFn: listBlockedDates,
    ...options,
  });

export const createBlockedDate = (data: CreateBlockedDateRequest): Promise<BlockedDate> =>
  customFetch<BlockedDate>("/api/admin/blocked-dates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const useCreateBlockedDate = (options?: UseMutationOptions<BlockedDate, unknown, CreateBlockedDateRequest>) =>
  useMutation<BlockedDate, unknown, CreateBlockedDateRequest>({
    mutationKey: ["createBlockedDate"],
    mutationFn: createBlockedDate,
    ...options,
  });

export const deleteBlockedDate = ({ id }: { id: number }): Promise<{ message: string }> =>
  customFetch<{ message: string }>(`/api/admin/blocked-dates/${id}`, { method: "DELETE" });

export const useDeleteBlockedDate = (options?: UseMutationOptions<{ message: string }, unknown, { id: number }>) =>
  useMutation<{ message: string }, unknown, { id: number }>({
    mutationKey: ["deleteBlockedDate"],
    mutationFn: deleteBlockedDate,
    ...options,
  });

// ─── Schedule Publish ─────────────────────────────────────────────────────────

export const publishSchedule = (data: PublishScheduleRequest): Promise<{ message: string }> =>
  customFetch<{ message: string }>("/api/admin/schedules/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const usePublishSchedule = (options?: UseMutationOptions<{ message: string }, unknown, PublishScheduleRequest>) =>
  useMutation<{ message: string }, unknown, PublishScheduleRequest>({
    mutationKey: ["publishSchedule"],
    mutationFn: publishSchedule,
    ...options,
  });

// ─── Schedule Entry Update ─────────────────────────────────────────────────────

export const updateScheduleEntry = ({ entryId, data }: { entryId: number; data: UpdateScheduleEntryRequest }): Promise<any> =>
  customFetch<any>(`/api/admin/schedules/${entryId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const useUpdateScheduleEntry = (options?: UseMutationOptions<any, unknown, { entryId: number; data: UpdateScheduleEntryRequest }>) =>
  useMutation<any, unknown, { entryId: number; data: UpdateScheduleEntryRequest }>({
    mutationKey: ["updateScheduleEntry"],
    mutationFn: updateScheduleEntry,
    ...options,
  });
