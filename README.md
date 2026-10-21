# DepAdmin

Administración de las cuotas de mantenimiento del **Edificio Correspondencia 63**: ingresos, egresos, turnos de administración y el reporte mensual, desde el celular.

- Reglas de negocio: [`docs/SPEC.md`](docs/SPEC.md)
- Plan de trabajo y arquitectura: [`docs/PLAN.md`](docs/PLAN.md)
- Decisiones técnicas: [`docs/adr/`](docs/adr/README.md)
- Despliegue en el VPS, paso a paso: [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md)

## Requisitos

- Node 24 o superior (`.nvmrc`)
- pnpm 11 (`corepack enable` toma la versión de `package.json`)
- Docker, para la base de datos local

## Arranque rápido

```bash
pnpm install                       # instala todo y compila @depadmin/shared
cp backend/.env.example backend/.env   # define JWT_SECRET y SUPERADMIN_PASSWORD
pnpm db:up                         # Postgres 18 en localhost:5433
pnpm --filter @depadmin/backend db:migrate   # aplica las migraciones
pnpm --filter @depadmin/backend db:seed      # 10 deptos, sus cuentas, el superadmin y las tarifas
pnpm dev                           # API en :3000 y web en :5173
```

Abre <http://localhost:5173> y entra con el superadmin. Desde _Usuarios_ das acceso a cada depto con una contraseña temporal.

## Comandos

| Comando                       | Qué hace                                                             |
| ----------------------------- | -------------------------------------------------------------------- |
| `pnpm dev`                    | Levanta shared (watch), API y web en paralelo                        |
| `pnpm build`                  | Compila los tres paquetes                                            |
| `pnpm lint`                   | ESLint en todo el repo, incluida la regla de arquitectura hexagonal  |
| `pnpm format`                 | Prettier en todo el repo                                             |
| `pnpm typecheck`              | TypeScript en los tres paquetes                                      |
| `pnpm test`                   | Pruebas unitarias (Vitest)                                           |
| `pnpm test:int`               | Pruebas de integración contra PostgreSQL real (requiere Docker)      |
| `pnpm test:e2e`               | Pruebas e2e de la API                                                |
| `pnpm test:browser`           | Flujos completos en Chromium móvil (Playwright); antes, `pnpm build` |
| `pnpm db:up` / `pnpm db:down` | Levanta o detiene la base de datos local                             |

## Estructura

```
backend/            API NestJS 12 (hexagonal: src/modules, src/shared-kernel, src/platform)
frontend/           SPA React 19 + Vite (src/app, src/features, src/components/ui)
packages/shared/    Contratos Zod compartidos por API y web
e2e/                Pruebas de navegador (Playwright) contra el sistema completo
infra/              Docker Compose (desarrollo y producción), nginx y scripts del VPS
docs/               Spec, plan y ADRs
```

## Convenciones

- Commits con [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`…), validados por commitlint.
- Antes de cada commit, lint-staged ejecuta ESLint y Prettier sobre los archivos modificados.
- Código en inglés, interfaz y documentación en español.
