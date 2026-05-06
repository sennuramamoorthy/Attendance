export type Role =
  | "admin"
  | "student"
  | "faculty"
  | "cic"
  | "hod"
  | "dean"
  | "registrar"
  | "vc"
  | "chancellor";

export type Permission =
  | "attendance:mark"
  | "session:create"
  | "session:close"
  | "attendance:view:own"
  | "attendance:view:section"
  | "attendance:view:department"
  | "attendance:view:school"
  | "attendance:view:all"
  | "attendance:edit:section"
  | "roster:view:section"
  | "reports:department"
  | "reports:school"
  | "reports:all"
  | "export:all"
  | "admin:manage";

const PERMISSIONS: Record<Role, Permission[]> = {
  student: ["attendance:mark", "attendance:view:own"],
  faculty: [
    "session:create",
    "session:close",
    "attendance:view:own",
    "attendance:view:section",
  ],
  cic: [
    "attendance:view:section",
    "attendance:edit:section",
    "roster:view:section",
  ],
  hod: ["attendance:view:department", "reports:department"],
  dean: [
    "attendance:view:school",
    "attendance:view:department",
    "reports:school",
    "reports:department",
  ],
  registrar: ["attendance:view:all", "reports:all", "export:all"],
  vc: ["attendance:view:all", "reports:all"],
  chancellor: ["attendance:view:all", "reports:all"],
  admin: ["admin:manage", "attendance:view:all", "reports:all", "export:all"],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return PERMISSIONS[role]?.includes(permission) ?? false;
}

export function getPermissions(role: Role): Permission[] {
  return PERMISSIONS[role] ?? [];
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  student: "Student",
  faculty: "Faculty",
  cic: "Class-in-Charge",
  hod: "Head of Department",
  dean: "Dean",
  registrar: "Registrar",
  vc: "Vice-Chancellor",
  chancellor: "Chancellor",
};

export const ROLE_ROUTES: Record<Role, string> = {
  student: "/student",
  faculty: "/faculty",
  cic: "/cic",
  hod: "/management",
  dean: "/management",
  registrar: "/registrar",
  vc: "/executive",
  chancellor: "/executive",
  admin: "/admin",
};

// Order matters — used to pick a default landing page when a user has
// multiple roles. Most-empowered first: admins land on /admin, while a
// faculty-who-is-also-a-student lands on /faculty.
const ROLE_PRIORITY: readonly Role[] = [
  "admin",
  "chancellor",
  "vc",
  "registrar",
  "dean",
  "hod",
  "cic",
  "faculty",
  "student",
];

export function defaultRouteFor(roles: readonly Role[]): string {
  for (const r of ROLE_PRIORITY) {
    if (roles.includes(r)) return ROLE_ROUTES[r];
  }
  return "/login";
}
