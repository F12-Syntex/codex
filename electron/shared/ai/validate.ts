/**
 * Tiny runtime validator for model output (owner: WS-A). No dependencies.
 *
 * PURE: no `electron`, Node or DOM imports.
 *
 *   const Out = s.object({
 *     titles: s.record(s.string({ min: 1, max: 80 })),
 *     comments: s.array(s.object({ paraId: s.string(), text: s.string() }), { salvage: true }),
 *   });
 *   type Out = Infer<typeof Out>;
 *   const r = Out.parse(json);           // { ok: true, value, issues } | { ok: false, issues }
 *
 * - Objects strip unknown keys (models add chatter fields). Missing optional keys stay absent.
 * - `salvage: true` on arrays/records drops invalid items instead of failing (issues recorded),
 *   so one bad comment doesn't throw away a whole batch.
 * - `flatten: true` on arrays turns `[[a, b], [c]]` into `[a, b, c]` (a common model slip).
 * - `coerce: true` on numbers/booleans accepts "5" / "true".
 * - `schema.jsonSchema()` renders a JSON Schema for `response_format: json_schema`.
 */

export interface Issue {
  /** JSON-path-ish location, e.g. `$.comments[3].text`. */
  path: string;
  message: string;
}

export type ParseResult<T> = { ok: true; value: T; issues: Issue[] } | { ok: false; issues: Issue[] };

export interface Schema<T> {
  readonly kind: string;
  readonly isOptional: boolean;
  parse(value: unknown, path?: string): ParseResult<T>;
  jsonSchema(): Record<string, unknown>;
  /** Attach a description (included in `jsonSchema`). */
  describe(text: string): Schema<T>;
}

export type Infer<S> = S extends Schema<infer T> ? T : never;

type Shape = Record<string, Schema<any>>;
type OptionalKeys<S extends Shape> = { [K in keyof S]: S[K]["isOptional"] extends true ? K : never }[keyof S];
type RequiredKeys<S extends Shape> = Exclude<keyof S, OptionalKeys<S>>;
export type InferShape<S extends Shape> = { [K in RequiredKeys<S>]: Infer<S[K]> } & { [K in OptionalKeys<S>]?: Infer<S[K]> };

function make<T>(
  kind: string,
  parse: (v: unknown, path: string) => ParseResult<T>,
  jsonSchema: () => Record<string, unknown>,
  isOptional = false,
  description?: string,
): Schema<T> {
  return {
    kind,
    isOptional,
    parse: (v, path = "$") => parse(v, path),
    jsonSchema: () => (description ? { ...jsonSchema(), description } : jsonSchema()),
    describe: (text) => make(kind, parse, jsonSchema, isOptional, text),
  };
}

const fail = (path: string, message: string): ParseResult<never> => ({ ok: false, issues: [{ path, message }] });
const okv = <T>(value: T, issues: Issue[] = []): ParseResult<T> => ({ ok: true, value, issues });

