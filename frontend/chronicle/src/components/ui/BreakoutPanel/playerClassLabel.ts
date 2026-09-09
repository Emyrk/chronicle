export function playerClassLabel(className: string, specialization?: string, subSpec?: string): string {
  if (!specialization) return className;
  return `${specialization.toUpperCase()}${subSpec ? ` (${subSpec.toUpperCase()})` : ""} ${className}`;
}
