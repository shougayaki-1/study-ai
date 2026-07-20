type SupabaseErrorLike = { message: string } | null | undefined;

export function throwIfSupabaseError(error: SupabaseErrorLike): void {
  if (error) throw new Error(error.message);
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
