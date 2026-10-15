// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/Toaster";
import { toast, useToasts } from "@/lib/ui/toast";

beforeEach(() => {
  vi.useFakeTimers();
  useToasts.setState({ toasts: [] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Toaster", () => {
  it("muestra el aviso en una región aria-live y se cierra solo", async () => {
    render(<Toaster />);
    act(() => void toast({ text: "Has cerrado sesión", duration: 1000 }));
    expect(screen.getByRole("status").textContent).toContain("Has cerrado sesión");
    await act(async () => vi.advanceTimersByTime(1000));
    // Animación de salida y luego se retira.
    expect(document.querySelector(".toast")?.getAttribute("data-leaving")).toBe("true");
    await act(async () => vi.advanceTimersByTime(250));
    expect(screen.queryByText("Has cerrado sesión")).toBeNull();
  });

  it("ejecuta la acción (Deshacer) y se cierra", async () => {
    const run = vi.fn();
    render(<Toaster />);
    act(() => void toast({ text: "Eliminado", action: { label: "Deshacer", run } }));
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(run).toHaveBeenCalledOnce();
    await act(async () => vi.advanceTimersByTime(250));
    expect(useToasts.getState().toasts).toHaveLength(0);
  });

  it("como máximo muestra tres avisos a la vez", () => {
    render(<Toaster />);
    act(() => {
      for (let i = 1; i <= 5; i++) toast({ text: `Aviso ${i}` });
    });
    expect(useToasts.getState().toasts.map((t) => t.text)).toEqual(["Aviso 3", "Aviso 4", "Aviso 5"]);
  });
});
