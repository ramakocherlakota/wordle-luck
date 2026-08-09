# Wordle Luck (wordle-pal-2.0)

A front-end-only React + TypeScript app that rates **how lucky your Wordle guesses were**. Pick the target answer and the words you guessed, submit, and see a `GUESS | LUCK | REMAINING` table. Each row's REMAINING control opens a popup listing the answer words still possible after that guess. Your target and guesses are saved to `localStorage` and restored the next time you open the app.

All computation is delegated to the existing [`wordle-svc`](https://github.com/ramakocherlakota/wordle-pal/tree/main/wordle-svc) AWS Lambda (the same backend the legacy Wordle Pal uses). This repo contains **only the front end**.

## Tech stack

- React 18 + TypeScript 5 (strict), built with **Vite 6**
- Native `fetch` + `AbortController` for the two backend calls (no HTTP library)
- CSS Modules + design tokens (`src/styles/tokens.css`), light/dark aware
- **Vitest** + React Testing Library + `@testing-library/user-event`, with **MSW** mocking the backend

## Prerequisites

- Node.js ≥ 20 and npm
- Network access to the `wordle-svc` Lambda for live runs. Automated tests need **no** network — they use MSW.

## Setup

```bash
npm install
cp .env.example .env   # optional; VITE_API_URL defaults to /service
```

## Run

```bash
npm run dev            # Vite dev server, typically http://localhost:5173
```

### Dev proxy

`vite.config.ts` proxies `/service` → the Lambda Function URL
(`https://3a4sqenzhvr7ytnxakcsjeeh5u0hbynu.lambda-url.us-east-1.on.aws/`), so
browser calls stay same-origin and avoid CORS in dev (mirrors the legacy
`setupProxy.js`). Point the app elsewhere with `VITE_API_URL`, or change the
proxy target with `VITE_PROXY_TARGET`.

### Why `all-wordle.sqlite`

The app accepts the **union** of the answer list and the guess list as valid
guesses, because common openers (`soare`, `adieu`, …) are valid guesses but not
answers. Scoring those against the default `wordle.sqlite` DB fails, so every
backend request sends `sqlite_dbname: "all-wordle.sqlite"` (the larger
all-guesses scores DB). Its queries are slower — which is why the app always
shows continuous waiting feedback during a rating call.

## Test

```bash
npm run test                     # Vitest (watch)
npm run test -- --run            # single run
npm run test -- --run --coverage # single run with coverage
```

## Lint / format / typecheck

```bash
npm run lint
npm run format
npm run typecheck
```

## Build

```bash
npm run build && npm run preview # production build + local preview
```

## Icons

`public/favicon.svg` is the source of truth. After editing it, regenerate the
raster icons — Vite copies `public/` into `dist/` as-is, so they do not rebuild
themselves:

```bash
./infra/gen-icons.sh    # rewrites public/favicon.ico + public/apple-touch-icon.png
```

Needs headless Chrome (override the path with `CHROME=`) and ImageMagick.

## Backend smoke test

Confirm the backend answers and that `all-wordle.sqlite` supports non-answer
guesses (run the dev server first so `/service` is proxied):

```bash
curl -s -X POST http://localhost:5173/service \
  -H 'Content-Type: application/json' \
  -d '{"operation":"rate_solution","targets":["crane"],"guesses":["soare","crane"],"sequence":false,"hard_mode":false,"count":1,"sqlite_dbname":"all-wordle.sqlite"}'
```

Expect HTTP 200 with a `by_target.crane` array of rating objects; `soare` (a
non-answer opener) must rate without a `score_guess` error.

## Credits

The shamrock icon is the U+2618 glyph from
[Twemoji](https://github.com/jdecked/twemoji). Graphics by Twitter, Inc and
other contributors, licensed under
[CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/).
