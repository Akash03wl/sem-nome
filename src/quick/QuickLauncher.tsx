import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import {
  EVERYTHING_MESSAGE,
  SYSTEM_COMMANDS,
  type Discovered,
  type EverythingStatus,
  type FileHit,
  type LibOp,
  type Library,
  type SystemCommand,
  type VaultEntry,
  type VaultField,
  type WebShortcut,
} from "../lib/types";
import { fileSearchEnabled, useFileSearch } from "../search/useFileSearch";
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
import { search, searchVault, type SearchResult } from "../search/search";
import { useConfirm } from "./useConfirm";
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
  shortcuts: WebShortcut[];
  onSystem(cmd: SystemCommand): Promise<string | null>;
  onOpenUrl(url: string): Promise<string | null>;
  onCopy(text: string): Promise<void>;
  /** Arquivos do PC (Everything), ou o motivo de não poder buscar. */
  onSearchFiles(query: string): Promise<FileHit[] | EverythingStatus>;
  onOpenPath(path: string, admin: boolean): Promise<string | null>;
  onRevealPath(path: string): Promise<string | null>;
  /** Abre ou instala o Everything, conforme o status. */
  onEverythingFix(status: EverythingStatus): Promise<string | null>;
  /** Contas do cofre (vazio quando travado). */
  vault: VaultEntry[];
  onVaultCopy(id: string, field: VaultField): Promise<string | null>;
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

const GROUP_TITLE: Record<SearchResult["type"], string> = {
  calc: "Calculadora",
  web: "Internet",
  item: "Itens",
  command: "Comandos do PC",
  file: "Arquivos",
  fileStatus: "Arquivos",
  password: "Senhas",
};

/** "C:\\Docs\\a.pdf" → "C:\\Docs" */
const parentDir = (path: string) => path.replace(/[\\/][^\\/]*$/, "") || path;

