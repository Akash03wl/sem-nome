import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { QuickLauncher, formatHotkey } from "./QuickLauncher";
import type { Discovered, Library } from "../lib/types";

const item = (id: string, name: string) => ({ id, name, kind: "app" as const, target: `C:\\${name}.exe`, args: "", admin: false });

const library: Library = {
  version: 1,
  items: [item("a", "Alpha"), item("b", "Beta"), item("c", "Gamma")],
  favorites: ["a", "b"],
  categories: [{ id: "cat-1", name: "Jogos", items: ["c"] }],
  recents: ["c"],
  hidden: ["app-y"],
};

const discovered: Discovered[] = [
  { id: "app-x", name: "Xbox", target: "shell:AppsFolder\\x" },
  { id: "app-y", name: "Yoga", target: "shell:AppsFolder\\y" },
];

const emptyLibrary: Library = { version: 1, items: [], favorites: [], categories: [], recents: [], hidden: [] };

function setup(over: Partial<Parameters<typeof QuickLauncher>[0]> = {}) {
  const props = {
    accent: "#9b82ff",
    hotkeyLabel: "Alt+Space",
    showNonce: 0,
    library: emptyLibrary,
    discovered: [] as Discovered[],
    onHide: vi.fn(),
    onOpenPanel: vi.fn(),
    onLaunch: vi.fn(async (_id: string, _admin?: boolean) => null as string | null),
    onApply: vi.fn(async () => null as string | null),
    onReveal: vi.fn(async () => null as string | null),
    shortcuts: [{ keyword: "yt", name: "YouTube", url: "https://www.youtube.com/results?search_query={q}" }],
    onSystem: vi.fn(async () => null as string | null),
    onOpenUrl: vi.fn(async () => null as string | null),
    onCopy: vi.fn(async () => {}),
    ...over,
  };
  const utils = render(<QuickLauncher {...props} />);
  return { props, ...utils };
}

describe("QuickLauncher", () => {
  it("mostra a marca e a busca com placeholder", () => {
    setup();
    expect(screen.getByText("Vitra")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Buscar programas, pastas, sites…")).toBeInTheDocument();
  });

  it("mostra o atalho recebido", () => {
    setup();
    expect(screen.getByText("Alt+Espaço")).toBeInTheDocument();
    expect(formatHotkey("Ctrl+Shift+Super+K")).toBe("Ctrl+Shift+Win+K");
  });

  it("Esc chama onHide", () => {
    const { props } = setup();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(props.onHide).toHaveBeenCalledTimes(1);
  });

  it("botão Abrir painel chama onOpenPanel", async () => {
    const { props } = setup();
    await userEvent.click(screen.getByRole("button", { name: /Abrir painel/ }));
    expect(props.onOpenPanel).toHaveBeenCalledTimes(1);
  });

  it("limpa e foca a busca ao reabrir", async () => {
    const { props, rerender } = setup();
    const input = screen.getByPlaceholderText("Buscar programas, pastas, sites…") as HTMLInputElement;
    await userEvent.type(input, "abc");
    expect(input.value).toBe("abc");
    input.blur();
    rerender(<QuickLauncher {...props} showNonce={1} />);
    expect(input.value).toBe("");
    expect(document.activeElement).toBe(input);
  });

  it("aplica a cor de destaque", () => {
    const { container } = setup({ accent: "#3fd0c9" });
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.getPropertyValue("--accent")).toBe("#3fd0c9");
  });
});

describe("QuickLauncher ao esconder", () => {
  it("limpa a busca quando a janela perde o foco", async () => {
    setup();
    const input = screen.getByPlaceholderText("Buscar programas, pastas, sites…") as HTMLInputElement;
    await userEvent.type(input, "abc");
    fireEvent.blur(window);
    expect(input.value).toBe("");
  });

  it("limpa a busca ao apertar Esc", async () => {
    setup();
    const input = screen.getByPlaceholderText("Buscar programas, pastas, sites…") as HTMLInputElement;
    await userEvent.type(input, "abc");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(input.value).toBe("");
  });
});

