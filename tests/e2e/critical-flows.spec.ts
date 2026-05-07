import { expect, test } from "@playwright/test";

test("public booking page renders the schedule and account entry point", async ({ page }) => {
  await page.goto("/booking");

  await expect(page.getByRole("heading", { name: /Welcome to/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /View Schedule/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Account/i })).toBeVisible();
  await page.getByRole("link", { name: /View Schedule/i }).click();
  await expect(page.getByRole("heading", { name: /Morning Class Slot/i })).toBeVisible();
  await expect(page.getByText(/Reformer ·/i).first()).toBeVisible();
  await expect(page.getByText(/Mat Pilates ·/i).first()).toBeVisible();
});

test("admin route requires authentication", async ({ page }) => {
  await page.goto("/admin");

  await expect(page).toHaveURL(/sign-in/);
});

test("auth routes render account entry pages", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: /Sign in/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "Booking", exact: true })).toBeVisible();

  await page.goto("/sign-up");
  await expect(page.getByRole("heading", { name: /Create your account/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Booking", exact: true })).toBeVisible();
});

test("booking API rejects cross-origin mutation before auth", async ({ request }) => {
  const response = await request.post("/api/bookings", {
    headers: {
      Origin: "https://example.invalid",
    },
    data: {
      name: "QA User",
      session: "reformer",
      date: "2026-05-08",
      time: "10:30 AM",
      notes: "",
    },
  });

  expect(response.status()).toBe(403);
});

test("booking API requires auth when same-origin mutation is used", async ({ page }) => {
  await page.goto("/booking");
  const status = await page.evaluate(async () => {
    const response = await fetch("/api/bookings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "qa-booking-20260508-1030",
      },
      body: JSON.stringify({
        name: "QA User",
        session: "reformer",
        date: "2026-05-08",
        time: "10:30 AM",
        notes: "",
      }),
    });

    return response.status;
  });

  expect(status).toBe(401);
});
