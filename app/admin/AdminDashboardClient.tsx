"use client";

import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import AuthCircle from "../AuthCircle";
import {
  CLASS_TYPES,
  DEFAULT_PACKAGES,
  type StudioClassType,
  type StudioPackage,
} from "../lib/booking-config";

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

type StudioSettings = {
  classTypes: StudioClassType[];
  packages: StudioPackage[];
  updatedAt: string;
};

type OwnerDashboardResponse = {
  date: string;
  dateLabel: string;
  stats: {
    confirmedToday: number;
    waitlistToday: number;
    upcomingConfirmed: number;
    upcomingWaitlist: number;
    revenueNext30Cents: number;
    revenueNext30Label: string;
    bookedCapacityToday: number;
    totalCapacityToday: number;
  };
  classStats: {
    id: string;
    label: string;
    confirmed: number;
    waitlist: number;
    revenueCents: number;
    revenueLabel: string;
  }[];
  recentBookings: StaffBookingDetail[];
  schedule: {
    date: string;
    dateLabel: string;
    summary: {
      confirmed: number;
      waitlist: number;
      spotsLeft: number;
      totalCapacity: number;
    };
    slots: StaffScheduleSlot[];
  };
  settings: StudioSettings;
};

type ApiErrorResponse = {
  error?: string;
};

const inputClassName =
  "mt-2 w-full rounded-[18px] border border-white/10 bg-white/[0.055] px-4 py-3 text-sm text-[#f7e8e2] outline-none transition placeholder:text-[#f7e8e2]/35 focus:border-[#f1c9bf] focus:ring-4 focus:ring-[#f1c9bf]/15";

const panelClassName =
  "rounded-[26px] border border-white/10 bg-white/[0.045] shadow-[0_24px_70px_rgba(0,0,0,0.34)] [background-image:linear-gradient(180deg,rgba(255,255,255,0.055),transparent_100%)]";

function createDefaultSettings(): StudioSettings {
  return {
    classTypes: CLASS_TYPES.map((classType) => ({ ...classType })),
    packages: DEFAULT_PACKAGES.map((pkg) => ({
      ...pkg,
      points: [...pkg.points],
    })),
    updatedAt: new Date().toISOString(),
  };
}

function formatIsoDate(date: Date) {
  const adjusted = new Date(date);
  adjusted.setMinutes(adjusted.getMinutes() - adjusted.getTimezoneOffset());
  return adjusted.toISOString().split("T")[0] ?? "";
}

function priceInputValue(priceCents: number) {
  const dollars = priceCents / 100;

  return Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2);
}

