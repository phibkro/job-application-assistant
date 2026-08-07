import { describe, expect, it } from "vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as OptionMod from "effect/Option";
import { Answer } from "@job-index/domain/Answer";
import { DeliveryPlatform } from "@job-index/domain/Delivery";
import {
  columnsOf,
  decodeRow,
  deleteStatement,
  encodeVariant,
  insertStatement,
  selectStatement,
  updateStatement,
} from "./Sql.ts";

const now = DateTime.nowUnsafe();

const answer = new Answer({
  profileId: "profile-1" as never,
  question: "years-experience" as never,
  label: "Years of experience",
  shape: { _tag: "Number" },
  value: "5",
  origin: "stated",
  createdAt: now,
  updatedAt: now,
});

describe("columnsOf", () => {
  it("reads the update variant's column list straight from the model — createdAt is excluded", () => {
    expect(columnsOf(Answer as never)).toEqual([
      "profileId",
      "question",
      "label",
      "shape",
      "value",
      "origin",
      "createdAt",
      "updatedAt",
    ]);
    expect(columnsOf((Answer as never as { update: object }).update as never)).not.toContain(
      "createdAt",
    );
  });
});

describe("encodeVariant / decodeRow", () => {
  it("round-trips a model instance through its own select-variant encoding", async () => {
    const encoded = await Effect.runPromise(encodeVariant<Answer>(Answer as never)(answer));
    expect(encoded.shape).toBe('{"_tag":"Number"}');
    expect(typeof encoded.createdAt).toBe("string");

    const decoded = await Effect.runPromise(decodeRow<Answer>(Answer as never)(encoded));
    expect(decoded.profileId).toBe(answer.profileId);
    expect(decoded.value).toBe("5");
  });

  it("encodes an absent Option field as SQL null, never as undefined", async () => {
    const platform = new DeliveryPlatform({
      id: "finn" as never,
      name: "FINN.no",
      hostPattern: "*.finn.no",
      tier: { _tag: "Unknown" },
      mappings: [],
      automationProhibited: false,
      learnedAt: OptionMod.none(),
      createdAt: now,
      updatedAt: now,
    });
    const encoded = await Effect.runPromise(
      encodeVariant<DeliveryPlatform>(DeliveryPlatform as never)(platform),
    );
    expect(encoded.learnedAt).toBe(null);
    expect(encoded.automationProhibited).toBe(0);
  });
});

describe("statement builders", () => {
  const columns = ["a", "b", "c"];

  it("builds INSERT with placeholders and bindings in column order", () => {
    const stmt = insertStatement("t", columns, { c: 3, a: 1, b: undefined });
    expect(stmt.sql).toBe("INSERT INTO t (a, b, c) VALUES (?, ?, ?)");
    expect(stmt.bindings).toEqual([1, null, 3]);
  });

  it("builds UPDATE that excludes key columns from SET and appends them to WHERE", () => {
    const stmt = updateStatement("t", columns, ["a"], { a: 1, b: 2, c: 3 });
    expect(stmt.sql).toBe("UPDATE t SET b = ?, c = ? WHERE a = ?");
    expect(stmt.bindings).toEqual([2, 3, 1]);
  });

  it("builds UPDATE with a composite key", () => {
    const stmt = updateStatement("answers", columns, ["a", "b"], { a: 1, b: 2, c: 3 });
    expect(stmt.sql).toBe("UPDATE answers SET c = ? WHERE a = ? AND b = ?");
    expect(stmt.bindings).toEqual([3, 1, 2]);
  });

  it("builds DELETE over an explicit key", () => {
    const stmt = deleteStatement("t", { a: 1, b: null });
    expect(stmt.sql).toBe("DELETE FROM t WHERE a = ? AND b = ?");
    expect(stmt.bindings).toEqual([1, null]);
  });

  it("builds SELECT with and without a WHERE clause", () => {
    expect(selectStatement("t", {}).sql).toBe("SELECT * FROM t");
    expect(selectStatement("t", { id: "x" }).sql).toBe("SELECT * FROM t WHERE id = ?");
  });
});
