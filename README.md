# Takshashila University Attendance System

Monorepo containing the QR-based attendance system for Takshashila University (6 schools, ~10,300 students).

## Stack

- **Frontend**: Next.js 16 (App Router) + Tailwind CSS — glassmorphism UI
- **Backend**: Python + FastAPI + SQLAlchemy (async) + Alembic
- **Database**: PostgreSQL 16
- **Auth**: Supabase (self-hosted) — JWT verified by backend
- **Deployment**: Docker Compose on university servers

## Repository Layout

```
.
├── frontend/                 # Next.js app (UI + API client)
│   ├── src/app/              # Pages by role: student, faculty, cic, management,
│   │                         #   registrar, executive, reports, admin
│   ├── src/components/       # Glassmorphism component library
│   └── src/lib/api/          # Typed HTTP client → backend
├── backend/                  # FastAPI service
│   ├── app/
│   │   ├── api/              # Routers (attendance, faculty, cic, admin,
│   │   │                     #   reports, at_risk, export, …)
│   │   ├── core/             # Settings, DB, auth (JWT verification)
│   │   ├── models/           # SQLAlchemy ORM models
│   │   ├── schemas/          # Pydantic request/response shapes
│   │   └── services/         # QR / geo / device validation
│   ├── alembic/versions/     # DB migrations (0001_initial.py)
│   └── scripts/seed.py       # Seed 6 schools + sample CS dept
├── docker/                   # Kong gateway config for Supabase
├── docker-compose.yml        # Orchestrates frontend + backend + DB + Supabase
├── Makefile                  # Task runner (make help to see targets)
├── CLAUDE.md                 # Architecture guide for AI agents
└── Takshashila Attendance - C Glassmorphism.html  # Original POC reference
```

## Quick start

A Makefile orchestrates everything. Run `make` to see all targets.

```bash
make install          # install backend (venv) + frontend deps
make supabase-up      # start PostgreSQL + gotrue (auth)
make migrate          # apply schema
make seed             # load 6 schools + sample data
make seed-admin EMAIL=admin@takshashila.edu PASSWORD=Admin@123
make dev              # both servers in parallel (Ctrl+C stops both)
```

Then sign in at http://localhost:3000 with the credentials you passed to `seed-admin`.

Frontend: http://localhost:3000  ·  Backend docs: http://localhost:8001/docs

### Other useful commands

```bash
make check            # lint + typecheck + build
make docker-up        # full stack (db + backend + frontend + supabase)
make deploy           # build images + start stack + migrate
make deploy-fresh     # wipe DB + redeploy + seed
make migrate-create m="add column foo"
```

## Roles and pages

| Role | Lands on | Key actions |
|---|---|---|
| Student | `/student` | View today's classes, scan QR to mark attendance |
| Faculty | `/faculty` | Start session (live QR), drill into per-subject history |
| Class-in-Charge | `/cic` | Section roster, manually mark attendance |
| HOD / Dean | `/management` | Department-level overview |
| Registrar | `/registrar` | Institutional KPIs, CSV export |
| VC / Chancellor | `/executive` | University-wide aggregates |
| Admin | `/admin` | Schools, programs/sections, faculty, subjects, assignments, bulk upload |
| Anyone (with role) | `/reports`, `/reports/at-risk` | Drill-down explorer + at-risk students |

## Key endpoints

Full interactive docs at http://localhost:8001/docs once the backend is running.

| Endpoint | Purpose |
|---|---|
| `GET /api/me` | Current user + roles |
| `POST /api/attendance/sessions` | Faculty starts session, returns secret + QR seed |
| `PATCH /api/attendance/sessions` | Faculty closes session |
| `GET /api/attendance/sessions/{id}/count` | Live present count (polled) |
| `POST /api/attendance/qr-token` | Issue rotating 60s JWT for QR |
| `POST /api/attendance/mark` | Student marks (token + geo + device validation) |
| `PATCH /api/attendance/records/{id}` | CIC manual override |
| `GET /api/student/{me,schedule}` | Student summary + today's classes |
| `GET /api/faculty/{schedule,stats}` | Faculty schedule + today's metrics |
| `GET /api/cic/roster` · `POST /api/cic/manual-mark` | CIC roster + manual mark |
| `GET/POST /api/admin/{schools,departments,programs,sections,faculty,subjects,assignments}` | Listings + create |
| `POST /api/admin/bulk-upload` | CSV upload for students/subjects |
| `GET /api/registrar/overview` | Institutional KPIs + per-school table |
| `GET /api/executive/overview` | VC/Chancellor aggregates |
| `GET /api/reports?type=…&id=…` | Drill-down: university → school → dept → subject → student |
| `GET /api/at-risk[?school_code=…]` | Students below their school's minimum % |
| `GET /api/at-risk/assignment/{id}/sessions` | Per-assignment session history (for faculty) |
| `GET /api/export/students.csv` | Institutional CSV export |

## MVP scope

QR + geolocation (15m) + device fingerprint validation. Face matching deferred to Phase 2.

## Further reading

See [CLAUDE.md](./CLAUDE.md) for the architecture guide — validation chains, QR contract, RBAC scope model, conventions.
