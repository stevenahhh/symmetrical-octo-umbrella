import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("default entry remains Legacy without requiring the VWorld SDK", async () => {
  const [html, appModule] = await Promise.all([
    readFile(new URL("../../index.html", import.meta.url), "utf8"),
    readFile(new URL("../App.jsx", import.meta.url), "utf8"),
  ]);

  assert.match(html, /src="\/src\/index\.jsx"/);
  assert.doesNotMatch(html, /map\.vworld\.kr|VITE_VWORLD_API_KEY/);
  assert.match(appModule, /from ["']\.\/AppLegacy["']/);
  assert.doesNotMatch(appModule, /AppVWorld/);
});

test("separate VWorld entry bootstraps the SDK before its React app", async () => {
  const html = await readFile(new URL("../../index-vworld.html", import.meta.url), "utf8");
  const sdk = html.indexOf("https://map.vworld.kr/js/webglMapInit.js.do");
  const app = html.indexOf('src="/src/index-vworld.jsx"');

  assert(sdk >= 0, "VWorld index must load the VWorld WebGL SDK");
  assert(app > sdk, "VWorld SDK must load before the VWorld React app entry");
  assert.match(html, /apiKey=%VITE_VWORLD_API_KEY%/);
});
