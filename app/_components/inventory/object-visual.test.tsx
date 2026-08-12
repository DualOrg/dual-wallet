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
    expect(frame.style.pointerEvents).toBe("auto");
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
  });
});
