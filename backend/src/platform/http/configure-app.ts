import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Env } from '../config/env.js';
import { ProblemDetailsFilter } from './problem-details.filter.js';

/**
 * HTTP-level setup shared by `main.ts` and the e2e tests, so tests exercise
 * the same routing and middleware as production.
 *
 * No CORS: the SPA and the API share an origin (Vite's proxy in development, nginx in
 * production), so the browser's same-origin policy is the whole policy.
 */
export function configureApp(app: NestExpressApplication): NestExpressApplication {
  app.disable('x-powered-by');
  // Behind nginx every request comes from the proxy; trusting it gives the login limit the
  // client's IP (docs/adr/0026-despliegue-con-nginx.md).
  const proxies = app
    .get<ConfigService<Env, true>>(ConfigService)
    .get('TRUST_PROXY', { infer: true });
  if (proxies.length > 0) app.set('trust proxy', proxies);
  app.use(helmet());
  app.use(cookieParser());
  // The history import file (ADR-0023) is about 200 KB; everything else is far smaller.
  // Registered here, Nest skips its default parser (100 KB).
  app.useBodyParser('json', { limit: '1mb' });
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableShutdownHooks();
  return app;
}
