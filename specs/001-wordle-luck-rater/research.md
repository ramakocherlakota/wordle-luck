# Phase 0 Research: Wordle Luck Rater (wordle-pal-2.0)

This document resolves the technical unknowns implied by the spec's Assumptions ("modern TypeScript front-end", "reuse wordle-svc", "bundled word lists") into concrete, justified decisions. Every decision is grounded in the legacy Wordle Pal code (`/Users/rama/work/wordle-pal`) so wp2 is contract-compatible with the existing backend.

---

## 1. Build tooling & framework

- **Decision**: React 18.3 + TypeScript 5.6 (strict) built with Vite 6.
- **Rationale**: app.md asks for "a modern react app" in TypeScript. The legacy app is Create React App (CRA), which is effectively deprecated; Vite is the modern standard — fast dev server, first-class TS, trivial dev proxy, and integrates natively with Vitest. React 18.3 is the stable, best-supported version for the RTL/Vitest toolchain.
- **Alternatives considered**:
  - *Next.js* — overkill; no SSR/routing/server needs for a single-screen front-end-only app.
  - *CRA* (match legacy) — unmaintained, slow, awkward TS/testing story.
  - *React 19* — viable and modern, but 18.3 avoids any bleeding-edge testing-library friction; upgrade is low-risk later.

## 2. Testing stack

- **Decision**: Vitest + React Testing Library + `@testing-library/user-event` (jsdom), with Mock Service Worker (MSW) for HTTP mocking.
- **Rationale**: SC-009 and app.md require "adequate unit test coverage." Vitest shares Vite's config/transform pipeline (no separate Babel/Jest setup). RTL drives user-centric component tests. MSW intercepts `fetch` at the network layer, so the API module and components are tested against realistic request/response payloads (including error and slow-response paths) without stubbing `fetch` by hand.
- **Test layers**:
  - *Pure unit*: word-list union/indexing (`data/`), request builders + response mappers + luck truncation (`api/`), submit state machine (`hooks/`).
  - *Component*: WordSelect keyboard/filter behavior, Submit enablement, ResultsTable rendering, RemainingPopup open/close.
  - *Integration*: full submit→results flow with MSW-mocked backend, plus error/unreachable handling.
