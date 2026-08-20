import { render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { Alert } from "@/app/_components/design-system/alert";
import { Button } from "@/app/_components/design-system/button";
import { Field, SelectField } from "@/app/_components/design-system/field";
import { ModalDialog } from "@/app/_components/design-system/modal-dialog";
import { Tabs } from "@/app/_components/design-system/tabs";

expect.extend(toHaveNoViolations);

describe("design-system accessibility", () => {
  it("associates labels, hints, errors, and controls without axe violations", async () => {
    const { container } = render(
      <main>
        <h1>Account details</h1>
        <form>
          <Field
            name="email"
            label="Email address"
            hint="Used for account recovery"
          />
          <Field
            name="password"
            type="password"
            label="Password"
            error="Enter a password"
          />
          <SelectField name="language" label="Language">
            <option value="en">English</option>
          </SelectField>
          <Alert>Something went wrong</Alert>
          <Alert tone="success">Saved</Alert>
          <Button type="submit">Save changes</Button>
        </form>
      </main>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it("keeps a field's hint and error in the same description relationship", () => {
    render(
      <Field
        name="code"
        label="Verification code"
        hint="Six digits"
        error="That code has expired"
      />,
    );

    const input = screen.getByLabelText(/Verification code/);
    const described = (input.getAttribute("aria-describedby") ?? "").split(" ");
    expect(described).toHaveLength(2);
    expect(
      described.map((id) => document.getElementById(id)?.textContent),
    ).toEqual(["Six digits", "That code has expired"]);
  });

  it("gives repeated fields of the same name distinct ids", () => {
    render(
      <>
        <Field name="email" label="Work email" />
        <Field name="email" label="Personal email" />
      </>,
    );

    const ids = screen
      .getAllByRole("textbox")
      .map((input) => input.getAttribute("id"));
    expect(new Set(ids).size).toBe(2);
    expect(screen.getByLabelText("Personal email")).toBeTruthy();
  });

  it("renders tabs and a modal dialog without axe violations", async () => {
    const { container } = render(
      <main>
        <h1>Object</h1>
        <Tabs
          label="Sign-in method"
          options={[
            { id: "email", label: "Email" },
            { id: "passkey", label: "Passkey" },
          ]}
          value="email"
          onChange={() => {}}
        >
          <p>Email panel</p>
        </Tabs>
        <ModalDialog labelledBy="dialog-title" onClose={() => {}}>
          <h2 id="dialog-title">Object details</h2>
          <Button>Close</Button>
        </ModalDialog>
      </main>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
