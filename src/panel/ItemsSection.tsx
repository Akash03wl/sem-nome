import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Discovered, LibOp, Library } from "../lib/types";
import { useIcon } from "../lib/useIcon";
import { ItemTile } from "../items/ItemTile";
import { ContextMenu, type MenuAction } from "../items/ContextMenu";
import {
  entryCanReveal,
  entryKind,
  itemsByIds,
  runMenuAction,
  visibleDiscovered,
  type Entry,
} from "../items/actions";
import { ModeForm } from "./ModeForm";
import type { Item } from "../lib/types";
import "./ItemsSection.css";

export const FAVORITES = "favoritos";
export const ALL = "todos";

export interface ItemsSectionProps {
  library: Library;
  discovered: Discovered[];
  onApply(op: LibOp): Promise<string | null>;
  onLaunch(id: string, admin?: boolean): Promise<string | null>;
  onReveal(id: string): Promise<string | null>;
  /** Abre o seletor do Windows (arquivos ou pastas) e adiciona na categoria. */
  onAddFiles(category: string, folders: boolean): Promise<string | null>;
  onAddSite(name: string, url: string, category: string): Promise<string | null>;
  /** Avisa qual categoria está aberta (para onde vai o que for arrastado do Windows). */
  onSelectCategory?(id: string): void;
  /** Erro vindo de fora (ex.: ao soltar arquivos do Windows). */
  externalError?: { message: string | null } | null;
}

/** Distância (px) que o mouse anda antes de virar "arrastar". */
const DRAG_THRESHOLD = 6;

function Tile(p: { entry: Entry; dropId?: string; onOpen(): void; onContext(pos: { x: number; y: number }): void; onPointerDown(e: React.PointerEvent): void }) {
  const icon = useIcon(p.entry.item.id);
  return (
    <ItemTile
      item={{ ...p.entry.item, kind: entryKind(p.entry) }}
      iconSrc={icon}
      dropId={p.dropId}
      onOpen={p.onOpen}
      onContext={p.onContext}
      onPointerDown={p.onPointerDown}
    />
  );
}

