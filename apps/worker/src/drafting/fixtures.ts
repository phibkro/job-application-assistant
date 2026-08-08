import * as DateTime from "effect/DateTime";
import type { Answer, AnswerShape } from "@job-index/domain/Answer";
import type { JobSnapshot } from "@job-index/domain/Job";
import type { Profile } from "@job-index/domain/Profile";

/**
 * Test-only fixture builders, shared across this directory's test files.
 *
 * `Profile` and `JobSnapshot` have no branded fields, so a plain object
 * literal already satisfies both — `testJob` builds a `JobSnapshot`, not a
 * live `CanonicalJob`, because that is what everything in this directory
 * (`composeCv`, `composeLetter`, `Drafting.compose`) actually takes: see
 * `services/Drafting.ts`'s own doc comment on why. `Answer` carries a
 * `DateTime.Utc` audit trail a test has no reason to construct correctly —
 * this file is the one place that cast is made, so every test asks for the
 * field it cares about instead of re-deriving a whole stored answer.
 */

export const testProfile = (overrides: Partial<Profile> = {}): Profile => ({
  headline: "",
  summary: "",
  location: "",
  languages: "",
  skills: [],
  experience: [],
  education: [],
  ...overrides,
});

export const testJob = (overrides: Partial<JobSnapshot> = {}): JobSnapshot => ({
  title: "Customer Service Adviser",
  employerName: "Oslo Service Group AS",
  location: "Oslo",
  description: "Answer customer questions through chat and telephone support.",
  applicationUrl: "https://jobs.example.invalid/advert",
  publishedAt: "2026-01-01T00:00:00Z",
  ...overrides,
});

export const testAnswer = (label: string, shape: AnswerShape, value: string): Answer =>
  ({
    profileId: "profile_1",
    question: label.toLowerCase().replace(/\s+/g, "_"),
    label,
    shape,
    value,
    origin: "stated",
    createdAt: DateTime.nowUnsafe(),
    updatedAt: DateTime.nowUnsafe(),
  }) as unknown as Answer;
