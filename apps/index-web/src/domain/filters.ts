import { Option, String, pipe } from "effect";
import type { JobsQuery } from "../route.ts";

/** No filter: every current vacancy. */
export const empty: JobsQuery = { term: Option.none(), location: Option.none() };

const fromInput = (raw: string): Option.Option<string> =>
  pipe(raw, String.trim, Option.liftPredicate(String.isNonEmpty));

/** The filter form's draft text as a query: blank fields mean "no filter". */
export const fromInputs = (term: string, location: string): JobsQuery => ({
  term: fromInput(term),
  location: fromInput(location),
});

export const termInput = (query: JobsQuery): string => Option.getOrElse(query.term, () => "");

export const locationInput = (query: JobsQuery): string =>
  Option.getOrElse(query.location, () => "");

export const isFiltered = (query: JobsQuery): boolean =>
  Option.isSome(query.term) || Option.isSome(query.location);
