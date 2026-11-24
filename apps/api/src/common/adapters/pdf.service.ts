import { Inject, Injectable } from "@nestjs/common";
import type { Env } from "@cbt/config";
import { ENV } from "../db/db.module";

export abstract class PdfService {
  abstract htmlToPdf(html: string, opts?: { paper?: "A4" | "Letter" }): Promise<Buffer>;
}

/** Gotenberg (Chromium) implementation. */
@Injectable()
export class GotenbergPdfService extends PdfService {
  constructor(@Inject(ENV) private readonly env: Env) {
    super();
  }
  async htmlToPdf(html: string): Promise<Buffer> {
    const form = new FormData();
    form.append("files", new Blob([html], { type: "text/html" }), "index.html");
    const res = await fetch(`${this.env.GOTENBERG_URL}/forms/chromium/convert/html`, { method: "POST", body: form });
    if (!res.ok) throw new Error(`Gotenberg ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
}
