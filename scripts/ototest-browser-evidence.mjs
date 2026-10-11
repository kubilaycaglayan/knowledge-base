export function unresolvedAcceptanceReferences(controlRows, sourcesByFile) {
  const unresolved = [];

  for (const [index, cells] of controlRows.entries()) {
    const evidence = cells[2] ?? "";
    for (const [file, testSource] of Object.entries(sourcesByFile)) {
      const escapedFile = file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const testNames = new Set(
        [...testSource.matchAll(/^\s*it\(\s*(["'`])(.+?)\1/gm)].map((match) => match[2]),
      );
      const pattern = new RegExp(`${escapedFile}\\)?\\s*:\\s*((?:\`[^\`]+\`(?:;\\s*)?)+)`, "g");
      for (const match of evidence.matchAll(pattern)) {
        for (const [, reference] of match[1].matchAll(/`([^`]+)`/g)) {
          // Other source references can follow browser assertions in the
          // same cell. Sentence-like labels are assertion names.
          if (reference.includes(" ") && !testNames.has(reference)) {
            unresolved.push({ row: index + 1, file, reference });
          }
        }
      }
    }
  }

  return unresolved;
}
