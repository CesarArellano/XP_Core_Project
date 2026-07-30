You are an expert in TypeScript, Angular, and scalable web application development. You write
functional, maintainable, performant, and accessible code following Angular and TypeScript best
practices.

> Verified against this repo (2026-07-30): Angular ^22.0.0, zoneless (no `zone.js` dependency),
> pnpm@10.30.3, Vitest via `@angular/build:unit-test`, prefix `app`, no schematics overrides,
> `@angular/localize` installed and wired (polyfill + tsconfig types) — see Internationalization
> below. Project is a fresh `ng new` scaffold (only `App` root component exists) — file-naming,
> styling, and state-management conventions below are the *defaults to adopt*, not conventions to
> match, since no prior art exists yet in this repo.

## Project overview

Admin CMS portal for the Coke XP prototype set. No further domain vocabulary or user roles are
established yet at this scaffold stage — add them here once real features land.

## Commands

- `pnpm start` / `ng serve` — dev server (http://localhost:4200), reloads on save.
- `ng build` — production build to `dist/`.
- `ng build --configuration development` — unminified dev build.
- `ng test` — run the unit test suite (Vitest, single run — no separate watch flag needed).
- `ng test --include='**/user-list.spec.ts'` — run a single spec file.
- Lint and e2e are **not configured** in this repo (no ESLint/Playwright/Cypress in
  `package.json`) — don't assume `ng lint` or an e2e command exist.
- `ng generate component path/to/name` — scaffold a standalone component. Confirm naming
  convention below before relying on generator output as-is.
- This repo uses `pnpm`, not `npm` — `angular.json` → `cli.packageManager` is `pnpm`.

## Architecture / Folder Structure

Adopted from the [Angular folder structure guide](https://www.angular.courses/blog/angular-folder-structure-guide)
and scaffolded under `src/app/` (empty `.gitkeep` placeholders — populate as real code lands,
don't pre-build fake features):

- **`core/`** — non-business-feature code the whole app depends on: layout, auth, global
  notifications. Scaffolded with `core/services/`, `core/guards/`, `core/interceptors/`. A
  non-trivial core feature (e.g. `core/auth/`) gets its own `models/`, `guards/`, `services/`,
  `auth.routes.ts`, and `pages/` subfolder only once that feature actually exists — an isolated
  single-service/directive feature can live directly in the technical folders above instead.
- **`features/`** — domain-grouped business/feature code, one folder per domain (e.g. a future
  `features/posts/`, `features/groups/`), each with routed pages under its own `pages/` subfolder
  and cross-feature domain code at the domain root (`features/posts/post.model.ts`). Avoid a flat
  `features/` folder with every component side by side — group by domain, not by type.
- **`shared/`** — reusable, business-agnostic ("dumb") code only: `shared/components/`,
  `shared/pipes/`, `shared/utils/`. "Smart" (business-aware) shared code belongs in its owning
  feature domain instead, for discoverability — don't dump it in `shared/` just because two
  features happen to use it.
- Naming matches the 2025 convention used elsewhere in this repo (see "File and naming
  conventions" below): components/directives/services take no suffix (`auth.ts`, `notification.ts`);
  pipes/guards/resolvers/interceptors keep a hyphenated suffix (`auth-guard.ts`, `date-pipe.ts`).

## Angular Best Practices

Confirmed current for Angular v22 against angular.dev's own best-practices reference:

- Always use standalone components over NgModules.
- Do **NOT** set `standalone: true` in decorators — it's the default since v20.
- Do **NOT** set `changeDetection: ChangeDetectionStrategy.OnPush` explicitly — it's the default
  since v22 (`ChangeDetectionStrategy.Default` was renamed `Eager`).
- Use signals for state management.
- Implement lazy loading for feature routes.
- Do NOT use `@HostBinding`/`@HostListener` decorators — put host bindings/listeners inside the
  `host` object of the `@Component`/`@Directive` decorator instead.
- Use `NgOptimizedImage` for all static images (it does not work for inline base64 images).
- Prefer the `@Service` decorator over `@Injectable({providedIn: 'root'})` for new singleton
  services — shorthand that supports `inject()` and implicit root registration. It does **not**
  support constructor-based DI, `useClass`-style provider keys, or non-root scopes; fall back to
  `@Injectable({providedIn: 'root'})` when you need those.

### Standalone-first

No NgModules. Every component/directive/pipe declares its own `imports: []`. `app.config.ts` uses
`bootstrapApplication` + `ApplicationConfig` (confirmed) — don't reintroduce
`AppModule`/`platformBrowserDynamic`.

### Signals over decorators/RxJS where equivalent

- Use `input()`/`input.required()` and `output()` instead of `@Input()`/`@Output()`.
- Use `model()` for two-way bindable component state.
- Use `signal()` + `computed()` for local state; use `effect()` sparingly, only for genuine side
  effects — never to derive state (`computed()` owns that).
- Keep RxJS for genuinely async streams (HTTP, WebSockets, router events); interop via
  `toSignal()`/`toObservable()` at the boundary.
- Do NOT call `.mutate()` on signals — use `.update()` or `.set()` (treat signal values as
  immutable, replace rather than mutate objects/arrays in place).

### Async data with `resource()`

Not yet used in this repo (no HTTP calls exist yet), but the standard to adopt over manual
`effect()` + subscription plumbing once data fetching is added:

- Read the reactive signals a fetch depends on inside `params`, not inside `loader`. When
  `params` changes, the loader reruns and any in-flight request is aborted via the provided
  `abortSignal` — always pass it through to `fetch`/`HttpClient` calls that support cancellation.
- Drive templates off the resource's own signals — `value()`, `hasValue()` (type guard),
  `isLoading()`, `error()`, `status()` — instead of hand-rolled loading/error booleans.
- Prefer `httpResource()` over a raw `resource()` + `fetch` for calls through this app's
  `HttpClient` layer (interceptors, base URL config), keeping the same resource-signal API.
- Reserve `.reload()` for explicit user-triggered refetch and `.value.set(...)` for optimistic
  local updates (status becomes `'local'`). Don't reach for `effect()` to sync resource state —
  read the signals directly or derive with `computed()`.

### Forms

- Prefer Signal Forms (`@angular/forms/signals`) for new forms — stable in Angular v22+, giving
  signal-based state, type-safe field access via `FormField`, and schema-based validation
  (`form()`, `required()`, `minLength()`, etc.).
- When not using Signal Forms, prefer Reactive forms over Template-driven.
- Reactive `FormControl.setValue()`/`patchValue()` update form state and emit observables but do
  **not** by themselves schedule change detection under zoneless. Read the value through
  `toSignal(control.valueChanges)`, or use Signal Forms, which don't have this gap.

### New control-flow syntax

Use `@if`/`@else`, `@for`, `@switch`/`@case`/`@empty` in templates — never `*ngIf`/`*ngFor`/
`*ngSwitch` or `CommonModule` structural directives. `@for` requires a `track` expression; track
by a stable identity (id), not index, unless the list is static. Do NOT use `ngClass`/`ngStyle` —
use `class`/`style` bindings instead.

### Change detection (zoneless)

This repo has no `zone.js` dependency and Angular v22 defaults to zoneless — treat it as active
even though `app.config.ts` doesn't yet call `provideZonelessChangeDetection()` explicitly.

- Zoneless Angular does not poll on every browser event. It only schedules change detection on:
  a signal read in a template being updated, `ChangeDetectorRef.markForCheck()`,
  `ComponentRef.setInput()`, a bound host/template listener firing, or a registered render hook.
  Any UI-affecting state must flow through one of these — not a plain class field mutated from a
  callback or third-party async API.
- Don't paper over missing notifications with manual `detectChanges()`/`markForCheck()` calls
  sprinkled into unrelated code — treat that as a sign some state update isn't flowing through
  Angular's reactivity, and fix the underlying gap instead.
- In tests, prefer `await fixture.whenStable()` over bare `fixture.detectChanges()` when asserting
  on async updates (the existing `app.spec.ts` already does this — keep following that pattern).

### Routing

- Standalone routing via `provideRouter()` in `app.config.ts` (confirmed).
- Lazy-load feature areas with `loadChildren: () => import('./feature/feature.routes')` (route
  file exporting both a named routes const and a `default` export) or `loadComponent` for single
  routed components.
- New feature routes live under `modules/<name>/<name>.routes.ts` per the folder structure
  scaffolded above — not a flat `features/` folder.

### File and naming conventions

- 2025 style, confirmed by the existing scaffold (`app.ts` exports `App`, not
  `app.component.ts`/`AppComponent`): drop the type suffix from both file and class names for
  components and services alike (`user-profile.ts` → `UserProfile`, `Auth` not `AuthService`).
  `angular.json` has no `schematics` override, so `ng generate` will keep producing this style.
- Hyphenated file names matching the class they contain; TS/template/style files share the same
  base name (`user-profile.ts`/`.html`/`.css`); extra style files extend the base name rather than
  renaming (`user-profile-settings.css`).
- One concept per file; avoid generic dumping-ground files like `helpers.ts`/`utils.ts`.
- Prefer external `templateUrl`/`styleUrl` files over inline `template`/`styles`; inline is fine
  only for genuinely small components (a couple of lines of markup).
- Component selector prefix is `app` (`angular.json` → `prefix`, unchanged from default) —
  keep new selectors consistent with it unless a deliberate decision changes it.

### Styling

Not yet decided — `src/styles.css` is still the CLI-generated empty stub and no styling library
(Tailwind, Angular Material, PrimeNG, SCSS/BEM) is in `package.json`. Flag this as an open
decision rather than assuming an approach.

Regardless of what's chosen, prefer Angular's native view encapsulation (default `Emulated`) over
global stylesheets for component-scoped styles, and reserve global CSS for true cross-cutting
concerns (resets, design tokens/CSS custom properties, theming). Avoid `ViewEncapsulation.None`
except for intentionally global style components.

### State management

- Default to signals + services rather than a dedicated state-management library. A root-level
  singleton (`@Service`-decorated) service holds a private writable `signal`/`linkedSignal` and
  exposes a public `.asReadonly()` view (or a `computed()`), with mutation only through explicit
  methods on the service — never expose the raw writable signal outside its owning
  service/component.
- Use `computed()` for derived state; keep it pure (no side effects, no `set`/`update` inside a
  `computed`).
- Reach for NgRx / NgRx SignalStore / Akita only if the app develops genuinely complex,
  interdependent shared state that signal-based services can't express cleanly — don't introduce
  one preemptively.
- No shared/global state exists yet in this repo — the pattern above is the default to establish
  when the first cross-component state need appears.

### HTTP / API layer

Not yet used in this repo (no `HttpClient` calls exist). When added:

- `provideHttpClient(withInterceptors([...]))` with **functional** interceptors
  (`(req, next) => ...` using `inject()`), not class-based `HttpInterceptor`.
- Prefer `httpResource()` for component-level reads that drive template state; keep `HttpClient` +
  RxJS for imperative mutations that aren't naturally modeled as a reactive resource.
- API base URL, auth token attachment, and error/retry conventions are undecided — establish them
  in `environment.ts`/runtime config on first use, and compose with the interceptor chain rather
  than duplicating it.

### Internationalization

`@angular/localize` **is installed** (`package.json`, added via `ng add @angular/localize`) and is
the mandatory mechanism for all user-facing copy — no hardcoded UI text in any component or page,
even for a single-locale MVP. Confirmed wiring in this repo:

- `angular.json` → `architect.build.options.polyfills` includes `"@angular/localize/init"`.
- `tsconfig.app.json` / `tsconfig.spec.json` → `compilerOptions.types` include `"@angular/localize"`.
- `src/main.ts` has `/// <reference types="@angular/localize" />` at the top of the file.
- No `i18n` block exists yet in `angular.json` (no `sourceLocale`/`locales` configured, no
  translation files) — add that only once actual translation begins; installing the package and
  marking strings is a separate, earlier step from configuring target locales.

**Every new/edited component template** must mark its copy this way — treat this as required for
any PR touching template text, not just when i18n itself is the task:

- Plain element text: add the bare `i18n` attribute to the element.
  ```html
  <h1 i18n="Dashboard header|Greets the signed-in user@@dashboardHeader">Welcome back</h1>
  ```
- Attribute-bound text (`title`, `alt`, `placeholder`, `aria-label`, etc.): add `i18n-<attr>`
  alongside the attribute.
  ```html
  <img [src]="logo" i18n-alt alt="Coke XP logo" />
  <input i18n-placeholder placeholder="Search users" />
  ```
- Always prefer the `meaning|description@@id` metadata block over a bare `i18n` when the string's
  intent isn't obvious from the text alone, or a translator could plausibly render it two different
  ways (e.g. "Close" the verb vs. a noun) — pick a stable, kebab/camel `id` per string so
  re-extraction doesn't regenerate a new id for unrelated template changes.
- Plurals/branching copy: use ICU syntax inside an `i18n`-marked element instead of hand-rolled
  conditionals in the component.
  ```html
  <span i18n>{count, plural, =0 {No items} =1 {One item} other {{{count}} items}}</span>
  ```

**Every new/edited component or service TypeScript file** with dynamic copy (strings built from
variables, alerts/toasts/error messages, anything not sitting directly in a template) must tag it
with `$localize`, not a plain template literal or string concatenation:

```ts
import { $localize } from '@angular/localize/init';

// simple string
const label = $localize`:Toggle Button|A button to toggle status:Show`;

// with a named placeholder — always name placeholders, don't leave {$PH}/{$PH_1}
const summary = $localize`There are ${items.length}:itemCount: items`;
```

- Import `$localize` from `@angular/localize/init` per file that needs it (no global import
  required at each call site beyond that — the polyfill in `angular.json` makes the global
  available at runtime, but explicit import keeps the type visible to the compiler in strict mode).
- Don't build user-facing strings with `+`/template-literal interpolation outside a `$localize`
  tag — that copy is invisible to `ng extract-i18n` and can't be translated later.

**Workflow once locales are actually being added** (not required for every component change, only
when standing up a new target language):

- Add `sourceLocale` and a `locales` map under the `i18n` key in `angular.json`.
- Run `ng extract-i18n` to pull every `i18n`/`i18n-*`/`$localize`-marked string into a source
  translation file (`xlf` by default — pass `--format` for `xlf2`/`json`/`arb` if the translation
  vendor needs a different format).
- Copy the extracted file per target locale, hand it to translation, then `ng build --localize` to
  produce a build per configured locale.

Don't reintroduce a competing i18n approach (ngx-translate, a custom pipe-based translation
service, hand-rolled locale switching, etc.) — `@angular/localize` is the framework-native
mechanism and the one to converge on for this repo.

### Accessibility Requirements

- Must pass all AXE checks.
- Must follow all WCAG AA minimums, including focus management, color contrast, and ARIA
  attributes.

### Testing

- Vitest via `@angular/build:unit-test` (confirmed in `angular.json`/`package.json`) — no Karma.
- Inject services/components under test via `TestBed.inject(...)`/`TestBed.createComponent(...)`
  inside `beforeEach` for a fresh instance per test.
- Mock HTTP with `provideHttpClientTesting()` + `HttpTestingController`
  (`expectOne(...).flush(...)`), registered **after** `provideHttpClient(...)` in the testing
  providers.
- For routed components, use `RouterTestingHarness` with `provideRouter([...])` over manually
  constructed `ActivatedRoute` stubs.
- Prefer `await fixture.whenStable()` over bare `fixture.detectChanges()` when asserting on
  async signal/resource updates under zoneless — `app.spec.ts` already establishes this pattern.
- No coverage thresholds or e2e runner are configured yet.

## Do not

- Don't add NgModules, and don't reintroduce `platformBrowserDynamic`/`AppModule` bootstrapping
  alongside `bootstrapApplication`.
- Don't use `*ngIf`/`*ngFor`/`*ngSwitch`, `CommonModule` structural directives, `ngClass`, or
  `ngStyle` in new or edited templates.
- Don't set `standalone: true` or `changeDetection: ChangeDetectionStrategy.OnPush` explicitly —
  both are v20+/v22+ defaults.
- Don't use `@HostBinding`/`@HostListener` — use the `host` object instead.
- Don't use `.mutate()` on signals — use `.update()`/`.set()`.
- Don't mix 2016 (`*.component.ts`/`FooComponent`) and 2025 (`*.ts`/`Foo`) naming — this repo has
  committed to 2025 style via its existing scaffold.
- Don't use class-based `HttpInterceptor` once functional interceptors are established — stay
  consistent, and don't bypass the interceptor chain by calling `fetch` directly.
- Don't introduce NgRx/SignalStore/Akita without an explicit decision to migrate off signals-based
  services.
- Don't mutate component state from callbacks/third-party async APIs without routing it through a
  signal, `markForCheck()`, or another notification Angular's zoneless scheduler recognizes — and
  don't paper over the gap with manual `detectChanges()` calls instead of fixing the reactivity.
- Don't add `effect()` to derive or sync state that `computed()` (or a `resource()`'s own signals)
  can express directly.
- Don't assume globals like `new Date()` are available inside templates.
- Don't hardcode user-facing copy — every template string, `i18n-`-able attribute, and dynamic
  string built in component code goes through `@angular/localize` (`i18n`/`i18n-*` attributes or
  `$localize`), not raw text or template-literal interpolation.
