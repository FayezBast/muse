"use client";

import Image from "next/image";
import {
  type ComponentProps,
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  startTransition,
  useMemo,
  useEffect,
  useState,
} from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import heroImage from "../../assets/hero-pilates.jpg";
import museWordmark from "../../assets/muse-wordmark.png";
import AuthCircle from "../AuthCircle";
import { SignInButton, useAuth, useUser } from "../lib/auth-client";
import {
  CLASS_TYPES,
  DEFAULT_PACKAGES,
  DEFAULT_TIME_SLOTS,
  DEFAULT_WEEKLY_SCHEDULE,
  addDaysToIsoDate,
  formatStudioCalendarDateTime,
  getClassType,
  getMaxGuestsPerTime,
  getStudioClassStart,
  getStudioTodayIso,
  getTimeSlotsForDate,
  getTimeSlotClassTypes,
  isTimeSlotPast,
  type ClassTypeId,
  type StudioClassType,
  type StudioPackage,
  type StudioTimeSlot,
  type StudioWeeklyScheduleDay,
} from "../lib/booking-config";

type ClassSlot = {
  time: string;
  title: string;
  subtitle: string;
  duration: string;
  classTypeIds: readonly ClassTypeId[];
};

type DaySchedule = {
  summary: string;
  classes: ClassSlot[];
};

type ClassAvailability = {
  id: ClassTypeId;
  label: string;
  capacity: number;
  priceCents: number;
  priceLabel: string;
  bookedCount: number;
  waitlistCount: number;
  spotsLeft: number;
  isFull: boolean;
};

type AvailabilityResponse = {
  dates: {
    date: string;
    slots: {
      time: string;
      classes: ClassAvailability[];
    }[];
  }[];
};

type BookingFormState = {
  requestType: "booking" | "waitlist";
  name: string;
  email: string;
  phone: string;
  session: ClassTypeId | "";
  date: string;
  time: string;
  notes: string;
};

type UserBookingSummary = {
  id: string;
  createdAt: string;
  status: "confirmed" | "waitlist";
  session: string;
  sessionLabel: string;
  date: string;
  time: string;
  priceCents: number;
  priceLabel: string;
};

type BookingNotificationStatus = {
  status: "sent" | "skipped" | "failed" | "queued";
  reason?: string;
};

type StudioSettingsResponse = {
  settings?: {
    classTypes?: StudioClassType[];
    timeSlots?: StudioTimeSlot[];
    weeklySchedule?: StudioWeeklyScheduleDay[];
    packages?: StudioPackage[];
  };
  error?: string;
};

type MotionButtonProps = ComponentProps<typeof motion.button>;

const AUTO_NOTE_PATTERN = /^Requested for the .* class slot\.$/;

const whyMuseHighlights = [
  {
    kicker: "01",
    title: "Reformer & Mat classes",
    copy: "Small, intentional classes with room to build strength, reset your posture, and move at a pace that feels good.",
  },
  {
    kicker: "02",
    title: "Coffee. Matcha.",
    copy: "A softer studio ritual before or after class, designed for slow mornings, evening resets, and lingering conversations.",
  },
  {
    kicker: "03",
    title: "Community.",
    copy: "A warm MUSE rhythm where Pilates feels elevated, social, and personal instead of rushed or anonymous.",
  },
];

const easeOutQuart = [0.22, 1, 0.36, 1] as const;

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.24, ease: easeOutQuart },
  },
};

const stagger: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.04,
    },
  },
};

const fieldClassName =
  "mt-2 w-full rounded-[18px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-[#f6e8e0] shadow-none outline-none transition placeholder:text-[#f6e8e0]/[0.35] focus:border-[#f1c9bf] focus:ring-4 focus:ring-[#f1c9bf]/[0.15]";

const cardShellClassName =
  "rounded-[24px] border border-white/10 bg-[#1a0710]/75 shadow-[0_22px_54px_rgba(0,0,0,0.32)] [background-image:linear-gradient(180deg,rgba(255,255,255,0.05),transparent_100%)] sm:rounded-[28px] lg:bg-white/[0.035] lg:shadow-[0_30px_80px_rgba(0,0,0,0.4)] lg:backdrop-blur-[14px]";

function formatInlineList(values: string[]) {
  if (values.length <= 1) {
    return values[0] ?? "";
  }

  return `${values.slice(0, -1).join(", ")} and ${values.at(-1)}`;
}

function createDailySchedule(
  timeSlots: readonly StudioTimeSlot[] = DEFAULT_TIME_SLOTS,
  classTypes: readonly StudioClassType[] = CLASS_TYPES,
): DaySchedule {
  if (timeSlots.length === 0) {
    return {
      summary: "No class slots are scheduled for this day.",
      classes: [],
    };
  }

  const timeSummary = formatInlineList(
    timeSlots.map((slot) => {
      const classSummary = formatInlineList(
        getTimeSlotClassTypes(slot, classTypes).map((classType) => classType.label),
      );

      return classSummary ? `${slot.time} (${classSummary})` : slot.time;
    }),
  );
  const capacitySummary = formatInlineList(
    classTypes.map(
      (classType) =>
        `${classType.label} has ${classType.capacity} spot${
          classType.capacity === 1 ? "" : "s"
        }`,
    ),
  );

  return {
    summary: `Class slots are available at ${timeSummary}. ${capacitySummary}.`,
    classes: timeSlots.map((slot) => ({
      time: slot.time,
      title: slot.title,
      subtitle: slot.subtitle,
      duration: slot.duration,
      classTypeIds: [...slot.classTypeIds],
    })),
  };
}

function createDefaultWeeklySchedule() {
  return DEFAULT_WEEKLY_SCHEDULE.map((day) => ({
    ...day,
    timeSlots: day.timeSlots.map((slot) => ({
      ...slot,
      classTypeIds: [...slot.classTypeIds],
    })),
  }));
}

function getMaxGuestsForTimeSlots(
  timeSlots: readonly StudioTimeSlot[],
  classTypes: readonly StudioClassType[],
) {
  if (timeSlots.length === 0) {
    return 0;
  }

  return Math.max(
    ...timeSlots.map((slot) =>
      getTimeSlotClassTypes(slot, classTypes).reduce(
        (total, classType) => total + classType.capacity,
        0,
      ),
    ),
  );
}

function createEmptyForm(date = ""): BookingFormState {
  return {
    requestType: "booking",
    name: "",
    email: "",
    phone: "",
    session: "",
    date,
    time: "",
    notes: "",
  };
}

function createStudioDate(dateIso: string) {
  const [year, month, day] = dateIso.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day, 12));
}

function formatIsoDate(date: Date) {
  return date.toISOString().split("T")[0] ?? "";
}

function buildDates(baseDate: Date, count = 7) {
  const anchorIso = getStudioTodayIso(baseDate);

  return Array.from({ length: count }, (_, index) => {
    return createStudioDate(addDaysToIsoDate(anchorIso, index));
  });
}

function buildAvailabilityKey(date: string, time: string, classTypeId: ClassTypeId) {
  return `${date}|${time}|${classTypeId}`;
}

function createDefaultClassAvailability(
  classTypeId: ClassTypeId,
  classTypes: readonly StudioClassType[] = CLASS_TYPES,
): ClassAvailability {
  const classType = getClassType(classTypeId, classTypes) ?? classTypes[0] ?? CLASS_TYPES[0];

  return {
    id: classType.id,
    label: classType.label,
    capacity: classType.capacity,
    priceCents: classType.priceCents,
    priceLabel: classType.priceLabel,
    bookedCount: 0,
    waitlistCount: 0,
    spotsLeft: classType.capacity,
    isFull: false,
  };
}

function normalizeAvailability(response: AvailabilityResponse) {
  const nextAvailability: Record<string, ClassAvailability> = {};

  for (const day of response.dates) {
    for (const slot of day.slots) {
      for (const classAvailability of slot.classes) {
        nextAvailability[
          buildAvailabilityKey(day.date, slot.time, classAvailability.id)
        ] = classAvailability;
      }
    }
  }

  return nextAvailability;
}

function formatDayLabel(date: Date, index: number) {
  if (index === 0) {
    return "Today";
  }

  return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
}

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short" }).format(date);
}

function formatLongDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatBookingSummaryDate(dateIso: string) {
  const [year, month, day] = dateIso.split("-").map(Number);

  if (!year || !month || !day) {
    return dateIso;
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(year, month - 1, day));
}

function getBookingStartTime(booking: UserBookingSummary) {
  return getStudioClassStart(booking.date, booking.time)?.getTime() ?? 0;
}

function sortUpcomingBookings(bookings: UserBookingSummary[]) {
  return bookings.toSorted(
    (first, second) => getBookingStartTime(first) - getBookingStartTime(second),
  );
}

function sortOldBookings(bookings: UserBookingSummary[]) {
  return bookings.toSorted(
    (first, second) => getBookingStartTime(second) - getBookingStartTime(first),
  );
}

