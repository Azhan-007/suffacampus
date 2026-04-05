import { Errors } from "../errors";

export const ROLES = ["SuperAdmin", "Admin", "Staff", "Teacher", "Parent", "Student"] as const;
export type Role = (typeof ROLES)[number];

export enum Permission {
  // Students
  STUDENT_CREATE = "STUDENT_CREATE",
  STUDENT_VIEW = "STUDENT_VIEW",
  STUDENT_UPDATE = "STUDENT_UPDATE",
  STUDENT_DELETE = "STUDENT_DELETE",

  // Fees
  FEE_CREATE = "FEE_CREATE",
  FEE_VIEW = "FEE_VIEW",
  FEE_UPDATE = "FEE_UPDATE",
  FEE_DELETE = "FEE_DELETE",
  FEE_PAY = "FEE_PAY",

  // Attendance
  ATTENDANCE_MARK = "ATTENDANCE_MARK",
  ATTENDANCE_VIEW = "ATTENDANCE_VIEW",
  ATTENDANCE_UPDATE = "ATTENDANCE_UPDATE",

  // Results
  RESULT_CREATE = "RESULT_CREATE",
  RESULT_VIEW = "RESULT_VIEW",
  RESULT_UPDATE = "RESULT_UPDATE",
  RESULT_PUBLISH = "RESULT_PUBLISH",

  // Notifications
  NOTIFICATION_CREATE = "NOTIFICATION_CREATE",
  NOTIFICATION_VIEW = "NOTIFICATION_VIEW",
  NOTIFICATION_DELETE = "NOTIFICATION_DELETE",

  // Admin
  ADMIN_USER_MANAGE = "ADMIN_USER_MANAGE",
  ADMIN_ROLE_MANAGE = "ADMIN_ROLE_MANAGE",
  ADMIN_SETTINGS_MANAGE = "ADMIN_SETTINGS_MANAGE",
  ADMIN_AUDIT_VIEW = "ADMIN_AUDIT_VIEW",
}

export interface PermissionUserInput {
  role?: string | null;
  schoolId?: string | null;
}

const ROLE_CANONICAL_MAP: Record<string, Role> = {
  superadmin: "SuperAdmin",
  admin: "Admin",
  staff: "Staff",
  teacher: "Teacher",
  parent: "Parent",
  student: "Student",
};

function normalizeRole(role: unknown): Role | undefined {
  if (typeof role !== "string") return undefined;

  const trimmed = role.trim();
  if (!trimmed) return undefined;

  return ROLE_CANONICAL_MAP[trimmed.toLowerCase()];
}

function normalizeSchoolId(schoolId: unknown): string | undefined {
  if (typeof schoolId !== "string") return undefined;

  const trimmed = schoolId.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const ALL_PERMISSIONS = Object.values(Permission) as Permission[];

export const ROLE_PERMISSIONS = {
  SuperAdmin: ALL_PERMISSIONS,
  Admin: ALL_PERMISSIONS,
  Staff: [
    Permission.STUDENT_VIEW,
    Permission.STUDENT_UPDATE,
    Permission.FEE_VIEW,
    Permission.ATTENDANCE_MARK,
    Permission.ATTENDANCE_VIEW,
    Permission.ATTENDANCE_UPDATE,
    Permission.RESULT_CREATE,
    Permission.RESULT_VIEW,
    Permission.RESULT_UPDATE,
    Permission.NOTIFICATION_CREATE,
    Permission.NOTIFICATION_VIEW,
  ],
  Teacher: [
    Permission.STUDENT_VIEW,
    Permission.FEE_VIEW,
    Permission.ATTENDANCE_MARK,
    Permission.ATTENDANCE_VIEW,
    Permission.ATTENDANCE_UPDATE,
    Permission.RESULT_CREATE,
    Permission.RESULT_VIEW,
    Permission.RESULT_UPDATE,
    Permission.RESULT_PUBLISH,
    Permission.NOTIFICATION_VIEW,
  ],
  Parent: [
    Permission.STUDENT_VIEW,
    Permission.FEE_VIEW,
    Permission.FEE_PAY,
    Permission.ATTENDANCE_VIEW,
    Permission.RESULT_VIEW,
    Permission.NOTIFICATION_VIEW,
  ],
  Student: [
    Permission.STUDENT_VIEW,
    Permission.FEE_VIEW,
    Permission.ATTENDANCE_VIEW,
    Permission.RESULT_VIEW,
    Permission.NOTIFICATION_VIEW,
  ],
} as const satisfies Record<Role, readonly Permission[]>;

const ROLE_PERMISSION_SETS: Record<Role, ReadonlySet<Permission>> = {
  SuperAdmin: new Set(ROLE_PERMISSIONS.SuperAdmin),
  Admin: new Set(ROLE_PERMISSIONS.Admin),
  Staff: new Set(ROLE_PERMISSIONS.Staff),
  Teacher: new Set(ROLE_PERMISSIONS.Teacher),
  Parent: new Set(ROLE_PERMISSIONS.Parent),
  Student: new Set(ROLE_PERMISSIONS.Student),
};

const PERMISSION_ROLES: Record<Permission, Role[]> = ALL_PERMISSIONS.reduce(
  (acc, permission) => {
    acc[permission] = ROLES.filter((role) => ROLE_PERMISSION_SETS[role].has(permission));
    return acc;
  },
  {} as Record<Permission, Role[]>
);

export const PermissionService = {
  hasPermission(user: PermissionUserInput, permission: Permission): boolean {
    const role = normalizeRole(user.role);
    if (!role) return false;

    // Non-platform roles must be tenant-scoped.
    if (role !== "SuperAdmin" && !normalizeSchoolId(user.schoolId)) {
      return false;
    }

    return ROLE_PERMISSION_SETS[role].has(permission);
  },

  requirePermission(permission: Permission) {
    return (user: PermissionUserInput): void => {
      if (PermissionService.hasPermission(user, permission)) {
        return;
      }

      const requiredRoles = PERMISSION_ROLES[permission];
      throw Errors.insufficientRole(requiredRoles);
    };
  },
} as const;
