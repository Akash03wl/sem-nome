import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./theme/tokens.css";
import * as api from "./lib/api";
import { EMPTY_LIBRARY, type Discovered, type Library, type Settings } from "./lib/types";
import { setIconLoader } from "./lib/useIcon";
import { QuickLauncher } from "./quick/QuickLauncher";
import { Panel } from "./panel/Panel";

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
    />
  );
}

const label = api.currentWindowLabel();
document.body.classList.add(`window-${label}`);

createRoot(document.getElementById("root")!).render(
  <StrictMode>{label === "quick" ? <QuickApp /> : <PanelApp />}</StrictMode>,
);
