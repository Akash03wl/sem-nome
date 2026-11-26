/** Espelho de `vitra_core::settings::Settings` (serde camelCase). */
/** Palavra-chave de pesquisa (`yt lofi`). `url` tem `{q}` onde entra a pesquisa. */
export interface WebShortcut {
  keyword: string;
  name: string;
  url: string;
}

export interface Settings {
  version: number;
  hotkey: string;
  accent: string;
  autostart: boolean;
  webShortcuts: WebShortcut[];
}

/** Espelho de `vitra_core::system::SystemCommand`. */
export type SystemCommand = "shutdown" | "restart" | "sleep" | "lock" | "logoff" | "emptyRecycleBin";

export const SYSTEM_COMMANDS: { id: SystemCommand; label: string; needsConfirm: boolean; icon: string }[] = [
  { id: "shutdown", label: "Desligar", needsConfirm: true, icon: "M12 3v8M6.3 7.3a8 8 0 1 0 11.4 0" },
  { id: "restart", label: "Reiniciar", needsConfirm: true, icon: "M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" },
  { id: "sleep", label: "Suspender", needsConfirm: false, icon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" },
  { id: "lock", label: "Bloquear", needsConfirm: false, icon: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z" },
  { id: "logoff", label: "Sair da conta", needsConfirm: true, icon: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" },
  { id: "emptyRecycleBin", label: "Esvaziar lixeira", needsConfirm: true, icon: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" },
];

export const ACCENTS = ["#9b82ff", "#3fd0c9", "#ff8a4c", "#4c9dff"] as const;

export const ACCENT_NAMES: Record<string, string> = {
  "#9b82ff": "Roxo",
  "#3fd0c9": "Verde-água",
  "#ff8a4c": "Laranja",
  "#4c9dff": "Azul",
};

export type ItemKind = "app" | "folder" | "file" | "site" | "mode";

/** Espelho de `vitra_core::library::Item`. */
export interface Item {
  id: string;
  name: string;
  kind: ItemKind;
  target: string;
  args: string;
  admin: boolean;
  /** Só para modos: ids dos itens que abrem juntos. */
  members?: string[];
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
  /** Quantas vezes cada item foi aberto. */
  launches?: Record<string, number>;
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
  | { op: "unhide"; id: string }
  | { op: "createMode"; name: string; members: string[] }
  | { op: "setModeMembers"; id: string; members: string[] };

/** Transforma um app descoberto em item da biblioteca. */
export function adopt(d: Discovered): Item {
  return { id: d.id, name: d.name, kind: "app", target: d.target, args: "", admin: false };
}

/** Dá para abrir o local no Explorer? (não para sites nem apps da lista do Windows). */
export function canReveal(item: { kind?: ItemKind; target: string }): boolean {
  return item.kind !== "site" && item.kind !== "mode" && !item.target.toLowerCase().startsWith("shell:appsfolder");
}
