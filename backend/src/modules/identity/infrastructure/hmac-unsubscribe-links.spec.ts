import { describe, expect, it } from 'vitest';
import { HmacUnsubscribeLinks } from './hmac-unsubscribe-links.js';

const SECRET = 'a-secret-of-at-least-thirty-two-characters';
const subject = {
  userId: '5f0c6a2e-8d3b-4f1a-9c7e-2b6d8e4f1a3c',
  topic: 'NOTICES',
  email: 'vecina@ejemplo.mx',
} as const;

describe('HmacUnsubscribeLinks', () => {
  const links = new HmacUnsubscribeLinks(SECRET);

  it('signs a link that names the account and the topic, and checks it', () => {
    const token = links.issue(subject);

    expect(token).toMatch(/^5f0c6a2e-[\w-]+\.NOTICES\.[\w-]{22}$/);
    expect(links.read(token)).toEqual({ userId: subject.userId, topic: 'NOTICES' });
    expect(links.verify(token, subject)).toBe(true);
  });

  it('stops working once the account has another address', () => {
    const token = links.issue(subject);

    expect(links.verify(token, { ...subject, email: 'nueva@ejemplo.mx' })).toBe(false);
  });

  it('refuses a link changed by hand or signed with another secret', () => {
    const token = links.issue(subject);
    const [, , signature] = token.split('.');
    const other = '0b1d3f5a-7c9e-4a2b-8d6f-1e3a5c7b9d0f';

    expect(links.verify(`${other}.NOTICES.${signature}`, { ...subject, userId: other })).toBe(
      false,
    );
    expect(links.verify(`${token.slice(0, -2)}AA`, subject)).toBe(false);
    expect(links.verify(`${token}A`, subject)).toBe(false);
    expect(new HmacUnsubscribeLinks(`${SECRET}!`).verify(token, subject)).toBe(false);
  });

  it.each(['', 'nada', 'a.NOTICES', 'a.VOTES.firma', 'a b.NOTICES.firma', 'a.NOTICES.firma.más'])(
    'reads nothing from "%s"',
    (token) => {
      expect(links.read(token)).toBeNull();
    },
  );
});
