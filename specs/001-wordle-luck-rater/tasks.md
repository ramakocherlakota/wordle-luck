---
description: "Task list for Wordle Luck Rater (wordle-pal-2.0)"
---

# Tasks: Wordle Luck Rater (wordle-pal-2.0)

**Input**: Design documents from `/specs/001-wordle-luck-rater/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/wordle-svc.md, quickstart.md

**Tests**: INCLUDED — the spec requires "adequate unit test coverage" (app.md #2) and SC-009 mandates automated tests for the rating flow, union guess set, luck truncation, and error handling.

**Organization**: Tasks are grouped by user story so each story is an independently implementable, testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 / US4 (maps to spec.md user stories)
- Paths follow the single front-end project layout in plan.md (repo root = the app)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize the Vite + React + TypeScript project and its tooling.

- [X] T001 Scaffold the app: create `package.json` (React 18.3, react-dom, TypeScript 5.6, Vite 6), `index.html`, `src/main.tsx`, placeholder `src/App.tsx`, `tsconfig.json` (strict), and `vite.config.ts` with a dev `server.proxy` mapping `/service` → `https://3a4sqenzhvr7ytnxakcsjeeh5u0hbynu.lambda-url.us-east-1.on.aws/` and reading `VITE_API_URL`
- [X] T002 Configure test tooling: add `vitest`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom`, `msw`; add Vitest config (jsdom env, coverage, `setupFiles`) and `src/test/setup.ts` (jest-dom matchers + MSW server `beforeAll/afterEach/afterAll`); add `test` npm script
- [X] T003 [P] Configure ESLint + Prettier + TS-strict rules and add `lint`, `format`, `typecheck` npm scripts (`.eslintrc`, `.prettierrc`)
- [X] T004 [P] Create `.env.example` documenting `VITE_API_URL` (default `/service`) and add run/test/proxy instructions to `README.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared data, types, styling, backend client, and test infrastructure that every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T005 [P] Port the answer words from `/Users/rama/work/wordle-pal/wordle-react-app/src/data/AnswerOptions.js` into `src/data/answers.ts` as a flat `string[]` (~2,315 words, lowercase)
- [X] T006 [P] Port the guess words from `/Users/rama/work/wordle-pal/wordle-react-app/src/data/GuessOptions.js` into `src/data/guesses.ts` as a flat `string[]` (~12,947 words, lowercase)
- [X] T007 Build `src/data/wordLists.ts`: export `answerList` (sorted), `guessSet` (deduped, sorted **union** of answers + guesses — FR-003), and `buildFirstLetterIndex(words)` for prefix filtering (depends on T005, T006)
- [X] T008 [P] Unit tests `src/data/wordLists.test.ts`: assert `guessSet` includes an answer that is absent from the raw guess list (verifies the union / SC-006) and that the first-letter index buckets + prefix-filters correctly (depends on T007)
- [X] T009 [P] Define shared types in `src/types.ts`: `GuessRating`, `RemainingResult`, `RateSolutionRequest/Response`, `RemainingRequest/Response`, and a `LuckStatus` union (`idle|loading|success|error`) per data-model.md
- [X] T010 [P] Create `src/styles/tokens.css` (design tokens: score colors `b`=orange `rgb(242,111,59)`, `w`=blue `rgb(122,184,245)`, `-`=grey `rgb(109,113,115)`, plus spacing/type; light/dark via `prefers-color-scheme`) and import it in `src/main.tsx`
- [X] T011 Implement `src/api/wordleService.ts`: a `postJson` helper (`fetch` + `AbortController`, 900s timeout) with error normalization, plus `rateSolution(target, guesses)` and `remainingAnswers(guesses, scores)` — both send `sequence:false`, `hard_mode:false`, `sqlite_dbname:"all-wordle.sqlite"`; map `by_target[target]` → `GuessRating[]` and `response[0]` → remaining words (contracts/wordle-svc.md) (depends on T009)
- [X] T012 [P] Create MSW handlers `src/test/mswHandlers.ts` reproducing both operations: `rate_solution` (≥2 rows incl. a solved final row), `remaining_answers` (happy + solved→`[[target]]`), an HTTP-500 traceback, a 200-with-`error` body, and a delayed/slow variant (depends on T009)
- [X] T013 API client tests `src/api/wordleService.test.ts`: `rateSolution` maps rows + truncatable luck; `remainingAnswers` reads `[0]`; 500 traceback and 200-`error` both normalize to a human-readable error; network/timeout/abort rejects cleanly (depends on T011, T012)

**Checkpoint**: Data, types, styling, backend client, and mocks ready — user stories can begin.

---

## Phase 3: User Story 1 - Rate the luck of a completed Wordle game (Priority: P1) 🎯 MVP

**Goal**: User picks a target and guesses, submits, and sees a `GUESS | SCORE | LUCK | REMAINING` table (luck truncated to 3 decimals) with clear waiting feedback during the backend call.

**Independent Test**: Select target `crane`, enter guesses `soare`/`clint`/`crane`, Submit → loading+elapsed indicator → results table with one row per rated guess showing guess, colored score, luck to 3 decimals, and a REMAINING cell.

