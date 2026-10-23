import nodemailer from "nodemailer";
import { renderEmailTemplate, EmailRenderInput } from "./templates";

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  isMocked?: boolean;
}

/**
 * Creates and caches the nodemailer transporter using environment configurations.
 */
function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true for 465, false for 587
    auth: {
      user,
      pass,
    },
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === "production",
    },
  });
}

/**
 * Sends a single email using the configured SMTP transporter.
 * If SMTP credentials are missing, it safely falls back to a dry-run log without throwing.
 */
export async function sendEmail(
  recipientEmail: string,
  input: EmailRenderInput
): Promise<SendEmailResult> {
  const transporter = getTransporter();
  const fromAddress = process.env.EMAIL_FROM || "UNB Premium <notifications@unbpremium.pk>";
  const rendered = renderEmailTemplate({ ...input, recipientEmail });

  if (!transporter) {
    // In local development or when SMTP is not yet populated, safely dry-run log
    console.warn(
      `[SMTP Dry-Run] SMTP credentials not fully configured. Email skipped sending to ${recipientEmail}. Subject: "${rendered.subject}"`
    );
    return {
      success: true,
      isMocked: true,
      messageId: `mock-${Date.now()}`,
    };
  }

  try {
    const info = await transporter.sendMail({
      from: fromAddress,
      to: recipientEmail,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    });

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[SMTP Error] Failed sending email to ${recipientEmail}:`, errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
}
