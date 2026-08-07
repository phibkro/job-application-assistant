/**
 * One newline-per-entry text box, on both sides of the profile's list
 * fields (`skills`, `education`, and — inside `ExperienceEntry` —
 * `highlights`). Kept in this one function so those three fields tokenize
 * identically rather than each growing its own slightly different split.
 */
export const linesOf = (text: string): ReadonlyArray<string> =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
