import type { Metadata } from "next";
import AuthPageShell from "../../AuthPageShell";
import {
  AUTH_FALLBACK_REDIRECT_URL,
  AUTH_SIGN_IN_URL,
  AUTH_SIGN_UP_URL,
  SignUp,
} from "../../lib/auth-client";

export const metadata: Metadata = {
  title: "Sign up | MUSE Pilates",
};

export default function SignUpPage() {
  return (
    <AuthPageShell eyebrow="New account" title="Create your account.">
      <SignUp
        routing="path"
        path={AUTH_SIGN_UP_URL}
        signInUrl={AUTH_SIGN_IN_URL}
        fallbackRedirectUrl={AUTH_FALLBACK_REDIRECT_URL}
      />
    </AuthPageShell>
  );
}
