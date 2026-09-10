// Inline validation message — shown next to/above a submit button when a
// required field is missing, instead of the button silently doing nothing.
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="text-xs text-rose-400 mt-2">{message}</p>;
}
