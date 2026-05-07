export type StaffRole = "owner" | "instructor";

function normalizeRole(value: unknown): StaffRole | null {
  if (value === "owner" || value === "admin") {
    return "owner";
  }

  if (value === "instructor" || value === "staff") {
    return "instructor";
  }

  return null;
}

function getRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function resolveStaffRoleFromMetadata(
  publicMetadata: unknown,
  privateMetadata: unknown,
) {
  const publicRecord = getRecord(publicMetadata);
  const privateRecord = getRecord(privateMetadata);
  const directRole =
    normalizeRole(privateRecord.staffRole) ??
    normalizeRole(privateRecord.role) ??
    normalizeRole(publicRecord.staffRole) ??
    normalizeRole(publicRecord.role);

  if (directRole) {
    return directRole;
  }

  const roles = [
    ...Object.values(getRecord(privateRecord.roles)),
    ...Object.values(getRecord(publicRecord.roles)),
    ...(Array.isArray(privateRecord.roles) ? privateRecord.roles : []),
    ...(Array.isArray(publicRecord.roles) ? publicRecord.roles : []),
  ];

  if (roles.some((role) => normalizeRole(role) === "owner")) {
    return "owner";
  }

  if (roles.some((role) => normalizeRole(role) === "instructor")) {
    return "instructor";
  }

  return null;
}
