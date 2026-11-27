import { useState, type FormEvent } from "react";
import type { VaultEntry, VaultField, VaultView } from "../lib/types";
import { normalize } from "../search/normalize";
import { tileColor } from "../items/ItemTile";
import "./VaultSection.css";

export interface VaultSectionProps {
  /** `null` enquanto verifica o cofre. */
  view: VaultView | null;
  onInstall(): Promise<string | null>;
  onCreateAccount(): void;
  onLogin(email: string, password: string, code?: string): Promise<string | null>;
  onUnlock(password: string): Promise<string | null>;
  onLock(): Promise<string | null>;
  onLogout(): Promise<string | null>;
  onSync(): Promise<string | null>;
  onCopy(id: string, field: VaultField): Promise<string | null>;
  onOpenSite(id: string): Promise<string | null>;
  onOpenVault(): void;
}

const NEEDS_CODE = "Digite o código de verificação (2FA).";

const COPIED: Record<VaultField, string> = {
  username: "Usuário copiado!",
  password: "Senha copiada! Some da área de transferência em 30 s.",
  totp: "Código copiado! Some da área de transferência em 30 s.",
};

const host = (uri: string | null) => {
  if (!uri) return null;
  try {
    return new URL(uri).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

/** Aba Senhas: usa o cofre do Bitwarden, sem nunca ver as senhas (quem copia é o Rust). */
export function VaultSection(p: VaultSectionProps) {
  const [email, setEmail] = useState("");
  // A senha mestra só fica no estado enquanto é digitada; é apagada a cada envio.
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [askCode, setAskCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  async function run(task: () => Promise<string | null>) {
    setBusy(true);
    setNotice(null);
    const err = await task();
    setBusy(false);
    setError(err);
    return err;
  }

  async function login(e: FormEvent) {
    e.preventDefault();
    const pw = password;
    setPassword("");
    const err = await run(() => p.onLogin(email, pw, askCode && code ? code : undefined));
    if (err === NEEDS_CODE) setAskCode(true);
    if (!err) {
      setCode("");
      setAskCode(false);
    }
  }

  async function unlock(e: FormEvent) {
    e.preventDefault();
    const pw = password;
    setPassword("");
    await run(() => p.onUnlock(pw));
  }

  async function copy(entry: VaultEntry, field: VaultField) {
    const err = await run(() => p.onCopy(entry.id, field));
    if (!err) setNotice(COPIED[field]);
  }

  const alert = error && (
    <p role="alert" className="vault-alert">
      {error}
    </p>
  );

  if (!p.view) return <p className="vault-muted">Verificando o cofre…</p>;

  if (p.view.status === "missing") {
    return (
      <div className="vault-card">
        <h2>Senhas com o Bitwarden</h2>
        <p>O Vitra precisa da ferramenta do Bitwarden para abrir o seu cofre de senhas. A instalação é gratuita e rápida.</p>
        {alert}
        <button type="button" className="vault-primary" disabled={busy} onClick={() => void run(p.onInstall)}>
          {busy ? "Instalando…" : "Instalar ferramenta do Bitwarden"}
        </button>
      </div>
    );
  }

  if (p.view.status === "unauthenticated") {
    return (
      <div className="vault-card">
        <h2>Senhas com o Bitwarden</h2>
        <p>Suas senhas ficam guardadas e criptografadas no Bitwarden, e você usa elas por aqui.</p>
        <div className="vault-create">
          <span>Ainda não tem conta?</span>
          <button type="button" className="vault-ghost" onClick={p.onCreateAccount}>
            Criar conta grátis
          </button>
        </div>
        <form className="vault-form" onSubmit={login}>
          <label>
            E-mail
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Senha mestra
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {askCode && (
            <label>
              Código de verificação
              <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
            </label>
          )}
          {alert}
          <button type="submit" className="vault-primary" disabled={busy}>
            {busy ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    );
  }

  if (p.view.status === "locked") {
    return (
      <div className="vault-card">
        <h2>Cofre travado</h2>
        <p className="vault-muted">Conta: {p.view.email ?? "—"}</p>
        <form className="vault-form" onSubmit={unlock}>
          <label>
            Senha mestra
            <input type="password" autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {alert}
          <button type="submit" className="vault-primary" disabled={busy}>
            {busy ? "Desbloqueando…" : "Desbloquear"}
          </button>
        </form>
        <button type="button" className="vault-link" onClick={() => void run(p.onLogout)}>
          Sair da conta
        </button>
      </div>
    );
  }

  const q = normalize(query);
  const entries = p.view.entries.filter(
    (e) => !q || normalize(e.name).includes(q) || normalize(e.username ?? "").includes(q) || normalize(e.uri ?? "").includes(q),
  );

  return (
    <div className="vault">
      <header className="vault-head">
        <input className="vault-search" aria-label="Buscar no cofre" placeholder="Buscar conta…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="button" className="vault-ghost" onClick={() => void run(p.onSync)} disabled={busy}>
          Sincronizar
        </button>
        <button type="button" className="vault-ghost" onClick={p.onOpenVault}>
          Abrir no Bitwarden
        </button>
        <button type="button" className="vault-primary" onClick={() => void run(p.onLock)}>
          Bloquear agora
        </button>
      </header>
      {alert}
      {notice && (
        <p role="status" className="vault-ok">
          {notice}
        </p>
      )}
      {entries.length === 0 ? (
        <p className="vault-muted">{p.view.entries.length ? "Nenhuma conta encontrada." : "Seu cofre está vazio. Use “Abrir no Bitwarden” para criar contas."}</p>
      ) : (
        <ul className="vault-list">
          {entries.map((e) => (
            <li key={e.id} className="vault-row">
              <span className="vault-avatar" style={{ background: tileColor(e.id) }} aria-hidden="true">
                {e.name.charAt(0).toUpperCase()}
              </span>
              <span className="vault-info">
                <span className="vault-name">{e.name}</span>
                <span className="vault-sub">{[e.username, host(e.uri)].filter(Boolean).join(" · ") || "—"}</span>
              </span>
              <span className="vault-actions">
                {e.username && (
                  <button type="button" aria-label={`Copiar usuário de ${e.name}`} onClick={() => void copy(e, "username")}>
                    Usuário
                  </button>
                )}
                {e.hasPassword && (
                  <button type="button" aria-label={`Copiar senha de ${e.name}`} onClick={() => void copy(e, "password")}>
                    Senha
                  </button>
                )}
                {e.hasTotp && (
                  <button type="button" aria-label={`Copiar código 2FA de ${e.name}`} onClick={() => void copy(e, "totp")}>
                    2FA
                  </button>
                )}
                {e.uri && (
                  <button type="button" aria-label={`Abrir site de ${e.name}`} onClick={() => void run(() => p.onOpenSite(e.id))}>
                    Site
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="vault-muted vault-foot">
        Conta: {p.view.email} · O cofre trava sozinho depois de um tempo sem uso (ajuste em Configurações).
      </p>
    </div>
  );
}
