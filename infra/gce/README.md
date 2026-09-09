# Teamspace One — GCE Terraform deployment

Deploys the full backend stack to a single Google Compute Engine VM with Docker Compose and a persistent data disk. The source code is cloned from **Azure DevOps Git** on first boot.

## What is provisioned

- A static external IP.
- An `e2-standard-4` (default) Ubuntu 22.04 instance with a separate persistent SSD for data.
- Firewall rules for the gateway, realtime, SFU, and MinIO.
- A generated `.env` with random secrets and the external IP or domain wired in.
- The repo is cloned on the VM from Azure DevOps and `docker-compose.yml` is run with a small GCE overlay that sets CORS for the public IP or domain.
- **Optional domain + SSL**: set `domain` and Caddy is added to the compose stack and automatically provisions Let's Encrypt certificates.

## Prerequisites

- `gcloud` authenticated (`gcloud auth application-default login` or `GOOGLE_APPLICATION_CREDENTIALS` set).
- Terraform >= 1.0.
- (Optional) pnpm/Node if you want to rebuild the desktop client locally.
- An Azure DevOps clone URL. If the repo is private, create a Personal Access Token (PAT) with **Code (Read)** scope.
- A domain with DNS access (optional, only if you want HTTPS).

## Deploy

```bash
cd infra/gce
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars: set repo_url, git_token if private, openai_api_key, and optionally domain + acme_email
terraform init
terraform apply
```

First boot installs Docker and builds all images on the VM. This typically takes 20–30 minutes.

### Domain + SSL

Set these in `terraform.tfvars`:

```hcl
domain     = "teamspaceone.in"
acme_email = "admin@teamspaceone.in"
```

After `terraform apply`, create the A records printed by the `dns_records` output:

```
teamspaceone.in        A  <external-ip>
app.teamspaceone.in    A  <external-ip>
api.teamspaceone.in    A  <external-ip>
realtime.teamspaceone.in A <external-ip>
sfu.teamspaceone.in    A  <external-ip>
s3.teamspaceone.in     A  <external-ip>
storage.teamspaceone.in A <external-ip>
```

Caddy will obtain Let's Encrypt certs automatically once DNS resolves. It proxies:

| Domain | Backend |
| --- | --- |
| `teamspaceone.in` / `app.teamspaceone.in` / `api.teamspaceone.in` | `api-gateway:3000` |
| `realtime.teamspaceone.in` | `realtime-service:3005` |
| `sfu.teamspaceone.in` | `sfu:8443` |
| `s3.teamspaceone.in` | `minio:9000` |
| `storage.teamspaceone.in` | `minio:9001` |

## Wire the desktop client

After `terraform apply` succeeds, run from the repo root:

```bash
./infra/gce/update-desktop.sh
```

This updates `apps/desktop/.env.production` and `apps/desktop/src-tauri/capabilities/default.json` to point at the new domain (or IP if no domain is set).

Then rebuild the desktop app:

```bash
pnpm build:desktop
```

Or push a `v*` tag to trigger the GitHub release workflow and build installers for all platforms.

## Useful commands

```bash
# SSH into the VM
gcloud compute ssh --project=<project> --zone=<zone> teamspace-one

# Tail gateway logs from the VM
gcloud compute ssh --project=<project> --zone=<zone> teamspace-one -- \
  'cd /opt/teamspace-one/repo && docker compose -f docker-compose.yml -f docker-compose.gce.yml logs -f api-gateway'

# Tail Caddy logs (when using a domain)
gcloud compute ssh --project=<project> --zone=<zone> teamspace-one -- \
  'cd /opt/teamspace-one/repo && docker compose -f docker-compose.yml -f docker-compose.gce.yml logs -f caddy'

# Manually re-run the startup script
gcloud compute ssh --project=<project> --zone=<zone> teamspace-one -- sudo bash /var/log/startupscript.log
```

## Important defaults

- **Domain/TLS**: optional. Without a domain, the deployment uses HTTP on the external IP. With `domain` set, Caddy terminates HTTPS and auto-renews Let's Encrypt certificates.
- **MinIO**: exposed on ports `9000` (S3 API) and `9001` (console), and also proxied through `s3.<domain>` / `storage.<domain>` when a domain is set. Generated credentials are in `/opt/teamspace-one/repo/.env` on the VM.
- **SFU**: TCP `8443` (signaling) and UDP `10000` (ICE media mux) are opened to the internet. The SFU advertises the VM external IP via `SFU_NAT_1TO1_IPS` in the generated `.env` even when a domain is used (WebRTC ICE needs a public IP, not a hostname).
- **Secrets**: Terraform generates all secrets except `OPENAI_API_KEY`. They are stored only in the VM's `.env` and in Terraform state; keep `terraform.tfstate` safe.

## Tear down

```bash
cd infra/gce
terraform destroy
```
