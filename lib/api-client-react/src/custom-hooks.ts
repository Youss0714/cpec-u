import { useMutation, useQuery } from "@tanstack/react-query";
import type { UseMutationOptions, UseQueryOptions } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

type QueryOpts<T> = Omit<UseQueryOptions<T, Error>, "queryKey" | "queryFn">;

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

export const useListPlanningAssignments = (options?: QueryOpts<PlanningAssignment[]>) =>
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

export const useListBlockedDates = (options?: QueryOpts<BlockedDate[]>) =>
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

// ─── Subject Approvals ────────────────────────────────────────────────────────

export type SubjectApproval = {
  id: number;
  subjectId: number;
  subjectName: string;
  classId: number;
  className: string;
  semesterId: number;
  approvedById: number;
  approvedByName: string;
  approvedAt: string;
};

export type ApproveSubjectRequest = {
  subjectId: number;
  classId: number;
  semesterId: number;
};

export const listSubjectApprovals = (params?: { semesterId?: number; classId?: number }): Promise<SubjectApproval[]> => {
  const qs = new URLSearchParams();
  if (params?.semesterId) qs.set("semesterId", String(params.semesterId));
  if (params?.classId) qs.set("classId", String(params.classId));
  return customFetch<SubjectApproval[]>(`/api/admin/subject-approvals${qs.toString() ? "?" + qs.toString() : ""}`);
};

export const useListSubjectApprovals = (params?: { semesterId?: number; classId?: number }, options?: QueryOpts<SubjectApproval[]>) =>
  useQuery<SubjectApproval[]>({
    queryKey: ["/api/admin/subject-approvals", params],
    queryFn: () => listSubjectApprovals(params),
    ...options,
  });

export const approveSubject = (data: ApproveSubjectRequest): Promise<SubjectApproval> =>
  customFetch<SubjectApproval>("/api/admin/subject-approvals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const useApproveSubject = (options?: UseMutationOptions<SubjectApproval, unknown, ApproveSubjectRequest>) =>
  useMutation<SubjectApproval, unknown, ApproveSubjectRequest>({
    mutationKey: ["approveSubject"],
    mutationFn: approveSubject,
    ...options,
  });

export const unapproveSubject = ({ id }: { id: number }): Promise<{ message: string }> =>
  customFetch<{ message: string }>(`/api/admin/subject-approvals/${id}`, { method: "DELETE" });

export const useUnapproveSubject = (options?: UseMutationOptions<{ message: string }, unknown, { id: number }>) =>
  useMutation<{ message: string }, unknown, { id: number }>({
    mutationKey: ["unapproveSubject"],
    mutationFn: unapproveSubject,
    ...options,
  });

// ─── Derogation ───────────────────────────────────────────────────────────────

export type DerogateGradeRequest = {
  studentId: number;
  subjectId: number;
  semesterId: number;
  value: number;
  justification: string;
};

export const derogateGrade = (data: DerogateGradeRequest): Promise<{ message: string }> =>
  customFetch<{ message: string }>("/api/admin/grades/derogate", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const useDerogateGrade = (options?: UseMutationOptions<{ message: string }, unknown, DerogateGradeRequest>) =>
  useMutation<{ message: string }, unknown, DerogateGradeRequest>({
    mutationKey: ["derogateGrade"],
    mutationFn: derogateGrade,
    ...options,
  });

// ─── Activity Log ─────────────────────────────────────────────────────────────

export type ActivityLogEntry = {
  id: number;
  userId: number;
  userName: string;
  action: string;
  details: string | null;
  createdAt: string;
};

export const listActivityLog = (): Promise<ActivityLogEntry[]> =>
  customFetch<ActivityLogEntry[]>("/api/admin/activity-log");

export const useListActivityLog = (options?: QueryOpts<ActivityLogEntry[]>) =>
  useQuery<ActivityLogEntry[]>({
    queryKey: ["/api/admin/activity-log"],
    queryFn: listActivityLog,
    ...options,
  });

// ─── Move Class (reorder) ─────────────────────────────────────────────────────

export const moveClass = ({ id, direction }: { id: number; direction: "up" | "down" }): Promise<{ message: string }> =>
  customFetch<{ message: string }>(`/api/admin/classes/${id}/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ direction }),
  });

export const useMoveClass = (options?: UseMutationOptions<{ message: string }, unknown, { id: number; direction: "up" | "down" }>) =>
  useMutation<{ message: string }, unknown, { id: number; direction: "up" | "down" }>({
    mutationKey: ["moveClass"],
    mutationFn: moveClass,
    ...options,
  });

// ─── Promote Admitted Students ────────────────────────────────────────────────

export type PromoteRequest = { semesterId: number; classId: number };
export type PromoteResponse = { promoted: { id: number; name: string }[]; fromClass: string; toClassId: number };

export const promoteAdmitted = (data: PromoteRequest): Promise<PromoteResponse> =>
  customFetch<PromoteResponse>(`/api/admin/semesters/${data.semesterId}/promote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ classId: data.classId }),
  });

export const usePromoteAdmitted = (options?: UseMutationOptions<PromoteResponse, unknown, PromoteRequest>) =>
  useMutation<PromoteResponse, unknown, PromoteRequest>({
    mutationKey: ["promoteAdmitted"],
    mutationFn: promoteAdmitted,
    ...options,
  });

// ─── Update Class Config (next class) ────────────────────────────────────────

export type UpdateClassConfigRequest = { id: number; name?: string; description?: string; nextClassId?: number | null };

export const updateClassConfig = ({ id, ...data }: UpdateClassConfigRequest): Promise<any> =>
  customFetch<any>(`/api/admin/classes/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const useUpdateClassConfig = (options?: UseMutationOptions<any, unknown, UpdateClassConfigRequest>) =>
  useMutation<any, unknown, UpdateClassConfigRequest>({
    mutationKey: ["updateClassConfig"],
    mutationFn: updateClassConfig,
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
