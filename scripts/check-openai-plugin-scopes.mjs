import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../backend/src/main/java/com/know/security/OpenAiScope.java", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../codex-plugin/mcp.json", import.meta.url), "utf8"));
const serverScopes = [...source.matchAll(/^\s+[A-Z_]+\("(kb:[^"]+)"/gm)].map(([, scope]) => scope).sort();
const pluginScopes = manifest.mcpServers["knowledge-base"].extensions["com.openai"].auth.defaultScopes.toSorted();

assert.ok(serverScopes.length > 0, "OpenAiScope must define at least one scope");
assert.deepEqual(pluginScopes, serverScopes, "Plugin defaultScopes must match the server's canonical OpenAiScope enum");
console.log(`OpenAI plugin scope manifest matches ${serverScopes.length} canonical scopes.`);
