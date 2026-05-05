from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.academic import Department, Program, School, Section
from app.models.attendance import AttendanceRecord, AttendanceSession
from app.models.user import Student
from app.schemas.common import SchoolOut

router = APIRouter()


# Per-school visual identity — kept on the backend so the same colors render
# in dashboards and exports without the frontend needing a hard-coded map.
SCHOOL_COLORS: dict[str, str] = {
    "ENG": "#6d4cff",
    "ART": "#22d3c7",
    "BUS": "#ffb84a",
    "HSP": "#a78bfa",
    "MED": "#ff6ba6",
    "HRS": "#0fb88f",
}


@router.get("/overview")
async def get_overview(db: Annotated[AsyncSession, Depends(get_db)]) -> dict:
    schools = (await db.execute(select(School))).scalars().all()

    total_sessions = (
        await db.execute(select(func.count()).select_from(AttendanceSession))
    ).scalar_one()

    total_records = (
        await db.execute(select(func.count()).select_from(AttendanceRecord))
    ).scalar_one()

    total_present = (
        await db.execute(
            select(func.count()).select_from(AttendanceRecord).where(
                AttendanceRecord.status == "present"
            )
        )
    ).scalar_one()

    overall_pct = (total_present / total_records * 100) if total_records > 0 else 0

    return {
        "schools": [SchoolOut.model_validate(s).model_dump(mode="json") for s in schools],
        "total_sessions": total_sessions,
        "total_records": total_records,
        "overall_percentage": round(overall_pct, 1),
    }


async def _school_attendance_pct(db: AsyncSession, school_id) -> float | None:
    """Overall attendance % for a single school, computed from its records."""
    total = (
        await db.execute(
            select(func.count())
            .select_from(AttendanceRecord)
            .join(AttendanceSession, AttendanceRecord.session_id == AttendanceSession.id)
            .join(
                Student, AttendanceRecord.student_id == Student.id
            )
            .join(Section, Student.section_id == Section.id)
            .join(Program, Section.program_id == Program.id)
            .join(Department, Program.department_id == Department.id)
            .where(Department.school_id == school_id)
        )
    ).scalar_one()
    if total == 0:
        return None
    present = (
        await db.execute(
            select(func.count())
            .select_from(AttendanceRecord)
            .join(AttendanceSession, AttendanceRecord.session_id == AttendanceSession.id)
            .join(Student, AttendanceRecord.student_id == Student.id)
            .join(Section, Student.section_id == Section.id)
            .join(Program, Section.program_id == Program.id)
            .join(Department, Program.department_id == Department.id)
            .where(
                and_(
                    Department.school_id == school_id,
                    AttendanceRecord.status == "present",
                )
            )
        )
    ).scalar_one()
    return present / total * 100


async def _school_weekly_trend(
    db: AsyncSession, school_id, weeks: int = 8
) -> list[float]:
    """Attendance % per week for the last `weeks` weeks (oldest first).

    Weeks where no sessions ran fall back to the school's overall % so the
    chart line stays continuous instead of dipping to zero.
    """
    today = date.today()
    overall = await _school_attendance_pct(db, school_id) or 0.0
    out: list[float] = []
    for w in range(weeks - 1, -1, -1):
        end = today - timedelta(days=w * 7)
        start = end - timedelta(days=6)
        total = (
            await db.execute(
                select(func.count())
                .select_from(AttendanceRecord)
                .join(AttendanceSession, AttendanceRecord.session_id == AttendanceSession.id)
                .join(Student, AttendanceRecord.student_id == Student.id)
                .join(Section, Student.section_id == Section.id)
                .join(Program, Section.program_id == Program.id)
                .join(Department, Program.department_id == Department.id)
                .where(
                    and_(
                        Department.school_id == school_id,
                        AttendanceSession.session_date >= start,
                        AttendanceSession.session_date <= end,
                    )
                )
            )
        ).scalar_one()
        if total == 0:
            out.append(round(overall, 1))
            continue
        present = (
            await db.execute(
                select(func.count())
                .select_from(AttendanceRecord)
                .join(
                    AttendanceSession,
                    AttendanceRecord.session_id == AttendanceSession.id,
                )
                .join(Student, AttendanceRecord.student_id == Student.id)
                .join(Section, Student.section_id == Section.id)
                .join(Program, Section.program_id == Program.id)
                .join(Department, Program.department_id == Department.id)
                .where(
                    and_(
                        Department.school_id == school_id,
                        AttendanceSession.session_date >= start,
                        AttendanceSession.session_date <= end,
                        AttendanceRecord.status == "present",
                    )
                )
            )
        ).scalar_one()
        out.append(round(present / total * 100, 1))
    return out


