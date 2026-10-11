export function completionGuardProblems({ status, checklist, runRecord }) {
  if (status !== "Complete") return [];

  const problems = [];
  const openAcceptanceItems = [...checklist.matchAll(/^\s*-\s*\[ \]\s+(.+)$/gm)];
  if (openAcceptanceItems.length > 0) {
    problems.push(`OTOTEST-05: cannot be Complete with ${openAcceptanceItems.length} unchecked acceptance item(s)`);
  }

  if (!/https:\/\/github\.com\/[^\s)]+\/actions\/runs\/\d+/.test(runRecord) || !/\bPass\b/.test(runRecord)) {
    problems.push("OTOTEST-05: Complete requires a passing hosted run linked from the milestone evidence record");
  }
  return problems;
}
