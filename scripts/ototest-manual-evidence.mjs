export function manualRowsMissingProcedureLink(rows, statusIndex) {
  return rows.flatMap((cells, index) => {
    const hasProcedureLink = cells.some((cell) => /\[[^\]]+\]\([^)]+\)/.test(cell));
    return cells[statusIndex] === "manual" && !hasProcedureLink
      ? [{ row: index + 1, identity: cells[0] ?? "" }]
      : [];
  });
}
