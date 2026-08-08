# Phase 1 Data Model: Wordle Luck Rater (wordle-pal-2.0)

All data is client-side and transient (front-end only, no persistence). This describes the domain entities, their fields and validation, the derived word-list structures, and the client↔`wordle-svc` message shapes. TypeScript names are indicative; see `contracts/wordle-svc.md` for exact wire fields.

---

## Domain entities

### TargetWord
The puzzle's answer for the game being rated.
- **value**: `string` — exactly one 5-letter lowercase word.
- **Validation**: MUST be a member of `answerList`. Empty means "not yet chosen." (FR-001)

### GuessWord (slot)
A word the player entered, in order. Represented as an ordered list of slots.
- **value**: `string` — 5-letter lowercase word, or `""` for an empty slot.
- **Validation**: non-empty values MUST be members of `guessSet` (the union). Empty slots are allowed and ignored on submit. (FR-002, FR-003)
- **State**: default list length = 6; user may append slots (no fixed max). (FR-005)

### GuessGame (submit payload, derived)
The input actually sent to the backend.
- **target**: `TargetWord.value` (non-empty).
- **guesses**: `string[]` — the non-empty guess values in slot order.
- **Validity (Submit enabled)**: `target` non-empty AND `guesses.length ≥ 1`. (FR-006)

### GuessRating (one results row, from `rate_solution`)
Per-guess rating returned by the backend and rendered as a table row.
- **guess**: `string` — the guessed word (GUESS column).
- **score**: `string` — 5-char pattern over `{b, w, -}` against the target (SCORE column). See ScorePattern below.
- **luck**: `number` — backend luck value; displayed **truncated to 3 decimal places** (LUCK column). (FR-010, SC-003)
- **remainingCountBefore** / **remainingCountAfter**: `number` — `remaining_answers_prior` / `remaining_answers_post`; available for display/labeling in the REMAINING cell (e.g., a count on the button).
- *(carried but not required for display)*: `uncertaintyPrior`, `uncertaintyPost`, `expUncertaintyPost` — available if a details tooltip is desired.
- **Ordering**: rows follow guess order. The backend stops rating after a solving guess, so `rows.length ≤ guesses.length`. (see research §Open items)

### ScorePattern (rendering of `score`)
Interpretation of each character (ported from legacy `ColoredScore.js`; case-insensitive, normalize to lowercase):
| Char | Meaning | Color token |
|------|---------|-------------|
| `b`  | letter correct, correct position | orange `rgb(242,111,59)` |
| `w`  | letter present, wrong position   | blue `rgb(122,184,245)` |
| `-`  | letter absent from answer         | grey `rgb(109,113,115)` |
- **Solved** = pattern matches `^b+$` (all correct).

### RemainingAnswers (popup content, from `remaining_answers`)
The answer words still possible after a given row's guess.
- **rowIndex**: `number` — which guess row this list belongs to (0-based).
- **words**: `string[]` — remaining possible answer words (from guesses+scores up to and including `rowIndex`).
- **Invariant**: for a solved row, `words = [target]`. (Story 2, scenario 3)
- **Cache**: memoized per `rowIndex` for the current result set; cleared on new submit/Clear.

---

## Derived word-list structures (bundled data)

Ported from legacy `wordle-react-app/src/data/AnswerOptions.js` (~2,315 words) and `GuessOptions.js` (~12,947 words).

### answerList
- `string[]` — all valid answers (sorted). Source of TargetWord options.

### guessSet
- Union of `answerList` and the legacy guess list, de-duplicated (~13k words). Source of GuessWord options. Guarantees every answer is guessable (FR-003) — the explicit fix for the legacy omission.

### firstLetterIndex
- `Record<string, string[]>` — words grouped by first letter, sorted, for each of `answerList` and `guessSet`. Enables fast prefix filtering in WordSelect (mirrors legacy keyed-options approach). Filtering: lowercase+trim input → bucket by first char → keep words that `startsWith(input)`.

---

## Client → backend messages

### Request: rate_solution
```jsonc
{
  "operation": "rate_solution",
  "targets": ["<target>"],       // single-element for standard Wordle
  "guesses": ["<g1>", "<g2>"],    // non-empty guesses, in order
  "sequence": false,               // → backend routes through Quordle
  "hard_mode": false,
  "count": 1,
  "sqlite_dbname": "all-wordle.sqlite"  // required so union guesses are scorable (research §5)
}
```

### Response: rate_solution (single target)
```jsonc
{
  "by_target": {
    "<target>": [
      {
        "guess": "slate",
        "score": "b-w--",
        "remaining_answers_prior": 2315,
        "uncertainty_prior": 11.17,
        "remaining_answers_post": 42,
        "uncertainty_post": 5.39,
        "luck": 0.531,
        "exp_uncertainty_post": 5.44
      }
      // …one per rated guess
    ]
  },
  "totals": [ /* per-turn sums; unused by single-target UI */ ]
}
```
- Map `by_target[target]` → `GuessRating[]`.
- **Error shapes**: HTTP 500 with a stringified traceback (backend `error()`), or HTTP 200 with a body containing an `"error"` key / a rating object containing `"error"` (inconsistent inputs). All must surface a human-readable message (FR-014).

### Request: remaining_answers (per row, lazy)
```jsonc
{
  "operation": "remaining_answers",
  "guesses": ["<g1>", "…up to and including row n>"],
  "scores_list": [["<s1>", "…scores up to row n>"]],  // one list per target; scores from rate_solution response
  "sequence": false,
  "hard_mode": false,
  "sqlite_dbname": "all-wordle.sqlite"
}
```

### Response: remaining_answers (single target)
```jsonc
[ ["abbot", "actor", "…"] ]   // list-of-lists (one per target); read element [0]
```
- Map `response[0]` → `RemainingAnswers.words`.

---

## Entity relationships & lifecycle

```
answerList ──┐
             ├─► guessSet (union) ──► WordSelect options (target uses answerList; guesses use guessSet)
             │
TargetWord ──┤
GuessWord[] ─┴─► GuessGame ──(rate_solution)──► GuessRating[] ──► ResultsTable rows
                                                     │
                                        (per row, lazy remaining_answers)
                                                     ▼
                                              RemainingAnswers ──► RemainingPopup
```

**Lifecycle / state transitions** (managed by `useLuckRating`):
- `idle` → **Submit** → `loading` (elapsed-time ticking, abortable)
- `loading` → 200 + valid → `success` (has `GuessRating[]`)
- `loading` → 500 / body error / network failure / abort-timeout → `error` (human-readable message; retry allowed)
- any state → **Clear** → reset target + guess slots (back to 6 empty) → `idle`, drop results + remaining cache (FR-013)
- editing inputs after `success`/`error` re-enables Submit for a fresh run
