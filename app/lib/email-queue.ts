import "server-only";

import { type QueryResultRow } from "pg";
import { getPool, isProductionRuntime } from "./database";
import {
  type BookingEmailDetails,
  type BookingNotificationResult,
  sendBookingNotifications,
} from "./email";
import { logger } from "./logger";

type Queryable = {
  query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<{
    rows: T[];
  }>;
};

export type BookingNotificationQueueResult =
  | { status: "queued" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

declare global {
  // eslint-disable-next-line no-var
  var museEmailQueueProcessing: boolean | undefined;
  // eslint-disable-next-line no-var
  var museEmailQueueSchemaReady: Promise<void> | undefined;
}

async function createEmailQueueSchema(queryable: Queryable) {
  await queryable.query(`
    CREATE TABLE IF NOT EXISTS booking_email_jobs (
      id BIGSERIAL PRIMARY KEY,
      booking_id BIGINT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      payload JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'skipped')),
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at TIMESTAMPTZ,
      UNIQUE (booking_id)
    );
  `);

  await queryable.query(`
    CREATE INDEX IF NOT EXISTS booking_email_jobs_pending_idx
      ON booking_email_jobs (status, attempts, created_at)
      WHERE status IN ('pending', 'failed', 'processing');
  `);
}

async function ensureEmailQueueSchema() {
  const pool = getPool();

  if (!pool || isProductionRuntime()) {
    return;
  }

  globalThis.museEmailQueueSchemaReady ??= createEmailQueueSchema(pool).catch((error) => {
    globalThis.museEmailQueueSchemaReady = undefined;
    throw error;
  });

  await globalThis.museEmailQueueSchemaReady;
}

async function processBookingEmailQueue() {
  const pool = getPool();

  if (!pool || globalThis.museEmailQueueProcessing) {
    return;
  }

  globalThis.museEmailQueueProcessing = true;
  const client = await pool.connect();

  try {
    for (;;) {
      await client.query("BEGIN");
      const result = await client.query<{
        id: string;
        payload: BookingEmailDetails;
      }>(
        `
          SELECT id::text AS id, payload
          FROM booking_email_jobs
          WHERE (
              status IN ('pending', 'failed')
              OR (status = 'processing' AND updated_at < NOW() - INTERVAL '5 minutes')
            )
            AND attempts < 5
          ORDER BY created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1;
        `,
      );
      const job = result.rows[0];

      if (!job) {
        await client.query("COMMIT");
        break;
      }

      await client.query(
        `
          UPDATE booking_email_jobs
          SET status = 'processing', updated_at = NOW()
          WHERE id = $1::bigint;
        `,
        [job.id],
      );
      await client.query("COMMIT");

      const notificationResult = await sendBookingNotifications(job.payload);
      await updateJobStatus(client, job.id, notificationResult);
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    logger.error("booking_email_queue_failed", {
      error: error instanceof Error ? error.message : "Unknown email queue error",
    });
  } finally {
    client.release();
    globalThis.museEmailQueueProcessing = false;
  }
}

async function updateJobStatus(
  queryable: Queryable,
  id: string,
  result: BookingNotificationResult,
) {
  if (result.status === "sent") {
    await queryable.query(
      `
        UPDATE booking_email_jobs
        SET status = 'sent', attempts = attempts + 1, last_error = NULL, sent_at = NOW(), updated_at = NOW()
        WHERE id = $1::bigint;
      `,
      [id],
    );
    return;
  }

  await queryable.query(
    `
      UPDATE booking_email_jobs
      SET status = $2, attempts = attempts + 1, last_error = $3, updated_at = NOW()
      WHERE id = $1::bigint;
    `,
    [id, result.status, result.reason],
  );
}

function scheduleQueueProcessing() {
  setTimeout(() => {
    processBookingEmailQueue().catch((error) => {
      logger.error("booking_email_queue_schedule_failed", {
        error: error instanceof Error ? error.message : "Unknown email queue error",
      });
    });
  }, 0);
}

export async function queueBookingNotifications(
  details: BookingEmailDetails | undefined,
): Promise<BookingNotificationQueueResult> {
  if (!details) {
    return { status: "skipped", reason: "Notification already queued." };
  }

  const pool = getPool();

  if (!pool) {
    scheduleQueueProcessing();
    setTimeout(() => {
      sendBookingNotifications(details).catch((error) => {
        logger.error("booking_notification_dev_send_failed", {
          error: error instanceof Error ? error.message : "Unknown email error",
        });
      });
    }, 0);

    return { status: "queued" };
  }

  try {
    await ensureEmailQueueSchema();
    await pool.query(
      `
        INSERT INTO booking_email_jobs (booking_id, payload, status)
        VALUES ($1::bigint, $2::jsonb, 'pending')
        ON CONFLICT (booking_id) DO NOTHING;
      `,
      [details.id, JSON.stringify(details)],
    );
    scheduleQueueProcessing();

    return { status: "queued" };
  } catch (error) {
    logger.error("booking_notification_queue_failed", {
      bookingId: details.id,
      error: error instanceof Error ? error.message : "Unknown email queue error",
    });

    return {
      status: "failed",
      reason: "Booking was saved, but notification queueing failed.",
    };
  }
}
