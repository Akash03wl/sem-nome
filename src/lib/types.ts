/** Espelho de `vitra_core::settings::Settings` (serde camelCase). */
export interface Settings {
  version: number;
  hotkey: string;
  accent: string;
  autostart: boolean;
}

export const ACCENTS = ["#9b82ff", "#3fd0c9", "#ff8a4c", "#4c9dff"] as const;

export const ACCENT_NAMES: Record<string, string> = {
  "#9b82ff": "Roxo",
  "#3fd0c9": "Verde-água",
  "#ff8a4c": "Laranja",
  "#4c9dff": "Azul",
};

export type ItemKind = "app" | "folder" | "file" | "site";

/** Espelho de `vitra_core::library::Item`. */
export interface Item {
  id: string;
  name: string;
  kind: ItemKind;
  target: string;
  args: string;
  admin: boolean;
}

export interface Category {
  id: string;
  name: string;
  items: string[];
}

/** Espelho de `vitra_core::library::Library`. */
export interface Library {
  version: number;
  items: Item[];
  favorites: string[];
  categories: Category[];
  recents: string[];
  hidden: string[];
}

export const EMPTY_LIBRARY: Library = {
  version: 1,
  items: [],
  favorites: [],
  categories: [],
  recents: [],
  hidden: [],
};

/** Um app do Menu Iniciar ou da Store (ainda não está na biblioteca). */
export interface Discovered {
  id: string;
  name: string;
  target: string;
}

/** Espelho de `vitra_core::library::LibOp`. */
export type LibOp =
  | { op: "addItem"; item: Item }
  | { op: "removeItem"; id: string }
  | { op: "renameItem"; id: string; name: string }
  | { op: "setAdmin"; id: string; admin: boolean }
  | { op: "toggleFavorite"; id: string }
  | { op: "moveFavorite"; id: string; to: number }
  | { op: "createCategory"; name: string }
  | { op: "renameCategory"; id: string; name: string }
  | { op: "deleteCategory"; id: string }
  | { op: "addToCategory"; category: string; id: string }
  | { op: "removeFromCategory"; category: string; id: string }
  | { op: "recordLaunch"; id: string }
  | { op: "hide"; id: string }
  | { op: "unhide"; id: string };

/** Transforma um app descoberto em item da biblioteca. */
export function adopt(d: Discovered): Item {
  return { id: d.id, name: d.name, kind: "app", target: d.target, args: "", admin: false };
}

/** Dá para abrir o local no Explorer? (não para sites nem apps da lista do Windows). */
export function canReveal(item: { kind?: ItemKind; target: string }): boolean {
  return item.kind !== "site" && !item.target.toLowerCase().startsWith("shell:appsfolder");
}
