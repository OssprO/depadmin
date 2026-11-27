import { describe, expect, it } from 'vitest';
import { markNoticesReadRequestSchema, publishNoticeRequestSchema } from './notices.js';

describe('notice contracts', () => {
  it('trims a notice and keeps the line breaks inside it', () => {
    expect(
      publishNoticeRequestSchema.parse({
        title: '  Corte de agua ',
        body: '\nEl jueves de 9 a 14.\n\nLlenen sus tinacos.  ',
        expiresOn: '2026-12-03',
      }),
    ).toEqual({
      title: 'Corte de agua',
      body: 'El jueves de 9 a 14.\n\nLlenen sus tinacos.',
      expiresOn: '2026-12-03',
    });
  });

  it('needs a title and a text within their limits, and a real day or none', () => {
    const notice = { title: 'Junta', body: 'El sábado a las 10.', expiresOn: null };
    expect(publishNoticeRequestSchema.safeParse(notice).success).toBe(true);
    for (const wrong of [
      { ...notice, title: '   ' },
      { ...notice, title: 'x'.repeat(101) },
      { ...notice, body: '' },
      { ...notice, body: 'x'.repeat(2001) },
      { ...notice, expiresOn: '2026-02-30' },
    ]) {
      expect(publishNoticeRequestSchema.safeParse(wrong).success, JSON.stringify(wrong)).toBe(
        false,
      );
    }
  });

  it('marks at least one notice as read, by its id', () => {
    expect(markNoticesReadRequestSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(markNoticesReadRequestSchema.safeParse({ ids: ['501'] }).success).toBe(false);
  });
});
