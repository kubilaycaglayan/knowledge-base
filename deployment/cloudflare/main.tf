locals {
  api_prefix = "/api/v1"
}

# The managed ruleset is deployed at the zone entry point. Cloudflare's
# managed rules are updated by Cloudflare and should not be copied into this
# repository as individual signatures.
resource "cloudflare_ruleset" "managed_waf" {
  count       = var.enable_managed_waf ? 1 : 0
  zone_id     = var.cloudflare_zone_id
  name        = "Knowledge Base managed WAF"
  description = "Cloudflare-managed protection for common web exploits"
  kind        = "zone"
  phase       = "http_request_firewall_managed"

  rules = [{
    ref         = "execute_cloudflare_managed_ruleset"
    description = "Execute Cloudflare Managed Ruleset"
    expression  = "true"
    action      = "execute"
    action_parameters = {
      id = var.managed_ruleset_id
    }
  }]
}

# Keep application-specific policy separate from the managed ruleset so that
# it can be reviewed and changed without changing vendor-managed signatures.
resource "cloudflare_ruleset" "custom_waf" {
  zone_id     = var.cloudflare_zone_id
  name        = "Knowledge Base custom WAF rules"
  description = "Host, method, and API abuse controls"
  kind        = "zone"
  phase       = "http_request_firewall_custom"

  rules = [{
    ref         = "allow_only_knowledge_base_host"
    description = "Block requests sent to an unexpected Host header"
    expression  = "http.host ne \"${var.domain}\""
    action      = "block"
    }, {
    ref         = "allow_only_supported_http_methods"
    description = "Block methods not used by the Knowledge Base API"
    expression  = "not http.request.method in {\"GET\" \"HEAD\" \"POST\" \"PUT\" \"PATCH\" \"DELETE\" \"OPTIONS\"}"
    action      = "block"
  }]
}

# Cloudflare rate limits are an edge safety net. Spring Security remains the
# authority for authentication and the existing application limiter remains
# useful for email-aware login protection.
resource "cloudflare_ruleset" "rate_limits" {
  count       = var.enable_rate_limits ? 1 : 0
  zone_id     = var.cloudflare_zone_id
  name        = "Knowledge Base API rate limits"
  description = "IP-based edge limits for authentication and expensive API operations"
  kind        = "zone"
  phase       = "http_ratelimit"

  rules = [{
    ref         = "rate_limit_authentication"
    description = "Limit login, registration, and Google authentication attempts"
    expression  = "http.host eq \"${var.domain}\" and http.request.uri.path matches \"^${local.api_prefix}/auth/(login|register|google)$\""
    action      = "block"
    ratelimit = {
      characteristics     = ["cf.colo.id", "ip.src"]
      period              = 60
      requests_per_period = 20
      mitigation_timeout  = 300
    }
    }, {
    ref         = "rate_limit_imports"
    description = "Limit CSV and Clockify imports"
    expression  = "http.host eq \"${var.domain}\" and http.request.uri.path matches \"^${local.api_prefix}/imports/\""
    action      = "block"
    ratelimit = {
      characteristics     = ["cf.colo.id", "ip.src"]
      period              = 60
      requests_per_period = 12
      mitigation_timeout  = 300
    }
    }, {
    ref         = "rate_limit_search_and_reports"
    description = "Limit expensive search and reporting endpoints"
    expression  = "http.host eq \"${var.domain}\" and http.request.uri.path matches \"^${local.api_prefix}/(search|reports)(/|$)\""
    action      = "block"
    ratelimit = {
      characteristics     = ["cf.colo.id", "ip.src"]
      period              = 60
      requests_per_period = 60
      mitigation_timeout  = 120
    }
    }, {
    ref         = "rate_limit_api_requests"
    description = "Apply a broad per-IP API ceiling"
    expression  = "http.host eq \"${var.domain}\" and http.request.uri.path matches \"^${local.api_prefix}(/|$)\""
    action      = "block"
    ratelimit = {
      characteristics     = ["cf.colo.id", "ip.src"]
      period              = 60
      requests_per_period = 300
      mitigation_timeout  = 60
    }
  }]
}
