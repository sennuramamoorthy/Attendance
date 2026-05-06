import { api } from "./client";
import type {
  Assignment,
  AtRiskStudent,
  BulkUploadResult,
  CreateUserRequest,
  CreateUserResponse,
  Department,
  ExecutiveOverview,
  Faculty,
  FacultyScheduleItem,
  MarkAttendanceResponse,
  OnboardResponse,
  PendingUser,
  Program,
  QrTokenResponse,
  RegistrarOverview,
  ReportNode,
  RosterStudent,
  School,
  Section,
  SessionHistoryItem,
  StartSessionResponse,
  StudentRow,
  StudentScheduleItem,
  StudentSummary,
  Subject,
} from "./types";

export const attendanceApi = {
  startSession: (body: {
    subject_assignment_id: string;
    class_schedule_id?: string;
    lat: number;
    lng: number;
  }) => api.post<StartSessionResponse>("/api/attendance/sessions", body),

  closeSession: (sessionId: string) =>
    api.patch<{ success: boolean }>("/api/attendance/sessions", {
      session_id: sessionId,
    }),

  getSessionCount: (sessionId: string) =>
    api.get<{ count: number }>(`/api/attendance/sessions/${sessionId}/count`),

  getQrToken: (body: {
    session_id: string;
    secret: string;
    rotation_index: number;
  }) => api.post<QrTokenResponse>("/api/attendance/qr-token", body),

  mark: (body: {
    token: string;
    lat: number;
    lng: number;
    device_fingerprint: string;
  }) => api.post<MarkAttendanceResponse>("/api/attendance/mark", body),

  updateRecord: (recordId: string, status: string) =>
    api.patch<{ success: boolean }>(`/api/attendance/records/${recordId}`, {
      status,
    }),
};

export const studentApi = {
  getSummary: () => api.get<StudentSummary>("/api/student/me"),
  getSchedule: () => api.get<StudentScheduleItem[]>("/api/student/schedule"),
};

export const facultyApi = {
  getSchedule: () => api.get<FacultyScheduleItem[]>("/api/faculty/schedule"),
  getStats: () => api.get<{ today_students: number }>("/api/faculty/stats"),
};

export const cicApi = {
  getRoster: () => api.get<RosterStudent[]>("/api/cic/roster"),
  manualMark: (body: { student_id: string; session_id: string; status?: string }) =>
    api.post<{ success: boolean }>("/api/cic/manual-mark", body),
};

