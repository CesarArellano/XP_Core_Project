# Vitest setup notes for this repo

## Why Vitest's built-in transform, not `ts-jest`/`@swc/jest`

This repo pins `typescript@^7.0.2`. TypeScript 7 is the native-compiler rewrite and no longer
exposes the classic JS Compiler API that `ts-jest` calls into for type-checking transforms — it
fails at transform time. Vitest sidesteps this entirely: it transforms TS via `esbuild` (bundled
with Vite) and never touches the TypeScript compiler API. It doesn't type-check — that's fine,
because `pnpm typecheck` (`tsc`, `noEmit: true`) already covers type safety as a separate step.

## `vitest.config.ts`, not `.cjs`

Unlike Jest's config loader, Vite's config loader (which Vitest reuses) handles ESM `.ts` config
files natively regardless of the package's `"type"` field — no CommonJS workaround needed. Don't
add a `.cjs`/`.mjs` extension dance here; `vitest.config.ts` is the correct, final form.

## Relative imports keep their `.ts` extension in test files too

Source files write explicit `.ts` extensions on relative imports (required by
`rewriteRelativeImportExtensions` — see the root `CLAUDE.md`). Test files do the same
(`from '../app.ts'`) for consistency, and Vitest's Vite-based resolver follows the literal
specifier directly to the real file — no extension rewriting needed.

## `vitest/globals` needs to be in `tsconfig.json`'s `types` array

`vitest.config.ts` sets `globals: true` so test files can use bare `describe`/`it`/`expect` with no
import (matching the existing test style in this repo). Without an explicit
`"types": ["node", "vitest/globals"]` in `compilerOptions`, `tsc` fails on those globals in test
files with "Cannot find name" — ambient global type packages aren't picked up automatically in this
TypeScript version. If a new ambient `@types/*` package ever needs to apply project-wide, add it to
that same array rather than relying on auto-discovery.
