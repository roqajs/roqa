# create-roqa

Scaffolds a Roqa frontend package starter for building a new authoring format.

## Usage

```bash
npm create roqa@latest my-roqa-frontend
```

The generated project includes:

- A starter frontend that implements the `RoqaFrontend` interface
- Copied frontend interface types in `types/index.d.ts`
- A placeholder Vitest test so humans and agents do not need to bootstrap test wiring
- Reference `.roqa` files you can compare your frontend output against
- An `AGENTS.md` file and a `create-roqa-frontend` skill for agent collaborators

## Development

```bash
npm run build
node ./dist/index.js ../tmp/my-roqa-frontend
```
