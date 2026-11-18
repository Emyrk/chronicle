export type DeveloperApp = {
  id: string
  client_id: string
  name: string
}

type DeveloperAppWithSecret = DeveloperApp & { client_secret: string }

const APP_URL = "/oauth/apps"

async function checkResponse(response: Response): Promise<void> {
  if (response.ok) return
  const error = await response.json().catch(() => null) as { error?: string } | null
  throw new Error(error?.error ?? `Request failed (${response.status})`)
}

export async function getDeveloperApp(): Promise<DeveloperApp | null> {
  const response = await fetch(APP_URL, { cache: "no-store" })
  await checkResponse(response)
  const data = await response.json() as { app: DeveloperApp | null }
  return data.app
}

export async function createDeveloperApp(name: string): Promise<DeveloperAppWithSecret> {
  const response = await fetch(APP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  })
  await checkResponse(response)
  return response.json() as Promise<DeveloperAppWithSecret>
}

export async function rotateDeveloperSecret(): Promise<DeveloperAppWithSecret> {
  const response = await fetch(`${APP_URL}/rotate`, { method: "POST" })
  await checkResponse(response)
  return response.json() as Promise<DeveloperAppWithSecret>
}

export async function deleteDeveloperApp(): Promise<void> {
  const response = await fetch(APP_URL, { method: "DELETE" })
  await checkResponse(response)
}
