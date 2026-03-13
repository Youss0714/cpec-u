import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import adminRouter from "./admin.js";
import teacherRouter from "./teacher.js";
import studentRouter from "./student.js";
import roomsRouter from "./rooms.js";
import schedulesRouter from "./schedules.js";
import teacherAssignmentsRouter from "./teacher_assignments.js";
import blockedDatesRouter from "./blocked_dates.js";
import notificationsRouter from "./notifications.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/admin", adminRouter);
router.use("/admin/rooms", roomsRouter);
router.use("/admin/schedules", schedulesRouter);
router.use("/admin/teacher-assignments", teacherAssignmentsRouter);
router.use("/admin/blocked-dates", blockedDatesRouter);
router.use("/teacher", teacherRouter);
router.use("/student", studentRouter);
router.use("/notifications", notificationsRouter);

export default router;
