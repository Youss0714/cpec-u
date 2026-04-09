# CPEC-U — Gestion Académique

## Overview
CPEC-U is a comprehensive academic management Progressive Web App (PWA) for educational institutions. It supports multi-role workflows for Admins (Directeur, Scolarité, Planificateur), Teachers, and Students.

## Key Features
- **Multi-role system**: Admin sub-roles, teacher, and student portals
- **Academic management**: Classes, subjects, teaching units, semesters, annual promotions
- **Grade management**: Teacher grade entry, approval workflows, retake sessions (rattrapage)
- **Scheduling & attendance**: Timetable management with conflict detection, attendance tracking with justification workflows. Role-based secure filtering: admin sees all sessions, teachers see only their own sessions (`/api/teacher/schedule`), students see only their class's published sessions via a new secured endpoint (`/api/student/schedule` — server-side classId resolution). Both teacher and student calendars support week/list view with subject color coding. Publication triggers notifications to both students and teachers.
- **Programmation par période**: Bulk schedule generation from a date range with recurrence rules. Admin selects teacher(s), subject, class, room, semester, date range, days of week, times, and frequency (weekly/biweekly). Backend generates a preview with conflict detection (teacher/room/class conflicts highlighted in orange, blocked dates auto-excluded from `blocked_dates` table). Admin can deselect individual sessions before confirming. Sessions are created in batch (batch_id stored on each entry). New backend routes: `POST /api/admin/schedules/period-preview`, `POST /api/admin/schedules/period-generate`, `DELETE /api/admin/schedules/batch/:batchId`. Frontend: `PeriodGeneratorDialog` component with 2-step UI (configure → preview/confirm). DB: `schedule_entries.batch_id VARCHAR(36)` column added.
- **Communication**: Integrated messaging with file attachments and push notifications (Web Push / VAPID)
- **PWA capabilities**: Offline sync support, mobile-friendly design
- **Jury Spécial**: End-of-year special jury module with deliberation, traceability, bulletin auto-update, and PDF PV generation
- **Carte Étudiante Numérique**: Digital student ID card with QR code generation, public verification page (`/verify/:hash`), admin generation/invalidation, student self-service, and HTML/print export
- **QR Code Bulletin**: Each generated grade report (bulletin) embeds a unique QR code pointing to `/verify/bulletin/:token`. Tokens are stored in `bulletin_tokens` table with a JSON snapshot of key data. Old tokens are invalidated on each regeneration. Public verification page at `/verify/bulletin/:token` (no auth required, logs IP+timestamp in `bulletin_verification_logs`).
- **Évaluation des Enseignants par les Étudiants**: Anonymous teacher evaluation module using the official 4-section evaluation form (fiche officielle d'évaluation de formation), scored 1–10 with weighted averages. **Section A** (Contenu, 5 criteria, 30% weight), **Section B** (Formateur, 9 criteria, 50% weight), **Section C** (Apprenants, 6 criteria, 20% weight), **Section D** (4 free-text qualitative fields). Final question: global utility rating (Très utile/Utile/Peu utile/Inutile). Student UI: multi-step wizard with 10-box color-coded score picker (red=1-2, orange=3-4, yellow=5-6, blue=7-8, green=9-10), section progress, mandatory validation before advancing. Weighted global average: A×0.30 + B×0.50 + C×0.20. Mention auto: Mauvais/Insuffisant/Moyen/Bien/Excellent. Admin view: per-teacher ranking /10, alert badge for scores <5/10, expandable detail per section, section D comments grouped by question, utility distribution. Teacher view: radar chart (3 sections), expandable criteria bars, grouped section D comments. Results strictly anonymous; minimum 5 evaluations threshold enforced. Tables: `evaluation_periods`, `teacher_evaluations` (columns: a1-a5, b1-b9, c1-c6, d1-d4 text, utilite int), `evaluation_submissions`.
- **Espace Parents**: Parent account system linked to student accounts. DB: `parent` value added to `user_role` pgEnum; `parent_student_links(id, parent_id, student_id, created_at)` table with UNIQUE(parent_id, student_id). Backend: `artifacts/api-server/src/routes/parent.ts` — GET /parent/profile, /parent/student/:id/results, /parent/student/:id/absences, /parent/student/:id/schedule, /parent/student/:id/info. Admin CRUD at GET/POST/PUT/DELETE /admin/parents + link/unlink/reset-password endpoints. Automatic notifications: parents notified on absence submission (attendance.ts send endpoint) and on semester results publish (admin.ts). Frontend: parent portal at /parent (dashboard), /parent/results, /parent/absences, /parent/schedule, /parent/notifications, /parent/messages. Admin management page at /admin/parents. Test account: parent.test@test.com / password123 (linked to amara@test.com).
- **Notifications de Rappel de Paiement (Scolarité)**: Automated daily push notification scheduler for financial fee reminders. A background job runs every day at 08:00 (scheduled from server start) and checks all unpaid installments in `payment_installments`. **Schedule** (push-only channel, no SMS/email): J-7 (friendly advance notice to student + parents), J-3 (gentle reminder to student + parents), J0 (due-today notice to student + parents), J+7 (overdue dialogue invitation to student + parents + internal admin alert). Each reminder type is logged in the `fee_reminders_log` table with a UNIQUE constraint on `(installment_id, reminder_type)` to prevent duplicate sends. **Payment confirmation**: when scolarité staff marks an installment as paid (`PUT /api/scolarite/installments/:id` with `paidAt` set), a warm confirmation push is sent immediately to the student and all linked parents (🎉 message with amount, date, and receipt reference). Files: `artifacts/api-server/src/lib/fee-reminder-scheduler.ts` (scheduler + job), `artifacts/api-server/src/routes/scolarite.ts` (confirmation on payment), `artifacts/api-server/src/index.ts` (scheduler startup), `lib/db/src/schema/payments.ts` (new `fee_reminders_log` table).
- **Suivi Académique Individualisé**: Three interconnected views for comprehensive academic follow-up. **Admin view** (`GET /api/admin/students/:id/academic-tracking`): per-semester averages with class comparisons and rank, per-subject grades with retake grades, absence rates by subject, progression trend (up/down/stable), automatic alerts (critical avg <8, low avg <10, eliminatory notes ≤6, absence >20%), credit tracking. **Student self-view** (`GET /api/student/academic-tracking`): same data scoped to logged-in student, available at `/student/suivi` with 3-tab UI (Progression curve chart + semester cards / Par matière table / Absences by subject with rate indicator). **At-risk detection** (`GET /api/admin/at-risk-students`): automatic multi-criteria classification (Critical/High/Moderate) based on average, min grade, absence rate, failed subjects count, and declining trend; filterable by class/level with export. **Student-detail admin tab**: new "Suivi Académique" tab in admin student detail page showing KPI cards (current average, credits, rank, attendance), LineChart progression vs class average with reference lines at 10 and 8/20, per-semester expandable subject breakdown with progress bars, and severity-colored alerts. Navigation: "Étudiants en Difficulté" link added to directeur and sous-directeur navs; "Mon Suivi Académique" link added to student nav.
- **Tableau de Bord Comparatif Multi-Années**: Accessible depuis Rapports & Statistiques (onglet "Comparatif"). Analyse les performances académiques sur plusieurs années académiques. Fonctionnalités : 4 KPI cards (réussite, moyenne, rattrapage, jury spécial) pour l'année la plus récente + comparaison vs N-1 ; graphique ComposedChart (barres groupées + courbe) avec taux de réussite/échec/rattrapage + moyenne générale par année ; graphique AreaChart du taux d'absence par année ; tableau des matières à taux d'échec élevé avec filtre par seuil configurable (défaut 40%) et classification 🔴Récurrent/🟡Surveillance/🟢Amélioration ; section recommandations pédagogiques automatiques (détection de baisse de résultats, matières récurrentes, séquences de progression) ; comparatif enseignants (résultats année par année). Filtre par filière. API endpoint : `GET /api/admin/reports/comparatif?filiere=X` (5 requêtes : yearlyKpis, subjectByYear, teacherBySubjectYear, absenceByYear, teacherComparison). Affiche l'état vide si une seule année académique est disponible.
- **Gestion des Réclamations**: Official grade dispute workflow. Admin configures dispute periods per semester (open/close dates, teacher response deadline). Students submit claims with type (erreur de saisie / copie non corrigée / barème contesté / autre), detailed motif (min 50 chars), optional file attachment, for their own grades only. Unique claim number (REC-YYYY-NNNN) generated on submission. 3-step circuit: teacher responds (accept + proposed grade / reject with justification / transmit to admin), then admin arbitrates (validate, override, close). Grade automatically updated in `grades` table when accepted. Full immutable audit log (`reclamation_history`). Status flow: soumise → en_cours → en_arbitrage → acceptée/rejetée/clôturée. Push + in-app notifications at each transition. Admin dashboard with KPIs (total, pending, acceptance rate, avg resolution time, top subjects, top teachers by reclamation count). Tables: `reclamation_periods`, `reclamations`, `reclamation_history`. Nav: student always sees "Mes Réclamations"; teacher sees "Réclamations" with pending badge; admin (scolarité + directeur) see "Réclamations" with pending badge. Security: duplicate submission returns 409; only own grades can be contested; period enforcement server-side.
- **Centralized PDF Service**: Client-side PDF generation engine in `artifacts/cpec-u/src/lib/pdf-engine/`. Built on jspdf + jspdf-autotable. Core class `CpecPdfDoc` adds institutional header/footer, logo, gold accent bar, and consistent layout to all documents. 10+ document generators: `bulletin.ts` (grade reports with QR code), `liste-etudiants.ts`, `attestation.ts`, `fiche-etudiant.ts`, `emploi-du-temps.ts`, `feuille-presence.ts` (blank + filled), `bilan-absences.ts`, `pv-jury.ts`, `honoraires.ts` (recap + individual), `resultats-classe.ts`. Admin "Centre de Documents" page at `/admin/documents` aggregates all available exports. PDF buttons integrated into: Results page (bulletins + class PDF), Attendance Summary, Honoraires, Jury Spécial. Bulletins fetch data from `GET /api/admin/bulletin-json/:studentId/:semesterId` endpoint.

## Architecture

### Monorepo Structure (pnpm workspaces)
```
artifacts/
  api-server/     Express 5 REST API backend (port 8080)
  cpec-u/         React + Vite frontend PWA (port 8081)
  mockup-sandbox/ UI component dev sandbox

lib/
  db/             Drizzle ORM + PostgreSQL schema
  api-spec/       OpenAPI YAML spec
  api-zod/        Zod schemas (generated from OpenAPI)
  api-client-react/ React Query hooks (generated by Orval)
```

### Tech Stack
- **Frontend**: React 19, Vite 7, Tailwind CSS 4, shadcn/ui, TanStack Query, Wouter, Framer Motion, Lucide React
- **Backend**: Express 5, TypeScript, express-session, multer (file uploads), web-push
- **Database**: PostgreSQL (Replit built-in), Drizzle ORM, pg driver
- **Validation**: Zod, Drizzle-Zod
- **Tooling**: pnpm workspaces, tsx, esbuild, Orval codegen

## Running the App
Two separate workflows run the application:
- **`Start application`**: API server on port 3001 (`PORT=3001 pnpm --filter @workspace/api-server run dev`)
- **`artifacts/cpec-u: web`**: Vite frontend on port 8081 (`PORT=8081 pnpm --filter @workspace/cpec-u run dev`)

Port 8081 is mapped to external port 80 (user-visible preview). Vite proxies `/api/*` requests to the API server on port 3001. Port 3001 is used (instead of 8080) to avoid conflicts with Replit's internal infrastructure process (pid2) that occupies port 8080.

**Critical**: The Vite config must use `host: "0.0.0.0"` (not `host: true`) and `strictPort: true` for Replit's port detection to work correctly. Port 8081 is mapped to external port 80 in the `.replit` configuration.

## Environment Variables
- `DATABASE_URL` — PostgreSQL connection string (Replit built-in DB)
- `SESSION_SECRET` — Express session secret (falls back to hardcoded value in dev)
- `VAPID_PUBLIC_KEY` — Web Push VAPID public key
- `VAPID_PRIVATE_KEY` — Web Push VAPID private key
- `VAPID_EMAIL` — Contact email for VAPID
- `DEV_MASTER_KEY` — Development master key
- `PORT` — Port number (auto-assigned by Replit artifact system)
- `BASE_PATH` — URL base path (auto-set by Replit artifact system)

## Database
- Managed with Drizzle ORM
- Schema push: `pnpm --filter @workspace/db run push`
- Schema lives in `lib/db/src/schema/`
- Covers: users, classes, subjects, grades, attendance, schedules, messages, notifications, payments, housing, etc.

## Default Admin Account
- Email: `youss@gmail.com`
- Password: `password123`
- Role: Admin (Directeur)
- Created automatically on first server startup

## Deployment
The API server handles production by serving the built frontend static files from `artifacts/cpec-u/dist/public`.
