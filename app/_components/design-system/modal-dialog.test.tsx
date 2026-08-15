import { useRef, useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ModalDialog } from "@/app/_components/design-system/modal-dialog";

function ExampleDialog() {
  const [open, setOpen] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open details
      </button>
      {open ? (
        <ModalDialog
          labelledBy="example-dialog-title"
          initialFocusRef={closeButton}
          onClose={() => setOpen(false)}
        >
          <h2 id="example-dialog-title">Details</h2>
          <button
            ref={closeButton}
            type="button"
            onClick={() => setOpen(false)}
          >
            Close
          </button>
          <button type="button">Last action</button>
        </ModalDialog>
      ) : null}
    </>
  );
}

describe("ModalDialog", () => {
  it("traps focus, closes on Escape, and restores invoking focus", async () => {
    render(<ExampleDialog />);
    const trigger = screen.getByRole("button", { name: "Open details" });
    trigger.focus();
    fireEvent.click(trigger);

    const close = screen.getByRole("button", { name: "Close" });
    await waitFor(() => expect(document.activeElement).toBe(close));
    const last = screen.getByRole("button", { name: "Last action" });
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
