# CPEC-U — Système de Gestion Académique

## Overview

CPEC-U is a Progressive Web App (PWA) designed for comprehensive academic management. It streamlines various academic processes, offering distinct functionalities for different user roles: Admins (with sub-roles for Directeur, Scolarité, and Planificateur), Teachers, and Students. The project aims to provide an efficient, integrated platform for educational institutions to manage student data, grades, schedules, attendance, and communication.

**Business Vision & Market Potential:**
CPEC-U positions itself as a robust solution for educational institutions seeking to modernize their administrative and academic operations. By offering a multi-role system, PWA capabilities, and essential features like grade management, scheduling, and communication, it targets a wide market of schools, colleges, and universities. The emphasis on efficiency, traceability, and user-centric design aims to reduce administrative burden, improve student and teacher engagement, and provide transparent academic reporting.

**Project Ambitions:**
The project aspires to be a leading academic management system known for its flexibility, comprehensive feature set, and user-friendly experience. Future ambitions include expanding integrations with other educational tools, enhancing data analytics for academic insights, and continuously improving the PWA experience for offline capabilities and native-like performance.

## User Preferences

I prefer iterative development with clear, concise communication. Please ask before making major architectural changes or introducing new external dependencies. For code, I prefer readable and maintainable solutions following established patterns.

## System Architecture

The system is built as a monorepo using `pnpm workspaces`, separating the frontend PWA from the Express API server.

**UI/UX Decisions:**
- **Frontend Framework**: React with Vite for performance.
- **Styling**: Tailwind CSS for utility-first styling, complemented by `shadcn/ui` for accessible and customizable UI components.
- **Dark Mode**: Supports dark mode toggling, persisted in local storage, and respects system preferences.

**Technical Implementations:**
- **Monorepo Structure**: `artifacts/` contains the `cpec-u` (React PWA) and `api-server` (Express API). `lib/` contains shared code like `api-spec`, `api-client-react`, `api-zod`, and `db`.
- **API**: Express 5 with session-based authentication.
- **Database**: PostgreSQL with Drizzle ORM.
- **Validation**: Zod for schema validation.
- **API Codegen**: Orval generates React Query hooks and Zod schemas from an OpenAPI specification, ensuring type safety and reducing manual work.
- **Build**: `esbuild` for CJS bundling.
- **PWA Features**: Includes service worker for offline capabilities and push notifications.
- **Messaging**: Supports file attachments with secure download endpoints and programmatic download handling in the frontend.
- **Search**: Global search functionality within the admin sidebar for quick access to student and teacher information.

**Feature Specifications:**
- **User Roles**: Three primary roles (Admin, Teacher, Student) with multi-admin sub-roles (Directeur, Scolarité, Planificateur).
- **Admin Sub-roles**:
    - **Directeur du Centre**: Super-admin with full access, manages other admin accounts.
    - **Responsable de Scolarité**: Manages students, grades, classes, subjects; handles grade approvals, derogations, and results publication. Responsible for annual promotions and archiving.
    - **Planificateur**: Manages timetables, rooms, and teacher assignments; includes conflict detection and publication of schedules.
- **Teacher Features**: Enters grades for assigned subjects, manages attendance, views assigned students and their details (grades, absences), and receives schedule update notifications. Can access retake session module to submit makeup exam grades.
- **Retake Session (Rattrapage)**: Admin opens a session de rattrapage per semester; teachers enter grades for students with normal grade < 10; submission blocked if any student missing grade without "Absent" annotation; admin validates submitted grades → automatically updates main grades table (evaluationNumber=99) and notifies students. Two new DB tables: `retake_sessions` and `retake_grades`.
- **Student Features**: Views own grades, averages, and ranks (when published); receives notifications for absence justification status.
- **Annual Promotion & Archiving**: System for promoting students to the next academic year and archiving past academic years.
- **Messaging**: Integrated messaging system with file attachment support and contact picker for new conversations.
- **Push Notifications**: Implemented for various events, including schedule changes for teachers and justification status updates for students, using VAPID keys and service workers.
- **Attendance Management**: Tracks student attendance, handles justification requests, and provides alerts for high absence counts.
- **Honoraires Management**: Page for managing teacher fees and payments, visible to Planificateur and Directeur.

**System Design Choices:**
- **Authentication**: Session-based authentication using `express-session` and cookies, with SHA-256 password hashing. `user.adminSubRole` is stored in the session for role-based access control (RBAC).
- **Database Schema**: Comprehensive schema including `users`, `student_profiles`, `classes`, `teaching_units`, `subjects`, `semesters`, `grades`, `teacher_assignments`, `rooms`, `schedule_entries`, `absence_justifications`, `activation_keys`, `push_subscriptions`, `blocked_dates`, and `academic_year_archives`.
- **RBAC**: Fine-grained role-based access control enforced at the API level based on `adminSubRole` for admin functions and user ID for teacher/student data.
- **Data Integrity**: Unique constraints on grades, validation with Zod, and clear separation of concerns in the database schema.

## External Dependencies

- **Node.js**: Runtime environment (version 24).
- **pnpm**: Package manager.
- **TypeScript**: Programming language (version 5.9).
- **React**: Frontend library.
- **Vite**: Frontend build tool.
- **Tailwind CSS**: CSS framework.
- **shadcn/ui**: UI component library.
- **Express**: Backend web application framework.
- **PostgreSQL**: Relational database.
- **Drizzle ORM**: TypeScript ORM for PostgreSQL.
- **Zod**: Schema declaration and validation library.
- **Orval**: OpenAPI to TypeScript client generator.
- **esbuild**: JavaScript bundler.
- **Web Push API**: For push notifications, utilizing VAPID keys.
- **`express-session`**: Middleware for session management.
- **`multer`**: Middleware for handling `multipart/form-data` (file uploads).