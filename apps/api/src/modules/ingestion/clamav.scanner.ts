import { Injectable } from '@nestjs/common';
import { Socket } from 'node:net';
import type { ScanResult, VirusScanner } from './ingestion.ports';

/** ClamAV runs as a separate unmodified service (clamd, INSTREAM protocol over TCP). */
@Injectable()
export class ClamAvScanner implements VirusScanner {
  private readonly host = process.env.CLAMAV_HOST ?? 'localhost';
  private readonly port = Number(process.env.CLAMAV_PORT ?? 3310);
  private readonly timeoutMs = 30_000;

  scan(body: Buffer): Promise<ScanResult> {
    return new Promise((resolve) => {
      const sock = new Socket();
      let out = '';
      const fail = (detail: string) => {
        sock.destroy();
        resolve({ status: 'error', detail });
      };
      sock.setTimeout(this.timeoutMs, () => fail('clamd timeout'));
      sock.on('error', (e) => fail(e.message));
      sock.on('data', (d) => (out += d.toString()));
      sock.on('end', () => resolve(parseClamReply(out)));
      sock.connect(this.port, this.host, () => {
        sock.write('zINSTREAM\0');
        const CHUNK = 64 * 1024;
        for (let i = 0; i < body.length; i += CHUNK) {
          const chunk = body.subarray(i, i + CHUNK);
          const len = Buffer.alloc(4);
          len.writeUInt32BE(chunk.length);
          sock.write(len);
          sock.write(chunk);
        }
        sock.write(Buffer.alloc(4)); // zero-length terminator
      });
    });
  }
}

export function parseClamReply(reply: string): ScanResult {
  const r = reply.replace(/\0/g, '').trim();
  if (/OK$/.test(r)) return { status: 'clean' };
  const m = /stream:\s*(.+)\s+FOUND$/.exec(r);
  if (m) return { status: 'infected', signature: m[1]! };
  return { status: 'error', detail: r || 'empty clamd reply' };
}
