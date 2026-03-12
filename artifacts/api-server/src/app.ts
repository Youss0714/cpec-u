import express, { type Express } from "express";
import cors from "cors";
import session from "express-session";
import router from "./routes/index.js";

declare module "express-session" {
  interface SessionData {
    user: {
      id: number;
      role: string;
      name: string;
      adminSubRole?: string | null;
    };
    userId: number;
    role: string;
    name: string;
  }
}

const app: Express = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "cpec-u-secret-2025",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

app.use("/api", router);

export default app;
