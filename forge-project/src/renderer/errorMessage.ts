export function errorMessage(err: unknown): string {
  // Supabase's PostgrestError/AuthError are plain { message, ... } objects,
  // not Error instances — String() on them gives "[object Object]" rather
  // than anything useful.
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}