export const adminApi = {
  listSchools: () => api.get<School[]>("/api/admin/schools"),
  listDepartments: () => api.get<Department[]>("/api/admin/departments"),
  listPrograms: () => api.get<Program[]>("/api/admin/programs"),
  listSections: () => api.get<Section[]>("/api/admin/sections"),
  listFaculty: () => api.get<Faculty[]>("/api/admin/faculty"),
  listSubjects: () => api.get<Subject[]>("/api/admin/subjects"),
  listAssignments: () => api.get<Assignment[]>("/api/admin/assignments"),
  listStudents: () => api.get<StudentRow[]>("/api/admin/students"),
  createProgram: (body: {
    department_id: string;
    name: string;
    code: string;
    duration_years?: number;
  }) => api.post<Program>("/api/admin/programs", body),
  createSection: (body: { program_id: string; year: number; division?: string }) =>
    api.post<Section>("/api/admin/sections", body),
  createFaculty: (body: {
    email: string;
    full_name: string;
    employee_id: string;
    department_id: string;
  }) => api.post<Faculty>("/api/admin/faculty", body),
  createAssignment: (body: {
    subject_id: string;
    faculty_id: string;
    section_id: string;
    academic_year: number;
    term?: number;
  }) => api.post<{ id: string }>("/api/admin/assignments", body),
  updateSchool: (id: string, body: Partial<{ name: string; code: string; term_type: string; min_attendance_pct: number }>) =>
    api.patch<{ success: boolean }>(`/api/admin/schools/${id}`, body),
  deleteSchool: (id: string) => api.delete<{ success: boolean }>(`/api/admin/schools/${id}`),
  updateDepartment: (id: string, body: Partial<{ name: string; code: string; school_id: string }>) =>
    api.patch<{ success: boolean }>(`/api/admin/departments/${id}`, body),
  deleteDepartment: (id: string) =>
    api.delete<{ success: boolean }>(`/api/admin/departments/${id}`),
  updateProgram: (id: string, body: Partial<{ name: string; code: string; duration_years: number; department_id: string }>) =>
    api.patch<{ success: boolean }>(`/api/admin/programs/${id}`, body),
  deleteProgram: (id: string) => api.delete<{ success: boolean }>(`/api/admin/programs/${id}`),
  updateSection: (id: string, body: Partial<{ year: number; division: string; program_id: string }>) =>
    api.patch<{ success: boolean }>(`/api/admin/sections/${id}`, body),
  deleteSection: (id: string) => api.delete<{ success: boolean }>(`/api/admin/sections/${id}`),
  updateFaculty: (id: string, body: Partial<{ full_name: string; phone: string; employee_id: string; department_id: string }>) =>
    api.patch<{ success: boolean }>(`/api/admin/faculty/${id}`, body),
  deleteFaculty: (id: string) => api.delete<{ success: boolean }>(`/api/admin/faculty/${id}`),
  updateSubject: (id: string, body: Partial<{ code: string; name: string; department_id: string; credits: number; type: string }>) =>
    api.patch<{ success: boolean }>(`/api/admin/subjects/${id}`, body),
  deleteSubject: (id: string) => api.delete<{ success: boolean }>(`/api/admin/subjects/${id}`),
  updateAssignment: (id: string, body: Partial<{ subject_id: string; faculty_id: string; section_id: string; academic_year: number; term: number }>) =>
    api.patch<{ success: boolean }>(`/api/admin/assignments/${id}`, body),
  deleteAssignment: (id: string) =>
    api.delete<{ success: boolean }>(`/api/admin/assignments/${id}`),
  updateStudent: (id: string, body: Partial<{ full_name: string; phone: string; enrollment_no: string; section_id: string; admitted_year: number }>) =>
    api.patch<{ success: boolean }>(`/api/admin/students/${id}`, body),
  deleteStudent: (id: string) => api.delete<{ success: boolean }>(`/api/admin/students/${id}`),
  bulkUpload: (
    file: File,
    type:
      | "schools"
      | "departments"
      | "programs"
      | "sections"
      | "faculty"
      | "subjects"
      | "students"
      | "assignments"
  ) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", type);
    return api.post<BulkUploadResult>("/api/admin/bulk-upload", formData);
  },
  downloadTemplate: (type: string) => downloadFile(`/api/admin/bulk-upload/template?type=${encodeURIComponent(type)}`, `${type}_template.csv`),
  // ─── User provisioning ──────────────────────────────
  listPendingUsers: () => api.get<PendingUser[]>("/api/admin/users/pending"),
  onboardUsers: (body: { user_ids?: string[]; onboard_all_pending?: boolean }) =>
    api.post<OnboardResponse>("/api/admin/users/onboard", body),
  createUser: (body: CreateUserRequest) =>
    api.post<CreateUserResponse>("/api/admin/users/create", body),
};

export async function downloadFile(path: string, filename: string): Promise<void> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001";
  const response = await fetch(`${base}${path}`);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status})`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const atRiskApi = {
  list: (schoolCode?: string) => {
    const params = schoolCode ? `?school_code=${encodeURIComponent(schoolCode)}` : "";
    return api.get<AtRiskStudent[]>(`/api/at-risk${params}`);
  },
  assignmentHistory: (assignmentId: string) =>
    api.get<SessionHistoryItem[]>(`/api/at-risk/assignment/${assignmentId}/sessions`),
};

export const registrarApi = {
  getOverview: () => api.get<RegistrarOverview>("/api/registrar/overview"),
};

export const executiveApi = {
  getOverview: () => api.get<ExecutiveOverview>("/api/executive/overview"),
};

export const reportsApi = {
  getReport: (type: string, id?: string) => {
    const params = new URLSearchParams({ type });
    if (id) params.append("id", id);
    return api.get<{ children: ReportNode[] }>(`/api/reports?${params}`);
  },
};

export * from "./types";
export { ApiError } from "./client";
