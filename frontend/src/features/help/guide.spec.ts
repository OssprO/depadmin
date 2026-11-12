import { describe, expect, it } from 'vitest';
import { GUIDE } from './guide';

// The screenshots the guide shows, as e2e/guide/ saves them (only the names matter here).
const saved = Object.keys(import.meta.glob('/public/help/*.png')).map((path) =>
  path.replace(/^\/public\/help\/(.+)\.png$/, '$1'),
);
const steps = GUIDE.flatMap((topic) => topic.sections.flatMap((section) => section.steps));
const shots = steps.flatMap((step) => (step.shot ? [step.shot] : []));

describe('the guide', () => {
  it('gives every task its own address', () => {
    const slugs = GUIDE.map((topic) => topic.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('has a saved screenshot for every step that shows one, and none left over', () => {
    expect(new Set(shots).size).toBe(shots.length);
    expect([...saved].sort()).toEqual([...shots].sort());
  });

  it('describes every screenshot for screen readers', () => {
    expect(steps.filter((step) => step.shot && !step.alt)).toEqual([]);
  });
});
