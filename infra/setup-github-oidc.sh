#!/usr/bin/env bash
#
# Create the IAM role that .github/workflows/deploy.yml assumes, and print the
# ARN to paste into the repository variable AWS_DEPLOY_ROLE_ARN.
#
#   ./infra/setup-github-oidc.sh
#
# Run once per account, with credentials that can create IAM roles. It is safe
# to re-run: the provider and role are created if missing and updated if not.
#
# The account ID is read from the caller rather than left as a placeholder in
# the policy files. Editing an ARN by hand is the one step here that fails
# obscurely — IAM rejects an unsubstituted placeholder as "MalformedPolicyDocument
# ... failed legacy parsing", which says nothing about what to fix.

set -euo pipefail

ROLE_NAME="${ROLE_NAME:-wordle-luck-deploy}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TRUST_POLICY="$REPO_ROOT/infra/github-oidc-trust-policy.json"
PERMISSIONS_POLICY="$REPO_ROOT/infra/github-oidc-permissions-policy.json"

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
PROVIDER_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"

# GitHub's OIDC provider is per-account, and other repositories may already have
# registered it. Adding it twice is an error, so look first.
if aws iam get-open-id-connect-provider \
     --open-id-connect-provider-arn "$PROVIDER_ARN" >/dev/null 2>&1; then
  echo "==> OIDC provider already registered"
else
  echo "==> Registering GitHub's OIDC provider"
  aws iam create-open-id-connect-provider \
    --url https://token.actions.githubusercontent.com \
    --client-id-list sts.amazonaws.com >/dev/null
fi

# Which repository and branch may assume the role stays in the file; only the
# account ID is filled in here.
trust="$(sed "s|<AWS_ACCOUNT_ID>|$ACCOUNT_ID|g" "$TRUST_POLICY")"

if aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  echo "==> Updating who may assume $ROLE_NAME"
  aws iam update-assume-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-document "$trust"
else
  echo "==> Creating $ROLE_NAME"
  aws iam create-role \
    --role-name "$ROLE_NAME" \
    --description "Deploys wordle-luck from GitHub Actions." \
    --assume-role-policy-document "$trust" >/dev/null
fi

echo "==> Putting the deploy policy on $ROLE_NAME"
aws iam put-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-name "$ROLE_NAME" \
  --policy-document "file://$PERMISSIONS_POLICY"

echo
echo "Done. Set the repository variable AWS_DEPLOY_ROLE_ARN to:"
aws iam get-role --role-name "$ROLE_NAME" --query Role.Arn --output text
