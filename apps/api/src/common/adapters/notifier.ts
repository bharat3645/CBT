import { Injectable, Logger } from "@nestjs/common";

export interface Notification {
  /** email address (phone/WhatsApp channels arrive in phase 2) */
  to: string;
  template: "password-reset" | "welcome" | "institute-approved" | "institute-suspended" | (string & {});
  data: Record<string, unknown>;
  /** idempotency key; the notifications module (M8) dedupes on it */
  dedupeKey?: string;
}

export abstract class Notifier {
  abstract send(n: Notification): Promise<void>;
}

/** Default until M8 provides the outbox-backed Notifier: logs only (never logs reset links in production). */
@Injectable()
export class LogNotifier extends Notifier {
  private readonly log = new Logger("Notifier");
  readonly sent: Notification[] = [];
  async send(n: Notification) {
    this.sent.push(n);
    this.log.log(`${n.template} -> ${n.to}${process.env.NODE_ENV === "production" ? "" : " " + JSON.stringify(n.data)}`);
  }
}
