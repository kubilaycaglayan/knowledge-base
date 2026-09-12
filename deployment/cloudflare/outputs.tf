output "managed_waf_ruleset_id" {
  description = "Terraform ID of the zone managed-WAF entry point, when enabled."
  value       = try(cloudflare_ruleset.managed_waf[0].id, null)
}

output "custom_waf_ruleset_id" {
  description = "Terraform ID of the custom-WAF entry point."
  value       = cloudflare_ruleset.custom_waf.id
}

output "rate_limits_ruleset_id" {
  description = "Terraform ID of the rate-limit entry point, when enabled."
  value       = try(cloudflare_ruleset.rate_limits[0].id, null)
}
