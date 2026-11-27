import { describe, expect, it } from 'vitest';
import { FOOTER, layOut, UNSUBSCRIBE } from './email-layout.js';

describe('layOut', () => {
  const email = {
    to: 'vecina@ejemplo.mx',
    subject: 'Recupera tu contraseña de DepAdmin',
    paragraphs: ['Alguien pidió cambiar la contraseña de la cuenta «501».', 'Vence en 1 hora.'],
    action: { label: 'Elegir una contraseña nueva', path: '/reset-password#abc_123' },
    unsubscribe: null,
  };

  it('writes the link out in the text, after the paragraphs, and the footer last', () => {
    const { text } = layOut(email, 'https://depadmin.osspro.site');

    expect(text.split('\n\n')).toEqual([
      'Alguien pidió cambiar la contraseña de la cuenta «501».',
      'Vence en 1 hora.',
      'Elegir una contraseña nueva: https://depadmin.osspro.site/reset-password#abc_123',
      '—',
      FOOTER,
    ]);
  });

  it('puts the same words, a button and the written link in the HTML', () => {
    const { html } = layOut(email, 'https://depadmin.osspro.site');

    expect(html).toContain('<html lang="es">');
    expect(html).toContain('la cuenta «501».');
    expect(html).toContain('href="https://depadmin.osspro.site/reset-password#abc_123"');
    expect(html.match(/reset-password#abc_123/g)).toHaveLength(2);
    expect(html).toContain('No respondas: nadie lee este buzón.');
  });

  it('escapes what it writes into the HTML', () => {
    const { html } = layOut(
      { ...email, paragraphs: ['<script>alert("x")</script> & más'], action: null },
      'https://depadmin.osspro.site',
    );

    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; más');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<a ');
  });

  it('ends an optional email with its way out, in the text and the HTML (ADR-0034)', () => {
    const notice = {
      ...email,
      unsubscribe: { page: '/email/unsubscribe#u.NOTICES.firma', oneClick: '/api/email/x' },
    };
    const { text, html } = layOut(notice, 'https://depadmin.osspro.site');

    expect(text.split('\n\n').at(-1)).toBe(
      `${UNSUBSCRIBE}: https://depadmin.osspro.site/email/unsubscribe#u.NOTICES.firma`,
    );
    expect(html).toContain(
      `<a href="https://depadmin.osspro.site/email/unsubscribe#u.NOTICES.firma" style="color:#52606d">${UNSUBSCRIBE}</a>`,
    );
    expect(layOut(email, 'https://depadmin.osspro.site').html).not.toContain(UNSUBSCRIBE);
  });
});
