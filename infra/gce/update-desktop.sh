#!/bin/bash
set -e

cd "$(dirname "$0")/../.."

DOMAIN=${1:-}
IP=${2:-}

if [ -z "$DOMAIN" ]; then
  DOMAIN=$(terraform -chdir=infra/gce output -raw domain 2>/dev/null || true)
fi

if [ -z "$IP" ]; then
  IP=$(terraform -chdir=infra/gce output -raw external_ip 2>/dev/null || true)
fi

if [ -z "$DOMAIN" ] && [ -z "$IP" ]; then
  echo "Usage: $0 [domain] [external-ip]"
  echo "Or run from the repo root after 'terraform apply' so the domain/IP can be read automatically."
  exit 1
fi

node infra/gce/scripts/update-desktop.mjs "$DOMAIN" "$IP"
