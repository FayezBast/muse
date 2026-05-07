"use client";

import {
  ClerkProvider as ClerkAuthProvider,
  SignIn as ClerkSignIn,
  SignInButton as ClerkSignInButton,
  SignUp as ClerkSignUp,
  SignUpButton as ClerkSignUpButton,
  useAuth as useClerkAuth,
  useUser as useClerkUser,
} from "@clerk/nextjs";
import type { ComponentProps, ReactNode } from "react";

const useE2eAuthMock = process.env.NEXT_PUBLIC_E2E_AUTH_MOCK === "true";
export const AUTH_SIGN_IN_URL = "/sign-in";
export const AUTH_SIGN_UP_URL = "/sign-up";
export const AUTH_FALLBACK_REDIRECT_URL = "/booking";

export function AppClerkProvider({ children }: { children: ReactNode }) {
  if (useE2eAuthMock) {
    return <>{children}</>;
  }

  return (
    <ClerkAuthProvider
      signInUrl={AUTH_SIGN_IN_URL}
      signUpUrl={AUTH_SIGN_UP_URL}
      signInFallbackRedirectUrl={AUTH_FALLBACK_REDIRECT_URL}
      signUpFallbackRedirectUrl={AUTH_FALLBACK_REDIRECT_URL}
    >
      {children}
    </ClerkAuthProvider>
  );
}

export function SignInButton({
  children,
  ...props
}: ComponentProps<typeof ClerkSignInButton>) {
  if (useE2eAuthMock) {
    return <>{children}</>;
  }

  return (
    <ClerkSignInButton withSignUp {...props}>
      {children}
    </ClerkSignInButton>
  );
}

export function SignUpButton({
  children,
  ...props
}: ComponentProps<typeof ClerkSignUpButton>) {
  if (useE2eAuthMock) {
    return <>{children}</>;
  }

  return <ClerkSignUpButton {...props}>{children}</ClerkSignUpButton>;
}

function MockAuthCard({ mode }: { mode: "sign-in" | "sign-up" }) {
  return (
    <div className="w-full max-w-md rounded-[24px] border border-white/10 bg-white/[0.055] p-6 text-[#f6e8e0] shadow-[0_24px_70px_rgba(0,0,0,0.36)]">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#f1c9bf]">
        Test auth
      </p>
      <h1 className="mt-3 text-4xl leading-tight text-[#f7e8e2]">
        {mode === "sign-in" ? "Sign in" : "Create account"}
      </h1>
      <p className="mt-4 text-sm leading-7 text-[#f6e8e0]/70">
        Authentication is mocked in this test environment.
      </p>
      <a
        href={AUTH_FALLBACK_REDIRECT_URL}
        className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-full bg-[linear-gradient(135deg,#f7e8e2,#dcb5aa)] px-5 text-sm font-semibold text-[#2a0711]"
      >
        Back to booking
      </a>
    </div>
  );
}

export function SignIn(props: ComponentProps<typeof ClerkSignIn>) {
  if (useE2eAuthMock) {
    return <MockAuthCard mode="sign-in" />;
  }

  return <ClerkSignIn {...props} />;
}

export function SignUp(props: ComponentProps<typeof ClerkSignUp>) {
  if (useE2eAuthMock) {
    return <MockAuthCard mode="sign-up" />;
  }

  return <ClerkSignUp {...props} />;
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
