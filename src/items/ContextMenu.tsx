import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Category, ItemKind } from "../lib/types";
import "./ContextMenu.css";

export type MenuAction =
  | "open"
  | "openAdmin"
  | "reveal"
  | "toggleFavorite"
  | { moveTo: string }
  | "removeFromCategory"
  | "rename"
  | "editMode"
  | "remove"
  | "hide";

export interface ContextMenuProps {
  x: number;
  y: number;
  kind: ItemKind;
  canReveal: boolean;
  isFavorite: boolean;
  categories: Category[];
  /** Categoria aberta agora (oferece "Tirar desta categoria"). */
  inCategory?: string;
  /** Item da lista "Todos" (ainda não é do dono). */
  fromAll?: boolean;
  onAction(action: MenuAction): void;
  onClose(): void;
}

export function ContextMenu(p: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: p.x, top: p.y });

  // Mantém o menu dentro da janela.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      left: Math.max(4, Math.min(p.x, window.innerWidth - width - 4)),
      top: Math.max(4, Math.min(p.y, window.innerHeight - height - 4)),
    });
    el.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  }, [p.x, p.y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Captura antes do pop-up: Esc fecha só o menu.
        e.stopPropagation();
        e.preventDefault();
        p.onClose();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) p.onClose();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("blur", p.onClose);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("blur", p.onClose);
    };
  }, [p.onClose]);

  const act = (a: MenuAction) => () => {
    p.onAction(a);
    p.onClose();
  };
  const moveTargets = p.categories.filter((c) => c.id !== p.inCategory);

  const entry = (label: string, a: MenuAction, danger = false) => (
    <button type="button" role="menuitem" className={danger ? "menu-item is-danger" : "menu-item"} onClick={act(a)}>
      {label}
    </button>
  );

  return (
    <div ref={ref} className="menu" role="menu" style={{ left: pos.left, top: pos.top }}>
      {entry("Abrir", "open")}
      {p.kind === "app" && entry("Abrir como administrador", "openAdmin")}
      {p.canReveal && entry("Abrir local do arquivo", "reveal")}
      <hr className="menu-sep" />
      {entry(p.isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos", "toggleFavorite")}
      {moveTargets.length > 0 && (
        <div role="group" aria-label="Mover para" className="menu-group">
          <span className="menu-label">Mover para</span>
          {moveTargets.map((c) => (
            <button key={c.id} type="button" role="menuitem" className="menu-item menu-sub" onClick={act({ moveTo: c.id })}>
              {c.name}
            </button>
          ))}
        </div>
      )}
      {p.inCategory && entry("Tirar desta categoria", "removeFromCategory")}
      <hr className="menu-sep" />
      {p.kind === "mode" && entry("Editar modo", "editMode")}
      {!p.fromAll && entry("Renomear", "rename")}
      {p.fromAll ? entry("Esconder da lista", "hide") : entry("Remover do Vitra", "remove", true)}
    </div>
  );
}
