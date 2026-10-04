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

### Why `plausible-wordle.sqlite`

The app accepts every guess the NYT game accepts (`src/data/guesses-v2.ts`,
14,855 words) and offers as targets every word that could plausibly be the
answer (`src/data/plausible-answers.ts`, 3,391 words; see
[Plausible answers](#plausible-answers-from-a-guess-list)). Luck is measured
against that answer list, so every backend request sends
`sqlite_dbname: "plausible-wordle.sqlite"`, the database built from exactly
those two lists (see
[Rebuilding the wordle-svc database](#rebuilding-the-wordle-svc-database)). The
two must stay in step: regenerate the answer list and rebuild the database
together, or the app will offer words the service cannot score.

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
test-pix/stare-cream-pager/not-high-contrast-dark.jpg
test-pix/trice-salon-usury/high-contrast-dark.jpg
```

The first game is there in all four dark/high-contrast combinations. The second
is there for its answer: `geode` was not on the answer list the app first
shipped, which used to take the whole board down with it (see the solver note
below). The app's lists have it now, so that test reads the board against the
old lists to keep the case covered. The third has
more present tiles than absent ones, which once got the two colours read the
wrong way round. The fourth is a whole phone screen, browser chrome and all, and
is there for Safari's bottom toolbar, whose round buttons are tile-shaped enough
to have been read as a seventh row.

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
columns, one pitch, one tile size — and at most six rows, on that same pitch. So the tiles that survive segmentation are
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
- **An answer outside the bundled list** (a word Wordle sets that the
  plausible-answer list missed) is read off the board like any other
  word, and the guesses fill in as usual — but it can't be offered in the target
  box, so the summary names it and asks you to pick the answer yourself.

Anything the parser gets wrong is editable — it fills the same inputs you would
have typed, and nothing is submitted until you press Submit.

## Plausible answers from a guess list

`src/data/guesses-v2.ts` holds the 14,855 guesses Wordle accepts today. Very few
of them could ever be the answer. The NYT does not publish its answer list, so
`tools/plausible-answers/` works out which ones could be, from the answers the
editors have already picked. Rerun it whenever the guess list changes:

```bash
python3 -m venv .venv   # Python 3.10 or later
.venv/bin/python -m pip install -r tools/plausible-answers/requirements.txt
.venv/bin/python tools/plausible-answers/plausible_answers.py \
  --guesses src/data/guesses-v2.ts \
  --answers src/data/answers.ts --pool src/data/guesses.ts \
  --history tools/plausible-answers/nyt-answers.txt \
  --block tools/plausible-answers/blocklist.txt \
  --allow tools/plausible-answers/allowlist.txt \
  --out tools/plausible-answers --ts src/data/plausible-answers.ts
```

It writes three files:

- `plausible-answers.txt`, the list itself.
- `review.txt`, common words the rules turned away that a person should look at.
- `scores.csv` (not committed), every guess with its score, its verdict and
  every feature.

The first run downloads a few NLTK corpora. Install with `python -m pip` rather than
bare `pip`: on a Mac especially, `pip` often belongs to a different Python than
`python`, and the script then cannot find what was installed.

It has two stages, because some exclusions are a matter of kind rather than
degree, and no amount of frequency should overturn them.

**Rules.** These are what each rule excludes from the 14,855 guesses, and what
it would have cost among the 2,377 answers known so far (the original 2,315,
plus NYT picks through 2026-10-01):

| A word is excluded if it is…                                                                                                   | excludes | known answers it would exclude                                     |
| ------------------------------------------------------------------------------------------------------------------------------ | -------: | ------------------------------------------------------------------ |
| not a lowercase word in WordNet or the Unix word list, nor an inflection of one (rules out names, slang, junk such as `padou`) |    6,071 | 21, mostly too new for either (`emoji`, `ramen`, `rehab`, `admin`) |
| a first name the Unix list happens to have lowercase (`colin`, a quail)                                                        |       74 | 3: `roger`, `ralph`, `willy`                                       |
| a regular plural (`cats`, `menus`, `wives`)                                                                                    |    2,941 | 0                                                                  |
| a regular past tense (`baked`), but not `-ied` (`dried`, `fried`, `tried` are answers)                                         |      488 | 7: `freed`, `steed`, `clued`, `bused`, `unfed`, `kneed`, `abled`   |
| offensive in every WordNet sense                                                                                               |       15 | 1: `bawdy`                                                         |

Plurals are the clean case: not one has ever been the answer. Past tenses are
nearly as clean, once `-ied` is let through. Irregular forms (`began`, `wrote`,
`women`, `geese`) and comparatives (`wider`, `safer`) are answers, so they are
left to the ranking.

**Ranking.** Among words that pass, a logistic regression learns from the
known answers, against the eligible guesses never picked. Its features are how
common the word is (`wordfreq`) and whether WordNet has it. Then how often it
turns up in sense-tagged text, how many senses it has, and its parts of speech.
Finally, how often it is written as a name, which is measured by how often it
is capitalised mid-sentence across NLTK's cased corpora.

**Threshold.** The cut is set on cross-validated scores, so every known answer
is scored by a model that never saw it. `--recall 0.99`, the default, admits
any word that scores at least as well as the bottom 1% of real answers did. The
honest test is the 62 answers the NYT has set from outside the original list.
The run prints the trade-off:

| `--recall` | new words admitted | of the 62 NYT off-list picks, admitted |
| ---------: | -----------------: | -------------------------------------: |
|       0.95 |                424 |                               41 (66%) |
|       0.97 |                583 |                               47 (76%) |
|       0.99 |              1,001 |                               54 (87%) |
|      0.995 |              1,293 |                               58 (94%) |

The editors' newer picks lean further into the obscure than the original list
did (`kefir`, `gofer`, `pshaw`, `loris` are the ones 0.99 misses), which is why
the default is set this high.

**Hand-kept lists.** `blocklist.txt` holds what a dictionary cannot catch.
Names it lists for some obscure lowercase sense (`henry` is a unit, `japan` a
lacquer). Vulgar words with one innocent sense. Foreign words. `allowlist.txt`
admits words too new for the dictionaries. It is seeded from `review.txt` with
suggestions only (`promo`, `chemo`, `ebook`, `synth`), so prune it to taste.

**Answer history.** `nyt-answers.txt` lists every NYT answer from 2022-11-07,
when the NYT began editing the list, to 2026-10-01. The answers come from
`https://www.nytimes.com/svc/wordle/v2/YYYY-MM-DD.json`. Append new days as
they are played. Every word in it is always included, and every word is trained
on. Two words in it have already come round a second time (`sandy`, `smile`),
so past answers are no longer safe to drop.

## Rebuilding the wordle-svc database

wordle-svc reads every score from a SQLite database on EFS, one row per
(answer, guess) pair. `tools/wordle-svc-db/build_db.py` builds one from any two
word lists, computing the scores itself, with the same tables and columns as
wordle-pal's `db/create-db.sh`, so the service's queries run unchanged. It needs
only Python's standard library:

```bash
python3 tools/wordle-svc-db/build_db.py \
  --answers tools/plausible-answers/plausible-answers.txt \
  --guesses src/data/guesses-v2.ts \
  --out plausible-wordle.sqlite
```

On those lists that is 3,391 answers × 14,855 guesses, 50.4M rows and 2.4 GB,
built in about three minutes. Its scorer agrees with `compute-scores.py`, the
one the existing databases were built with, on every pair checked (7.2M).

**The layout is built for EFS**, where every page read is a network round
trip. `create-db.sh`'s table keeps each score apart from the indexes that find
it. Rating a guess against every answer then costs a separate read per answer,
and a rating request took about 5 seconds every time. Here `scores` is a
`WITHOUT ROWID` table clustered on `(guess, answer)`, so all of a guess's rows
sit together with their scores. The `(guess, score)` index carries the answer
as well, and pages are 64 KB. Run by wordle-svc's own handler, rating a game
reads the file this many times:

| Game                            | `create-db.sh` layout | this layout |
| ------------------------------- | --------------------: | ----------: |
| `soare edict`                   |                 6,683 |          80 |
| `trice salon whump spine snipe` |                 7,034 |         228 |

Both layouts give identical ratings. `--layout rowid` still builds the old
layout, for comparison.

**The service needs SQLite 3.8.2 or later** to read this layout, which means
wordle-svc's Lambda must run on the `python3.12` runtime or later (set
`Runtime` in wordle-pal's `sam/template.yaml`). `python3.11` and earlier run on
Amazon Linux 2, whose SQLite is 3.7.17, and every rating then fails with
`malformed database schema (scores) - near "without": syntax error`.

The service opens whichever file a request names in `sqlite_dbname`, so a new
database goes alongside the old one on EFS and needs no Lambda deploy. The app
switches over when it sends the new name.

One other deliberate difference from `create-db.sh`: `log2_lookup` holds base-2
logarithms. `create-db.sh` fills it with Perl's `log`, which is the natural
log, while the service computes every other uncertainty in bits, so on a
database built that way each luck figure subtracts bits from nats.

### Putting the database on EFS

The database has to be on EFS before an app that asks for it is deployed.
Otherwise every rating fails, because the service cannot open the file. EFS
cannot be uploaded to from the console. The file has to be copied in from a
machine that mounts the file system: here, a temporary EC2 instance that pulls
the file from S3.

**1. Build the database and upload it to S3**, from your own machine. Any
bucket in us-east-1 will do; this uses the wordle-svc code bucket.

```bash
python3 tools/wordle-svc-db/build_db.py \
  --answers tools/plausible-answers/plausible-answers.txt \
  --guesses src/data/guesses-v2.ts --out plausible-wordle.sqlite
aws s3 cp plausible-wordle.sqlite s3://wordle-pal-svc-code/db/plausible-wordle.sqlite --region us-east-1
```

**2. Find the file system and the network it lives on.** The site sends ratings
to the `wordle-pal-svc` Lambda in us-east-1 (CloudFront's `ApiOriginDomain` in
`infra/template.yaml`). Ask the Lambda what it mounts, then where EFS can be
reached from:

```bash
export AWS_REGION=us-east-1
aws lambda get-function-configuration --function-name wordle-pal-svc \
  --query '{accessPoint: FileSystemConfigs[0].Arn, subnets: VpcConfig.SubnetIds, securityGroups: VpcConfig.SecurityGroupIds}'
aws efs describe-access-points --access-point-id fsap-... --query 'AccessPoints[0].FileSystemId'
aws ec2 describe-subnets --subnet-ids subnet-LAMBDA --query 'Subnets[0].VpcId'
aws efs describe-mount-targets --file-system-id fs-... \
  --query 'MountTargets[].{az: AvailabilityZoneName, subnet: SubnetId, ip: IpAddress}'
aws ec2 describe-subnets --filters Name=vpc-id,Values=vpc-... \
  --query 'Subnets[].{id: SubnetId, az: AvailabilityZone, publicIpOnLaunch: MapPublicIpOnLaunch}'
aws ec2 describe-route-tables --filters Name=vpc-id,Values=vpc-... \
  --query 'RouteTables[].{subnets: Associations[].SubnetId, main: Associations[0].Main, routes: Routes[].GatewayId}'
```

If the EFS console shows no file systems, you are probably signed into a
different account from the one the Lambda runs in. Compare the account ID in
the console's top-right corner with `aws sts get-caller-identity`.

Pick a **public subnet**, one whose route table has an `igw-...` route (a subnet
with no route table of its own uses the one marked `main`). It must be **in an
Availability Zone that has a mount target**. The Lambda's own subnet is usually
private, which is why Instance Connect could not reach an instance there.

**3. Create a security group that lets EC2 Instance Connect in.** Instance
Connect's browser sessions come from AWS's own addresses (`18.206.107.24/29`
in us-east-1), not from your machine:

```bash
aws ec2 create-security-group --vpc-id vpc-... \
  --group-name instance-connect-ssh --description 'SSH from EC2 Instance Connect'
aws ec2 authorize-security-group-ingress --group-id sg-NEW \
  --protocol tcp --port 22 --cidr 18.206.107.24/29
```

**4. Create a role that lets the instance read the file from S3:**

```bash
aws iam create-role --role-name wordle-db-upload --assume-role-policy-document \
  '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
aws iam put-role-policy --role-name wordle-db-upload --policy-name read-db --policy-document \
  '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"s3:GetObject","Resource":"arn:aws:s3:::wordle-pal-svc-code/db/*"}]}'
aws iam create-instance-profile --instance-profile-name wordle-db-upload
aws iam add-role-to-instance-profile --instance-profile-name wordle-db-upload --role-name wordle-db-upload
```

**5. Launch the instance**, in the EC2 console with "Launch instance":

- **Name**: `wordle-db-upload`. **AMI**: Amazon Linux 2023 (the default).
  **Instance type**: `t3.micro`.
- **Key pair**: "Proceed without a key pair". Instance Connect supplies its own.
- **Network settings**, then **Edit**:
  - **VPC**: the Lambda's.
  - **Subnet**: the public one picked in step 2.
  - **Auto-assign public IP**: Enable.
  - **Firewall**: "Select existing security group", choosing both the Lambda's
    group (EFS lets it in) and `instance-connect-ssh`.
- **Storage**: the default 8 GB is enough, since the file goes straight from
  S3 to EFS.
- **Advanced details**, then **IAM instance profile**: `wordle-db-upload`.

**6. Connect.** Select the instance once it is running, then **Connect**, the
**EC2 Instance Connect** tab, user `ec2-user`, **Connect**. "Unable to connect"
means one of steps 2, 3 or 5 is off: no public IP, no internet-gateway route,
or no `instance-connect-ssh` group.

**7. Mount EFS through the Lambda's access point and copy the file in.** The
access point makes the instance see the directory the Lambda sees. Copy straight
onto EFS: on Amazon Linux 2023 `/tmp` is held in memory and too small for the
file.

```bash
sudo dnf install -y amazon-efs-utils
sudo mkdir -p /mnt/efs
sudo mount -t efs -o tls,accesspoint=fsap-... fs-...:/ /mnt/efs
ls -la /mnt/efs        # all-wordle.sqlite should be here
sudo aws s3 cp s3://wordle-pal-svc-code/db/plausible-wordle.sqlite /mnt/efs/plausible-wordle.sqlite.new
sudo mv /mnt/efs/plausible-wordle.sqlite.new /mnt/efs/plausible-wordle.sqlite
ls -la /mnt/efs        # plausible-wordle.sqlite: about 2.4 GB
sudo umount /mnt/efs
```

Copying to a new name and renaming replaces an existing database in one step,
so the service never opens a half-copied file.

If the mount hangs, the subnet's zone has no mount target, or the mount
target's security group does not admit the Lambda's. If it fails to resolve
`fs-....efs.us-east-1.amazonaws.com`, the VPC has DNS hostnames off. Add
`,mounttargetip=` and the mount target's IP from step 2 to the `-o` options.

**8. Check the service can open it**, from your own machine.
Call the Lambda the site uses directly. The dev server's `/service` proxy
points at a different function URL, so it cannot confirm this:

```bash
curl -s -X POST https://kxk4tebf2oubdbadxazw5uuvma0dvfpe.lambda-url.us-east-1.on.aws/ \
  -H 'Content-Type: application/json' \
  -d '{"operation":"rate_solution","targets":["kefir"],"guesses":["soare","kefir"],"sequence":false,"hard_mode":false,"count":1,"sqlite_dbname":"plausible-wordle.sqlite"}'
```

It should return a `by_target.kefir` array of ratings. An HTTP 500 that names
a path that does not exist means the file is not where the Lambda looks. Only
once this works should you deploy the app that names the new database.

**9. Clean up**: terminate the instance in the console (or stop it, to keep it
for next time: see below), then

```bash
aws s3 rm s3://wordle-pal-svc-code/db/plausible-wordle.sqlite
aws iam remove-role-from-instance-profile --instance-profile-name wordle-db-upload --role-name wordle-db-upload
aws iam delete-instance-profile --instance-profile-name wordle-db-upload
aws iam delete-role-policy --role-name wordle-db-upload --policy-name read-db
aws iam delete-role --role-name wordle-db-upload
aws ec2 delete-security-group --group-id sg-NEW   # once the instance has terminated
```

### Keeping the instance for next time

Stopping the instance instead of terminating it keeps the setup for the next
database change. It keeps its subnet, security groups, role and installed
packages. A stopped instance costs only its 8 GB disk, about $0.65 a month.
Its public IP is released on stop, so there is no IPv4 charge, and it gets a
new one on start, which Instance Connect does not mind. Keep the
`wordle-db-upload` role and instance profile and the `instance-connect-ssh`
group if you do. Deleting the S3 copy is still fine.

**Mount EFS at boot.** Run this once, so it is mounted whenever the instance
starts. The `mounttargetip` is the mount target in the instance's own zone,
and a stopped instance stays in its zone.

```bash
echo 'fs-...:/ /mnt/efs efs _netdev,tls,accesspoint=fsap-...,mounttargetip=... 0 0' | sudo tee -a /etc/fstab
sudo mount -a && ls /mnt/efs
```

**Build on the instance**, which skips S3 altogether. It can reach GitHub, and
`build_db.py` needs only the Python that Amazon Linux 2023 already has. It is
slower on a small instance than on a laptop, but unattended. Build into the
home directory rather than `/tmp`, which Amazon Linux 2023 holds in memory:

```bash
sudo dnf upgrade -y            # it falls behind while stopped
sudo dnf install -y git        # first time only
git clone https://github.com/ramakocherlakota/wordle-luck || git -C wordle-luck pull
cd wordle-luck
rm -f ~/plausible-wordle.sqlite
python3 tools/wordle-svc-db/build_db.py \
  --answers tools/plausible-answers/plausible-answers.txt \
  --guesses src/data/guesses-v2.ts --out ~/plausible-wordle.sqlite
sudo cp ~/plausible-wordle.sqlite /mnt/efs/plausible-wordle.sqlite.new
sudo mv /mnt/efs/plausible-wordle.sqlite.new /mnt/efs/plausible-wordle.sqlite
```

Then run the check in step 8, and stop the instance again. If starting it fails
for lack of capacity, which small instance types sometimes do in a busy zone,
change its type while it is stopped (Actions, Instance settings, Change
instance type), for example to `t3.micro`.

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

The `sub` it matches carries numeric ids — `ramakocherlakota@9009159` and
`wordle-luck@1328107909` — because this account has GitHub's immutable subject
claim turned on, which names the owner and repository by id as well as by name
so that renaming or recreating either cannot be used to inherit the old one's
access. The ids are what the token actually presents, so the policy has to spell
them out; they were read off a real token rather than guessed. Turning that
setting off would drop them from the claim and the trust policy would have to
drop them too.

**2. Point the workflow at the role.** In the repository's
Settings → Secrets and variables → Actions → Variables, add a variable named
`AWS_DEPLOY_ROLE_ARN` with the role's ARN
(the script prints it; `arn:aws:iam::<account>:role/wordle-luck-deploy`). It is a variable
rather than a secret because an ARN is not one, and an unmasked value is far
easier to debug. The deploy job stops with a pointer to this section if it is
missing.

### If a run fails to assume the role

`Not authorized to perform sts:AssumeRoleWithWebIdentity` is all AWS says, and
it says exactly that whether the `sub` does not match, the `aud` does not match,
or the role is not there at all. The workflow answers the first of those itself:
on failure it prints the claims the token actually carried. Compare them with

```bash
aws iam get-role --role-name wordle-luck-deploy \
  --query Role.AssumeRolePolicyDocument
```

and if the `sub` has drifted, correct it in the trust policy file and re-run
`./infra/setup-github-oidc.sh`, which pushes the change with
`update-assume-role-policy`.

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

Confirm the backend answers and that `plausible-wordle.sqlite` is in place and
supports non-answer guesses (run the dev server first so `/service` is proxied):

```bash
curl -s -X POST http://localhost:5173/service \
  -H 'Content-Type: application/json' \
  -d '{"operation":"rate_solution","targets":["crane"],"guesses":["soare","crane"],"sequence":false,"hard_mode":false,"count":1,"sqlite_dbname":"plausible-wordle.sqlite"}'
```

Expect HTTP 200 with a `by_target.crane` array of rating objects; `soare` (a
non-answer opener) must rate without a `score_guess` error.

## Credits

The shamrock icon is the U+2618 glyph from
[Twemoji](https://github.com/jdecked/twemoji). Graphics by Twitter, Inc and
other contributors, licensed under
[CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/).
