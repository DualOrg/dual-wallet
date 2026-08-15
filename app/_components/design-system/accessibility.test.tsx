import { render } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { Button } from "@/app/_components/design-system/button";
import { Field, SelectField } from "@/app/_components/design-system/field";

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
          <Button type="submit">Save changes</Button>
        </form>
      </main>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
