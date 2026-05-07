import { z } from "zod";
import { TIME_SLOTS } from "./booking-config";

const timeSlotValues = TIME_SLOTS.map((slot) => slot.time) as [string, ...string[]];

export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(16, "Invalid idempotency key.")
  .max(120, "Invalid idempotency key.")
  .regex(/^[a-zA-Z0-9._:-]+$/, "Invalid idempotency key.")
  .optional();

export const bookingInputSchema = z.object({
  name: z.string().trim().min(1, "Full name is required.").max(160),
  email: z.string().trim().email().max(220).optional(),
  phone: z.string().trim().max(80).optional().default(""),
  session: z.enum(["reformer", "mat-pilates"], {
    message: "Choose Reformer or Mat Pilates.",
  }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date."),
  time: z.enum(timeSlotValues, { message: "Choose a valid class time." }),
  notes: z.string().trim().max(2000).optional().default(""),
  requestType: z.enum(["booking", "waitlist"]).optional(),
  idempotencyKey: idempotencyKeySchema,
});

export const cancelBookingSchema = z.object({
  bookingId: z.string().trim().min(1, "Choose a valid booking to cancel.").max(120),
});

const settingsClassTypeSchema = z.object({
  id: z.enum(["reformer", "mat-pilates"]),
  label: z.string().trim().min(1).max(80),
  capacity: z.number().int().min(1).max(50),
  priceCents: z.number().int().min(0).max(10_000_000),
  priceLabel: z.string().trim().max(40).optional(),
});

const settingsPackageSchema = z.object({
  id: z.string().trim().min(1).max(80),
  kicker: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(100),
  bonus: z.string().trim().min(1).max(140),
  priceLabel: z.string().trim().max(160).optional(),
  points: z.array(z.string().trim().min(1).max(220)).max(8),
  featured: z.boolean().optional(),
});

export const studioSettingsSchema = z.object({
  classTypes: z.array(settingsClassTypeSchema).min(1).max(2),
  packages: z.array(settingsPackageSchema).min(1).max(4),
  updatedAt: z.string().optional(),
});

export type ValidatedBookingInput = z.infer<typeof bookingInputSchema>;
export type ValidatedStudioSettingsInput = z.infer<typeof studioSettingsSchema>;
