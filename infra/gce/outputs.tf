output "external_ip" {
  description = "Public IP address of the GCE instance"
  value       = google_compute_address.static.address
}

output "ssh_command" {
  description = "Command to SSH into the VM"
  value       = "gcloud compute ssh --project=${var.project_id} --zone=${var.zone} ${var.instance_name}"
}

output "desktop_endpoints" {
  description = "Suggested desktop .env endpoints"
  value       = <<-EOF
    VITE_GATEWAY_URL=http://${google_compute_address.static.address}:3000
    VITE_REALTIME_URL=http://${google_compute_address.static.address}:3005
    VITE_LIVEKIT_URL=ws://${google_compute_address.static.address}:7880
    VITE_SFU_URL=ws://${google_compute_address.static.address}:8443
  EOF
}

output "next_steps" {
  description = "Post-apply instructions"
  value       = <<-EOF
    1. Wait a few minutes for the startup script to install Docker and build the stack.
    2. SSH in and tail logs if needed: gcloud compute ssh --project=${var.project_id} --zone=${var.zone} ${var.instance_name} -- 'cd /opt/teamspace-one/repo && docker compose logs -f api-gateway'
    3. Run ./infra/gce/update-desktop.sh from your local repo to wire the desktop client to the new IP.
    4. Build/push a new desktop release so users get the updated endpoints.
  EOF
}
