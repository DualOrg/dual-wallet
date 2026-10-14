/**
 * Formats an exact decimal string as a currency amount in the active locale
 * without converting it to a floating-point number: Intl formats the decimal
 * string itself. If the runtime cannot, the exact string is shown unchanged.
 */
export function formatDecimalAmount(
  amount: string,
  currency: string,
  locale: string,
) {
  const fraction = amount.split(".")[1]?.length ?? 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: fraction,
      maximumFractionDigits: Math.max(fraction, 2),
    }).format(amount as Intl.StringNumericLiteral);
  } catch {
    return `${amount} ${currency}`;
  }
}
