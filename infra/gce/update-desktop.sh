#!/bin/bash
set -e

cd "$(dirname "$0")/../.."

IP=${1:-}

if [ -z "$IP" ]; then
  IP=$(terraform -chdir=infra/gce output -raw external_ip 2>/dev/null || true)
fi

if [ -z "$IP" ]; then
  echo "Usage: $0 <external-ip>"
  echo "Or run from the repo root after 'terraform apply' so the IP can be read automatically."
  exit 1
fi

node infra/gce/scripts/update-desktop.mjs "$IP"
