import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { VaultSection } from "./VaultSection";
import type { VaultView } from "../lib/types";

const unlocked: VaultView = {
  status: "unlocked",
  email: "ana@x.com",
  entries: [
    { id: "1", name: "Banco", username: "ana", hasPassword: true, hasTotp: true, uri: "https://banco.com" },
    { id: "2", name: "Wi-Fi", username: null, hasPassword: true, hasTotp: false, uri: null },
    { id: "3", name: "YouTube", username: "ana@x.com", hasPassword: true, hasTotp: false, uri: "https://youtube.com" },
  ],
};

function setup(view: VaultView | null, over: Partial<Parameters<typeof VaultSection>[0]> = {}) {
  const ok = async () => null as string | null;
  const props = {
    view,
    onInstall: vi.fn(ok),
    onCreateAccount: vi.fn(),
    onLogin: vi.fn(ok),
    onLoginApiKey: vi.fn(ok),
    onUnlock: vi.fn(ok),
    onLock: vi.fn(ok),
    onLogout: vi.fn(ok),
    onSync: vi.fn(ok),
    onCopy: vi.fn(ok),
    onOpenSite: vi.fn(ok),
    onOpenVault: vi.fn(),
    ...over,
  };
  const utils = render(<VaultSection {...props} />);
  return { props, ...utils };
}

describe("VaultSection", () => {
  it("oferece instalar a ferramenta", async () => {
    const { props } = setup({ status: "missing", email: null, entries: [] });
    expect(screen.getByText(/precisa da ferramenta do Bitwarden/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Instalar ferramenta do Bitwarden" }));
    expect(props.onInstall).toHaveBeenCalled();
  });

  it("sem login mostra criar conta e login", async () => {
    const { props } = setup({ status: "unauthenticated", email: null, entries: [] });
    await userEvent.click(screen.getByRole("button", { name: "Criar conta grátis" }));
    expect(props.onCreateAccount).toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText("E-mail"), "ana@x.com");
    await userEvent.type(screen.getByLabelText("Senha mestra"), "segredo");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(props.onLogin).toHaveBeenCalledWith("ana@x.com", "segredo", undefined, undefined);
    expect(screen.getByLabelText("Senha mestra")).toHaveValue("");
  });

  it("pede código 2FA e de onde ele vem (uma tentativa só)", async () => {
    const onLogin = vi.fn(async (_e: string, _p: string, code?: string) => (code ? null : "Digite o código de verificação (2FA)."));
    setup({ status: "unauthenticated", email: null, entries: [] }, { onLogin });
    await userEvent.type(screen.getByLabelText("E-mail"), "ana@x.com");
    await userEvent.type(screen.getByLabelText("Senha mestra"), "segredo");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Digite o código de verificação (2FA).");
    await userEvent.selectOptions(screen.getByLabelText("De onde vem o código?"), "1");
    await userEvent.type(screen.getByLabelText("Senha mestra"), "segredo");
    await userEvent.type(screen.getByLabelText("Código de verificação"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(onLogin).toHaveBeenLastCalledWith("ana@x.com", "segredo", "123456", 1);
    expect(onLogin).toHaveBeenCalledTimes(2);
  });

  it("entra com chave de API", async () => {
    const { props } = setup({ status: "unauthenticated", email: null, entries: [] });
    await userEvent.click(screen.getByRole("button", { name: "Entrar com chave de API" }));
    await userEvent.type(screen.getByLabelText("client_id"), "user.abc");
    await userEvent.type(screen.getByLabelText("client_secret"), "xyz");
    await userEvent.click(screen.getByRole("button", { name: "Entrar com a chave" }));
    expect(props.onLoginApiKey).toHaveBeenCalledWith("user.abc", "xyz");
    expect(screen.queryByLabelText("client_secret")).not.toBeInTheDocument();
  });

  it("confirmação de novo dispositivo abre a chave de API", async () => {
    const msg = "O Bitwarden pediu para confirmar este computador. Entre com a chave de API (abaixo) — é o jeito oficial para isso.";
    setup({ status: "unauthenticated", email: null, entries: [] }, { onLogin: vi.fn(async () => msg) });
    await userEvent.type(screen.getByLabelText("E-mail"), "ana@x.com");
    await userEvent.type(screen.getByLabelText("Senha mestra"), "segredo");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByLabelText("client_id")).toBeInTheDocument();
  });

  it("desbloqueia", async () => {
    const { props } = setup({ status: "locked", email: "ana@x.com", entries: [] });
    expect(screen.getByText(/ana@x.com/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Senha mestra"), "segredo{Enter}");
    expect(props.onUnlock).toHaveBeenCalledWith("segredo");
  });

  it("lista contas e copia senha", async () => {
    const { props } = setup(unlocked);
    expect(screen.getByText("Banco")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Copiar senha de Banco" }));
    expect(props.onCopy).toHaveBeenCalledWith("1", "password");
    expect(await screen.findByRole("status")).toHaveTextContent("Senha copiada! Some da área de transferência em 30 s.");
    await userEvent.click(screen.getByRole("button", { name: "Copiar código 2FA de Banco" }));
    expect(props.onCopy).toHaveBeenCalledWith("1", "totp");
  });

  it("esconde botões que não se aplicam", () => {
    setup(unlocked);
    expect(screen.queryByRole("button", { name: "Copiar usuário de Wi-Fi" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abrir site de Wi-Fi" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copiar código 2FA de YouTube" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir site de YouTube" })).toBeInTheDocument();
  });

  it("busca filtra por nome e usuário", async () => {
    setup(unlocked);
    await userEvent.type(screen.getByLabelText("Buscar no cofre"), "youtu");
    expect(screen.queryByText("Banco")).not.toBeInTheDocument();
    expect(screen.getByText("YouTube")).toBeInTheDocument();
  });

  it("volta a pedir senha quando trava", () => {
    const { rerender, props } = setup(unlocked);
    rerender(<VaultSection {...props} view={{ status: "locked", email: "ana@x.com", entries: [] }} />);
    expect(screen.queryByText("Banco")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Senha mestra")).toBeInTheDocument();
  });

  it("bloquear agora", async () => {
    const { props } = setup(unlocked);
    await userEvent.click(screen.getByRole("button", { name: "Bloquear agora" }));
    expect(props.onLock).toHaveBeenCalled();
  });
});
