import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * HTTP-level setup shared by `main.ts` and the e2e tests, so tests exercise
 * the same routing and middleware as production.
 */
export function configureApp(app: NestExpressApplication): NestExpressApplication {
  app.disable('x-powered-by');
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  return app;
}
