import type { KeyboardEvent, MouseEvent } from "react";
import type { ItemKind } from "../lib/types";
import "./ItemTile.css";

export interface ItemTileProps {
  item: { id: string; name: string; kind?: ItemKind };
  /** Data URL do ícone; `null`/ausente mostra a inicial. */
  iconSrc?: string | null;
  /** Ex.: "1" para Alt+1. */
  badge?: string;
  size?: "big" | "row";
  /** Texto à direita no modo "row" (ex.: "Pasta"). */
  detail?: string;
  /** Alvo para o arrastar interno (atributo `data-drop`). */
  dropId?: string;
  onOpen(): void;
  onContext(pos: { x: number; y: number }): void;
  onPointerDown?(e: React.PointerEvent): void;
}

const PALETTE = ["#3b7ddd", "#5865c9", "#1e9e55", "#c9414b", "#b8862a", "#1f6fb5", "#8c4fc9", "#d0513a"];

export function tileColor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

export function ItemTile({ item, iconSrc, badge, size = "big", detail, dropId, onOpen, onContext, onPointerDown }: ItemTileProps) {
  function context(e: MouseEvent) {
    e.preventDefault();
    onContext({ x: e.clientX, y: e.clientY });
  }
  function keyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if ((e.key === "F10" && e.shiftKey) || e.key === "ContextMenu") {
      e.preventDefault();
      const r = e.currentTarget.getBoundingClientRect();
      onContext({ x: r.left + 12, y: r.bottom });
    }
  }
  return (
    <button
      type="button"
      className={`tile tile-${size}`}
      onClick={onOpen}
      onContextMenu={context}
      onKeyDown={keyDown}
      data-drop={dropId}
      onPointerDown={onPointerDown}
      title={item.name}
    >
      {iconSrc ? (
        <img className="tile-icon" src={iconSrc} alt="" draggable={false} />
      ) : (
        <span className="tile-icon tile-letter" style={{ background: tileColor(item.id) }} aria-hidden="true">
          {item.name.trim().charAt(0).toUpperCase() || "?"}
        </span>
      )}
      <span className="tile-name">{item.name}</span>
      {detail && <span className="tile-detail">{detail}</span>}
      {badge && (
        <span className="tile-badge" aria-label={`Alt+${badge}`}>
          {badge}
        </span>
      )}
    </button>
  );
}
