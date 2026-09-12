variable "cloudflare_api_token" {
  description = "Cloudflare API token with Zone WAF Write permission."
  type        = string
  sensitive   = true
}

variable "cloudflare_zone_id" {
  description = "ID of the Cloudflare zone serving the Knowledge Base domain."
  type        = string
}

variable "domain" {
  description = "Production hostname, without scheme or path."
  type        = string
}

variable "managed_ruleset_id" {
  description = "Cloudflare Managed Ruleset ID. Override if Cloudflare provides a different ID for the account."
  type        = string
  default     = "efb7b8c949ac4650a09736fc376e9aee"
}

variable "enable_managed_waf" {
  description = "Enable the Cloudflare Managed Ruleset. Set false for an initial custom-rule-only rollout."
  type        = bool
  default     = true
}

variable "enable_rate_limits" {
  description = "Enable endpoint-specific Cloudflare rate limits."
  type        = bool
  default     = true
}
