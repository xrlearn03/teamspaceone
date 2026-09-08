# Teamspace One — GCE Terraform deployment

Deploys the full backend stack to a single Google Compute Engine VM with Docker Compose and a persistent data disk.

## What is provisioned

- A static external IP.
- An `e2-standard-4` (default) Ubuntu 22.04 instance with a separate persistent SSD for data.
- Firewall rules for the gateway, realtime, LiveKit, SFU, and MinIO.
- A generated `.env` with random secrets and the new external IP wired in.
- The repo is cloned on the VM and `docker-compose.yml` is run with a small GCE overlay that sets CORS for the public IP.

## Prerequisites

- `gcloud` authenticated (`gcloud auth application-default login` or `GOOGLE_APPLICATION_CREDENTIALS` set).
- Terraform >= 1.0.
- (Optional) pnpm/Node if you want to rebuild the desktop client locally.

## Deploy

```bash
cd infra/gce
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars with your project_id and optional openai_api_key
terraform init
terraform apply
```

First boot installs Docker and builds all images on the VM. This typically takes 20–30 minutes.

## Wire the desktop client

After `terraform apply` succeeds, run from the repo root:

```bash
./infra/gce/update-desktop.sh
```

This updates `apps/desktop/.env.production` and `apps/desktop/src-tauri/capabilities/default.json` to point at the new GCE IP.

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

# Manually re-run the startup script
gcloud compute ssh --project=<project> --zone=<zone> teamspace-one -- sudo bash /var/log/startupscript.log
```

## Important defaults

- **No domain/TLS**: the deployment uses HTTP on the external IP. Add a domain and a reverse proxy later if you want HTTPS.
- **MinIO**: exposed on ports `9000` (S3 API) and `9001` (console). Generated credentials are in `/opt/teamspace-one/repo/.env` on the VM.
- **LiveKit**: TCP `7880` and `7882`, UDP `7881` are opened to the internet.
- **Secrets**: Terraform generates all secrets except `OPENAI_API_KEY`. They are stored only in the VM's `.env` and in Terraform state; keep `terraform.tfstate` safe.

## Tear down

```bash
cd infra/gce
terraform destroy
```
