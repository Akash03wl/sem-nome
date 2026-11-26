import { StrictMode, useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { createRoot } from "react-dom/client";
import "./theme/tokens.css";
import * as api from "./lib/api";
import { EMPTY_LIBRARY, type Discovered, type Library, type Settings } from "./lib/types";
import { setIconLoader } from "./lib/useIcon";
import { QuickLauncher } from "./quick/QuickLauncher";
import { Panel } from "./panel/Panel";
import { ALL, FAVORITES, ItemsSection } from "./panel/ItemsSection";

function useSettings(): Settings | null {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    api.getSettings().then(setSettings);
    const off = api.onSettingsChanged(setSettings);
    return () => {
      off.then((f) => f());
    };
  }, []);
  return settings;
}

setIconLoader(api.getIcon);

function useLibrary(): { library: Library; discovered: Discovered[] } {
  const [library, setLibrary] = useState<Library>(EMPTY_LIBRARY);
  const [discovered, setDiscovered] = useState<Discovered[]>([]);
  useEffect(() => {
    api.getLibrary().then(setLibrary);
    api.getDiscovered().then(setDiscovered);
    const offs = [api.onLibraryChanged(setLibrary), api.onAppsDiscovered(setDiscovered)];
    return () => {
      offs.forEach((off) => off.then((f) => f()));
    };
  }, []);
  return { library, discovered };
}

function QuickApp() {
  const settings = useSettings();
  const { library, discovered } = useLibrary();
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    const off = api.onQuickShown(() => setNonce((n) => n + 1));
    return () => {
      off.then((f) => f());
    };
  }, []);
  if (!settings) return null;
  return (
    <QuickLauncher
      accent={settings.accent}
      hotkeyLabel={settings.hotkey}
      showNonce={nonce}
      library={library}
      discovered={discovered}
      onHide={() => void api.hideQuick()}
      onOpenPanel={() => void api.openPanel()}
      onLaunch={api.launchItem}
      onApply={api.applyOp}
      onReveal={api.revealItem}
      shortcuts={settings.webShortcuts ?? []}
      onSystem={api.runSystemCommand}
      onOpenUrl={api.openUrl}
      onCopy={api.copyText}
    />
  );
}

function PanelItems() {
  const { library, discovered } = useLibrary();
  const current = useRef(FAVORITES);
  const [dropError, setDropError] = useState<{ message: string | null } | null>(null);

  // Arquivos e pastas soltos do Windows entram na categoria aberta.
  useEffect(() => {
    const off = getCurrentWebview().onDragDropEvent(async (e) => {
      if (e.payload.type !== "drop" || e.payload.paths.length === 0) return;
      const target = current.current === ALL ? FAVORITES : current.current;
      setDropError({ message: await api.addPaths(e.payload.paths, target) });
    });
    return () => {
      off.then((f) => f());
    };
  }, []);

  return (
    <ItemsSection
      library={library}
      discovered={discovered}
      onApply={api.applyOp}
      onLaunch={api.launchItem}
      onReveal={api.revealItem}
      onAddFiles={api.pickAndAdd}
      onAddSite={api.addSite}
      onSelectCategory={(id) => (current.current = id)}
      externalError={dropError}
    />
  );
}

function PanelApp() {
  const settings = useSettings();
  const [hotkeyError, setHotkeyError] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    api.getHotkeyError().then(setHotkeyError);
  }, []);
  if (!settings || hotkeyError === undefined) return null;
  return (
    <Panel
      settings={settings}
      hotkeyError={hotkeyError}
      initialSection={hotkeyError ? "config" : "itens"}
      onSave={api.saveSettings}
      itemsSection={<PanelItems />}
    />
  );
}

const label = api.currentWindowLabel();
document.body.classList.add(`window-${label}`);

createRoot(document.getElementById("root")!).render(
  <StrictMode>{label === "quick" ? <QuickApp /> : <PanelApp />}</StrictMode>,
);