### Tests for User Story 1 ⚠️ (write first, expect fail)

- [X] T014 [P] [US1] `src/hooks/useLuckRating.test.ts`: `idle→loading→success`; error paths (500, 200-error, network); elapsed-time ticking; aborts in-flight request on resubmit/unmount (uses MSW) (depends on T012)
- [X] T015 [P] [US1] `src/components/WordSelect/WordSelect.test.tsx`: typing filters options by prefix; keyboard navigation selects; a value not in the provided options cannot be committed
- [X] T016 [P] [US1] `src/App.test.tsx` (US1 slice): Submit is disabled until a target and ≥1 guess exist (FR-006); Submit shows a loading + elapsed indicator (FR-008/SC-004); on success renders GUESS/SCORE/LUCK columns with luck **truncated toward zero** to exactly 3 decimals — asserting `0.5316 → "0.531"` and `-0.5316 → "-0.531"` (truncated, not rounded) (SC-002/SC-003); on a backend error the banner shows a message and a Retry action that re-submits (FR-014/SC-007) (uses MSW; depends on T012)

### Implementation for User Story 1

- [X] T017 [P] [US1] Implement `src/components/WordSelect/WordSelect.tsx` (+ `.module.css`): accessible ARIA combobox, first-letter-indexed prefix filtering, restricted to provided options; reused for target and guesses (depends on T007)
- [X] T018 [P] [US1] Implement `src/components/ScorePattern/ScorePattern.tsx` (+ `.module.css`): render five cells colored by `b`/`w`/`-` (case-insensitive) using tokens (depends on T010)
- [X] T019 [US1] Implement `src/hooks/useLuckRating.ts`: submit lifecycle, elapsed timer, `AbortController`, parsed `GuessRating[]`, and human-readable error mapping (depends on T011)
- [X] T020 [US1] Implement `src/components/GuessInputs/GuessInputs.tsx`: render six guess slots using `WordSelect` (fixed count for US1; dynamic add comes in US3) (depends on T017)
- [X] T021 [US1] Implement `src/components/SubmitBar/SubmitBar.tsx`: Submit button (enabled only when target + ≥1 guess) and loading spinner with elapsed seconds (depends on T010)
- [X] T022 [US1] Implement `src/components/ResultsTable/ResultsTable.tsx`: columns GUESS | SCORE (`ScorePattern`) | LUCK (truncated **toward zero** to 3 decimals via `Math.trunc(luck * 1000) / 1000`, rendered with sign and exactly 3 decimal places — NOT `toFixed` rounding) | REMAINING (per-row count + a button placeholder to be wired in US2) (depends on T018)
- [X] T023 [US1] Wire `src/App.tsx`: target `WordSelect` (over `answerList`) + `GuessInputs` + `SubmitBar` + `ResultsTable` driven by `useLuckRating`; render idle/loading/error/success states and a human-readable error banner with an explicit **Retry** action that re-invokes the last submit (FR-014) (depends on T017, T019, T020, T021, T022)

**Checkpoint**: MVP — a full game can be rated and displayed end-to-end.

---

## Phase 4: User Story 2 - Inspect remaining possible answers after a guess (Priority: P2)

**Goal**: Each results row's REMAINING control opens a popup listing the answer words still possible after that guess.

**Independent Test**: With results shown, click REMAINING on a row → popup lists remaining words → dismiss → table unchanged; the solved row's list is just the target.

### Tests for User Story 2 ⚠️

- [X] T024 [P] [US2] `src/components/RemainingPopup/RemainingPopup.test.tsx`: opening lazily fetches and renders the word list; dismiss closes it; a solved row shows `[target]`; a backend error shows a message with a retry affordance (uses MSW; depends on T012)

### Implementation for User Story 2

- [X] T025 [US2] Implement `src/components/RemainingPopup/RemainingPopup.tsx` (+ `.module.css`): a dismissible dialog that, on open, calls `remainingAnswers(guesses[0..n], scores[0..n])`, with loading/error/retry states (depends on T011)
- [X] T026 [US2] Wire the REMAINING button in `src/components/ResultsTable/ResultsTable.tsx` to open `src/components/RemainingPopup/RemainingPopup.tsx` for its row, passing the guesses+scores prefix from the rating result; memoize the fetched list per row and keep the table unchanged on close (depends on T022, T025)

**Checkpoint**: US1 + US2 both work independently.

---

## Phase 5: User Story 3 - Enter more than six guesses (Priority: P3)

**Goal**: Six guess slots by default with an "Add guess" control to append more.

**Independent Test**: Six empty slots initially; "Add guess" yields a 7th; a guess entered in an added slot is submitted and rated.

### Tests for User Story 3 ⚠️

- [X] T027 [P] [US3] `src/components/GuessInputs/GuessInputs.test.tsx`: six slots by default; "Add guess" adds a slot; a value in an added slot is included in the submitted guesses (FR-005)

### Implementation for User Story 3

- [X] T028 [US3] Add an "Add guess" control and dynamic slot state to `src/components/GuessInputs/GuessInputs.tsx`, lifting the variable-length guesses array into `src/App.tsx` state (depends on T020, T023)

