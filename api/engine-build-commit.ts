import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";

/** A full git commit id: SHA-1 (40) or SHA-256 (64) lowercase hex. */
export const ENGINE_COMMIT = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;

export type GitRunner = (args: readonly string[]) => string;

export interface EngineBuildCommitOptions {
  /** The build's environment (process.env at build time). */
  env?: Record<string, string | undefined>;
  /** The directory being built; the checkout must be exactly this one. */
  directory?: string;
  /** Test seam: runs git in the directory and returns its stdout. */
  git?: GitRunner;
}

/**
 * The engine commit a build records for GET /api/host/configuration
 * (engine.commit), decided once, at build time, from the source being built:
 *
 * - a git checkout of exactly this directory: its HEAD, and only while the
 *   checkout is clean (no modified, staged or untracked file outside
 *   .gitignore). This covers a local or prebuilt build (`vercel build`, then
 *   `vercel deploy --prebuilt`): a deployment created from the CLI for a
 *   project not linked to the repository gets no VERCEL_GIT_COMMIT_SHA at
 *   runtime, so without this record it reads back commit null. A dirty
 *   checkout records nothing, never the commit it differs from.
 * - otherwise (no checkout here, as on a Vercel Git-integration build, which
 *   carries no .git): the platform's own build-time VERCEL_GIT_COMMIT_SHA.
 *
 * Anything else records "" and the readback falls back to the runtime
 * platform value, else null. Nothing here is operator-supplied.
 */
export function engineBuildCommit({
  env = process.env,
  directory = process.cwd(),
  git,
}: EngineBuildCommitOptions = {}): string {
  const run: GitRunner =
    git ??
    ((args) =>
      execFileSync("git", [...args], {
        cwd: directory,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 10_000,
      }));
  let checkout: { clean: boolean; head: string } | null = null;
  try {
    const top = run(["rev-parse", "--show-toplevel"]).trim();
    // A checkout of a parent directory is another repository's source.
    if (top && samePath(top, directory)) {
      checkout = {
        clean:
          run(["status", "--porcelain", "--untracked-files=all"]).trim() === "",
        head: run(["rev-parse", "--verify", "HEAD"]).trim(),
      };
    }
  } catch {
    checkout = null;
  }
  if (checkout)
    return checkout.clean && ENGINE_COMMIT.test(checkout.head)
      ? checkout.head
      : "";
  const platform = env.VERCEL_GIT_COMMIT_SHA?.trim() ?? "";
  return ENGINE_COMMIT.test(platform) ? platform : "";
}

function samePath(a: string, b: string): boolean {
  const real = (value: string) => {
    try {
      return realpathSync(value);
    } catch {
      return value;
    }
  };
  return real(a) === real(b);
}
