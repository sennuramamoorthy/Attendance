# Takshashila University Attendance System — Agent Guide

QR-based attendance system for Takshashila University (6 schools, ~10,300 students). Monorepo with a Next.js frontend and a Python/FastAPI backend, PostgreSQL database, and self-hosted Supabase for auth.

## Repository layout

```
.
├── frontend/        Next.js 16 (App Router) — UI only, calls backend
├── backend/         FastAPI + SQLAlchemy async + Alembic
├── docker/          Kong gateway config for Supabase
├── docker-compose.yml
└── Takshashila Attendance - C Glassmorphism.html  ← original POC, design reference
```

The frontend has **zero database access**. All data flows through the backend API. The frontend only talks to Supabase directly for the auth session (login, JWT issuance), then includes that JWT in `Authorization: Bearer …` when calling the backend.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 App Router, React 19, Tailwind v4, TypeScript |
| Backend | Python 3.11+, FastAPI, SQLAlchemy 2.0 (async + asyncpg), Alembic, PyJWT |
| Database | PostgreSQL 16 |
| Auth | Self-hosted Supabase (GoTrue + Kong); backend verifies JWTs with shared secret |
| Deployment | Docker Compose (university servers, on-prem) |

## Frontend layout (`frontend/src/`)

```
app/
├── (dashboard)/         Authenticated shell — layout queries /api/me for roles
│   ├── student/         Mobile-first: home + scan
│   ├── faculty/         Schedule, /session/[id] live QR, /attendance/[id] history
│   ├── cic/             Class-in-Charge roster + manual mark
│   ├── management/      HOD / Dean department view
│   ├── registrar/       Institutional KPIs + CSV export
│   ├── executive/       VC / Chancellor aggregates
│   ├── reports/         Drill-down + /at-risk
│   └── admin/           schools, departments, subjects, students, faculty, sections, assignments
├── login/               Supabase email+password
└── globals.css          POC design tokens (glassmorphism)

components/
├── ui/                  glass-card, kpi-card, pill, button, avatar, progress-ring,
│                        data-table, heatmap — the design system
├── layout/topbar.tsx    Brand + role switcher
└── attendance/          QR scanner, session start, etc.

lib/
├── api/
│   ├── client.ts        Browser fetch wrapper (adds Authorization header)
│   ├── server.ts        serverApi() for Server Components — passes Supabase JWT through
│   ├── types.ts         All TS interfaces matching backend Pydantic schemas
│   └── index.ts         Typed endpoint wrappers (attendanceApi, studentApi, …)
└── auth/                Supabase clients + role/permission types
```

**Server Components fetch via `serverApi<T>(path)`** — returns `null` if unauthenticated (caller redirects). **Client Components use `api.{get,post,patch}`** from `@/lib/api/client`.

## Backend layout (`backend/app/`)

```
core/
├── config.py        Pydantic Settings (env: DATABASE_URL, SUPABASE_*, CORS_ORIGINS)
├── database.py      Async engine + session, Base = DeclarativeBase
└── auth.py          verify_supabase_token, get_current_user, require_role(*)

models/              SQLAlchemy ORM (mirrors what was originally Drizzle)
├── academic.py      School, Department, Program, Section, AcademicTerm,
│                    Subject, SubjectAssignment, ClassSchedule
├── user.py          User, UserRole, Student, FacultyMember
├── attendance.py    AttendanceSession, AttendanceRecord
└── audit.py         AuditLog

schemas/             Pydantic request/response models — DO NOT leak ORM objects
api/
├── me.py            /api/me — { id, email, roles }
├── attendance.py    Sessions (start/close), QR token, mark, record override
├── student.py       /api/student/me, /api/student/schedule
├── faculty.py       /api/faculty/{schedule,stats}
├── cic.py           Roster + manual-mark
├── admin.py         CRUD for everything + /bulk-upload
├── registrar.py     /api/registrar/overview
├── executive.py     /api/executive/overview
├── reports.py       Drill-down: university → school → dept → subject → student
├── at_risk.py       Below-threshold report + faculty session history
└── export.py        /api/export/students.csv (StreamingResponse)

services/
├── qr_service.py    JWT-signed rotating tokens (60s TTL) — see "QR contract" below
├── geo_service.py   Haversine, 15m max
├── device_service.py   Device fingerprint check
└── csv_parser.py    Bulk-upload helper

alembic/versions/0001_initial.py   ← Single migration; create new revisions for changes
scripts/seed.py                    ← 6 schools + sample CS dept + 3 faculty + schedules
```

## Critical contracts (do not change without coordination)

### Attendance marking validation chain (`/api/attendance/mark`)

