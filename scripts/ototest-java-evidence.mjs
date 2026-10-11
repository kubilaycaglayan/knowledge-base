export function qualifiedJavaEvidenceReferences(evidence) {
  return [...evidence.matchAll(/\b([A-Za-z][A-Za-z0-9]*Test)\.([A-Za-z_][A-Za-z0-9_]*)/g)]
    .filter(([, , methodName]) => methodName !== "java")
    .map(([, className, methodName]) => ({ className, methodName }));
}
