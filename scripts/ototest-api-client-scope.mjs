export function decisionNeededOperationsMissingOwner(markdown) {
  const lines = markdown.split("\n");
  const header = lines.findIndex((line) => line.includes("| Verb + composed path |"));
  if (header < 0) return ["API matrix is missing the operation table"];
  const problems = [];
  for (let index = header + 2; index < lines.length && lines[index].startsWith("|"); index += 1) {
    const cells = lines[index].split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells[4] !== "decision-needed") continue;
    const identity = cells[0] ?? `row ${index - header - 1}`;
    const state = cells[3] ?? "";
    if (!/client scope gap/i.test(state)) {
      problems.push(`${identity}: decision-needed operation must explain its missing supported client call site`);
    }
    if (!/knowledge base maintainers/i.test(state)) {
      problems.push(`${identity}: decision-needed operation must name Knowledge Base maintainers as decision owner`);
    }
  }
  return problems;
}
