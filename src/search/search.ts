import {
  SYSTEM_COMMANDS,
  type Discovered,
  type EverythingStatus,
  type FileHit,
  type Library,
  type SystemCommand,
  type VaultEntry,
  type WebShortcut,
} from "../lib/types";
import type { Entry } from "../items/actions";
import { calculate, formatNumber } from "./calc";
import { score } from "./fuzzy";
import { matchShortcut } from "./web";

export type SearchResult =
  | { type: "calc"; id: "calc"; value: number; text: string }
  | { type: "web"; id: string; title: string; url: string }
  | { type: "item"; id: string; entry: Entry; score: number }
  | { type: "command"; id: string; command: SystemCommand; label: string }
  | { type: "file"; id: string; hit: FileHit }
  | { type: "fileStatus"; id: "files-status"; status: Exclude<EverythingStatus, "ready"> }
  | { type: "password"; id: string; entry: VaultEntry };

export interface SearchContext {
  library: Library;
  discovered: Discovered[];
  shortcuts: WebShortcut[];
}

/** Bônus por uso: quem abre mais, aparece antes. */
const USE_WEIGHT = 6;

/**
 * Resultados para o texto digitado, na ordem do documento do projeto:
 * calculadora → internet → itens e programas → comandos do PC.
 */
export function search(input: string, ctx: SearchContext, limit = 30): SearchResult[] {
  const q = input.trim();
  if (!q) return [];
  const out: SearchResult[] = [];

  const value = calculate(q);
  if (value !== null) out.push({ type: "calc", id: "calc", value, text: formatNumber(value) });

  const web = matchShortcut(q, ctx.shortcuts);
  if (web) {
    out.push({ type: "web", id: `web:${web.shortcut.keyword}`, title: `Pesquisar “${web.query}” no ${web.shortcut.name}`, url: web.url });
  }

  const owned = new Set(ctx.library.items.map((i) => i.id));
  const hidden = new Set(ctx.library.hidden);
  const entries: Entry[] = [
    ...ctx.library.items.map((item) => ({ item, fromAll: false as const })),
    ...ctx.discovered.filter((d) => !owned.has(d.id) && !hidden.has(d.id)).map((item) => ({ item, fromAll: true as const })),
  ];
  const launches = ctx.library.launches ?? {};
  const items = entries
    .map((entry) => {
      const s = score(q, entry.item.name);
      const bonus = s > 0 ? USE_WEIGHT * Math.log2(1 + (launches[entry.item.id] ?? 0)) : 0;
      return { entry, score: s + bonus, base: s };
    })
    .filter((r) => r.base > 0)
    .sort((a, b) => b.score - a.score || a.entry.item.name.length - b.entry.item.name.length)
    .slice(0, limit);
  for (const r of items) out.push({ type: "item", id: r.entry.item.id, entry: r.entry, score: r.score });

  for (const c of SYSTEM_COMMANDS) {
    if (score(q, c.label) > 0) out.push({ type: "command", id: `cmd:${c.id}`, command: c.id, label: c.label });
  }
  return out;
}

const MAX_PASSWORDS = 10;

/** Contas do cofre (só existem com o cofre desbloqueado) que combinam com o texto. */
export function searchVault(input: string, entries: VaultEntry[]): SearchResult[] {
  const q = input.trim();
  if (q.length < 2 || entries.length === 0) return [];
  return entries
    .map((entry) => ({ entry, s: Math.max(score(q, entry.name), score(q, entry.username ?? "")) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, MAX_PASSWORDS)
    .map(({ entry }) => ({ type: "password" as const, id: `pw:${entry.id}`, entry }));
}
