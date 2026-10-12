#!/usr/bin/env bash
#
# Create the wordle-db-builder Lambda that infra/deploy-db.sh invokes, and its
# role. Run once per account, with credentials that can create IAM roles and
# Lambda functions:
#
#   ./infra/setup-db-builder.sh
#
# Safe to re-run: the role and function are created if missing and updated if
# not. The function goes where wordle-pal-svc is: its subnets, its security
# groups (which EFS already admits), and its EFS access point, mounted at
# /mnt/efs, all read from wordle-pal-svc itself rather than typed in.

set -euo pipefail

REGION="${REGION:-us-east-1}"
SERVICE_FUNCTION="${SERVICE_FUNCTION:-wordle-pal-svc}"
FUNCTION_NAME="${FUNCTION_NAME:-wordle-db-builder}"
ROLE_NAME="${ROLE_NAME:-wordle-db-builder}"
# 10240 MB brings 6 vCPUs and builds in a few minutes. An account still on
# Lambda's 3008 MB default limit can set MEMORY_MB=3008: 2 vCPUs, still well
# inside the 15-minute timeout.
MEMORY_MB="${MEMORY_MB:-10240}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export AWS_REGION="$REGION"

echo "==> Reading $SERVICE_FUNCTION's network and file system"
read -r access_point subnets groups < <(aws lambda get-function-configuration \
  --function-name "$SERVICE_FUNCTION" \
  --query '[FileSystemConfigs[0].Arn, join(`,`, VpcConfig.SubnetIds), join(`,`, VpcConfig.SecurityGroupIds)]' \
  --output text)
if [ -z "$access_point" ] || [ "$access_point" = None ]; then
  echo "$SERVICE_FUNCTION mounts no EFS access point" >&2
  exit 1
fi
fs_id="$(aws efs describe-access-points --access-point-id "${access_point##*/}" \
  --query 'AccessPoints[0].FileSystemId' --output text)"
account="$(aws sts get-caller-identity --query Account --output text)"
fs_arn="arn:aws:elasticfilesystem:$REGION:$account:file-system/$fs_id"
echo "access point $access_point on $fs_id; subnets $subnets; security groups $groups"

if aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  echo "==> $ROLE_NAME exists"
else
  echo "==> Creating $ROLE_NAME"
  aws iam create-role --role-name "$ROLE_NAME" \
    --description "Builds plausible-wordle.sqlite onto wordle-svc's EFS." \
    --assume-role-policy-document \
    '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
    >/dev/null
fi
# Network interfaces in the VPC, and logs.
aws iam attach-role-policy --role-name "$ROLE_NAME" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole
aws iam put-role-policy --role-name "$ROLE_NAME" --policy-name write-efs --policy-document "$(cat <<JSON
{"Version":"2012-10-17","Statement":[{"Effect":"Allow",
 "Action":["elasticfilesystem:ClientMount","elasticfilesystem:ClientWrite"],
 "Resource":"$fs_arn",
 "Condition":{"StringEquals":{"elasticfilesystem:AccessPointArn":"$access_point"}}}]}
JSON
)"
role_arn="$(aws iam get-role --role-name "$ROLE_NAME" --query Role.Arn --output text)"

bundle="$(mktemp -d)/bundle.zip"
"$REPO_ROOT/infra/deploy-db.sh" --package "$bundle"

config=(--role "$role_arn" --runtime python3.12 --handler lambda_handler.handler
  --memory-size "$MEMORY_MB" --timeout 900 --ephemeral-storage Size=10240
  --vpc-config "SubnetIds=$subnets,SecurityGroupIds=$groups"
  --file-system-configs "Arn=$access_point,LocalMountPath=/mnt/efs")

if aws lambda get-function --function-name "$FUNCTION_NAME" >/dev/null 2>&1; then
  echo "==> Updating $FUNCTION_NAME"
  aws lambda update-function-configuration --function-name "$FUNCTION_NAME" "${config[@]}" >/dev/null
else
  echo "==> Creating $FUNCTION_NAME"
  # A role is not assumable by Lambda for some seconds after it is created.
  for attempt in $(seq 12); do
    if aws lambda create-function --function-name "$FUNCTION_NAME" "${config[@]}" \
         --zip-file "fileb://$bundle" >/dev/null 2>"$bundle.err"; then
      break
    fi
    if ! grep -q 'cannot be assumed' "$bundle.err" || [ "$attempt" = 12 ]; then
      cat "$bundle.err" >&2
      exit 1
    fi
    sleep 5
  done
fi
aws lambda wait function-updated-v2 --function-name "$FUNCTION_NAME"
# One build at a time: two would race to rename over the same file. An account
# with a low concurrency limit cannot reserve any; the workflow's concurrency
# group still keeps its own runs apart.
aws lambda put-function-concurrency --function-name "$FUNCTION_NAME" \
  --reserved-concurrent-executions 1 >/dev/null ||
  echo "warning: could not reserve concurrency 1 for $FUNCTION_NAME; carrying on" >&2

echo
echo "Done. $FUNCTION_NAME is ready; infra/deploy-db.sh builds with it."
