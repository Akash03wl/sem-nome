import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ItemsSection } from "./ItemsSection";
import type { Discovered, Library } from "../lib/types";

const item = (id: string, name: string) => ({ id, name, kind: "app" as const, target: `C:\\${name}.exe`, args: "", admin: false });

const library: Library = {
  version: 1,
  items: [item("a", "Alpha"), item("b", "Beta")],
  favorites: ["a", "b"],
  categories: [{ id: "cat-1", name: "Jogos", items: [] }],
  recents: [],
  hidden: ["app-y"],
};
const discovered: Discovered[] = [
  { id: "app-x", name: "Xbox", target: "shell:AppsFolder\\x" },
  { id: "app-y", name: "Yoga", target: "shell:AppsFolder\\y" },
];

function setup(over: Partial<Parameters<typeof ItemsSection>[0]> = {}) {
  const ok = async () => null as string | null;
  const props = {
    library,
    discovered,
    onApply: vi.fn(ok),
    onLaunch: vi.fn(ok),
    onReveal: vi.fn(ok),
    onAddFiles: vi.fn(ok),
    onAddSite: vi.fn(ok),
    onSelectCategory: vi.fn(),
    ...over,
  };
  render(<ItemsSection {...props} />);
  return props;
}

/** Arrasta com o mouse de `from` até `to` (arrastar interno por ponteiro). */
function drag(from: Element, to: Element) {
  fireEvent.pointerDown(from, { button: 0, clientX: 0, clientY: 0 });
  fireEvent.pointerMove(window, { clientX: 30, clientY: 30 });
  fireEvent.pointerUp(to, { clientX: 30, clientY: 30 });
}

const nav = () => screen.getByRole("navigation", { name: "Categorias" });

describe("ItemsSection", () => {
  it("mostra os favoritos e as categorias", () => {
    setup();
    expect(screen.getByRole("button", { name: /Alpha/ })).toBeInTheDocument();
    expect(nav()).toHaveTextContent("Jogos");
  });

  it("cria categoria", async () => {
    const p = setup();
    await userEvent.click(screen.getByRole("button", { name: "+ Nova categoria" }));
    await userEvent.type(screen.getByLabelText("Nome da categoria"), "Trabalho{Enter}");
    expect(p.onApply).toHaveBeenCalledWith({ op: "createCategory", name: "Trabalho" });
  });

  it("mostra erro de categoria", async () => {
    setup({ onApply: vi.fn(async () => "Já existe uma categoria com esse nome.") });
    await userEvent.click(screen.getByRole("button", { name: "+ Nova categoria" }));
    await userEvent.type(screen.getByLabelText("Nome da categoria"), "Jogos{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Já existe uma categoria com esse nome.");
  });

  it("renomeia categoria com clique duplo", async () => {
    const p = setup();
    await userEvent.dblClick(screen.getByRole("button", { name: /^Jogos/ }));
    const field = screen.getByLabelText("Renomear categoria");
    await userEvent.clear(field);
    await userEvent.type(field, "Games{Enter}");
    expect(p.onApply).toHaveBeenCalledWith({ op: "renameCategory", id: "cat-1", name: "Games" });
  });

  it("exclui categoria", async () => {
    const p = setup();
    await userEvent.click(screen.getByRole("button", { name: /^Jogos/ }));
    expect(p.onSelectCategory).toHaveBeenLastCalledWith("cat-1");
    await userEvent.click(screen.getByRole("button", { name: "Excluir categoria" }));
    expect(p.onApply).toHaveBeenCalledWith({ op: "deleteCategory", id: "cat-1" });
  });

  it("adicionar site envia nome e endereço", async () => {
    const p = setup();
    await userEvent.click(screen.getByRole("button", { name: /Adicionar/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Site" }));
    await userEvent.type(screen.getByLabelText("Endereço"), "youtube.com");
    await userEvent.click(screen.getByRole("button", { name: "Adicionar site" }));
    expect(p.onAddSite).toHaveBeenCalledWith("", "youtube.com", "favoritos");
  });

  it("erro de site aparece", async () => {
    setup({ onAddSite: vi.fn(async () => "Endereço inválido. Ex.: youtube.com") });
    await userEvent.click(screen.getByRole("button", { name: /Adicionar/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Site" }));
    await userEvent.type(screen.getByLabelText("Endereço"), "abc");
    await userEvent.click(screen.getByRole("button", { name: "Adicionar site" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Endereço inválido");
  });

  it("Adicionar > Pasta chama onAddFiles com folders=true", async () => {
    const p = setup();
    await userEvent.click(screen.getByRole("button", { name: /Adicionar/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Pasta" }));
    expect(p.onAddFiles).toHaveBeenCalledWith("favoritos", true);
  });

  it("soltar tile numa categoria adiciona nela", async () => {
    const p = setup();
    drag(screen.getByRole("button", { name: /Alpha/ }), screen.getByRole("button", { name: /^Jogos/ }));
    await vi.waitFor(() =>
      expect(p.onApply).toHaveBeenCalledWith({ op: "addToCategory", category: "cat-1", id: "a" }),
    );
  });

  it("soltar favorito sobre outro reordena", () => {
    const p = setup();
    drag(screen.getByRole("button", { name: /Beta/ }), screen.getByRole("button", { name: /Alpha/ }));
    expect(p.onApply).toHaveBeenCalledWith({ op: "moveFavorite", id: "b", to: 0 });
  });

  it("Todos lista descobertos e permite voltar escondidos", async () => {
    const p = setup();
    await userEvent.click(screen.getByRole("button", { name: /^Todos/ }));
    expect(screen.getByRole("button", { name: /Xbox/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Yoga/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Mostrar escondidos/ }));
    await userEvent.click(screen.getByRole("button", { name: "Voltar Yoga para a lista" }));
    expect(p.onApply).toHaveBeenCalledWith({ op: "unhide", id: "app-y" });
  });
});

describe("ItemsSection arrastar", () => {
  it("um clique sem arrastar abre o item", async () => {
    const p = setup();
    await userEvent.click(screen.getByRole("button", { name: /Alpha/ }));
    expect(p.onLaunch).toHaveBeenCalledWith("a");
  });

  it("soltar fora de um alvo não faz nada", () => {
    const p = setup();
    drag(screen.getByRole("button", { name: /Alpha/ }), document.body);
    expect(p.onApply).not.toHaveBeenCalled();
  });
});

describe("ItemsSection modos", () => {
  it("Adicionar > Modo abre o formulário e cria", async () => {
    const p = setup();
    await userEvent.click(screen.getByRole("button", { name: /Adicionar/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Modo (grupo de itens)" }));
    await userEvent.type(screen.getByLabelText("Nome do modo"), "Estudo");
    await userEvent.click(screen.getByRole("checkbox", { name: "Alpha" }));
    await userEvent.click(screen.getByRole("button", { name: "Salvar modo" }));
    expect(p.onApply).toHaveBeenCalledWith({ op: "createMode", name: "Estudo", members: ["a"] });
  });
});
