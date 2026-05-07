from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    admin,
    admin_edit,
    admin_users,
    at_risk,
    attendance,
    cic,
    executive,
    export,
    faculty,
    me,
    registrar,
    reports,
    student,
)
from app.core.config import settings

app = FastAPI(
    title="Takshashila Attendance API",
    version="0.1.0",
    description="QR-based attendance system for Takshashila University",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(me.router, prefix="/api/me", tags=["me"])
app.include_router(attendance.router, prefix="/api/attendance", tags=["attendance"])
app.include_router(student.router, prefix="/api/student", tags=["student"])
app.include_router(faculty.router, prefix="/api/faculty", tags=["faculty"])
app.include_router(cic.router, prefix="/api/cic", tags=["cic"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(admin_edit.router, prefix="/api/admin", tags=["admin"])
app.include_router(admin_users.router, prefix="/api/admin", tags=["admin"])
app.include_router(registrar.router, prefix="/api/registrar", tags=["registrar"])
app.include_router(executive.router, prefix="/api/executive", tags=["executive"])
app.include_router(reports.router, prefix="/api/reports", tags=["reports"])
app.include_router(at_risk.router, prefix="/api/at-risk", tags=["at-risk"])
app.include_router(export.router, prefix="/api/export", tags=["export"])
