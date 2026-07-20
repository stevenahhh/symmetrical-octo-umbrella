export function loadVWorldWebGlSdk(apiKey) {
  if (!apiKey?.trim()) {
    return Promise.reject(new Error("A VWorld browser API key is required."));
  }

  const vworldSdk = globalThis.window?.vw;
  if (!vworldSdk) {
    return Promise.reject(
      new Error("VWorld WebGL v3 SDK is unavailable after bootstrap."),
    );
  }

  return Promise.resolve(vworldSdk);
}
