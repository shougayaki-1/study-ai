export function assertSafeValue(value, field) {
  if (typeof value === 'string' && (value.includes(' | ') || value.includes('\n'))) {
    throw new Error(`${field} must not contain ' | ' or a newline: ${JSON.stringify(value)}`);
  }
}