function typeName(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

export interface StringOpts { min?: number; max?: number; trim?: boolean; pattern?: RegExp; /** Coerce numbers/booleans to strings. */ coerce?: boolean }
export interface NumberOpts { int?: boolean; min?: number; max?: number; coerce?: boolean; /** Clamp into [min, max] instead of failing. */ clamp?: boolean }
export interface ArrayOpts { min?: number; max?: number; salvage?: boolean; flatten?: boolean; /** Wrap a lone item in an array. */ wrap?: boolean }
export interface RecordOpts { salvage?: boolean; /** Exact key set required (e.g. rewrite chunks: keys equal). */ keys?: readonly string[]; /** Drop keys not in `keys` instead of failing. */ dropExtra?: boolean }

export const s = {
  string(opts: StringOpts = {}): Schema<string> {
    return make<string>(
      "string",
      (v, path) => {
        let x = v;
        if (typeof x !== "string") {
          if (opts.coerce && (typeof x === "number" || typeof x === "boolean")) x = String(x);
          else return fail(path, `expected string, got ${typeName(v)}`);
        }
        let str = x as string;
        if (opts.trim !== false) str = str.trim();
        if (opts.min !== undefined && str.length < opts.min) return fail(path, `string shorter than ${opts.min}`);
        if (opts.max !== undefined && str.length > opts.max) return fail(path, `string longer than ${opts.max}`);
        if (opts.pattern && !opts.pattern.test(str)) return fail(path, `string does not match ${opts.pattern}`);
        return okv(str);
      },
      () => ({ type: "string", ...(opts.min !== undefined && { minLength: opts.min }), ...(opts.max !== undefined && { maxLength: opts.max }) }),
    );
  },

  number(opts: NumberOpts = {}): Schema<number> {
    return make<number>(
      "number",
      (v, path) => {
        let raw = v;
        if (typeof raw === "string" && opts.coerce && raw.trim() !== "" && Number.isFinite(Number(raw))) raw = Number(raw);
        if (typeof raw !== "number" || !Number.isFinite(raw)) return fail(path, `expected number, got ${typeName(v)}`);
        let n: number = raw;
        if (opts.int && !Number.isInteger(n)) {
          if (opts.coerce) n = Math.round(n);
          else return fail(path, "expected integer");
        }
        if (opts.min !== undefined && n < opts.min) {
          if (opts.clamp) n = opts.min;
          else return fail(path, `number below ${opts.min}`);
        }
        if (opts.max !== undefined && n > opts.max) {
          if (opts.clamp) n = opts.max;
          else return fail(path, `number above ${opts.max}`);
        }
        return okv(n);
      },
      () => ({ type: opts.int ? "integer" : "number", ...(opts.min !== undefined && { minimum: opts.min }), ...(opts.max !== undefined && { maximum: opts.max }) }),
    );
  },

  boolean(opts: { coerce?: boolean } = {}): Schema<boolean> {
    return make<boolean>(
      "boolean",
      (v, path) => {
        if (typeof v === "boolean") return okv(v);
        if (opts.coerce && (v === "true" || v === "false")) return okv(v === "true");
        return fail(path, `expected boolean, got ${typeName(v)}`);
      },
      () => ({ type: "boolean" }),
    );
  },

  /** One of a fixed set of string/number literals. Strings match case-insensitively and are
   *  returned in their canonical spelling. */
  enum<const L extends readonly (string | number)[]>(values: L): Schema<L[number]> {
    return make<L[number]>(
      "enum",
      (v, path) => {
        const hit = values.find((x) => x === v || (typeof x === "string" && typeof v === "string" && x.toLowerCase() === v.trim().toLowerCase()));
        return hit !== undefined ? okv(hit) : fail(path, `expected one of ${values.map((x) => JSON.stringify(x)).join(", ")}`);
      },
      () => ({ enum: [...values] }),
    );
  },

  literal<const L extends string | number | boolean | null>(value: L): Schema<L> {
    return make<L>("literal", (v, path) => (v === value ? okv(value) : fail(path, `expected ${JSON.stringify(value)}`)), () => ({ const: value }));
  },

  array<T>(item: Schema<T>, opts: ArrayOpts = {}): Schema<T[]> {
    return make<T[]>(
      "array",
      (v, path) => {
        let arr: unknown[];
        if (Array.isArray(v)) arr = v;
        else if (opts.wrap && v !== undefined && v !== null) arr = [v];
        else return fail(path, `expected array, got ${typeName(v)}`);
        if (opts.flatten && item.kind !== "array") arr = flattenDeep(arr);
        const out: T[] = [];
        const issues: Issue[] = [];
        for (let i = 0; i < arr.length; i++) {
          const r = item.parse(arr[i], `${path}[${i}]`);
          if (r.ok) {
            out.push(r.value);
            issues.push(...r.issues);
          } else if (opts.salvage) {
            issues.push(...r.issues.map((x) => ({ ...x, message: `${x.message} (item dropped)` })));
          } else {
            return { ok: false, issues: r.issues };
          }
        }
        if (opts.min !== undefined && out.length < opts.min) return { ok: false, issues: [...issues, { path, message: `expected at least ${opts.min} items` }] };
        const capped = opts.max !== undefined && out.length > opts.max ? out.slice(0, opts.max) : out;
        if (capped !== out) issues.push({ path, message: `truncated to ${opts.max} items` });
        return okv(capped, issues);
      },
      () => ({ type: "array", items: item.jsonSchema(), ...(opts.min !== undefined && { minItems: opts.min }) }),
    );
  },

  object<S extends Shape>(shape: S): Schema<InferShape<S>> {
    return make<InferShape<S>>(
      "object",
      (v, path) => {
        if (!v || typeof v !== "object" || Array.isArray(v)) return fail(path, `expected object, got ${typeName(v)}`);
        const src = v as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        const issues: Issue[] = [];
        let failed = false;
        for (const [k, sch] of Object.entries(shape)) {
          const val = src[k];
          if (val === undefined || (val === null && sch.isOptional && sch.kind !== "nullable")) {
            if (sch.kind === "default") {
              out[k] = (sch.parse(undefined, `${path}.${k}`) as { value: unknown }).value;
              continue;
            }
            if (sch.isOptional) continue;
            issues.push({ path: `${path}.${k}`, message: "required" });
            failed = true;
            continue;
          }
          const r = sch.parse(val, `${path}.${k}`);
          if (r.ok) {
            if (r.value !== undefined) out[k] = r.value;
            issues.push(...r.issues);
          } else {
            issues.push(...r.issues);
            failed = true;
          }
        }
        return failed ? { ok: false, issues } : okv(out as InferShape<S>, issues);
      },
      () => {
        const properties: Record<string, unknown> = {};
        const required: string[] = [];
        for (const [k, sch] of Object.entries(shape)) {
          properties[k] = sch.jsonSchema();
          if (!sch.isOptional) required.push(k);
        }
        return { type: "object", properties, required, additionalProperties: false };
      },
    );
  },

  record<T>(value: Schema<T>, opts: RecordOpts = {}): Schema<Record<string, T>> {
    return make<Record<string, T>>(
      "record",
      (v, path) => {
        if (!v || typeof v !== "object" || Array.isArray(v)) return fail(path, `expected object, got ${typeName(v)}`);
        const src = v as Record<string, unknown>;
        const out: Record<string, T> = {};
        const issues: Issue[] = [];
        const allowed = opts.keys ? new Set(opts.keys) : null;
        for (const [k, val] of Object.entries(src)) {
          const p = `${path}[${JSON.stringify(k)}]`;
          if (allowed && !allowed.has(k)) {
            if (opts.dropExtra) {
              issues.push({ path: p, message: "unexpected key (dropped)" });
              continue;
            }
            return { ok: false, issues: [...issues, { path: p, message: "unexpected key" }] };
          }
          const r = value.parse(val, p);
          if (r.ok) {
            out[k] = r.value;
            issues.push(...r.issues);
          } else if (opts.salvage) {
            issues.push(...r.issues.map((x) => ({ ...x, message: `${x.message} (entry dropped)` })));
          } else {
            return { ok: false, issues: r.issues };
          }
        }
        if (opts.keys) {
          const missing = opts.keys.filter((k) => !(k in out));
          if (missing.length && !opts.salvage) {
            return { ok: false, issues: [...issues, { path, message: `missing keys: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? "…" : ""}` }] };
          }
          for (const k of missing) issues.push({ path: `${path}[${JSON.stringify(k)}]`, message: "missing" });
        }
        return okv(out, issues);
      },
      () => ({ type: "object", additionalProperties: value.jsonSchema() }),
    );
  },

  optional<T>(inner: Schema<T>): Schema<T | undefined> {
    return make<T | undefined>("optional", (v, path) => (v === undefined || v === null ? okv(undefined) : inner.parse(v, path)), () => inner.jsonSchema(), true);
  },

  nullable<T>(inner: Schema<T>): Schema<T | null> {
    return make<T | null>("nullable", (v, path) => (v === null ? okv(null) : inner.parse(v, path)), () => ({ anyOf: [inner.jsonSchema(), { type: "null" }] }), inner.isOptional);
  },

  /** First member that parses wins. */
  union<T extends Schema<any>[]>(...members: T): Schema<Infer<T[number]>> {
    return make<Infer<T[number]>>(
      "union",
      (v, path) => {
        const issues: Issue[] = [];
        for (const m of members) {
          const r = m.parse(v, path);
          if (r.ok) return r;
          issues.push(...r.issues);
        }
        return { ok: false, issues: issues.length ? [{ path, message: `no union member matched (${issues.map((i) => i.message).slice(0, 3).join("; ")})` }] : [{ path, message: "no union member matched" }] };
      },
      () => ({ anyOf: members.map((m) => m.jsonSchema()) }),
    );
  },

  /** Default when missing/null (the key becomes required in the output type). */
  withDefault<T>(inner: Schema<T>, fallback: T): Schema<T> {
    return make<T>("default", (v, path) => (v === undefined || v === null ? okv(fallback) : inner.parse(v, path)), () => inner.jsonSchema(), true);
  },

  any(): Schema<unknown> {
    return make<unknown>("any", (v) => okv(v), () => ({}));
  },

  /** Custom refinement on top of another schema. */
  refine<T>(inner: Schema<T>, check: (v: T) => string | undefined): Schema<T> {
    return make<T>(
      inner.kind,
      (v, path) => {
        const r = inner.parse(v, path);
        if (!r.ok) return r;
        const msg = check(r.value);
        return msg ? fail(path, msg) : r;
      },
      () => inner.jsonSchema(),
      inner.isOptional,
    );
  },
};

function flattenDeep(arr: unknown[]): unknown[] {
  const out: unknown[] = [];
  for (const x of arr) {
    if (Array.isArray(x)) out.push(...flattenDeep(x));
    else out.push(x);
  }
  return out;
}

export function validate<T>(schema: Schema<T>, value: unknown): ParseResult<T> {
  return schema.parse(value, "$");
}

/** Compact human-readable issue list for logs and re-ask prompts. */
export function formatIssues(issues: readonly Issue[], max = 12): string {
  const lines = issues.slice(0, max).map((i) => `- ${i.path}: ${i.message}`);
  if (issues.length > max) lines.push(`- …and ${issues.length - max} more`);
  return lines.join("\n");
}
