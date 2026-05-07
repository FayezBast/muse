import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const useE2eAuthMock =
  process.env.E2E_AUTH_MOCK === "true" ||
  process.env.NEXT_PUBLIC_E2E_AUTH_MOCK === "true";

export default useE2eAuthMock
  ? () => NextResponse.next()
  : clerkMiddleware({
      signInUrl: "/sign-in",
      signUpUrl: "/sign-up",
    });

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
