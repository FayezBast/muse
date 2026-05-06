"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { usePathname, useRouter } from "next/navigation";

type StaffRedirectResponse = {
  destination?: "/admin" | "/instructor" | null;
};

export default function StaffAutoRedirect() {
  const { isLoaded, isSignedIn } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      return;
    }

    const controller = new AbortController();

    async function redirectStaff() {
      try {
        const response = await fetch("/api/staff/redirect", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as StaffRedirectResponse;
        const destination = payload.destination;

        if (!destination || pathname === destination) {
          return;
        }

        router.replace(destination);
      } catch {
        return;
      }
    }

    redirectStaff();

    return () => {
      controller.abort();
    };
  }, [isLoaded, isSignedIn, pathname, router]);

  return null;
}
