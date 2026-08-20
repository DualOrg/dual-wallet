/**
 * A long identifier shown shortened. The full value stays in the accessible
 * name, because a `title` tooltip is unavailable to keyboard and touch users.
 */
export function Truncated({ value, short }: { value: string; short: string }) {
  return (
    <>
      <span aria-hidden title={value}>
        {short}
      </span>
      <span className="sr-only">{value}</span>
    </>
  );
}
