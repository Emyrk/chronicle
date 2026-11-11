// Loaded as a blob module so the dedicated worker inherits the document's COEP.
// No stream data or application workers participate in this compatibility probe.
self.onmessage = ({ data }) => {
  try {
    if (!(data instanceof SharedArrayBuffer) || data.byteLength !== 4) {
      throw new Error("Expected a four-byte SharedArrayBuffer");
    }
    const view = new Int32Array(data);
    if (Atomics.load(view, 0) !== 41) throw new Error("Unexpected initial value");
    Atomics.add(view, 0, 1);
    self.postMessage({ type: "result", isolated: self.crossOriginIsolated });
  } catch (error) {
    self.postMessage({ type: "error", message: String(error) });
  }
};
