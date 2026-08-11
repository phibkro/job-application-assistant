/**
 * A small, pure set algebra.
 *
 * The type parameter is carried through every node, so an expression from one
 * vocabulary cannot be applied to another vocabulary even when both happen to
 * use strings at runtime. The expression is a predicate over an explicit
 * finite membership set; there is no implicit universal set.
 */

declare const setExpressionVocabulary: unique symbol;

export type SetExpression<A> =
  | ({ readonly _tag: "Atom"; readonly value: A } & {
      readonly [setExpressionVocabulary]: (value: A) => A;
    })
  | ({
      readonly _tag: "Union";
      readonly left: SetExpression<A>;
      readonly right: SetExpression<A>;
    } & { readonly [setExpressionVocabulary]: (value: A) => A })
  | ({
      readonly _tag: "Intersection";
      readonly left: SetExpression<A>;
      readonly right: SetExpression<A>;
    } & { readonly [setExpressionVocabulary]: (value: A) => A })
  | ({
      readonly _tag: "Difference";
      /** The explicit base is required; there is no implicit universal set. */
      readonly base: SetExpression<A>;
      readonly subtract: SetExpression<A>;
    } & { readonly [setExpressionVocabulary]: (value: A) => A });

const branded = <A, T extends object>(value: T): SetExpression<A> =>
  value as unknown as SetExpression<A>;

/** Construct membership of one value. */
export const atom = <A>(value: A): SetExpression<A> => branded({ _tag: "Atom", value });

/** Construct a union. Additional operands are folded left-to-right. */
export const union = <A>(
  left: SetExpression<A>,
  right: SetExpression<A>,
  ...rest: ReadonlyArray<SetExpression<A>>
): SetExpression<A> =>
  rest.reduce<SetExpression<A>>(
    (current, next) => branded({ _tag: "Union", left: current, right: next }),
    branded({ _tag: "Union", left, right }),
  );

/** Construct an intersection. Additional operands are folded left-to-right. */
export const intersection = <A>(
  left: SetExpression<A>,
  right: SetExpression<A>,
  ...rest: ReadonlyArray<SetExpression<A>>
): SetExpression<A> =>
  rest.reduce<SetExpression<A>>(
    (current, next) => branded({ _tag: "Intersection", left: current, right: next }),
    branded({ _tag: "Intersection", left, right }),
  );

/** Construct `base \ subtract`; the base expression is explicit by design. */
export const difference = <A>(
  base: SetExpression<A>,
  subtract: SetExpression<A>,
): SetExpression<A> => branded({ _tag: "Difference", base, subtract });

/**
 * Evaluate an expression against the caller's explicit membership set.
 *
 * `Atom` asks whether its value is present, `Union` and `Intersection` apply
 * the corresponding set laws, and `Difference` requires its base to be true
 * while its subtract expression is false.
 */
export const evaluate = <A>(expression: SetExpression<A>, members: Iterable<A>): boolean => {
  const membership = members instanceof Set ? members : new Set(members);
  switch (expression._tag) {
    case "Atom":
      return membership.has(expression.value);
    case "Union":
      return evaluate(expression.left, membership) || evaluate(expression.right, membership);
    case "Intersection":
      return evaluate(expression.left, membership) && evaluate(expression.right, membership);
    case "Difference":
      return evaluate(expression.base, membership) && !evaluate(expression.subtract, membership);
  }
};

/** Return the explicit members selected by an expression, preserving input order. */
export const select = <A>(expression: SetExpression<A>, members: Iterable<A>): ReadonlyArray<A> => {
  const values = Array.from(members);
  return values.filter((value) => evaluate(expression, [value]));
};
