import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const main = readFileSync(resolve(root, "deployment/cloudflare/main.tf"), "utf8");
const variables = readFileSync(
  resolve(root, "deployment/cloudflare/variables.tf"),
  "utf8",
);

const failures = [];
let checks = 0;
function check(condition, description) {
  checks++;
  if (!condition) failures.push(description);
}

const refs = [
  "rate_limit_authentication",
  "rate_limit_imports",
  "rate_limit_search_and_reports",
  "rate_limit_api_requests",
];
const ruleBlocks = new Map();
for (const match of main.matchAll(/ref\s*=\s*"([^"]+)"([\s\S]*?)(?=\n\s*\},?\s*\{|\n\s*\}\])/g)) {
  ruleBlocks.set(match[1], match[2]);
}

const rules = {
  rate_limit_authentication: {
    expression:
      'http.host eq "${var.domain}" and http.request.uri.path matches "^${local.api_prefix}/auth/(login|register|google)$"',
    path: /^\/api\/v1\/auth\/(login|register|google)$/,
    requests: 20,
    mitigation: 300,
  },
  rate_limit_imports: {
    expression:
      'http.host eq "${var.domain}" and http.request.uri.path matches "^${local.api_prefix}/imports/"',
    path: /^\/api\/v1\/imports\//,
    requests: 12,
    mitigation: 300,
  },
  rate_limit_search_and_reports: {
    expression:
      'http.host eq "${var.domain}" and http.request.uri.path matches "^${local.api_prefix}/(search|reports)(/|$)"',
    path: /^\/api\/v1\/(search|reports)(\/|$)/,
    requests: 60,
    mitigation: 120,
  },
  rate_limit_api_requests: {
    expression:
      'http.host eq "${var.domain}" and http.request.uri.path matches "^${local.api_prefix}(/|$)"',
    path: /^\/api\/v1(\/|$)/,
    requests: 300,
    mitigation: 60,
  },
};
const paths = [
  "/api/v1/auth/login", "/api/v1/auth/register", "/api/v1/auth/google",
  "/api/v1/auth/google/config", "/api/v1/auth/me",
  "/api/v1/imports/clockify", "/api/v1/imports/knowledge-base/export",
  "/api/v1/imports", "/api/v1/imports-other/x",
  "/api/v1/search", "/api/v1/search/anything", "/api/v1/searchx",
  "/api/v1/reports", "/api/v1/reports/export", "/api/v1/reports-old",
  "/api/v1", "/api/v1/notes", "/api/v10/notes", "/health",
];
const expectedMatches = {
  rate_limit_authentication: (path) => /^\/api\/v1\/auth\/(login|register|google)$/.test(path),
  rate_limit_imports: (path) => /^\/api\/v1\/imports\//.test(path),
  rate_limit_search_and_reports: (path) => /^\/api\/v1\/(search|reports)(\/|$)/.test(path),
  rate_limit_api_requests: (path) => /^\/api\/v1(\/|$)/.test(path),
};

check(main.includes('phase       = "http_request_firewall_managed"'), "managed WAF phase exists");
check(main.includes('phase       = "http_request_firewall_custom"'), "custom WAF phase exists");
check(main.includes('phase       = "http_ratelimit"'), "rate-limit phase exists");
check(main.includes("count       = var.enable_rate_limits ? 1 : 0"), "edge limits are optional");
check(/variable "enable_rate_limits"[\s\S]*?default\s*=\s*true/.test(variables), "example rate-limit default is enabled");
check(variables.includes("sensitive   = true"), "Cloudflare API token is sensitive");

const actualOrder = [...main.matchAll(/ref\s*=\s*"(rate_limit_[^"]+)"/g)].map((match) => match[1]);
check(JSON.stringify(actualOrder) === JSON.stringify(refs), "all four rate rules exist in declared order");

for (const [ref, expected] of Object.entries(rules)) {
  const block = ruleBlocks.get(ref);
  check(Boolean(block), `${ref} rule block exists`);
  if (!block) continue;
  const encodedExpression = block.match(/expression\s*=\s*"((?:\\.|[^"\\])*)"/)?.[1];
  const expression = encodedExpression === undefined ? undefined : JSON.parse(`"${encodedExpression}"`);
  check(expression === expected.expression, `${ref} expression matches its route contract`);
  check(block.includes('action      = "block"'), `${ref} blocks after its threshold`);
  check(block.includes('characteristics     = ["cf.colo.id", "ip.src"]'), `${ref} uses colo and source IP characteristics`);
  check(new RegExp(`period\\s+=\\s+60\\b`).test(block), `${ref} counts a 60-second period`);
  check(new RegExp(`requests_per_period\\s*=\\s*${expected.requests}\\b`).test(block), `${ref} threshold is ${expected.requests}`);
  check(new RegExp(`mitigation_timeout\\s*=\\s*${expected.mitigation}\\b`).test(block), `${ref} mitigation is ${expected.mitigation} seconds`);

  for (const path of paths)
    check(expected.path.test(path) === expectedMatches[ref](path), `${ref} path behavior for ${path}`);
}

const controllerInventory = [
  ["AuthController.java", '@RequestMapping("/api/v1/auth")', ["@PostMapping(\"/login\")", "@PostMapping(\"/register\")", "@PostMapping(\"/google\")"]],
  ["ImportController.java", '@RequestMapping("/api/v1/imports")', ["@PostMapping(\"/clockify\")", '@GetMapping("/clockify/batches")', '@DeleteMapping("/clockify/batches/{id}")']],
  ["KnowledgeBaseTransferController.java", '@RequestMapping("/api/v1/imports/knowledge-base")', ['@GetMapping(value = "/export"', '@PostMapping(consumes = "text/csv"', '@GetMapping("/batches")', '@DeleteMapping("/batches/{id}")']],
  ["SearchController.java", '@RequestMapping("/api/v1/search")', ["@GetMapping"]],
  ["ReportController.java", '@RequestMapping("/api/v1/reports")', ["@GetMapping"]],
];
for (const [file, base, mappings] of controllerInventory) {
  const source = readFileSync(resolve(root, "backend/src/main/java/com/know/api", file), "utf8");
  check(source.includes(base), `${file} base path remains in the WAF route inventory`);
  for (const mapping of mappings) check(source.includes(mapping), `${file} mapping ${mapping} remains in the WAF route inventory`);
}

check(!/http\.request\.method/.test(main.slice(main.indexOf('resource "cloudflare_ruleset" "rate_limits"')),), "rate-limit expressions do not constrain method");
check(main.includes("requests_per_period = 20") && main.includes("requests_per_period = 300"), "narrow and broad thresholds remain distinct counters");

if (failures.length) {
  console.error(`Cloudflare WAF contract checks failed (${failures.length}/${checks}):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`Cloudflare WAF semantic contract checks passed (${checks} checks).`);
