import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const main = readFileSync(
  resolve(root, "deployment/cloudflare/main.tf"),
  "utf8",
);
const variables = readFileSync(
  resolve(root, "deployment/cloudflare/variables.tf"),
  "utf8",
);

const checks = [
  [
    main.includes('phase       = "http_request_firewall_managed"'),
    "managed WAF runs in the managed phase",
  ],
  [
    main.includes('phase       = "http_request_firewall_custom"'),
    "custom rules run in the custom phase",
  ],
  [
    main.includes('phase       = "http_ratelimit"'),
    "rate limits run in the rate-limit phase",
  ],
  [
    main.includes('ref         = "rate_limit_authentication"'),
    "authentication endpoint rate limit exists",
  ],
  [
    main.includes('ref         = "rate_limit_imports"'),
    "import endpoint rate limit exists",
  ],
  [
    main.includes('ref         = "rate_limit_search_and_reports"'),
    "expensive endpoint rate limit exists",
  ],
  [
    main.includes('ref         = "rate_limit_api_requests"'),
    "broad API rate limit exists",
  ],
  [
    main.includes('characteristics     = ["cf.colo.id", "ip.src"]'),
    "rate limits are keyed by Cloudflare colo and source IP",
  ],
  [variables.includes("sensitive   = true"), "Cloudflare token is sensitive"],
];

const failures = checks
  .filter(([passed]) => !passed)
  .map(([, description]) => description);
if (failures.length) {
  console.error(`Cloudflare WAF checks failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`Cloudflare WAF checks passed (${checks.length} checks).`);
