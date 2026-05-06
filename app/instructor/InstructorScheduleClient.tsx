"use client";

import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import AuthCircle from "../AuthCircle";

type StaffBookingDetail = {
  id: string;
  createdAt: string;
  name: string;
  email: string;
  phone: string | null;
  notes: string | null;
  status: "confirmed" | "waitlist";
  session: string;
  sessionLabel: string;
  date: string;
  time: string;
  priceCents: number;
  priceLabel: string;
};

type StaffClassSchedule = {
  id: string;
  label: string;
  capacity: number;
  bookedCount: number;
  waitlistCount: number;
  spotsLeft: number;
  revenueCents: number;
  revenueLabel: string;
  bookings: StaffBookingDetail[];
};

type StaffScheduleSlot = {
  time: string;
  title: string;
  subtitle: string;
  duration: string;
  bookedCount: number;
  waitlistCount: number;
  classes: StaffClassSchedule[];
};

type InstructorScheduleResponse = {
  date: string;
  dateLabel: string;
  summary: {
    confirmed: number;
    waitlist: number;
    spotsLeft: number;
    totalCapacity: number;
  };
  slots: StaffScheduleSlot[];
  error?: string;
};

const panelClassName =
  "rounded-[26px] border border-white/10 bg-white/[0.045] shadow-[0_24px_70px_rgba(0,0,0,0.34)] [background-image:linear-gradient(180deg,rgba(255,255,255,0.055),transparent_100%)]";