- **Alternatives considered**: Jest (heavier config with Vite/ESM); Playwright/Cypress E2E (valuable later, but out of scope for this feature's unit-coverage requirement and needs a live/mocked backend).

## 3. HTTP layer

- **Decision**: Native `fetch` wrapped in `src/api/wordleService.ts`, using `AbortController` with a long timeout (default 900 s, matching legacy) and abort-on-resubmit / abort-on-unmount.
- **Rationale**: Only two POST calls are needed; a dependency like axios adds no value. The real requirement (FR-008) is tolerating a long response window without appearing frozen, which `AbortController` + a timeout handles cleanly and testably.
- **Alternatives considered**: axios (legacy choice — extra dependency, its own timeout semantics); TanStack Query (nice caching/retry, but heavier than a two-call app needs; a small custom hook is sufficient).

## 4. Backend integration & the two operations

- **Decision**: Reuse the deployed `wordle-svc` Lambda. Two POST operations mirror the legacy `Luck.js`/`Remaining.js` flows:
  1. `rate_solution` — body `{ operation, targets:[target], guesses:[...], sequence:false, hard_mode:false, count:1, sqlite_dbname:"all-wordle.sqlite" }`. Because `sequence:false`, the backend routes through `Quordle`; for a single target the response is `{ by_target: { "<target>": [rating,…] }, totals:[…] }`. wp2 reads `by_target[target]` for its rows.
  2. `remaining_answers` — body `{ operation, guesses:[…up to row n], scores_list:[[…scores up to row n]], sequence:false, hard_mode:false, sqlite_dbname:"all-wordle.sqlite" }`. Response is a list-of-lists (one per target); wp2 reads element `[0]`.
- **Rationale**: Verified against `wordle-svc/lambda.py`, `Wordle.py` (`rate_solution`, `rate_guess`, `remaining_answers`), and `Quordle.py` (`rate_solution`, `remaining_answers`). Exact field names are captured in `contracts/wordle-svc.md`. Reusing the existing service satisfies the "front-end only / reuse wordle-svc" assumption with zero backend work.
- **Alternatives considered**: A single `rate_solution` call that already returns `remaining_answers_post` **counts** per row — but the spec (FR-011) needs the actual **word list**, which only `remaining_answers` returns, so the second call is required. Prefetch-all vs. lazy-per-row: see §5.

## 5. Which database (`sqlite_dbname`) — critical correctness decision

- **Decision**: Send `sqlite_dbname: "all-wordle.sqlite"` on both operations.
- **Rationale**: The default `wordle.sqlite` only contains scores for the 2,315 **answers** used as guesses (2315×2315). wp2 must accept the **union** of answers + guesses (FR-003), and many extremely common opening guesses (`adieu`, `soare`, `roate`, `crate`…) are valid guesses but not answers. Scoring/rating such a guess against the default DB raises "Inconsistent data in score_guess". The legacy `all-scores` database (`all-wordle.sqlite`, selected by the legacy "all guesses" setting in `Results.js`) contains scores for all Wordle-allowed guesses. Using it is therefore required for correctness of the union requirement.
- **Trade-off / risk**: The README notes the all-scores DB is larger and its queries are "correspondingly slower," so ratings take longer — acceptable given FR-008's waiting feedback is already required. **Risk**: this assumes the deployed Lambda actually has `all-wordle.sqlite` available (legacy exposes it via its settings toggle, which implies it is deployed). Verify against the live endpoint during implementation (quickstart includes a smoke test); if unavailable, fall back to `wordle.sqlite` and restrict the guess set to answers-only (a documented degradation), or coordinate a backend DB deployment.

## 6. Lazy vs. prefetch of remaining-answers lists

- **Decision**: Fetch a row's remaining-answers list lazily when its REMAINING control is first opened; cache the result per row for the current result set.
- **Rationale**: Each `remaining_answers` call is a separate (potentially slow) backend round-trip. Users typically inspect only a row or two. Lazy loading keeps the initial results render fast and avoids N extra slow calls up front; per-row caching avoids refetching on reopen. Either approach satisfies FR-011; this one is more responsive (matches the spec Assumption).
- **Alternatives considered**: Prefetch all lists immediately after `rate_solution` (simpler state, but N slow calls the user may never need); derive remaining lists client-side from bundled data (would require replicating the backend's scoring/consistency logic — rejected, defeats "reuse backend").

## 7. Base URL, dev proxy & CORS

- **Decision**: API base URL from `import.meta.env.VITE_API_URL`, defaulting to `/service`. In dev, Vite `server.proxy` maps `/service` → the Lambda Function URL (`https://3a4sqenzhvr7ytnxakcsjeeh5u0hbynu.lambda-url.us-east-1.on.aws/`), mirroring legacy `setupProxy.js`.
- **Rationale**: A same-origin `/service` path avoids browser CORS entirely in dev (the Lambda only emits CORS headers when its `CORS_ORIGIN` env is set). Production deployment is out of scope, but the env-var + relative-path design lets it be pointed at any same-origin reverse proxy or a CORS-enabled endpoint without code changes.
- **Alternatives considered**: Call the Lambda URL directly from the browser (fails CORS unless the Lambda is configured for the app's origin); hardcode the URL (inflexible, and bakes an infra detail into code).

## 8. Word-selection widget (WordSelect)

- **Decision**: A custom accessible combobox implementing the ARIA combobox pattern (text input + filtered listbox, full keyboard support), reused for the target and every guess slot. Filtering mirrors legacy `WordSelect.js`/`Autofill.js`: index words by first letter, then prefix-filter the input against that bucket.
- **Rationale**: The interaction is exactly the legacy "select from a list, type to filter, don't allow arbitrary words" behavior app.md asks for. A custom component keeps dependencies minimal, is fully unit-testable with RTL/user-event, and gives complete control over styling and a11y. The first-letter index keeps filtering fast over ~13k words.
- **Alternatives considered**: `downshift` (excellent a11y primitives — reasonable fallback if the custom combobox proves fiddly); `react-select` (heavier, opinionated styling, larger bundle); MUI Autocomplete (legacy used MUI, but pulling in MUI for one widget contradicts the lightweight/aesthetic-control goal).

## 9. Styling approach

- **Decision**: CSS Modules with a shared design-token stylesheet (`styles/tokens.css`) of CSS custom properties for color, spacing, and type; light/dark aware via `prefers-color-scheme`. Score colors ported from legacy: `b`→ orange `rgb(242,111,59)` (correct position), `w`→ blue `rgb(122,184,245)` (wrong position), `-`→ grey `rgb(109,113,115)` (absent).
- **Rationale**: app.md emphasizes "aesthetically pleasing styling." CSS Modules give scoped, framework-free styling with full control and no runtime cost; tokens keep the look consistent and themeable. Reusing the legacy score palette keeps the SCORE column familiar to existing users.
- **Alternatives considered**: Tailwind (fast to build, but utility classes are a strong opinion and add tooling); styled-components/emotion (runtime CSS-in-JS overhead); a component library (bundle weight + fighting its theme).

## 10. Application state

- **Decision**: Local React state in `App.tsx` for target + guesses; a `useLuckRating` hook encapsulates the submit lifecycle (`idle | loading | success | error`), elapsed-time ticking, abort handling, and the parsed result rows. No global store.
- **Rationale**: Single screen, no cross-cutting shared state — a store (Redux/Zustand) would be ceremony. Isolating the async lifecycle in a hook makes it unit-testable independently of the DOM.
- **Alternatives considered**: Redux/Zustand (unnecessary for one screen); localStorage persistence of inputs (legacy did this, but the spec does not require it — left out of MVP to keep scope tight; easy to add later).

---

## Open items / verify during implementation

- **`all-wordle.sqlite` availability** on the deployed Lambda (see §5) — smoke-test with a known non-answer opener (e.g., target `crane`, guess `soare`) via the quickstart before building UI on the assumption.
- **Exact score casing** in responses: `Wordle.score_guess` lowercases scores; treat score strings case-insensitively in `ScorePattern` (normalize to lowercase).
- **Solved-game row count**: `rate_solution` stops emitting ratings once a guess solves the puzzle (all-`b`), so the results table may have fewer rows than guesses submitted — handle gracefully (this is correct behavior, not an error).