describe("QuickLauncher com itens", () => {
  it("lista favoritos com selos 1 a 6", () => {
    setup({ library });
    expect(screen.getByRole("button", { name: /Alpha/ })).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /Beta/ })).toHaveTextContent("2");
  });

  it("Alt+2 abre o segundo favorito e esconde", async () => {
    const { props } = setup({ library });
    fireEvent.keyDown(document, { key: "2", code: "Digit2", altKey: true });
    expect(props.onLaunch).toHaveBeenCalledWith("b", false);
    await vi.waitFor(() => expect(props.onHide).toHaveBeenCalled());
  });

  it("mostra Recentes", () => {
    setup({ library });
    const recents = screen.getByRole("region", { name: "Recentes" });
    expect(recents).toHaveTextContent("Gamma");
  });

  it("trocar para uma categoria mostra os itens dela", async () => {
    setup({ library });
    await userEvent.click(screen.getByRole("button", { name: /^Jogos/ }));
    expect(screen.getByRole("button", { name: /Gamma/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Alpha/ })).not.toBeInTheDocument();
  });

  it("Todos mostra descobertos sem os escondidos", async () => {
    setup({ library, discovered });
    await userEvent.click(screen.getByRole("button", { name: /^Todos/ }));
    expect(screen.getByRole("button", { name: /Xbox/ })).toBeInTheDocument();
    expect(screen.queryByText("Yoga")).not.toBeInTheDocument();
  });

  it("erro ao abrir aparece e não esconde", async () => {
    const { props } = setup({
      library,
      onLaunch: vi.fn(async () => "Não encontrei este item. Ele foi movido ou apagado?"),
    });
    await userEvent.click(screen.getByRole("button", { name: /Alpha/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não encontrei este item");
    expect(props.onHide).not.toHaveBeenCalled();
  });

  it("menu: adicionar aos favoritos a partir de Todos", async () => {
    const { props } = setup({ library, discovered });
    await userEvent.click(screen.getByRole("button", { name: /^Todos/ }));
    fireEvent.contextMenu(screen.getByRole("button", { name: /Xbox/ }), { clientX: 5, clientY: 5 });
    await userEvent.click(screen.getByRole("menuitem", { name: "Adicionar aos favoritos" }));
    await vi.waitFor(() =>
      expect(props.onApply).toHaveBeenLastCalledWith({ op: "toggleFavorite", id: "app-x" }),
    );
    expect(props.onApply).toHaveBeenCalledWith({
      op: "addItem",
      item: { id: "app-x", name: "Xbox", kind: "app", target: "shell:AppsFolder\\x", args: "", admin: false },
    });
  });

  it("Esc com o menu aberto fecha só o menu", async () => {
    const { props } = setup({ library });
    fireEvent.contextMenu(screen.getByRole("button", { name: /Alpha/ }), { clientX: 5, clientY: 5 });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(props.onHide).not.toHaveBeenCalled();
  });
});

describe("QuickLauncher busca", () => {
  const typeQuery = async (text: string) => {
    await userEvent.type(screen.getByPlaceholderText("Buscar programas, pastas, sites…"), text);
  };

  it("mostra resultados ao digitar", async () => {
    setup({ library });
    await typeQuery("gam");
    const list = screen.getByRole("listbox", { name: "Resultados" });
    expect(list).toHaveTextContent("Gamma");
    expect(list).not.toHaveTextContent("Alpha");
  });

  it("setas e Enter abrem o selecionado", async () => {
    const { props } = setup({ library: { ...library, items: [...library.items, item("d", "Alphabet")] } });
    await typeQuery("alp");
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(props.onLaunch).toHaveBeenCalledWith("d", false);
    await vi.waitFor(() => expect(props.onHide).toHaveBeenCalled());
  });

  it("Ctrl+Enter abre como administrador e Shift+Enter abre o local", async () => {
    const { props } = setup({ library });
    await typeQuery("alpha");
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(props.onLaunch).toHaveBeenCalledWith("a", true);
    await userEvent.keyboard("{Shift>}{Enter}{/Shift}");
    expect(props.onReveal).toHaveBeenCalledWith("a");
  });

  it("calc: Enter copia", async () => {
    const { props } = setup();
    await typeQuery("250*12");
    expect(screen.getByRole("listbox", { name: "Resultados" })).toHaveTextContent("3.000");
    await userEvent.keyboard("{Enter}");
    expect(props.onCopy).toHaveBeenCalledWith("3000");
    expect(await screen.findByText("Copiado!")).toBeInTheDocument();
    expect(props.onHide).not.toHaveBeenCalled();
  });

  it("web: Enter abre a pesquisa", async () => {
    const { props } = setup();
    await typeQuery("yt lofi");
    expect(screen.getByRole("listbox", { name: "Resultados" })).toHaveTextContent("Pesquisar “lofi” no YouTube");
    await userEvent.keyboard("{Enter}");
    expect(props.onOpenUrl).toHaveBeenCalledWith("https://www.youtube.com/results?search_query=lofi");
    await vi.waitFor(() => expect(props.onHide).toHaveBeenCalled());
  });

  it("comando na busca pede Enter duas vezes", async () => {
    const { props } = setup();
    await typeQuery("desligar");
    await userEvent.keyboard("{Enter}");
    expect(props.onSystem).not.toHaveBeenCalled();
    expect(screen.getByRole("listbox", { name: "Resultados" })).toHaveTextContent("Pressione Enter de novo para desligar");
    await userEvent.keyboard("{Enter}");
    expect(props.onSystem).toHaveBeenCalledWith("shutdown");
  });

  it("nada encontrado mostra dica", async () => {
    setup();
    await typeQuery("zzzz");
    expect(screen.getByText(/Nada encontrado/)).toBeInTheDocument();
  });
});

describe("QuickLauncher comandos do PC", () => {
  it("desligar pede confirmação", () => {
    vi.useFakeTimers();
    try {
      const { props } = setup();
      const btn = screen.getByRole("button", { name: "Desligar" });
      fireEvent.click(btn);
      expect(props.onSystem).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Clique de novo para desligar" })).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(3100));
      fireEvent.click(screen.getByRole("button", { name: "Desligar" }));
      expect(props.onSystem).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Clique de novo para desligar" }));
      expect(props.onSystem).toHaveBeenCalledWith("shutdown");
    } finally {
      vi.useRealTimers();
    }
  });

  it("bloquear não pede confirmação", async () => {
    const { props } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Bloquear" }));
    expect(props.onSystem).toHaveBeenCalledWith("lock");
  });
});
