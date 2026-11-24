import nodemailer from 'nodemailer';
import type { Notifier } from '../processors/notify';

/** Email adapter over SMTP (Postal/any provider). Swap for Novu/SES by implementing Notifier. */
export function createSmtpNotifier(smtpUrl: string, from = 'no-reply@cbt.local'): Notifier {
  const transport = nodemailer.createTransport(smtpUrl);
  return {
    channel: 'email',
    async send({ to, subject, html, text }) {
      await transport.sendMail({ from, to, subject, html, text });
    },
  };
}
