import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { ACCENTS, ACCENT_NAMES, EVERYTHING_MESSAGE, type EverythingStatus, type Settings } from "../lib/types";
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
  /** Status do Everything (busca de arquivos); `null` enquanto verifica. */
  everythingStatus?: EverythingStatus | null;
  onEverythingFix?(status: EverythingStatus): Promise<string | null>;
}

export function Panel({ settings, hotkeyError, initialSection, onSave, itemsSection, everythingStatus, onEverythingFix }: PanelProps) {
  const [section, setSection] = useState<Section>(initialSection ?? (hotkeyError ? "config" : "itens"));
  const [current, setCurrent] = useState(settings);
  const [draft, setDraft] = useState(settings.hotkey);
  const [error, setError] = useState<string | null>(hotkeyError);
  const [saved, setSaved] = useState<string | null>(null);
  const [newShortcut, setNewShortcut] = useState({ keyword: "", name: "", url: "" });
  const [fixing, setFixing] = useState(false);

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
    return err;
  }

  async function addShortcut(e: FormEvent) {
    e.preventDefault();
    const list = [...(current.webShortcuts ?? []), newShortcut];
    const err = await apply({ ...current, webShortcuts: list }, "Palavra-chave salva.");
    if (!err) setNewShortcut({ keyword: "", name: "", url: "" });
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

            {everythingStatus !== undefined && (
              <div className="panel-row">
                <div className="panel-row-text">
                  <span>Busca de arquivos (Everything)</span>
                  <span className="panel-hint">
                    {everythingStatus === null
                      ? "Verificando…"
                      : everythingStatus === "ready"
                        ? "Funcionando"
                        : EVERYTHING_MESSAGE[everythingStatus].text}
                  </span>
                </div>
                {everythingStatus && everythingStatus !== "ready" && EVERYTHING_MESSAGE[everythingStatus].action && onEverythingFix && (
                  <button
                    type="button"
                    className="panel-btn"
                    disabled={fixing}
                    onClick={async () => {
                      setFixing(true);
                      setSaved(null);
                      const err = await onEverythingFix(everythingStatus);
                      setFixing(false);
                      setError(err);
                      if (!err) setSaved("Pronto! Pode levar alguns segundos para o Everything terminar de abrir.");
                    }}
                  >
                    {fixing ? (everythingStatus === "notInstalled" ? "Instalando…" : "Abrindo…") : EVERYTHING_MESSAGE[everythingStatus].action}
                  </button>
                )}
              </div>
            )}

            <div className="panel-row panel-shortcuts">
              <div className="panel-row-text">
                <span>Palavras-chave de pesquisa</span>
                <span className="panel-hint">Na busca, digite a palavra-chave, espaço e o que quer pesquisar. Ex.: yt lofi</span>
              </div>
              <ul className="panel-shortcut-list">
                {(current.webShortcuts ?? []).map((s) => (
                  <li key={s.keyword}>
                    <kbd>{s.keyword}</kbd>
                    <span className="panel-shortcut-name">{s.name}</span>
                    <span className="panel-shortcut-url">{s.url}</span>
                    <button
                      type="button"
                      className="panel-link"
                      aria-label={`Remover ${s.keyword}`}
                      onClick={() =>
                        apply({ ...current, webShortcuts: current.webShortcuts.filter((x) => x.keyword !== s.keyword) }, "Palavra-chave removida.")
                      }
                    >
                      Remover
                    </button>
                  </li>
                ))}
              </ul>
              <form className="panel-shortcut-form" onSubmit={addShortcut}>
                <input aria-label="Palavra-chave" placeholder="gh" value={newShortcut.keyword} onChange={(e) => setNewShortcut({ ...newShortcut, keyword: e.target.value })} />
                <input aria-label="Nome do site" placeholder="GitHub" value={newShortcut.name} onChange={(e) => setNewShortcut({ ...newShortcut, name: e.target.value })} />
                <input
                  aria-label="Endereço de pesquisa"
                  placeholder="github.com/search?q={q}"
                  value={newShortcut.url}
                  onChange={(e) => setNewShortcut({ ...newShortcut, url: e.target.value })}
                />
                <button type="submit" className="panel-btn">
                  Adicionar palavra-chave
                </button>
              </form>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
