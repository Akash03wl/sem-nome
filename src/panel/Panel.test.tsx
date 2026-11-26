import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Panel } from "./Panel";
import type { Settings } from "../lib/types";

const base: Settings = { version: 1, hotkey: "Alt+Space", accent: "#9b82ff", autostart: true, webShortcuts: [{ keyword: "yt", name: "YouTube", url: "https://www.youtube.com/results?search_query={q}" }] };

function setup(over: Partial<Parameters<typeof Panel>[0]> = {}) {
  const props = {
    settings: base,
    hotkeyError: null as string | null,
    onSave: vi.fn(async (_s: Settings) => null as string | null),
    ...over,
  };
  render(<Panel {...props} />);
  return props;
}

describe("Panel", () => {
  it("abre em Configurações quando há erro de atalho", () => {
    setup({ hotkeyError: "Não consegui usar o atalho Alt+Space. Escolha outro." });
    expect(screen.getByLabelText("Atalho para abrir o Vitra")).toBeInTheDocument();
  });

  it("mostra aviso de atalho indisponível", () => {
    setup({ hotkeyError: "Não consegui usar o atalho Alt+Space. Escolha outro." });
    expect(screen.getByRole("alert")).toHaveTextContent("Não consegui usar o atalho Alt+Space. Escolha outro.");
  });

  it("salva novo atalho", async () => {
    const props = setup({ initialSection: "config" });
    const field = screen.getByLabelText("Atalho para abrir o Vitra");
    await userEvent.clear(field);
    await userEvent.type(field, "Ctrl+Shift+K");
    await userEvent.click(screen.getByRole("button", { name: "Salvar atalho" }));
    expect(props.onSave).toHaveBeenCalledWith({ ...base, hotkey: "Ctrl+Shift+K" });
  });

  it("mostra erro de atalho inválido", async () => {
    const props = setup({
      initialSection: "config",
      onSave: vi.fn(async () => "Use pelo menos Ctrl, Alt, Shift ou Win."),
    });
    const field = screen.getByLabelText("Atalho para abrir o Vitra") as HTMLInputElement;
    await userEvent.clear(field);
    await userEvent.type(field, "a");
    await userEvent.click(screen.getByRole("button", { name: "Salvar atalho" }));
    expect(props.onSave).toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent("Use pelo menos Ctrl, Alt, Shift ou Win.");
    expect(field.value).toBe("a");
  });

  it("alternar abrir com Windows salva na hora", async () => {
    const props = setup({ initialSection: "config" });
    await userEvent.click(screen.getByRole("switch", { name: "Abrir o Vitra quando o Windows iniciar" }));
    expect(props.onSave).toHaveBeenCalledWith({ ...base, autostart: false });
  });

  it("escolher cor salva na hora", async () => {
    const props = setup({ initialSection: "config" });
    const orange = screen.getByRole("button", { name: "Laranja" });
    await userEvent.click(orange);
    expect(props.onSave).toHaveBeenCalledWith({ ...base, accent: "#ff8a4c" });
    expect(orange).toHaveAttribute("aria-pressed", "true");
  });

  it("adiciona palavra-chave", async () => {
    const props = setup({ initialSection: "config" });
    await userEvent.type(screen.getByLabelText("Palavra-chave"), "gh");
    await userEvent.type(screen.getByLabelText("Nome do site"), "GitHub");
    await userEvent.type(screen.getByLabelText("Endereço de pesquisa"), "github.com/search?q={{q}");
    await userEvent.click(screen.getByRole("button", { name: "Adicionar palavra-chave" }));
    expect(props.onSave).toHaveBeenCalledWith({
      ...base,
      webShortcuts: [...base.webShortcuts, { keyword: "gh", name: "GitHub", url: "github.com/search?q={q}" }],
    });
  });

  it("remove palavra-chave", async () => {
    const props = setup({ initialSection: "config" });
    await userEvent.click(screen.getByRole("button", { name: "Remover yt" }));
    expect(props.onSave).toHaveBeenCalledWith({ ...base, webShortcuts: [] });
  });

  it("mostra erro de palavra-chave", async () => {
    setup({ initialSection: "config", onSave: vi.fn(async () => "Essa palavra-chave já existe.") });
    await userEvent.type(screen.getByLabelText("Palavra-chave"), "yt");
    await userEvent.type(screen.getByLabelText("Nome do site"), "X");
    await userEvent.type(screen.getByLabelText("Endereço de pesquisa"), "x.com?q={{q}");
    await userEvent.click(screen.getByRole("button", { name: "Adicionar palavra-chave" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Essa palavra-chave já existe.");
  });

  it("mostra Everything funcionando", () => {
    setup({ initialSection: "config", everythingStatus: "ready", onEverythingFix: vi.fn(async () => null) });
    expect(screen.getByText("Busca de arquivos (Everything)")).toBeInTheDocument();
    expect(screen.getByText("Funcionando")).toBeInTheDocument();
  });

  it("oferece instalar quando falta", async () => {
    const fix = vi.fn(async () => null);
    setup({ initialSection: "config", everythingStatus: "notInstalled", onEverythingFix: fix });
    await userEvent.click(screen.getByRole("button", { name: "Instalar Everything" }));
    expect(fix).toHaveBeenCalledWith("notInstalled");
  });

  it("oferece abrir quando está fechado", async () => {
    const fix = vi.fn(async () => null);
    setup({ initialSection: "config", everythingStatus: "notRunning", onEverythingFix: fix });
    await userEvent.click(screen.getByRole("button", { name: "Abrir Everything" }));
    expect(fix).toHaveBeenCalledWith("notRunning");
  });
});
