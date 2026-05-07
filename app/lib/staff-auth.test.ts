import { describe, expect, it } from "vitest";
import { resolveStaffRoleFromMetadata } from "./staff-roles";

describe("Clerk staff role resolution", () => {
  it("grants owner from private metadata", () => {
    expect(resolveStaffRoleFromMetadata({}, { staffRole: "owner" })).toBe("owner");
  });

  it("grants instructor from public metadata", () => {
    expect(resolveStaffRoleFromMetadata({ staffRole: "instructor" }, {})).toBe(
      "instructor",
    );
  });

  it("treats admin as owner and staff as instructor", () => {
    expect(resolveStaffRoleFromMetadata({ role: "admin" }, {})).toBe("owner");
    expect(resolveStaffRoleFromMetadata({ role: "staff" }, {})).toBe("instructor");
  });

  it("does not grant access without Clerk role metadata", () => {
    expect(resolveStaffRoleFromMetadata({ email: "owner@example.com" }, {})).toBe(null);
  });
});
