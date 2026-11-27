import type { WebShortcut } from "../lib/types";

/** `yt lofi` → YouTube com a pesquisa "lofi". A 1ª palavra é a palavra-chave. */
export function matchShortcut(
  input: string,
  shortcuts: WebShortcut[],
): { shortcut: WebShortcut; query: string; url: string } | null {
  const m = /^\s*(\S+)\s+(.+)$/.exec(input);
  if (!m) return null;
  const query = m[2].trim();
  const shortcut = shortcuts.find((s) => s.keyword.toLowerCase() === m[1].toLowerCase());
  if (!shortcut || !query) return null;
  return { shortcut, query, url: shortcut.url.split("{q}").join(encodeURIComponent(query)) };
}
