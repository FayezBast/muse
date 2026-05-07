import type { Metadata } from "next";
import AuthPageShell from "../../AuthPageShell";
import {
  AUTH_FALLBACK_REDIRECT_URL,
  AUTH_SIGN_IN_URL,
  AUTH_SIGN_UP_URL,
  SignIn,
} from "../../lib/auth-client";

export const metadata: Metadata = {
  title: "Sign in | MUSE Pilates",
};

export default function SignInPage() {
  return (
    <AuthPageShell eyebrow="Account" title="Sign in to book.">
      <SignIn
        routing="path"
        path={AUTH_SIGN_IN_URL}
        signUpUrl={AUTH_SIGN_UP_URL}
        fallbackRedirectUrl={AUTH_FALLBACK_REDIRECT_URL}
      />
    </AuthPageShell>
  );
}
