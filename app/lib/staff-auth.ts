import "server-only";

import { auth, clerkClient } from "@clerk/nextjs/server";

export type StaffRole = "owner" | "instructor";

export type StaffAccess = {
  email?: string;
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

function splitEmails(value?: string) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function getOwnerEmails() {
  return splitEmails(
    [
      process.env.OWNER_ADMIN_EMAILS,
      process.env.MUSE_OWNER_EMAILS,
      process.env.BOOKING_OWNER_EMAIL,
    ]
      .filter(Boolean)
      .join(","),
  );
}

function getInstructorEmails() {
  return splitEmails(
    [
      process.env.INSTRUCTOR_EMAILS,
      process.env.MUSE_INSTRUCTOR_EMAILS,
      process.env.BOOKING_INSTRUCTOR_EMAIL,
    ]
      .filter(Boolean)
      .join(","),
  );
}

async function getCurrentUserEmail() {
  const { userId } = await auth();

  if (!userId) {
    return undefined;
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);

  return user.primaryEmailAddress?.emailAddress?.trim().toLowerCase();
}

export async function getStaffAccess(): Promise<StaffAccess> {
  const email = await getCurrentUserEmail();
  const ownerEmails = getOwnerEmails();
  const instructorEmails = getInstructorEmails();

  if (!email) {
    return {
      isOwner: false,
      isInstructor: false,
      destination: null,
    };
  }

  const isOwner = ownerEmails.has(email);
  const isInstructor = instructorEmails.has(email);

  return {
    email,
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

  const ownerEmails = getOwnerEmails();
  const instructorEmails = getInstructorEmails();

  if (role === "owner") {
    if (ownerEmails.size === 0) {
      throw new StaffAuthError("Owner admin access is not configured.", 403);
    }

    if (!access.isOwner) {
      throw new StaffAuthError("This account is not allowed to open owner admin.", 403);
    }
  }

  if (role === "instructor") {
    if (ownerEmails.size === 0 && instructorEmails.size === 0) {
      throw new StaffAuthError("Instructor access is not configured.", 403);
    }

    if (!access.isOwner && !access.isInstructor) {
      throw new StaffAuthError("This account is not allowed to open instructor schedule.", 403);
    }
  }

  return {
    email: access.email,
    role: access.isOwner ? "owner" : "instructor",
  };
}
