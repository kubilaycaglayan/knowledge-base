export function unresolvedNavAcceptanceReferences(controlRows, testSource) {
  const testNames = new Set(
    [...testSource.matchAll(/^\s*it\(\s*(["'`])(.+?)\1/gm)].map((match) => match[2]),
  );
  const unresolved = [];

  for (const [index, cells] of controlRows.entries()) {
    const evidence = cells[2] ?? "";
    for (const match of evidence.matchAll(/nav-shell\.acceptance\.test\.mjs\)?\s*:\s*((?:`[^`]+`(?:;\s*)?)+)/g)) {
      for (const [, reference] of match[1].matchAll(/`([^`]+)`/g)) {
        // Other source references can follow the browser assertions in the
        // same cell. Sentence-like labels are the browser assertion names.
        if (reference.includes(" ") && !testNames.has(reference)) {
          unresolved.push({ row: index + 1, reference });
        }
      }
    }
  }

  return unresolved;
}
