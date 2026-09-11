variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "GCP zone"
  type        = string
  default     = "us-central1-a"
}

variable "instance_name" {
  description = "Name of the GCE instance and related resources"
  type        = string
  default     = "teamspace-one"
}

variable "machine_type" {
  description = "GCE machine type"
  type        = string
  default     = "e2-standard-4"
}

variable "boot_disk_size" {
  description = "Boot disk size in GB"
  type        = number
  default     = 50
}

variable "data_disk_size" {
  description = "Persistent data disk size in GB"
  type        = number
  default     = 200
}

variable "repo_url" {
  description = "Git clone URL for the VM (e.g. https://dev.azure.com/<org>/<project>/_git/<repo>)"
  type        = string
}

variable "repo_ref" {
  description = "Git ref (branch/tag) to checkout"
  type        = string
  default     = "main"
}

variable "git_username" {
  description = "Git username for basic auth (Azure DevOps PAT username; usually can be empty)"
  type        = string
  default     = ""
}

variable "git_token" {
  description = "Git personal access token for cloning a private repo (Azure DevOps PAT)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "openai_api_key" {
  description = "OpenAI API key for the ai-service"
  type        = string
  default     = ""
  sensitive   = true
}

variable "smtp_host" {
  description = "SMTP host for notifications"
  type        = string
  default     = ""
}

variable "smtp_port" {
  description = "SMTP port"
  type        = string
  default     = "587"
}

variable "smtp_secure" {
  description = "Use TLS for SMTP"
  type        = string
  default     = "false"
}

variable "smtp_user" {
  description = "SMTP username"
  type        = string
  default     = ""
}

variable "smtp_pass" {
  description = "SMTP password"
  type        = string
  default     = ""
  sensitive   = true
}

variable "smtp_from" {
  description = "SMTP from address"
  type        = string
  default     = "no-reply@teamspaceone.in"
}

variable "organisation_email_encryption_key" {
  description = "AES-256-GCM encryption key for organisation-level email provider passwords"
  type        = string
  sensitive   = true
}

variable "domain" {
  description = "Public domain to use for HTTPS endpoints (e.g. teamspaceone.in). If empty, the deployment uses the external IP over HTTP."
  type        = string
  default     = ""
}

variable "acme_email" {
  description = "Email address for Let's Encrypt ACME account (required when domain is set)"
  type        = string
  default     = ""
}
