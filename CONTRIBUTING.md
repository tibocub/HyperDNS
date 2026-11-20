# Contributing

1. Clone [hypergraph](../hypergraph) next to this repo, then `npm install`.
2. Read `.specify/memory/constitution.md`. In short: `resolve()` stays deterministic and reads one space only, and
   every change ships with a `brittle` test in `test/brittle/`.
3. Run `npm run typecheck`, `npm test` and `npm run test:bare` before sending a change. Set `TMP`/`TEMP` (and `HG_TEST_TMP`) to a disk
   with room if your system temp is small.
4. Comments explain why, not what. Public functions in `src/` get JSDoc. Update `docs/` when behaviour changes.
5. Features go through `specs/<NNN-name>/` (spec-kit) on a branch of the same name.
