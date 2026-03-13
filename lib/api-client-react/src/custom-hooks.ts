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

export type PublishPeriod = "today" | "1week" | "2weeks" | "1month";

export type PublishSchedulePeriodRequest = {
  classId: number;
  semesterId: number;
  period: PublishPeriod;
};

export type SchedulePublication = {
  id: number;
  classId: number;
  semesterId: number;
  publishedFrom: string;
  publishedUntil: string;
  publishedAt: string;
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

// ─── Schedule Publish Period ──────────────────────────────────────────────────

export const publishSchedulePeriod = (data: PublishSchedulePeriodRequest): Promise<{ message: string; publication: SchedulePublication }> =>
  customFetch<{ message: string; publication: SchedulePublication }>("/api/admin/schedules/publish-period", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const usePublishSchedulePeriod = (options?: UseMutationOptions<{ message: string; publication: SchedulePublication }, unknown, PublishSchedulePeriodRequest>) =>
  useMutation<{ message: string; publication: SchedulePublication }, unknown, PublishSchedulePeriodRequest>({
    mutationKey: ["publishSchedulePeriod"],
    mutationFn: publishSchedulePeriod,
    ...options,
  });

export const listSchedulePublications = (params?: { classId?: number; semesterId?: number }): Promise<SchedulePublication[]> => {
  const qs = new URLSearchParams();
  if (params?.classId) qs.set("classId", String(params.classId));
  if (params?.semesterId) qs.set("semesterId", String(params.semesterId));
  return customFetch<SchedulePublication[]>(`/api/admin/schedules/publications${qs.toString() ? "?" + qs.toString() : ""}`);
};

export const useListSchedulePublications = (params?: { classId?: number; semesterId?: number }, options?: QueryOpts<SchedulePublication[]>) =>
  useQuery<SchedulePublication[]>({
    queryKey: ["/api/admin/schedules/publications", params],
    queryFn: () => listSchedulePublications(params),
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

export type UpdateClassConfigRequest = { id: number; name?: string; description?: string; nextClassId?: number | null; isTerminal?: boolean };

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

// ─── Teacher Schedule ─────────────────────────────────────────────────────────

export type TeacherScheduleEntry = {
  id: number;
  teacherId: number;
  teacherName: string;
  subjectId: number;
  subjectName: string;
  classId: number;
  className: string;
  roomId: number;
  roomName: string;
  semesterId: number;
  semesterName: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  notes: string | null;
  published: boolean;
  createdAt: string;
};

const getTeacherSchedule = (): Promise<TeacherScheduleEntry[]> =>
  customFetch<TeacherScheduleEntry[]>("/api/teacher/schedule");

export const useGetTeacherSchedule = (options?: QueryOpts<TeacherScheduleEntry[]>) =>
  useQuery<TeacherScheduleEntry[], Error>({
    queryKey: ["teacherSchedule"],
    queryFn: getTeacherSchedule,
    ...options,
  });

// ─── Student Me ───────────────────────────────────────────────────────────────

export type StudentMe = {
  id: number;
  name: string;
  email: string;
  classId: number | null;
  className: string | null;
};

const getStudentMe = (): Promise<StudentMe> =>
  customFetch("/api/student/me");

export const useGetStudentMe = (options?: QueryOpts<StudentMe>) =>
  useQuery<StudentMe, Error>({
    queryKey: ["studentMe"],
    queryFn: getStudentMe,
    ...options,
  });

// ─── Notifications ────────────────────────────────────────────────────────────

export type AppNotification = {
  id: number;
  userId: number;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
};

const getNotifications = (): Promise<AppNotification[]> =>
  customFetch("/api/notifications");

export const useGetNotifications = (options?: QueryOpts<AppNotification[]>) =>
  useQuery<AppNotification[], Error>({
    queryKey: ["notifications"],
    queryFn: getNotifications,
    refetchInterval: 30000, // poll every 30s
    ...options,
  });

const getUnreadCount = (): Promise<{ count: number }> =>
  customFetch("/api/notifications/unread-count");

export const useGetUnreadNotificationCount = (options?: QueryOpts<{ count: number }>) =>
  useQuery<{ count: number }, Error>({
    queryKey: ["notifications", "unread-count"],
    queryFn: getUnreadCount,
    refetchInterval: 30000,
    ...options,
  });

const markNotificationRead = (id: number): Promise<{ ok: boolean }> =>
  customFetch(`/api/notifications/${id}/read`, { method: "PATCH" });

export const useMarkNotificationRead = () =>
  useMutation<{ ok: boolean }, Error, number>({
    mutationFn: markNotificationRead,
  });

const markAllRead = (): Promise<{ ok: boolean }> =>
  customFetch("/api/notifications/read-all", { method: "POST" });

export const useMarkAllNotificationsRead = () =>
  useMutation<{ ok: boolean }, Error, void>({
    mutationFn: markAllRead,
  });

// ─── Scolarité / Payments ─────────────────────────────────────────────────────

export type StudentFeeRow = {
  id: number;
  name: string;
  email: string;
  classId: number | null;
  className: string | null;
  feeId: number | null;
  totalAmount: number;
  totalPaid: number;
  remaining: number;
  academicYear: string | null;
  notes: string | null;
  status: "paid" | "partial" | "unpaid";
};

export type ScolariteStats = {
  totalExpected: number;
  totalPaid: number;
  totalRemaining: number;
  recoveryRate: number;
  studentCount: number;
  fullyPaid: number;
  partial: number;
  noPay: number;
};

export type StudentPayment = {
  id: number;
  studentId: number;
  amount: number;
  description: string | null;
  paymentDate: string;
  createdAt: string;
  recordedByName: string | null;
};

const getScolariteStudents = (): Promise<StudentFeeRow[]> =>
  customFetch("/api/scolarite/students");

export const useGetScolariteStudents = (options?: QueryOpts<StudentFeeRow[]>) =>
  useQuery<StudentFeeRow[], Error>({
    queryKey: ["scolarite", "students"],
    queryFn: getScolariteStudents,
    ...options,
  });

const getScolariteStats = (): Promise<ScolariteStats> =>
  customFetch("/api/scolarite/stats");

export const useGetScolariteStats = (options?: QueryOpts<ScolariteStats>) =>
  useQuery<ScolariteStats, Error>({
    queryKey: ["scolarite", "stats"],
    queryFn: getScolariteStats,
    ...options,
  });

const getStudentPayments = (studentId: number): Promise<StudentPayment[]> =>
  customFetch(`/api/scolarite/payments/${studentId}`);

export const useGetStudentPayments = (studentId: number, options?: QueryOpts<StudentPayment[]>) =>
  useQuery<StudentPayment[], Error>({
    queryKey: ["scolarite", "payments", studentId],
    queryFn: () => getStudentPayments(studentId),
    enabled: studentId > 0,
    ...options,
  });

type SetFeeInput = { studentId: number; totalAmount: number; academicYear?: string; notes?: string };
const setStudentFee = ({ studentId, ...body }: SetFeeInput): Promise<any> =>
  customFetch(`/api/scolarite/fees/${studentId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const useSetStudentFee = () =>
  useMutation<any, Error, SetFeeInput>({ mutationFn: setStudentFee });

type AddPaymentInput = { studentId: number; amount: number; description?: string; paymentDate: string };
const addPayment = (body: AddPaymentInput): Promise<StudentPayment> =>
  customFetch("/api/scolarite/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const useAddPayment = () =>
  useMutation<StudentPayment, Error, AddPaymentInput>({ mutationFn: addPayment });

const deletePayment = (id: number): Promise<{ ok: boolean }> =>
  customFetch(`/api/scolarite/payments/${id}`, { method: "DELETE" });

export const useDeletePayment = () =>
  useMutation<{ ok: boolean }, Error, number>({ mutationFn: deletePayment });

// ─── Honoraires (Teacher Payments) ───────────────────────────────────────────

export type TeacherHonorariumRow = {
  id: number;
  name: string;
  email: string;
  honorariumId: number | null;
  totalAmount: number;
  totalPaid: number;
  remaining: number;
  periodLabel: string | null;
  notes: string | null;
  status: "paid" | "partial" | "unpaid";
};

export type HonorairesStats = {
  totalExpected: number;
  totalPaid: number;
  totalRemaining: number;
  recoveryRate: number;
  teacherCount: number;
  fullyPaid: number;
  partial: number;
  noPay: number;
};

export type TeacherPayment = {
  id: number;
  teacherId: number;
  amount: number;
  description: string | null;
  paymentDate: string;
  createdAt: string;
  recordedByName: string | null;
};

export const useGetHonorairesTeachers = (options?: QueryOpts<TeacherHonorariumRow[]>) =>
  useQuery<TeacherHonorariumRow[], Error>({
    queryKey: ["honoraires", "teachers"],
    queryFn: () => customFetch("/api/honoraires/teachers"),
    ...options,
  });

export const useGetHonorairesStats = (options?: QueryOpts<HonorairesStats>) =>
  useQuery<HonorairesStats, Error>({
    queryKey: ["honoraires", "stats"],
    queryFn: () => customFetch("/api/honoraires/stats"),
    ...options,
  });

export const useGetTeacherPayments = (teacherId: number, options?: QueryOpts<TeacherPayment[]>) =>
  useQuery<TeacherPayment[], Error>({
    queryKey: ["honoraires", "payments", teacherId],
    queryFn: () => customFetch(`/api/honoraires/payments/${teacherId}`),
    enabled: teacherId > 0,
    ...options,
  });

type SetTeacherFeeInput = { teacherId: number; totalAmount: number; periodLabel?: string; notes?: string };
export const useSetTeacherHonorarium = () =>
  useMutation<any, Error, SetTeacherFeeInput>({
    mutationFn: ({ teacherId, ...body }) =>
      customFetch(`/api/honoraires/fees/${teacherId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });

type AddTeacherPaymentInput = { teacherId: number; amount: number; description?: string; paymentDate: string };
export const useAddTeacherPayment = () =>
  useMutation<TeacherPayment, Error, AddTeacherPaymentInput>({
    mutationFn: (body) => customFetch("/api/honoraires/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });

export const useDeleteTeacherPayment = () =>
  useMutation<{ ok: boolean }, Error, number>({
    mutationFn: (id) => customFetch(`/api/honoraires/payments/${id}`, { method: "DELETE" }),
  });
