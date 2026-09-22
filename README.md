# Wordle Luck (wordle-pal-2.0)

A front-end-only React + TypeScript app that rates **how lucky your Wordle guesses were**. Pick the target answer and the words you guessed — or [upload a screenshot](#filling-the-inputs-from-a-screenshot) of the finished game and let the app read them off the board — then submit and see a `GUESS | LUCK | REMAINING` table. Each row's REMAINING control opens a popup listing the answer words still possible after that guess. Your target and guesses are saved to `localStorage` and restored the next time you open the app.

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

### Screenshot regression fixtures

Most of `src/screenshot/` is tested against synthetic boards, but the breaks that
mattered all came from real screenshots, so `test-pix/` holds some. Each
subdirectory is one game, **named for the words played in order** — the last of
them being the answer — holding one image per theme it was shot in:

```
test-pix/trice-salon-whump-spine-snipe/{not-,}high-contrast-{not-,}dark.jpg
test-pix/trice-salon-whomp-booze-evoke-geode/high-contrast-dark.jpg
```

The first game is there in all four dark/high-contrast combinations. The second
is there for its answer: `geode` is not on the bundled answer list, which used
to take the whole board down with it (see the solver note below).

`realScreenshots.test.ts` derives what it expects from the directory name and
the scoring rules, so adding a game is a matter of dropping in the directory and
pointing a new `describe` at it. The images are decoded with `jpeg-js` rather
than a canvas, which jsdom does not have; everything downstream of decoding is
the same code the browser runs.

## Filling the inputs from a screenshot

Upload (or drop, or paste) a screenshot of a finished game and the target and
guesses fill themselves in. It all happens in the browser — no upload leaves the
page, no OCR dependency, nothing added to the bundle. `src/screenshot/`:

| Step         |                                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `grid.ts`    | Grows regions of near-uniform color, keeps the tile-shaped ones, fits the board's lattice to them, then reads **every** cell at its predicted position. |
| `glyphs.ts`  | Cuts the letter from each tile, normalizes it to a small bitmap, and ranks the 26 letters against the alphabet rendered on a canvas.                    |
| `palette.ts` | Works out which detected color means what, from the board's own structure.                                                                              |
| `solve.ts`   | Turns letter rankings into words.                                                                                                                       |

Two of those deserve explanation, because both replaced something simpler that
broke on real screenshots.

**Nothing is keyed off color.** Wordle ships several palettes, and a real
high-contrast dark screenshot turned out to use blue for correct and brown for
present — the reverse of the hue order the light high-contrast theme uses, over
_light_ grey absent tiles with _black_ letters on them. So meaning is inferred
instead: a finished game ends on a row that is entirely "correct", which names
that color outright, whatever it happens to be. That leaves at most two colors
to tell apart, and rather than guess between them, both readings go to the
solver — only one of them has real words that produce those colors.

**Segmentation only finds the lattice, not the tiles.** At the size screenshots
actually arrive in — 296×640, 40px tiles, JPEG — a tile will sometimes split
into a rim and a core, or blend into the neighbor it shares a color with, and
losing one tile used to lose its whole row. But the board is rigid: five
columns, one pitch, one tile size. So the tiles that survive segmentation are
used only to fit that lattice, and then every cell is read straight from the
image at its predicted position. A tile that segmentation mangled is read
anyway, from where its neighbors say it has to be.

The solver is what makes the letters good enough. Shape matching alone reads
about 92% of them correctly, useless on its own — but a finished board is
heavily over-determined: the all-correct row is the answer, and every other row
must be a guess-list word whose score against that answer reproduces its colors
exactly. So the parser picks the whole board at once, trying the words that best
fit the winning row and finding the cheapest legal word for every other row.
Rows correct each other, and misread letters get overruled.

**The answer list is a preference, not a rule.** Leaning on it is most of why a
misread winning row still comes out right, but it is a fixed snapshot and Wordle
has gone on setting words that are not in it. Forcing such a board onto the
nearest listed answer wrecked every _other_ row too — each was then re-read as
whatever scored its colors against the wrong answer, so `trice salon whomp booze
evoke geode` came back as `trice sayon whomp cooze leone globe`. An off-list
answer is allowed instead, priced at about one badly-read letter: a listed
answer wins any close contest, but a board that no listed answer explains reads
correctly. `SolvedBoard.targetIsAnswer` then says so, and the app leaves the
target box empty rather than parking it on a word it cannot submit.

Known limits:

- **A shared results grid won't work** — the emoji squares carry no letters.
  The app says so rather than guessing.
- **An unfinished game** has no all-correct row, so nothing pins down which
  color is which; the guesses are filled from shapes alone and the target is
  left blank. The same applies if something covers the winning row.
- **An answer outside the bundled list** is read off the board like any other
  word, and the guesses fill in as usual — but it can't be offered in the target
  box, so the summary names it and asks you to pick the answer yourself.

Anything the parser gets wrong is editable — it fills the same inputs you would
have typed, and nothing is submitted until you press Submit.

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

## Deploying from GitHub Actions

`.github/workflows/deploy.yml` runs `infra/deploy.sh` on every push to `main`,
and on demand from the Actions tab, once the checks in `.github/workflows/ci.yml`
have passed. The script is unchanged and still the thing to run by hand; the
workflow only arranges for it to run on a clean checkout with credentials.

Credentials come from GitHub's OIDC provider, so there is no AWS key stored in
the repository — the runner mints a short-lived token and AWS trades it for role
credentials that expire with the job. Setting that up is two steps.

**1. Create the role**, with credentials that can create IAM roles:

```bash
./infra/setup-github-oidc.sh
```

It registers GitHub's OIDC provider if the account has not got one, creates the
`wordle-luck-deploy` role, attaches the deploy policy, and prints the role ARN
for the next step. Re-running it is safe — each piece is created if missing and
updated if not.

The account ID goes in from `aws sts get-caller-identity` rather than being
edited into the files by hand. Doing it by hand is the step that fails
obscurely: IAM rejects an ARN with the placeholder still in it as
`MalformedPolicyDocument ... failed legacy parsing`, which names neither the file
nor the field. Only `infra/github-oidc-trust-policy.json` has a placeholder
left, and only because an OIDC provider ARN cannot avoid one;
`infra/github-oidc-permissions-policy.json` applies as it stands.

Which repository and branch may assume the role stays in the trust policy file,
and it admits exactly one thing: a workflow in this repository running against
`refs/heads/main`. A run from a branch or a fork gets no credentials.

**2. Point the workflow at the role.** In the repository's
Settings → Secrets and variables → Actions → Variables, add a variable named
`AWS_DEPLOY_ROLE_ARN` with the role's ARN
(the script prints it; `arn:aws:iam::<account>:role/wordle-luck-deploy`). It is a variable
rather than a secret because an ARN is not one, and an unmasked value is far
easier to debug. The deploy job stops with a pointer to this section if it is
missing.

### If the first run fails on permissions

`infra/github-oidc-permissions-policy.json` is scoped to this stack, this
bucket and this hosted zone, and it was written from what the template and the
script ask for rather than from a real run — the first deploy may still turn up
an action it does not grant. CloudFormation names the missing action in the
stack events, so add it and re-run. Tightening it is easier afterwards than
guessing at it beforehand.

### If you add an environment

The workflow deliberately does not use a GitHub `environment:`. Adding one
changes the OIDC subject claim to
`repo:ramakocherlakota/wordle-luck:environment:<name>`, so the `sub` condition
in the trust policy has to change with it or every deploy fails to assume the
role.

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
