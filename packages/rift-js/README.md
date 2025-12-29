# rift-js

A compile-time reactive UI framework for building web components with JSX syntax.

## Testing

This package uses [Vitest](https://vitest.dev/) for testing with a dual project configuration:

- **Unit tests** (`tests/compiler/`, `tests/integration/`) run in Node.js
- **Browser tests** (`tests/runtime/`) run in a real browser using Playwright

### Prerequisites

Before running browser tests, install Playwright's Chromium browser:

```bash
npx playwright install chromium
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run only unit tests (compiler/integration)
pnpm test:unit

# Run only browser tests (runtime)
pnpm test:browser

# Run tests with coverage
pnpm test:coverage
```
