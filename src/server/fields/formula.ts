/**
 * Safe formula evaluator for FORMULA custom fields (04-module-specs §3, CLAUDE.md rule 3:
 * "no `eval`"). Supports numbers, the four operators with correct precedence, unary
 * minus, parentheses, and field references by name. A recursive-descent parser — never
 * touches the JS runtime, so a malicious formula can't execute anything.
 *
 *   evaluateFormula("(budget - spent) * 1.1", { budget: 1000, spent: 400 }) === 660
 *
 * Field references resolve from `vars` (other numeric field values). A reference to a
 * missing/non-numeric field makes the whole expression return null (blank), matching
 * ClickUp's "waiting on inputs" behavior rather than throwing.
 */

type Token =
  | { t: "num"; v: number }
  | { t: "id"; v: string }
  | { t: "op"; v: "+" | "-" | "*" | "/" }
  | { t: "("; }
  | { t: ")"; };

class FormulaError extends Error {}

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n") {
      i++;
      continue;
    }
    if (c === "(" || c === ")") {
      tokens.push(c === "(" ? { t: "(" } : { t: ")" });
      i++;
      continue;
    }
    if (c === "+" || c === "-" || c === "*" || c === "/") {
      tokens.push({ t: "op", v: c });
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let num = "";
      while (i < src.length && /[0-9.]/.test(src[i])) num += src[i++];
      const v = Number(num);
      if (!Number.isFinite(v)) throw new FormulaError(`Bad number: ${num}`);
      tokens.push({ t: "num", v });
      continue;
    }
    // Identifier: letters, digits, underscore, space-joined words wrapped in {…} or bare.
    if (c === "{") {
      const end = src.indexOf("}", i);
      if (end === -1) throw new FormulaError("Unclosed { in field reference.");
      tokens.push({ t: "id", v: src.slice(i + 1, end).trim() });
      i = end + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let id = "";
      while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) id += src[i++];
      tokens.push({ t: "id", v: id });
      continue;
    }
    throw new FormulaError(`Unexpected character: ${c}`);
  }
  return tokens;
}

/**
 * Evaluate a formula against a variable map (field name → number). Returns the numeric
 * result, or null when a referenced field is missing/non-numeric. Throws FormulaError
 * only for a syntactically invalid formula (surfaced as a config error, not a value).
 */
export function evaluateFormula(formula: string, vars: Record<string, number>): number | null {
  const tokens = tokenize(formula);
  let pos = 0;
  let sawMissing = false;

  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  // expr := term (('+' | '-') term)*
  function parseExpr(): number {
    let left = parseTerm();
    while (peek()?.t === "op" && (peek() as { v: string }).v.match(/[+-]/)) {
      const op = (next() as { v: string }).v;
      const right = parseTerm();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }
  // term := factor (('*' | '/') factor)*
  function parseTerm(): number {
    let left = parseFactor();
    while (peek()?.t === "op" && (peek() as { v: string }).v.match(/[*/]/)) {
      const op = (next() as { v: string }).v;
      const right = parseFactor();
      if (op === "/" && right === 0) {
        sawMissing = true; // division by zero → blank result
        left = 0;
      } else {
        left = op === "*" ? left * right : left / right;
      }
    }
    return left;
  }
  // factor := '-' factor | '(' expr ')' | num | id
  function parseFactor(): number {
    const tok = peek();
    if (!tok) throw new FormulaError("Unexpected end of formula.");
    if (tok.t === "op" && tok.v === "-") {
      next();
      return -parseFactor();
    }
    if (tok.t === "(") {
      next();
      const v = parseExpr();
      if (peek()?.t !== ")") throw new FormulaError("Missing closing parenthesis.");
      next();
      return v;
    }
    if (tok.t === "num") {
      next();
      return tok.v;
    }
    if (tok.t === "id") {
      next();
      const v = vars[tok.v];
      if (typeof v !== "number" || !Number.isFinite(v)) {
        sawMissing = true;
        return 0;
      }
      return v;
    }
    throw new FormulaError(`Unexpected token: ${JSON.stringify(tok)}`);
  }

  const result = parseExpr();
  if (pos !== tokens.length) throw new FormulaError("Trailing tokens in formula.");
  if (sawMissing) return null;
  return Number.isFinite(result) ? result : null;
}

/** Validate a formula's syntax at definition time (throws FormulaError if invalid). */
export function assertValidFormula(formula: string): void {
  // Evaluate with an empty var map; references resolve to 0 (→ null), syntax errors throw.
  evaluateFormula(formula, {});
}
