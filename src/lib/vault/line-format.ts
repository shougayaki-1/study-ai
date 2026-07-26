export function assertSafeValue(value: string, field: string): void {
  if (value.includes(" | ") || value.includes("\n")) {
    throw new Error(`${field} must not contain ' | ' or a newline: ${JSON.stringify(value)}`);
  }
}
