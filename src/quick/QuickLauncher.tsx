import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import type { Discovered, LibOp, Library } from "../lib/types";
import { useIcon } from "../lib/useIcon";
import { ItemTile } from "../items/ItemTile";
import { ContextMenu, type MenuAction } from "../items/ContextMenu";
import {
  KIND_LABEL,
  entryCanReveal,
  entryKind,
  itemsByIds,
  runMenuAction,
  visibleDiscovered,
  type Entry,
} from "../items/actions";
import "./QuickLauncher.css";

export interface QuickLauncherProps {
  accent: string;
  hotkeyLabel: string;
  /** Muda a cada vez que o pop-up é mostrado: limpa e foca a busca. */
  showNonce: number;
  library: Library;
  discovered: Discovered[];
  onHide(): void;
  onOpenPanel(): void;
  /** Devolve `null` se abriu, ou a mensagem de erro. */
  onLaunch(id: string, admin?: boolean): Promise<string | null>;
  onApply(op: LibOp): Promise<string | null>;
  onReveal(id: string): Promise<string | null>;
}

const KEY_NAMES: Record<string, string> = { Space: "Espaço", Super: "Win", Esc: "Esc" };
const MAX_FAVORITES_SHOWN = 12;
const MAX_HOTKEYS = 6;
const MAX_RECENTS_SHOWN = 5;

/** Converte um acelerador do Tauri ("Alt+Space") para exibição ("Alt+Espaço"). */
export function formatHotkey(hotkey: string): string {
  return hotkey
    .split("+")
    .map((p) => KEY_NAMES[p] ?? p)
    .join("+");
}

