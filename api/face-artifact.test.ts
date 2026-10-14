/**
 * @jest-environment node
 */
import { createHash } from "node:crypto";
import {
  artifactHashFromFiles,
  resetFaceArtifactCache,
  sriFromFileHash,
  verifyArtifactDocuments,
  verifyFaceArtifact,
} from "@/api/face-artifact";
import { parseProductFaceApplications } from "@/api/product-face-binding";
import { bindingInput } from "@/test/product-face-fixtures";

const hash = (value: string) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;

function artifact({
  js = "console.log('face')",
  css = "body{}",
  jsIntegrity,
}: { js?: string; css?: string; jsIntegrity?: string } = {}) {
  const jsHash = hash(js);
  const cssHash = hash(css);
  const index = `<!doctype html><html><head><link rel="stylesheet" href="face.css" integrity="${sriFromFileHash(cssHash)}" crossorigin="anonymous"><script type="module" src="./face.js" integrity="${jsIntegrity ?? sriFromFileHash(jsHash)}" crossorigin="anonymous"></script></head><body></body></html>`;
  const files: Record<string, string> = {
    "index.html": hash(index),
    "face.js": jsHash,
    "face.css": cssHash,
  };
  const manifest = {
    applicationId: "tig.passport.morrow-home",
    version: "1.0.0",
    files,
  };
  const artifactHash = artifactHashFromFiles(files);
  const [binding] = parseProductFaceApplications(
    JSON.stringify([
      bindingInput({
        artifactHash,
        path: `/face/tig.passport.morrow-home/1.0.0/${artifactHash.slice(7)}/`,
      }),
    ]),
    { production: true },
  );
  return { binding, index, manifest };
}

describe("pinned artifact verification", () => {
  it("accepts an artifact whose manifest, index and SRI all agree", () => {
    const { binding, index, manifest } = artifact();
    expect(
      verifyArtifactDocuments(
        binding,
        Buffer.from(JSON.stringify(manifest)),
        Buffer.from(index),
      ),
    ).toBe(true);
  });

  it("refuses a binding pinned to a different artifact hash", () => {
    const { index, manifest } = artifact();
    const other = artifact({ js: "console.log('other')" }).binding;
    expect(
      verifyArtifactDocuments(
        other,
        Buffer.from(JSON.stringify(manifest)),
        Buffer.from(index),
      ),
    ).toBe(false);
  });

  it("refuses a tampered index.html", () => {
    const { binding, index, manifest } = artifact();
    expect(
      verifyArtifactDocuments(
        binding,
        Buffer.from(JSON.stringify(manifest)),
        Buffer.from(index.replace("<body>", "<body><script>steal()</script>")),
      ),
    ).toBe(false);
  });

  it("refuses an SRI value that does not match the manifest", () => {
    const tampered = artifact({
      jsIntegrity: sriFromFileHash(hash("evil()")),
    });
    expect(
      verifyArtifactDocuments(
        tampered.binding,
        Buffer.from(JSON.stringify(tampered.manifest)),
        Buffer.from(tampered.index),
      ),
    ).toBe(false);
  });

  it("refuses a manifest whose files do not hash to the pinned artifact", () => {
    const { binding, index, manifest } = artifact();
    const changed = {
      ...manifest,
      files: { ...manifest.files, "content.json": hash("{}") },
    };
    expect(
      verifyArtifactDocuments(
        binding,
        Buffer.from(JSON.stringify(changed)),
        Buffer.from(index),
      ),
    ).toBe(false);
  });

  it("refuses a script loaded from outside the pinned artifact", () => {
    const { binding, manifest } = artifact();
    const index = `<script src="face.js" integrity="${sriFromFileHash(manifest.files["face.js"])}"></script><link rel="stylesheet" href="face.css" integrity="${sriFromFileHash(manifest.files["face.css"])}"><script src="https://cdn.example/x.js"></script>`;
    const files = { ...manifest.files, "index.html": hash(index) };
    const rebound = parseProductFaceApplications(
      JSON.stringify([
        bindingInput({
          artifactHash: artifactHashFromFiles(files),
          path: `/face/tig.passport.morrow-home/1.0.0/${artifactHashFromFiles(files).slice(7)}/`,
        }),
      ]),
      { production: true },
    )[0];
    expect(
      verifyArtifactDocuments(
        rebound,
        Buffer.from(JSON.stringify({ ...manifest, files })),
        Buffer.from(index),
      ),
    ).toBe(false);
    expect(binding).toBeDefined();
  });

  it("fetches the pinned documents without credentials and refuses a mismatch", async () => {
    resetFaceArtifactCache();
    const { binding, index, manifest } = artifact();
    const fetchMock = jest.fn(async (url: string, init: RequestInit) => {
      expect(init.credentials).toBe("omit");
      expect(init.redirect).toBe("error");
      return new Response(
        url.endsWith("manifest.json")
          ? JSON.stringify(manifest)
          : index.replace("face.css", "./face.css") + "<!-- changed -->",
        { status: 200 },
      );
    });
    const original = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;
    try {
      await expect(verifyFaceArtifact(binding)).resolves.toEqual({
        ok: false,
        reason: "artifact_mismatch",
      });
      expect(fetchMock.mock.calls.map(([url]) => url).sort()).toEqual([
        `${binding.origin}${binding.path}index.html`,
        `${binding.origin}${binding.path}manifest.json`,
      ]);
    } finally {
      global.fetch = original;
    }
  });
});
