export const MIN_PASSWORD_CHARACTERS = 8;
export const MAX_PASSWORD_BYTES = 72;

export type PasswordPolicyViolation = "too_short" | "too_long";

export function utf8ByteLength(value: string) {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    bytes +=
      codePoint <= 0x7f
        ? 1
        : codePoint <= 0x7ff
          ? 2
          : codePoint <= 0xffff
            ? 3
            : 4;
  }
  return bytes;
}

export function passwordPolicyViolation(
  password: string,
): PasswordPolicyViolation | undefined {
  if ([...password].length < MIN_PASSWORD_CHARACTERS) return "too_short";
  if (utf8ByteLength(password) > MAX_PASSWORD_BYTES) {
    return "too_long";
  }
  return undefined;
}

export function isValidNewPassword(password: string) {
  return passwordPolicyViolation(password) === undefined;
}
