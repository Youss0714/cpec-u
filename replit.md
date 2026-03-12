# CPEC-U — Système de Gestion Académique

## Overview

Progressive Web App (PWA) for academic management. Supports 3 user roles: Admin, Teacher, Student.

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

- `users` — admins, teachers, students (enum role)
- `classes` — class groups
- `class_enrollments` — student → class (many-to-one)
- `subjects` — subjects with coefficients, linked to class
- `semesters` — academic semesters with published flag
- `grades` — student grade per subject per semester (unique constraint)
- `teacher_assignments` — teacher → subject → class → semester

## RBAC

- **Admin**: Full CRUD on all entities. Can generate PDF bulletins. Controls "Publier les résultats" toggle per semester.
- **Teacher**: Enter grades for assigned subjects only. Offline mode via Service Worker + localStorage.
- **Student**: View own grades + average + rank. Only visible when semester.published = true. NO PDF download.

## Business Logic

- Weighted average = Σ(note × coefficient) / Σ(coefficients)
- Decision: "Admis" if average ≥ 10, "Ajourné" if < 10, "En attente" if no grades
- Students see grades ONLY if `semester.published = true`
- PDF bulletin generation is admin-only

## Auth

- Session-based (express-session with cookie)
- Password hashed with SHA-256 + salt `cpec-u-salt`

## Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@cpec-u.fr | admin123 |
| Teacher | prof.math@cpec-u.fr | teacher123 |
| Teacher | prof.info@cpec-u.fr | teacher123 |
| Student | etudiant1@cpec-u.fr | etudiant123 |
| Student | etudiant2@cpec-u.fr | etudiant123 |
| Student | etudiant3@cpec-u.fr | etudiant123 |
| Student | etudiant4@cpec-u.fr | etudiant123 |
| Student | etudiant5@cpec-u.fr | etudiant123 |

## Key URLs

- Frontend: `/`
- API: `/api`
- Health: `/api/healthz`
