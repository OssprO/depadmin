import { expect } from '@playwright/test';

// The stack's Mailpit (support/stack.ts), through its API: what the app sent, as it left.

interface Summary {
  readonly ID: string;
  readonly Subject: string;
  readonly To: readonly { readonly Address: string }[];
}

export interface Email {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

const api = (path: string) => {
  const url = process.env['MAILPIT_URL'];
  if (!url) throw new Error('MAILPIT_URL is not set: the stack starts Mailpit');
  return `${url}/api/v1${path}`;
};

/** Waits for the newest email to `to` with `subject`, and reads it. */
export async function emailTo(to: string, subject: string): Promise<Email> {
  let found: Summary | undefined;
  await expect
    .poll(
      async () => {
        const response = await fetch(api(`/search?query=${encodeURIComponent(`to:${to}`)}`));
        const { messages } = (await response.json()) as { messages: Summary[] };
        found = messages.find((message) => message.Subject === subject);
        return found !== undefined;
      },
      { message: `an email to ${to}: ${subject}`, timeout: 15_000 },
    )
    .toBe(true);
  const message = (await (await fetch(api(`/message/${found!.ID}`))).json()) as {
    Subject: string;
    Text: string;
    HTML: string;
  };
  return { subject: message.Subject, text: message.Text, html: message.HTML };
}

/** The link an email carries, as its text writes it out. */
export function linkIn(email: Email): string {
  const link = /https?:\/\/\S+#\S+/.exec(email.text)?.[0];
  if (!link) throw new Error(`No link in "${email.subject}"`);
  return link;
}
