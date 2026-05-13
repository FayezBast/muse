import Image from "next/image";
import Link from "next/link";
import museWordmark from "../assets/muse-wordmark.png";

type AuthPageShellProps = {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
};

export default function AuthPageShell({
  eyebrow,
  title,
  children,
}: AuthPageShellProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#10040b] px-4 py-6 text-[#f6e8e0] sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(138,27,59,0.3),transparent_28%),radial-gradient(circle_at_82%_18%,rgba(244,200,190,0.14),transparent_18%),linear-gradient(180deg,#090b12_0%,#10040b_42%,#17070f_100%)]" />
      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl flex-col">
        <header className="flex items-center justify-between gap-4 py-2">
          <Link href="/booking" aria-label="MUSE booking">
            <Image
              src={museWordmark}
              alt="MUSE"
              priority
              className="h-12 w-auto object-contain sm:h-14"
            />
          </Link>
          <Link
            href="/booking"
            className="inline-flex min-h-[42px] items-center justify-center rounded-full border border-white/10 bg-white/[0.055] px-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#f6e8e0] transition hover:border-white/20 hover:bg-white/[0.08]"
          >
            Booking
          </Link>
        </header>

        <section className="grid flex-1 items-center gap-8 py-10 lg:grid-cols-[0.9fr_1.1fr] lg:py-14">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[#f1c9bf]">
              {eyebrow}
            </p>
            <h1 className="mt-4 max-w-xl text-[3rem] leading-[0.95] text-[#f7e8e2] sm:text-[4.5rem]">
              {title}
            </h1>
            <p className="mt-5 max-w-md text-sm leading-7 text-[#f6e8e0]/72 sm:text-base sm:leading-8">
              Use your MUSE account to reserve classes and manage upcoming bookings.
            </p>
            <p className="mt-3 max-w-md text-xs leading-6 text-[#f1c9bf]/78 sm:text-sm">
              If you do not see the email, check your junk or trash folder.
            </p>
          </div>

          <div className="flex justify-center lg:justify-end">{children}</div>
        </section>
      </div>
    </main>
  );
}
