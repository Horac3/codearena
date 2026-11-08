---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.mts"
  - "**/*.cts"
  - "**/package.json"
  - "**/tsconfig*.json"
---

# TypeScript conventions (claude-kit)

- `strict` is on. No `any`; use `unknown` and narrow. No non-null `!` without a comment saying why.
- Validate untrusted input at the boundary with a schema (Zod) and infer types from it. Inside, trust the types.
- Prefer discriminated unions and `Result`-style returns for expected failures; throw only for bugs.
- Named exports. No default exports except where a framework requires them.
- Pure functions for domain logic; side effects at the edges.
- Tests: Vitest. One behaviour per test, named after the behaviour. With Nest decorators, use `unplugin-swc`.
- Dependencies: exact versions (no `^` or `~`); add with the repo's package manager
  (`pnpm add -E` / `npm i -E`), commit the lockfile, never edit the lockfile by hand.
- Monorepo: respect package boundaries; import other packages by name, never by relative path across packages.
- Run Prettier only on files you changed (`prettier --write <files>`), never on a whole directory.
