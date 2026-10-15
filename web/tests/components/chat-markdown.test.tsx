// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ChatMarkdown } from "@/components/chat/ChatMarkdown";

afterEach(cleanup);

describe("render seguro del chat", () => {
  it("no inserta <script> ni ejecuta su contenido", () => {
    (window as unknown as { pwned?: boolean }).pwned = false;
    const { container } = render(<ChatMarkdown text={'Hola <script>window.pwned = true</script> fin'} />);
    expect(container.querySelector("script")).toBeNull();
    expect((window as unknown as { pwned?: boolean }).pwned).toBe(false);
    expect(container.innerHTML).not.toContain("<script");
  });

  it("no inserta <img onerror> ni atributos de evento", () => {
    const { container } = render(<ChatMarkdown text={'<img src=x onerror="alert(1)"> y ![x](https://evil.test/x.png)'} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.innerHTML).not.toMatch(/onerror/i);
  });

  it("neutraliza enlaces javascript:", () => {
    const { container } = render(<ChatMarkdown text={"[clic](javascript:alert(1))"} />);
    const a = container.querySelector("a");
    expect(a?.getAttribute("href") ?? "").not.toMatch(/^javascript:/i);
  });

  it("renderiza markdown normal y abre enlaces externos con rel seguro", () => {
    const { container } = render(<ChatMarkdown text={"**Enviado** con [SEUR](https://seur.com)\n\n- uno\n- dos"} />);
    expect(container.querySelector("strong")?.textContent).toBe("Enviado");
    expect(container.querySelectorAll("li")).toHaveLength(2);
    const a = container.querySelector("a")!;
    expect(a.getAttribute("rel")).toContain("noopener");
    expect(a.getAttribute("target")).toBe("_blank");
  });
});
