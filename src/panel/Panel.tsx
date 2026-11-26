import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { ACCENTS, ACCENT_NAMES, type Settings } from "../lib/types";
import { formatHotkey } from "../quick/QuickLauncher";
import "./Panel.css";

type Section = "itens" | "config";

export interface PanelProps {
  settings: Settings;
  /** Erro do registro do atalho na inicialização, se houve. */
  hotkeyError: string | null;
  initialSection?: Section;
  /** Devolve `null` se salvou, ou a mensagem de erro do backend. */
  onSave(next: Settings): Promise<string | null>;
  /** Conteúdo da seção "Itens" (a `ItemsSection`, montada pelo app). */
  itemsSection?: ReactNode;
}

export function Panel({ settings, hotkeyError, initialSection, onSave, itemsSection }: PanelProps) {
  const [section, setSection] = useState<Section>(initialSection ?? (hotkeyError ? "config" : "itens"));
  const [current, setCurrent] = useState(settings);
  const [draft, setDraft] = useState(settings.hotkey);
  const [error, setError] = useState<string | null>(hotkeyError);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    setCurrent(settings);
    setDraft(settings.hotkey);
  }, [settings]);

  useEffect(() => {
    if (hotkeyError) {
      setError(hotkeyError);
      setSection("config");
    }
  }, [hotkeyError]);

  async function apply(next: Settings, okMessage: string) {
    const previous = current;
    setCurrent(next);
    setSaved(null);
    const err = await onSave(next);
    if (err) {
      setCurrent(previous);
      setError(err);
    } else {
      setError(null);
      setSaved(okMessage);
    }
  }

  async function saveHotkey(e: FormEvent) {
    e.preventDefault();
    await apply({ ...current, hotkey: draft }, "Atalho salvo.");
  }

  return (
    <div className="panel" style={{ "--accent": current.accent } as CSSProperties}>
      <nav className="panel-side" aria-label="Seções">
        <div className="panel-brand">
          <span className="panel-brand-dot" aria-hidden="true" />
          Vitra
        </div>
        <button type="button" className={section === "itens" ? "panel-nav is-active" : "panel-nav"} aria-current={section === "itens"} onClick={() => setSection("itens")}>
          Itens
        </button>
        <button type="button" className={section === "config" ? "panel-nav is-active" : "panel-nav"} aria-current={section === "config"} onClick={() => setSection("config")}>
          Configurações
        </button>
      </nav>

      <main className="panel-main">
        {section === "itens" && (
          <section className="panel-items">
            <h1>Itens</h1>
            {itemsSection ?? <p className="panel-empty">Em breve: seus programas e categorias aparecem aqui.</p>}
          </section>
        )}

        {section === "config" && (
          <section className="panel-config">
            <h1>Configurações</h1>

            {error && (
              <p role="alert" className="panel-alert">
                {error}
              </p>
            )}
            {saved && !error && (
              <p role="status" className="panel-ok">
                {saved}
              </p>
            )}

            <form className="panel-row" onSubmit={saveHotkey}>
              <div className="panel-row-text">
                <label htmlFor="hotkey">Atalho para abrir o Vitra</label>
                <span className="panel-hint">Atual: {formatHotkey(current.hotkey)}. Ex.: Alt+Space, Ctrl+Shift+K, Win+J</span>
              </div>
              <div className="panel-row-control">
                <input id="hotkey" type="text" value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} autoComplete="off" />
                <button type="submit" className="panel-btn">
                  Salvar atalho
                </button>
              </div>
            </form>

            <div className="panel-row">
              <div className="panel-row-text">
                <span id="autostart-label">Abrir o Vitra quando o Windows iniciar</span>
                <span className="panel-hint">Ele abre escondido, perto do relógio.</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={current.autostart}
                aria-labelledby="autostart-label"
                className="panel-switch"
                onClick={() => apply({ ...current, autostart: !current.autostart }, "Preferência salva.")}
              >
                <span className="panel-switch-knob" aria-hidden="true" />
              </button>
            </div>

            <div className="panel-row">
              <div className="panel-row-text">
                <span>Cor de destaque</span>
              </div>
              <div className="panel-swatches">
                {ACCENTS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="panel-swatch"
                    style={{ background: c }}
                    aria-label={ACCENT_NAMES[c]}
                    aria-pressed={current.accent === c}
                    onClick={() => apply({ ...current, accent: c }, "Cor salva.")}
                  />
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
