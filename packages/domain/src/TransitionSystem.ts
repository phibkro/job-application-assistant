import * as Data from "effect/Data";

/** A rejected transition remains a value, not an exception or an untyped boolean. */
export class TransitionRejected<S, E, A> extends Data.TaggedError("TransitionRejected")<{
  readonly state: S;
  readonly event: E;
  readonly authority: A;
  readonly reason: string;
}> {}

export type TransitionResult<S, E, A> =
  | { readonly _tag: "Accepted"; readonly state: S }
  | TransitionRejected<S, E, A>;

export type TransitionFunction<S, E, A> = (
  state: S,
  event: E,
  authority: A,
) => S | TransitionRejected<S, E, A>;

/**
 * A reusable exclusive-state transition algebra.
 *
 * The constructor keeps the product's transition policy in one pure function;
 * `apply` preserves that policy's typed rejection and never mutates the input
 * state. Authority is explicit in every application of the system.
 */
export class TransitionSystem<S, E, A = unknown> {
  private constructor(private readonly runTransition: TransitionFunction<S, E, A>) {}

  static make<S, E, A = unknown>(config: {
    readonly transition: TransitionFunction<S, E, A>;
  }): TransitionSystem<S, E, A> {
    return new TransitionSystem(config.transition);
  }

  apply(state: S, event: E, authority: A): TransitionResult<S, E, A> {
    const result = this.runTransition(state, event, authority);
    return result instanceof TransitionRejected ? result : { _tag: "Accepted", state: result };
  }

  /** Construct a typed rejection from a transition policy. */
  static reject<S, E, A>(
    state: S,
    event: E,
    authority: A,
    reason: string,
  ): TransitionRejected<S, E, A> {
    return new TransitionRejected({ state, event, authority, reason });
  }
}
