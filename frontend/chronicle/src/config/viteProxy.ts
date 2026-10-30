export interface LocalProxyHeaders {
  host: string;
  origin?: string;
}

export function localProxyHeaders(
  frontendHost: string,
  frontendOrigin: string | undefined,
  backendProtocol: string,
  websocket = false,
): LocalProxyHeaders {
  const backendHost = frontendHost.replace(/:\d+$/, ":4000");
  let origin: string | undefined;

  if (frontendOrigin) {
    try {
      const parsedOrigin = new URL(frontendOrigin);
      if (parsedOrigin.host === frontendHost) {
        origin = `${parsedOrigin.protocol}//${backendHost}`;
      }
    } catch {
      // Leave malformed origins unchanged so the backend rejects them.
    }
  } else if (websocket) {
    origin = `${backendProtocol}//${backendHost}`;
  }

  return { host: backendHost, origin };
}
