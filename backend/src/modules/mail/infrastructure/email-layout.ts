import type { EmailToSend } from '../domain/index.js';

/** Under every email: nobody reads replies, and the building's questions have an owner. */
export const FOOTER =
  'Este correo lo envió DepAdmin, la app de tu edificio. No respondas: nadie lee este buzón. Si tienes dudas, habla con el administrador en turno.';

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );

/**
 * An email as it goes out: plain text, and HTML with the same words. The button's link is
 * also written out, for mail apps that hide buttons. `appUrl` goes in front of its path.
 */
export function layOut(email: EmailToSend, appUrl: string): { text: string; html: string } {
  const url = email.action && `${appUrl}${email.action.path}`;
  const text = [
    ...email.paragraphs,
    ...(email.action && url ? [`${email.action.label}: ${url}`] : []),
    '—',
    FOOTER,
  ].join('\n\n');

  const paragraph = (words: string) =>
    `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#1f2933">${escapeHtml(words)}</p>`;
  const button =
    email.action && url
      ? `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 20px;border-radius:6px;background:#1f2933;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none">${escapeHtml(email.action.label)}</a></p>` +
        `<p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#52606d">Si el botón no abre, copia este enlace en tu navegador:<br><span style="word-break:break-all">${escapeHtml(url)}</span></p>`
      : '';
  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(email.subject)}</title></head>
<body style="margin:0;padding:0;background:#f5f7fa">
<div style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">
<p style="margin:0 0 24px;font-size:18px;font-weight:700;color:#1f2933">DepAdmin</p>
${email.paragraphs.map(paragraph).join('\n')}
${button}
<hr style="margin:32px 0 16px;border:none;border-top:1px solid #d9e2ec">
<p style="margin:0;font-size:12px;line-height:1.5;color:#7b8794">${escapeHtml(FOOTER)}</p>
</div>
</body>
</html>`;
  return { text, html };
}
