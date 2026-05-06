import "server-only";

type BookingEmailDetails = {
  id: string;
  status: "confirmed" | "waitlist";
  sessionLabel: string;
  date: string;
  time: string;
  priceLabel: string;
  customerName: string;
  customerEmail: string;
  phone: string | null;
  notes: string | null;
};

type EmailPayload = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

export type BookingNotificationResult =
  | { status: "sent" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

function formatBookingDate(dateIso: string) {
  const [year, month, day] = dateIso.split("-").map(Number);

  if (!year || !month || !day) {
    return dateIso;
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Beirut",
  }).format(new Date(year, month - 1, day, 12));
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildBookingLines(details: BookingEmailDetails) {
  return [
    `Name: ${details.customerName}`,
    `Email: ${details.customerEmail}`,
    details.phone ? `Phone: ${details.phone}` : undefined,
    `Class: ${details.sessionLabel}`,
    `Date: ${formatBookingDate(details.date)}`,
    `Time: ${details.time}`,
    `Price: ${details.priceLabel}`,
    `Status: ${details.status === "waitlist" ? "Waitlist" : "Confirmed"}`,
    details.notes ? `Notes: ${details.notes}` : undefined,
    `Booking ID: ${details.id}`,
  ].filter((line): line is string => Boolean(line));
}

function buildEmailBody(title: string, details: BookingEmailDetails) {
  const lines = buildBookingLines(details);
  const htmlLines = lines
    .map((line) => {
      const [label, ...rest] = line.split(": ");
      return `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(rest.join(": "))}</li>`;
    })
    .join("");

  return {
    text: `${title}\n\n${lines.join("\n")}`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.55;color:#241019">
        <h1 style="font-size:22px;margin:0 0 16px">${escapeHtml(title)}</h1>
        <ul style="padding-left:18px;margin:0">${htmlLines}</ul>
      </div>
    `,
  };
}

async function sendResendEmail(payload: EmailPayload) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.BOOKING_EMAIL_FROM;

  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY and BOOKING_EMAIL_FROM are required.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      reply_to: payload.replyTo,
    }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `Resend returned ${response.status}.`);
  }
}

export async function sendBookingNotifications(
  details: BookingEmailDetails,
): Promise<BookingNotificationResult> {
  const instructorEmail = process.env.BOOKING_INSTRUCTOR_EMAIL;
  const ownerEmail = process.env.BOOKING_OWNER_EMAIL;

  if (
    !process.env.RESEND_API_KEY ||
    !process.env.BOOKING_EMAIL_FROM ||
    !instructorEmail ||
    !ownerEmail
  ) {
    return {
      status: "skipped",
      reason:
        "Email notifications are not configured. Set RESEND_API_KEY, BOOKING_EMAIL_FROM, BOOKING_INSTRUCTOR_EMAIL, and BOOKING_OWNER_EMAIL.",
    };
  }

  const customerBody = buildEmailBody("Your MUSE booking is confirmed", details);
  const staffBody = buildEmailBody("New MUSE booking", details);
  const customerSubject =
    details.status === "waitlist"
      ? `MUSE waitlist request: ${details.sessionLabel} on ${formatBookingDate(details.date)}`
      : `MUSE booking confirmed: ${details.sessionLabel} on ${formatBookingDate(details.date)}`;
  const staffSubject = `New MUSE booking: ${details.customerName} - ${details.date} ${details.time}`;

  try {
    await Promise.all([
      sendResendEmail({
        to: details.customerEmail,
        subject: customerSubject,
        ...customerBody,
      }),
      sendResendEmail({
        to: instructorEmail,
        subject: staffSubject,
        replyTo: details.customerEmail,
        ...staffBody,
      }),
      sendResendEmail({
        to: ownerEmail,
        subject: staffSubject,
        replyTo: details.customerEmail,
        ...staffBody,
      }),
    ]);

    return { status: "sent" };
  } catch (error) {
    return {
      status: "failed",
      reason:
        error instanceof Error
          ? error.message
          : "Unable to send booking notification emails.",
    };
  }
}
