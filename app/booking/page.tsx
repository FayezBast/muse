"use client";

import Image from "next/image";
import {
  type ChangeEvent,
  type FormEvent,
  startTransition,
  useEffect,
  useState,
} from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import heroImage from "../../assets/hero-pilates.jpg";
import {
  CLASS_TYPES,
  MAX_GUESTS_PER_TIME,
  TIME_SLOTS,
  getClassType,
  type ClassTypeId,
} from "../lib/booking-config";

type ClassSlot = {
  time: string;
  title: string;
  subtitle: string;
  duration: string;
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

const AUTO_NOTE_PATTERN = /^Requested for the .* class slot\.$/;

const packages = [
  {
    kicker: "Package One",
    title: "4 Classes",
    bonus: "5th class free",
    points: [
      "Pay for 4 classes and receive 1 extra class free.",
      "Ideal if you want a shorter commitment to start.",
    ],
  },
  {
    kicker: "Package Two",
    title: "8 Classes",
    bonus: "9th class free",
    points: [
      "Pay for 8 classes and receive 1 extra class free.",
      "Best for guests planning a more consistent routine.",
    ],
    featured: true,
  },
];

const scheduleMatrix: DaySchedule[] = [
  createDailySchedule(),
  createDailySchedule(),
  createDailySchedule(),
  createDailySchedule(),
  createDailySchedule(),
  createDailySchedule(),
  createDailySchedule(),
];

const easeOutQuart = [0.22, 1, 0.36, 1] as const;

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, ease: easeOutQuart },
  },
};

const stagger: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const slowFloatTransition = {
  duration: 10,
  repeat: Infinity,
  ease: "easeInOut" as const,
};

const slowDriftTransition = {
  duration: 18,
  repeat: Infinity,
  ease: "easeInOut" as const,
};

const fieldClassName =
  "mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[#f6e8e0] shadow-none outline-none transition placeholder:text-[#f6e8e0]/[0.35] focus:border-[#f1c9bf] focus:ring-4 focus:ring-[#f1c9bf]/[0.15]";

const cardShellClassName =
  "rounded-[28px] border border-white/10 bg-white/[0.03] shadow-[0_30px_80px_rgba(0,0,0,0.4)] backdrop-blur-[18px] [background-image:linear-gradient(180deg,rgba(255,255,255,0.05),transparent_100%)]";

function createDailySchedule(): DaySchedule {
  return {
    summary:
      "Two daily class slots are available at 10:30 AM and 6:00 PM. Reformer has 4 spots and Mat Pilates has 6 spots.",
    classes: TIME_SLOTS.map((slot) => ({
      time: slot.time,
      title: slot.title,
      subtitle: slot.subtitle,
      duration: slot.duration,
    })),
  };
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

function formatIsoDate(date: Date) {
  const adjusted = new Date(date);
  adjusted.setMinutes(adjusted.getMinutes() - adjusted.getTimezoneOffset());
  return adjusted.toISOString().split("T")[0] ?? "";
}

function buildDates(baseDate: Date, count = 7) {
  const anchor = new Date(baseDate);
  anchor.setHours(12, 0, 0, 0);

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(anchor);
    date.setDate(anchor.getDate() + index);
    return date;
  });
}

function buildAvailabilityKey(date: string, time: string, classTypeId: ClassTypeId) {
  return `${date}|${time}|${classTypeId}`;
}

