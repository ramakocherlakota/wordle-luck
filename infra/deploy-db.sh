#!/usr/bin/env bash
#
# Build plausible-wordle.sqlite and put it live on wordle-svc's EFS.
#
#   ./infra/deploy-db.sh                   build, upload, swap in, check
#   ./infra/deploy-db.sh --db FILE         swap in FILE instead of building
#
# EFS cannot be written from here, only from a machine that mounts it: the
# stopped EC2 instance tagged Name=wordle-db-upload, set up as README.md's
# "Keeping the instance for next time" describes, plus SSM (see "Updating the
# database from GitHub Actions"). The database is built here, where there is
# memory and CPU to spare, and goes to the instance through S3. The script
# starts the instance, has it copy the file onto EFS, checks the service can
# rate the newest NYT answer from it, and stops the instance again if it
# started it.

set -euo pipefail

REGION="${REGION:-us-east-1}"
INSTANCE_NAME="${INSTANCE_NAME:-wordle-db-upload}"
S3_URI="${S3_URI:-s3://wordle-pal-svc-code/db/plausible-wordle.sqlite}"
EFS_DIR="${EFS_DIR:-/mnt/efs}"
DB_NAME=plausible-wordle.sqlite
# The function URL the site's CloudFront sends ratings to (ApiOriginDomain in
# infra/template.yaml), not the dev server's proxy target.
SERVICE_URL="${SERVICE_URL:-https://kxk4tebf2oubdbadxazw5uuvma0dvfpe.lambda-url.us-east-1.on.aws/}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

db=""
case "${1:-}" in
  --db) db="${2:?usage: $0 [--db FILE]}" ;;
  "")   ;;
  *) echo "usage: $0 [--db FILE]" >&2; exit 1 ;;
esac

if [ -z "$db" ]; then
  workdir="$(mktemp -d "${RUNNER_TEMP:-$REPO_ROOT}/db.XXXXXX")"
  trap 'rm -rf "$workdir"' EXIT
  db="$workdir/$DB_NAME"
  echo "==> Building $DB_NAME"
  python3 "$REPO_ROOT/tools/wordle-svc-db/build_db.py" \
    --answers "$REPO_ROOT/tools/plausible-answers/plausible-answers.txt" \
    --guesses "$REPO_ROOT/src/data/guesses-v2.ts" --out "$db"
fi
sha="$(sha256sum "$db" | cut -d' ' -f1)"

echo "==> Finding the $INSTANCE_NAME instance"
read -r instance state < <(aws ec2 describe-instances --region "$REGION" \
  --filters "Name=tag:Name,Values=$INSTANCE_NAME" \
            "Name=instance-state-name,Values=pending,running,stopping,stopped" \
  --query 'Reservations[].Instances[].[InstanceId, State.Name]' --output text) || true
if [ -z "${instance:-}" ]; then
  echo "No instance tagged Name=$INSTANCE_NAME in $REGION. See README.md, 'Keeping the instance for next time'." >&2
  exit 1
fi
echo "$instance is $state"

echo "==> Uploading to $S3_URI"
aws s3 cp "$db" "$S3_URI" --region "$REGION" --only-show-errors

started=false
stop_instance() {
  if [ "$started" = true ]; then
    echo "==> Stopping $instance"
    aws ec2 stop-instances --region "$REGION" --instance-ids "$instance" >/dev/null
  fi
}
trap 'stop_instance; rm -rf "${workdir:-}"' EXIT

if [ "$state" = stopping ]; then
  aws ec2 wait instance-stopped --region "$REGION" --instance-ids "$instance"
  state=stopped
fi
if [ "$state" = stopped ]; then
  echo "==> Starting $instance"
  aws ec2 start-instances --region "$REGION" --instance-ids "$instance" >/dev/null
  started=true
fi
aws ec2 wait instance-running --region "$REGION" --instance-ids "$instance"

# Running is not reachable: the SSM agent registers some seconds after boot.
echo "==> Waiting for the instance to come online in SSM"
for _ in $(seq 60); do
  ping="$(aws ssm describe-instance-information --region "$REGION" \
    --filters "Key=InstanceIds,Values=$instance" \
    --query 'InstanceInformationList[0].PingStatus' --output text)"
  [ "$ping" = Online ] && break
  sleep 5
done
if [ "$ping" != Online ]; then
  echo "$instance never came online in SSM. Does its role have AmazonSSMManagedInstanceCore? See README.md, 'Updating the database from GitHub Actions'." >&2
  exit 1
fi

# Copy beside the live file, check it arrived whole, then rename over it, so the
# service never opens a half-copied database.
echo "==> Copying onto EFS"
script="set -euo pipefail
mountpoint -q $EFS_DIR || mount -a
mountpoint -q $EFS_DIR || { echo '$EFS_DIR is not mounted: see /etc/fstab' >&2; exit 1; }
aws s3 cp '$S3_URI' $EFS_DIR/$DB_NAME.new --region $REGION --only-show-errors
echo '$sha  $EFS_DIR/$DB_NAME.new' | sha256sum -c -
mv -f $EFS_DIR/$DB_NAME.new $EFS_DIR/$DB_NAME
ls -la $EFS_DIR"
command_id="$(aws ssm send-command --region "$REGION" \
  --instance-ids "$instance" --document-name AWS-RunShellScript \
  --comment "deploy $DB_NAME" \
  --parameters "$(jq -n --arg s "$script" '{commands: ["bash -c " + ($s | @sh)], executionTimeout: ["1800"]}')" \
  --query Command.CommandId --output text)"

# `aws ssm wait command-executed` gives up after 100 seconds; the copy can take
# longer.
for _ in $(seq 180); do
  sleep 10
  status="$(aws ssm get-command-invocation --region "$REGION" \
    --command-id "$command_id" --instance-id "$instance" \
    --query Status --output text 2>/dev/null || echo Pending)"
  case "$status" in Pending|InProgress|Delayed) ;; *) break ;; esac
done
aws ssm get-command-invocation --region "$REGION" \
  --command-id "$command_id" --instance-id "$instance" \
  --query '[StandardOutputContent, StandardErrorContent]' --output text
if [ "$status" != Success ]; then
  echo "Copying onto EFS ended $status" >&2
  exit 1
fi

aws s3 rm "$S3_URI" --region "$REGION" --only-show-errors

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
echo "Done: $DB_NAME is live, sha256 $sha"
