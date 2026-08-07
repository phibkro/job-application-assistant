var __defProp = Object.defineProperty;
var __name = (target, value3) => __defProp(target, "name", { value: value3, configurable: true });

// ../.preview/worker.js
var pipeArguments = /* @__PURE__ */ __name((self, args2) => {
  switch (args2.length) {
    case 0:
      return self;
    case 1:
      return args2[0](self);
    case 2:
      return args2[1](args2[0](self));
    case 3:
      return args2[2](args2[1](args2[0](self)));
    case 4:
      return args2[3](args2[2](args2[1](args2[0](self))));
    case 5:
      return args2[4](args2[3](args2[2](args2[1](args2[0](self)))));
    case 6:
      return args2[5](args2[4](args2[3](args2[2](args2[1](args2[0](self))))));
    case 7:
      return args2[6](args2[5](args2[4](args2[3](args2[2](args2[1](args2[0](self)))))));
    case 8:
      return args2[7](args2[6](args2[5](args2[4](args2[3](args2[2](args2[1](args2[0](self))))))));
    case 9:
      return args2[8](args2[7](args2[6](args2[5](args2[4](args2[3](args2[2](args2[1](args2[0](self)))))))));
    default: {
      let ret = self;
      for (let i = 0, len = args2.length; i < len; i++) {
        ret = args2[i](ret);
      }
      return ret;
    }
  }
}, "pipeArguments");
var Prototype = {
  pipe() {
    return pipeArguments(this, arguments);
  }
};
var Class = /* @__PURE__ */ (function() {
  function PipeableBase() {
  }
  __name(PipeableBase, "PipeableBase");
  PipeableBase.prototype = Prototype;
  return PipeableBase;
})();
var dual = /* @__PURE__ */ __name(function(arity, body) {
  if (typeof arity === "function") {
    return function() {
      return arity(arguments) ? body.apply(this, arguments) : (self) => body(self, ...arguments);
    };
  }
  switch (arity) {
    case 0:
    case 1:
      throw new RangeError(`Invalid arity ${arity}`);
    case 2:
      return function(a, b) {
        if (arguments.length >= 2) {
          return body(a, b);
        }
        return function(self) {
          return body(self, a);
        };
      };
    case 3:
      return function(a, b, c) {
        if (arguments.length >= 3) {
          return body(a, b, c);
        }
        return function(self) {
          return body(self, a, b);
        };
      };
    default:
      return function() {
        if (arguments.length >= arity) {
          return body.apply(this, arguments);
        }
        const args2 = arguments;
        return function(self) {
          return body(self, ...args2);
        };
      };
  }
}, "dual");
var identity = /* @__PURE__ */ __name((a) => a, "identity");
var constant = /* @__PURE__ */ __name((value3) => () => value3, "constant");
var constTrue = /* @__PURE__ */ constant(true);
var constFalse = /* @__PURE__ */ constant(false);
var constNull = /* @__PURE__ */ constant(null);
var constUndefined = /* @__PURE__ */ constant(void 0);
var constVoid = constUndefined;
var compose = /* @__PURE__ */ dual(2, (ab, bc) => (a) => bc(ab(a)));
function memoize(f) {
  const cache = /* @__PURE__ */ new WeakMap();
  return (a) => {
    const cached3 = cache.get(a);
    if (cached3 !== void 0)
      return cached3;
    const result3 = f(a);
    cache.set(a, result3);
    return result3;
  };
}
__name(memoize, "memoize");
var getAllObjectKeys = /* @__PURE__ */ __name((obj) => {
  const keys2 = new Set(Reflect.ownKeys(obj));
  if (obj.constructor === Object)
    return keys2;
  if (obj instanceof Error) {
    keys2.delete("stack");
  }
  const proto = Object.getPrototypeOf(obj);
  let current = proto;
  while (current !== null && current !== Object.prototype) {
    const ownKeys = Reflect.ownKeys(current);
    for (let i = 0; i < ownKeys.length; i++) {
      keys2.add(ownKeys[i]);
    }
    current = Object.getPrototypeOf(current);
  }
  if (keys2.has("constructor") && typeof obj.constructor === "function" && proto === obj.constructor.prototype) {
    keys2.delete("constructor");
  }
  return keys2;
}, "getAllObjectKeys");
var byReferenceInstances = /* @__PURE__ */ new WeakSet();
function isString(input) {
  return typeof input === "string";
}
__name(isString, "isString");
function isNumber(input) {
  return typeof input === "number";
}
__name(isNumber, "isNumber");
function isBoolean(input) {
  return typeof input === "boolean";
}
__name(isBoolean, "isBoolean");
function isFunction(input) {
  return typeof input === "function";
}
__name(isFunction, "isFunction");
function isNotUndefined(input) {
  return input !== void 0;
}
__name(isNotUndefined, "isNotUndefined");
function isNotNull(input) {
  return input !== null;
}
__name(isNotNull, "isNotNull");
function isNotNullish(input) {
  return input != null;
}
__name(isNotNullish, "isNotNullish");
function isNever(_) {
  return false;
}
__name(isNever, "isNever");
function isUnknown(_) {
  return true;
}
__name(isUnknown, "isUnknown");
function isObject(input) {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
__name(isObject, "isObject");
function isObjectKeyword(input) {
  return typeof input === "object" && input !== null || isFunction(input);
}
__name(isObjectKeyword, "isObjectKeyword");
var hasProperty = /* @__PURE__ */ dual(2, (self, property) => isObjectKeyword(self) && property in self);
var isTagged = /* @__PURE__ */ dual(2, (self, tag2) => hasProperty(self, "_tag") && self["_tag"] === tag2);
function isError(input) {
  return input instanceof Error;
}
__name(isError, "isError");
function isIterable(input) {
  return hasProperty(input, Symbol.iterator) || isString(input);
}
__name(isIterable, "isIterable");
var symbol = "~effect/interfaces/Hash";
var hash = /* @__PURE__ */ __name((self) => {
  switch (typeof self) {
    case "number":
      return number(self);
    case "bigint":
      return string(self.toString(10));
    case "boolean":
      return string(String(self));
    case "symbol":
      return string(String(self));
    case "string":
      return string(self);
    case "undefined":
      return string("undefined");
    case "function":
    case "object": {
      if (self === null) {
        return string("null");
      } else if (self instanceof Date) {
        if (Number.isNaN(self.getTime())) {
          return string("Invalid Date");
        }
        return string(self.toISOString());
      } else if (self instanceof RegExp) {
        return string(self.toString());
      } else {
        if (byReferenceInstances.has(self)) {
          return random(self);
        }
        if (hashCache.has(self)) {
          return hashCache.get(self);
        }
        const h = withVisitedTracking(self, () => {
          if (isHash(self)) {
            return self[symbol]();
          } else if (typeof self === "function") {
            return random(self);
          } else if (self instanceof DataView) {
            return array(new Uint8Array(self.buffer, self.byteOffset, self.byteLength));
          } else if (Array.isArray(self) || ArrayBuffer.isView(self)) {
            return array(self);
          } else if (self instanceof Map) {
            return hashMap(self);
          } else if (self instanceof Set) {
            return hashSet(self);
          }
          return structure(self);
        });
        hashCache.set(self, h);
        return h;
      }
    }
    default:
      throw new Error(`BUG: unhandled typeof ${typeof self} - please report an issue at https://github.com/Effect-TS/effect/issues`);
  }
}, "hash");
var random = /* @__PURE__ */ __name((self) => {
  if (!randomHashCache.has(self)) {
    randomHashCache.set(self, number(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)));
  }
  return randomHashCache.get(self);
}, "random");
var combine = /* @__PURE__ */ dual(2, (self, b) => self * 53 ^ b);
var optimize = /* @__PURE__ */ __name((n) => n & 3221225471 | n >>> 1 & 1073741824, "optimize");
var isHash = /* @__PURE__ */ __name((u) => hasProperty(u, symbol), "isHash");
var number = /* @__PURE__ */ __name((n) => {
  if (n !== n) {
    return string("NaN");
  }
  if (n === Infinity) {
    return string("Infinity");
  }
  if (n === -Infinity) {
    return string("-Infinity");
  }
  let h = n | 0;
  if (h !== n) {
    h ^= n * 4294967295;
  }
  while (n > 4294967295) {
    h ^= n /= 4294967295;
  }
  return optimize(h);
}, "number");
var string = /* @__PURE__ */ __name((str) => {
  let h = 5381, i = str.length;
  while (i) {
    h = h * 33 ^ str.charCodeAt(--i);
  }
  return optimize(h);
}, "string");
var structureKeys = /* @__PURE__ */ __name((o, keys2) => {
  let h = 12289;
  for (const key of keys2) {
    h ^= combine(hash(key), hash(o[key]));
  }
  return optimize(h);
}, "structureKeys");
var structure = /* @__PURE__ */ __name((o) => structureKeys(o, getAllObjectKeys(o)), "structure");
var iterableWith = /* @__PURE__ */ __name((seed, f) => (iter) => {
  let h = seed;
  for (const element of iter) {
    h ^= f(element);
  }
  return optimize(h);
}, "iterableWith");
var array = /* @__PURE__ */ iterableWith(6151, hash);
var hashMap = /* @__PURE__ */ iterableWith(/* @__PURE__ */ string("Map"), ([k, v]) => combine(hash(k), hash(v)));
var hashSet = /* @__PURE__ */ iterableWith(/* @__PURE__ */ string("Set"), hash);
var randomHashCache = /* @__PURE__ */ new WeakMap();
var hashCache = /* @__PURE__ */ new WeakMap();
var visitedObjects = /* @__PURE__ */ new WeakSet();
function withVisitedTracking(obj, fn) {
  if (visitedObjects.has(obj)) {
    return string("[Circular]");
  }
  visitedObjects.add(obj);
  const result3 = fn();
  visitedObjects.delete(obj);
  return result3;
}
__name(withVisitedTracking, "withVisitedTracking");
var symbol2 = "~effect/interfaces/Equal";
function equals() {
  if (arguments.length === 1) {
    return (self) => compareBoth(self, arguments[0]);
  }
  return compareBoth(arguments[0], arguments[1]);
}
__name(equals, "equals");
function compareBoth(self, that) {
  if (self === that)
    return true;
  if (self == null || that == null)
    return false;
  const selfType = typeof self;
  if (selfType !== typeof that) {
    return false;
  }
  if (selfType === "number" && self !== self && that !== that) {
    return true;
  }
  if (selfType !== "object" && selfType !== "function") {
    return false;
  }
  if (byReferenceInstances.has(self) || byReferenceInstances.has(that)) {
    return false;
  }
  return withCache(self, that, compareObjects);
}
__name(compareBoth, "compareBoth");
function withVisitedTracking2(self, that, fn) {
  const hasLeft = visitedLeft.has(self);
  const hasRight = visitedRight.has(that);
  if (hasLeft && hasRight) {
    return true;
  }
  if (hasLeft || hasRight) {
    return false;
  }
  visitedLeft.add(self);
  visitedRight.add(that);
  const result3 = fn();
  visitedLeft.delete(self);
  visitedRight.delete(that);
  return result3;
}
__name(withVisitedTracking2, "withVisitedTracking2");
var visitedLeft = /* @__PURE__ */ new WeakSet();
var visitedRight = /* @__PURE__ */ new WeakSet();
function compareObjects(self, that) {
  if (hash(self) !== hash(that)) {
    return false;
  } else if (self instanceof Date) {
    if (!(that instanceof Date))
      return false;
    const selfTime = self.getTime();
    const thatTime = that.getTime();
    return selfTime === thatTime || Number.isNaN(selfTime) && Number.isNaN(thatTime);
  } else if (self instanceof RegExp) {
    if (!(that instanceof RegExp))
      return false;
    return self.toString() === that.toString();
  }
  const selfIsEqual = isEqual(self);
  const thatIsEqual = isEqual(that);
  if (selfIsEqual !== thatIsEqual)
    return false;
  const bothEquals = selfIsEqual && thatIsEqual;
  if (typeof self === "function" && !bothEquals) {
    return false;
  }
  return withVisitedTracking2(self, that, () => {
    if (bothEquals) {
      return self[symbol2](that);
    } else if (Array.isArray(self)) {
      if (!Array.isArray(that) || self.length !== that.length) {
        return false;
      }
      return compareArrays(self, that);
    } else if (ArrayBuffer.isView(self)) {
      const selfIsDataView = self instanceof DataView;
      if (!ArrayBuffer.isView(that) || self.byteLength !== that.byteLength || selfIsDataView !== that instanceof DataView) {
        return false;
      }
      if (selfIsDataView) {
        const thatDataView = that;
        return compareTypedArrays(new Uint8Array(self.buffer, self.byteOffset, self.byteLength), new Uint8Array(thatDataView.buffer, thatDataView.byteOffset, thatDataView.byteLength));
      }
      return compareTypedArrays(self, that);
    } else if (self instanceof Map) {
      if (!(that instanceof Map) || self.size !== that.size) {
        return false;
      }
      return compareMaps(self, that);
    } else if (self instanceof Set) {
      if (!(that instanceof Set) || self.size !== that.size) {
        return false;
      }
      return compareSets(self, that);
    }
    return compareRecords(self, that);
  });
}
__name(compareObjects, "compareObjects");
function withCache(self, that, f) {
  let selfMap = equalityCache.get(self);
  if (!selfMap) {
    selfMap = /* @__PURE__ */ new WeakMap();
    equalityCache.set(self, selfMap);
  } else if (selfMap.has(that)) {
    return selfMap.get(that);
  }
  const result3 = f(self, that);
  selfMap.set(that, result3);
  let thatMap = equalityCache.get(that);
  if (!thatMap) {
    thatMap = /* @__PURE__ */ new WeakMap();
    equalityCache.set(that, thatMap);
  }
  thatMap.set(self, result3);
  return result3;
}
__name(withCache, "withCache");
var equalityCache = /* @__PURE__ */ new WeakMap();
function compareArrays(self, that) {
  for (let i = 0; i < self.length; i++) {
    if (!compareBoth(self[i], that[i])) {
      return false;
    }
  }
  return true;
}
__name(compareArrays, "compareArrays");
function compareTypedArrays(self, that) {
  if (self.length !== that.length) {
    return false;
  }
  for (let i = 0; i < self.length; i++) {
    if (self[i] !== that[i]) {
      return false;
    }
  }
  return true;
}
__name(compareTypedArrays, "compareTypedArrays");
function compareRecords(self, that) {
  const selfKeys = getAllObjectKeys(self);
  const thatKeys = getAllObjectKeys(that);
  if (selfKeys.size !== thatKeys.size) {
    return false;
  }
  for (const key of selfKeys) {
    if (!thatKeys.has(key) || !compareBoth(self[key], that[key])) {
      return false;
    }
  }
  return true;
}
__name(compareRecords, "compareRecords");
function makeCompareMap(keyEquivalence, valueEquivalence) {
  return /* @__PURE__ */ __name(function compareMaps2(self, that) {
    const thatEntries = Array.from(that);
    for (const [selfKey, selfValue] of self) {
      let found = false;
      for (let i = 0; i < thatEntries.length; i++) {
        const [thatKey, thatValue] = thatEntries[i];
        if (keyEquivalence(selfKey, thatKey) && valueEquivalence(selfValue, thatValue)) {
          thatEntries[i] = thatEntries[thatEntries.length - 1];
          thatEntries.pop();
          found = true;
          break;
        }
      }
      if (!found) {
        return false;
      }
    }
    return true;
  }, "compareMaps");
}
__name(makeCompareMap, "makeCompareMap");
var compareMaps = /* @__PURE__ */ makeCompareMap(compareBoth, compareBoth);
function makeCompareSet(equivalence) {
  return /* @__PURE__ */ __name(function compareSets2(self, that) {
    const thatValues = Array.from(that);
    for (const selfValue of self) {
      let found = false;
      for (let i = 0; i < thatValues.length; i++) {
        const thatValue = thatValues[i];
        if (equivalence(selfValue, thatValue)) {
          thatValues[i] = thatValues[thatValues.length - 1];
          thatValues.pop();
          found = true;
          break;
        }
      }
      if (!found) {
        return false;
      }
    }
    return true;
  }, "compareSets");
}
__name(makeCompareSet, "makeCompareSet");
var compareSets = /* @__PURE__ */ makeCompareSet(compareBoth);
var isEqual = /* @__PURE__ */ __name((u) => hasProperty(u, symbol2), "isEqual");
var symbolRedactable = /* @__PURE__ */ Symbol.for("~effect/Redactable");
var isRedactable = /* @__PURE__ */ __name((u) => hasProperty(u, symbolRedactable), "isRedactable");
function redact(u) {
  if (isRedactable(u))
    return getRedacted(u);
  return u;
}
__name(redact, "redact");
function getRedacted(redactable) {
  return redactable[symbolRedactable](globalThis[currentFiberTypeId]?.context ?? emptyContext);
}
__name(getRedacted, "getRedacted");
var currentFiberTypeId = "~effect/Fiber/currentFiber";
var emptyMap = /* @__PURE__ */ new Map();
var emptyContext = {
  "~effect/Context": {},
  base: emptyMap,
  depth: 0,
  mapUnsafe: emptyMap,
  pipe() {
    return pipeArguments(this, arguments);
  }
};
function format(input, options) {
  const space = options?.space ?? 0;
  const ancestors = /* @__PURE__ */ new WeakSet();
  const gap = !space ? "" : typeof space === "number" ? " ".repeat(space) : space;
  const ind = /* @__PURE__ */ __name((d) => gap.repeat(d), "ind");
  const wrap = /* @__PURE__ */ __name((v, body) => {
    const ctor = v?.constructor;
    return ctor && ctor !== Object.prototype.constructor && ctor.name ? `${ctor.name}(${body})` : body;
  }, "wrap");
  const ownKeys = /* @__PURE__ */ __name((o) => {
    try {
      return Reflect.ownKeys(o);
    } catch {
      return ["[ownKeys threw]"];
    }
  }, "ownKeys");
  function recur(v, d = 0) {
    if (Array.isArray(v)) {
      if (ancestors.has(v))
        return CIRCULAR;
      ancestors.add(v);
      const output = !gap || v.length <= 1 ? `[${v.map((x) => recur(x, d)).join(",")}]` : `[
${ind(d + 1)}${v.map((x) => recur(x, d + 1)).join(`,
` + ind(d + 1))}
${ind(d)}]`;
      ancestors.delete(v);
      return output;
    }
    if (v instanceof Date)
      return formatDate(v);
    if (!options?.ignoreToString && hasProperty(v, "toString") && typeof v["toString"] === "function" && v["toString"] !== Object.prototype.toString && v["toString"] !== Array.prototype.toString) {
      const s = safeToString(v);
      if (v instanceof Error && v.cause) {
        return `${s} (cause: ${recur(v.cause, d)})`;
      }
      return s;
    }
    if (typeof v === "string")
      return JSON.stringify(v);
    if (typeof v === "number" || v == null || typeof v === "boolean" || typeof v === "symbol")
      return String(v);
    if (typeof v === "bigint")
      return String(v) + "n";
    if (typeof v === "object" || typeof v === "function") {
      if (ancestors.has(v))
        return CIRCULAR;
      ancestors.add(v);
      let output;
      if (symbolRedactable in v) {
        output = format(getRedacted(v));
      } else if (Symbol.iterator in v) {
        output = `${v.constructor.name}(${recur(Array.from(v), d)})`;
      } else {
        const keys2 = ownKeys(v);
        if (!gap || keys2.length <= 1) {
          const body = `{${keys2.map((k) => `${formatPropertyKey(k)}:${recur(v[k], d)}`).join(",")}}`;
          output = wrap(v, body);
        } else {
          const body = `{
${keys2.map((k) => `${ind(d + 1)}${formatPropertyKey(k)}: ${recur(v[k], d + 1)}`).join(`,
`)}
${ind(d)}}`;
          output = wrap(v, body);
        }
      }
      ancestors.delete(v);
      return output;
    }
    return String(v);
  }
  __name(recur, "recur");
  return recur(input, 0);
}
__name(format, "format");
var CIRCULAR = "[Circular]";
function formatPropertyKey(name) {
  return typeof name === "string" ? JSON.stringify(name) : String(name);
}
__name(formatPropertyKey, "formatPropertyKey");
function formatPath(path) {
  return path.map((key) => `[${formatPropertyKey(key)}]`).join("");
}
__name(formatPath, "formatPath");
function formatDate(date) {
  try {
    return date.toISOString();
  } catch {
    return "Invalid Date";
  }
}
__name(formatDate, "formatDate");
function safeToString(input) {
  try {
    const s = input.toString();
    return typeof s === "string" ? s : String(s);
  } catch {
    return "[toString threw]";
  }
}
__name(safeToString, "safeToString");
function formatJson(input, options) {
  const ancestors = [];
  return JSON.stringify(input, function(_key, value3) {
    const redacted = redact(value3);
    if (typeof redacted !== "object" || redacted === null) {
      return redacted;
    }
    while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) {
      ancestors.pop();
    }
    if (ancestors.includes(redacted)) {
      return;
    }
    ancestors.push(redacted);
    return redacted;
  }, options?.space) ?? "null";
}
__name(formatJson, "formatJson");
var NodeInspectSymbol = /* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom");
var toJson = /* @__PURE__ */ __name((input) => {
  try {
    if (hasProperty(input, "toJSON") && isFunction(input["toJSON"]) && input["toJSON"].length === 0) {
      return input.toJSON();
    } else if (Array.isArray(input)) {
      return input.map(toJson);
    }
  } catch {
    return "[toJSON threw]";
  }
  return redact(input);
}, "toJson");
var toStringUnknown = /* @__PURE__ */ __name((u, whitespace = 2) => {
  if (typeof u === "string") {
    return u;
  }
  try {
    return typeof u === "object" ? formatJson(u, {
      space: whitespace
    }) : String(u);
  } catch {
    return String(u);
  }
}, "toStringUnknown");
var BaseProto = {
  toJSON() {
    return toJson(this);
  },
  [NodeInspectSymbol]() {
    return this.toJSON();
  },
  toString() {
    return format(this.toJSON());
  }
};
var Class2 = class {
  static {
    __name(this, "Class2");
  }
  [NodeInspectSymbol]() {
    return this.toJSON();
  }
  toString() {
    return format(this.toJSON());
  }
};
var SingleShotGen = class _SingleShotGen {
  static {
    __name(this, "SingleShotGen");
  }
  called = false;
  self;
  constructor(self) {
    this.self = self;
  }
  next(a) {
    return this.called ? {
      value: a,
      done: true
    } : (this.called = true, {
      value: this.self,
      done: false
    });
  }
  [Symbol.iterator]() {
    return new _SingleShotGen(this.self);
  }
};
var pickInternalCall = /* @__PURE__ */ __name(() => {
  const InternalTypeId = "~effect/Utils/internal";
  const standard = {
    [InternalTypeId]: (body) => {
      return body();
    }
  };
  const forced = {
    [InternalTypeId]: (body) => {
      try {
        return body();
      } finally {
      }
    }
  };
  const isNotOptimizedAway = standard[InternalTypeId](() => new Error().stack)?.includes(InternalTypeId) === true;
  return isNotOptimizedAway ? standard[InternalTypeId] : forced[InternalTypeId];
}, "pickInternalCall");
var internalCall = /* @__PURE__ */ pickInternalCall();
function assignProperty(self, key, value3) {
  if (key === "__proto__") {
    Object.defineProperty(self, key, {
      value: value3,
      writable: true,
      enumerable: true,
      configurable: true
    });
  } else {
    self[key] = value3;
  }
}
__name(assignProperty, "assignProperty");
function assignProperties(self, source) {
  for (const key of Reflect.ownKeys(source)) {
    if (Object.prototype.propertyIsEnumerable.call(source, key)) {
      assignProperty(self, key, source[key]);
    }
  }
}
__name(assignProperties, "assignProperties");
var EffectTypeId = `~effect/Effect`;
var ExitTypeId = `~effect/Exit`;
var effectVariance = {
  _A: identity,
  _E: identity,
  _R: identity
};
var identifier = `${EffectTypeId}/identifier`;
var args = `${EffectTypeId}/args`;
var evaluate = `${EffectTypeId}/evaluate`;
var contA = `${EffectTypeId}/successCont`;
var contE = `${EffectTypeId}/failureCont`;
var contAll = `${EffectTypeId}/ensureCont`;
var Yield = /* @__PURE__ */ Symbol.for("effect/Effect/Yield");
var PipeInspectableProto = {
  pipe() {
    return pipeArguments(this, arguments);
  },
  toJSON() {
    return {
      ...this
    };
  },
  toString() {
    return format(this.toJSON(), {
      ignoreToString: true,
      space: 2
    });
  },
  [NodeInspectSymbol]() {
    return this.toJSON();
  }
};
var StructuralProto = {
  [symbol]() {
    return structureKeys(this, Object.keys(this));
  },
  [symbol2](that) {
    const selfKeys = Object.keys(this);
    const thatKeys = Object.keys(that);
    if (selfKeys.length !== thatKeys.length)
      return false;
    for (let i = 0; i < selfKeys.length; i++) {
      if (selfKeys[i] !== thatKeys[i] || !equals(this[selfKeys[i]], that[selfKeys[i]])) {
        return false;
      }
    }
    return true;
  }
};
var EffectProto = {
  [EffectTypeId]: effectVariance,
  ...PipeInspectableProto,
  [Symbol.iterator]() {
    return new SingleShotGen(this);
  },
  toJSON() {
    return {
      _id: "Effect",
      op: this[identifier],
      ...args in this ? {
        args: this[args]
      } : void 0
    };
  }
};
var isEffect = /* @__PURE__ */ __name((u) => hasProperty(u, EffectTypeId), "isEffect");
var isExit = /* @__PURE__ */ __name((u) => hasProperty(u, ExitTypeId), "isExit");
var CauseTypeId = "~effect/Cause";
var CauseReasonTypeId = "~effect/Cause/Reason";
var isCause = /* @__PURE__ */ __name((self) => hasProperty(self, CauseTypeId), "isCause");
var isCauseReason = /* @__PURE__ */ __name((self) => hasProperty(self, CauseReasonTypeId), "isCauseReason");
var CauseImpl = class {
  static {
    __name(this, "CauseImpl");
  }
  [CauseTypeId];
  reasons;
  constructor(failures) {
    this[CauseTypeId] = CauseTypeId;
    this.reasons = failures;
  }
  pipe() {
    return pipeArguments(this, arguments);
  }
  toJSON() {
    return {
      _id: "Cause",
      failures: this.reasons.map((f) => f.toJSON())
    };
  }
  toString() {
    return `Cause(${format(this.reasons)})`;
  }
  [NodeInspectSymbol]() {
    return this.toJSON();
  }
  [symbol2](that) {
    return isCause(that) && this.reasons.length === that.reasons.length && this.reasons.every((e, i) => equals(e, that.reasons[i]));
  }
  [symbol]() {
    return array(this.reasons);
  }
};
var annotationsMap = /* @__PURE__ */ new WeakMap();
var ReasonBase = class {
  static {
    __name(this, "ReasonBase");
  }
  [CauseReasonTypeId];
  annotations;
  _tag;
  constructor(_tag, annotations, originalError) {
    this[CauseReasonTypeId] = CauseReasonTypeId;
    this._tag = _tag;
    if (annotations !== constEmptyAnnotations && typeof originalError === "object" && originalError !== null && annotations.size > 0) {
      const prevAnnotations = annotationsMap.get(originalError);
      if (prevAnnotations) {
        annotations = new Map([...prevAnnotations, ...annotations]);
      }
      annotationsMap.set(originalError, annotations);
    }
    this.annotations = annotations;
  }
  annotate(annotations, options) {
    if (annotations.mapUnsafe.size === 0)
      return this;
    const newAnnotations = new Map(this.annotations);
    annotations.mapUnsafe.forEach((value3, key) => {
      if (options?.overwrite !== true && newAnnotations.has(key))
        return;
      newAnnotations.set(key, value3);
    });
    const self = Object.assign(Object.create(Object.getPrototypeOf(this)), this);
    self.annotations = newAnnotations;
    return self;
  }
  pipe() {
    return pipeArguments(this, arguments);
  }
  toString() {
    return format(this);
  }
  [NodeInspectSymbol]() {
    return this.toString();
  }
};
var constEmptyAnnotations = /* @__PURE__ */ new Map();
var Fail = class extends ReasonBase {
  static {
    __name(this, "Fail");
  }
  error;
  constructor(error, annotations = constEmptyAnnotations) {
    super("Fail", annotations, error);
    this.error = error;
  }
  toString() {
    return `Fail(${format(this.error)})`;
  }
  toJSON() {
    return {
      _tag: "Fail",
      error: this.error
    };
  }
  [symbol2](that) {
    return isFailReason(that) && equals(this.error, that.error) && equals(this.annotations, that.annotations);
  }
  [symbol]() {
    return combine(string(this._tag))(combine(hash(this.error))(hash(this.annotations)));
  }
};
var causeFromReasons = /* @__PURE__ */ __name((reasons) => new CauseImpl(reasons), "causeFromReasons");
var causeEmpty = /* @__PURE__ */ new CauseImpl([]);
var causeFail = /* @__PURE__ */ __name((error) => new CauseImpl([new Fail(error)]), "causeFail");
var Die = class extends ReasonBase {
  static {
    __name(this, "Die");
  }
  defect;
  constructor(defect, annotations = constEmptyAnnotations) {
    super("Die", annotations, defect);
    this.defect = defect;
  }
  toString() {
    return `Die(${format(this.defect)})`;
  }
  toJSON() {
    return {
      _tag: "Die",
      defect: this.defect
    };
  }
  [symbol2](that) {
    return isDieReason(that) && equals(this.defect, that.defect) && equals(this.annotations, that.annotations);
  }
  [symbol]() {
    return combine(string(this._tag))(combine(hash(this.defect))(hash(this.annotations)));
  }
};
var causeDie = /* @__PURE__ */ __name((defect) => new CauseImpl([new Die(defect)]), "causeDie");
var causeAnnotate = /* @__PURE__ */ dual((args2) => isCause(args2[0]), (self, annotations, options) => {
  if (annotations.mapUnsafe.size === 0)
    return self;
  return new CauseImpl(self.reasons.map((f) => f.annotate(annotations, options)));
});
var isFailReason = /* @__PURE__ */ __name((self) => self._tag === "Fail", "isFailReason");
var isDieReason = /* @__PURE__ */ __name((self) => self._tag === "Die", "isDieReason");
var isInterruptReason = /* @__PURE__ */ __name((self) => self._tag === "Interrupt", "isInterruptReason");
function defaultEvaluate(_fiber) {
  return exitDie(`Effect.evaluate: Not implemented`);
}
__name(defaultEvaluate, "defaultEvaluate");
var makePrimitiveProto = /* @__PURE__ */ __name((options) => ({
  ...EffectProto,
  [identifier]: options.op,
  [evaluate]: options[evaluate] ?? defaultEvaluate,
  [contA]: options[contA],
  [contE]: options[contE],
  [contAll]: options[contAll]
}), "makePrimitiveProto");
var makePrimitive = /* @__PURE__ */ __name((options) => {
  const Proto13 = makePrimitiveProto(options);
  return function() {
    const self = Object.create(Proto13);
    self[args] = options.single === false ? arguments : arguments[0];
    return self;
  };
}, "makePrimitive");
var makeExit = /* @__PURE__ */ __name((options) => {
  const Proto13 = {
    [ExitTypeId]: ExitTypeId,
    _tag: options.op,
    get [options.prop]() {
      return this[args];
    },
    ...makePrimitiveProto(options),
    toString() {
      return `${options.op}(${format(this[args])})`;
    },
    toJSON() {
      return {
        _id: "Exit",
        _tag: options.op,
        [options.prop]: this[args]
      };
    },
    [symbol2](that) {
      return isExit(that) && that._tag === this._tag && equals(this[args], that[args]);
    },
    [symbol]() {
      return combine(string(options.op), hash(this[args]));
    }
  };
  return function(value3) {
    const self = Object.create(Proto13);
    self[args] = value3;
    return self;
  };
}, "makeExit");
var exitSucceed = /* @__PURE__ */ makeExit({
  op: "Success",
  prop: "value",
  [evaluate](fiber) {
    const cont = fiber.getCont(contA);
    return cont ? cont[contA](this[args], fiber, this) : fiber.yieldWith(this);
  }
});
var StackTraceKey = {
  key: "effect/Cause/StackTrace"
};
var InterruptorStackTrace = {
  key: "effect/Cause/InterruptorStackTrace"
};
var exitFailCause = /* @__PURE__ */ makeExit({
  op: "Failure",
  prop: "cause",
  [evaluate](fiber) {
    let cause = this[args];
    let annotated = false;
    if (fiber.currentStackFrame) {
      cause = causeAnnotate(cause, {
        mapUnsafe: /* @__PURE__ */ new Map([[StackTraceKey.key, fiber.currentStackFrame]])
      });
      annotated = true;
    }
    let cont = fiber.getCont(contE);
    while (fiber.interruptible && fiber._interruptedCause && cont) {
      cont = fiber.getCont(contE);
    }
    return cont ? cont[contE](cause, fiber, annotated ? void 0 : this) : fiber.yieldWith(annotated ? exitFailCause(cause) : this);
  }
});
var exitFail = /* @__PURE__ */ __name((e) => exitFailCause(causeFail(e)), "exitFail");
var exitDie = /* @__PURE__ */ __name((defect) => exitFailCause(causeDie(defect)), "exitDie");
var withFiber = /* @__PURE__ */ makePrimitive({
  op: "WithFiber",
  [evaluate](fiber) {
    return this[args](fiber);
  }
});
var YieldableError = /* @__PURE__ */ (function() {
  class YieldableError2 extends globalThis.Error {
    static {
      __name(this, "YieldableError2");
    }
  }
  const proto = /* @__PURE__ */ makePrimitiveProto({
    op: "YieldableError",
    [evaluate]() {
      return exitFail(this);
    }
  });
  delete proto.toString;
  Object.assign(YieldableError2.prototype, proto);
  return YieldableError2;
})();
var Error2 = /* @__PURE__ */ (function() {
  const plainArgsSymbol = /* @__PURE__ */ Symbol.for("effect/Data/Error/plainArgs");
  return class Base extends YieldableError {
    static {
      __name(this, "Base");
    }
    constructor(args2) {
      super(args2?.message, args2?.cause ? {
        cause: args2.cause
      } : void 0);
      if (args2) {
        assignProperties(this, args2);
        Object.defineProperty(this, plainArgsSymbol, {
          value: args2,
          enumerable: false
        });
      }
    }
    toJSON() {
      return {
        ...this[plainArgsSymbol],
        ...this
      };
    }
  };
})();
var TaggedError = /* @__PURE__ */ __name((tag2) => {
  class Base3 extends Error2 {
    static {
      __name(this, "Base");
    }
    _tag = tag2;
  }
  Base3.prototype.name = tag2;
  return Base3;
}, "TaggedError");
var NoSuchElementErrorTypeId = "~effect/Cause/NoSuchElementError";
var isNoSuchElementError = /* @__PURE__ */ __name((u) => hasProperty(u, NoSuchElementErrorTypeId), "isNoSuchElementError");
var DoneTypeId = "~effect/Cause/Done";
var isDone = /* @__PURE__ */ __name((u) => hasProperty(u, DoneTypeId), "isDone");
var DoneVoid = {
  [DoneTypeId]: DoneTypeId,
  _tag: "Done",
  value: void 0
};
var Done = /* @__PURE__ */ __name((value3) => {
  if (value3 === void 0)
    return DoneVoid;
  return {
    [DoneTypeId]: DoneTypeId,
    _tag: "Done",
    value: value3
  };
}, "Done");
var doneVoid = /* @__PURE__ */ exitFail(DoneVoid);
var done = /* @__PURE__ */ __name((value3) => {
  if (value3 === void 0)
    return doneVoid;
  return exitFail(Done(value3));
}, "done");
var Prototype2 = /* @__PURE__ */ __name((options) => makePrimitiveProto({
  op: options.label,
  [evaluate]: options.evaluate
}), "Prototype2");
var isStackTraceLimitWritable = /* @__PURE__ */ __name(() => {
  const desc = Object.getOwnPropertyDescriptor(Error, "stackTraceLimit");
  if (desc === void 0) {
    return Object.isExtensible(Error);
  }
  return Object.hasOwn(desc, "writable") ? desc.writable === true : desc.set !== void 0;
}, "isStackTraceLimitWritable");
var canWriteStackTraceLimit = /* @__PURE__ */ isStackTraceLimitWritable();
var getStackTraceLimit = /* @__PURE__ */ __name(() => Error.stackTraceLimit, "getStackTraceLimit");
var setStackTraceLimit = /* @__PURE__ */ __name((value3) => {
  if (canWriteStackTraceLimit) {
    Error.stackTraceLimit = value3;
  }
}, "setStackTraceLimit");
var make = /* @__PURE__ */ __name((isEquivalent) => (self, that) => self === that || isEquivalent(self, that), "make");
var isStrictEquivalent = /* @__PURE__ */ __name((x, y) => x === y, "isStrictEquivalent");
var strictEqual = /* @__PURE__ */ __name(() => isStrictEquivalent, "strictEqual");
function Tuple(elements) {
  return make((self, that) => {
    if (self.length !== that.length) {
      return false;
    }
    for (let i = 0; i < self.length; i++) {
      if (!elements[i](self[i], that[i])) {
        return false;
      }
    }
    return true;
  });
}
__name(Tuple, "Tuple");
function Array_(item) {
  return make((self, that) => {
    if (self.length !== that.length)
      return false;
    for (let i = 0; i < self.length; i++) {
      if (!item(self[i], that[i]))
        return false;
    }
    return true;
  });
}
__name(Array_, "Array_");
var TypeId = "~effect/data/Option";
var CommonProto = {
  [TypeId]: {
    _A: /* @__PURE__ */ __name((_) => _, "_A")
  },
  ...PipeInspectableProto,
  [Symbol.iterator]() {
    return new SingleShotGen(this);
  }
};
var SomeProto = /* @__PURE__ */ Object.defineProperty(/* @__PURE__ */ Object.assign(/* @__PURE__ */ Object.create(CommonProto), {
  _tag: "Some",
  _op: "Some",
  [symbol2](that) {
    return isOption(that) && isSome(that) && equals(this.value, that.value);
  },
  [symbol]() {
    return combine(hash(this._tag))(hash(this.value));
  },
  toString() {
    return `some(${format(this.value)})`;
  },
  toJSON() {
    return {
      _id: "Option",
      _tag: this._tag,
      value: toJson(this.value)
    };
  }
}), "valueOrUndefined", {
  get() {
    return this.value;
  }
});
var NoneHash = /* @__PURE__ */ hash("None");
var NoneProto = /* @__PURE__ */ Object.assign(/* @__PURE__ */ Object.create(CommonProto), {
  _tag: "None",
  _op: "None",
  valueOrUndefined: void 0,
  [symbol2](that) {
    return isOption(that) && isNone(that);
  },
  [symbol]() {
    return NoneHash;
  },
  toString() {
    return `none()`;
  },
  toJSON() {
    return {
      _id: "Option",
      _tag: this._tag
    };
  }
});
var isOption = /* @__PURE__ */ __name((input) => hasProperty(input, TypeId), "isOption");
var isNone = /* @__PURE__ */ __name((fa) => fa._tag === "None", "isNone");
var isSome = /* @__PURE__ */ __name((fa) => fa._tag === "Some", "isSome");
var none = /* @__PURE__ */ Object.create(NoneProto);
var some = /* @__PURE__ */ __name((value3) => {
  const a = Object.create(SomeProto);
  a.value = value3;
  return a;
}, "some");
var TypeId2 = "~effect/data/Result";
var CommonProto2 = {
  [TypeId2]: {
    _A: /* @__PURE__ */ __name((_) => _, "_A"),
    _E: /* @__PURE__ */ __name((_) => _, "_E")
  },
  ...PipeInspectableProto,
  [Symbol.iterator]() {
    return new SingleShotGen(this);
  }
};
var SuccessProto = /* @__PURE__ */ Object.assign(/* @__PURE__ */ Object.create(CommonProto2), {
  _tag: "Success",
  _op: "Success",
  [symbol2](that) {
    return isResult(that) && isSuccess(that) && equals(this.success, that.success);
  },
  [symbol]() {
    return combine(hash(this._tag))(hash(this.success));
  },
  toString() {
    return `success(${format(this.success)})`;
  },
  toJSON() {
    return {
      _id: "Result",
      _tag: this._tag,
      value: toJson(this.success)
    };
  }
});
var FailureProto = /* @__PURE__ */ Object.assign(/* @__PURE__ */ Object.create(CommonProto2), {
  _tag: "Failure",
  _op: "Failure",
  [symbol2](that) {
    return isResult(that) && isFailure(that) && equals(this.failure, that.failure);
  },
  [symbol]() {
    return combine(hash(this._tag))(hash(this.failure));
  },
  toString() {
    return `failure(${format(this.failure)})`;
  },
  toJSON() {
    return {
      _id: "Result",
      _tag: this._tag,
      failure: toJson(this.failure)
    };
  }
});
var isResult = /* @__PURE__ */ __name((input) => hasProperty(input, TypeId2), "isResult");
var isFailure = /* @__PURE__ */ __name((result3) => result3._tag === "Failure", "isFailure");
var isSuccess = /* @__PURE__ */ __name((result3) => result3._tag === "Success", "isSuccess");
var fail = /* @__PURE__ */ __name((failure) => {
  const a = Object.create(FailureProto);
  a.failure = failure;
  return a;
}, "fail");
var succeed = /* @__PURE__ */ __name((success) => {
  const a = Object.create(SuccessProto);
  a.success = success;
  return a;
}, "succeed");
function make2(compare) {
  return (self, that) => self === that ? 0 : compare(self, that);
}
__name(make2, "make2");
var Number2 = /* @__PURE__ */ make2((self, that) => {
  if (globalThis.Number.isNaN(self) && globalThis.Number.isNaN(that))
    return 0;
  if (globalThis.Number.isNaN(self))
    return -1;
  if (globalThis.Number.isNaN(that))
    return 1;
  return self < that ? -1 : 1;
});
var mapInput = /* @__PURE__ */ dual(2, (self, f) => make2((b1, b2) => self(f(b1), f(b2))));
var isGreaterThan = /* @__PURE__ */ __name((O) => dual(2, (self, that) => O(self, that) === 1), "isGreaterThan");
var none2 = /* @__PURE__ */ __name(() => none, "none2");
var some2 = some;
var isOption2 = isOption;
var isNone2 = isNone;
var isSome2 = isSome;
var match = /* @__PURE__ */ dual(2, (self, {
  onNone,
  onSome: onSome2
}) => isNone2(self) ? onNone() : onSome2(self.value));
var getOrElse = /* @__PURE__ */ dual(2, (self, onNone) => isNone2(self) ? onNone() : self.value);
var fromUndefinedOr = /* @__PURE__ */ __name((a) => a === void 0 ? none2() : some2(a), "fromUndefinedOr");
var fromNullOr = /* @__PURE__ */ __name((a) => a === null ? none2() : some2(a), "fromNullOr");
var getOrNull = /* @__PURE__ */ getOrElse(constNull);
var getOrUndefined = /* @__PURE__ */ getOrElse(constUndefined);
var liftThrowable = /* @__PURE__ */ __name((f) => (...a) => {
  try {
    return some2(f(...a));
  } catch {
    return none2();
  }
}, "liftThrowable");
var map = /* @__PURE__ */ dual(2, (self, f) => isNone2(self) ? none2() : some2(f(self.value)));
var flatMap = /* @__PURE__ */ dual(2, (self, f) => isNone2(self) ? none2() : f(self.value));
var flatten = /* @__PURE__ */ flatMap(identity);
var filter = /* @__PURE__ */ dual(2, (self, predicate) => isNone2(self) ? none2() : predicate(self.value) ? some2(self.value) : none2());
var makeEquivalence = /* @__PURE__ */ __name((isEquivalent) => make((x, y) => isNone2(x) ? isNone2(y) : isNone2(y) ? false : isEquivalent(x.value, y.value)), "makeEquivalence");
var ServiceTypeId = "~effect/Context/Service";
var Service = /* @__PURE__ */ __name(function() {
  const prevLimit = getStackTraceLimit();
  setStackTraceLimit(2);
  const err = new Error();
  setStackTraceLimit(prevLimit);
  function KeyClass() {
  }
  __name(KeyClass, "KeyClass");
  const self = KeyClass;
  Object.setPrototypeOf(self, ServiceProto);
  Object.defineProperty(self, "stack", {
    get() {
      return err.stack;
    }
  });
  const init = /* @__PURE__ */ __name((key, options) => {
    self.key = key;
    if (options?.defaultValue) {
      self[ReferenceTypeId] = ReferenceTypeId;
      self.defaultValue = options.defaultValue;
    }
    if (options?.make) {
      self.make = options.make;
    }
    if (options?.fiberCached) {
      cacheKeys.add(key);
    }
    return self;
  }, "init");
  return arguments.length > 0 ? init(arguments[0], arguments[1]) : init;
}, "Service");
var ServiceProto = {
  [ServiceTypeId]: ServiceTypeId,
  .../* @__PURE__ */ Prototype2({
    label: "Service",
    evaluate(fiber) {
      return exitSucceed(get(fiber.context, this));
    }
  }),
  toJSON() {
    return {
      _id: "Service",
      key: this.key,
      stack: this.stack
    };
  },
  of(self) {
    return self;
  },
  context(self) {
    return make3(this, self);
  },
  use(f) {
    return withFiber((fiber) => f(get(fiber.context, this)));
  },
  useSync(f) {
    return withFiber((fiber) => exitSucceed(f(get(fiber.context, this))));
  }
};
var cacheKeys = /* @__PURE__ */ new Set();
var ReferenceTypeId = "~effect/Context/Reference";
var TypeId3 = "~effect/Context";
var MaxDepth = 8;
var FlattenAfterBaseHits = 8;
var makeImpl = /* @__PURE__ */ __name((cacheRoot, base, overlay, depth) => {
  const self = Object.create(Proto);
  self.cacheRoot = cacheRoot ?? self;
  self.base = base;
  self.overlay = overlay;
  self.depth = depth;
  self._flat = void 0;
  self.baseHits = 0;
  return self;
}, "makeImpl");
var applyOverlays = /* @__PURE__ */ __name((map22, overlay) => {
  if (!overlay)
    return;
  applyOverlays(map22, overlay.parent);
  map22.set(overlay.key, overlay.value);
}, "applyOverlays");
var flatten2 = /* @__PURE__ */ __name((self) => {
  if (self._flat)
    return self._flat;
  if (!self.overlay)
    return self._flat = self.base;
  const map22 = new Map(self.base);
  applyOverlays(map22, self.overlay);
  return self._flat = map22;
}, "flatten2");
var withFlat = /* @__PURE__ */ __name((self, f) => {
  const map22 = new Map(self.mapUnsafe);
  f(map22);
  return makeUnsafe(map22);
}, "withFlat");
var notFound = /* @__PURE__ */ Symbol();
var lookup = /* @__PURE__ */ __name((self, key) => {
  const impl = self;
  for (let overlay = impl.overlay; overlay; overlay = overlay.parent) {
    if (overlay.key === key)
      return overlay.value;
  }
  const value3 = impl.base.get(key);
  if (value3 === void 0 && !impl.base.has(key))
    return notFound;
  if (impl.overlay && ++impl.baseHits >= FlattenAfterBaseHits) {
    impl.base = flatten2(impl);
    impl.overlay = void 0;
    impl.depth = 0;
  }
  return value3;
}, "lookup");
var makeUnsafe = /* @__PURE__ */ __name((mapUnsafe) => makeImpl(void 0, mapUnsafe, void 0, 0), "makeUnsafe");
var Proto = {
  ...PipeInspectableProto,
  [TypeId3]: {
    _Services: /* @__PURE__ */ __name((_) => _, "_Services")
  },
  get mapUnsafe() {
    return flatten2(this);
  },
  toJSON() {
    return {
      _id: "Context",
      services: Array.from(this.mapUnsafe).map(([key, value3]) => ({
        key,
        value: value3
      }))
    };
  },
  [symbol2](that) {
    if (!isContext(that))
      return false;
    const self = this.mapUnsafe;
    const other = that.mapUnsafe;
    if (self.size !== other.size)
      return false;
    for (const [key, value3] of self) {
      if (!other.has(key) || !equals(value3, other.get(key)))
        return false;
    }
    return true;
  },
  [symbol]() {
    return number(this.mapUnsafe.size);
  }
};
var hasSameCache = /* @__PURE__ */ __name((self, that) => self.cacheRoot === that.cacheRoot, "hasSameCache");
var isContext = /* @__PURE__ */ __name((u) => hasProperty(u, TypeId3), "isContext");
var isReference = /* @__PURE__ */ __name((u) => !!u[ReferenceTypeId], "isReference");
var empty = /* @__PURE__ */ __name(() => emptyContext2, "empty");
var emptyContext2 = /* @__PURE__ */ makeUnsafe(/* @__PURE__ */ new Map());
var make3 = /* @__PURE__ */ __name((key, service) => makeUnsafe(/* @__PURE__ */ new Map([[key.key, service]])), "make3");
var add = /* @__PURE__ */ dual(3, (self, key, service) => {
  const impl = self;
  const cacheRoot = cacheKeys.has(key.key) ? void 0 : impl.cacheRoot;
  if (impl.depth >= MaxDepth) {
    const map22 = new Map(impl.mapUnsafe);
    map22.set(key.key, service);
    return makeImpl(cacheRoot, map22, void 0, 0);
  }
  return makeImpl(cacheRoot, impl.base, {
    key: key.key,
    value: service,
    parent: impl.overlay
  }, impl.depth + 1);
});
var getOrElse2 = /* @__PURE__ */ dual(3, (self, key, orElse) => {
  const value3 = lookup(self, key.key);
  if (value3 !== notFound)
    return value3;
  return isReference(key) ? getDefaultValue(key) : orElse();
});
var getOrUndefined2 = /* @__PURE__ */ dual(2, (self, key) => getOrUndefinedUnsafe(self, key.key));
var getOrUndefinedUnsafe = /* @__PURE__ */ __name((self, key) => {
  const value3 = lookup(self, key);
  return value3 === notFound ? void 0 : value3;
}, "getOrUndefinedUnsafe");
var getUnsafe = /* @__PURE__ */ dual(2, (self, service) => {
  const value3 = lookup(self, service.key);
  if (value3 === notFound) {
    if (isReference(service))
      return getDefaultValue(service);
    throw serviceNotFoundError(service);
  }
  return value3;
});
var get = getUnsafe;
var defaultValueCacheKey = "~effect/Context/defaultValue";
var getDefaultValue = /* @__PURE__ */ __name((ref) => {
  if (defaultValueCacheKey in ref) {
    return ref[defaultValueCacheKey];
  }
  return ref[defaultValueCacheKey] = ref.defaultValue();
}, "getDefaultValue");
var serviceNotFoundError = /* @__PURE__ */ __name((service) => {
  const error = new Error(`Service not found${service.key ? `: ${String(service.key)}` : ""}`);
  if (service.stack) {
    const lines = service.stack.split(`
`);
    if (lines.length > 2) {
      const afterAt = lines[2].match(/at (.*)/);
      if (afterAt) {
        error.message = error.message + ` (defined at ${afterAt[1]})`;
      }
    }
  }
  if (error.stack) {
    const lines = error.stack.split(`
`);
    lines.splice(1, 3);
    error.stack = lines.join(`
`);
  }
  return error;
}, "serviceNotFoundError");
var getOption = /* @__PURE__ */ dual(2, (self, service) => {
  const value3 = lookup(self, service.key);
  if (value3 !== notFound)
    return some2(value3);
  return isReference(service) ? some2(getDefaultValue(service)) : none2();
});
var merge = /* @__PURE__ */ dual(2, (self, that) => {
  if (self.mapUnsafe.size === 0)
    return that;
  if (that.mapUnsafe.size === 0)
    return self;
  return withFlat(self, (map22) => that.mapUnsafe.forEach((value3, key) => map22.set(key, value3)));
});
var mergeAll = /* @__PURE__ */ __name((...ctxs) => {
  const map22 = /* @__PURE__ */ new Map();
  for (let i = 0; i < ctxs.length; i++) {
    ctxs[i].mapUnsafe.forEach((value3, key) => {
      map22.set(key, value3);
    });
  }
  return makeUnsafe(map22);
}, "mergeAll");
var omit = /* @__PURE__ */ __name((...keys2) => (self) => withFlat(self, (map22) => {
  for (let i = 0; i < keys2.length; i++) {
    map22.delete(keys2[i].key);
  }
}), "omit");
var Reference = Service;
var isArrayNonEmpty = /* @__PURE__ */ __name((self) => self.length > 0, "isArrayNonEmpty");
var succeed2 = succeed;
var fail2 = fail;
var isFailure2 = isFailure;
var isSuccess2 = isSuccess;
var map2 = /* @__PURE__ */ dual(2, (self, f) => isSuccess2(self) ? succeed2(f(self.success)) : self);
var match2 = /* @__PURE__ */ dual(2, (self, {
  onFailure,
  onSuccess
}) => isFailure2(self) ? onFailure(self.failure) : onSuccess(self.success));
var getOrElse3 = /* @__PURE__ */ dual(2, (self, onFailure) => isFailure2(self) ? onFailure(self.failure) : self.success);
var getOrUndefined3 = /* @__PURE__ */ getOrElse3(constUndefined);
var makeEquivalence2 = Tuple;
var isEmptyRecord = /* @__PURE__ */ __name((self) => Object.keys(self).length === 0, "isEmptyRecord");
var has = /* @__PURE__ */ dual(2, (self, key) => Object.hasOwn(self, key));
var map3 = /* @__PURE__ */ dual(2, (self, f) => {
  const out = {
    ...self
  };
  for (const key of keys(self)) {
    assignProperty(out, key, f(self[key], key));
  }
  return out;
});
var mapEntries = /* @__PURE__ */ dual(2, (self, f) => {
  const out = {};
  for (const key of keys(self)) {
    const [k, b] = f(self[key], key);
    assignProperty(out, k, b);
  }
  return out;
});
var keys = /* @__PURE__ */ __name((self) => Object.keys(self), "keys");
var isSubrecordBy = /* @__PURE__ */ __name((equivalence) => dual(2, (self, that) => {
  for (const key of keys(self)) {
    if (!has(that, key) || !equivalence(self[key], that[key])) {
      return false;
    }
  }
  return true;
}), "isSubrecordBy");
var makeEquivalence3 = /* @__PURE__ */ __name((equivalence) => {
  const is = isSubrecordBy(equivalence);
  return (self, that) => is(self, that) && is(that, self);
}, "makeEquivalence3");
var Array2 = globalThis.Array;
var fromIterable = /* @__PURE__ */ __name((collection) => Array2.isArray(collection) ? collection : Array2.from(collection), "fromIterable");
var ensure = /* @__PURE__ */ __name((self) => Array2.isArray(self) ? self : [self], "ensure");
var append = /* @__PURE__ */ dual(2, (self, last) => [...self, last]);
var appendAll = /* @__PURE__ */ dual(2, (self, that) => fromIterable(self).concat(fromIterable(that)));
var isArray = Array2.isArray;
var isArrayNonEmpty2 = isArrayNonEmpty;
var isReadonlyArrayNonEmpty = isArrayNonEmpty;
var reverse = /* @__PURE__ */ __name((self) => Array2.from(self).reverse(), "reverse");
var hashBucketsAdd = /* @__PURE__ */ __name((buckets, value3) => {
  const hash2 = hash(value3);
  const bucket = buckets.get(hash2);
  if (bucket === void 0) {
    buckets.set(hash2, [value3]);
    return true;
  }
  for (const previous of bucket) {
    if (equals(previous, value3)) {
      return false;
    }
  }
  bucket.push(value3);
  return true;
}, "hashBucketsAdd");
var union = /* @__PURE__ */ dual(2, (self, that) => {
  const a = fromIterable(self);
  const b = fromIterable(that);
  if (isReadonlyArrayNonEmpty(a)) {
    return isReadonlyArrayNonEmpty(b) ? dedupe(appendAll(a, b)) : a;
  }
  return b;
});
var empty2 = /* @__PURE__ */ __name(() => [], "empty2");
var of = /* @__PURE__ */ __name((a) => [a], "of");
var map4 = /* @__PURE__ */ dual(2, (self, f) => self.map(f));
var makeEquivalence4 = Array_;
var dedupe = /* @__PURE__ */ __name((self) => {
  const input = fromIterable(self);
  if (input.length < 2) {
    return [...input];
  }
  const buckets = /* @__PURE__ */ new Map();
  const out = [];
  for (const value3 of input) {
    if (hashBucketsAdd(buckets, value3)) {
      out.push(value3);
    }
  }
  return out;
}, "dedupe");
var TypeId4 = "~effect/time/Duration";
var bigint0 = /* @__PURE__ */ BigInt(0);
var bigint1 = /* @__PURE__ */ BigInt(1);
var bigint2 = /* @__PURE__ */ BigInt(2);
var bigint10 = /* @__PURE__ */ BigInt(10);
var bigint1e3 = /* @__PURE__ */ BigInt(1e3);
var roundTiesAwayFromZero = /* @__PURE__ */ __name((input) => BigInt(input < 0 ? Math.ceil(input - 0.5) : Math.floor(input + 0.5)), "roundTiesAwayFromZero");
var roundMillisToNanos = /* @__PURE__ */ __name((millis2) => roundTiesAwayFromZero(millis2 * 1e6), "roundMillisToNanos");
var parseNanos = /* @__PURE__ */ __name((input, scale) => {
  const decimalIndex = input.indexOf(".");
  if (decimalIndex === -1)
    return BigInt(input) * scale;
  const isNegative = input[0] === "-";
  const fractional = input.slice(decimalIndex + 1);
  const fractionalScale = bigint10 ** BigInt(fractional.length);
  const scaled = (BigInt(input.slice(isNegative ? 1 : 0, decimalIndex)) * fractionalScale + BigInt(fractional)) * scale;
  const rounded = scaled / fractionalScale + (scaled % fractionalScale * bigint2 >= fractionalScale ? bigint1 : bigint0);
  return isNegative ? -rounded : rounded;
}, "parseNanos");
var DURATION_REGEXP = /^(-?\d+(?:\.\d+)?)\s+(nanos?|micros?|millis?|seconds?|minutes?|hours?|days?|weeks?)$/;
var fromInputUnsafe = /* @__PURE__ */ __name((input) => {
  switch (typeof input) {
    case "number":
      return millis(input);
    case "bigint":
      return nanos(input);
    case "string": {
      if (input === "Infinity") {
        return infinity;
      }
      if (input === "-Infinity") {
        return negativeInfinity;
      }
      const match32 = DURATION_REGEXP.exec(input);
      if (!match32)
        break;
      const [_, valueStr, unit] = match32;
      if (unit === "nano" || unit === "nanos") {
        return nanos(parseNanos(valueStr, bigint1));
      }
      if (unit === "micro" || unit === "micros") {
        return nanos(parseNanos(valueStr, bigint1e3));
      }
      const value3 = Number(valueStr);
      switch (unit) {
        case "milli":
        case "millis":
          return millis(value3);
        case "second":
        case "seconds":
          return seconds(value3);
        case "minute":
        case "minutes":
          return minutes(value3);
        case "hour":
        case "hours":
          return hours(value3);
        case "day":
        case "days":
          return days(value3);
        case "week":
        case "weeks":
          return weeks(value3);
      }
      break;
    }
    case "object": {
      if (input === null)
        break;
      if (TypeId4 in input)
        return input;
      if (Array.isArray(input)) {
        if (input.length !== 2 || !input.every(isNumber)) {
          return invalid(input);
        }
        if (Number.isNaN(input[0]) || Number.isNaN(input[1])) {
          return zero;
        }
        if (input[0] === -Infinity || input[1] === -Infinity) {
          return negativeInfinity;
        }
        if (input[0] === Infinity || input[1] === Infinity) {
          return infinity;
        }
        return make4(roundTiesAwayFromZero(input[0] * 1e9 + input[1]));
      }
      const obj = input;
      let millis2 = 0;
      if (obj.weeks)
        millis2 += obj.weeks * 6048e5;
      if (obj.days)
        millis2 += obj.days * 864e5;
      if (obj.hours)
        millis2 += obj.hours * 36e5;
      if (obj.minutes)
        millis2 += obj.minutes * 6e4;
      if (obj.seconds)
        millis2 += obj.seconds * 1e3;
      if (obj.milliseconds)
        millis2 += obj.milliseconds;
      if (!obj.microseconds && !obj.nanoseconds)
        return make4(millis2);
      return make4(roundTiesAwayFromZero(millis2 * 1e6 + (obj.microseconds ?? 0) * 1e3 + (obj.nanoseconds ?? 0)));
    }
  }
  return invalid(input);
}, "fromInputUnsafe");
var invalid = /* @__PURE__ */ __name((input) => {
  throw new Error(`Invalid Input: ${input}`);
}, "invalid");
var zeroDurationValue = {
  _tag: "Millis",
  millis: 0
};
var infinityDurationValue = {
  _tag: "Infinity"
};
var negativeInfinityDurationValue = {
  _tag: "NegativeInfinity"
};
var DurationProto = {
  [TypeId4]: TypeId4,
  [symbol]() {
    return structure(this.value);
  },
  [symbol2](that) {
    return isDuration(that) && equals2(this, that);
  },
  toString() {
    switch (this.value._tag) {
      case "Infinity":
        return "Infinity";
      case "NegativeInfinity":
        return "-Infinity";
      case "Nanos":
        return `${this.value.nanos} nanos`;
      case "Millis":
        return `${this.value.millis} millis`;
    }
  },
  toJSON() {
    switch (this.value._tag) {
      case "Millis":
        return {
          _id: "Duration",
          _tag: "Millis",
          millis: this.value.millis
        };
      case "Nanos":
        return {
          _id: "Duration",
          _tag: "Nanos",
          nanos: String(this.value.nanos)
        };
      case "Infinity":
        return {
          _id: "Duration",
          _tag: "Infinity"
        };
      case "NegativeInfinity":
        return {
          _id: "Duration",
          _tag: "NegativeInfinity"
        };
    }
  },
  [NodeInspectSymbol]() {
    return this.toJSON();
  },
  pipe() {
    return pipeArguments(this, arguments);
  }
};
var make4 = /* @__PURE__ */ __name((input) => {
  const duration = Object.create(DurationProto);
  if (typeof input === "number") {
    if (isNaN(input) || input === 0 || Object.is(input, -0)) {
      duration.value = zeroDurationValue;
    } else if (!Number.isFinite(input)) {
      duration.value = input > 0 ? infinityDurationValue : negativeInfinityDurationValue;
    } else if (!Number.isInteger(input)) {
      duration.value = {
        _tag: "Nanos",
        nanos: roundMillisToNanos(input)
      };
    } else {
      duration.value = {
        _tag: "Millis",
        millis: input
      };
    }
  } else if (input === bigint0) {
    duration.value = zeroDurationValue;
  } else {
    duration.value = {
      _tag: "Nanos",
      nanos: input
    };
  }
  return duration;
}, "make4");
var isDuration = /* @__PURE__ */ __name((u) => hasProperty(u, TypeId4), "isDuration");
var isFinite = /* @__PURE__ */ __name((self) => self.value._tag !== "Infinity" && self.value._tag !== "NegativeInfinity", "isFinite");
var zero = /* @__PURE__ */ make4(0);
var infinity = /* @__PURE__ */ make4(Infinity);
var negativeInfinity = /* @__PURE__ */ make4(-Infinity);
var nanos = /* @__PURE__ */ __name((nanos2) => make4(nanos2), "nanos");
var millis = /* @__PURE__ */ __name((millis2) => make4(millis2), "millis");
var seconds = /* @__PURE__ */ __name((seconds2) => make4(seconds2 * 1e3), "seconds");
var minutes = /* @__PURE__ */ __name((minutes2) => make4(minutes2 * 6e4), "minutes");
var hours = /* @__PURE__ */ __name((hours2) => make4(hours2 * 36e5), "hours");
var days = /* @__PURE__ */ __name((days2) => make4(days2 * 864e5), "days");
var weeks = /* @__PURE__ */ __name((weeks2) => make4(weeks2 * 6048e5), "weeks");
var toMillis = /* @__PURE__ */ __name((self) => match3(fromInputUnsafe(self), {
  onMillis: identity,
  onNanos: /* @__PURE__ */ __name((nanos2) => Number(nanos2) / 1e6, "onNanos"),
  onInfinity: /* @__PURE__ */ __name(() => Infinity, "onInfinity"),
  onNegativeInfinity: /* @__PURE__ */ __name(() => -Infinity, "onNegativeInfinity")
}), "toMillis");
var toSeconds = /* @__PURE__ */ __name((self) => match3(fromInputUnsafe(self), {
  onMillis: /* @__PURE__ */ __name((millis2) => millis2 / 1e3, "onMillis"),
  onNanos: /* @__PURE__ */ __name((nanos2) => Number(nanos2) / 1e9, "onNanos"),
  onInfinity: /* @__PURE__ */ __name(() => Infinity, "onInfinity"),
  onNegativeInfinity: /* @__PURE__ */ __name(() => -Infinity, "onNegativeInfinity")
}), "toSeconds");
var toNanosUnsafe = /* @__PURE__ */ __name((input) => {
  const self = fromInputUnsafe(input);
  switch (self.value._tag) {
    case "Infinity":
    case "NegativeInfinity":
      throw new Error("Cannot convert infinite duration to nanos");
    case "Nanos":
      return self.value.nanos;
    case "Millis":
      return roundMillisToNanos(self.value.millis);
  }
}, "toNanosUnsafe");
var match3 = /* @__PURE__ */ dual(2, (self, options) => {
  switch (self.value._tag) {
    case "Millis":
      return options.onMillis(self.value.millis);
    case "Nanos":
      return options.onNanos(self.value.nanos);
    case "Infinity":
      return options.onInfinity();
    case "NegativeInfinity":
      return (options.onNegativeInfinity ?? options.onInfinity)();
  }
});
var matchPair = /* @__PURE__ */ dual(3, (self, that, options) => {
  if (self.value._tag === "Infinity" || self.value._tag === "NegativeInfinity" || that.value._tag === "Infinity" || that.value._tag === "NegativeInfinity")
    return options.onInfinity(self, that);
  if (self.value._tag === "Millis") {
    return that.value._tag === "Millis" ? options.onMillis(self.value.millis, that.value.millis) : options.onNanos(toNanosUnsafe(self), that.value.nanos);
  } else {
    return options.onNanos(self.value.nanos, toNanosUnsafe(that));
  }
});
var Equivalence = /* @__PURE__ */ __name((self, that) => matchPair(self, that, {
  onMillis: /* @__PURE__ */ __name((self2, that2) => self2 === that2, "onMillis"),
  onNanos: /* @__PURE__ */ __name((self2, that2) => self2 === that2, "onNanos"),
  onInfinity: /* @__PURE__ */ __name((self2, that2) => self2.value._tag === that2.value._tag, "onInfinity")
}), "Equivalence");
var equals2 = /* @__PURE__ */ dual(2, (self, that) => Equivalence(self, that));
var composePassthrough = /* @__PURE__ */ dual(2, (left, right) => (input) => {
  const leftOut = left(input);
  if (isFailure2(leftOut))
    return fail2(input);
  const rightOut = right(leftOut.success);
  if (isFailure2(rightOut))
    return fail2(input);
  return rightOut;
});
var Scheduler = /* @__PURE__ */ Reference("effect/Scheduler", {
  fiberCached: true,
  defaultValue: /* @__PURE__ */ __name(() => new MixedScheduler(), "defaultValue")
});
var setImmediate = "setImmediate" in globalThis ? (f) => {
  const timer = globalThis.setImmediate(f);
  return () => globalThis.clearImmediate(timer);
} : (f) => {
  const timer = setTimeout(f, 0);
  return () => clearTimeout(timer);
};
var setMicrotask = /* @__PURE__ */ __name((f) => {
  let cancelled = false;
  queueMicrotask(() => {
    if (!cancelled)
      f();
  });
  return () => {
    cancelled = true;
  };
}, "setMicrotask");
var PriorityBuckets = class {
  static {
    __name(this, "PriorityBuckets");
  }
  buckets = [];
  scheduleTask(task, priority) {
    const buckets = this.buckets;
    const len = buckets.length;
    let bucket;
    let index = 0;
    for (; index < len; index++) {
      if (buckets[index][0] > priority)
        break;
      bucket = buckets[index];
    }
    if (bucket && bucket[0] === priority) {
      bucket[1].push(task);
    } else if (index === len) {
      buckets.push([priority, [task]]);
    } else {
      buckets.splice(index, 0, [priority, [task]]);
    }
  }
  drain() {
    const buckets = this.buckets;
    this.buckets = [];
    return buckets;
  }
};
var MixedScheduler = class {
  static {
    __name(this, "MixedScheduler");
  }
  executionMode;
  setImmediate;
  constructor(executionMode = "async", setImmediateFn) {
    this.executionMode = executionMode;
    this.setImmediate = setImmediateFn ?? (executionMode === "sync" ? setMicrotask : setImmediate);
  }
  shouldYield(fiber) {
    return fiber.currentOpCount >= fiber.maxOpsBeforeYield;
  }
  makeDispatcher() {
    return new MixedSchedulerDispatcher(this.setImmediate);
  }
};
var MixedSchedulerDispatcher = class {
  static {
    __name(this, "MixedSchedulerDispatcher");
  }
  tasks = /* @__PURE__ */ new PriorityBuckets();
  running = void 0;
  setImmediate;
  constructor(setImmediateFn = setImmediate) {
    this.setImmediate = setImmediateFn;
  }
  scheduleTask(task, priority) {
    this.tasks.scheduleTask(task, priority);
    if (this.running === void 0) {
      this.running = this.setImmediate(this.afterScheduled);
    }
  }
  afterScheduled = /* @__PURE__ */ __name(() => {
    this.running = void 0;
    this.runTasks();
  }, "afterScheduled");
  runTasks() {
    const buckets = this.tasks.drain();
    for (let i = 0; i < buckets.length; i++) {
      const toRun = buckets[i][1];
      for (let j = 0; j < toRun.length; j++) {
        toRun[j]();
      }
    }
  }
  flush() {
    while (this.tasks.buckets.length > 0) {
      if (this.running !== void 0) {
        this.running();
        this.running = void 0;
      }
      this.runTasks();
    }
  }
};
var MaxOpsBeforeYield = /* @__PURE__ */ Reference("effect/Scheduler/MaxOpsBeforeYield", {
  fiberCached: true,
  defaultValue: /* @__PURE__ */ __name(() => 2048, "defaultValue")
});
var PreventSchedulerYield = /* @__PURE__ */ Reference("effect/Scheduler/PreventSchedulerYield", {
  fiberCached: true,
  defaultValue: /* @__PURE__ */ __name(() => false, "defaultValue")
});
var ParentSpanKey = "effect/Tracer/ParentSpan";
var ParentSpan = class extends (/* @__PURE__ */ Service()(ParentSpanKey, {
  fiberCached: true
})) {
  static {
    __name(this, "ParentSpan");
  }
};
var make5 = /* @__PURE__ */ __name((options) => options, "make5");
var externalSpan = /* @__PURE__ */ __name((options) => ({
  _tag: "ExternalSpan",
  spanId: options.spanId,
  traceId: options.traceId,
  sampled: options.sampled ?? true,
  annotations: options.annotations ?? empty()
}), "externalSpan");
var DisablePropagation = /* @__PURE__ */ Reference("effect/Tracer/DisablePropagation", {
  defaultValue: constFalse
});
var CurrentTraceLevel = /* @__PURE__ */ Reference("effect/Tracer/CurrentTraceLevel", {
  defaultValue: /* @__PURE__ */ __name(() => "Info", "defaultValue")
});
var MinimumTraceLevel = /* @__PURE__ */ Reference("effect/Tracer/MinimumTraceLevel", {
  defaultValue: /* @__PURE__ */ __name(() => "All", "defaultValue")
});
var TracerKey = "effect/Tracer";
var Tracer = /* @__PURE__ */ Reference(TracerKey, {
  fiberCached: true,
  defaultValue: /* @__PURE__ */ __name(() => make5({
    span: /* @__PURE__ */ __name((options) => new NativeSpan(options), "span")
  }), "defaultValue")
});
var NativeSpan = class {
  static {
    __name(this, "NativeSpan");
  }
  _tag = "Span";
  spanId;
  traceId = "native";
  sampled;
  name;
  parent;
  annotations;
  links;
  startTime;
  kind;
  status;
  attributes;
  events = [];
  constructor(options) {
    this.name = options.name;
    this.parent = options.parent;
    this.annotations = options.annotations;
    this.links = options.links;
    this.startTime = options.startTime;
    this.kind = options.kind;
    this.sampled = options.sampled;
    this.status = {
      _tag: "Started",
      startTime: options.startTime
    };
    this.attributes = /* @__PURE__ */ new Map();
    this.traceId = getOrUndefined(options.parent)?.traceId ?? randomHexString(32);
    this.spanId = randomHexString(16);
  }
  end(endTime, exit3) {
    this.status = {
      _tag: "Ended",
      endTime,
      exit: exit3,
      startTime: this.status.startTime
    };
  }
  attribute(key, value3) {
    this.attributes.set(key, value3);
  }
  event(name, startTime, attributes) {
    this.events.push([name, startTime, attributes ?? {}]);
  }
  addLinks(links) {
    this.links.push(...links);
  }
};
var randomHexString = /* @__PURE__ */ (function() {
  const characters = "abcdef0123456789";
  const charactersLength = characters.length;
  return function(length) {
    let result3 = "";
    for (let i = 0; i < length; i++) {
      result3 += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result3;
  };
})();
var FiberRuntimeMetricsKey = "effect/observability/Metric/FiberRuntimeMetricsKey";
var CurrentErrorReporters = /* @__PURE__ */ Reference("effect/ErrorReporter/CurrentErrorReporters", {
  defaultValue: /* @__PURE__ */ __name(() => /* @__PURE__ */ new Set(), "defaultValue")
});
var CurrentStackFrame = /* @__PURE__ */ Reference("effect/References/CurrentStackFrame", {
  fiberCached: true,
  defaultValue: constUndefined
});
var TracerEnabled = /* @__PURE__ */ Reference("effect/References/TracerEnabled", {
  defaultValue: constTrue
});
var TracerTimingEnabled = /* @__PURE__ */ Reference("effect/References/TracerTimingEnabled", {
  defaultValue: constTrue
});
var TracerSpanAnnotations = /* @__PURE__ */ Reference("effect/References/TracerSpanAnnotations", {
  defaultValue: /* @__PURE__ */ __name(() => ({}), "defaultValue")
});
var TracerSpanLinks = /* @__PURE__ */ Reference("effect/References/TracerSpanLinks", {
  defaultValue: /* @__PURE__ */ __name(() => [], "defaultValue")
});
var CurrentLogAnnotations = /* @__PURE__ */ Reference("effect/References/CurrentLogAnnotations", {
  defaultValue: /* @__PURE__ */ __name(() => ({}), "defaultValue")
});
var CurrentLogLevel = /* @__PURE__ */ Reference("effect/References/CurrentLogLevel", {
  fiberCached: true,
  defaultValue: /* @__PURE__ */ __name(() => "Info", "defaultValue")
});
var MinimumLogLevel = /* @__PURE__ */ Reference("effect/References/MinimumLogLevel", {
  fiberCached: true,
  defaultValue: /* @__PURE__ */ __name(() => "Info", "defaultValue")
});
var CurrentLogSpans = /* @__PURE__ */ Reference("effect/References/CurrentLogSpans", {
  defaultValue: /* @__PURE__ */ __name(() => [], "defaultValue")
});
var Interrupt = class extends ReasonBase {
  static {
    __name(this, "Interrupt");
  }
  fiberId;
  constructor(fiberId, annotations = constEmptyAnnotations) {
    super("Interrupt", annotations, "Interrupted");
    this.fiberId = fiberId;
  }
  toString() {
    return `Interrupt(${this.fiberId})`;
  }
  toJSON() {
    return {
      _tag: "Interrupt",
      fiberId: this.fiberId
    };
  }
  [symbol2](that) {
    return isInterruptReason(that) && this.fiberId === that.fiberId && this.annotations === that.annotations;
  }
  [symbol]() {
    return combine(string(`${this._tag}:${this.fiberId}`))(random(this.annotations));
  }
};
var makeInterruptReason = /* @__PURE__ */ __name((fiberId) => new Interrupt(fiberId), "makeInterruptReason");
var causeInterrupt = /* @__PURE__ */ __name((fiberId) => new CauseImpl([new Interrupt(fiberId)]), "causeInterrupt");
var findError = /* @__PURE__ */ __name((self) => {
  for (let i = 0; i < self.reasons.length; i++) {
    const reason = self.reasons[i];
    if (reason._tag === "Fail") {
      return succeed2(reason.error);
    }
  }
  return fail2(self);
}, "findError");
var hasDies = /* @__PURE__ */ __name((self) => self.reasons.some(isDieReason), "hasDies");
var hasInterrupts = /* @__PURE__ */ __name((self) => self.reasons.some(isInterruptReason), "hasInterrupts");
var causeCombine = /* @__PURE__ */ dual(2, (self, that) => {
  if (self.reasons.length === 0) {
    return that;
  } else if (that.reasons.length === 0) {
    return self;
  }
  const newCause = new CauseImpl(union(self.reasons, that.reasons));
  return equals(self, newCause) ? self : newCause;
});
var causeMap = /* @__PURE__ */ dual(2, (self, f) => {
  let hasFail = false;
  const failures = self.reasons.map((failure) => {
    if (isFailReason(failure)) {
      hasFail = true;
      return new Fail(f(failure.error), failure.annotations);
    }
    return failure;
  });
  return hasFail ? causeFromReasons(failures) : self;
});
var causePartition = /* @__PURE__ */ __name((self) => {
  const obj = {
    Fail: [],
    Die: [],
    Interrupt: []
  };
  for (let i = 0; i < self.reasons.length; i++) {
    obj[self.reasons[i]._tag].push(self.reasons[i]);
  }
  return obj;
}, "causePartition");
var causeSquash = /* @__PURE__ */ __name((self) => {
  const partitioned = causePartition(self);
  if (partitioned.Fail.length > 0) {
    return partitioned.Fail[0].error;
  } else if (partitioned.Die.length > 0) {
    return partitioned.Die[0].defect;
  } else if (partitioned.Interrupt.length > 0) {
    return new globalThis.Error("All fibers interrupted without error");
  }
  return new globalThis.Error("Empty cause");
}, "causeSquash");
var causePrettyErrors = /* @__PURE__ */ __name((self, options) => {
  const errors = [];
  const interrupts = [];
  if (self.reasons.length === 0)
    return errors;
  const prevStackLimit = getStackTraceLimit();
  setStackTraceLimit(1);
  for (const failure of self.reasons) {
    if (failure._tag === "Interrupt") {
      interrupts.push(failure);
      continue;
    }
    errors.push(causePrettyError(failure._tag === "Die" ? failure.defect : failure.error, failure.annotations, options));
  }
  if (errors.length === 0) {
    const cause = new Error("The fiber was interrupted by:");
    cause.name = "InterruptCause";
    cause.stack = interruptCauseStack(cause, interrupts);
    const error = new globalThis.Error("All fibers interrupted without error", {
      cause
    });
    error.name = "InterruptError";
    error.stack = `${error.name}: ${error.message}`;
    errors.push(causePrettyError(error, interrupts[0].annotations, options));
  }
  setStackTraceLimit(prevStackLimit);
  return errors;
}, "causePrettyErrors");
var causePrettyError = /* @__PURE__ */ __name((original, annotations, options) => {
  const kind = typeof original;
  let error;
  if (original && kind === "object") {
    error = new globalThis.Error(causePrettyMessage(original), {
      cause: original.cause ? causePrettyError(original.cause) : void 0
    });
    if (typeof original.name === "string") {
      error.name = original.name;
    }
    if (typeof original.stack === "string") {
      error.stack = cleanErrorStack(original.stack, error, annotations);
    } else {
      const stack = `${error.name}: ${error.message}`;
      error.stack = annotations ? addStackAnnotations(stack, annotations) : stack;
    }
    if (options?.includeCauseInStack) {
      error.stack = renderPrettyError(error);
    }
    for (const key of Object.keys(original)) {
      if (!(key in error)) {
        error[key] = original[key];
      }
    }
  } else {
    error = new globalThis.Error(!original ? `Unknown error: ${original}` : kind === "string" ? original : formatJson(original));
  }
  return error;
}, "causePrettyError");
var causePrettyMessage = /* @__PURE__ */ __name((u) => {
  if (typeof u.message === "string") {
    return u.message;
  } else if (typeof u.toString === "function" && u.toString !== Object.prototype.toString && u.toString !== Array.prototype.toString) {
    try {
      return u.toString();
    } catch {
    }
  }
  return formatJson(u);
}, "causePrettyMessage");
var locationRegExp = /\((.*)\)/g;
var cleanErrorStack = /* @__PURE__ */ __name((stack, error, annotations) => {
  const message = `${error.name}: ${error.message}`;
  const lines = (stack.startsWith(message) ? stack.slice(message.length) : stack).split(`
`);
  const out = [message];
  for (let i = 1; i < lines.length; i++) {
    if (/(?:Generator\.next|~effect\/Effect)/.test(lines[i])) {
      break;
    }
    out.push(lines[i]);
  }
  return annotations ? addStackAnnotations(out.join(`
`), annotations) : out.join(`
`);
}, "cleanErrorStack");
var addStackAnnotations = /* @__PURE__ */ __name((stack, annotations) => {
  const frame = annotations?.get(StackTraceKey.key);
  if (frame) {
    stack = `${stack}
${currentStackTrace(frame)}`;
  }
  return stack;
}, "addStackAnnotations");
var interruptCauseStack = /* @__PURE__ */ __name((error, interrupts) => {
  const out = [`${error.name}: ${error.message}`];
  for (const current of interrupts) {
    const fiberId = current.fiberId !== void 0 ? `#${current.fiberId}` : "unknown";
    const frame = current.annotations.get(InterruptorStackTrace.key);
    out.push(`    at fiber (${fiberId})`);
    if (frame)
      out.push(currentStackTrace(frame));
  }
  return out.join(`
`);
}, "interruptCauseStack");
var currentStackTrace = /* @__PURE__ */ __name((frame) => {
  const out = [];
  let current = frame;
  let i = 0;
  while (current && i < 10) {
    const stack = current.stack();
    if (stack) {
      const locationMatchAll = stack.matchAll(locationRegExp);
      let match42 = false;
      for (const [, location] of locationMatchAll) {
        match42 = true;
        out.push(`    at ${current.name} (${location})`);
      }
      if (!match42) {
        out.push(`    at ${current.name} (${stack.replace(/^at /, "")})`);
      }
    } else {
      out.push(`    at ${current.name}`);
    }
    current = current.parent;
    i++;
  }
  return out.join(`
`);
}, "currentStackTrace");
var causePretty = /* @__PURE__ */ __name((cause) => causePrettyErrors(cause).map(renderPrettyError).join(`
`), "causePretty");
var renderPrettyError = /* @__PURE__ */ __name((e) => e.cause ? `${e.stack} {
${renderErrorCause(e.cause, "  ")}
}` : e.stack, "renderPrettyError");
var renderErrorCause = /* @__PURE__ */ __name((cause, prefix) => {
  const lines = cause.stack.split(`
`);
  let stack = `${prefix}[cause]: ${lines[0]}`;
  for (let i = 1, len = lines.length; i < len; i++) {
    stack += `
${prefix}${lines[i]}`;
  }
  if (cause.cause) {
    stack += ` {
${renderErrorCause(cause.cause, `${prefix}  `)}
${prefix}}`;
  }
  return stack;
}, "renderErrorCause");
var FiberTypeId = "~effect/Fiber";
var fiberVariance = {
  _A: identity,
  _E: identity
};
var fiberIdStore = {
  id: 0
};
var getCurrentFiber = /* @__PURE__ */ __name(() => globalThis[currentFiberTypeId], "getCurrentFiber");
var FiberImpl = class {
  static {
    __name(this, "FiberImpl");
  }
  constructor(context3, interruptible3 = true) {
    this[FiberTypeId] = fiberVariance;
    this.setContext(context3);
    this.id = ++fiberIdStore.id;
    this.currentOpCount = 0;
    this.interruptible = interruptible3;
    this._stack = [];
    this._observers = [];
    this._exit = void 0;
    this._children = void 0;
    this._interruptedCause = void 0;
    this._yielded = void 0;
    this._running = false;
    this._deferredInterrupt = false;
    this.runtimeMetrics?.recordFiberStart(this.context);
  }
  [FiberTypeId];
  id;
  interruptible;
  currentOpCount;
  _stack;
  _observers;
  _exit;
  _children;
  _interruptedCause;
  _yielded;
  _running;
  _deferredInterrupt;
  context;
  currentScheduler;
  currentTracerContext;
  currentSpan;
  currentLogLevel;
  minimumLogLevel;
  currentStackFrame;
  runtimeMetrics;
  maxOpsBeforeYield;
  currentPreventYield;
  _dispatcher = void 0;
  get currentDispatcher() {
    return this._dispatcher ??= this.currentScheduler.makeDispatcher();
  }
  getRef(ref) {
    return get(this.context, ref);
  }
  addObserver(cb) {
    if (this._exit) {
      cb(this._exit);
      return constVoid;
    }
    this._observers.push(cb);
    return () => {
      const index = this._observers.indexOf(cb);
      if (index >= 0) {
        this._observers.splice(index, 1);
      }
    };
  }
  interruptUnsafe(fiberId, annotations) {
    if (this._exit) {
      return;
    }
    let cause = causeInterrupt(fiberId);
    if (this.currentStackFrame) {
      cause = causeAnnotate(cause, make3(StackTraceKey, this.currentStackFrame));
    }
    if (annotations) {
      cause = causeAnnotate(cause, annotations);
    }
    this._interruptedCause = this._interruptedCause ? causeCombine(this._interruptedCause, cause) : cause;
    if (this.interruptible) {
      if (this._running) {
        this._deferredInterrupt = true;
      } else {
        this.evaluate(failCause(this._interruptedCause));
      }
    }
  }
  pollUnsafe() {
    return this._exit;
  }
  evaluate(effect2) {
    if (this._exit) {
      return;
    } else if (this._yielded !== void 0) {
      const yielded = this._yielded;
      this._yielded = void 0;
      yielded();
    }
    const exit3 = this.runLoop(effect2);
    if (exit3 === Yield) {
      return;
    }
    const interruptChildren = fiberMiddleware.interruptChildren && fiberMiddleware.interruptChildren(this);
    if (interruptChildren !== void 0) {
      return this.evaluate(flatMap2(interruptChildren, () => exit3));
    }
    this._exit = exit3;
    this.runtimeMetrics?.recordFiberEnd(this.context, this._exit);
    for (let i = 0; i < this._observers.length; i++) {
      this._observers[i](exit3);
    }
    this._observers.length = 0;
    this._stack.length = 0;
    this._children = void 0;
    this.context = empty();
  }
  runLoop(effect2) {
    const prevFiber = globalThis[currentFiberTypeId];
    globalThis[currentFiberTypeId] = this;
    const prevRunning = this._running;
    this._running = true;
    let yielding = false;
    let current = effect2;
    this.currentOpCount = 0;
    try {
      while (true) {
        if (this._deferredInterrupt) {
          this._deferredInterrupt = false;
          current = failCause(this._interruptedCause);
        }
        this.currentOpCount++;
        if (!yielding && !this.currentPreventYield && this.currentScheduler.shouldYield(this)) {
          yielding = true;
          const prev = current;
          current = flatMap2(yieldNow, () => prev);
        }
        current = this.currentTracerContext ? this.currentTracerContext(current, this) : current[evaluate](this);
        if (current === Yield) {
          const yielded = this._yielded;
          if (ExitTypeId in yielded) {
            this._deferredInterrupt = false;
            this._yielded = void 0;
            return yielded;
          } else if (this._deferredInterrupt) {
            this._yielded = void 0;
            yielded();
            continue;
          }
          return Yield;
        }
      }
    } catch (error) {
      if (!hasProperty(current, evaluate)) {
        return exitDie(`Fiber.runLoop: Not a valid effect: ${String(current)}`);
      }
      return this.runLoop(exitDie(error));
    } finally {
      this._running = prevRunning;
      globalThis[currentFiberTypeId] = prevFiber;
    }
  }
  getCont(symbol3) {
    if (this._deferredInterrupt) {
      this._deferredInterrupt = false;
      return deferredInterruptCont;
    }
    while (true) {
      const op = this._stack.pop();
      if (!op)
        return;
      const cont = op[contAll] && op[contAll](this);
      if (cont) {
        cont[symbol3] = cont;
        return cont;
      }
      if (op[symbol3])
        return op;
    }
  }
  yieldWith(value3) {
    this._yielded = value3;
    return Yield;
  }
  children() {
    return this._children ??= /* @__PURE__ */ new Set();
  }
  pipe() {
    return pipeArguments(this, arguments);
  }
  setContext(context3) {
    const previous = this.context;
    this.context = context3;
    if (previous !== void 0 && hasSameCache(previous, context3))
      return;
    const scheduler = this.getRef(Scheduler);
    if (scheduler !== this.currentScheduler) {
      this.currentScheduler = scheduler;
      this._dispatcher = void 0;
    }
    this.currentSpan = getOrUndefinedUnsafe(context3, ParentSpanKey);
    this.currentLogLevel = this.getRef(CurrentLogLevel);
    this.minimumLogLevel = this.getRef(MinimumLogLevel);
    this.currentStackFrame = this.getRef(CurrentStackFrame);
    this.maxOpsBeforeYield = this.getRef(MaxOpsBeforeYield);
    this.currentPreventYield = this.getRef(PreventSchedulerYield);
    this.runtimeMetrics = getOrUndefinedUnsafe(context3, FiberRuntimeMetricsKey);
    const currentTracer = getOrUndefinedUnsafe(context3, TracerKey);
    this.currentTracerContext = currentTracer ? currentTracer["context"] : void 0;
  }
  get currentSpanLocal() {
    return this.currentSpan?._tag === "Span" ? this.currentSpan : void 0;
  }
};
var deferredInterruptCont = {
  [contA](_value, fiber) {
    return failCause(fiber._interruptedCause);
  },
  [contE](_cause, fiber) {
    return failCause(fiber._interruptedCause);
  }
};
var fiberMiddleware = {
  interruptChildren: void 0
};
var fiberStackAnnotations = /* @__PURE__ */ __name((fiber) => {
  if (!fiber.currentStackFrame)
    return;
  const annotations = /* @__PURE__ */ new Map();
  annotations.set(InterruptorStackTrace.key, fiber.currentStackFrame);
  return makeUnsafe(annotations);
}, "fiberStackAnnotations");
var fiberAwait = /* @__PURE__ */ __name((self) => {
  const impl = self;
  if (impl._exit)
    return succeed3(impl._exit);
  return callback((resume) => {
    if (impl._exit)
      return resume(succeed3(impl._exit));
    return sync(self.addObserver((exit3) => resume(succeed3(exit3))));
  });
}, "fiberAwait");
var fiberAwaitAll = /* @__PURE__ */ __name((self) => callback((resume) => {
  const iter = self[Symbol.iterator]();
  const exits = [];
  let cancel = void 0;
  function loop() {
    let result3 = iter.next();
    while (!result3.done) {
      if (result3.value._exit) {
        exits.push(result3.value._exit);
        result3 = iter.next();
        continue;
      }
      cancel = result3.value.addObserver((exit3) => {
        exits.push(exit3);
        loop();
      });
      return;
    }
    resume(succeed3(exits));
  }
  __name(loop, "loop");
  loop();
  return sync(() => cancel?.());
}), "fiberAwaitAll");
var fiberJoin = /* @__PURE__ */ __name((self) => {
  const impl = self;
  if (impl._exit)
    return impl._exit;
  return callback((resume) => {
    if (impl._exit)
      return resume(impl._exit);
    return sync(self.addObserver(resume));
  });
}, "fiberJoin");
var fiberInterrupt = /* @__PURE__ */ __name((self) => withFiber((fiber) => fiberInterruptAs(self, fiber.id)), "fiberInterrupt");
var fiberInterruptAs = /* @__PURE__ */ dual((args2) => hasProperty(args2[0], FiberTypeId), (self, fiberId, annotations) => withFiber((parent) => {
  let ann = fiberStackAnnotations(parent);
  ann = ann && annotations ? merge(ann, annotations) : ann ?? annotations;
  self.interruptUnsafe(fiberId, ann);
  return asVoid(fiberAwait(self));
}));
var fiberInterruptAll = /* @__PURE__ */ __name((fibers) => withFiber((parent) => {
  const annotations = fiberStackAnnotations(parent);
  let fiberArr = empty2();
  for (const fiber of fibers) {
    fiber.interruptUnsafe(parent.id, annotations);
    fiberArr.push(fiber);
  }
  return asVoid(fiberAwaitAll(fiberArr));
}), "fiberInterruptAll");
var succeed3 = exitSucceed;
var failCause = exitFailCause;
var fail3 = exitFail;
var sync = /* @__PURE__ */ makePrimitive({
  op: "Sync",
  [evaluate](fiber) {
    const value3 = this[args]();
    const cont = fiber.getCont(contA);
    return cont ? cont[contA](value3, fiber) : fiber.yieldWith(exitSucceed(value3));
  }
});
var suspend = /* @__PURE__ */ makePrimitive({
  op: "Suspend",
  [evaluate](_fiber) {
    return this[args]();
  }
});
var fromResult = /* @__PURE__ */ match2({
  onFailure: fail3,
  onSuccess: succeed3
});
var yieldNowWith = /* @__PURE__ */ makePrimitive({
  op: "Yield",
  [evaluate](fiber) {
    let resumed = false;
    fiber.currentDispatcher.scheduleTask(() => {
      if (resumed)
        return;
      fiber.evaluate(exitVoid);
    }, this[args] ?? 0);
    return fiber.yieldWith(() => {
      resumed = true;
    });
  }
});
var yieldNow = /* @__PURE__ */ yieldNowWith(0);
var succeedNone = /* @__PURE__ */ succeed3(/* @__PURE__ */ none2());
var failCauseSync = /* @__PURE__ */ __name((evaluate2) => suspend(() => failCause(internalCall(evaluate2))), "failCauseSync");
var die = /* @__PURE__ */ __name((defect) => exitDie(defect), "die");
var failSync = /* @__PURE__ */ __name((error) => suspend(() => fail3(internalCall(error))), "failSync");
var void_ = /* @__PURE__ */ succeed3(void 0);
var try_ = /* @__PURE__ */ __name((options) => {
  const evaluate2 = typeof options === "function" ? options : options.try;
  const catcher = typeof options === "function" ? (cause) => new UnknownError(cause, "An error occurred in Effect.try") : options.catch;
  return suspend(() => {
    try {
      return succeed3(internalCall(evaluate2));
    } catch (err) {
      return fail3(internalCall(() => catcher(err)));
    }
  });
}, "try_");
var promise = /* @__PURE__ */ __name((evaluate2) => callbackOptions(function(resume, signal) {
  internalCall(() => evaluate2(signal)).then((a) => resume(succeed3(a)), (e) => resume(die(e)));
}, evaluate2.length !== 0), "promise");
var tryPromise = /* @__PURE__ */ __name((options) => {
  const f = typeof options === "function" ? options : options.try;
  const catcher = typeof options === "function" ? (cause) => new UnknownError(cause, "An error occurred in Effect.tryPromise") : options.catch;
  return callbackOptions(function(resume, signal) {
    const failWithCatch = /* @__PURE__ */ __name((cause) => {
      try {
        resume(fail3(internalCall(() => catcher(cause))));
      } catch (err) {
        resume(die(err));
      }
    }, "failWithCatch");
    try {
      internalCall(() => f(signal)).then((a) => resume(succeed3(a)), failWithCatch);
    } catch (err) {
      failWithCatch(err);
    }
  }, f.length !== 0);
}, "tryPromise");
var withFiberId = /* @__PURE__ */ __name((f) => withFiber((fiber) => f(fiber.id)), "withFiberId");
var callbackOptions = /* @__PURE__ */ makePrimitive({
  op: "Async",
  single: false,
  [evaluate](fiber) {
    const register = internalCall(() => this[args][0].bind(fiber.currentScheduler));
    let resumed = false;
    let yielded = false;
    const controller = this[args][1] ? new AbortController() : void 0;
    const onCancel = register((effect2) => {
      if (resumed)
        return;
      resumed = true;
      if (yielded) {
        fiber.evaluate(effect2);
      } else {
        yielded = effect2;
      }
    }, controller?.signal);
    if (yielded !== false)
      return yielded;
    yielded = true;
    fiber._yielded = () => {
      resumed = true;
    };
    if (controller === void 0 && onCancel === void 0) {
      return Yield;
    }
    fiber._stack.push(asyncFinalizer(() => {
      resumed = true;
      controller?.abort();
      return onCancel ?? exitVoid;
    }));
    return Yield;
  }
});
var asyncFinalizer = /* @__PURE__ */ makePrimitive({
  op: "AsyncFinalizer",
  [contAll](fiber) {
    if (fiber.interruptible) {
      fiber.interruptible = false;
      fiber._stack.push(setInterruptibleTrue);
    }
  },
  [contE](cause, _fiber) {
    return hasInterrupts(cause) ? flatMap2(this[args](), () => failCause(cause)) : failCause(cause);
  }
});
var callback = /* @__PURE__ */ __name((register) => callbackOptions(register, register.length >= 2), "callback");
var never = /* @__PURE__ */ callback(constVoid);
var gen = /* @__PURE__ */ __name((...args2) => suspend(() => fromIteratorUnsafe(args2.length === 1 ? args2[0]() : args2[1].call(args2[0].self))), "gen");
var fnUntraced = /* @__PURE__ */ __name((body, ...pipeables) => {
  const fn = pipeables.length === 0 ? function() {
    return suspend(() => fromIteratorUnsafe(body.apply(this, arguments)));
  } : function() {
    let effect2 = suspend(() => fromIteratorUnsafe(body.apply(this, arguments)));
    for (let i = 0; i < pipeables.length; i++) {
      effect2 = pipeables[i](effect2, ...arguments);
    }
    return effect2;
  };
  return defineFunctionLength(body.length, fn);
}, "fnUntraced");
var defineFunctionLength = /* @__PURE__ */ __name((length, fn) => Object.defineProperty(fn, "length", {
  value: length,
  configurable: true
}), "defineFunctionLength");
var fnUntracedEager = /* @__PURE__ */ __name((body, ...pipeables) => defineFunctionLength(body.length, pipeables.length === 0 ? function() {
  return fromIteratorEagerUnsafe(() => body.apply(this, arguments));
} : function() {
  let effect2 = fromIteratorEagerUnsafe(() => body.apply(this, arguments));
  for (const pipeable of pipeables) {
    effect2 = pipeable(effect2);
  }
  return effect2;
}), "fnUntracedEager");
var fromIteratorEagerUnsafe = /* @__PURE__ */ __name((evaluate2) => {
  try {
    const iterator = evaluate2();
    let value3 = void 0;
    while (true) {
      const state = iterator.next(value3);
      if (state.done) {
        return succeed3(state.value);
      }
      const primitive = state.value;
      if (primitive && primitive._tag === "Success") {
        value3 = primitive.value;
        continue;
      } else if (primitive && primitive._tag === "Failure") {
        return state.value;
      } else {
        let isFirstExecution = true;
        return suspend(() => {
          if (isFirstExecution) {
            isFirstExecution = false;
            return flatMap2(state.value, (value22) => fromIteratorUnsafe(iterator, value22));
          } else {
            return suspend(() => fromIteratorUnsafe(evaluate2()));
          }
        });
      }
    }
  } catch (error) {
    return die(error);
  }
}, "fromIteratorEagerUnsafe");
var fromIteratorUnsafe = /* @__PURE__ */ makePrimitive({
  op: "Iterator",
  single: false,
  [contA](value3, fiber) {
    const iter = this[args][0];
    while (true) {
      const state = iter.next(value3);
      if (state.done)
        return succeed3(state.value);
      if (!effectIsExit(state.value)) {
        fiber._stack.push(this);
        return state.value;
      } else if (state.value._tag === "Failure") {
        return state.value;
      }
      value3 = state.value.value;
    }
  },
  [evaluate](fiber) {
    return this[contA](this[args][1], fiber);
  }
});
var as = /* @__PURE__ */ dual(2, (self, value3) => {
  const b = succeed3(value3);
  return flatMap2(self, (_) => b);
});
var asSome = /* @__PURE__ */ __name((self) => map5(self, some2), "asSome");
var andThen = /* @__PURE__ */ dual(2, (self, f) => flatMap2(self, (a) => isEffect(f) ? f : internalCall(() => f(a))));
var asVoid = /* @__PURE__ */ __name((self) => flatMap2(self, (_) => exitVoid), "asVoid");
var flatMap2 = /* @__PURE__ */ dual(2, (self, f) => {
  const onSuccess = Object.create(OnSuccessProto);
  onSuccess[args] = self;
  onSuccess[contA] = f.length !== 1 ? (a) => f(a) : f;
  return onSuccess;
});
var OnSuccessProto = /* @__PURE__ */ makePrimitiveProto({
  op: "OnSuccess",
  [evaluate](fiber) {
    fiber._stack.push(this);
    return this[args];
  }
});
var matchCauseEffectEager = /* @__PURE__ */ dual(2, (self, options) => {
  if (effectIsExit(self)) {
    return self._tag === "Success" ? options.onSuccess(self.value) : options.onFailure(self.cause);
  }
  return matchCauseEffect(self, options);
});
var effectIsExit = /* @__PURE__ */ __name((effect2) => ExitTypeId in effect2, "effectIsExit");
var flatMapEager = /* @__PURE__ */ dual(2, (self, f) => {
  if (effectIsExit(self)) {
    return self._tag === "Success" ? f(self.value) : self;
  }
  return flatMap2(self, f);
});
var flatten3 = /* @__PURE__ */ __name((self) => flatMap2(self, identity), "flatten3");
var map5 = /* @__PURE__ */ dual(2, (self, f) => flatMap2(self, (a) => succeed3(internalCall(() => f(a)))));
var mapEager = /* @__PURE__ */ dual(2, (self, f) => effectIsExit(self) ? exitMap(self, f) : map5(self, f));
var mapErrorEager = /* @__PURE__ */ dual(2, (self, f) => effectIsExit(self) ? exitMapError(self, f) : mapError2(self, f));
var mapBothEager = /* @__PURE__ */ dual(2, (self, options) => effectIsExit(self) ? exitMapBoth(self, options) : mapBoth(self, options));
var exitInterrupt = /* @__PURE__ */ __name((fiberId) => exitFailCause(causeInterrupt(fiberId)), "exitInterrupt");
var exitIsSuccess = /* @__PURE__ */ __name((self) => self._tag === "Success", "exitIsSuccess");
var exitIsFailure = /* @__PURE__ */ __name((self) => self._tag === "Failure", "exitIsFailure");
var exitFilterCause = /* @__PURE__ */ __name((self) => self._tag === "Failure" ? succeed2(self.cause) : fail2(self), "exitFilterCause");
var exitVoid = /* @__PURE__ */ exitSucceed(void 0);
var exitMap = /* @__PURE__ */ dual(2, (self, f) => self._tag === "Success" ? exitSucceed(f(self.value)) : self);
var exitMapError = /* @__PURE__ */ dual(2, (self, f) => {
  if (self._tag === "Success")
    return self;
  const error = findError(self.cause);
  if (isFailure2(error))
    return self;
  return exitFail(f(error.success));
});
var exitMapBoth = /* @__PURE__ */ dual(2, (self, options) => {
  if (self._tag === "Success")
    return exitSucceed(options.onSuccess(self.value));
  const error = findError(self.cause);
  if (isFailure2(error))
    return self;
  return exitFail(options.onFailure(error.success));
});
var exitZipRight = /* @__PURE__ */ dual(2, (self, that) => exitIsSuccess(self) ? that : self);
var exitAsVoidAll = /* @__PURE__ */ __name((exits) => {
  const failures = [];
  for (const exit3 of exits) {
    if (exit3._tag === "Failure") {
      failures.push(...exit3.cause.reasons);
    }
  }
  return failures.length === 0 ? exitVoid : exitFailCause(causeFromReasons(failures));
}, "exitAsVoidAll");
var updateContext = /* @__PURE__ */ dual(2, (self, f) => withFiber((fiber) => {
  const prevContext = fiber.context;
  const nextContext = f(prevContext);
  if (prevContext === nextContext)
    return self;
  fiber.setContext(nextContext);
  return onExitPrimitive(self, () => {
    fiber.setContext(prevContext);
    return;
  });
}));
var updateService = /* @__PURE__ */ dual(3, (self, service, f) => updateContext(self, (s) => {
  const prev = getUnsafe(s, service);
  const next = f(prev);
  if (prev === next)
    return s;
  return add(s, service, next);
}));
var context = /* @__PURE__ */ __name(() => getContext, "context");
var getContext = /* @__PURE__ */ withFiber((fiber) => succeed3(fiber.context));
var contextWith = /* @__PURE__ */ __name((f) => withFiber((fiber) => f(fiber.context)), "contextWith");
var provideContext = /* @__PURE__ */ dual(2, (self, context22) => {
  if (effectIsExit(self))
    return self;
  return updateContext(self, merge(context22));
});
var provideService = /* @__PURE__ */ __name(function() {
  if (arguments.length === 1) {
    return dual(2, (self, impl) => provideServiceImpl(self, arguments[0], impl));
  }
  return dual(3, (self, service, impl) => provideServiceImpl(self, service, impl)).apply(this, arguments);
}, "provideService");
var provideServiceImpl = /* @__PURE__ */ __name((self, service, implementation) => updateContext(self, (s) => {
  const prev = s.mapUnsafe.get(service.key);
  if (prev === implementation)
    return s;
  return add(s, service, implementation);
}), "provideServiceImpl");
var forever = /* @__PURE__ */ dual((args2) => isEffect(args2[0]), (self, options) => whileLoop({
  while: constTrue,
  body: constant(options?.disableYield ? self : flatMap2(self, (_) => yieldNow)),
  step: constVoid
}));
var catchCause = /* @__PURE__ */ dual(2, (self, f) => {
  const onFailure = Object.create(OnFailureProto);
  onFailure[args] = self;
  onFailure[contE] = f.length !== 1 ? (cause) => f(cause) : f;
  return onFailure;
});
var OnFailureProto = /* @__PURE__ */ makePrimitiveProto({
  op: "OnFailure",
  [evaluate](fiber) {
    fiber._stack.push(this);
    return this[args];
  }
});
var catchCauseFilter = /* @__PURE__ */ dual(3, (self, filter2, f) => catchCause(self, (cause) => {
  const eb = filter2(cause);
  return isFailure2(eb) ? failCause(eb.failure) : internalCall(() => f(eb.success, cause));
}));
var catch_ = /* @__PURE__ */ dual(2, (self, f) => catchCauseFilter(self, findError, (e) => f(e)));
var catchIf = /* @__PURE__ */ dual((args2) => isEffect(args2[0]), (self, predicate, f, orElse) => catchCause(self, (cause) => {
  const error = findError(cause);
  if (isFailure2(error))
    return failCause(error.failure);
  if (!predicate(error.success)) {
    return orElse ? internalCall(() => orElse(error.success)) : failCause(cause);
  }
  return internalCall(() => f(error.success));
}));
var catchFilter = /* @__PURE__ */ dual((args2) => isEffect(args2[0]), (self, filter2, f, orElse) => catchCause(self, (cause) => {
  const error = findError(cause);
  if (isFailure2(error))
    return failCause(error.failure);
  const result3 = filter2(error.success);
  if (isFailure2(result3)) {
    return orElse ? internalCall(() => orElse(result3.failure)) : failCause(cause);
  }
  return internalCall(() => f(result3.success));
}));
var catchTag = /* @__PURE__ */ dual((args2) => isEffect(args2[0]), (self, k, f, orElse) => {
  const pred = Array.isArray(k) ? (e) => hasProperty(e, "_tag") && k.includes(e._tag) : isTagged(k);
  return catchIf(self, pred, f, orElse);
});
var catchTags = /* @__PURE__ */ dual((args2) => isEffect(args2[0]), (self, cases, orElse) => {
  let keys2;
  return catchFilter(self, (e) => {
    keys2 ??= Object.keys(cases);
    return hasProperty(e, "_tag") && isString(e["_tag"]) && keys2.includes(e["_tag"]) ? succeed2(e) : fail2(e);
  }, (e) => internalCall(() => cases[e["_tag"]](e)), orElse);
});
var mapError2 = /* @__PURE__ */ dual(2, (self, f) => catch_(self, (error) => failSync(() => f(error))));
var mapBoth = /* @__PURE__ */ dual(2, (self, options) => matchEffect(self, {
  onFailure: /* @__PURE__ */ __name((e) => failSync(() => options.onFailure(e)), "onFailure"),
  onSuccess: /* @__PURE__ */ __name((a) => sync(() => options.onSuccess(a)), "onSuccess")
}));
var orDie = /* @__PURE__ */ __name((self) => catch_(self, die), "orDie");
var result = /* @__PURE__ */ __name((self) => matchEager(self, {
  onFailure: fail2,
  onSuccess: succeed2
}), "result");
var matchCauseEffect = /* @__PURE__ */ dual(2, (self, options) => {
  const primitive = Object.create(OnSuccessAndFailureProto);
  primitive[args] = self;
  primitive[contA] = options.onSuccess.length !== 1 ? (a) => options.onSuccess(a) : options.onSuccess;
  primitive[contE] = options.onFailure.length !== 1 ? (cause) => options.onFailure(cause) : options.onFailure;
  return primitive;
});
var OnSuccessAndFailureProto = /* @__PURE__ */ makePrimitiveProto({
  op: "OnSuccessAndFailure",
  [evaluate](fiber) {
    fiber._stack.push(this);
    return this[args];
  }
});
var matchEffect = /* @__PURE__ */ dual(2, (self, options) => matchCauseEffect(self, {
  onFailure: /* @__PURE__ */ __name((cause) => {
    const fail42 = cause.reasons.find(isFailReason);
    return fail42 ? internalCall(() => options.onFailure(fail42.error)) : failCause(cause);
  }, "onFailure"),
  onSuccess: options.onSuccess
}));
var match4 = /* @__PURE__ */ dual(2, (self, options) => matchEffect(self, {
  onFailure: /* @__PURE__ */ __name((error) => sync(() => options.onFailure(error)), "onFailure"),
  onSuccess: /* @__PURE__ */ __name((value3) => sync(() => options.onSuccess(value3)), "onSuccess")
}));
var matchEager = /* @__PURE__ */ dual(2, (self, options) => {
  if (effectIsExit(self)) {
    if (self._tag === "Success")
      return exitSucceed(options.onSuccess(self.value));
    const error = findError(self.cause);
    if (isFailure2(error))
      return self;
    return exitSucceed(options.onFailure(error.success));
  }
  return match4(self, options);
});
var exit = /* @__PURE__ */ __name((self) => effectIsExit(self) ? exitSucceed(self) : exitPrimitive(self), "exit");
var exitPrimitive = /* @__PURE__ */ makePrimitive({
  op: "Exit",
  [evaluate](fiber) {
    fiber._stack.push(this);
    return this[args];
  },
  [contA](value3, _, exit22) {
    return succeed3(exit22 ?? exitSucceed(value3));
  },
  [contE](cause, _, exit22) {
    return succeed3(exit22 ?? exitFailCause(cause));
  }
});
var ScopeTypeId = "~effect/Scope";
var ScopeCloseableTypeId = "~effect/Scope/Closeable";
var scopeTag = /* @__PURE__ */ Service("effect/Scope");
var scopeClose = /* @__PURE__ */ __name((self, exit_) => suspend(() => scopeCloseUnsafe(self, exit_) ?? void_), "scopeClose");
var scopeCloseUnsafe = /* @__PURE__ */ __name((self, exit_) => {
  if (self.state._tag === "Closed")
    return;
  const closed = {
    _tag: "Closed",
    exit: exit_
  };
  if (self.state._tag === "Empty") {
    self.state = closed;
    return;
  }
  const {
    finalizers
  } = self.state;
  self.state = closed;
  if (finalizers.size === 0) {
    return;
  } else if (finalizers.size === 1) {
    return finalizers.values().next().value(exit_);
  }
  return scopeCloseFinalizers(self, finalizers, exit_);
}, "scopeCloseUnsafe");
var scopeCloseFinalizers = /* @__PURE__ */ fnUntraced(function* (self, finalizers, exit_) {
  let exits = [];
  const fibers = [];
  const arr = Array.from(finalizers.values());
  const parent = getCurrentFiber();
  for (let i = arr.length - 1; i >= 0; i--) {
    const finalizer = arr[i];
    if (self.strategy === "sequential") {
      exits.push(yield* exit(finalizer(exit_)));
    } else {
      fibers.push(forkUnsafe(parent, finalizer(exit_), true, true, "inherit"));
    }
  }
  if (fibers.length > 0) {
    exits = yield* fiberAwaitAll(fibers);
  }
  return yield* exitAsVoidAll(exits);
});
var scopeForkUnsafe = /* @__PURE__ */ __name((scope, finalizerStrategy) => {
  const newScope = scopeMakeUnsafe(finalizerStrategy);
  if (scope.state._tag === "Closed") {
    newScope.state = scope.state;
    return newScope;
  }
  const key = {};
  scopeAddFinalizerUnsafe(scope, key, (exit22) => scopeClose(newScope, exit22));
  scopeAddFinalizerUnsafe(newScope, key, (_) => sync(() => scopeRemoveFinalizerUnsafe(scope, key)));
  return newScope;
}, "scopeForkUnsafe");
var scopeAddFinalizerExit = /* @__PURE__ */ __name((scope, finalizer) => {
  return suspend(() => {
    if (scope.state._tag === "Closed") {
      return finalizer(scope.state.exit);
    }
    scopeAddFinalizerUnsafe(scope, {}, finalizer);
    return void_;
  });
}, "scopeAddFinalizerExit");
var scopeAddFinalizer = /* @__PURE__ */ __name((scope, finalizer) => scopeAddFinalizerExit(scope, constant(finalizer)), "scopeAddFinalizer");
var scopeAddFinalizerUnsafe = /* @__PURE__ */ __name((scope, key, finalizer) => {
  if (scope.state._tag === "Empty") {
    scope.state = {
      _tag: "Open",
      finalizers: /* @__PURE__ */ new Map([[key, finalizer]])
    };
  } else if (scope.state._tag === "Open") {
    scope.state.finalizers.set(key, finalizer);
  }
}, "scopeAddFinalizerUnsafe");
var scopeRemoveFinalizerUnsafe = /* @__PURE__ */ __name((scope, key) => {
  if (scope.state._tag === "Open") {
    scope.state.finalizers.delete(key);
  }
}, "scopeRemoveFinalizerUnsafe");
var scopeMakeUnsafe = /* @__PURE__ */ __name((finalizerStrategy = "sequential") => ({
  [ScopeCloseableTypeId]: ScopeCloseableTypeId,
  [ScopeTypeId]: ScopeTypeId,
  strategy: finalizerStrategy,
  state: constScopeEmpty
}), "scopeMakeUnsafe");
var constScopeEmpty = {
  _tag: "Empty"
};
var provideScope = /* @__PURE__ */ provideService(scopeTag);
var scopedWith = /* @__PURE__ */ __name((f) => suspend(() => {
  const scope = scopeMakeUnsafe();
  return onExit(f(scope), (exit22) => suspend(() => scopeCloseUnsafe(scope, exit22) ?? void_));
}), "scopedWith");
var onExitPrimitive = /* @__PURE__ */ makePrimitive({
  op: "OnExit",
  single: false,
  [evaluate](fiber) {
    fiber._stack.push(this);
    return this[args][0];
  },
  [contAll](fiber) {
    if (fiber.interruptible && this[args][2] !== true) {
      fiber._stack.push(setInterruptibleTrue);
      fiber.interruptible = false;
    }
  },
  [contA](value3, _, exit22) {
    exit22 ??= exitSucceed(value3);
    const eff = this[args][1](exit22);
    return eff ? flatMap2(eff, (_2) => exit22) : exit22;
  },
  [contE](cause, _, exit22) {
    exit22 ??= exitFailCause(cause);
    const eff = this[args][1](exit22);
    return eff ? flatMap2(eff, (_2) => exit22) : exit22;
  }
});
var onExit = /* @__PURE__ */ dual(2, onExitPrimitive);
var onExitFilter = /* @__PURE__ */ dual(3, (self, filter2, f) => onExit(self, (exit22) => {
  const b = filter2(exit22);
  return isFailure2(b) ? void_ : f(b.success, exit22);
}));
var onError = /* @__PURE__ */ dual(2, (self, f) => onExitFilter(self, exitFilterCause, f));
var cachedInvalidateWithTTL = /* @__PURE__ */ dual(2, (self, ttl) => sync(() => {
  const ttlMillis = toMillis(fromInputUnsafe(ttl));
  const isFinite22 = Number.isFinite(ttlMillis);
  const latch = makeLatchUnsafe(false);
  let expiresAt = 0;
  let running = false;
  let exit22;
  const wait = flatMap2(latch.await, () => exit22);
  return [withFiber((fiber) => {
    const clock = fiber.getRef(ClockRef);
    const now3 = isFinite22 ? clock.currentTimeMillisUnsafe() : 0;
    if (running || now3 < expiresAt)
      return exit22 ?? wait;
    running = true;
    latch.closeUnsafe();
    exit22 = void 0;
    return onExit(self, (exit_) => sync(() => {
      running = false;
      expiresAt = clock.currentTimeMillisUnsafe() + ttlMillis;
      exit22 = exit_;
      latch.openUnsafe();
    }));
  }), sync(() => {
    expiresAt = 0;
    latch.closeUnsafe();
    exit22 = void 0;
  })];
}));
var cachedWithTTL = /* @__PURE__ */ dual(2, (self, timeToLive) => map5(cachedInvalidateWithTTL(self, timeToLive), (tuple2) => tuple2[0]));
var cached = /* @__PURE__ */ __name((self) => cachedWithTTL(self, infinity), "cached");
var uninterruptible = /* @__PURE__ */ __name((self) => withFiber((fiber) => {
  if (!fiber.interruptible)
    return self;
  fiber.interruptible = false;
  fiber._stack.push(setInterruptibleTrue);
  return self;
}), "uninterruptible");
var setInterruptible = /* @__PURE__ */ makePrimitive({
  op: "SetInterruptible",
  [contAll](fiber) {
    fiber.interruptible = this[args];
    if (fiber._interruptedCause && fiber.interruptible) {
      return () => failCause(fiber._interruptedCause);
    }
  }
});
var setInterruptibleTrue = /* @__PURE__ */ setInterruptible(true);
var setInterruptibleFalse = /* @__PURE__ */ setInterruptible(false);
var setFiberInterruptible = /* @__PURE__ */ __name((fiber) => {
  fiber.interruptible = true;
  fiber._stack.push(setInterruptibleFalse);
  if (fiber._interruptedCause)
    return failCause(fiber._interruptedCause);
}, "setFiberInterruptible");
var interruptible = /* @__PURE__ */ __name((self) => withFiber((fiber) => {
  if (fiber.interruptible)
    return self;
  return setFiberInterruptible(fiber) ?? self;
}), "interruptible");
var uninterruptibleMask = /* @__PURE__ */ __name((f) => withFiber((fiber) => {
  if (!fiber.interruptible)
    return f(identity);
  fiber.interruptible = false;
  fiber._stack.push(setInterruptibleTrue);
  return f(interruptible);
}), "uninterruptibleMask");
var all = /* @__PURE__ */ __name((arg, options) => {
  if (isIterable(arg)) {
    return options?.mode === "result" ? forEach(arg, result, options) : forEach(arg, identity, options);
  } else if (options?.discard) {
    return options.mode === "result" ? forEach(Object.values(arg), result, options) : forEach(Object.values(arg), identity, options);
  }
  return suspend(() => {
    const out = {};
    return as(forEach(Object.entries(arg), ([key, effect2]) => map5(options?.mode === "result" ? result(effect2) : effect2, (value3) => {
      assignProperty(out, key, value3);
    }), {
      discard: true,
      concurrency: options?.concurrency
    }), out);
  });
}, "all");
var whileLoop = /* @__PURE__ */ makePrimitive({
  op: "While",
  [contA](value3, fiber) {
    this[args].step(value3);
    if (this[args].while()) {
      fiber._stack.push(this);
      return this[args].body();
    }
    return exitVoid;
  },
  [evaluate](fiber) {
    if (this[args].while()) {
      fiber._stack.push(this);
      return this[args].body();
    }
    return exitVoid;
  }
});
var forEach = /* @__PURE__ */ dual((args2) => typeof args2[1] === "function", (iterable, f, options) => suspend(() => {
  const concurrencyOption = options?.concurrency ?? 1;
  const concurrency = concurrencyOption === "unbounded" ? Number.POSITIVE_INFINITY : Math.max(1, concurrencyOption);
  if (concurrency === 1) {
    return forEachSequential(iterable, f, options);
  }
  const items = fromIterable(iterable);
  let length = items.length;
  if (length === 0) {
    return options?.discard ? void_ : succeed3([]);
  }
  const out = options?.discard ? void 0 : new Array(length);
  const eff = forEachConcurrent({
    f,
    out
  }, items, {
    concurrency
  });
  return eff ? as(eff, out) : succeed3(out);
}));
var forEachSequential = /* @__PURE__ */ __name((iterable, f, options) => suspend(() => {
  const out = options?.discard ? void 0 : [];
  const iterator = iterable[Symbol.iterator]();
  let state = iterator.next();
  let index = 0;
  return as(whileLoop({
    while: /* @__PURE__ */ __name(() => !state.done, "while"),
    body: /* @__PURE__ */ __name(() => f(state.value, index++), "body"),
    step: /* @__PURE__ */ __name((b) => {
      if (out)
        out.push(b);
      state = iterator.next();
    }, "step")
  }), out);
}), "forEachSequential");
var iterateEagerImpl = /* @__PURE__ */ __name((options) => {
  const onItem = options.onItem;
  const step = options.step;
  const runSequential = /* @__PURE__ */ __name((state, items, index, end) => {
    for (; index < end; index++) {
      const item = items[index];
      const effect2 = onItem(state, item, index);
      if (!effectIsExit(effect2)) {
        return flatMap2(exit(effect2), (itemExit) => step(state, item, itemExit, index) ?? runSequential(state, items, index + 1, end) ?? void_);
      }
      const terminal = step(state, item, effect2, index);
      if (terminal)
        return terminal._tag === "Failure" ? terminal : void 0;
    }
  }, "runSequential");
  return (state, items, opts) => {
    let index = 0;
    const end = opts?.end ?? items.length;
    const concurrency = opts?.concurrency ?? 1;
    if (concurrency === 1) {
      return runSequential(state, items, 0, end);
    }
    const orderedStep = opts?.orderedStep === true && concurrency > 1;
    let done22 = false;
    let parentFiber;
    let fibers;
    let resume;
    let interrupted = false;
    let terminal;
    let effect2;
    let nextIndex = index;
    const exits = orderedStep ? new Array(end) : void 0;
    const failDefect = /* @__PURE__ */ __name((error) => {
      const defect = exitDie(error);
      terminal = defect;
      done22 = true;
      interrupted = true;
      return fibers && fibers.size > 0 ? flatMap2(uninterruptible(fiberInterruptAll(Array.from(fibers))), () => defect) : defect;
    }, "failDefect");
    const runStep = /* @__PURE__ */ __name((item, exit22, currentIndex) => {
      if (!orderedStep)
        return step(state, item, exit22, currentIndex);
      if (terminal)
        return terminal;
      exits[currentIndex] = exit22;
      while (nextIndex < end) {
        const nextExit = exits[nextIndex];
        if (nextExit === void 0)
          return;
        exits[nextIndex] = void 0;
        const index2 = nextIndex++;
        const result22 = step(state, items[index2], nextExit, index2);
        if (result22)
          return result22;
      }
    }, "runStep");
    const go = /* @__PURE__ */ __name(() => {
      let paused = false;
      for (; !terminal && index < end; index++) {
        const item = items[index];
        const eff = effect2 ?? onItem(state, item, index);
        if (effectIsExit(eff)) {
          terminal = runStep(item, eff, index);
          if (terminal)
            break;
        } else if (!parentFiber) {
          return callback((cb) => {
            parentFiber = getCurrentFiber();
            fibers = /* @__PURE__ */ new Set();
            effect2 = eff;
            resume = cb;
            let result22;
            try {
              result22 = go();
            } catch (error) {
              return cb(failDefect(error));
            }
            if (result22)
              return cb(result22);
            return suspend(() => {
              terminal = exitVoid;
              interrupted = true;
              return fibers ? fiberInterruptAll(fibers) : void_;
            });
          });
        } else {
          effect2 = void 0;
          const fiber = forkUnsafe(parentFiber, eff, true, true, "inherit");
          if (fiber._exit) {
            terminal = runStep(item, fiber._exit, index);
            if (terminal)
              break;
            continue;
          }
          fibers.add(fiber);
          const currentIndex = index;
          fiber.addObserver((exit22) => {
            fibers.delete(fiber);
            try {
              if (terminal) {
                if (!interrupted && exit22._tag === "Failure") {
                  for (const reason of exit22.cause.reasons) {
                    if (reason._tag === "Interrupt")
                      continue;
                    else if (terminal._tag === "Failure") {
                      terminal.cause.reasons.push(reason);
                    } else {
                      terminal = exitFailCause(causeFromReasons([reason]));
                    }
                  }
                }
              } else {
                const result22 = runStep(item, exit22, currentIndex);
                if (result22) {
                  terminal = result22._tag === "Failure" ? exitFailCause(causeFromReasons(result22.cause.reasons.slice())) : result22;
                  go();
                }
              }
              if (paused) {
                const eff2 = go();
                if (eff2)
                  resume(eff2);
              } else if (done22 && fibers.size === 0) {
                resume(terminal ?? void_);
              }
            } catch (error) {
              resume(failDefect(error));
            }
          });
          if (fibers.size < concurrency)
            continue;
          paused = true;
          index++;
          return;
        }
      }
      done22 = true;
      if (terminal) {
        if (fibers && fibers.size > 0) {
          const annotations = fiberStackAnnotations(parentFiber);
          fibers.forEach((f) => f.interruptUnsafe(parentFiber.id, annotations));
          return;
        }
        if (resume || terminal._tag === "Failure") {
          return terminal;
        }
      } else if (resume) {
        if (!fibers) {
          return exitVoid;
        } else if (fibers.size === 0) {
          resume(void_);
        }
      }
    }, "go");
    return go();
  };
}, "iterateEagerImpl");
var iterateEager = /* @__PURE__ */ __name(() => iterateEagerImpl, "iterateEager");
var forEachConcurrent = /* @__PURE__ */ iterateEagerImpl({
  onItem(state, item, index) {
    return state.f(item, index);
  },
  step(state, _, exit22, index) {
    if (exit22._tag === "Failure")
      return exit22;
    else if (state.out) {
      state.out[index] = exit22.value;
    }
  }
});
var forkUnsafe = /* @__PURE__ */ __name((parent, effect2, immediate = false, daemon = false, uninterruptible22 = false) => {
  const parentRuntime = parent;
  const interruptible22 = uninterruptible22 === "inherit" ? parentRuntime.interruptible : !uninterruptible22;
  const child = new FiberImpl(parentRuntime.context, interruptible22);
  if (immediate) {
    child.evaluate(effect2);
  } else {
    parentRuntime.currentDispatcher.scheduleTask(() => child.evaluate(effect2), 0);
  }
  if (!daemon && !child._exit) {
    parentRuntime.children().add(child);
    child.addObserver(() => parentRuntime._children.delete(child));
  }
  return child;
}, "forkUnsafe");
var forkIn = /* @__PURE__ */ dual((args2) => isEffect(args2[0]), (self, scope, options) => withFiber((parent) => {
  const fiber = forkUnsafe(parent, self, options?.startImmediately, true, options?.uninterruptible);
  if (!fiber._exit) {
    if (scope.state._tag !== "Closed") {
      const key = {};
      const finalizer = /* @__PURE__ */ __name(() => withFiberId((interruptor) => interruptor === fiber.id ? void_ : fiberInterrupt(fiber)), "finalizer");
      scopeAddFinalizerUnsafe(scope, key, finalizer);
      fiber.addObserver(() => scopeRemoveFinalizerUnsafe(scope, key));
    } else {
      fiber.interruptUnsafe(parent.id, fiberStackAnnotations(parent));
    }
  }
  return succeed3(fiber);
}));
var runForkWith = /* @__PURE__ */ __name((context22) => (effect2, options) => {
  const fiber = new FiberImpl(options?.scheduler ? add(context22, Scheduler, options.scheduler) : context22, options?.uninterruptible !== true);
  fiber.evaluate(effect2);
  if (fiber._exit)
    return fiber;
  if (options?.signal) {
    if (options.signal.aborted) {
      fiber.interruptUnsafe();
    } else {
      const abort = /* @__PURE__ */ __name(() => fiber.interruptUnsafe(), "abort");
      options.signal.addEventListener("abort", abort, {
        once: true
      });
      fiber.addObserver(() => options.signal.removeEventListener("abort", abort));
    }
  }
  if (options?.onFiberStart) {
    options.onFiberStart(fiber);
  }
  return fiber;
}, "runForkWith");
var fiberRunIn = /* @__PURE__ */ dual(2, (self, scope) => {
  if (self._exit) {
    return self;
  } else if (scope.state._tag === "Closed") {
    self.interruptUnsafe(self.id);
    return self;
  }
  const key = {};
  scopeAddFinalizerUnsafe(scope, key, () => fiberInterrupt(self));
  self.addObserver(() => scopeRemoveFinalizerUnsafe(scope, key));
  return self;
});
var runFork = /* @__PURE__ */ runForkWith(/* @__PURE__ */ empty());
var runPromiseExitWith = /* @__PURE__ */ __name((context22) => {
  const runFork22 = runForkWith(context22);
  return (effect2, options) => {
    const fiber = runFork22(effect2, options);
    return new Promise((resolve4) => {
      fiber.addObserver((exit22) => resolve4(exit22));
    });
  };
}, "runPromiseExitWith");
var runPromiseWith = /* @__PURE__ */ __name((context22) => {
  const runPromiseExit = runPromiseExitWith(context22);
  return (effect2, options) => runPromiseExit(effect2, options).then((exit22) => {
    if (exit22._tag === "Failure") {
      throw causeSquash(exit22.cause);
    }
    return exit22.value;
  });
}, "runPromiseWith");
var runPromise = /* @__PURE__ */ runPromiseWith(/* @__PURE__ */ empty());
var runSyncExitWith = /* @__PURE__ */ __name((context22) => {
  const runFork22 = runForkWith(context22);
  return (effect2) => {
    if (effectIsExit(effect2))
      return effect2;
    const scheduler = new MixedScheduler("sync");
    const fiber = runFork22(effect2, {
      scheduler
    });
    fiber._dispatcher?.flush();
    return fiber._exit ?? exitDie(new AsyncFiberError(fiber));
  };
}, "runSyncExitWith");
var runSyncExit = /* @__PURE__ */ runSyncExitWith(/* @__PURE__ */ empty());
var runSyncWith = /* @__PURE__ */ __name((context22) => {
  const runSyncExit22 = runSyncExitWith(context22);
  return (effect2) => {
    const exit22 = runSyncExit22(effect2);
    if (exit22._tag === "Failure")
      throw causeSquash(exit22.cause);
    return exit22.value;
  };
}, "runSyncWith");
var runSync = /* @__PURE__ */ runSyncWith(/* @__PURE__ */ empty());
var succeedTrue = /* @__PURE__ */ succeed3(true);
var succeedFalse = /* @__PURE__ */ succeed3(false);
var Latch = class {
  static {
    __name(this, "Latch");
  }
  waiters = [];
  scheduled = void 0;
  _isOpen;
  constructor(isOpen) {
    this._isOpen = isOpen;
  }
  scheduleUnsafe(fiber) {
    if (this.waiters.length === 0) {
      return succeedTrue;
    }
    if (this.scheduled === void 0) {
      this.scheduled = this.waiters;
      fiber.currentDispatcher.scheduleTask(this.flushScheduled, 0);
    } else {
      for (let i = 0; i < this.waiters.length; i++) {
        this.scheduled.push(this.waiters[i]);
      }
    }
    this.waiters = [];
    return succeedTrue;
  }
  flushScheduled = /* @__PURE__ */ __name(() => {
    if (this.scheduled === void 0)
      return;
    const waiters = this.scheduled;
    this.scheduled = void 0;
    for (let i = 0; i < waiters.length; i++) {
      waiters[i](exitVoid);
    }
  }, "flushScheduled");
  flushWaiters() {
    const waiters = this.waiters;
    this.waiters = [];
    this.flushScheduled();
    for (let i = 0; i < waiters.length; i++) {
      waiters[i](exitVoid);
    }
  }
  open = /* @__PURE__ */ withFiber((fiber) => {
    if (this._isOpen)
      return succeedFalse;
    this._isOpen = true;
    return this.scheduleUnsafe(fiber);
  });
  release = /* @__PURE__ */ withFiber((fiber) => this._isOpen ? succeedFalse : this.scheduleUnsafe(fiber));
  openUnsafe() {
    if (this._isOpen)
      return false;
    this._isOpen = true;
    this.flushWaiters();
    return true;
  }
  await = /* @__PURE__ */ callback((resume) => {
    if (this._isOpen) {
      return resume(void_);
    }
    this.waiters.push(resume);
    return sync(() => {
      let index = this.waiters.indexOf(resume);
      if (index !== -1) {
        this.waiters.splice(index, 1);
      } else if (this.scheduled !== void 0) {
        index = this.scheduled.indexOf(resume);
        if (index !== -1) {
          this.scheduled.splice(index, 1);
        }
      }
    });
  });
  closeUnsafe() {
    if (!this._isOpen)
      return false;
    this._isOpen = false;
    return true;
  }
  close = /* @__PURE__ */ sync(() => this.closeUnsafe());
  whenOpen = /* @__PURE__ */ __name((self) => flatMap2(this.await, () => self), "whenOpen");
  isOpen() {
    return this._isOpen;
  }
};
var makeLatchUnsafe = /* @__PURE__ */ __name((open) => new Latch(open ?? false), "makeLatchUnsafe");
var bigint02 = /* @__PURE__ */ BigInt(0);
var NoopSpanProto = {
  _tag: "Span",
  spanId: "noop",
  traceId: "noop",
  sampled: false,
  status: {
    _tag: "Ended",
    startTime: bigint02,
    endTime: bigint02,
    exit: exitVoid
  },
  attributes: /* @__PURE__ */ new Map(),
  links: [],
  kind: "internal",
  attribute() {
  },
  event() {
  },
  end() {
  },
  addLinks() {
  }
};
var noopSpan = /* @__PURE__ */ __name((options) => Object.assign(Object.create(NoopSpanProto), options), "noopSpan");
var filterDisablePropagation = /* @__PURE__ */ __name((span) => {
  if (!span)
    return none2();
  return get(span.annotations, DisablePropagation) ? span._tag === "Span" ? filterDisablePropagation(getOrUndefined(span.parent)) : none2() : some2(span);
}, "filterDisablePropagation");
var makeSpanUnsafe = /* @__PURE__ */ __name((fiber, name, options) => {
  const disablePropagation = !fiber.getRef(TracerEnabled) || options?.annotations && get(options.annotations, DisablePropagation);
  const parent = options?.parent !== void 0 ? some2(options.parent) : options?.root ? none2() : filterDisablePropagation(fiber.currentSpan);
  let span;
  if (disablePropagation) {
    span = noopSpan({
      name,
      parent,
      annotations: add(options?.annotations ?? empty(), DisablePropagation, true)
    });
  } else {
    const tracer = fiber.getRef(Tracer);
    const clock = fiber.getRef(ClockRef);
    const timingEnabled = fiber.getRef(TracerTimingEnabled);
    const annotationsFromEnv = fiber.getRef(TracerSpanAnnotations);
    const linksFromEnv = fiber.getRef(TracerSpanLinks);
    const level = options?.level ?? fiber.getRef(CurrentTraceLevel);
    const links = options?.links !== void 0 ? [...linksFromEnv, ...options.links] : linksFromEnv.slice();
    span = tracer.span({
      name,
      parent,
      annotations: options?.annotations ?? empty(),
      links,
      startTime: timingEnabled ? clock.currentTimeNanosUnsafe() : BigInt(0),
      kind: options?.kind ?? "internal",
      root: options?.root ?? isNone2(parent),
      sampled: options?.sampled ?? (isSome2(parent) && parent.value.sampled === false ? false : !isLogLevelGreaterThan(fiber.getRef(MinimumTraceLevel), level))
    });
    for (const [key, value3] of Object.entries(annotationsFromEnv)) {
      span.attribute(key, value3);
    }
    if (options?.attributes !== void 0) {
      for (const [key, value3] of Object.entries(options.attributes)) {
        span.attribute(key, value3);
      }
    }
  }
  return span;
}, "makeSpanUnsafe");
var ClockRef = /* @__PURE__ */ Reference("effect/Clock", {
  defaultValue: /* @__PURE__ */ __name(() => new ClockImpl(), "defaultValue")
});
var MAX_TIMER_MILLIS = 2 ** 31 - 1;
var ClockImpl = class {
  static {
    __name(this, "ClockImpl");
  }
  currentTimeMillisUnsafe() {
    return Date.now();
  }
  currentTimeMillis = /* @__PURE__ */ sync(() => this.currentTimeMillisUnsafe());
  currentTimeNanosUnsafe() {
    return wallTimeNanos();
  }
  currentTimeNanos = /* @__PURE__ */ sync(() => this.currentTimeNanosUnsafe());
  monotonicTimeNanosUnsafe() {
    return monotonicNowNanos();
  }
  monotonicTimeNanos = /* @__PURE__ */ sync(() => this.monotonicTimeNanosUnsafe());
  sleep(duration) {
    return this.sleepMillis(toMillis(duration));
  }
  sleepMillis(millis2) {
    if (millis2 <= 0)
      return yieldNow;
    else if (!Number.isFinite(millis2))
      return never;
    return callback((resume) => {
      const continuation = millis2 > MAX_TIMER_MILLIS ? this.sleepMillis(millis2 - MAX_TIMER_MILLIS) : void_;
      const handle = setTimeout(() => resume(continuation), Math.min(millis2, MAX_TIMER_MILLIS));
      return sync(() => clearTimeout(handle));
    });
  }
};
var nanosPerMilli = /* @__PURE__ */ BigInt(1e6);
var monotonicNowNanos = /* @__PURE__ */ (function() {
  const processHrtime = globalThis.process?.hrtime;
  if (typeof processHrtime?.bigint === "function") {
    return () => processHrtime.bigint();
  }
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return () => BigInt(Math.round(performance.now() * 1e6));
  }
  let previous = /* @__PURE__ */ BigInt(0);
  return () => {
    const current = BigInt(Date.now()) * nanosPerMilli;
    if (current > previous) {
      previous = current;
    }
    return previous;
  };
})();
var wallTimeNanos = /* @__PURE__ */ (function() {
  const reanchorThresholdNanos = /* @__PURE__ */ BigInt(1e9);
  let origin;
  return () => {
    const monotonic = monotonicNowNanos();
    const wall = BigInt(Date.now()) * nanosPerMilli;
    if (origin === void 0) {
      origin = wall - monotonic;
    } else {
      const projected = origin + monotonic;
      const skew = wall > projected ? wall - projected : projected - wall;
      if (skew > reanchorThresholdNanos) {
        origin = wall - monotonic;
      }
    }
    return origin + monotonic;
  };
})();
var clockWith = /* @__PURE__ */ __name((f) => withFiber((fiber) => f(fiber.getRef(ClockRef))), "clockWith");
var currentTimeMillis = /* @__PURE__ */ clockWith((clock) => clock.currentTimeMillis);
var IllegalArgumentErrorTypeId = "~effect/Cause/IllegalArgumentError";
var IllegalArgumentError = class extends (/* @__PURE__ */ TaggedError("IllegalArgumentError")) {
  static {
    __name(this, "IllegalArgumentError");
  }
  [IllegalArgumentErrorTypeId] = IllegalArgumentErrorTypeId;
  constructor(message) {
    super({
      message
    });
  }
};
var AsyncFiberErrorTypeId = "~effect/Cause/AsyncFiberError";
var AsyncFiberError = class extends (/* @__PURE__ */ TaggedError("AsyncFiberError")) {
  static {
    __name(this, "AsyncFiberError");
  }
  [AsyncFiberErrorTypeId] = AsyncFiberErrorTypeId;
  constructor(fiber) {
    super({
      message: "An asynchronous Effect was executed with Effect.runSync",
      fiber
    });
  }
};
var UnknownErrorTypeId = "~effect/Cause/UnknownError";
var UnknownError = class extends (/* @__PURE__ */ TaggedError("UnknownError")) {
  static {
    __name(this, "UnknownError");
  }
  [UnknownErrorTypeId] = UnknownErrorTypeId;
  constructor(cause, message) {
    super({
      message,
      cause
    });
  }
};
var ConsoleRef = /* @__PURE__ */ Reference("effect/Console/CurrentConsole", {
  defaultValue: /* @__PURE__ */ __name(() => globalThis.console, "defaultValue")
});
var logLevelToOrder = /* @__PURE__ */ __name((level) => {
  switch (level) {
    case "All":
      return Number.MIN_SAFE_INTEGER;
    case "Fatal":
      return 5e4;
    case "Error":
      return 4e4;
    case "Warn":
      return 3e4;
    case "Info":
      return 2e4;
    case "Debug":
      return 1e4;
    case "Trace":
      return 0;
    case "None":
      return Number.MAX_SAFE_INTEGER;
  }
}, "logLevelToOrder");
var LogLevelOrder = /* @__PURE__ */ mapInput(Number2, logLevelToOrder);
var isLogLevelGreaterThan = /* @__PURE__ */ isGreaterThan(LogLevelOrder);
var CurrentLoggers = /* @__PURE__ */ Reference("effect/Loggers/CurrentLoggers", {
  defaultValue: /* @__PURE__ */ __name(() => /* @__PURE__ */ new Set([defaultLogger, tracerLogger]), "defaultValue")
});
var LogToStderr = /* @__PURE__ */ Reference("effect/Logger/LogToStderr", {
  defaultValue: constFalse
});
var LoggerTypeId = "~effect/Logger";
var LoggerProto = {
  [LoggerTypeId]: {
    _Message: identity,
    _Output: identity
  },
  pipe() {
    return pipeArguments(this, arguments);
  }
};
var loggerMake = /* @__PURE__ */ __name((log2) => {
  const self = Object.create(LoggerProto);
  self.log = log2;
  return self;
}, "loggerMake");
var formatLabel = /* @__PURE__ */ __name((key) => key.replace(/[\s="]/g, "_"), "formatLabel");
var formatLogSpan = /* @__PURE__ */ __name((self, now3) => {
  const label = formatLabel(self[0]);
  return `${label}=${now3 - self[1]}ms`;
}, "formatLogSpan");
var logWithLevel = /* @__PURE__ */ __name((level) => (...message) => {
  let cause = void 0;
  for (let i = 0, len = message.length; i < len; i++) {
    const msg = message[i];
    if (isCause(msg)) {
      if (cause) {
        message.splice(i, 1);
      } else {
        message = message.slice(0, i).concat(message.slice(i + 1));
      }
      cause = cause ? causeFromReasons(cause.reasons.concat(msg.reasons)) : msg;
      i--;
    }
  }
  if (cause === void 0) {
    cause = causeEmpty;
  }
  return withFiber((fiber) => {
    const logLevel = level ?? fiber.currentLogLevel;
    if (isLogLevelGreaterThan(fiber.minimumLogLevel, logLevel)) {
      return void_;
    }
    const clock = fiber.getRef(ClockRef);
    const loggers = fiber.getRef(CurrentLoggers);
    if (loggers.size > 0) {
      const date = new Date(clock.currentTimeMillisUnsafe());
      for (const logger2 of loggers) {
        logger2.log({
          cause,
          fiber,
          date,
          logLevel,
          message
        });
      }
    }
    return void_;
  });
}, "logWithLevel");
var colors = {
  bold: "1",
  red: "31",
  green: "32",
  yellow: "33",
  blue: "34",
  cyan: "36",
  white: "37",
  gray: "90",
  black: "30",
  bgBrightRed: "101"
};
var logLevelColors = {
  None: [],
  All: [],
  Trace: [colors.gray],
  Debug: [colors.blue],
  Info: [colors.green],
  Warn: [colors.yellow],
  Error: [colors.red],
  Fatal: [colors.bgBrightRed, colors.black]
};
var defaultDateFormat = /* @__PURE__ */ __name((date) => `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}:${date.getSeconds().toString().padStart(2, "0")}.${date.getMilliseconds().toString().padStart(3, "0")}`, "defaultDateFormat");
var defaultLogger = /* @__PURE__ */ loggerMake(({
  cause,
  date,
  fiber,
  logLevel,
  message
}) => {
  const message_ = Array.isArray(message) ? message.slice() : [message];
  if (cause.reasons.length > 0) {
    message_.push(causePretty(cause));
  }
  const now3 = date.getTime();
  const spans = fiber.getRef(CurrentLogSpans);
  let spanString = "";
  for (const span of spans) {
    spanString += ` ${formatLogSpan(span, now3)}`;
  }
  const annotations = fiber.getRef(CurrentLogAnnotations);
  if (Object.keys(annotations).length > 0) {
    message_.push(annotations);
  }
  const console2 = fiber.getRef(ConsoleRef);
  const log2 = fiber.getRef(LogToStderr) ? console2.error : console2.log;
  log2(`[${defaultDateFormat(date)}] ${logLevel.toUpperCase()} (#${fiber.id})${spanString}:`, ...message_);
});
var tracerLogger = /* @__PURE__ */ loggerMake(({
  cause,
  fiber,
  logLevel,
  message
}) => {
  const clock = fiber.getRef(ClockRef);
  const annotations = fiber.getRef(CurrentLogAnnotations);
  const span = fiber.currentSpan;
  if (span === void 0 || span._tag === "ExternalSpan")
    return;
  const attributes = {};
  for (const [key, value3] of Object.entries(annotations)) {
    assignProperty(attributes, key, value3);
  }
  attributes["effect.fiberId"] = fiber.id;
  attributes["effect.logLevel"] = logLevel.toUpperCase();
  if (cause.reasons.length > 0) {
    attributes["effect.cause"] = causePretty(cause);
  }
  span.event(toStringUnknown(Array.isArray(message) && message.length === 1 ? message[0] : message), clock.currentTimeNanosUnsafe(), attributes);
});
var withErrorReporting = /* @__PURE__ */ dual((args2) => isEffect(args2[0]), (self, options) => onError(self, (cause) => withFiber((fiber) => {
  reportCauseUnsafe(fiber, cause, options?.defectsOnly);
  return void_;
})));
var reportCauseUnsafe = /* @__PURE__ */ __name((fiber, cause, defectsOnly) => {
  const reporters = fiber.getRef(CurrentErrorReporters);
  if (reporters.size === 0)
    return;
  if (defectsOnly && !hasDies(cause))
    return;
  const opts = {
    cause,
    fiber,
    timestamp: fiber.getRef(ClockRef).currentTimeNanosUnsafe()
  };
  reporters.forEach((reporter) => reporter.report(opts));
}, "reportCauseUnsafe");
var TypeId5 = "~effect/Deferred";
var DeferredProto = {
  [TypeId5]: {
    _A: identity,
    _E: identity
  },
  pipe() {
    return pipeArguments(this, arguments);
  }
};
var makeUnsafe2 = /* @__PURE__ */ __name(() => {
  const self = Object.create(DeferredProto);
  self.resumes = void 0;
  self.effect = void 0;
  return self;
}, "makeUnsafe2");
var _await = /* @__PURE__ */ __name((self) => callback((resume) => {
  if (self.effect)
    return resume(self.effect);
  self.resumes ??= [];
  self.resumes.push(resume);
  return sync(() => {
    const index = self.resumes.indexOf(resume);
    self.resumes.splice(index, 1);
  });
}), "_await");
var completeWith = /* @__PURE__ */ dual(2, (self, effect2) => sync(() => doneUnsafe(self, effect2)));
var done2 = completeWith;
var doneUnsafe = /* @__PURE__ */ __name((self, effect2) => {
  if (self.effect)
    return false;
  self.effect = effect2;
  if (self.resumes) {
    for (let i = 0; i < self.resumes.length; i++) {
      self.resumes[i](effect2);
    }
    self.resumes = void 0;
  }
  return true;
}, "doneUnsafe");
var CurrentLogAnnotations2 = CurrentLogAnnotations;
var CurrentLogSpans2 = CurrentLogSpans;
var TracerEnabled2 = TracerEnabled;
var Scope = scopeTag;
var makeUnsafe3 = scopeMakeUnsafe;
var provide = provideScope;
var addFinalizerExit = scopeAddFinalizerExit;
var addFinalizer = scopeAddFinalizer;
var forkUnsafe2 = scopeForkUnsafe;
var close = scopeClose;
var closeUnsafe = scopeCloseUnsafe;
var TypeId6 = "~effect/Layer";
var MemoMapTypeId = "~effect/Layer/MemoMap";
var memoMapReuse = /* @__PURE__ */ __name((entry, scope) => {
  entry.observers++;
  return andThen(scopeAddFinalizerExit(scope, (exit22) => entry.finalizer(exit22)), entry.effect);
}, "memoMapReuse");
var LayerProto = {
  [TypeId6]: {
    _ROut: identity,
    _E: identity,
    _RIn: identity
  },
  pipe() {
    return pipeArguments(this, arguments);
  }
};
var fromBuildUnsafe = /* @__PURE__ */ __name((build3) => {
  const self = Object.create(LayerProto);
  self.build = build3;
  return self;
}, "fromBuildUnsafe");
var fromBuild = /* @__PURE__ */ __name((build3) => fromBuildUnsafe((memoMap, scope) => {
  const layerScope = forkUnsafe2(scope);
  return onExit(build3(memoMap, layerScope), (exit22) => exit22._tag === "Failure" ? close(layerScope, exit22) : void_);
}), "fromBuild");
var fromBuildMemo = /* @__PURE__ */ __name((build3) => {
  const self = fromBuild((memoMap, scope) => memoMap.getOrElseMemoize(self, scope, build3));
  return self;
}, "fromBuildMemo");
var memoMapBuild = /* @__PURE__ */ __name((memoMap, layer24, scope, build3) => {
  const layerScope = makeUnsafe3();
  const deferred = makeUnsafe2();
  const entry = {
    observers: 1,
    effect: _await(deferred),
    finalizer: /* @__PURE__ */ __name((exit22) => suspend(() => {
      entry.observers--;
      if (entry.observers === 0) {
        memoMap.map.delete(layer24);
        return close(layerScope, exit22);
      }
      return void_;
    }), "finalizer")
  };
  memoMap.map.set(layer24, entry);
  return scopeAddFinalizerExit(scope, entry.finalizer).pipe(flatMap2(() => build3(memoMap, layerScope)), onExit((exit22) => {
    entry.effect = exit22;
    return done2(deferred, exit22);
  }));
}, "memoMapBuild");
var MemoMapImpl = class {
  static {
    __name(this, "MemoMapImpl");
  }
  get [MemoMapTypeId]() {
    return MemoMapTypeId;
  }
  parent;
  constructor(parent) {
    this.parent = parent;
  }
  map = /* @__PURE__ */ new Map();
  get(layer24, scope) {
    const local = this.map.get(layer24);
    if (local) {
      return memoMapReuse(local, scope);
    }
    return this.parent?.get(layer24, scope);
  }
  getOrElseMemoize(layer24, scope, build3) {
    return suspend(() => {
      const existing = this.get(layer24, scope);
      if (existing) {
        return existing;
      }
      return memoMapBuild(this, layer24, scope, build3);
    });
  }
};
var makeMemoMapUnsafe = /* @__PURE__ */ __name(() => new MemoMapImpl(), "makeMemoMapUnsafe");
var forkMemoMapUnsafe = /* @__PURE__ */ __name((parent) => new MemoMapImpl(parent), "forkMemoMapUnsafe");
var CurrentMemoMap = class _CurrentMemoMap extends (/* @__PURE__ */ Service()("effect/Layer/CurrentMemoMap")) {
  static {
    __name(this, "CurrentMemoMap");
  }
  static forkOrCreate(self) {
    const current = getOrUndefined2(self, _CurrentMemoMap);
    return current ? forkMemoMapUnsafe(current) : makeMemoMapUnsafe();
  }
};
var buildWithMemoMap = /* @__PURE__ */ dual(3, (self, memoMap, scope) => provideService(map5(self.build(memoMap, scope), add(CurrentMemoMap, memoMap)), CurrentMemoMap, memoMap));
var build = /* @__PURE__ */ __name((self) => withFiber((fiber) => buildWithMemoMap(self, CurrentMemoMap.forkOrCreate(fiber.context), getUnsafe(fiber.context, Scope))), "build");
var buildWithScope = /* @__PURE__ */ dual(2, (self, scope) => withFiber((fiber) => buildWithMemoMap(self, CurrentMemoMap.forkOrCreate(fiber.context), scope)));
var succeed4 = /* @__PURE__ */ __name(function() {
  if (arguments.length === 1) {
    return (resource) => succeedContext(make3(arguments[0], resource));
  }
  return succeedContext(make3(arguments[0], arguments[1]));
}, "succeed4");
var succeedContext = /* @__PURE__ */ __name((context22) => fromBuildUnsafe(constant(succeed3(context22))), "succeedContext");
var effect = /* @__PURE__ */ __name(function() {
  if (arguments.length === 1) {
    return (effect2) => effectImpl(arguments[0], effect2);
  }
  return effectImpl(arguments[0], arguments[1]);
}, "effect");
var effectImpl = /* @__PURE__ */ __name((service, effect2) => effectContext(map5(effect2, (value3) => make3(service, value3))), "effectImpl");
var effectContext = /* @__PURE__ */ __name((effect2) => fromBuildMemo((_, scope) => provide(effect2, scope)), "effectContext");
var effectDiscard = /* @__PURE__ */ __name((effect2) => effectContext(as(effect2, empty())), "effectDiscard");
var mergeAllEffect = /* @__PURE__ */ __name((layers, memoMap, scope) => {
  const parentScope = forkUnsafe2(scope, "parallel");
  return forEach(layers, (layer24) => layer24.build(memoMap, forkUnsafe2(parentScope, "sequential")), {
    concurrency: layers.length
  }).pipe(map5((context22) => mergeAll(...context22)));
}, "mergeAllEffect");
var mergeAll2 = /* @__PURE__ */ __name((...layers) => fromBuild((memoMap, scope) => mergeAllEffect(layers, memoMap, scope)), "mergeAll2");
var provideWith = /* @__PURE__ */ __name((self, that, f) => fromBuild((memoMap, scope) => flatMap2(Array.isArray(that) ? mergeAllEffect(that, memoMap, scope) : that.build(memoMap, scope), (context22) => self.build(memoMap, scope).pipe(provideContext(context22), map5((merged) => f(merged, context22))))), "provideWith");
var provide2 = /* @__PURE__ */ dual(2, (self, that) => provideWith(self, that, identity));
var provideMerge = /* @__PURE__ */ dual(2, (self, that) => provideWith(self, that, (self2, that2) => merge(that2, self2)));
var succeed5 = exitSucceed;
var failCause2 = exitFailCause;
var fail4 = exitFail;
var void_2 = exitVoid;
var isSuccess3 = exitIsSuccess;
var isFailure3 = exitIsFailure;
var isCause2 = isCause;
var isReason = isCauseReason;
var isFailReason2 = isFailReason;
var fromReasons = causeFromReasons;
var empty3 = causeEmpty;
var makeFailReason = /* @__PURE__ */ __name((error) => new Fail(error), "makeFailReason");
var makeDieReason = /* @__PURE__ */ __name((defect) => new Die(defect), "makeDieReason");
var makeInterruptReason2 = makeInterruptReason;
var map6 = causeMap;
var squash = causeSquash;
var findError2 = findError;
var isNoSuchElementError2 = isNoSuchElementError;
var isDone2 = isDone;
var Done2 = Done;
var done3 = done;
var IllegalArgumentError2 = IllegalArgumentError;
var StackTrace = class extends (/* @__PURE__ */ Service()("effect/Cause/StackTrace")) {
  static {
    __name(this, "StackTrace");
  }
};
var Class3 = class extends Class {
  static {
    __name(this, "Class3");
  }
  constructor(props) {
    super();
    if (props) {
      assignProperties(this, props);
    }
  }
};
var TaggedClass = /* @__PURE__ */ __name((tag2) => class extends Class3 {
  _tag = tag2;
}, "TaggedClass");
var Error3 = Error2;
var TaggedError2 = TaggedError;
var Clock = ClockRef;
var currentTimeMillis2 = currentTimeMillis;
var TypeId7 = "~effect/time/DateTime";
var TimeZoneTypeId = "~effect/time/DateTime/TimeZone";
var Proto2 = {
  [TypeId7]: TypeId7,
  pipe() {
    return pipeArguments(this, arguments);
  },
  [NodeInspectSymbol]() {
    return this.toString();
  },
  toJSON() {
    return toDateUtc(this).toJSON();
  }
};
var ProtoUtc = {
  ...Proto2,
  _tag: "Utc",
  [symbol]() {
    return number(this.epochMilliseconds);
  },
  [symbol2](that) {
    return isDateTime(that) && that._tag === "Utc" && this.epochMilliseconds === that.epochMilliseconds;
  },
  toString() {
    return `DateTime.Utc(${toDateUtc(this).toJSON()})`;
  }
};
var ProtoZoned = {
  ...Proto2,
  _tag: "Zoned",
  [symbol]() {
    return combine(number(this.epochMilliseconds))(hash(this.zone));
  },
  [symbol2](that) {
    return isDateTime(that) && that._tag === "Zoned" && this.epochMilliseconds === that.epochMilliseconds && equals(this.zone, that.zone);
  },
  toString() {
    return `DateTime.Zoned(${formatIsoZoned(this)})`;
  }
};
var ProtoTimeZone = {
  [TimeZoneTypeId]: TimeZoneTypeId,
  [NodeInspectSymbol]() {
    return this.toString();
  }
};
var ProtoTimeZoneNamed = {
  ...ProtoTimeZone,
  _tag: "Named",
  [symbol]() {
    return string(`Named:${this.id}`);
  },
  [symbol2](that) {
    return isTimeZone(that) && that._tag === "Named" && this.id === that.id;
  },
  toString() {
    return `TimeZone.Named(${this.id})`;
  },
  toJSON() {
    return {
      _id: "TimeZone",
      _tag: "Named",
      id: this.id
    };
  }
};
var ProtoTimeZoneOffset = {
  ...ProtoTimeZone,
  _tag: "Offset",
  [symbol]() {
    return string(`Offset:${this.offset}`);
  },
  [symbol2](that) {
    return isTimeZone(that) && that._tag === "Offset" && this.offset === that.offset;
  },
  toString() {
    return `TimeZone.Offset(${offsetToString(this.offset)})`;
  },
  toJSON() {
    return {
      _id: "TimeZone",
      _tag: "Offset",
      offset: this.offset
    };
  }
};
var isDateTime = /* @__PURE__ */ __name((u) => hasProperty(u, TypeId7), "isDateTime");
var isTimeZone = /* @__PURE__ */ __name((u) => hasProperty(u, TimeZoneTypeId), "isTimeZone");
var isUtc = /* @__PURE__ */ __name((self) => self._tag === "Utc", "isUtc");
var Equivalence2 = /* @__PURE__ */ make((a, b) => a.epochMilliseconds === b.epochMilliseconds);
var Order = /* @__PURE__ */ make2((self, that) => self.epochMilliseconds < that.epochMilliseconds ? -1 : self.epochMilliseconds > that.epochMilliseconds ? 1 : 0);
var makeUtc = /* @__PURE__ */ __name((epochMillis) => {
  const self = Object.create(ProtoUtc);
  self.epochMilliseconds = epochMillis;
  Object.defineProperty(self, "partsUtc", {
    value: void 0,
    enumerable: false,
    writable: true
  });
  return self;
}, "makeUtc");
var fromDateUnsafe = /* @__PURE__ */ __name((date) => {
  const epochMillis = date.getTime();
  if (Number.isNaN(epochMillis)) {
    throw new IllegalArgumentError2("Invalid date");
  }
  return makeUtc(epochMillis);
}, "fromDateUnsafe");
var makeUnsafe4 = /* @__PURE__ */ __name((input) => {
  if (isDateTime(input)) {
    return input;
  } else if (input instanceof Date) {
    return fromDateUnsafe(input);
  } else if (typeof input === "object") {
    if ("epochMilliseconds" in input) {
      return fromDateUnsafe(new Date(input.epochMilliseconds));
    }
    const date = /* @__PURE__ */ new Date(0);
    setPartsDate(date, input);
    return fromDateUnsafe(date);
  } else if (typeof input === "string" && !hasZone(input)) {
    return fromDateUnsafe(/* @__PURE__ */ new Date(input + "Z"));
  }
  return fromDateUnsafe(new Date(input));
}, "makeUnsafe4");
var hasZone = /* @__PURE__ */ __name((input) => /Z|GMT|[+-]\d{2}$|[+-]\d{2}:?\d{2}$|\]$/.test(input), "hasZone");
var minEpochMillis = -864e13 + 12 * 60 * 60 * 1e3;
var maxEpochMillis = 864e13 - 14 * 60 * 60 * 1e3;
var make6 = /* @__PURE__ */ liftThrowable(makeUnsafe4);
var now = /* @__PURE__ */ map5(currentTimeMillis2, makeUtc);
var toUtc = /* @__PURE__ */ __name((self) => makeUtc(self.epochMilliseconds), "toUtc");
var toDateUtc = /* @__PURE__ */ __name((self) => new Date(self.epochMilliseconds), "toDateUtc");
var toDate = /* @__PURE__ */ __name((self) => {
  if (self._tag === "Utc") {
    return new Date(self.epochMilliseconds);
  } else if (self.zone._tag === "Offset") {
    return new Date(self.epochMilliseconds + self.zone.offset);
  } else if (self.adjustedEpochMilliseconds !== void 0) {
    return new Date(self.adjustedEpochMilliseconds);
  }
  const parts = self.zone.format.formatToParts(self.epochMilliseconds).filter((_) => _.type !== "literal");
  const date = /* @__PURE__ */ new Date(0);
  date.setUTCFullYear(Number(parts[2].value), Number(parts[0].value) - 1, Number(parts[1].value));
  date.setUTCHours(Number(parts[3].value), Number(parts[4].value), Number(parts[5].value), Number(parts[6].value));
  self.adjustedEpochMilliseconds = date.getTime();
  return date;
}, "toDate");
var zonedOffset = /* @__PURE__ */ __name((self) => {
  const date = toDate(self);
  return date.getTime() - toEpochMillis(self);
}, "zonedOffset");
var offsetToString = /* @__PURE__ */ __name((offset) => {
  const abs = Math.abs(offset);
  let hours2 = Math.floor(abs / (60 * 60 * 1e3));
  let minutes2 = Math.round(abs % (60 * 60 * 1e3) / (60 * 1e3));
  if (minutes2 === 60) {
    hours2 += 1;
    minutes2 = 0;
  }
  return `${offset < 0 ? "-" : "+"}${String(hours2).padStart(2, "0")}:${String(minutes2).padStart(2, "0")}`;
}, "offsetToString");
var zonedOffsetIso = /* @__PURE__ */ __name((self) => offsetToString(zonedOffset(self)), "zonedOffsetIso");
var toEpochMillis = /* @__PURE__ */ __name((self) => self.epochMilliseconds, "toEpochMillis");
var setPartsDate = /* @__PURE__ */ __name((date, parts) => {
  if (parts.year !== void 0) {
    date.setUTCFullYear(parts.year);
  }
  if (parts.month !== void 0) {
    date.setUTCMonth(parts.month - 1);
  }
  if (parts.day !== void 0) {
    date.setUTCDate(parts.day);
  }
  if (parts.weekDay !== void 0) {
    const diff = parts.weekDay - date.getUTCDay();
    date.setUTCDate(date.getUTCDate() + diff);
  }
  if (parts.hour !== void 0) {
    date.setUTCHours(parts.hour);
  }
  if (parts.minute !== void 0) {
    date.setUTCMinutes(parts.minute);
  }
  if (parts.second !== void 0) {
    date.setUTCSeconds(parts.second);
  }
  if (parts.millisecond !== void 0) {
    date.setUTCMilliseconds(parts.millisecond);
  }
}, "setPartsDate");
var constDayMillis = 24 * 60 * 60 * 1e3;
var formatIso = /* @__PURE__ */ __name((self) => toDateUtc(self).toISOString(), "formatIso");
var formatIsoOffset = /* @__PURE__ */ __name((self) => {
  const date = toDate(self);
  return self._tag === "Utc" ? date.toISOString() : `${date.toISOString().slice(0, -1)}${zonedOffsetIso(self)}`;
}, "formatIsoOffset");
var formatIsoZoned = /* @__PURE__ */ __name((self) => self.zone._tag === "Offset" ? formatIsoOffset(self) : `${formatIsoOffset(self)}[${self.zone.id}]`, "formatIsoZoned");
var catchDone = /* @__PURE__ */ dual(2, (effect2, f) => catchCauseFilter(effect2, filterDoneLeftover, (l) => f(l)));
var isDoneCause = /* @__PURE__ */ __name((cause) => cause.reasons.some(isDoneFailure), "isDoneCause");
var isDoneFailure = /* @__PURE__ */ __name((failure) => failure._tag === "Fail" && isDone2(failure.error), "isDoneFailure");
var filterDone = /* @__PURE__ */ composePassthrough(findError2, (e) => isDone2(e) ? succeed2(e) : fail2(e));
var filterDoneLeftover = /* @__PURE__ */ composePassthrough(findError2, (e) => isDone2(e) ? succeed2(e.value) : fail2(e));
var doneExitFromCause = /* @__PURE__ */ __name((cause) => {
  const halt = filterDone(cause);
  return !isFailure2(halt) ? succeed5(halt.success.value) : failCause2(halt.failure);
}, "doneExitFromCause");
var isEffect2 = isEffect;
var all2 = all;
var whileLoop2 = whileLoop;
var promise2 = promise;
var tryPromise2 = tryPromise;
var succeed6 = succeed3;
var succeedNone2 = succeedNone;
var suspend2 = suspend;
var sync2 = sync;
var void_3 = void_;
var gen2 = gen;
var fail5 = fail3;
var failCause3 = failCause;
var failCauseSync2 = failCauseSync;
var die2 = die;
var try_2 = try_;
var withFiber2 = withFiber;
var fromResult2 = fromResult;
var flatMap3 = flatMap2;
var flatten4 = flatten3;
var andThen2 = andThen;
var result2 = result;
var exit2 = exit;
var map7 = map5;
var as2 = as;
var asVoid2 = asVoid;
var catch_2 = catch_;
var catchTag2 = catchTag;
var catchTags2 = catchTags;
var catchCause2 = catchCause;
var mapError3 = mapError2;
var orDie2 = orDie;
var withErrorReporting2 = withErrorReporting;
var match5 = match4;
var matchCauseEffectEager2 = matchCauseEffectEager;
var matchCauseEffect2 = matchCauseEffect;
var context2 = context;
var contextWith2 = contextWith;
var provideContext2 = provideContext;
var updateContext2 = updateContext;
var provideService2 = provideService;
var scopedWith2 = scopedWith;
var onError2 = onError;
var onExitPrimitive2 = onExitPrimitive;
var onExit2 = onExit;
var cached2 = cached;
var interruptible2 = interruptible;
var uninterruptible2 = uninterruptible;
var forever2 = forever;
var forkIn2 = forkIn;
var runFork2 = runFork;
var runForkWith2 = runForkWith;
var runPromise2 = runPromise;
var runSync2 = runSync;
var runSyncExit2 = runSyncExit;
var fnUntraced2 = fnUntraced;
var log = /* @__PURE__ */ logWithLevel();
var annotateLogs = /* @__PURE__ */ dual((args2) => isEffect2(args2[0]), (effect2, ...args2) => updateService(effect2, CurrentLogAnnotations2, (annotations) => {
  const newAnnotations = args2.length === 1 ? {
    ...annotations,
    ...args2[0]
  } : {
    ...annotations
  };
  if (args2.length === 1) {
    return newAnnotations;
  } else {
    assignProperty(newAnnotations, args2[0], args2[1]);
  }
  return newAnnotations;
}));
var withLogSpan = /* @__PURE__ */ dual(2, (effect2, label) => flatMap2(currentTimeMillis, (now22) => updateService(effect2, CurrentLogSpans2, (spans) => {
  const span = [label, now22];
  return [span, ...spans];
})));
var mapEager2 = mapEager;
var mapErrorEager2 = mapErrorEager;
var mapBothEager2 = mapBothEager;
var flatMapEager2 = flatMapEager;
var fnUntracedEager2 = fnUntracedEager;
var EncodingErrorTypeId = "~effect/encoding/EncodingError";
var EncodingError = class extends (/* @__PURE__ */ TaggedError2("EncodingError")) {
  static {
    __name(this, "EncodingError");
  }
  [EncodingErrorTypeId] = EncodingErrorTypeId;
};
var encodeBase64 = /* @__PURE__ */ __name((input) => typeof input === "string" ? base64EncodeUint8Array(encoder.encode(input)) : base64EncodeUint8Array(input), "encodeBase64");
var decodeBase64 = /* @__PURE__ */ __name((str) => {
  const stripped = stripCrlf(str);
  const length = stripped.length;
  if (length % 4 !== 0) {
    return fail2(new EncodingError({
      kind: "Decode",
      module: "Base64",
      input: stripped,
      message: `Length must be a multiple of 4, but is ${length}`
    }));
  }
  const index = stripped.indexOf("=");
  if (index !== -1 && (index < length - 2 || index === length - 2 && stripped[length - 1] !== "=")) {
    return fail2(new EncodingError({
      kind: "Decode",
      module: "Base64",
      input: stripped,
      message: `Found a '=' character, but it is not at the end`
    }));
  }
  try {
    const missingOctets = stripped.endsWith("==") ? 2 : stripped.endsWith("=") ? 1 : 0;
    const result3 = new Uint8Array(3 * (length / 4) - missingOctets);
    for (let i = 0, j = 0; i < length; i += 4, j += 3) {
      const buffer = getBase64Code(stripped.charCodeAt(i)) << 18 | getBase64Code(stripped.charCodeAt(i + 1)) << 12 | getBase64Code(stripped.charCodeAt(i + 2)) << 6 | getBase64Code(stripped.charCodeAt(i + 3));
      result3[j] = buffer >> 16;
      result3[j + 1] = buffer >> 8 & 255;
      result3[j + 2] = buffer & 255;
    }
    return succeed2(result3);
  } catch (e) {
    return fail2(new EncodingError({
      kind: "Decode",
      module: "Base64",
      input: stripped,
      message: e instanceof Error ? e.message : "Invalid input"
    }));
  }
}, "decodeBase64");
var decodeBase64String = /* @__PURE__ */ __name((str) => map2(decodeBase64(str), (_) => decoder.decode(_)), "decodeBase64String");
var encoder = /* @__PURE__ */ new TextEncoder();
var decoder = /* @__PURE__ */ new TextDecoder();
var stripCrlf = /* @__PURE__ */ __name((str) => str.replace(/[\n\r]/g, ""), "stripCrlf");
var base64EncodeUint8Array = /* @__PURE__ */ __name((bytes) => {
  const length = bytes.length;
  let result3 = "";
  let i;
  for (i = 2; i < length; i += 3) {
    result3 += base64abc[bytes[i - 2] >> 2];
    result3 += base64abc[(bytes[i - 2] & 3) << 4 | bytes[i - 1] >> 4];
    result3 += base64abc[(bytes[i - 1] & 15) << 2 | bytes[i] >> 6];
    result3 += base64abc[bytes[i] & 63];
  }
  if (i === length + 1) {
    result3 += base64abc[bytes[i - 2] >> 2];
    result3 += base64abc[(bytes[i - 2] & 3) << 4];
    result3 += "==";
  }
  if (i === length) {
    result3 += base64abc[bytes[i - 2] >> 2];
    result3 += base64abc[(bytes[i - 2] & 3) << 4 | bytes[i - 1] >> 4];
    result3 += base64abc[(bytes[i - 1] & 15) << 2];
    result3 += "=";
  }
  return result3;
}, "base64EncodeUint8Array");
function getBase64Code(charCode) {
  if (charCode >= base64codes.length) {
    throw new TypeError(`Invalid character ${String.fromCharCode(charCode)}`);
  }
  const code = base64codes[charCode];
  if (code === 255) {
    throw new TypeError(`Invalid character ${String.fromCharCode(charCode)}`);
  }
  return code;
}
__name(getBase64Code, "getBase64Code");
var base64abc = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "+", "/"];
var base64codes = [255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 62, 255, 255, 255, 63, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 255, 255, 255, 0, 255, 255, 255, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 255, 255, 255, 255, 255, 255, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51];
var join = fiberJoin;
var interrupt2 = fiberInterrupt;
var getCurrent = getCurrentFiber;
var runIn = fiberRunIn;
var redactedRegistry = /* @__PURE__ */ new WeakMap();
var value = /* @__PURE__ */ __name((self) => {
  if (redactedRegistry.has(self)) {
    return redactedRegistry.get(self);
  } else {
    throw new Error("Unable to get redacted value" + (self.label ? ` with label: "${self.label}"` : ""));
  }
}, "value");
var TypeId8 = "~effect/data/Redacted";
var isRedacted = /* @__PURE__ */ __name((u) => hasProperty(u, TypeId8), "isRedacted");
var make7 = /* @__PURE__ */ __name((value22, options) => {
  const self = Object.create(Proto3);
  if (options?.label) {
    self.label = options.label;
  }
  redactedRegistry.set(self, value22);
  return self;
}, "make7");
var Proto3 = {
  [TypeId8]: {
    _A: /* @__PURE__ */ __name((_) => _, "_A")
  },
  label: void 0,
  ...PipeInspectableProto,
  toJSON() {
    return this.toString();
  },
  toString() {
    return `<redacted${isString(this.label) ? ":" + this.label : ""}>`;
  },
  [symbol]() {
    return hash(redactedRegistry.get(this));
  },
  [symbol2](that) {
    return isRedacted(that) && equals(redactedRegistry.get(this), redactedRegistry.get(that));
  }
};
var value2 = value;
var isDateTime2 = isDateTime;
var isUtc2 = isUtc;
var Equivalence3 = Equivalence2;
var Order2 = Order;
var fromDateUnsafe2 = fromDateUnsafe;
var make8 = make6;
var now2 = now;
var toUtc2 = toUtc;
var toDateUtc2 = toDateUtc;
var formatIso2 = formatIso;
function resolve(ast) {
  return ast.checks ? ast.checks[ast.checks.length - 1].annotations : ast.annotations;
}
__name(resolve, "resolve");
function resolveAt(key) {
  return (ast) => resolve(ast)?.[key];
}
__name(resolveAt, "resolveAt");
var STRUCTURAL_ANNOTATION_KEY = "~structural";
var IDENTIFIER_FALLBACK_KEY = "~identifier";
var SENTINELS_ANNOTATION_KEY = "~sentinels";
var CONSTRUCTOR_ANNOTATION_KEY = "~constructor";
var jsonSchemaAnnotationKeys = ["title", "description", "default", "examples", "readOnly", "writeOnly", "format", "contentEncoding", "contentMediaType", "contentSchema"];
var resolveIdentifier = /* @__PURE__ */ resolveAt("identifier");
var resolveIdentifierFallback = /* @__PURE__ */ resolveAt(IDENTIFIER_FALLBACK_KEY);
var resolveDescription = /* @__PURE__ */ resolveAt("description");
var resolveBrands = /* @__PURE__ */ resolveAt("brands");
var getExpected = /* @__PURE__ */ memoize((ast) => {
  const identifier2 = resolveIdentifier(ast);
  if (typeof identifier2 === "string")
    return identifier2;
  return ast.getExpected(getExpected);
});
var annotationExcludedKeys = /* @__PURE__ */ new Set([SENTINELS_ANNOTATION_KEY, STRUCTURAL_ANNOTATION_KEY, "representation", "arbitrary", "brands", "toJsonSchema", "toCode", "toArbitrary", "toEquivalence", "toFormatter", "toCodec", "toCodecJson", "toCodecStringTree", "toCodecIso"]);
var TypeId9 = "~effect/SchemaIssue/Issue";
function isIssue(u) {
  return hasProperty(u, TypeId9) && u[TypeId9] === TypeId9;
}
__name(isIssue, "isIssue");
var Base = class {
  static {
    __name(this, "Base");
  }
  [TypeId9] = TypeId9;
  toString() {
    return defaultFormatter(this);
  }
};
var Filter = class extends Base {
  static {
    __name(this, "Filter");
  }
  _tag = "Filter";
  filter;
  issue;
  constructor(filter3, issue) {
    super();
    this.filter = filter3;
    this.issue = issue;
  }
};
var Encoding = class extends Base {
  static {
    __name(this, "Encoding");
  }
  _tag = "Encoding";
  ast;
  issue;
  constructor(ast, issue) {
    super();
    this.ast = ast;
    this.issue = issue;
  }
};
var Pointer = class extends Base {
  static {
    __name(this, "Pointer");
  }
  _tag = "Pointer";
  path;
  issue;
  constructor(path, issue) {
    super();
    this.path = path;
    this.issue = issue;
  }
};
var MissingKey = class extends Base {
  static {
    __name(this, "MissingKey");
  }
  _tag = "MissingKey";
  annotations;
  constructor(annotations) {
    super();
    this.annotations = annotations;
  }
};
var UnexpectedKey = class extends Base {
  static {
    __name(this, "UnexpectedKey");
  }
  _tag = "UnexpectedKey";
  ast;
  constructor(ast) {
    super();
    this.ast = ast;
  }
};
var Composite = class extends Base {
  static {
    __name(this, "Composite");
  }
  _tag = "Composite";
  ast;
  issues;
  constructor(ast, issues) {
    super();
    this.ast = ast;
    this.issues = issues;
  }
};
var InvalidType = class extends Base {
  static {
    __name(this, "InvalidType");
  }
  _tag = "InvalidType";
  ast;
  constructor(ast) {
    super();
    this.ast = ast;
  }
};
var InvalidValue = class extends Base {
  static {
    __name(this, "InvalidValue");
  }
  _tag = "InvalidValue";
  annotations;
  constructor(annotations) {
    super();
    this.annotations = annotations;
  }
};
var Forbidden = class extends Base {
  static {
    __name(this, "Forbidden");
  }
  _tag = "Forbidden";
  annotations;
  constructor(annotations) {
    super();
    this.annotations = annotations;
  }
};
var AnyOf = class extends Base {
  static {
    __name(this, "AnyOf");
  }
  _tag = "AnyOf";
  ast;
  issues;
  constructor(ast, issues) {
    super();
    this.ast = ast;
    this.issues = issues;
  }
};
var OneOf = class extends Base {
  static {
    __name(this, "OneOf");
  }
  _tag = "OneOf";
  ast;
  successes;
  constructor(ast, successes) {
    super();
    this.ast = ast;
    this.successes = successes;
  }
};
function makeFilterIssue(entry) {
  if (isIssue(entry)) {
    return entry;
  }
  if (typeof entry === "string") {
    return new InvalidValue({
      message: entry
    });
  }
  const inner = typeof entry.issue === "string" ? new InvalidValue({
    message: entry.issue
  }) : entry.issue;
  return new Pointer(entry.path, inner);
}
__name(makeFilterIssue, "makeFilterIssue");
function makeSingle(out) {
  if (out === void 0) {
    return;
  }
  if (typeof out === "boolean") {
    return out ? void 0 : new InvalidValue();
  }
  return makeFilterIssue(out);
}
__name(makeSingle, "makeSingle");
function normalizeFilterOutput(ast, out) {
  if (Array.isArray(out)) {
    if (!isReadonlyArrayNonEmpty(out)) {
      return;
    }
    return out.length === 1 ? makeFilterIssue(out[0]) : new Composite(ast, map4(out, makeFilterIssue));
  }
  return makeSingle(out);
}
__name(normalizeFilterOutput, "normalizeFilterOutput");
var defaultLeafHook = /* @__PURE__ */ __name((issue) => {
  const message = findMessage(issue);
  if (message !== void 0)
    return message;
  switch (issue._tag) {
    case "InvalidType":
      return getExpectedMessage(getExpected(issue.ast));
    case "InvalidValue":
      return "Expected a valid value";
    case "MissingKey":
      return "Missing key";
    case "UnexpectedKey":
      return "Expected no excess property";
    case "Forbidden":
      return "Forbidden operation";
    case "OneOf":
      return "Expected exactly one member to match";
  }
}, "defaultLeafHook");
var defaultCheckHook = /* @__PURE__ */ __name((issue) => {
  return findMessage(issue.issue) ?? findMessage(issue);
}, "defaultCheckHook");
function getExpectedMessage(expected) {
  return `Expected ${expected}`;
}
__name(getExpectedMessage, "getExpectedMessage");
function toDefaultIssues(issue, path, leafHook, checkHook) {
  switch (issue._tag) {
    case "Filter": {
      const message = checkHook(issue);
      if (message !== void 0) {
        return [{
          path,
          message
        }];
      }
      switch (issue.issue._tag) {
        case "InvalidValue":
          return [{
            path,
            message: getExpectedMessage(formatCheck(issue.filter))
          }];
        default:
          return toDefaultIssues(issue.issue, path, leafHook, checkHook);
      }
    }
    case "Encoding":
      return toDefaultIssues(issue.issue, path, leafHook, checkHook);
    case "Pointer":
      return toDefaultIssues(issue.issue, [...path, ...issue.path], leafHook, checkHook);
    case "Composite":
      return issue.issues.flatMap((issue2) => toDefaultIssues(issue2, path, leafHook, checkHook));
    case "AnyOf": {
      if (issue.issues.length === 0) {
        return [{
          path,
          message: findMessage(issue) ?? getExpectedMessage(getExpected(issue.ast))
        }];
      }
      return issue.issues.flatMap((issue2) => toDefaultIssues(issue2, path, leafHook, checkHook));
    }
    default:
      return [{
        path,
        message: leafHook(issue)
      }];
  }
}
__name(toDefaultIssues, "toDefaultIssues");
function formatCheck(check) {
  const expected = check.annotations?.expected;
  if (typeof expected === "string")
    return expected;
  switch (check._tag) {
    case "Filter":
      return "<filter>";
    case "FilterGroup":
      return check.checks.map((check2) => formatCheck(check2)).join(" & ");
  }
}
__name(formatCheck, "formatCheck");
function makeFormatterDefault() {
  return (issue) => toDefaultIssues(issue, [], defaultLeafHook, defaultCheckHook).map(formatDefaultIssue).join(`
`);
}
__name(makeFormatterDefault, "makeFormatterDefault");
var defaultFormatter = /* @__PURE__ */ makeFormatterDefault();
function formatDefaultIssue(issue) {
  let out = issue.message;
  if (issue.path && issue.path.length > 0) {
    const path = formatPath(issue.path);
    out += `
  at ${path}`;
  }
  return out;
}
__name(formatDefaultIssue, "formatDefaultIssue");
function findMessage(issue) {
  switch (issue._tag) {
    case "InvalidType":
    case "OneOf":
    case "Composite":
    case "AnyOf":
      return getMessageAnnotation(issue.ast.annotations);
    case "InvalidValue":
    case "Forbidden":
      return getMessageAnnotation(issue.annotations);
    case "MissingKey":
      return getMessageAnnotation(issue.annotations, "messageMissingKey");
    case "UnexpectedKey":
      return getMessageAnnotation(issue.ast.annotations, "messageUnexpectedKey");
    case "Filter":
      return getMessageAnnotation(issue.filter.annotations);
    case "Encoding":
      return findMessage(issue.issue);
  }
}
__name(findMessage, "findMessage");
function getMessageAnnotation(annotations, type = "message") {
  const message = annotations?.[type];
  if (typeof message === "string")
    return message;
}
__name(getMessageAnnotation, "getMessageAnnotation");
function getSchemaIssue(cause) {
  let issue;
  for (const reason of cause.reasons) {
    if (!isFailReason2(reason) || !isIssue(reason.error)) {
      return;
    }
    issue ??= reason.error;
  }
  return issue;
}
__name(getSchemaIssue, "getSchemaIssue");
function getSchemaIssueOrThrow(cause, message) {
  const issue = getSchemaIssue(cause);
  if (issue === void 0) {
    throw new Error(message, {
      cause
    });
  }
  return issue;
}
__name(getSchemaIssueOrThrow, "getSchemaIssueOrThrow");
var missing = /* @__PURE__ */ Symbol();
var succeed7 = succeed5;
var missingExit = /* @__PURE__ */ succeed7(missing);
var sameExit = /* @__PURE__ */ succeed7(missing);
var toOption = /* @__PURE__ */ __name((value3) => value3 === missing ? none2() : some2(value3), "toOption");
var fromOptionExit = /* @__PURE__ */ __name((option2) => option2._tag === "None" ? missingExit : succeed7(option2.value), "fromOptionExit");
var Getter = class _Getter extends Class {
  static {
    __name(this, "Getter");
  }
  run;
  constructor(run3) {
    super();
    this.run = run3;
  }
  map(f) {
    return new _Getter((oe, options) => this.run(oe, options).pipe(mapEager2(map(f))));
  }
  compose(other) {
    if (isPassthrough(this)) {
      return other;
    }
    if (isPassthrough(other)) {
      return this;
    }
    return new _Getter((oe, options) => this.run(oe, options).pipe(flatMapEager2((ot) => other.run(ot, options))));
  }
};
var passthrough_ = /* @__PURE__ */ new Getter(succeed6);
function isPassthrough(getter) {
  return getter.run === passthrough_.run;
}
__name(isPassthrough, "isPassthrough");
function passthrough() {
  return passthrough_;
}
__name(passthrough, "passthrough");
function onSome(f) {
  return new Getter((oe, options) => isNone2(oe) ? succeedNone2 : f(oe.value, options));
}
__name(onSome, "onSome");
function transform(f) {
  return transformOptional(map(f));
}
__name(transform, "transform");
function transformOrFail(f) {
  return onSome((e, options) => f(e, options).pipe(mapEager2(some2)));
}
__name(transformOrFail, "transformOrFail");
function transformOptional(f) {
  return new Getter((oe) => succeed6(f(oe)));
}
__name(transformOptional, "transformOptional");
function withDefault(defaultValue) {
  return new Getter((o) => {
    const filtered = filter(o, isNotUndefined);
    return isSome2(filtered) ? succeed6(filtered) : mapEager2(defaultValue, some2);
  });
}
__name(withDefault, "withDefault");
function String2() {
  return transform(globalThis.String);
}
__name(String2, "String2");
function Number3() {
  return transform(globalThis.Number);
}
__name(Number3, "Number3");
function parseJson(options) {
  return onSome((input) => try_2({
    try: /* @__PURE__ */ __name(() => some2(JSON.parse(input, options?.reviver)), "try"),
    catch: /* @__PURE__ */ __name(() => new InvalidValue({
      message: "Expected a valid JSON string"
    }), "catch")
  }));
}
__name(parseJson, "parseJson");
function stringifyJson(options) {
  return onSome((input) => try_2({
    try: /* @__PURE__ */ __name(() => {
      const output = JSON.stringify(input, options?.replacer, options?.space);
      if (output === void 0) {
        throw new TypeError("Value cannot be represented as JSON");
      }
      return some2(output);
    }, "try"),
    catch: /* @__PURE__ */ __name(() => new InvalidValue({
      message: "Expected a JSON-serializable value"
    }), "catch")
  }));
}
__name(stringifyJson, "stringifyJson");
function encodeBase642() {
  return transform(encodeBase64);
}
__name(encodeBase642, "encodeBase642");
function decodeBase642() {
  return transformOrFail((input) => mapErrorEager2(fromResult2(decodeBase64(input)), () => new InvalidValue({
    message: "Expected a valid Base64 string"
  })));
}
__name(decodeBase642, "decodeBase642");
var TypeId10 = "~effect/SchemaTransformation/Transformation";
var Transformation = class _Transformation {
  static {
    __name(this, "Transformation");
  }
  [TypeId10] = TypeId10;
  _tag = "Transformation";
  decode;
  encode;
  constructor(decode, encode) {
    this.decode = decode;
    this.encode = encode;
  }
  flip() {
    return new _Transformation(this.encode, this.decode);
  }
  compose(other) {
    return new _Transformation(this.decode.compose(other.decode), other.encode.compose(this.encode));
  }
};
function isTransformation(u) {
  return hasProperty(u, TypeId10) && u[TypeId10] === TypeId10;
}
__name(isTransformation, "isTransformation");
var make9 = /* @__PURE__ */ __name((options) => {
  if (isTransformation(options)) {
    return options;
  }
  return new Transformation(options.decode, options.encode);
}, "make9");
function transformOrFail2(options) {
  return new Transformation(transformOrFail(options.decode), transformOrFail(options.encode));
}
__name(transformOrFail2, "transformOrFail2");
function transform2(options) {
  return new Transformation(transform(options.decode), transform(options.encode));
}
__name(transform2, "transform2");
function transformOptional2(options) {
  return new Transformation(transformOptional(options.decode), transformOptional(options.encode));
}
__name(transformOptional2, "transformOptional2");
var passthrough_2 = /* @__PURE__ */ new Transformation(/* @__PURE__ */ passthrough(), /* @__PURE__ */ passthrough());
function passthrough2() {
  return passthrough_2;
}
__name(passthrough2, "passthrough2");
var numberFromString = /* @__PURE__ */ new Transformation(/* @__PURE__ */ Number3(), /* @__PURE__ */ String2());
var isJsonError = /* @__PURE__ */ __name((input) => isObject(input) && typeof input["message"] === "string", "isJsonError");
var decodeJsonError = /* @__PURE__ */ __name((input) => {
  const hasCause = Object.hasOwn(input, "cause");
  const err = hasCause ? new Error(input.message, {
    cause: decodeDefect(input.cause)
  }) : new Error(input.message);
  if (typeof input.name === "string" && input.name !== "Error")
    err.name = input.name;
  if (typeof input.stack === "string")
    err.stack = input.stack;
  return err;
}, "decodeJsonError");
var encodeUnknownAsJson = /* @__PURE__ */ __name((input) => {
  try {
    const json = formatJson(input);
    return json === void 0 ? format(input) : JSON.parse(json);
  } catch {
    return format(input);
  }
}, "encodeUnknownAsJson");
var encodeJsonError = /* @__PURE__ */ __name((input, options, encodeDefect) => {
  const encoded = {
    name: input.name,
    message: typeof input.message === "string" ? input.message : ""
  };
  if (options?.includeStack && typeof input.stack === "string") {
    encoded.stack = input.stack;
  }
  if (!options?.excludeCause && input.cause !== void 0) {
    encoded.cause = encodeDefect(input.cause);
  }
  return encoded;
}, "encodeJsonError");
var makeEncodeDefect = /* @__PURE__ */ __name((options) => {
  const seen = /* @__PURE__ */ new WeakSet();
  const encode = /* @__PURE__ */ __name((input) => {
    if (isError(input)) {
      if (seen.has(input)) {
        return "[Circular]";
      }
      seen.add(input);
      const encoded = encodeJsonError(input, options, encode);
      seen.delete(input);
      return encoded;
    }
    return encodeUnknownAsJson(input);
  }, "encode");
  return encode;
}, "makeEncodeDefect");
var decodeDefect = /* @__PURE__ */ __name((input) => isJsonError(input) ? decodeJsonError(input) : input, "decodeDefect");
var defectFromJson = /* @__PURE__ */ __name((options) => transform2({
  decode: decodeDefect,
  encode: makeEncodeDefect(options)
}), "defectFromJson");
function optionFromNullOr() {
  return transform2({
    decode: fromNullOr,
    encode: getOrNull
  });
}
__name(optionFromNullOr, "optionFromNullOr");
var urlFromString = /* @__PURE__ */ transformOrFail2({
  decode: /* @__PURE__ */ __name((s) => URL.canParse(s) ? succeed6(new URL(s)) : fail5(new InvalidValue({
    message: "Expected a valid URL string"
  })), "decode"),
  encode: /* @__PURE__ */ __name((url) => succeed6(url.href), "encode")
});
var uint8ArrayFromBase64String = /* @__PURE__ */ new Transformation(/* @__PURE__ */ decodeBase642(), /* @__PURE__ */ encodeBase642());
function fromJsonString(options) {
  return new Transformation(parseJson(options ?? {}), stringifyJson(options));
}
__name(fromJsonString, "fromJsonString");
var dateTimeUtcFromString = /* @__PURE__ */ transformOrFail2({
  decode: /* @__PURE__ */ __name((s) => {
    return match(make8(s), {
      onNone: /* @__PURE__ */ __name(() => fail5(new InvalidValue({
        message: "Expected a valid UTC DateTime string"
      })), "onNone"),
      onSome: /* @__PURE__ */ __name((result3) => succeed6(toUtc2(result3)), "onSome")
    });
  }, "decode"),
  encode: /* @__PURE__ */ __name((utc) => succeed6(formatIso2(utc)), "encode")
});
function makeGuard(tag2) {
  return (ast) => ast._tag === tag2;
}
__name(makeGuard, "makeGuard");
var isDeclaration = /* @__PURE__ */ makeGuard("Declaration");
var isNull = /* @__PURE__ */ makeGuard("Null");
var isVoid = /* @__PURE__ */ makeGuard("Void");
var isNever2 = /* @__PURE__ */ makeGuard("Never");
var isLiteral = /* @__PURE__ */ makeGuard("Literal");
var isUniqueSymbol = /* @__PURE__ */ makeGuard("UniqueSymbol");
var isArrays = /* @__PURE__ */ makeGuard("Arrays");
var isObjects = /* @__PURE__ */ makeGuard("Objects");
var isUnion = /* @__PURE__ */ makeGuard("Union");
var isSuspend = /* @__PURE__ */ makeGuard("Suspend");
var Link = class {
  static {
    __name(this, "Link");
  }
  to;
  transformation;
  constructor(to, transformation) {
    this.to = to;
    this.transformation = transformation;
  }
};
var defaultParseOptions = {};
var Context = class {
  static {
    __name(this, "Context");
  }
  isOptional;
  isMutable;
  constructorDefault;
  annotations;
  constructor(isOptional2, isMutable2, constructorDefault = void 0, annotations = void 0) {
    this.isOptional = isOptional2;
    this.isMutable = isMutable2;
    this.constructorDefault = constructorDefault;
    this.annotations = annotations;
  }
};
var TypeId11 = "~effect/Schema";
var Base2 = class {
  static {
    __name(this, "Base2");
  }
  [TypeId11] = TypeId11;
  annotations;
  checks;
  encoding;
  context;
  constructor(annotations = void 0, checks = void 0, encoding = void 0, context3 = void 0) {
    this.annotations = annotations;
    this.checks = checks;
    this.encoding = encoding;
    this.context = context3;
  }
  toString() {
    return `<${this._tag}>`;
  }
};
var Declaration = class _Declaration extends Base2 {
  static {
    __name(this, "Declaration");
  }
  _tag = "Declaration";
  typeParameters;
  run;
  encodingChecks;
  constructor(typeParameters, run3, annotations, checks, encoding, context3, encodingChecks) {
    super(annotations, checks, encoding, context3);
    this.typeParameters = typeParameters;
    this.run = run3;
    this.encodingChecks = encodingChecks;
  }
  getParser() {
    let run3;
    return (input, options) => {
      if (input === missing)
        return missingExit;
      return (run3 ??= this.run(this.typeParameters))(input, this, options);
    };
  }
  _rebuild(recur, checks, encodingChecks) {
    const tps = mapOrSame(this.typeParameters, recur);
    return tps === this.typeParameters && checks === this.checks && encodingChecks === this.encodingChecks ? this : new _Declaration(tps, this.run, this.annotations, checks, void 0, this.context, encodingChecks);
  }
  recur(recur) {
    return this._rebuild(recur, this.checks, this.encodingChecks);
  }
  flip(recur) {
    return this._rebuild(recur, this.encodingChecks, this.checks);
  }
  getExpected() {
    const expected = this.annotations?.expected;
    if (typeof expected === "string")
      return expected;
    return "<Declaration>";
  }
};
var Null = class extends Base2 {
  static {
    __name(this, "Null");
  }
  _tag = "Null";
  getParser() {
    return fromConst(this, null);
  }
  getExpected() {
    return "null";
  }
};
var null_ = /* @__PURE__ */ new Null();
var Undefined = class extends Base2 {
  static {
    __name(this, "Undefined");
  }
  _tag = "Undefined";
  getParser() {
    return fromConst(this, void 0);
  }
  toCodecJson() {
    return replaceEncoding(this, [undefinedToNull]);
  }
  getExpected() {
    return "undefined";
  }
};
var undefinedToNull = /* @__PURE__ */ new Link(null_, /* @__PURE__ */ new Transformation(/* @__PURE__ */ transform(() => {
  return;
}), /* @__PURE__ */ transform(() => null)));
var undefined_2 = /* @__PURE__ */ new Undefined();
var Void = class extends Base2 {
  static {
    __name(this, "Void");
  }
  _tag = "Void";
  getParser() {
    const succeed8 = succeed7(void 0);
    return (input) => input === missing ? missingExit : succeed8;
  }
  toCodecJson() {
    return replaceEncoding(this, [undefinedToNull]);
  }
  getExpected() {
    return "void";
  }
};
var void_4 = /* @__PURE__ */ new Void();
var Never = class extends Base2 {
  static {
    __name(this, "Never");
  }
  _tag = "Never";
  getParser() {
    return fromRefinement(this, isNever);
  }
  getExpected() {
    return "never";
  }
};
var never2 = /* @__PURE__ */ new Never();
var Unknown = class extends Base2 {
  static {
    __name(this, "Unknown");
  }
  _tag = "Unknown";
  getParser() {
    return fromRefinement(this, isUnknown);
  }
  getExpected() {
    return "unknown";
  }
};
var unknown = /* @__PURE__ */ new Unknown();
var Literal = class extends Base2 {
  static {
    __name(this, "Literal");
  }
  _tag = "Literal";
  literal;
  constructor(literal, annotations, checks, encoding, context3) {
    super(annotations, checks, encoding, context3);
    if (typeof literal === "number" && !globalThis.Number.isFinite(literal)) {
      throw new Error(`A numeric literal must be finite, got ${format(literal)}`);
    }
    this.literal = literal;
  }
  getParser() {
    return fromConst(this, this.literal);
  }
  matchPart(s, _options) {
    return s === globalThis.String(this.literal) ? this.literal : void 0;
  }
  toCodecJson() {
    return typeof this.literal === "bigint" ? literalToString(this) : this;
  }
  toCodecStringTree() {
    return typeof this.literal === "string" ? this : literalToString(this);
  }
  getExpected() {
    return typeof this.literal === "string" ? JSON.stringify(this.literal) : globalThis.String(this.literal);
  }
};
function literalToString(ast) {
  const literalAsString = globalThis.String(ast.literal);
  return replaceEncoding(ast, [new Link(new Literal(literalAsString), new Transformation(transform(() => ast.literal), transform(() => literalAsString)))]);
}
__name(literalToString, "literalToString");
var String3 = class extends Base2 {
  static {
    __name(this, "String3");
  }
  _tag = "String";
  getParser() {
    return fromRefinement(this, isString);
  }
  matchPart(s, options) {
    const checks = this.checks;
    return checks && !options.disableChecks && collectIssues(checks, s, void 0, this, options) ? void 0 : s;
  }
  getExpected() {
    return "string";
  }
};
var string2 = /* @__PURE__ */ new String3();
var Number4 = class extends Base2 {
  static {
    __name(this, "Number4");
  }
  _tag = "Number";
  getParser() {
    return fromRefinement(this, isNumber);
  }
  matchKey(s, options) {
    return this._match(isStringNumberRegExp, s, options);
  }
  matchPart(s, options) {
    return this._match(isStringFiniteRegExp, s, options);
  }
  _match(regexp, s, options) {
    if (!regexp.test(s))
      return;
    const value3 = globalThis.Number(s);
    if (options.disableChecks || !this.checks)
      return value3;
    return collectIssues(this.checks, value3, void 0, this, options) ? void 0 : value3;
  }
  toCodecJson() {
    if (this.checks && (hasCheck(this.checks, "effect/schema/isFinite") || hasCheck(this.checks, "effect/schema/isInt"))) {
      return this;
    }
    return replaceEncoding(this, [numberToJson(this.checks)]);
  }
  toCodecStringTree() {
    if (this.toCodecJson() === this) {
      return replaceEncoding(this, [finiteToString]);
    }
    return replaceEncoding(this, [numberToString]);
  }
  getExpected() {
    return "number";
  }
};
function hasCheck(checks, id) {
  return checks.some((check) => check.annotations?.representation?.id === id || check._tag === "FilterGroup" && hasCheck(check.checks, id));
}
__name(hasCheck, "hasCheck");
function numberToJson(checks) {
  const encodedFinite = !checks ? finite : appendChecks(finite, checks);
  return new Link(new Union([encodedFinite, nonFiniteLiterals], "anyOf"), new Transformation(Number3(), transform((n) => globalThis.Number.isFinite(n) ? n : globalThis.String(n))));
}
__name(numberToJson, "numberToJson");
var number2 = /* @__PURE__ */ new Number4();
var Boolean = class extends Base2 {
  static {
    __name(this, "Boolean");
  }
  _tag = "Boolean";
  getParser() {
    return fromRefinement(this, isBoolean);
  }
  getExpected() {
    return "boolean";
  }
};
var boolean = /* @__PURE__ */ new Boolean();
var Arrays = class _Arrays extends Base2 {
  static {
    __name(this, "Arrays");
  }
  _tag = "Arrays";
  isMutable;
  elements;
  rest;
  encodingChecks;
  constructor(isMutable2, elements, rest, annotations, checks, encoding, context3, encodingChecks) {
    super(annotations, checks, encoding, context3);
    this.isMutable = isMutable2;
    this.elements = elements;
    this.rest = rest;
    this.encodingChecks = encodingChecks;
    let hasOptional = false;
    for (let i = 0; i < elements.length; i++) {
      if (isOptional(elements[i])) {
        hasOptional = true;
      } else if (hasOptional) {
        throw new Error("A required element cannot follow an optional element. ts(1257)");
      }
    }
    if (hasOptional && rest.length > 1) {
      throw new Error("A required element cannot follow an optional element. ts(1257)");
    }
    for (let i = 1; i < rest.length; i++) {
      if (isOptional(rest[i])) {
        throw new Error("An optional element cannot follow a rest element. ts(1266)");
      }
    }
  }
  getParser(compile, compileConstructorDefault2 = compile) {
    const ast = this;
    let elements;
    let rest;
    const elementLen = ast.elements.length;
    const tailLen = Math.max(0, ast.rest.length - 1);
    function getParser(tailThreshold, index) {
      if (index < elementLen) {
        return elements[index];
      } else if (index >= tailThreshold) {
        return rest[index - tailThreshold + 1];
      }
      return rest[0];
    }
    __name(getParser, "getParser");
    return fnUntracedEager2(function* (input, options) {
      if (input === missing) {
        return missing;
      }
      if (!Array.isArray(input)) {
        return yield* fail5(new InvalidType(ast));
      }
      if (!elements) {
        elements = ast.elements.map((ast2) => ({
          ast: ast2,
          parser: compileConstructorDefault2(ast2)
        }));
        rest = ast.rest.map((ast2) => ({
          ast: ast2,
          parser: compileConstructorDefault2(ast2)
        }));
      }
      const len = input.length;
      const state = {
        ast,
        getParser,
        input,
        len,
        tailThreshold: Math.max(elementLen, len - tailLen),
        output: new globalThis.Array(len),
        issues: void 0,
        options
      };
      const concurrency = resolveConcurrency(options?.concurrency);
      const eff = parseArray(state, input, {
        concurrency: concurrency?.concurrency,
        end: ast.rest.length === 0 ? elementLen : Math.max(len, elementLen + tailLen)
      });
      if (eff)
        yield* eff;
      if (ast.rest.length === 0 && len > elementLen) {
        for (let i = elementLen; i <= len - 1; i++) {
          const issue = new Pointer([i], new UnexpectedKey(ast));
          if (options.errors === "all") {
            if (state.issues)
              state.issues.push(issue);
            else
              state.issues = [issue];
          } else {
            return yield* fail5(new Composite(ast, [issue]));
          }
        }
      }
      if (state.issues) {
        return yield* fail5(new Composite(ast, state.issues));
      }
      return state.output;
    });
  }
  _rebuild(recur, checks, encodingChecks) {
    const elements = mapOrSame(this.elements, recur);
    const rest = mapOrSame(this.rest, recur);
    return elements === this.elements && rest === this.rest && checks === this.checks && encodingChecks === this.encodingChecks ? this : new _Arrays(this.isMutable, elements, rest, this.annotations, checks, void 0, this.context, encodingChecks);
  }
  recur(recur) {
    return this._rebuild(recur, this.checks, this.encodingChecks);
  }
  flip(recur) {
    return this._rebuild(recur, this.encodingChecks, this.checks);
  }
  getExpected() {
    return "array";
  }
};
var parseArray = /* @__PURE__ */ iterateEager()({
  onItem(s, item, i) {
    const value3 = i < s.len ? item : missing;
    return s.getParser(s.tailThreshold, i).parser(value3, s.options);
  },
  step(s, item, exit3, i) {
    if (exit3._tag === "Failure") {
      return wrapPropertyKeyIssue(s, s.ast, i, exit3);
    }
    const value3 = exit3 === sameExit ? item : exit3[args];
    if (value3 !== missing) {
      s.output[i] = value3;
    } else {
      const p = s.getParser(s.tailThreshold, i);
      if (isOptional(p.ast))
        return;
      const issue = new Pointer([i], new MissingKey(p.ast.context?.annotations));
      if (s.options.errors === "all") {
        if (s.issues)
          s.issues.push(issue);
        else
          s.issues = [issue];
      } else {
        return fail4(new Composite(s.ast, [issue]));
      }
    }
  }
});
var resolveConcurrency = /* @__PURE__ */ __name((value3) => {
  value3 = value3 === "unbounded" ? Infinity : value3 ?? 1;
  return value3 > 1 ? {
    concurrency: value3
  } : void 0;
}, "resolveConcurrency");
var wrapPropertyKeyIssue = /* @__PURE__ */ __name((s, ast, key, exit3) => {
  if (exit3.cause.reasons.length === 0) {
    return exit3;
  }
  const issue = getSchemaIssue(exit3.cause);
  if (issue === void 0) {
    return failCause2(map6(exit3.cause, (issue2) => new Composite(ast, [new Pointer([key], issue2)])));
  }
  const pointer = new Pointer([key], issue);
  if (s.options.errors === "all") {
    if (s.issues)
      s.issues.push(pointer);
    else
      s.issues = [pointer];
  } else {
    return fail4(new Composite(ast, [pointer]));
  }
}, "wrapPropertyKeyIssue");
var FINITE_PATTERN = "[+-]?\\d*\\.?\\d+(?:[Ee][+-]?\\d+)?";
function getIndexSignatureKeys(input, parameter, options = defaultParseOptions) {
  let stringKeys;
  let symbolKeys;
  function go(parameter2) {
    switch (parameter2._tag) {
      case "String":
      case "TemplateLiteral":
        return (stringKeys ??= Object.keys(input)).filter((k) => parameter2.matchPart(k, options) !== void 0);
      case "Number":
        return (stringKeys ??= Object.keys(input)).filter((k) => parameter2.matchKey(k, options) !== void 0);
      case "Symbol":
        return (symbolKeys ??= Object.getOwnPropertySymbols(input)).filter((k) => parameter2.matchKey(k, options) !== void 0);
      case "Union":
        return [...new Set(parameter2.types.flatMap(go))];
      default:
        return [];
    }
  }
  __name(go, "go");
  return go(parameterFromPropertyKey(toEncoded(parameter)));
}
__name(getIndexSignatureKeys, "getIndexSignatureKeys");
var PropertySignature = class {
  static {
    __name(this, "PropertySignature");
  }
  name;
  type;
  constructor(name, type) {
    this.name = name;
    this.type = type;
  }
};
function isIndexSignatureParameterSide(ast) {
  switch (ast._tag) {
    case "String":
    case "Number":
    case "Symbol":
    case "TemplateLiteral":
      return true;
    case "Union":
      return ast.types.every(isIndexSignatureParameterSide);
    default:
      return false;
  }
}
__name(isIndexSignatureParameterSide, "isIndexSignatureParameterSide");
function isIndexSignatureParameter(ast) {
  return isIndexSignatureParameterSide(ast) && isIndexSignatureParameterSide(toEncoded(ast));
}
__name(isIndexSignatureParameter, "isIndexSignatureParameter");
var IndexSignature = class {
  static {
    __name(this, "IndexSignature");
  }
  parameter;
  type;
  constructor(parameter, type) {
    if (!isIndexSignatureParameter(parameter)) {
      throw new Error(`Invalid index signature parameter ${parameter._tag}`);
    }
    this.parameter = parameter;
    this.type = type;
    if (isOptional(type) && !containsUndefined(type)) {
      throw new Error("Cannot use `Schema.optionalKey` with index signatures, use `Schema.optional` instead.");
    }
  }
};
var Objects = class _Objects extends Base2 {
  static {
    __name(this, "Objects");
  }
  _tag = "Objects";
  propertySignatures;
  indexSignatures;
  encodingChecks;
  constructor(propertySignatures, indexSignatures, annotations, checks, encoding, context3, encodingChecks) {
    super(annotations, checks, encoding, context3);
    this.propertySignatures = propertySignatures;
    this.indexSignatures = indexSignatures;
    this.encodingChecks = encodingChecks;
    const duplicates = propertySignatures.map((ps) => ps.name).filter((name, i, arr) => arr.indexOf(name) !== i);
    if (duplicates.length > 0) {
      throw new Error(`Duplicate identifiers: ${JSON.stringify(duplicates)}. ts(2300)`);
    }
  }
  getParser(compile, compileConstructorDefault2 = compile) {
    const ast = this;
    const expectedKeys = [];
    for (const ps of ast.propertySignatures) {
      expectedKeys.push(ps.name);
    }
    const hasProperties = expectedKeys.length;
    const indexCount = ast.indexSignatures.length;
    let expectedKeysSet = hasProperties && indexCount ? new Set(expectedKeys) : void 0;
    if (!hasProperties && !indexCount) {
      return fromRefinement(ast, isNotNullish);
    }
    let properties;
    let indexes;
    const finishIndex = /* @__PURE__ */ __name((s, key, k2, inputValue, exitValue) => {
      if (exitValue._tag === "Failure") {
        return wrapPropertyKeyIssue(s, ast, key, exitValue) ?? void_2;
      }
      const value3 = exitValue === sameExit ? inputValue : exitValue[args];
      if (k2 !== missing && value3 !== missing) {
        if (hasProperties && (expectedKeysSet.has(key) || expectedKeysSet.has(k2)))
          return void_2;
        assignProperty(s.out, k2, value3);
      }
      return void_2;
    }, "finishIndex");
    const parseIndex = /* @__PURE__ */ __name((s, key, index, exitKey) => {
      if (!exitKey) {
        const eff = index.parserKey(key, s.options);
        if (!effectIsExit(eff)) {
          return flatMap3(exit2(eff), (exit3) => parseIndex(s, key, index, exit3));
        }
        exitKey = eff;
      }
      if (exitKey._tag === "Failure") {
        return wrapPropertyKeyIssue(s, ast, key, exitKey) ?? void_2;
      }
      const k2 = exitKey === sameExit ? key : exitKey[args];
      const inputValue = s.input[key];
      const result3 = index.parserValue(inputValue, s.options);
      return effectIsExit(result3) ? finishIndex(s, key, k2, inputValue, result3) : flatMap3(exit2(result3), (exit3) => finishIndex(s, key, k2, inputValue, exit3));
    }, "parseIndex");
    const parseStringIndex = /* @__PURE__ */ __name((s, key, index) => {
      const inputValue = s.input[key];
      const result3 = index.parserValue(inputValue, s.options);
      return effectIsExit(result3) ? finishIndex(s, key, key, inputValue, result3) : flatMap3(exit2(result3), (exit3) => finishIndex(s, key, key, inputValue, exit3));
    }, "parseStringIndex");
    const parseIndexes = indexCount ? iterateEager()({
      onItem: /* @__PURE__ */ __name((s, [key, index]) => parseIndex(s, key, index), "onItem"),
      step: /* @__PURE__ */ __name((_s, _, exit3) => exit3._tag === "Failure" ? exit3 : void 0, "step")
    }) : void 0;
    return fnUntracedEager2(function* (input, options) {
      if (input === missing) {
        return missing;
      }
      if (!(typeof input === "object" && input !== null && !Array.isArray(input))) {
        return yield* fail5(new InvalidType(ast));
      }
      if (!properties) {
        properties = ast.propertySignatures.map((ps) => ({
          parser: compileConstructorDefault2(ps.type),
          name: ps.name,
          type: ps.type
        }));
        indexes = indexCount ? ast.indexSignatures.map((is) => ({
          is,
          parserKey: compile(parameterFromPropertyKey(is.parameter)),
          parserValue: compileConstructorDefault2(is.type)
        })) : void 0;
      }
      const record = input;
      const out = {};
      const state = {
        ast,
        input: record,
        out,
        issues: void 0,
        options
      };
      const errorsAllOption = options.errors === "all";
      const onExcessPropertyError = options.onExcessProperty === "error";
      const onExcessPropertyPreserve = options.onExcessProperty === "preserve";
      let inputKeys;
      if (!indexCount && (onExcessPropertyError || onExcessPropertyPreserve)) {
        expectedKeysSet ??= new Set(expectedKeys);
        inputKeys = Reflect.ownKeys(record);
        for (let i = 0; i < inputKeys.length; i++) {
          const key = inputKeys[i];
          if (!expectedKeysSet.has(key)) {
            if (onExcessPropertyError) {
              const issue = new Pointer([key], new UnexpectedKey(ast));
              if (errorsAllOption) {
                if (state.issues) {
                  state.issues.push(issue);
                } else {
                  state.issues = [issue];
                }
                continue;
              } else {
                return yield* fail5(new Composite(ast, [issue]));
              }
            } else {
              assignProperty(out, key, record[key]);
            }
          }
        }
      }
      const concurrency = resolveConcurrency(options?.concurrency);
      if (hasProperties) {
        const eff = parseProperties(state, properties, concurrency);
        if (eff)
          yield* eff;
      }
      if (indexCount && !concurrency) {
        for (let i = 0; i < indexCount; i++) {
          const index = indexes[i];
          const parse3 = index.is.parameter === string2 ? parseStringIndex : parseIndex;
          const keys2 = index.is.parameter === string2 ? Object.keys(record) : getIndexSignatureKeys(record, index.is.parameter, options);
          for (let j = 0; j < keys2.length; j++) {
            const eff = parse3(state, keys2[j], index);
            if (!effectIsExit(eff))
              yield* eff;
            else if (eff._tag === "Failure")
              return yield* eff;
          }
        }
      } else if (parseIndexes) {
        const keyPairs = empty2();
        for (let i = 0; i < indexCount; i++) {
          const index = indexes[i];
          const keys2 = getIndexSignatureKeys(record, index.is.parameter, options);
          for (let j = 0; j < keys2.length; j++) {
            keyPairs.push([keys2[j], index]);
          }
        }
        const eff = parseIndexes(state, keyPairs, concurrency);
        if (eff)
          yield* eff;
      }
      if (state.issues) {
        return yield* fail5(new Composite(ast, state.issues));
      }
      if (options.propertyOrder === "original") {
        const keys2 = (inputKeys ?? Reflect.ownKeys(record)).concat(expectedKeys);
        const preserved = {};
        for (const key of keys2) {
          if (Object.hasOwn(out, key)) {
            assignProperty(preserved, key, out[key]);
          }
        }
        return preserved;
      }
      return out;
    });
  }
  _rebuild(recur, recurParameter, checks, encodingChecks) {
    const props = mapOrSame(this.propertySignatures, (ps) => {
      const t = recur(ps.type);
      return t === ps.type ? ps : new PropertySignature(ps.name, t);
    });
    const indexes = mapOrSame(this.indexSignatures, (is) => {
      const p = recurParameter(is.parameter);
      const t = recur(is.type);
      return p === is.parameter && t === is.type ? is : new IndexSignature(p, t);
    });
    return props === this.propertySignatures && indexes === this.indexSignatures && checks === this.checks && encodingChecks === this.encodingChecks ? this : new _Objects(props, indexes, this.annotations, checks, void 0, this.context, encodingChecks);
  }
  flip(recur) {
    return this._rebuild(recur, recur, this.encodingChecks, this.checks);
  }
  recur(recur, recurParameter = recur) {
    return this._rebuild(recur, recurParameter, this.checks, this.encodingChecks);
  }
  getExpected() {
    if (this.propertySignatures.length === 0 && this.indexSignatures.length === 0)
      return "object | array";
    return "object";
  }
};
var parseProperties = /* @__PURE__ */ iterateEager()({
  onItem(s, p) {
    if (!Object.hasOwn(s.input, p.name)) {
      return p.parser(missing, s.options);
    }
    const value3 = s.input[p.name];
    assignProperty(s.out, p.name, value3);
    return p.parser(value3, s.options);
  },
  step(s, p, exit3) {
    if (exit3._tag === "Failure") {
      return wrapPropertyKeyIssue(s, s.ast, p.name, exit3);
    }
    if (exit3 === sameExit)
      return;
    const value3 = exit3[args];
    if (value3 !== missing) {
      assignProperty(s.out, p.name, value3);
      return;
    }
    delete s.out[p.name];
    if (!isOptional(p.type)) {
      const issue = new Pointer([p.name], new MissingKey(p.type.context?.annotations));
      if (s.options.errors === "all") {
        if (s.issues)
          s.issues.push(issue);
        else
          s.issues = [issue];
        return;
      } else {
        return fail4(new Composite(s.ast, [issue]));
      }
    }
  }
});
function combineChecks(a, b) {
  if (!a)
    return b;
  if (!b)
    return a;
  return [...a, ...b];
}
__name(combineChecks, "combineChecks");
function struct(fields, checks, annotations) {
  return new Objects(Reflect.ownKeys(fields).map((key) => {
    return new PropertySignature(key, fields[key].ast);
  }), [], annotations, checks);
}
__name(struct, "struct");
function getAST(self) {
  return self.ast;
}
__name(getAST, "getAST");
function tuple(elements, checks = void 0) {
  return new Arrays(false, elements.map((e) => e.ast), [], void 0, checks);
}
__name(tuple, "tuple");
function union2(members, mode, checks) {
  return new Union(members.map(getAST), mode, void 0, checks);
}
__name(union2, "union2");
var toCandidate = /* @__PURE__ */ memoize((ast) => {
  while (true) {
    if (isSuspend(ast))
      return unknown;
    const encoding = ast.encoding;
    if (!encoding) {
      return ast.recur?.(toCandidate, identity) ?? ast;
    }
    if (encoding.some((link2) => link2.transformation._tag === "Middleware" && link2.transformation.decode !== identity))
      return unknown;
    ast = encoding[encoding.length - 1].to;
  }
});
function getCandidateTypes(ast) {
  switch (ast._tag) {
    case "Null":
      return ["null"];
    case "Undefined":
      return ["undefined"];
    case "String":
    case "TemplateLiteral":
      return ["string"];
    case "Number":
      return ["number"];
    case "Boolean":
      return ["boolean"];
    case "Symbol":
    case "UniqueSymbol":
      return ["symbol"];
    case "BigInt":
      return ["bigint"];
    case "Arrays":
      return ["array"];
    case "ObjectKeyword":
      return ["object", "array", "function"];
    case "Objects":
      return ast.propertySignatures.length || ast.indexSignatures.length ? ["object"] : ["string", "number", "boolean", "symbol", "bigint", "object", "array", "function"];
    case "Enum":
      return Array.from(new Set(ast.enums.map(([, v]) => typeof v)));
    case "Literal":
      return [typeof ast.literal];
    case "Union":
      return Array.from(new Set(ast.types.flatMap(getCandidateTypes)));
    default:
      return ["null", "undefined", "string", "number", "boolean", "symbol", "bigint", "object", "array", "function"];
  }
}
__name(getCandidateTypes, "getCandidateTypes");
function collectSentinels(ast) {
  switch (ast._tag) {
    default:
      return [];
    case "Declaration": {
      const s = ast.annotations?.[SENTINELS_ANNOTATION_KEY];
      return Array.isArray(s) ? s : [];
    }
    case "Objects":
      return ast.propertySignatures.flatMap((ps) => {
        const type = ps.type;
        if (!isOptional(type)) {
          if (isLiteral(type)) {
            return [{
              key: ps.name,
              literal: type.literal
            }];
          }
          if (isUniqueSymbol(type)) {
            return [{
              key: ps.name,
              literal: type.symbol
            }];
          }
        }
        return [];
      });
    case "Arrays":
      return ast.elements.flatMap((e, i) => {
        if (!isOptional(e)) {
          if (isLiteral(e)) {
            return [{
              key: i,
              literal: e.literal
            }];
          }
          if (isUniqueSymbol(e)) {
            return [{
              key: i,
              literal: e.symbol
            }];
          }
        }
        return [];
      });
    case "Suspend":
      return collectSentinels(ast.thunk());
  }
}
__name(collectSentinels, "collectSentinels");
var candidateIndexCache = /* @__PURE__ */ new WeakMap();
var emptyCandidates = /* @__PURE__ */ Object.freeze([]);
function getIndex(types) {
  let idx = candidateIndexCache.get(types);
  if (idx)
    return idx;
  idx = {};
  let literalCandidates;
  for (let i = 0; i < types.length; i++) {
    const a = types[i];
    const encoded = toCandidate(a);
    if (isNever2(encoded))
      continue;
    if (literalCandidates !== null) {
      if (isLiteral(encoded) || isUniqueSymbol(encoded)) {
        literalCandidates ??= /* @__PURE__ */ new Map();
        const literal = isLiteral(encoded) ? encoded.literal : encoded.symbol;
        let arr = literalCandidates.get(literal);
        if (!arr)
          literalCandidates.set(literal, arr = []);
        arr.push(a);
      } else {
        literalCandidates = null;
      }
    }
    const sentinels = collectSentinels(encoded);
    if (sentinels.length) {
      idx.bySentinel ??= /* @__PURE__ */ new Map();
      for (const {
        key,
        literal
      } of sentinels) {
        let m = idx.bySentinel.get(key);
        if (!m)
          idx.bySentinel.set(key, m = /* @__PURE__ */ new Map());
        let arr = m.get(literal);
        if (!arr)
          m.set(literal, arr = []);
        if (arr[arr.length - 1] !== i)
          arr.push(i);
      }
    } else {
      idx.otherwise ??= {};
      const candidateTypes = getCandidateTypes(encoded);
      for (const t of candidateTypes)
        (idx.otherwise[t] ??= []).push(i);
    }
  }
  if (literalCandidates) {
    literalCandidates.forEach(Object.freeze);
    idx = /* @__PURE__ */ __name((input) => literalCandidates.get(input) ?? emptyCandidates, "idx");
  } else if (idx.bySentinel?.size === 1 && !idx.otherwise) {
    for (const [key, byValue] of idx.bySentinel) {
      const candidates = byValue;
      for (const [literal, indexes] of byValue) {
        candidates.set(literal, Object.freeze(indexes.map((index) => types[index])));
      }
      idx = /* @__PURE__ */ __name((input, isConstructor) => {
        if (isObjectKeyword(input)) {
          const value3 = Object.hasOwn(input, key) ? input[key] : void 0;
          if (value3 !== void 0)
            return candidates.get(value3) ?? emptyCandidates;
          if (isConstructor)
            return types;
        }
        return emptyCandidates;
      }, "idx");
    }
  }
  candidateIndexCache.set(types, idx);
  return idx;
}
__name(getIndex, "getIndex");
function filterLiterals(input) {
  return (ast) => {
    const encoded = toCandidate(ast);
    return encoded._tag === "Literal" ? encoded.literal === input : encoded._tag === "UniqueSymbol" ? encoded.symbol === input : true;
  };
}
__name(filterLiterals, "filterLiterals");
function getCandidates(input, types, isConstructor = false) {
  const idx = getIndex(types);
  if (typeof idx === "function")
    return idx(input, isConstructor);
  const runtimeType = input === null ? "null" : Array.isArray(input) ? "array" : typeof input;
  if (idx.bySentinel) {
    const base = idx.otherwise?.[runtimeType] ?? emptyCandidates;
    if (isObjectKeyword(input)) {
      const selected = new Set(base);
      for (const [k, m] of idx.bySentinel) {
        const value3 = Object.hasOwn(input, k) ? input[k] : void 0;
        if (value3 !== void 0) {
          const match7 = m.get(value3);
          if (match7) {
            for (const candidate of match7)
              selected.add(candidate);
          }
        } else if (isConstructor) {
          for (const indexes of m.values()) {
            for (const candidate of indexes)
              selected.add(candidate);
          }
        }
      }
      return Array.from(selected).sort((a, b) => a - b).map((i) => types[i]);
    }
    return base.map((i) => types[i]);
  }
  return (idx.otherwise?.[runtimeType] ?? emptyCandidates).map((i) => types[i]).filter(filterLiterals(input));
}
__name(getCandidates, "getCandidates");
var Union = class _Union extends Base2 {
  static {
    __name(this, "Union");
  }
  _tag = "Union";
  types;
  mode;
  encodingChecks;
  constructor(types, mode, annotations, checks, encoding, context3, encodingChecks) {
    super(annotations, checks, encoding, context3);
    this.types = types;
    this.mode = mode;
    this.encodingChecks = encodingChecks;
  }
  getParser(compile, compileConstructorDefault2) {
    const ast = this;
    return (input, options) => {
      if (input === missing) {
        return missingExit;
      }
      const candidates = getCandidates(input, ast.types, compileConstructorDefault2 !== void 0);
      if (candidates.length === 1) {
        const result3 = compile(candidates[0])(input, options);
        if (result3._tag === "Success")
          return result3;
        return effectIsExit(result3) ? failSingleUnionCandidate(ast, result3.cause) : catchCause2(result3, (cause) => failSingleUnionCandidate(ast, cause));
      }
      const state = {
        ast,
        compile,
        input,
        out: void 0,
        successes: ast.mode === "oneOf" ? [] : void 0,
        issues: void 0,
        options
      };
      const concurrency = resolveConcurrency(options?.concurrency);
      const eff = parseUnion(state, candidates, concurrency ? {
        ...concurrency,
        orderedStep: true
      } : void 0);
      if (!eff) {
        return state.out ?? fail5(new AnyOf(ast, state.issues ?? []));
      }
      return flatMapEager2(eff, (_) => {
        return state.out === sameExit ? succeed6(input) : state.out ?? fail5(new AnyOf(ast, state.issues ?? []));
      });
    };
  }
  _rebuild(recur, checks, encodingChecks) {
    const types = mapOrSame(this.types, recur);
    return types === this.types && checks === this.checks && encodingChecks === this.encodingChecks ? this : new _Union(types, this.mode, this.annotations, checks, void 0, this.context, encodingChecks);
  }
  recur(recur) {
    return this._rebuild(recur, this.checks, this.encodingChecks);
  }
  flip(recur) {
    return this._rebuild(recur, this.encodingChecks, this.checks);
  }
  matchPart(s, options) {
    for (const type of this.types) {
      const out = type.matchPart(s, options);
      if (out !== void 0)
        return out;
    }
    return;
  }
  getExpected(getExpected2) {
    const expected = this.annotations?.expected;
    if (typeof expected === "string")
      return expected;
    if (this.types.length === 0)
      return "never";
    const types = this.types.map((type) => {
      const encoded = toEncoded(type);
      switch (encoded._tag) {
        case "Arrays": {
          const literals = encoded.elements.filter(isLiteral);
          if (literals.length > 0) {
            return `${formatIsMutable(encoded.isMutable)}[ ${literals.map((e) => getExpected2(e) + formatIsOptional(e.context?.isOptional)).join(", ")}, ... ]`;
          }
          break;
        }
        case "Objects": {
          const literals = encoded.propertySignatures.filter((ps) => isLiteral(ps.type));
          if (literals.length > 0) {
            return `{ ${literals.map((ps) => `${formatIsMutable(ps.type.context?.isMutable)}${formatPropertyKey(ps.name)}${formatIsOptional(ps.type.context?.isOptional)}: ${getExpected2(ps.type)}`).join(", ")}, ... }`;
          }
          break;
        }
      }
      return getExpected2(encoded);
    });
    return Array.from(new Set(types)).join(" | ");
  }
};
function failSingleUnionCandidate(ast, cause) {
  const issue = getSchemaIssue(cause);
  return issue ? fail4(new AnyOf(ast, [issue])) : failCause2(cause);
}
__name(failSingleUnionCandidate, "failSingleUnionCandidate");
var parseUnion = /* @__PURE__ */ iterateEager()({
  onItem(s, ast) {
    const parser = s.compile(ast);
    return parser(s.input, s.options);
  },
  step(s, candidate, exit3) {
    if (exit3._tag === "Failure") {
      const issue = getSchemaIssue(exit3.cause);
      if (issue === void 0) {
        return exit3;
      }
      if (s.issues)
        s.issues.push(issue);
      else
        s.issues = [issue];
    } else {
      if (s.out && s.successes) {
        s.successes.push(candidate);
        return fail4(new OneOf(s.ast, s.successes));
      }
      s.out = exit3;
      if (s.successes) {
        s.successes.push(candidate);
      } else {
        return void_2;
      }
    }
  }
});
var nonFiniteLiterals = /* @__PURE__ */ new Union([/* @__PURE__ */ new Literal("Infinity"), /* @__PURE__ */ new Literal("-Infinity"), /* @__PURE__ */ new Literal("NaN")], "anyOf");
function formatIsMutable(isMutable2) {
  return isMutable2 ? "" : "readonly ";
}
__name(formatIsMutable, "formatIsMutable");
function formatIsOptional(isOptional2) {
  return isOptional2 ? "?" : "";
}
__name(formatIsOptional, "formatIsOptional");
var Filter2 = class _Filter2 extends Class {
  static {
    __name(this, "Filter2");
  }
  _tag = "Filter";
  run;
  annotations;
  aborted;
  constructor(run3, annotations = void 0, aborted = false) {
    super();
    this.run = run3;
    this.annotations = annotations;
    this.aborted = aborted;
  }
  annotate(annotations) {
    return new _Filter2(this.run, {
      ...this.annotations,
      ...annotations
    }, this.aborted);
  }
  abort() {
    return new _Filter2(this.run, this.annotations, true);
  }
  and(other, annotations) {
    return new FilterGroup([this, other], annotations);
  }
};
var FilterGroup = class _FilterGroup extends Class {
  static {
    __name(this, "FilterGroup");
  }
  _tag = "FilterGroup";
  checks;
  annotations;
  constructor(checks, annotations = void 0) {
    super();
    this.checks = checks;
    this.annotations = annotations;
  }
  annotate(annotations) {
    return new _FilterGroup(this.checks, {
      ...this.annotations,
      ...annotations
    });
  }
  and(other, annotations) {
    return new _FilterGroup([this, other], annotations);
  }
};
function makeFilter(filter3, annotations, aborted = false) {
  return new Filter2((input, ast, options) => normalizeFilterOutput(ast, filter3(input, ast, options)), annotations, aborted);
}
__name(makeFilter, "makeFilter");
function isFinite2(annotations) {
  return makeFilter((n) => globalThis.Number.isFinite(n), {
    expected: "a finite number",
    representation: {
      id: "effect/schema/isFinite",
      payload: null
    },
    toJsonSchema: /* @__PURE__ */ __name(() => ({
      type: "number"
    }), "toJsonSchema"),
    toCode: /* @__PURE__ */ __name(() => ({
      runtime: "Schema.isFinite()"
    }), "toCode"),
    arbitrary: {
      constraint: {
        noInfinity: true,
        noNaN: true
      }
    },
    ...annotations
  });
}
__name(isFinite2, "isFinite2");
var finite = /* @__PURE__ */ appendChecks(number2, [/* @__PURE__ */ isFinite2()]);
function isPattern(regExp, annotations) {
  const source = regExp.source;
  const pattern = new globalThis.RegExp(source, regExp.flags);
  return makeFilter((s) => {
    pattern.lastIndex = 0;
    return pattern.test(s);
  }, {
    expected: `a string matching the RegExp ${source}`,
    representation: {
      id: "effect/schema/isPattern",
      payload: {
        source,
        flags: regExp.flags
      }
    },
    toJsonSchema: /* @__PURE__ */ __name(() => ({
      pattern: source
    }), "toJsonSchema"),
    arbitrary: {
      constraint: {
        patterns: [regExp.source]
      }
    },
    ...annotations
  });
}
__name(isPattern, "isPattern");
function modifyOwnPropertyDescriptors(ast, f) {
  const d = Object.getOwnPropertyDescriptors(ast);
  f(d);
  return Object.create(Object.getPrototypeOf(ast), d);
}
__name(modifyOwnPropertyDescriptors, "modifyOwnPropertyDescriptors");
function replaceEncoding(ast, encoding) {
  if (ast.encoding === encoding) {
    return ast;
  }
  return modifyOwnPropertyDescriptors(ast, (d) => {
    d.encoding.value = encoding;
  });
}
__name(replaceEncoding, "replaceEncoding");
function replaceContext(ast, context3) {
  if (ast.context === context3) {
    return ast;
  }
  return modifyOwnPropertyDescriptors(ast, (d) => {
    d.context.value = context3;
  });
}
__name(replaceContext, "replaceContext");
function getLastEncoding(ast) {
  return ast.encoding ? getLastEncoding(ast.encoding[ast.encoding.length - 1].to) : ast;
}
__name(getLastEncoding, "getLastEncoding");
function annotate(ast, annotations) {
  if (ast.checks) {
    const last = ast.checks[ast.checks.length - 1];
    return replaceChecks(ast, append(ast.checks.slice(0, -1), last.annotate(annotations)));
  }
  return modifyOwnPropertyDescriptors(ast, (d) => {
    d.annotations.value = {
      ...d.annotations.value,
      ...annotations
    };
  });
}
__name(annotate, "annotate");
function replaceChecks(ast, checks) {
  if (ast._tag === "Suspend" && checks) {
    throw new Error("Cannot add checks to Suspend");
  }
  if (ast.checks === checks) {
    return ast;
  }
  return modifyOwnPropertyDescriptors(ast, (d) => {
    d.checks.value = checks;
  });
}
__name(replaceChecks, "replaceChecks");
function appendChecks(ast, checks) {
  return replaceChecks(ast, combineChecks(ast.checks, checks));
}
__name(appendChecks, "appendChecks");
function mapLink(link2, f) {
  const to = f(link2.to);
  return to === link2.to ? link2 : new Link(to, link2.transformation);
}
__name(mapLink, "mapLink");
function updateLastLink(encoding, f) {
  const links = encoding;
  const last = links[links.length - 1];
  const out = mapLink(last, f);
  return out === last ? encoding : append(encoding.slice(0, encoding.length - 1), out);
}
__name(updateLastLink, "updateLastLink");
function applyToLastLink(f) {
  return (ast) => ast.encoding ? replaceEncoding(ast, updateLastLink(ast.encoding, f)) : ast;
}
__name(applyToLastLink, "applyToLastLink");
function replaceContextLastLink(ast, context3) {
  return applyToLastLink((ast2) => replaceContext(ast2, context3))(ast);
}
__name(replaceContextLastLink, "replaceContextLastLink");
function applyToSelfOrLastLinkEncoding(f) {
  function out(ast) {
    return ast.encoding ? replaceEncoding(ast, updateLastLink(ast.encoding, out)) : f(ast);
  }
  __name(out, "out");
  return memoize(out);
}
__name(applyToSelfOrLastLinkEncoding, "applyToSelfOrLastLinkEncoding");
function appendTransformation(from, transformation, to) {
  const link2 = new Link(from, transformation);
  return replaceEncoding(to, to.encoding ? [...to.encoding, link2] : [link2]);
}
__name(appendTransformation, "appendTransformation");
function brand(ast, brand22) {
  const existing = resolveBrands(ast);
  const brands = existing ? [...existing, brand22] : [brand22];
  return annotate(ast, {
    brands
  });
}
__name(brand, "brand");
function mapOrSame(as3, f) {
  let changed = false;
  const out = new Array(as3.length);
  for (let i = 0; i < as3.length; i++) {
    const a = as3[i];
    const fa = f(a);
    if (fa !== a) {
      changed = true;
    }
    out[i] = fa;
  }
  return changed ? out : as3;
}
__name(mapOrSame, "mapOrSame");
function annotateKey(ast, annotations) {
  const context3 = ast.context ? new Context(ast.context.isOptional, ast.context.isMutable, ast.context.constructorDefault, {
    ...ast.context.annotations,
    ...annotations
  }) : new Context(false, false, void 0, annotations);
  return replaceContext(ast, context3);
}
__name(annotateKey, "annotateKey");
var optionalKeyLastLink = /* @__PURE__ */ applyToLastLink(optionalKey);
function optionalKey(ast) {
  const context3 = ast.context ? ast.context.isOptional === false ? new Context(true, ast.context.isMutable, ast.context.constructorDefault, ast.context.annotations) : ast.context : new Context(true, false);
  return optionalKeyLastLink(replaceContext(ast, context3));
}
__name(optionalKey, "optionalKey");
function withConstructorDefault(ast, defaultValue) {
  const transformation = new Transformation(withDefault(defaultValue), passthrough());
  const constructorDefault = new Link(unknown, transformation);
  const context3 = ast.context ? new Context(ast.context.isOptional, ast.context.isMutable, constructorDefault, ast.context.annotations) : new Context(false, false, constructorDefault);
  return replaceContext(ast, context3);
}
__name(withConstructorDefault, "withConstructorDefault");
function decodeTo(from, to, transformation) {
  return appendTransformation(from, transformation, to);
}
__name(decodeTo, "decodeTo");
function isOptional(ast) {
  return ast.context?.isOptional ?? false;
}
__name(isOptional, "isOptional");
function isMutable(ast) {
  return ast.context?.isMutable ?? false;
}
__name(isMutable, "isMutable");
function isStructuralCheck(check) {
  return check.annotations?.[STRUCTURAL_ANNOTATION_KEY] === true || check._tag === "FilterGroup" && check.checks.every(isStructuralCheck);
}
__name(isStructuralCheck, "isStructuralCheck");
function extractStructuralChecks(checks) {
  function extract3(check) {
    if (isStructuralCheck(check))
      return [check];
    return check._tag === "FilterGroup" ? check.checks.flatMap(extract3) : [];
  }
  __name(extract3, "extract");
  const out = checks.flatMap(extract3);
  return isArrayNonEmpty2(out) ? out : void 0;
}
__name(extractStructuralChecks, "extractStructuralChecks");
var toType = /* @__PURE__ */ memoize((ast) => {
  if (ast.encoding) {
    return toType(replaceEncoding(ast, void 0));
  }
  const out = ast;
  const type = out.recur?.(toType) ?? out;
  const encodingChecks = type.encodingChecks;
  if (encodingChecks) {
    const checks = type === ast ? encodingChecks : isArrays(type) || isObjects(type) || isDeclaration(type) && type.typeParameters.length > 0 ? extractStructuralChecks(encodingChecks) : void 0;
    return modifyOwnPropertyDescriptors(type, (d) => {
      d.encodingChecks.value = void 0;
      d.checks.value = combineChecks(type.checks, checks);
    });
  }
  return type;
});
var toEncoded = /* @__PURE__ */ memoize((ast) => {
  return toType(flip2(ast));
});
function flipEncoding(ast, encoding) {
  const links = encoding;
  const len = links.length;
  const last = links[len - 1];
  const ls = [new Link(flip2(replaceEncoding(ast, void 0)), links[0].transformation.flip())];
  for (let i = 1; i < len; i++) {
    ls.unshift(new Link(flip2(links[i - 1].to), links[i].transformation.flip()));
  }
  const to = flip2(last.to);
  if (to.encoding) {
    return replaceEncoding(to, [...to.encoding, ...ls]);
  } else {
    return replaceEncoding(to, ls);
  }
}
__name(flipEncoding, "flipEncoding");
var flip2 = /* @__PURE__ */ memoize((ast) => {
  if (ast.encoding) {
    return flipEncoding(ast, ast.encoding);
  }
  const out = ast;
  return out.flip?.(flip2) ?? out.recur?.(flip2) ?? out;
});
function containsUndefined(ast) {
  switch (ast._tag) {
    case "Undefined":
      return true;
    case "Union":
      return ast.types.some(containsUndefined);
    default:
      return false;
  }
}
__name(containsUndefined, "containsUndefined");
function fromConst(ast, value3) {
  const succeed8 = succeed7(value3);
  return (input) => {
    if (input === missing)
      return missingExit;
    return input === value3 ? succeed8 : fail5(new InvalidType(ast));
  };
}
__name(fromConst, "fromConst");
function fromRefinement(ast, refinement) {
  return (input) => {
    if (input === missing)
      return missingExit;
    return refinement(input) ? sameExit : fail5(new InvalidType(ast));
  };
}
__name(fromRefinement, "fromRefinement");
var parameterFromPropertyKey = /* @__PURE__ */ applyToSelfOrLastLinkEncoding((ast) => {
  switch (ast._tag) {
    default:
      return ast;
    case "Number":
      return ast.toCodecStringTree();
    case "Union":
      return ast.recur(parameterFromPropertyKey);
  }
});
var parameterFromString = /* @__PURE__ */ applyToSelfOrLastLinkEncoding((ast) => {
  switch (ast._tag) {
    default:
      return ast;
    case "Symbol":
    case "UniqueSymbol":
      return ast.toCodecStringTree();
    case "Union":
      return ast.recur(parameterFromString);
  }
});
var STRING_PATTERN = "[\\s\\S]*?";
var isStringFiniteRegExp = /* @__PURE__ */ new globalThis.RegExp(`^${FINITE_PATTERN}$`);
var isStringNumberRegExp = /* @__PURE__ */ new globalThis.RegExp(`^(?:${FINITE_PATTERN}|Infinity|-Infinity|NaN)$`);
function isStringFinite(annotations) {
  return isPattern(isStringFiniteRegExp, {
    expected: "a string representing a finite number",
    representation: {
      id: "effect/schema/isStringFinite",
      payload: null
    },
    toJsonSchema: /* @__PURE__ */ __name(() => ({
      pattern: isStringFiniteRegExp.source
    }), "toJsonSchema"),
    ...annotations
  });
}
__name(isStringFinite, "isStringFinite");
var finiteString = /* @__PURE__ */ appendChecks(string2, [/* @__PURE__ */ isStringFinite()]);
var finiteToString = /* @__PURE__ */ new Link(finiteString, numberFromString);
var numberToString = /* @__PURE__ */ new Link(/* @__PURE__ */ new Union([finiteString, nonFiniteLiterals], "anyOf"), numberFromString);
var BIGINT_PATTERN = "-?\\d+";
var isStringBigIntRegExp = /* @__PURE__ */ new globalThis.RegExp(`^${BIGINT_PATTERN}$`);
var REGEXP_PATTERN = "Symbol\\((.*)\\)";
var isStringSymbolRegExp = /* @__PURE__ */ new globalThis.RegExp(`^${REGEXP_PATTERN}$`);
function collectIssues(checks, value3, issues, ast, options) {
  for (let i = 0; i < checks.length; i++) {
    const check = checks[i];
    if (check._tag === "FilterGroup") {
      issues = collectIssues(check.checks, value3, issues, ast, options);
      if (issues && (options.errors !== "all" || issues[issues.length - 1].filter.aborted)) {
        return issues;
      }
    } else {
      const issue = check.run(value3, ast, options);
      if (issue) {
        const filter3 = new Filter(check, issue);
        if (issues)
          issues.push(filter3);
        else
          issues = [filter3];
        if (options.errors !== "all" || check.aborted) {
          return issues;
        }
      }
    }
  }
  return issues;
}
__name(collectIssues, "collectIssues");
function getConstructorDescriptor(ast) {
  if (!isDeclaration(ast))
    return;
  const getDescriptor = ast.annotations?.[CONSTRUCTOR_ANNOTATION_KEY];
  return isFunction(getDescriptor) ? getDescriptor(ast.typeParameters) : void 0;
}
__name(getConstructorDescriptor, "getConstructorDescriptor");
var resolveAt2 = resolveAt;
var resolveIdentifier2 = resolveIdentifier;
var resolveDescription2 = resolveDescription;
function isJsonLeaf(u) {
  return u === null || typeof u === "string" || typeof u === "boolean" || typeof u === "number" && globalThis.Number.isFinite(u);
}
__name(isJsonLeaf, "isJsonLeaf");
function isStringTreeLeaf(u) {
  return u === void 0 || typeof u === "string";
}
__name(isStringTreeLeaf, "isStringTreeLeaf");
function isTree(u, isLeaf) {
  const cache = /* @__PURE__ */ new WeakMap();
  const stack = [];
  outer:
    while (true) {
      if (typeof u !== "object" || u === null) {
        if (!isLeaf(u)) {
          return false;
        }
      } else {
        const value3 = u;
        const cached3 = cache.get(value3);
        if (cached3 === false) {
          return false;
        }
        if (cached3 === void 0) {
          const isArray2 = Array.isArray(value3);
          if (!isArray2) {
            const prototype = Object.getPrototypeOf(value3);
            if (prototype !== null && prototype !== Object.prototype && Object.getPrototypeOf(prototype) !== null) {
              return false;
            }
          }
          cache.set(value3, false);
          stack.push({
            value: value3,
            keys: isArray2 ? value3.length : Object.keys(value3),
            index: 0
          });
        }
      }
      while (stack.length > 0) {
        const frame = stack[stack.length - 1];
        const keys2 = frame.keys;
        if (typeof keys2 === "number") {
          if (frame.index < keys2) {
            u = frame.value[frame.index++];
            continue outer;
          }
        } else if (frame.index < keys2.length) {
          u = frame.value[keys2[frame.index++]];
          continue outer;
        }
        cache.set(frame.value, true);
        stack.pop();
      }
      return true;
    }
}
__name(isTree, "isTree");
function isJson(u) {
  return isTree(u, isJsonLeaf);
}
__name(isJson, "isJson");
var Json = /* @__PURE__ */ new Declaration([], () => (input, ast) => isJson(input) ? sameExit : fail5(new InvalidType(ast)), {
  representation: {
    id: "effect/schema/Json",
    payload: null
  },
  expected: "JSON value",
  toCodecJson: /* @__PURE__ */ __name(() => {
    return;
  }, "toCodecJson"),
  toCodecStringTree: /* @__PURE__ */ __name(() => unknownToStringTree, "toCodecStringTree"),
  toArbitrary: /* @__PURE__ */ __name(() => (fc) => fc.jsonValue(), "toArbitrary")
});
var unknownToJson = /* @__PURE__ */ new Link(Json, /* @__PURE__ */ passthrough2());
var objectKeywordToJson = /* @__PURE__ */ new Link(/* @__PURE__ */ new Union([/* @__PURE__ */ new Arrays(false, [], [Json]), /* @__PURE__ */ new Objects([], [/* @__PURE__ */ new IndexSignature(string2, Json)])], "anyOf"), /* @__PURE__ */ passthrough2());
function isStringTree(u) {
  return isTree(u, isStringTreeLeaf);
}
__name(isStringTree, "isStringTree");
var StringTree = /* @__PURE__ */ new Declaration([], () => (input, ast) => isStringTree(input) ? sameExit : fail5(new InvalidType(ast)), {
  expected: "StringTree",
  toCodecStringTree: /* @__PURE__ */ __name(() => {
    return;
  }, "toCodecStringTree")
});
var unknownToStringTree = /* @__PURE__ */ new Link(StringTree, /* @__PURE__ */ passthrough2());
var TypeId12 = "~effect/SchemaError/SchemaError";
var SchemaError = class extends (/* @__PURE__ */ TaggedError2("SchemaError")) {
  static {
    __name(this, "SchemaError");
  }
  [TypeId12] = TypeId12;
  constructor(issue) {
    super({
      issue
    });
  }
  get message() {
    return this.issue.toString();
  }
  toString() {
    return `SchemaError(${this.message})`;
  }
};
function isSchemaError(u) {
  return hasProperty(u, TypeId12) && u[TypeId12] === TypeId12;
}
__name(isSchemaError, "isSchemaError");
function makeEffect(schema) {
  const parser = runWithCompiler(constructorCompiler, toType(schema.ast));
  return (input, options) => {
    return parser(input, options?.disableChecks ? options?.parseOptions ? {
      ...options.parseOptions,
      disableChecks: true
    } : {
      disableChecks: true
    } : options?.parseOptions);
  };
}
__name(makeEffect, "makeEffect");
function makeOption(schema) {
  const parser = makeEffect(schema);
  return (input, options) => {
    const exit3 = runSyncExit2(parser(input, options));
    if (isSuccess3(exit3)) {
      return some2(exit3.value);
    }
    getSchemaIssueOrThrow(exit3.cause, "Option adapter can only return none for schema issues");
    return none2();
  };
}
__name(makeOption, "makeOption");
function make10(schema) {
  const parser = makeEffect(schema);
  return (input, options) => {
    const exit3 = runSyncExit2(parser(input, options));
    if (isSuccess3(exit3)) {
      return exit3.value;
    }
    const issue = getSchemaIssueOrThrow(exit3.cause, "Constructor adapter can only throw schema issues");
    throw new Error(issue.toString(), {
      cause: issue
    });
  };
}
__name(make10, "make10");
function decodeUnknownEffect(schema, options) {
  const parser = run(schema.ast);
  return options === void 0 ? parser : (input, overrideOptions) => parser(input, mergeParseOptions(options, overrideOptions));
}
__name(decodeUnknownEffect, "decodeUnknownEffect");
function encodeUnknownEffect(schema, options) {
  const parser = run(flip2(schema.ast));
  return options === void 0 ? parser : (input, overrideOptions) => parser(input, mergeParseOptions(options, overrideOptions));
}
__name(encodeUnknownEffect, "encodeUnknownEffect");
var mergeParseOptions = /* @__PURE__ */ __name((options, overrideOptions) => overrideOptions ? {
  ...options,
  ...overrideOptions
} : options, "mergeParseOptions");
var getValue = /* @__PURE__ */ __name((value3) => {
  if (value3 === missing) {
    return fail5(new InvalidValue());
  }
  return succeed6(value3);
}, "getValue");
function run(ast) {
  return runWithCompiler(normalCompiler, ast);
}
__name(run, "run");
function runWithCompiler(compiler, ast) {
  let parser;
  return (input, options) => {
    const result3 = (parser ??= compiler(ast))(input, options ?? defaultParseOptions);
    if (result3 === sameExit) {
      return succeed6(input);
    }
    if (!effectIsExit(result3)) {
      return flatMapEager2(result3, getValue);
    }
    return result3[args] === missing ? getValue(missing) : result3;
  };
}
__name(runWithCompiler, "runWithCompiler");
var normalCompiler = /* @__PURE__ */ memoize((ast) => makeParser(ast, normalCompiler));
var constructorCompiler = /* @__PURE__ */ memoize((ast) => makeParser(ast, constructorCompiler, compileConstructorDefault));
var compileDefaulted = /* @__PURE__ */ memoize((ast) => makeParser(ast, constructorCompiler, compileConstructorDefault, ast.context?.constructorDefault));
function compileConstructorDefault(ast) {
  return ast.context?.constructorDefault ? compileDefaulted(ast) : constructorCompiler(ast);
}
__name(compileConstructorDefault, "compileConstructorDefault");
function applyTransformation(result3, current, transformation, options) {
  let transformed;
  if (effectIsExit(result3) && result3._tag === "Success") {
    const optional2 = toOption(result3 === sameExit ? current : result3[args]);
    transformed = transformation._tag === "Transformation" ? transformation.decode.run(optional2, options) : transformation.decode(succeed7(optional2), options);
  } else if (transformation._tag === "Transformation") {
    transformed = flatMapEager2(result3, (value3) => transformation.decode.run(toOption(value3), options));
  } else {
    transformed = transformation.decode(mapEager2(result3, toOption), options);
  }
  return effectIsExit(transformed) && transformed._tag === "Success" ? fromOptionExit(transformed[args]) : flatMapEager2(transformed, fromOptionExit);
}
__name(applyTransformation, "applyTransformation");
function makeConstructorParser(descriptor, compile) {
  let sourceParser;
  return (input, options) => {
    if (input === missing)
      return missingExit;
    if (descriptor.isConstructed(input))
      return sameExit;
    const result3 = (sourceParser ??= compile(descriptor.link.to))(input, options);
    return applyTransformation(result3, input, descriptor.link.transformation, options);
  };
}
__name(makeConstructorParser, "makeConstructorParser");
function makeParser(ast, compile, compileConstructorDefault2, constructorDefault) {
  const descriptor = compileConstructorDefault2 ? getConstructorDescriptor(ast) : void 0;
  const parser = descriptor ? makeConstructorParser(descriptor, compile) : ast.getParser(compile, compileConstructorDefault2);
  const checks = ast.checks;
  const links = constructorDefault ? ast.encoding ? [...ast.encoding, constructorDefault] : [constructorDefault] : ast.encoding;
  const encodingChecks = ast.encodingChecks;
  const astOptions = (checks ? checks[checks.length - 1].annotations : ast.annotations)?.["parseOptions"];
  if (!links && !checks && !encodingChecks) {
    if (!astOptions) {
      return parser;
    }
    return (input, options) => parser(input, mergeParseOptions(options, astOptions));
  }
  let encodingParsers;
  const parseLocal = /* @__PURE__ */ __name((input, options) => {
    let result3 = parser(input, options);
    if (encodingChecks && !options.disableChecks) {
      if (effectIsExit(result3)) {
        if (result3._tag === "Success") {
          const output = result3 === sameExit ? input : result3[args];
          if (input !== missing && output !== missing) {
            const issues = collectIssues(encodingChecks, input, void 0, ast, options);
            if (issues) {
              result3 = fail5(new Composite(ast, issues));
            }
          }
        }
      } else {
        result3 = flatMap3(result3, (value3) => {
          if (input !== missing && value3 !== missing) {
            const issues = collectIssues(encodingChecks, input, void 0, ast, options);
            if (issues) {
              return fail5(new Composite(ast, issues));
            }
          }
          return succeed6(value3);
        });
      }
    }
    if (checks && !options.disableChecks) {
      if (effectIsExit(result3)) {
        if (result3._tag === "Success") {
          const value3 = result3 === sameExit ? input : result3[args];
          if (value3 === missing)
            return result3;
          const issues = collectIssues(checks, value3, void 0, ast, options);
          if (issues) {
            result3 = fail5(new Composite(ast, issues));
          }
        }
      } else {
        result3 = flatMap3(result3, (value3) => {
          if (value3 !== missing) {
            const issues = collectIssues(checks, value3, void 0, ast, options);
            if (issues) {
              return fail5(new Composite(ast, issues));
            }
          }
          return succeed6(value3);
        });
      }
    }
    return result3;
  }, "parseLocal");
  if (!links) {
    return astOptions ? (input, options) => parseLocal(input, mergeParseOptions(options, astOptions)) : parseLocal;
  }
  return (input, options) => {
    if (astOptions) {
      options = mergeParseOptions(options, astOptions);
    }
    const parsers = encodingParsers ??= links.map((link2) => compile(link2.to));
    let current = input;
    let result3 = parsers[parsers.length - 1](input, options);
    for (let i = links.length - 1; i >= 0; i--) {
      result3 = applyTransformation(result3, current, links[i].transformation, options);
      if (i !== 0) {
        const next = parsers[i - 1];
        if (result3._tag === "Success") {
          current = result3[args];
          result3 = next(current, options);
        } else {
          result3 = flatMapEager2(result3, (value3) => {
            const nextResult = next(value3, options);
            return nextResult === sameExit ? succeed7(value3) : nextResult;
          });
        }
      }
    }
    if (result3._tag === "Success") {
      const value3 = result3[args];
      const local = parseLocal(value3, options);
      return local === sameExit ? result3 : local;
    }
    result3 = catchCause2(result3, (cause) => failCauseSync2(() => map6(cause, (issue) => new Encoding(ast, issue))));
    return flatMapEager2(result3, (value3) => {
      const local = parseLocal(value3, options);
      return local === sameExit ? succeed7(value3) : local;
    });
  };
}
__name(makeParser, "makeParser");
var TypeId13 = "~effect/Schema/Schema";
var SchemaProto = {
  [TypeId13]: TypeId13,
  pipe() {
    return pipeArguments(this, arguments);
  },
  annotate(annotations) {
    return this.rebuild(annotate(this.ast, annotations));
  },
  annotateKey(annotations) {
    return this.rebuild(annotateKey(this.ast, annotations));
  },
  check(...checks) {
    return this.rebuild(appendChecks(this.ast, checks));
  }
};
function make11(ast, options) {
  function Schema() {
  }
  __name(Schema, "Schema");
  const self = Object.defineProperties(Object.setPrototypeOf(Schema, SchemaProto), Object.getOwnPropertyDescriptors({
    ...options
  }));
  self.ast = ast;
  self.rebuild = (ast2) => make11(ast2, options);
  const makeEffect2 = makeEffect(self);
  self.makeEffect = (input, options2) => fromIssueEffect(makeEffect2(input, options2));
  self.make = make10(self);
  self.makeOption = makeOption(self);
  return self;
}
__name(make11, "make11");
function fromIssueEffect(self) {
  return catchCause2(self, (cause) => failCauseSync2(() => map6(cause, (issue) => new SchemaError(issue))));
}
__name(fromIssueEffect, "fromIssueEffect");
var evolve = /* @__PURE__ */ dual(2, (self, e) => {
  return buildStruct(self, (k, v) => [k, Object.hasOwn(e, k) ? e[k](v) : v]);
});
var lambda = /* @__PURE__ */ __name((f) => f, "lambda");
function buildStruct(source, f) {
  const out = {};
  for (const k of Reflect.ownKeys(source)) {
    if (!Object.prototype.propertyIsEnumerable.call(source, k))
      continue;
    const res = f(k, source[k]);
    if (res) {
      const [nk, nv] = res;
      assignProperty(out, nk, nv);
    }
  }
  return out;
}
__name(buildStruct, "buildStruct");
var map8 = /* @__PURE__ */ dual(2, (self, f) => self === void 0 ? void 0 : f(self));
function errorWithPath(message, path) {
  if (path.length > 0) {
    message += `
  at ${formatPath(path)}`;
  }
  return new Error(message);
}
__name(errorWithPath, "errorWithPath");
function escapeToken(token) {
  return token.replace(/~/g, "~0").replace(/\//g, "~1");
}
__name(escapeToken, "escapeToken");
function unescapeToken(token) {
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}
__name(unescapeToken, "unescapeToken");
var RegExp2 = globalThis.RegExp;
var escape = /* @__PURE__ */ __name((string3) => string3.replace(/[/\\^$*+?.()|[\]{}]/g, "\\$&"), "escape");
var jsonSchemaAnnotationExcludedKeys = /* @__PURE__ */ new Set([...annotationExcludedKeys, IDENTIFIER_FALLBACK_KEY, ...jsonSchemaAnnotationKeys]);
function collectJsonSchemaAnnotations(annotations, options) {
  if (annotations === void 0)
    return;
  const out = {};
  const title = annotations.title;
  if (typeof title === "string")
    out.title = title;
  const description = annotations.description;
  const expected = annotations.expected;
  if (typeof description === "string")
    out.description = description;
  else if (options?.generateDescriptions === true && typeof expected === "string")
    out.description = expected;
  const defaultValue = annotations.default;
  if (isJson(defaultValue))
    out.default = defaultValue;
  const examples = annotations.examples;
  if (Array.isArray(examples) && isJson(examples))
    out.examples = examples;
  const readOnly = annotations.readOnly;
  if (typeof readOnly === "boolean")
    out.readOnly = readOnly;
  const writeOnly = annotations.writeOnly;
  if (typeof writeOnly === "boolean")
    out.writeOnly = writeOnly;
  const format32 = annotations.format;
  if (typeof format32 === "string")
    out.format = format32;
  const contentEncoding = annotations.contentEncoding;
  if (typeof contentEncoding === "string")
    out.contentEncoding = contentEncoding;
  const contentMediaType = annotations.contentMediaType;
  if (typeof contentMediaType === "string")
    out.contentMediaType = contentMediaType;
  const contentSchema = annotations.contentSchema;
  if (isJson(contentSchema))
    out.contentSchema = contentSchema;
  if (options?.includeAnnotationKey !== void 0) {
    for (const [key, value3] of Object.entries(annotations)) {
      if (jsonSchemaAnnotationExcludedKeys.has(key) || !options.includeAnnotationKey(key)) {
        continue;
      }
      if (isJson(value3))
        assignProperty(out, key, value3);
    }
  }
  return Object.keys(out).length === 0 ? void 0 : out;
}
__name(collectJsonSchemaAnnotations, "collectJsonSchemaAnnotations");
function extractJsonSchemaNumberType(schema) {
  let type = schema.type === "number" || schema.type === "integer" ? schema.type : void 0;
  let out = schema;
  if (type !== void 0) {
    out = {
      ...schema
    };
    delete out.type;
  }
  if (Array.isArray(out.allOf)) {
    const members = [];
    let changed = false;
    for (const member of out.allOf) {
      const extracted = extractJsonSchemaNumberType(member);
      if (extracted.type !== void 0) {
        changed = true;
        if (type === void 0 || extracted.type === "integer")
          type = extracted.type;
      }
      if (Object.keys(extracted.schema).length > 0)
        members.push(extracted.schema);
    }
    if (changed) {
      const {
        allOf: _,
        ...rest
      } = out;
      out = members.length === 0 ? rest : {
        ...rest,
        allOf: members
      };
    }
  }
  return {
    type,
    schema: out
  };
}
__name(extractJsonSchemaNumberType, "extractJsonSchemaNumberType");
function isJsonSchemaNumberEncoding(schema) {
  return Array.isArray(schema.anyOf) && schema.anyOf.length === 4 && schema.anyOf[0]?.type === "number" && schema.anyOf.slice(1).every((member) => member.type === "string");
}
__name(isJsonSchemaNumberEncoding, "isJsonSchemaNumberEncoding");
function appendJsonSchema(left, right) {
  if (Object.keys(left).length === 0)
    return right;
  const rightKeys = Object.keys(right);
  if (rightKeys.length === 0)
    return left;
  const leftType = left.type === "number" || left.type === "integer" ? left.type : void 0;
  const isNumberEncoding = isJsonSchemaNumberEncoding(left);
  if (leftType !== void 0 || isNumberEncoding) {
    const extracted = extractJsonSchemaNumberType(right);
    if (extracted.type !== void 0) {
      const type = leftType === "integer" || extracted.type === "integer" ? "integer" : "number";
      const base = {
        ...left,
        type
      };
      if (isNumberEncoding)
        delete base.anyOf;
      return Object.keys(extracted.schema).length === 0 ? base : appendJsonSchema(base, extracted.schema);
    }
  }
  const members = Array.isArray(right.allOf) && rightKeys.length === 1 ? right.allOf : [right];
  if (Array.isArray(left.allOf)) {
    return {
      ...left,
      allOf: [...left.allOf, ...members]
    };
  }
  if (typeof left.$ref === "string") {
    return {
      allOf: [left, ...members]
    };
  }
  return {
    ...left,
    allOf: members
  };
}
__name(appendJsonSchema, "appendJsonSchema");
function compileJsonSchema(representations, rootPaths, references, options) {
  const definitions = {};
  const definitionStates = /* @__PURE__ */ new Map();
  const compiledRepresentations = /* @__PURE__ */ new WeakMap();
  const fallbackDefinitions = /* @__PURE__ */ new Map();
  const referenceKeys = Object.keys(references);
  for (const key of referenceKeys) {
    compileDefinition(key, ["references", key]);
  }
  for (const key of referenceKeys) {
    const compiled = definitionStates.get(key);
    if (typeof compiled !== "string") {
      assignProperty(definitions, key, compiled);
    }
  }
  const schemas = map4(representations, (representation, index) => recur(representation, rootPaths[index]));
  return {
    dialect: "draft-2020-12",
    schemas,
    definitions
  };
  function compileDefinition(key, path) {
    const compiled = definitionStates.get(key);
    if (compiled !== void 0)
      return typeof compiled === "string" ? compiled : key;
    if (!Object.hasOwn(references, key)) {
      throw errorWithPath(`Invalid reference ${key}`, [...path, "$ref"]);
    }
    definitionStates.set(key, null);
    const representation = references[key];
    const schema = recur(representation, ["references", key]);
    const fallback = getIdentifierFallback(representation);
    if (fallback !== void 0) {
      const candidates = fallbackDefinitions.get(fallback);
      const match7 = candidates?.find((candidate) => equals(definitionStates.get(candidate), schema));
      if (match7 === void 0) {
        if (candidates === void 0)
          fallbackDefinitions.set(fallback, [key]);
        else
          candidates.push(key);
      } else {
        definitionStates.set(key, match7);
        return match7;
      }
    }
    definitionStates.set(key, schema);
    return key;
  }
  __name(compileDefinition, "compileDefinition");
  function getIdentifierFallback(representation) {
    if (representation._tag === "Reference")
      return;
    const annotations = representation.checks.length === 0 ? representation.annotations : representation.checks[representation.checks.length - 1].annotations;
    return typeof annotations?.identifier !== "string" && typeof annotations?.[IDENTIFIER_FALLBACK_KEY] === "string" ? annotations[IDENTIFIER_FALLBACK_KEY] : void 0;
  }
  __name(getIdentifierFallback, "getIdentifierFallback");
  function annotationSchemas(representation, path) {
    return representation?.schemas?.map((schema, index) => recur(schema, [...path, "schemas", index])) ?? [];
  }
  __name(annotationSchemas, "annotationSchemas");
  function compileCheck(check, type, path) {
    const annotations = check.annotations;
    const callback2 = annotations?.toJsonSchema;
    if (callback2 !== void 0) {
      const schemas2 = annotationSchemas(check.representation, [...path, "representation"]);
      const fragment = callback2({
        type,
        schemas: schemas2
      });
      const ordinary2 = collectJsonSchemaAnnotations(annotations, options);
      return ordinary2 === void 0 ? fragment : {
        ...fragment,
        ...ordinary2
      };
    }
    if (check._tag === "Filter")
      return;
    const children = check.checks.map((child, index) => compileCheck(child, type, [...path, "checks", index])).filter((child) => child !== void 0);
    if (children.length === 0)
      return;
    const ordinary = collectJsonSchemaAnnotations(annotations, options);
    return ordinary === void 0 ? {
      allOf: children
    } : {
      allOf: children,
      ...ordinary
    };
  }
  __name(compileCheck, "compileCheck");
  function recur(representation, path) {
    if (representation._tag === "Reference") {
      const canonical = compileDefinition(representation.$ref, path);
      return {
        $ref: `#/$defs/${escapeToken(canonical)}`
      };
    }
    const cached3 = compiledRepresentations.get(representation);
    if (cached3 !== void 0)
      return cached3;
    let output = on(representation, path);
    const ordinary = collectJsonSchemaAnnotations(representation.annotations, options);
    if (ordinary !== void 0) {
      output = {
        ...output,
        ...ordinary
      };
    }
    for (let index = 0; index < representation.checks.length; index++) {
      const type = typeof output.type === "string" && isJsonSchemaType(output.type) ? output.type : void 0;
      const check = compileCheck(representation.checks[index], type, [...path, "checks", index]);
      if (check !== void 0) {
        output = appendJsonSchema(output, check);
      }
    }
    compiledRepresentations.set(representation, output);
    return output;
  }
  __name(recur, "recur");
  function on(representation, path) {
    switch (representation._tag) {
      case "Any":
      case "Unknown":
        return {};
      case "ObjectKeyword":
        return {
          anyOf: [{
            type: "object"
          }, {
            type: "array"
          }]
        };
      case "Void":
      case "Undefined":
      case "Null":
        return {
          type: "null"
        };
      case "BigInt":
        return {
          type: "string",
          allOf: [{
            pattern: "^-?\\d+$"
          }]
        };
      case "Symbol":
      case "UniqueSymbol":
        return {
          type: "string",
          allOf: [{
            pattern: "^Symbol\\((.*)\\)$"
          }]
        };
      case "Declaration": {
        return {};
      }
      case "Suspend":
        return recur(representation.thunk, [...path, "thunk"]);
      case "Never":
        return {
          not: {}
        };
      case "String":
        return {
          type: "string"
        };
      case "Number":
        return {
          anyOf: [{
            type: "number"
          }, {
            type: "string",
            enum: ["NaN"]
          }, {
            type: "string",
            enum: ["Infinity"]
          }, {
            type: "string",
            enum: ["-Infinity"]
          }]
        };
      case "Boolean":
        return {
          type: "boolean"
        };
      case "Literal": {
        const literal = representation.literal;
        return typeof literal === "bigint" ? {
          type: "string",
          enum: [globalThis.String(literal)]
        } : {
          type: typeof literal,
          enum: [literal]
        };
      }
      case "Enum": {
        const types = representation.enums.map(([title, literal]) => typeof literal === "number" && !globalThis.Number.isFinite(literal) ? {
          type: "string",
          enum: [globalThis.String(literal)],
          title
        } : {
          type: typeof literal,
          enum: [literal],
          title
        });
        return types.length === 0 ? {
          not: {}
        } : {
          anyOf: types
        };
      }
      case "TemplateLiteral":
        return {
          type: "string",
          pattern: `^${representation.parts.map(getPartPattern).join("")}$`
        };
      case "Arrays": {
        if (representation.rest.length > 1) {
          throw errorWithPath("Invalid schema representation document", [...path, "rest"]);
        }
        const out = {
          type: "array"
        };
        let minItems = representation.elements.length;
        const prefixItems = representation.elements.map((element, index) => {
          if (element.isOptional)
            minItems--;
          const compiled = recur(element.type, [...path, "elements", index, "type"]);
          const annotations = collectJsonSchemaAnnotations(element.annotations, options);
          return annotations === void 0 ? compiled : appendJsonSchema(compiled, annotations);
        });
        if (prefixItems.length > 0) {
          out.prefixItems = prefixItems;
          out.maxItems = representation.elements.length;
          if (minItems > 0)
            out.minItems = minItems;
        } else {
          out.items = false;
        }
        if (representation.rest.length === 1) {
          delete out.maxItems;
          const rest = recur(representation.rest[0], [...path, "rest", 0]);
          if (Object.keys(rest).length > 0)
            out.items = rest;
          else
            delete out.items;
        }
        return out;
      }
      case "Objects": {
        if (representation.propertySignatures.length === 0 && representation.indexSignatures.length === 0) {
          return {
            anyOf: [{
              type: "object"
            }, {
              type: "array"
            }]
          };
        }
        const out = {
          type: "object"
        };
        const properties = {};
        const required = [];
        for (let index = 0; index < representation.propertySignatures.length; index++) {
          const property = representation.propertySignatures[index];
          if (typeof property.name !== "string") {
            throw errorWithPath("Invalid schema representation document", [...path, "propertySignatures", index, "name"]);
          }
          const name = property.name;
          const compiled = recur(property.type, [...path, "propertySignatures", index, "type"]);
          const annotations = collectJsonSchemaAnnotations(property.annotations, options);
          assignProperty(properties, name, annotations === void 0 ? compiled : appendJsonSchema(compiled, annotations));
          if (!property.isOptional)
            required.push(name);
        }
        if (representation.propertySignatures.length > 0)
          out.properties = properties;
        if (required.length > 0)
          out.required = required;
        out.additionalProperties = options?.additionalProperties ?? false;
        const patternProperties = {};
        for (let index = 0; index < representation.indexSignatures.length; index++) {
          const signature = representation.indexSignatures[index];
          let type = recur(signature.type, [...path, "indexSignatures", index, "type"]);
          if (Object.keys(type).length === 1 && "not" in type)
            type = false;
          const patterns = getParameterPatterns(signature.parameter, [...path, "indexSignatures", index, "parameter"], /* @__PURE__ */ new Set());
          if (patterns.length === 0) {
            out.additionalProperties = type;
          } else {
            for (const pattern of patterns)
              assignProperty(patternProperties, pattern, type);
          }
        }
        if (Object.keys(patternProperties).length > 0) {
          out.patternProperties = patternProperties;
          delete out.additionalProperties;
        }
        if (typeof out.additionalProperties === "object" && out.additionalProperties !== null && Object.keys(out.additionalProperties).length === 0) {
          delete out.additionalProperties;
        }
        return out;
      }
      case "Union": {
        const types = representation.types.map((type, index) => recur(type, [...path, "types", index]));
        if (types.length === 0)
          return {
            not: {}
          };
        if (types.length > 1) {
          const compacted = compactEnums(types);
          if (compacted !== void 0)
            return compacted;
        }
        return representation.mode === "anyOf" ? {
          anyOf: types
        } : {
          oneOf: types
        };
      }
    }
  }
  __name(on, "on");
  function getParameterPatterns(parameter, path, seenReferences) {
    switch (parameter._tag) {
      case "Reference": {
        if (!Object.hasOwn(references, parameter.$ref)) {
          throw errorWithPath(`Invalid reference ${parameter.$ref}`, [...path, "$ref"]);
        }
        compileDefinition(parameter.$ref, path);
        if (seenReferences.has(parameter.$ref))
          return [];
        const next = new Set(seenReferences).add(parameter.$ref);
        return getParameterPatterns(references[parameter.$ref], ["references", parameter.$ref], next);
      }
      case "String":
        return collectPatterns(recur(parameter, path));
      case "TemplateLiteral":
        return [`^${parameter.parts.map(getPartPattern).join("")}$`];
      case "Union":
        return parameter.types.flatMap((type, index) => getParameterPatterns(type, [...path, "types", index], seenReferences));
      default:
        throw errorWithPath("Invalid schema representation document", path);
    }
  }
  __name(getParameterPatterns, "getParameterPatterns");
}
__name(compileJsonSchema, "compileJsonSchema");
function isJsonSchemaType(input) {
  return input === "string" || input === "number" || input === "boolean" || input === "array" || input === "object" || input === "null" || input === "integer";
}
__name(isJsonSchemaType, "isJsonSchemaType");
function compactEnums(schemas) {
  let sharedType = void 0;
  const values = [];
  for (const schema of schemas) {
    const keys2 = Object.keys(schema);
    if (keys2.length !== 2 || schema.type === void 0 || !Array.isArray(schema.enum) || schema.enum.length === 0) {
      return;
    }
    if (sharedType === void 0)
      sharedType = schema.type;
    else if (schema.type !== sharedType)
      return;
    values.push(...schema.enum);
  }
  return {
    type: sharedType,
    enum: values
  };
}
__name(compactEnums, "compactEnums");
function collectPatterns(schema) {
  const patterns = [];
  if (typeof schema.pattern === "string")
    patterns.push(schema.pattern);
  for (const key of ["allOf", "anyOf", "oneOf"]) {
    const members = schema[key];
    if (Array.isArray(members)) {
      for (const member of members) {
        if (typeof member === "object" && member !== null && !Array.isArray(member)) {
          patterns.push(...collectPatterns(member));
        }
      }
    }
  }
  return patterns;
}
__name(collectPatterns, "collectPatterns");
function getPartPattern(part) {
  switch (part._tag) {
    case "Literal":
      return escape(globalThis.String(part.literal));
    case "String":
      return STRING_PATTERN;
    case "Number":
      return FINITE_PATTERN;
    case "TemplateLiteral":
      return part.parts.map(getPartPattern).join("");
    case "Union":
      return part.types.map(getPartPattern).join("|");
    default:
      throw errorWithPath("Invalid schema representation document", []);
  }
}
__name(getPartPattern, "getPartPattern");
function toJsonSchemaMultiDocument(document, options) {
  return compileJsonSchema(document.representations, document.representations.map((_, index) => ["representations", index]), document.references, options);
}
__name(toJsonSchemaMultiDocument, "toJsonSchemaMultiDocument");
function toRepresentations(asts) {
  return fromASTs(asts);
}
__name(toRepresentations, "toRepresentations");
function annotationsField(annotations) {
  return annotations === void 0 ? void 0 : {
    annotations
  };
}
__name(annotationsField, "annotationsField");
function isShareable(ast) {
  return isArrays(ast) || isObjects(ast) || isUnion(ast) && ast.types.some(isShareable);
}
__name(isShareable, "isShareable");
function resolveReferenceIdentifier(input, encoded) {
  const identifier2 = resolveIdentifier(encoded);
  if (identifier2 !== void 0)
    return {
      identifier: identifier2
    };
  const fallback = (encoded !== input ? resolveIdentifier(input) : void 0) ?? resolveIdentifierFallback(encoded);
  return fallback === void 0 ? void 0 : {
    identifier: `${fallback}Encoded`,
    fallback
  };
}
__name(resolveReferenceIdentifier, "resolveReferenceIdentifier");
function fromASTs(asts) {
  const references = {};
  const anonymousReferences = /* @__PURE__ */ new Map();
  const referenceOwners = /* @__PURE__ */ new Map();
  const valueIds = /* @__PURE__ */ new Map();
  const canonicalByKey = /* @__PURE__ */ new Map();
  let nextValueId = 0;
  const buildingReferences = /* @__PURE__ */ new Set();
  const visiting = /* @__PURE__ */ new Set();
  const visited = /* @__PURE__ */ new Set();
  const shared = /* @__PURE__ */ new Set();
  for (const ast of asts)
    visit(ast);
  const representations = map4(asts, (ast) => recur(ast));
  return {
    representations,
    references
  };
  function getReference(prefix, owner, separator = "_") {
    let candidate = prefix;
    let suffix = 0;
    while (referenceOwners.has(candidate)) {
      if (referenceOwners.get(candidate) === owner)
        return candidate;
      candidate = `${prefix}${separator}${++suffix}`;
    }
    referenceOwners.set(candidate, owner);
    return candidate;
  }
  __name(getReference, "getReference");
  function getValueId(value3) {
    if (typeof value3 === "number" && globalThis.Number.isNaN(value3)) {
      return nextValueId++;
    }
    const found = valueIds.get(value3);
    if (found !== void 0)
      return found;
    const id = nextValueId++;
    valueIds.set(value3, id);
    return id;
  }
  __name(getValueId, "getValueId");
  function getIdentityKey(ast) {
    let identity2 = ast._tag;
    for (const [key, value3] of Object.entries(ast)) {
      if (key !== "_tag" && key !== "context")
        identity2 += `:${getValueId(value3)}`;
    }
    return identity2;
  }
  __name(getIdentityKey, "getIdentityKey");
  function getCanonicalAST(ast) {
    const key = getIdentityKey(ast);
    const canonical = canonicalByKey.get(key);
    if (canonical === void 0) {
      canonicalByKey.set(key, ast);
      return ast;
    }
    return canonical;
  }
  __name(getCanonicalAST, "getCanonicalAST");
  function annotateReference(ast, referenceIdentifier, reference) {
    const fallback = referenceIdentifier.fallback;
    if (fallback !== void 0) {
      return resolveIdentifierFallback(ast) === fallback ? ast : annotate(ast, {
        [IDENTIFIER_FALLBACK_KEY]: fallback
      });
    }
    return reference === referenceIdentifier.identifier ? ast : annotate(ast, {
      identifier: reference
    });
  }
  __name(annotateReference, "annotateReference");
  function makeReference(reference, ast) {
    if (!Object.hasOwn(references, reference) && !buildingReferences.has(reference)) {
      buildingReferences.add(reference);
      const representation = on(ast);
      buildingReferences.delete(reference);
      assignProperty(references, reference, representation);
    }
    return {
      _tag: "Reference",
      $ref: reference
    };
  }
  __name(makeReference, "makeReference");
  function visit(input) {
    const ast = getLastEncoding(input);
    const owner = getCanonicalAST(ast);
    if (visited.has(owner)) {
      if (isShareable(ast))
        shared.add(owner);
      return;
    }
    visited.add(owner);
    visitChecks(ast.checks);
    switch (ast._tag) {
      case "Declaration":
      case "Arrays":
      case "Objects":
      case "Union":
        ast.recur((child) => {
          visit(child);
          return child;
        });
        break;
      case "TemplateLiteral":
        ast.parts.forEach(visit);
        break;
      case "Suspend":
        visit(ast.thunk());
        break;
    }
  }
  __name(visit, "visit");
  function visitChecks(checks) {
    checks?.forEach((check) => {
      check.annotations?.representation?.schemas?.forEach((schema) => visit(toType(schema)));
      if (check._tag === "FilterGroup")
        visitChecks(check.checks);
    });
  }
  __name(visitChecks, "visitChecks");
  function recur(input) {
    const ast = getLastEncoding(input);
    const owner = getCanonicalAST(ast);
    const referenceIdentifier = resolveReferenceIdentifier(input, ast);
    if (referenceIdentifier !== void 0) {
      const reference2 = getReference(referenceIdentifier.identifier, owner);
      return makeReference(reference2, annotateReference(ast, referenceIdentifier, reference2));
    }
    const found = anonymousReferences.get(owner);
    if (found !== void 0) {
      return {
        _tag: "Reference",
        $ref: found
      };
    }
    const isShared = shared.has(owner);
    if (isShared || visiting.has(owner)) {
      const reference2 = getReference(`${ast._tag}_`, owner, "");
      anonymousReferences.set(owner, reference2);
      return isShared ? makeReference(reference2, ast) : {
        _tag: "Reference",
        $ref: reference2
      };
    }
    visiting.add(owner);
    const representation = on(ast);
    visiting.delete(owner);
    const reference = anonymousReferences.get(owner);
    if (reference !== void 0) {
      assignProperty(references, reference, representation);
      return {
        _tag: "Reference",
        $ref: reference
      };
    }
    return representation;
  }
  __name(recur, "recur");
  function on(ast) {
    const checks = fromChecks(ast.checks);
    switch (ast._tag) {
      case "Declaration":
        return {
          _tag: "Declaration",
          typeParameters: ast.typeParameters.map((ast2) => recur(ast2)),
          checks,
          ...fromDeclarationAnnotations(ast.annotations)
        };
      case "Null":
      case "Undefined":
      case "Void":
      case "Never":
      case "Unknown":
      case "Any":
      case "String":
      case "Boolean":
      case "Number":
      case "BigInt":
      case "Symbol":
      case "ObjectKeyword":
        return {
          _tag: ast._tag,
          checks,
          ...annotationsField(ast.annotations)
        };
      case "Literal":
        return {
          _tag: "Literal",
          literal: ast.literal,
          checks,
          ...annotationsField(ast.annotations)
        };
      case "UniqueSymbol":
        return {
          _tag: "UniqueSymbol",
          symbol: ast.symbol,
          checks,
          ...annotationsField(ast.annotations)
        };
      case "Enum":
        return {
          _tag: "Enum",
          enums: ast.enums,
          checks,
          ...annotationsField(ast.annotations)
        };
      case "TemplateLiteral":
        return {
          _tag: "TemplateLiteral",
          parts: ast.parts.map((ast2) => recur(ast2)),
          checks,
          ...annotationsField(ast.annotations)
        };
      case "Arrays":
        return {
          _tag: "Arrays",
          elements: ast.elements.map((element) => {
            const projected = getLastEncoding(element);
            const annotations = projected.context?.annotations;
            return {
              isOptional: isOptional(projected),
              type: recur(element),
              ...annotationsField(annotations)
            };
          }),
          rest: ast.rest.map((ast2) => recur(ast2)),
          checks,
          ...annotationsField(ast.annotations)
        };
      case "Objects":
        return {
          _tag: "Objects",
          propertySignatures: ast.propertySignatures.map((property) => {
            const projected = getLastEncoding(property.type);
            const annotations = projected.context?.annotations;
            return {
              name: property.name,
              type: recur(property.type),
              isOptional: isOptional(projected),
              isMutable: isMutable(projected),
              ...annotationsField(annotations)
            };
          }),
          indexSignatures: ast.indexSignatures.map((index) => ({
            parameter: recur(index.parameter),
            type: recur(index.type)
          })),
          checks,
          ...annotationsField(ast.annotations)
        };
      case "Union":
        return {
          _tag: "Union",
          types: ast.types.map((ast2) => recur(ast2)),
          mode: ast.mode,
          checks,
          ...annotationsField(ast.annotations)
        };
      case "Suspend":
        return {
          _tag: "Suspend",
          checks: [],
          thunk: recur(ast.thunk()),
          ...annotationsField(ast.annotations)
        };
    }
  }
  __name(on, "on");
  function fromChecks(checks) {
    return checks?.map(fromCheck) ?? [];
  }
  __name(fromChecks, "fromChecks");
  function fromCheck(check) {
    switch (check._tag) {
      case "Filter":
        return {
          _tag: "Filter",
          aborted: check.aborted,
          ...fromCheckAnnotations(check.annotations)
        };
      case "FilterGroup":
        return {
          _tag: "FilterGroup",
          checks: map4(check.checks, fromCheck),
          ...fromCheckAnnotations(check.annotations)
        };
    }
  }
  __name(fromCheck, "fromCheck");
  function fromDeclarationAnnotations(annotations) {
    if (annotations === void 0)
      return;
    const {
      representation,
      ...ordinary
    } = annotations;
    return {
      ...representation === void 0 ? void 0 : {
        representation
      },
      ...Object.keys(ordinary).length === 0 ? void 0 : {
        annotations: ordinary
      }
    };
  }
  __name(fromDeclarationAnnotations, "fromDeclarationAnnotations");
  function fromCheckAnnotations(annotations) {
    if (annotations === void 0)
      return;
    const {
      representation,
      ...ordinary
    } = annotations;
    const projected = representation === void 0 ? void 0 : representation.schemas === void 0 ? representation : {
      ...representation,
      schemas: representation.schemas.map((schema) => recur(toType(schema)))
    };
    return {
      ...projected === void 0 ? void 0 : {
        representation: projected
      },
      ...Object.keys(ordinary).length === 0 ? void 0 : {
        annotations: ordinary
      }
    };
  }
  __name(fromCheckAnnotations, "fromCheckAnnotations");
}
__name(fromASTs, "fromASTs");
function apply(patch, oldValue) {
  let doc = oldValue;
  for (const op of patch) {
    doc = applyOperation(doc, op);
  }
  return doc;
}
__name(apply, "apply");
function isJsonObject(value3) {
  return typeof value3 === "object" && value3 !== null && !Array.isArray(value3);
}
__name(isJsonObject, "isJsonObject");
function tokenize(pointer) {
  if (pointer === "")
    return [];
  if (pointer.charCodeAt(0) !== 47) {
    throw new Error(`Invalid JSON Pointer, it must start with "/": ${JSON.stringify(pointer)}`);
  }
  return pointer.split("/").slice(1).map(unescapeToken);
}
__name(tokenize, "tokenize");
function toIndex(token) {
  if (!/^(0|[1-9]\d*)$/.test(token)) {
    throw new Error(`Invalid array index: "${token}"`);
  }
  return Number(token);
}
__name(toIndex, "toIndex");
function applyOperation(doc, op) {
  if (op.path === "") {
    if (op.op === "remove")
      throw new Error("Unsupported operation at the root");
    return op.value;
  }
  const resolved = resolveParent(doc, op.path);
  if (resolved === null) {
    throw new Error(`Cannot ${op.op} at "${op.path}" (parent not found or not a container).`);
  }
  const {
    lastToken,
    parent,
    stack
  } = resolved;
  if (Array.isArray(parent)) {
    if (lastToken === "-" && op.op !== "add") {
      throw new Error(`"-" is not valid for ${op.op} at "${op.path}".`);
    }
    const index = lastToken === "-" ? parent.length : toIndex(lastToken);
    const maxIndex = op.op === "add" ? parent.length : parent.length - 1;
    if (index > maxIndex)
      throw new Error(`Array index out of bounds at "${op.path}".`);
    const updated = parent.slice();
    if (op.op === "add")
      updated.splice(index, 0, op.value);
    else if (op.op === "remove")
      updated.splice(index, 1);
    else
      updated[index] = op.value;
    return rebuildFromStack(stack, updated);
  }
  if (isJsonObject(parent)) {
    if (op.op !== "add" && !Object.hasOwn(parent, lastToken)) {
      throw new Error(`Property "${lastToken}" does not exist at "${op.path}".`);
    }
    const updated = {
      ...parent
    };
    if (op.op === "remove")
      delete updated[lastToken];
    else
      assignProperty(updated, lastToken, op.value);
    return rebuildFromStack(stack, updated);
  }
  throw new Error(`Cannot ${op.op} at "${op.path}" (parent not found or not a container).`);
}
__name(applyOperation, "applyOperation");
function resolveParent(doc, pointer) {
  const tokens = tokenize(pointer);
  if (tokens.length === 0)
    return null;
  const lastToken = tokens[tokens.length - 1];
  const stack = [];
  let cur = doc;
  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i];
    if (Array.isArray(cur)) {
      const idx = toIndex(token);
      if (idx >= cur.length)
        return null;
      stack.push({
        container: cur,
        token: idx
      });
      cur = cur[idx];
      continue;
    }
    if (isJsonObject(cur)) {
      if (!Object.hasOwn(cur, token))
        return null;
      stack.push({
        container: cur,
        token
      });
      cur = cur[token];
      continue;
    }
    return null;
  }
  return {
    stack,
    parent: cur,
    lastToken
  };
}
__name(resolveParent, "resolveParent");
function rebuildFromStack(stack, newParent) {
  let acc = newParent;
  for (let i = stack.length - 1; i >= 0; i--) {
    const {
      container,
      token
    } = stack[i];
    if (Array.isArray(container)) {
      const copy = container.slice();
      copy[token] = acc;
      acc = copy;
    } else {
      const copy = {
        ...container
      };
      assignProperty(copy, token, acc);
      acc = copy;
    }
  }
  return acc;
}
__name(rebuildFromStack, "rebuildFromStack");
var DRAFT_04_COPY_KEYWORDS = /* @__PURE__ */ new Set(["$ref", "type", "required", "enum", "title", "description", "default", "format", "pattern", "minLength", "maxLength", "minItems", "maxItems", "minProperties", "maxProperties", "multipleOf", "uniqueItems"]);
var DRAFT_07_COPY_KEYWORDS = /* @__PURE__ */ new Set([...DRAFT_04_COPY_KEYWORDS, "const", "examples", "readOnly", "writeOnly", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"]);
var DRAFT_07_SINGLE_SUBSCHEMA_KEYWORDS = /* @__PURE__ */ new Set(["not", "additionalProperties", "propertyNames"]);
var MAP_SUBSCHEMA_KEYWORDS = /* @__PURE__ */ new Set(["properties", "patternProperties"]);
var ARRAY_SUBSCHEMA_KEYWORDS = /* @__PURE__ */ new Set(["allOf", "anyOf", "oneOf"]);
var DRAFT_2020_12_MAP_SUBSCHEMA_KEYWORDS = /* @__PURE__ */ new Set(["$defs", ...MAP_SUBSCHEMA_KEYWORDS, "dependentSchemas"]);
var DRAFT_2020_12_ARRAY_SUBSCHEMA_KEYWORDS = /* @__PURE__ */ new Set([...ARRAY_SUBSCHEMA_KEYWORDS, "prefixItems"]);
var DRAFT_2020_12_SINGLE_SUBSCHEMA_KEYWORDS = /* @__PURE__ */ new Set([...DRAFT_07_SINGLE_SUBSCHEMA_KEYWORDS, "unevaluatedProperties", "items", "contains", "unevaluatedItems", "if", "then", "else", "contentSchema"]);
function toMultiDocumentOpenApi3_1(multiDocument) {
  const definitionKeys = Object.keys(multiDocument.definitions);
  const keyMap = /* @__PURE__ */ new Map();
  const usedKeys = new Set(definitionKeys.filter((key) => VALID_OPEN_API_COMPONENTS_SCHEMAS_KEY_REGEXP.test(key)));
  const invalidKeys = definitionKeys.filter((key) => !VALID_OPEN_API_COMPONENTS_SCHEMAS_KEY_REGEXP.test(key)).sort().map((key) => [key, sanitizeOpenApiComponentsSchemasKey(key)]);
  for (const [key, base] of invalidKeys) {
    if (usedKeys.has(base))
      continue;
    usedKeys.add(base);
    keyMap.set(key, base);
  }
  for (const [key, base] of invalidKeys) {
    if (keyMap.has(key))
      continue;
    let candidate;
    let suffix = 0;
    do
      candidate = `${base}_${++suffix}`;
    while (usedKeys.has(candidate));
    usedKeys.add(candidate);
    keyMap.set(key, candidate);
  }
  function rewrite(schema) {
    return transformSchema(schema, (schema2) => rewriteSchemaRef(schema2, ($ref) => {
      if (!$ref.startsWith("#/$defs/"))
        return $ref;
      const path = $ref.slice("#/$defs/".length);
      const separatorIndex = path.indexOf("/");
      const token = separatorIndex === -1 ? path : path.slice(0, separatorIndex);
      const rest = separatorIndex === -1 ? "" : path.slice(separatorIndex);
      const key = keyMap.get(unescapeToken(token)) ?? token;
      return `#/components/schemas/${key}${rest}`;
    }));
  }
  __name(rewrite, "rewrite");
  return {
    dialect: "openapi-3.1",
    schemas: map4(multiDocument.schemas, rewrite),
    definitions: mapEntries(multiDocument.definitions, (definition, key) => [keyMap.get(key) ?? key, rewrite(definition)])
  };
}
__name(toMultiDocumentOpenApi3_1, "toMultiDocumentOpenApi3_1");
var VALID_OPEN_API_COMPONENTS_SCHEMAS_KEY_REGEXP = /^[a-zA-Z0-9.\-_]+$/;
function sanitizeOpenApiComponentsSchemasKey(s) {
  return s.length === 0 ? "_" : s.replace(/[^a-zA-Z0-9._-]/gu, "_");
}
__name(sanitizeOpenApiComponentsSchemasKey, "sanitizeOpenApiComponentsSchemasKey");
function transformSchema(node, transform3) {
  return walk(node);
  function walk(node2) {
    if (!isObject(node2) || Array.isArray(node2))
      return node2;
    const out = {};
    for (const key of Object.keys(node2)) {
      const value3 = node2[key];
      let transformed = value3;
      if (DRAFT_2020_12_MAP_SUBSCHEMA_KEYWORDS.has(key)) {
        transformed = Array.isArray(value3) ? value3 : mapObject(value3, walk) ?? value3;
      } else if (DRAFT_2020_12_ARRAY_SUBSCHEMA_KEYWORDS.has(key)) {
        transformed = Array.isArray(value3) ? value3.map(walk) : value3;
      } else if (DRAFT_2020_12_SINGLE_SUBSCHEMA_KEYWORDS.has(key)) {
        transformed = walk(value3);
      }
      assignProperty(out, key, transformed);
    }
    return transform3(out);
  }
  __name(walk, "walk");
}
__name(transformSchema, "transformSchema");
function rewriteSchemaRef(schema, rewrite) {
  if (typeof schema.$ref === "string") {
    assignProperty(schema, "$ref", rewrite(schema.$ref));
  }
  return schema;
}
__name(rewriteSchemaRef, "rewriteSchemaRef");
function mapObject(value3, f) {
  if (!isObject(value3))
    return;
  const out = {};
  for (const k of Object.keys(value3))
    assignProperty(out, k, f(value3[k]));
  return out;
}
__name(mapObject, "mapObject");
var TypeId14 = TypeId13;
function declareConstructor() {
  return (typeParameters, run22, annotations) => {
    return make12(new Declaration(typeParameters.map(getAST), (typeParameters2) => run22(typeParameters2.map((ast) => make12(ast))), annotations));
  };
}
__name(declareConstructor, "declareConstructor");
function declare(is2, annotations) {
  return declareConstructor()([], () => (input, ast) => is2(input) ? succeed6(input) : fail5(new InvalidType(ast)), annotations);
}
__name(declare, "declare");
function decodeUnknownEffect2(schema, options) {
  const parser = decodeUnknownEffect(schema, options);
  return (input, options2) => {
    return fromIssueEffect(parser(input, options2));
  };
}
__name(decodeUnknownEffect2, "decodeUnknownEffect2");
function getSchemaErrorOrThrow(cause, message) {
  let schemaError;
  for (const reason of cause.reasons) {
    if (!isFailReason2(reason) || !isSchemaError(reason.error)) {
      throw new globalThis.Error(message, {
        cause
      });
    }
    schemaError ??= reason.error;
  }
  if (schemaError === void 0) {
    throw new globalThis.Error(message, {
      cause
    });
  }
  return schemaError;
}
__name(getSchemaErrorOrThrow, "getSchemaErrorOrThrow");
function runSchemaErrorSync(self) {
  const exit3 = runSyncExit2(self);
  if (isSuccess3(exit3)) {
    return exit3.value;
  }
  throw getSchemaErrorOrThrow(exit3.cause, "Sync adapter can only throw schema errors");
}
__name(runSchemaErrorSync, "runSchemaErrorSync");
function decodeUnknownSync(schema, options) {
  const parser = decodeUnknownEffect2(schema, options);
  return (input, options2) => {
    return runSchemaErrorSync(parser(input, options2));
  };
}
__name(decodeUnknownSync, "decodeUnknownSync");
function encodeUnknownEffect2(schema, options) {
  const parser = encodeUnknownEffect(schema, options);
  return (input, options2) => {
    return fromIssueEffect(parser(input, options2));
  };
}
__name(encodeUnknownEffect2, "encodeUnknownEffect2");
var encodeEffect = encodeUnknownEffect2;
function encodeUnknownSync(schema, options) {
  const parser = encodeUnknownEffect2(schema, options);
  return (input, options2) => {
    return runSchemaErrorSync(parser(input, options2));
  };
}
__name(encodeUnknownSync, "encodeUnknownSync");
var encodeSync2 = encodeUnknownSync;
var make12 = make11;
function isSchema(u) {
  return hasProperty(u, TypeId14) && u[TypeId14] === TypeId14;
}
__name(isSchema, "isSchema");
var optionalKey2 = /* @__PURE__ */ lambda((schema) => make12(optionalKey(schema.ast), {
  schema
}));
var optional = /* @__PURE__ */ lambda((self) => optionalKey2(UndefinedOr(self)));
var toType2 = /* @__PURE__ */ lambda((schema) => make12(toType(schema.ast), {
  schema
}));
var toEncoded2 = /* @__PURE__ */ lambda((schema) => make12(toEncoded(schema.ast), {
  schema
}));
function Literal2(literal) {
  const out = make12(new Literal(literal), {
    literal,
    transform(to) {
      return out.pipe(decodeTo2(Literal2(to), {
        decode: transform(() => to),
        encode: transform(() => literal)
      }));
    }
  });
  return out;
}
__name(Literal2, "Literal2");
var Never2 = /* @__PURE__ */ make12(never2);
var Unknown2 = /* @__PURE__ */ make12(unknown);
var Null2 = /* @__PURE__ */ make12(null_);
var Undefined2 = /* @__PURE__ */ make12(undefined_2);
var String4 = /* @__PURE__ */ make12(string2);
var Number5 = /* @__PURE__ */ make12(number2);
var Boolean2 = /* @__PURE__ */ make12(boolean);
var Void2 = /* @__PURE__ */ make12(void_4);
function makeStruct(ast, fields) {
  return make12(ast, {
    fields,
    mapFields(f, options) {
      const fields2 = f(this.fields);
      return makeStruct(struct(fields2, options?.unsafePreserveChecks ? this.ast.checks : void 0), fields2);
    }
  });
}
__name(makeStruct, "makeStruct");
function Struct(fields) {
  return makeStruct(struct(fields, void 0), fields);
}
__name(Struct, "Struct");
function makeTuple(ast, elements) {
  return make12(ast, {
    elements,
    mapElements(f, options) {
      const elements2 = f(this.elements);
      return makeTuple(tuple(elements2, options?.unsafePreserveChecks ? this.ast.checks : void 0), elements2);
    }
  });
}
__name(makeTuple, "makeTuple");
function Tuple2(elements) {
  return makeTuple(tuple(elements), elements);
}
__name(Tuple2, "Tuple2");
var ArraySchema = /* @__PURE__ */ lambda((schema) => make12(new Arrays(false, [], [schema.ast]), {
  value: schema
}));
function makeUnion(ast, members) {
  return make12(ast, {
    members,
    mapMembers(f, options) {
      const members2 = f(this.members);
      return makeUnion(union2(members2, this.ast.mode, options?.unsafePreserveChecks ? this.ast.checks : void 0), members2);
    }
  });
}
__name(makeUnion, "makeUnion");
function Union2(members, options) {
  return makeUnion(union2(members, options?.mode ?? "anyOf", void 0), members);
}
__name(Union2, "Union2");
function Literals(literals) {
  const members = literals.map(Literal2);
  return make12(union2(members, "anyOf", void 0), {
    literals,
    members,
    mapMembers(f) {
      return Union2(f(this.members));
    },
    pick(literals2) {
      return Literals(literals2);
    },
    transform(to) {
      return Union2(members.map((member, index) => member.transform(to[index])));
    }
  });
}
__name(Literals, "Literals");
var NullOr = /* @__PURE__ */ lambda((self) => Union2([self, Null2]));
var UndefinedOr = /* @__PURE__ */ lambda((self) => Union2([self, Undefined2]));
function brand2(identifier2) {
  return (schema) => make12(brand(schema.ast, identifier2), {
    schema,
    identifier: identifier2
  });
}
__name(brand2, "brand2");
function decodeTo2(to, transformation) {
  return (from) => {
    return make12(decodeTo(from.ast, to.ast, transformation ? make9(transformation) : passthrough2()), {
      from,
      to
    });
  };
}
__name(decodeTo2, "decodeTo2");
function withConstructorDefault2(defaultValue) {
  return (schema) => make12(withConstructorDefault(schema.ast, toIssueEffect(defaultValue)), {
    schema
  });
}
__name(withConstructorDefault2, "withConstructorDefault2");
function toIssueEffect(self) {
  return catchCause2(self, (cause) => failCauseSync2(() => map6(cause, (error) => error.issue)));
}
__name(toIssueEffect, "toIssueEffect");
function tag(literal) {
  return Literal2(literal).pipe(withConstructorDefault2(succeed6(literal)));
}
__name(tag, "tag");
function TaggedStruct(value3, fields) {
  return Struct({
    _tag: tag(value3),
    ...fields
  });
}
__name(TaggedStruct, "TaggedStruct");
function instanceOf(constructor, annotations) {
  return declare((u) => u instanceof constructor, annotations);
}
__name(instanceOf, "instanceOf");
function link() {
  return (encodeTo, transformation) => {
    return new Link(encodeTo.ast, make9(transformation));
  };
}
__name(link, "link");
var makeFilter2 = makeFilter;
function isPattern2(regExp, annotations) {
  const source = regExp.source;
  const flags = regExp.flags;
  const runtimeRegExp = flags === "" ? `new RegExp(${format(source)})` : `new RegExp(${format(source)}, ${format(flags)})`;
  return isPattern(regExp, {
    toCode: /* @__PURE__ */ __name(() => ({
      runtime: `Schema.isPattern(${runtimeRegExp})`
    }), "toCode"),
    ...annotations
  });
}
__name(isPattern2, "isPattern2");
function isBase64(annotations) {
  const regExp = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
  return isPattern2(regExp, {
    expected: "a base64 encoded string",
    representation: {
      id: "effect/schema/isBase64",
      payload: null
    },
    toJsonSchema: /* @__PURE__ */ __name(() => ({
      pattern: regExp.source
    }), "toJsonSchema"),
    toCode: /* @__PURE__ */ __name(() => ({
      runtime: "Schema.isBase64()"
    }), "toCode"),
    ...annotations
  });
}
__name(isBase64, "isBase64");
var Finite = /* @__PURE__ */ make12(finite);
function isInt(annotations) {
  return makeFilter2((n) => globalThis.Number.isSafeInteger(n), {
    expected: "an integer",
    representation: {
      id: "effect/schema/isInt",
      payload: null
    },
    toJsonSchema: /* @__PURE__ */ __name(() => ({
      type: "integer"
    }), "toJsonSchema"),
    toCode: /* @__PURE__ */ __name(() => ({
      runtime: "Schema.isInt()"
    }), "toCode"),
    arbitrary: {
      constraint: {
        integer: true
      }
    },
    ...annotations
  });
}
__name(isInt, "isInt");
var Int = /* @__PURE__ */ Number5.check(/* @__PURE__ */ isInt());
function Option(value3) {
  const schema = declareConstructor()([value3], ([value4]) => (input, ast, options) => {
    if (isOption2(input)) {
      if (isNone2(input)) {
        return succeedNone2;
      }
      return mapBothEager2(decodeUnknownEffect(value4)(input.value, options), {
        onSuccess: some2,
        onFailure: /* @__PURE__ */ __name((issue) => new Composite(ast, [new Pointer(["value"], issue)]), "onFailure")
      });
    }
    return fail5(new InvalidType(ast));
  }, {
    representation: {
      id: "effect/schema/Option",
      payload: null
    },
    toCode: /* @__PURE__ */ __name(({
      typeParameters
    }) => ({
      runtime: `Schema.Option(${typeParameters[0].runtime})`,
      Type: `Option.Option<${typeParameters[0].Type}>`,
      importDeclarations: [`import * as Option from "effect/Option"`]
    }), "toCode"),
    expected: "Option",
    toCodec: /* @__PURE__ */ __name(([value4]) => link()(Union2([Struct({
      _tag: Literal2("Some"),
      value: value4
    }), Struct({
      _tag: Literal2("None")
    })]), transform2({
      decode: /* @__PURE__ */ __name((e) => e._tag === "None" ? none2() : some2(e.value), "decode"),
      encode: /* @__PURE__ */ __name((o) => isSome2(o) ? {
        _tag: "Some",
        value: o.value
      } : {
        _tag: "None"
      }, "encode")
    })), "toCodec"),
    toArbitrary: /* @__PURE__ */ __name(([value4]) => (fc, ctx) => {
      const terminal = fc.constant(none2());
      const arbitrary = fc.oneof(terminal, value4.arbitrary.map(some2));
      return withRecursion(fc, ctx, terminal, arbitrary);
    }, "toArbitrary"),
    toEquivalence: /* @__PURE__ */ __name(([value4]) => makeEquivalence(value4), "toEquivalence"),
    toFormatter: /* @__PURE__ */ __name(([value4]) => match({
      onNone: /* @__PURE__ */ __name(() => "none()", "onNone"),
      onSome: /* @__PURE__ */ __name((t) => `some(${value4(t)})`, "onSome")
    }), "toFormatter")
  });
  return make12(schema.ast, {
    value: value3
  });
}
__name(Option, "Option");
function OptionFromNullOr(schema) {
  return NullOr(schema).pipe(decodeTo2(Option(toType2(schema)), optionFromNullOr()));
}
__name(OptionFromNullOr, "OptionFromNullOr");
function CauseReason(error, defect) {
  const schema = declareConstructor()([error, defect], ([error2, defect2]) => (input, ast, options) => {
    if (!isReason(input)) {
      return fail5(new InvalidType(ast));
    }
    switch (input._tag) {
      case "Fail":
        return mapBothEager2(decodeUnknownEffect(error2)(input.error, options), {
          onSuccess: makeFailReason,
          onFailure: /* @__PURE__ */ __name((issue) => new Composite(ast, [new Pointer(["error"], issue)]), "onFailure")
        });
      case "Die":
        return mapBothEager2(decodeUnknownEffect(defect2)(input.defect, options), {
          onSuccess: makeDieReason,
          onFailure: /* @__PURE__ */ __name((issue) => new Composite(ast, [new Pointer(["defect"], issue)]), "onFailure")
        });
      case "Interrupt":
        return succeed6(input);
    }
  }, {
    representation: {
      id: "effect/schema/CauseReason",
      payload: null
    },
    toCode: /* @__PURE__ */ __name(({
      typeParameters
    }) => ({
      runtime: `Schema.CauseReason(${typeParameters[0].runtime}, ${typeParameters[1].runtime})`,
      Type: `Cause.Failure<${typeParameters[0].Type}, ${typeParameters[1].Type}>`,
      importDeclarations: [`import * as Cause from "effect/Cause"`]
    }), "toCode"),
    expected: "Cause.Failure",
    toCodec: /* @__PURE__ */ __name(([error2, defect2]) => link()(Union2([Struct({
      _tag: Literal2("Fail"),
      error: error2
    }), Struct({
      _tag: Literal2("Die"),
      defect: defect2
    }), Struct({
      _tag: Literal2("Interrupt"),
      fiberId: UndefinedOr(Finite)
    })]), transform2({
      decode: /* @__PURE__ */ __name((e) => {
        switch (e._tag) {
          case "Fail":
            return makeFailReason(e.error);
          case "Die":
            return makeDieReason(e.defect);
          case "Interrupt":
            return makeInterruptReason2(e.fiberId);
        }
      }, "decode"),
      encode: identity
    })), "toCodec"),
    toArbitrary: /* @__PURE__ */ __name(([error2, defect2]) => causeReasonToArbitrary(error2, defect2), "toArbitrary"),
    toEquivalence: /* @__PURE__ */ __name(([error2, defect2]) => causeReasonToEquivalence(error2, defect2), "toEquivalence"),
    toFormatter: /* @__PURE__ */ __name(([error2, defect2]) => causeReasonToFormatter(error2, defect2), "toFormatter")
  });
  return make12(schema.ast, {
    error,
    defect
  });
}
__name(CauseReason, "CauseReason");
function causeReasonToArbitrary(error, defect) {
  return (fc, ctx) => {
    const terminal = fc.constant(makeInterruptReason2());
    const arbitrary = fc.oneof(terminal, fc.integer({
      min: 1
    }).map(makeInterruptReason2), error.arbitrary.map((e) => makeFailReason(e)), defect.arbitrary.map((d) => makeDieReason(d)));
    return withRecursion(fc, ctx, terminal, arbitrary);
  };
}
__name(causeReasonToArbitrary, "causeReasonToArbitrary");
function causeReasonToEquivalence(error, defect) {
  return (a, b) => {
    if (a._tag !== b._tag)
      return false;
    switch (a._tag) {
      case "Fail":
        return error(a.error, b.error);
      case "Die":
        return defect(a.defect, b.defect);
      case "Interrupt":
        return a.fiberId === b.fiberId;
    }
  };
}
__name(causeReasonToEquivalence, "causeReasonToEquivalence");
function causeReasonToFormatter(error, defect) {
  return (t) => {
    switch (t._tag) {
      case "Fail":
        return `Fail(${error(t.error)})`;
      case "Die":
        return `Die(${defect(t.defect)})`;
      case "Interrupt":
        return "Interrupt";
    }
  };
}
__name(causeReasonToFormatter, "causeReasonToFormatter");
function Cause(error, defect) {
  const schema = declareConstructor()([error, defect], ([error2, defect2]) => {
    const failures = ArraySchema(CauseReason(error2, defect2));
    return (input, ast, options) => {
      if (!isCause2(input)) {
        return fail5(new InvalidType(ast));
      }
      return mapBothEager2(decodeUnknownEffect(failures)(input.reasons, options), {
        onSuccess: fromReasons,
        onFailure: /* @__PURE__ */ __name((issue) => new Composite(ast, [new Pointer(["failures"], issue)]), "onFailure")
      });
    };
  }, {
    representation: {
      id: "effect/schema/Cause",
      payload: null
    },
    toCode: /* @__PURE__ */ __name(({
      typeParameters
    }) => ({
      runtime: `Schema.Cause(${typeParameters[0].runtime}, ${typeParameters[1].runtime})`,
      Type: `Cause.Cause<${typeParameters[0].Type}, ${typeParameters[1].Type}>`,
      importDeclarations: [`import * as Cause from "effect/Cause"`]
    }), "toCode"),
    expected: "Cause",
    toCodec: /* @__PURE__ */ __name(([error2, defect2]) => link()(ArraySchema(CauseReason(error2, defect2)), transform2({
      decode: fromReasons,
      encode: /* @__PURE__ */ __name(({
        reasons: failures
      }) => failures, "encode")
    })), "toCodec"),
    toArbitrary: /* @__PURE__ */ __name(([error2, defect2]) => causeToArbitrary(error2, defect2), "toArbitrary"),
    toEquivalence: /* @__PURE__ */ __name(([error2, defect2]) => causeToEquivalence(error2, defect2), "toEquivalence"),
    toFormatter: /* @__PURE__ */ __name(([error2, defect2]) => causeToFormatter(error2, defect2), "toFormatter")
  });
  return make12(schema.ast, {
    error,
    defect
  });
}
__name(Cause, "Cause");
function causeToArbitrary(error, defect) {
  return (fc, ctx) => {
    const reason = causeReasonToArbitrary(error, defect)(fc, ctx);
    const terminal = fc.constant(empty3);
    const arbitrary = fc.array(reason.arbitrary).map(fromReasons);
    return withRecursion(fc, ctx, terminal, arbitrary);
  };
}
__name(causeToArbitrary, "causeToArbitrary");
function causeToEquivalence(error, defect) {
  const failures = Array_(causeReasonToEquivalence(error, defect));
  return (a, b) => failures(a.reasons, b.reasons);
}
__name(causeToEquivalence, "causeToEquivalence");
function causeToFormatter(error, defect) {
  const causeReason = causeReasonToFormatter(error, defect);
  return (t) => `Cause([${t.reasons.map(causeReason).join(", ")}])`;
}
__name(causeToFormatter, "causeToFormatter");
var getErrorOptionsKey = /* @__PURE__ */ __name((options) => (options?.includeStack === true ? 1 : 0) | (options?.excludeCause === true ? 2 : 0), "getErrorOptionsKey");
var getErrorOptions = /* @__PURE__ */ __name((key) => {
  switch (key) {
    case 0:
      return;
    case 1:
      return {
        includeStack: true
      };
    case 2:
      return {
        excludeCause: true
      };
    case 3:
      return {
        includeStack: true,
        excludeCause: true
      };
  }
}, "getErrorOptions");
var defectSchemaCache = [];
function Defect(options) {
  const key = getErrorOptionsKey(options);
  const cached3 = defectSchemaCache[key];
  if (cached3 !== void 0) {
    return cached3;
  }
  const schema = Json2.pipe(decodeTo2(Unknown2, defectFromJson(getErrorOptions(key))));
  defectSchemaCache[key] = schema;
  return schema;
}
__name(Defect, "Defect");
function withRecursion(fc, ctx, terminal, arbitrary) {
  return {
    arbitrary: terminal === void 0 || ctx.recursion === void 0 ? arbitrary : fc.oneof(ctx.recursion, terminal, arbitrary),
    terminal
  };
}
__name(withRecursion, "withRecursion");
var RegExp3 = /* @__PURE__ */ instanceOf(globalThis.RegExp, {
  representation: {
    id: "effect/schema/RegExp",
    payload: null
  },
  toCode: /* @__PURE__ */ __name(() => ({
    runtime: `Schema.RegExp`,
    Type: `globalThis.RegExp`
  }), "toCode"),
  expected: "RegExp",
  toCodecJson: /* @__PURE__ */ __name(() => link()(Struct({
    source: String4,
    flags: String4
  }), transformOrFail2({
    decode: /* @__PURE__ */ __name((e) => try_2({
      try: /* @__PURE__ */ __name(() => new globalThis.RegExp(e.source, e.flags), "try"),
      catch: /* @__PURE__ */ __name(() => new InvalidValue({
        message: "Expected valid RegExp source and flags"
      }), "catch")
    }), "decode"),
    encode: /* @__PURE__ */ __name((regExp) => succeed6({
      source: regExp.source,
      flags: regExp.flags
    }), "encode")
  })), "toCodecJson"),
  toArbitrary: /* @__PURE__ */ __name(() => (fc) => fc.tuple(fc.constantFrom(".", ".*", "\\d+", "\\w+", "[a-z]+", "[A-Z]+", "[0-9]+", "^[a-zA-Z0-9]+$", "^\\d{4}-\\d{2}-\\d{2}$"), fc.uniqueArray(fc.constantFrom("g", "i", "m", "s", "u", "y"), {
    minLength: 0,
    maxLength: 6
  }).map((flags) => flags.join(""))).map(([source, flags]) => new globalThis.RegExp(source, flags)), "toArbitrary"),
  toEquivalence: /* @__PURE__ */ __name(() => (a, b) => a.source === b.source && a.flags === b.flags, "toEquivalence")
});
var URLString = /* @__PURE__ */ String4.annotate({
  expected: "a string that will be decoded as a URL"
});
var URL2 = /* @__PURE__ */ instanceOf(globalThis.URL, {
  representation: {
    id: "effect/schema/URL",
    payload: null
  },
  toCode: /* @__PURE__ */ __name(() => ({
    runtime: `Schema.URL`,
    Type: `globalThis.URL`
  }), "toCode"),
  expected: "URL",
  toCodecJson: /* @__PURE__ */ __name(() => link()(URLString, urlFromString), "toCodecJson"),
  toArbitrary: /* @__PURE__ */ __name(() => (fc) => fc.webUrl().map((s) => new globalThis.URL(s)), "toArbitrary"),
  toEquivalence: /* @__PURE__ */ __name(() => (a, b) => a.toString() === b.toString(), "toEquivalence")
});
function dateArbitraryConstraints(ordered, base, toDate2) {
  const out = {
    ...base
  };
  if (ordered?.minimum !== void 0) {
    const minimum = toDate2 === void 0 ? ordered.minimum : toDate2(ordered.minimum);
    const nextMin = ordered.exclusiveMinimum ? new globalThis.Date(minimum.getTime() + 1) : minimum;
    if (out.min === void 0 || nextMin.getTime() > out.min.getTime()) {
      out.min = nextMin;
    }
  }
  if (ordered?.maximum !== void 0) {
    const maximum = toDate2 === void 0 ? ordered.maximum : toDate2(ordered.maximum);
    const nextMax = ordered.exclusiveMaximum ? new globalThis.Date(maximum.getTime() - 1) : maximum;
    if (out.max === void 0 || nextMax.getTime() < out.max.getTime()) {
      out.max = nextMax;
    }
  }
  return out;
}
__name(dateArbitraryConstraints, "dateArbitraryConstraints");
var JsonString = /* @__PURE__ */ String4.annotate({
  expected: "a string that will be decoded as JSON",
  contentMediaType: "application/json"
});
function fromJsonString2(schema, options) {
  return JsonString.pipe(decodeTo2(schema, fromJsonString(options)));
}
__name(fromJsonString2, "fromJsonString2");
var File = /* @__PURE__ */ instanceOf(globalThis.File, {
  representation: {
    id: "effect/schema/File",
    payload: null
  },
  toCode: /* @__PURE__ */ __name(() => ({
    runtime: `Schema.File`,
    Type: `globalThis.File`
  }), "toCode"),
  expected: "File",
  toCodecJson: /* @__PURE__ */ __name(() => link()(Struct({
    data: String4.check(isBase64()),
    type: String4,
    name: String4,
    lastModified: Int
  }), transformOrFail2({
    decode: /* @__PURE__ */ __name((e) => match2(decodeBase64(e.data), {
      onFailure: /* @__PURE__ */ __name(() => fail5(new InvalidValue({
        message: "Expected a valid Base64 string"
      })), "onFailure"),
      onSuccess: /* @__PURE__ */ __name((bytes) => {
        const buffer = new globalThis.Uint8Array(bytes);
        return succeed6(new globalThis.File([buffer], e.name, {
          type: e.type,
          lastModified: e.lastModified
        }));
      }, "onSuccess")
    }), "decode"),
    encode: /* @__PURE__ */ __name((file) => tryPromise2({
      try: /* @__PURE__ */ __name(async () => {
        const bytes = new globalThis.Uint8Array(await file.arrayBuffer());
        return {
          data: encodeBase64(bytes),
          type: file.type,
          name: file.name,
          lastModified: file.lastModified
        };
      }, "try"),
      catch: /* @__PURE__ */ __name(() => new InvalidValue({
        message: "Expected File to be readable"
      }), "catch")
    }), "encode")
  })), "toCodecJson")
});
var FormData2 = /* @__PURE__ */ instanceOf(globalThis.FormData, {
  representation: {
    id: "effect/schema/FormData",
    payload: null
  },
  toCode: /* @__PURE__ */ __name(() => ({
    runtime: `Schema.FormData`,
    Type: `globalThis.FormData`
  }), "toCode"),
  expected: "FormData",
  toCodecJson: /* @__PURE__ */ __name(() => link()(ArraySchema(Tuple2([String4, Union2([Struct({
    _tag: tag("String"),
    value: String4
  }), Struct({
    _tag: tag("File"),
    value: File
  })])])), transformOrFail2({
    decode: /* @__PURE__ */ __name((e) => {
      const out = new globalThis.FormData();
      for (const [key, entry] of e) {
        out.append(key, entry.value);
      }
      return succeed6(out);
    }, "decode"),
    encode: /* @__PURE__ */ __name((formData) => {
      return succeed6(globalThis.Array.from(formData.entries()).map(([key, value3]) => {
        if (typeof value3 === "string") {
          return [key, {
            _tag: "String",
            value: value3
          }];
        } else {
          return [key, {
            _tag: "File",
            value: value3
          }];
        }
      }));
    }, "encode")
  })), "toCodecJson")
});
var URLSearchParams2 = /* @__PURE__ */ instanceOf(globalThis.URLSearchParams, {
  representation: {
    id: "effect/schema/URLSearchParams",
    payload: null
  },
  toCode: /* @__PURE__ */ __name(() => ({
    runtime: `Schema.URLSearchParams`,
    Type: `globalThis.URLSearchParams`
  }), "toCode"),
  expected: "URLSearchParams",
  toCodecJson: /* @__PURE__ */ __name(() => link()(String4.annotate({
    expected: "a query string that will be decoded as URLSearchParams"
  }), transform2({
    decode: /* @__PURE__ */ __name((e) => new globalThis.URLSearchParams(e), "decode"),
    encode: /* @__PURE__ */ __name((params) => params.toString(), "encode")
  })), "toCodecJson")
});
var BooleanFromBit = /* @__PURE__ */ Literals([0, 1]).pipe(/* @__PURE__ */ decodeTo2(Boolean2, /* @__PURE__ */ transform2({
  decode: /* @__PURE__ */ __name((bit) => bit === 1, "decode"),
  encode: /* @__PURE__ */ __name((bool) => bool ? 1 : 0, "encode")
})));
var Base64String = /* @__PURE__ */ String4.annotate({
  expected: "a base64 encoded string that will be decoded as Uint8Array",
  format: "byte",
  contentEncoding: "base64"
});
var Uint8Array2 = /* @__PURE__ */ instanceOf(globalThis.Uint8Array, {
  representation: {
    id: "effect/schema/Uint8Array",
    payload: null
  },
  toCode: /* @__PURE__ */ __name(() => ({
    runtime: `Schema.Uint8Array`,
    Type: `globalThis.Uint8Array`
  }), "toCode"),
  expected: "Uint8Array",
  toCodecJson: /* @__PURE__ */ __name(() => link()(Base64String, uint8ArrayFromBase64String), "toCodecJson"),
  toArbitrary: /* @__PURE__ */ __name(() => (fc) => fc.uint8Array(), "toArbitrary")
});
var DateTimeUtc = /* @__PURE__ */ declare((u) => isDateTime2(u) && isUtc2(u), {
  representation: {
    id: "effect/schema/DateTimeUtc",
    payload: null
  },
  toCode: /* @__PURE__ */ __name(() => ({
    runtime: `Schema.DateTimeUtc`,
    Type: `DateTime.Utc`,
    importDeclarations: [`import * as DateTime from "effect/DateTime"`]
  }), "toCode"),
  expected: "DateTime.Utc",
  toCodecJson: /* @__PURE__ */ __name(() => link()(String4, dateTimeUtcFromString), "toCodecJson"),
  toArbitrary: /* @__PURE__ */ __name(() => (fc, ctx) => fc.date(dateArbitraryConstraints(ctx?.constraint?.ordered?.order === Order2 ? ctx.constraint.ordered : void 0, {
    noInvalidDate: true
  }, toDateUtc2)).map((date) => fromDateUnsafe2(date)), "toArbitrary"),
  toFormatter: /* @__PURE__ */ __name(() => (utc) => utc.toString(), "toFormatter"),
  toEquivalence: /* @__PURE__ */ __name(() => Equivalence3, "toEquivalence")
});
var DateTimeUtcFromString = /* @__PURE__ */ String4.annotate({
  expected: "a string that will be decoded as a DateTime.Utc"
}).pipe(/* @__PURE__ */ decodeTo2(DateTimeUtc, dateTimeUtcFromString));
var immerable = /* @__PURE__ */ globalThis.Symbol.for("immer-draftable");
var payloadToken = {};
function makeClass(Inherited, identifier2, struct2, annotations, proto) {
  const getClassSchema = getClassSchemaFactory(struct2, identifier2, annotations);
  const ClassTypeId = getClassTypeId(identifier2);
  const out = class extends Inherited {
    static {
      __name(this, "out");
    }
    constructor(...[input, options]) {
      const internalOptions = options;
      const payload = internalOptions?.["~payload"];
      const value3 = payload?.token === payloadToken ? payload.value : struct2.make(input ?? {}, options);
      super(value3, {
        ...options,
        disableChecks: true,
        "~payload": {
          token: payloadToken,
          value: value3
        }
      });
    }
    static [TypeId14] = TypeId14;
    get [ClassTypeId]() {
      return ClassTypeId;
    }
    static [immerable] = true;
    static identifier = identifier2;
    static fields = struct2.fields;
    static get ast() {
      return getClassSchema(this).ast;
    }
    static pipe() {
      return pipeArguments(this, arguments);
    }
    static rebuild(ast) {
      return getClassSchema(this).rebuild(ast);
    }
    static make(input, options) {
      return new this(input, options);
    }
    static makeOption(input, options) {
      return makeOption(getClassSchema(this))(input ?? {}, options);
    }
    static makeEffect(input, options) {
      return getClassSchema(this).makeEffect(input ?? {}, options);
    }
    static annotate(annotations2) {
      return this.rebuild(annotate(this.ast, annotations2));
    }
    static annotateKey(annotations2) {
      return this.rebuild(annotateKey(this.ast, annotations2));
    }
    static check(...checks) {
      return this.rebuild(appendChecks(this.ast, checks));
    }
    static extend(identifier3) {
      return (schema, annotations2) => {
        const extension = isStruct(schema) ? schema : Struct(schema);
        const fields = {
          ...struct2.fields,
          ...extension.fields
        };
        const ast = struct(fields, struct2.ast.checks, {
          identifier: identifier3
        });
        return makeClass(this, identifier3, makeStruct(appendChecks(ast, extension.ast.checks), fields), annotations2, proto);
      };
    }
    static mapFields(f, options) {
      return struct2.mapFields(f, options);
    }
  };
  if (proto !== void 0) {
    Object.assign(out.prototype, proto(identifier2));
  }
  return out;
}
__name(makeClass, "makeClass");
function getClassTransformation(self) {
  return new Transformation(transform((input) => new self(input, {
    "~payload": {
      token: payloadToken,
      value: input
    }
  })), passthrough());
}
__name(getClassTransformation, "getClassTransformation");
function getClassTypeId(identifier2) {
  return `~effect/Schema/Class/${identifier2}`;
}
__name(getClassTypeId, "getClassTypeId");
function getClassSchemaFactory(from, identifier2, annotations) {
  let memo;
  return (self) => {
    if (memo !== void 0) {
      return memo;
    }
    const ClassTypeId = getClassTypeId(identifier2);
    const isClassValue = /* @__PURE__ */ __name((input) => input instanceof self || hasProperty(input, ClassTypeId), "isClassValue");
    const transformation = getClassTransformation(self);
    const to = make12(new Declaration([from.ast], () => (input, ast) => {
      return isClassValue(input) ? succeed6(input) : fail5(new InvalidType(ast));
    }, {
      identifier: identifier2,
      [CONSTRUCTOR_ANNOTATION_KEY]: ([from2]) => ({
        isConstructed: isClassValue,
        link: new Link(from2, transformation)
      }),
      toCodec: /* @__PURE__ */ __name(([from2]) => new Link(from2.ast, transformation), "toCodec"),
      toArbitrary: /* @__PURE__ */ __name(([from2]) => () => ({
        arbitrary: from2.arbitrary.map((args2) => new self(args2)),
        terminal: from2.terminal?.map((args2) => new self(args2))
      }), "toArbitrary"),
      toFormatter: /* @__PURE__ */ __name(([from2]) => (t) => `${self.identifier}(${from2(t)})`, "toFormatter"),
      [SENTINELS_ANNOTATION_KEY]: collectSentinels(from.ast),
      ...annotations
    }));
    return memo = decodeTo2(to, transformation)(from);
  };
}
__name(getClassSchemaFactory, "getClassSchemaFactory");
function isStruct(schema) {
  return isSchema(schema);
}
__name(isStruct, "isStruct");
var Class4 = /* @__PURE__ */ __name((identifier2) => (schema, annotations) => {
  const struct2 = isStruct(schema) ? schema : Struct(schema);
  return makeClass(Class3, identifier2, struct2, annotations, (identifier3) => ({
    toString() {
      return `${identifier3}(${format({
        ...this
      })})`;
    }
  }));
}, "Class4");
var Error4 = /* @__PURE__ */ __name((identifier2) => (schema, annotations) => {
  const struct2 = isStruct(schema) ? schema : Struct(schema);
  const self = makeClass(Error2, identifier2, struct2, annotations, (identifier3) => ({
    name: identifier3
  }));
  return self;
}, "Error4");
var TaggedError3 = /* @__PURE__ */ __name((identifier2) => {
  return (tagValue, schema, annotations) => {
    const struct2 = isStruct(schema) ? schema.mapFields((fields) => ({
      _tag: tag(tagValue),
      ...fields
    }), {
      unsafePreserveChecks: true
    }) : TaggedStruct(tagValue, schema);
    return Error4(identifier2 ?? tagValue)(struct2, annotations);
  };
}, "TaggedError3");
function toCodecJson(schema) {
  return make12(toCodecJsonAST(schema.ast), {
    schema
  });
}
__name(toCodecJson, "toCodecJson");
var toCodecJsonASTBase = /* @__PURE__ */ applyToSelfOrLastLinkEncoding((ast) => {
  const out = toCodecJsonBase(ast, toCodecJsonAST);
  const context3 = ast.context;
  if (out === ast || context3 === void 0)
    return out;
  return replaceContextLastLink(out, withoutConstructorDefault(context3));
});
var toCodecJsonAST = /* @__PURE__ */ memoize(toCodecJsonASTBase);
function withoutConstructorDefault(context3) {
  return context3.constructorDefault === void 0 ? context3 : new Context(context3.isOptional, context3.isMutable, void 0, context3.annotations);
}
__name(withoutConstructorDefault, "withoutConstructorDefault");
function validateCanonicalObjectPropertyNames(ast) {
  if (ast.propertySignatures.some((ps) => typeof ps.name !== "string")) {
    throw new globalThis.Error("Objects property names must be strings", {
      cause: ast
    });
  }
}
__name(validateCanonicalObjectPropertyNames, "validateCanonicalObjectPropertyNames");
function makeReorder(getPriority) {
  return (types) => {
    const indexMap = /* @__PURE__ */ new Map();
    for (let i = 0; i < types.length; i++) {
      indexMap.set(toEncoded(types[i]), i);
    }
    const sortedTypes = [...types].sort((a, b) => {
      a = toEncoded(a);
      b = toEncoded(b);
      const pa = getPriority(a);
      const pb = getPriority(b);
      if (pa !== pb)
        return pa - pb;
      return indexMap.get(a) - indexMap.get(b);
    });
    const orderChanged = sortedTypes.some((ast, index) => ast !== types[index]);
    if (!orderChanged)
      return types;
    return sortedTypes;
  };
}
__name(makeReorder, "makeReorder");
var toCodecJsonReorder = /* @__PURE__ */ makeReorder((ast) => {
  switch (ast._tag) {
    case "BigInt":
    case "Symbol":
    case "UniqueSymbol":
      return 0;
    default:
      return 1;
  }
});
function toCodecJsonBase(ast, recur) {
  switch (ast._tag) {
    case "Declaration": {
      const getLink = ast.annotations?.toCodecJson ?? ast.annotations?.toCodec;
      if (!isFunction(getLink)) {
        return replaceEncoding(ast, [unknownToJson]);
      }
      const typeParameters = ast.typeParameters.map((tp) => make11(toEncoded(tp)));
      const link2 = getLink(typeParameters);
      return link2 === void 0 ? ast : replaceEncoding(ast, [mapLink(link2, recur)]);
    }
    case "Unknown":
      return replaceEncoding(ast, [unknownToJson]);
    case "ObjectKeyword":
      return replaceEncoding(ast, [objectKeywordToJson]);
    case "Undefined":
    case "Void":
    case "Literal":
    case "Number":
      return ast.toCodecJson();
    case "UniqueSymbol":
    case "Symbol":
    case "BigInt":
      return ast.toCodecStringTree();
    case "Objects": {
      validateCanonicalObjectPropertyNames(ast);
      return ast.recur(recur, parameterFromString);
    }
    case "Union": {
      const sortedTypes = toCodecJsonReorder(ast.types);
      if (sortedTypes !== ast.types) {
        return new Union(sortedTypes, ast.mode, ast.annotations, ast.checks, ast.encoding, ast.context, ast.encodingChecks).recur(recur);
      }
      return ast.recur(recur);
    }
    case "Arrays":
    case "Suspend":
      return ast.recur(recur);
  }
  return ast;
}
__name(toCodecJsonBase, "toCodecJsonBase");
function toCodecStringTree(schema) {
  return make12(serializerStringTree(schema.ast), {
    schema
  });
}
__name(toCodecStringTree, "toCodecStringTree");
var toStringTreeReorder = /* @__PURE__ */ makeReorder((ast) => {
  switch (ast._tag) {
    case "Null":
    case "Boolean":
    case "Number":
    case "BigInt":
    case "Symbol":
    case "UniqueSymbol":
      return 0;
    default:
      return 1;
  }
});
function serializerTree(ast, recur, onMissingAnnotation) {
  switch (ast._tag) {
    case "Declaration": {
      const typeParameters = ast.typeParameters.map((tp) => make12(recur(toEncoded(tp))));
      const getStringTreeLink = ast.annotations?.toCodecStringTree;
      if (isFunction(getStringTreeLink)) {
        const link3 = getStringTreeLink(typeParameters);
        if (link3 === void 0)
          return ast;
        return replaceEncoding(ast, [mapLink(link3, recur)]);
      }
      const getJsonLink = ast.annotations?.toCodecJson;
      const jsonLink = isFunction(getJsonLink) ? getJsonLink(typeParameters) : void 0;
      const getLink = jsonLink === void 0 ? ast.annotations?.toCodec : void 0;
      const link2 = jsonLink ?? (isFunction(getLink) ? getLink(typeParameters) : void 0);
      return link2 === void 0 ? onMissingAnnotation(ast) : replaceEncoding(ast, [mapLink(link2, recur)]);
    }
    case "Null":
      return replaceEncoding(ast, [nullToString]);
    case "Boolean":
      return replaceEncoding(ast, [booleanToString]);
    case "Unknown":
    case "ObjectKeyword":
      return replaceEncoding(ast, [unknownToStringTree]);
    case "Enum":
    case "Number":
    case "Literal":
    case "UniqueSymbol":
    case "Symbol":
    case "BigInt":
      return ast.toCodecStringTree();
    case "Objects": {
      validateCanonicalObjectPropertyNames(ast);
      return ast.recur(recur, parameterFromString);
    }
    case "Union": {
      const sortedTypes = toStringTreeReorder(ast.types);
      if (sortedTypes !== ast.types) {
        return new Union(sortedTypes, ast.mode, ast.annotations, ast.checks, ast.encoding, ast.context, ast.encodingChecks).recur(recur);
      }
      return ast.recur(recur);
    }
    case "Arrays":
    case "Suspend":
      return ast.recur(recur);
  }
  return ast;
}
__name(serializerTree, "serializerTree");
var nullToString = /* @__PURE__ */ new Link(/* @__PURE__ */ new Literal("null"), /* @__PURE__ */ new Transformation(/* @__PURE__ */ transform(() => null), /* @__PURE__ */ transform(() => "null")));
var booleanToString = /* @__PURE__ */ new Link(/* @__PURE__ */ new Union([/* @__PURE__ */ new Literal("true"), /* @__PURE__ */ new Literal("false")], "anyOf"), /* @__PURE__ */ new Transformation(/* @__PURE__ */ transform((s) => s === "true"), /* @__PURE__ */ String2()));
var SERIALIZER_ENSURE_ARRAY = "~effect/Schema/SERIALIZER_ENSURE_ARRAY";
var isSerializerArrayFromSingle = /* @__PURE__ */ __name((ast) => isUnion(ast) && ast.annotations?.[SERIALIZER_ENSURE_ARRAY] === true, "isSerializerArrayFromSingle");
var serializerStringTree = /* @__PURE__ */ applyToSelfOrLastLinkEncoding((ast) => {
  if (isSerializerArrayFromSingle(ast)) {
    return ast;
  }
  const out = serializerTree(ast, serializerStringTree, (ast2) => {
    throw new globalThis.Error("Missing structural codec for StringTree", {
      cause: ast2
    });
  });
  if (out !== ast && ast.context !== void 0) {
    return replaceContextLastLink(out, withoutConstructorDefault(ast.context));
  }
  return out;
});
var Json2 = /* @__PURE__ */ make12(/* @__PURE__ */ annotate(Json, {
  toCode: /* @__PURE__ */ __name(() => ({
    runtime: "Schema.Json",
    Type: "Schema.Json"
  }), "toCode")
}));
var makeUnsafe5 = makeLatchUnsafe;
var TypeId15 = "~effect/MutableRef";
var MutableRefProto = {
  [TypeId15]: TypeId15,
  ...PipeInspectableProto,
  toJSON() {
    return {
      _id: "MutableRef",
      current: toJson(this.current)
    };
  }
};
var make13 = /* @__PURE__ */ __name((value3) => {
  const ref = Object.create(MutableRefProto);
  ref.current = value3;
  return ref;
}, "make13");
var Empty = /* @__PURE__ */ Symbol.for("effect/MutableList/Empty");
var make14 = /* @__PURE__ */ __name(() => ({
  head: void 0,
  tail: void 0,
  length: 0
}), "make14");
var emptyBucket = /* @__PURE__ */ __name(() => ({
  array: [],
  mutable: true,
  offset: 0,
  next: void 0
}), "emptyBucket");
var append2 = /* @__PURE__ */ __name((self, message) => {
  if (!self.tail) {
    self.head = self.tail = emptyBucket();
  } else if (!self.tail.mutable) {
    self.tail.next = emptyBucket();
    self.tail = self.tail.next;
  }
  self.tail.array.push(message);
  self.length++;
}, "append2");
var clear = /* @__PURE__ */ __name((self) => {
  self.head = self.tail = void 0;
  self.length = 0;
}, "clear");
var take = /* @__PURE__ */ __name((self) => {
  if (!self.head)
    return Empty;
  const message = self.head.array[self.head.offset];
  if (self.head.mutable)
    self.head.array[self.head.offset] = void 0;
  self.head.offset++;
  self.length--;
  if (self.head.offset === self.head.array.length) {
    if (self.head.next) {
      self.head = self.head.next;
    } else {
      clear(self);
    }
  }
  return message;
}, "take");
var TypeId16 = "~effect/Queue";
var EnqueueTypeId = "~effect/Queue/Enqueue";
var DequeueTypeId = "~effect/Queue/Dequeue";
var variance = {
  _A: identity,
  _E: identity
};
var QueueProto = {
  [TypeId16]: variance,
  [EnqueueTypeId]: variance,
  [DequeueTypeId]: variance,
  ...PipeInspectableProto,
  toJSON() {
    return {
      _id: "effect/Queue",
      state: this.state._tag,
      size: sizeUnsafe(this)
    };
  }
};
var make15 = /* @__PURE__ */ __name((options) => withFiber((fiber2) => {
  const self = Object.create(QueueProto);
  self.dispatcher = fiber2.currentDispatcher;
  self.capacity = options?.capacity ?? Number.POSITIVE_INFINITY;
  self.strategy = options?.strategy ?? "suspend";
  self.messages = make14();
  self.scheduleRunning = false;
  self.state = {
    _tag: "Open",
    takers: /* @__PURE__ */ new Set(),
    offers: /* @__PURE__ */ new Set(),
    awaiters: /* @__PURE__ */ new Set()
  };
  return succeed3(self);
}), "make15");
var bounded = /* @__PURE__ */ __name((capacity) => make15({
  capacity
}), "bounded");
var offer = /* @__PURE__ */ __name((self, message) => suspend(() => {
  if (self.state._tag !== "Open") {
    return exitFalse;
  } else if (self.messages.length >= self.capacity) {
    switch (self.strategy) {
      case "dropping":
        return exitFalse;
      case "suspend":
        if (self.capacity <= 0 && self.state.takers.size > 0) {
          append2(self.messages, message);
          releaseTakers(self);
          return exitTrue;
        }
        return offerRemainingSingle(self, message);
      case "sliding":
        take(self.messages);
        append2(self.messages, message);
        return exitTrue;
    }
  }
  append2(self.messages, message);
  scheduleReleaseTaker(self);
  return exitTrue;
}), "offer");
var failCause4 = /* @__PURE__ */ dual(2, (self, cause) => sync(() => failCauseUnsafe(self, cause)));
var failCauseUnsafe = /* @__PURE__ */ __name((self, cause) => {
  if (self.state._tag !== "Open") {
    return false;
  }
  const exit3 = exitFailCause(cause);
  const fail62 = exitZipRight(exit3, exitFailDone);
  if (self.state.offers.size === 0 && self.messages.length === 0) {
    finalize(self, fail62);
    return true;
  }
  self.state = {
    ...self.state,
    _tag: "Closing",
    exit: fail62
  };
  return true;
}, "failCauseUnsafe");
var shutdown = /* @__PURE__ */ __name((self) => sync(() => {
  if (self.state._tag === "Done") {
    return true;
  }
  clear(self.messages);
  const offers = self.state.offers;
  finalize(self, self.state._tag === "Open" ? exitInterrupt2 : self.state.exit);
  if (offers.size > 0) {
    for (const entry of offers) {
      if (entry._tag === "Single") {
        entry.resume(exitFalse);
      } else {
        entry.resume(exitSucceed(entry.remaining.slice(entry.offset)));
      }
    }
    offers.clear();
  }
  return true;
}), "shutdown");
var take2 = /* @__PURE__ */ __name((self) => suspend(() => takeUnsafe(self) ?? andThen(awaitTake(self), take2(self))), "take2");
var takeUnsafe = /* @__PURE__ */ __name((self) => {
  if (self.state._tag === "Done") {
    return self.state.exit;
  }
  if (self.messages.length > 0) {
    const message = take(self.messages);
    releaseCapacity(self);
    return exitSucceed(message);
  } else if (self.capacity <= 0 && self.state.offers.size > 0) {
    self.capacity = 1;
    releaseCapacity(self);
    self.capacity = 0;
    const message = take(self.messages);
    releaseCapacity(self);
    return exitSucceed(message);
  }
  return;
}, "takeUnsafe");
var sizeUnsafe = /* @__PURE__ */ __name((self) => self.state._tag === "Done" ? 0 : self.messages.length, "sizeUnsafe");
var exitFalse = /* @__PURE__ */ exitSucceed(false);
var exitTrue = /* @__PURE__ */ exitSucceed(true);
var exitFailDone = /* @__PURE__ */ exitFail(/* @__PURE__ */ Done());
var exitInterrupt2 = /* @__PURE__ */ exitInterrupt();
var releaseTakers = /* @__PURE__ */ __name((self) => {
  self.scheduleRunning = false;
  if (self.state._tag === "Done" || self.state.takers.size === 0) {
    return;
  }
  for (const taker of self.state.takers) {
    self.state.takers.delete(taker);
    taker(exitVoid);
    if (self.messages.length === 0) {
      break;
    }
  }
}, "releaseTakers");
var scheduleReleaseTaker = /* @__PURE__ */ __name((self) => {
  if (self.scheduleRunning || self.state._tag === "Done" || self.state.takers.size === 0) {
    return;
  }
  self.scheduleRunning = true;
  self.dispatcher.scheduleTask(() => releaseTakers(self), 0);
}, "scheduleReleaseTaker");
var offerRemainingSingle = /* @__PURE__ */ __name((self, message) => {
  return callback((resume) => {
    if (self.state._tag !== "Open") {
      return resume(exitFalse);
    }
    const entry = {
      _tag: "Single",
      message,
      resume
    };
    self.state.offers.add(entry);
    return sync(() => {
      if (self.state._tag === "Open") {
        self.state.offers.delete(entry);
      }
    });
  });
}, "offerRemainingSingle");
var releaseCapacity = /* @__PURE__ */ __name((self) => {
  if (self.state._tag === "Done") {
    return isDoneCause(self.state.exit.cause);
  } else if (self.state.offers.size === 0) {
    if (self.state._tag === "Closing" && self.messages.length === 0) {
      finalize(self, self.state.exit);
      return isDoneCause(self.state.exit.cause);
    }
    return false;
  }
  let n = self.capacity - self.messages.length;
  for (const entry of self.state.offers) {
    if (n === 0)
      break;
    else if (entry._tag === "Single") {
      append2(self.messages, entry.message);
      n--;
      entry.resume(exitTrue);
      self.state.offers.delete(entry);
    } else {
      for (; entry.offset < entry.remaining.length; entry.offset++) {
        if (n === 0)
          return false;
        append2(self.messages, entry.remaining[entry.offset]);
        n--;
      }
      entry.resume(exitSucceed([]));
      self.state.offers.delete(entry);
    }
  }
  return false;
}, "releaseCapacity");
var awaitTake = /* @__PURE__ */ __name((self) => callback((resume) => {
  if (self.state._tag === "Done") {
    return resume(self.state.exit);
  }
  self.state.takers.add(resume);
  return sync(() => {
    if (self.state._tag !== "Done") {
      self.state.takers.delete(resume);
    }
  });
}), "awaitTake");
var finalize = /* @__PURE__ */ __name((self, exit3) => {
  if (self.state._tag === "Done") {
    return;
  }
  const openState = self.state;
  self.state = {
    _tag: "Done",
    exit: exit3
  };
  for (const taker of openState.takers) {
    taker(exit3);
  }
  openState.takers.clear();
  for (const awaiter of openState.awaiters) {
    awaiter(exit3);
  }
  openState.awaiters.clear();
}, "finalize");
var makeUnsafe6 = /* @__PURE__ */ __name((permits2) => new SemaphoreImpl(permits2), "makeUnsafe6");
var waitForPermits = /* @__PURE__ */ __name((self, n, effect2) => callback((resume) => {
  if (self.free >= n)
    return resume(effect2);
  const observer = /* @__PURE__ */ __name(() => {
    if (self.free < n)
      return;
    self.waiters.delete(observer);
    resume(effect2);
  }, "observer");
  self.waiters.add(observer);
  return sync(() => {
    self.waiters.delete(observer);
  });
}), "waitForPermits");
var SemaphoreImpl = class {
  static {
    __name(this, "SemaphoreImpl");
  }
  waiters = /* @__PURE__ */ new Set();
  taken = 0;
  permits;
  constructor(permits2) {
    this.permits = permits2;
  }
  get free() {
    return this.permits - this.taken;
  }
  take(n) {
    const take3 = suspend(() => {
      if (this.free < n) {
        return waitForPermits(this, n, take3);
      }
      this.taken += n;
      return succeed3(n);
    });
    return take3;
  }
  takeIfAvailable(n) {
    return suspend(() => {
      if (this.free < n)
        return succeed3(false);
      this.taken += n;
      return succeed3(true);
    });
  }
  releaseUnsafe(fiber2, n) {
    this.taken -= n;
    if (this.waiters.size > 0) {
      fiber2.currentDispatcher.scheduleTask(() => {
        for (const observer of this.waiters) {
          if (this.free <= 0)
            break;
          observer();
        }
      }, 0);
    }
    return this.free;
  }
  resize(permits2) {
    return withFiber((fiber2) => {
      this.permits = permits2;
      if (this.free < 0)
        return void_;
      this.releaseUnsafe(fiber2, 0);
      return void_;
    });
  }
  release(n) {
    return withFiber((fiber2) => succeed3(this.releaseUnsafe(fiber2, n)));
  }
  get releaseAll() {
    return withFiber((fiber2) => succeed3(this.releaseUnsafe(fiber2, this.taken)));
  }
  withPermits(n) {
    return (self) => uninterruptibleMask((restore) => {
      const acquire = suspend(() => {
        if (this.free < n) {
          const wait = waitForPermits(this, n, void_);
          return flatMap2(restore(wait), () => acquire);
        }
        this.taken += n;
        return onExitPrimitive(restore(self), () => {
          this.releaseUnsafe(getCurrentFiber(), n);
          return;
        }, true);
      });
      return acquire;
    });
  }
  withPermit = /* @__PURE__ */ this.withPermits(1);
  withPermitsIfAvailable(n) {
    return (self) => uninterruptibleMask((restore) => {
      if (this.free < n)
        return succeedNone;
      this.taken += n;
      return onExitPrimitive(restore(asSome(self)), () => {
        this.releaseUnsafe(getCurrentFiber(), n);
        return;
      }, true);
    });
  }
};
var TypeId17 = "~effect/Channel";
var isChannel = /* @__PURE__ */ __name((u) => hasProperty(u, TypeId17), "isChannel");
var ChannelProto = {
  [TypeId17]: {
    _Env: identity,
    _InErr: identity,
    _InElem: identity,
    _OutErr: identity,
    _OutElem: identity
  },
  pipe() {
    return pipeArguments(this, arguments);
  }
};
var fromTransform = /* @__PURE__ */ __name((transform3) => {
  const self = Object.create(ChannelProto);
  self.transform = (upstream, scope3) => catchCause2(transform3(upstream, scope3), (cause) => succeed6(failCause3(cause)));
  return self;
}, "fromTransform");
var transformPull = /* @__PURE__ */ __name((self, f) => fromTransform((upstream, scope3) => flatMap3(toTransform(self)(upstream, scope3), (pull) => f(pull, scope3))), "transformPull");
var fromPull = /* @__PURE__ */ __name((effect2) => fromTransform((_, __) => effect2), "fromPull");
var fromTransformBracket = /* @__PURE__ */ __name((f) => fromTransform(fnUntraced2(function* (upstream, scope3) {
  const closableScope = forkUnsafe2(scope3);
  const onCause = /* @__PURE__ */ __name((cause) => close(closableScope, doneExitFromCause(cause)), "onCause");
  const pull = yield* onError2(f(upstream, scope3, closableScope), onCause);
  return onError2(pull, onCause);
})), "fromTransformBracket");
var toTransform = /* @__PURE__ */ __name((channel) => channel.transform, "toTransform");
var suspend3 = /* @__PURE__ */ __name((evaluate2) => fromTransform((upstream, scope3) => suspend2(() => toTransform(evaluate2())(upstream, scope3))), "suspend3");
var empty4 = /* @__PURE__ */ fromPull(/* @__PURE__ */ succeed6(/* @__PURE__ */ done3()));
var fail6 = /* @__PURE__ */ __name((error) => fromPull(succeed6(fail5(error))), "fail6");
var failCause5 = /* @__PURE__ */ __name((cause) => fromPull(failCause3(cause)), "failCause5");
var fromEffect = /* @__PURE__ */ __name((effect2) => fromPull(sync2(() => {
  let done4 = false;
  return suspend2(() => {
    if (done4)
      return done3();
    done4 = true;
    return effect2;
  });
})), "fromEffect");
var fromReadableStream = /* @__PURE__ */ __name((options) => fromTransform((_, scope3) => readableStreamToPullUnsafe({
  scope: scope3,
  readable: options.evaluate(),
  onError: options.onError,
  releaseLockOnEnd: options.releaseLockOnEnd
})), "fromReadableStream");
var readableStreamToPullUnsafe = /* @__PURE__ */ __name((options) => {
  const reader = options.readable.getReader();
  const exit3 = options.exit ?? make13(void 0);
  const pull = suspend2(() => {
    if (exit3.current)
      return exit3.current;
    return matchCauseEffect2(tryPromise2({
      try: /* @__PURE__ */ __name(() => reader.read(), "try"),
      catch: options.onError
    }), {
      onFailure: /* @__PURE__ */ __name((cause) => exit3.current ?? failCause3(cause), "onFailure"),
      onSuccess: /* @__PURE__ */ __name(({
        done: done4,
        value: value3
      }) => {
        if (exit3.current)
          return exit3.current;
        return done4 ? done3() : succeed6(of(value3));
      }, "onSuccess")
    });
  });
  return as2(addFinalizer(options.scope, options.releaseLockOnEnd ? sync2(() => reader.releaseLock()) : promise2(() => reader.cancel().catch(constVoid))), pull);
}, "readableStreamToPullUnsafe");
var map9 = /* @__PURE__ */ dual(2, (self, f) => transformPull(self, (pull) => sync2(() => {
  let i = 0;
  return map7(pull, (o) => f(o, i++));
})));
var concurrencyIsSequential = /* @__PURE__ */ __name((concurrency) => concurrency === void 0 || concurrency !== "unbounded" && concurrency <= 1, "concurrencyIsSequential");
var mapEffect = /* @__PURE__ */ dual((args2) => isChannel(args2[0]), (self, f, options) => concurrencyIsSequential(options?.concurrency) ? mapEffectSequential(self, f) : mapEffectConcurrent(self, f, options));
var mapEffectSequential = /* @__PURE__ */ __name((self, f) => fromTransform((upstream, scope3) => {
  let i = 0;
  return map7(toTransform(self)(upstream, scope3), flatMap3((o) => f(o, i++)));
}), "mapEffectSequential");
var mapEffectConcurrent = /* @__PURE__ */ __name((self, f, options) => fromTransformBracket(fnUntraced2(function* (upstream, scope3, forkedScope) {
  let i = 0;
  const pull = yield* toTransform(self)(upstream, scope3);
  const concurrencyN = options.concurrency === "unbounded" ? Number.MAX_SAFE_INTEGER : options.concurrency;
  const queue = yield* bounded(0);
  yield* addFinalizer(forkedScope, shutdown(queue));
  const runFork3 = runForkWith2(yield* context2());
  const trackFiber = runIn(forkedScope);
  if (options.unordered) {
    const semaphore = makeUnsafe6(concurrencyN);
    const release = constant(semaphore.release(1));
    const handle = matchCauseEffect2({
      onFailure: /* @__PURE__ */ __name((cause) => flatMap3(failCause4(queue, cause), release), "onFailure"),
      onSuccess: /* @__PURE__ */ __name((value3) => flatMap3(offer(queue, value3), release), "onSuccess")
    });
    yield* semaphore.take(1).pipe(flatMap3(() => pull), flatMap3((value3) => {
      trackFiber(runFork3(handle(f(value3, i++))));
      return void_3;
    }), forever2({
      disableYield: true
    }), catchCause2((cause) => semaphore.withPermits(concurrencyN - 1)(failCause4(queue, cause))), forkIn2(forkedScope));
  } else {
    const effects = yield* bounded(concurrencyN - 2);
    yield* addFinalizer(forkedScope, shutdown(queue));
    yield* take2(effects).pipe(flatten4, flatMap3((value3) => offer(queue, value3)), forever2({
      disableYield: true
    }), catchCause2((cause) => failCause4(queue, cause)), forkIn2(forkedScope));
    let errorCause;
    const onExit32 = /* @__PURE__ */ __name((exit3) => {
      if (exit3._tag === "Success")
        return;
      errorCause = exit3.cause;
      failCauseUnsafe(queue, exit3.cause);
    }, "onExit3");
    yield* pull.pipe(flatMap3((value3) => {
      if (errorCause)
        return failCause3(errorCause);
      const fiber2 = runFork3(f(value3, i++));
      trackFiber(fiber2);
      fiber2.addObserver(onExit32);
      return offer(effects, join(fiber2));
    }), forever2({
      disableYield: true
    }), catchCause2((cause) => offer(effects, failCause2(cause)).pipe(andThen2(failCause4(effects, cause)))), forkIn2(forkedScope));
  }
  return take2(queue);
})), "mapEffectConcurrent");
var mapAccum = /* @__PURE__ */ dual((args2) => isChannel(args2[0]), (self, initial, f, options) => fromTransform((upstream, scope3) => map7(toTransform(self)(upstream, scope3), (pull) => {
  let state = initial();
  let current;
  let index = 0;
  let cause;
  const pullNext = matchCauseEffect2(pull, {
    onFailure(cause_) {
      cause = cause_;
      const b = options?.onHalt && options.onHalt(state);
      return b && b.length > 0 ? succeed6([state, b]) : failCause3(cause_);
    },
    onSuccess(a) {
      const b = f(state, a);
      return isArray(b) ? succeed6(b) : b;
    }
  });
  const pump = suspend2(/* @__PURE__ */ __name(function loop() {
    if (current === void 0) {
      if (cause)
        return failCause3(cause);
      return flatMap3(pullNext, ([newState, values]) => {
        state = newState;
        if (values.length === 0) {
          return loop();
        } else if (values.length === 1) {
          return succeed6(values[0]);
        }
        current = values;
        return loop();
      });
    }
    const next = current[index++];
    if (index >= current.length) {
      current = void 0;
      index = 0;
    }
    return succeed6(next);
  }, "loop"));
  return pump;
})));
var catchCause3 = /* @__PURE__ */ dual(2, (self, f) => fromTransform((upstream, scope3) => {
  let forkedScope = forkUnsafe2(scope3);
  return map7(toTransform(self)(upstream, forkedScope), (pull) => {
    let currentPull = pull.pipe(catchCause2((cause) => {
      if (isDoneCause(cause)) {
        return failCause3(cause);
      }
      const toClose = forkedScope;
      forkedScope = forkUnsafe2(scope3);
      return close(toClose, failCause2(cause)).pipe(andThen2(toTransform(f(cause))(upstream, forkedScope)), flatMap3((childPull) => {
        currentPull = childPull;
        return childPull;
      }));
    }));
    return suspend2(() => currentPull);
  });
}));
var catchCauseFilter2 = /* @__PURE__ */ dual(3, (self, filter4, f) => catchCause3(self, (cause) => {
  const result3 = filter4(cause);
  return isFailure2(result3) ? failCause5(result3.failure) : f(result3.success, cause);
}));
var catch_3 = /* @__PURE__ */ dual(2, (self, f) => catchCauseFilter2(self, findError2, (e) => f(e)));
var mapError4 = /* @__PURE__ */ dual(2, (self, f) => catch_3(self, (err) => fail6(f(err))));
var pipeTo = /* @__PURE__ */ dual(2, (self, that) => fromTransform((upstream, scope3) => flatMap3(toTransform(self)(upstream, scope3), (upstream2) => toTransform(that)(upstream2, scope3))));
var onExit3 = /* @__PURE__ */ dual(2, (self, finalizer) => fromTransformBracket((upstream, scope3, forkedScope) => addFinalizerExit(forkedScope, finalizer).pipe(andThen2(toTransform(self)(upstream, scope3)))));
var runWith = /* @__PURE__ */ __name((self, f, onHalt) => suspend2(() => {
  const scope3 = makeUnsafe3();
  const makePull = toTransform(self)(done3(), scope3);
  return catchDone(flatMap3(makePull, f), onHalt ? onHalt : succeed6).pipe(onExit2((exit3) => close(scope3, exit3)));
}), "runWith");
var provideContext3 = /* @__PURE__ */ dual(2, (self, context3) => fromTransform((upstream, scope3) => map7(provideContext2(toTransform(self)(upstream, scope3), context3), provideContext2(context3))));
var runForEach = /* @__PURE__ */ dual(2, (self, f) => runWith(self, (pull) => forever2(flatMap3(pull, f), {
  disableYield: true
})));
var runFold = /* @__PURE__ */ dual(3, (self, initial, f) => suspend2(() => {
  let state = initial();
  return runWith(self, (pull) => whileLoop2({
    while: constTrue,
    body: /* @__PURE__ */ __name(() => pull, "body"),
    step: /* @__PURE__ */ __name((value3) => {
      state = f(state, value3);
    }, "step")
  }), () => succeed6(state));
}));
var toPullScoped = /* @__PURE__ */ __name((self, scope3) => toTransform(self)(done3(), scope3), "toPullScoped");
var TypeId18 = "~effect/Stream";
var streamVariance = {
  _R: identity,
  _E: identity,
  _A: identity
};
var StreamProto = {
  [TypeId18]: streamVariance,
  pipe() {
    return pipeArguments(this, arguments);
  }
};
var fromChannel = /* @__PURE__ */ __name((channel) => {
  const self = Object.create(StreamProto);
  self.channel = channel;
  return self;
}, "fromChannel");
var TypeId19 = "~effect/Sink";
var sinkVariance = {
  _A: identity,
  _In: identity,
  _L: identity,
  _E: identity,
  _R: identity
};
var SinkProto = {
  [TypeId19]: sinkVariance,
  pipe() {
    return pipeArguments(this, arguments);
  }
};
var fromTransform2 = /* @__PURE__ */ __name((transform3) => {
  const self = Object.create(SinkProto);
  self.transform = transform3;
  return self;
}, "fromTransform2");
var fromEffectEnd = /* @__PURE__ */ __name((effect2) => fromTransform2(() => effect2), "fromEffectEnd");
var fail7 = /* @__PURE__ */ __name((e) => fromEffectEnd(fail5(e)), "fail7");
var TypeId20 = "~effect/Stream";
var isStream = /* @__PURE__ */ __name((u) => hasProperty(u, TypeId20), "isStream");
var fromChannel2 = fromChannel;
var fromEffect2 = /* @__PURE__ */ __name((effect2) => fromChannel2(fromEffect(map7(effect2, of))), "fromEffect2");
var transformPull2 = /* @__PURE__ */ __name((self, f) => fromChannel2(fromTransform((_, scope3) => flatMap3(toPullScoped(self.channel, scope3), (pull) => f(pull, scope3)))), "transformPull2");
var empty5 = /* @__PURE__ */ fromChannel2(empty4);
var suspend4 = /* @__PURE__ */ __name((stream3) => fromChannel2(suspend3(() => stream3().channel)), "suspend4");
var fail8 = /* @__PURE__ */ __name((error) => fromChannel2(fail6(error)), "fail8");
var fromReadableStream2 = /* @__PURE__ */ __name((options) => fromChannel2(fromReadableStream(options)), "fromReadableStream2");
var map10 = /* @__PURE__ */ dual(2, (self, f) => suspend4(() => {
  let i = 0;
  return fromChannel2(map9(self.channel, map4((o) => f(o, i++))));
}));
var mapArrayEffect = /* @__PURE__ */ dual(2, (self, f) => fromChannel2(mapEffect(self.channel, f)));
var catchCause4 = /* @__PURE__ */ dual(2, (self, f) => self.channel.pipe(catchCause3((cause) => f(cause).channel), fromChannel2));
var mapError5 = /* @__PURE__ */ dual(2, (self, f) => fromChannel2(mapError4(self.channel, f)));
var takeUntil = /* @__PURE__ */ dual((args2) => isStream(args2[0]), (self, predicate, options) => transformPull2(self, (pull, _scope) => sync2(() => {
  let i = 0;
  let done4 = false;
  const pump = flatMap3(suspend2(() => done4 ? done3() : pull), (chunk) => {
    const index = chunk.findIndex((a) => predicate(a, i++));
    if (index >= 0) {
      done4 = true;
      const arr = chunk.slice(0, options?.excludeLast ? index : index + 1);
      return isReadonlyArrayNonEmpty(arr) ? succeed6(arr) : done3();
    }
    return succeed6(chunk);
  });
  return pump;
})));
var mapAccum2 = /* @__PURE__ */ dual((args2) => isStream(args2[0]), (self, initial, f, options) => fromChannel2(mapAccum(self.channel, initial, (state, arr) => {
  const acc = empty2();
  for (let index = 0; index < arr.length; index++) {
    const [newState, values] = f(state, arr[index]);
    state = newState;
    acc.push(...values);
  }
  return [state, isArrayNonEmpty2(acc) ? of(acc) : emptyArr];
}, options?.onHalt ? {
  onHalt(state) {
    const arr = options.onHalt(state);
    return isReadonlyArrayNonEmpty(arr) ? of(arr) : emptyArr;
  }
} : void 0)));
var emptyArr = /* @__PURE__ */ empty2();
var pipeThroughChannel = /* @__PURE__ */ dual(2, (self, channel) => fromChannel2(pipeTo(self.channel, channel)));
var encodeText = /* @__PURE__ */ __name((self) => suspend4(() => {
  const encoder22 = new TextEncoder();
  return map10(self, (chunk) => encoder22.encode(chunk));
}), "encodeText");
var onExit4 = /* @__PURE__ */ dual(2, (self, finalizer) => fromChannel2(onExit3(self.channel, finalizer)));
var provideContext4 = /* @__PURE__ */ dual(2, (self, context3) => fromChannel2(provideContext3(self.channel, context3)));
var run2 = /* @__PURE__ */ dual(2, (self, sink) => scopedWith2((scope3) => toPullScoped(self.channel, scope3).pipe(flatMap3((upstream) => sink.transform(upstream, scope3)), map7(([a]) => a))));
var runForEach2 = /* @__PURE__ */ dual(2, (self, f) => runForEach(self.channel, (arr) => {
  let i = 0;
  return whileLoop2({
    while: /* @__PURE__ */ __name(() => i < arr.length, "while"),
    body: /* @__PURE__ */ __name(() => f(arr[i++]), "body"),
    step: constVoid
  });
}));
var runForEachArray = /* @__PURE__ */ dual(2, (self, f) => runForEach(self.channel, f));
var toReadableStreamWith = /* @__PURE__ */ dual((args2) => isStream(args2[0]), (self, context3, options) => {
  let currentResolve = void 0;
  let fiber2 = void 0;
  const latch = makeUnsafe5(false);
  return new ReadableStream({
    start(controller) {
      fiber2 = runFork2(provideContext2(runForEachArray(self, (chunk) => latch.whenOpen(sync2(() => {
        latch.closeUnsafe();
        for (let i = 0; i < chunk.length; i++) {
          controller.enqueue(chunk[i]);
        }
        currentResolve();
        currentResolve = void 0;
      }))), context3));
      fiber2.addObserver((exit3) => {
        if (exit3._tag === "Failure") {
          controller.error(squash(exit3.cause));
        } else {
          controller.close();
        }
      });
    },
    pull() {
      return new Promise((resolve22) => {
        currentResolve = resolve22;
        latch.openUnsafe();
      });
    },
    cancel() {
      if (!fiber2)
        return;
      return runPromise2(asVoid2(interrupt2(fiber2)));
    }
  }, options?.strategy);
});
var toReadableStream = /* @__PURE__ */ dual((args2) => isStream(args2[0]), (self, options) => toReadableStreamWith(self, empty(), options));
var defaultMaxEventSize = 10 * 1024 * 1024;
var encoder2 = {
  write(event) {
    switch (event._tag) {
      case "Event": {
        let data = "";
        if (event.id !== void 0) {
          data += `id: ${event.id}
`;
        }
        if (event.event !== "message") {
          data += `event: ${event.event}
`;
        }
        data += `data: ${event.data.replace(/\n/g, `
data: `)}
`;
        return data + `
`;
      }
      case "Retry": {
        return `retry: ${toMillis(event.duration)}

`;
      }
    }
  }
};
var TypeId21 = "~effect/platform/PlatformError";
var BadArgument = class extends (/* @__PURE__ */ TaggedError2("BadArgument")) {
  static {
    __name(this, "BadArgument");
  }
  get message() {
    return `${this.module}.${this.method}${this.description ? `: ${this.description}` : ""}`;
  }
};
var SystemError = class extends Error3 {
  static {
    __name(this, "SystemError");
  }
  get message() {
    return `${this._tag}: ${this.module}.${this.method}${this.pathOrDescriptor !== void 0 ? ` (${this.pathOrDescriptor})` : ""}${this.description ? `: ${this.description}` : ""}`;
  }
};
var PlatformError = class extends (/* @__PURE__ */ TaggedError2("PlatformError")) {
  static {
    __name(this, "PlatformError");
  }
  constructor(reason) {
    if ("cause" in reason) {
      super({
        reason,
        cause: reason.cause
      });
    } else {
      super({
        reason
      });
    }
  }
  [TypeId21] = TypeId21;
  get message() {
    return this.reason.message;
  }
};
var systemError = /* @__PURE__ */ __name((options) => new PlatformError(new SystemError(options)), "systemError");
var TypeId22 = "~effect/platform/FileSystem";
var Size = /* @__PURE__ */ __name((bytes) => typeof bytes === "bigint" ? bytes : BigInt(bytes), "Size");
var bigint1024 = /* @__PURE__ */ BigInt(1024);
var bigintPiB = bigint1024 * bigint1024 * bigint1024 * bigint1024 * bigint1024;
var FileSystem = /* @__PURE__ */ Service("effect/platform/FileSystem");
var notFound2 = /* @__PURE__ */ __name((method, path) => systemError({
  module: "FileSystem",
  method,
  _tag: "NotFound",
  description: "No such file or directory",
  pathOrDescriptor: path
}), "notFound2");
var makeNoop = /* @__PURE__ */ __name((fileSystem) => FileSystem.of({
  [TypeId22]: TypeId22,
  access(path) {
    return fail5(notFound2("access", path));
  },
  chmod(path) {
    return fail5(notFound2("chmod", path));
  },
  chown(path) {
    return fail5(notFound2("chown", path));
  },
  copy(path) {
    return fail5(notFound2("copy", path));
  },
  copyFile(path) {
    return fail5(notFound2("copyFile", path));
  },
  glob(pattern) {
    return fail5(notFound2("glob", pattern));
  },
  exists() {
    return succeed6(false);
  },
  link(path) {
    return fail5(notFound2("link", path));
  },
  makeDirectory() {
    return die2("not implemented");
  },
  makeTempDirectory() {
    return die2("not implemented");
  },
  makeTempDirectoryScoped() {
    return die2("not implemented");
  },
  makeTempFile() {
    return die2("not implemented");
  },
  makeTempFileScoped() {
    return die2("not implemented");
  },
  open(path) {
    return fail5(notFound2("open", path));
  },
  readDirectory(path) {
    return fail5(notFound2("readDirectory", path));
  },
  readFile(path) {
    return fail5(notFound2("readFile", path));
  },
  readFileString(path) {
    return fail5(notFound2("readFileString", path));
  },
  readLink(path) {
    return fail5(notFound2("readLink", path));
  },
  realPath(path) {
    return fail5(notFound2("realPath", path));
  },
  remove() {
    return void_3;
  },
  rename(oldPath) {
    return fail5(notFound2("rename", oldPath));
  },
  sink(path) {
    return fail7(notFound2("sink", path));
  },
  stat(path) {
    return fail5(notFound2("stat", path));
  },
  stream(path) {
    return fail8(notFound2("stream", path));
  },
  symlink(fromPath) {
    return fail5(notFound2("symlink", fromPath));
  },
  truncate(path) {
    return fail5(notFound2("truncate", path));
  },
  utimes(path) {
    return fail5(notFound2("utimes", path));
  },
  watch(path) {
    return fail8(notFound2("watch", path));
  },
  writeFile(path) {
    return fail5(notFound2("writeFile", path));
  },
  writeFileString(path) {
    return fail5(notFound2("writeFileString", path));
  },
  ...fileSystem
}), "makeNoop");
var layerNoop = /* @__PURE__ */ __name((fileSystem) => succeed4(FileSystem)(makeNoop(fileSystem)), "layerNoop");
var TypeId23 = "~effect/http/UrlParams";
var isUrlParams = /* @__PURE__ */ __name((u) => hasProperty(u, TypeId23), "isUrlParams");
var Proto4 = {
  ...PipeInspectableProto,
  [TypeId23]: TypeId23,
  [Symbol.iterator]() {
    return this.params[Symbol.iterator]();
  },
  toJSON() {
    return {
      _id: "UrlParams",
      params: Object.fromEntries(this.params)
    };
  },
  [symbol2](that) {
    return Equivalence4(this, that);
  },
  [symbol]() {
    return array(this.params.flat());
  }
};
var make16 = /* @__PURE__ */ __name((params) => {
  const self = Object.create(Proto4);
  self.params = params;
  return self;
}, "make16");
var fromInput = /* @__PURE__ */ __name((input) => {
  if (isUrlParams(input)) {
    return input;
  }
  const parsed = fromInputNested(input);
  const out = [];
  for (let i = 0; i < parsed.length; i++) {
    if (Array.isArray(parsed[i][0])) {
      const [keys2, value3] = parsed[i];
      out.push([`${keys2[0]}[${keys2.slice(1).join("][")}]`, value3]);
    } else {
      out.push(parsed[i]);
    }
  }
  return make16(out);
}, "fromInput");
var fromInputNested = /* @__PURE__ */ __name((input) => {
  const entries = typeof input[Symbol.iterator] === "function" ? fromIterable(input) : Object.entries(input);
  const out = [];
  for (const [key, value3] of entries) {
    if (Array.isArray(value3)) {
      for (let i = 0; i < value3.length; i++) {
        if (value3[i] !== void 0) {
          out.push([key, String(value3[i])]);
        }
      }
    } else if (typeof value3 === "object") {
      const nested = fromInputNested(value3);
      for (const [k, v] of nested) {
        out.push([[key, ...typeof k === "string" ? [k] : k], v]);
      }
    } else if (value3 !== void 0) {
      out.push([key, String(value3)]);
    }
  }
  return out;
}, "fromInputNested");
var Equivalence4 = /* @__PURE__ */ make((a, b) => arrayEquivalence(a.params, b.params));
var arrayEquivalence = /* @__PURE__ */ makeEquivalence4(/* @__PURE__ */ makeEquivalence2([/* @__PURE__ */ strictEqual(), /* @__PURE__ */ strictEqual()]));
var toString = /* @__PURE__ */ __name((input) => new URLSearchParams(fromInput(input).params).toString(), "toString");
var toRecord = /* @__PURE__ */ __name((self) => {
  const out = {};
  for (const [k, value3] of self.params) {
    if (!Object.hasOwn(out, k)) {
      assignProperty(out, k, value3);
    } else {
      const current = out[k];
      if (typeof current === "string") {
        assignProperty(out, k, [current, value3]);
      } else {
        current.push(value3);
      }
    }
  }
  return out;
}, "toRecord");
var TypeId24 = "~effect/http/HttpBody";
var Proto5 = class {
  static {
    __name(this, "Proto5");
  }
  [TypeId24];
  constructor() {
    this[TypeId24] = TypeId24;
  }
  [NodeInspectSymbol]() {
    return this.toJSON();
  }
  toString() {
    return format(this, {
      ignoreToString: true
    });
  }
};
var Empty2 = class extends Proto5 {
  static {
    __name(this, "Empty2");
  }
  _tag = "Empty";
  toJSON() {
    return {
      _id: "effect/HttpBody",
      _tag: "Empty"
    };
  }
};
var empty6 = /* @__PURE__ */ new Empty2();
var Raw = class extends Proto5 {
  static {
    __name(this, "Raw");
  }
  _tag = "Raw";
  body;
  contentType;
  contentLength;
  constructor(body, contentType, contentLength) {
    super();
    this.body = body;
    this.contentType = contentType;
    this.contentLength = contentLength;
  }
  toJSON() {
    return {
      _id: "effect/HttpBody",
      _tag: "Raw",
      body: this.body,
      contentType: this.contentType,
      contentLength: this.contentLength
    };
  }
};
var raw = /* @__PURE__ */ __name((body, options) => new Raw(body, options?.contentType, options?.contentLength), "raw");
var Uint8Array3 = class extends Proto5 {
  static {
    __name(this, "Uint8Array3");
  }
  _tag = "Uint8Array";
  body;
  contentType;
  contentLength;
  constructor(body, contentType, contentLength) {
    super();
    this.body = body;
    this.contentType = contentType;
    this.contentLength = contentLength;
  }
  toJSON() {
    const toString22 = this.contentType.startsWith("text/") || this.contentType.endsWith("json");
    return {
      _id: "effect/HttpBody",
      _tag: "Uint8Array",
      body: toString22 ? new TextDecoder().decode(this.body) : `Uint8Array(${this.body.length})`,
      contentType: this.contentType,
      contentLength: this.contentLength
    };
  }
};
var uint8Array = /* @__PURE__ */ __name((body, contentType) => new Uint8Array3(body, contentType ?? "application/octet-stream", body.length), "uint8Array");
var encoder3 = /* @__PURE__ */ new TextEncoder();
var text = /* @__PURE__ */ __name((body, contentType) => uint8Array(encoder3.encode(body), contentType ?? "text/plain"), "text");
var jsonUnsafe = /* @__PURE__ */ __name((body, contentType) => text(JSON.stringify(body), contentType ?? "application/json"), "jsonUnsafe");
var Stream = class extends Proto5 {
  static {
    __name(this, "Stream");
  }
  _tag = "Stream";
  stream;
  contentType;
  contentLength;
  constructor(stream3, contentType, contentLength) {
    super();
    this.stream = stream3;
    this.contentType = contentType;
    this.contentLength = contentLength;
  }
  toJSON() {
    return {
      _id: "effect/HttpBody",
      _tag: "Stream",
      contentType: this.contentType,
      contentLength: this.contentLength
    };
  }
};
var stream = /* @__PURE__ */ __name((body, contentType, contentLength) => new Stream(body, contentType ?? "application/octet-stream", contentLength), "stream");
var TypeId25 = /* @__PURE__ */ Symbol.for("~effect/http/Headers");
var Proto6 = /* @__PURE__ */ Object.defineProperties(/* @__PURE__ */ Object.create(null), {
  [TypeId25]: {
    value: TypeId25
  },
  [symbolRedactable]: {
    value(context3) {
      return redact2(this, get(context3, CurrentRedactedNames));
    }
  },
  toJSON: {
    value() {
      return redact(this);
    }
  },
  [symbol2]: {
    value(that) {
      return Equivalence5(this, that);
    }
  },
  [symbol]: {
    value() {
      return structure(this);
    }
  },
  toString: {
    value: BaseProto.toString
  },
  [NodeInspectSymbol]: {
    value: BaseProto[NodeInspectSymbol]
  }
});
var make17 = /* @__PURE__ */ __name((input) => Object.assign(Object.create(Proto6), input), "make17");
var Equivalence5 = /* @__PURE__ */ makeEquivalence3(/* @__PURE__ */ strictEqual());
var empty7 = /* @__PURE__ */ Object.create(Proto6);
var fromInput2 = /* @__PURE__ */ __name((input) => {
  if (input === void 0) {
    return empty7;
  } else if (Symbol.iterator in input) {
    const out2 = Object.create(Proto6);
    for (const [k, v] of input) {
      out2[k.toLowerCase()] = v;
    }
    return out2;
  }
  const out = Object.create(Proto6);
  for (const [k, v] of Object.entries(input)) {
    if (Array.isArray(v)) {
      out[k.toLowerCase()] = v.join(", ");
    } else if (v !== void 0) {
      out[k.toLowerCase()] = v;
    }
  }
  return out;
}, "fromInput2");
var fromRecordUnsafe = /* @__PURE__ */ __name((input) => Object.setPrototypeOf(input, Proto6), "fromRecordUnsafe");
var set = /* @__PURE__ */ dual(3, (self, key, value3) => {
  const out = make17(self);
  out[key.toLowerCase()] = value3;
  return out;
});
var setAll = /* @__PURE__ */ dual(2, (self, headers) => make17({
  ...self,
  ...fromInput2(headers)
}));
var merge3 = /* @__PURE__ */ dual(2, (self, headers) => {
  const out = make17(self);
  Object.assign(out, headers);
  return out;
});
var remove = /* @__PURE__ */ dual(2, (self, key) => {
  const out = make17(self);
  delete out[key.toLowerCase()];
  return out;
});
var redact2 = /* @__PURE__ */ dual(2, (self, key) => {
  const out = {
    ...self
  };
  const modify = /* @__PURE__ */ __name((key2) => {
    if (typeof key2 === "string") {
      const k = key2.toLowerCase();
      if (k in self) {
        out[k] = make7(self[k]);
      }
    } else {
      for (const name in self) {
        if (key2.test(name)) {
          out[name] = make7(self[name]);
        }
      }
    }
  }, "modify");
  if (Array.isArray(key)) {
    for (let i = 0; i < key.length; i++) {
      modify(key[i]);
    }
  } else {
    modify(key);
  }
  return out;
});
var CurrentRedactedNames = /* @__PURE__ */ Reference("effect/Headers/CurrentRedactedNames", {
  defaultValue: /* @__PURE__ */ __name(() => ["authorization", "cookie", "set-cookie", "x-api-key"], "defaultValue")
});
var toString2 = /* @__PURE__ */ __name((self) => {
  switch (self._tag) {
    case "Weak":
      return `W/"${self.value}"`;
    case "Strong":
      return `"${self.value}"`;
  }
}, "toString2");
var Generator = class extends (/* @__PURE__ */ Service()("effect/http/Etag/Generator")) {
  static {
    __name(this, "Generator");
  }
};
var fromFileInfo = /* @__PURE__ */ __name((info) => {
  const mtime = match(info.mtime, {
    onNone: /* @__PURE__ */ __name(() => "0", "onNone"),
    onSome: /* @__PURE__ */ __name((mtime2) => mtime2.getTime().toString(16), "onSome")
  });
  return `${info.size.toString(16)}-${mtime}`;
}, "fromFileInfo");
var fromFileWeb = /* @__PURE__ */ __name((file) => {
  return `${file.size.toString(16)}-${file.lastModified.toString(16)}`;
}, "fromFileWeb");
var layer = /* @__PURE__ */ succeed4(Generator)({
  fromFileInfo(info) {
    return sync2(() => ({
      _tag: "Strong",
      value: fromFileInfo(info)
    }));
  },
  fromFileWeb(file) {
    return sync2(() => ({
      _tag: "Strong",
      value: fromFileWeb(file)
    }));
  }
});
var layerWeak = /* @__PURE__ */ succeed4(Generator)({
  fromFileInfo(info) {
    return sync2(() => ({
      _tag: "Weak",
      value: fromFileInfo(info)
    }));
  },
  fromFileWeb(file) {
    return sync2(() => ({
      _tag: "Weak",
      value: fromFileWeb(file)
    }));
  }
});
var ignore3 = "~effect/ErrorReporter/ignore";
var TypeId26 = "~effect/http/Cookies";
var CookieTypeId = "~effect/http/Cookies/Cookie";
var CookieErrorTypeId = "~effect/http/Cookies/CookieError";
var CookiesErrorReason = class extends Error3 {
  static {
    __name(this, "CookiesErrorReason");
  }
};
var CookiesError = class _CookiesError extends (/* @__PURE__ */ TaggedError2("CookieError")) {
  static {
    __name(this, "CookiesError");
  }
  static fromReason(reason, cause) {
    return new _CookiesError({
      reason: new CookiesErrorReason({
        _tag: reason,
        cause
      })
    });
  }
  [CookieErrorTypeId] = CookieErrorTypeId;
  get message() {
    return this.reason._tag;
  }
};
var Proto7 = {
  [TypeId26]: TypeId26,
  ...BaseProto,
  toJSON() {
    return {
      _id: "effect/Cookies",
      cookies: map3(this.cookies, (cookie) => cookie.toJSON())
    };
  },
  pipe() {
    return pipeArguments(this, arguments);
  }
};
var fromReadonlyRecord = /* @__PURE__ */ __name((cookies) => {
  const self = Object.create(Proto7);
  self.cookies = cookies;
  return self;
}, "fromReadonlyRecord");
var fromIterable2 = /* @__PURE__ */ __name((cookies) => {
  const record22 = {};
  for (const cookie of cookies) {
    assignProperty(record22, cookie.name, cookie);
  }
  return fromReadonlyRecord(record22);
}, "fromIterable2");
var empty8 = /* @__PURE__ */ fromIterable2([]);
var isEmpty = /* @__PURE__ */ __name((self) => isEmptyRecord(self.cookies), "isEmpty");
var fieldContentRegExp = /^[\u0009\u0020-\u007e\u0080-\u00ff]+$/;
var cookieNameRegExp = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
var cookieDomainRegExp = /^[\u0009\u0020-\u003a\u003c-\u007e\u0080-\u00ff]+$/;
var cookiePathRegExp = /^[\u0020-\u003a\u003c-\u007e]+$/;
var CookieProto = {
  [CookieTypeId]: CookieTypeId,
  ...BaseProto,
  toJSON() {
    return {
      _id: "effect/Cookies/Cookie",
      name: this.name,
      value: this.value,
      options: this.options
    };
  }
};
function validateCookie(name, encodedValue, options) {
  if (!cookieNameRegExp.test(name)) {
    return CookiesError.fromReason("InvalidCookieName");
  }
  if (encodedValue && !fieldContentRegExp.test(encodedValue)) {
    return CookiesError.fromReason("InvalidCookieValue");
  }
  if (options?.domain !== void 0 && !cookieDomainRegExp.test(options.domain)) {
    return CookiesError.fromReason("InvalidCookieDomain");
  }
  if (options?.path !== void 0 && !cookiePathRegExp.test(options.path)) {
    return CookiesError.fromReason("InvalidCookiePath");
  }
  if (options?.maxAge !== void 0 && !isFinite(fromInputUnsafe(options.maxAge))) {
    return CookiesError.fromReason("CookieInfinityMaxAge");
  }
}
__name(validateCookie, "validateCookie");
function serializeCookie(self) {
  const error = validateCookie(self.name, self.valueEncoded, self.options);
  if (error !== void 0) {
    throw error;
  }
  let str = self.name + "=" + self.valueEncoded;
  if (self.options === void 0) {
    return str;
  }
  const options = self.options;
  if (options.maxAge !== void 0) {
    const maxAge = toSeconds(fromInputUnsafe(options.maxAge));
    str += "; Max-Age=" + Math.trunc(maxAge);
  }
  if (options.domain !== void 0) {
    str += "; Domain=" + options.domain;
  }
  if (options.path !== void 0) {
    str += "; Path=" + options.path;
  }
  if (options.priority !== void 0) {
    switch (options.priority) {
      case "low":
        str += "; Priority=Low";
        break;
      case "medium":
        str += "; Priority=Medium";
        break;
      case "high":
        str += "; Priority=High";
        break;
    }
  }
  if (options.expires !== void 0) {
    str += "; Expires=" + options.expires.toUTCString();
  }
  if (options.httpOnly) {
    str += "; HttpOnly";
  }
  if (options.secure) {
    str += "; Secure";
  }
  if (options.partitioned) {
    str += "; Partitioned";
  }
  if (options.sameSite !== void 0) {
    switch (options.sameSite) {
      case "lax":
        str += "; SameSite=Lax";
        break;
      case "strict":
        str += "; SameSite=Strict";
        break;
      case "none":
        str += "; SameSite=None";
        break;
    }
  }
  return str;
}
__name(serializeCookie, "serializeCookie");
var toSetCookieHeaders = /* @__PURE__ */ __name((self) => Object.values(self.cookies).map(serializeCookie), "toSetCookieHeaders");
function parseHeader(header) {
  const result3 = {};
  const strLen = header.length;
  let pos = 0;
  let terminatorPos = 0;
  while (true) {
    if (terminatorPos === strLen)
      break;
    terminatorPos = header.indexOf(";", pos);
    if (terminatorPos === -1)
      terminatorPos = strLen;
    let eqIdx = header.indexOf("=", pos);
    if (eqIdx === -1)
      break;
    if (eqIdx > terminatorPos) {
      pos = terminatorPos + 1;
      continue;
    }
    const key = header.substring(pos, eqIdx++).trim();
    if (!Object.hasOwn(result3, key)) {
      const val = header.charCodeAt(eqIdx) === 34 ? header.substring(eqIdx + 1, terminatorPos - 1).trim() : header.substring(eqIdx, terminatorPos).trim();
      assignProperty(result3, key, !(val.indexOf("%") === -1) ? tryDecodeURIComponent(val) : val);
    }
    pos = terminatorPos + 1;
  }
  return result3;
}
__name(parseHeader, "parseHeader");
var tryDecodeURIComponent = /* @__PURE__ */ __name((str) => {
  try {
    return decodeURIComponent(str);
  } catch (_) {
    return str;
  }
}, "tryDecodeURIComponent");
var hasBody = /* @__PURE__ */ __name((method) => method !== "GET" && method !== "HEAD" && method !== "OPTIONS" && method !== "TRACE", "hasBody");
var updateHeaders = /* @__PURE__ */ __name((headers, body) => {
  if (body._tag === "Empty" || body._tag === "FormData") {
    return remove(remove(headers, "content-type"), "content-length");
  }
  headers = body.contentType === void 0 ? remove(headers, "content-type") : set(headers, "content-type", body.contentType);
  return body.contentLength === void 0 ? remove(headers, "content-length") : set(headers, "content-length", body.contentLength.toString());
}, "updateHeaders");
var TypeId27 = "~effect/http/HttpIncomingMessage";
var MaxBodySize = /* @__PURE__ */ Reference("effect/http/HttpIncomingMessage/MaxBodySize", {
  defaultValue: /* @__PURE__ */ __name(() => {
    return;
  }, "defaultValue")
});
var inspect = /* @__PURE__ */ __name((self, that) => {
  const contentType = self.headers["content-type"] ?? "";
  let body;
  if (contentType.includes("application/json")) {
    try {
      body = runSync2(self.json);
    } catch (_) {
    }
  } else if (contentType.includes("text/") || contentType.includes("urlencoded")) {
    try {
      body = runSync2(self.text);
    } catch (_) {
    }
  }
  const obj = {
    ...that,
    headers: redact(self.headers),
    remoteAddress: self.remoteAddress
  };
  if (body !== void 0) {
    obj.body = body;
  }
  return obj;
}, "inspect");
var TypeId28 = "~effect/http/HttpServerResponse";
var isHttpServerResponse = /* @__PURE__ */ __name((u) => hasProperty(u, TypeId28), "isHttpServerResponse");
var empty9 = /* @__PURE__ */ __name((options) => makeResponse({
  status: options?.status ?? 204,
  statusText: options?.statusText,
  headers: options?.headers ? fromInput2(options.headers) : void 0,
  cookies: options?.cookies
}), "empty9");
var uint8Array2 = /* @__PURE__ */ __name((body, options) => {
  const headers = options?.headers ? fromInput2(options.headers) : empty7;
  return makeResponse({
    status: options?.status ?? 200,
    statusText: options?.statusText,
    headers,
    cookies: options?.cookies ?? empty8,
    body: uint8Array(body, getContentType(options, headers))
  });
}, "uint8Array2");
var getContentType = /* @__PURE__ */ __name((options, headers) => {
  if (options?.contentType) {
    return options.contentType;
  } else if (options?.headers) {
    return headers["content-type"];
  }
}, "getContentType");
var text2 = /* @__PURE__ */ __name((body, options) => {
  const headers = options?.headers ? fromInput2(options.headers) : empty7;
  return makeResponse({
    status: options?.status ?? 200,
    statusText: options?.statusText,
    headers,
    cookies: options?.cookies ?? empty8,
    body: text(body, getContentType(options, headers))
  });
}, "text2");
var jsonUnsafe2 = /* @__PURE__ */ __name((body, options) => {
  const headers = options?.headers ? fromInput2(options.headers) : empty7;
  return makeResponse({
    status: options?.status ?? 200,
    statusText: options?.statusText,
    headers,
    cookies: options?.cookies,
    body: jsonUnsafe(body, getContentType(options, headers))
  });
}, "jsonUnsafe2");
var urlParams = /* @__PURE__ */ __name((body, options) => {
  const headers = options?.headers ? fromInput2(options.headers) : empty7;
  return makeResponse({
    status: options?.status ?? 200,
    statusText: options?.statusText,
    headers,
    cookies: options?.cookies,
    body: text(toString(fromInput(body)), getContentType(options, headers) ?? "application/x-www-form-urlencoded")
  });
}, "urlParams");
var stream2 = /* @__PURE__ */ __name((body, options) => {
  const headers = options?.headers ? fromInput2(options.headers) : empty7;
  return makeResponse({
    status: options?.status ?? 200,
    statusText: options?.statusText,
    headers,
    cookies: options?.cookies,
    body: stream(body, getContentType(options, headers), options?.contentLength)
  });
}, "stream2");
var setHeader = /* @__PURE__ */ dual(3, (self, key, value3) => makeResponse({
  ...self,
  headers: set(self.headers, key, value3)
}, true));
var removeHeader = /* @__PURE__ */ dual(2, (self, key) => makeResponse({
  ...self,
  headers: remove(self.headers, key)
}));
var setHeaders = /* @__PURE__ */ dual(2, (self, input) => makeResponse({
  ...self,
  headers: setAll(self.headers, input)
}, true));
var setBody = /* @__PURE__ */ dual(2, (self, body) => makeResponse({
  ...self,
  headers: updateHeaders(self.headers, body),
  body
}));
var toWeb = /* @__PURE__ */ __name((response, options) => {
  const headers = new globalThis.Headers(response.headers);
  if (!isEmpty(response.cookies)) {
    const toAdd = toSetCookieHeaders(response.cookies);
    for (const header of toAdd) {
      headers.append("set-cookie", header);
    }
  }
  if (options?.withoutBody) {
    return new Response(void 0, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
  const body = response.body;
  switch (body._tag) {
    case "Empty": {
      return new Response(void 0, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }
    case "Uint8Array":
    case "Raw": {
      if (body.body instanceof Response) {
        for (const [key, value3] of headers) {
          body.body.headers.set(key, value3);
        }
        return body.body;
      }
      return new Response(body.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }
    case "FormData": {
      return new Response(body.formData, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }
    case "Stream": {
      return new Response(toReadableStreamWith(body.stream, options?.context ?? empty()), {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }
  }
}, "toWeb");
var Proto8 = {
  ...PipeInspectableProto,
  [TypeId28]: TypeId28,
  [ignore3]: true,
  toJSON() {
    return {
      _id: "HttpServerResponse",
      status: this.status,
      statusText: this.statusText,
      headers: redact(this.headers),
      cookies: this.cookies.toJSON(),
      body: this.body.toJSON()
    };
  }
};
var makeResponse = /* @__PURE__ */ __name((options, preferHeaders = false) => {
  const self = Object.create(Proto8);
  self.status = options.status;
  self.statusText = options.statusText;
  self.cookies = options.cookies ?? empty8;
  self.body = options.body ?? empty6;
  if (self.body._tag !== "Empty" && (self.body.contentType || self.body.contentLength !== void 0)) {
    const newHeaders = fromRecordUnsafe({
      ...options.headers
    });
    if (self.body.contentType && (!preferHeaders || newHeaders["content-type"] === void 0)) {
      newHeaders["content-type"] = self.body.contentType;
    }
    if (self.body.contentLength !== void 0 && (!preferHeaders || newHeaders["content-length"] === void 0)) {
      newHeaders["content-length"] = self.body.contentLength.toString();
    }
    self.headers = newHeaders;
  } else {
    self.headers = options.headers ?? empty7;
  }
  return self;
}, "makeResponse");
var varyAcceptEncoding = /* @__PURE__ */ __name((headers) => {
  const vary = headers["vary"];
  if (vary === void 0) {
    return "Accept-Encoding";
  }
  const members = vary.split(",").map((member) => member.trim().toLowerCase());
  return members.includes("*") || members.includes("accept-encoding") ? void 0 : `${vary}, Accept-Encoding`;
}, "varyAcceptEncoding");
var wrapCompression = /* @__PURE__ */ __name((impl) => ({
  algorithms: impl.algorithms,
  compressResponse(response, algorithm, options) {
    return map7(impl.compressResponse(response, algorithm, options), (compressed) => {
      if (compressed === response) {
        return response;
      }
      const headers = {
        "content-encoding": algorithm
      };
      const vary = varyAcceptEncoding(compressed.headers);
      if (vary !== void 0) {
        headers["vary"] = vary;
      }
      const etag = compressed.headers["etag"];
      if (etag !== void 0 && !etag.startsWith("W/")) {
        headers["etag"] = `W/${etag}`;
      }
      return setHeaders(compressed, headers);
    });
  }
}), "wrapCompression");
var compressionTransformWeb = /* @__PURE__ */ __name((format32) => (stream3) => stream3.pipeThrough(new CompressionStream(format32)), "compressionTransformWeb");
var setBodyWithoutLength = /* @__PURE__ */ __name((response, body) => removeHeader(setBody(response, body), "content-length"), "setBodyWithoutLength");
var makeCompressionWeb = /* @__PURE__ */ __name((options) => ({
  algorithms: new Set(options.algorithms),
  compressResponse(response, algorithm, opts) {
    const body = response.body;
    switch (body._tag) {
      case "Uint8Array": {
        const data = body.body;
        return succeed6(streamBody(response, () => options.transform(algorithm, opts)(singleChunkStream(data)), body.contentType));
      }
      case "Stream": {
        const stream3 = body.stream;
        return succeed6(streamBody(response, () => options.transform(algorithm, opts)(toReadableStream(stream3)), body.contentType));
      }
      case "Raw": {
        const readable = rawReadableStream(body.body);
        if (readable === void 0) {
          return succeed6(response);
        }
        return succeed6(setBodyWithoutLength(response, raw(options.transform(algorithm, opts)(readable), {
          contentType: body.contentType
        })));
      }
      default: {
        return succeed6(response);
      }
    }
  }
}), "makeCompressionWeb");
var streamBody = /* @__PURE__ */ __name((response, evaluate2, contentType) => setBodyWithoutLength(response, stream(fromReadableStream2({
  evaluate: evaluate2,
  onError: identity
}), contentType)), "streamBody");
var singleChunkStream = /* @__PURE__ */ __name((data) => new ReadableStream({
  start(controller) {
    controller.enqueue(data);
    controller.close();
  }
}), "singleChunkStream");
var rawReadableStream = /* @__PURE__ */ __name((raw2) => {
  if (typeof ReadableStream !== "undefined" && raw2 instanceof ReadableStream) {
    return raw2;
  } else if (raw2 instanceof globalThis.Response) {
    return raw2.body ?? void 0;
  }
  return new globalThis.Response(raw2).body ?? void 0;
}, "rawReadableStream");
var compressionWeb = /* @__PURE__ */ makeCompressionWeb({
  algorithms: ["gzip", "deflate"],
  transform: /* @__PURE__ */ __name((algorithm) => compressionTransformWeb(algorithm), "transform")
});
var HttpPlatform = class extends (/* @__PURE__ */ Service()("effect/http/HttpPlatform")) {
  static {
    __name(this, "HttpPlatform");
  }
};
var make18 = /* @__PURE__ */ fnUntraced2(function* (impl) {
  const fs = yield* FileSystem;
  const etagGen = yield* Generator;
  return HttpPlatform.of({
    platform: impl.platform,
    compression: wrapCompression(impl.compression),
    fileResponse: fnUntraced2(function* (path, options) {
      const info = yield* fs.stat(path);
      const etag = yield* etagGen.fromFileInfo(info);
      const start = Number(options?.offset ?? 0);
      const end = options?.bytesToRead !== void 0 ? start + Number(options.bytesToRead) : void 0;
      const headers = set(options?.headers ? fromInput2(options.headers) : empty7, "etag", toString2(etag));
      if (isSome2(info.mtime)) {
        headers["last-modified"] = info.mtime.value.toUTCString();
      }
      const contentLength = end !== void 0 ? end - start : Number(info.size) - start;
      return impl.fileResponse(path, options?.status ?? 200, options?.statusText, headers, start, end, contentLength);
    }),
    fileWebResponse(file, options) {
      return map7(etagGen.fromFileWeb(file), (etag) => {
        const headers = merge3(options?.headers ? fromInput2(options.headers) : empty7, fromRecordUnsafe({
          etag: toString2(etag),
          "last-modified": new Date(file.lastModified).toUTCString()
        }));
        return impl.fileWebResponse(file, options?.status ?? 200, options?.statusText, headers, options);
      });
    }
  });
});
var layer2 = /* @__PURE__ */ effect(HttpPlatform)(flatMap3(FileSystem, (fs) => make18({
  platform: "web",
  compression: compressionWeb,
  fileResponse(path, status2, statusText, headers, start, end, contentLength) {
    return stream2(fs.stream(path, {
      offset: start,
      bytesToRead: end !== void 0 ? end - start : void 0
    }), {
      contentLength,
      headers,
      status: status2,
      statusText
    });
  },
  fileWebResponse(file, status2, statusText, headers, options) {
    const offset = Number(options?.offset ?? 0);
    const bytesToRead = options?.bytesToRead !== void 0 ? Number(options.bytesToRead) : void 0;
    const chunkSize = options?.chunkSize !== void 0 ? Math.max(1, Number(options.chunkSize)) : Infinity;
    const end = offset + (bytesToRead ?? Infinity);
    const stream3 = end <= offset ? empty5 : fromReadableStream2({
      evaluate: /* @__PURE__ */ __name(() => file.stream(), "evaluate"),
      onError: identity
    }).pipe(mapAccum2(() => 0, (position, bytes) => {
      const next = position + bytes.length;
      const start = Math.min(Math.max(offset - position, 0), bytes.length);
      const stop = Math.min(Math.max(end - position, 0), bytes.length);
      const chunks = [];
      for (let index = start; index < stop; index += chunkSize) {
        chunks.push({
          bytes: bytes.subarray(index, Math.min(index + chunkSize, stop)),
          done: next >= end && index + chunkSize >= stop
        });
      }
      return [next, chunks];
    }), takeUntil((chunk) => chunk.done), map10((chunk) => chunk.bytes));
    return stream2(stream3, {
      contentLength: bytesToRead ?? file.size - offset,
      headers,
      status: status2,
      statusText
    });
  }
}))).pipe(/* @__PURE__ */ provide2(layerWeak));
var symbol4 = "~effect/http/HttpServerRespondable";
var isRespondable = /* @__PURE__ */ __name((u) => hasProperty(u, symbol4), "isRespondable");
var badRequest = /* @__PURE__ */ empty9({
  status: 400
});
var notFound3 = /* @__PURE__ */ empty9({
  status: 404
});
var toResponseOrElse = /* @__PURE__ */ __name((u, orElse) => {
  if (isHttpServerResponse(u)) {
    return succeed6(u);
  } else if (isRespondable(u)) {
    return catchCause2(u[symbol4](), () => succeed6(orElse));
  } else if (isSchemaError(u)) {
    return succeed6(badRequest);
  } else if (isNoSuchElementError2(u)) {
    return succeed6(notFound3);
  }
  return succeed6(orElse);
}, "toResponseOrElse");
var toResponseOrElseDefect = /* @__PURE__ */ __name((u, orElse) => {
  if (isHttpServerResponse(u)) {
    return succeed6(u);
  } else if (isRespondable(u)) {
    return catchCause2(u[symbol4](), () => succeed6(orElse));
  }
  return succeed6(orElse);
}, "toResponseOrElseDefect");
var TypeId29 = "~effect/http/HttpServerError";
var HttpServerError = class extends (/* @__PURE__ */ TaggedError2("HttpServerError")) {
  static {
    __name(this, "HttpServerError");
  }
  constructor(props) {
    if ("cause" in props.reason) {
      super({
        ...props,
        cause: props.reason.cause
      });
    } else {
      super(props);
    }
  }
  [TypeId29] = TypeId29;
  stack = `${this.name}: ${this.message}`;
  get request() {
    return this.reason.request;
  }
  get response() {
    return "response" in this.reason ? this.reason.response : void 0;
  }
  [symbol4]() {
    return this.reason[symbol4]();
  }
  get [ignore3]() {
    return this.reason[ignore3] ?? false;
  }
  get message() {
    return this.reason.message;
  }
};
var RequestParseError = class extends (/* @__PURE__ */ TaggedError2("RequestParseError")) {
  static {
    __name(this, "RequestParseError");
  }
  [symbol4]() {
    return succeed6(empty9({
      status: 400
    }));
  }
  get methodAndUrl() {
    return `${this.request.method} ${this.request.url}`;
  }
  get message() {
    return formatRequestMessage(this._tag, this.description, this.methodAndUrl);
  }
};
var RouteNotFound = class extends (/* @__PURE__ */ TaggedError2("RouteNotFound")) {
  static {
    __name(this, "RouteNotFound");
  }
  [symbol4]() {
    return succeed6(empty9({
      status: 404
    }));
  }
  [ignore3] = true;
  get methodAndUrl() {
    return `${this.request.method} ${this.request.url}`;
  }
  get message() {
    return formatRequestMessage(this._tag, this.description, this.methodAndUrl);
  }
};
var ClientAbort = class extends (/* @__PURE__ */ Service()("effect/http/HttpServerError/ClientAbort")) {
  static {
    __name(this, "ClientAbort");
  }
  static annotation = /* @__PURE__ */ this.context(true).pipe(/* @__PURE__ */ add(StackTrace, {
    name: "ClientAbort",
    stack: constUndefined,
    parent: void 0
  }));
};
var formatRequestMessage = /* @__PURE__ */ __name((reason, description, info) => {
  const prefix = `${reason} (${info})`;
  return description ? `${prefix}: ${description}` : prefix;
}, "formatRequestMessage");
var causeResponse = /* @__PURE__ */ __name((cause) => {
  let response;
  let effect2 = succeedInternalServerError;
  const failures = [];
  let interrupts = [];
  let isClientInterrupt = false;
  for (let i = 0; i < cause.reasons.length; i++) {
    const reason = cause.reasons[i];
    switch (reason._tag) {
      case "Fail": {
        effect2 = toResponseOrElse(reason.error, internalServerError);
        failures.push(reason);
        break;
      }
      case "Die": {
        if (isHttpServerResponse(reason.defect)) {
          response = reason.defect;
        } else {
          effect2 = toResponseOrElseDefect(reason.defect, internalServerError);
          failures.push(reason);
        }
        break;
      }
      case "Interrupt": {
        isClientInterrupt = reason.annotations.has(ClientAbort.key);
        if (failures.length > 0)
          break;
        interrupts.push(reason);
        break;
      }
    }
  }
  if (response) {
    return succeed6([response, fromReasons(failures)]);
  } else if (interrupts.length > 0 && failures.length === 0) {
    failures.push(...interrupts);
    effect2 = isClientInterrupt ? clientAbortError : serverAbortError;
  }
  return mapEager2(effect2, (response2) => {
    failures.push(makeDieReason(response2));
    return [response2, fromReasons(failures)];
  });
}, "causeResponse");
var causeResponseStripped = /* @__PURE__ */ __name((cause) => {
  let response;
  const failures = cause.reasons.filter((f) => {
    if (f._tag === "Die" && isHttpServerResponse(f.defect)) {
      response = f.defect;
      return false;
    }
    return true;
  });
  return [response ?? internalServerError, failures.length > 0 ? some2(fromReasons(failures)) : none2()];
}, "causeResponseStripped");
var internalServerError = /* @__PURE__ */ empty9({
  status: 500
});
var succeedInternalServerError = /* @__PURE__ */ succeed6(internalServerError);
var clientAbortError = /* @__PURE__ */ succeed6(/* @__PURE__ */ empty9({
  status: 499
}));
var serverAbortError = /* @__PURE__ */ succeed6(/* @__PURE__ */ empty9({
  status: 503
}));
var TypeId30 = "~effect/platform/Path";
var Path = /* @__PURE__ */ Service("effect/Path");
function normalizeStringPosix(path, allowAboveRoot) {
  let res = "";
  let lastSegmentLength = 0;
  let lastSlash = -1;
  let dots = 0;
  let code;
  for (let i = 0; i <= path.length; ++i) {
    if (i < path.length) {
      code = path.charCodeAt(i);
    } else if (code === 47) {
      break;
    } else {
      code = 47;
    }
    if (code === 47) {
      if (lastSlash === i - 1 || dots === 1) {
      } else if (lastSlash !== i - 1 && dots === 2) {
        if (res.length < 2 || lastSegmentLength !== 2 || res.charCodeAt(res.length - 1) !== 46 || res.charCodeAt(res.length - 2) !== 46) {
          if (res.length > 2) {
            const lastSlashIndex = res.lastIndexOf("/");
            if (lastSlashIndex !== res.length - 1) {
              if (lastSlashIndex === -1) {
                res = "";
                lastSegmentLength = 0;
              } else {
                res = res.slice(0, lastSlashIndex);
                lastSegmentLength = res.length - 1 - res.lastIndexOf("/");
              }
              lastSlash = i;
              dots = 0;
              continue;
            }
          } else if (res.length === 2 || res.length === 1) {
            res = "";
            lastSegmentLength = 0;
            lastSlash = i;
            dots = 0;
            continue;
          }
        }
        if (allowAboveRoot) {
          if (res.length > 0) {
            res += "/..";
          } else {
            res = "..";
          }
          lastSegmentLength = 2;
        }
      } else {
        if (res.length > 0) {
          res += "/" + path.slice(lastSlash + 1, i);
        } else {
          res = path.slice(lastSlash + 1, i);
        }
        lastSegmentLength = i - lastSlash - 1;
      }
      lastSlash = i;
      dots = 0;
    } else if (code === 46 && dots !== -1) {
      ++dots;
    } else {
      dots = -1;
    }
  }
  return res;
}
__name(normalizeStringPosix, "normalizeStringPosix");
function _format(sep, pathObject) {
  const dir = pathObject.dir || pathObject.root;
  const base = pathObject.base || (pathObject.name || "") + (pathObject.ext || "");
  if (!dir) {
    return base;
  }
  if (dir === pathObject.root) {
    return dir + base;
  }
  return dir + sep + base;
}
__name(_format, "_format");
function fromFileUrl(url) {
  if (url.protocol !== "file:") {
    return fail5(new BadArgument({
      module: "Path",
      method: "fromFileUrl",
      description: "URL must be of scheme file"
    }));
  } else if (url.hostname !== "") {
    return fail5(new BadArgument({
      module: "Path",
      method: "fromFileUrl",
      description: "Invalid file URL host"
    }));
  }
  const pathname = url.pathname;
  for (let n = 0; n < pathname.length; n++) {
    if (pathname[n] === "%") {
      const third = pathname.codePointAt(n + 2) | 32;
      if (pathname[n + 1] === "2" && third === 102) {
        return fail5(new BadArgument({
          module: "Path",
          method: "fromFileUrl",
          description: "must not include encoded / characters"
        }));
      }
    }
  }
  return succeed6(decodeURIComponent(pathname));
}
__name(fromFileUrl, "fromFileUrl");
var resolve2 = /* @__PURE__ */ __name(function resolve3() {
  let resolvedPath = "";
  let resolvedAbsolute = false;
  let cwd = void 0;
  for (let i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    let path;
    if (i >= 0) {
      path = arguments[i];
    } else {
      const process = globalThis.process;
      if (cwd === void 0 && "process" in globalThis && typeof process === "object" && process !== null && typeof process.cwd === "function") {
        cwd = process.cwd();
      }
      path = cwd;
    }
    if (path.length === 0) {
      continue;
    }
    resolvedPath = path + "/" + resolvedPath;
    resolvedAbsolute = path.charCodeAt(0) === 47;
  }
  resolvedPath = normalizeStringPosix(resolvedPath, !resolvedAbsolute);
  if (resolvedAbsolute) {
    if (resolvedPath.length > 0) {
      return "/" + resolvedPath;
    } else {
      return "/";
    }
  } else if (resolvedPath.length > 0) {
    return resolvedPath;
  } else {
    return ".";
  }
}, "resolve3");
var CHAR_FORWARD_SLASH = 47;
function toFileUrl(filepath) {
  const outURL = new URL("file://");
  let resolved = resolve2(filepath);
  const filePathLast = filepath.charCodeAt(filepath.length - 1);
  if (filePathLast === CHAR_FORWARD_SLASH && resolved[resolved.length - 1] !== "/") {
    resolved += "/";
  }
  outURL.pathname = encodePathChars(resolved);
  return succeed6(outURL);
}
__name(toFileUrl, "toFileUrl");
var percentRegExp = /%/g;
var backslashRegExp = /\\/g;
var newlineRegExp = /\n/g;
var carriageReturnRegExp = /\r/g;
var tabRegExp = /\t/g;
function encodePathChars(filepath) {
  if (filepath.includes("%")) {
    filepath = filepath.replace(percentRegExp, "%25");
  }
  if (filepath.includes("\\")) {
    filepath = filepath.replace(backslashRegExp, "%5C");
  }
  if (filepath.includes(`
`)) {
    filepath = filepath.replace(newlineRegExp, "%0A");
  }
  if (filepath.includes("\r")) {
    filepath = filepath.replace(carriageReturnRegExp, "%0D");
  }
  if (filepath.includes("	")) {
    filepath = filepath.replace(tabRegExp, "%09");
  }
  return filepath;
}
__name(encodePathChars, "encodePathChars");
var posixImpl = /* @__PURE__ */ Path.of({
  [TypeId30]: TypeId30,
  resolve: resolve2,
  normalize(path) {
    if (path.length === 0)
      return ".";
    const isAbsolute = path.charCodeAt(0) === 47;
    const trailingSeparator = path.charCodeAt(path.length - 1) === 47;
    path = normalizeStringPosix(path, !isAbsolute);
    if (path.length === 0 && !isAbsolute)
      path = ".";
    if (path.length > 0 && trailingSeparator)
      path += "/";
    if (isAbsolute)
      return "/" + path;
    return path;
  },
  isAbsolute(path) {
    return path.length > 0 && path.charCodeAt(0) === 47;
  },
  join() {
    if (arguments.length === 0) {
      return ".";
    }
    let joined;
    for (let i = 0; i < arguments.length; ++i) {
      const arg = arguments[i];
      if (arg.length > 0) {
        if (joined === void 0) {
          joined = arg;
        } else {
          joined += "/" + arg;
        }
      }
    }
    if (joined === void 0) {
      return ".";
    }
    return posixImpl.normalize(joined);
  },
  relative(from, to) {
    if (from === to)
      return "";
    from = posixImpl.resolve(from);
    to = posixImpl.resolve(to);
    if (from === to)
      return "";
    let fromStart = 1;
    for (; fromStart < from.length; ++fromStart) {
      if (from.charCodeAt(fromStart) !== 47) {
        break;
      }
    }
    const fromEnd = from.length;
    const fromLen = fromEnd - fromStart;
    let toStart = 1;
    for (; toStart < to.length; ++toStart) {
      if (to.charCodeAt(toStart) !== 47) {
        break;
      }
    }
    const toEnd = to.length;
    const toLen = toEnd - toStart;
    const length = fromLen < toLen ? fromLen : toLen;
    let lastCommonSep = -1;
    let i = 0;
    for (; i <= length; ++i) {
      if (i === length) {
        if (toLen > length) {
          if (to.charCodeAt(toStart + i) === 47) {
            return to.slice(toStart + i + 1);
          } else if (i === 0) {
            return to.slice(toStart + i);
          }
        } else if (fromLen > length) {
          if (from.charCodeAt(fromStart + i) === 47) {
            lastCommonSep = i;
          } else if (i === 0) {
            lastCommonSep = 0;
          }
        }
        break;
      }
      const fromCode = from.charCodeAt(fromStart + i);
      const toCode = to.charCodeAt(toStart + i);
      if (fromCode !== toCode) {
        break;
      } else if (fromCode === 47) {
        lastCommonSep = i;
      }
    }
    let out = "";
    for (i = fromStart + lastCommonSep + 1; i <= fromEnd; ++i) {
      if (i === fromEnd || from.charCodeAt(i) === 47) {
        if (out.length === 0) {
          out += "..";
        } else {
          out += "/..";
        }
      }
    }
    if (out.length > 0) {
      return out + to.slice(toStart + lastCommonSep);
    } else {
      toStart += lastCommonSep;
      if (to.charCodeAt(toStart) === 47) {
        ++toStart;
      }
      return to.slice(toStart);
    }
  },
  dirname(path) {
    if (path.length === 0)
      return ".";
    let code = path.charCodeAt(0);
    const hasRoot = code === 47;
    let end = -1;
    let matchedSlash = true;
    for (let i = path.length - 1; i >= 1; --i) {
      code = path.charCodeAt(i);
      if (code === 47) {
        if (!matchedSlash) {
          end = i;
          break;
        }
      } else {
        matchedSlash = false;
      }
    }
    if (end === -1)
      return hasRoot ? "/" : ".";
    if (hasRoot && end === 1)
      return "//";
    return path.slice(0, end);
  },
  basename(path, ext) {
    let start = 0;
    let end = -1;
    let matchedSlash = true;
    let i;
    if (ext !== void 0 && ext.length > 0 && ext.length <= path.length) {
      if (ext.length === path.length && ext === path)
        return "";
      let extIdx = ext.length - 1;
      let firstNonSlashEnd = -1;
      for (i = path.length - 1; i >= 0; --i) {
        const code = path.charCodeAt(i);
        if (code === 47) {
          if (!matchedSlash) {
            start = i + 1;
            break;
          }
        } else {
          if (firstNonSlashEnd === -1) {
            matchedSlash = false;
            firstNonSlashEnd = i + 1;
          }
          if (extIdx >= 0) {
            if (code === ext.charCodeAt(extIdx)) {
              if (--extIdx === -1) {
                end = i;
              }
            } else {
              extIdx = -1;
              end = firstNonSlashEnd;
            }
          }
        }
      }
      if (start === end)
        end = firstNonSlashEnd;
      else if (end === -1)
        end = path.length;
      return path.slice(start, end);
    } else {
      for (i = path.length - 1; i >= 0; --i) {
        if (path.charCodeAt(i) === 47) {
          if (!matchedSlash) {
            start = i + 1;
            break;
          }
        } else if (end === -1) {
          matchedSlash = false;
          end = i + 1;
        }
      }
      if (end === -1)
        return "";
      return path.slice(start, end);
    }
  },
  extname(path) {
    let startDot = -1;
    let startPart = 0;
    let end = -1;
    let matchedSlash = true;
    let preDotState = 0;
    for (let i = path.length - 1; i >= 0; --i) {
      const code = path.charCodeAt(i);
      if (code === 47) {
        if (!matchedSlash) {
          startPart = i + 1;
          break;
        }
        continue;
      }
      if (end === -1) {
        matchedSlash = false;
        end = i + 1;
      }
      if (code === 46) {
        if (startDot === -1) {
          startDot = i;
        } else if (preDotState !== 1) {
          preDotState = 1;
        }
      } else if (startDot !== -1) {
        preDotState = -1;
      }
    }
    if (startDot === -1 || end === -1 || preDotState === 0 || preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
      return "";
    }
    return path.slice(startDot, end);
  },
  format: /* @__PURE__ */ __name(function format3(pathObject) {
    if (pathObject === null || typeof pathObject !== "object") {
      throw new TypeError('The "pathObject" argument must be of type Object. Received type ' + typeof pathObject);
    }
    return _format("/", pathObject);
  }, "format3"),
  parse(path) {
    const ret = {
      root: "",
      dir: "",
      base: "",
      ext: "",
      name: ""
    };
    if (path.length === 0)
      return ret;
    let code = path.charCodeAt(0);
    const isAbsolute = code === 47;
    let start;
    if (isAbsolute) {
      ret.root = "/";
      start = 1;
    } else {
      start = 0;
    }
    let startDot = -1;
    let startPart = 0;
    let end = -1;
    let matchedSlash = true;
    let i = path.length - 1;
    let preDotState = 0;
    for (; i >= start; --i) {
      code = path.charCodeAt(i);
      if (code === 47) {
        if (!matchedSlash) {
          startPart = i + 1;
          break;
        }
        continue;
      }
      if (end === -1) {
        matchedSlash = false;
        end = i + 1;
      }
      if (code === 46) {
        if (startDot === -1)
          startDot = i;
        else if (preDotState !== 1)
          preDotState = 1;
      } else if (startDot !== -1) {
        preDotState = -1;
      }
    }
    if (startDot === -1 || end === -1 || preDotState === 0 || preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
      if (end !== -1) {
        if (startPart === 0 && isAbsolute)
          ret.base = ret.name = path.slice(1, end);
        else
          ret.base = ret.name = path.slice(startPart, end);
      }
    } else {
      if (startPart === 0 && isAbsolute) {
        ret.name = path.slice(1, startDot);
        ret.base = path.slice(1, end);
      } else {
        ret.name = path.slice(startPart, startDot);
        ret.base = path.slice(startPart, end);
      }
      ret.ext = path.slice(startDot, end);
    }
    if (startPart > 0)
      ret.dir = path.slice(0, startPart - 1);
    else if (isAbsolute)
      ret.dir = "/";
    return ret;
  },
  sep: "/",
  fromFileUrl,
  toFileUrl,
  toNamespacedPath: identity
});
var layer3 = /* @__PURE__ */ succeed4(Path)(posixImpl);
var paramRE = /; *([!#$%&'*+.^\w`|~-]+)=("(?:[\v\u0020\u0021\u0023-\u005b\u005d-\u007e\u0080-\u{10ffff}]|\\[\v\u0020-\u{10ffff}])*"|[!#$%&'*+.^\w`|~-]+) */gu;
var quotedPairRE = /\\([\v\u0020-\u{10ffff}])/gu;
var mediaTypeRE = /^[!#$%&'*+.^\w|~-]+\/[!#$%&'*+.^\w|~-]+$/u;
var mediaTypeRENoSlash = /^[!#$%&'*+.^\w|~-]+$/u;
var defaultContentType = {
  value: "",
  parameters: /* @__PURE__ */ Object.create(null)
};
function parse(header, withoutSlash = false) {
  if (typeof header !== "string") {
    return defaultContentType;
  }
  let index = header.indexOf(";");
  const type = index !== -1 ? header.slice(0, index).trim() : header.trim();
  const mediaRE = withoutSlash ? mediaTypeRENoSlash : mediaTypeRE;
  if (mediaRE.test(type) === false) {
    return defaultContentType;
  }
  const result3 = {
    value: type.toLowerCase(),
    parameters: /* @__PURE__ */ Object.create(null)
  };
  if (index === -1) {
    return result3;
  }
  let key;
  let match8;
  let value3;
  paramRE.lastIndex = index;
  while (match8 = paramRE.exec(header)) {
    if (match8.index !== index) {
      return defaultContentType;
    }
    index += match8[0].length;
    key = match8[1].toLowerCase();
    value3 = match8[2];
    if (value3[0] === '"') {
      value3 = value3.slice(1, value3.length - 1);
      if (!withoutSlash && quotedPairRE.test(value3)) {
        value3 = value3.replace(quotedPairRE, "$1");
      }
    }
    result3.parameters[key] = value3;
  }
  if (index !== header.length) {
    return defaultContentType;
  }
  return result3;
}
__name(parse, "parse");
var constMaxPairs = 100;
var constMaxSize = 16 * 1024;
var State = {
  key: 0,
  whitespace: 1,
  value: 2
};
var constContinue = {
  _tag: "Continue"
};
var constNameChars = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1];
var constValueChars = [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
function make19() {
  const decoder2 = new TextDecoder();
  const state = {
    state: State.key,
    headers: /* @__PURE__ */ Object.create(null),
    key: "",
    value: void 0,
    crlf: 0,
    previousChunk: void 0,
    pairs: 0,
    size: 0
  };
  function reset(value3) {
    state.state = State.key;
    state.headers = /* @__PURE__ */ Object.create(null);
    state.key = "";
    state.value = void 0;
    state.crlf = 0;
    state.previousChunk = void 0;
    state.pairs = 0;
    state.size = 0;
    return value3;
  }
  __name(reset, "reset");
  function concatUint8Array(a, b) {
    const newUint8Array = new Uint8Array(a.length + b.length);
    newUint8Array.set(a);
    newUint8Array.set(b, a.length);
    return newUint8Array;
  }
  __name(concatUint8Array, "concatUint8Array");
  function error(reason) {
    return reset({
      _tag: "Failure",
      reason,
      headers: state.headers
    });
  }
  __name(error, "error");
  return /* @__PURE__ */ __name(function write(chunk, start) {
    let endOffset = 0;
    let previousCursor;
    if (state.previousChunk !== void 0) {
      endOffset = state.previousChunk.length;
      previousCursor = endOffset;
      const newChunk = new Uint8Array(chunk.length + endOffset);
      newChunk.set(state.previousChunk);
      newChunk.set(chunk, endOffset);
      state.previousChunk = void 0;
      chunk = newChunk;
    }
    const end = chunk.length;
    outer:
      while (start < end) {
        if (state.state === State.key) {
          let i = start;
          for (; i < end; i++) {
            if (state.size++ > constMaxSize) {
              return error("HeaderTooLarge");
            }
            if (chunk[i] === 58) {
              state.key += decoder2.decode(chunk.subarray(start, i)).toLowerCase();
              if (state.key.length === 0) {
                return error("InvalidHeaderName");
              }
              if (chunk[i + 1] === 32 && chunk[i + 2] !== 32 && chunk[i + 2] !== 9) {
                start = i + 2;
                state.state = State.value;
                state.size++;
              } else if (chunk[i + 1] !== 32 && chunk[i + 1] !== 9) {
                start = i + 1;
                state.state = State.value;
              } else {
                start = i + 1;
                state.state = State.whitespace;
              }
              break;
            } else if (constNameChars[chunk[i]] !== 1) {
              return error("InvalidHeaderName");
            }
          }
          if (i === end) {
            state.key += decoder2.decode(chunk.subarray(start, end)).toLowerCase();
            return constContinue;
          }
        }
        if (state.state === State.whitespace) {
          for (; start < end; start++) {
            if (state.size++ > constMaxSize) {
              return error("HeaderTooLarge");
            }
            if (chunk[start] !== 32 && chunk[start] !== 9) {
              state.state = State.value;
              break;
            }
          }
          if (start === end) {
            return constContinue;
          }
        }
        if (state.state === State.value) {
          let i = start;
          if (previousCursor !== void 0) {
            i = previousCursor;
            previousCursor = void 0;
          }
          for (; i < end; i++) {
            if (state.size++ > constMaxSize) {
              return error("HeaderTooLarge");
            }
            if (chunk[i] === 13 || state.crlf > 0) {
              let byte = chunk[i];
              if (byte === 13 && state.crlf === 0) {
                state.crlf = 1;
                i++;
                state.size++;
                byte = chunk[i];
              }
              if (byte === 10 && state.crlf === 1) {
                state.crlf = 2;
                i++;
                state.size++;
                byte = chunk[i];
              }
              if (byte === 13 && state.crlf === 2) {
                state.crlf = 3;
                i++;
                state.size++;
                byte = chunk[i];
              }
              if (byte === 10 && state.crlf === 3) {
                state.crlf = 4;
                i++;
                state.size++;
              }
              if (state.crlf < 4 && i >= end) {
                state.previousChunk = chunk.subarray(start);
                return constContinue;
              } else if (state.crlf >= 2) {
                state.value = state.value === void 0 ? chunk.subarray(start, i - state.crlf) : concatUint8Array(state.value, chunk.subarray(start, i - state.crlf));
                const value3 = decoder2.decode(state.value);
                if (state.headers[state.key] === void 0) {
                  state.headers[state.key] = value3;
                } else if (typeof state.headers[state.key] === "string") {
                  state.headers[state.key] = [state.headers[state.key], value3];
                } else {
                  state.headers[state.key].push(value3);
                }
                start = i;
                state.size--;
                if (state.crlf !== 4 && state.pairs === constMaxPairs) {
                  return error("TooManyHeaders");
                } else if (state.crlf === 3) {
                  return error("InvalidHeaderValue");
                } else if (state.crlf === 4) {
                  return reset({
                    _tag: "Headers",
                    headers: state.headers,
                    endPosition: start - endOffset
                  });
                }
                state.pairs++;
                state.key = "";
                state.value = void 0;
                state.crlf = 0;
                state.state = State.key;
                continue outer;
              }
            } else if (constValueChars[chunk[i]] !== 1) {
              return error("InvalidHeaderValue");
            }
          }
          if (i === end) {
            state.value = state.value === void 0 ? chunk.subarray(start, end) : concatUint8Array(state.value, chunk.subarray(start, end));
            return constContinue;
          }
        }
      }
    if (start > end) {
      state.size += end - start;
    }
    return constContinue;
  }, "write");
}
__name(make19, "make19");
function makeState(needle_) {
  const needle = new TextEncoder().encode(needle_);
  const needleLength = needle.length;
  const indexes = {};
  for (let i = 0; i < needleLength; i++) {
    const b = needle[i];
    if (indexes[b] === void 0)
      indexes[b] = [];
    indexes[b].push(i);
  }
  return {
    needle,
    needleLength,
    indexes,
    firstByte: needle[0],
    previousChunk: void 0,
    previousChunkLength: 0,
    matchIndex: 0
  };
}
__name(makeState, "makeState");
function make20(needle, callback2, seed, minimumChunkLength) {
  const state = makeState(needle);
  const minChunkLength = minimumChunkLength ?? state.needleLength;
  if (seed !== void 0) {
    state.previousChunk = seed;
    state.previousChunkLength = seed.length;
  }
  function makeIndexOf() {
    if ("Buffer" in globalThis && !("Bun" in globalThis || "Deno" in globalThis)) {
      return function(chunk, needle2, fromIndex) {
        return Buffer.prototype.indexOf.call(chunk, needle2, fromIndex);
      };
    }
    const skipTable = new Uint8Array(256).fill(state.needle.length);
    for (let i = 0, lastIndex = state.needle.length - 1; i < lastIndex; ++i) {
      skipTable[state.needle[i]] = lastIndex - i;
    }
    return function(chunk, needle2, fromIndex) {
      const lengthTotal = chunk.length;
      let i = fromIndex + state.needleLength - 1;
      while (i < lengthTotal) {
        for (let j = state.needleLength - 1, k = i; j >= 0 && chunk[k] === needle2[j]; j--, k--) {
          if (j === 0)
            return k;
        }
        i += skipTable[chunk[i]];
      }
      return -1;
    };
  }
  __name(makeIndexOf, "makeIndexOf");
  const indexOf = makeIndexOf();
  function write(chunk) {
    let chunkLength = chunk.length;
    if (state.previousChunk !== void 0) {
      const newChunk = new Uint8Array(state.previousChunkLength + chunkLength);
      newChunk.set(state.previousChunk);
      newChunk.set(chunk, state.previousChunkLength);
      chunk = newChunk;
      chunkLength = state.previousChunkLength + chunkLength;
      state.previousChunk = void 0;
    }
    let pos = 0;
    while (pos < chunkLength) {
      const remaining = chunkLength - pos;
      if (remaining < minChunkLength) {
        state.previousChunk = chunk.subarray(pos);
        state.previousChunkLength = remaining;
        return;
      }
      const match8 = indexOf(chunk, state.needle, pos);
      if (match8 > -1) {
        if (match8 > pos) {
          callback2(state.matchIndex, chunk.subarray(pos, match8));
        }
        state.matchIndex += 1;
        pos = match8 + state.needleLength;
        continue;
      } else if (chunk[chunkLength - 1] in state.indexes) {
        const indexes = state.indexes[chunk[chunkLength - 1]];
        let earliestIndex = -1;
        for (let i = 0, len = indexes.length; i < len; i++) {
          const index = indexes[i];
          if (chunk[chunkLength - 1 - index] === state.firstByte && i > earliestIndex) {
            earliestIndex = index;
          }
        }
        if (earliestIndex === -1) {
          if (pos === 0) {
            callback2(state.matchIndex, chunk);
          } else {
            callback2(state.matchIndex, chunk.subarray(pos));
          }
        } else {
          if (chunkLength - 1 - earliestIndex > pos) {
            callback2(state.matchIndex, chunk.subarray(pos, chunkLength - 1 - earliestIndex));
          }
          state.previousChunk = chunk.subarray(chunkLength - 1 - earliestIndex);
          state.previousChunkLength = earliestIndex + 1;
        }
      } else if (pos === 0) {
        callback2(state.matchIndex, chunk);
      } else {
        callback2(state.matchIndex, chunk.subarray(pos));
      }
      break;
    }
  }
  __name(write, "write");
  function end() {
    if (state.previousChunk !== void 0 && state.previousChunk !== seed) {
      callback2(state.matchIndex, state.previousChunk);
    }
    state.previousChunk = seed;
    state.previousChunkLength = seed?.length ?? 0;
    state.matchIndex = 0;
  }
  __name(end, "end");
  return {
    write,
    end
  };
}
__name(make20, "make20");
var State2 = {
  headers: 0,
  body: 1
};
var errInvalidDisposition = {
  _tag: "InvalidDisposition"
};
var errEndNotReached = {
  _tag: "EndNotReached"
};
var errMaxParts = {
  _tag: "ReachedLimit",
  limit: "MaxParts"
};
var errMaxTotalSize = {
  _tag: "ReachedLimit",
  limit: "MaxTotalSize"
};
var errMaxPartSize = {
  _tag: "ReachedLimit",
  limit: "MaxPartSize"
};
var errMaxFieldSize = {
  _tag: "ReachedLimit",
  limit: "MaxFieldSize"
};
var constCR = /* @__PURE__ */ new TextEncoder().encode(`\r
`);
function defaultIsFile(info) {
  return info.filename !== void 0 || info.contentType === "application/octet-stream";
}
__name(defaultIsFile, "defaultIsFile");
function parseBoundary(headers) {
  const contentType = parse(headers["content-type"]);
  return contentType.parameters.boundary;
}
__name(parseBoundary, "parseBoundary");
function noopOnChunk(_chunk) {
}
__name(noopOnChunk, "noopOnChunk");
function make21({
  headers,
  onFile: onPart,
  onField,
  onError: onError4,
  onDone,
  isFile = defaultIsFile,
  maxParts = Infinity,
  maxTotalSize = Infinity,
  maxPartSize = Infinity,
  maxFieldSize = 1024 * 1024
}) {
  const boundary = parseBoundary(headers);
  if (boundary === void 0) {
    onError4({
      _tag: "InvalidBoundary"
    });
    return {
      write: noopOnChunk,
      end() {
      }
    };
  }
  const state = {
    state: State2.headers,
    index: 0,
    parts: 0,
    onChunk: noopOnChunk,
    info: void 0,
    headerSkip: 0,
    partSize: 0,
    totalSize: 0,
    isFile: false,
    fieldChunks: [],
    fieldSize: 0,
    done: false
  };
  function skipBody() {
    state.state = State2.body;
    state.isFile = true;
    state.onChunk = noopOnChunk;
  }
  __name(skipBody, "skipBody");
  const headerParser = make19();
  const split = make20(`\r
--${boundary}`, function(index, chunk) {
    if (index === 0) {
      skipBody();
      return;
    } else if (index !== state.index) {
      if (state.index > 0) {
        if (state.isFile) {
          state.onChunk(null);
        } else {
          if (state.fieldChunks.length === 1) {
            onField(state.info, state.fieldChunks[0]);
          } else {
            const buf = new Uint8Array(state.fieldSize);
            let offset = 0;
            for (let i = 0; i < state.fieldChunks.length; i++) {
              const chunk2 = state.fieldChunks[i];
              buf.set(chunk2, offset);
              offset += chunk2.length;
            }
            onField(state.info, buf);
          }
          state.fieldSize = 0;
          state.fieldChunks = [];
        }
      }
      state.partSize = 0;
      state.state = State2.headers;
      state.index = index;
      state.headerSkip = 2;
      if (chunk[0] === 45 && chunk[1] === 45) {
        state.done = true;
        return onDone();
      }
      state.parts++;
      if (state.parts > maxParts) {
        onError4(errMaxParts);
      }
    }
    if ((state.partSize += chunk.length) > maxPartSize) {
      onError4(errMaxPartSize);
    }
    if (state.state === State2.headers) {
      const result3 = headerParser(chunk, state.headerSkip);
      state.headerSkip = 0;
      if (result3._tag === "Continue") {
        return;
      } else if (result3._tag === "Failure") {
        skipBody();
        return onError4({
          _tag: "BadHeaders",
          error: result3
        });
      }
      const contentType = parse(result3.headers["content-type"]);
      const contentDisposition = parse(result3.headers["content-disposition"], true);
      if (contentDisposition.value === "form-data" && !("name" in contentDisposition.parameters)) {
        skipBody();
        return onError4(errInvalidDisposition);
      }
      let encodedFilename;
      if ("filename*" in contentDisposition.parameters) {
        const parts = contentDisposition.parameters["filename*"].split("''");
        if (parts.length === 2) {
          try {
            encodedFilename = decodeURIComponent(parts[1]);
          } catch {
            encodedFilename = parts[1];
          }
        }
      }
      state.info = {
        name: contentDisposition.parameters.name ?? "",
        filename: encodedFilename ?? contentDisposition.parameters.filename,
        contentType: contentType.value === "" ? contentDisposition.parameters.filename !== void 0 ? "application/octet-stream" : "text/plain" : contentType.value,
        contentTypeParameters: contentType.parameters,
        contentDisposition: contentDisposition.value,
        contentDispositionParameters: contentDisposition.parameters,
        headers: result3.headers
      };
      state.state = State2.body;
      state.isFile = isFile(state.info);
      if (state.isFile) {
        state.onChunk = onPart(state.info);
      }
      if (result3.endPosition < chunk.length) {
        if (state.isFile) {
          state.onChunk(chunk.subarray(result3.endPosition));
        } else {
          const buf = chunk.subarray(result3.endPosition);
          if ((state.fieldSize += buf.length) > maxFieldSize) {
            onError4(errMaxFieldSize);
          }
          state.fieldChunks.push(buf);
        }
      }
    } else if (state.isFile) {
      state.onChunk(chunk);
    } else {
      if ((state.fieldSize += chunk.length) > maxFieldSize) {
        onError4(errMaxFieldSize);
      }
      state.fieldChunks.push(chunk);
    }
  }, constCR, 2);
  return {
    write(chunk) {
      if ((state.totalSize += chunk.length) > maxTotalSize) {
        return onError4(errMaxTotalSize);
      }
      return split.write(chunk);
    },
    end() {
      split.end();
      if (!state.done) {
        onError4(errEndNotReached);
      }
      state.state = State2.headers;
      state.index = 0;
      state.parts = 0;
      state.onChunk = noopOnChunk;
      state.info = void 0;
      state.totalSize = 0;
      state.partSize = 0;
      state.fieldChunks = [];
      state.fieldSize = 0;
      state.done = false;
    }
  };
}
__name(make21, "make21");
var utf8Decoder = /* @__PURE__ */ new TextDecoder("utf-8");
function getDecoder(charset) {
  if (charset === "utf-8" || charset === "utf8" || charset === "") {
    return utf8Decoder;
  }
  try {
    return new TextDecoder(charset);
  } catch (error) {
    return utf8Decoder;
  }
}
__name(getDecoder, "getDecoder");
function decodeField(info, value3) {
  return getDecoder(info.contentTypeParameters.charset ?? "utf-8").decode(value3);
}
__name(decodeField, "decodeField");
var make22 = make21;
var defaultIsFile2 = defaultIsFile;
var decodeField2 = decodeField;
var TypeId31 = "~effect/http/Multipart";
var MultipartErrorTypeId = "~effect/http/Multipart/MultipartError";
var MultipartErrorReason = class extends Error3 {
  static {
    __name(this, "MultipartErrorReason");
  }
};
var responseStatusByReason = {
  FileTooLarge: 413,
  FieldTooLarge: 413,
  BodyTooLarge: 413,
  TooManyParts: 413,
  InternalError: 500,
  Parse: 400
};
var MultipartError = class _MultipartError extends (/* @__PURE__ */ TaggedError2("MultipartError")) {
  static {
    __name(this, "MultipartError");
  }
  static fromReason(reason, cause) {
    return new _MultipartError({
      reason: new MultipartErrorReason({
        _tag: reason,
        cause
      })
    });
  }
  [MultipartErrorTypeId] = MultipartErrorTypeId;
  [ignore3] = true;
  [symbol4]() {
    return succeed6(empty9({
      status: responseStatusByReason[this.reason._tag]
    }));
  }
  get message() {
    return this.reason._tag;
  }
};
var makeConfig = /* @__PURE__ */ __name((headers) => withFiber2((fiber2) => {
  const mimeTypes = get(fiber2.context, FieldMimeTypes);
  return succeed6({
    headers,
    maxParts: fiber2.getRef(MaxParts),
    maxFieldSize: Number(fiber2.getRef(MaxFieldSize)),
    maxPartSize: map8(fiber2.getRef(MaxFileSize), Number),
    maxTotalSize: map8(fiber2.getRef(MaxBodySize), Number),
    isFile: mimeTypes.length === 0 ? void 0 : (info) => !mimeTypes.some((_) => info.contentType.includes(_)) && defaultIsFile2(info)
  });
}), "makeConfig");
var makeChannel = /* @__PURE__ */ __name((headers) => fromTransform((upstream) => map7(makeConfig(headers), (config) => {
  let partsBuffer = [];
  let exit3 = none2();
  const parser = make22({
    ...config,
    onField(info, value3) {
      partsBuffer.push(new FieldImpl(info.name, info.contentType, decodeField2(info, value3)));
    },
    onFile(info) {
      let chunks = [];
      let finished = false;
      const pullChunks = fromPull(succeed6(suspend2(/* @__PURE__ */ __name(function loop() {
        if (!isReadonlyArrayNonEmpty(chunks)) {
          return finished ? done3() : flatMap3(pump, loop);
        }
        const chunk = chunks;
        chunks = [];
        return succeed6(chunk);
      }, "loop"))));
      partsBuffer.push(new FileImpl(info, pullChunks));
      return function(chunk) {
        if (chunk === null) {
          finished = true;
        } else {
          chunks.push(chunk);
        }
      };
    },
    onError(error_) {
      exit3 = some2(fail4(convertError(error_)));
    },
    onDone() {
      if (isNone2(exit3)) {
        exit3 = some2(fail4(Done2()));
      }
    }
  });
  const pump = upstream.pipe(flatMap3((chunk) => {
    for (let i = 0; i < chunk.length; i++) {
      parser.write(chunk[i]);
    }
    return void_3;
  }), catchCause2((cause) => {
    if (isDoneCause(cause)) {
      parser.end();
    } else {
      exit3 = some2(failCause2(cause));
    }
    return void_3;
  }));
  return pump.pipe(flatMap3(/* @__PURE__ */ __name(function loop() {
    if (!isReadonlyArrayNonEmpty(partsBuffer)) {
      if (isSome2(exit3)) {
        return exit3.value;
      }
      return flatMap3(pump, loop);
    }
    const parts = partsBuffer;
    partsBuffer = [];
    return succeed6(parts);
  }, "loop")));
})), "makeChannel");
function convertError(cause) {
  switch (cause._tag) {
    case "ReachedLimit": {
      switch (cause.limit) {
        case "MaxParts": {
          return MultipartError.fromReason("TooManyParts", cause);
        }
        case "MaxFieldSize": {
          return MultipartError.fromReason("FieldTooLarge", cause);
        }
        case "MaxPartSize": {
          return MultipartError.fromReason("FileTooLarge", cause);
        }
        case "MaxTotalSize": {
          return MultipartError.fromReason("BodyTooLarge", cause);
        }
      }
    }
    default: {
      return MultipartError.fromReason("Parse", cause);
    }
  }
}
__name(convertError, "convertError");
var PartBase = class extends Class2 {
  static {
    __name(this, "PartBase");
  }
  [TypeId31];
  constructor() {
    super();
    this[TypeId31] = TypeId31;
  }
};
var FieldImpl = class extends PartBase {
  static {
    __name(this, "FieldImpl");
  }
  _tag = "Field";
  key;
  contentType;
  value;
  constructor(key, contentType, value3) {
    super();
    this.key = key;
    this.contentType = contentType;
    this.value = value3;
  }
  toJSON() {
    return {
      _id: "@effect/platform/Multipart/Part",
      _tag: "Field",
      key: this.key,
      contentType: this.contentType,
      value: this.value
    };
  }
};
var FileImpl = class extends PartBase {
  static {
    __name(this, "FileImpl");
  }
  _tag = "File";
  key;
  name;
  contentType;
  content;
  contentEffect;
  constructor(info, channel) {
    super();
    this.key = info.name;
    this.name = info.filename ?? info.name;
    this.contentType = info.contentType;
    this.content = fromChannel2(channel);
    this.contentEffect = channel.pipe(collectUint8Array, mapError3((cause) => MultipartError.fromReason("InternalError", cause)));
  }
  toJSON() {
    return {
      _id: "@effect/platform/Multipart/Part",
      _tag: "File",
      key: this.key,
      name: this.name,
      contentType: this.contentType
    };
  }
};
var defaultWriteFile = /* @__PURE__ */ __name((path, file) => flatMap3(FileSystem, (fs) => mapError3(run2(file.content, fs.sink(path)), (cause) => MultipartError.fromReason("InternalError", cause))), "defaultWriteFile");
var collectUint8Array = /* @__PURE__ */ __name((self) => runFold(self, constant(new Uint8Array(0)), (accumulator, chunk) => {
  const totalLength = chunk.reduce((sum, element) => sum + element.length, accumulator.length);
  const newAccumulator = new Uint8Array(totalLength);
  newAccumulator.set(accumulator, 0);
  let offset = accumulator.length;
  for (const element of chunk) {
    newAccumulator.set(element, offset);
    offset += element.length;
  }
  return newAccumulator;
}), "collectUint8Array");
var toPersisted = /* @__PURE__ */ __name((stream3, writeFile = defaultWriteFile) => gen2(function* () {
  const fs = yield* FileSystem;
  const path_ = yield* Path;
  const dir = yield* fs.makeTempDirectoryScoped();
  const persisted = /* @__PURE__ */ Object.create(null);
  const usedPaths = /* @__PURE__ */ new Set();
  let fileIndex = 0;
  yield* runForEach2(stream3, (part) => {
    if (part._tag === "Field") {
      if (!(part.key in persisted)) {
        persisted[part.key] = part.value;
      } else if (typeof persisted[part.key] === "string") {
        persisted[part.key] = [persisted[part.key], part.value];
      } else {
        persisted[part.key].push(part.value);
      }
      return void_3;
    } else if (part.name === "") {
      return void_3;
    }
    const file = part;
    const fileName = path_.basename(file.name).slice(-128);
    let path = path_.join(dir, fileName);
    while (usedPaths.has(path)) {
      path = path_.join(dir, `${fileIndex++}-${fileName}`);
    }
    usedPaths.add(path);
    const filePart = new PersistedFileImpl(file.key, file.name, file.contentType, path);
    if (Array.isArray(persisted[part.key])) {
      persisted[part.key].push(filePart);
    } else {
      persisted[part.key] = [filePart];
    }
    return writeFile(path, file);
  });
  return persisted;
}).pipe(catchTag2("PlatformError", (cause) => fail5(MultipartError.fromReason("InternalError", cause)))), "toPersisted");
var PersistedFileImpl = class extends PartBase {
  static {
    __name(this, "PersistedFileImpl");
  }
  _tag = "PersistedFile";
  key;
  name;
  contentType;
  path;
  constructor(key, name, contentType, path) {
    super();
    this.key = key;
    this.name = name;
    this.contentType = contentType;
    this.path = path;
  }
  toJSON() {
    return {
      _id: "@effect/platform/Multipart/Part",
      _tag: "PersistedFile",
      key: this.key,
      name: this.name,
      contentType: this.contentType,
      path: this.path
    };
  }
};
var limitsServices = /* @__PURE__ */ __name((options) => {
  const map11 = /* @__PURE__ */ new Map();
  if (options.maxParts !== void 0) {
    map11.set(MaxParts.key, options.maxParts);
  }
  if (options.maxFieldSize !== void 0) {
    map11.set(MaxFieldSize.key, Size(options.maxFieldSize));
  }
  if (options.maxFileSize !== void 0) {
    map11.set(MaxFileSize.key, map8(options.maxFileSize, Size));
  }
  if (options.maxTotalSize !== void 0) {
    map11.set(MaxBodySize.key, map8(options.maxTotalSize, Size));
  }
  if (options.fieldMimeTypes !== void 0) {
    map11.set(FieldMimeTypes.key, options.fieldMimeTypes);
  }
  return makeUnsafe(map11);
}, "limitsServices");
var MaxParts = /* @__PURE__ */ Reference("effect/http/Multipart/MaxParts", {
  defaultValue: /* @__PURE__ */ __name(() => {
    return;
  }, "defaultValue")
});
var MaxFieldSize = /* @__PURE__ */ Reference("effect/http/Multipart/MaxFieldSize", {
  defaultValue: /* @__PURE__ */ constant(/* @__PURE__ */ Size(10 * 1024 * 1024))
});
var MaxFileSize = /* @__PURE__ */ Reference("effect/http/Multipart/MaxFileSize", {
  defaultValue: /* @__PURE__ */ __name(() => {
    return;
  }, "defaultValue")
});
var FieldMimeTypes = /* @__PURE__ */ Reference("effect/http/Multipart/FieldMimeTypes", {
  defaultValue: /* @__PURE__ */ constant(["application/json"])
});
var TypeId32 = "~effect/http/HttpServerRequest";
var HttpServerRequest = /* @__PURE__ */ Service("effect/http/HttpServerRequest");
var ParsedSearchParams = class extends (/* @__PURE__ */ Service()("effect/http/ParsedSearchParams")) {
  static {
    __name(this, "ParsedSearchParams");
  }
};
var schemaCookies = /* @__PURE__ */ __name((schema, options) => {
  const parse22 = decodeUnknownEffect2(schema);
  return flatMap3(HttpServerRequest, (req) => parse22(req.cookies, options));
}, "schemaCookies");
var schemaHeaders = /* @__PURE__ */ __name((schema, options) => {
  const parse22 = decodeUnknownEffect2(schema);
  return flatMap3(HttpServerRequest, (req) => parse22(req.headers, options));
}, "schemaHeaders");
var schemaSearchParams = /* @__PURE__ */ __name((schema, options) => {
  const parse22 = decodeUnknownEffect2(schema);
  return flatMap3(ParsedSearchParams, (params) => parse22(params, options));
}, "schemaSearchParams");
var fromWeb = /* @__PURE__ */ __name((request) => new ServerRequestImpl(request, removeHost(request.url)), "fromWeb");
var removeHost = /* @__PURE__ */ __name((url) => {
  if (url[0] === "/") {
    return url;
  }
  const index = url.indexOf("/", url.indexOf("//") + 2);
  return index === -1 ? "/" : url.slice(index);
}, "removeHost");
var ServerRequestImpl = class _ServerRequestImpl extends Class2 {
  static {
    __name(this, "ServerRequestImpl");
  }
  [TypeId32];
  [TypeId27];
  source;
  url;
  headersOverride;
  remoteAddressOverride;
  constructor(source, url, headersOverride, remoteAddressOverride) {
    super();
    this[TypeId32] = TypeId32;
    this[TypeId27] = TypeId27;
    this.source = source;
    this.url = url;
    this.headersOverride = headersOverride;
    this.remoteAddressOverride = remoteAddressOverride;
  }
  toJSON() {
    return inspect(this, {
      _id: "HttpServerRequest",
      method: this.method,
      url: this.originalUrl
    });
  }
  modify(options) {
    return new _ServerRequestImpl(this.source, options.url ?? this.url, options.headers ?? this.headersOverride, "remoteAddress" in options ? options.remoteAddress : this.remoteAddressOverride);
  }
  get method() {
    return this.source.method.toUpperCase();
  }
  get originalUrl() {
    return this.source.url;
  }
  get remoteAddress() {
    return this.remoteAddressOverride ?? none2();
  }
  get headers() {
    this.headersOverride ??= fromInput2(this.source.headers);
    return this.headersOverride;
  }
  cachedCookies;
  get cookies() {
    if (this.cachedCookies) {
      return this.cachedCookies;
    }
    return this.cachedCookies = parseHeader(this.headers.cookie ?? "");
  }
  get stream() {
    return this.source.body ? fromReadableStream2({
      evaluate: /* @__PURE__ */ __name(() => this.source.body, "evaluate"),
      onError: /* @__PURE__ */ __name((cause) => new HttpServerError({
        reason: new RequestParseError({
          request: this,
          cause
        })
      }), "onError")
    }) : fail8(new HttpServerError({
      reason: new RequestParseError({
        request: this,
        description: "can not create stream from empty body"
      })
    }));
  }
  textEffect;
  get text() {
    if (this.textEffect) {
      return this.textEffect;
    }
    this.textEffect = runSync2(cached2(tryPromise2({
      try: /* @__PURE__ */ __name(() => this.source.text(), "try"),
      catch: /* @__PURE__ */ __name((cause) => new HttpServerError({
        reason: new RequestParseError({
          request: this,
          cause
        })
      }), "catch")
    })));
    return this.textEffect;
  }
  get json() {
    return flatMap3(this.text, (text3) => try_2({
      try: /* @__PURE__ */ __name(() => JSON.parse(text3), "try"),
      catch: /* @__PURE__ */ __name((cause) => new HttpServerError({
        reason: new RequestParseError({
          request: this,
          cause
        })
      }), "catch")
    }));
  }
  get urlParamsBody() {
    return flatMap3(this.text, (_) => try_2({
      try: /* @__PURE__ */ __name(() => fromInput(new URLSearchParams(_)), "try"),
      catch: /* @__PURE__ */ __name((cause) => new HttpServerError({
        reason: new RequestParseError({
          request: this,
          cause
        })
      }), "catch")
    }));
  }
  multipartEffect;
  get multipart() {
    if (this.multipartEffect) {
      return this.multipartEffect;
    }
    this.multipartEffect = runSync2(cached2(toPersisted(this.multipartStream)));
    return this.multipartEffect;
  }
  get multipartStream() {
    return pipeThroughChannel(mapError5(this.stream, (cause) => MultipartError.fromReason("InternalError", cause)), makeChannel(this.headers));
  }
  arrayBufferEffect;
  get arrayBuffer() {
    if (this.arrayBufferEffect) {
      return this.arrayBufferEffect;
    }
    this.arrayBufferEffect = runSync2(cached2(tryPromise2({
      try: /* @__PURE__ */ __name(() => this.source.arrayBuffer(), "try"),
      catch: /* @__PURE__ */ __name((cause) => new HttpServerError({
        reason: new RequestParseError({
          request: this,
          cause
        })
      }), "catch")
    })));
    return this.arrayBufferEffect;
  }
  get upgrade() {
    return fail5(new HttpServerError({
      reason: new RequestParseError({
        request: this,
        description: "Not an upgradeable ServerRequest"
      })
    }));
  }
};
var toURL = /* @__PURE__ */ __name((self) => {
  const host = self.headers.host ?? "localhost";
  const protocol = self.headers["x-forwarded-proto"] === "https" ? "https" : "http";
  try {
    return some2(new URL(self.url, `${protocol}://${host}`));
  } catch {
    return none2();
  }
}, "toURL");
var fromHeaders = /* @__PURE__ */ __name((headers) => {
  let span = w3c(headers);
  if (isSome2(span)) {
    return span;
  }
  span = b3(headers);
  if (isSome2(span)) {
    return span;
  }
  return xb3(headers);
}, "fromHeaders");
var b3 = /* @__PURE__ */ __name((headers) => {
  if (!("b3" in headers)) {
    return none2();
  }
  const parts = headers["b3"].split("-");
  if (parts.length < 2) {
    return none2();
  }
  return some2(externalSpan({
    traceId: parts[0],
    spanId: parts[1],
    sampled: parts[2] ? parts[2] === "1" : true
  }));
}, "b3");
var xb3 = /* @__PURE__ */ __name((headers) => {
  if (!headers["x-b3-traceid"] || !headers["x-b3-spanid"]) {
    return none2();
  }
  return some2(externalSpan({
    traceId: headers["x-b3-traceid"],
    spanId: headers["x-b3-spanid"],
    sampled: headers["x-b3-sampled"] ? headers["x-b3-sampled"] === "1" : true
  }));
}, "xb3");
var w3cTraceId = /^[0-9a-f]{32}$/i;
var w3cSpanId = /^[0-9a-f]{16}$/i;
var w3c = /* @__PURE__ */ __name((headers) => {
  if (!headers["traceparent"]) {
    return none2();
  }
  const parts = headers["traceparent"].split("-");
  if (parts.length !== 4) {
    return none2();
  }
  const [version, traceId, spanId, flags] = parts;
  switch (version) {
    case "00": {
      if (w3cTraceId.test(traceId) === false || w3cSpanId.test(spanId) === false) {
        return none2();
      }
      return some2(externalSpan({
        traceId,
        spanId,
        sampled: (parseInt(flags, 16) & 1) === 1
      }));
    }
    default: {
      return none2();
    }
  }
}, "w3c");
var requestPreResponseHandlers = /* @__PURE__ */ new WeakMap();
var make23 = /* @__PURE__ */ __name((middleware2) => middleware2, "make23");
var loggerDisabledRequests = /* @__PURE__ */ new WeakSet();
var stripSearchAndHash = /* @__PURE__ */ __name((url) => {
  const queryIndex = url.indexOf("?");
  const hashIndex = url.indexOf("#");
  if (queryIndex === -1) {
    return hashIndex === -1 ? url : url.slice(0, hashIndex);
  }
  if (hashIndex === -1) {
    return url.slice(0, queryIndex);
  }
  return url.slice(0, Math.min(queryIndex, hashIndex));
}, "stripSearchAndHash");
var withLoggerDisabled = /* @__PURE__ */ __name((self) => withFiber2((fiber2) => {
  const request = getUnsafe(fiber2.context, HttpServerRequest);
  loggerDisabledRequests.add(request.source);
  return self;
}), "withLoggerDisabled");
var TracerDisabledWhen = /* @__PURE__ */ Reference("effect/http/HttpMiddleware/TracerDisabledWhen", {
  defaultValue: /* @__PURE__ */ __name(() => constFalse, "defaultValue")
});
var SpanNameGenerator = /* @__PURE__ */ Reference("@effect/platform/HttpMiddleware/SpanNameGenerator", {
  defaultValue: /* @__PURE__ */ __name(() => (request) => `http.server ${request.method}`, "defaultValue")
});
var logger = /* @__PURE__ */ make23((httpApp) => withFiber2((fiber2) => {
  const request = getUnsafe(fiber2.context, HttpServerRequest);
  const path = stripSearchAndHash(request.url);
  return withLogSpan(flatMap3(exit2(httpApp), (exit3) => {
    if (loggerDisabledRequests.has(request.source)) {
      return exit3;
    } else if (exit3._tag === "Failure") {
      const [response, cause] = causeResponseStripped(exit3.cause);
      return andThen2(annotateLogs(log(getOrElse(cause, () => "Sent HTTP Response")), {
        "http.method": request.method,
        "http.url": path,
        "http.status": response.status
      }), exit3);
    }
    return andThen2(annotateLogs(log("Sent HTTP response"), {
      "http.method": request.method,
      "http.url": path,
      "http.status": exit3.value.status
    }), exit3);
  }), "http.span");
}));
var tracer2 = /* @__PURE__ */ make23((httpApp) => withFiber2((fiber2) => {
  const request = getUnsafe(fiber2.context, HttpServerRequest);
  const disabled = !fiber2.getRef(TracerEnabled2) || fiber2.getRef(TracerDisabledWhen)(request);
  if (disabled) {
    return httpApp;
  }
  const nameGenerator = fiber2.getRef(SpanNameGenerator);
  const span = makeSpanUnsafe(fiber2, nameGenerator(request), {
    parent: getOrUndefined(fromHeaders(request.headers)),
    kind: "server"
  });
  const prevServices = fiber2.context;
  fiber2.setContext(add(fiber2.context, ParentSpan, span));
  return onExitPrimitive2(httpApp, (exit3) => {
    fiber2.setContext(prevServices);
    const endTime = fiber2.getRef(Clock).currentTimeNanosUnsafe();
    fiber2.currentDispatcher.scheduleTask(() => {
      let response;
      let spanExit = exit3;
      if (isFailure3(exit3)) {
        const [failureResponse, cause] = causeResponseStripped(exit3.cause);
        response = failureResponse;
        spanExit = isSome2(cause) ? failCause2(cause.value) : succeed5(response);
      } else {
        response = exit3.value;
      }
      if (span.sampled) {
        const url = toURL(request);
        if (isSome2(url) && (url.value.username !== "" || url.value.password !== "")) {
          url.value.username = "REDACTED";
          url.value.password = "REDACTED";
        }
        const redactedHeaderNames = fiber2.getRef(CurrentRedactedNames);
        const requestHeaders = redact2(request.headers, redactedHeaderNames);
        span.attribute("http.request.method", request.method);
        if (isSome2(url)) {
          span.attribute("url.full", url.value.toString());
          span.attribute("url.path", url.value.pathname);
          const query = url.value.search.slice(1);
          if (query !== "") {
            span.attribute("url.query", url.value.search.slice(1));
          }
          span.attribute("url.scheme", url.value.protocol.slice(0, -1));
        }
        if (request.headers["user-agent"] !== void 0) {
          span.attribute("user_agent.original", request.headers["user-agent"]);
        }
        for (const name in requestHeaders) {
          span.attribute(`http.request.header.${name}`, String(requestHeaders[name]));
        }
        if (isSome2(request.remoteAddress)) {
          span.attribute("client.address", request.remoteAddress.value);
        }
        span.attribute("http.response.status_code", response.status);
        const responseHeaders = redact2(response.headers, redactedHeaderNames);
        for (const name in responseHeaders) {
          span.attribute(`http.response.header.${name}`, String(responseHeaders[name]));
        }
      }
      span.end(endTime, spanExit);
    }, 0);
    return;
  }, true);
}));
var toHandled = /* @__PURE__ */ __name((self, handleResponse, middleware2) => {
  const handleCause = /* @__PURE__ */ __name((cause) => flatMapEager2(causeResponse(cause), ([response, cause2]) => {
    const fiber2 = getCurrent();
    reportCauseUnsafe(fiber2, cause2);
    const request = getUnsafe(fiber2.context, HttpServerRequest);
    const handler2 = requestPreResponseHandlers.get(request.source);
    const cont = cause2.reasons.length === 0 ? succeed6(response) : failCause3(cause2);
    if (handler2 === void 0) {
      request[handledSymbol] = true;
      return flatMapEager2(handleResponse(request, response), () => cont);
    }
    return flatMapEager2(flatMapEager2(handler2(request, response), (response2) => {
      request[handledSymbol] = true;
      return handleResponse(request, response2);
    }), () => cont);
  }), "handleCause");
  const responded = matchCauseEffect2(self, {
    onSuccess: /* @__PURE__ */ __name((response) => {
      const fiber2 = getCurrent();
      const request = getUnsafe(fiber2.context, HttpServerRequest);
      const handler2 = requestPreResponseHandlers.get(request.source);
      if (handler2 === void 0) {
        request[handledSymbol] = true;
        return mapEager2(handleResponse(request, response), () => response);
      }
      return flatMapEager2(handler2(request, response), (sentResponse) => {
        request[handledSymbol] = true;
        return mapEager2(handleResponse(request, sentResponse), () => response);
      });
    }, "onSuccess"),
    onFailure: handleCause
  });
  const withMiddleware = middleware2 === void 0 ? tracer2(responded) : matchCauseEffect2(tracer2(middleware2(responded)), {
    onFailure(cause) {
      const fiber2 = getCurrent();
      reportCauseUnsafe(fiber2, cause);
      const request = getUnsafe(fiber2.context, HttpServerRequest);
      if (handledSymbol in request)
        return void_3;
      return matchCauseEffectEager2(causeResponse(cause), {
        onFailure(_) {
          return handleResponse(request, empty9({
            status: 500
          }));
        },
        onSuccess([response]) {
          return handleResponse(request, response);
        }
      });
    },
    onSuccess(response) {
      const fiber2 = getCurrent();
      const request = getUnsafe(fiber2.context, HttpServerRequest);
      return handledSymbol in request ? void_3 : handleResponse(request, response);
    }
  });
  return uninterruptible2(scoped4(withMiddleware));
}, "toHandled");
var handledSymbol = /* @__PURE__ */ Symbol.for("effect/http/HttpEffect/handled");
var scopeDisableClose = /* @__PURE__ */ __name((scope3) => {
  scope3[scopeEjected] = true;
}, "scopeDisableClose");
var scopeTransferToStream = /* @__PURE__ */ __name((response) => {
  if (response.body._tag !== "Stream") {
    return response;
  }
  const fiber2 = getCurrent();
  const scope3 = getUnsafe(fiber2.context, Scope);
  scopeDisableClose(scope3);
  return setBody(response, stream(onExit4(response.body.stream, (exit3) => close(scope3, exit3)), response.body.contentType, response.body.contentLength));
}, "scopeTransferToStream");
var scopeEjected = /* @__PURE__ */ Symbol.for("effect/http/HttpEffect/scopeEjected");
var scoped4 = /* @__PURE__ */ __name((effect2) => withFiber2((fiber2) => {
  const scope3 = makeUnsafe3();
  const prevServices = fiber2.context;
  fiber2.setContext(add(fiber2.context, Scope, scope3));
  return onExitPrimitive2(effect2, (exit3) => {
    fiber2.setContext(prevServices);
    if (scopeEjected in scope3)
      return;
    return closeUnsafe(scope3, exit3);
  }, true);
}), "scoped4");
var toWebHandlerWith = /* @__PURE__ */ __name((context3) => (self, middleware2) => {
  const resolveSymbol = /* @__PURE__ */ Symbol.for("@effect/platform/HttpApp/resolve");
  const httpApp = toHandled(self, (request, response) => {
    response = scopeTransferToStream(response);
    request[resolveSymbol](toWeb(response, {
      withoutBody: request.method === "HEAD",
      context: context3
    }));
    return void_3;
  }, middleware2);
  return (request, reqContext) => new Promise((resolve4) => {
    const contextMap = new Map(context3.mapUnsafe);
    if (isContext(reqContext)) {
      for (const [key, value3] of reqContext.mapUnsafe) {
        contextMap.set(key, value3);
      }
    }
    const httpServerRequest = fromWeb(request);
    contextMap.set(HttpServerRequest.key, httpServerRequest);
    httpServerRequest[resolveSymbol] = resolve4;
    const fiber2 = runForkWith2(makeUnsafe(contextMap))(httpApp);
    request.signal?.addEventListener("abort", () => {
      fiber2.interruptUnsafe(void 0, ClientAbort.annotation);
    }, {
      once: true
    });
  });
}, "toWebHandlerWith");
var toWebHandlerLayerWith = /* @__PURE__ */ __name((layer42, options) => {
  const scope3 = makeUnsafe3();
  const dispose = /* @__PURE__ */ __name(() => runPromise2(close(scope3, void_2)), "dispose");
  let handlerCache;
  let handlerPromise;
  function handler2(request, context3) {
    if (handlerCache) {
      return handlerCache(request, context3);
    }
    handlerPromise ??= runPromise2(gen2(function* () {
      const context4 = yield* options.memoMap ? buildWithMemoMap(layer42, options.memoMap, scope3) : buildWithScope(layer42, scope3);
      return handlerCache = toWebHandlerWith(context4)(yield* options.toHandler(context4), options.middleware);
    }));
    return handlerPromise.then((f) => f(request, context3));
  }
  __name(handler2, "handler");
  return {
    dispose,
    handler: handler2
  };
}, "toWebHandlerLayerWith");
var plusRegex = /\+/g;
var Empty3 = /* @__PURE__ */ __name(function() {
}, "Empty3");
Empty3.prototype = /* @__PURE__ */ Object.create(null);
function parse2(input) {
  const result3 = new Empty3();
  if (typeof input !== "string") {
    return result3;
  }
  const inputLength = input.length;
  let key = "";
  let value3 = "";
  let startingIndex = -1;
  let equalityIndex = -1;
  let shouldDecodeKey = false;
  let shouldDecodeValue = false;
  let keyHasPlus = false;
  let valueHasPlus = false;
  let hasBothKeyValuePair = false;
  let c = 0;
  for (let i = 0; i < inputLength + 1; i++) {
    c = i !== inputLength ? input.charCodeAt(i) : 38;
    if (c === 38) {
      hasBothKeyValuePair = equalityIndex > startingIndex;
      if (!hasBothKeyValuePair) {
        equalityIndex = i;
      }
      key = input.slice(startingIndex + 1, equalityIndex);
      if (hasBothKeyValuePair || key.length > 0) {
        if (keyHasPlus) {
          key = key.replace(plusRegex, " ");
        }
        if (shouldDecodeKey) {
          try {
            key = decodeURIComponent(key) || key;
          } catch {
          }
        }
        if (hasBothKeyValuePair) {
          value3 = input.slice(equalityIndex + 1, i);
          if (valueHasPlus) {
            value3 = value3.replace(plusRegex, " ");
          }
          if (shouldDecodeValue) {
            try {
              value3 = decodeURIComponent(value3) || value3;
            } catch {
            }
          }
        }
        const currentValue = result3[key];
        if (currentValue === void 0) {
          result3[key] = value3;
        } else {
          if (currentValue.pop) {
            currentValue.push(value3);
          } else {
            result3[key] = [currentValue, value3];
          }
        }
      }
      value3 = "";
      startingIndex = i;
      equalityIndex = i;
      shouldDecodeKey = false;
      shouldDecodeValue = false;
      keyHasPlus = false;
      valueHasPlus = false;
    } else if (c === 61) {
      if (equalityIndex <= startingIndex) {
        equalityIndex = i;
      } else {
        shouldDecodeValue = true;
      }
    } else if (c === 43) {
      if (equalityIndex > startingIndex) {
        valueHasPlus = true;
      } else {
        keyHasPlus = true;
      }
    } else if (c === 37) {
      if (equalityIndex > startingIndex) {
        shouldDecodeValue = true;
      } else {
        shouldDecodeKey = true;
      }
    }
  }
  return result3;
}
__name(parse2, "parse2");
var FULL_PATH_REGEXP = /^https?:\/\/.*?\//;
var OPTIONAL_PARAM_REGEXP = /(\/:[^/()]*?)\?(\/?)/;
var make24 = /* @__PURE__ */ __name((options = {}) => new RouterImpl(options), "make24");
var RouterImpl = class {
  static {
    __name(this, "RouterImpl");
  }
  constructor(options = {}) {
    this.options = {
      ignoreTrailingSlash: true,
      ignoreDuplicateSlashes: true,
      caseSensitive: false,
      maxParamLength: 100,
      ...options
    };
  }
  options;
  routes = [];
  trees = /* @__PURE__ */ Object.create(null);
  on(method, path, handler2) {
    const optionalParamMatch = path.match(OPTIONAL_PARAM_REGEXP);
    if (optionalParamMatch && optionalParamMatch.index !== void 0) {
      assert(path.length === optionalParamMatch.index + optionalParamMatch[0].length, "Optional Parameter needs to be the last parameter of the path");
      const pathFull = path.replace(OPTIONAL_PARAM_REGEXP, "$1$2");
      const pathOptional = path.replace(OPTIONAL_PARAM_REGEXP, "$2") || "/";
      this.on(method, pathFull, handler2);
      this.on(method, pathOptional, handler2);
      return;
    }
    if (this.options.ignoreDuplicateSlashes) {
      path = removeDuplicateSlashes(path);
    }
    if (this.options.ignoreTrailingSlash) {
      path = trimLastSlash(path);
    }
    const methods = typeof method === "string" ? [method] : method;
    for (const method2 of methods) {
      this._on(method2, path, handler2);
    }
  }
  all(path, handler2) {
    this.on(httpMethods, path, handler2);
  }
  _on(method, path, handler2) {
    if (this.trees[method] === void 0) {
      this.trees[method] = new StaticNode("/");
    }
    let pattern = path;
    if (pattern === "*" && this.trees[method].prefix.length !== 0) {
      const currentRoot = this.trees[method];
      this.trees[method] = new StaticNode("");
      this.trees[method].staticChildren["/"] = currentRoot;
    }
    let parentNodePathIndex = this.trees[method].prefix.length;
    let currentNode = this.trees[method];
    const params = [];
    for (let i = 0; i <= pattern.length; i++) {
      if (pattern.charCodeAt(i) === 58 && pattern.charCodeAt(i + 1) === 58) {
        i++;
        continue;
      }
      const isParametricNode = pattern.charCodeAt(i) === 58 && pattern.charCodeAt(i + 1) !== 58;
      const isWildcardNode = pattern.charCodeAt(i) === 42;
      if (isParametricNode || isWildcardNode || i === pattern.length && i !== parentNodePathIndex) {
        let staticNodePath = pattern.slice(parentNodePathIndex, i);
        if (!this.options.caseSensitive) {
          staticNodePath = staticNodePath.toLowerCase();
        }
        staticNodePath = staticNodePath.split("::").join(":");
        staticNodePath = staticNodePath.split("%").join("%25");
        currentNode = currentNode.createStaticChild(staticNodePath);
      }
      if (isParametricNode) {
        let isRegexNode = false;
        let isParamSafe = true;
        let backtrack = "";
        const regexps = [];
        let nodePatternParts = "";
        let lastParamStartIndex = i + 1;
        for (let j = lastParamStartIndex; ; j++) {
          const charCode = pattern.charCodeAt(j);
          const isRegexParam = charCode === 40;
          const isStaticPart = charCode === 45 || charCode === 46;
          const isEndOfNode = charCode === 47 || j === pattern.length;
          if (isRegexParam || isStaticPart || isEndOfNode) {
            const paramName = pattern.slice(lastParamStartIndex, j);
            params.push(paramName);
            isRegexNode = isRegexNode || isRegexParam || isStaticPart;
            if (isRegexParam) {
              const endOfRegexIndex = getClosingParenthensePosition(pattern, j);
              const regexString = pattern.slice(j, endOfRegexIndex + 1);
              regexps.push(trimRegExpStartAndEnd(regexString));
              j = endOfRegexIndex + 1;
              isParamSafe = true;
            } else {
              regexps.push(isParamSafe ? "(.*?)" : `(${backtrack}|(?:(?!${backtrack}).)*)`);
              isParamSafe = false;
            }
            const staticPartStartIndex = j;
            for (; j < pattern.length; j++) {
              const charCode2 = pattern.charCodeAt(j);
              if (charCode2 === 47)
                break;
              if (charCode2 === 58) {
                const nextCharCode = pattern.charCodeAt(j + 1);
                if (nextCharCode === 58)
                  j++;
                else
                  break;
              }
            }
            let staticPart = pattern.slice(staticPartStartIndex, j);
            if (staticPart) {
              staticPart = staticPart.split("::").join(":");
              staticPart = staticPart.split("%").join("%25");
              regexps.push(backtrack = escapeRegExp(staticPart));
            }
            lastParamStartIndex = j + 1;
            nodePatternParts += "()" + staticPart;
            if (isEndOfNode || pattern.charCodeAt(j) === 47 || j === pattern.length) {
              const nodePattern = isRegexNode ? nodePatternParts : staticPart;
              const nodePath = pattern.slice(i, j);
              pattern = pattern.slice(0, i + 1) + nodePattern + pattern.slice(j);
              i += nodePattern.length;
              const regex = isRegexNode ? new RegExp("^" + regexps.join("") + "$") : void 0;
              currentNode = currentNode.createParametricChild(regex, staticPart, nodePath);
              parentNodePathIndex = i + 1;
              break;
            }
          }
        }
      } else if (isWildcardNode) {
        params.push("*");
        currentNode = currentNode.createWildcardChild();
        parentNodePathIndex = i + 1;
        if (i !== pattern.length - 1) {
          throw new Error("Wildcard must be the last character in the route");
        }
      }
    }
    if (!this.options.caseSensitive) {
      pattern = pattern.toLowerCase();
    }
    if (pattern === "*") {
      pattern = "/*";
    }
    for (const existRoute of this.routes) {
      if (existRoute.method === method && existRoute.pattern === pattern) {
        throw new Error(`Method '${method}' already declared for route '${pattern}'`);
      }
    }
    const route2 = {
      method,
      path,
      pattern,
      params,
      handler: handler2
    };
    this.routes.push(route2);
    currentNode.addRoute(route2);
  }
  has(method, path) {
    const node = this.trees[method];
    if (node === void 0) {
      return false;
    }
    const staticNode = node.getStaticChild(path);
    if (staticNode === void 0) {
      return false;
    }
    return staticNode.isLeafNode;
  }
  find(method, path) {
    let currentNode = this.trees[method];
    if (currentNode === void 0)
      return;
    if (path.charCodeAt(0) !== 47) {
      path = path.replace(FULL_PATH_REGEXP, "/");
    }
    if (this.options.ignoreDuplicateSlashes) {
      path = removeDuplicateSlashes(path);
    }
    let sanitizedUrl;
    let querystring;
    let shouldDecodeParam;
    try {
      sanitizedUrl = safeDecodeURI(path);
      path = sanitizedUrl.path;
      querystring = sanitizedUrl.querystring;
      shouldDecodeParam = sanitizedUrl.shouldDecodeParam;
    } catch (error) {
      return;
    }
    if (this.options.ignoreTrailingSlash) {
      path = trimLastSlash(path);
    }
    const originPath = path;
    if (this.options.caseSensitive === false) {
      path = path.toLowerCase();
    }
    const maxParamLength = this.options.maxParamLength;
    let pathIndex = currentNode.prefix.length;
    const params = [];
    const pathLen = path.length;
    const brothersNodesStack = [];
    while (true) {
      if (pathIndex === pathLen && currentNode.isLeafNode) {
        const handle = currentNode.handlerStorage?.find();
        if (handle !== void 0) {
          return {
            handler: handle.handler,
            params: handle.createParams(params),
            searchParams: parse2(querystring)
          };
        }
      }
      let node = currentNode.getNextNode(path, pathIndex, brothersNodesStack, params.length);
      if (node === void 0) {
        if (brothersNodesStack.length === 0) {
          return;
        }
        const brotherNodeState = brothersNodesStack.pop();
        pathIndex = brotherNodeState.brotherPathIndex;
        params.splice(brotherNodeState.paramsCount);
        node = brotherNodeState.brotherNode;
      }
      currentNode = node;
      while (true) {
        if (currentNode._tag === "StaticNode") {
          pathIndex += currentNode.prefix.length;
          break;
        }
        if (currentNode._tag === "WildcardNode") {
          let param2 = originPath.slice(pathIndex);
          if (shouldDecodeParam) {
            param2 = safeDecodeURIComponent(param2);
          }
          params.push(param2);
          pathIndex = pathLen;
          break;
        }
        let paramEndIndex = originPath.indexOf("/", pathIndex);
        if (paramEndIndex === -1) {
          paramEndIndex = pathLen;
        }
        let param = originPath.slice(pathIndex, paramEndIndex);
        if (shouldDecodeParam) {
          param = safeDecodeURIComponent(param);
        }
        if (currentNode.regex !== void 0) {
          const matchedParameters = currentNode.regex.exec(param);
          if (matchedParameters === null) {
            if (brothersNodesStack.length === 0) {
              return;
            }
            const brotherNodeState = brothersNodesStack.pop();
            pathIndex = brotherNodeState.brotherPathIndex;
            params.splice(brotherNodeState.paramsCount);
            currentNode = brotherNodeState.brotherNode;
            continue;
          }
          let maxParamLengthExceeded = false;
          for (let i = 1; i < matchedParameters.length; i++) {
            const matchedParam = matchedParameters[i] ?? "";
            if (matchedParam.length > maxParamLength) {
              maxParamLengthExceeded = true;
              break;
            }
          }
          if (maxParamLengthExceeded) {
            if (brothersNodesStack.length === 0) {
              return;
            }
            const brotherNodeState = brothersNodesStack.pop();
            pathIndex = brotherNodeState.brotherPathIndex;
            params.splice(brotherNodeState.paramsCount);
            currentNode = brotherNodeState.brotherNode;
            continue;
          }
          for (let i = 1; i < matchedParameters.length; i++) {
            params.push(matchedParameters[i] ?? "");
          }
        } else {
          if (param.length > maxParamLength) {
            if (brothersNodesStack.length === 0) {
              return;
            }
            const brotherNodeState = brothersNodesStack.pop();
            pathIndex = brotherNodeState.brotherPathIndex;
            params.splice(brotherNodeState.paramsCount);
            currentNode = brotherNodeState.brotherNode;
            continue;
          }
          params.push(param);
        }
        pathIndex = paramEndIndex;
        break;
      }
    }
  }
};
var HandlerStorage = class {
  static {
    __name(this, "HandlerStorage");
  }
  handlers = [];
  unconstrainedHandler;
  find() {
    return this.unconstrainedHandler;
  }
  add(route2) {
    const handler2 = {
      params: route2.params,
      handler: route2.handler,
      createParams: compileCreateParams(route2.params)
    };
    this.handlers.push(handler2);
    this.unconstrainedHandler = this.handlers[0];
  }
};
var NodeBase = class {
  static {
    __name(this, "NodeBase");
  }
  isLeafNode = false;
  routes;
  handlerStorage;
  addRoute(route2) {
    if (this.routes === void 0) {
      this.routes = [route2];
    } else {
      this.routes.push(route2);
    }
    if (this.handlerStorage === void 0) {
      this.handlerStorage = new HandlerStorage();
    }
    this.isLeafNode = true;
    this.handlerStorage.add(route2);
  }
};
var ParentNode = class extends NodeBase {
  static {
    __name(this, "ParentNode");
  }
  staticChildren = /* @__PURE__ */ Object.create(null);
  findStaticMatchingChild(path, pathIndex) {
    const staticChild = this.staticChildren[path.charAt(pathIndex)];
    if (staticChild === void 0 || !staticChild.matchPrefix(path, pathIndex)) {
      return;
    }
    return staticChild;
  }
  getStaticChild(path, pathIndex = 0) {
    if (path.length === pathIndex) {
      return this;
    }
    const staticChild = this.findStaticMatchingChild(path, pathIndex);
    if (staticChild === void 0) {
      return;
    }
    return staticChild.getStaticChild(path, pathIndex + staticChild.prefix.length);
  }
  createStaticChild(path) {
    if (path.length === 0) {
      return this;
    }
    let staticChild = this.staticChildren[path.charAt(0)];
    if (staticChild) {
      let i = 1;
      for (; i < staticChild.prefix.length; i++) {
        if (path.charCodeAt(i) !== staticChild.prefix.charCodeAt(i)) {
          staticChild = staticChild.split(this, i);
          break;
        }
      }
      return staticChild.createStaticChild(path.slice(i));
    }
    const label = path.charAt(0);
    this.staticChildren[label] = new StaticNode(path);
    return this.staticChildren[label];
  }
};
var StaticNode = class _StaticNode extends ParentNode {
  static {
    __name(this, "StaticNode");
  }
  _tag = "StaticNode";
  constructor(prefix) {
    super();
    this.setPrefix(prefix);
  }
  prefix;
  matchPrefix;
  parametricChildren = [];
  wildcardChild;
  setPrefix(prefix) {
    this.prefix = prefix;
    if (prefix.length === 1) {
      this.matchPrefix = (_path, _pathIndex) => true;
    } else {
      const len = prefix.length;
      this.matchPrefix = function(path, pathIndex) {
        for (let i = 1; i < len; i++) {
          if (path.charCodeAt(pathIndex + i) !== this.prefix.charCodeAt(i)) {
            return false;
          }
        }
        return true;
      };
    }
  }
  getParametricChild(regex) {
    if (regex === void 0) {
      return this.parametricChildren.find((child) => child.isRegex === false);
    }
    const source = regex.source;
    return this.parametricChildren.find((child) => {
      if (child.regex === void 0) {
        return false;
      }
      return child.regex.source === source;
    });
  }
  createParametricChild(regex, staticSuffix, nodePath) {
    let child = this.getParametricChild(regex);
    if (child !== void 0) {
      child.nodePaths.add(nodePath);
      return child;
    }
    child = new ParametricNode(regex, staticSuffix, nodePath);
    this.parametricChildren.push(child);
    this.parametricChildren.sort((child1, child2) => {
      if (!child1.isRegex)
        return 1;
      if (!child2.isRegex)
        return -1;
      if (child1.staticSuffix === void 0)
        return 1;
      if (child2.staticSuffix === void 0)
        return -1;
      if (child2.staticSuffix.endsWith(child1.staticSuffix))
        return 1;
      if (child1.staticSuffix.endsWith(child2.staticSuffix))
        return -1;
      return 0;
    });
    return child;
  }
  createWildcardChild() {
    if (this.wildcardChild === void 0) {
      this.wildcardChild = new WildcardNode();
    }
    return this.wildcardChild;
  }
  split(parentNode, length) {
    const parentPrefix = this.prefix.slice(0, length);
    const childPrefix = this.prefix.slice(length);
    this.setPrefix(childPrefix);
    const staticNode = new _StaticNode(parentPrefix);
    staticNode.staticChildren[childPrefix.charAt(0)] = this;
    parentNode.staticChildren[parentPrefix.charAt(0)] = staticNode;
    return staticNode;
  }
  getNextNode(path, pathIndex, nodeStack, paramsCount) {
    let node = this.findStaticMatchingChild(path, pathIndex);
    let parametricBrotherNodeIndex = 0;
    if (node === void 0) {
      if (this.parametricChildren.length === 0) {
        return this.wildcardChild;
      }
      node = this.parametricChildren[0];
      parametricBrotherNodeIndex = 1;
    }
    if (this.wildcardChild !== void 0) {
      nodeStack.push({
        paramsCount,
        brotherPathIndex: pathIndex,
        brotherNode: this.wildcardChild
      });
    }
    for (let i = this.parametricChildren.length - 1; i >= parametricBrotherNodeIndex; i--) {
      nodeStack.push({
        paramsCount,
        brotherPathIndex: pathIndex,
        brotherNode: this.parametricChildren[i]
      });
    }
    return node;
  }
};
var ParametricNode = class extends ParentNode {
  static {
    __name(this, "ParametricNode");
  }
  _tag = "ParametricNode";
  regex;
  staticSuffix;
  constructor(regex, staticSuffix, nodePath) {
    super();
    this.regex = regex;
    this.staticSuffix = staticSuffix;
    this.isRegex = !!regex;
    this.nodePaths = /* @__PURE__ */ new Set([nodePath]);
  }
  isRegex;
  nodePaths;
  getNextNode(path, pathIndex) {
    return this.findStaticMatchingChild(path, pathIndex);
  }
};
var WildcardNode = class extends NodeBase {
  static {
    __name(this, "WildcardNode");
  }
  _tag = "WildcardNode";
  getNextNode(_path, _pathIndex, _nodeStack, _paramsCount) {
    return;
  }
};
var assert = /* @__PURE__ */ __name((condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
}, "assert");
function removeDuplicateSlashes(path) {
  return path.replace(/\/\/+/g, "/");
}
__name(removeDuplicateSlashes, "removeDuplicateSlashes");
function trimLastSlash(path) {
  if (path.length > 1 && path.charCodeAt(path.length - 1) === 47) {
    return path.slice(0, -1);
  }
  return path;
}
__name(trimLastSlash, "trimLastSlash");
function compileCreateParams(params) {
  const len = params.length;
  return function(paramsArray) {
    const paramsObject = /* @__PURE__ */ Object.create(null);
    for (let i = 0; i < len; i++) {
      paramsObject[params[i]] = paramsArray[i];
    }
    return paramsObject;
  };
}
__name(compileCreateParams, "compileCreateParams");
function getClosingParenthensePosition(path, idx) {
  let parentheses = 1;
  while (idx < path.length) {
    idx++;
    if (path[idx] === "\\") {
      idx++;
      continue;
    }
    if (path[idx] === ")") {
      parentheses--;
    } else if (path[idx] === "(") {
      parentheses++;
    }
    if (!parentheses)
      return idx;
  }
  throw new TypeError('Invalid regexp expression in "' + path + '"');
}
__name(getClosingParenthensePosition, "getClosingParenthensePosition");
function trimRegExpStartAndEnd(regexString) {
  if (regexString.charCodeAt(1) === 94) {
    regexString = regexString.slice(0, 1) + regexString.slice(2);
  }
  if (regexString.charCodeAt(regexString.length - 2) === 36) {
    regexString = regexString.slice(0, regexString.length - 2) + regexString.slice(regexString.length - 1);
  }
  return regexString;
}
__name(trimRegExpStartAndEnd, "trimRegExpStartAndEnd");
function escapeRegExp(string3) {
  return string3.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
__name(escapeRegExp, "escapeRegExp");
function decodeComponentChar(highCharCode, lowCharCode) {
  if (highCharCode === 50) {
    if (lowCharCode === 53)
      return "%";
    if (lowCharCode === 51)
      return "#";
    if (lowCharCode === 52)
      return "$";
    if (lowCharCode === 54)
      return "&";
    if (lowCharCode === 66)
      return "+";
    if (lowCharCode === 98)
      return "+";
    if (lowCharCode === 67)
      return ",";
    if (lowCharCode === 99)
      return ",";
    if (lowCharCode === 70)
      return "/";
    if (lowCharCode === 102)
      return "/";
    return;
  }
  if (highCharCode === 51) {
    if (lowCharCode === 65)
      return ":";
    if (lowCharCode === 97)
      return ":";
    if (lowCharCode === 66)
      return ";";
    if (lowCharCode === 98)
      return ";";
    if (lowCharCode === 68)
      return "=";
    if (lowCharCode === 100)
      return "=";
    if (lowCharCode === 70)
      return "?";
    if (lowCharCode === 102)
      return "?";
    return;
  }
  if (highCharCode === 52 && lowCharCode === 48) {
    return "@";
  }
  return;
}
__name(decodeComponentChar, "decodeComponentChar");
function safeDecodeURI(path) {
  let shouldDecode = false;
  let shouldDecodeParam = false;
  let querystring = "";
  for (let i = 1; i < path.length; i++) {
    const charCode = path.charCodeAt(i);
    if (charCode === 37) {
      const highCharCode = path.charCodeAt(i + 1);
      const lowCharCode = path.charCodeAt(i + 2);
      if (decodeComponentChar(highCharCode, lowCharCode) === void 0) {
        shouldDecode = true;
      } else {
        shouldDecodeParam = true;
        if (highCharCode === 50 && lowCharCode === 53) {
          shouldDecode = true;
          path = path.slice(0, i + 1) + "25" + path.slice(i + 1);
          i += 2;
        }
        i += 2;
      }
    } else if (charCode === 63 || charCode === 59 || charCode === 35) {
      querystring = path.slice(i + 1);
      path = path.slice(0, i);
      break;
    }
  }
  const decodedPath = shouldDecode ? decodeURI(path) : path;
  return {
    path: decodedPath,
    querystring,
    shouldDecodeParam
  };
}
__name(safeDecodeURI, "safeDecodeURI");
function safeDecodeURIComponent(uriComponent) {
  const startIndex = uriComponent.indexOf("%");
  if (startIndex === -1)
    return uriComponent;
  let decoded = "";
  let lastIndex = startIndex;
  for (let i = startIndex; i < uriComponent.length; i++) {
    if (uriComponent.charCodeAt(i) === 37) {
      if (i + 2 >= uriComponent.length)
        break;
      const highCharCode = uriComponent.charCodeAt(i + 1);
      const lowCharCode = uriComponent.charCodeAt(i + 2);
      const decodedChar = decodeComponentChar(highCharCode, lowCharCode);
      decoded += uriComponent.slice(lastIndex, i) + decodedChar;
      lastIndex = i + 3;
    }
  }
  return uriComponent.slice(0, startIndex) + decoded + uriComponent.slice(lastIndex);
}
__name(safeDecodeURIComponent, "safeDecodeURIComponent");
var httpMethods = ["ACL", "BIND", "CHECKOUT", "CONNECT", "COPY", "DELETE", "GET", "HEAD", "LINK", "LOCK", "M-SEARCH", "MERGE", "MKACTIVITY", "MKCALENDAR", "MKCOL", "MOVE", "NOTIFY", "OPTIONS", "PATCH", "POST", "PROPFIND", "PROPPATCH", "PURGE", "PUT", "QUERY", "REBIND", "REPORT", "SEARCH", "SOURCE", "SUBSCRIBE", "TRACE", "UNBIND", "UNLINK", "UNLOCK", "UNSUBSCRIBE"];
var make25 = make24;
var TypeId33 = "~effect/http/HttpRouter";
var HttpRouter = /* @__PURE__ */ Service("effect/http/HttpRouter");
var make26 = /* @__PURE__ */ gen2(function* () {
  const router = make25(yield* RouterConfig);
  const middleware2 = /* @__PURE__ */ new Set();
  const addAll = /* @__PURE__ */ __name((routes) => contextWith2((context3) => {
    const middleware22 = getMiddleware(context3);
    const applyMiddleware2 = /* @__PURE__ */ __name((effect2) => {
      for (let i = 0; i < middleware22.length; i++) {
        effect2 = middleware22[i](effect2);
      }
      return effect2;
    }, "applyMiddleware");
    for (let i = 0; i < routes.length; i++) {
      const route2 = middleware22.length === 0 ? routes[i] : makeRoute({
        ...routes[i],
        handler: applyMiddleware2(routes[i].handler)
      });
      if (route2.method === "*") {
        if (route2.path.endsWith("/*")) {
          router.all(route2.path, route2);
          router.all(route2.path.slice(0, -2), route2);
        } else {
          router.all(route2.path, route2);
        }
      } else {
        if (route2.path.endsWith("/*")) {
          router.on(route2.method, route2.path, route2);
          router.on(route2.method, route2.path.slice(0, -2), route2);
        } else {
          router.on(route2.method, route2.path, route2);
        }
      }
    }
    return void_3;
  }), "addAll");
  return HttpRouter.of({
    [TypeId33]: TypeId33,
    prefixed(prefix) {
      return HttpRouter.of({
        ...this,
        prefixed: /* @__PURE__ */ __name((newPrefix) => this.prefixed(prefixPath(prefix, newPrefix)), "prefixed"),
        addAll: /* @__PURE__ */ __name((routes) => addAll(routes.map(prefixRoute(prefix))), "addAll"),
        add: /* @__PURE__ */ __name((method, path, handler2, options) => addAll([makeRoute({
          method,
          path: prefixPath(path, prefix),
          handler: isHttpServerResponse(handler2) ? succeed6(handler2) : isEffect2(handler2) ? handler2 : flatMap3(HttpServerRequest, handler2),
          uninterruptible: options?.uninterruptible ?? false,
          prefix
        })]), "add")
      });
    },
    addAll,
    add: /* @__PURE__ */ __name((method, path, handler2, options) => addAll([route(method, path, handler2, options)]), "add"),
    addGlobalMiddleware: /* @__PURE__ */ __name((middleware_) => sync2(() => {
      middleware2.add(middleware_);
    }), "addGlobalMiddleware"),
    asHttpEffect() {
      let handler2 = withFiber2((fiber2) => {
        let context3 = fiber2.context;
        const request = getUnsafe(context3, HttpServerRequest);
        let result3 = router.find(request.method, request.url);
        if (result3 === void 0 && request.method === "HEAD") {
          result3 = router.find("GET", request.url);
        }
        if (result3 === void 0) {
          return fail5(new HttpServerError({
            reason: new RouteNotFound({
              request
            })
          }));
        }
        const route2 = result3.handler;
        if (isSome2(route2.prefix)) {
          context3 = add(context3, HttpServerRequest, sliceRequestUrl(request, route2.prefix.value));
        }
        context3 = add(context3, ParsedSearchParams, result3.searchParams);
        context3 = add(context3, RouteContext, {
          route: route2,
          params: result3.params
        });
        const span = getOrUndefined2(context3, ParentSpan);
        if (span && span._tag === "Span") {
          span.attribute("http.route", route2.path);
        }
        return updateContext2(route2.uninterruptible ? route2.handler : interruptible2(route2.handler), () => context3);
      });
      if (middleware2.size === 0)
        return handler2;
      for (const fn2 of reverse(middleware2)) {
        handler2 = fn2(handler2);
      }
      return handler2;
    }
  });
});
function sliceRequestUrl(request, prefix) {
  const prefexLen = prefix.length;
  return request.modify({
    url: request.url.length <= prefexLen ? "/" : request.url.slice(prefexLen)
  });
}
__name(sliceRequestUrl, "sliceRequestUrl");
var RouterConfig = /* @__PURE__ */ Reference("effect/http/HttpRouter/RouterConfig", {
  defaultValue: /* @__PURE__ */ __name(() => ({}), "defaultValue")
});
var RouteContext = class extends (/* @__PURE__ */ Service()("effect/http/HttpRouter/RouteContext")) {
  static {
    __name(this, "RouteContext");
  }
};
var use = /* @__PURE__ */ __name((f) => effectDiscard(flatMap3(HttpRouter, f)), "use");
var add3 = /* @__PURE__ */ __name((method, path, handler2, options) => use((router) => router.add(method, path, handler2, options)), "add3");
var layer4 = /* @__PURE__ */ effect(HttpRouter)(make26);
var RouteTypeId = "~effect/http/HttpRouter/Route";
var makeRoute = /* @__PURE__ */ __name((options) => ({
  ...options,
  uninterruptible: options.uninterruptible ?? false,
  prefix: typeof options.prefix === "string" ? some2(options.prefix) : options.prefix ?? none2(),
  [RouteTypeId]: RouteTypeId
}), "makeRoute");
var route = /* @__PURE__ */ __name((method, path, handler2, options) => makeRoute({
  ...options,
  method,
  path,
  handler: isHttpServerResponse(handler2) ? succeed6(handler2) : isEffect2(handler2) ? handler2 : flatMap3(HttpServerRequest, handler2),
  uninterruptible: options?.uninterruptible ?? false
}), "route");
var removeTrailingSlash = /* @__PURE__ */ __name((path) => path.endsWith("/") ? path.slice(0, -1) : path, "removeTrailingSlash");
var prefixPath = /* @__PURE__ */ dual(2, (self, prefix) => {
  prefix = removeTrailingSlash(prefix);
  if (self === "*")
    return `${prefix}/*`;
  else if (self === "/")
    return prefix;
  return prefix + self;
});
var prefixRoute = /* @__PURE__ */ dual(2, (self, prefix) => makeRoute({
  ...self,
  path: prefixPath(self.path, prefix),
  prefix: match(self.prefix, {
    onNone: /* @__PURE__ */ __name(() => prefix, "onNone"),
    onSome: /* @__PURE__ */ __name((existingPrefix) => prefixPath(existingPrefix, prefix), "onSome")
  })
}));
var MiddlewareTypeId = "~effect/http/HttpRouter/Middleware";
var middleware = /* @__PURE__ */ __name(function() {
  if (arguments.length === 0) {
    return makeMiddleware;
  }
  return makeMiddleware(arguments[0], arguments[1]);
}, "middleware");
var makeMiddleware = /* @__PURE__ */ __name((middleware2, options) => options?.global ? effectDiscard(gen2(function* () {
  const router = yield* HttpRouter;
  const fn2 = isEffect2(middleware2) ? yield* middleware2 : middleware2;
  yield* router.addGlobalMiddleware(fn2);
})) : new MiddlewareImpl(isEffect2(middleware2) ? effectContext(map7(middleware2, (fn2) => makeUnsafe(/* @__PURE__ */ new Map([[fnContextKey, fn2]])))) : succeedContext(makeUnsafe(/* @__PURE__ */ new Map([[fnContextKey, middleware2]])))), "makeMiddleware");
var middlewareId = 0;
var fnContextKey = "effect/http/HttpRouter/MiddlewareFn";
var MiddlewareImpl = class _MiddlewareImpl {
  static {
    __name(this, "MiddlewareImpl");
  }
  [MiddlewareTypeId] = {};
  layerFn;
  dependencies;
  constructor(layerFn, dependencies) {
    this.layerFn = layerFn;
    this.dependencies = dependencies;
    const contextKey = `effect/http/HttpRouter/Middleware-${++middlewareId}`;
    this.layer = effectContext(gen2({
      self: this
    }, function* () {
      const context3 = yield* context2();
      const stack = [context3.mapUnsafe.get(fnContextKey)];
      if (this.dependencies) {
        const memoMap = yield* CurrentMemoMap;
        const scope3 = get(context3, Scope);
        const depsContext = yield* buildWithMemoMap(this.dependencies, memoMap, scope3);
        stack.push(...getMiddleware(depsContext));
      }
      return makeUnsafe(/* @__PURE__ */ new Map([[contextKey, stack]]));
    })).pipe(provide2(this.layerFn));
  }
  layer;
  combine(other) {
    return new _MiddlewareImpl(this.layerFn, this.dependencies ? provideMerge(this.dependencies, other.layer) : other.layer);
  }
};
var middlewareCache = /* @__PURE__ */ new WeakMap();
var getMiddleware = /* @__PURE__ */ __name((context3) => {
  let arr = middlewareCache.get(context3);
  if (arr)
    return arr;
  const topLevel = empty2();
  let maxLength = 0;
  for (const [key, value3] of context3.mapUnsafe) {
    if (key.startsWith("effect/http/HttpRouter/Middleware-")) {
      topLevel.push(value3);
      if (value3.length > maxLength) {
        maxLength = value3.length;
      }
    }
  }
  if (topLevel.length === 0) {
    arr = [];
  } else {
    const middleware2 = /* @__PURE__ */ new Set();
    for (let i = maxLength - 1; i >= 0; i--) {
      for (const arr2 of topLevel) {
        if (i < arr2.length) {
          middleware2.add(arr2[i]);
        }
      }
    }
    arr = fromIterable(middleware2).reverse();
  }
  middlewareCache.set(context3, arr);
  return arr;
}, "getMiddleware");
var disableLogger = middleware(withLoggerDisabled).layer;
var provideRequest = /* @__PURE__ */ __name((layer52) => (self) => provide2(self, middleware()(gen2(function* () {
  const services2 = yield* build(layer52);
  return (effect2) => provideContext2(effect2, services2);
})).layer), "provideRequest");
var toWebHandler = /* @__PURE__ */ __name((appLayer2, options) => {
  let middleware2 = options?.middleware;
  if (options?.disableLogger !== true) {
    middleware2 = middleware2 ? compose(middleware2, logger) : logger;
  }
  const RouterLayer = options?.routerConfig ? provide2(layer4, succeed4(RouterConfig)(options.routerConfig)) : layer4;
  return toWebHandlerLayerWith(provideMerge(appLayer2, RouterLayer), {
    toHandler: /* @__PURE__ */ __name((s) => succeed6(get(s, HttpRouter).asHttpEffect()), "toHandler"),
    middleware: middleware2,
    memoMap: options?.memoMap
  });
}, "toWebHandler");
var statusCodeByLiteral = {
  Continue: 100,
  SwitchingProtocols: 101,
  Processing: 102,
  EarlyHints: 103,
  OK: 200,
  Ok: 200,
  Created: 201,
  Accepted: 202,
  NonAuthoritativeInformation: 203,
  NoContent: 204,
  ResetContent: 205,
  PartialContent: 206,
  MultiStatus: 207,
  AlreadyReported: 208,
  ImUsed: 226,
  MultipleChoices: 300,
  MovedPermanently: 301,
  Found: 302,
  SeeOther: 303,
  NotModified: 304,
  TemporaryRedirect: 307,
  PermanentRedirect: 308,
  BadRequest: 400,
  Unauthorized: 401,
  PaymentRequired: 402,
  Forbidden: 403,
  NotFound: 404,
  MethodNotAllowed: 405,
  NotAcceptable: 406,
  ProxyAuthenticationRequired: 407,
  RequestTimeout: 408,
  Conflict: 409,
  Gone: 410,
  LengthRequired: 411,
  PreconditionFailed: 412,
  PayloadTooLarge: 413,
  UriTooLong: 414,
  UnsupportedMediaType: 415,
  RangeNotSatisfiable: 416,
  ExpectationFailed: 417,
  ImATeapot: 418,
  MisdirectedRequest: 421,
  UnprocessableEntity: 422,
  Locked: 423,
  FailedDependency: 424,
  TooEarly: 425,
  UpgradeRequired: 426,
  PreconditionRequired: 428,
  TooManyRequests: 429,
  RequestHeaderFieldsTooLarge: 431,
  UnavailableForLegalReasons: 451,
  InternalServerError: 500,
  NotImplemented: 501,
  BadGateway: 502,
  ServiceUnavailable: 503,
  GatewayTimeout: 504,
  HttpVersionNotSupported: 505,
  VariantAlsoNegotiates: 506,
  InsufficientStorage: 507,
  LoopDetected: 508,
  NotExtended: 510,
  NetworkAuthenticationRequired: 511
};
var StreamSchemaTypeId = "~effect/httpapi/HttpApiSchema/Stream";
function status(code) {
  const statusCode = typeof code === "string" ? statusCodeByLiteral[code] : code;
  return (self) => self.annotate({
    httpApiStatus: statusCode
  });
}
__name(status, "status");
var Empty4 = /* @__PURE__ */ __name((code) => Void2.pipe(status(code)), "Empty4");
var NoContent = /* @__PURE__ */ Empty4(204);
var isStreamSchema = /* @__PURE__ */ __name((u) => isSchema(u) && hasProperty(u, StreamSchemaTypeId), "isStreamSchema");
var isStreamSse = /* @__PURE__ */ __name((u) => isStreamSchema(u) && u._tag === "StreamSse", "isStreamSse");
var isStreamUint8Array = /* @__PURE__ */ __name((u) => isStreamSchema(u) && u._tag === "StreamUint8Array", "isStreamUint8Array");
var WithHeadersTypeId = "~effect/httpapi/HttpApiSchema/WithHeaders";
var WithHeadersValueTypeId = "~effect/httpapi/HttpApiSchema/WithHeadersValue";
var isWithHeadersValue = /* @__PURE__ */ __name((u) => hasProperty(u, WithHeadersValueTypeId), "isWithHeadersValue");
var isWithHeaders = /* @__PURE__ */ __name((u) => isSchema(u) && hasProperty(u, WithHeadersTypeId), "isWithHeaders");
function rebuildWithHeaders(self, schema, headers) {
  return make12(self.ast, {
    [WithHeadersTypeId]: WithHeadersTypeId,
    schema,
    headers
  });
}
__name(rebuildWithHeaders, "rebuildWithHeaders");
function asNonMultipartEncoding(self, options) {
  return self.annotate({
    "~httpApiEncoding": {
      _tag: options._tag,
      contentType: options.contentType ?? defaultContentType2(options._tag)
    }
  });
}
__name(asNonMultipartEncoding, "asNonMultipartEncoding");
function defaultContentType2(_tag) {
  switch (_tag) {
    case "Multipart":
      return "multipart/form-data";
    case "Json":
      return "application/json";
    case "FormUrlEncoded":
      return "application/x-www-form-urlencoded";
    case "Uint8Array":
      return "application/octet-stream";
    case "Text":
      return "text/plain";
  }
}
__name(defaultContentType2, "defaultContentType2");
function asFormUrlEncoded(options) {
  return (self) => asNonMultipartEncoding(self, {
    _tag: "FormUrlEncoded",
    ...options
  });
}
__name(asFormUrlEncoded, "asFormUrlEncoded");
var isNoContent = /* @__PURE__ */ __name((ast) => {
  if (isVoid(ast))
    return true;
  const encoded = toEncoded(ast);
  if (isVoid(encoded))
    return true;
  const target = ast.encoding?.[0].to;
  if (target === void 0)
    return false;
  return isVoid(target);
}, "isNoContent");
var resolveHttpApiEncoding = /* @__PURE__ */ resolveAt2("~httpApiEncoding");
var getWithHeadersAnnotation = /* @__PURE__ */ resolveAt2("~httpApiWithHeaders");
var resolveHttpApiStatus = /* @__PURE__ */ resolveAt2("httpApiStatus");
var defaultJsonEncoding = {
  _tag: "Json",
  contentType: "application/json"
};
var defaultUrlEncodedEncoding = {
  _tag: "FormUrlEncoded",
  contentType: "application/x-www-form-urlencoded"
};
function getEncoding(ast) {
  return resolveHttpApiEncoding(ast) ?? defaultJsonEncoding;
}
__name(getEncoding, "getEncoding");
function getPayloadEncoding(ast, method) {
  const encoding = resolveHttpApiEncoding(ast);
  if (encoding)
    return encoding;
  return hasBody(method) ? defaultJsonEncoding : defaultUrlEncodedEncoding;
}
__name(getPayloadEncoding, "getPayloadEncoding");
function getResponseEncoding(ast) {
  const out = getEncoding(ast);
  if (out._tag === "Multipart") {
    throw new Error("Multipart is not supported in response");
  }
  return out;
}
__name(getResponseEncoding, "getResponseEncoding");
function getStatusSuccess(self) {
  return resolveHttpApiStatus(self) ?? 200;
}
__name(getStatusSuccess, "getStatusSuccess");
function getStatusSuccessSchema(schema) {
  if (isWithHeaders(schema)) {
    return resolveHttpApiStatus(schema.ast) ?? getStatusSuccess(schema.schema.ast);
  }
  return getStatusSuccess(schema.ast);
}
__name(getStatusSuccessSchema, "getStatusSuccessSchema");
function getResponseEncodingSchema(schema) {
  if (isWithHeaders(schema) && resolveHttpApiEncoding(schema.ast) === void 0) {
    return getResponseEncoding(schema.schema.ast);
  }
  return getResponseEncoding(schema.ast);
}
__name(getResponseEncodingSchema, "getResponseEncodingSchema");
function getStatusStream(self) {
  return getStatusSuccess(self.ast);
}
__name(getStatusStream, "getStatusStream");
function getStatusError(self) {
  return resolveHttpApiStatus(self) ?? 500;
}
__name(getStatusError, "getStatusError");
function getStatusErrorSchema(schema) {
  if (isWithHeaders(schema)) {
    return resolveHttpApiStatus(schema.ast) ?? getStatusError(schema.schema.ast);
  }
  return getStatusError(schema.ast);
}
__name(getStatusErrorSchema, "getStatusErrorSchema");
function normalize(contentType) {
  const normalized = contentType.toLowerCase().trim();
  const index = normalized.indexOf(";");
  return index === -1 ? normalized : normalized.slice(0, index).trim();
}
__name(normalize, "normalize");
var TypeId34 = "~effect/httpapi/HttpApiEndpoint";
function getPayloadSchemas(endpoint) {
  const result3 = [];
  for (const {
    schemas
  } of endpoint.payload.values()) {
    result3.push(...schemas);
  }
  return result3;
}
__name(getPayloadSchemas, "getPayloadSchemas");
function getSuccessSchemas(endpoint) {
  const schemas = Array.from(endpoint.success);
  return isArrayNonEmpty2(schemas) ? schemas : [NoContent];
}
__name(getSuccessSchemas, "getSuccessSchemas");
function getErrorSchemas(endpoint) {
  const schemas = new Set(endpoint.error);
  for (const middleware2 of endpoint.middlewares) {
    const key = middleware2;
    for (const schema of key.error) {
      schemas.add(schema);
    }
  }
  return Array.from(schemas);
}
__name(getErrorSchemas, "getErrorSchemas");
var Proto9 = {
  [TypeId34]: TypeId34,
  pipe() {
    return pipeArguments(this, arguments);
  },
  prefix(prefix) {
    return makeProto({
      ...optionsFromEndpoint(this),
      path: prefixPath(this.path, prefix)
    });
  },
  middleware(middleware2) {
    return makeProto({
      ...optionsFromEndpoint(this),
      middlewares: /* @__PURE__ */ new Set([...this.middlewares, middleware2])
    });
  },
  annotate(key, value3) {
    return makeProto({
      ...optionsFromEndpoint(this),
      annotations: add(this.annotations, key, value3)
    });
  },
  annotateMerge(annotations) {
    return makeProto({
      ...optionsFromEndpoint(this),
      annotations: merge(this.annotations, annotations)
    });
  }
};
var optionsFromEndpoint = /* @__PURE__ */ __name((endpoint) => ({
  identifier: endpoint.identifier,
  path: endpoint.path,
  method: endpoint.method,
  params: endpoint.params,
  query: endpoint.query,
  headers: endpoint.headers,
  payload: endpoint.payload,
  success: endpoint.success,
  error: endpoint.error,
  annotations: endpoint.annotations,
  middlewares: endpoint.middlewares
}), "optionsFromEndpoint");
function makeProto(options) {
  function HttpApiEndpoint() {
  }
  __name(HttpApiEndpoint, "HttpApiEndpoint");
  Object.setPrototypeOf(HttpApiEndpoint, Proto9);
  return Object.assign(HttpApiEndpoint, options);
}
__name(makeProto, "makeProto");
var make27 = /* @__PURE__ */ __name((method) => (identifier2, path, options) => {
  const disableCodecs = options?.disableCodecs ?? false;
  const transformStringTree = disableCodecs ? identity : toCodecStringTree;
  return makeProto({
    identifier: identifier2,
    path,
    method,
    params: ensureStruct(options?.params, transformStringTree),
    query: ensureStruct(options?.query, transformStringTree),
    headers: ensureStruct(options?.headers, transformStringTree),
    payload: getPayload(options?.payload, method, disableCodecs),
    success: getSuccessResponse(options?.success, method, disableCodecs),
    error: getErrorResponse(options?.error, disableCodecs),
    annotations: empty(),
    middlewares: /* @__PURE__ */ new Set()
  });
}, "make27");
function ensureStruct(params, transform3) {
  if (params === void 0)
    return;
  if (isSchema(params))
    return transform3(params);
  return transform3(Struct(params));
}
__name(ensureStruct, "ensureStruct");
function getPayload(payload, method, disableCodecs) {
  const result3 = /* @__PURE__ */ new Map();
  if (payload === void 0)
    return result3;
  const schemas = Array.isArray(payload) ? payload : isSchema(payload) ? [payload] : [Struct(payload).pipe(asFormUrlEncoded())];
  const transform3 = disableCodecs ? identity : transformPayload;
  for (const schema of schemas) {
    const encoding = getPayloadEncoding(schema.ast, method);
    const contentType = normalize(encoding.contentType);
    const existing = result3.get(contentType);
    if (existing) {
      if (existing.encoding._tag !== encoding._tag) {
        throw new Error(`Multiple payload encodings for content-type: ${encoding.contentType}`);
      }
      if (existing.encoding._tag === "Multipart") {
        throw new Error(`Multiple multipart payloads for content-type: ${encoding.contentType}`);
      }
      existing.schemas.push(transform3(schema, method));
    } else {
      result3.set(contentType, {
        encoding,
        schemas: [transform3(schema, method)]
      });
    }
  }
  return result3;
}
__name(getPayload, "getPayload");
var reservedStreamFailureEvent = "effect/httpapi/stream/failure";
function getSuccessResponse(success, method, disableCodecs) {
  if (success === void 0)
    return /* @__PURE__ */ new Set();
  const schemas = ensure(success);
  validateSuccessResponse(schemas, method);
  return new Set(disableCodecs ? schemas : schemas.map(transformResponseSchema));
}
__name(getSuccessResponse, "getSuccessResponse");
function transformResponseSchema(schema) {
  if (isStreamSchema(schema))
    return schema;
  if (isWithHeaders(schema)) {
    const inner = isStreamSchema(schema.schema) ? schema.schema : applyResponseEncoding(schema.schema, getResponseEncodingSchema(schema));
    return rebuildWithHeaders(schema, inner, toCodecStringTree(schema.headers));
  }
  return transformResponse(schema);
}
__name(transformResponseSchema, "transformResponseSchema");
function getErrorResponse(error, disableCodecs) {
  if (error === void 0)
    return /* @__PURE__ */ new Set();
  const schemas = ensure(error);
  for (const schema of schemas) {
    const body = isWithHeaders(schema) ? schema.schema : schema;
    if (isStreamSchema(body)) {
      throw new Error("Streaming schemas are not supported in error responses");
    }
  }
  validateResponseExclusivity(schemas, getStatusErrorSchema);
  return new Set(disableCodecs ? schemas : schemas.map(transformResponseSchema));
}
__name(getErrorResponse, "getErrorResponse");
function validateSuccessResponse(schemas, method) {
  let hasStream = false;
  const statuses = /* @__PURE__ */ new Map();
  for (const schema of schemas) {
    const inner = isWithHeaders(schema) ? schema.schema : schema;
    const status2 = getStatusSuccessSchema(schema);
    if (isStreamSchema(inner)) {
      validateStreamSuccess(inner, method);
      if (hasStream) {
        throw new Error("Multiple streaming success responses are not supported");
      }
      hasStream = true;
      const entry = getStatusEntry(statuses, status2);
      if (entry.noContent) {
        throw new Error(`Cannot combine no-content and streaming success responses for status: ${status2}`);
      }
      if (entry.bufferedContentTypes.has(normalize(inner.contentType))) {
        throw new Error(`Cannot combine buffered and streaming success responses for status ${status2} and content-type: ${inner.contentType}`);
      }
      statuses.set(status2, {
        ...entry,
        stream: inner
      });
    } else {
      const entry = getStatusEntry(statuses, status2);
      const noContent = isNoContent(inner.ast);
      if (entry.stream !== void 0) {
        if (noContent) {
          throw new Error(`Cannot combine no-content and streaming success responses for status: ${status2}`);
        }
        const encoding = getResponseEncodingSchema(schema);
        if (normalize(encoding.contentType) === normalize(entry.stream.contentType)) {
          throw new Error(`Cannot combine buffered and streaming success responses for status ${status2} and content-type: ${encoding.contentType}`);
        }
      }
      if (!noContent) {
        entry.bufferedContentTypes.add(normalize(getResponseEncodingSchema(schema).contentType));
      }
      entry.noContent = entry.noContent || noContent;
    }
  }
  validateResponseExclusivity(schemas, getStatusSuccessSchema);
}
__name(validateSuccessResponse, "validateSuccessResponse");
function getStatusEntry(statuses, status2) {
  let entry = statuses.get(status2);
  if (entry === void 0) {
    entry = {
      bufferedContentTypes: /* @__PURE__ */ new Set(),
      noContent: false
    };
    statuses.set(status2, entry);
  }
  return entry;
}
__name(getStatusEntry, "getStatusEntry");
function validateResponseExclusivity(schemas, getStatus) {
  const statuses = /* @__PURE__ */ new Map();
  for (const schema of schemas) {
    const status2 = getStatus(schema);
    const withHeadersAnnotation = getWithHeadersAnnotation(schema.ast);
    const body = isWithHeaders(schema) ? schema.schema : withHeadersAnnotation?.body ?? schema;
    const contentType = isNoContent(body.ast) ? "" : normalize(isStreamSchema(body) ? body.contentType : getResponseEncodingSchema(schema).contentType);
    let entry = statuses.get(status2);
    if (entry === void 0) {
      entry = {
        headerContentType: void 0,
        plainContentTypes: /* @__PURE__ */ new Set()
      };
      statuses.set(status2, entry);
    }
    const combineError = /* @__PURE__ */ __name(() => new Error(`Cannot combine a response with headers with another response for status ${status2} and content-type: ${contentType || "<no content>"}`), "combineError");
    if (isWithHeaders(schema) || withHeadersAnnotation !== void 0) {
      if (entry.headerContentType !== void 0) {
        throw new Error(`Cannot declare multiple responses with headers for status ${status2}`);
      }
      if (entry.plainContentTypes.has(contentType))
        throw combineError();
      entry.headerContentType = contentType;
    } else {
      if (entry.headerContentType === contentType)
        throw combineError();
      entry.plainContentTypes.add(contentType);
    }
  }
}
__name(validateResponseExclusivity, "validateResponseExclusivity");
function validateStreamSuccess(schema, method) {
  if (method === "HEAD") {
    throw new Error("HEAD endpoints cannot declare streaming success responses");
  }
  if (isStreamSse(schema) && hasReservedSseEventName(schema.events.ast)) {
    throw new Error(`SSE event name is reserved: ${reservedStreamFailureEvent}`);
  }
}
__name(validateStreamSuccess, "validateStreamSuccess");
function hasReservedSseEventName(ast) {
  return hasReservedEventName(toEncoded(ast), /* @__PURE__ */ new Set());
}
__name(hasReservedSseEventName, "hasReservedSseEventName");
function hasReservedEventName(ast, seen) {
  if (seen.has(ast))
    return false;
  seen.add(ast);
  if (isUnion(ast)) {
    return ast.types.some((type) => hasReservedEventName(type, seen));
  }
  if (isSuspend(ast)) {
    return hasReservedEventName(ast.thunk(), seen);
  }
  if (!isObjects(ast))
    return false;
  const event = ast.propertySignatures.find((ps) => ps.name === "event");
  return event !== void 0 && hasReservedEventLiteral(event.type, seen);
}
__name(hasReservedEventName, "hasReservedEventName");
function hasReservedEventLiteral(ast, seen) {
  if (seen.has(ast))
    return false;
  seen.add(ast);
  const encoded = toEncoded(ast);
  if (encoded !== ast) {
    return hasReservedEventLiteral(encoded, seen);
  }
  if (isLiteral(ast)) {
    return ast.literal === reservedStreamFailureEvent;
  }
  if (isUnion(ast)) {
    return ast.types.some((type) => hasReservedEventLiteral(type, seen));
  }
  if (isSuspend(ast)) {
    return hasReservedEventLiteral(ast.thunk(), seen);
  }
  return false;
}
__name(hasReservedEventLiteral, "hasReservedEventLiteral");
function transformResponse(schema) {
  const encoding = getResponseEncoding(schema.ast);
  const withHeaders = getWithHeadersAnnotation(schema.ast);
  if (withHeaders === void 0) {
    return applyResponseEncoding(schema, encoding);
  }
  const headers = toEncoded2(withHeaders.headers);
  return Struct({
    body: applyResponseEncoding(toEncoded2(withHeaders.body), encoding),
    headers
  }).pipe(decodeTo2(schema)).annotate({
    "~httpApiWithHeaders": {
      ...withHeaders,
      headersCodec: toCodecStringTree(headers)
    }
  });
}
__name(transformResponse, "transformResponse");
function applyResponseEncoding(schema, encoding) {
  switch (encoding._tag) {
    case "Json":
      return toCodecJson(schema);
    case "FormUrlEncoded":
      return toCodecStringTree(schema);
    case "Text":
    case "Uint8Array":
      return schema;
  }
}
__name(applyResponseEncoding, "applyResponseEncoding");
function transformPayload(schema, method) {
  const encoding = getPayloadEncoding(schema.ast, method);
  switch (encoding._tag) {
    case "Json":
      return toCodecJson(schema);
    case "FormUrlEncoded":
      return toCodecStringTree(schema);
    case "Text":
    case "Uint8Array":
    case "Multipart":
      return schema;
  }
}
__name(transformPayload, "transformPayload");
var get3 = /* @__PURE__ */ make27("GET");
var post = /* @__PURE__ */ make27("POST");
var put = /* @__PURE__ */ make27("PUT");
var badRequestResponse = /* @__PURE__ */ empty9({
  status: 400
});
var HttpApiSchemaErrorTypeId = "~effect/httpapi/HttpApiError/HttpApiSchemaError";
var HttpApiSchemaError = class _HttpApiSchemaError extends (/* @__PURE__ */ TaggedClass("HttpApiSchemaError")) {
  static {
    __name(this, "HttpApiSchemaError");
  }
  [HttpApiSchemaErrorTypeId] = HttpApiSchemaErrorTypeId;
  static is(u) {
    return hasProperty(u, HttpApiSchemaErrorTypeId);
  }
  static wrap(kind, effect2) {
    return mapError3(effect2, (error) => new _HttpApiSchemaError({
      kind,
      cause: error
    }));
  }
  name = "HttpApiSchemaError";
  message = this.kind;
  [symbol4]() {
    return succeed6(badRequestResponse);
  }
};
var TypeId35 = "~effect/httpapi/HttpApiMiddleware";
var SecurityTypeId = "~effect/httpapi/HttpApiMiddleware/Security";
var isSecurity = /* @__PURE__ */ __name((u) => hasProperty(u, SecurityTypeId), "isSecurity");
var Service2 = /* @__PURE__ */ __name(() => (id, options) => {
  const Err = globalThis.Error;
  const limit = getStackTraceLimit();
  setStackTraceLimit(2);
  const creationError = new Err();
  setStackTraceLimit(limit);
  class Service3 extends Service()(id) {
    static {
      __name(this, "Service3");
    }
  }
  const self = Service3;
  Object.defineProperty(Service3, "stack", {
    get() {
      return creationError.stack;
    }
  });
  self[TypeId35] = TypeId35;
  self.error = getError(options?.error);
  self.requiredForClient = options?.requiredForClient ?? false;
  if (options?.security !== void 0) {
    if (Object.keys(options.security).length === 0) {
      throw new Error("HttpApiMiddleware.Service: security object must not be empty");
    }
    self[SecurityTypeId] = SecurityTypeId;
    self.security = options.security;
  }
  return self;
}, "Service2");
function getError(error) {
  if (error === void 0)
    return /* @__PURE__ */ new Set();
  return new Set(Array.isArray(error) ? error : [error]);
}
__name(getError, "getError");
var TypeId36 = "~effect/httpapi/HttpApi";
var Proto10 = {
  [TypeId36]: TypeId36,
  pipe() {
    return pipeArguments(this, arguments);
  },
  add(...toAdd) {
    const groups = {
      ...this.groups
    };
    for (const group2 of toAdd) {
      assignProperty(groups, group2.identifier, group2);
    }
    return makeProto2({
      ...optionsFromApi(this),
      groups
    });
  },
  addHttpApi(api2) {
    const newGroups = {
      ...this.groups
    };
    for (const key of Object.keys(api2.groups)) {
      const group2 = api2.groups[key];
      assignProperty(newGroups, key, group2.annotateMerge(merge(api2.annotations, group2.annotations)));
    }
    return makeProto2({
      ...optionsFromApi(this),
      groups: newGroups
    });
  },
  prefix(prefix) {
    return makeProto2({
      ...optionsFromApi(this),
      groups: map3(this.groups, (group2) => group2.prefix(prefix))
    });
  },
  middleware(tag2) {
    return makeProto2({
      ...optionsFromApi(this),
      groups: map3(this.groups, (group2) => group2.middleware(tag2))
    });
  },
  annotate(key, value3) {
    return makeProto2({
      ...optionsFromApi(this),
      annotations: add(this.annotations, key, value3)
    });
  },
  annotateMerge(annotations) {
    return makeProto2({
      ...optionsFromApi(this),
      annotations: merge(this.annotations, annotations)
    });
  }
};
var optionsFromApi = /* @__PURE__ */ __name((api2) => ({
  identifier: api2.identifier,
  groups: api2.groups,
  annotations: api2.annotations
}), "optionsFromApi");
var makeProto2 = /* @__PURE__ */ __name((options) => {
  function HttpApi() {
  }
  __name(HttpApi, "HttpApi");
  Object.setPrototypeOf(HttpApi, Proto10);
  return Object.assign(HttpApi, options);
}, "makeProto2");
var make28 = /* @__PURE__ */ __name((identifier2) => makeProto2({
  identifier: identifier2,
  groups: {},
  annotations: empty()
}), "make28");
var reflect = /* @__PURE__ */ __name((self, options) => {
  const groups = Object.values(self.groups);
  for (const group2 of groups) {
    const groupAnnotations = merge(self.annotations, group2.annotations);
    options.onGroup({
      group: group2,
      mergedAnnotations: groupAnnotations
    });
    const endpoints = Object.values(group2.endpoints);
    for (const endpoint of endpoints) {
      if (options.predicate && !options.predicate({
        endpoint,
        group: group2
      }))
        continue;
      options.onEndpoint({
        group: group2,
        endpoint,
        middleware: endpoint.middlewares,
        mergedAnnotations: merge(groupAnnotations, endpoint.annotations),
        successes: extractResponseContent(getSuccessSchemas(endpoint), getStatusSuccessSchema),
        errors: extractResponseContent(getErrorSchemas(endpoint), getStatusErrorSchema)
      });
    }
  }
}, "reflect");
var extractResponseContent = /* @__PURE__ */ __name((schemas, getStatus) => {
  const map11 = /* @__PURE__ */ new Map();
  schemas.forEach(add4);
  return map11;
  function add4(schema) {
    const body = isWithHeaders(schema) ? schema.schema : schema;
    if (isStreamSchema(body))
      return;
    const status2 = getStatus(schema);
    const schemas2 = map11.get(status2);
    if (schemas2 === void 0) {
      map11.set(status2, [schema]);
    } else {
      schemas2.push(schema);
    }
  }
  __name(add4, "add4");
}, "extractResponseContent");
var AdditionalSchemas = class extends (/* @__PURE__ */ Service()("effect/httpapi/HttpApi/AdditionalSchemas")) {
  static {
    __name(this, "AdditionalSchemas");
  }
};
var Identifier = class extends (/* @__PURE__ */ Service()("effect/httpapi/OpenApi/Identifier")) {
  static {
    __name(this, "Identifier");
  }
};
var Title = class extends (/* @__PURE__ */ Service()("effect/httpapi/OpenApi/Title")) {
  static {
    __name(this, "Title");
  }
};
var Version = class extends (/* @__PURE__ */ Service()("effect/httpapi/OpenApi/Version")) {
  static {
    __name(this, "Version");
  }
};
var Description = class extends (/* @__PURE__ */ Service()("effect/httpapi/OpenApi/Description")) {
  static {
    __name(this, "Description");
  }
};
var License = class extends (/* @__PURE__ */ Service()("effect/httpapi/OpenApi/License")) {
  static {
    __name(this, "License");
  }
};
var ExternalDocs = class extends (/* @__PURE__ */ Service()("effect/httpapi/OpenApi/ExternalDocs")) {
  static {
    __name(this, "ExternalDocs");
  }
};
var Servers = class extends (/* @__PURE__ */ Service()("effect/httpapi/OpenApi/Servers")) {
  static {
    __name(this, "Servers");
  }
};
var Format = class extends (/* @__PURE__ */ Service()("effect/httpapi/OpenApi/Format")) {
  static {
    __name(this, "Format");
  }
};
var Summary = class extends (/* @__PURE__ */ Service()("effect/httpapi/OpenApi/Summary")) {
  static {
    __name(this, "Summary");
  }
};
var Deprecated = class extends (/* @__PURE__ */ Service()("effect/httpapi/OpenApi/Deprecated")) {
  static {
    __name(this, "Deprecated");
  }
};
var Override = class extends (/* @__PURE__ */ Service()("effect/httpapi/OpenApi/Override")) {
  static {
    __name(this, "Override");
  }
};
var Exclude = /* @__PURE__ */ Reference("effect/httpapi/OpenApi/Exclude", {
  defaultValue: constFalse
});
var Transform = class extends (/* @__PURE__ */ Service()("effect/httpapi/OpenApi/Transform")) {
  static {
    __name(this, "Transform");
  }
};
var apiCache = /* @__PURE__ */ new WeakMap();
var compileSchemas = /* @__PURE__ */ __name((asts) => toMultiDocumentOpenApi3_1(toJsonSchemaMultiDocument(toRepresentations(map4(asts, toCodecJsonAST)))), "compileSchemas");
function processAnnotation(ctx, annotation, f) {
  const o = getOption(ctx, annotation);
  if (isSome2(o)) {
    f(o.value);
  }
}
__name(processAnnotation, "processAnnotation");
function fromApi(api2) {
  return fromApiWith(api2, apiCache, compileSchemas);
}
__name(fromApi, "fromApi");
function fromApiWith(api2, cache, compileSchemas2) {
  const cached3 = cache.get(api2);
  if (cached3 !== void 0) {
    return cached3;
  }
  let spec = {
    openapi: "3.1.0",
    info: {
      title: "Api",
      version: "0.0.1"
    },
    paths: {},
    components: {
      schemas: {},
      securitySchemes: {}
    },
    security: [],
    tags: []
  };
  const pathOps = [];
  const pathOperations = /* @__PURE__ */ new Set();
  const operationIds = /* @__PURE__ */ new Set();
  processAnnotation(api2.annotations, Title, (title) => {
    spec.info.title = title;
  });
  processAnnotation(api2.annotations, Version, (version) => {
    spec.info.version = version;
  });
  processAnnotation(api2.annotations, Description, (description) => {
    spec.info.description = description;
  });
  processAnnotation(api2.annotations, License, (license) => {
    spec.info.license = license;
  });
  processAnnotation(api2.annotations, Summary, (summary) => {
    spec.info.summary = summary;
  });
  processAnnotation(api2.annotations, Servers, (servers) => {
    spec.servers = [...servers];
  });
  reflect(api2, {
    onGroup({
      group: group2
    }) {
      if (get(group2.annotations, Exclude)) {
        return;
      }
      let tag2 = {
        name: getOrElse2(group2.annotations, Title, () => group2.identifier)
      };
      processAnnotation(group2.annotations, Description, (description) => {
        tag2.description = description;
      });
      processAnnotation(group2.annotations, ExternalDocs, (externalDocs) => {
        tag2.externalDocs = externalDocs;
      });
      processAnnotation(group2.annotations, Override, (override) => {
        for (const [key, value3] of Object.entries(override)) {
          assignProperty(tag2, key, value3);
        }
      });
      processAnnotation(group2.annotations, Transform, (transformFn) => {
        tag2 = transformFn(tag2);
      });
      spec.tags.push(tag2);
    },
    onEndpoint({
      endpoint,
      group: group2,
      mergedAnnotations,
      middleware: middleware2
    }) {
      if (get(mergedAnnotations, Exclude)) {
        return;
      }
      let op = {
        tags: [getOrElse2(group2.annotations, Title, () => group2.identifier)],
        operationId: getOrElse2(endpoint.annotations, Identifier, () => group2.topLevel ? endpoint.identifier : `${group2.identifier}.${endpoint.identifier}`),
        parameters: [],
        security: [],
        responses: {}
      };
      const path = endpoint.path.replace(/:(\w+)\??/g, "{$1}");
      const method = endpoint.method.toLowerCase();
      function processResponseBodies(bodies, defaultDescription) {
        for (const [status2, {
          content,
          descriptions,
          headers,
          streamContent
        }] of bodies) {
          const description = descriptions.size > 0 ? Array.from(descriptions).join(" | ") : defaultDescription();
          assignProperty(op.responses, status2, {
            description
          });
          for (const schema of headers) {
            const ast = getLastEncoding(schema.ast);
            if (isObjects(ast)) {
              for (const ps of ast.propertySignatures) {
                const name = String(ps.name).toLowerCase();
                if (name === "content-type")
                  continue;
                op.responses[status2].headers ??= {};
                assignProperty(op.responses[status2].headers, name, {
                  schema: {},
                  required: !isOptional(ps.type)
                });
                pathOps.push({
                  _tag: "parameter",
                  ast: ps.type,
                  path: ["paths", path, method, "responses", String(status2), "headers", name, "schema"]
                });
              }
            }
          }
          if (content !== void 0) {
            content.forEach((map11, encoding) => {
              map11.forEach((schemas, contentType) => {
                const asts = Array.from(schemas, getAST);
                const ast = asts.length === 1 ? asts[0] : new Union(asts, "anyOf");
                pathOps.push({
                  _tag: "schema",
                  ast: toEncodingAST(ast, encoding),
                  path: ["paths", path, method, "responses", String(status2), "content", contentType, "schema"]
                });
                op.responses[status2].content ??= {};
                assignProperty(op.responses[status2].content, contentType, {
                  schema: {}
                });
              });
            });
          }
          if (streamContent !== void 0) {
            streamContent.forEach((stream3, contentType) => {
              op.responses[status2].content ??= {};
              if (isStreamSse(stream3)) {
                pathOps.push({
                  _tag: "schema",
                  ast: getAST(stream3.events),
                  path: ["paths", path, method, "responses", String(status2), "content", contentType, "schema"]
                });
                pathOps.push({
                  _tag: "schema",
                  ast: getAST(toCodecJson(Cause(stream3.error, Defect()))),
                  path: ["paths", path, method, "responses", String(status2), "content", contentType, "x-effect-stream", "causeSchema"]
                });
                pathOps.push({
                  _tag: "schema",
                  ast: getAST(stream3.error),
                  path: ["paths", path, method, "responses", String(status2), "content", contentType, "x-effect-stream", "errorSchema"]
                });
                assignProperty(op.responses[status2].content, contentType, {
                  schema: {},
                  "x-effect-stream": {
                    encoding: "sse",
                    causeSchema: {},
                    errorSchema: {},
                    failureEvent: reservedStreamFailureEvent2
                  }
                });
              } else {
                assignProperty(op.responses[status2].content, contentType, {
                  schema: {
                    type: "string",
                    format: "binary"
                  },
                  "x-effect-stream": {
                    encoding: "uint8array"
                  }
                });
              }
            });
          }
        }
      }
      __name(processResponseBodies, "processResponseBodies");
      function processParameters(schema, i) {
        if (schema) {
          const ast = getLastEncoding(schema.ast);
          if (isObjects(ast)) {
            for (const ps of ast.propertySignatures) {
              op.parameters.push({
                name: String(ps.name),
                in: i,
                schema: {},
                required: i === "path" || !isOptional(ps.type)
              });
              pathOps.push({
                _tag: "parameter",
                ast: ps.type,
                path: ["paths", path, method, "parameters", String(op.parameters.length - 1), "schema"]
              });
            }
          }
        }
      }
      __name(processParameters, "processParameters");
      processAnnotation(endpoint.annotations, Description, (description) => {
        op.description = description;
      });
      processAnnotation(endpoint.annotations, Summary, (summary) => {
        op.summary = summary;
      });
      processAnnotation(endpoint.annotations, Deprecated, (deprecated) => {
        op.deprecated = deprecated;
      });
      processAnnotation(endpoint.annotations, ExternalDocs, (externalDocs) => {
        op.externalDocs = externalDocs;
      });
      middleware2.forEach((middleware3) => {
        if (!isSecurity(middleware3)) {
          return;
        }
        for (const [name, security] of Object.entries(middleware3.security)) {
          processHttpApiSecurity(name, security);
          op.security.push({
            [name]: []
          });
        }
      });
      function processHttpApiSecurity(name, security) {
        const scheme = makeSecurityScheme(security);
        if (!Object.hasOwn(spec.components.securitySchemes, name)) {
          assignProperty(spec.components.securitySchemes, name, scheme);
          return;
        }
        if (!equals(securitySchemeForComparison(spec.components.securitySchemes[name]), securitySchemeForComparison(scheme))) {
          throw new globalThis.Error(`Conflicting OpenAPI security scheme: ${name}`);
        }
      }
      __name(processHttpApiSecurity, "processHttpApiSecurity");
      const hasBody2 = hasBody(endpoint.method);
      if (hasBody2) {
        const schemasByContentType = /* @__PURE__ */ new Map();
        for (const schema of getPayloadSchemas(endpoint)) {
          if (isNoContent(schema.ast))
            continue;
          const encoding = getPayloadEncoding(schema.ast, endpoint.method);
          const existing = schemasByContentType.get(encoding.contentType);
          if (existing === void 0) {
            schemasByContentType.set(encoding.contentType, {
              encoding,
              schemas: [schema]
            });
          } else {
            existing.schemas.push(schema);
          }
        }
        if (schemasByContentType.size > 0) {
          const content = {};
          for (const [contentType, {
            encoding,
            schemas
          }] of schemasByContentType) {
            const asts = schemas.map(getAST);
            const ast = asts.length === 1 ? asts[0] : new Union(asts, "anyOf");
            pathOps.push({
              _tag: "schema",
              ast: toEncodingAST(ast, encoding._tag),
              path: ["paths", path, method, "requestBody", "content", contentType, "schema"]
            });
            assignProperty(content, contentType, {
              schema: {}
            });
          }
          op.requestBody = {
            content,
            required: true
          };
        }
      }
      processParameters(endpoint.params, "path");
      if (!hasBody2 && endpoint.payload.size === 1) {
        const entry = endpoint.payload.values().next().value;
        processParameters(entry.schemas[0], "query");
      }
      processParameters(endpoint.headers, "header");
      processParameters(endpoint.query, "query");
      processResponseBodies(extractSuccessResponseBodies(endpoint), () => "Success");
      processResponseBodies(extractResponseBodies(getErrorSchemas(endpoint), getStatusErrorSchema, resolveDescriptionOrIdentifier), () => "Error");
      processAnnotation(endpoint.annotations, Override, (override) => {
        for (const [key, value3] of Object.entries(override)) {
          assignProperty(op, key, value3);
        }
      });
      processAnnotation(endpoint.annotations, Transform, (transformFn) => {
        op = transformFn(op);
      });
      const pathOperation = `${method} ${path.replace(/\{[^}]+\}/g, "{}")}`;
      if (pathOperations.has(pathOperation)) {
        throw new globalThis.Error(`Duplicate OpenAPI operation for ${endpoint.method} ${path}`);
      }
      const operationId = op.operationId;
      if (operationId !== void 0) {
        if (operationIds.has(operationId)) {
          throw new globalThis.Error(`Duplicate OpenAPI operationId: ${operationId}`);
        }
        operationIds.add(operationId);
      }
      pathOperations.add(pathOperation);
      if (!Object.hasOwn(spec.paths, path)) {
        assignProperty(spec.paths, path, {});
      }
      spec.paths[path][method] = op;
    }
  });
  processAnnotation(api2.annotations, AdditionalSchemas, (componentSchemas) => {
    componentSchemas.forEach((componentSchema) => {
      const identifier2 = resolveIdentifier2(componentSchema.ast);
      if (identifier2 !== void 0) {
        if (Object.hasOwn(spec.components.schemas, identifier2)) {
          throw new globalThis.Error(`Duplicate component schema identifier: ${identifier2}`);
        }
        assignProperty(spec.components.schemas, identifier2, {});
        pathOps.push({
          _tag: "schema",
          ast: componentSchema.ast,
          path: ["components", "schemas", identifier2]
        });
      }
    });
  });
  function escapePath(path) {
    return "/" + path.map(escapeToken).join("/");
  }
  __name(escapePath, "escapePath");
  if (isArrayNonEmpty2(pathOps)) {
    const jsonSchemaMultiDocument = compileSchemas2(map4(pathOps, (op) => op.ast));
    const patchOps = pathOps.map((op, i) => {
      const oppath = escapePath(op.path);
      const value3 = jsonSchemaMultiDocument.schemas[i];
      return {
        op: "replace",
        path: oppath,
        value: value3
      };
    });
    Object.entries(jsonSchemaMultiDocument.definitions).forEach(([name, definition]) => {
      patchOps.push({
        op: "add",
        path: escapePath(["components", "schemas", name]),
        value: definition
      });
    });
    spec = apply(patchOps, spec);
  }
  Object.keys(spec.components.schemas).forEach((key) => {
    if (!VALID_OPEN_API_COMPONENTS_SCHEMAS_KEY_REGEXP.test(key)) {
      throw new globalThis.Error(`Invalid component schema key: ${key}`);
    }
  });
  processAnnotation(api2.annotations, Override, (override) => {
    for (const [key, value3] of Object.entries(override)) {
      assignProperty(spec, key, value3);
    }
  });
  processAnnotation(api2.annotations, Transform, (transformFn) => {
    spec = transformFn(spec);
  });
  cache.set(api2, spec);
  return spec;
}
__name(fromApiWith, "fromApiWith");
var reservedStreamFailureEvent2 = "effect/httpapi/stream/failure";
function extractSuccessResponseBodies(endpoint) {
  return extractResponseBodies(getSuccessSchemas(endpoint), getStatusSuccessSchema, resolveDescriptionOrIdentifier);
}
__name(extractSuccessResponseBodies, "extractSuccessResponseBodies");
function extractResponseBodies(schemas, getStatus, getDescription) {
  const map11 = /* @__PURE__ */ new Map();
  schemas.forEach(process);
  return map11;
  function process(schema) {
    const annotation = getWithHeadersAnnotation(schema.ast);
    const body = isWithHeaders(schema) ? schema.schema : annotation?.body ?? schema;
    const headers = isWithHeaders(schema) ? schema.headers : annotation?.headersCodec;
    const status2 = getStatus(schema);
    const ast = body.ast;
    if (isStreamSchema(body)) {
      addStreamContent(body, status2);
    } else if (isNoContent(ast)) {
      addNoContent(status2, getDescription(schema.ast) ?? getDescription(ast) ?? "<No Content>");
    } else {
      addContent(body, status2, getResponseEncodingSchema(schema), getDescription(schema.ast) ?? getDescription(ast));
    }
    if (headers !== void 0) {
      map11.get(status2).headers.push(headers);
    }
  }
  __name(process, "process");
  function addNoContent(status2, description) {
    const statusMap = map11.get(status2);
    if (statusMap === void 0) {
      map11.set(status2, {
        descriptions: /* @__PURE__ */ new Set([description]),
        content: void 0,
        headers: [],
        streamContent: void 0
      });
    } else {
      if (description !== void 0) {
        statusMap.descriptions.add(description);
      }
    }
  }
  __name(addNoContent, "addNoContent");
  function addContent(schema, status2, encoding, description) {
    const statusMap = map11.get(status2);
    const {
      _tag,
      contentType
    } = encoding;
    if (statusMap === void 0) {
      map11.set(status2, {
        descriptions: new Set(description !== void 0 ? [description] : []),
        content: /* @__PURE__ */ new Map([[_tag, /* @__PURE__ */ new Map([[contentType, /* @__PURE__ */ new Set([schema])]])]]),
        headers: [],
        streamContent: void 0
      });
    } else {
      if (description !== void 0) {
        statusMap.descriptions.add(description);
      }
      if (statusMap.content === void 0) {
        statusMap.content = /* @__PURE__ */ new Map([[_tag, /* @__PURE__ */ new Map([[contentType, /* @__PURE__ */ new Set([schema])]])]]);
      } else {
        const schemasByContentType = statusMap.content.get(_tag);
        if (schemasByContentType === void 0) {
          statusMap.content.set(_tag, /* @__PURE__ */ new Map([[contentType, /* @__PURE__ */ new Set([schema])]]));
        } else {
          const set4 = schemasByContentType.get(contentType);
          if (set4 === void 0) {
            schemasByContentType.set(contentType, /* @__PURE__ */ new Set([schema]));
          } else {
            set4.add(schema);
          }
        }
      }
    }
  }
  __name(addContent, "addContent");
  function addStreamContent(stream3, status2) {
    const statusMap = map11.get(status2);
    if (statusMap === void 0) {
      map11.set(status2, {
        descriptions: /* @__PURE__ */ new Set(),
        content: void 0,
        headers: [],
        streamContent: /* @__PURE__ */ new Map([[stream3.contentType, stream3]])
      });
    } else {
      if (statusMap.streamContent === void 0) {
        statusMap.streamContent = /* @__PURE__ */ new Map([[stream3.contentType, stream3]]);
      } else {
        statusMap.streamContent.set(stream3.contentType, stream3);
      }
    }
  }
  __name(addStreamContent, "addStreamContent");
}
__name(extractResponseBodies, "extractResponseBodies");
function resolveDescriptionOrIdentifier(ast) {
  return resolveDescription2(ast) ?? resolveIdentifier2(ast);
}
__name(resolveDescriptionOrIdentifier, "resolveDescriptionOrIdentifier");
var Uint8ArrayEncoding = /* @__PURE__ */ String4.annotate({
  format: "binary"
});
function toEncodingAST(ast, _tag) {
  switch (_tag) {
    case "Uint8Array":
      return Uint8ArrayEncoding.ast;
    case "Text":
      return String4.ast;
    case "FormUrlEncoded":
    case "Json":
      return ast;
    case "Multipart":
      return persistedFileToBinaryEncoding(ast);
  }
}
__name(toEncodingAST, "toEncodingAST");
function persistedFileToBinaryEncoding(ast) {
  if (isDeclaration(ast) && ast.annotations?.representation?.id === "effect/http/PersistedFile") {
    return Uint8ArrayEncoding.ast;
  }
  if (typeof ast?.recur === "function") {
    return ast.recur(persistedFileToBinaryEncoding);
  }
  return ast;
}
__name(persistedFileToBinaryEncoding, "persistedFileToBinaryEncoding");
var makeSecurityScheme = /* @__PURE__ */ __name((security) => {
  const meta = {};
  processAnnotation(security.annotations, Description, (description) => {
    meta.description = description;
  });
  switch (security._tag) {
    case "Basic": {
      return {
        ...meta,
        type: "http",
        scheme: "basic"
      };
    }
    case "Http": {
      const format4 = getOption(security.annotations, Format).pipe(map((format5) => ({
        bearerFormat: format5
      })), getOrUndefined);
      return {
        ...meta,
        type: "http",
        scheme: security.scheme,
        ...format4
      };
    }
    case "ApiKey": {
      return {
        ...meta,
        type: "apiKey",
        name: security.key,
        in: security.in
      };
    }
  }
}, "makeSecurityScheme");
var securitySchemeForComparison = /* @__PURE__ */ __name((scheme) => {
  if (scheme.type === "http") {
    return {
      ...scheme,
      scheme: scheme.scheme.toLowerCase()
    };
  }
  if (scheme.in === "header") {
    return {
      ...scheme,
      name: scheme.name.toLowerCase()
    };
  }
  return scheme;
}, "securitySchemeForComparison");
var layer5 = /* @__PURE__ */ __name((api2, options) => use(fnUntraced2(function* (router) {
  const services2 = yield* context2();
  const routes = [];
  const availableGroups = Array.from(services2.mapUnsafe.keys()).filter((key) => key.startsWith("effect/httpapi/HttpApiGroup/"));
  const groups = Object.values(api2.groups);
  for (const group2 of groups) {
    const groupRoutes = services2.mapUnsafe.get(group2.key)?.routes;
    if (groupRoutes === void 0) {
      const available = availableGroups.length === 0 ? "none" : availableGroups.join(", ");
      return yield* die2(`HttpApiGroup "${group2.identifier}" not found (key: "${group2.key}"). Did you forget to provide HttpApiBuilder.group(api, "${group2.identifier}", ...)? Available groups: ${available}`);
    }
    routes.push(...groupRoutes);
  }
  yield* router.addAll(routes);
  if (options?.openapiPath) {
    const spec = fromApi(api2);
    yield* router.add("GET", options.openapiPath, succeed6(jsonUnsafe2(spec)));
  }
})), "layer5");
var group = /* @__PURE__ */ __name((api2, groupIdentifier, build22) => effectContext(gen2(function* () {
  const services2 = (yield* context2()).pipe(omit(Scope));
  const group2 = api2.groups[groupIdentifier];
  const result3 = build22(makeHandlers(group2));
  const handlers = isEffect2(result3) ? yield* result3 : result3;
  const routes = [];
  for (const item of handlers.handlers.values()) {
    routes.push(handlerToRoute(group2, item, services2));
  }
  return makeUnsafe(/* @__PURE__ */ new Map([[group2.key, {
    routes,
    handlers: handlers.handlers
  }]]));
})), "group");
var HandlersTypeId = "~effect/httpapi/HttpApiBuilder/Handlers";
var securityDecode = /* @__PURE__ */ __name((self) => {
  switch (self._tag) {
    case "Http": {
      return map7(HttpServerRequest, (request) => make7(getAuthorizationCredential(request.headers.authorization, self.scheme) ?? ""));
    }
    case "ApiKey": {
      const key = self.in === "header" ? self.key.toLowerCase() : self.key;
      const schema = Struct({
        [key]: String4
      });
      const decode = self.in === "query" ? schemaSearchParams(schema) : self.in === "cookie" ? schemaCookies(schema) : schemaHeaders(schema);
      return match5(decode, {
        onFailure: /* @__PURE__ */ __name(() => make7(""), "onFailure"),
        onSuccess: /* @__PURE__ */ __name((match8) => make7(match8[key]), "onSuccess")
      });
    }
    case "Basic": {
      const empty11 = {
        username: "",
        password: make7("")
      };
      return map7(HttpServerRequest, (request) => {
        const encoded = getAuthorizationCredential(request.headers.authorization, basicScheme);
        if (encoded === void 0)
          return empty11;
        const decoded = getOrUndefined3(decodeBase64String(encoded));
        if (decoded === void 0)
          return empty11;
        const separator = decoded.indexOf(":");
        if (separator === -1)
          return empty11;
        return {
          username: decoded.slice(0, separator),
          password: make7(decoded.slice(separator + 1))
        };
      });
    }
  }
}, "securityDecode");
var basicScheme = "Basic";
function getAuthorizationCredential(authorization, scheme) {
  const schemeLength = scheme.length;
  if (authorization === void 0 || authorization.length <= schemeLength || authorization.charCodeAt(schemeLength) !== 32 || authorization.slice(0, schemeLength).toLowerCase() !== scheme.toLowerCase()) {
    return;
  }
  let credentialStart = schemeLength + 1;
  while (authorization.charCodeAt(credentialStart) === 32) {
    credentialStart++;
  }
  return credentialStart === authorization.length ? void 0 : authorization.slice(credentialStart);
}
__name(getAuthorizationCredential, "getAuthorizationCredential");
var registerHandler = /* @__PURE__ */ __name((self, identifier2, handler2, isRaw, options) => {
  if (!Object.hasOwn(self.group.endpoints, identifier2)) {
    throw new Error(`HttpApiEndpoint "${identifier2}" not found in HttpApiGroup "${self.group.identifier}"`);
  }
  if (self.handlers.has(identifier2)) {
    throw new Error(`Handler for HttpApiEndpoint "${identifier2}" is already registered in HttpApiGroup "${self.group.identifier}"`);
  }
  const endpoint = self.group.endpoints[identifier2];
  self.handlers.set(identifier2, {
    endpoint,
    handler: handler2,
    isRaw,
    uninterruptible: options?.uninterruptible ?? false
  });
  return self;
}, "registerHandler");
var HandlersProto = {
  [HandlersTypeId]: HandlersTypeId,
  pipe() {
    return pipeArguments(this, arguments);
  },
  handle(identifier2, handler2, options) {
    return registerHandler(this, identifier2, handler2, false, options);
  },
  handleAll(handlers) {
    for (const [identifier2, entry] of Object.entries(handlers)) {
      const handler2 = typeof entry === "function" ? entry : entry.handler;
      const options = typeof entry === "function" ? void 0 : entry.options;
      registerHandler(this, identifier2, handler2, false, options);
    }
    return this;
  },
  handleRaw(identifier2, handler2, options) {
    return registerHandler(this, identifier2, handler2, true, options);
  }
};
var makeHandlers = /* @__PURE__ */ __name((group2) => {
  const self = Object.create(HandlersProto);
  self.group = group2;
  self.handlers = /* @__PURE__ */ new Map();
  return self;
}, "makeHandlers");
function buildPayloadDecoders(payloadMap) {
  const result3 = /* @__PURE__ */ new Map();
  payloadMap.forEach(({
    encoding,
    schemas
  }, contentType) => {
    const decode = decodeUnknownEffect2(Union2(schemas));
    if (encoding._tag === "Multipart") {
      result3.set(contentType, {
        _tag: "Multipart",
        mode: encoding.mode,
        limits: encoding.limits,
        decode
      });
    } else {
      result3.set(contentType, {
        _tag: encoding._tag,
        decode,
        nullOnEmpty: schemas.some((s) => isNull(toEncoded(s.ast)))
      });
    }
  });
  return result3;
}
__name(buildPayloadDecoders, "buildPayloadDecoders");
function decodePayload(payloadBy, httpRequest, query) {
  const hasBody2 = hasBody(httpRequest.method);
  const contentType = hasBody2 ? normalize(httpRequest.headers["content-type"] ?? "application/json") : "application/x-www-form-urlencoded";
  const existing = payloadBy.get(contentType);
  if (!existing) {
    return text2(`Unsupported content-type: ${contentType}`, {
      status: 415
    });
  }
  const {
    _tag,
    decode
  } = existing;
  switch (_tag) {
    case "Multipart": {
      if (existing.mode === "buffered") {
        let eff = orDie2(httpRequest.multipart);
        if (existing.limits) {
          eff = provideContext2(eff, limitsServices(existing.limits));
        }
        return flatMap3(eff, decode);
      }
      return succeed6(existing.limits ? provideContext4(httpRequest.multipartStream, limitsServices(existing.limits)) : httpRequest.multipartStream);
    }
    case "Json":
      return flatMap3(orDie2(httpRequest.text), (text3) => {
        if (text3 === "") {
          return decode(existing.nullOnEmpty ? null : void 0);
        }
        try {
          return decode(JSON.parse(text3));
        } catch {
          return fail5(new SchemaError(new InvalidValue({
            message: "Expected a valid JSON body"
          })));
        }
      });
    case "Text":
      return flatMap3(orDie2(httpRequest.text), decode);
    case "FormUrlEncoded": {
      const source = hasBody2 ? map7(orDie2(httpRequest.urlParamsBody), toRecord) : succeed6(query);
      return flatMap3(source, decode);
    }
    case "Uint8Array":
      return flatMap3(map7(orDie2(httpRequest.arrayBuffer), (buffer2) => new Uint8Array(buffer2)), decode);
  }
}
__name(decodePayload, "decodePayload");
function handlerToHttpEffect(group2, endpoint, context3, handler2, isRaw) {
  const encodeSuccess = encodeUnknownEffect2(makeSuccessSchema(endpoint));
  const encodeError = encodeUnknownEffect2(makeErrorSchema(endpoint));
  const decodeParams = map8(endpoint.params, decodeUnknownEffect2);
  const decodeHeaders = map8(endpoint.headers, decodeUnknownEffect2);
  const decodeQuery = map8(endpoint.query, decodeUnknownEffect2);
  const encodeStream = makeStreamEncoder(endpoint);
  const encodeWithHeaders = makeWithHeadersEncoder(endpoint);
  const shouldParsePayload = endpoint.payload.size > 0 && !isRaw;
  const payloadBy = shouldParsePayload ? buildPayloadDecoders(endpoint.payload) : void 0;
  return applyMiddleware(group2, endpoint, context3, gen2(function* () {
    const fiber2 = getCurrent();
    const context4 = fiber2.context;
    const httpRequest = getUnsafe(context4, HttpServerRequest);
    const routeContext = getUnsafe(context4, RouteContext);
    const query = getUnsafe(context4, ParsedSearchParams);
    const request = {
      request: httpRequest,
      endpoint,
      group: group2
    };
    if (decodeParams) {
      request.params = yield* HttpApiSchemaError.wrap("Params", decodeParams(routeContext.params));
    }
    if (decodeHeaders) {
      request.headers = yield* HttpApiSchemaError.wrap("Headers", decodeHeaders(httpRequest.headers));
    }
    if (decodeQuery) {
      request.query = yield* HttpApiSchemaError.wrap("Query", decodeQuery(query));
    }
    if (payloadBy) {
      const result3 = decodePayload(payloadBy, httpRequest, query);
      if (isHttpServerResponse(result3)) {
        return result3;
      }
      if (result3 !== void 0) {
        request.payload = yield* HttpApiSchemaError.wrap("Payload", result3);
      }
    }
    let response = yield* handler2(request);
    if (isHttpServerResponse(response)) {
      return response;
    }
    let responseHeaders;
    if (encodeWithHeaders !== void 0 && isWithHeadersValue(response)) {
      responseHeaders = response.headers;
      response = response.body;
    }
    const encoded = yield* HttpApiSchemaError.wrap("Body", encodeStream?.(response, context4) ?? (responseHeaders !== void 0 ? encodeWithHeaders.encodeBody(response) : encodeSuccess(response)));
    if (encodeWithHeaders === void 0 || responseHeaders === void 0)
      return encoded;
    const encodedHeaders = yield* HttpApiSchemaError.wrap("ResponseHeaders", encodeWithHeaders.encodeHeaders.get(encoded.status)(responseHeaders));
    return setHeaders(encoded, encodedHeaders);
  })).pipe(withErrorReporting2, catch_2((error) => {
    if (HttpApiSchemaError.is(error))
      return die2(error);
    return orDie2(encodeError(error));
  }), provideContext2(context3));
}
__name(handlerToHttpEffect, "handlerToHttpEffect");
function handlerToRoute(group2, handler2, context3) {
  const endpoint = handler2.endpoint;
  return route(endpoint.method, endpoint.path, handlerToHttpEffect(group2, endpoint, context3, handler2.handler, handler2.isRaw), {
    uninterruptible: handler2.uninterruptible
  });
}
__name(handlerToRoute, "handlerToRoute");
var applyMiddleware = /* @__PURE__ */ __name((group2, endpoint, context3, handler2) => {
  const options = {
    group: group2,
    endpoint
  };
  for (const key_ of endpoint.middlewares) {
    const key = key_;
    const service3 = getUnsafe(context3, key);
    const apply2 = isSecurity(key) ? makeSecurityMiddleware(key, service3) : service3;
    handler2 = apply2(handler2, options);
  }
  return handler2;
}, "applyMiddleware");
var securityMiddlewareCache = /* @__PURE__ */ new WeakMap();
var makeSecurityMiddleware = /* @__PURE__ */ __name((key, service3) => {
  const cached3 = securityMiddlewareCache.get(service3);
  if (cached3 !== void 0) {
    return cached3;
  }
  const entries = Object.entries(key.security).map(([securityKey, security]) => ({
    decode: securityDecode(security),
    middleware: service3[securityKey]
  }));
  if (entries.length === 0) {
    return identity;
  }
  const middleware2 = fnUntraced2(function* (handler2, options) {
    handler2 = mapError3(handler2, (error) => new HandlerError(error));
    let lastResult;
    for (let i = 0; i < entries.length; i++) {
      const {
        decode,
        middleware: middleware3
      } = entries[i];
      const result3 = yield* result2(flatMap3(decode, (credential) => middleware3(handler2, {
        credential,
        endpoint: options.endpoint,
        group: options.group
      })));
      if (isFailure2(result3)) {
        if (isHandlerError(result3.failure)) {
          return yield* fail5(result3.failure.error);
        }
        lastResult = result3;
        continue;
      }
      return result3.success;
    }
    return yield* fromResult2(lastResult);
  });
  securityMiddlewareCache.set(service3, middleware2);
  return middleware2;
}, "makeSecurityMiddleware");
var HandlerErrorTypeId = "~effect/httpapi/HttpApiBuilder/HandlerError";
var HandlerError = class {
  static {
    __name(this, "HandlerError");
  }
  [HandlerErrorTypeId] = HandlerErrorTypeId;
  error;
  constructor(error) {
    this.error = error;
  }
};
var isHandlerError = /* @__PURE__ */ __name((value3) => hasProperty(value3, HandlerErrorTypeId), "isHandlerError");
var $HttpServerResponse = /* @__PURE__ */ declare(isHttpServerResponse);
function makeWithHeadersEncoder(endpoint) {
  const encodeHeaders = /* @__PURE__ */ new Map();
  const bodySchemas = [];
  for (const schema of endpoint.success) {
    if (!isWithHeaders(schema))
      continue;
    encodeHeaders.set(getStatusSuccessSchema(schema), encodeUnknownEffect2(schema.headers));
    if (!isStreamSchema(schema.schema)) {
      bodySchemas.push(toResponseSuccessSchema(schema));
    }
  }
  if (encodeHeaders.size === 0)
    return;
  const bodySchema = bodySchemas.length === 0 ? Never2 : bodySchemas.length === 1 ? bodySchemas[0] : Union2(bodySchemas);
  return {
    encodeBody: encodeUnknownEffect2(bodySchema),
    encodeHeaders
  };
}
__name(makeWithHeadersEncoder, "makeWithHeadersEncoder");
function makeStreamEncoder(endpoint) {
  const streamSchema = getStreamSuccessSchema(endpoint);
  if (streamSchema === void 0) {
    return;
  }
  const hasBuffered = hasBufferedSuccess(endpoint);
  const status2 = getStatusStream(streamSchema);
  const contentType = streamSchema.contentType;
  if (isStreamUint8Array(streamSchema)) {
    return (response, context3) => {
      if (!isStream(response)) {
        return hasBuffered ? void 0 : new SchemaError(new InvalidValue({
          message: "Expected a streaming response"
        }));
      }
      return succeed6(stream2(provideContext4(response, context3), {
        status: status2,
        contentType
      }));
    };
  }
  const sseEncoder = makeSseEncoder(streamSchema);
  return (response, context3) => {
    if (!isStream(response)) {
      return hasBuffered ? void 0 : new SchemaError(new InvalidValue({
        message: "Expected a streaming response"
      }));
    }
    return succeed6(stream2(provideContext4(encodeSseStream(response, sseEncoder), context3), {
      status: status2,
      contentType
    }));
  };
}
__name(makeStreamEncoder, "makeStreamEncoder");
function getStreamSuccessSchema(endpoint) {
  for (const schema of endpoint.success) {
    const body = isWithHeaders(schema) ? schema.schema : schema;
    if (isStreamSchema(body)) {
      return body;
    }
  }
}
__name(getStreamSuccessSchema, "getStreamSuccessSchema");
function hasBufferedSuccess(endpoint) {
  for (const schema of endpoint.success) {
    const body = isWithHeaders(schema) ? schema.schema : schema;
    if (isSchema(body) && !isStreamSchema(body))
      return true;
  }
  return endpoint.success.size === 0;
}
__name(hasBufferedSuccess, "hasBufferedSuccess");
function makeSseEncoder(streamSchema) {
  const CauseSchema = toCodecJson(Cause(streamSchema.error, Defect()));
  return {
    sseMode: streamSchema.sseMode,
    encodeEvents: encodeUnknownEffect2(ArraySchema(streamSchema.events)),
    encodeCause: encodeUnknownEffect2(fromJsonString2(CauseSchema))
  };
}
__name(makeSseEncoder, "makeSseEncoder");
function encodeSseStream(stream3, encoder4) {
  return stream3.pipe(encoder4.sseMode === "data" ? map10((value3) => ({
    id: void 0,
    event: "message",
    data: value3
  })) : identity, mapArrayEffect((chunk) => orDie2(encoder4.encodeEvents(chunk))), catchCause4((cause) => fromEffect2(encodeFailureEvent(cause, encoder4))), map10(renderSseEvent), encodeText);
}
__name(encodeSseStream, "encodeSseStream");
function encodeFailureEvent(cause, encoder4) {
  return encoder4.encodeCause(cause).pipe(orDie2, map7((encodedCause) => ({
    id: void 0,
    event: reservedStreamFailureEvent3,
    data: encodedCause
  })));
}
__name(encodeFailureEvent, "encodeFailureEvent");
var reservedStreamFailureEvent3 = "effect/httpapi/stream/failure";
function renderSseEvent(event) {
  return encoder2.write({
    _tag: "Event",
    event: event.event,
    id: event.id,
    data: event.data
  });
}
__name(renderSseEvent, "renderSseEvent");
var toResponseSuccessSchema = /* @__PURE__ */ toResponseSchema(getStatusSuccessSchema);
var toResponseErrorSchemaPlain = /* @__PURE__ */ toResponseSchema(getStatusErrorSchema);
function toResponseErrorSchema(schema) {
  if (!isWithHeaders(schema))
    return toResponseErrorSchemaPlain(schema);
  const encodeBody = encodeUnknownEffect2(schema.schema);
  const encodeHeaders = encodeUnknownEffect2(schema.headers);
  const encodeResponse = getResponseEncode(getStatusErrorSchema(schema), getResponseEncodingSchema(schema), isNoContent(schema.schema.ast));
  const transformation = withHeadersTransformation((body) => encodeBody(body).pipe(mapError3((error) => error.issue), flatMap3(encodeResponse)), encodeHeaders);
  return $HttpServerResponse.pipe(decodeTo2(schema, transformation));
}
__name(toResponseErrorSchema, "toResponseErrorSchema");
function makeSuccessSchema(endpoint) {
  const schemas = getSuccessSchemas(endpoint).map(toResponseSuccessSchema);
  return schemas.length === 1 ? schemas[0] : Union2(schemas);
}
__name(makeSuccessSchema, "makeSuccessSchema");
function makeErrorSchema(endpoint) {
  const schemas = getErrorSchemas(endpoint).map(toResponseErrorSchema);
  if (schemas.length === 0)
    return Never2;
  return schemas.length === 1 ? schemas[0] : Union2(schemas);
}
__name(makeErrorSchema, "makeErrorSchema");
function toResponseSchema(getStatus) {
  const cache = /* @__PURE__ */ new WeakMap();
  return (schema) => {
    const key = isWithHeaders(schema) ? schema : schema.ast;
    const cached3 = cache.get(key);
    if (cached3 !== void 0) {
      return cached3;
    }
    const bodySchema = isWithHeaders(schema) ? schema.schema : schema;
    const responseSchema = $HttpServerResponse.pipe(decodeTo2(bodySchema, getResponseTransformation(getStatus, schema)));
    cache.set(key, responseSchema);
    return responseSchema;
  };
}
__name(toResponseSchema, "toResponseSchema");
function getResponseTransformation(getStatus, schema) {
  const withHeaders = getWithHeadersAnnotation(schema.ast);
  if (withHeaders !== void 0) {
    const encodeBody = getResponseEncode(getStatus(withHeaders.body), getResponseEncoding(withHeaders.body.ast), isNoContent(withHeaders.body.ast));
    return withHeadersTransformation(encodeBody, encodeUnknownEffect2(withHeaders.headersCodec));
  }
  const bodySchema = isWithHeaders(schema) ? schema.schema : schema;
  const encode = getResponseEncode(getStatus(schema), getResponseEncodingSchema(schema), isNoContent(bodySchema.ast));
  return transformOrFail2({
    decode: /* @__PURE__ */ __name(() => fail5(new Forbidden({
      message: "Encode only schema"
    })), "decode"),
    encode
  });
}
__name(getResponseTransformation, "getResponseTransformation");
function withHeadersTransformation(encodeBody, encodeHeaders) {
  return transformOrFail2({
    decode: /* @__PURE__ */ __name(() => fail5(new Forbidden({
      message: "Encode only schema"
    })), "decode"),
    encode: /* @__PURE__ */ __name((value3) => {
      const pair = value3;
      return flatMap3(encodeBody(pair.body), (response) => map7(encodeHeaders(pair.headers).pipe(mapError3((error) => error.issue)), (headers) => setHeaders(response, headers)));
    }, "encode")
  });
}
__name(withHeadersTransformation, "withHeadersTransformation");
function getResponseEncode(status2, encoding, isNoContent2) {
  switch (encoding._tag) {
    case "Json": {
      return (e) => {
        if (e === void 0 || isNoContent2) {
          return succeed6(empty9({
            status: status2
          }));
        }
        try {
          const s = JSON.stringify(e);
          return succeed6(text2(s, {
            status: status2,
            contentType: encoding.contentType
          }));
        } catch {
          return fail5(new InvalidValue({
            message: "Expected a JSON-serializable response body"
          }));
        }
      };
    }
    case "Text":
      return (e) => succeed6(text2(e, {
        status: status2,
        contentType: encoding.contentType
      }));
    case "Uint8Array":
      return (e) => succeed6(uint8Array2(e, {
        status: status2,
        contentType: encoding.contentType
      }));
    case "FormUrlEncoded":
      return (e) => succeed6(urlParams(e, {
        status: status2
      }).pipe(setHeader("content-type", encoding.contentType)));
  }
}
__name(getResponseEncode, "getResponseEncode");
var TypeId37 = "~effect/httpapi/HttpApiGroup";
var Proto11 = {
  [TypeId37]: TypeId37,
  add(...toAdd) {
    const endpoints = {
      ...this.endpoints
    };
    for (const endpoint of toAdd) {
      assignProperty(endpoints, endpoint.identifier, endpoint);
    }
    return makeProto3({
      ...optionsFromGroup(this),
      endpoints
    });
  },
  prefix(prefix) {
    return makeProto3({
      ...optionsFromGroup(this),
      endpoints: map3(this.endpoints, (endpoint) => endpoint.prefix(prefix))
    });
  },
  middleware(middleware2) {
    return makeProto3({
      ...optionsFromGroup(this),
      endpoints: map3(this.endpoints, (endpoint) => endpoint.middleware(middleware2))
    });
  },
  annotateMerge(annotations) {
    return makeProto3({
      ...optionsFromGroup(this),
      annotations: merge(this.annotations, annotations)
    });
  },
  annotate(annotation, value3) {
    return makeProto3({
      ...optionsFromGroup(this),
      annotations: add(this.annotations, annotation, value3)
    });
  },
  annotateEndpointsMerge(annotations) {
    return makeProto3({
      ...optionsFromGroup(this),
      endpoints: map3(this.endpoints, (endpoint) => endpoint.annotateMerge(annotations))
    });
  },
  annotateEndpoints(annotation, value3) {
    return makeProto3({
      ...optionsFromGroup(this),
      endpoints: map3(this.endpoints, (endpoint) => endpoint.annotate(annotation, value3))
    });
  },
  pipe() {
    return pipeArguments(this, arguments);
  }
};
var optionsFromGroup = /* @__PURE__ */ __name((group2) => ({
  identifier: group2.identifier,
  topLevel: group2.topLevel,
  endpoints: group2.endpoints,
  annotations: group2.annotations
}), "optionsFromGroup");
var makeProto3 = /* @__PURE__ */ __name((options) => {
  function HttpApiGroup() {
  }
  __name(HttpApiGroup, "HttpApiGroup");
  Object.setPrototypeOf(HttpApiGroup, Proto11);
  HttpApiGroup.key = `effect/httpapi/HttpApiGroup/${options.identifier}`;
  return Object.assign(HttpApiGroup, options);
}, "makeProto3");
var make29 = /* @__PURE__ */ __name((identifier2, options) => makeProto3({
  identifier: identifier2,
  topLevel: options?.topLevel ?? false,
  endpoints: {},
  annotations: empty()
}), "make29");
var TypeId38 = "~effect/httpapi/HttpApiSecurity";
var Proto12 = {
  [TypeId38]: TypeId38,
  pipe() {
    return pipeArguments(this, arguments);
  }
};
var http = /* @__PURE__ */ __name((options) => Object.assign(Object.create(Proto12), {
  _tag: "Http",
  scheme: options.scheme,
  schemeLength: options.scheme.length,
  annotations: empty()
}), "http");
var bearer = /* @__PURE__ */ http({
  scheme: "Bearer"
});
var TypeId39 = "~effect/schema/VariantSchema";
var cacheSymbol = /* @__PURE__ */ Symbol.for(`${TypeId39}/cache`);
var defaultCacheSymbol = /* @__PURE__ */ Symbol.for(`${TypeId39}/defaultCache`);
var isStruct2 = /* @__PURE__ */ __name((u) => hasProperty(u, TypeId39), "isStruct2");
var FieldTypeId = "~effect/schema/VariantSchema/Field";
var isField = /* @__PURE__ */ __name((u) => hasProperty(u, FieldTypeId), "isField");
var extract = /* @__PURE__ */ dual((args2) => isStruct2(args2[0]), (self, variant, options) => {
  const cache = options?.isDefault === true ? self[defaultCacheSymbol] ?? (self[defaultCacheSymbol] = /* @__PURE__ */ Object.create(null)) : self[cacheSymbol] ?? (self[cacheSymbol] = /* @__PURE__ */ Object.create(null));
  if (Object.hasOwn(cache, variant)) {
    return cache[variant];
  }
  const fields = {};
  for (const key of Object.keys(self[TypeId39])) {
    const value3 = self[TypeId39][key];
    if (value3 === void 0) {
      continue;
    }
    if (TypeId39 in value3) {
      if (options?.isDefault === true && isSchema(value3)) {
        assignProperty(fields, key, value3);
      } else {
        assignProperty(fields, key, extract(value3, variant));
      }
    } else if (FieldTypeId in value3) {
      if (Object.hasOwn(value3.schemas, variant)) {
        const schema2 = value3.schemas[variant];
        if (schema2 !== void 0) {
          assignProperty(fields, key, schema2);
        }
      }
    } else {
      assignProperty(fields, key, value3);
    }
  }
  const schema = Struct(fields);
  cache[variant] = schema;
  return schema;
});
var make30 = /* @__PURE__ */ __name((options) => {
  function Class52(identifier2) {
    return function(fields, annotations) {
      const variantStruct = Struct2(fields);
      const schema = extract(variantStruct, options.defaultVariant, {
        isDefault: true
      });
      const SClass = Class4;
      class Base3 extends SClass(identifier2)(schema.fields, annotations) {
        static {
          __name(this, "Base3");
        }
        static [TypeId39] = fields;
      }
      for (const variant of options.variants) {
        Object.defineProperty(Base3, variant, {
          value: extract(variantStruct, variant).annotate({
            id: `${identifier2}.${variant}`,
            title: `${identifier2}.${variant}`
          })
        });
      }
      return Base3;
    };
  }
  __name(Class52, "Class5");
  function FieldOnly2(keys2) {
    return function(schema) {
      const obj = {};
      for (const key of keys2) {
        assignProperty(obj, key, schema);
      }
      return Field(obj);
    };
  }
  __name(FieldOnly2, "FieldOnly");
  function FieldExcept2(keys2) {
    return function(schema) {
      const obj = {};
      for (const variant of options.variants) {
        if (!keys2.includes(variant)) {
          assignProperty(obj, variant, schema);
        }
      }
      return Field(obj);
    };
  }
  __name(FieldExcept2, "FieldExcept");
  function UnionVariants(members) {
    return Union3(members, options.defaultVariant, options.variants);
  }
  __name(UnionVariants, "UnionVariants");
  const fieldEvolve2 = dual(2, (self, f) => {
    const field = isField(self) ? self : Field(Object.fromEntries(options.variants.map((variant) => [variant, self])));
    return Field(evolve(field.schemas, f));
  });
  const extractVariants = dual(2, (self, variant) => extract(self, variant, {
    isDefault: variant === options.defaultVariant
  }));
  return {
    Struct: Struct2,
    Field,
    FieldOnly: FieldOnly2,
    FieldExcept: FieldExcept2,
    Class: Class52,
    Union: UnionVariants,
    fieldEvolve: fieldEvolve2,
    extract: extractVariants
  };
}, "make30");
var Override2 = /* @__PURE__ */ __name((value3) => value3, "Override2");
var Overrideable = /* @__PURE__ */ __name((schema, options) => schema.pipe(decodeTo2(brand2("Override")(toType2(schema))), withConstructorDefault2(map7(options.defaultValue, Override2))), "Overrideable");
var StructProto = {
  pipe() {
    return pipeArguments(this, arguments);
  }
};
var Struct2 = /* @__PURE__ */ __name((fields) => {
  const self = Object.create(StructProto);
  self[TypeId39] = fields;
  return self;
}, "Struct2");
var FieldProto = {
  [FieldTypeId]: FieldTypeId,
  pipe() {
    return pipeArguments(this, arguments);
  }
};
var Field = /* @__PURE__ */ __name((schemas) => {
  const self = Object.create(FieldProto);
  self.schemas = schemas;
  return self;
}, "Field");
var Union3 = /* @__PURE__ */ __name((members, defaultVariant, variants) => {
  const VariantUnion = Union2(members.map((member) => isSchema(member) ? member : extract(member, defaultVariant, {
    isDefault: true
  })));
  for (const variant of variants) {
    Object.defineProperty(VariantUnion, variant, {
      value: Union2(members.map((member) => extract(member, variant)))
    });
  }
  return VariantUnion;
}, "Union3");
var {
  Class: Class5,
  Field: Field2,
  FieldExcept,
  FieldOnly,
  Struct: Struct3,
  Union: Union4,
  extract: extract2,
  fieldEvolve
} = /* @__PURE__ */ make30({
  variants: ["select", "insert", "update", "json", "jsonCreate", "jsonUpdate"],
  defaultVariant: "select"
});
var Sensitive = /* @__PURE__ */ __name((schema) => Field2({
  select: schema,
  insert: schema,
  update: schema
}), "Sensitive");
var optionalOption = /* @__PURE__ */ __name((schema) => optionalKey2(NullOr(schema)).pipe(decodeTo2(Option(toType2(schema)), transformOptional2({
  decode: /* @__PURE__ */ __name((oe) => oe.pipe(filter(isNotNull), some2), "decode"),
  encode: flatten
}))), "optionalOption");
var FieldOption = /* @__PURE__ */ fieldEvolve({
  select: OptionFromNullOr,
  insert: OptionFromNullOr,
  update: OptionFromNullOr,
  json: optionalOption,
  jsonCreate: optionalOption,
  jsonUpdate: optionalOption
});
var BooleanSqlite = /* @__PURE__ */ Field2({
  select: BooleanFromBit,
  insert: BooleanFromBit,
  update: BooleanFromBit,
  json: Boolean2,
  jsonCreate: Boolean2,
  jsonUpdate: Boolean2
});
var DateTimeWithNow = /* @__PURE__ */ Overrideable(DateTimeUtcFromString, {
  defaultValue: now2
});
var DateTimeInsert = /* @__PURE__ */ Field2({
  select: DateTimeUtcFromString,
  insert: DateTimeWithNow,
  json: DateTimeUtcFromString
});
var DateTimeUpdate = /* @__PURE__ */ Field2({
  select: DateTimeUtcFromString,
  insert: DateTimeWithNow,
  update: DateTimeWithNow,
  json: DateTimeUtcFromString
});
var JsonFromString = /* @__PURE__ */ __name((schema) => {
  const parsed = fromJsonString2(toCodecJson(schema));
  return Field2({
    select: parsed,
    insert: parsed,
    update: parsed,
    json: schema,
    jsonCreate: schema,
    jsonUpdate: schema
  });
}, "JsonFromString");
var CanonicalJobId = String4.pipe(brand2("CanonicalJobId"));
var OccurrenceId = String4.pipe(brand2("OccurrenceId"));
var SourceId = String4.pipe(brand2("SourceId"));
var PlatformId = String4.pipe(brand2("PlatformId"));
var ProfileId = String4.pipe(brand2("ProfileId"));
var DeliveryPlatformId = String4.pipe(brand2("DeliveryPlatformId"));
var SubmissionId = String4.pipe(brand2("SubmissionId"));
var PrincipalId = String4.pipe(brand2("PrincipalId"));
var SavedJobId = String4.pipe(brand2("SavedJobId"));
var ApplicationId = String4.pipe(brand2("ApplicationId"));
var SavedSearchId = String4.pipe(brand2("SavedSearchId"));
var ScheduleId = String4.pipe(brand2("ScheduleId"));
var Sequence = Number5.pipe(brand2("Sequence"));
var RawListing = Struct({
  sourceId: SourceId,
  sourceName: String4,
  externalId: String4,
  title: String4,
  employerName: String4,
  location: String4,
  description: String4,
  applicationUrl: String4,
  publishedAt: String4,
  deadline: optional(String4)
});
var JobStatus = Union2([
  TaggedStruct("Active", {}),
  TaggedStruct("Closed", { closedAt: String4 })
]);
var NormalizedListing = Struct({
  occurrenceId: OccurrenceId,
  canonicalJobId: CanonicalJobId,
  canonicalKey: String4,
  contentFingerprint: String4,
  listing: RawListing
});
var CanonicalJob = Struct({
  id: CanonicalJobId,
  title: String4,
  employerName: String4,
  location: String4,
  description: String4,
  applicationUrl: String4,
  publishedAt: String4,
  deadline: optional(String4),
  status: JobStatus,
  sequence: Sequence,
  changedAt: String4,
  sources: ArraySchema(SourceId)
});
var ObservationOutcome = Union2([
  TaggedStruct("CreatedCanonical", { id: CanonicalJobId }),
  TaggedStruct("AddedDuplicateOccurrence", { id: CanonicalJobId }),
  TaggedStruct("UpdatedCanonical", { id: CanonicalJobId }),
  TaggedStruct("ReopenedCanonical", { id: CanonicalJobId }),
  TaggedStruct("ClosedCanonical", { id: CanonicalJobId }),
  TaggedStruct("Unchanged", {})
]);
var CanonicalJobRecord = class extends Class5("CanonicalJobRecord")({
  id: CanonicalJobId,
  canonicalKey: String4,
  title: String4,
  employerName: String4,
  location: String4,
  description: String4,
  applicationUrl: String4,
  publishedAt: String4,
  deadline: FieldOption(String4),
  statusTag: Literals(["Active", "Closed"]),
  statusClosedAt: FieldOption(String4),
  sequence: Sequence,
  changedAt: String4,
  sources: JsonFromString(ArraySchema(SourceId)),
  titleNormalized: String4,
  employerNameNormalized: String4,
  locationNormalized: String4
}) {
  static {
    __name(this, "CanonicalJobRecord");
  }
};
var OccurrenceRecord = class extends Class5("OccurrenceRecord")({
  id: OccurrenceId,
  canonicalJobId: CanonicalJobId,
  sourceId: SourceId,
  externalId: String4,
  contentFingerprint: String4,
  active: BooleanSqlite,
  firstSeenAt: String4,
  lastSeenAt: String4
}) {
  static {
    __name(this, "OccurrenceRecord");
  }
};
var AcquisitionTier = Union2([
  TaggedStruct("Feed", {}),
  TaggedStruct("Scripted", {}),
  TaggedStruct("Agent", {}),
  TaggedStruct("Unknown", {})
]);
var AutomationPolicy = Union2([
  TaggedStruct("Allowed", {}),
  TaggedStruct("AssistedOnly", {}),
  TaggedStruct("Prohibited", {}),
  TaggedStruct("Unreviewed", {})
]);
var CatalogEntry = Struct({
  id: PlatformId,
  platform: String4,
  category: String4,
  listingsUrl: String4,
  tier: AcquisitionTier,
  policy: AutomationPolicy,
  requiresPremium: Boolean2,
  priority: String4,
  confidence: String4,
  notes: String4,
  verifiedAt: String4
});
var Observation = Struct({
  platform: PlatformId,
  tier: AcquisitionTier,
  reason: String4,
  observedAt: String4,
  reachable: Boolean2
});
var CatalogRecord = class extends Class5("CatalogRecord")({
  id: PlatformId,
  platform: String4,
  category: String4,
  listingsUrl: String4,
  tierTag: Literals(["Feed", "Scripted", "Agent", "Unknown"]),
  policyTag: Literals(["Allowed", "AssistedOnly", "Prohibited", "Unreviewed"]),
  requiresPremium: BooleanSqlite,
  priority: String4,
  confidence: String4,
  notes: String4,
  verifiedAt: String4,
  createdAt: DateTimeInsert,
  updatedAt: DateTimeUpdate
}) {
  static {
    __name(this, "CatalogRecord");
  }
};
var QuestionKey = String4.pipe(brand2("QuestionKey"));
var AnswerShape = Union2([
  TaggedStruct("Text", { maxLength: optional(Number5) }),
  TaggedStruct("LongText", {}),
  TaggedStruct("Number", {}),
  TaggedStruct("Boolean", {}),
  TaggedStruct("Date", {}),
  TaggedStruct("Choice", { options: ArraySchema(String4) }),
  TaggedStruct("File", { accepts: ArraySchema(String4) })
]);
var Answer = class extends Class5("Answer")({
  profileId: ProfileId,
  question: QuestionKey,
  label: String4,
  shape: JsonFromString(AnswerShape),
  value: Sensitive(String4),
  origin: Literals(["stated", "derived", "observed"]),
  createdAt: DateTimeInsert,
  updatedAt: DateTimeUpdate
}) {
  static {
    __name(this, "Answer");
  }
};
var Credential = Union2([
  TaggedStruct("ApiKey", { principal: PrincipalId }),
  TaggedStruct("Session", { principal: PrincipalId, session: String4 })
]);
var Session = class extends Class5("Session")({
  id: String4,
  principalId: PrincipalId,
  profileId: ProfileId,
  tokenHash: Sensitive(String4),
  expiresAt: Number5,
  createdAt: DateTimeInsert,
  revokedAt: FieldOption(String4)
}) {
  static {
    __name(this, "Session");
  }
};
var Erasure = Union2([
  TaggedStruct("Active", {}),
  TaggedStruct("Requested", { at: String4, purgeAfter: String4 }),
  TaggedStruct("Purged", { at: String4 })
]);
var ERASURE_GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1e3;
var Experience = Struct({
  title: String4,
  employer: String4,
  period: String4,
  highlights: ArraySchema(String4)
});
var Profile = Struct({
  headline: String4,
  summary: String4,
  location: String4,
  languages: String4,
  skills: ArraySchema(String4),
  experience: ArraySchema(Experience),
  education: ArraySchema(String4)
});
var ProfileRecord = class extends Class5("ProfileRecord")({
  profileId: ProfileId,
  cv: JsonFromString(Profile),
  erasure: JsonFromString(Erasure),
  createdAt: DateTimeInsert,
  updatedAt: DateTimeUpdate
}) {
  static {
    __name(this, "ProfileRecord");
  }
};
var toJson2 = /* @__PURE__ */ __name((profile3) => JSON.stringify(encodeSync2(Profile)(profile3), null, 2), "toJson2");
var fromJson = /* @__PURE__ */ __name((json2) => decodeUnknownSync(Profile, { onExcessProperty: "error" })(JSON.parse(json2)), "fromJson");
var toMarkdown = /* @__PURE__ */ __name((profile3) => {
  const sections = [];
  const headline = profile3.headline.trim();
  const location = profile3.location.trim();
  const header = [headline !== "" ? `# ${headline}` : "", location].filter((line) => line !== "");
  if (header.length > 0)
    sections.push(header.join(`
`));
  const summary = profile3.summary.trim();
  if (summary !== "")
    sections.push(`## Summary

${summary}`);
  if (profile3.experience.length > 0) {
    const entries = profile3.experience.map((entry) => {
      const highlights = entry.highlights.filter((highlight) => highlight.trim() !== "").map((highlight) => `- ${highlight.trim()}`);
      return [
        `### ${entry.title.trim()} \u2014 ${entry.employer.trim()} (${entry.period.trim()})`,
        ...highlights
      ].join(`
`);
    });
    sections.push(["## Experience", ...entries].join(`

`));
  }
  const skills = profile3.skills.filter((skill) => skill.trim() !== "");
  if (skills.length > 0)
    sections.push(`## Skills

${skills.join(", ")}`);
  const education = profile3.education.filter((entry) => entry.trim() !== "");
  if (education.length > 0) {
    sections.push(`## Education

${education.map((entry) => `- ${entry}`).join(`
`)}`);
  }
  const languages = profile3.languages.trim();
  if (languages !== "")
    sections.push(`## Languages

${languages}`);
  return sections.join(`

`);
}, "toMarkdown");
var Unauthorized = class extends TaggedError3()("Unauthorized", {
  message: String4
}, { httpApiStatus: 401 }) {
  static {
    __name(this, "Unauthorized");
  }
};
var NotFound = class extends TaggedError3()("NotFound", {
  message: String4
}, { httpApiStatus: 404 }) {
  static {
    __name(this, "NotFound");
  }
};
var UpgradeRequired = class extends TaggedError3()("UpgradeRequired", {
  capability: String4
}, { httpApiStatus: 402 }) {
  static {
    __name(this, "UpgradeRequired");
  }
};
var ForbiddenByPlatform = class extends TaggedError3()("ForbiddenByPlatform", { platform: String4, policy: String4 }, { httpApiStatus: 403 }) {
  static {
    __name(this, "ForbiddenByPlatform");
  }
};
var InvalidProfileJson = class extends TaggedError3()("InvalidProfileJson", { message: String4 }, { httpApiStatus: 400 }) {
  static {
    __name(this, "InvalidProfileJson");
  }
};
var CurrentPrincipal = class extends Service()("@job-index/CurrentPrincipal") {
  static {
    __name(this, "CurrentPrincipal");
  }
};
var Authenticated = class extends Service2()("@job-index/Authenticated", {
  error: Unauthorized,
  security: { session: bearer }
}) {
  static {
    __name(this, "Authenticated");
  }
};
var PageMeta = Struct({
  limit: Number5,
  nextCursor: NullOr(String4)
});
var JobPage = Struct({
  data: ArraySchema(CanonicalJob),
  meta: PageMeta
});
var corpus = make29("corpus").add(get3("listJobs", "/api/v1/jobs", {
  query: {
    term: optional(String4),
    location: optional(String4),
    status: optional(String4),
    cursor: optional(String4),
    limit: optional(String4)
  },
  success: JobPage
}), get3("getJob", "/api/v1/jobs/:id", {
  params: { id: String4 },
  success: CanonicalJob,
  error: NotFound
}), get3("listSources", "/api/v1/sources/catalog", {
  query: { tier: optional(String4) },
  success: Struct({ data: ArraySchema(CatalogEntry) })
}));
var feed = make29("feed").add(get3("fresh", "/api/v1/me/feed", {
  query: { limit: optional(String4) },
  success: JobPage,
  error: Unauthorized
}), post("dismiss", "/api/v1/me/feed/:id/dismiss", {
  params: { id: String4 },
  payload: Struct({ verdict: String4, reason: optional(String4) }),
  success: Struct({ dismissed: String4 }),
  error: Unauthorized
})).middleware(Authenticated);
var profile = make29("profile").add(get3("me", "/api/v1/me", {
  success: Struct({
    profile: Profile,
    capabilities: ArraySchema(String4)
  }),
  error: Unauthorized
}), put("setProfile", "/api/v1/me/profile", {
  payload: Profile,
  success: Profile,
  error: Unauthorized
}), put("setAnswer", "/api/v1/me/answers/:question", {
  params: { question: String4 },
  payload: Struct({
    value: String4,
    label: optional(String4),
    shape: optional(AnswerShape)
  }),
  success: Struct({ question: String4 }),
  error: Unauthorized
}), get3("exportProfile", "/api/v1/me/profile/export", {
  success: Struct({ json: String4, markdown: String4 }),
  error: Unauthorized
}), put("importProfile", "/api/v1/me/profile/import", {
  payload: Struct({ json: String4 }),
  success: Profile,
  error: [Unauthorized, InvalidProfileJson]
})).middleware(Authenticated);
var applications = make29("applications").add(post("save", "/api/v1/me/saved", {
  payload: Struct({ jobId: String4, note: optional(String4) }),
  success: Struct({ savedJobId: String4 }),
  error: [Unauthorized, NotFound]
}), post("draft", "/api/v1/me/saved/:id/draft", {
  params: { id: String4 },
  payload: Struct({ generator: optional(String4) }),
  success: Struct({
    cv: String4,
    letter: String4,
    generator: String4
  }),
  error: [Unauthorized, NotFound, UpgradeRequired]
}), post("prepare", "/api/v1/me/saved/:id/apply", {
  params: { id: String4 },
  payload: Struct({ method: optional(String4) }),
  success: Struct({
    applicationId: String4,
    method: String4,
    applicationUrl: String4,
    cv: String4,
    letter: String4,
    downgradeReason: NullOr(String4)
  }),
  error: [Unauthorized, NotFound, UpgradeRequired, ForbiddenByPlatform]
}), post("decide", "/api/v1/me/applications/:id/decision", {
  params: { id: String4 },
  payload: Struct({ decision: String4, notes: optional(String4) }),
  success: Struct({ applicationId: String4, status: String4 }),
  error: [Unauthorized, NotFound]
})).middleware(Authenticated);
var api = make28("job-index").add(corpus, feed, profile, applications);
var Accounts = class extends Service()("@job-index/Accounts") {
  static {
    __name(this, "Accounts");
  }
};
var Profiles = class extends Service()("@job-index/Profiles") {
  static {
    __name(this, "Profiles");
  }
};
var layer6 = effect(Authenticated, gen2(function* () {
  const accounts = yield* Accounts;
  return Authenticated.of({
    session: /* @__PURE__ */ __name((httpEffect, { credential }) => gen2(function* () {
      const presented = value2(credential);
      const resolved = yield* accounts.authenticate(presented);
      if (resolved === void 0) {
        return yield* fail5(new Unauthorized({ message: "unknown, revoked, or expired token" }));
      }
      const profileId = yield* accounts.profileOf(resolved);
      if (profileId === void 0) {
        return yield* fail5(new Unauthorized({ message: "credential has no active profile" }));
      }
      const principal = CurrentPrincipal.of({ principalId: resolved.principal, profileId });
      return yield* provideService2(httpEffect, CurrentPrincipal, principal);
    }), "session")
  });
}));
var Corpus = class extends Service()("@job-index/Corpus") {
  static {
    __name(this, "Corpus");
  }
};
var SourceCatalog = class extends Service()("@job-index/SourceCatalog") {
  static {
    __name(this, "SourceCatalog");
  }
};
var decodeCanonicalJobId = decodeUnknownSync(CanonicalJobId);
var decodeProfileId = decodeUnknownSync(ProfileId);
var decodeSavedJobId = decodeUnknownSync(SavedJobId);
var decodeApplicationId = decodeUnknownSync(ApplicationId);
var decodeSequence = decodeUnknownSync(Sequence);
var decodeCursor = /* @__PURE__ */ __name((cursor) => cursor === void 0 ? decodeSequence(0) : decodeSequence(Number(cursor)), "decodeCursor");
var nextCursorOf = /* @__PURE__ */ __name((items, limit) => items.length < limit ? null : String(items[items.length - 1]?.sequence ?? ""), "nextCursorOf");
var DEFAULT_PAGE_LIMIT = 20;
var MAX_PAGE_LIMIT = 100;
var decodeLimit = /* @__PURE__ */ __name((raw2, fallback = DEFAULT_PAGE_LIMIT) => {
  const parsed = raw2 === void 0 ? fallback : Number(raw2);
  if (!Number.isFinite(parsed) || parsed <= 0)
    return fallback;
  return Math.min(Math.trunc(parsed), MAX_PAGE_LIMIT);
}, "decodeLimit");
var decodeEnum = /* @__PURE__ */ __name((...values) => (raw2, fallback) => {
  const value3 = raw2 ?? fallback;
  if (value3 === void 0 || !values.includes(value3)) {
    throw new Error(`expected one of ${values.join(", ")}, got ${JSON.stringify(value3)}`);
  }
  return value3;
}, "decodeEnum");
var layer7 = group(api, "corpus", (handlers) => handlers.handle("listJobs", ({ query }) => gen2(function* () {
  const corpus22 = yield* Corpus;
  const limit = decodeLimit(query.limit);
  const cursor = decodeCursor(query.cursor);
  const filter6 = decodeJobFilter(query);
  const data = filter6 === void 0 ? yield* corpus22.changedSince(cursor, limit) : yield* corpus22.search(filter6, cursor, limit);
  return { data, meta: { limit, nextCursor: nextCursorOf(data, limit) } };
})).handle("getJob", ({ params }) => gen2(function* () {
  const corpus22 = yield* Corpus;
  const job = yield* corpus22.get(decodeCanonicalJobId(params.id));
  if (job === void 0) {
    return yield* fail5(new NotFound({ message: `no job with id ${params.id}` }));
  }
  return job;
})).handle("listSources", ({ query }) => gen2(function* () {
  const catalog = yield* SourceCatalog;
  const tier = tierOf(query.tier);
  const data = yield* catalog.list(tier);
  return { data };
})));
var decodeStatus = decodeEnum("Active", "Closed");
var nonEmpty = /* @__PURE__ */ __name((raw2) => {
  if (raw2 === void 0)
    return;
  const trimmed = raw2.trim();
  return trimmed === "" ? void 0 : trimmed;
}, "nonEmpty");
var decodeJobFilter = /* @__PURE__ */ __name((query) => {
  const term = nonEmpty(query.term);
  const location = nonEmpty(query.location);
  const status2 = query.status === void 0 ? void 0 : decodeStatus(query.status);
  return term === void 0 && location === void 0 && status2 === void 0 ? void 0 : { term, location, status: status2 };
}, "decodeJobFilter");
var tierOf = /* @__PURE__ */ __name((raw2) => {
  switch (raw2) {
    case "feed":
      return { _tag: "Feed" };
    case "scripted":
      return { _tag: "Scripted" };
    case "agent":
      return { _tag: "Agent" };
    case "unknown":
      return { _tag: "Unknown" };
    default:
      return;
  }
}, "tierOf");
var Judgements = class extends Service()("@job-index/Judgements") {
  static {
    __name(this, "Judgements");
  }
};
var decodeVerdict = decodeEnum("dismissed", "not_now", "irrelevant");
var layer8 = group(api, "feed", (handlers) => handlers.handle("fresh", ({ query }) => gen2(function* () {
  const corpus22 = yield* Corpus;
  const principal = yield* CurrentPrincipal;
  const limit = decodeLimit(query.limit);
  const data = yield* corpus22.fresh(principal.profileId, limit);
  return { data, meta: { limit, nextCursor: nextCursorOf(data, limit) } };
})).handle("dismiss", ({ params, payload }) => gen2(function* () {
  const judgements = yield* Judgements;
  const principal = yield* CurrentPrincipal;
  const jobId = decodeCanonicalJobId(params.id);
  yield* judgements.record(principal.profileId, jobId, decodeVerdict(payload.verdict), payload.reason);
  return { dismissed: params.id };
})));
var Entitlements = class extends Service()("@job-index/Entitlements") {
  static {
    __name(this, "Entitlements");
  }
};
var decodeQuestionKey = decodeUnknownSync(QuestionKey);
var describeImportFailure = /* @__PURE__ */ __name((error) => error instanceof Error ? error.message : String(error), "describeImportFailure");
var ALL_CAPABILITIES = [
  "model-drafting",
  "automated-apply",
  "agent-acquisition",
  "scheduled-applications"
];
var layer9 = group(api, "profile", (handlers) => handlers.handle("me", () => gen2(function* () {
  const profiles = yield* Profiles;
  const entitlements = yield* Entitlements;
  const principal = yield* CurrentPrincipal;
  const profile22 = yield* profiles.get(principal.profileId);
  const held = yield* all2(ALL_CAPABILITIES.map((capability) => map7(entitlements.has(principal.profileId, capability), (has2) => has2 ? capability : void 0)));
  return { profile: profile22, capabilities: held.filter((c) => c !== void 0) };
})).handle("setProfile", ({ payload }) => gen2(function* () {
  const profiles = yield* Profiles;
  const principal = yield* CurrentPrincipal;
  return yield* profiles.set(principal.profileId, payload);
})).handle("setAnswer", ({ params, payload }) => gen2(function* () {
  const profiles = yield* Profiles;
  const principal = yield* CurrentPrincipal;
  const question = decodeQuestionKey(params.question);
  yield* profiles.answer(principal.profileId, question, payload.value, {
    label: payload.label ?? params.question,
    shape: payload.shape ?? { _tag: "Text" }
  });
  return { question: params.question };
})).handle("exportProfile", () => gen2(function* () {
  const profiles = yield* Profiles;
  const principal = yield* CurrentPrincipal;
  const profile22 = yield* profiles.get(principal.profileId);
  return { json: toJson2(profile22), markdown: toMarkdown(profile22) };
})).handle("importProfile", ({ payload }) => gen2(function* () {
  const profiles = yield* Profiles;
  const principal = yield* CurrentPrincipal;
  const profile22 = yield* try_2({
    try: /* @__PURE__ */ __name(() => fromJson(payload.json), "try"),
    catch: /* @__PURE__ */ __name((error) => new InvalidProfileJson({ message: describeImportFailure(error) }), "catch")
  });
  return yield* profiles.set(principal.profileId, profile22);
})));
var Drafting = class extends Service()("@job-index/Drafting") {
  static {
    __name(this, "Drafting");
  }
};
var Applications = class extends Service()("@job-index/Applications") {
  static {
    __name(this, "Applications");
  }
};
var SavedJobs = class extends Service()("@job-index/SavedJobs") {
  static {
    __name(this, "SavedJobs");
  }
};
var decodeGenerator = decodeEnum("template", "model");
var decodeMethod = decodeEnum("assisted", "automated");
var decodeDecision = decodeEnum("approve", "rework", "decline");
var statusOf = /* @__PURE__ */ __name((decision) => decision === "approve" ? "submitted" : decision === "decline" ? "withdrawn" : "ready", "statusOf");
var layer10 = group(api, "applications", (handlers) => handlers.handle("save", ({ payload }) => gen2(function* () {
  const corpus22 = yield* Corpus;
  const savedJobs = yield* SavedJobs;
  const principal = yield* CurrentPrincipal;
  const jobId = decodeCanonicalJobId(payload.jobId);
  const job = yield* corpus22.get(jobId);
  if (job === void 0) {
    return yield* fail5(new NotFound({ message: `no job with id ${payload.jobId}` }));
  }
  const savedJobId = yield* savedJobs.save(principal.profileId, jobId, payload.note ?? "");
  return { savedJobId };
})).handle("draft", ({ params, payload }) => gen2(function* () {
  const savedJobs = yield* SavedJobs;
  const corpus22 = yield* Corpus;
  const profiles = yield* Profiles;
  const entitlements = yield* Entitlements;
  const drafting = yield* Drafting;
  const principal = yield* CurrentPrincipal;
  const savedJobId = decodeSavedJobId(params.id);
  const jobId = yield* savedJobs.resolve(principal.profileId, savedJobId);
  if (jobId === void 0) {
    return yield* fail5(new NotFound({ message: `no saved job with id ${params.id}` }));
  }
  const job = yield* corpus22.get(jobId);
  if (job === void 0) {
    return yield* fail5(new NotFound({ message: `saved job ${params.id} has no live listing` }));
  }
  const generator = decodeGenerator(payload.generator, "template");
  if (generator === "model") {
    yield* entitlements.require(principal.profileId, "model-drafting").pipe(catchTag2("EntitlementRequired", (e) => fail5(new UpgradeRequired({ capability: e.capability }))));
  }
  const profile22 = yield* profiles.get(principal.profileId);
  const documents = yield* drafting.compose(profile22, job).pipe(catchTag2("ProfileIncomplete", (e) => fail5(new NotFound({ message: `profile is missing: ${e.missing}` }))));
  return documents;
})).handle("prepare", ({ params, payload }) => gen2(function* () {
  const applications22 = yield* Applications;
  const principal = yield* CurrentPrincipal;
  const savedJobId = decodeSavedJobId(params.id);
  const method = decodeMethod(payload.method, "assisted");
  const prepared = yield* applications22.prepare(principal.profileId, savedJobId, method).pipe(catchTags2({
    DraftMissing: /* @__PURE__ */ __name((e) => fail5(new NotFound({ message: `no draft for saved job ${e.savedJob}` })), "DraftMissing"),
    EntitlementRequired: /* @__PURE__ */ __name((e) => fail5(new UpgradeRequired({ capability: e.capability })), "EntitlementRequired"),
    PolicyProhibited: /* @__PURE__ */ __name((e) => fail5(new ForbiddenByPlatform({ platform: e.platform, policy: e.policy })), "PolicyProhibited")
  }));
  return {
    applicationId: prepared.application,
    method: prepared.method,
    applicationUrl: prepared.applicationUrl,
    cv: prepared.documents.cv,
    letter: prepared.documents.letter,
    downgradeReason: prepared.downgradeReason ?? null
  };
})).handle("decide", ({ params, payload }) => gen2(function* () {
  const applications22 = yield* Applications;
  const principal = yield* CurrentPrincipal;
  const applicationId = decodeApplicationId(params.id);
  const decision = decodeDecision(payload.decision);
  const status2 = statusOf(decision);
  yield* applications22.setStatus(principal.profileId, applicationId, status2, payload.notes ?? "");
  return { applicationId: params.id, status: status2 };
})));
var auth = layer6;
var corpus2 = layer7;
var feed2 = layer8;
var profile2 = layer9;
var applications2 = layer10;
var EnvironmentIncomplete = class extends TaggedError2("EnvironmentIncomplete") {
  static {
    __name(this, "EnvironmentIncomplete");
  }
  get message() {
    return `worker environment is missing: ${this.missing.join(", ")}`;
  }
};
var isD1 = /* @__PURE__ */ __name((value3) => typeof value3 === "object" && value3 !== null && typeof value3.prepare === "function" && typeof value3.batch === "function", "isD1");
var isNonEmptyString = /* @__PURE__ */ __name((value3) => typeof value3 === "string" && value3.trim().length > 0, "isNonEmptyString");
var decodeEnv = /* @__PURE__ */ __name((env) => {
  const bag = typeof env === "object" && env !== null ? env : {};
  const missing2 = [];
  if (!isD1(bag.DB)) {
    missing2.push("DB (a D1 binding)");
  }
  if (!isNonEmptyString(bag.ENVIRONMENT)) {
    missing2.push("ENVIRONMENT");
  }
  if (missing2.length > 0) {
    throw new EnvironmentIncomplete({ missing: missing2 });
  }
  return { DB: bag.DB, ENVIRONMENT: bag.ENVIRONMENT };
}, "decodeEnv");
var Database = class extends Service()("@job-index/Database") {
  static {
    __name(this, "Database");
  }
};
var normalizeBinding = /* @__PURE__ */ __name((value3) => {
  if (value3 === void 0 || value3 === null)
    return null;
  if (typeof value3 === "string" || typeof value3 === "number")
    return value3;
  if (typeof value3 === "bigint") {
    throw new TypeError(`bigint binding ${value3.toString()} is not representable \u2014 D1 rejects bigint outright, and no column in this schema is declared to need 64-bit precision; encode to a Number upstream`);
  }
  if (typeof value3 === "boolean") {
    throw new TypeError(`boolean binding ${String(value3)} reached the D1 boundary unencoded \u2014 Model.BooleanSqlite must convert it to 0/1 before it gets here`);
  }
  throw new TypeError(`binding of type ${typeof value3} is not representable in D1: ${String(value3)}`);
}, "normalizeBinding");
var toBindings = /* @__PURE__ */ __name((row, columns3) => columns3.map((column) => normalizeBinding(Object.hasOwn(row, column) ? row[column] : void 0)), "toBindings");
if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest;
  it("documents the undefined-to-null rule truthfully", () => {
    expect(normalizeBinding(void 0)).toBe(null);
    expect(normalizeBinding(null)).toBe(null);
    expect(normalizeBinding("x")).toBe("x");
    expect(normalizeBinding(3)).toBe(3);
  });
}
var bind2 = /* @__PURE__ */ __name((statement, bindings) => statement.bind(...bindings.map(normalizeBinding)), "bind2");
var build2 = /* @__PURE__ */ __name((d1) => {
  const realQuery = /* @__PURE__ */ __name((sql, bindings) => tryPromise2(() => bind2(d1.prepare(sql), bindings).all()).pipe(map7((result3) => result3.results), orDie2), "realQuery");
  const realRun = /* @__PURE__ */ __name((sql, bindings) => tryPromise2(() => bind2(d1.prepare(sql), bindings).run()).pipe(asVoid2, orDie2), "realRun");
  const atomic = /* @__PURE__ */ __name((writes) => writes.length === 0 ? void_3 : tryPromise2(() => d1.batch(writes.map((write) => bind2(d1.prepare(write.sql), write.bindings)))).pipe(asVoid2, orDie2), "atomic");
  return { query: realQuery, run: realRun, atomic };
}, "build2");
var layer11 = /* @__PURE__ */ __name((d1) => succeed4(Database, build2(d1)), "layer11");
var sha256Hex = /* @__PURE__ */ __name((secret) => promise2(async () => {
  const bytes = new TextEncoder().encode(secret);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}), "sha256Hex");
var timingSafeEqual = /* @__PURE__ */ __name((a, b) => {
  const encoder4 = new TextEncoder();
  const left = encoder4.encode(a);
  const right = encoder4.encode(b);
  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < length; i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}, "timingSafeEqual");
if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest;
  it("hashes deterministically and never reproduces the input", () => {
    return runPromise2(gen2(function* () {
      const digest = yield* sha256Hex("a shared secret");
      expect(digest).not.toBe("a shared secret");
      expect(digest).toBe(yield* sha256Hex("a shared secret"));
    }));
  });
  it("timingSafeEqual agrees with === on equal, differing-content, and differing-length inputs", () => {
    expect(timingSafeEqual("same-secret", "same-secret")).toBe(true);
    expect(timingSafeEqual("same-secret", "sbme-secret")).toBe(false);
    expect(timingSafeEqual("short", "much-longer-string")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });
}
var Principal = class extends Class5("Principal")({
  principalId: PrincipalId,
  profileId: ProfileId,
  apiKeyHash: Sensitive(String4),
  revokedAt: FieldOption(String4),
  createdAt: DateTimeInsert,
  updatedAt: DateTimeUpdate
}) {
  static {
    __name(this, "Principal");
  }
};
var PROFILE_FIELDS = Object.keys(ProfileRecord.select.fields);
var PRINCIPAL_FIELDS = Object.keys(Principal.select.fields);
var PROFILE_UPDATE_FIELDS = PROFILE_FIELDS.filter((field) => field !== "profileId" && field !== "createdAt");
var columns = /* @__PURE__ */ __name((fields2) => fields2.join(", "), "columns");
var placeholders = /* @__PURE__ */ __name((fields2) => fields2.map(() => "?").join(", "), "placeholders");
var FIND_PROFILE_ROW = `-- accounts:findProfileRow
SELECT ${columns(PROFILE_FIELDS)} FROM profiles WHERE profileId = ?`;
var INSERT_PROFILE = `-- accounts:insertProfile
INSERT INTO profiles (${columns(PROFILE_FIELDS)}) VALUES (${placeholders(PROFILE_FIELDS)})`;
var UPDATE_PROFILE = `-- accounts:updateProfile
UPDATE profiles SET ${PROFILE_UPDATE_FIELDS.map((field) => `${field} = ?`).join(", ")} WHERE profileId = ?`;
var FIND_PRINCIPAL_BY_API_KEY_HASH = `-- accounts:findPrincipalByApiKeyHash
SELECT ${columns(PRINCIPAL_FIELDS)} FROM principals WHERE apiKeyHash = ?`;
var PROFILE_FOR_PRINCIPAL = `-- accounts:profileForPrincipal
SELECT profileId FROM principals WHERE principalId = ?`;
var encodeCv = encodeSync2(ProfileRecord.select.fields.cv);
var decodeCv = decodeUnknownSync(ProfileRecord.select.fields.cv);
var encodeErasure = encodeSync2(ProfileRecord.select.fields.erasure);
var decodeErasure = decodeUnknownSync(ProfileRecord.select.fields.erasure);
var emptyProfile = {
  headline: "",
  summary: "",
  location: "",
  languages: "",
  skills: [],
  experience: [],
  education: []
};
var ACTIVE_ERASURE = { _tag: "Active" };
var toDomainProfile = /* @__PURE__ */ __name((row) => decodeCv(row.cv), "toDomainProfile");
var toDomainErasure = /* @__PURE__ */ __name((row) => row === void 0 ? ACTIVE_ERASURE : decodeErasure(row.erasure), "toDomainErasure");
var readProfileRow = /* @__PURE__ */ __name((db, profileId) => db.query(FIND_PROFILE_ROW, [profileId]).pipe(map7((rows) => rows[0])), "readProfileRow");
var writeProfileRow = /* @__PURE__ */ __name((db, row) => gen2(function* () {
  const existing = yield* readProfileRow(db, row.profileId);
  if (existing === void 0) {
    yield* db.run(INSERT_PROFILE, PROFILE_FIELDS.map((field) => row[field]));
  } else {
    yield* db.run(UPDATE_PROFILE, [row.cv, row.erasure, row.updatedAt, row.profileId]);
  }
}), "writeProfileRow");
var writeProfile = /* @__PURE__ */ __name((db, profileId, profile3, now3) => gen2(function* () {
  const existing = yield* readProfileRow(db, profileId);
  yield* writeProfileRow(db, {
    profileId,
    cv: encodeCv(profile3),
    erasure: existing?.erasure ?? encodeErasure(ACTIVE_ERASURE),
    createdAt: existing?.createdAt ?? now3,
    updatedAt: now3
  });
}), "writeProfile");
var writeErasureRequested = /* @__PURE__ */ __name((db, profileId, requestedAt, purgeAfter, now3) => gen2(function* () {
  const existing = yield* readProfileRow(db, profileId);
  yield* writeProfileRow(db, {
    profileId,
    cv: existing?.cv ?? encodeCv(emptyProfile),
    erasure: encodeErasure({ _tag: "Requested", at: requestedAt, purgeAfter }),
    createdAt: existing?.createdAt ?? now3,
    updatedAt: now3
  });
}), "writeErasureRequested");
var findValidSession = /* @__PURE__ */ __name((db, presentedHash) => gen2(function* () {
  const rows = yield* db.query(`-- accounts:findSessionByTokenHash
SELECT id, principalId, profileId, tokenHash, expiresAt, revokedAt FROM sessions WHERE tokenHash = ?`, [presentedHash]);
  const row = rows[0];
  if (row === void 0)
    return none2();
  if (!timingSafeEqual(row.tokenHash, presentedHash))
    return none2();
  if (row.revokedAt !== null)
    return none2();
  if (row.expiresAt <= Date.now())
    return none2();
  return some2(row);
}), "findValidSession");
var findValidPrincipal = /* @__PURE__ */ __name((db, presentedHash) => gen2(function* () {
  const rows = yield* db.query(FIND_PRINCIPAL_BY_API_KEY_HASH, [presentedHash]);
  const row = rows[0];
  if (row === void 0)
    return none2();
  if (!timingSafeEqual(row.apiKeyHash, presentedHash))
    return none2();
  if (row.revokedAt !== null)
    return none2();
  return some2(row);
}), "findValidPrincipal");
var resolveProfileId = /* @__PURE__ */ __name((db, credential) => credential._tag === "Session" ? db.query(`-- accounts:profileForSession
SELECT profileId FROM sessions WHERE id = ?`, [credential.session]).pipe(map7((rows) => rows[0] ? some2(decodeUnknownSync(ProfileId)(rows[0].profileId)) : none2())) : db.query(PROFILE_FOR_PRINCIPAL, [credential.principal]).pipe(map7((rows) => rows[0] ? some2(decodeUnknownSync(ProfileId)(rows[0].profileId)) : none2())), "resolveProfileId");
var layer12 = effect(Accounts, gen2(function* () {
  const db = yield* Database;
  const authenticate = /* @__PURE__ */ __name((presented) => gen2(function* () {
    const hash2 = yield* sha256Hex(presented);
    const session = yield* findValidSession(db, hash2);
    if (isSome2(session)) {
      const credential = {
        _tag: "Session",
        principal: decodeUnknownSync(PrincipalId)(session.value.principalId),
        session: session.value.id
      };
      return credential;
    }
    const principal = yield* findValidPrincipal(db, hash2);
    if (isSome2(principal)) {
      const credential = {
        _tag: "ApiKey",
        principal: decodeUnknownSync(PrincipalId)(principal.value.principalId)
      };
      return credential;
    }
    return;
  }), "authenticate");
  const profileOf = /* @__PURE__ */ __name((credential) => gen2(function* () {
    const profileId = yield* resolveProfileId(db, credential);
    if (isNone2(profileId))
      return;
    const row = yield* readProfileRow(db, profileId.value);
    const erasure = toDomainErasure(row);
    return erasure._tag === "Active" ? profileId.value : void 0;
  }), "profileOf");
  const requestErasure = /* @__PURE__ */ __name((profile3) => gen2(function* () {
    const now3 = /* @__PURE__ */ new Date();
    const nowIso = now3.toISOString();
    const purgeAfter = new Date(now3.getTime() + ERASURE_GRACE_PERIOD_MS).toISOString();
    yield* writeErasureRequested(db, profile3, nowIso, purgeAfter, nowIso);
  }), "requestErasure");
  return { authenticate, profileOf, requestErasure };
}));
var findAnswerRow = /* @__PURE__ */ __name((db, profile3, question) => db.query(`-- accounts:findAnswer
SELECT * FROM answers WHERE profileId = ? AND question = ?`, [profile3, question]).pipe(map7((rows) => rows[0])), "findAnswerRow");
var upsertAnswer = /* @__PURE__ */ __name((db, profile3, question, value3, asked) => gen2(function* () {
  const existing = yield* findAnswerRow(db, profile3, question);
  const now3 = (/* @__PURE__ */ new Date()).toISOString();
  if (existing === void 0) {
    yield* db.run(`-- accounts:insertAnswer
INSERT INTO answers (profileId, question, label, shape, value, origin, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [profile3, question, asked.label, JSON.stringify(asked.shape), value3, "stated", now3, now3]);
  } else {
    yield* db.run(`-- accounts:updateAnswer
UPDATE answers SET value = ?, updatedAt = ? WHERE profileId = ? AND question = ?`, [value3, now3, profile3, question]);
  }
}), "upsertAnswer");
var unansweredOf = /* @__PURE__ */ __name((asked, answered) => asked.filter((question) => !answered.has(question)), "unansweredOf");
if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest;
  it("keeps only asked questions absent from the answered set, in order", () => {
    const decode = decodeUnknownSync(QuestionKey);
    const asked = ["headline", "years-experience", "visa-status"].map((raw2) => decode(raw2));
    expect(unansweredOf(asked, /* @__PURE__ */ new Set(["years-experience"]))).toEqual(["headline", "visa-status"]);
  });
}
var layer13 = effect(Profiles, gen2(function* () {
  const db = yield* Database;
  const get4 = /* @__PURE__ */ __name((profile3) => readProfileRow(db, profile3).pipe(map7((row) => row === void 0 ? emptyProfile : toDomainProfile(row))), "get4");
  const set4 = /* @__PURE__ */ __name((profile3, value3) => gen2(function* () {
    const now3 = (/* @__PURE__ */ new Date()).toISOString();
    yield* writeProfile(db, profile3, value3, now3);
    return value3;
  }), "set4");
  const answers = /* @__PURE__ */ __name((profile3) => db.query(`-- accounts:listAnswers
SELECT * FROM answers WHERE profileId = ?`, [
    profile3
  ]).pipe(map7((rows) => rows.map((row) => decodeUnknownSync(Answer)(row)))), "answers");
  const answer = /* @__PURE__ */ __name((profile3, question, value3, asked) => upsertAnswer(db, profile3, question, value3, asked), "answer");
  const unanswered = /* @__PURE__ */ __name((profile3, asked) => db.query(`-- accounts:answeredQuestions
SELECT DISTINCT question FROM answers WHERE profileId = ?`, [profile3]).pipe(map7((rows) => unansweredOf(asked, new Set(rows.map((row) => row.question))))), "unanswered");
  return { get: get4, set: set4, answers, answer, unanswered };
}));
var layer14 = mergeAll2(layer12, layer13);
var FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
var FNV_PRIME = 0x100000001b3n;
var MASK_64 = 0xffffffffffffffffn;
var fnv1a64 = /* @__PURE__ */ __name((input) => {
  let hash2 = FNV_OFFSET_BASIS;
  for (let index = 0; index < input.length; index++) {
    hash2 ^= BigInt(input.charCodeAt(index));
    hash2 = hash2 * FNV_PRIME & MASK_64;
  }
  return hash2.toString(16).padStart(16, "0");
}, "fnv1a64");
var TRACKING_PARAM_NAMES = /* @__PURE__ */ new Set([
  "gclid",
  "fbclid",
  "msclkid",
  "yclid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "ref",
  "referrer"
]);
var isTrackingParam = /* @__PURE__ */ __name((key) => {
  const lower = key.toLowerCase();
  return lower.startsWith("utm_") || TRACKING_PARAM_NAMES.has(lower);
}, "isTrackingParam");
var canonicalizeUrl = /* @__PURE__ */ __name((raw2) => {
  let url;
  try {
    url = new URL(raw2);
  } catch {
    return raw2.trim().toLowerCase();
  }
  const kept = Array.from(url.searchParams.entries()).filter(([key]) => !isTrackingParam(key)).toSorted(([keyA, valueA], [keyB, valueB]) => keyA === keyB ? valueA.localeCompare(valueB) : keyA.localeCompare(keyB));
  const query = kept.map(([key, value3]) => `${key}=${value3}`).join("&");
  const path = url.pathname.replace(/\/+$/, "") || "/";
  return `${url.protocol}//${url.host.toLowerCase()}${path}${query === "" ? "" : `?${query}`}`;
}, "canonicalizeUrl");
var normalizeText = /* @__PURE__ */ __name((value3) => value3.trim().toLowerCase().replace(/\s+/g, " "), "normalizeText");
var deriveCanonicalKey = /* @__PURE__ */ __name((raw2) => [normalizeText(raw2.title), normalizeText(raw2.employerName), normalizeText(raw2.location)].join("\0"), "deriveCanonicalKey");
var deriveOccurrenceId = /* @__PURE__ */ __name((raw2) => `oc_${fnv1a64(`${raw2.sourceId}\0${raw2.externalId}`)}`, "deriveOccurrenceId");
var deriveCanonicalJobId = /* @__PURE__ */ __name((canonicalKey) => `cj_${fnv1a64(canonicalKey)}`, "deriveCanonicalJobId");
var deriveContentFingerprint = /* @__PURE__ */ __name((raw2) => fnv1a64([
  normalizeText(raw2.title),
  normalizeText(raw2.employerName),
  normalizeText(raw2.location),
  raw2.description,
  canonicalizeUrl(raw2.applicationUrl),
  raw2.publishedAt,
  raw2.deadline ?? ""
].join("\0")), "deriveContentFingerprint");
var normalize2 = /* @__PURE__ */ __name((raw2) => {
  const canonicalKey = deriveCanonicalKey(raw2);
  return {
    occurrenceId: deriveOccurrenceId(raw2),
    canonicalJobId: deriveCanonicalJobId(canonicalKey),
    canonicalKey,
    contentFingerprint: deriveContentFingerprint(raw2),
    listing: raw2
  };
}, "normalize2");
if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest;
  it("fnv1a64 is deterministic and produces a fixed-width hex digest", () => {
    expect(fnv1a64("same input")).toBe(fnv1a64("same input"));
    expect(fnv1a64("a")).not.toBe(fnv1a64("b"));
    expect(fnv1a64("").length).toBe(16);
  });
  it("canonicalizeUrl strips tracking parameters and sorts the rest", () => {
    expect(canonicalizeUrl("https://EXAMPLE.com/job/1/?utm_source=x&b=2&a=1")).toBe("https://example.com/job/1?a=1&b=2");
    expect(canonicalizeUrl("not a url")).toBe("not a url");
  });
  it("normalize derives a stable canonicalJobId for the same listing", () => {
    const listing = {
      sourceId: "nav",
      sourceName: "NAV",
      externalId: "123",
      title: "Baker",
      employerName: "Bakery AS",
      location: "Oslo",
      description: "Bakes bread.",
      applicationUrl: "https://example.com/job/123",
      publishedAt: "2026-01-01T00:00:00Z"
    };
    expect(normalize2(listing).canonicalJobId).toBe(normalize2(listing).canonicalJobId);
  });
}
var CANONICAL_JOB_FIELDS = Object.keys(CanonicalJobRecord.select.fields);
var OCCURRENCE_FIELDS = Object.keys(OccurrenceRecord.select.fields);
var columns2 = /* @__PURE__ */ __name((fields2) => fields2.join(", "), "columns2");
var placeholders2 = /* @__PURE__ */ __name((fields2) => fields2.map(() => "?").join(", "), "placeholders2");
var selectFrom = /* @__PURE__ */ __name((table, fields2, where) => `SELECT ${columns2(fields2)} FROM ${table} ${where}`, "selectFrom");
var insertInto = /* @__PURE__ */ __name((table, fields2) => `INSERT INTO ${table} (${columns2(fields2)}) VALUES (${placeholders2(fields2)})`, "insertInto");
var update = /* @__PURE__ */ __name((table, fields2, key) => {
  const assignments = fields2.filter((field) => field !== key).map((field) => `${field} = ?`).join(", ");
  return `UPDATE ${table} SET ${assignments} WHERE ${key} = ?`;
}, "update");
var SELECT_CANONICAL_JOB_BY_ID = selectFrom("canonical_jobs", CANONICAL_JOB_FIELDS, "WHERE id = ?");
var SELECT_NEXT_SEQUENCE = `SELECT COALESCE(MAX(sequence), 0) + 1 AS nextSequence FROM canonical_jobs`;
var INSERT_CANONICAL_JOB = insertInto("canonical_jobs", CANONICAL_JOB_FIELDS);
var UPDATE_CANONICAL_JOB = update("canonical_jobs", CANONICAL_JOB_FIELDS, "id");
var SELECT_OCCURRENCE_BY_ID = selectFrom("occurrences", OCCURRENCE_FIELDS, "WHERE id = ?");
var INSERT_OCCURRENCE = insertInto("occurrences", OCCURRENCE_FIELDS);
var UPDATE_OCCURRENCE = update("occurrences", OCCURRENCE_FIELDS, "id");
var SELECT_CANONICAL_JOBS_CHANGED_SINCE = selectFrom("canonical_jobs", CANONICAL_JOB_FIELDS, "WHERE sequence > ? ORDER BY sequence ASC LIMIT ?");
var SELECT_FRESH_CANONICAL_JOBS = selectFrom("canonical_jobs", CANONICAL_JOB_FIELDS, "WHERE sequence > ? AND statusTag = 'Active' ORDER BY sequence DESC LIMIT ?");
var SELECT_ACTIVE_OCCURRENCES_BY_SOURCE = selectFrom("occurrences", OCCURRENCE_FIELDS, "WHERE sourceId = ? AND active = 1");
var DEACTIVATE_OCCURRENCE = `UPDATE occurrences SET active = 0 WHERE id = ?`;
var COUNT_ACTIVE_OCCURRENCES = `SELECT COUNT(*) AS activeCount FROM occurrences WHERE canonicalJobId = ? AND active = 1`;
var SEARCH_CANONICAL_JOBS = /* @__PURE__ */ __name((filter6) => {
  const predicates = ["sequence > ?"];
  if (filter6.term) {
    predicates.push("(titleNormalized LIKE ? ESCAPE '\\' OR employerNameNormalized LIKE ? ESCAPE '\\')");
  }
  if (filter6.location) {
    predicates.push("locationNormalized LIKE ? ESCAPE '\\'");
  }
  if (filter6.status) {
    predicates.push("statusTag = ?");
  }
  return selectFrom("canonical_jobs", CANONICAL_JOB_FIELDS, `WHERE ${predicates.join(" AND ")} ORDER BY sequence ASC LIMIT ?`);
}, "SEARCH_CANONICAL_JOBS");
var SELECT_FRESHNESS_BY_PROFILE = `SELECT profileId, seenThrough, updatedAt FROM freshness WHERE profileId = ?`;
var INSERT_FRESHNESS = `INSERT INTO freshness (profileId, seenThrough, updatedAt) VALUES (?, ?, ?)`;
var UPDATE_FRESHNESS = `UPDATE freshness SET seenThrough = ?, updatedAt = ? WHERE profileId = ?`;
var canonicalJobFromRow = /* @__PURE__ */ __name((row) => ({
  id: row.id,
  title: row.title,
  employerName: row.employerName,
  location: row.location,
  description: row.description,
  applicationUrl: row.applicationUrl,
  publishedAt: row.publishedAt,
  deadline: row.deadline ?? void 0,
  status: row.statusTag === "Closed" ? { _tag: "Closed", closedAt: row.statusClosedAt ?? "" } : { _tag: "Active" },
  sequence: row.sequence,
  changedAt: row.changedAt,
  sources: JSON.parse(row.sources)
}), "canonicalJobFromRow");
var rowFromCanonicalJob = /* @__PURE__ */ __name((job, canonicalKey) => ({
  id: job.id,
  canonicalKey,
  title: job.title,
  employerName: job.employerName,
  location: job.location,
  description: job.description,
  applicationUrl: job.applicationUrl,
  publishedAt: job.publishedAt,
  deadline: job.deadline ?? null,
  statusTag: job.status._tag,
  statusClosedAt: job.status._tag === "Closed" ? job.status.closedAt : null,
  sequence: job.sequence,
  changedAt: job.changedAt,
  sources: JSON.stringify(job.sources),
  titleNormalized: normalizeText(job.title),
  employerNameNormalized: normalizeText(job.employerName),
  locationNormalized: normalizeText(job.location)
}), "rowFromCanonicalJob");
var occurrenceFromRow = /* @__PURE__ */ __name((row) => ({
  id: row.id,
  canonicalJobId: row.canonicalJobId,
  sourceId: row.sourceId,
  externalId: row.externalId,
  contentFingerprint: row.contentFingerprint,
  active: row.active === 1,
  firstSeenAt: row.firstSeenAt,
  lastSeenAt: row.lastSeenAt
}), "occurrenceFromRow");
var rowFromOccurrence = /* @__PURE__ */ __name((record22) => ({
  id: record22.id,
  canonicalJobId: record22.canonicalJobId,
  sourceId: record22.sourceId,
  externalId: record22.externalId,
  contentFingerprint: record22.contentFingerprint,
  active: record22.active ? 1 : 0,
  firstSeenAt: record22.firstSeenAt,
  lastSeenAt: record22.lastSeenAt
}), "rowFromOccurrence");
var bindingsFor = /* @__PURE__ */ __name((row, fields2) => fields2.map((field) => row[field]), "bindingsFor");
var updateBindingsFor = /* @__PURE__ */ __name((row, fields2, key) => [
  ...fields2.filter((field) => field !== key).map((field) => row[field]),
  row[key]
], "updateBindingsFor");
var insertCanonicalJobBindings = /* @__PURE__ */ __name((row) => bindingsFor(row, CANONICAL_JOB_FIELDS), "insertCanonicalJobBindings");
var updateCanonicalJobBindings = /* @__PURE__ */ __name((row) => updateBindingsFor(row, CANONICAL_JOB_FIELDS, "id"), "updateCanonicalJobBindings");
var insertOccurrenceBindings = /* @__PURE__ */ __name((row) => bindingsFor(row, OCCURRENCE_FIELDS), "insertOccurrenceBindings");
var updateOccurrenceBindings = /* @__PURE__ */ __name((row) => updateBindingsFor(row, OCCURRENCE_FIELDS, "id"), "updateOccurrenceBindings");
var makeGet = /* @__PURE__ */ __name((database) => (id) => map7(database.query(SELECT_CANONICAL_JOB_BY_ID, [id]), (rows) => rows[0] === void 0 ? void 0 : canonicalJobFromRow(rows[0])), "makeGet");
var makeChangedSince = /* @__PURE__ */ __name((database) => (sequence, limit) => map7(database.query(SELECT_CANONICAL_JOBS_CHANGED_SINCE, [sequence, limit]), (rows) => rows.map(canonicalJobFromRow)), "makeChangedSince");
var mergeSources = /* @__PURE__ */ __name((sources, sourceId) => sources.includes(sourceId) ? sources : [...sources, sourceId], "mergeSources");
var occurrenceRecordFor = /* @__PURE__ */ __name((listing, existingOccurrence, now3) => ({
  id: listing.occurrenceId,
  canonicalJobId: listing.canonicalJobId,
  sourceId: listing.listing.sourceId,
  externalId: listing.listing.externalId,
  contentFingerprint: listing.contentFingerprint,
  active: true,
  firstSeenAt: existingOccurrence?.firstSeenAt ?? now3,
  lastSeenAt: now3
}), "occurrenceRecordFor");
var decideObservation = /* @__PURE__ */ __name((listing, state) => {
  const { existingCanonical, existingOccurrence, nextSequence, now: now3 } = state;
  const raw2 = listing.listing;
  const occurrence = occurrenceRecordFor(listing, existingOccurrence, now3);
  const writeOccurrence = existingOccurrence === void 0 ? "insert" : "update";
  if (existingCanonical === void 0) {
    const canonical = {
      id: listing.canonicalJobId,
      title: raw2.title,
      employerName: raw2.employerName,
      location: raw2.location,
      description: raw2.description,
      applicationUrl: raw2.applicationUrl,
      publishedAt: raw2.publishedAt,
      deadline: raw2.deadline,
      status: { _tag: "Active" },
      sequence: nextSequence,
      changedAt: now3,
      sources: [raw2.sourceId]
    };
    return {
      outcome: { _tag: "CreatedCanonical", id: canonical.id },
      canonical,
      writeCanonical: true,
      occurrence,
      writeOccurrence
    };
  }
  const isNewOccurrence = existingOccurrence === void 0;
  const sources = isNewOccurrence ? mergeSources(existingCanonical.sources, raw2.sourceId) : existingCanonical.sources;
  if (existingCanonical.status._tag === "Closed") {
    const canonical = {
      ...existingCanonical,
      title: raw2.title,
      employerName: raw2.employerName,
      location: raw2.location,
      description: raw2.description,
      applicationUrl: raw2.applicationUrl,
      publishedAt: raw2.publishedAt,
      deadline: raw2.deadline,
      status: { _tag: "Active" },
      sequence: nextSequence,
      changedAt: now3,
      sources
    };
    return {
      outcome: { _tag: "ReopenedCanonical", id: canonical.id },
      canonical,
      writeCanonical: true,
      occurrence,
      writeOccurrence
    };
  }
  if (isNewOccurrence) {
    const canonical = {
      ...existingCanonical,
      sources,
      sequence: nextSequence,
      changedAt: now3
    };
    return {
      outcome: { _tag: "AddedDuplicateOccurrence", id: canonical.id },
      canonical,
      writeCanonical: true,
      occurrence,
      writeOccurrence
    };
  }
  if (existingOccurrence.contentFingerprint !== listing.contentFingerprint) {
    const canonical = {
      ...existingCanonical,
      title: raw2.title,
      employerName: raw2.employerName,
      location: raw2.location,
      description: raw2.description,
      applicationUrl: raw2.applicationUrl,
      publishedAt: raw2.publishedAt,
      deadline: raw2.deadline,
      sequence: nextSequence,
      changedAt: now3
    };
    return {
      outcome: { _tag: "UpdatedCanonical", id: canonical.id },
      canonical,
      writeCanonical: true,
      occurrence,
      writeOccurrence
    };
  }
  return {
    outcome: { _tag: "Unchanged" },
    canonical: existingCanonical,
    writeCanonical: false,
    occurrence,
    writeOccurrence
  };
}, "decideObservation");
var absentOccurrences = /* @__PURE__ */ __name((active, seenExternalIds) => {
  const seen = new Set(seenExternalIds);
  return active.filter((occurrence) => !seen.has(occurrence.externalId));
}, "absentOccurrences");
var closeCanonical = /* @__PURE__ */ __name((job, sequence, now3) => ({
  ...job,
  status: { _tag: "Closed", closedAt: now3 },
  sequence,
  changedAt: now3
}), "closeCanonical");
var makeObserve = /* @__PURE__ */ __name((database) => (listing) => gen2(function* () {
  const canonicalRows = yield* database.query(SELECT_CANONICAL_JOB_BY_ID, [
    listing.canonicalJobId
  ]);
  const occurrenceRows = yield* database.query(SELECT_OCCURRENCE_BY_ID, [
    listing.occurrenceId
  ]);
  const sequenceRows = yield* database.query(SELECT_NEXT_SEQUENCE, []);
  const now3 = yield* now2;
  const decision = decideObservation(listing, {
    existingCanonical: canonicalRows[0] === void 0 ? void 0 : canonicalJobFromRow(canonicalRows[0]),
    existingOccurrence: occurrenceRows[0] === void 0 ? void 0 : occurrenceFromRow(occurrenceRows[0]),
    nextSequence: sequenceRows[0]?.nextSequence ?? 1,
    now: formatIso2(now3)
  });
  const writes = [];
  if (decision.writeCanonical) {
    const row = rowFromCanonicalJob(decision.canonical, listing.canonicalKey);
    writes.push(canonicalRows[0] === void 0 ? { sql: INSERT_CANONICAL_JOB, bindings: insertCanonicalJobBindings(row) } : { sql: UPDATE_CANONICAL_JOB, bindings: updateCanonicalJobBindings(row) });
  }
  const occurrenceRow = rowFromOccurrence(decision.occurrence);
  writes.push(decision.writeOccurrence === "insert" ? { sql: INSERT_OCCURRENCE, bindings: insertOccurrenceBindings(occurrenceRow) } : { sql: UPDATE_OCCURRENCE, bindings: updateOccurrenceBindings(occurrenceRow) });
  yield* database.atomic(writes);
  return decision.outcome;
}), "makeObserve");
var makeCloseAbsent = /* @__PURE__ */ __name((database) => (source, seenExternalIds) => gen2(function* () {
  const activeRows = yield* database.query(SELECT_ACTIVE_OCCURRENCES_BY_SOURCE, [
    source
  ]);
  const absent = absentOccurrences(activeRows.map(occurrenceFromRow), seenExternalIds);
  if (absent.length === 0) {
    return [];
  }
  const now3 = formatIso2(yield* now2);
  const sequenceRows = yield* database.query(SELECT_NEXT_SEQUENCE, []);
  let nextSequence = sequenceRows[0]?.nextSequence ?? 1;
  const writes = absent.map((occurrence) => ({
    sql: DEACTIVATE_OCCURRENCE,
    bindings: [occurrence.id]
  }));
  const outcomes = [];
  const goingByJob = /* @__PURE__ */ new Map();
  for (const occurrence of absent) {
    goingByJob.set(occurrence.canonicalJobId, (goingByJob.get(occurrence.canonicalJobId) ?? 0) + 1);
  }
  for (const [jobId, going] of goingByJob) {
    const counted = yield* database.query(COUNT_ACTIVE_OCCURRENCES, [jobId]);
    if ((counted[0]?.activeCount ?? 0) > going) {
      continue;
    }
    const jobRows = yield* database.query(SELECT_CANONICAL_JOB_BY_ID, [jobId]);
    if (jobRows[0] === void 0) {
      continue;
    }
    const job = canonicalJobFromRow(jobRows[0]);
    if (job.status._tag === "Closed") {
      continue;
    }
    const closed = closeCanonical(job, nextSequence, now3);
    nextSequence += 1;
    writes.push({
      sql: UPDATE_CANONICAL_JOB,
      bindings: updateCanonicalJobBindings(rowFromCanonicalJob(closed, jobRows[0].canonicalKey))
    });
    outcomes.push({ _tag: "ClosedCanonical", id: closed.id });
  }
  yield* database.atomic(writes);
  return outcomes;
}), "makeCloseAbsent");
var makeFresh = /* @__PURE__ */ __name((database) => (profile3, limit) => gen2(function* () {
  const freshnessRows = yield* database.query(SELECT_FRESHNESS_BY_PROFILE, [
    profile3
  ]);
  const seenThrough = freshnessRows[0]?.seenThrough ?? 0;
  const jobRows = yield* database.query(SELECT_FRESH_CANONICAL_JOBS, [
    seenThrough,
    limit
  ]);
  return jobRows.map(canonicalJobFromRow);
}), "makeFresh");
var makeMarkOffered = /* @__PURE__ */ __name((database) => (profile3, through) => gen2(function* () {
  const freshnessRows = yield* database.query(SELECT_FRESHNESS_BY_PROFILE, [
    profile3
  ]);
  const now3 = formatIso2(yield* now2);
  if (freshnessRows[0] === void 0) {
    yield* database.run(INSERT_FRESHNESS, [profile3, through, now3]);
  } else if (through > freshnessRows[0].seenThrough) {
    yield* database.run(UPDATE_FRESHNESS, [through, now3, profile3]);
  }
}), "makeMarkOffered");
var Freshness = class extends Class5("Freshness")({
  profileId: ProfileId,
  seenThrough: Sequence,
  updatedAt: DateTimeUpdate
}) {
  static {
    __name(this, "Freshness");
  }
};
var Judgement = class extends Class5("Judgement")({
  profileId: ProfileId,
  jobId: CanonicalJobId,
  verdict: Literals(["dismissed", "not_now", "irrelevant"]),
  reason: Sensitive(String4),
  createdAt: DateTimeInsert
}) {
  static {
    __name(this, "Judgement");
  }
};
var columnsOf = /* @__PURE__ */ __name((variant) => Object.keys(variant.fields), "columnsOf");
var decodeRow = /* @__PURE__ */ __name((select) => (row) => decodeUnknownEffect2(select)(row).pipe(orDie2), "decodeRow");
var encodeVariant = /* @__PURE__ */ __name((variant) => (value3) => encodeEffect(variant)(value3).pipe(orDie2), "encodeVariant");
var insertStatement = /* @__PURE__ */ __name((table, columns3, encoded) => ({
  sql: `INSERT INTO ${table} (${columns3.join(", ")}) VALUES (${columns3.map(() => "?").join(", ")})`,
  bindings: toBindings(encoded, columns3)
}), "insertStatement");
var updateStatement = /* @__PURE__ */ __name((table, columns3, keyColumns, encoded) => {
  const setColumns = columns3.filter((c) => !keyColumns.includes(c));
  return {
    sql: `UPDATE ${table} SET ${setColumns.map((c) => `${c} = ?`).join(", ")} WHERE ${keyColumns.map((c) => `${c} = ?`).join(" AND ")}`,
    bindings: [...toBindings(encoded, setColumns), ...toBindings(encoded, keyColumns)]
  };
}, "updateStatement");
var TABLE = "judgements";
var record2 = /* @__PURE__ */ __name((judgement) => gen2(function* () {
  const db = yield* Database;
  const encoded = yield* encodeVariant(Judgement)(judgement);
  const stmt = insertStatement(TABLE, columnsOf(Judgement), encoded);
  yield* db.run(stmt.sql, stmt.bindings);
}), "record2");
var layer15 = effect(Judgements, gen2(function* () {
  const database = yield* Database;
  const record3 = /* @__PURE__ */ __name((profile3, job, verdict, reason) => gen2(function* () {
    const now3 = yield* now2;
    const judgement = new Judgement({
      profileId: profile3,
      jobId: job,
      verdict,
      reason: reason ?? "",
      createdAt: now3
    });
    yield* provideService2(record2(judgement), Database, database);
  }), "record3");
  return Judgements.of({ record: record3 });
}));
var escapeLikeWildcards = /* @__PURE__ */ __name((value3) => value3.replace(/[\\%_]/g, (char) => `\\${char}`), "escapeLikeWildcards");
var likePattern = /* @__PURE__ */ __name((value3) => `%${escapeLikeWildcards(normalizeText(value3))}%`, "likePattern");
var makeSearch = /* @__PURE__ */ __name((database) => (filter6, cursor, limit) => {
  const hasTerm = filter6.term !== void 0;
  const hasLocation = filter6.location !== void 0;
  const hasStatus = filter6.status !== void 0;
  const sql = SEARCH_CANONICAL_JOBS({ term: hasTerm, location: hasLocation, status: hasStatus });
  const bindings = [cursor];
  if (hasTerm) {
    const pattern = likePattern(filter6.term);
    bindings.push(pattern, pattern);
  }
  if (hasLocation) {
    bindings.push(likePattern(filter6.location));
  }
  if (hasStatus) {
    bindings.push(filter6.status);
  }
  bindings.push(limit);
  return map7(database.query(sql, bindings), (rows) => rows.map(canonicalJobFromRow));
}, "makeSearch");
var corpusLayer = effect(Corpus, gen2(function* () {
  const database = yield* Database;
  return Corpus.of({
    observe: makeObserve(database),
    get: makeGet(database),
    changedSince: makeChangedSince(database),
    search: makeSearch(database),
    fresh: makeFresh(database),
    markOffered: makeMarkOffered(database),
    closeAbsent: makeCloseAbsent(database)
  });
}));
var layer16 = mergeAll2(corpusLayer, layer15);
var ApplicationMethod = Literals(["assisted", "automated"]);
var ApplicationStatus = Literals([
  "ready",
  "submitted",
  "rejected",
  "interview",
  "offer",
  "withdrawn"
]);
var PolicyTag = Literals(["Allowed", "AssistedOnly", "Prohibited", "Unreviewed"]);
var SavedJob = class extends Class5("SavedJob")({
  id: SavedJobId,
  profileId: ProfileId,
  canonicalJobId: CanonicalJobId,
  note: String4,
  createdAt: DateTimeInsert
}) {
  static {
    __name(this, "SavedJob");
  }
};
var ApplicationRecord = class extends Class5("ApplicationRecord")({
  id: ApplicationId,
  profileId: ProfileId,
  savedJobId: SavedJobId,
  canonicalJobId: CanonicalJobId,
  method: ApplicationMethod,
  status: ApplicationStatus,
  applicationUrl: String4,
  cv: String4,
  letter: String4,
  generator: String4,
  downgradeReason: FieldOption(String4),
  notes: String4,
  createdAt: DateTimeInsert,
  updatedAt: DateTimeUpdate
}) {
  static {
    __name(this, "ApplicationRecord");
  }
};
var PlatformPolicyRecord = class extends Class5("PlatformPolicyRecord")({
  platformId: PlatformId,
  policy: PolicyTag,
  updatedAt: DateTimeUpdate
}) {
  static {
    __name(this, "PlatformPolicyRecord");
  }
};
var SourceUnavailable = class extends TaggedError2("SourceUnavailable") {
  static {
    __name(this, "SourceUnavailable");
  }
};
var RateLimited = class extends TaggedError2("RateLimited") {
  static {
    __name(this, "RateLimited");
  }
};
var Unauthorized2 = class extends TaggedError2("Unauthorized") {
  static {
    __name(this, "Unauthorized2");
  }
};
var DecodeFailed = class extends TaggedError2("DecodeFailed") {
  static {
    __name(this, "DecodeFailed");
  }
};
var AdapterUnavailable = class extends TaggedError2("AdapterUnavailable") {
  static {
    __name(this, "AdapterUnavailable");
  }
};
var RendererUnavailable = class extends TaggedError2("RendererUnavailable") {
  static {
    __name(this, "RendererUnavailable");
  }
};
var PolicyProhibited = class extends TaggedError2("PolicyProhibited") {
  static {
    __name(this, "PolicyProhibited");
  }
};
var EntitlementRequired = class extends TaggedError2("EntitlementRequired") {
  static {
    __name(this, "EntitlementRequired");
  }
};
var LeaseHeld = class extends TaggedError2("LeaseHeld") {
  static {
    __name(this, "LeaseHeld");
  }
};
var ProfileIncomplete = class extends TaggedError2("ProfileIncomplete") {
  static {
    __name(this, "ProfileIncomplete");
  }
};
var DraftMissing = class extends TaggedError2("DraftMissing") {
  static {
    __name(this, "DraftMissing");
  }
};
var Policy = class extends Service()("@job-index/Policy") {
  static {
    __name(this, "Policy");
  }
};
var Decision = Union2([
  TaggedStruct("Allowed", {}),
  TaggedStruct("NeedsUpgrade", { capability: String4 }),
  TaggedStruct("ForbiddenByPlatform", { policy: String4 })
]);
var grants = {
  Free: [],
  Premium: ["model-drafting", "automated-apply", "agent-acquisition", "scheduled-applications"]
};
var permits = /* @__PURE__ */ __name((tier, capability) => grants[tier._tag].includes(capability), "permits");
var canAutomate = /* @__PURE__ */ __name((tier, policy) => {
  if (!permits(tier, "automated-apply")) {
    return { _tag: "NeedsUpgrade", capability: "automated-apply" };
  }
  return policy._tag === "Allowed" ? { _tag: "Allowed" } : { _tag: "ForbiddenByPlatform", policy: policy._tag };
}, "canAutomate");
if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest;
  const premium = { _tag: "Premium", until: "2027-01-01" };
  it("documents the two conditions truthfully", () => {
    expect(canAutomate(premium, { _tag: "Prohibited" })._tag).toBe("ForbiddenByPlatform");
    expect(canAutomate({ _tag: "Free" }, { _tag: "Allowed" })._tag).toBe("NeedsUpgrade");
    expect(canAutomate(premium, { _tag: "Allowed" })._tag).toBe("Allowed");
  });
}
var decidePreparation = /* @__PURE__ */ __name((tier, platform2, policy, requested) => {
  if (policy._tag === "Prohibited") {
    return { _tag: "Blocked", platform: platform2, policy: policy._tag };
  }
  if (requested === "assisted") {
    return { _tag: "Proceed", method: "assisted" };
  }
  const decision = canAutomate(tier, policy);
  switch (decision._tag) {
    case "Allowed":
      return { _tag: "Proceed", method: "automated" };
    case "NeedsUpgrade":
      return { _tag: "NeedsUpgrade", capability: decision.capability };
    case "ForbiddenByPlatform":
      return {
        _tag: "Proceed",
        method: "assisted",
        downgradeReason: `${platform2}: ${decision.policy}`
      };
  }
}, "decidePreparation");
var effectiveTier = /* @__PURE__ */ __name((tier, now3) => tier._tag === "Premium" && new Date(tier.until).getTime() < now3.getTime() ? { _tag: "Free" } : tier, "effectiveTier");
if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest;
  it("a lapsed premium subscription is free again", () => {
    const lapsed = { _tag: "Premium", until: "2020-01-01" };
    expect(effectiveTier(lapsed, /* @__PURE__ */ new Date("2026-01-01"))).toEqual({ _tag: "Free" });
  });
}
var TABLE2 = "saved_jobs";
var insert = /* @__PURE__ */ __name((job) => gen2(function* () {
  const db = yield* Database;
  const variant = SavedJob.insert;
  const encoded = yield* encodeVariant(variant)(job);
  const stmt = insertStatement(TABLE2, columnsOf(variant), encoded);
  yield* db.run(stmt.sql, stmt.bindings);
}), "insert");
var findById = /* @__PURE__ */ __name((id) => gen2(function* () {
  const db = yield* Database;
  const rows = yield* db.query(`SELECT * FROM ${TABLE2} WHERE id = ?`, [id]);
  return rows[0] === void 0 ? void 0 : yield* decodeRow(SavedJob)(rows[0]);
}), "findById");
var TABLE3 = "applications";
var KEY = ["id"];
var insert2 = /* @__PURE__ */ __name((application) => gen2(function* () {
  const db = yield* Database;
  const variant = ApplicationRecord.insert;
  const encoded = yield* encodeVariant(variant)(application);
  const stmt = insertStatement(TABLE3, columnsOf(variant), encoded);
  yield* db.run(stmt.sql, stmt.bindings);
}), "insert2");
var update2 = /* @__PURE__ */ __name((application) => gen2(function* () {
  const db = yield* Database;
  const variant = ApplicationRecord.update;
  const encoded = yield* encodeVariant(variant)(application);
  const stmt = updateStatement(TABLE3, columnsOf(variant), KEY, encoded);
  yield* db.run(stmt.sql, stmt.bindings);
}), "update2");
var findByIdForProfile = /* @__PURE__ */ __name((id, profileId) => gen2(function* () {
  const db = yield* Database;
  const rows = yield* db.query(`SELECT * FROM ${TABLE3} WHERE id = ? AND profileId = ?`, [
    id,
    profileId
  ]);
  return rows[0] === void 0 ? void 0 : yield* decodeRow(ApplicationRecord)(rows[0]);
}), "findByIdForProfile");
var withDatabase = /* @__PURE__ */ __name((database) => (effect2) => provideService2(effect2, Database, database), "withDatabase");
var asTier = /* @__PURE__ */ __name((entitled) => entitled ? { _tag: "Premium", until: "" } : { _tag: "Free" }, "asTier");
var layer17 = effect(Applications, gen2(function* () {
  const database = yield* Database;
  const corpus3 = yield* Corpus;
  const profiles = yield* Profiles;
  const drafting = yield* Drafting;
  const entitlements = yield* Entitlements;
  const policy = yield* Policy;
  const withDb = withDatabase(database);
  const prepare = /* @__PURE__ */ __name((user, savedJob, requested) => gen2(function* () {
    const saved = yield* withDb(findById(savedJob));
    if (saved === void 0 || saved.profileId !== user) {
      return yield* fail5(new DraftMissing({ savedJob }));
    }
    const job = yield* corpus3.get(saved.canonicalJobId);
    if (job === void 0) {
      return yield* fail5(new DraftMissing({ savedJob }));
    }
    const profile3 = yield* profiles.get(saved.profileId);
    const documents = yield* drafting.compose(profile3, job).pipe(catchTag2("ProfileIncomplete", () => fail5(new DraftMissing({ savedJob }))));
    const { platform: platform2, policy: platformPolicy } = yield* policy.forJob(saved.canonicalJobId);
    const entitled = yield* entitlements.has(user, "automated-apply");
    const decision = decidePreparation(asTier(entitled), platform2, platformPolicy, requested);
    if (decision._tag === "Blocked") {
      return yield* fail5(new PolicyProhibited({ platform: decision.platform, policy: decision.policy }));
    }
    if (decision._tag === "NeedsUpgrade") {
      yield* entitlements.require(user, "automated-apply");
      return yield* die2("unreachable: Entitlements.has and .require disagreed");
    }
    const now3 = yield* now2;
    const application = new ApplicationRecord({
      id: crypto.randomUUID(),
      profileId: user,
      savedJobId: savedJob,
      canonicalJobId: saved.canonicalJobId,
      method: decision.method,
      status: "ready",
      applicationUrl: job.applicationUrl,
      cv: documents.cv,
      letter: documents.letter,
      generator: documents.generator,
      downgradeReason: fromUndefinedOr(decision.downgradeReason),
      notes: "",
      createdAt: now3,
      updatedAt: now3
    });
    yield* withDb(insert2(application));
    const prepared = {
      application: application.id,
      method: decision.method,
      documents,
      applicationUrl: job.applicationUrl,
      downgradeReason: decision.downgradeReason
    };
    return prepared;
  }), "prepare");
  const setStatus = /* @__PURE__ */ __name((user, application, status2, notes) => gen2(function* () {
    const existing = yield* withDb(findByIdForProfile(application, user));
    if (existing === void 0) {
      return;
    }
    const now3 = yield* now2;
    yield* withDb(update2(new ApplicationRecord({
      id: existing.id,
      profileId: existing.profileId,
      savedJobId: existing.savedJobId,
      canonicalJobId: existing.canonicalJobId,
      method: existing.method,
      status: status2,
      applicationUrl: existing.applicationUrl,
      cv: existing.cv,
      letter: existing.letter,
      generator: existing.generator,
      downgradeReason: existing.downgradeReason,
      notes,
      createdAt: existing.createdAt,
      updatedAt: now3
    })));
  }), "setStatus");
  return Applications.of({ prepare, setStatus });
}));
var Tier = Union2([
  TaggedStruct("Free", {}),
  TaggedStruct("Premium", { until: String4 })
]);
var Capability = Literals([
  "model-drafting",
  "automated-apply",
  "agent-acquisition",
  "scheduled-applications"
]);
var Subscription = class extends Class5("Subscription")({
  profileId: ProfileId,
  tier: JsonFromString(Tier),
  providerRef: Sensitive(String4),
  provider: Literals(["none", "stripe"]),
  updatedAt: DateTimeUpdate
}) {
  static {
    __name(this, "Subscription");
  }
};
var TABLE4 = "subscriptions";
var findByProfile = /* @__PURE__ */ __name((profileId) => gen2(function* () {
  const db = yield* Database;
  const rows = yield* db.query(`SELECT * FROM ${TABLE4} WHERE profileId = ?`, [
    profileId
  ]);
  return rows[0] === void 0 ? void 0 : yield* decodeRow(Subscription)(rows[0]);
}), "findByProfile");
var layer18 = effect(Entitlements, gen2(function* () {
  const database = yield* Database;
  const withDb = withDatabase(database);
  const has2 = /* @__PURE__ */ __name((user, capability) => gen2(function* () {
    const subscription = yield* withDb(findByProfile(user));
    const tier = subscription === void 0 ? { _tag: "Free" } : subscription.tier;
    return permits(effectiveTier(tier, /* @__PURE__ */ new Date()), capability);
  }), "has2");
  const require2 = /* @__PURE__ */ __name((user, capability) => gen2(function* () {
    const granted = yield* has2(user, capability);
    if (!granted) {
      return yield* fail5(new EntitlementRequired({ capability }));
    }
  }), "require2");
  return Entitlements.of({ has: has2, require: require2 });
}));
var TABLE5 = "platform_policies";
var findById2 = /* @__PURE__ */ __name((platformId) => gen2(function* () {
  const db = yield* Database;
  const rows = yield* db.query(`SELECT * FROM ${TABLE5} WHERE platformId = ?`, [
    platformId
  ]);
  return rows[0] === void 0 ? void 0 : yield* decodeRow(PlatformPolicyRecord)(rows[0]);
}), "findById2");
var SELECT_DELIVERY_PLATFORM_BY_URL = `SELECT id FROM delivery_platforms WHERE ? LIKE '%' || hostPattern || '%' LIMIT 1`;
var toAutomationPolicy = /* @__PURE__ */ __name((tag2) => ({ _tag: tag2 }), "toAutomationPolicy");
var layer19 = effect(Policy, gen2(function* () {
  const database = yield* Database;
  const corpus3 = yield* Corpus;
  const withDb = withDatabase(database);
  const forJob = /* @__PURE__ */ __name((job) => gen2(function* () {
    const canonical = yield* corpus3.get(job);
    if (canonical === void 0) {
      return { platform: "", policy: toAutomationPolicy("Unreviewed") };
    }
    const rows = yield* database.query(SELECT_DELIVERY_PLATFORM_BY_URL, [
      canonical.applicationUrl
    ]);
    const platform2 = rows[0]?.id ?? "";
    if (platform2 === "") {
      return { platform: platform2, policy: toAutomationPolicy("Unreviewed") };
    }
    const record3 = yield* withDb(findById2(platform2));
    return { platform: platform2, policy: toAutomationPolicy(record3?.policy ?? "Unreviewed") };
  }), "forJob");
  const requireAutomatable = /* @__PURE__ */ __name((job) => gen2(function* () {
    const { platform: platform2, policy } = yield* forJob(job);
    if (policy._tag !== "Allowed") {
      return yield* fail5(new PolicyProhibited({ platform: platform2, policy: policy._tag }));
    }
  }), "requireAutomatable");
  return Policy.of({ forJob, requireAutomatable });
}));
var layer20 = effect(SavedJobs, gen2(function* () {
  const database = yield* Database;
  const withDatabase2 = /* @__PURE__ */ __name((effect2) => provideService2(effect2, Database, database), "withDatabase2");
  const save = /* @__PURE__ */ __name((profile3, job, note) => gen2(function* () {
    const now3 = yield* now2;
    const id = crypto.randomUUID();
    yield* withDatabase2(insert(new SavedJob({ id, profileId: profile3, canonicalJobId: job, note, createdAt: now3 })));
    return id;
  }), "save");
  const resolve4 = /* @__PURE__ */ __name((profile3, saved) => map7(withDatabase2(findById(saved)), (row) => row === void 0 || row.profileId !== profile3 ? void 0 : row.canonicalJobId), "resolve4");
  return SavedJobs.of({ save, resolve: resolve4 });
}));
var layer21 = layer17.pipe(provideMerge(mergeAll2(layer18, layer19, layer20)));
var FIELDS = Object.keys(CatalogRecord.select.fields);
var SELECT_ALL = `SELECT ${FIELDS.join(", ")} FROM source_catalog ORDER BY priority ASC, platform ASC`;
var SELECT_BY_TIER = `SELECT ${FIELDS.join(", ")} FROM source_catalog WHERE tierTag = ? ORDER BY priority ASC, platform ASC`;
var entryOf = /* @__PURE__ */ __name((row) => ({
  id: row.id,
  platform: row.platform,
  category: row.category,
  listingsUrl: row.listingsUrl,
  tier: { _tag: row.tierTag },
  policy: { _tag: row.policyTag },
  requiresPremium: row.requiresPremium === 1,
  priority: row.priority,
  confidence: row.confidence,
  notes: row.notes,
  verifiedAt: row.verifiedAt
}), "entryOf");
var layer22 = effect(SourceCatalog, gen2(function* () {
  const database = yield* Database;
  return SourceCatalog.of({
    list: /* @__PURE__ */ __name((tier) => map7(tier === void 0 ? database.query(SELECT_ALL, []) : database.query(SELECT_BY_TIER, [tier._tag]), (rows) => rows.map(entryOf)), "list")
  });
}));
var advertText = /* @__PURE__ */ __name((job) => `${job.title} ${job.description} ${job.employerName}`, "advertText");
var relevance = /* @__PURE__ */ __name((entry, advert) => {
  const haystack = advert.toLowerCase();
  const tokens = [entry.title, ...entry.highlights].flatMap((line) => line.split(/\s+/));
  let score = 0;
  for (const raw2 of tokens) {
    const token = raw2.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "").toLowerCase();
    if (token.length > 3 && haystack.includes(token)) {
      score += 1;
    }
  }
  return score;
}, "relevance");
var rankExperience = /* @__PURE__ */ __name((experience, advert) => experience.map((entry, index) => ({ entry, index, score: relevance(entry, advert) })).toSorted((a, b) => b.score - a.score || a.index - b.index).map(({ entry }) => entry), "rankExperience");
if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest;
  it("ranks matching experience above unrelated experience", () => {
    const advert = "Support Engineer needed for chat and telephone support.";
    const support = {
      title: "Customer Service Adviser",
      employer: "Nordic Retail AS",
      period: "2022-2026",
      highlights: ["Handled chat and telephone support"]
    };
    const barista = {
      title: "Barista",
      employer: "Kaffebrenneriet",
      period: "2019-2022",
      highlights: ["Trained new staff"]
    };
    expect(relevance(support, advert)).toBeGreaterThan(relevance(barista, advert));
  });
}
var renderCvBody = /* @__PURE__ */ __name((profile3, experience) => {
  const lines = [];
  if (profile3.headline.trim() !== "")
    lines.push(profile3.headline.trim());
  if (profile3.location.trim() !== "")
    lines.push(profile3.location.trim());
  lines.push("");
  if (profile3.summary.trim() !== "") {
    lines.push("PROFILE", profile3.summary.trim(), "");
  }
  if (experience.length > 0) {
    lines.push("EXPERIENCE");
    for (const entry of experience.slice(0, 8)) {
      lines.push(`${entry.title.trim()} \u2014 ${entry.employer.trim()} (${entry.period.trim()})`);
      for (const highlight of entry.highlights.slice(0, 4)) {
        lines.push(`  \xB7 ${highlight.trim()}`);
      }
    }
    lines.push("");
  }
  if (profile3.skills.length > 0) {
    lines.push("SKILLS", profile3.skills.join(", "), "");
  }
  if (profile3.education.length > 0) {
    lines.push("EDUCATION", ...profile3.education, "");
  }
  if (profile3.languages.trim() !== "") {
    lines.push("LANGUAGES", profile3.languages.trim());
  }
  return lines.join(`
`);
}, "renderCvBody");
var composeCv = /* @__PURE__ */ __name((profile3, job) => renderCvBody(profile3, rankExperience(profile3.experience, advertText(job))), "composeCv");
var matchedSkills = /* @__PURE__ */ __name((skills, advert) => {
  const haystack = advert.toLowerCase();
  return skills.filter((skill) => haystack.includes(skill.toLowerCase())).slice(0, 6);
}, "matchedSkills");
var composeLetter = /* @__PURE__ */ __name((profile3, job) => {
  const advert = advertText(job);
  const best = rankExperience(profile3.experience, advert)[0];
  const opening = profile3.headline.trim() === "" ? `I am applying for ${job.title} at ${job.employerName}.` : `I am applying for ${job.title} at ${job.employerName}. I am ${profile3.headline.trim()}.`;
  const bodyLines = [];
  if (best !== void 0) {
    const highlight = best.highlights[0];
    const opener = `Most recently I worked as ${best.title.trim()} at ${best.employer.trim()} (${best.period.trim()}).`;
    bodyLines.push(highlight === void 0 ? opener : `${opener} ${highlight.trim()}`);
  }
  const matched = matchedSkills(profile3.skills, advert);
  if (matched.length > 0) {
    bodyLines.push("", `The advert asks for ${matched.join(", ")}, which is what I have been doing.`);
  }
  const closing = job.location.trim() === "" ? "I am available to start by agreement." : `I am based for work in ${job.location.trim()}.`;
  return [opening, "", ...bodyLines, "", closing, "", "Kind regards,"].join(`
`);
}, "composeLetter");
var layer23 = succeed4(Drafting, {
  compose: /* @__PURE__ */ __name((profile3, job) => profile3.headline.trim() === "" && profile3.experience.length === 0 ? fail5(new ProfileIncomplete({ missing: "headline or experience" })) : succeed6({
    cv: composeCv(profile3, job),
    letter: composeLetter(profile3, job),
    generator: "template"
  }), "compose")
});
var services = /* @__PURE__ */ __name((env) => {
  const leaves = mergeAll2(layer16, layer14, layer23, layer22).pipe(provideMerge(layer11(env.DB)));
  return provideMerge(layer21, leaves);
}, "services");
var noFilesystem = layerNoop({});
var platform = mergeAll2(layer, layer2.pipe(provideMerge(noFilesystem)), layer3);
var operationalRoutes = /* @__PURE__ */ __name((env) => mergeAll2(add3("GET", "/api/health", jsonUnsafe2({
  status: "ok",
  service: "job-index",
  environment: env.ENVIRONMENT
})), add3("GET", "/api/about", jsonUnsafe2({
  service: "job-index",
  license: "AGPL-3.0-or-later",
  environment: env.ENVIRONMENT
}))), "operationalRoutes");
var appLayer = /* @__PURE__ */ __name((env) => mergeAll2(operationalRoutes(env), layer5(api).pipe(provide2(mergeAll2(corpus2, feed2, profile2, applications2)), provide2(auth))).pipe(provideRequest(services(env)), provide2(services(env)), provide2(platform), provide2(layer4)), "appLayer");
var handler;
var src_default = {
  fetch(request, env) {
    if (handler === void 0) {
      handler = toWebHandler(appLayer(decodeEnv(env))).handler;
    }
    return handler(request);
  }
};

// ../../../../../nix/store/wv9s0gb7sqxqfamjfhjy14s6lj6m009v-wrangler-4.93.0/lib/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../../nix/store/wv9s0gb7sqxqfamjfhjy14s6lj6m009v-wrangler-4.93.0/lib/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-FgA2Yu/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// ../../../../../nix/store/wv9s0gb7sqxqfamjfhjy14s6lj6m009v-wrangler-4.93.0/lib/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args2) {
  __facade_middleware__.push(...args2.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-FgA2Yu/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware2 of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware2);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware2 of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware2);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  appLayer,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
