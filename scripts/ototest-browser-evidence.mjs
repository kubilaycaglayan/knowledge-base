export function unresolvedAcceptanceReferences(controlRows, sourcesByFile) {
  const unresolved = [];

  for (const entry of controlRows) {
    const { cells, evidenceIndex } = entry;
    const evidence = cells[evidenceIndex] ?? "";
    for (const [file, testSource] of Object.entries(sourcesByFile)) {
      const escapedFile = file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const testNames = new Set(
        [...testSource.matchAll(/(?:^|\n)\s*(?:it|test)(?:\.each\([\s\S]*?\))?\(\s*(["'`])(.+?)\1/g)].map((match) => match[2]),
      );
      const pattern = new RegExp(`${escapedFile}\\)?\\s*:\\s*((?:\`[^\`]+\`(?:;\\s*)?)+)`, "g");
      for (const match of evidence.matchAll(pattern)) {
        for (const [, reference] of match[1].matchAll(/`([^`]+)`/g)) {
          // Other source references can follow test assertions in the same
          // cell. Sentence-like labels are assertion names.
          if (reference.includes(" ") && !testNames.has(reference)) {
            unresolved.push({
              document: entry.document ?? "01-control-matrix.md",
              row: entry.row,
              file,
              reference,
            });
          }
        }
      }
    }
  }

  return unresolved;
}

const evidenceStatuses = new Set(["covered", "gap", "manual", "unsupported/excluded", "decision-needed"]);

export function apiRowsMissingNamedEvidence(rows) {
  return rows.flatMap((cells, index) => {
    const evidence = cells[2] ?? "";
    return /\b[A-Za-z][A-Za-z0-9]*Test\.[A-Za-z_][A-Za-z0-9_]*/.test(evidence)
      ? []
      : [{ row: index + 1, operation: cells[0] ?? "" }];
  });
}

export function invalidEvidenceStatuses(rows, statusIndex) {
  return rows.flatMap((cells, index) => {
    const status = cells[statusIndex] ?? "";
    return evidenceStatuses.has(status) ? [] : [{ row: index + 1, status }];
  });
}
