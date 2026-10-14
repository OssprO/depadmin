import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { ProblemDetailsFilter } from './problem-details.filter.js';

/**
 * HTTP-level setup shared by `main.ts` and the e2e tests, so tests exercise
 * the same routing and middleware as production.
 *
 * No CORS: the SPA and the API share an origin (Vite's proxy in development, Caddy in
 * production), so the browser's same-origin policy is the whole policy.
 */
export function configureApp(app: NestExpressApplication): NestExpressApplication {
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableShutdownHooks();
  return app;
}
