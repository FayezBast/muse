import "server-only";

import { auth as clerkAuth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

function useE2eAuthMock() {
  return (
    process.env.E2E_AUTH_MOCK === "true" ||
    process.env.NEXT_PUBLIC_E2E_AUTH_MOCK === "true"
  );
}

export async function auth() {
  if (!useE2eAuthMock()) {
    return clerkAuth();
  }

  return {
    sessionId: null,
    userId: null,
    redirectToSignIn({ returnBackUrl }: { returnBackUrl?: string } = {}) {
      const params = new URLSearchParams();

      if (returnBackUrl) {
        params.set("redirect_url", returnBackUrl);
      }

      redirect(`/sign-in${params.size ? `?${params.toString()}` : ""}`);
    },
  };
}

export { clerkClient };