export function ItemsSection(props: ItemsSectionProps) {
  const { library, discovered, onApply } = props;
  const [current, setCurrent] = useState(FAVORITES);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [renamingCat, setRenamingCat] = useState<{ id: string; name: string } | null>(null);
  const [renamingItem, setRenamingItem] = useState<{ id: string; name: string } | null>(null);
  const [addMenu, setAddMenu] = useState(false);
  const [siteForm, setSiteForm] = useState<{ name: string; url: string } | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  /** `null` = fechado; `"new"` = novo modo; senão, o modo sendo editado. */
  const [modeForm, setModeForm] = useState<"new" | Item | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; entry: Entry } | null>(null);
  // Arrastar interno feito com eventos de ponteiro: no Windows o HTML5 drag-and-drop
  // fica desligado enquanto a janela aceita arquivos soltos do Explorer.
  const drag = useRef<{ id: string; x: number; y: number; active: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const category = library.categories.find((c) => c.id === current);
  useEffect(() => {
    if (props.externalError) setError(props.externalError.message);
  }, [props.externalError]);
  useEffect(() => {
    if (current !== FAVORITES && current !== ALL && !category) select(FAVORITES);
  }, [current, category]);

  function select(id: string) {
    setCurrent(id);
    setShowHidden(false);
    props.onSelectCategory?.(id);
  }

  async function run(p: Promise<string | null>) {
    const err = await p;
    setError(err);
    return err;
  }

  async function createCategory(e: FormEvent) {
    e.preventDefault();
    if (creating === null) return;
    if (!(await run(onApply({ op: "createCategory", name: creating })))) setCreating(null);
  }

  async function renameCategory(e: FormEvent) {
    e.preventDefault();
    if (!renamingCat) return;
    if (!(await run(onApply({ op: "renameCategory", id: renamingCat.id, name: renamingCat.name })))) setRenamingCat(null);
  }

  async function renameItem(e: FormEvent) {
    e.preventDefault();
    if (!renamingItem) return;
    if (!(await run(onApply({ op: "renameItem", id: renamingItem.id, name: renamingItem.name })))) setRenamingItem(null);
  }

  async function addSite(e: FormEvent) {
    e.preventDefault();
    if (!siteForm) return;
    const target = current === ALL ? FAVORITES : current;
    if (!(await run(props.onAddSite(siteForm.name, siteForm.url, target)))) setSiteForm(null);
  }

  function addFiles(folders: boolean) {
    setAddMenu(false);
    void run(props.onAddFiles(current === ALL ? FAVORITES : current, folders));
  }

  function dropOnCategory(id: string, item: string) {
    const entry = findEntry(item);
    if (!entry) return;
    if (id === FAVORITES) {
      if (!library.favorites.includes(item)) void run(runMenuAction("toggleFavorite", entry, library, props, { startRename: () => {} }));
    } else {
      void run(runMenuAction({ moveTo: id }, entry, library, props, { startRename: () => {} }));
    }
  }

  function dropOnFavorite(targetId: string, item: string) {
    if (item === targetId || !library.favorites.includes(item)) return;
    void run(onApply({ op: "moveFavorite", id: item, to: library.favorites.indexOf(targetId) }));
  }

  const handlers = useRef({ dropOnCategory, dropOnFavorite });
  handlers.current = { dropOnCategory, dropOnFavorite };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (d && !d.active && Math.hypot(e.clientX - d.x, e.clientY - d.y) > DRAG_THRESHOLD) {
        d.active = true;
        setDraggingId(d.id);
      }
    };
    const up = (e: PointerEvent) => {
      const d = drag.current;
      drag.current = null;
      if (!d?.active) return;
      setDraggingId(null);
      // O clique que vem depois de soltar não deve abrir o item.
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 0);
      const target = (e.target as Element | null)?.closest?.("[data-drop]")?.getAttribute("data-drop");
      if (!target) return;
      const [kind, id] = [target.slice(0, target.indexOf(":")), target.slice(target.indexOf(":") + 1)];
      if (kind === "cat") handlers.current.dropOnCategory(id, d.id);
      if (kind === "fav") handlers.current.dropOnFavorite(id, d.id);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  function findEntry(id: string): Entry | undefined {
    const owned = library.items.find((i) => i.id === id);
    if (owned) return { item: owned, fromAll: false };
    const d = discovered.find((x) => x.id === id);
    return d ? { item: d, fromAll: true } : undefined;
  }

  async function onMenuAction(action: MenuAction) {
    if (!menu) return;
    await run(
      runMenuAction(action, menu.entry, library, props, {
        inCategory: category?.id,
        startRename: (id) => setRenamingItem({ id, name: menu.entry.item.name }),
        editMode: (id) => setModeForm(library.items.find((i) => i.id === id) ?? null),
      }),
    );
  }

  async function saveMode(name: string, members: string[]): Promise<string | null> {
    if (modeForm === null) return null;
    if (modeForm === "new") {
      const err = await onApply({ op: "createMode", name, members });
      if (!err) setModeForm(null);
      return err;
    }
    const id = modeForm.id;
    const err =
      (name.trim() !== modeForm.name ? await onApply({ op: "renameItem", id, name }) : null) ??
      (await onApply({ op: "setModeMembers", id, members }));
    if (!err) setModeForm(null);
    return err;
  }

  const tiles = (entries: Entry[], reorder = false) => (
    <div className="items-grid">
      {entries.map((entry) => (
        <Tile
          key={entry.item.id}
          entry={entry}
          dropId={reorder ? `fav:${entry.item.id}` : undefined}
          onOpen={() => {
            if (!suppressClick.current) void run(props.onLaunch(entry.item.id));
          }}
          onContext={(pos) => setMenu({ ...pos, entry })}
          onPointerDown={(e) => {
            if (e.button === 0) drag.current = { id: entry.item.id, x: e.clientX, y: e.clientY, active: false };
          }}
        />
      ))}
    </div>
  );
  const owned = (ids: string[]): Entry[] => itemsByIds(library, ids).map((item) => ({ item, fromAll: false }));
  const allApps = visibleDiscovered(library, discovered);
  const hiddenApps = discovered.filter((d) => library.hidden.includes(d.id));

  const navItem = (id: string, label: string, count: number, extra?: { onDoubleClick(): void }) =>
    renamingCat?.id === id ? (
      <form key={id} onSubmit={renameCategory} className="items-nav-form">
        <input
          aria-label="Renomear categoria"
          autoFocus
          value={renamingCat.name}
          onChange={(e) => setRenamingCat({ id, name: e.target.value })}
          onKeyDown={(e) => e.key === "Escape" && setRenamingCat(null)}
        />
      </form>
    ) : (
      <button
        key={id}
        type="button"
        className={current === id ? "items-nav is-active" : "items-nav"}
        aria-current={current === id}
        onClick={() => select(id)}
        onDoubleClick={extra?.onDoubleClick}
        data-drop={id === ALL ? undefined : `cat:${id}`}
      >
        <span>{label}</span>
        <span className="items-count">{count}</span>
      </button>
    );

  let title = "Favoritos";
  let body: ReactNode;
  if (current === FAVORITES) {
    body = library.favorites.length ? tiles(owned(library.favorites), true) : <p className="items-empty">Arraste programas, pastas e arquivos do Windows para cá.</p>;
  } else if (category) {
    title = category.name;
    body = category.items.length ? tiles(owned(category.items)) : <p className="items-empty">Arraste programas, pastas e arquivos do Windows para cá.</p>;
  } else {
    title = "Todos os programas";
    body = (
      <>
        {allApps.length ? tiles(allApps.map((item) => ({ item, fromAll: true }))) : <p className="items-empty">Procurando seus programas…</p>}
        {hiddenApps.length > 0 && (
          <div className="items-hidden">
            <button type="button" className="items-link" onClick={() => setShowHidden(!showHidden)}>
              {showHidden ? "Ocultar escondidos" : `Mostrar escondidos (${hiddenApps.length})`}
            </button>
            {showHidden &&
              hiddenApps.map((d) => (
                <div key={d.id} className="items-hidden-row">
                  <span>{d.name}</span>
                  <button type="button" aria-label={`Voltar ${d.name} para a lista`} onClick={() => void run(onApply({ op: "unhide", id: d.id }))}>
                    Voltar para a lista
                  </button>
                </div>
              ))}
          </div>
        )}
      </>
    );
  }

  return (
    <div className={draggingId ? "items is-dragging" : "items"}>
      <nav className="items-side" aria-label="Categorias">
        {navItem(FAVORITES, "Favoritos", library.favorites.length)}
        {library.categories.map((c) =>
          navItem(c.id, c.name, c.items.length, { onDoubleClick: () => setRenamingCat({ id: c.id, name: c.name }) }),
        )}
        {navItem(ALL, "Todos", allApps.length)}
        {creating === null ? (
          <button type="button" className="items-new" onClick={() => setCreating("")}>
            + Nova categoria
          </button>
        ) : (
          <form onSubmit={createCategory} className="items-nav-form">
            <input
              aria-label="Nome da categoria"
              autoFocus
              placeholder="Ex.: Jogos"
              value={creating}
              onChange={(e) => setCreating(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setCreating(null)}
              onBlur={() => creating === "" && setCreating(null)}
            />
          </form>
        )}
      </nav>

      <section className="items-main" aria-label={title}>
        <header className="items-head">
          <h2>{title}</h2>
          <div className="items-actions">
            {category && (
              <>
                <button type="button" className="items-ghost" onClick={() => setRenamingCat({ id: category.id, name: category.name })}>
                  Renomear
                </button>
                <button type="button" className="items-ghost" onClick={() => void run(onApply({ op: "deleteCategory", id: category.id }))}>
                  Excluir categoria
                </button>
              </>
            )}
            <div className="items-add">
              <button type="button" className="items-primary" aria-haspopup="menu" aria-expanded={addMenu} onClick={() => setAddMenu(!addMenu)}>
                Adicionar ▾
              </button>
              {addMenu && (
                <div role="menu" className="items-add-menu">
                  <button type="button" role="menuitem" onClick={() => addFiles(false)}>
                    Programa ou arquivo
                  </button>
                  <button type="button" role="menuitem" onClick={() => addFiles(true)}>
                    Pasta
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAddMenu(false);
                      setSiteForm({ name: "", url: "" });
                    }}
                  >
                    Site
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAddMenu(false);
                      setModeForm("new");
                    }}
                  >
                    Modo (grupo de itens)
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {error && (
          <p role="alert" className="items-alert">
            {error}
          </p>
        )}

        {siteForm && (
          <form className="items-form" onSubmit={addSite}>
            <label>
              Nome (opcional)
              <input value={siteForm.name} onChange={(e) => setSiteForm({ ...siteForm, name: e.target.value })} placeholder="Ex.: YouTube" />
            </label>
            <label>
              Endereço
              <input autoFocus value={siteForm.url} onChange={(e) => setSiteForm({ ...siteForm, url: e.target.value })} placeholder="Ex.: youtube.com" />
            </label>
            <button type="submit" className="items-primary">
              Adicionar site
            </button>
            <button type="button" className="items-ghost" onClick={() => setSiteForm(null)}>
              Cancelar
            </button>
          </form>
        )}

        {modeForm && (
          <ModeForm
            key={modeForm === "new" ? "new" : modeForm.id}
            library={library}
            initial={modeForm === "new" ? undefined : modeForm}
            onSubmit={saveMode}
            onCancel={() => setModeForm(null)}
          />
        )}

        {renamingItem && (
          <form className="items-form" onSubmit={renameItem}>
            <label>
              Novo nome
              <input autoFocus value={renamingItem.name} onChange={(e) => setRenamingItem({ ...renamingItem, name: e.target.value })} />
            </label>
            <button type="submit" className="items-primary">
              Salvar
            </button>
            <button type="button" className="items-ghost" onClick={() => setRenamingItem(null)}>
              Cancelar
            </button>
          </form>
        )}

        {body}
        <p className="items-hint">Dica: arraste itens para uma categoria na coluna da esquerda. Nos favoritos, arraste um sobre o outro para mudar a ordem.</p>
      </section>

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
