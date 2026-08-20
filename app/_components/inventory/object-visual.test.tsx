import { render, screen } from "@testing-library/react";
import { ObjectVisual } from "@/app/_components/inventory/object-visual";

describe("ObjectVisual", () => {
  it("runs an external HTML face in a constrained iframe", () => {
    render(
      <ObjectVisual
        name="Remote passport"
        eager
        display={{
          kind: "external-document",
          url: "https://passport.example/objects/object-123",
          mediaType: "text/html",
          interactive: true,
          revision: "face-1",
        }}
      />,
    );

    const frame = screen.getByTitle("Remote passport");
    expect(frame.getAttribute("src")).toBe(
      "https://passport.example/objects/object-123",
    );
    expect(frame.hasAttribute("srcdoc")).toBe(false);
    expect(frame.getAttribute("sandbox")).toBe(
      "allow-forms allow-same-origin allow-scripts",
    );
    expect(frame.classList).not.toContain("is-inert");
    expect(frame.getAttribute("tabindex")).toBeNull();
    expect(frame.getAttribute("aria-hidden")).toBeNull();
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
  });

  it("keeps a non-interactive face out of the tab order", () => {
    render(
      <ObjectVisual
        name="Card face"
        eager
        allowInteraction={false}
        display={{
          kind: "external-document",
          url: "https://passport.example/objects/object-123",
          mediaType: "text/html",
          interactive: true,
          revision: "face-1",
        }}
      />,
    );

    const frame = screen.getByTitle("Card face");
    expect(frame.classList).toContain("is-inert");
    expect(frame.getAttribute("tabindex")).toBe("-1");
    expect(frame.getAttribute("aria-hidden")).toBe("true");
  });
});
