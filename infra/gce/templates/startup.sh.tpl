#!/bin/bash
set -e

MARKER="/data/.teamspace-initialized"
REPO_DIR="/opt/teamspace-one/repo"

if [ -f "$MARKER" ]; then
  systemctl start docker || true
  cd "$REPO_DIR"
  docker compose -f docker-compose.yml -f docker-compose.gce.yml up -d
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
  git

# Add Docker repository and install Docker
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
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

mkdir -p /data/docker

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

# Expose MinIO object storage publicly on the S3 and console ports
sed -i 's/127\.0\.0\.1:9000/0.0.0.0:9000/g; s/127\.0\.0\.1:9001/0.0.0.0:9001/g' docker-compose.yml

# Write the generated .env and compose overlay
cat > .env <<'ENV_EOF'
${env_content}
ENV_EOF

cat > docker-compose.gce.yml <<'COMPOSE_EOF'
${compose_overlay_content}
COMPOSE_EOF

# Build and start the full stack
docker compose -f docker-compose.yml -f docker-compose.gce.yml build
docker compose -f docker-compose.yml -f docker-compose.gce.yml up -d

touch "$MARKER"
