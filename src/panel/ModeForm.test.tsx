import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ModeForm } from "./ModeForm";
import type { Library } from "../lib/types";

const item = (id: string, name: string, kind: "app" | "folder" | "mode" = "app") => ({
  id, name, kind, target: "", args: "", admin: false, members: [] as string[],
});

const library: Library = {
  version: 1,
  items: [item("a", "Chrome"), item("b", "Faculdade", "folder"), item("c", "Spotify"), item("mode-1", "Jogo", "mode")],
  favorites: [], categories: [], recents: [], hidden: [],
};

describe("ModeForm", () => {
  it("cria modo com itens marcados, na ordem marcada", async () => {
    const onSubmit = vi.fn(async () => null as string | null);
    render(<ModeForm library={library} onSubmit={onSubmit} onCancel={vi.fn()} />);
    expect(screen.queryByRole("checkbox", { name: "Jogo" })).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Nome do modo"), "Estudo");
    await userEvent.click(screen.getByRole("checkbox", { name: "Spotify" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Chrome" }));
    await userEvent.click(screen.getByRole("button", { name: "Salvar modo" }));
    expect(onSubmit).toHaveBeenCalledWith("Estudo", ["c", "a"]);
  });

  it("edita modo existente", async () => {
    const onSubmit = vi.fn(async () => null as string | null);
    const initial = { ...item("mode-2", "Trabalho", "mode"), members: ["b"] };
    render(<ModeForm library={library} initial={initial} onSubmit={onSubmit} onCancel={vi.fn()} />);
    expect(screen.getByLabelText("Nome do modo")).toHaveValue("Trabalho");
    expect(screen.getByRole("checkbox", { name: "Faculdade" })).toBeChecked();
    await userEvent.click(screen.getByRole("checkbox", { name: "Faculdade" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Chrome" }));
    await userEvent.click(screen.getByRole("button", { name: "Salvar modo" }));
    expect(onSubmit).toHaveBeenCalledWith("Trabalho", ["a"]);
  });

  it("mostra erro do backend", async () => {
    render(<ModeForm library={library} onSubmit={vi.fn(async () => "Dê um nome.")} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Salvar modo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Dê um nome.");
  });
});
