export function publicOperationsMissingRationale(markdown) {
  const lines = markdown.split("\n");
  const header = lines.findIndex((line) => line.includes("| Verb + composed path |"));
  if (header < 0) return ["API matrix is missing the operation table"];
  const problems = [];
  for (let index = header + 2; index < lines.length && lines[index].startsWith("|"); index += 1) {
    const cells = lines[index].split("|").slice(1, -1).map((cell) => cell.trim());
    const identity = cells[0] ?? `row ${index - header - 1}`;
    const contract = cells[1] ?? "";
    if (/;\s*public(?:\s+because\b|;|$)/i.test(contract) && !/public because\b/i.test(contract)) {
      problems.push(`${identity}: public API operation must state why authentication is bypassed`);
    }
  }
  return problems;
}