**Checkpoint**: US1–US3 independently functional.

---

## Phase 6: User Story 4 - Clear the target and guesses (Priority: P3)

**Goal**: A Clear control resets the target and all guess selections for a fresh game.

**Independent Test**: With target + guesses (and results) present, click Clear → target and all slots reset to empty.

### Tests for User Story 4 ⚠️

- [X] T029 [P] [US4] Clear test in `src/App.test.tsx`: Clear resets the target and all guess slots to empty, and clears any displayed results and the remaining-answers cache (FR-013/SC-008)

### Implementation for User Story 4

- [X] T030 [US4] Add a Clear control to `src/components/SubmitBar/SubmitBar.tsx` and a reset handler in `src/App.tsx` that sets target to `""`, resets guesses to six empty slots, and drops results + the per-row remaining cache (depends on T021, T023)

**Checkpoint**: All four user stories functional and independently testable.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Quality, accessibility, and end-to-end validation across all stories.

- [X] T031 [P] Accessibility pass: verify `WordSelect` ARIA combobox roles/keyboard and `RemainingPopup` dialog focus-trap + Escape-to-close, and label associations (`src/components/WordSelect/`, `src/components/RemainingPopup/`)
- [X] T032 [P] Responsive layout + light/dark verification across components (`src/App.module.css`, `src/styles/tokens.css`)
- [X] T033 [P] Finalize `README.md` and `.env.example` (run, test, dev proxy, and the `all-wordle.sqlite` rationale note)
- [X] T034 Backend smoke test from quickstart.md: `curl` `rate_solution` with target `crane` + non-answer guess `soare` and confirm it returns ratings (validates `all-wordle.sqlite` is deployed; research §5 fallback if not)
- [X] T035 Run full `quickstart.md` validation and `npm run test -- --run --coverage`; confirm SC-002, SC-003, SC-004, SC-006, SC-007, SC-008 and adequate coverage of `data/`, `api/`, `hooks/`, components (SC-009)
- [X] T036 Final `npm run lint` and `npm run typecheck` clean

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately
- **Foundational (Phase 2)**: depends on Setup — **BLOCKS all user stories**
- **User Stories (Phases 3–6)**: all depend on Foundational; then:
  - US1 (P1) → MVP, do first
  - US2 (P2), US3 (P3), US4 (P3) each depend only on Foundational + the shared US1 UI shell (`GuessInputs`, `SubmitBar`, `ResultsTable`, `App`); they are otherwise independent of one another
- **Polish (Phase 7)**: depends on the user stories you intend to ship

### Key task-level dependencies

- T007 ← T005, T006 · T008 ← T007 · T011 ← T009 · T013 ← T011, T012
- US1: T019 ← T011 · T020 ← T017 · T022 ← T018 · T023 ← T017,T019,T020,T021,T022
- US2: T025 ← T011 · T026 ← T022, T025
- US3: T028 ← T020, T023 · US4: T030 ← T021, T023

### Within each user story

- Tests are written first and should fail before implementation
- Shared leaf components (WordSelect, ScorePattern) before composites (GuessInputs, ResultsTable) before `App` wiring

---

## Parallel Opportunities

- **Setup**: T003, T004 in parallel (after T001/T002)
- **Foundational**: T005 ∥ T006; then T008 ∥ T009 ∥ T010 ∥ T012 (T011 after T009; T013 last)
- **US1 tests**: T014 ∥ T015 ∥ T016; **US1 leaf components**: T017 ∥ T018
- **Across stories** (after US1 shell exists): US2, US3, US4 can be built by different developers in parallel — each mostly touches its own component + a small `App`/`ResultsTable` wiring step

### Parallel Example: Foundational data + types + mocks

```bash
Task: "Port answers → src/data/answers.ts"          # T005
Task: "Port guesses → src/data/guesses.ts"          # T006
Task: "Define shared types in src/types.ts"          # T009
Task: "Create MSW handlers in src/test/mswHandlers.ts" # T012
```

### Parallel Example: User Story 1

```bash
# Tests first (all [P]):
Task: "useLuckRating hook test"     # T014
Task: "WordSelect component test"    # T015
Task: "App US1 integration test"     # T016
# Then leaf components in parallel:
Task: "WordSelect component"         # T017
Task: "ScorePattern component"       # T018
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 Setup → 2. Phase 2 Foundational (blocks everything) → 3. Phase 3 US1 → **STOP & validate** the rating flow end-to-end (quickstart steps 1). Demo-able MVP.

### Incremental Delivery

- Foundation ready → **US1 (MVP)** → **US2** (remaining popup) → **US3** (extra guesses) → **US4** (clear) → **Polish**. Each story is a shippable increment that doesn't break the previous ones.

---

## Notes

- `[P]` = different files, no dependency on an incomplete task; same-file edits are never `[P]`.
- The backend is reused unchanged; there are no backend tasks — only client integration (T011) and mocks (T012).
- Watch the two research open items: `all-wordle.sqlite` availability (T034) and that a solved guess ends the rating list so `rows ≤ guesses` (handle in T022/T019, not as an error).
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.