The order matters — earlier checks short-circuit later ones:

1. **Auth**: valid Supabase JWT, user has a `students` row.
2. **Device**: `device_fingerprint` in request matches `students.device_fingerprint`. First-ever mark binds the device.
3. **Token**: payload decodes against an active session's `qr_secret`, `exp` not expired (60s TTL).
4. **Idempotency**: no existing `attendance_records` row for `(session_id, student_id)`.
5. **Geo**: haversine distance between student lat/lng and `attendance_sessions.faculty_lat/lng` ≤ 15m.

Each failure raises `HTTPException` with a specific human-readable `detail`. The frontend shows that detail verbatim — keep messages user-facing.

### QR contract

- Faculty starts session → backend returns `{ session_id, secret }`. The **secret is returned exactly once** and stored in `sessionStorage` on the client.
- Frontend posts `{ session_id, secret, rotation_index }` to `/api/attendance/qr-token` every 60s.
- Backend signs `{ sessionId, rotationIndex, iat, exp }` with HS256. Returns the JWT string; frontend renders it as a QR with the `qrcode` package.
- Backend validates by trying each active session's secret (small N — fine for MVP scale).

### Role / scope model

`user_roles` is many-to-many on (user, role, scope). `scope_type ∈ {global, school, department, section}`, `scope_id` references the corresponding entity. Example: a CIC has `role='cic', scope_type='section', scope_id=<section uuid>`. The CIC roster endpoint reads this scope to filter students.

### School term variability

Each school configures `term_type ∈ {semester, yearly}` and `min_attendance_pct` independently. The at-risk report compares each student's % against **their school's** threshold — never a hardcoded 75%.

## Dev workflow

### First-time setup

```bash
# 1. Start PostgreSQL (port 5433 — 5432 is often taken locally)
docker compose up -d db

# 2. Backend
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/alembic upgrade head
PYTHONPATH=. .venv/bin/python scripts/seed.py
.venv/bin/uvicorn app.main:app --reload --port 8001

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev
```

Frontend at http://localhost:3000, backend docs at http://localhost:8001/docs.

### Adding a database column / table

```bash
cd backend
# Edit app/models/*.py, then:
.venv/bin/alembic revision --autogenerate -m "what changed"
# Review the generated file in alembic/versions/ — autogenerate misses ENUM changes
.venv/bin/alembic upgrade head
```

If you add a new ENUM value, do it manually in the migration with `ALTER TYPE … ADD VALUE`.

### Adding a new API endpoint

1. Pydantic schema in `backend/app/schemas/…` (request + response)
2. Router in `backend/app/api/<area>.py`, register in `app/main.py`
3. TS interface in `frontend/src/lib/api/types.ts` (match field names exactly — backend uses snake_case, no camelCase translation)
4. Wrapper function in `frontend/src/lib/api/index.ts`
5. Use from a page

### Verifying changes

```bash
# Backend
cd backend
.venv/bin/ruff check app/ scripts/
.venv/bin/python -c "from app.main import app"   # boots & verifies imports

# Frontend
cd frontend
npx eslint src
npx next build
```

ESLint enforces React 19's `react-hooks/set-state-in-effect` strictly. **Do not call `setState` synchronously in a `useEffect` body.** Wrap fetches as `.then(setX).catch(...).finally(...)` so the setState happens inside a callback.

## Conventions worth knowing

- **Field naming**: backend (Python) is `snake_case`. The frontend keeps backend's snake_case in TS types — no translation layer. (e.g. `start_time`, `subject_code`, `is_marked`.)
- **Authorization**: backend uses `Depends(get_current_user)` for "any logged-in user", `Depends(require_role("cic"))` for role gates. `current_user.has_role("cic", scope_id=...)` for scoped checks.
- **Tailwind tokens**: glassmorphism colors live as CSS variables in `frontend/src/app/globals.css` and exposed via `@theme inline`. Use `text-accent`, `bg-glass`, `border-white/70`, etc.
- **POC reference**: `Takshashila Attendance - C Glassmorphism.html` at the root is the original design POC. Read it (it's a self-extracting bundle with embedded JS — extract via the gzip+base64 in script block 1) when you need to match a specific look.
- **MVP scope**: face-matching is intentionally deferred. The student scan flow does QR + geo + device only.

## Files NOT to touch casually

- `backend/alembic/versions/0001_initial.py` — applied migration, append new revisions instead.
- `frontend/AGENTS.md` / `frontend/CLAUDE.md` — Next.js boilerplate, not app guidance.
- `Takshashila Attendance - C Glassmorphism.html` — historical POC reference.