function buildGoogleCalendarUrl(booking: UserBookingSummary) {
  const dates = formatStudioCalendarDateTime(booking.date, booking.time);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `MUSE Pilates - ${booking.sessionLabel}`,
    details: `MUSE ${booking.sessionLabel} booking (${booking.status}).`,
    location: "MUSE Pilates",
    ctz: "Asia/Beirut",
  });

  if (dates) {
    params.set("dates", `${dates.start}/${dates.end}`);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function buildCalendarDownloadUrl(booking: UserBookingSummary) {
  return `/api/bookings/${encodeURIComponent(booking.id)}/calendar`;
}

function isIsoDateParam(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function resolveNextNotes(
  currentNotes: string,
  slotTime: string,
  classTypeId?: ClassTypeId,
  classTypes: readonly StudioClassType[] = CLASS_TYPES,
) {
  const trimmed = currentNotes.trim();
  const classLabel = classTypeId
    ? getClassType(classTypeId, classTypes)?.label
    : undefined;

  if (!trimmed || AUTO_NOTE_PATTERN.test(trimmed)) {
    return `Requested for the ${slotTime}${classLabel ? ` ${classLabel}` : ""} class slot.`;
  }

  return currentNotes;
}

function createIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}.${Math.random().toString(36).slice(2)}`;
}

export default function BookingPage() {
  const shouldReduceMotion = useReducedMotion();
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const [dates, setDates] = useState<Date[]>(() => buildDates(new Date()));
  const [classTypes, setClassTypes] = useState<StudioClassType[]>(() =>
    CLASS_TYPES.map((classType) => ({ ...classType })),
  );
  const [timeSlots, setTimeSlots] = useState<StudioTimeSlot[]>(() =>
    DEFAULT_TIME_SLOTS.map((slot) => ({
      ...slot,
      classTypeIds: [...slot.classTypeIds],
    })),
  );
  const [weeklySchedule, setWeeklySchedule] = useState<StudioWeeklyScheduleDay[]>(
    createDefaultWeeklySchedule,
  );
  const [studioPackages, setStudioPackages] = useState<StudioPackage[]>(() =>
    DEFAULT_PACKAGES.map((pkg) => ({
      ...pkg,
      points: [...pkg.points],
    })),
  );
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);
  const [selectedDateIndex, setSelectedDateIndex] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBookingsModalOpen, setIsBookingsModalOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [availabilityMessage, setAvailabilityMessage] = useState("");
  const [bookingsMessage, setBookingsMessage] = useState("");
  const [availabilityByKey, setAvailabilityByKey] = useState<Record<string, ClassAvailability>>({});
  const [myBookings, setMyBookings] = useState<UserBookingSummary[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingBookings, setIsLoadingBookings] = useState(false);
  const [cancellingBookingId, setCancellingBookingId] = useState("");
  const [clock, setClock] = useState(() => new Date());
  const [form, setForm] = useState<BookingFormState>(() =>
    createEmptyForm(getStudioTodayIso()),
  );

  const activeDate = dates[selectedDateIndex];
  const activeDateIso = activeDate ? formatIsoDate(activeDate) : "";
  const activeTimeSlots = useMemo(
    () => getTimeSlotsForDate(activeDateIso, weeklySchedule, timeSlots),
    [activeDateIso, timeSlots, weeklySchedule],
  );
  const formTimeSlots = form.date
    ? getTimeSlotsForDate(form.date, weeklySchedule, timeSlots)
    : activeTimeSlots;
  const selectedTimeSlot = form.time
    ? formTimeSlots.find((slot) => slot.time === form.time)
    : undefined;
  const activeSchedule = useMemo(
    () => createDailySchedule(activeTimeSlots, classTypes),
    [activeTimeSlots, classTypes],
  );
  const classTypesForSelectedTime = form.time
    ? getClassTypesForTime(form.time, form.date)
    : classTypes;
  const selectedClassType =
    form.session &&
    classTypesForSelectedTime.some((classType) => classType.id === form.session)
      ? getClassType(form.session, classTypes)
      : undefined;
  const maxGuestsPerTime = getMaxGuestsForTimeSlots(activeTimeSlots, classTypes);
  const selectedAvailability =
    form.date && selectedTimeSlot && form.time && form.session && selectedClassType
      ? availabilityByKey[buildAvailabilityKey(form.date, form.time, form.session)] ??
        createDefaultClassAvailability(form.session, classTypes)
      : undefined;
  const selectedTimeUnavailable =
    form.date && form.time
      ? !selectedTimeSlot || isTimeSlotPast(form.date, form.time, clock)
      : false;
  const selectedDateLabel = activeDate
    ? selectedDateIndex === 0
      ? "Today at MUSE"
      : formatLongDate(activeDate)
    : "Today at MUSE";
  const classTimeSummary =
    activeTimeSlots.length > 0
      ? formatInlineList(activeTimeSlots.map((slot) => slot.time))
      : "no class times";
  const classCapacitySummary = formatInlineList(
    classTypes.map(
      (classType) =>
        `${classType.label} has ${classType.capacity} spot${
          classType.capacity === 1 ? "" : "s"
        }`,
    ),
  );
  const bookingSelectionNote = form.time
    ? selectedTimeUnavailable
      ? `${form.time} is no longer available because the class time has passed.`
      : selectedClassType && selectedAvailability
      ? `${form.time} ${selectedClassType.label} is selected at ${selectedClassType.priceLabel}. ${
          selectedAvailability.isFull
            ? "This class is full, so your request will join the waitlist."
            : `${selectedAvailability.spotsLeft} of ${selectedAvailability.capacity} spots are left.`
        }`
      : `${form.time} is selected. Choose ${
          formatInlineList(classTypesForSelectedTime.map((classType) => classType.label)) ||
          "a class type"
        } to see price and spots.`
    : "Select a time slot above to prefill the form, then choose an available class type here.";
  const userEmail = user?.primaryEmailAddress?.emailAddress ?? "";
  const userFullName =
    user?.fullName ||
    [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  const upcomingBookings = useMemo(
    () =>
      sortUpcomingBookings(
        myBookings.filter((booking) => !isTimeSlotPast(booking.date, booking.time, clock)),
      ),
    [clock, myBookings],
  );
  const oldBookings = useMemo(
    () =>
      sortOldBookings(
        myBookings.filter((booking) => isTimeSlotPast(booking.date, booking.time, clock)),
      ),
    [clock, myBookings],
  );

  function getAvailabilityFor(date: string, time: string, classTypeId: ClassTypeId) {
    return (
      availabilityByKey[buildAvailabilityKey(date, time, classTypeId)] ??
      createDefaultClassAvailability(classTypeId, classTypes)
    );
  }

  function getClassTypesForTime(time: string, date = form.date || activeDateIso) {
    const slot = getTimeSlotsForDate(date, weeklySchedule, timeSlots).find(
      (timeSlot) => timeSlot.time === time,
    );

    return slot ? getTimeSlotClassTypes(slot, classTypes) : classTypes;
  }

  function getSlotAvailability(slot: ClassSlot, date = activeDateIso) {
    return getTimeSlotClassTypes(slot, classTypes).map((classType) =>
      getAvailabilityFor(date, slot.time, classType.id),
    );
  }

  function isSlotUnavailable(slot: ClassSlot, date = activeDateIso) {
    return isTimeSlotPast(date, slot.time, clock);
  }

  function getRequestType(date: string, time: string, classTypeId: ClassTypeId | "") {
    if (!classTypeId) {
      return "booking";
    }

    return getAvailabilityFor(date, time, classTypeId).isFull ? "waitlist" : "booking";
  }

  function buildBookingAuthRedirectUrl(slot?: ClassSlot, classTypeId?: ClassTypeId) {
    const params = new URLSearchParams({ book: "1" });
    const date = activeDateIso || form.date || getStudioTodayIso(clock);

    params.set("date", date);

    if (slot?.time) {
      params.set("time", slot.time);
    }

    if (classTypeId) {
      params.set("session", classTypeId);
    }

    return `/booking?${params.toString()}#classes`;
  }

  function AuthBookingButton({
    authRedirectUrl,
    children,
    className,
    disabled = false,
    onClick,
    style,
    whileHover,
    whileTap,
    ariaLabel,
  }: {
    authRedirectUrl?: string;
    children: ReactNode;
    className: string;
    disabled?: boolean;
    onClick: () => void;
    style?: CSSProperties;
    whileHover?: MotionButtonProps["whileHover"];
    whileTap?: MotionButtonProps["whileTap"];
    ariaLabel?: string;
  }) {
    const isSignedInAndReady = isAuthLoaded && isSignedIn;
    const button = (
      <motion.button
        aria-label={ariaLabel}
        whileHover={whileHover}
        whileTap={whileTap}
        type="button"
        disabled={disabled}
        onClick={isSignedInAndReady ? onClick : undefined}
        className={className}
        style={style}
      >
        {children}
      </motion.button>
    );

    if (disabled || isSignedInAndReady) {
      return button;
    }

    return (
      <SignInButton
        mode="redirect"
        forceRedirectUrl={authRedirectUrl ?? buildBookingAuthRedirectUrl()}
        signUpForceRedirectUrl={authRedirectUrl ?? buildBookingAuthRedirectUrl()}
      >
        {button}
      </SignInButton>
    );
  }

  async function refreshMyBookings(signal?: AbortSignal) {
    if (!isSignedIn) {
      return;
    }

    setIsLoadingBookings(true);

    try {
      const response = await fetch("/api/bookings", {
        cache: "no-store",
        signal,
      });
      const payload = (await response.json()) as {
        bookings?: UserBookingSummary[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load your bookings.");
      }

      setMyBookings(payload.bookings ?? []);
      setBookingsMessage("");
    } catch (error) {
      if (signal?.aborted) {
        return;
      }

      setBookingsMessage(
        error instanceof Error ? error.message : "Unable to load your bookings.",
      );
    } finally {
      if (!signal?.aborted) {
        setIsLoadingBookings(false);
      }
    }
  }

  function mergeAvailability(response: AvailabilityResponse) {
    const nextAvailability = normalizeAvailability(response);

    setAvailabilityByKey((current) => ({
      ...current,
      ...nextAvailability,
    }));
  }

  useEffect(() => {
    const controller = new AbortController();

    async function loadStudioSettings() {
      try {
        const response = await fetch("/api/studio-settings", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as StudioSettingsResponse;

        if (!response.ok) {
          throw new Error(payload.error ?? "Studio settings unavailable.");
        }

        if (payload.settings?.classTypes?.length) {
          setClassTypes(payload.settings.classTypes);
        }

        if (payload.settings?.timeSlots?.length) {
          setTimeSlots(payload.settings.timeSlots);
        }

        if (payload.settings?.weeklySchedule?.length) {
          setWeeklySchedule(payload.settings.weeklySchedule);
        }

        if (payload.settings?.packages?.length) {
          setStudioPackages(payload.settings.packages);
        }
      } catch {
        if (controller.signal.aborted) {
          return;
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSettingsLoaded(true);
        }
      }
    }

    loadStudioSettings();

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const nextDates = buildDates(new Date());
    const nextDateIso = getStudioTodayIso();

    setDates((currentDates) => {
      const currentDateIso = currentDates[0] ? formatIsoDate(currentDates[0]) : "";
      return currentDateIso === nextDateIso ? currentDates : nextDates;
    });

    setForm((current) =>
      current.date === nextDateIso
        ? current
        : {
            ...current,
            date: nextDateIso,
          },
    );
  }, []);

  useEffect(() => {
    if (!isAuthLoaded || !isSignedIn) {
      setMyBookings([]);
      setBookingsMessage("");
      setIsLoadingBookings(false);
      return;
    }

    const controller = new AbortController();

    refreshMyBookings(controller.signal);

    return () => {
      controller.abort();
    };
  }, [isAuthLoaded, isSignedIn]);

  useEffect(() => {
    if (!userFullName && !userEmail) {
      return;
    }

    setForm((current) => ({
      ...current,
      name: current.name || userFullName,
      email: current.email || userEmail,
    }));
  }, [userFullName, userEmail]);

  useEffect(() => {
    if (
      !isSettingsLoaded ||
      !isAuthLoaded ||
      !isSignedIn ||
      typeof window === "undefined"
    ) {
      return;
    }

    const params = new URLSearchParams(window.location.search);

    if (params.get("book") !== "1") {
      return;
    }

    const requestedDate = params.get("date");
    const nextDate = isIsoDateParam(requestedDate)
      ? requestedDate
      : activeDateIso || getStudioTodayIso(clock);
    const requestedTime = params.get("time") ?? "";
    const requestedSlot = getTimeSlotsForDate(
      nextDate,
      weeklySchedule,
      timeSlots,
    ).find((slot) => slot.time === requestedTime);
    const nextTime = requestedSlot ? requestedTime : "";
    const requestedSession = params.get("session") ?? "";
    const requestedClassTypeId = getClassType(requestedSession, classTypes)?.id;
    const nextSession =
      requestedSlot &&
      requestedClassTypeId &&
      getTimeSlotClassTypes(requestedSlot, classTypes).some(
        (classType) => classType.id === requestedClassTypeId,
      )
        ? requestedClassTypeId
        : "";

    if (nextTime && isTimeSlotPast(nextDate, nextTime, clock)) {
      setStatusMessage("This class time is no longer available.");
    } else {
      setStatusMessage("");
      setForm((current) => ({
        ...current,
        date: nextDate,
        time: nextTime,
        session: nextSession,
        requestType: nextSession
          ? getRequestType(nextDate, nextTime, nextSession)
          : "booking",
        notes: nextTime
          ? resolveNextNotes(current.notes, nextTime, nextSession || undefined, classTypes)
          : current.notes,
      }));
      setIsModalOpen(true);
    }

    params.delete("book");
    params.delete("date");
    params.delete("time");
    params.delete("session");

    const nextSearch = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`,
    );
  }, [
    activeDateIso,
    classTypes,
    clock,
    isAuthLoaded,
    isSettingsLoaded,
    isSignedIn,
    timeSlots,
    weeklySchedule,
  ]);

  useEffect(() => {
    if (dates.length === 0) {
      return;
    }

    const controller = new AbortController();
    const requestedDates = dates.map(formatIsoDate).join(",");

    async function loadAvailability() {
      try {
        const response = await fetch(
          `/api/availability?dates=${encodeURIComponent(requestedDates)}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );
        const payload = (await response.json()) as AvailabilityResponse | { error?: string };

        if (!response.ok) {
          throw new Error("error" in payload ? payload.error : "Availability unavailable.");
        }

        mergeAvailability(payload as AvailabilityResponse);
        setAvailabilityMessage("");
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setAvailabilityMessage(
          error instanceof Error
            ? error.message
            : "Live availability is unavailable. Showing default capacity.",
        );
      }
    }

    loadAvailability();

    return () => {
      controller.abort();
    };
  }, [dates, timeSlots, weeklySchedule]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setClock(new Date());
    }, 30_000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!isModalOpen && !isBookingsModalOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsModalOpen(false);
        setIsBookingsModalOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isBookingsModalOpen, isModalOpen]);

  function handleDateSelect(index: number) {
    startTransition(() => {
      setSelectedDateIndex(index);
    });

    setStatusMessage("");
    setForm((current) => ({
      ...current,
      date: dates[index] ? formatIsoDate(dates[index]) : getStudioTodayIso(clock),
      time: "",
      session: "",
      requestType: "booking",
      notes: AUTO_NOTE_PATTERN.test(current.notes.trim()) ? "" : current.notes,
    }));
  }

  function openBookingForm() {
    if (!isSignedIn) {
      return;
    }

    setStatusMessage("");
    setForm((current) => ({
      ...current,
      date: current.date || (activeDate ? formatIsoDate(activeDate) : getStudioTodayIso(clock)),
      time: "",
      session: "",
      requestType: "booking",
      notes: AUTO_NOTE_PATTERN.test(current.notes.trim()) ? "" : current.notes,
    }));
    setIsModalOpen(true);
  }

  function openMyBookings() {
    if (!isSignedIn) {
      return;
    }

    setBookingsMessage("");
    setIsBookingsModalOpen(true);
    refreshMyBookings();
  }

  function prefillBookingForm(slot: ClassSlot) {
    const slotClassTypes = getTimeSlotClassTypes(slot, classTypes);

    prefillBookingFormForClass(
      slot,
      slotClassTypes.length === 1 ? slotClassTypes[0]?.id : undefined,
    );
  }

  function prefillBookingFormForClass(slot: ClassSlot, classTypeId?: ClassTypeId) {
    if (!isSignedIn) {
      return;
    }

    const nextDate = activeDate ? formatIsoDate(activeDate) : getStudioTodayIso(clock);
    const slotClassTypes = getTimeSlotClassTypes(slot, classTypes);

    if (isTimeSlotPast(nextDate, slot.time, clock)) {
      setStatusMessage("This class time is no longer available.");
      return;
    }

    if (
      classTypeId &&
      !slotClassTypes.some((classType) => classType.id === classTypeId)
    ) {
      setStatusMessage("Choose an available class type for this time.");
      return;
    }

    setStatusMessage("");
    setForm((current) => ({
      ...current,
      session: classTypeId ?? "",
      date: nextDate,
      time: slot.time,
      requestType: classTypeId ? getRequestType(nextDate, slot.time, classTypeId) : "booking",
      notes: resolveNextNotes(current.notes, slot.time, classTypeId, classTypes),
    }));
    setIsModalOpen(true);
  }

  function handleFieldChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) {
    const { name, value } = event.target;

    setForm((current) => {
      const nextForm = {
        ...current,
        [name]: value,
      } as BookingFormState;

      if (name === "session" || name === "date" || name === "time") {
        const nextTimeSlot = nextForm.time
          ? getTimeSlotsForDate(nextForm.date, weeklySchedule, timeSlots).find(
              (slot) => slot.time === nextForm.time,
            )
          : undefined;

        if (
          (name === "date" || name === "time") &&
          nextForm.time &&
          (!nextTimeSlot || isTimeSlotPast(nextForm.date, nextForm.time, clock))
        ) {
          nextForm.time = "";
          nextForm.session = "";
          nextForm.requestType = "booking";
          nextForm.notes = AUTO_NOTE_PATTERN.test(nextForm.notes.trim())
            ? ""
            : nextForm.notes;
          return nextForm;
        }

        if (nextForm.time && nextForm.session) {
          const isSessionAvailableForTime = getClassTypesForTime(
            nextForm.time,
            nextForm.date,
          ).some((classType) => classType.id === nextForm.session);

          if (!isSessionAvailableForTime) {
            nextForm.session = "";
          }
        }

        nextForm.requestType = getRequestType(
          nextForm.date,
          nextForm.time,
          nextForm.session,
        );
      }

      return nextForm;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setStatusMessage("");

    if (!isSignedIn) {
      setStatusMessage("Sign in to book a class.");
      return;
    }

    const submittedSlot = form.time
      ? getTimeSlotsForDate(form.date, weeklySchedule, timeSlots).find(
          (slot) => slot.time === form.time,
        )
      : undefined;

    if (!submittedSlot) {
      setStatusMessage("Choose an available class time for this day.");
      return;
    }

    if (isTimeSlotPast(form.date, form.time, new Date())) {
      setStatusMessage("This class time is no longer available.");
      return;
    }

    if (
      form.session &&
      !getClassTypesForTime(form.time, form.date).some(
        (classType) => classType.id === form.session,
      )
    ) {
      setStatusMessage("Choose an available class type for this time.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": createIdempotencyKey(),
        },
        body: JSON.stringify(form),
      });
      const payload = (await response.json()) as
        | {
            booking?: UserBookingSummary;
            availability?: AvailabilityResponse;
            notification?: BookingNotificationStatus;
            error?: string;
          }
        | undefined;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to create booking.");
      }

      if (payload?.availability) {
        mergeAvailability(payload.availability);
      }

      if (payload?.booking) {
        setMyBookings((current) => [
          payload.booking as UserBookingSummary,
          ...current.filter((booking) => booking.id !== payload.booking?.id),
        ].slice(0, 50));
      }

      const notificationNote =
        payload?.notification?.status === "sent"
          ? " Confirmation emails were sent."
          : payload?.notification?.status === "queued"
            ? " Confirmation emails are queued."
          : payload?.notification?.status === "skipped"
            ? " Booking saved; email notifications are not configured yet."
            : payload?.notification?.status === "failed"
              ? " Booking saved, but email notifications could not be sent."
              : "";

      setStatusMessage(
        `${
          payload?.booking?.status === "waitlist"
            ? `The ${payload.booking.sessionLabel ?? "class"} at ${
                payload.booking.time ?? form.time
              } is full, so this request was added to the waitlist.`
            : `Booking confirmed for ${payload?.booking?.sessionLabel ?? "your class"} at ${
                payload?.booking?.time ?? form.time
              } (${payload?.booking?.priceLabel ?? selectedClassType?.priceLabel ?? ""}).`
        }${notificationNote}`,
      );

      setForm(
        createEmptyForm(activeDate ? formatIsoDate(activeDate) : getStudioTodayIso(clock)),
      );
    } catch (error) {
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "Unable to create booking. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCancelBooking(booking: UserBookingSummary) {
    if (!isSignedIn || cancellingBookingId) {
      return;
    }

    const confirmed = window.confirm(
      `Cancel ${booking.sessionLabel} on ${formatBookingSummaryDate(
        booking.date,
      )} at ${booking.time}?`,
    );

    if (!confirmed) {
      return;
    }

    setCancellingBookingId(booking.id);
    setBookingsMessage("");

    try {
      const response = await fetch("/api/bookings", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ bookingId: booking.id }),
      });
      const payload = (await response.json()) as
        | {
            booking?: UserBookingSummary;
            bookings?: UserBookingSummary[];
            availability?: AvailabilityResponse;
            error?: string;
          }
        | undefined;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to cancel booking.");
      }

      if (payload?.availability) {
        mergeAvailability(payload.availability);
      }

      setMyBookings((current) =>
        payload?.bookings ??
        current.filter((currentBooking) => currentBooking.id !== booking.id),
      );
      setBookingsMessage("Class cancelled.");
    } catch (error) {
      setBookingsMessage(
        error instanceof Error
          ? error.message
          : "Unable to cancel booking. Please try again.",
      );
    } finally {
      setCancellingBookingId("");
    }
  }

  return (
    <main className="relative min-h-screen overflow-x-clip bg-[#10040b] text-[#f6e8e0]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_10%,rgba(244,200,190,0.12),transparent_18%),radial-gradient(circle_at_12%_12%,rgba(138,27,59,0.28),transparent_26%),linear-gradient(180deg,#090b12_0%,#10040b_34%,#17070f_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.12] mix-blend-soft-light [background-image:radial-gradient(rgba(255,255,255,0.18)_0.7px,transparent_0.7px),radial-gradient(rgba(255,255,255,0.12)_0.5px,transparent_0.5px)] [background-position:0_0,18px_18px] [background-size:24px_24px,18px_18px] sm:opacity-[0.18]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_0,rgba(255,255,255,0.03)_48%,transparent_54%),radial-gradient(circle_at_65%_35%,rgba(255,255,255,0.05),transparent_18%)] opacity-[0.38] mix-blend-soft-light sm:opacity-[0.55]" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 top-16 hidden h-[26rem] w-[26rem] rounded-full bg-[rgba(115,16,46,0.5)] opacity-20 blur-[70px] lg:block"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-32 top-56 hidden h-[26rem] w-[26rem] rounded-full bg-[rgba(240,217,209,0.12)] opacity-20 blur-[70px] lg:block"
      />

      <header className="sticky top-0 z-30 bg-[#10040b]/90 shadow-[0_12px_30px_rgba(0,0,0,0.18)] sm:bg-[#10040b]/68 sm:backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
          <a
            href="#schedule"
            className="-my-1 inline-flex min-h-[54px] items-center"
            aria-label="MUSE"
          >
            <Image
              src={museWordmark}
              alt="MUSE"
              priority
              className="h-12 w-auto object-contain sm:h-14"
            />
          </a>

          <div
            className="flex items-center gap-2 md:hidden"
            style={{ fontFamily: '"Manrope", sans-serif' }}
          >
            <AuthCircle onMyBookingsClick={openMyBookings} />
          </div>

          <nav
            aria-label="Booking navigation"
            className="hidden items-center gap-5 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-[#f6e8e0]/[0.72] lg:backdrop-blur-[14px] md:flex"
            style={{ fontFamily: '"Manrope", sans-serif' }}
          >
            <a className="transition hover:text-[#f6e8e0]" href="#why-muse">
              Why MUSE
            </a>
            <a className="transition hover:text-[#f6e8e0]" href="#packages">
              Packages
            </a>
            <a className="transition hover:text-[#f6e8e0]" href="#classes">
              Schedule
            </a>
            <span className="h-5 w-px bg-white/[0.12]" />
            <AuthCircle onMyBookingsClick={openMyBookings} />
          </nav>
        </div>
      </header>

      <div className="relative z-10 mx-auto flex max-w-7xl flex-col px-4 sm:px-6 lg:px-8">
        <motion.section
          id="schedule"
          className="scroll-mt-20 relative ml-[calc(50%_-_50vw)] w-screen overflow-hidden py-6 sm:scroll-mt-24 sm:py-10 lg:min-h-[calc(100vh-5.8rem)] lg:py-14"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-hidden"
          >
            <Image
              src={heroImage}
              alt=""
              fill
              priority
              quality={95}
              sizes="100vw"
              className="object-cover object-[55%_center] saturate-[1.12] contrast-[1.03] brightness-[1.08] sm:object-[center_42%] lg:object-[center_39%] lg:saturate-[1.16] lg:brightness-[1.1]"
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(12,4,8,0.76)_0%,rgba(12,4,8,0.42)_38%,rgba(12,4,8,0.12)_66%,rgba(12,4,8,0.18)_100%),linear-gradient(180deg,rgba(12,4,8,0.08)_0%,rgba(12,4,8,0.04)_46%,#10040b_100%)] sm:bg-[linear-gradient(90deg,rgba(12,4,8,0.64)_0%,rgba(12,4,8,0.34)_36%,rgba(12,4,8,0.08)_63%,rgba(12,4,8,0.14)_100%),linear-gradient(180deg,rgba(12,4,8,0.04)_0%,rgba(12,4,8,0.02)_42%,#10040b_100%)]" />
          </div>

          <motion.div
            variants={fadeUp}
            className="relative mx-auto flex min-h-[34rem] w-full max-w-7xl flex-col justify-end px-4 py-8 sm:min-h-[38rem] sm:px-6 sm:py-12 lg:min-h-[calc(100vh-8.5rem)] lg:px-8 lg:py-16"
          >
            <motion.div className="relative z-10 max-w-5xl">
              <motion.p
                variants={fadeUp}
                className="mb-4 text-xs font-semibold uppercase tracking-[0.34em] text-[#f1c9bf] sm:mb-5 sm:text-sm sm:tracking-[0.42em]"
                style={{ fontFamily: '"Manrope", sans-serif' }}
              >
                Now Open
              </motion.p>
              <motion.h1
                variants={fadeUp}
                className="max-w-5xl text-[3.75rem] leading-[0.84] text-[#f7e8e2] drop-shadow-[0_16px_34px_rgba(0,0,0,0.36)] sm:text-[5.8rem] lg:text-[8.25rem] xl:text-[9rem]"
                style={{ fontFamily: '"Cormorant Garamond", serif' }}
              >
                <span className="block">Welcome to</span>
                <span className="block text-[#f4c8be]">MUSE</span>
              </motion.h1>
              <motion.p
                variants={fadeUp}
                className="mt-4 text-[0.78rem] font-semibold uppercase tracking-[0.22rem] text-[#f1c9bf] sm:text-[0.95rem] sm:tracking-[0.38rem]"
                style={{ fontFamily: '"Manrope", sans-serif' }}
              >
                An elevated Pilates experience
              </motion.p>
              <motion.p
                variants={fadeUp}
                className="mt-5 max-w-2xl text-[0.95rem] leading-7 text-[#f6e8e0]/[0.88] drop-shadow-[0_10px_24px_rgba(0,0,0,0.36)] sm:mt-6 sm:text-lg sm:leading-8"
                style={{ fontFamily: '"Manrope", sans-serif' }}
              >
                Reformer & Mat classes with the full MUSE ritual: Pilates. Coffee.
                Matcha. Community.
              </motion.p>

              <motion.div variants={fadeUp} className="mt-8 flex flex-col gap-3 sm:flex-row">
                <motion.a
                  whileHover={shouldReduceMotion ? undefined : { y: -2, scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  href="#classes"
                  className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#f7e8e2,#dcb5aa)] px-6 py-3 text-sm font-semibold text-[#2a0711] shadow-[0_18px_40px_rgba(0,0,0,0.28)] transition hover:brightness-105"
                  style={{ fontFamily: '"Manrope", sans-serif' }}
                >
                  View Schedule
                </motion.a>
                <AuthBookingButton
                  whileHover={shouldReduceMotion ? undefined : { y: -2, scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={openBookingForm}
                  authRedirectUrl={buildBookingAuthRedirectUrl()}
                  className="inline-flex items-center justify-center rounded-full border border-white/[0.15] bg-white/[0.06] px-6 py-3 text-sm font-semibold text-[#f6e8e0] transition hover:border-white/[0.25] hover:bg-white/10 sm:backdrop-blur"
                  style={{ fontFamily: '"Manrope", sans-serif' }}
                >
                  Book Now
                </AuthBookingButton>
              </motion.div>

              <motion.div variants={fadeUp} className="mt-8 flex flex-wrap gap-3">
                {[
                  "Reformer & Mat classes",
                  "Pilates",
                  "Coffee",
                  "Matcha",
                  "Community",
                ].map((item) => (
                  <span
                    key={item}
                    className="rounded-full bg-black/20 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#f6e8e0]/[0.76] shadow-sm sm:px-4 sm:text-xs sm:tracking-[0.24em] sm:backdrop-blur"
                    style={{ fontFamily: '"Manrope", sans-serif' }}
                  >
                    {item}
                  </span>
                ))}
              </motion.div>
            </motion.div>
          </motion.div>
        </motion.section>

        <motion.section
          id="why-muse"
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.25 }}
          className="scroll-mt-24 py-8 sm:py-12"
        >
          <div className="grid gap-5 lg:grid-cols-[0.86fr_1.14fr] lg:items-stretch">
            <motion.div
              variants={fadeUp}
              className="relative overflow-hidden rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,232,223,0.16),transparent_28%),linear-gradient(145deg,rgba(102,13,39,0.8),rgba(20,5,11,0.92))] p-5 shadow-[0_22px_54px_rgba(0,0,0,0.32)] sm:rounded-[28px] sm:p-8 lg:p-10"
            >
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-[linear-gradient(180deg,transparent,rgba(255,255,255,0.04))]" />
              <p
                className="relative text-xs uppercase tracking-[0.3em] text-[#f1c9bf] sm:text-sm sm:tracking-[0.35em]"
                style={{ fontFamily: '"Manrope", sans-serif' }}
              >
                Why MUSE
              </p>
              <h2
                className="relative mt-4 max-w-xl text-[2.65rem] leading-[0.95] text-[#f7e8e2] sm:text-5xl lg:text-[4.65rem]"
                style={{ fontFamily: '"Cormorant Garamond", serif' }}
              >
                An elevated Pilates experience.
              </h2>
              <p
                className="relative mt-5 max-w-lg text-base leading-8 text-[#f6e8e0]/[0.78]"
                style={{ fontFamily: '"Manrope", sans-serif' }}
              >
                Reformer & Mat classes shaped around strength, softness, and the rituals
                that make a studio feel like a place to return to.
              </p>
              <p
                className="relative mt-8 text-[1.55rem] leading-tight text-[#f4c8be] sm:text-[2rem]"
                style={{ fontFamily: '"Cormorant Garamond", serif' }}
              >
                Pilates. Coffee. Matcha. Community.
              </p>
            </motion.div>

            <motion.div variants={stagger} className="grid gap-4 sm:grid-cols-3">
              {whyMuseHighlights.map((item) => (
                <motion.article
                  key={item.title}
                  variants={fadeUp}
                  whileHover={shouldReduceMotion ? undefined : { y: -6, scale: 1.01 }}
                  className="min-h-[15rem] rounded-[24px] border border-white/10 bg-white/[0.045] p-5 shadow-[0_22px_54px_rgba(0,0,0,0.28)] [background-image:linear-gradient(180deg,rgba(255,255,255,0.055),transparent_100%)] sm:min-h-[20rem] sm:rounded-[28px] sm:p-6"
                >
                  <p
                    className="text-xs uppercase tracking-[0.3em] text-[#f1c9bf]"
                    style={{ fontFamily: '"Manrope", sans-serif' }}
                  >
                    {item.kicker}
                  </p>
                  <h3
                    className="mt-5 text-[2.2rem] leading-[0.95] text-[#f7e8e2]"
                    style={{ fontFamily: '"Cormorant Garamond", serif' }}
                  >
                    {item.title}
                  </h3>
                  <p
                    className="mt-4 text-sm leading-7 text-[#f6e8e0]/[0.72]"
                    style={{ fontFamily: '"Manrope", sans-serif' }}
                  >
                    {item.copy}
                  </p>
                </motion.article>
              ))}
            </motion.div>
          </div>
        </motion.section>

        <motion.section
          id="packages"
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          className="scroll-mt-24 py-8 sm:py-12"
        >
          <motion.div variants={fadeUp} className="max-w-3xl">
            <p
              className="text-sm uppercase tracking-[0.35em] text-[#f1c9bf]"
              style={{ fontFamily: '"Manrope", sans-serif' }}
            >
              Packages
            </p>
            <h2
              className="mt-3 text-4xl text-[#f7e8e2] sm:text-5xl"
              style={{ fontFamily: '"Cormorant Garamond", serif' }}
            >
              Choose a class pack and enjoy an extra session on us.
            </h2>
            <p
              className="mt-4 max-w-2xl text-base leading-8 text-[#f6e8e0]/[0.72]"
              style={{ fontFamily: '"Manrope", sans-serif' }}
            >
              These offers keep the booking experience simple while giving returning
              clients a better rhythm for weekly practice.
            </p>
          </motion.div>

          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {studioPackages.map((pkg) => (
              <motion.article
                key={pkg.id}
                whileHover={shouldReduceMotion ? undefined : { y: -6, scale: 1.012 }}
                className={`rounded-[30px] border p-6 sm:p-8 ${
                  pkg.featured
                    ? "border-white/[0.12] bg-[radial-gradient(circle_at_top_right,rgba(255,231,223,0.18),transparent_24%),linear-gradient(145deg,rgba(106,18,45,0.96),rgba(28,6,13,0.98))] text-white shadow-[0_30px_80px_rgba(0,0,0,0.4)]"
                    : "border-white/[0.12] bg-[radial-gradient(circle_at_top_right,rgba(245,214,204,0.12),transparent_26%),linear-gradient(145deg,rgba(79,11,29,0.94),rgba(19,4,10,0.98))] text-[#f6e8e0] shadow-[0_30px_80px_rgba(0,0,0,0.4)]"
                }`}
              >
                <p
                  className={`text-xs uppercase tracking-[0.35em] ${
                    pkg.featured ? "text-[#f1c9bf]" : "text-[#f1c9bf]"
                  }`}
                  style={{ fontFamily: '"Manrope", sans-serif' }}
                >
                  {pkg.kicker}
                </p>
                <h3
                  className="mt-4 text-4xl sm:text-[2.8rem]"
                  style={{ fontFamily: '"Cormorant Garamond", serif' }}
                >
                  {pkg.title}
                </h3>
                <p
                  className="mt-2 text-base text-[#f7e8e2]"
                  style={{ fontFamily: '"Manrope", sans-serif' }}
                >
                  {pkg.bonus}
                </p>
                {pkg.priceLabel ? (
                  <p
                    className="mt-4 text-3xl text-[#f4c8be]"
                    style={{ fontFamily: '"Cormorant Garamond", serif' }}
                  >
                    {pkg.priceLabel}
                  </p>
                ) : null}

                <ul
                  className="mt-6 space-y-3 text-sm leading-7 text-[#f6e8e0]/[0.72]"
                  style={{ fontFamily: '"Manrope", sans-serif' }}
                >
                  {pkg.points.map((point) => (
                    <li key={point} className="flex gap-3">
                      <span className="mt-2 h-1.5 w-1.5 rounded-full bg-current" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </motion.article>
            ))}
          </div>
        </motion.section>

        <motion.section
          id="classes"
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          className="scroll-mt-24 pb-24 pt-8 sm:pb-32 sm:pt-12"
        >
          <motion.div variants={fadeUp} className="max-w-3xl">
            <p
              className="text-xs uppercase tracking-[0.3em] text-[#f1c9bf] sm:text-sm sm:tracking-[0.35em]"
              style={{ fontFamily: '"Manrope", sans-serif' }}
            >
              Daily Schedule
            </p>
            <h2
              className="mt-3 text-[2.2rem] leading-tight text-[#f7e8e2] sm:text-5xl"
              style={{ fontFamily: '"Cormorant Garamond", serif' }}
            >
              Choose a day, then reserve the class that fits your pace.
            </h2>
          </motion.div>

          <motion.div
            variants={fadeUp}
            className={`${cardShellClassName} mt-6 overflow-hidden p-3 sm:mt-8 sm:p-5`}
          >
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:gap-3 [&::-webkit-scrollbar]:hidden">
              {dates.map((date, index) => {
                const isActive = index === selectedDateIndex;

                return (
                  <motion.button
                    key={date.toISOString()}
                    type="button"
                    whileHover={shouldReduceMotion ? undefined : { y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleDateSelect(index)}
                    className={`min-w-[82px] rounded-[20px] border px-3 py-3 text-left transition sm:min-w-[108px] sm:rounded-[24px] sm:px-4 ${
                      isActive
                        ? "border-[rgba(255,232,223,0.2)] bg-[linear-gradient(135deg,#f7e8e2,#dcb5aa)] text-[#2a0711] shadow-[0_14px_28px_rgba(0,0,0,0.26)] sm:shadow-[0_18px_36px_rgba(0,0,0,0.3)]"
                        : "border-white/10 bg-white/5 text-[#f6e8e0]/[0.72] hover:border-white/20 hover:text-[#f6e8e0]"
                    }`}
                  >
                    <span
                      className={`block text-[10px] uppercase tracking-[0.2em] sm:text-[11px] sm:tracking-[0.28em] ${
                        isActive ? "text-[#5f2535]" : "text-[#f6e8e0]/[0.72]"
                      }`}
                      style={{ fontFamily: '"Manrope", sans-serif' }}
                    >
                      {formatDayLabel(date, index)}
                    </span>
                    <strong
                      className="mt-1.5 block text-[1.55rem] leading-none sm:mt-2 sm:text-2xl"
                      style={{ fontFamily: '"Cormorant Garamond", serif' }}
                    >
                      {String(date.getDate()).padStart(2, "0")}
                    </strong>
                    <span
                      className={`mt-1 block text-[10px] uppercase tracking-[0.2em] sm:text-xs sm:tracking-[0.28em] ${
                        isActive ? "text-[#5f2535]" : "text-[#f6e8e0]/[0.72]"
                      }`}
                      style={{ fontFamily: '"Manrope", sans-serif' }}
                    >
                      {formatMonthLabel(date)}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>

          <div className="mt-6 grid gap-5 sm:mt-8 sm:gap-6 xl:grid-cols-[0.92fr_1.25fr]">
            <motion.aside
              variants={fadeUp}
              className={`${cardShellClassName} hidden h-fit p-5 sm:p-8 md:block xl:sticky xl:top-28`}
            >
              <p
                className="text-xs uppercase tracking-[0.3em] text-[#f1c9bf] sm:text-sm sm:tracking-[0.35em]"
                style={{ fontFamily: '"Manrope", sans-serif' }}
              >
                Studio Details
              </p>
              <h3
                className="mt-3 text-[2.15rem] leading-tight text-[#f7e8e2] sm:text-4xl"
                style={{ fontFamily: '"Cormorant Garamond", serif' }}
              >
                {selectedDateLabel}
              </h3>
              <p
                className="mt-4 text-sm leading-7 text-[#f6e8e0]/[0.72] sm:text-base"
                style={{ fontFamily: '"Manrope", sans-serif' }}
              >
                {activeSchedule.summary}
              </p>
              {availabilityMessage ? (
                <p
                  className="mt-4 rounded-[18px] border border-white/10 bg-white/[0.04] p-4 text-sm leading-7 text-[#f1c9bf]"
                  style={{ fontFamily: '"Manrope", sans-serif' }}
                >
                  {availabilityMessage}
                </p>
              ) : null}

              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  { value: String(maxGuestsPerTime), label: "Per time" },
                  { value: "4h", label: "Cancel window" },
                  { value: `${activeTimeSlots.length}x`, label: "Daily slots" },
                ].map((item) => (
                  <motion.div
                    key={item.label}
                    whileHover={shouldReduceMotion ? undefined : { y: -3 }}
                    className="rounded-[18px] border border-white/10 bg-white/5 p-4 text-center sm:rounded-[22px]"
                  >
                    <div
                      className="text-3xl text-[#f4c8be]"
                      style={{ fontFamily: '"Cormorant Garamond", serif' }}
                    >
                      {item.value}
                    </div>
                    <div
                      className="mt-1 text-[11px] uppercase tracking-[0.18em] text-[#f6e8e0]/[0.72] sm:tracking-[0.24em]"
                      style={{ fontFamily: '"Manrope", sans-serif' }}
                    >
                      {item.label}
                    </div>
                  </motion.div>
                ))}
              </div>

              <ul
                className="mt-6 space-y-3 text-sm leading-7 text-[#f6e8e0]/[0.72]"
                style={{ fontFamily: '"Manrope", sans-serif' }}
              >
                <li className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#f1c9bf]" />
                  <span>Bookings are confirmed by email after request.</span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#f1c9bf]" />
                  <span>Cancellations are accepted up to 4 hours before class.</span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#f1c9bf]" />
                  <span>{classCapacitySummary}.</span>
                </li>
              </ul>
            </motion.aside>

            <motion.div variants={fadeUp} className="space-y-4">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeDate?.toISOString() ?? "today"}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -18 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="space-y-4"
                >
                  {activeSchedule.classes.length === 0 ? (
                    <div className={`${cardShellClassName} p-5 sm:p-6`}>
                      <p
                        className="text-sm leading-7 text-[#f6e8e0]/[0.72]"
                        style={{ fontFamily: '"Manrope", sans-serif' }}
                      >
                        No classes are scheduled for this day.
                      </p>
                    </div>
                  ) : null}

                  {activeSchedule.classes.map((slot) => {
                    const slotAvailability = getSlotAvailability(slot);
                    const slotUnavailable = isSlotUnavailable(slot);

                    return (
                      <motion.article
                        key={`${selectedDateIndex}-${slot.time}`}
                        whileHover={
                          shouldReduceMotion || slotUnavailable
                            ? undefined
                            : { y: -6, scale: 1.01 }
                        }
                        className={`${cardShellClassName} p-4 sm:p-6`}
                      >
                        <div>
                          <div className="max-w-2xl">
                            <p
                              className="text-[11px] uppercase tracking-[0.24em] text-[#f1c9bf] sm:text-xs sm:tracking-[0.3em]"
                              style={{ fontFamily: '"Manrope", sans-serif' }}
                            >
                              {slot.time} · {slot.duration}
                            </p>
                            <h3
                              className="mt-2 text-[1.85rem] leading-tight text-[#f7e8e2] sm:text-[2.15rem]"
                              style={{ fontFamily: '"Cormorant Garamond", serif' }}
                            >
                              {slot.title}
                            </h3>
                          </div>
                        </div>

                        <div className="mt-5 overflow-hidden rounded-[24px] border border-white/[0.1]">
                          {slotAvailability.map((classAvailability, index) => (
                            <div
                              key={classAvailability.id}
                              className={`flex flex-col gap-4 bg-white/[0.035] px-4 py-4 sm:flex-row sm:items-center sm:justify-between ${
                                index > 0 ? "border-t border-white/[0.1]" : ""
                              }`}
                            >
                              <div>
                                <p
                                  className="text-sm font-semibold text-[#f7e8e2]"
                                  style={{ fontFamily: '"Manrope", sans-serif' }}
                                >
                                  {classAvailability.label} · {classAvailability.priceLabel}
                                </p>
                                <p
                                  className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#f6e8e0]/[0.62] sm:text-xs sm:tracking-[0.22em]"
                                  style={{ fontFamily: '"Manrope", sans-serif' }}
                                >
                                  {slotUnavailable
                                    ? "Unavailable"
                                    : classAvailability.isFull
                                    ? `Full · ${classAvailability.waitlistCount} waiting`
                                    : `${classAvailability.spotsLeft} of ${classAvailability.capacity} spots left`}
                                </p>
                              </div>

                              <AuthBookingButton
                                whileTap={{ scale: 0.98 }}
                                disabled={slotUnavailable}
                                onClick={() =>
                                  prefillBookingFormForClass(slot, classAvailability.id)
                                }
                                authRedirectUrl={buildBookingAuthRedirectUrl(
                                  slot,
                                  classAvailability.id,
                                )}
                                className={`inline-flex min-h-[44px] items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition sm:min-w-[112px] ${
                                  slotUnavailable
                                    ? "cursor-not-allowed border border-white/[0.1] bg-white/[0.04] text-[#f6e8e0]/[0.42]"
                                    : classAvailability.isFull
                                    ? "border border-white/[0.12] bg-transparent text-[#f6e8e0]/[0.74] hover:bg-white/[0.08]"
                                    : "border border-white/[0.18] bg-transparent text-[#f6e8e0] hover:border-transparent hover:bg-[linear-gradient(135deg,#f7e8e2,#dcb5aa)] hover:text-[#2a0711]"
                                }`}
                                style={{ fontFamily: '"Manrope", sans-serif' }}
                              >
                                {slotUnavailable
                                  ? "Unavailable"
                                  : classAvailability.isFull
                                    ? "Waitlist"
                                    : "Book"}
                              </AuthBookingButton>
                            </div>
                          ))}
                        </div>
                      </motion.article>
                    );
                  })}
                </motion.div>
              </AnimatePresence>
            </motion.div>
          </div>
        </motion.section>
      </div>

      <footer className="relative z-10 border-t border-white/10 px-4 py-8 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[#f6e8e0]/60 sm:px-6">
        <p style={{ fontFamily: '"Manrope", sans-serif' }}>
          MUSE™ © 2026. All rights reserved.
        </p>
      </footer>

      <AnimatePresence>
        {isModalOpen ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.button
              type="button"
              aria-label="Close booking form"
              className="absolute inset-0 bg-[rgba(8,4,8,0.76)] backdrop-blur-sm [background-image:radial-gradient(circle_at_20%_14%,rgba(255,231,223,0.08),transparent_16%)] sm:backdrop-blur-[10px]"
              onClick={() => setIsModalOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />

            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="booking-modal-title"
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="relative z-10 max-h-[94svh] w-full max-w-5xl overflow-y-auto overscroll-contain rounded-t-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_24%),linear-gradient(145deg,rgba(84,10,31,0.96),rgba(15,4,10,0.98))] shadow-[0_28px_90px_rgba(0,0,0,0.42)] sm:max-h-[92vh] sm:rounded-[34px]"
            >
              <div className="grid gap-0 lg:grid-cols-[0.92fr_1.08fr]">
                <div className="relative overflow-hidden px-5 py-5 text-white sm:px-8 sm:py-10">
                  <div className="pointer-events-none absolute inset-0 bg-white/[0.03] [background-image:linear-gradient(180deg,rgba(255,255,255,0.05),transparent_100%)]" />

                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="relative z-10 inline-flex rounded-full border border-white/[0.14] bg-[rgba(11,5,9,0.58)] px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-[#f6e8e0] transition hover:border-white/[0.24] hover:bg-white/[0.08] sm:text-xs sm:tracking-[0.22em]"
                    style={{ fontFamily: '"Manrope", sans-serif' }}
                  >
                    Close
                  </button>

                  <div className="relative z-10 mt-5 max-w-md sm:mt-10">
                    <p
                      className="text-[11px] uppercase tracking-[0.26em] text-[#d4b493] sm:text-xs sm:tracking-[0.35em]"
                      style={{ fontFamily: '"Manrope", sans-serif' }}
                    >
                      Reserve Your Spot
                    </p>
                    <h2
                      id="booking-modal-title"
                      className="mt-3 text-[2.15rem] leading-tight sm:mt-4 sm:text-5xl"
                      style={{ fontFamily: '"Cormorant Garamond", serif' }}
                    >
                      Send your booking request.
                    </h2>
                    <p
                      className="mt-4 hidden text-sm leading-7 text-[#f6e8e0]/[0.72] sm:block sm:text-base"
                      style={{ fontFamily: '"Manrope", sans-serif' }}
                    >
                      Pick a time slot from the schedule or choose it manually here. Then
                      select an available class type and submit the booking request.
                    </p>
                    <p
                      className="mt-4 rounded-[20px] border border-white/10 bg-white/5 p-4 text-sm leading-6 text-[#f6e8e0]/[0.72] sm:mt-5 sm:rounded-[22px] sm:leading-7"
                      style={{ fontFamily: '"Manrope", sans-serif' }}
                    >
                      {bookingSelectionNote}
                    </p>

                    <ul
                      className="mt-6 hidden space-y-3 text-sm leading-7 text-[#f6e8e0]/[0.72] sm:block"
                      style={{ fontFamily: '"Manrope", sans-serif' }}
                    >
                      <li className="flex gap-3">
                        <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#d4b493]" />
                        <span>First visit? Arrive 10 minutes before class starts.</span>
                      </li>
                      <li className="flex gap-3">
                        <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#d4b493]" />
                        <span>Need a different time? Add it in the notes field.</span>
                      </li>
                      <li className="flex gap-3">
                        <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#d4b493]" />
                        <span>Current class times are {classTimeSummary}.</span>
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="border-t border-white/10 px-5 py-5 sm:px-8 sm:py-10 lg:border-l lg:border-t-0 lg:border-white/10">
                  <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6">
                    <input type="hidden" name="requestType" value={form.requestType} />

                    <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
                      <label
                        className="block text-sm font-medium text-[#f6e8e0]/[0.66]"
                        style={{ fontFamily: '"Manrope", sans-serif' }}
                      >
                        Full name
                        <input
                          required
                          name="name"
                          type="text"
                          value={form.name}
                          onChange={handleFieldChange}
                          placeholder="Your full name"
                          className={fieldClassName}
                        />
                      </label>

                      <label
                        className="block text-sm font-medium text-[#f6e8e0]/[0.66]"
                        style={{ fontFamily: '"Manrope", sans-serif' }}
                      >
                        Email address
                        <input
                          required
                          readOnly
                          name="email"
                          type="email"
                          value={form.email}
                          onChange={handleFieldChange}
                          placeholder="name@example.com"
                          className={fieldClassName}
                        />
                      </label>

                      <label
                        className="block text-sm font-medium text-[#f6e8e0]/[0.66]"
                        style={{ fontFamily: '"Manrope", sans-serif' }}
                      >
                        Phone number
                        <input
                          name="phone"
                          type="tel"
                          value={form.phone}
                          onChange={handleFieldChange}
                          placeholder="Your phone number"
                          className={fieldClassName}
                        />
                      </label>

                      <label
                        className="block text-sm font-medium text-[#f6e8e0]/[0.66]"
                        style={{ fontFamily: '"Manrope", sans-serif' }}
                      >
                        Class type
                        <select
                          required
                          name="session"
                          value={form.session}
                          onChange={handleFieldChange}
                          className={fieldClassName}
                        >
                          <option value="">Choose a class type</option>
                          {classTypesForSelectedTime.map((classType) => (
                            <option key={classType.id} value={classType.id}>
                              {classType.label} · {classType.priceLabel}
                            </option>
                          ))}
                        </select>
                        {selectedAvailability ? (
                          <span
                            className="mt-2 block text-xs font-semibold uppercase tracking-[0.2em] text-[#f1c9bf]"
                            style={{ fontFamily: '"Manrope", sans-serif' }}
                          >
                            {selectedTimeUnavailable
                              ? "Unavailable"
                              : selectedAvailability.isFull
                              ? "Full · waitlist available"
                              : `${selectedAvailability.spotsLeft} of ${selectedAvailability.capacity} spots left`}
                          </span>
                        ) : null}
                      </label>

                      <label
                        className="block text-sm font-medium text-[#f6e8e0]/[0.66]"
                        style={{ fontFamily: '"Manrope", sans-serif' }}
                      >
                        Preferred date
                        <input
                          required
                          name="date"
                          type="date"
                          min={getStudioTodayIso(clock)}
                          value={form.date}
                          onChange={handleFieldChange}
                          className={fieldClassName}
                        />
                      </label>

                      <label
                        className="block text-sm font-medium text-[#f6e8e0]/[0.66]"
                        style={{ fontFamily: '"Manrope", sans-serif' }}
                      >
                        Preferred time
                        <select
                          required
                          name="time"
                          value={form.time}
                          onChange={handleFieldChange}
                          className={fieldClassName}
                        >
                          <option value="">Choose a time</option>
                          {formTimeSlots.map((slot) => {
                            const optionUnavailable = form.date
                              ? isTimeSlotPast(form.date, slot.time, clock)
                              : false;

                            return (
                              <option
                                key={slot.time}
                                value={slot.time}
                                disabled={optionUnavailable}
                              >
                                {slot.time}
                                {optionUnavailable ? " - unavailable" : ""}
                              </option>
                            );
                          })}
                        </select>
                      </label>

                      <label
                        className="block text-sm font-medium text-[#f6e8e0]/[0.66] sm:col-span-2"
                        style={{ fontFamily: '"Manrope", sans-serif' }}
                      >
                        Notes
                        <textarea
                          name="notes"
                          value={form.notes}
                          onChange={handleFieldChange}
                          placeholder="Any injuries, preferences, or scheduling notes?"
                          rows={4}
                          className={`${fieldClassName} resize-none`}
                        />
                      </label>
                    </div>

                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <motion.button
                        whileTap={{ scale: 0.98 }}
                        type="submit"
                        disabled={isSubmitting || selectedTimeUnavailable}
                        className="inline-flex min-h-[52px] w-full items-center justify-center rounded-full bg-[linear-gradient(135deg,#f7e8e2,#dcb5aa)] px-6 py-3 text-sm font-semibold text-[#2a0711] shadow-[0_18px_36px_rgba(0,0,0,0.28)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                        style={{ fontFamily: '"Manrope", sans-serif' }}
                      >
                        {selectedTimeUnavailable
                          ? "Unavailable"
                          : isSubmitting
                          ? "Sending..."
                          : form.requestType === "waitlist"
                            ? "Join Waitlist"
                            : "Send Booking Request"}
                      </motion.button>

                      <p
                        className="text-sm leading-7 text-[#f6e8e0]/[0.72]"
                        style={{ fontFamily: '"Manrope", sans-serif' }}
                      >
                        We will confirm availability shortly by email.
                      </p>
                    </div>

                    {statusMessage ? (
                      <p
                        aria-live="polite"
                        className="text-sm leading-7 text-[#f1c9bf]"
                        style={{ fontFamily: '"Manrope", sans-serif' }}
                      >
                        {statusMessage}
                      </p>
                    ) : null}
                  </form>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isBookingsModalOpen ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.button
              type="button"
              aria-label="Close my bookings"
              className="absolute inset-0 bg-[rgba(8,4,8,0.78)] backdrop-blur-sm"
              onClick={() => setIsBookingsModalOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />

            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="my-bookings-modal-title"
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="relative z-10 max-h-[94svh] w-full max-w-4xl overflow-y-auto overscroll-contain rounded-t-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_24%),linear-gradient(145deg,rgba(58,9,25,0.98),rgba(15,4,10,0.99))] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.42)] sm:max-h-[90vh] sm:rounded-[34px] sm:p-8"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p
                    className="text-xs uppercase tracking-[0.3em] text-[#f1c9bf] sm:text-sm sm:tracking-[0.35em]"
                    style={{ fontFamily: '"Manrope", sans-serif' }}
                  >
                    My Bookings
                  </p>
                  <h2
                    id="my-bookings-modal-title"
                    className="mt-3 text-[2.1rem] leading-tight text-[#f7e8e2] sm:text-4xl"
                    style={{ fontFamily: '"Cormorant Garamond", serif' }}
                  >
                    Your reservations.
                  </h2>
                  {userEmail ? (
                    <p
                      className="mt-2 text-sm text-[#f6e8e0]/[0.62]"
                      style={{ fontFamily: '"Manrope", sans-serif' }}
                    >
                      {userEmail}
                    </p>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => setIsBookingsModalOpen(false)}
                  className="inline-flex min-h-[40px] items-center justify-center rounded-full border border-white/[0.14] bg-white/[0.05] px-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f6e8e0] transition hover:border-white/[0.24] hover:bg-white/[0.08] sm:text-xs"
                  style={{ fontFamily: '"Manrope", sans-serif' }}
                >
                  Close
                </button>
              </div>

              {isLoadingBookings ? (
                <p
                  className="mt-6 text-sm leading-7 text-[#f6e8e0]/[0.72]"
                  style={{ fontFamily: '"Manrope", sans-serif' }}
                >
                  Loading bookings...
                </p>
              ) : myBookings.length > 0 ? (
                <div className="mt-6 space-y-7">
                  {upcomingBookings.length > 0 ? (
                    <section>
                      <div className="flex items-center justify-between gap-4">
                        <h3
                          className="text-sm font-semibold uppercase tracking-[0.22em] text-[#f1c9bf]"
                          style={{ fontFamily: '"Manrope", sans-serif' }}
                        >
                          Upcoming
                        </h3>
                        <span
                          className="text-xs text-[#f6e8e0]/[0.58]"
                          style={{ fontFamily: '"Manrope", sans-serif' }}
                        >
                          {upcomingBookings.length}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {upcomingBookings.map((booking) => {
                          const isCancelling = cancellingBookingId === booking.id;

                          return (
                            <article
                              key={booking.id}
                              className="rounded-[22px] border border-white/10 bg-white/[0.045] p-4 sm:p-5"
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <p
                                    className="text-sm font-semibold text-[#f7e8e2]"
                                    style={{ fontFamily: '"Manrope", sans-serif' }}
                                  >
                                    {booking.sessionLabel} · {booking.priceLabel}
                                  </p>
                                  <p
                                    className="mt-2 text-2xl leading-tight text-[#f4c8be]"
                                    style={{ fontFamily: '"Cormorant Garamond", serif' }}
                                  >
                                    {formatBookingSummaryDate(booking.date)}
                                  </p>
                                  <p
                                    className="mt-1 text-sm text-[#f6e8e0]/[0.72]"
                                    style={{ fontFamily: '"Manrope", sans-serif' }}
                                  >
                                    {booking.time}
                                  </p>
                                </div>
                                <span
                                  className="rounded-full border border-white/10 bg-white/[0.055] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f1c9bf]"
                                  style={{ fontFamily: '"Manrope", sans-serif' }}
                                >
                                  {booking.status === "waitlist" ? "Waitlist" : "Confirmed"}
                                </span>
                              </div>

                              <div
                                className="mt-4 flex flex-wrap gap-2"
                                style={{ fontFamily: '"Manrope", sans-serif' }}
                              >
                                <a
                                  href={buildGoogleCalendarUrl(booking)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex min-h-[36px] items-center justify-center rounded-full border border-white/[0.16] px-3 text-xs font-semibold text-[#f6e8e0] transition hover:border-white/[0.26] hover:bg-white/[0.08]"
                                >
                                  Google Calendar
                                </a>
                                <a
                                  href={buildCalendarDownloadUrl(booking)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex min-h-[36px] items-center justify-center rounded-full border border-white/[0.16] px-3 text-xs font-semibold text-[#f6e8e0] transition hover:border-white/[0.26] hover:bg-white/[0.08]"
                                >
                                  Phone Calendar
                                </a>
                                <button
                                  type="button"
                                  disabled={Boolean(cancellingBookingId)}
                                  onClick={() => handleCancelBooking(booking)}
                                  className="inline-flex min-h-[36px] items-center justify-center rounded-full border border-[#f1c9bf]/[0.35] px-3 text-xs font-semibold text-[#f1c9bf] transition hover:border-[#f1c9bf]/[0.6] hover:bg-[#f1c9bf]/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {isCancelling ? "Cancelling..." : "Cancel class"}
                                </button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  ) : null}

                  {oldBookings.length > 0 ? (
                    <section>
                      <div className="flex items-center justify-between gap-4">
                        <h3
                          className="text-sm font-semibold uppercase tracking-[0.22em] text-[#f6e8e0]/[0.58]"
                          style={{ fontFamily: '"Manrope", sans-serif' }}
                        >
                          Old bookings
                        </h3>
                        <span
                          className="text-xs text-[#f6e8e0]/[0.45]"
                          style={{ fontFamily: '"Manrope", sans-serif' }}
                        >
                          {oldBookings.length}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {oldBookings.map((booking) => (
                          <article
                            key={booking.id}
                            className="rounded-[22px] border border-white/[0.07] bg-black/20 p-4 sm:p-5"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <p
                                  className="text-sm font-semibold text-[#f6e8e0]/[0.72]"
                                  style={{ fontFamily: '"Manrope", sans-serif' }}
                                >
                                  {booking.sessionLabel}
                                </p>
                                <p
                                  className="mt-2 text-2xl leading-tight text-[#f6e8e0]/[0.72]"
                                  style={{ fontFamily: '"Cormorant Garamond", serif' }}
                                >
                                  {formatBookingSummaryDate(booking.date)}
                                </p>
                                <p
                                  className="mt-1 text-sm text-[#f6e8e0]/[0.5]"
                                  style={{ fontFamily: '"Manrope", sans-serif' }}
                                >
                                  {booking.time}
                                </p>
                              </div>
                              <div className="flex flex-col items-end gap-2">
                                <span
                                  className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f6e8e0]/[0.55]"
                                  style={{ fontFamily: '"Manrope", sans-serif' }}
                                >
                                  Past
                                </span>
                                <span
                                  className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f6e8e0]/[0.38]"
                                  style={{ fontFamily: '"Manrope", sans-serif' }}
                                >
                                  {booking.status === "waitlist" ? "Waitlist" : "Confirmed"}
                                </span>
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </div>
              ) : (
                <p
                  className="mt-6 text-sm leading-7 text-[#f6e8e0]/[0.72]"
                  style={{ fontFamily: '"Manrope", sans-serif' }}
                >
                  No bookings yet.
                </p>
              )}

              {bookingsMessage ? (
                <p
                  aria-live="polite"
                  className="mt-5 text-sm leading-7 text-[#f1c9bf]"
                  style={{ fontFamily: '"Manrope", sans-serif' }}
                >
                  {bookingsMessage}
                </p>
              ) : null}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}
