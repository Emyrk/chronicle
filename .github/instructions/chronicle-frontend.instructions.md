---
description: "Use when modifying Chronicle frontend React or TypeScript code, Vite app files, Tailwind styling, shared UI components, or EventsPanels. Covers repo-specific frontend structure, validation, and worker-safe panel rules."
name: "Chronicle Frontend Conventions"
applyTo:
  - "frontend/chronicle/src/**/*.ts"
  - "frontend/chronicle/src/**/*.tsx"
  - "frontend/chronicle/eslint.config.js"
---

# Chronicle Frontend Conventions

- Keep changes minimal and follow the existing React 19, TypeScript, Vite, and Tailwind v4 structure in `frontend/chronicle`.
- Reuse existing frontend patterns before adding abstractions: React Router for routing, TanStack Query for server state, `cn` for class composition, and `cva` for shared UI variants.
- Preserve the current component and folder organization. Shared primitives belong under `components/ui` and feature logic should stay close to the owning page or feature.
- When changing shared UI components, keep Storybook and existing visual variants working.
- Use the repo scripts for focused validation when relevant: `pnpm lint`, `pnpm test`, and `pnpm build` from `frontend/chronicle`.
- If you modify EventsPanels, keep processors worker-safe with no React or JSX in `.processor.ts` files, register processors in `processors/index.ts`, and update the required panel registries documented in `src/pages/Instance/EventsPanels/DESIGN.md`.
- If you touch sync mode behavior, preserve the distinction between worker aggregation and incremental main-thread processing described in `src/pages/Instance/SYNC_MODE.md`.