import { sessionQueryOptions } from "@/app/_hooks/query-options";

// The server renews tokens only when a request arrives. Without background
// polling an idle tab lets the refresh token expire and the next click is a
// forced logout, so both of these have to stay on.
test("the session query keeps polling while the tab is idle or hidden", () => {
  const options = sessionQueryOptions();
  expect(options.refetchInterval).toBeGreaterThan(0);
  expect(options.refetchInterval).toBeLessThanOrEqual(10 * 60_000);
  expect(options.refetchIntervalInBackground).toBe(true);
});
