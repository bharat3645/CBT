import * as React from 'react';
import { Html, Head, Body, Container, Heading, Text, Button, Hr, Preview } from '@react-email/components';
import { render } from '@react-email/render';

interface BaseProps { title: string; body: string; ctaUrl?: string; ctaLabel?: string }

export function NotificationEmail({ title, body, ctaUrl, ctaLabel }: BaseProps) {
  return (
    <Html>
      <Head />
      <Preview>{title}</Preview>
      <Body style={{ fontFamily: 'Arial, sans-serif', background: '#f6f7f9', padding: 24 }}>
        <Container style={{ background: '#fff', padding: 24, borderRadius: 8, maxWidth: 520 }}>
          <Heading as="h2" style={{ margin: '0 0 12px' }}>{title}</Heading>
          <Text style={{ fontSize: 15, lineHeight: '22px' }}>{body}</Text>
          {ctaUrl ? <Button href={ctaUrl} style={{ background: '#1d4ed8', color: '#fff', padding: '10px 18px', borderRadius: 6 }}>{ctaLabel ?? 'Open'}</Button> : null}
          <Hr />
          <Text style={{ fontSize: 12, color: '#6b7280' }}>
            Institute mock rank: not an official entrance exam rank. You can change notification preferences in the app.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const APP_URL = process.env.WEB_ORIGIN ?? 'http://localhost:3000';

/** Default `render` for NotifyDeps. */
export async function renderEmail(n: { type: string; title: string; body: string; data: Record<string, unknown> }) {
  const attemptId = typeof n.data.attemptId === 'string' ? n.data.attemptId : null;
  const ctaUrl = attemptId && n.type.startsWith('result_') ? `${APP_URL}/results/${attemptId}` : undefined;
  const el = <NotificationEmail title={n.title} body={n.body} ctaUrl={ctaUrl} ctaLabel="View result" />;
  return {
    subject: n.title,
    html: await render(el),
    text: await render(el, { plainText: true }),
  };
}
