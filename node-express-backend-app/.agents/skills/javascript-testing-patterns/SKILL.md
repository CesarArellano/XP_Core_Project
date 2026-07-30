---
name: javascript-testing-patterns
description: Write and structure Vitest tests for Node.js/Express backends — API (component) testing with supertest, test naming, AAA structure, coverage thresholds, and per-test data isolation. Use when writing or reviewing test files, setting up a test runner, or deciding what to test first in a Node.js API.
---

# JavaScript Testing Patterns

Testing conventions for this stack: Vitest as the runner, `supertest` for API/component tests
against an Express app instance, Vitest's built-in esbuild transform for TS (see
`references/vitest-setup.md` for repo-specific setup notes). For Vitest API specifics (mocking,
`vi.fn`, assertions), see the installed `vitest-testing` skill instead of duplicating that here.

## When to Use This Skill

- Writing a new test file for a route, service, or utility
- Setting up Vitest in a fresh Node.js/TypeScript project
- Deciding what kind of test to write first for an untested endpoint
- Reviewing a test file for structure or naming issues

## Priority order

1. **API (component) tests first.** They're the fastest way to get real coverage — one test
   through `supertest` against the app exercises routing, middleware, and handler logic together.
   Reach for unit tests afterward, for logic complex enough to warrant isolating from HTTP
   (validation edge cases, pure functions, error-branch coverage on a service).
2. Don't start with unit tests "because they're supposed to come first" — a project can sink weeks
   into unit tests and land at 20% real coverage. A `supertest` call per endpoint gets broad
   coverage in a fraction of the time.

## Test naming — 3 parts, always

Name every test so it reads as a requirement, not an implementation detail: **unit under test**,
**circumstance**, **expected result**. A failing test named "returns 404" tells you nothing when a
deploy breaks; a name like the one below tells you exactly what's wrong without opening the file.

```ts
describe('GET /users/:id', () => {
  it('returns a 404 with an error message when the user does not exist', async () => {
    ...
  });
});
```

`describe` carries the unit under test (the route/function), `it` carries circumstance + expected
result. Don't write bare-verb names (`it('works')`, `it('should return')` with no circumstance).

## Structure — Arrange, Act, Assert

Every test body separates into three visually distinct sections, in this order, with a blank line
or comment between them. This is non-negotiable for readability — a reader should never have to
untangle setup from the thing being tested from the check.

```ts
it('returns a 200 with the created user when the payload is valid', async () => {
  // Arrange
  const app = createApp();
  const payload = { name: 'Test User', email: 'test@example.com' };

  // Act
  const response = await request(app).post('/users').send(payload);

  // Assert
  expect(response.status).toBe(201);
  expect(response.body).toMatchObject({ name: payload.name, email: payload.email });
});
```

Don't interleave: arranging more data mid-test after an assertion, or asserting inside a loop that's
still "acting", defeats the point of AAA.

## Testing against the app, not a running server

Keep route factories (`createApp()`) decoupled from `app.listen()` — see `src/app.ts` in this repo.
`supertest` takes the Express app instance directly and binds an ephemeral port per test run; there
is no reason to start a real server, hit a hardcoded `localhost:PORT`, or manage server
lifecycle/teardown in test files.

```ts
import request from 'supertest';
import { createApp } from '../app.ts';

const app = createApp();
const response = await request(app).get('/health');
```

## Per-test data, not global fixtures

Once tests touch a database, each test creates the exact rows it needs and doesn't rely on
seed data planted by a global `beforeAll`/fixture file. Shared fixtures cause tests to pass or fail
based on execution order and interfere with each other in ways that are hard to reproduce locally —
a failing suite in CI stops being a signal of a real bug and starts being a coin flip. If a test
needs a user in the DB, it inserts that user itself (and cleans it up, or runs in a transaction
that's rolled back) rather than depending on a shared fixture.

## Coverage

Coverage is a diagnostic tool, not a target to chase for its own sake. Watch two things in a
coverage report: dropping trend (a real regression signal, wire `coverage.thresholds` in
`vitest.config.ts` to fail the build below a floor) and uncovered branches inside `catch` blocks or
error paths (usually means tests only exercise the happy path). This repo's `vitest.config.ts` sets
a 70% floor across statements/branches/functions/lines (v8 provider) — raise it as real coverage
grows, don't lower it to make a red build pass.

## Do not

- Don't name a test after an implementation detail ("calls the repository") — name it after the
  observable behavior and circumstance.
- Don't nest Arrange/Act/Assert out of order, or split Act across multiple non-adjacent statements.
- Don't spin up a real HTTP server (`app.listen()`) in a test file — pass the app instance to
  `supertest` directly.
- Don't add a global test fixture/seed file once a DB is involved — insert what each test needs,
  in that test.
- Don't lower `coverage.thresholds` to unblock a failing build — add the missing test instead.
