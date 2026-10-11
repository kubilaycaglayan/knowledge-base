export function missingInventoryMetadata(source) {
  const missing = [];
  if (!/^\*\*Inventory owner:\*\*\s+\S/m.test(source)) {
    missing.push("inventory owner");
  }
  if (!/^\*\*Source revision:\*\*\s+`[0-9a-f]{7,40}`/m.test(source)) {
    missing.push("reviewed source revision");
  }
  if (!/^\*\*(?:Evidence|Test|Execution) commands?:\*\*.*`[^`]+`/m.test(source)) {
    missing.push("exact evidence command");
  }
  if (!/^\*\*Latest evidence run:\*\*\s+\[[^\]]+\]\(https:\/\//m.test(source)) {
    missing.push("hosted evidence run link");
  }
  return missing;
}
