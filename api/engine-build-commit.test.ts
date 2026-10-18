/**
 * @jest-environment node
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { engineBuildCommit, type GitRunner } from "@/api/engine-build-commit";

const HEAD = "3d23daf2c04c6e9ace6ab00f4fc3f5d7aab94a6f";
const PLATFORM = "0123456789abcdef0123456789abcdef01234567";

// A git that answers for exactly this directory.
const fakeGit =
  (directory: string, { status = "", head = HEAD } = {}): GitRunner =>
  (args) => {
    const command = args.join(" ");
    if (command === "rev-parse --show-toplevel") return `${directory}\n`;
    if (command === "status --porcelain --untracked-files=all") return status;
    if (command === "rev-parse --verify HEAD") return `${head}\n`;
    throw new Error(`unexpected git ${command}`);
  };
const noGit: GitRunner = () => {
  throw new Error("not a git repository");
};

describe("engineBuildCommit", () => {
  const directory = "/srv/wallet";

  it("records the HEAD of a clean checkout of exactly the built directory", () => {
    expect(
      engineBuildCommit({ env: {}, directory, git: fakeGit(directory) }),
    ).toBe(HEAD);
  });

  it("prefers that checkout over a build-time platform value", () => {
    expect(
      engineBuildCommit({
        env: { VERCEL_GIT_COMMIT_SHA: PLATFORM },
        directory,
        git: fakeGit(directory),
      }),
    ).toBe(HEAD);
  });

  it("records nothing for a dirty checkout, whatever the platform says", () => {
    for (const status of [
      " M api/wallet-host.ts\n",
      "?? stray.ts\n",
      "A  staged.ts\n",
    ]) {
      expect(
        engineBuildCommit({
          env: { VERCEL_GIT_COMMIT_SHA: PLATFORM },
          directory,
          git: fakeGit(directory, { status }),
        }),
      ).toBe("");
    }
  });

  it("records nothing for a HEAD that is not a full commit id", () => {
    expect(
      engineBuildCommit({
        env: {},
        directory,
        git: fakeGit(directory, { head: "3d23daf" }),
      }),
    ).toBe("");
  });

  it("never takes a parent directory's repository as this source", () => {
    expect(
      engineBuildCommit({ env: {}, directory, git: fakeGit("/srv") }),
    ).toBe("");
    expect(
      engineBuildCommit({
        env: { VERCEL_GIT_COMMIT_SHA: PLATFORM },
        directory,
        git: fakeGit("/srv"),
      }),
    ).toBe(PLATFORM);
  });

  it("uses the platform's build-time commit when there is no checkout (a Git-integration build)", () => {
    expect(
      engineBuildCommit({
        env: { VERCEL_GIT_COMMIT_SHA: PLATFORM },
        directory,
        git: noGit,
      }),
    ).toBe(PLATFORM);
    expect(
      engineBuildCommit({
        env: { VERCEL_GIT_COMMIT_SHA: "not-a-commit" },
        directory,
        git: noGit,
      }),
    ).toBe("");
    expect(engineBuildCommit({ env: {}, directory, git: noGit })).toBe("");
  });

  describe("with a real git checkout", () => {
    let root = "";
    const git = (...args: string[]) =>
      execFileSync("git", args, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();

    beforeEach(() => {
      root = mkdtempSync(join(tmpdir(), "engine-commit-"));
      git("init", "-q");
      git(
        "-c",
        "user.email=t@example.invalid",
        "-c",
        "user.name=t",
        "commit",
        "-q",
        "--allow-empty",
        "-m",
        "base",
      );
      writeFileSync(join(root, ".gitignore"), ".vercel\n.next/\n");
      git("add", ".gitignore");
      git(
        "-c",
        "user.email=t@example.invalid",
        "-c",
        "user.name=t",
        "commit",
        "-q",
        "-m",
        "ignore",
      );
    });
    afterEach(() => rmSync(root, { recursive: true, force: true }));

    it("names the checked-out commit while only ignored build output is present", () => {
      mkdirSync(join(root, ".vercel", "output"), { recursive: true });
      writeFileSync(join(root, ".vercel", "project.json"), "{}");
      mkdirSync(join(root, ".next"));
      expect(engineBuildCommit({ env: {}, directory: root })).toBe(
        git("rev-parse", "HEAD"),
      );
    });

    it("names nothing once a file is changed or added", () => {
      writeFileSync(join(root, "extra.ts"), "export {};\n");
      expect(engineBuildCommit({ env: {}, directory: root })).toBe("");
      rmSync(join(root, "extra.ts"));
      writeFileSync(join(root, ".gitignore"), ".vercel\n");
      expect(engineBuildCommit({ env: {}, directory: root })).toBe("");
    });

    it("names nothing for a directory inside the checkout", () => {
      mkdirSync(join(root, "sub"));
      writeFileSync(join(root, "sub", ".keep"), "");
      git("add", "sub/.keep");
      git(
        "-c",
        "user.email=t@example.invalid",
        "-c",
        "user.name=t",
        "commit",
        "-q",
        "-m",
        "sub",
      );
      expect(engineBuildCommit({ env: {}, directory: join(root, "sub") })).toBe(
        "",
      );
    });
  });
});
