import * as Schema from "effect/Schema";
import * as Model from "effect/unstable/schema/Model";
import { ProfileId } from "./Ids.ts";

/**
 * The unifying concept: an application is a set of answers.
 *
 * A CV, a covering letter, and an ATS form are three projections of the same
 * facts. Modelling them separately is what forces a person to type their
 * notice period into every portal that asks. Modelling the answer once means
 * the CV renders it, the letter cites it, and the form is filled from it.
 *
 * A `Question` is normalized so that "Years of experience with TypeScript",
 * "TS experience (years)", and "Hvor mange års erfaring har du med TypeScript?"
 * resolve to one answer. That normalization is what a learned field mapping
 * ultimately produces.
 */
export const QuestionKey = Schema.String.pipe(Schema.brand("QuestionKey"));
export type QuestionKey = typeof QuestionKey.Type;

/**
 * What kind of answer a question takes. Tagged rather than a string because a
 * form filler must handle each shape differently, and an unhandled shape
 * should not compile.
 */
export const AnswerShape = Schema.Union([
  Schema.TaggedStruct("Text", { maxLength: Schema.optional(Schema.Number) }),
  Schema.TaggedStruct("LongText", {}),
  Schema.TaggedStruct("Number", {}),
  Schema.TaggedStruct("Boolean", {}),
  Schema.TaggedStruct("Date", {}),
  Schema.TaggedStruct("Choice", { options: Schema.Array(Schema.String) }),
  Schema.TaggedStruct("File", { accepts: Schema.Array(Schema.String) }),
]);
export type AnswerShape = typeof AnswerShape.Type;

/**
 * One fact about a person, reusable across every application they make.
 *
 * The value is `Sensitive`: it is answered by the person, stored for them, and
 * never appears in a JSON variant. That is a property of the model rather than
 * a rule handlers must remember.
 */
export class Answer extends Model.Class<Answer>("Answer")({
  profileId: ProfileId,
  question: QuestionKey,
  label: Schema.String,
  shape: Model.JsonFromString(AnswerShape),
  value: Model.Sensitive(Schema.String),
  /** Where it came from, so a person can tell what they typed from what was inferred. */
  origin: Schema.Literals(["stated", "derived", "observed"]),
  createdAt: Model.DateTimeInsert,
  updatedAt: Model.DateTimeUpdate,
}) {}
