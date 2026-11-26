import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { QuickLauncher, formatHotkey } from "./QuickLauncher";

function setup(over: Partial<Parameters<typeof QuickLauncher>[0]> = {}) {
  const props = {
    accent: "#9b82ff",
    hotkeyLabel: "Alt+Space",
    showNonce: 0,
    onHide: vi.fn(),
    onOpenPanel: vi.fn(),
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
