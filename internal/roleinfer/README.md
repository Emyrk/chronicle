# roleinfer

Pure Go implementation of Chronicle's source-aware tank-role inference.

The matching TypeScript implementation lives in
`frontend/chronicle/src/pages/Instance/EventsPanels/Roles/tankInference.ts`.
Both implementations are validated against `testdata/roleinfer/cases.json`.

See [`docs/tank-role-inference.md`](../../docs/tank-role-inference.md) for the
algorithm, constants, diagrams, debugging workflow, and change policy.