function createDefaultClassAvailability(classTypeId: ClassTypeId): ClassAvailability {
  const classType = getClassType(classTypeId) ?? CLASS_TYPES[0];

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

function resolveNextNotes(currentNotes: string, slotTime: string, classTypeId?: ClassTypeId) {
  const trimmed = currentNotes.trim();
  const classLabel = classTypeId ? getClassType(classTypeId)?.label : undefined;

  if (!trimmed || AUTO_NOTE_PATTERN.test(trimmed)) {
    return `Requested for the ${slotTime}${classLabel ? ` ${classLabel}` : ""} class slot.`;
  }

  return currentNotes;
}

export default function BookingPage() {
  const shouldReduceMotion = useReducedMotion();
  const [dates, setDates] = useState<Date[]>([]);
  const [selectedDateIndex, setSelectedDateIndex] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [availabilityMessage, setAvailabilityMessage] = useState("");
  const [availabilityByKey, setAvailabilityByKey] = useState<Record<string, ClassAvailability>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<BookingFormState>(createEmptyForm());

  const activeDate = dates[selectedDateIndex];
  const activeDateIso = activeDate ? formatIsoDate(activeDate) : "";
  const activeSchedule = scheduleMatrix[selectedDateIndex] ?? scheduleMatrix[0];
  const selectedClassType = form.session ? getClassType(form.session) : undefined;
  const selectedAvailability =
    form.date && form.time && form.session
      ? availabilityByKey[buildAvailabilityKey(form.date, form.time, form.session)] ??
        createDefaultClassAvailability(form.session)
      : undefined;
  const selectedDateLabel = activeDate
    ? selectedDateIndex === 0
      ? "Today at MUSE"
      : formatLongDate(activeDate)
    : "Today at MUSE";
  const bookingSelectionNote = form.time
    ? selectedClassType && selectedAvailability
      ? `${form.time} ${selectedClassType.label} is selected at ${selectedClassType.priceLabel}. ${
          selectedAvailability.isFull
            ? "This class is full, so your request will join the waitlist."
            : `${selectedAvailability.spotsLeft} of ${selectedAvailability.capacity} spots are left.`
        }`
      : `${form.time} is selected. Choose Reformer or Mat Pilates to see price and spots.`
    : "Select a time slot above to prefill the form, then choose Reformer or Mat Pilates here.";
  const ambientFloat = shouldReduceMotion ? undefined : { y: [0, -10, 0] };
  const ambientDrift = shouldReduceMotion
    ? undefined
    : { scale: [1.03, 1.07, 1.03], x: [0, 12, 0], y: [0, -8, 0] };
  const orbLeftMotion = shouldReduceMotion
    ? undefined
    : { x: [0, 18, 0], y: [0, -14, 0], scale: [1, 1.06, 1] };
  const orbRightMotion = shouldReduceMotion
    ? undefined
    : { x: [0, -16, 0], y: [0, 12, 0], scale: [1, 0.95, 1] };

  function getAvailabilityFor(date: string, time: string, classTypeId: ClassTypeId) {
    return (
      availabilityByKey[buildAvailabilityKey(date, time, classTypeId)] ??
      createDefaultClassAvailability(classTypeId)
    );
  }

  function getSlotAvailability(slot: ClassSlot, date = activeDateIso) {
    return CLASS_TYPES.map((classType) => getAvailabilityFor(date, slot.time, classType.id));
  }

  function getRequestType(date: string, time: string, classTypeId: ClassTypeId | "") {
    if (!classTypeId) {
      return "booking";
    }

    return getAvailabilityFor(date, time, classTypeId).isFull ? "waitlist" : "booking";
  }

  function mergeAvailability(response: AvailabilityResponse) {
    const nextAvailability = normalizeAvailability(response);

    setAvailabilityByKey((current) => ({
      ...current,
      ...nextAvailability,
    }));
  }

  useEffect(() => {
    const nextDates = buildDates(new Date());
    setDates(nextDates);
    setForm(createEmptyForm(formatIsoDate(nextDates[0] ?? new Date())));
  }, []);

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
  }, [dates]);

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsModalOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isModalOpen]);

  function handleDateSelect(index: number) {
    startTransition(() => {
      setSelectedDateIndex(index);
    });

    setStatusMessage("");
    setForm((current) => ({
      ...current,
      date: formatIsoDate(dates[index] ?? new Date()),
      time: "",
      session: "",
      requestType: "booking",
      notes: AUTO_NOTE_PATTERN.test(current.notes.trim()) ? "" : current.notes,
    }));
  }

  function openBookingForm() {
    setStatusMessage("");
    setForm((current) => ({
      ...current,
      date: current.date || formatIsoDate(activeDate ?? new Date()),
      time: "",
      session: "",
      requestType: "booking",
      notes: AUTO_NOTE_PATTERN.test(current.notes.trim()) ? "" : current.notes,
    }));
    setIsModalOpen(true);
  }

  function prefillBookingForm(slot: ClassSlot) {
    prefillBookingFormForClass(slot);
  }

  function prefillBookingFormForClass(slot: ClassSlot, classTypeId?: ClassTypeId) {
    const nextDate = formatIsoDate(activeDate ?? new Date());

    setStatusMessage("");
    setForm((current) => ({
      ...current,
      session: classTypeId ?? "",
      date: nextDate,
      time: slot.time,
      requestType: classTypeId ? getRequestType(nextDate, slot.time, classTypeId) : "booking",
      notes: resolveNextNotes(current.notes, slot.time, classTypeId),
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

    setIsSubmitting(true);
    setStatusMessage("");

    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });
      const payload = (await response.json()) as
        | {
            booking?: {
              status?: "confirmed" | "waitlist";
              sessionLabel?: string;
              time?: string;
              priceLabel?: string;
            };
            availability?: AvailabilityResponse;
            error?: string;
          }
        | undefined;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to create booking.");
      }

      if (payload?.availability) {
        mergeAvailability(payload.availability);
      }

      setStatusMessage(
        payload?.booking?.status === "waitlist"
          ? `The ${payload.booking.sessionLabel ?? "class"} at ${
              payload.booking.time ?? form.time
            } is full, so this request was added to the waitlist.`
          : `Booking saved for ${payload?.booking?.sessionLabel ?? "your class"} at ${
              payload?.booking?.time ?? form.time
            } (${payload?.booking?.priceLabel ?? selectedClassType?.priceLabel ?? ""}).`,
      );

      setForm(createEmptyForm(formatIsoDate(activeDate ?? new Date())));
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

  return (
    <main className="relative min-h-screen overflow-x-clip bg-[#10040b] text-[#f6e8e0]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_10%,rgba(244,200,190,0.12),transparent_18%),radial-gradient(circle_at_12%_12%,rgba(138,27,59,0.28),transparent_26%),linear-gradient(180deg,#090b12_0%,#10040b_34%,#17070f_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.18] mix-blend-soft-light [background-image:radial-gradient(rgba(255,255,255,0.18)_0.7px,transparent_0.7px),radial-gradient(rgba(255,255,255,0.12)_0.5px,transparent_0.5px)] [background-position:0_0,18px_18px] [background-size:24px_24px,18px_18px]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_0,rgba(255,255,255,0.03)_48%,transparent_54%),radial-gradient(circle_at_65%_35%,rgba(255,255,255,0.05),transparent_18%)] opacity-[0.55] mix-blend-soft-light" />
      <motion.div
        aria-hidden="true"
        animate={orbLeftMotion}
        transition={slowDriftTransition}
        className="pointer-events-none absolute -left-32 top-16 h-[28rem] w-[28rem] rounded-full bg-[rgba(115,16,46,0.55)] opacity-25 blur-[90px]"
      />
      <motion.div
        aria-hidden="true"
        animate={orbRightMotion}
        transition={slowDriftTransition}
        className="pointer-events-none absolute -right-32 top-56 h-[28rem] w-[28rem] rounded-full bg-[rgba(240,217,209,0.14)] opacity-25 blur-[90px]"
      />

      <header className="sticky top-0 z-30 bg-[#10040b]/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-4 sm:px-6 lg:px-8">
          <a
            href="#schedule"
            className="text-[1.8rem] font-bold tracking-[0.2em] text-[#f6e8e0]"
            style={{ fontFamily: '"Cormorant Garamond", serif' }}
          >
            MUSE
          </a>

          <nav
            aria-label="Booking navigation"
            className="hidden items-center gap-6 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-[#f6e8e0]/[0.72] backdrop-blur-[18px] md:flex"
            style={{ fontFamily: '"Manrope", sans-serif' }}
          >
            <a className="transition hover:text-[#f6e8e0]" href="#packages">
              Packages
            </a>
            <a className="transition hover:text-[#f6e8e0]" href="#classes">
              Schedule
            </a>
            <button
              type="button"
              onClick={openBookingForm}
              className="rounded-full border border-white/[0.15] px-4 py-2 text-[#f6e8e0] transition hover:border-white/[0.25] hover:bg-white/[0.08]"
            >
              Book
            </button>
          </nav>
        </div>
      </header>

      <div className="relative z-10 mx-auto flex max-w-7xl flex-col px-4 sm:px-6 lg:px-8">
        <motion.section
          id="schedule"
          variants={stagger}
          initial="hidden"
          animate="show"
          className="scroll-mt-24 relative grid min-h-[calc(100vh-5.8rem)] gap-8 overflow-hidden py-10 sm:py-14 lg:grid-cols-[minmax(0,1.18fr)_minmax(21rem,0.82fr)] lg:items-end lg:gap-6"
        >
          <motion.div
            aria-hidden="true"
            animate={ambientDrift}
            transition={slowDriftTransition}
            className="pointer-events-none absolute inset-0"
          >
            <Image
              src={heroImage}
              alt=""
              fill
              priority
              className="object-cover object-[center_42%] saturate-[1.2] contrast-[1.06] brightness-[1.1]"
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(12,4,8,0.5)_0%,rgba(12,4,8,0.32)_34%,rgba(12,4,8,0.06)_58%,rgba(12,4,8,0.4)_100%),linear-gradient(180deg,rgba(12,4,8,0.08)_0%,rgba(12,4,8,0.01)_30%,rgba(12,4,8,0.58)_100%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(255,231,223,0.2),transparent_20%),radial-gradient(circle_at_76%_26%,rgba(167,46,78,0.14),transparent_24%),radial-gradient(circle_at_52%_12%,rgba(255,248,244,0.08),transparent_18%),linear-gradient(180deg,rgba(16,4,11,0)_72%,#10040b_100%)]" />
          </motion.div>

          <motion.div
            variants={fadeUp}
            className="relative flex min-h-[24rem] max-w-4xl flex-col justify-end overflow-hidden rounded-[2rem] border border-white/10 bg-[rgba(14,5,10,0.16)] px-5 py-6 shadow-[0_22px_48px_rgba(0,0,0,0.18)] sm:min-h-[28rem] sm:px-8 sm:py-8 lg:min-h-[34rem] lg:px-10 lg:py-10"
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_14%,rgba(255,255,255,0.14),transparent_24%),linear-gradient(90deg,rgba(25,6,13,0.58)_0%,rgba(25,6,13,0.5)_30%,rgba(25,6,13,0.26)_40%,rgba(25,6,13,0.08)_48%,rgba(25,6,13,0.01)_54%,rgba(25,6,13,0)_60%)] lg:[mask-image:linear-gradient(90deg,#000_0%,#000_40%,rgba(0,0,0,0.82)_46%,rgba(0,0,0,0.24)_53%,transparent_60%)]" />

            <motion.div variants={stagger} initial="hidden" animate="show" className="relative z-10">
              <motion.p
                variants={fadeUp}
                className="mb-4 text-sm uppercase tracking-[0.38em] text-[#f1c9bf]"
                style={{ fontFamily: '"Manrope", sans-serif' }}
              >
                Now Open
              </motion.p>
              <motion.h1
                variants={fadeUp}
                className="max-w-4xl text-[4.8rem] leading-[0.82] text-[#f7e8e2] drop-shadow-[0_12px_30px_rgba(0,0,0,0.24)] sm:text-[6.3rem] lg:text-[8.2rem]"
                style={{ fontFamily: '"Cormorant Garamond", serif' }}
              >
                MUSE
              </motion.h1>
              <motion.p
                variants={fadeUp}
                className="mt-3 text-[0.9rem] uppercase tracking-[0.45rem] text-[#f6e8e0]/[0.72] sm:text-[0.95rem]"
                style={{ fontFamily: '"Manrope", sans-serif' }}
              >
                Book Your Practice
              </motion.p>
              <motion.p
                variants={fadeUp}
                className="mt-6 max-w-2xl text-base leading-8 text-[#f6e8e0]/[0.86] sm:text-lg"
                style={{ fontFamily: '"Manrope", sans-serif' }}
              >
                Reformer and mat Pilates classes are open for booking. Choose a day, pick
                10:30 AM or 6:00 PM, then reserve the class style that fits your pace.
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
                <motion.button
                  whileHover={shouldReduceMotion ? undefined : { y: -2, scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={openBookingForm}
                  className="inline-flex items-center justify-center rounded-full border border-white/[0.15] bg-white/[0.06] px-6 py-3 text-sm font-semibold text-[#f6e8e0] backdrop-blur transition hover:border-white/[0.25] hover:bg-white/10"
                  style={{ fontFamily: '"Manrope", sans-serif' }}
                >
                  Book Now
                </motion.button>
              </motion.div>

              <motion.div variants={fadeUp} className="mt-8 flex flex-wrap gap-3">
                {[
                  "Daily bookings available",
                  "Two daily class slots",
                  "Reformer or mat Pilates",
                ].map((item, index) => (
                  <motion.span
                    key={item}
                    animate={
                      shouldReduceMotion
                        ? undefined
                        : { y: [0, index % 2 === 0 ? -4 : 4, 0] }
                    }
                    transition={{
                      ...slowFloatTransition,
                      delay: index * 0.25,
                    }}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-[#f6e8e0]/[0.72] shadow-sm backdrop-blur"
                    style={{ fontFamily: '"Manrope", sans-serif' }}
                  >
                    {item}
                  </motion.span>
                ))}
              </motion.div>
            </motion.div>
          </motion.div>

          <motion.aside
            variants={fadeUp}
            animate={ambientFloat}
            transition={slowFloatTransition}
            className={`${cardShellClassName} relative min-h-full p-6 sm:p-8`}
          >
            <p
              className="text-xs uppercase tracking-[0.35em] text-[#f1c9bf]"
              style={{ fontFamily: '"Manrope", sans-serif' }}
            >
              Today At MUSE
            </p>

            <div className="mt-6 space-y-4">
              {activeSchedule.classes.map((slot, index) => {
                const slotAvailability = getSlotAvailability(slot);

                return (
                  <motion.div
                    key={slot.time}
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, delay: 0.12 + index * 0.08 }}
                    whileHover={shouldReduceMotion ? undefined : { y: -4, scale: 1.01 }}
                    className="rounded-[24px] border border-white/10 bg-white/[0.08] p-5"
                  >
                    <span
                      className="text-sm uppercase tracking-[0.28em] text-[#f6e8e0]/[0.72]"
                      style={{ fontFamily: '"Manrope", sans-serif' }}
                    >
                      {slot.time}
                    </span>
                    <p
                      className="mt-2 text-2xl text-[#f7e8e2]"
                      style={{ fontFamily: '"Cormorant Garamond", serif' }}
                    >
                      {slot.title}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {slotAvailability.map((classAvailability) => (
                        <span
                          key={classAvailability.id}
                          className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#f6e8e0]/[0.72]"
                          style={{ fontFamily: '"Manrope", sans-serif' }}
                        >
                          {classAvailability.label}: {classAvailability.spotsLeft}/
                          {classAvailability.capacity}
                        </span>
                      ))}
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <p
              className="mt-6 text-sm leading-7 text-[#f6e8e0]/[0.72]"
              style={{ fontFamily: '"Manrope", sans-serif' }}
            >
              Book the time that suits you, then choose Reformer or Mat Pilates in the
              form. Reformer has 4 spots and Mat Pilates has 6 spots for each time.
            </p>
          </motion.aside>
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

          <motion.div
            variants={stagger}
            className="mt-8 grid gap-5 md:grid-cols-2"
          >
            {packages.map((pkg) => (
              <motion.article
                key={pkg.title}
                variants={fadeUp}
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
          </motion.div>
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
              className="text-sm uppercase tracking-[0.35em] text-[#f1c9bf]"
              style={{ fontFamily: '"Manrope", sans-serif' }}
            >
              Daily Schedule
            </p>
            <h2
              className="mt-3 text-4xl text-[#f7e8e2] sm:text-5xl"
              style={{ fontFamily: '"Cormorant Garamond", serif' }}
            >
              Choose a day, then reserve the class that fits your pace.
            </h2>
          </motion.div>

          <motion.div
            variants={fadeUp}
            className={`${cardShellClassName} mt-8 overflow-hidden p-4 sm:p-5`}
          >
            <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {dates.length > 0
                ? dates.map((date, index) => {
                    const isActive = index === selectedDateIndex;

                    return (
                      <motion.button
                        key={date.toISOString()}
                        type="button"
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleDateSelect(index)}
                        className={`min-w-[92px] rounded-[24px] border px-4 py-3 text-left transition sm:min-w-[108px] ${
                          isActive
                            ? "border-[rgba(255,232,223,0.2)] bg-[linear-gradient(135deg,#f7e8e2,#dcb5aa)] text-[#2a0711] shadow-[0_18px_36px_rgba(0,0,0,0.3)]"
                            : "border-white/10 bg-white/5 text-[#f6e8e0]/[0.72] hover:border-white/20 hover:text-[#f6e8e0]"
                        }`}
                      >
                        <span
                          className={`block text-[11px] uppercase tracking-[0.28em] ${
                            isActive ? "text-[#5f2535]" : "text-[#f6e8e0]/[0.72]"
                          }`}
                          style={{ fontFamily: '"Manrope", sans-serif' }}
                        >
                          {formatDayLabel(date, index)}
                        </span>
                        <strong
                          className="mt-2 block text-2xl"
                          style={{ fontFamily: '"Cormorant Garamond", serif' }}
                        >
                          {String(date.getDate()).padStart(2, "0")}
                        </strong>
                        <span
                          className={`mt-1 block text-xs uppercase tracking-[0.28em] ${
                            isActive ? "text-[#5f2535]" : "text-[#f6e8e0]/[0.72]"
                          }`}
                          style={{ fontFamily: '"Manrope", sans-serif' }}
                        >
                          {formatMonthLabel(date)}
                        </span>
                      </motion.button>
                    );
                  })
                : Array.from({ length: 7 }, (_, index) => (
                    <div
                      key={`loading-${index}`}
                      className="min-w-[92px] animate-pulse rounded-[24px] border border-white/10 bg-white/[0.06] px-4 py-3 sm:min-w-[108px]"
                    >
                      <div className="h-3 w-12 rounded-full bg-white/[0.12]" />
                      <div className="mt-3 h-8 w-9 rounded-full bg-white/[0.12]" />
                      <div className="mt-3 h-3 w-10 rounded-full bg-white/[0.12]" />
                    </div>
                  ))}
            </div>
          </motion.div>

          <div className="mt-8 grid gap-6 xl:grid-cols-[0.92fr_1.25fr]">
            <motion.aside
              variants={fadeUp}
              className={`${cardShellClassName} h-fit p-6 sm:p-8 xl:sticky xl:top-28`}
            >
              <p
                className="text-sm uppercase tracking-[0.35em] text-[#f1c9bf]"
                style={{ fontFamily: '"Manrope", sans-serif' }}
              >
                Studio Details
              </p>
              <h3
                className="mt-3 text-4xl text-[#f7e8e2]"
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

              <div className="mt-6 grid grid-cols-3 gap-3">
                {[
                  { value: String(MAX_GUESTS_PER_TIME), label: "Per time" },
                  { value: "4h", label: "Cancel window" },
                  { value: "2x", label: "Daily slots" },
                ].map((item) => (
                  <motion.div
                    key={item.label}
                    whileHover={shouldReduceMotion ? undefined : { y: -3 }}
                    className="rounded-[22px] border border-white/10 bg-white/5 p-4 text-center"
                  >
                    <div
                      className="text-3xl text-[#f4c8be]"
                      style={{ fontFamily: '"Cormorant Garamond", serif' }}
                    >
                      {item.value}
                    </div>
                    <div
                      className="mt-1 text-[11px] uppercase tracking-[0.24em] text-[#f6e8e0]/[0.72]"
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
                  <span>Reformer has 4 spots; Mat Pilates has 6 spots.</span>
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
                  {activeSchedule.classes.map((slot) => {
                    const slotAvailability = getSlotAvailability(slot);

                    return (
                      <motion.article
                        key={`${selectedDateIndex}-${slot.time}`}
                        whileHover={shouldReduceMotion ? undefined : { y: -6, scale: 1.01 }}
                        className={`${cardShellClassName} p-5 sm:p-6`}
                      >
                        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                          <div className="max-w-2xl">
                            <p
                              className="text-xs uppercase tracking-[0.3em] text-[#f1c9bf]"
                              style={{ fontFamily: '"Manrope", sans-serif' }}
                            >
                              {slot.time} · {slot.duration}
                            </p>
                            <h3
                              className="mt-2 text-3xl text-[#f7e8e2] sm:text-[2.15rem]"
                              style={{ fontFamily: '"Cormorant Garamond", serif' }}
                            >
                              {slot.title}
                            </h3>
                            <p
                              className="mt-2 text-sm leading-7 text-[#f6e8e0]/[0.72] sm:text-base"
                              style={{ fontFamily: '"Manrope", sans-serif' }}
                            >
                              {slot.subtitle}
                            </p>
                          </div>

                          <motion.button
                            whileTap={{ scale: 0.98 }}
                            type="button"
                            onClick={() => prefillBookingForm(slot)}
                            className="inline-flex min-h-[48px] shrink-0 items-center justify-center rounded-full border border-white/[0.18] bg-transparent px-5 py-3 text-sm font-semibold text-[#f6e8e0] transition hover:border-transparent hover:bg-[linear-gradient(135deg,#f7e8e2,#dcb5aa)] hover:text-[#2a0711] lg:min-w-[130px]"
                            style={{ fontFamily: '"Manrope", sans-serif' }}
                          >
                            Book Time
                          </motion.button>
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
                                  className="mt-1 text-xs font-semibold uppercase tracking-[0.22em] text-[#f6e8e0]/[0.62]"
                                  style={{ fontFamily: '"Manrope", sans-serif' }}
                                >
                                  {classAvailability.isFull
                                    ? `Full · ${classAvailability.waitlistCount} waiting`
                                    : `${classAvailability.spotsLeft} of ${classAvailability.capacity} spots left`}
                                </p>
                              </div>

                              <motion.button
                                whileTap={{ scale: 0.98 }}
                                type="button"
                                onClick={() =>
                                  prefillBookingFormForClass(slot, classAvailability.id)
                                }
                                className={`inline-flex min-h-[44px] items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition sm:min-w-[112px] ${
                                  classAvailability.isFull
                                    ? "border border-white/[0.12] bg-transparent text-[#f6e8e0]/[0.74] hover:bg-white/[0.08]"
                                    : "border border-white/[0.18] bg-transparent text-[#f6e8e0] hover:border-transparent hover:bg-[linear-gradient(135deg,#f7e8e2,#dcb5aa)] hover:text-[#2a0711]"
                                }`}
                                style={{ fontFamily: '"Manrope", sans-serif' }}
                              >
                                {classAvailability.isFull ? "Waitlist" : "Book"}
                              </motion.button>
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

      <AnimatePresence>
        {isModalOpen ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.button
              type="button"
              aria-label="Close booking form"
              className="absolute inset-0 bg-[rgba(8,4,8,0.76)] backdrop-blur-[12px] [background-image:radial-gradient(circle_at_20%_14%,rgba(255,231,223,0.08),transparent_16%)]"
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
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="relative z-10 max-h-[92vh] w-full max-w-5xl overflow-y-auto overscroll-contain rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_24%),linear-gradient(145deg,rgba(84,10,31,0.96),rgba(15,4,10,0.98))] shadow-[0_28px_90px_rgba(0,0,0,0.42)]"
            >
              <div className="grid gap-0 lg:grid-cols-[0.92fr_1.08fr]">
                <div className="relative overflow-hidden px-6 py-8 text-white sm:px-8 sm:py-10">
                  <div className="pointer-events-none absolute inset-0 bg-white/[0.03] [background-image:linear-gradient(180deg,rgba(255,255,255,0.05),transparent_100%)]" />

                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="relative z-10 inline-flex rounded-full border border-white/[0.14] bg-[rgba(11,5,9,0.58)] px-4 py-2 text-xs uppercase tracking-[0.22em] text-[#f6e8e0] transition hover:border-white/[0.24] hover:bg-white/[0.08]"
                    style={{ fontFamily: '"Manrope", sans-serif' }}
                  >
                    Close
                  </button>

                  <div className="relative z-10 mt-10 max-w-md">
                    <p
                      className="text-xs uppercase tracking-[0.35em] text-[#d4b493]"
                      style={{ fontFamily: '"Manrope", sans-serif' }}
                    >
                      Reserve Your Spot
                    </p>
                    <h2
                      id="booking-modal-title"
                      className="mt-4 text-4xl sm:text-5xl"
                      style={{ fontFamily: '"Cormorant Garamond", serif' }}
                    >
                      Send your booking request.
                    </h2>
                    <p
                      className="mt-5 text-sm leading-7 text-[#f6e8e0]/[0.72] sm:text-base"
                      style={{ fontFamily: '"Manrope", sans-serif' }}
                    >
                      Pick a time slot from the schedule or choose it manually here. Then
                      select Reformer or Mat Pilates and submit the booking request.
                    </p>
                    <p
                      className="mt-5 rounded-[22px] border border-white/10 bg-white/5 p-4 text-sm leading-7 text-[#f6e8e0]/[0.72]"
                      style={{ fontFamily: '"Manrope", sans-serif' }}
                    >
                      {bookingSelectionNote}
                    </p>

                    <ul
                      className="mt-6 space-y-3 text-sm leading-7 text-[#f6e8e0]/[0.72]"
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
                        <span>Current class times are 10:30 AM and 6:00 PM.</span>
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="border-t border-white/10 px-6 py-8 sm:px-8 sm:py-10 lg:border-l lg:border-t-0 lg:border-white/10">
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <input type="hidden" name="requestType" value={form.requestType} />

                    <div className="grid gap-5 sm:grid-cols-2">
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
                          {CLASS_TYPES.map((classType) => (
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
                            {selectedAvailability.isFull
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
                          {TIME_SLOTS.map((slot) => (
                            <option key={slot.time} value={slot.time}>
                              {slot.time}
                            </option>
                          ))}
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
                          rows={5}
                          className={`${fieldClassName} resize-none`}
                        />
                      </label>
                    </div>

                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <motion.button
                        whileTap={{ scale: 0.98 }}
                        type="submit"
                        disabled={isSubmitting}
                        className="inline-flex min-h-[52px] items-center justify-center rounded-full bg-[linear-gradient(135deg,#f7e8e2,#dcb5aa)] px-6 py-3 text-sm font-semibold text-[#2a0711] shadow-[0_18px_36px_rgba(0,0,0,0.28)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                        style={{ fontFamily: '"Manrope", sans-serif' }}
                      >
                        {isSubmitting
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

                    <p
                      aria-live="polite"
                      className={`text-sm leading-7 ${
                        statusMessage ? "text-[#f1c9bf]" : "text-[#f6e8e0]/[0.72]"
                      }`}
                      style={{ fontFamily: '"Manrope", sans-serif' }}
                    >
                      {statusMessage ||
                        "Bookings are saved to the studio database and checked against live spots left."}
                    </p>
                  </form>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}
