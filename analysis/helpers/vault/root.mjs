export function vaultRoot() {
  const value = process.env.STUDY_AI_VAULT_DIR;
  if (!value) {
    throw new Error('STUDY_AI_VAULT_DIR is not set');
  }
  return value;
}
