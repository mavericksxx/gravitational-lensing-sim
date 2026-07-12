/**
 * WebLLM requires WebGPU to run inference client-side. Checking for
 * `navigator.gpu` is a cheap, synchronous proxy for "can this browser run
 * WebLLM at all" — it doesn't guarantee a successful adapter/device
 * request (that can still fail on a WebGPU-flagged-but-broken driver),
 * but it's enough to decide up front whether to offer language input or
 * show the quiet degradation note instead of attempting a doomed
 * multi-hundred-MB download.
 */
export function isWebGPUSupported(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator && navigator.gpu != null;
}
