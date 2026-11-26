import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ItemTile } from "./ItemTile";

const steam = { id: "app-1", name: "Steam", kind: "app" as const };

describe("ItemTile", () => {
  it("mostra a inicial quando não há ícone", () => {
    render(<ItemTile item={steam} iconSrc={null} onOpen={vi.fn()} onContext={vi.fn()} />);
    expect(screen.getByText("S")).toBeInTheDocument();
    expect(screen.getByText("Steam")).toBeInTheDocument();
  });

  it("mostra o ícone quando há", () => {
    const { container } = render(
      <ItemTile item={steam} iconSrc="data:image/png;base64,AAAA" onOpen={vi.fn()} onContext={vi.fn()} />,
    );
    expect(container.querySelector("img")).toHaveAttribute("src", "data:image/png;base64,AAAA");
  });

  it("clique abre, botão direito abre o menu", async () => {
    const onOpen = vi.fn();
    const onContext = vi.fn();
    render(<ItemTile item={steam} iconSrc={null} onOpen={onOpen} onContext={onContext} />);
    const btn = screen.getByRole("button", { name: /Steam/ });
    await userEvent.click(btn);
    expect(onOpen).toHaveBeenCalledTimes(1);
    fireEvent.contextMenu(btn, { clientX: 10, clientY: 20 });
    expect(onContext).toHaveBeenCalledWith({ x: 10, y: 20 });
  });

  it("mostra o número do atalho", () => {
    render(<ItemTile item={steam} badge="1" iconSrc={null} onOpen={vi.fn()} onContext={vi.fn()} />);
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("Enter abre (é um botão de verdade)", async () => {
    const onOpen = vi.fn();
    render(<ItemTile item={steam} iconSrc={null} onOpen={onOpen} onContext={vi.fn()} />);
    screen.getByRole("button", { name: /Steam/ }).focus();
    await userEvent.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("Shift+F10 abre o menu pelo teclado", () => {
    const onContext = vi.fn();
    render(<ItemTile item={steam} iconSrc={null} onOpen={vi.fn()} onContext={onContext} />);
    fireEvent.keyDown(screen.getByRole("button", { name: /Steam/ }), { key: "F10", shiftKey: true });
    expect(onContext).toHaveBeenCalled();
  });
});
