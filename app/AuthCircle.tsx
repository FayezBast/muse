"use client";

import { useEffect, useRef, useState } from "react";
import { SignInButton, useAuth, useUser } from "./lib/auth-client";

type AuthCircleProps = {
  onMyBookingsClick?: () => void;
};

function GenericAccountIcon() {
  return (
    <>
      <span className="absolute top-2.5 h-2.5 w-2.5 rounded-full border border-[#f6e8e0]/80" />
      <span className="absolute bottom-2.5 h-3.5 w-5 rounded-t-full border border-[#f6e8e0]/80 border-b-0" />
    </>
  );
}

function getInitials(name?: string | null, email?: string) {
  const source = name?.trim() || email?.split("@")[0] || "";
  const initials = source
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return initials || "U";
}

export default function AuthCircle({ onMyBookingsClick }: AuthCircleProps) {
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const email = user?.primaryEmailAddress?.emailAddress;
  const initials = getInitials(user?.fullName, email);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  if (!isLoaded) {
    return (
      <SignInButton
        mode="redirect"
        forceRedirectUrl="/booking"
        signUpForceRedirectUrl="/booking"
      >
        <button
          type="button"
          aria-label="Account"
          className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.16] bg-white/[0.06] transition hover:border-white/[0.26] hover:bg-white/[0.1]"
        >
          <GenericAccountIcon />
        </button>
      </SignInButton>
    );
  }

  if (!isSignedIn) {
    return (
      <SignInButton
        mode="redirect"
        forceRedirectUrl="/booking"
        signUpForceRedirectUrl="/booking"
      >
        <button
          type="button"
          aria-label="Account"
          className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.16] bg-white/[0.06] transition hover:border-white/[0.26] hover:bg-white/[0.1]"
        >
          <GenericAccountIcon />
        </button>
      </SignInButton>
    );
  }

  return (
    <div ref={menuRef} className="relative inline-flex">
      <button
        type="button"
        aria-label="Account menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.16] bg-[linear-gradient(135deg,#f7e8e2,#dcb5aa)] text-xs font-bold text-[#2a0711] shadow-[0_12px_24px_rgba(0,0,0,0.24)] transition hover:brightness-105"
      >
        {initials}
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-12 z-50 min-w-[13rem] overflow-hidden rounded-[18px] border border-white/10 bg-[#160710] p-2 text-sm text-[#f6e8e0] shadow-[0_20px_50px_rgba(0,0,0,0.42)]">
          {email ? (
            <p className="truncate px-3 py-2 text-xs text-[#f6e8e0]/60">{email}</p>
          ) : null}
          {onMyBookingsClick ? (
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onMyBookingsClick();
              }}
              className="flex w-full items-center rounded-[12px] px-3 py-2 text-left text-sm font-semibold text-[#f6e8e0] transition hover:bg-white/[0.08]"
            >
              My bookings
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              signOut({ redirectUrl: "/booking" });
            }}
            className="flex w-full items-center rounded-[12px] px-3 py-2 text-left text-sm font-semibold text-[#f6e8e0] transition hover:bg-white/[0.08]"
          >
            Log out
          </button>
        </div>
      ) : null}
    </div>
  );
}
