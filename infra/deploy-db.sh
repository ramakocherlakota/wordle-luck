#!/usr/bin/env bash
#
# Build plausible-wordle.sqlite and put it live on wordle-svc's EFS.
#
#   ./infra/deploy-db.sh                   build and swap in, then check
#   ./infra/deploy-db.sh --package FILE    only write the Lambda's code bundle
#
# The build runs in the wordle-db-builder Lambda (created once by
# infra/setup-db-builder.sh), which mounts the same EFS access point as
# wordle-svc. This uploads a code bundle holding build_db.py and the current
# word lists, invokes it, and waits while it builds into /tmp and renames the
# result over the live database. Then it checks the service can rate the newest
# NYT answer from it.

set -euo pipefail

REGION="${REGION:-us-east-1}"
FUNCTION_NAME="${FUNCTION_NAME:-wordle-db-builder}"
# The function URL the site's CloudFront sends ratings to (ApiOriginDomain in
# infra/template.yaml), not the dev server's proxy target.
SERVICE_URL="${SERVICE_URL:-https://kxk4tebf2oubdbadxazw5uuvma0dvfpe.lambda-url.us-east-1.on.aws/}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export AWS_REGION="$REGION"

# The handler and builder, with the two lists beside them under the names the
# handler opens.
package() {
  python3 - "$1" "$REPO_ROOT" <<'PY'
import sys, zipfile
out, root = sys.argv[1], sys.argv[2]
files = {'lambda_handler.py': 'tools/wordle-svc-db/lambda_handler.py',
         'build_db.py': 'tools/wordle-svc-db/build_db.py',
         'plausible-answers.txt': 'tools/plausible-answers/plausible-answers.txt',
         'guesses-v2.ts': 'src/data/guesses-v2.ts'}
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for name, path in files.items():
        z.write(f'{root}/{path}', name)
PY
}

case "${1:-}" in
  --package) package "${2:?usage: $0 --package FILE}"; exit 0 ;;
  "")        ;;
  *) echo "usage: $0 [--package FILE]" >&2; exit 1 ;;
esac

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

echo "==> Uploading the word lists to $FUNCTION_NAME"
package "$workdir/bundle.zip"
if ! aws lambda update-function-code --function-name "$FUNCTION_NAME" \
     --zip-file "fileb://$workdir/bundle.zip" >/dev/null; then
  echo "Could not update $FUNCTION_NAME. Has infra/setup-db-builder.sh been run? See README.md, 'Updating the database from GitHub Actions'." >&2
  exit 1
fi
aws lambda wait function-updated-v2 --function-name "$FUNCTION_NAME"

# Synchronously, for up to the function's 15 minutes. One attempt only: the CLI
# otherwise retries a timed-out read, which would start a second build.
echo "==> Building and swapping in the database (a few minutes)"
AWS_MAX_ATTEMPTS=1 aws lambda invoke --function-name "$FUNCTION_NAME" \
  --cli-read-timeout 960 --log-type Tail \
  --query '[FunctionError, LogResult]' --output text \
  "$workdir/result.json" > "$workdir/invoke.txt"
read -r function_error log_tail < "$workdir/invoke.txt"
base64 -d <<<"$log_tail" || true
if [ "$function_error" != None ]; then
  echo "$FUNCTION_NAME failed ($function_error):" >&2
  cat "$workdir/result.json" >&2
  echo >&2
  exit 1
fi
echo "Built: $(cat "$workdir/result.json")"

# The newest NYT answer is the word most likely to be missing from a stale
# database.
word="$(grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2} [a-z]{5}$' \
  "$REPO_ROOT/tools/plausible-answers/nyt-answers.txt" | tail -1 | cut -d' ' -f2)"
echo "==> Checking the service can rate $word"
body="$(jq -nc --arg w "$word" '{operation: "rate_solution", targets: [$w], guesses: ["soare", $w],
  sequence: false, hard_mode: false, count: 1, sqlite_dbname: "plausible-wordle.sqlite"}')"
response="$(curl -sS --max-time 60 -X POST "$SERVICE_URL" -H 'Content-Type: application/json' -d "$body")"
if ! jq -e --arg w "$word" '.by_target[$w] | type == "array" and length > 0' <<<"$response" >/dev/null 2>&1; then
  echo "The service could not rate $word from the new database. It answered:" >&2
  echo "$response" >&2
  exit 1
fi
echo "Done: plausible-wordle.sqlite is live"
