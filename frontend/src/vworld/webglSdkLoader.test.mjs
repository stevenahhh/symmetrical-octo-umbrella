import assert from "node:assert/strict";
import test from "node:test";

let loaderModuleVersion = 0;

function importFreshVWorldSdkLoader() {
  loaderModuleVersion += 1;
  return import(`./webglSdkLoader.mjs?test=${loaderModuleVersion}`);
}

test("loads VWorld only from the parsing-time bootstrap", async (context) => {
  const hadWindow = "window" in globalThis;
  const initialWindow = globalThis.window;
  const hadDocument = "document" in globalThis;
  const initialDocument = globalThis.document;

  try {
    await context.test("rejects when the caller key is missing", async () => {
      const { loadVWorldWebGlSdk } = await importFreshVWorldSdkLoader();

      await assert.rejects(
        loadVWorldWebGlSdk(""),
        { message: "A VWorld browser API key is required." },
      );
    });

    await context.test("rejects when the SDK is absent after bootstrap", async () => {
      globalThis.window = { location: { host: "localhost:5173" } };
      delete globalThis.document;

      const { loadVWorldWebGlSdk } = await importFreshVWorldSdkLoader();

      await assert.rejects(
        loadVWorldWebGlSdk("test-browser-key"),
        { message: "VWorld WebGL v3 SDK is unavailable after bootstrap." },
      );
    });

    await context.test("returns the SDK that was bootstrapped during parsing", async () => {
      const bootstrappedSdk = Object.freeze({});
      globalThis.window = { vw: bootstrappedSdk };

      const { loadVWorldWebGlSdk } = await importFreshVWorldSdkLoader();

      assert.equal(
        await loadVWorldWebGlSdk("test-browser-key"),
        bootstrappedSdk,
      );
    });
  } finally {
    if (hadWindow) {
      globalThis.window = initialWindow;
    } else {
      delete globalThis.window;
    }

    if (hadDocument) {
      globalThis.document = initialDocument;
    } else {
      delete globalThis.document;
    }
  }
});
