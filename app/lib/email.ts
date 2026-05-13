import "server-only";

export type BookingEmailDetails = {
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

type BookingEmailBodyOptions = {
  title: string;
  eyebrow: string;
  intro: string;
  footer: string;
  ctaUrl?: string;
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

function formatStatus(details: BookingEmailDetails) {
  return details.status === "waitlist" ? "Waitlist request" : "Confirmed";
}

function buildStaffBookingRows(details: BookingEmailDetails) {
  return [
    { label: "Name", value: details.customerName },
    { label: "Email", value: details.customerEmail },
    details.phone ? { label: "Phone", value: details.phone } : undefined,
    { label: "Class", value: details.sessionLabel },
    { label: "Date", value: formatBookingDate(details.date) },
    { label: "Time", value: details.time },
    { label: "Price", value: details.priceLabel },
    { label: "Status", value: formatStatus(details) },
    details.notes ? { label: "Notes", value: details.notes } : undefined,
    { label: "Booking ID", value: details.id },
  ].filter(
    (row): row is { label: string; value: string } => Boolean(row),
  );
}

function buildStaffBookingLines(details: BookingEmailDetails) {
  return buildStaffBookingRows(details).map((row) => `${row.label}: ${row.value}`);
}

function getBookingUrl() {
  const appUrl = process.env.APP_URL;

  if (!appUrl) {
    return undefined;
  }

  try {
    return new URL("/booking", appUrl).toString();
  } catch {
    return undefined;
  }
}

function buildCustomerEmailBody(details: BookingEmailDetails, ctaUrl?: string) {
  const isWaitlist = details.status === "waitlist";
  const title = isWaitlist ? "You are on the waitlist" : "Your class is confirmed";
  const intro = isWaitlist
    ? "We saved your waitlist request. The studio team will reply if a spot opens."
    : "Your spot is saved. We look forward to seeing you at MUSE.";
  const rows = [
    { label: "Class", value: details.sessionLabel },
    { label: "Date", value: formatBookingDate(details.date) },
    { label: "Time", value: details.time },
  ];
  const htmlRows = rows
    .map(
      (row) => `
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid #eadfd9;color:#8a6a61;font-size:12px;line-height:1.4;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;vertical-align:top;width:30%">${escapeHtml(row.label)}</td>
          <td style="padding:14px 0;border-bottom:1px solid #eadfd9;color:#241019;font-size:17px;line-height:1.35;font-weight:700;vertical-align:top">${escapeHtml(row.value)}</td>
        </tr>
      `,
    )
    .join("");
  const cta = ctaUrl
    ? `
      <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;margin-top:22px;border-radius:999px;background:#241019;color:#fff8f3;font-size:14px;font-weight:700;line-height:1;text-decoration:none;padding:14px 20px">
        Manage booking
      </a>
    `
    : "";

  return {
    text: [
      "MUSE Pilates",
      title,
      "",
      intro,
      "",
      ...rows.map((row) => `${row.label}: ${row.value}`),
      "",
      "Need to change anything? Reply to this email and the studio team will help.",
      ctaUrl ? `Manage booking: ${ctaUrl}` : undefined,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n"),
    html: `
      <!doctype html>
      <html>
        <body style="margin:0;padding:0;background:#f2e9e4;font-family:Arial,Helvetica,sans-serif;color:#241019">
          <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">
            ${escapeHtml(intro)}
          </div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2e9e4;padding:32px 14px">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;border-collapse:collapse">
                  <tr>
                    <td style="padding:0 0 16px;text-align:center">
                      <div style="color:#241019;font-size:26px;line-height:1;font-weight:800;letter-spacing:4px">MUSE</div>
                      <div style="margin-top:8px;color:#7b5b54;font-size:13px;line-height:1.5">Pilates studio booking</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="border-radius:28px;background:#fffaf7;overflow:hidden;border:1px solid #eadfd9">
                      <div style="padding:34px 30px 28px;text-align:center;background:#fffaf7">
                        <span style="display:inline-block;border-radius:999px;background:${isWaitlist ? "#f5e1e8" : "#e0ece5"};color:${isWaitlist ? "#8a1b3b" : "#315f49"};font-size:12px;line-height:1;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;padding:10px 13px">
                          ${escapeHtml(isWaitlist ? "Waitlist" : "Confirmed")}
                        </span>
                        <h1 style="margin:18px 0 0;color:#241019;font-size:31px;line-height:1.12;font-weight:800;letter-spacing:0">${escapeHtml(title)}</h1>
                        <p style="margin:14px auto 0;max-width:410px;color:#5f4741;font-size:15px;line-height:1.65">${escapeHtml(intro)}</p>
                      </div>
                      <div style="padding:0 30px 32px">
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
                          ${htmlRows}
                        </table>
                        <p style="margin:20px 0 0;color:#5f4741;font-size:14px;line-height:1.65">
                          Need to change anything? Reply to this email and the studio team will help.
                        </p>
                        ${cta}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:16px 6px 0;color:#8a6a61;font-size:12px;line-height:1.55;text-align:center">
                      This is a transactional email from MUSE Pilates about your booking.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
  };
}

function buildEmailBody(
  details: BookingEmailDetails,
  options: BookingEmailBodyOptions,
) {
  const rows = buildStaffBookingRows(details);
  const lines = buildStaffBookingLines(details);
  const statusColor = details.status === "waitlist" ? "#8a1b3b" : "#426b57";
  const statusBg = details.status === "waitlist" ? "#f4dce3" : "#dcebe1";
  const htmlRows = rows
    .map((row) => {
      return `
        <tr>
          <td style="padding:13px 0;border-bottom:1px solid #ead2ca;color:#7c5963;font-size:13px;line-height:1.4;vertical-align:top;width:34%">${escapeHtml(row.label)}</td>
          <td style="padding:13px 0;border-bottom:1px solid #ead2ca;color:#241019;font-size:15px;line-height:1.4;font-weight:650;vertical-align:top">${escapeHtml(row.value)}</td>
        </tr>
      `;
    })
    .join("");
  const cta = options.ctaUrl
    ? `
      <a href="${escapeHtml(options.ctaUrl)}" style="display:inline-block;margin-top:22px;border-radius:999px;background:#611126;color:#fff7f1;font-size:14px;font-weight:700;line-height:1;text-decoration:none;padding:14px 20px">
        View booking page
      </a>
    `
    : "";

  return {
    text: [
      "MUSE Booking",
      options.title,
      "",
      options.intro,
      "",
      ...lines,
      "",
      options.footer,
      options.ctaUrl ? `Booking page: ${options.ctaUrl}` : undefined,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n"),
    html: `
      <!doctype html>
      <html>
        <body style="margin:0;padding:0;background:#10040b;font-family:Arial,Helvetica,sans-serif;color:#241019">
          <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">
            ${escapeHtml(options.intro)}
          </div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#10040b;padding:28px 14px">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;border-collapse:collapse">
                  <tr>
                    <td style="padding:0 0 18px">
                      <div style="color:#f7e8e2;font-size:24px;line-height:1;font-weight:800;letter-spacing:3px">MUSE</div>
                      <div style="margin-top:7px;color:#d8b5ac;font-size:13px;line-height:1.5">Pilates studio booking</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="border-radius:24px;background:#f7e8e2;overflow:hidden">
                      <div style="padding:32px 28px 24px;background:#611126;color:#fff7f1">
                        <div style="font-size:12px;line-height:1.3;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:#e8c4ba">${escapeHtml(options.eyebrow)}</div>
                        <h1 style="margin:12px 0 0;color:#fff7f1;font-size:28px;line-height:1.16;font-weight:800;letter-spacing:0">${escapeHtml(options.title)}</h1>
                        <p style="margin:14px 0 0;color:#f0d9d1;font-size:15px;line-height:1.65">${escapeHtml(options.intro)}</p>
                      </div>
                      <div style="padding:26px 28px 30px;background:#f7e8e2">
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;border-collapse:collapse">
                          <tr>
                            <td style="padding:0 0 18px">
                              <span style="display:inline-block;border-radius:999px;background:${statusBg};color:${statusColor};font-size:13px;line-height:1;font-weight:800;padding:9px 12px">
                                ${escapeHtml(formatStatus(details))}
                              </span>
                            </td>
                          </tr>
                          <tr>
                            <td style="border-radius:18px;background:#fff7f1;padding:3px 20px">
                              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
                                ${htmlRows}
                              </table>
                            </td>
                          </tr>
                        </table>
                        <p style="margin:0;color:#5c4149;font-size:14px;line-height:1.65">${escapeHtml(options.footer)}</p>
                        ${cta}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:18px 4px 0;color:#b99690;font-size:12px;line-height:1.55">
                      This is a transactional booking email from MUSE. You received it because a booking request was made on muse-booking.com.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
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
  const replyToEmail = process.env.BOOKING_REPLY_TO_EMAIL ?? ownerEmail;

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

  const bookingUrl = getBookingUrl();
  const customerBody = buildCustomerEmailBody(details, bookingUrl);
  const staffBody = buildEmailBody(details, {
    title: "New booking received",
    eyebrow: "Studio notification",
    intro:
      "A new booking request was submitted through the MUSE booking site. Customer and class details are below.",
    footer: "Reply to this email to contact the customer directly.",
    ctaUrl: bookingUrl,
  });
  const customerSubject =
    details.status === "waitlist"
      ? "MUSE Pilates waitlist received"
      : "MUSE Pilates booking confirmed";
  const staffSubject = `New MUSE booking: ${details.customerName} - ${details.date} ${details.time}`;

  try {
    await Promise.all([
      sendResendEmail({
        to: details.customerEmail,
        subject: customerSubject,
        replyTo: replyToEmail,
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
