#!/usr/bin/env bash
#
# Build wordle-luck and deploy it to S3 + CloudFront + Route 53.
#
#   ./infra/deploy.sh              build, deploy the stack, upload, invalidate
#   ./infra/deploy.sh --infra-only deploy the stack only (no build or upload)
#   ./infra/deploy.sh --sync-only  build and upload only (stack must exist)
#
# The first run blocks for several minutes while ACM validates the certificate
# and CloudFront propagates the new distribution.

set -euo pipefail

STACK_NAME="${STACK_NAME:-wordle-luck-site-stack}"
# CloudFront requires its ACM certificate in us-east-1, and everything else in
# this account already lives there.
REGION="${REGION:-us-east-1}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="$REPO_ROOT/infra/template.yaml"
DIST="$REPO_ROOT/dist"

do_infra=true
do_build=true
case "${1:-}" in
  --infra-only) do_build=false ;;
  --sync-only)  do_infra=false ;;
  "")           ;;
  *) echo "usage: $0 [--infra-only|--sync-only]" >&2; exit 1 ;;
esac

if [ "$do_infra" = true ]; then
  echo "==> Deploying stack $STACK_NAME"
  aws cloudformation deploy \
    --region "$REGION" \
    --stack-name "$STACK_NAME" \
    --template-file "$TEMPLATE" \
    --no-fail-on-empty-changeset
fi

stack_output() {
  aws cloudformation describe-stacks \
    --region "$REGION" \
    --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" \
    --output text
}

BUCKET="$(stack_output SiteBucket)"
DISTRIBUTION_ID="$(stack_output DistributionId)"
SITE_URL="$(stack_output SiteUrl)"

if [ -z "$BUCKET" ] || [ "$BUCKET" = "None" ]; then
  echo "Could not read stack outputs; is $STACK_NAME deployed?" >&2
  exit 1
fi

if [ "$do_build" = true ]; then
  echo "==> Building"
  ( cd "$REPO_ROOT" && npm run build )

  # Vite content-hashes everything under assets/, so those are safe to cache
  # forever. The unhashed root files are revalidated on every request.
  UNHASHED_FILES=(
    "index.html"
    "favicon.*"
    "apple-touch-icon.png"
    "icon-192.png"
    "icon-512.png"
    "site.webmanifest"
  )

  immutable_excludes=()
  unhashed_includes=()
  for f in "${UNHASHED_FILES[@]}"; do
    immutable_excludes+=(--exclude "$f")
    unhashed_includes+=(--include "$f")
  done

  echo "==> Uploading hashed assets to s3://$BUCKET"
  aws s3 sync "$DIST" "s3://$BUCKET" \
    --region "$REGION" \
    --delete \
    "${immutable_excludes[@]}" \
    --cache-control "public,max-age=31536000,immutable"

  echo "==> Uploading unhashed root files"
  aws s3 sync "$DIST" "s3://$BUCKET" \
    --region "$REGION" \
    --exclude "*" \
    "${unhashed_includes[@]}" \
    --cache-control "no-cache"

  echo "==> Invalidating $DISTRIBUTION_ID"
  aws cloudfront create-invalidation \
    --distribution-id "$DISTRIBUTION_ID" \
    --paths "/*" \
    --query 'Invalidation.Id' \
    --output text
fi

echo
echo "Done: $SITE_URL"