/** Comandos do PC: os botões funcionam a partir da Fase 3. */
const COMMANDS: { label: string; path: string }[] = [
  { label: "Desligar", path: "M12 3v8M6.3 7.3a8 8 0 1 0 11.4 0" },
  { label: "Reiniciar", path: "M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" },
  { label: "Suspender", path: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" },
  { label: "Bloquear", path: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z" },
  { label: "Sair da conta", path: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" },
  { label: "Esvaziar lixeira", path: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" },
];

type Section = "fav" | "all" | string;

function Tile(props: {
  entry: Entry;
  badge?: string;
  size?: "big" | "row";
  onOpen(): void;
  onContext(pos: { x: number; y: number }): void;
}) {
  const icon = useIcon(props.entry.item.id);
  const kind = entryKind(props.entry);
  return (
    <ItemTile
      item={{ ...props.entry.item, kind }}
      iconSrc={icon}
      badge={props.badge}
      size={props.size}
      detail={props.size === "row" ? KIND_LABEL[kind] : undefined}
      onOpen={props.onOpen}
      onContext={props.onContext}
    />
  );
}

export function QuickLauncher(props: QuickLauncherProps) {
  const { accent, hotkeyLabel, showNonce, library, discovered, onHide, onOpenPanel, onLaunch } = props;
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<Section>("fav");
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; entry: Entry } | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const favorites = itemsByIds(library, library.favorites);
  const category = library.categories.find((c) => c.id === section);
  const allApps = visibleDiscovered(library, discovered);

  useEffect(() => {
    setQuery("");
    setError(null);
    inputRef.current?.focus();
  }, [showNonce]);

  // Categoria apagada enquanto aberta: volta para Favoritos.
  useEffect(() => {
    if (section !== "fav" && section !== "all" && !category) setSection("fav");
  }, [section, category]);

  const open = useCallback(
    async (id: string, admin = false) => {
      const err = await onLaunch(id, admin);
      if (err) setError(err);
      else {
        setError(null);
        onHide();
      }
    },
    [onLaunch, onHide],
  );

  useEffect(() => {
    // Limpa ao esconder (e não só ao mostrar), para o texto antigo nunca piscar na reabertura.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setQuery("");
        onHide();
        return;
      }
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const digit = /^Digit([1-9])$/.exec(e.code)?.[1] ?? (/^[1-9]$/.test(e.key) ? e.key : null);
        const n = digit ? Number(digit) : 0;
        if (n >= 1 && n <= MAX_HOTKEYS && favorites[n - 1]) {
          e.preventDefault();
          void open(favorites[n - 1].id);
        }
      }
    };
    const onBlur = () => setQuery("");
    document.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, [onHide, favorites, open]);

  async function onMenuAction(action: MenuAction) {
    if (!menu) return;
    if (action === "open" || action === "openAdmin") {
      await open(menu.entry.item.id, action === "openAdmin");
      return;
    }
    const err = await runMenuAction(action, menu.entry, library, props, {
      inCategory: category?.id,
      startRename: (id) => setRenaming({ id, name: menu.entry.item.name }),
    });
    setError(err);
  }

  async function saveRename(e: FormEvent) {
    e.preventDefault();
    if (!renaming) return;
    const err = await props.onApply({ op: "renameItem", id: renaming.id, name: renaming.name });
    setError(err);
    if (!err) setRenaming(null);
  }

  const tile = (entry: Entry, opts: { badge?: string; size?: "big" | "row" } = {}) => (
    <Tile
      key={entry.item.id}
      entry={entry}
      {...opts}
      onOpen={() => void open(entry.item.id)}
      onContext={(pos) => setMenu({ ...pos, entry })}
    />
  );
  const owned = (ids: string[]) => itemsByIds(library, ids).map((item) => ({ item, fromAll: false as const }));

  const navButton = (id: Section, label: string, count?: number) => (
    <button
      key={id}
      type="button"
      className={section === id ? "quick-cat is-active" : "quick-cat"}
      aria-current={section === id}
      onClick={() => setSection(id)}
    >
      <span className="quick-cat-name">{label}</span>
      {section === id ? <span className="quick-cat-dot" aria-hidden="true" /> : count !== undefined && <span className="quick-cat-count">{count}</span>}
    </button>
  );

  return (
    <div className="quick" style={{ "--accent": accent } as CSSProperties}>
      <nav className="quick-side" aria-label="Categorias">
        <div className="quick-brand">
          <span className="quick-brand-dot" aria-hidden="true" />
          <span>Vitra</span>
        </div>
        {navButton("fav", "Favoritos", library.favorites.length)}
        {library.categories.map((c) => navButton(c.id, c.name, c.items.length))}
        {navButton("all", "Todos", allApps.length)}
      </nav>

      <main className="quick-main">
        <label className="quick-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-4-4" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            aria-label="Buscar"
            placeholder="Buscar programas, pastas, sites…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
          <kbd>{formatHotkey(hotkeyLabel)}</kbd>
        </label>

        {error && (
          <p role="alert" className="quick-alert">
            {error}
          </p>
        )}

        {renaming && (
          <form className="quick-rename" onSubmit={saveRename}>
            <label htmlFor="rename">Novo nome</label>
            <input id="rename" autoFocus value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} />
            <button type="submit">Salvar</button>
            <button type="button" onClick={() => setRenaming(null)}>
              Cancelar
            </button>
          </form>
        )}

        <div className="quick-content">
          {section === "fav" && (
            <>
              <section className="quick-section" aria-label="Favoritos">
                <h2 className="quick-label">Favoritos</h2>
                {favorites.length === 0 ? (
                  <p className="quick-empty">Seus favoritos aparecem aqui. Abra o painel para adicionar.</p>
                ) : (
                  <div className="quick-grid">
                    {favorites.slice(0, MAX_FAVORITES_SHOWN).map((item, i) =>
                      tile({ item, fromAll: false }, { badge: i < MAX_HOTKEYS ? String(i + 1) : undefined }),
                    )}
                  </div>
                )}
              </section>
              {library.recents.length > 0 && (
                <section className="quick-section" aria-label="Recentes">
                  <h2 className="quick-label">Recentes</h2>
                  <div className="quick-rows">{owned(library.recents.slice(0, MAX_RECENTS_SHOWN)).map((e) => tile(e, { size: "row" }))}</div>
                </section>
              )}
            </>
          )}

          {category && (
            <section className="quick-section" aria-label={category.name}>
              <h2 className="quick-label">{category.name}</h2>
              {category.items.length === 0 ? (
                <p className="quick-empty">Nenhum item nesta categoria. Abra o painel para adicionar.</p>
              ) : (
                <div className="quick-grid">{owned(category.items).map((e) => tile(e))}</div>
              )}
            </section>
          )}

          {section === "all" && (
            <section className="quick-section" aria-label="Todos">
              <h2 className="quick-label">Todos os programas</h2>
              {allApps.length === 0 ? (
                <p className="quick-empty">Procurando seus programas…</p>
              ) : (
                <div className="quick-rows">{allApps.map((item) => tile({ item, fromAll: true }, { size: "row" }))}</div>
              )}
            </section>
          )}
        </div>

        <section className="quick-commands" aria-label="Comandos do PC">
          {COMMANDS.map((c) => (
            <button key={c.label} type="button" className="quick-cmd" disabled title={`${c.label} (em breve)`} aria-label={c.label}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={c.path} />
              </svg>
            </button>
          ))}
        </section>

        <footer className="quick-footer">
          <span>↵ abrir · Esc fechar · Alt+1…6 favoritos</span>
          <button type="button" className="quick-link" onClick={onOpenPanel}>
            Abrir painel ›
          </button>
        </footer>
      </main>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          kind={entryKind(menu.entry)}
          canReveal={entryCanReveal(menu.entry)}
          isFavorite={library.favorites.includes(menu.entry.item.id)}
          categories={library.categories}
          inCategory={category?.id}
          fromAll={menu.entry.fromAll}
          onAction={(a) => void onMenuAction(a)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
