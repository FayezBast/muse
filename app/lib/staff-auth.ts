import "server-only";

import { auth, clerkClient } from "./auth-server";
import {
  resolveStaffRoleFromMetadata,
  type StaffRole,
} from "./staff-roles";

export { resolveStaffRoleFromMetadata, type StaffRole } from "./staff-roles";

export type StaffAccess = {
  email?: string;
  role: StaffRole | null;
  isOwner: boolean;
  isInstructor: boolean;
  destination: "/admin" | "/instructor" | null;
};

export class StaffAuthError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "StaffAuthError";
    this.status = status;
  }
}

async function getCurrentStaffUser() {
  const { userId } = await auth();

  if (!userId) {
    return undefined;
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);

  return {
    email: user.primaryEmailAddress?.emailAddress?.trim().toLowerCase(),
    role: resolveStaffRoleFromMetadata(user.publicMetadata, user.privateMetadata),
  };
}

export async function getStaffAccess(): Promise<StaffAccess> {
  const staffUser = await getCurrentStaffUser();

  if (!staffUser?.email) {
    return {
      role: null,
      isOwner: false,
      isInstructor: false,
      destination: null,
    };
  }

  const role = staffUser.role;
  const isOwner = role === "owner";
  const isInstructor = role === "owner" || role === "instructor";

  return {
    email: staffUser.email,
    role,
    isOwner,
    isInstructor,
    destination: isOwner ? "/admin" : isInstructor ? "/instructor" : null,
  };
}

export async function requireStaff(role: StaffRole) {
  const access = await getStaffAccess();

  if (!access.email) {
    throw new StaffAuthError("Sign in with a staff account.", 401);
  }

  if (role === "owner") {
    if (!access.isOwner) {
      throw new StaffAuthError("This account is not allowed to open owner admin.", 403);
    }
  }

  if (role === "instructor") {
    if (!access.isOwner && !access.isInstructor) {
      throw new StaffAuthError("This account is not allowed to open instructor schedule.", 403);
    }
  }

  return {
    email: access.email,
    role: access.role ?? "instructor",
  };
}