function parsePriceCents(value: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.round(parsed * 100));
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default function AdminPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const [selectedDate, setSelectedDate] = useState(() => formatIsoDate(new Date()));
  const [dashboard, setDashboard] = useState<OwnerDashboardResponse | null>(null);
  const [draftSettings, setDraftSettings] = useState<StudioSettings>(() =>
    createDefaultSettings(),
  );
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const capacityPercent = useMemo(() => {
    if (!dashboard?.stats.totalCapacityToday) {
      return 0;
    }

    return Math.min(
      Math.round(
        (dashboard.stats.bookedCapacityToday / dashboard.stats.totalCapacityToday) * 100,
      ),
      100,
    );
  }, [dashboard]);

  async function loadDashboard(date = selectedDate, signal?: AbortSignal) {
    if (!isSignedIn) {
      return;
    }

    setIsLoading(true);
    setMessage("");

    try {
      const response = await fetch(
        `/api/admin/overview?date=${encodeURIComponent(date)}`,
        {
          cache: "no-store",
          signal,
        },
      );
      const payload = (await response.json()) as OwnerDashboardResponse & ApiErrorResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load owner dashboard.");
      }

      setDashboard(payload);
      setDraftSettings(payload.settings);
    } catch (error) {
      if (signal?.aborted) {
        return;
      }

      setMessage(
        error instanceof Error ? error.message : "Unable to load owner dashboard.",
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

    loadDashboard(selectedDate, controller.signal);

    return () => {
      controller.abort();
    };
  }, [isLoaded, isSignedIn, selectedDate]);

  function handleDateChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedDate(event.target.value);
  }

  function updateClassType(
    index: number,
    key: "label" | "capacity" | "priceCents",
    value: string,
  ) {
    setDraftSettings((current) => ({
      ...current,
      classTypes: current.classTypes.map((classType, itemIndex) => {
        if (itemIndex !== index) {
          return classType;
        }

        if (key === "capacity") {
          return {
            ...classType,
            capacity: Math.max(1, Math.round(Number(value) || 1)),
          };
        }

        if (key === "priceCents") {
          return {
            ...classType,
            priceCents: parsePriceCents(value),
          };
        }

        return {
          ...classType,
          label: value,
        };
      }),
    }));
  }

  function updatePackage(
    index: number,
    key: "kicker" | "title" | "bonus" | "priceLabel" | "points" | "featured",
    value: string | boolean,
  ) {
    setDraftSettings((current) => ({
      ...current,
      packages: current.packages.map((pkg, itemIndex) => {
        if (itemIndex !== index) {
          return pkg;
        }

        if (key === "points") {
          return {
            ...pkg,
            points:
              typeof value === "string"
                ? value
                    .split("\n")
                    .map((point) => point.trim())
                    .filter(Boolean)
                : pkg.points,
          };
        }

        if (key === "featured") {
          return {
            ...pkg,
            featured: Boolean(value),
          };
        }

        return {
          ...pkg,
          [key]: typeof value === "string" ? value : "",
        };
      }),
    }));
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/studio-settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(draftSettings),
      });
      const payload = (await response.json()) as
        | { settings?: StudioSettings; error?: string }
        | undefined;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to save studio settings.");
      }

      if (payload?.settings) {
        setDraftSettings(payload.settings);
      }

      setMessage("Studio settings saved.");
      await loadDashboard(selectedDate);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to save studio settings.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen overflow-x-clip bg-[#10040b] text-[#f6e8e0]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(138,27,59,0.32),transparent_26%),radial-gradient(circle_at_84%_12%,rgba(244,200,190,0.12),transparent_20%),linear-gradient(180deg,#090b12_0%,#10040b_44%,#17070f_100%)]" />

      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#10040b]/78 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#f1c9bf]">
              Owner Admin
            </p>
            <h1 className="mt-1 text-3xl leading-tight text-[#f7e8e2] sm:text-4xl">
              Studio command center
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
              href="/instructor"
              className="rounded-full border border-white/10 bg-white/[0.045] px-4 py-2 text-[#f6e8e0]/80 transition hover:border-white/20 hover:text-[#f6e8e0]"
            >
              Instructor
            </a>
            <AuthCircle />
          </div>
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr] lg:items-stretch">
          <div className={`${panelClassName} p-5 sm:p-7`}>
            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#f1c9bf]">
                  {dashboard?.dateLabel ?? "Today"}
                </p>
                <h2 className="mt-3 text-4xl leading-none text-[#f7e8e2] sm:text-6xl">
                  {isLoading ? "Loading..." : "Owner overview"}
                </h2>
              </div>

              <label className="block min-w-[13rem] text-sm font-medium text-[#f6e8e0]/65">
                Dashboard date
                <input
                  type="date"
                  value={selectedDate}
                  onChange={handleDateChange}
                  className={inputClassName}
                />
              </label>
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  value: String(dashboard?.stats.confirmedToday ?? 0),
                  label: "Confirmed today",
                },
                {
                  value: String(dashboard?.stats.waitlistToday ?? 0),
                  label: "Waitlist today",
                },
                {
                  value: dashboard?.stats.revenueNext30Label ?? "$0",
                  label: "Next 30 days",
                },
                {
                  value: `${capacityPercent}%`,
                  label: "Today capacity",
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

          <div className={`${panelClassName} p-5 sm:p-7`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#f1c9bf]">
                  Class Mix
                </p>
                <h2 className="mt-3 text-3xl leading-tight text-[#f7e8e2]">
                  Next 30 days
                </h2>
              </div>
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs text-[#f6e8e0]/70">
                {dashboard?.stats.upcomingConfirmed ?? 0} booked
              </span>
            </div>

            <div className="mt-6 space-y-4">
              {(dashboard?.classStats ?? []).map((classStat) => {
                const maxCount = Math.max(
                  dashboard?.stats.upcomingConfirmed ?? 1,
                  1,
                );
                const width = Math.max((classStat.confirmed / maxCount) * 100, 4);

                return (
                  <div key={classStat.id}>
                    <div className="flex items-center justify-between gap-4 text-sm">
                      <span className="font-semibold text-[#f7e8e2]">
                        {classStat.label}
                      </span>
                      <span className="text-[#f6e8e0]/60">
                        {classStat.confirmed} confirmed - {classStat.revenueLabel}
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-[linear-gradient(135deg,#f7e8e2,#dcb5aa)]"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {message ? (
          <p className="mt-5 rounded-[20px] border border-white/10 bg-white/[0.045] p-4 text-sm leading-7 text-[#f1c9bf]">
            {message}
          </p>
        ) : null}

        <section className="mt-6 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <div className={`${panelClassName} p-5 sm:p-7`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#f1c9bf]">
                  Daily Schedule
                </p>
                <h2 className="mt-2 text-3xl text-[#f7e8e2]">
                  Who is booked today
                </h2>
              </div>
              <span className="text-sm text-[#f6e8e0]/60">
                {dashboard?.schedule.summary.spotsLeft ?? 0} spots open
              </span>
            </div>

            <div className="mt-6 space-y-4">
              {(dashboard?.schedule.slots ?? []).map((slot) => (
                <article
                  key={slot.time}
                  className="rounded-[22px] border border-white/10 bg-black/20 p-4"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-2xl text-[#f4c8be]">{slot.time}</p>
                      <p className="mt-1 text-sm text-[#f6e8e0]/60">
                        {slot.bookedCount} booked - {slot.waitlistCount} waitlist
                      </p>
                    </div>
                    <span className="w-fit rounded-full border border-white/10 bg-white/[0.045] px-3 py-1 text-xs text-[#f6e8e0]/70">
                      {slot.duration}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {slot.classes.map((classItem) => (
                      <div
                        key={`${slot.time}-${classItem.id}`}
                        className="rounded-[18px] border border-white/10 bg-white/[0.035] p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-[#f7e8e2]">
                              {classItem.label}
                            </p>
                            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[#f6e8e0]/55">
                              {classItem.bookedCount}/{classItem.capacity} booked
                            </p>
                          </div>
                          <span className="text-sm text-[#f1c9bf]">
                            {classItem.revenueLabel}
                          </span>
                        </div>

                        <div className="mt-4 space-y-2">
                          {classItem.bookings.length > 0 ? (
                            classItem.bookings.map((booking) => (
                              <div
                                key={booking.id}
                                className="rounded-[14px] bg-black/22 px-3 py-2"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-sm font-semibold text-[#f7e8e2]">
                                    {booking.name}
                                  </span>
                                  <span className="text-[11px] uppercase tracking-[0.16em] text-[#f1c9bf]">
                                    {booking.status}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs text-[#f6e8e0]/55">
                                  {booking.email}
                                  {booking.phone ? ` - ${booking.phone}` : ""}
                                </p>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-[#f6e8e0]/50">No bookings yet.</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>

          <aside className={`${panelClassName} h-fit p-5 sm:p-7`}>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#f1c9bf]">
              Recent
            </p>
            <h2 className="mt-2 text-3xl text-[#f7e8e2]">Latest bookings</h2>

            <div className="mt-5 space-y-3">
              {(dashboard?.recentBookings ?? []).length > 0 ? (
                dashboard?.recentBookings.map((booking) => (
                  <article
                    key={booking.id}
                    className="rounded-[18px] border border-white/10 bg-black/20 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#f7e8e2]">
                          {booking.name}
                        </p>
                        <p className="mt-1 text-xs text-[#f6e8e0]/55">
                          {booking.date} at {booking.time}
                        </p>
                      </div>
                      <span className="text-xs text-[#f1c9bf]">
                        {booking.priceLabel}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-[#f6e8e0]/50">
                      {booking.sessionLabel} - {formatDateTime(booking.createdAt)}
                    </p>
                  </article>
                ))
              ) : (
                <p className="text-sm text-[#f6e8e0]/55">No recent bookings.</p>
              )}
            </div>
          </aside>
        </section>

        <form onSubmit={handleSave} className={`${panelClassName} mt-6 p-5 sm:p-7`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#f1c9bf]">
                Pricing And Packages
              </p>
              <h2 className="mt-2 text-3xl text-[#f7e8e2]">
                Edit what clients see
              </h2>
            </div>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-[linear-gradient(135deg,#f7e8e2,#dcb5aa)] px-6 text-sm font-semibold text-[#2a0711] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "Saving..." : "Save changes"}
            </button>
          </div>

          <div className="mt-7 grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
            <section className="rounded-[22px] border border-white/10 bg-black/18 p-4 sm:p-5">
              <h3 className="text-lg font-semibold text-[#f7e8e2]">Class prices</h3>
              <div className="mt-4 space-y-4">
                {draftSettings.classTypes.map((classType, index) => (
                  <div
                    key={classType.id}
                    className="rounded-[18px] border border-white/10 bg-white/[0.035] p-4"
                  >
                    <label className="block text-sm text-[#f6e8e0]/65">
                      Class name
                      <input
                        value={classType.label}
                        onChange={(event) =>
                          updateClassType(index, "label", event.target.value)
                        }
                        className={inputClassName}
                      />
                    </label>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <label className="block text-sm text-[#f6e8e0]/65">
                        Price USD
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={priceInputValue(classType.priceCents)}
                          onChange={(event) =>
                            updateClassType(index, "priceCents", event.target.value)
                          }
                          className={inputClassName}
                        />
                      </label>
                      <label className="block text-sm text-[#f6e8e0]/65">
                        Capacity
                        <input
                          type="number"
                          min="1"
                          max="50"
                          value={classType.capacity}
                          onChange={(event) =>
                            updateClassType(index, "capacity", event.target.value)
                          }
                          className={inputClassName}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[22px] border border-white/10 bg-black/18 p-4 sm:p-5">
              <h3 className="text-lg font-semibold text-[#f7e8e2]">Packages</h3>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {draftSettings.packages.map((pkg, index) => (
                  <article
                    key={pkg.id}
                    className="rounded-[18px] border border-white/10 bg-white/[0.035] p-4"
                  >
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block text-sm text-[#f6e8e0]/65">
                        Kicker
                        <input
                          value={pkg.kicker}
                          onChange={(event) =>
                            updatePackage(index, "kicker", event.target.value)
                          }
                          className={inputClassName}
                        />
                      </label>
                      <label className="block text-sm text-[#f6e8e0]/65">
                        Price label
                        <input
                          value={pkg.priceLabel ?? ""}
                          placeholder="$120"
                          onChange={(event) =>
                            updatePackage(index, "priceLabel", event.target.value)
                          }
                          className={inputClassName}
                        />
                      </label>
                    </div>
                    <label className="mt-4 block text-sm text-[#f6e8e0]/65">
                      Title
                      <input
                        value={pkg.title}
                        onChange={(event) =>
                          updatePackage(index, "title", event.target.value)
                        }
                        className={inputClassName}
                      />
                    </label>
                    <label className="mt-4 block text-sm text-[#f6e8e0]/65">
                      Bonus
                      <input
                        value={pkg.bonus}
                        onChange={(event) =>
                          updatePackage(index, "bonus", event.target.value)
                        }
                        className={inputClassName}
                      />
                    </label>
                    <label className="mt-4 block text-sm text-[#f6e8e0]/65">
                      Details
                      <textarea
                        rows={5}
                        value={pkg.points.join("\n")}
                        onChange={(event) =>
                          updatePackage(index, "points", event.target.value)
                        }
                        className={`${inputClassName} resize-none`}
                      />
                    </label>
                    <label className="mt-4 flex items-center gap-3 text-sm text-[#f6e8e0]/70">
                      <input
                        type="checkbox"
                        checked={Boolean(pkg.featured)}
                        onChange={(event) =>
                          updatePackage(index, "featured", event.target.checked)
                        }
                        className="h-4 w-4 accent-[#f1c9bf]"
                      />
                      Featured package
                    </label>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </form>
      </div>
    </main>
  );
}