function formatIsoDate(date: Date) {
  const adjusted = new Date(date);
  adjusted.setMinutes(adjusted.getMinutes() - adjusted.getTimezoneOffset());
  return adjusted.toISOString().split("T")[0] ?? "";
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function InstructorPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const [selectedDate, setSelectedDate] = useState(() => formatIsoDate(new Date()));
  const [schedule, setSchedule] = useState<InstructorScheduleResponse | null>(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const nextClass = useMemo(() => {
    for (const slot of schedule?.slots ?? []) {
      for (const classItem of slot.classes) {
        if (classItem.bookings.some((booking) => booking.status === "confirmed")) {
          return {
            time: slot.time,
            label: classItem.label,
            count: classItem.bookedCount,
          };
        }
      }
    }

    return undefined;
  }, [schedule]);

  async function loadSchedule(date = selectedDate, signal?: AbortSignal) {
    if (!isSignedIn) {
      return;
    }

    setIsLoading(true);
    setMessage("");

    try {
      const response = await fetch(
        `/api/instructor/schedule?date=${encodeURIComponent(date)}`,
        {
          cache: "no-store",
          signal,
        },
      );
      const payload = (await response.json()) as InstructorScheduleResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load instructor schedule.");
      }

      setSchedule(payload);
    } catch (error) {
      if (signal?.aborted) {
        return;
      }

      setMessage(
        error instanceof Error ? error.message : "Unable to load instructor schedule.",
      );
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
      }
    }
  }

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      return;
    }

    const controller = new AbortController();

    loadSchedule(selectedDate, controller.signal);

    return () => {
      controller.abort();
    };
  }, [isLoaded, isSignedIn, selectedDate]);

  function handleDateChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedDate(event.target.value);
  }

  return (
    <main className="min-h-screen overflow-x-clip bg-[#10040b] text-[#f6e8e0]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(138,27,59,0.3),transparent_28%),radial-gradient(circle_at_82%_6%,rgba(244,200,190,0.12),transparent_20%),linear-gradient(180deg,#090b12_0%,#10040b_44%,#17070f_100%)]" />

      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#10040b]/78 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#f1c9bf]">
              Instructor
            </p>
            <h1 className="mt-1 text-3xl leading-tight text-[#f7e8e2] sm:text-4xl">
              Daily class board
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <a
              href="/booking"
              className="rounded-full border border-white/10 bg-white/[0.045] px-4 py-2 text-[#f6e8e0]/80 transition hover:border-white/20 hover:text-[#f6e8e0]"
            >
              Booking page
            </a>
            <a
              href="/admin"
              className="rounded-full border border-white/10 bg-white/[0.045] px-4 py-2 text-[#f6e8e0]/80 transition hover:border-white/20 hover:text-[#f6e8e0]"
            >
              Admin
            </a>
            <AuthCircle />
          </div>
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className={`${panelClassName} p-5 sm:p-7`}>
            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#f1c9bf]">
                  {schedule?.dateLabel ?? "Today"}
                </p>
                <h2 className="mt-3 text-4xl leading-none text-[#f7e8e2] sm:text-6xl">
                  {isLoading ? "Loading..." : "Today at MUSE"}
                </h2>
              </div>

              <label className="block min-w-[13rem] text-sm font-medium text-[#f6e8e0]/65">
                Schedule date
                <input
                  type="date"
                  value={selectedDate}
                  onChange={handleDateChange}
                  className="mt-2 w-full rounded-[18px] border border-white/10 bg-white/[0.055] px-4 py-3 text-sm text-[#f7e8e2] outline-none transition focus:border-[#f1c9bf] focus:ring-4 focus:ring-[#f1c9bf]/15"
                />
              </label>
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-4">
              {[
                {
                  value: String(schedule?.summary.confirmed ?? 0),
                  label: "Confirmed",
                },
                {
                  value: String(schedule?.summary.waitlist ?? 0),
                  label: "Waitlist",
                },
                {
                  value: String(schedule?.summary.spotsLeft ?? 0),
                  label: "Open spots",
                },
                {
                  value: String(schedule?.summary.totalCapacity ?? 0),
                  label: "Capacity",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-[20px] border border-white/10 bg-black/20 p-4"
                >
                  <div className="text-3xl text-[#f4c8be]">{item.value}</div>
                  <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#f6e8e0]/55">
                    {item.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <aside className={`${panelClassName} p-5 sm:p-7`}>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#f1c9bf]">
              Next Focus
            </p>
            {nextClass ? (
              <>
                <h2 className="mt-3 text-4xl leading-tight text-[#f7e8e2]">
                  {nextClass.time}
                </h2>
                <p className="mt-3 text-base text-[#f6e8e0]/70">
                  {nextClass.label} with {nextClass.count} confirmed.
                </p>
              </>
            ) : (
              <>
                <h2 className="mt-3 text-4xl leading-tight text-[#f7e8e2]">
                  No bookings yet
                </h2>
                <p className="mt-3 text-base text-[#f6e8e0]/70">
                  The selected day has no confirmed bookings.
                </p>
              </>
            )}

            {message ? (
              <p className="mt-5 rounded-[18px] border border-white/10 bg-black/20 p-4 text-sm leading-7 text-[#f1c9bf]">
                {message}
              </p>
            ) : null}
          </aside>
        </section>

        <section className="mt-6 space-y-5">
          {(schedule?.slots ?? []).map((slot) => (
            <article key={slot.time} className={`${panelClassName} p-5 sm:p-7`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#f1c9bf]">
                    {slot.duration}
                  </p>
                  <h2 className="mt-2 text-4xl text-[#f7e8e2]">{slot.time}</h2>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#f6e8e0]/65">
                  <span className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-2">
                    {slot.bookedCount} booked
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-2">
                    {slot.waitlistCount} waitlist
                  </span>
                </div>
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                {slot.classes.map((classItem) => (
                  <section
                    key={`${slot.time}-${classItem.id}`}
                    className="rounded-[22px] border border-white/10 bg-black/20 p-4 sm:p-5"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-2xl text-[#f7e8e2]">{classItem.label}</h3>
                        <p className="mt-1 text-sm text-[#f6e8e0]/60">
                          {classItem.bookedCount}/{classItem.capacity} confirmed -
                          {" "}
                          {classItem.spotsLeft} spots open
                        </p>
                      </div>
                      <span className="w-fit rounded-full border border-white/10 bg-white/[0.045] px-3 py-1 text-xs uppercase tracking-[0.16em] text-[#f1c9bf]">
                        {classItem.waitlistCount} waiting
                      </span>
                    </div>

                    <div className="mt-5 space-y-3">
                      {classItem.bookings.length > 0 ? (
                        classItem.bookings.map((booking) => (
                          <article
                            key={booking.id}
                            className="rounded-[18px] border border-white/10 bg-white/[0.04] p-4"
                          >
                            <div className="flex items-start gap-3">
                              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#f7e8e2,#dcb5aa)] text-sm font-bold text-[#2a0711]">
                                {getInitials(booking.name)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                  <div>
                                    <p className="font-semibold text-[#f7e8e2]">
                                      {booking.name}
                                    </p>
                                    <p className="mt-1 text-sm text-[#f6e8e0]/60">
                                      {booking.time} - {booking.sessionLabel}
                                    </p>
                                  </div>
                                  <span
                                    className={`w-fit rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
                                      booking.status === "confirmed"
                                        ? "bg-[#f1c9bf]/14 text-[#f1c9bf]"
                                        : "bg-white/10 text-[#f6e8e0]/70"
                                    }`}
                                  >
                                    {booking.status}
                                  </span>
                                </div>

                                <div className="mt-3 grid gap-2 text-xs text-[#f6e8e0]/55 sm:grid-cols-2">
                                  <p className="truncate">{booking.email}</p>
                                  <p>{booking.phone ?? "No phone"}</p>
                                </div>

                                {booking.notes ? (
                                  <p className="mt-3 rounded-[14px] bg-black/22 p-3 text-sm leading-6 text-[#f6e8e0]/65">
                                    {booking.notes}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </article>
                        ))
                      ) : (
                        <div className="rounded-[18px] border border-dashed border-white/10 bg-white/[0.025] p-5 text-sm text-[#f6e8e0]/55">
                          No clients booked for this class.
                        </div>
                      )}
                    </div>
                  </section>
                ))}
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
