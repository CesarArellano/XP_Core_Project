You are an expert in TypeScript, Express, and scalable Node.js backend development. You write
functional, maintainable, performant, and secure code following Node.js and Express best practices.

> Verified against this repo (2026-07-30): Node v24.18.0, pinned via `.nvmrc` and
> `engines.node: ">=24"` in `package.json`. Express ^5.2.1, TypeScript ^7.0.2 (strict, `noEmit`),
> ESM (`"type": "module"`), executed directly via `tsx` (no build step), pnpm@10.30.3. Vitest +
> `supertest` are configured for testing (see the Testing section below and the installed
> `javascript-testing-patterns` and `vitest-testing` skills). Project is a fresh scaffold — only
> `app.ts`/`index.ts` and a single `/health` route exist. Layered architecture, validation, logging,
> and auth conventions below are the *defaults to adopt* once real endpoints land, not conventions
> to match, since no prior art exists yet in this repo.

## Project overview

Backend API for the Coke XP CMS. No domain vocabulary, data model, or auth scheme is established
yet at this scaffold stage — add them here once real features land.

## Commands

- `pnpm dev` — `tsx watch src/index.ts`, dev server with reload on save.
- `pnpm start` — `tsx src/index.ts`, runs once (no watch). Runs source directly — there is **no
  build/dist step** (`noEmit: true`, no `build` script); don't assume a compiled artifact exists.
- `pnpm typecheck` — `tsc` (type-check only, `noEmit: true` so this never emits JS).
- `pnpm test` — `vitest run` (config in `vitest.config.ts`). Transform is Vitest's built-in
  esbuild pipeline — no separate transform package (`ts-jest`/`@swc/jest`) needed. Vitest doesn't
  type-check either; type safety during testsvitest still comes from `pnpm typecheck`, run separately.
- `pnpm test:coverage` — `vitest run --coverage`; `vitest.config.ts` sets a 70% floor (v8 provider)
  on statements/branches/functions/lines and fails the run below it.
- Lint/format are **not configured** (no ESLint or Prettier config in the repo) — don't assume
  `pnpm lint` exists.
- This repo uses `pnpm`, not `npm` — enforced by `packageManager` in `package.json` and
  `pnpm-lock.yaml`.
- Node version is pinned to `24` via `.nvmrc` and `engines.node` — don't develop or run CI against
  a different major version.

## Architecture / Folder structure

Current actual layout (flat, scaffold-stage):

- `src/index.ts` — bootstrap: loads `dotenv/config`, reads `PORT`, calls `createApp()`, `listen()`.
- `src/app.ts` — `createApp()` factory wiring global middleware (`cors()`, `express.json()`),
  mounting feature routers, and registering the 404/error-handling middleware last.
- `src/routes/` — one router module per resource (`health.ts` today), mounted in `app.ts`. Routes
  stay thin — a `Router()` plus handler wiring, no business logic inline.

Once real domain logic lands, adopt the layered structure documented in the installed
`nodejs-backend-patterns` skill (`.agents/skills/nodejs-backend-patterns/`) rather than growing fat
route handlers:

- **`controllers/`** — HTTP-layer only: parse `req`, call a service, shape the response, `next(err)`
  on failure.
- **`services/`** — business logic, framework-agnostic.
- **`repositories/`** — data access (DB/queries), isolated behind an interface the service depends
  on.
- **`middleware/`** — auth, validation, rate-limiting, request logging.
- **`utils/errors.ts`** — custom `AppError` subclasses (see Error handling below).
- **`types/`** — shared request/response/domain types.

Don't pre-build these folders speculatively — introduce a layer only when a real feature needs it,
same instinct as keeping `routes/` flat today.

**If this project grows into multiple distinct domains** (e.g. a separate CMS-content concern vs.
an orders/users concern, each with its own data and API surface), structure by business component
before it turns into a tangle of cross-imports: a top-level split like `apps/<component>/` per
domain (each with its own `entry-points/`, `domain/`, `data-access/`) plus a `libraries/` folder for
genuinely cross-component code (logger, auth). This is a scale-triggered decision, not a day-one
one — this scaffold is a single component and should stay flat until a second, distinct domain is
actually being added.

