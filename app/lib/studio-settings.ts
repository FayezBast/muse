import "server-only";

import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { dirname, join } from "path";
import {
  DEFAULT_CLASS_TYPES,
  DEFAULT_PACKAGES,
  DEFAULT_TIME_SLOTS,
  DEFAULT_WEEKLY_SCHEDULE,
  WEEKDAYS,
  formatPriceLabel,
  getTimeSlotSortValue,
} from "./booking-config";
import { getPool, isProductionRuntime } from "./database";
import type {
  ClassTypeId,
  StudioClassType,
  StudioPackage,
  StudioTimeSlot,
  StudioWeeklyScheduleDay,
} from "./booking-config";

export type StudioSettings = {
  classTypes: StudioClassType[];
  timeSlots: StudioTimeSlot[];
  weeklySchedule: StudioWeeklyScheduleDay[];
  packages: StudioPackage[];
  updatedAt: string;
};

const LOCAL_SETTINGS_PATH = join(process.cwd(), ".next", "cache", "muse-settings.json");
const SETTINGS_KEY = "current";

declare global {
  // eslint-disable-next-line no-var
  var museStudioSettingsSchemaReady: Promise<void> | undefined;
}

function defaultSettings(): StudioSettings {
  return {
    classTypes: DEFAULT_CLASS_TYPES.map((classType) => ({ ...classType })),
    timeSlots: DEFAULT_TIME_SLOTS.map((slot) => ({
      ...slot,
      classTypeIds: [...slot.classTypeIds],
    })),
    weeklySchedule: DEFAULT_WEEKLY_SCHEDULE.map((day) => ({
      ...day,
      timeSlots: day.timeSlots.map((slot) => ({
        ...slot,
        classTypeIds: [...slot.classTypeIds],
      })),
    })),
    packages: DEFAULT_PACKAGES.map((pkg) => ({
      ...pkg,
      points: [...pkg.points],
    })),
    updatedAt: new Date().toISOString(),
  };
}

async function ensureStudioSettingsSchema() {
  const pool = getPool();

  if (!pool) {
    return;
  }

  if (isProductionRuntime()) {
    return;
  }

  if (!globalThis.museStudioSettingsSchemaReady) {
    globalThis.museStudioSettingsSchemaReady = pool
      .query(
        `
          CREATE TABLE IF NOT EXISTS studio_settings (
            key TEXT PRIMARY KEY,
            data JSONB NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `,
      )
      .then(() => undefined)
      .catch((error) => {
        globalThis.museStudioSettingsSchemaReady = undefined;
        throw error;
      });
  }

  await globalThis.museStudioSettingsSchemaReady;
}

function cleanText(value: unknown, fallback = "", maxLength = 220) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : fallback;
}

function cleanOptionalText(value: unknown, maxLength = 160) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : undefined;
}

function cleanPriceCents(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(Math.round(value), 100_000_00));
}

function cleanCapacity(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.min(Math.round(value), 50));
}

function cleanTime(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  const displayMatch = trimmed.match(/^(\d{1,2}):([0-5]\d)\s*(AM|PM)$/i);

  if (displayMatch) {
    const hour = Number(displayMatch[1]);

    if (hour >= 1 && hour <= 12) {
      return `${hour}:${displayMatch[2]} ${displayMatch[3].toUpperCase()}`;
    }
  }

  const inputMatch = trimmed.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);

  if (!inputMatch) {
    return fallback;
  }

  const hour24 = Number(inputMatch[1]);
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;

  return `${hour12}:${inputMatch[2]} ${period}`;
}

function cleanClassTypeIds(value: unknown, fallback: readonly ClassTypeId[]) {
  const allowedIds = new Set(DEFAULT_CLASS_TYPES.map((classType) => classType.id));
  const cleanIds = getArray(value).filter(
    (item): item is ClassTypeId =>
      typeof item === "string" && allowedIds.has(item as ClassTypeId),
  );
  const uniqueIds = Array.from(new Set(cleanIds));

  return uniqueIds.length > 0 ? uniqueIds : [...fallback];
}

function getRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function getArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function normalizeClassTypes(value: unknown): StudioClassType[] {
  const rawClassTypes = getArray(value).map(getRecord);

  return DEFAULT_CLASS_TYPES.map((defaultClassType) => {
    const rawClassType =
      rawClassTypes.find((item) => item.id === defaultClassType.id) ?? {};
    const priceCents = cleanPriceCents(rawClassType.priceCents, defaultClassType.priceCents);

    return {
      id: defaultClassType.id,
      label: cleanText(rawClassType.label, defaultClassType.label, 80),
      capacity: cleanCapacity(rawClassType.capacity, defaultClassType.capacity),
      priceCents,
      priceLabel: formatPriceLabel(priceCents),
    };
  });
}

function normalizeTimeSlots(
  value: unknown,
  options: { allowEmpty?: boolean } = {},
): StudioTimeSlot[] {
  const rawTimeSlots = getArray(value).map(getRecord);

  if (options.allowEmpty && rawTimeSlots.length === 0) {
    return [];
  }

  const source =
    rawTimeSlots.length > 0
      ? rawTimeSlots
      : DEFAULT_TIME_SLOTS.map((slot) => ({
          ...slot,
          classTypeIds: [...slot.classTypeIds],
        }));
  const seenTimes = new Set<string>();
  const slots: StudioTimeSlot[] = [];

  for (const [index, rawSlot] of source.entries()) {
    const fallbackSlot = DEFAULT_TIME_SLOTS[index] ?? DEFAULT_TIME_SLOTS[0];
    const time = cleanTime(rawSlot.time, fallbackSlot.time);

    if (seenTimes.has(time)) {
      continue;
    }

    seenTimes.add(time);
    slots.push({
      time,
      title: cleanText(rawSlot.title, fallbackSlot.title, 100),
      subtitle: cleanText(rawSlot.subtitle, fallbackSlot.subtitle, 180),
      duration: cleanText(rawSlot.duration, fallbackSlot.duration, 40),
      classTypeIds: cleanClassTypeIds(rawSlot.classTypeIds, fallbackSlot.classTypeIds),
    });
  }

  return (slots.length > 0
    ? slots
    : DEFAULT_TIME_SLOTS.map((slot) => ({
        ...slot,
        classTypeIds: [...slot.classTypeIds],
      })))
    .toSorted(
      (first, second) =>
        getTimeSlotSortValue(first.time) - getTimeSlotSortValue(second.time),
    )
    .slice(0, 8);
}