/** "Desligar" → "desligar"; usado em "Clique de novo para desligar". */
const lower = (label: string) => label.charAt(0).toLowerCase() + label.slice(1);

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
  const [selected, setSelected] = useState(0);
  const [copied, setCopied] = useState(false);
  const confirm = useConfirm();
  const listRef = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState<Section>("fav");
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; entry: Entry } | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const favorites = itemsByIds(library, library.favorites);
  const category = library.categories.find((c) => c.id === section);
  const allApps = visibleDiscovered(library, discovered);
  const baseResults = useMemo(
    () => search(query, { library, discovered, shortcuts: props.shortcuts }),
    [query, library, discovered, props.shortcuts],
  );
  const files = useFileSearch(query, fileSearchEnabled(query, props.shortcuts), props.onSearchFiles);
  const passwords = useMemo(() => searchVault(query, props.vault), [query, props.vault]);
  const results = useMemo<SearchResult[]>(() => {
    const fileRows: SearchResult[] =
      files.status && files.status !== "ready"
        ? [{ type: "fileStatus", id: "files-status", status: files.status }]
        : files.hits.map((hit) => ({ type: "file" as const, id: `file:${hit.path}`, hit }));
    return [...baseResults, ...fileRows, ...passwords];
  }, [baseResults, files.hits, files.status, passwords]);
  const searching = query.trim() !== "";

  useEffect(() => {
    setSelected(0);
    setCopied(false);
    confirm.reset();
  }, [query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>("[aria-selected=true]")?.scrollIntoView?.({ block: "nearest" });
  }, [selected]);

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

  /** Comando do PC, com segundo clique/Enter quando ele pede confirmação. */
  async function runCommand(cmd: SystemCommand) {
    const info = SYSTEM_COMMANDS.find((c) => c.id === cmd);
    if (info?.needsConfirm && !confirm.ask(cmd)) return;
    const err = await props.onSystem(cmd);
    if (err) setError(err);
    else onHide();
  }

  async function activate(r: SearchResult, mods: { ctrl: boolean; shift: boolean }) {
    if (r.type === "calc") {
      await props.onCopy(String(r.value));
      setCopied(true);
    } else if (r.type === "web") {
      const err = await props.onOpenUrl(r.url);
      if (err) setError(err);
      else onHide();
    } else if (r.type === "item") {
      if (mods.shift) setError(await props.onReveal(r.id));
      else await open(r.id, mods.ctrl);
    } else if (r.type === "file") {
      if (mods.shift) {
        setError(await props.onRevealPath(r.hit.path));
        return;
      }
      const err = await props.onOpenPath(r.hit.path, mods.ctrl);
      if (err) setError(err);
      else onHide();
    } else if (r.type === "password") {
      const field: VaultField = mods.shift || !r.entry.hasPassword ? "username" : "password";
      const err = await props.onVaultCopy(r.entry.id, field);
      if (err) setError(err);
      else onHide();
    } else if (r.type === "fileStatus") {
      // Instalar leva minutos e pede permissão do Windows: isso fica no painel, que mostra o progresso.
      if (r.status === "notInstalled") onOpenPanel();
      else setError(await props.onEverythingFix(r.status));
    } else {
      await runCommand(r.command);
    }
  }

  const keyState = useRef({ results, selected, searching });
  keyState.current = { results, selected, searching };

  useEffect(() => {
    // Limpa ao esconder (e não só ao mostrar), para o texto antigo nunca piscar na reabertura.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setQuery("");
        onHide();
        return;
      }
      const ks = keyState.current;
      // Setas e Enter só valem na caixa de busca (não no campo de renomear, no menu ou num botão),
      // e nunca durante a composição de acentos (IME).
      const inSearch = e.target === inputRef.current && !e.isComposing;
      if (inSearch && ks.searching && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        const n = ks.results.length;
        if (n) setSelected((i) => (e.key === "ArrowDown" ? (i + 1) % n : (i - 1 + n) % n));
        return;
      }
      if (inSearch && ks.searching && e.key === "Enter" && !e.altKey) {
        const r = ks.results[ks.selected];
        // Enter segurado se repete: nunca vale como confirmação.
        if (r && !e.repeat) {
          e.preventDefault();
          void activateRef.current(r, { ctrl: e.ctrlKey, shift: e.shiftKey });
        }
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

  const activateRef = useRef(activate);
  activateRef.current = activate;

  async function onMenuAction(action: MenuAction) {
    if (!menu) return;
    if (action === "open" || action === "openAdmin") {
      await open(menu.entry.item.id, action === "openAdmin");
      return;
    }
    const err = await runMenuAction(action, menu.entry, library, props, {
      inCategory: category?.id,
      startRename: (id) => setRenaming({ id, name: menu.entry.item.name }),
      editMode: () => onOpenPanel(),
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

  function renderResult(r: SearchResult) {
    const mods = { ctrl: false, shift: false };
    if (r.type === "item") {
      return (
        <Tile
          entry={r.entry}
          size="row"
          onOpen={() => void activate(r, mods)}
          onContext={(pos) => setMenu({ ...pos, entry: r.entry })}
        />
      );
    }
    if (r.type === "file") {
      return (
        <button type="button" className="quick-result-btn quick-file" onClick={() => void activate(r, mods)}>
          <span className="quick-file-icon" aria-hidden="true">
            {r.hit.isDir ? "▣" : "▤"}
          </span>
          <span className="quick-result-title">{r.hit.name}</span>
          <span className="quick-result-detail quick-file-path">{parentDir(r.hit.path)}</span>
        </button>
      );
    }
    if (r.type === "password") {
      return (
        <button type="button" className="quick-result-btn quick-file" onClick={() => void activate(r, mods)}>
          <span className="quick-file-icon quick-key-icon" aria-hidden="true">
            ●
          </span>
          <span className="quick-result-title">{r.entry.name}</span>
          <span className="quick-result-detail">{r.entry.username ? `${r.entry.username} · ` : ""}↵ senha · ⇧↵ usuário</span>
        </button>
      );
    }
    if (r.type === "fileStatus") {
      const info = EVERYTHING_MESSAGE[r.status];
      return (
        <div className="quick-result-btn quick-file-status">
          <span className="quick-result-title">{info.text}</span>
          {info.action && (
            <button type="button" className="quick-inline-btn" onClick={() => void activate(r, mods)}>
              {r.status === "notInstalled" ? "Instalar pelo painel" : info.action}
            </button>
          )}
        </div>
      );
    }
    let title: string;
    let detail: string;
    if (r.type === "calc") {
      title = `= ${r.text}`;
      detail = copied ? "Copiado!" : "Enter copia";
    } else if (r.type === "web") {
      title = r.title;
      detail = "Enter abre";
    } else {
      const armed = confirm.armed === r.command;
      title = armed ? `Pressione Enter de novo para ${lower(r.label)}` : r.label;
      detail = SYSTEM_COMMANDS.find((c) => c.id === r.command)?.needsConfirm ? "Pede confirmação" : "";
    }
    return (
      <button type="button" className="quick-result-btn" onClick={() => void activate(r, mods)}>
        <span className="quick-result-title">{title}</span>
        {detail && <span className="quick-result-detail">{detail}</span>}
      </button>
    );
  }

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

        <div className="quick-content" ref={listRef}>
          {searching && (
            <div role="listbox" aria-label="Resultados" className="quick-results">
              {results.length === 0 && (
                <p className="quick-empty">Nada encontrado. Dica: g + espaço + texto pesquisa no Google.</p>
              )}
              {results.map((r, i) => (
                <div key={r.id} className="quick-result-wrap">
                  {(i === 0 || results[i - 1].type !== r.type) && <h2 className="quick-label">{GROUP_TITLE[r.type]}</h2>}
                  <div
                    role="option"
                    aria-selected={i === selected}
                    className={i === selected ? "quick-result is-selected" : "quick-result"}
                    onMouseMove={() => setSelected(i)}
                  >
                    {renderResult(r)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!searching && section === "fav" && (
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

          {!searching && category && (
            <section className="quick-section" aria-label={category.name}>
              <h2 className="quick-label">{category.name}</h2>
              {category.items.length === 0 ? (
                <p className="quick-empty">Nenhum item nesta categoria. Abra o painel para adicionar.</p>
              ) : (
                <div className="quick-grid">{owned(category.items).map((e) => tile(e))}</div>
              )}
            </section>
          )}

          {!searching && section === "all" && (
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
          {SYSTEM_COMMANDS.map((c) => {
            const armed = confirm.armed === c.id;
            const label = armed ? `Clique de novo para ${lower(c.label)}` : c.label;
            return (
              <button
                key={c.id}
                type="button"
                className={armed ? "quick-cmd is-armed" : "quick-cmd"}
                title={label}
                aria-label={label}
                onClick={() => void runCommand(c.id)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={c.icon} />
                </svg>
              </button>
            );
          })}
          {confirm.armed && <span className="quick-cmd-hint">Clique de novo para confirmar</span>}
        </section>

        <footer className="quick-footer">
          <span>↑↓ escolher · ↵ abrir · Ctrl+↵ admin · Esc fechar</span>
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
