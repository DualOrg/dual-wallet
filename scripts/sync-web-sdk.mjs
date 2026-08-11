import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.resolve(root, "../web-sdk");
const target = path.join(root, "api/web-sdk");

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await Promise.all([
  cp(path.join(source, "apis"), path.join(target, "apis"), { recursive: true }),
  cp(path.join(source, "models"), path.join(target, "models"), {
    recursive: true,
  }),
  cp(path.join(source, "index.ts"), path.join(target, "index.ts")),
  cp(path.join(source, "runtime.ts"), path.join(target, "runtime.ts")),
]);

// OpenAPI Generator currently emits runtime sources that trigger strict TS 5.9
// errors inside its generated type guards and barrel exports. Treat the synced
// artifact as generated vendor code while keeping strict checks for Viewer code.
async function markGenerated(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await markGenerated(file);
    if (entry.isFile() && file.endsWith(".ts")) {
      const contents = await readFile(file, "utf8");
      if (!contents.startsWith("// @ts-nocheck")) {
        await writeFile(file, `// @ts-nocheck\n${contents}`);
      }
    }
  }
}

await markGenerated(target);

const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
  cwd: source,
});
await writeFile(path.join(target, ".source-commit"), `${stdout.trim()}\n`);

const index = await readFile(path.join(target, "index.ts"), "utf8");
if (!index.includes("./runtime"))
  throw new Error("Synchronized SDK is incomplete");
console.log(`Synchronized web-sdk at ${stdout.trim()}`);
