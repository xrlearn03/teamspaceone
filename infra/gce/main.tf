terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

data "google_compute_default_service_account" "default" {}

resource "google_project_service" "secret_manager" {
  service            = "secretmanager.googleapis.com"
  disable_on_destroy = false
}

resource "google_secret_manager_secret_iam_member" "azure_agent" {
  project   = var.project_id
  secret_id = var.azure_agent_pat_secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${data.google_compute_default_service_account.default.email}"

  depends_on = [google_project_service.secret_manager]
}

resource "random_password" "postgres" {
  length  = 24
  special = false
}

resource "random_password" "redis" {
  length  = 24
  special = false
}

resource "random_password" "nats" {
  length  = 24
  special = false
}

resource "random_password" "s3_access_key" {
  length  = 24
  special = false
}

resource "random_password" "s3_secret_key" {
  length  = 32
  special = false
}

resource "random_password" "sfu_token_secret" {
  length  = 64
  special = false
}

resource "random_password" "internal_api_key" {
  length  = 48
  special = false
}

resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

locals {
  git_auth_header = var.git_token != "" ? "Authorization: Basic ${base64encode("${var.git_username}:${var.git_token}")}" : ""

  env_content = templatefile("${path.module}/templates/env.tpl", {
    external_ip                       = google_compute_address.static.address
    domain                            = var.domain
    postgres_password                 = random_password.postgres.result
    redis_password                    = random_password.redis.result
    nats_password                     = random_password.nats.result
    s3_access_key                     = random_password.s3_access_key.result
    s3_secret_key                     = random_password.s3_secret_key.result
    sfu_token_secret                  = random_password.sfu_token_secret.result
    internal_api_key                  = random_password.internal_api_key.result
    jwt_secret                        = random_password.jwt_secret.result
    openai_api_key                    = var.openai_api_key
    smtp_host                         = var.smtp_host
    smtp_port                         = var.smtp_port
    smtp_secure                       = var.smtp_secure
    smtp_user                         = var.smtp_user
    smtp_pass                         = var.smtp_pass
    smtp_from                         = var.smtp_from
    organisation_email_encryption_key = var.organisation_email_encryption_key
  })

  caddyfile_content = var.domain != "" ? templatefile("${path.module}/templates/Caddyfile.tpl", {
    domain     = var.domain
    acme_email = var.acme_email
  }) : ""

  compose_overlay_content = templatefile("${path.module}/templates/docker-compose.gce.yml.tpl", {
    external_ip = google_compute_address.static.address
    domain      = var.domain
  })
}

resource "google_compute_address" "static" {
  name   = "${var.instance_name}-ip"
  region = var.region
}

resource "google_compute_disk" "data" {
  name = "${var.instance_name}-data"
  type = "pd-ssd"
  zone = var.zone
  size = var.data_disk_size
}

resource "google_compute_firewall" "allow" {
  name    = "${var.instance_name}-allow"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = var.domain != "" ? ["22", "80", "443"] : ["22", "80", "443", "3000", "3005", "8443", "9000", "9001"]
  }

  allow {
    protocol = "udp"
    ports    = ["10000"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = [var.instance_name]
}

resource "google_compute_instance" "vm" {
  name         = var.instance_name
  machine_type = var.machine_type
  zone         = var.zone
  tags         = [var.instance_name]

  boot_disk {
    initialize_params {
      image = "projects/ubuntu-os-cloud/global/images/family/ubuntu-2204-lts"
      size  = var.boot_disk_size
      type  = "pd-ssd"
    }
  }

  attached_disk {
    source      = google_compute_disk.data.id
    device_name = "data-disk"
    mode        = "READ_WRITE"
  }

  network_interface {
    network = "default"
    access_config {
      nat_ip = google_compute_address.static.address
    }
  }

  metadata = {
    startup-script = templatefile("${path.module}/templates/startup.sh.tpl", {
      repo_url                  = var.repo_url
      repo_ref                  = var.repo_ref
      git_auth_header           = local.git_auth_header
      external_ip               = google_compute_address.static.address
      domain                    = var.domain
      caddyfile_content         = local.caddyfile_content
      env_content               = local.env_content
      compose_overlay_content   = local.compose_overlay_content
      project_id                = var.project_id
      instance_name             = var.instance_name
      azure_devops_url          = var.azure_devops_url
      azure_agent_pool          = var.azure_agent_pool
      azure_agent_version       = var.azure_agent_version
      azure_agent_pat_secret_id = var.azure_agent_pat_secret_id
    })
  }

  service_account {
    email  = data.google_compute_default_service_account.default.email
    scopes = ["cloud-platform"]
  }

  allow_stopping_for_update = true

  depends_on = [google_secret_manager_secret_iam_member.azure_agent]

  lifecycle {
    ignore_changes = [metadata["ssh-keys"]]
  }
}
