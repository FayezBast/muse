"use client";

import {
  ClerkProvider as ClerkAuthProvider,
  SignInButton as ClerkSignInButton,
  useAuth as useClerkAuth,
  useUser as useClerkUser,
} from "@clerk/nextjs";
import type { ComponentProps, ReactNode } from "react";

const useE2eAuthMock = process.env.NEXT_PUBLIC_E2E_AUTH_MOCK === "true";

export function AppClerkProvider({ children }: { children: ReactNode }) {
  if (useE2eAuthMock) {
    return <>{children}</>;
  }

  return <ClerkAuthProvider>{children}</ClerkAuthProvider>;
}

export function SignInButton({
  children,
  ...props
}: ComponentProps<typeof ClerkSignInButton>) {
  if (useE2eAuthMock) {
    return <>{children}</>;
  }

  return <ClerkSignInButton {...props}>{children}</ClerkSignInButton>;
}

export function useAuth() {
  if (useE2eAuthMock) {
    return {
      isLoaded: true,
      isSignedIn: false,
      sessionId: null,
      userId: null,
      getToken: async () => null,
      signOut: async () => undefined,
    };
  }

  return useClerkAuth();
}

export function useUser() {
  if (useE2eAuthMock) {
    return {
      isLoaded: true,
      isSignedIn: false,
      user: null,
    };
  }

  return useClerkUser();
}