async def _at_risk_count(db: AsyncSession) -> int:
    """Count of students whose overall attendance is below their school's threshold."""
    rows = (
        await db.execute(
            select(
                Student.id,
                School.min_attendance_pct,
            )
            .join(Section, Student.section_id == Section.id)
            .join(Program, Section.program_id == Program.id)
            .join(Department, Program.department_id == Department.id)
            .join(School, Department.school_id == School.id)
        )
    ).all()
    count = 0
    for sid, smin in rows:
        total = (
            await db.execute(
                select(func.count())
                .select_from(AttendanceRecord)
                .where(AttendanceRecord.student_id == sid)
            )
        ).scalar_one()
        if total == 0:
            continue
        present = (
            await db.execute(
                select(func.count())
                .select_from(AttendanceRecord)
                .where(
                    and_(
                        AttendanceRecord.student_id == sid,
                        AttendanceRecord.status == "present",
                    )
                )
            )
        ).scalar_one()
        if present / total * 100 < smin:
            count += 1
    return count


@router.get("/vc-overview")
async def get_vc_overview(db: Annotated[AsyncSession, Depends(get_db)]) -> dict:
    """Vice-Chancellor strategic dashboard payload.

    Bundles institutional KPIs, per-school attendance %, an 8-week trend, and
    the at-risk count in a single round-trip. The "compliance_flags" and
    "council_agenda" sections are demo placeholders — real values would come
    from a future flags/agenda model that doesn't exist yet.
    """
    schools = (await db.execute(select(School).order_by(School.code))).scalars().all()

    total_records = (
        await db.execute(select(func.count()).select_from(AttendanceRecord))
    ).scalar_one()
    total_present = (
        await db.execute(
            select(func.count())
            .select_from(AttendanceRecord)
            .where(AttendanceRecord.status == "present")
        )
    ).scalar_one()
    attendance_ytd = round(total_present / total_records * 100, 1) if total_records else 0.0

    league = []
    trend_lines = []
    for s in schools:
        pct = await _school_attendance_pct(db, s.id)
        league.append(
            {
                "code": s.code,
                "name": s.name,
                "percentage": round(pct, 1) if pct is not None else None,
                "color": SCHOOL_COLORS.get(s.code, "#6d4cff"),
                "min_pct": s.min_attendance_pct,
            }
        )
        # Only include trend lines for schools that have attendance data —
        # otherwise the chart flat-lines at 0% and obscures real signal.
        if pct is not None:
            trend_lines.append(
                {
                    "code": s.code,
                    "name": s.name,
                    "color": SCHOOL_COLORS.get(s.code, "#6d4cff"),
                    "values": await _school_weekly_trend(db, s.id, weeks=8),
                }
            )

    league.sort(key=lambda x: (x["percentage"] is None, -(x["percentage"] or 0)))

    at_risk = await _at_risk_count(db)

    return {
        "attendance_ytd": attendance_ytd,
        "attendance_ytd_yoy_delta": 2.1,  # demo — needs prior-year tracking
        "faculty_compliance_pct": 99.2,  # demo — needs faculty-attended-vs-expected metric
        "faculty_compliance_target": 98.0,
        "at_risk_count": at_risk,
        "at_risk_wow_delta": -8,  # demo — needs week-over-week snapshots
        "schools_league": league,
        "trend": {
            "weeks": [f"Wk{i + 1}" for i in range(8)],
            "lines": trend_lines,
        },
        # Demo data — would come from a flags/incidents model once added
        "compliance_flags": [
            {
                "code": "MED-501",
                "severity": "critical",
                "message": "Avg attendance below 80% three weeks running.",
                "owner": "Dean, Medical Science",
                "action": "Open",
            },
            {
                "code": "HRS-220",
                "severity": "warning",
                "message": "Roster not opened for 3 sessions.",
                "owner": "Dean, HRS",
                "action": "Review",
            },
        ],
        "compliance_critical_count": 1,
        # Demo data — would come from a council-agenda model
        "council_agenda": [
            {
                "title": "Hospital Science recovery plan",
                "subtitle": "Tabled by Dean Iyer",
                "status": "pending",
            },
            {
                "title": "Convocation eligibility lock",
                "subtitle": "2,841 graduating students",
                "status": "approved",
            },
            {
                "title": "QR rotation policy 60s→45s",
                "subtitle": "Security & UX impact pending",
                "status": "draft",
            },
        ],
    }
