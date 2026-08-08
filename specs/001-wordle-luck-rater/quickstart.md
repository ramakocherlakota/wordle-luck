# Quickstart & Validation: Wordle Luck Rater (wordle-pal-2.0)

A run/validation guide that proves the feature works end-to-end. Implementation details (component bodies, full test suites) live in `tasks.md` / the implementation phase — this document is how you *verify* it.

## Prerequisites

- Node.js ≥ 20 and npm (or pnpm).
- Network access to the `wordle-svc` Lambda for live runs (dev proxy target below). Automated tests need **no** network — they use MSW.

## One-time setup

```bash
# from repo root: /Users/rama/work/wordle-pal-2.0
npm install
cp .env.example .env        # optional; VITE_API_URL defaults to /service
```

`vite.config.ts` proxies `/service` → `https://3a4sqenzhvr7ytnxakcsjeeh5u0hbynu.lambda-url.us-east-1.on.aws/` for dev (mirrors legacy `setupProxy.js`). Override with `VITE_API_URL` to point elsewhere.

## Run the app

```bash
npm run dev        # Vite dev server, typically http://localhost:5173
```

## Backend smoke test (do this first)

Confirm the backend answers and, critically, that `all-wordle.sqlite` supports non-answer guesses (research §5). From a terminal:

```bash
curl -s -X POST http://localhost:5173/service \
  -H 'Content-Type: application/json' \
  -d '{"operation":"rate_solution","targets":["crane"],"guesses":["soare","crane"],"sequence":false,"hard_mode":false,"count":1,"sqlite_dbname":"all-wordle.sqlite"}'
```

**Expected**: HTTP 200 with a `by_target.crane` array of rating objects (each having `guess`, `score`, `luck`, `remaining_answers_post`). `soare` (a non-answer opener) must rate without a `score_guess` error — this validates the DB choice. If it errors, see research §5 fallback.

## Automated tests (primary acceptance gate)

```bash
npm run test        # Vitest (watch)
npm run test -- --run --coverage   # single run with coverage (SC-009)
```

These cover, with MSW-mocked backend:
- **US1 / FR-007..FR-010, SC-002/003**: submit target+guesses → results table with GUESS/SCORE/LUCK columns; luck rendered to exactly 3 decimals.
- **US1 / FR-006**: Submit disabled until a target and ≥1 guess exist.
- **US1 / FR-008, SC-004**: loading + elapsed indicator appears within the loading state and persists until resolution (slow-path handler); request aborts on resubmit/unmount.
- **US2 / FR-011/012, SC-005**: REMAINING control opens a popup with the word list (lazy `remaining_answers`); dismiss returns to unchanged table; solved row ⇒ list is just the target.
- **US3 / FR-005**: six slots by default; "Add guess" adds slots; guesses in added slots are submitted.
- **US4 / FR-013, SC-008**: Clear resets target + all guess slots in one action.
- **FR-003 / SC-006**: `guessSet` = union(answers, guesses); a known answer missing from the raw legacy guess list is still selectable as a guess (unit test on `data/wordLists`).
- **FR-014 / SC-007**: 500 traceback, 200-with-`error`, and network failure each surface a human-readable message with retry.

## Manual end-to-end walkthrough (maps to Acceptance Scenarios)

1. **Rate a game (US1)**: pick target `crane`; enter guesses `soare`, `clint`, `crane`. Submit is enabled only once target + ≥1 guess are set. Click Submit → a loading indicator with elapsing seconds shows immediately → a table appears: one row per rated guess with GUESS, a colored SCORE pattern, LUCK to 3 decimals, and a REMAINING control.
2. **Inspect remaining (US2)**: click REMAINING on the `soare` row → popup lists the answer words still possible after `soare` → dismiss → table unchanged. On the final `crane` (solved) row, the remaining list is just `crane`.
3. **Extra guesses (US3)**: reload; confirm 6 empty guess slots; click "Add guess" to get a 7th; fill it; Submit includes it.
4. **Clear (US4)**: with inputs/results present, click Clear → target and all guess slots reset to empty, ready for a new game.
5. **Error handling (FR-014)**: temporarily point `VITE_API_URL` at an unreachable URL, Submit → a clear error message with a retry option appears (no blank/frozen screen).

## Build

```bash
npm run build && npm run preview   # production build + local preview
```

## Success signals

- All Vitest suites green with meaningful coverage of `data/`, `api/`, `hooks/`, and components (SC-009).
- Manual walkthrough steps 1–5 behave as described.
- Luck values always display to exactly 3 decimal places (SC-003); the table always shows one row per rated guess (SC-002); the app never appears frozen during a backend call (SC-004).
