import { auth } from "@clerk/nextjs/server";
import AdminDashboardClient from "./AdminDashboardClient";
import AuthCircle from "../AuthCircle";
import { StaffAuthError, requireStaff } from "../lib/staff-auth";

export const dynamic = "force-dynamic";

function AccessDenied() {
  return (
    <main className="min-h-screen bg-[#10040b] px-4 py-8 text-[#f6e8e0] sm:px-6 lg:px-8">
      <section className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center">
        <div className="mb-8 flex justify-end">
          <AuthCircle />
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#f1c9bf]">
          Owner Admin
        </p>
        <h1 className="mt-4 text-5xl leading-none text-[#f7e8e2]">
          This account is not an admin.
        </h1>
        <p className="mt-5 text-sm leading-7 text-[#f6e8e0]/70">
          Sign in with a Clerk account whose staffRole metadata is set to owner.
        </p>
        <a
          href="/booking"
          className="mt-8 inline-flex min-h-[48px] w-fit items-center justify-center rounded-full border border-white/10 bg-white/[0.055] px-6 text-sm font-semibold text-[#f6e8e0] transition hover:border-white/20 hover:bg-white/[0.08]"
        >
          Back to booking
        </a>
      </section>
    </main>
  );
}

export default async function AdminPage() {
  const { userId, redirectToSignIn } = await auth();

  if (!userId) {
    return redirectToSignIn({ returnBackUrl: "/admin" });
  }

  try {
    await requireStaff("owner");
  } catch (error) {
    if (error instanceof StaffAuthError) {
      return <AccessDenied />;
    }

    throw error;
  }

  return <AdminDashboardClient />;
}