function cloneTimeSlots(timeSlots: readonly StudioTimeSlot[]) {
  return timeSlots.map((slot) => ({
    ...slot,
    classTypeIds: [...slot.classTypeIds],
  }));
}

function normalizeWeeklySchedule(
  value: unknown,
  fallbackTimeSlots: readonly StudioTimeSlot[],
): StudioWeeklyScheduleDay[] {
  const rawDays = getArray(value).map(getRecord);

  return WEEKDAYS.map((weekday) => {
    const rawDay = rawDays.find((item) => item.day === weekday.id);
    const hasExplicitTimeSlots =
      Boolean(rawDay) && Array.isArray(rawDay?.timeSlots);
    const timeSlots = hasExplicitTimeSlots
      ? normalizeTimeSlots(rawDay?.timeSlots, { allowEmpty: true })
      : cloneTimeSlots(fallbackTimeSlots);

    return {
      day: weekday.id,
      label: weekday.label,
      timeSlots,
    };
  });
}

function normalizePackages(value: unknown): StudioPackage[] {
  const rawPackages = getArray(value).map(getRecord);

  return DEFAULT_PACKAGES.map((defaultPackage, index) => {
    const rawPackage =
      rawPackages.find((item) => item.id === defaultPackage.id) ??
      rawPackages[index] ??
      {};
    const rawPoints = getArray(rawPackage.points)
      .map((point) => cleanText(point, "", 220))
      .filter(Boolean)
      .slice(0, 8);

    return {
      id: defaultPackage.id,
      kicker: cleanText(rawPackage.kicker, defaultPackage.kicker, 80),
      title: cleanText(rawPackage.title, defaultPackage.title, 100),
      bonus: cleanText(rawPackage.bonus, defaultPackage.bonus, 140),
      priceLabel: cleanOptionalText(rawPackage.priceLabel),
      points: rawPoints.length > 0 ? rawPoints : [...defaultPackage.points],
      featured:
        typeof rawPackage.featured === "boolean"
          ? rawPackage.featured
          : Boolean(defaultPackage.featured),
    };
  });
}

function normalizeSettings(value: unknown): StudioSettings {
  const rawSettings = getRecord(value);
  const fallbackTimeSlots = normalizeTimeSlots(rawSettings.timeSlots);
  const weeklySchedule = normalizeWeeklySchedule(
    rawSettings.weeklySchedule,
    fallbackTimeSlots,
  );

  return {
    classTypes: normalizeClassTypes(rawSettings.classTypes),
    timeSlots: cloneTimeSlots(
      weeklySchedule.find((day) => day.timeSlots.length > 0)?.timeSlots ??
        fallbackTimeSlots,
    ),
    weeklySchedule,
    packages: normalizePackages(rawSettings.packages),
    updatedAt: cleanText(rawSettings.updatedAt, new Date().toISOString(), 80),
  };
}

async function readLocalSettings() {
  try {
    const contents = await readFile(LOCAL_SETTINGS_PATH, "utf8");

    return normalizeSettings(JSON.parse(contents) as unknown);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return defaultSettings();
    }

    throw error;
  }
}

async function writeLocalSettings(settings: StudioSettings) {
  const tempPath = `${LOCAL_SETTINGS_PATH}.${process.pid}.${Date.now()}.tmp`;

  await mkdir(dirname(LOCAL_SETTINGS_PATH), { recursive: true });
  await writeFile(tempPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  await rename(tempPath, LOCAL_SETTINGS_PATH);
}

export async function getStudioSettings(): Promise<StudioSettings> {
  const pool = getPool();

  if (!pool) {
    return readLocalSettings();
  }

  await ensureStudioSettingsSchema();

  const result = await pool.query<{
    data: unknown;
    updated_at: string | Date;
  }>(
    `
      SELECT data, updated_at
      FROM studio_settings
      WHERE key = $1;
    `,
    [SETTINGS_KEY],
  );
  const row = result.rows[0];

  if (!row) {
    return defaultSettings();
  }

  return {
    ...normalizeSettings(row.data),
    updatedAt:
      row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

export async function updateStudioSettings(input: unknown): Promise<StudioSettings> {
  const settings = {
    ...normalizeSettings(input),
    updatedAt: new Date().toISOString(),
  };
  const pool = getPool();

  if (!pool) {
    await writeLocalSettings(settings);
    return settings;
  }

  await ensureStudioSettingsSchema();

  const result = await pool.query<{
    data: unknown;
    updated_at: string | Date;
  }>(
    `
      INSERT INTO studio_settings (key, data, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (key)
      DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
      RETURNING data, updated_at;
    `,
    [SETTINGS_KEY, JSON.stringify(settings)],
  );
  const row = result.rows[0];

  return {
    ...normalizeSettings(row?.data ?? settings),
    updatedAt:
      row?.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : row?.updated_at ?? settings.updatedAt,
  };
}
