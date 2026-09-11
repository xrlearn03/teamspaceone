#!/bin/bash
set -e

MARKER="/data/.teamspace-initialized"
REPO_DIR="/opt/teamspace-one/repo"
DEPLOY_LOCK="/var/lock/teamspace-one-deploy.lock"
AGENT_DIR="/opt/azure-agent"
AGENT_SERVICE="azure-pipelines-agent.service"

install_azure_agent() {
  mkdir -p "$AGENT_DIR"
  if [ ! -f "$AGENT_DIR/.agent" ]; then
    token=$(curl -fsS -H 'Metadata-Flavor: Google' 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token' | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')
    pat=$(curl -fsS -H "Authorization: Bearer $token" "https://secretmanager.googleapis.com/v1/projects/${project_id}/secrets/${azure_agent_pat_secret_id}/versions/latest:access" | python3 -c 'import base64,json,sys; print(base64.b64decode(json.load(sys.stdin)["payload"]["data"]).decode())')
    curl -fsSL "https://download.agent.dev.azure.com/agent/${azure_agent_version}/vsts-agent-linux-x64-${azure_agent_version}.tar.gz" | tar -xz -C "$AGENT_DIR"
    (
      cd "$AGENT_DIR"
      ./bin/installdependencies.sh
      AGENT_ALLOW_RUNASROOT=1 ./config.sh --unattended --replace --acceptTeeEula --url "${azure_devops_url}" --auth pat --token "$pat" --pool "${azure_agent_pool}" --agent "${instance_name}"
    )
    unset pat token
  fi
  cat > "/etc/systemd/system/$AGENT_SERVICE" <<'AGENT_SERVICE_EOF'
[Unit]
Description=Azure Pipelines Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/azure-agent
ExecStart=/opt/azure-agent/bin/runsvc.sh
User=root
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
AGENT_SERVICE_EOF
  systemctl daemon-reload
  systemctl enable "$AGENT_SERVICE"
}

cleanup_broken_containers() {
  while read -r container_id; do
    [ -n "$container_id" ] || continue
    error=$(docker inspect --format '{{.State.Error}}' "$container_id")
    if [[ "$error" == *'RWLayer of container'*'is unexpectedly nil'* ]]; then
      docker rm -f "$container_id"
    fi
  done < <(docker ps -aq)
}

exec 9>"$DEPLOY_LOCK"
flock 9

if [ -f "$MARKER" ]; then
  install_azure_agent
  systemctl start docker || true
  cleanup_broken_containers
  docker builder prune -af 2>/dev/null || true
  cd "$REPO_DIR"
  docker compose -f docker-compose.yml -f docker-compose.gce.yml up -d
  systemctl start "$AGENT_SERVICE"
  exit 0
fi

# Wait for package lists to be available
until apt-get update -qq; do
  sleep 5
done

# Install dependencies
apt-get install -y -qq \
  ca-certificates \
  curl \
  gnupg \
  lsb-release \
  git \
  python3 \
  tar

install_azure_agent

# Add Docker repository and install Docker
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /tmp/docker.gpg
gpg --batch --yes --dearmor -o /etc/apt/keyrings/docker.gpg /tmp/docker.gpg
rm -f /tmp/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=\"$(dpkg --print-architecture)\" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \"$(lsb_release -cs)\" stable" > /etc/apt/sources.list.d/docker.list

apt-get update -qq
apt-get install -y -qq \
  docker-ce \
  docker-ce-cli \
  containerd.io \
  docker-buildx-plugin \
  docker-compose-plugin

# Mount and prepare the persistent data disk
DATA_DISK="/dev/disk/by-id/google-data-disk"
mkdir -p /data

if [ -b "$DATA_DISK" ]; then
  if [ -z "$(lsblk -no FSTYPE "$DATA_DISK" 2>/dev/null)" ]; then
    mkfs.ext4 -F "$DATA_DISK"
  fi

  if ! grep -q "$DATA_DISK" /etc/fstab; then
    echo "$DATA_DISK /data ext4 defaults,discard,nofail 0 0" >> /etc/fstab
  fi

  mount -a
fi

mkdir -p /data/docker /data/downloads

# Point Docker data root at the persistent disk
if ! grep -q '"data-root"' /etc/docker/daemon.json 2>/dev/null; then
  mkdir -p /etc/docker
  cat > /etc/docker/daemon.json <<'DOCKER_EOF'
{
  "data-root": "/data/docker"
}
DOCKER_EOF
  systemctl stop docker 2>/dev/null || true
fi

systemctl enable docker
systemctl start docker
cleanup_broken_containers

# Clone the application repo
mkdir -p "$REPO_DIR"
if [ ! -d "$REPO_DIR/.git" ]; then
  if [ -n "${git_auth_header}" ]; then
    git -c http.extraheader="${git_auth_header}" clone --depth 1 --branch "${repo_ref}" "${repo_url}" "$REPO_DIR"
  else
    git clone --depth 1 --branch "${repo_ref}" "${repo_url}" "$REPO_DIR"
  fi
fi

cd "$REPO_DIR"

%{ if domain == "" }
# Expose MinIO object storage publicly on the S3 and console ports when no domain is configured
sed -i 's/127\.0\.0\.1:9000/0.0.0.0:9000/g; s/127\.0\.0\.1:9001/0.0.0.0:9001/g' docker-compose.yml
%{ endif }

# Write the generated .env and compose overlay
cat > .env <<'ENV_EOF'
${env_content}
ENV_EOF

cat > docker-compose.gce.yml <<'COMPOSE_EOF'
${compose_overlay_content}
COMPOSE_EOF

%{ if domain != "" }
# Write Caddyfile for HTTPS reverse proxy
cat > Caddyfile <<'CADDY_EOF'
${caddyfile_content}
CADDY_EOF
%{ endif }

# Clear any stale/corrupted BuildKit cache before first build
docker builder prune -af 2>/dev/null || true

# Build and start the full stack
docker compose -f docker-compose.yml -f docker-compose.gce.yml build
docker compose -f docker-compose.yml -f docker-compose.gce.yml up -d

touch "$MARKER"
systemctl start "$AGENT_SERVICE"
