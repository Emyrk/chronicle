type Tokens = { access_token: string; refresh_token: string; expires_in: number; token_type: string }

// This object belongs to one mounted explorer. Never persist tokens or put them
// in React Query keys, mutation results, generated examples, or browser storage.
export class ExplorerOAuthSession {
  private tokens: Tokens | null = null
  private expiresAt = 0
  private refresh: Promise<void> | null = null
  private controller = new AbortController()

  async connect(clientID: string, secret: string): Promise<void> {
    await this.exchange(new URLSearchParams({
      grant_type: "client_credentials", client_id: clientID, client_secret: secret, scope: "external:read",
    }))
  }

  disconnect(): void {
    this.controller.abort()
    this.tokens = null
    this.expiresAt = 0
  }

  private async exchange(form: URLSearchParams): Promise<void> {
    const response = await fetch("/oauth/token", {
      method: "POST", body: form, credentials: "omit", cache: "no-store",
      redirect: "error", signal: this.controller.signal,
    })
    // Do not surface token endpoint payloads: they can contain credentials.
    if (!response.ok) throw new Error(`App authentication failed (${response.status}). Check your credentials or reconnect.`)
    const data = await response.json() as Tokens
    if (!data.access_token || !data.refresh_token || !Number.isFinite(data.expires_in) || data.expires_in <= 0 || data.token_type?.toLowerCase() !== "bearer") {
      throw new Error("The token endpoint returned an invalid response.")
    }
    this.controller.signal.throwIfAborted()
    this.tokens = data
    this.expiresAt = Date.now() + data.expires_in * 1000
  }

  async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    const target = new URL(url, window.location.origin)
    if (target.origin !== window.location.origin || !target.pathname.startsWith("/api/external/v1/")) {
      throw new Error("App credentials can only be used with Chronicle's external API.")
    }
    if (!this.tokens || this.controller.signal.aborted) throw new Error("App disconnected. Authenticate again to continue.")
    if (Date.now() >= this.expiresAt - 30_000) {
      if (!this.refresh) {
        this.refresh = this.exchange(new URLSearchParams({ grant_type: "refresh_token", refresh_token: this.tokens.refresh_token }))
          .catch(() => {
            this.disconnect()
            throw new Error("App session could not be refreshed. Disconnect and authenticate again.")
          })
          .finally(() => { this.refresh = null })
      }
      await this.refresh
    }
    this.controller.signal.throwIfAborted()
    const headers = new Headers(init.headers)
    headers.set("Authorization", `Bearer ${this.tokens!.access_token}`)
    return fetch(target.href, {
      ...init, headers, credentials: "omit", cache: "no-store", redirect: "error", signal: this.controller.signal,
    })
  }
}

export type ExplorerFetch = (url: string, init?: RequestInit) => Promise<Response>
