import { adopt, canReveal, type Discovered, type Item, type LibOp, type Library } from "../lib/types";
import type { MenuAction } from "./ContextMenu";

/** Algo que aparece num tile: item da biblioteca ou app de "Todos". */
export type Entry = { item: Item; fromAll: false } | { item: Discovered; fromAll: true };

export interface ItemHandlers {
  onLaunch(id: string, admin?: boolean): Promise<string | null>;
  onApply(op: LibOp): Promise<string | null>;
  onReveal(id: string): Promise<string | null>;
}

export const KIND_LABEL: Record<string, string> = { app: "Programa", folder: "Pasta", file: "Arquivo", site: "Site", mode: "Modo" };

/** Busca os itens de uma lista de ids, ignorando ids que não existem mais. */
export function itemsByIds(library: Library, ids: string[]): Item[] {
  const byId = new Map(library.items.map((i) => [i.id, i]));
  return ids.map((id) => byId.get(id)).filter((i): i is Item => !!i);
}

/** Apps de "Todos" que o dono não escondeu. */
export function visibleDiscovered(library: Library, discovered: Discovered[]): Discovered[] {
  const hidden = new Set(library.hidden);
  return discovered.filter((d) => !hidden.has(d.id));
}

export function entryKind(e: Entry) {
  return e.fromAll ? ("app" as const) : e.item.kind;
}

export function entryCanReveal(e: Entry) {
  return canReveal({ kind: entryKind(e), target: e.item.target });
}

/**
 * Executa uma ação do menu de contexto. Itens de "Todos" entram na biblioteca
 * (`addItem`) antes de qualquer ação que precise deles lá.
 * Devolve a mensagem de erro, ou `null`.
 */
export async function runMenuAction(
  action: MenuAction,
  entry: Entry,
  library: Library,
  h: ItemHandlers,
  ctx: { inCategory?: string; startRename(id: string): void; editMode?(id: string): void },
): Promise<string | null> {
  const id = entry.item.id;
  const ensure = async () => {
    if (entry.fromAll && !library.items.some((i) => i.id === id)) {
      return h.onApply({ op: "addItem", item: adopt(entry.item) });
    }
    return null;
  };
  const then = async (op: LibOp) => (await ensure()) ?? h.onApply(op);

  if (action === "open") return h.onLaunch(id, false);
  if (action === "openAdmin") return h.onLaunch(id, true);
  if (action === "reveal") return h.onReveal(id);
  if (action === "toggleFavorite") return then({ op: "toggleFavorite", id });
  if (action === "removeFromCategory" && ctx.inCategory)
    return h.onApply({ op: "removeFromCategory", category: ctx.inCategory, id });
  if (action === "rename") {
    ctx.startRename(id);
    return null;
  }
  if (action === "editMode") {
    ctx.editMode?.(id);
    return null;
  }
  if (action === "remove") return h.onApply({ op: "removeItem", id });
  if (action === "hide") return h.onApply({ op: "hide", id });
  if (typeof action === "object") {
    const err = await then({ op: "addToCategory", category: action.moveTo, id });
    if (err || !ctx.inCategory) return err;
    return h.onApply({ op: "removeFromCategory", category: ctx.inCategory, id });
  }
  return null;
}
