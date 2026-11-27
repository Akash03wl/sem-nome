/** Calculadora da busca: parser recursivo próprio (nunca `eval`). */

type Token = { t: "num"; v: number } | { t: "op"; v: string };

const LOOKS_LIKE_DATE = /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/;
/** Contas reais são curtas; textos enormes (ou colados por engano) nem entram no parser. */
const MAX_LENGTH = 200;
/** pt-BR: "1.500" e "1.000.000,25" usam ponto como separador de milhar. */
const GROUPED = /^\d{1,3}(?:\.\d{3})+(?:,\d+)?/;
const PLAIN = /^\d+(?:[.,]\d+)?/;

function tokenize(input: string): Token[] | null {
  const out: Token[] = [];
  const s = input.replace(/\s+/g, "");
  let i = 0;
  while (i < s.length) {
    const rest = s.slice(i);
    const grouped = GROUPED.exec(rest);
    if (grouped) {
      out.push({ t: "num", v: Number(grouped[0].replace(/\./g, "").replace(",", ".")) });
      i += grouped[0].length;
      continue;
    }
    const num = PLAIN.exec(rest);
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
  if (s.length > MAX_LENGTH || !/\d/.test(s) || LOOKS_LIKE_DATE.test(s)) return null;
  const tokens = tokenize(s);
  if (!tokens || !tokens.some((t) => t.t === "op" && t.v !== "(" && t.v !== ")")) return null;
  try {
    const v = new Parser(tokens).parse();
    return v !== null && Number.isFinite(v) ? v : null;
  } catch {
    // Qualquer falha inesperada do parser vira "não é conta", nunca derruba a busca.
    return null;
  }
}

const FORMAT = new Intl.NumberFormat("pt-BR", { maximumSignificantDigits: 10 });

/** 2.5 → "2,5"; 1234567 → "1.234.567". */
export function formatNumber(n: number): string {
  return FORMAT.format(n);
}
