import { Injectable } from '@nestjs/common';

/** Adapter rule: business code depends on PdfService only. */
export abstract class PdfService {
  abstract htmlToPdf(html: string): Promise<Buffer>;
}

/** Gotenberg (Chromium route). GOTENBERG_URL e.g. http://gotenberg:3000 */
@Injectable()
export class GotenbergPdfService extends PdfService {
  private get baseUrl() {
    return process.env.GOTENBERG_URL ?? 'http://localhost:3100';
  }

  async htmlToPdf(html: string): Promise<Buffer> {
    const form = new FormData();
    form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
    form.append('paperWidth', '8.27'); // A4
    form.append('paperHeight', '11.7');
    form.append('printBackground', 'true');
    form.append('waitDelay', '300ms');
    const res = await fetch(`${this.baseUrl}/forms/chromium/convert/html`, { method: 'POST', body: form });
    if (!res.ok) throw new Error(`Gotenberg ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return Buffer.from(await res.arrayBuffer());
  }
}
