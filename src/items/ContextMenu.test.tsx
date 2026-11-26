import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ContextMenu } from "./ContextMenu";
import type { Category } from "../lib/types";

const cats: Category[] = [
  { id: "cat-1", name: "Jogos", items: [] },
  { id: "cat-2", name: "Trabalho", items: [] },
];

function setup(over: Partial<Parameters<typeof ContextMenu>[0]> = {}) {
  const props = {
    x: 5,
    y: 5,
    kind: "app" as const,
    canReveal: true,
    isFavorite: false,
    categories: cats,
    onAction: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
  render(<ContextMenu {...props} />);
  return props;
}

const names = () => screen.getAllByRole("menuitem").map((m) => m.textContent);

describe("ContextMenu", () => {
  it("mostra as ações de um programa", () => {
    setup();
    expect(names()).toEqual([
      "Abrir",
      "Abrir como administrador",
      "Abrir local do arquivo",
      "Adicionar aos favoritos",
      "Jogos",
      "Trabalho",
      "Renomear",
      "Remover do Vitra",
    ]);
    expect(screen.getByText("Mover para")).toBeInTheDocument();
  });

  it("favorito mostra Remover dos favoritos", () => {
    setup({ isFavorite: true });
    expect(names()).toContain("Remover dos favoritos");
  });

  it("item de Todos mostra Esconder da lista e não Remover", () => {
    setup({ fromAll: true, canReveal: false });
    expect(names()).toContain("Esconder da lista");
    expect(names()).not.toContain("Remover do Vitra");
    expect(names()).not.toContain("Renomear");
    expect(names()).not.toContain("Abrir local do arquivo");
  });

  it("site não mostra administrador nem local", () => {
    setup({ kind: "site", canReveal: false });
    expect(names()).not.toContain("Abrir como administrador");
    expect(names()).not.toContain("Abrir local do arquivo");
  });

  it("dentro de uma categoria oferece tirar dela e não lista ela em Mover para", () => {
    setup({ inCategory: "cat-1" });
    expect(names()).toContain("Tirar desta categoria");
    expect(names()).not.toContain("Jogos");
  });

  it("Mover para chama onAction com a categoria e fecha", async () => {
    const p = setup();
    await userEvent.click(screen.getByRole("menuitem", { name: "Trabalho" }));
    expect(p.onAction).toHaveBeenCalledWith({ moveTo: "cat-2" });
    expect(p.onClose).toHaveBeenCalled();
  });

  it("Esc fecha", () => {
    const p = setup();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(p.onClose).toHaveBeenCalled();
  });
});
