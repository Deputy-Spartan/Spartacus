// A red asterisk to mark a required field's label — drop right after the
// label text, e.g. <label>Channel <Required /></label>.
export function Required() {
  return (
    <span className="text-rose-400" aria-hidden="true">
      {" *"}
    </span>
  );
}
