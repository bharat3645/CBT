'use client';
import { useEffect, useRef } from 'react';

/** MathLive `<math-field>` wrapper. Loads MathLive on the client only. */
export function MathField({ value, onChange, autoFocus }: { value: string; onChange: (latex: string) => void; autoFocus?: boolean }) {
  const ref = useRef<HTMLElement & { value: string; focus(): void }>(null);

  useEffect(() => {
    let cancelled = false;
    let detach = () => {};
    void import('mathlive').then(() => {
      const el = ref.current;
      if (cancelled || !el) return;
      el.value = value;
      const handler = () => onChange(el.value);
      el.addEventListener('input', handler);
      detach = () => el.removeEventListener('input', handler);
      if (autoFocus) el.focus();
    });
    return () => {
      cancelled = true;
      detach();
    };
    // value is only the initial value; MathLive owns the state afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // @ts-expect-error custom element registered by mathlive
  return <math-field ref={ref} style={{ display: 'block', width: '100%', fontSize: '1.25rem', padding: '0.5rem' }} />;
}
