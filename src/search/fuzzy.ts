import { normalize } from "./normalize";

const WORD_SPLIT = /[\s\-_.()]+/;

/** Distância de edição com transposição (Damerau/OSA), parando cedo acima de `max`. */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

function isSubsequence(q: string, s: string): boolean {
  let i = 0;
  for (const ch of s) if (ch === q[i]) i++;
  return i === q.length;
}

/**
 * Quão bem `query` combina com `name` (0 = não combina).
 * Igual 100 · começa com 90 · começo de palavra 80 · iniciais 75 · contém 60 ·
 * subsequência 40 (3+ letras) · um erro de digitação 30 (4+ letras).
 */
export function score(query: string, name: string): number {
  const q = normalize(query);
  const n = normalize(name);
  if (!q || !n) return 0;
  if (n === q) return 100;
  if (n.startsWith(q)) return 90;
  const words = n.split(WORD_SPLIT).filter(Boolean);
  if (words.some((w) => w.startsWith(q))) return 80;
  const compact = q.replace(/ /g, "");
  if (compact.length >= 2 && words.map((w) => w[0]).join("").startsWith(compact)) return 75;
  if (n.includes(q)) return 60;
  if (compact.length >= 3 && isSubsequence(compact, n.replace(/ /g, ""))) return 40;
  if (q.length >= 4) {
    for (const w of words) {
      for (const len of [q.length - 1, q.length, q.length + 1]) {
        if (len > 0 && len <= w.length && distance(q, w.slice(0, len), 1) <= 1) return 30;
      }
    }
  }
  return 0;
}
