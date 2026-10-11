import { qualifiedJavaEvidenceReferences } from "./ototest-java-evidence.mjs";

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
      const pattern = new RegExp(`${escapedFile}(?:\\)|\\x60)?\\s*:\\s*((?:\\x60[^\\x60]+\\x60(?:;\\s*)?)+)`, "g");
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

export function rowsMissingNamedAssertions(rows, evidenceIndex, statusIndex) {
  return rows.flatMap((cells, index) => {
    if (cells[statusIndex] !== "covered") return [];
    const evidence = cells[evidenceIndex] ?? "";
    const hasJavaMethod = qualifiedJavaEvidenceReferences(evidence).length > 0;
    const hasNamedJsAssertion = /(?:test|spec)\.(?:ts|tsx|js|mjs)(?:`\]\([^)]*\))?`?\s*:?\s*`[^`]+`/i.test(evidence);
    return hasJavaMethod || hasNamedJsAssertion
      ? []
      : [{ row: index + 1, identity: cells[0] ?? "" }];
  });
}

export function coveredStateClaimsMissingLayer(rows, evidenceIndex, claimIndex, statusIndex) {
  const stateClaim = /\b(?:persist\w*|read.?back|owner(?:ship)?|owned|foreign|another user)\b/i;
  const statefulLayer = /(?:[A-Za-z][A-Za-z0-9]*IntegrationTest\.|(?:real-stack|real-browser)\.acceptance\.test\.)/i;
  return rows.flatMap((cells, index) => {
    const claim = cells[claimIndex] ?? "";
    if (cells[statusIndex] !== "covered" || !stateClaim.test(claim) || statefulLayer.test(cells[evidenceIndex] ?? "")) return [];
    return [{ row: index + 1, identity: cells[0] ?? "" }];
  });
}

export function coveredMutationReferenceClaimsMissingOwnership(rows, identityIndex, requestIndex, claimIndex, statusIndex) {
  const mutation = /^`?(?:POST|PUT|PATCH|DELETE)\b/i;
  const referenceField = /(?:[A-Za-z]+Request|Request)\.[A-Za-z]*(?:path|label|board|status|note|activity|timeEntry|card|calendarLabel|log)(?:Ids|Id)\b/i;
  const ownershipClaim = /\b(?:foreign|another user|another board|owned|ownership|owner|belong(?:s|ing)? to (?:the )?user)\b/i;
  return rows.flatMap((cells, index) => {
    if (cells[statusIndex] !== "covered"
        || !mutation.test(cells[identityIndex] ?? "")
        || !referenceField.test(cells[requestIndex] ?? "")
        || ownershipClaim.test(cells[claimIndex] ?? "")) return [];
    return [{ row: index + 1, identity: cells[identityIndex] ?? "" }];
  });
}

export function coveredRecordReadClaimsMissingOutcomes(rows, identityIndex, claimIndex, statusIndex) {
  const recordRead = /^`?GET\b.*\/\{(?:id|[A-Za-z]+Id)\}/i;
  const outcomes = [
    /\b(?:owned|owner)\b/i,
    /\b(?:missing|not found|absent)\b/i,
    /\b(?:foreign|another user|another board|cross-user)\b/i,
  ];
  return rows.flatMap((cells, index) => {
    const claim = cells[claimIndex] ?? "";
    if (cells[statusIndex] !== "covered"
        || !recordRead.test(cells[identityIndex] ?? "")
        || outcomes.every((outcome) => outcome.test(claim))) return [];
    return [{ row: index + 1, identity: cells[identityIndex] ?? "" }];
  });
}

export function invalidEvidenceStatuses(rows, statusIndex) {
  return rows.flatMap((cells, index) => {
    const status = cells[statusIndex] ?? "";
    return evidenceStatuses.has(status) ? [] : [{ row: index + 1, status }];
  });
}
