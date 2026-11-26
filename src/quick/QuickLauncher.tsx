import { useEffect, useRef, useState, type CSSProperties } from "react";
import "./QuickLauncher.css";

export interface QuickLauncherProps {
  accent: string;
  hotkeyLabel: string;
  /** Muda a cada vez que o pop-up é mostrado: limpa e foca a busca. */
  showNonce: number;
  onHide(): void;
  onOpenPanel(): void;
}

const KEY_NAMES: Record<string, string> = { Space: "Espaço", Super: "Win", Esc: "Esc" };

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

export function QuickLauncher({ accent, hotkeyLabel, showNonce, onHide, onOpenPanel }: QuickLauncherProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQuery("");
    inputRef.current?.focus();
  }, [showNonce]);

  useEffect(() => {
    // Limpa ao esconder (e não só ao mostrar), para o texto antigo nunca piscar na reabertura.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setQuery("");
        onHide();
      }
    };
    const onBlur = () => setQuery("");
    document.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, [onHide]);

  return (
    <div className="quick" style={{ "--accent": accent } as CSSProperties}>
      <nav className="quick-side" aria-label="Categorias">
        <div className="quick-brand">
          <span className="quick-brand-dot" aria-hidden="true" />
          <span>Vitra</span>
        </div>
        <button type="button" className="quick-cat is-active" aria-current="true">
          Favoritos
          <span className="quick-cat-dot" aria-hidden="true" />
        </button>
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

        <section className="quick-section" aria-label="Favoritos">
          <h2 className="quick-label">Favoritos</h2>
          <p className="quick-empty">Seus favoritos aparecem aqui. Abra o painel para adicionar.</p>
        </section>

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
          <span>↵ abrir · Esc fechar</span>
          <button type="button" className="quick-link" onClick={onOpenPanel}>
            Abrir painel ›
          </button>
        </footer>
      </main>
    </div>
  );
}
