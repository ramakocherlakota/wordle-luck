# Contract: wordle-svc backend (as consumed by wordle-pal-2.0)

wp2 is a client of the **existing, unchanged** `wordle-svc` AWS Lambda (source: `/Users/rama/work/wordle-pal/wordle-svc/{lambda.py,Wordle.py,Quordle.py}`). wp2 does not define or modify the backend; this document records the exact request/response contract wp2 depends on, so the front end and its tests (MSW handlers) stay faithful to it.

- **Transport**: HTTP `POST`, `Content-Type: application/json`, single JSON object body.
- **Endpoint (base URL)**: `import.meta.env.VITE_API_URL` (default `/service`). Dev: Vite proxies `/service` → `https://3a4sqenzhvr7ytnxakcsjeeh5u0hbynu.lambda-url.us-east-1.on.aws/`.
- **Routing rule** (`lambda.py`): `sequence:false` (or absent) → `Quordle`; `operation` field selects the method. wp2 always sends `sequence:false`, so response shapes below are the **Quordle** shapes.
- **`sqlite_dbname`**: wp2 always sends `"all-wordle.sqlite"` so that guesses outside the 2,315-answer set (the union requirement, FR-003) are scorable. See research §5.
- **Latency**: responses can take many seconds to minutes. Client uses `fetch` + `AbortController`, long timeout (default 900 s), abort on resubmit/unmount.

---

## Operation A — `rate_solution` (per-guess luck)

Used once per Submit (User Story 1). Backend derives each guess's score from the target; the client does **not** send scores.

### Request
```jsonc
{
  "operation": "rate_solution",
  "targets": ["crane"],           // exactly one target for standard Wordle
  "guesses": ["soare", "clint", "crane"],
  "sequence": false,
  "hard_mode": false,
  "count": 1,
  "sqlite_dbname": "all-wordle.sqlite"
}
```
| Field | Type | Notes |
|-------|------|-------|
| `operation` | `"rate_solution"` | required |
| `targets` | `string[]` | length 1; the chosen answer |
| `guesses` | `string[]` | non-empty guesses, in play order |
| `sequence` | `false` | forces Quordle path |
| `hard_mode` | `false` | out of scope for wp2 |
| `count` | `1` | mirrors legacy Luck request |
| `sqlite_dbname` | `"all-wordle.sqlite"` | scorability of union guesses |

### Success response — HTTP 200 (`Quordle.rate_solution`)
```jsonc
{
  "by_target": {
    "crane": [
      {
        "guess": "soare",
        "score": "-w--w",
        "remaining_answers_prior": 2315,
        "uncertainty_prior": 11.176,
        "remaining_answers_post": 51,
        "uncertainty_post": 5.672,
        "luck": 0.284,
        "exp_uncertainty_post": 5.956
      }
      // …one object per rated guess
    ]
  },
  "totals": [ { "guess": "soare", "uncertainty_prior": 11.176, "uncertainty_post": 5.672, "luck": 0.284, "exp_uncertainty_post": 5.956 } ]
}
```
- **Consume**: `by_target[targets[0]]` → results rows. Ignore `totals` (multi-target aggregate; not shown in single-target UI).
- **Row count**: the backend appends a rating only while the game is unsolved, so `rows.length ≤ guesses.length` (a solving guess ends the list). Not an error.
- **`score`**: 5 chars over `{b,w,-}`, may be lowercase — normalize case-insensitively. `b`=correct spot, `w`=present/wrong spot, `-`=absent.
- **`luck`**: raw float — the UI truncates to 3 decimals for display.

### Error responses
| Condition | Shape | Client handling |
|-----------|-------|-----------------|
| Backend exception | HTTP **500**, body = JSON string of a Python traceback | Show generic human-readable failure + allow retry (FR-014); log detail to console. |
| Inconsistent inputs | HTTP **200**, a rating object contains `"error": "…inputs are inconsistent."` | Surface the message. |
| Missing target (guarded client-side) | `{ "error": "Rating requires targets." }` | Prevented by Submit enablement (FR-006). |
| Network/timeout/abort | fetch rejects / `AbortError` | Show unreachable/timeout message + retry. |

---

## Operation B — `remaining_answers` (words still possible)

Used lazily when a row's REMAINING control is opened (User Story 2). Sends the guesses and their scores **up to and including** that row; scores come from Operation A's response.

### Request (for row index `n`, 0-based)
```jsonc
{
  "operation": "remaining_answers",
  "guesses": ["soare", "clint"],          // guesses[0..n]
  "scores_list": [["-w--w", "b--w-"]],    // one list per target; scores[0..n]
  "sequence": false,
  "hard_mode": false,
  "sqlite_dbname": "all-wordle.sqlite"
}
```
| Field | Type | Notes |
|-------|------|-------|
| `operation` | `"remaining_answers"` | required |
| `guesses` | `string[]` | prefix through row `n` |
| `scores_list` | `string[][]` | length 1 (single target); inner = scores through row `n` |
| `sequence` | `false` | forces Quordle path |
| `hard_mode` | `false` | out of scope |
| `sqlite_dbname` | `"all-wordle.sqlite"` | consistency with rating DB |

### Success response — HTTP 200 (`Quordle.remaining_answers`)
```jsonc
[ ["abbot", "actor", "cabot", "…"] ]   // list-of-lists (one inner list per target)
```
- **Consume**: `response[0]` → `RemainingAnswers.words`. Solved row ⇒ `["crane"]` (just the target).
- **Empty inner list** ⇒ inconsistent inputs (should not occur for backend-derived scores); show a friendly "no remaining words" / error state.

### Error responses
Same categories as Operation A (HTTP 500 traceback; network/timeout/abort). Popup shows an inline error with a retry affordance and remains dismissible.

---

## Contract test expectations (MSW)

`src/test/mswHandlers.ts` provides handlers that reproduce these shapes so component/integration tests never hit the network:
- **Happy path** `rate_solution` → a `by_target` fixture with ≥2 rows incl. a solved final row.
- **Happy path** `remaining_answers` → `[[…]]`; solved-row variant → `[[target]]`.
- **Error path** → HTTP 500 with a traceback string; and a 200-with-`error`-key body.
- **Slow path** → delayed resolution to assert the loading/elapsed indicator (FR-008, SC-004).
- **Abort** → assert in-flight request cancels on resubmit/unmount.
