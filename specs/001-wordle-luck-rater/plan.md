# Implementation Plan: Wordle Luck Rater (wordle-pal-2.0)

**Branch**: `001-wordle-luck-rater` | **Date**: 2026-07-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-wordle-luck-rater/spec.md`

## Summary

Build a modern, front-end-only TypeScript/React single-page app that rates how lucky a player's guesses were in a standard Wordle game. The user picks a target answer and the words they guessed (via a type-to-filter word selector), submits, and — after a clearly-communicated wait — sees a `GUESS | SCORE | LUCK | REMAINING` table. Each row's REMAINING cell opens a popup listing the answer words still possible after that guess. All computation is delegated to the existing `wordle-svc` backend (the same AWS Lambda used by legacy Wordle Pal) via two operations: `rate_solution` (target + guesses → per-guess luck ratings) and `remaining_answers` (guesses + scores → remaining answer words). Word lists are bundled with the app; the allowed guess set is the union of the answer list and the guess list.

## Technical Context

**Language/Version**: TypeScript 5.6 (strict mode)

**Primary Dependencies**: React 18.3, Vite 6 (dev server + bundler). No runtime UI-component or HTTP libraries — native `fetch` for the API layer and CSS Modules for styling, to keep the bundle small and give full aesthetic control.

**Storage**: N/A (front-end only; no persistence required by the spec). Word lists are bundled as static TypeScript data modules.

**Testing**: Vitest + React Testing Library + `@testing-library/user-event` (jsdom environment); Mock Service Worker (MSW) to mock backend HTTP in component/integration tests.

**Target Platform**: Modern evergreen browsers (desktop + mobile), responsive layout.

**Project Type**: Single-page web application (front-end only). Repository root **is** the front-end project.

**Performance Goals**: UI interactions (word selection, add-guess, clear, opening popups) feel instant (<100 ms perceived). The backend rating call is inherently slow (heavy combinatorial SQL; legacy allowed up to a 15-minute timeout) — the app's job is continuous, responsive waiting feedback, not shortening that call.

**Constraints**:
- Allowed guess set = union(answers, guesses) — every valid answer must be selectable as a guess (works around the legacy guess-list omission).
- Because common opening guesses (e.g., `adieu`, `soare`) are **not** answers, rating requests must target the larger scores database so every allowed guess is scorable → send `sqlite_dbname: "all-wordle.sqlite"`.
- Backend calls are cross-origin to a Lambda Function URL; handle via a dev proxy locally and a configurable base URL (`VITE_API_URL`, default `/service`).
- Long request window: use `fetch` + `AbortController` with a generous timeout and cancel-on-unmount / cancel-on-resubmit.

**Scale/Scope**: Single-screen app. ~2,315 answer words and ~12,947 guess words bundled (~1,200 lines of luck-relevant app code excluding data + tests). One user, one game at a time. No auth, no accounts, no multi-tenancy.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution (`.specify/memory/constitution.md`) is still the unfilled template — no ratified principles or constraints are defined. There are therefore no explicit governance gates to satisfy. In the absence of ratified principles, this plan applies conventional best-practice gates and records them so a future constitution can formalize them:

| Gate (best-practice default) | Status | Notes |
|------------------------------|--------|-------|
| Test coverage for core logic | PASS (planned) | Spec FR + SC-009 require unit tests for rating flow, union guess set, luck truncation, error handling. Vitest + RTL + MSW cover unit and component/integration levels. |
| Simplicity / YAGNI | PASS | Scope limited to single-target standard Wordle (FR-015). No state library, no UI framework, no backend added. |
| No unjustified new projects | PASS | Single front-end project; backend reused as-is. |
| Accessibility & responsiveness | PASS (planned) | Custom combobox follows the ARIA combobox pattern; responsive CSS. |

**Result**: PASS. No violations; Complexity Tracking left empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-wordle-luck-rater/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── wordle-svc.md    # Backend request/response contract (rate_solution, remaining_answers)
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

Front-end-only single project rooted at the repo. Tests are co-located with the code they exercise (Vitest/RTL idiom), plus a small `src/test/` for shared setup and MSW handlers.

```text
wordle-pal-2.0/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts                 # dev server + /service proxy to the Lambda URL
├── vitest.config.ts               # (or test config inside vite.config.ts)
├── .env.example                   # VITE_API_URL documentation
├── src/
│   ├── main.tsx                   # React entry
│   ├── App.tsx                    # top-level screen: inputs → submit → results
│   ├── App.module.css
│   ├── types.ts                   # shared domain + API types
│   ├── data/
│   │   ├── answers.ts             # answer words (ported from legacy AnswerOptions.js)
│   │   ├── guesses.ts             # guess words (ported from legacy GuessOptions.js)
│   │   └── wordLists.ts           # derives answerList, guessList = union(answers, guesses), first-letter index
│   ├── api/
│   │   ├── wordleService.ts       # rateSolution() + remainingAnswers() over fetch + AbortController
│   │   └── wordleService.test.ts
│   ├── hooks/
│   │   ├── useLuckRating.ts       # submit/loading/elapsed/error/result state machine
│   │   └── useLuckRating.test.ts
│   ├── components/
│   │   ├── WordSelect/            # accessible type-to-filter combobox (target + each guess)
│   │   │   ├── WordSelect.tsx
│   │   │   ├── WordSelect.module.css
│   │   │   └── WordSelect.test.tsx
│   │   ├── GuessInputs/           # 6 slots by default + "Add guess" control
│   │   │   ├── GuessInputs.tsx
│   │   │   └── GuessInputs.test.tsx
│   │   ├── SubmitBar/             # Submit (enablement) + Clear + loading/elapsed indicator
│   │   │   ├── SubmitBar.tsx
│   │   │   └── SubmitBar.test.tsx
│   │   ├── ScorePattern/          # renders the 5-letter colored score (b/w/-)
│   │   │   ├── ScorePattern.tsx
│   │   │   └── ScorePattern.test.tsx
│   │   ├── ResultsTable/          # GUESS | SCORE | LUCK | REMAINING
│   │   │   ├── ResultsTable.tsx
│   │   │   └── ResultsTable.test.tsx
│   │   └── RemainingPopup/        # lazy remaining_answers fetch + word-list dialog
│   │       ├── RemainingPopup.tsx
│   │       └── RemainingPopup.test.tsx
│   ├── styles/
│   │   └── tokens.css             # design tokens (colors incl. score colors, spacing, type), light/dark
│   └── test/
│       ├── setup.ts               # RTL/jest-dom setup
│       └── mswHandlers.ts         # MSW request handlers for the two operations
└── README.md
```

**Structure Decision**: Single front-end project at the repository root (the repo *is* wordle-pal-2.0). No `frontend/` + `backend/` split because the backend is the pre-existing `wordle-svc` and is out of scope for this feature. Domain logic that is worth unit-testing in isolation (word-list union + indexing, API request/response mapping, luck truncation, the submit state machine) lives in `data/`, `api/`, and `hooks/` so it can be tested without rendering; presentational concerns live in `components/`.

## Complexity Tracking

> No constitution violations; no entries required.
