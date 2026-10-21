import { z } from 'zod';

// Zod compiles parsers with `new Function` when it can, and finds out by trying it when a
// schema is built. The SPA's Content-Security-Policy forbids eval
// (infra/web/security-headers.conf), so the attempt would only log a violation in every
// browser. Imported first by index.ts, before any schema here is built; the bundler puts this
// package in the same chunk as zod, so it also runs before the frontend's own schemas. The
// API validates small bodies, where the compiled parsers gain nothing noticeable.
z.config({ jitless: true });