## Best practices

### TypeScript / module conventions (repo-specific, non-obvious)

- **Always write the `.ts` extension on relative imports** (`from './app.ts'`, matching
  `index.ts`/`app.ts` today) — required by `module: nodenext` +
  `rewriteRelativeImportExtensions: true` in `tsconfig.json`. Don't drop the extension or use `.js`
  in source.
- `verbatimModuleSyntax: true` is set — use `import type { ... }` for type-only imports (already
  followed in `app.ts`: `import type { Express, NextFunction, Request, Response } from 'express'`).
  Mixed-use imports need a separate `import type` line for the type-only names.
- `erasableSyntaxOnly: true` is set (this repo relies on `tsx`/Node's type-stripping, not a real
  transpile step) — only TypeScript syntax that erases to nothing is allowed. Concretely:
  - **No constructor parameter-property shorthand** (`constructor(private userService: UserService) {}`)
    — it generates runtime field-assignment code. Declare the field and assign it in the
    constructor body instead:
    ```ts
    class UserService {
      private userRepository: UserRepository;
      constructor(userRepository: UserRepository) {
        this.userRepository = userRepository;
      }
    }
    ```
    This applies directly to the DI examples in the `nodejs-backend-patterns` skill reference —
    port the shape, not the parameter-property shorthand.
  - **No `enum` declarations** (including `const enum`) — use a union type or an `as const` object
    map instead.
  - **No namespaces carrying runtime code** — type-only `declare global { namespace Express {...} }`
    augmentation (interfaces only) is fine; a namespace holding functions/values is not.
- `strict: true` — no implicit `any`; type new handlers/services explicitly.

### Routing & handlers

- Keep routers thin (`src/routes/health.ts` is the pattern to match): `Router()` + inline handler,
  no business logic. Extract to a controller/service once a route does more than a one-line
  response.
- Express 5 (confirmed via `^5.2.1`) **automatically forwards rejected promises** from
  async route handlers/middleware to the error-handling middleware — don't wrap handlers in
  `try/catch` + manual `next(err)` (or an `asyncHandler` wrapper) just to catch rejections; that's
  an Express 4 pattern the skill reference still shows. Still `throw`/`catch` when you need to
  translate a caught error into a specific `AppError` subclass with a real status code.

### Error handling

Current `app.ts` has a generic 404 catch-all and a single error-handling middleware
(`(err, req, res, next) => ...`, 4-arg signature required for Express to recognize it as an error
handler) that logs and returns a bare 500. No custom error classes exist yet. When adding real
endpoints, adopt the `AppError`/`ValidationError`/`NotFoundError`/`UnauthorizedError` pattern from
`nodejs-backend-patterns` (`references/details.md`) so the global handler can branch on
`err instanceof AppError` for the right status code instead of always returning 500. Keep the
error-handling middleware registered **last**, after all routers and the 404 handler (already true
today — preserve that order).

### Validation

No validation library is installed yet. When the first endpoint accepts a body/query/params, add
Zod and a `validate(schema)` middleware per the skill reference rather than hand-rolling checks
inline in handlers.

### Logging

Only `console.log`/`console.error` exist today (`index.ts` listen callback, `app.ts` error
middleware). Adopt structured logging (Pino, per the skill reference) once request-level
observability is needed — don't scatter more `console.*` calls as the API grows.

### Security / CORS

`app.use(cors())` currently allows all origins (no options passed) — acceptable for a
scaffold-stage health endpoint, but per the installed skill's own best practices, restrict origins
via an `ALLOWED_ORIGINS` env var before any real client integrates, and add `helmet()` for security
headers at the same time. Neither is configured yet — flag as an open decision, don't assume either
is production-ready as-is.

### Password hashing

`bcrypt` (native, ^6.0.0, plus `@types/bcrypt`) is installed for hashing user passwords —
`src/utils/password.ts` exports `hashPassword(plainTextPassword)` and
`verifyPassword(plainTextPassword, passwordHash)`, both async, salt rounds fixed at 12. No user
model/DB exists yet, so this is a standalone utility — wire it into a user
service/repository's create/authenticate flow once one lands, rather than calling `bcrypt`
directly from a route or controller.

