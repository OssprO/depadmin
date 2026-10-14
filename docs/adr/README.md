# Registro de decisiones de arquitectura (ADR)

Cada ADR documenta una decisión: el contexto, lo que se decidió y sus consecuencias. Un ADR aceptado no se edita; si la decisión cambia, se escribe uno nuevo que lo reemplace y se marca el anterior como _Reemplazado por ADR-XXXX_.

| ADR                                    | Decisión                                           | Estado   |
| -------------------------------------- | -------------------------------------------------- | -------- |
| [0001](0001-monorepo-pnpm.md)          | Monorepo con pnpm workspaces                       | Aceptado |
| [0002](0002-arquitectura-hexagonal.md) | Arquitectura hexagonal en el backend               | Aceptado |
| [0003](0003-prisma.md)                 | Prisma como capa de persistencia                   | Aceptado |
| [0004](0004-contratos-zod.md)          | Contratos compartidos con Zod                      | Aceptado |
| [0005](0005-autenticacion.md)          | JWT de acceso + refresh token rotativo en cookie   | Aceptado |
| [0006](0006-stack-frontend.md)         | React + TanStack Router/Query + shadcn (Base UI)   | Aceptado |
| [0007](0007-pdf.md)                    | PDF con @react-pdf/renderer                        | Aceptado |
| [0008](0008-pruebas.md)                | Vitest + Testcontainers + Playwright               | Aceptado |
| [0009](0009-despliegue.md)             | Docker Compose + Caddy en VPS                      | Aceptado |
| [0010](0010-convenciones-dominio.md)   | Dinero en centavos, código en inglés, base de caja | Aceptado |
| [0011](0011-nest12-esm-eslint.md)      | NestJS 12 en ESM, ESLint como único linter         | Aceptado |
| [0012](0012-persistencia.md)           | Convenciones de persistencia (Prisma 7)            | Aceptado |
| [0013](0013-identidad-y-sesion.md)     | Identidad, sesión y autorización                   | Aceptado |
| [0014](0014-bitacora.md)               | Bitácora de auditoría en la capa de aplicación     | Aceptado |

Plantilla: copia cualquier ADR y conserva las secciones _Contexto_, _Decisión_ y _Consecuencias_.
