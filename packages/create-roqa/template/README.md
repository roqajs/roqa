# %PROJECT_NAME%

This package is a starter kit for building a new TypeScript and Vite-based Roqa frontend.

## What this scaffold includes

- `src/index.ts` is the frontend entrypoint that implements the `RoqaFrontend` Vite plugin interface.
- `types/index.d.ts` defines the frontend interface your package should implement.
- `tests/index.test.ts` contains fixture-based checks for `your_frontend()`.
- `tests/fixtures/*.roqa` are real Roqa IR examples you can compare against while implementing new syntax or tooling.
- `AGENTS.md` and `.agents/skills/create-roqa-frontend/SKILL.md` give high-level guidance for humans and agents.

## Getting started

```bash
npm install
npm test
npx tsc --noEmit
```

Then edit `src/index.ts`, `tests/index.test.ts`, and the fixture files in `tests/fixtures/`.

## Frontend workflow

1. Design your frontend authoring format.
2. Implement `handles(id)` and `toMIR(code, id)` in `src/index.ts`.
3. Parse your source format into your own high-level IR or AST.
4. Normalize that structure into valid `ComponentIR` objects.
5. Compare your output against the reference `.roqa` fixtures in `tests/fixtures/`.