- Never store or log a plaintext password — always pass it through `hashPassword` before
  persisting, and only compare via `verifyPassword` (which handles the constant-time compare
  internally), never by comparing hashes with `===`.
- `bcrypt` is a native addon (compiled via `node-gyp-build` on install) — pnpm blocks its install
  script by default, so `pnpm.onlyBuiltDependencies: ["bcrypt"]` in `package.json` explicitly
  approves it. Keep that entry if `bcrypt` is ever removed and re-added, or `pnpm install` will
  silently skip the native build and `bcrypt.hash`/`bcrypt.compare` will throw at runtime.
- Don't hand-roll salting or use a synchronous `hashSync`/`compareSync` call on a request path —
  those block the event loop; the async API above is already Express-5-friendly (rejected promises
  forward automatically, see Routing & handlers above).

### Environment & config

`.env.example` currently documents only `PORT`. `dotenv/config` is imported for its side effect at
the top of `index.ts`. Every new required env var must be added to `.env.example` — don't hardcode
secrets or config values, and don't introduce a second config-loading mechanism alongside `dotenv`.
As real config grows past a couple of keys, validate it at startup (Zod, matching the validation
library already recommended above) so a missing/malformed required var fails fast at boot instead
of surfacing mid-request after some state has already been persisted.

### Testing

Vitest + `supertest` are configured (`vitest.config.ts`, `pnpm test` / `pnpm test:coverage`).
`globals: true` in `vitest.config.ts` means test files use bare `describe`/`it`/`expect` with no
import, matching the style already in `src/routes/health.test.ts` — matched by
`"types": ["node", "vitest/globals"]` in `tsconfig.json` so `tsc` recognizes the globals too.
Follow `.agents/skills/javascript-testing-patterns/` for repo conventions: 3-part test names (unit
under test / circumstance / expected result), AAA structure (Arrange-Act-Assert, blank-line
separated), API/component tests via `supertest` against `createApp()` as the default — not unit
tests first — and per-test data once a DB is involved (no global fixtures). See
`src/routes/health.test.ts` for the current worked example. For Vitest-specific API (mocking,
`vi.fn`, config options), see the installed `vitest-testing` skill.

### Database

No database/ORM/driver is in `package.json` — fully greenfield. When one is added, use connection
pooling and the repository-layer pattern from `nodejs-backend-patterns`
(`references/advanced-patterns.md` covers `pg` pooling, transactions, and Mongoose setup) rather
than querying directly from controllers or route handlers.

## Do not

- Don't drop the `.ts` extension on relative imports, or import compiled `.js` paths — write the
  literal `.ts` extension, matching `index.ts`/`app.ts`.
- Don't use constructor parameter-property shorthand (`constructor(private x: Foo)`), `enum`
  declarations, or namespaces carrying runtime code — none are erasable under
  `erasableSyntaxOnly: true` and will fail `pnpm typecheck`.
- Don't wrap async Express 5 route handlers in `try/catch` + manual `next(err)` solely to forward
  rejections — Express 5 already does this automatically.
- Don't use `npm`/`yarn` — this repo is pinned to `pnpm` via `packageManager` and the committed
  lockfile.
- Don't assume a `dist`/build output or an ESLint/Prettier config exist — neither is configured;
  check `package.json` before relying on either. (A test runner **does** exist now — Vitest.)
- Don't reach for `ts-jest`/`@swc/jest`/Jest — this repo uses Vitest (`vitest.config.ts`), which
  transforms TS via its built-in esbuild pipeline; no separate transform package is needed.
- Don't pre-build `controllers/`/`services/`/`repositories/` folders, or an `apps/`/`libraries/`
  multi-component split, before a real feature needs the layering — keep new routes flat like
  `src/routes/health.ts` until that stops being enough.
- Don't hardcode secrets, base URLs, or other config — extend `.env.example` and read through
  `process.env` instead.
- Don't register the error-handling middleware anywhere but last, after all routers and the 404
  handler.
