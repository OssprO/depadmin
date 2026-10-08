# Módulos de negocio

Cada módulo (`identity`, `units`, `shifts`, `cashbook`, `billing`, `reports`, `audit`) sigue la misma estructura hexagonal:

```
modules/<módulo>/
├── domain/          Entidades, value objects, servicios de dominio y puertos de repositorio (interfaces).
│                    TypeScript puro: no importa Nest, Prisma ni otros módulos.
├── application/     Casos de uso (una clase por caso de uso) y puertos de entrada.
│                    Depende solo de su propio dominio y de shared-kernel.
├── infrastructure/  Adaptadores de salida: repositorios Prisma, mappers, servicios externos.
├── http/            Adaptadores de entrada: controllers, validación Zod, presenters.
└── <módulo>.module.ts   Composición: une puertos con adaptadores mediante tokens de inyección.
```

## Regla de dependencias

```
http ──► application ──► domain ◄── infrastructure
                            │
                            ▼
                      shared-kernel
```

- El dominio no conoce a nadie; todos lo conocen a él.
- Un módulo usa a otro solo a través de sus casos de uso o queries de `application/`, nunca de su `domain/` ni de sus repositorios.
- ESLint (`eslint-plugin-boundaries`) rechaza cualquier import que rompa esta regla.

Ver `docs/adr/0002-arquitectura-hexagonal.md`.
