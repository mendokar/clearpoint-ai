// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PasswordInput } from "@/components/auth/PasswordInput";

describe("PasswordInput", () => {
  it("oculta la contraseña por defecto y el ojo la muestra y la vuelve a ocultar", () => {
    render(
      <>
        <label htmlFor="pw">Contraseña</label>
        <PasswordInput id="pw" name="password" defaultValue="Secreta-123" />
      </>,
    );
    const input = screen.getByLabelText("Contraseña") as HTMLInputElement;
    expect(input.type).toBe("password");

    const toggle = screen.getByRole("button", { name: "Mostrar contraseña" });
    expect(toggle.getAttribute("type")).toBe("button"); // no envía el formulario
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(toggle);
    expect(input.type).toBe("text");
    expect(input.value).toBe("Secreta-123");
    expect(screen.getByRole("button", { name: "Ocultar contraseña" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Ocultar contraseña" }));
    expect(input.type).toBe("password");
  });
});
