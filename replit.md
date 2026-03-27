# CPEC-U — Système de Gestion Académique

## Overview

Progressive Web App (PWA) for academic management. Supports 3 user roles with multi-admin sub-roles.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui
- **API framework**: Express 5 with session-based authentication
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── cpec-u/            # React PWA frontend (main app at /)
│   └── api-server/        # Express API server
├── lib/
│   ├── api-spec/          # OpenAPI spec + Orval codegen config
│   ├── api-client-react/  # Generated React Query hooks
│   ├── api-zod/           # Generated Zod schemas from OpenAPI
│   └── db/                # Drizzle ORM schema + DB connection
```

## Database Schema

- `users` — admins, teachers, students (enum role + admin_sub_role enum)
- `student_profiles` — extended student info: phone, address, parent contact, photoUrl (base64 data URL)
- `classes` — class groups
- `class_enrollments` — student → class (many-to-one)
- `teaching_units` — UE (Unités d'Enseignement) LMD: code, name, credits ECTS, coefficient, class, semester
- `subjects` — EC (Éléments Constitutifs) with coefficient, credits, optionally linked to a UE
- `semesters` — academic semesters with published flag
- `grades` — student grade per subject per semester (unique constraint)
- `teacher_assignments` — teacher → subject → class → semester
- `rooms` — classrooms, amphithéâtres, labs
- `schedule_entries` — timetable entries (teacher + subject + class + room + semester + day + time)
- `absence_justifications` — student justification requests for absences/lates: `attendanceId` (unique), `studentId`, `reason`, `status` (pending/approved/rejected), `reviewedBy`, `reviewedAt`, `reviewNote`

## RBAC — Multi-Admin System

### Admin — Directeur du Centre (`adminSubRole: "directeur"`)
- **Super-admin** : accès complet à toutes les fonctionnalités
- **Seul rôle** autorisé à créer et supprimer des comptes administrateurs (scolarité et planificateur)
- Nav combinée : voit tous les menus (Utilisateurs, Résultats, Emplois du temps, Journal d'Activité…)
- Badge violet dans la barre latérale
- Compte demo : directeur@cpec-u.fr / directeur123

### Admin — Responsable de Scolarité (`adminSubRole: "scolarite"`)
- Full CRUD on students, grades, classes, subjects, semesters
- Validates averages and publishes results per semester (publish toggle on results page)
- **Subject approvals**: Approve/lock grades per subject+class combo → teachers see read-only banner
- **Grade derogations**: Override any grade with mandatory justification (logged in activity journal)
- **Activity log**: Full traceability of approvals, derogations, publications at /admin/activity-log
- Generates PDF bulletins (scolarité-only)
- **Cannot** manage rooms or schedules

### Admin — Planificateur (`adminSubRole: "planificateur"`)
- Creates and manages timetables (emplois du temps) with conflict detection (teacher & room double-booking)
- Publish/unpublish schedule per semester (toggle Publié/Brouillon)
- Edit and delete individual schedule slots via inline modal
- Print schedule with `window.print()`
- CRUD on rooms (salles, amphithéâtres, labo)
- Volumes horaires: track planned vs realized teaching hours per teacher/subject/class
- Blocked dates: manage vacation periods and public holidays
- Dashboard shows: conflict count, creneaux, rooms, quick links to all planning pages
- Can view semesters and classes (read-only for grades)

### New DB tables & columns (planning system)
- `schedule_entries`: added `published` (boolean), `notes` (text)
- `teacher_assignments`: added `planned_hours` (integer) — plans horaires
- `blocked_dates`: new table (date, reason, type enum: vacances/ferie/autre)

### Annual Promotion + Archive System (scolarité & directeur)
- `POST /api/admin/annual-promotion/preview?academicYear=X` — dry-run per-class breakdown
- `POST /api/admin/annual-promotion` — bulk promotion all promotable classes
- `POST /api/admin/annual-promotion/rollback` — reverse promoted students
- `POST /api/admin/annual-promotion/archive` — mark an academic year as archived (requires semesters to exist)
- `POST /api/admin/annual-promotion/initialize-year` — create new year's semesters (copies names from source year; requires source to be archived)
- `GET /api/admin/archives` — list all archived years
- `GET /api/admin/archives/:academicYear` — detailed view with semesters, enrollments, averages, decisions (read-only)
- DB: `academic_year_archives` table — `{ academicYear, archivedAt, archivedById, newAcademicYear, initializedAt, initializedById }`
- Pages: `/admin/promotion` (stepper + post-promotion actions), `/admin/archives` (read-only accordion list)

### New API routes (planning)
- `PUT /api/admin/schedules/:id` — update a schedule entry
- `POST /api/admin/schedules/publish` — publish/unpublish by semesterId
- `GET/POST/PUT/DELETE /api/admin/teacher-assignments` — volumes horaires CRUD
- `GET/POST/DELETE /api/admin/blocked-dates` — blocked dates CRUD

### Teacher
- Enter grades for assigned subjects only. Offline mode via localStorage.
- **Attendance history tab**: `/teacher/attendance` has "Nouvelle Feuille" + "Historique" tabs. History shows all sent sessions with stats.
- **Teacher profile** (`/teacher/profile`): view name, email, assignment progress per subject with progress bars, global completion rate.
- **Dashboard today's sessions**: `useGetTeacherSchedule()` filtered to today's date, shows class, room, time. If no sessions, empty state message.
- **Grade entry indicator**: amber highlight for student rows with no grade at all; "X étudiants sans note" count shown below heading.
- **Student list** (`/teacher/students`): lists students enrolled in teacher's assigned classes, grouped by class, with search and class filter. Supports `?classId=X` URL param for deep-linking from dashboard. Each row links to student detail.
- **Assignment cards deep-link**: each assignment card on the teacher dashboard has a "Voir les étudiants" button linking to `/teacher/students?classId=X`.
- **Student detail** (`/teacher/students/:id`): tabbed view showing student grades (by evaluation) and absences (with justified/unjustified status) — scoped to the teacher's own subjects only. Backend enforces access control.
- **API**: `GET /api/teacher/students` (list, with optional classId/semesterId filter), `GET /api/teacher/students/:studentId` (detail, teacher-scoped).
- **Hook**: `useGetTeacherStudents(params?)`, `useGetTeacherStudentDetail(studentId)` in `lib/api-client-react/src/custom-hooks.ts`.

### Planificateur / Directeur
- **Honoraires page** (`/admin/honoraires`): manage teacher fees and payments. Stats cards (total expected, paid, remaining, recovery rate). Per-teacher: define fee amount + period, add/delete payments. Backed by `/api/honoraires/*` routes (requirePlanificateurOrDirecteur).

### Student
- View own grades + average + rank at `/student/grades` (dedicated page). Only visible when semester.published = true. NO PDF.
- Dashboard simplified: compact results summary card + quick navigation links.
- **Justification notifications**: student receives a notification (in the notifications table) when admin approves or rejects their absence justification.

## Messaging — File Attachments Fix

- **Bug fixed**: Files uploaded in messages couldn't be downloaded — caused by two issues:
  1. `uploads/` directory didn't exist at `artifacts/api-server/uploads/`
  2. Path mismatch: `app.ts` was serving static files from `artifacts/uploads/` while multer saved to `artifacts/api-server/uploads/`
- **Fix**: Corrected path in `app.ts` to `path.join(__dirname, "../uploads")` (was `"../../uploads"`), added `fs.mkdirSync(UPLOADS_DIR, { recursive: true })` in both `app.ts` and `messages.ts` to auto-create the directory
- **New download route**: `GET /api/messages/download/:filename?name=originalName` — authenticated endpoint that sends files with `Content-Disposition: attachment` header (forces download instead of inline display)
- **Frontend improvement**: `FileAttachment` component now uses `fetch() + Blob URL` programmatic download instead of `<a href download>` — more reliable in proxied environments, includes session cookie, shows "téléchargement…" indicator
- **UX improvement**: Added "Nouveau message" `+` button in conversations sidebar — opens a searchable contact picker to start new conversations without needing an existing thread

## UI Features

- **Mode sombre** : toggle Sun/Moon in sidebar bottom → adds/removes `dark` class on `document.documentElement`, persisted in localStorage (`cpec-dark-mode`). Detects system preference on first load.
- **Dark mode CSS**: Uses `@custom-variant dark (&:is(.dark *))` in index.css (Tailwind v4 config-less approach).

## PWA Push Notifications (#17)

- **Service Worker** (`public/sw.js`): handles `push` events (shows native browser notifications) and `notificationclick` (focuses existing window or opens new one).
- **Service Worker Registration**: `main.tsx` registers `sw.js` at app startup.
- **VAPID keys**: stored as env vars `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL` (shared environment).
- **DB table**: `push_subscriptions` (userId, endpoint, p256dh, auth) — unique on endpoint.
- **API endpoints**:
  - `GET /api/push/vapid-public-key` — public key for frontend subscription
  - `POST /api/push/subscribe` — upserts a subscription for the authenticated user
  - `DELETE /api/push/unsubscribe` — removes a subscription
- **Backend helper**: `sendPushToUser(userId, payload)` and `sendPushToUsers(userIds, payload)` in `push.ts`; called fire-and-forget from `notifyStudentsOfClasses`, `notifyAllStudents`, messages, and justification decisions.
- **Frontend component**: `PushNotificationToggle` in `/student/notifications` header — requests permission, subscribes via Push API, saves subscription to backend, provides unsubscribe toggle.

## Business Logic

- Weighted average = Σ(note × coefficient) / Σ(coefficients)
- Decision: "Admis" if average ≥ 10, "Ajourné" if < 10, "En attente" if no grades
- Students see grades ONLY if `semester.published = true`
- PDF bulletin generation is Responsable Scolarité only

## Auth

- Session-based (express-session with cookie)
- Password hashed with SHA-256 + salt `cpec-u-salt`
- Session stores `user.adminSubRole` for sub-role enforcement

## Demo Accounts

| Role | Sous-rôle | Email | Password |
|------|-----------|-------|----------|
| Admin | Directeur du Centre | directeur@cpec-u.fr | directeur123 |
| Admin | Responsable Scolarité | youss@gmail.com | @Youss0546 |
| Admin | Responsable Scolarité | admin@cpec-u.fr | admin123 |
| Admin | Planificateur | planificateur@cpec-u.fr | planificateur123 |
| Teacher | — | prof.math@cpec-u.fr | teacher123 |
| Teacher | — | prof.info@cpec-u.fr | teacher123 |
| Student | — | etudiant1@cpec-u.fr | etudiant123 |
| Student | — | etudiant2@cpec-u.fr | etudiant123 |
| Student | — | etudiant3@cpec-u.fr | etudiant123 |
| Student | — | etudiant4@cpec-u.fr | etudiant123 |
| Student | — | etudiant5@cpec-u.fr | etudiant123 |

## Recent UX Improvements (T008–T012)

- **T008** — Teacher dashboard "Cours du jour" cards have a "Saisir le cours" shortcut that opens the cahier de texte pre-filled with subject + date via URL params (`?open=1&subjectId=...`)
- **T009** — Director dashboard shows two KPI cards: "Taux de progression pédagogique" (sessions saisies / planifiées per class) and "Recouvrement financier par classe" (paid / due per class), both with colour-coded progress bars. Backend: `GET /api/admin/stats`
- **T010** — "Imprimer" button (Printer icon) in teacher and student schedule pages; `@media print` CSS hides sidebar/header
- **T011** — Red badge on "Bilan des Absences" sidebar nav item showing count of students with ≥3 absences in active semester; visible for scolarite & directeur. Backend: `GET /api/admin/absences/alert-count`
- **T012** — Global search (Cmd+K) in admin sidebar (not hébergement): debounced search across students/teachers, grouped results, keyboard navigation, routes to student/teacher detail pages. Component: `GlobalSearch.tsx`

## Key URLs

- Frontend: `/`
- API: `/api`
- Health: `/api/healthz`

## Codegen Workflow

After modifying `lib/api-spec/openapi.yaml`:
1. Run `pnpm --filter @workspace/api-spec run codegen` (regenerates React hooks + Zod schemas)
2. Run `cd lib/api-client-react && npx tsc --build` (rebuilds TypeScript declarations)

After modifying `lib/db/src/schema/`:
- Apply changes via `executeSql` in code_execution or `pnpm --filter @workspace/db run push-force`
