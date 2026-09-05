import {
  isValidNewPassword,
  passwordPolicyViolation,
} from "@/app/_domain/password";

describe("password policy", () => {
  it("accepts both policy boundaries", () => {
    expect(isValidNewPassword("12345678")).toBe(true);
    expect(isValidNewPassword("a".repeat(72))).toBe(true);
    expect(isValidNewPassword("🙂".repeat(8))).toBe(true);
  });

  it("counts Unicode characters for the minimum", () => {
    expect(passwordPolicyViolation("🙂".repeat(7))).toBe("too_short");
  });

  it("counts UTF-8 bytes for bcrypt's maximum", () => {
    expect(passwordPolicyViolation("a".repeat(73))).toBe("too_long");
    expect(passwordPolicyViolation("🙂".repeat(19))).toBe("too_long");
  });
});
