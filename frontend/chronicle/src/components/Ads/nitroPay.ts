export type NitroPaySize = [width: number, height: number]

export interface NitroPayAd {
  onNavigate: () => void
}

type NitroPayAdResult = NitroPayAd | NitroPayAd[] | null
type NitroPayCreateAdReturn = NitroPayAdResult | Promise<NitroPayAdResult>
type NitroPayCreateAdArgs = [id: string, options: NitroPayAdOptions]
type NitroPayQueueEntry = [
  method: "createAd",
  args: NitroPayCreateAdArgs,
  resolve: (value: NitroPayAdResult) => void,
]

interface NitroPayAPI {
  queue: NitroPayQueueEntry[]
  createAd: (id: string, options: NitroPayAdOptions) => NitroPayCreateAdReturn
}

interface NitroPayAdOptions {
  refreshLimit: number
  refreshTime: number
  report: {
    enabled: boolean
    icon: boolean
    wording: string
  }
  sizes: NitroPaySize[]
}

declare global {
  interface Window {
    nitroAds?: NitroPayAPI
  }
}

let scriptPromise: Promise<void> | undefined
let configuredSiteID: string | undefined

function installQueueStub() {
  if (window.nitroAds) return

  window.nitroAds = {
    queue: [],
    createAd(...args) {
      return new Promise((resolve) => {
        window.nitroAds?.queue.push(["createAd", args, resolve])
      })
    },
  }
}

export function loadNitroPay(siteID: string): Promise<void> {
  if (scriptPromise) {
    if (configuredSiteID !== siteID) {
      return Promise.reject(new Error("NitroPay is already configured with a different site ID"))
    }
    return scriptPromise
  }

  configuredSiteID = siteID
  installQueueStub()

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.async = true
    script.dataset.cfasync = "false"
    script.src = `https://s.nitropay.com/ads-${siteID}.js`
    script.addEventListener("load", () => resolve(), { once: true })
    script.addEventListener("error", () => reject(new Error("Failed to load NitroPay")), {
      once: true,
    })
    document.head.append(script)
  })

  return scriptPromise
}

export async function requestNitroPayAd(
  siteID: string,
  id: string,
  sizes: NitroPaySize[],
): Promise<NitroPayAd[]> {
  await loadNitroPay(siteID)
  const result = await Promise.resolve(
    window.nitroAds?.createAd(id, {
      refreshLimit: 10,
      refreshTime: 30,
      report: {
        enabled: true,
        icon: true,
        wording: "Report Ad",
      },
      sizes,
    }) ?? null,
  )

  if (!result) return []
  return Array.isArray(result) ? result : [result]
}

export function clearNitroPayAds(ads: NitroPayAd[]) {
  ads.forEach((ad) => ad.onNavigate())
}
