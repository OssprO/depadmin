# DepAdmin

Administración de las cuotas de mantenimiento del **Edificio Correspondencia 63**: ingresos, egresos, turnos de administración y el reporte mensual, desde el celular.

- Reglas de negocio: [`docs/SPEC.md`](docs/SPEC.md)
- Plan de trabajo y arquitectura: [`docs/PLAN.md`](docs/PLAN.md)
- Decisiones técnicas: [`docs/adr/`](docs/adr/README.md)

## Requisitos

- Node 24 o superior (`.nvmrc`)
- pnpm 11 (`corepack enable` toma la versión de `package.json`)
- Docker, para la base de datos local

## Arranque rápido

```bash
pnpm install                       # instala todo y compila @depadmin/shared
cp backend/.env.example backend/.env
pnpm db:up                         # Postgres 18 en localhost:5433
pnpm dev                           # API en :3000 y web en :5173
```

Abre <http://localhost:5173>. La tarjeta _Estado del sistema_ confirma que el frontend se comunica con la API.

## Comandos

| Comando                       | Qué hace                                                            |
| ----------------------------- | ------------------------------------------------------------------- |
| `pnpm dev`                    | Levanta shared (watch), API y web en paralelo                       |
| `pnpm build`                  | Compila los tres paquetes                                           |
| `pnpm lint`                   | ESLint en todo el repo, incluida la regla de arquitectura hexagonal |
| `pnpm format`                 | Prettier en todo el repo                                            |
| `pnpm typecheck`              | TypeScript en los tres paquetes                                     |
| `pnpm test`                   | Pruebas unitarias (Vitest)                                          |
| `pnpm test:e2e`               | Pruebas e2e de la API                                               |
| `pnpm db:up` / `pnpm db:down` | Levanta o detiene la base de datos local                            |

## Estructura

```
backend/            API NestJS 12 (hexagonal: src/modules, src/shared-kernel, src/platform)
frontend/           SPA React 19 + Vite (src/app, src/features, src/components/ui)
packages/shared/    Contratos Zod compartidos por API y web
infra/              Docker Compose
docs/               Spec, plan y ADRs
```

## Convenciones

- Commits con [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`…), validados por commitlint.
- Antes de cada commit, lint-staged ejecuta ESLint y Prettier sobre los archivos modificados.
- Código en inglés, interfaz y documentación en español.
