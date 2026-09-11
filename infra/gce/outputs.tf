output "external_ip" {
  description = "Public IP address of the GCE instance"
  value       = google_compute_address.static.address
}

output "domain" {
  description = "Configured public domain (empty if using the external IP directly)"
  value       = var.domain
}

output "ssh_command" {
  description = "Command to SSH into the VM"
  value       = "gcloud compute ssh --project=${var.project_id} --zone=${var.zone} ${var.instance_name}"
}

output "desktop_endpoints" {
  description = "Suggested desktop .env endpoints"
  value       = <<-EOF
%{if var.domain != ""}
    VITE_GATEWAY_URL=https://app.${var.domain}
    VITE_REALTIME_URL=wss://realtime.${var.domain}
    VITE_SFU_URL=wss://sfu.${var.domain}
%{else}
    VITE_GATEWAY_URL=http://${google_compute_address.static.address}:3000
    VITE_REALTIME_URL=http://${google_compute_address.static.address}:3005
    VITE_SFU_URL=ws://${google_compute_address.static.address}:8443
%{endif}
  EOF
}

output "dns_records" {
  description = "DNS A records to create when using a custom domain"
  value       = <<-EOF
%{if var.domain != ""}
    ${var.domain}        A  ${google_compute_address.static.address}
    app.${var.domain}      A  ${google_compute_address.static.address}
    api.${var.domain}      A  ${google_compute_address.static.address}
    realtime.${var.domain} A  ${google_compute_address.static.address}
    sfu.${var.domain}      A  ${google_compute_address.static.address}
    s3.${var.domain}       A  ${google_compute_address.static.address}
    storage.${var.domain}  A  ${google_compute_address.static.address}
%{else}
    No domain configured; the deployment uses the external IP directly.
%{endif}
  EOF
}

output "next_steps" {
  description = "Post-apply instructions"
  value       = <<-EOF
%{if var.domain != ""}
    1. Create the DNS A records shown in `dns_records`.
    2. Wait a few minutes for the startup script to install Docker and build the stack.
    3. Caddy will automatically provision Let's Encrypt SSL certs once DNS resolves.
    4. SSH in and tail logs if needed: gcloud compute ssh --project=${var.project_id} --zone=${var.zone} ${var.instance_name} -- 'cd /opt/teamspace-one/repo && docker compose logs -f caddy api-gateway'
    5. Run the main Azure pipeline; it configures desktop endpoints, builds installers, and publishes downloads sequentially.
%{else}
    1. Wait a few minutes for the startup script to install Docker and build the stack.
    2. SSH in and tail logs if needed: gcloud compute ssh --project=${var.project_id} --zone=${var.zone} ${var.instance_name} -- 'cd /opt/teamspace-one/repo && docker compose logs -f api-gateway'
    3. Set the pipeline deployment endpoint to this IP, then run the main Azure pipeline.
%{endif}
  EOF
}
