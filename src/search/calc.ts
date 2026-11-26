/** Calculadora da busca: parser recursivo próprio (nunca `eval`). */

type Token = { t: "num"; v: number } | { t: "op"; v: string };

const LOOKS_LIKE_DATE = /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/;

function tokenize(input: string): Token[] | null {
  const out: Token[] = [];
  const s = input.replace(/\s+/g, "");
  let i = 0;
  while (i < s.length) {
    const rest = s.slice(i);
    const num = /^\d+(?:[.,]\d+)?/.exec(rest);
    if (num) {
      out.push({ t: "num", v: Number(num[0].replace(",", ".")) });
      i += num[0].length;
      continue;
    }
    const ch = s[i].toLowerCase();
    const op = ch === "x" || ch === "×" ? "*" : ch === "÷" ? "/" : ch;
    if (!"+-*/^%()".includes(op)) return null;
    out.push({ t: "op", v: op });
    i++;
  }
  return out;
}

class Parser {
  private i = 0;
  constructor(private tokens: Token[]) {}

  parse(): number | null {
    const v = this.expr();
    return v !== null && this.i === this.tokens.length ? v : null;
  }

  private peek(op: string) {
    const t = this.tokens[this.i];
    return t?.t === "op" && t.v === op;
  }

  private expr(): number | null {
    let left = this.term();
    while (left !== null && (this.peek("+") || this.peek("-"))) {
      const op = (this.tokens[this.i++] as { v: string }).v;
      const right = this.term();
      if (right === null) return null;
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  private term(): number | null {
    let left = this.unary();
    while (left !== null && (this.peek("*") || this.peek("/"))) {
      const op = (this.tokens[this.i++] as { v: string }).v;
      const right = this.unary();
      if (right === null) return null;
      left = op === "*" ? left * right : left / right;
    }
    return left;
  }

  private unary(): number | null {
    if (this.peek("-")) {
      this.i++;
      const v = this.unary();
      return v === null ? null : -v;
    }
    return this.power();
  }

  private power(): number | null {
    const base = this.postfix();
    if (base === null || !this.peek("^")) return base;
    this.i++;
    const exp = this.unary();
    return exp === null ? null : base ** exp;
  }

  private postfix(): number | null {
    let v = this.primary();
    while (v !== null && this.peek("%")) {
      this.i++;
      v = v / 100;
    }
    return v;
  }

  private primary(): number | null {
    const t = this.tokens[this.i];
    if (!t) return null;
    if (t.t === "num") {
      this.i++;
      return t.v;
    }
    if (t.v === "(") {
      this.i++;
      const v = this.expr();
      if (v === null || !this.peek(")")) return null;
      this.i++;
      return v;
    }
    return null;
  }
}

/** Resultado da conta, ou `null` se o texto não for uma conta. */
export function calculate(input: string): number | null {
  const s = input.trim();
  if (!/\d/.test(s) || LOOKS_LIKE_DATE.test(s)) return null;
  const tokens = tokenize(s);
  if (!tokens || !tokens.some((t) => t.t === "op" && t.v !== "(" && t.v !== ")")) return null;
  const v = new Parser(tokens).parse();
  return v !== null && Number.isFinite(v) ? v : null;
}

const FORMAT = new Intl.NumberFormat("pt-BR", { maximumSignificantDigits: 10 });

/** 2.5 → "2,5"; 1234567 → "1.234.567". */
export function formatNumber(n: number): string {
  return FORMAT.format(n);
}
