import "server-only";

import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { DEFAULT_CLASS_TYPES, DEFAULT_PACKAGES, formatPriceLabel } from "./booking-config";
import { getPool } from "./database";
import type { StudioClassType, StudioPackage } from "./booking-config";

export type StudioSettings = {
  classTypes: StudioClassType[];
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

  return {
    classTypes: normalizeClassTypes(rawSettings.classTypes),
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
