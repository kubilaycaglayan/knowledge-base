export function missingInventoryMetadata(source) {
  const missing = [];
  if (!/^\*\*Inventory owner:\*\*\s+\S/m.test(source)) {
    missing.push("inventory owner");
  }
  if (!/^\*\*(?:Evidence|Test|Execution) commands?:\*\*.*`[^`]+`/m.test(source)) {
    missing.push("exact evidence command");
  }
  return missing;
}
