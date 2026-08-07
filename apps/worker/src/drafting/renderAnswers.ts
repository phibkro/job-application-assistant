import type { Answer, AnswerShape } from "@job-index/domain/Answer";
import type { Profile } from "@job-index/domain/Profile";
import { renderCvBody } from "./sections.ts";

/**
 * How one stored answer reads in prose. Only `Boolean` needs translating —
 * every other shape's stored value is already the words a person typed, so
 * printing it verbatim is the correct rendering, not a shortcut.
 */
const formatAnswerValue = (shape: AnswerShape, value: string): string => {
  switch (shape._tag) {
    case "Boolean":
      return value === "true" ? "Yes" : "No";
    case "Text":
    case "LongText":
    case "Number":
    case "Date":
    case "Choice":
    case "File":
      return value;
  }
};

/**
 * Projects a person's stored answers into their CV.
 *
 * No advert is involved here, so the profile's experience keeps its own
 * order rather than being ranked — ranking against an advert is what
 * `composeCv` does, and this function is not given one to rank against.
 */
export const renderAnswers = (profile: Profile, answers: ReadonlyArray<Answer>): string => {
  const body = renderCvBody(profile, profile.experience);
  if (answers.length === 0) {
    return body;
  }

  const answerLines = answers.map(
    (answer) => `${answer.label}: ${formatAnswerValue(answer.shape, answer.value)}`,
  );
  return [body, "", "ADDITIONAL INFORMATION", ...answerLines].join("\n");
};
