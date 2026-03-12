import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import adminRouter from "./admin.js";
import teacherRouter from "./teacher.js";
import studentRouter from "./student.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/admin", adminRouter);
router.use("/teacher", teacherRouter);
router.use("/student", studentRouter);

export default router;
