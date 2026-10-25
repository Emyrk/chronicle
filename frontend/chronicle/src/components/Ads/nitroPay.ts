export type NitroPaySize = [width: number, height: number]

export interface NitroPayAd {
  onNavigate: () => void
}

interface NitroPayRenderedAdInfo {
  adUnitCode?: string
  bidder?: string
  creativeId?: string
  cpm?: number
}

interface NitroPayRenderedEvent extends Event {
  adInfo?: NitroPayRenderedAdInfo
  detail?: {
    adInfo?: NitroPayRenderedAdInfo
  }
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
  demo?: boolean
  outstream: "never"
  refreshLimit: number
  refreshTime: number
  renderVisibleOnly: boolean
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

export function configureNitroPayScript(script: HTMLScriptElement, siteID: string) {
  script.async = true
  script.dataset.cfasync = "false"
  // NitroPay defaults to info-level production logging even without its debug query parameter.
  script.dataset.logLevel = "silent"
  script.src = `https://s.nitropay.com/ads-${siteID}.js`
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
    configureNitroPayScript(script, siteID)
    script.addEventListener("load", () => resolve(), { once: true })
    script.addEventListener("error", () => reject(new Error("Failed to load NitroPay")), {
      once: true,
    })
    document.head.append(script)
  })

  return scriptPromise
}

export function nitroPayAdOptions(sizes: NitroPaySize[], demo = false): NitroPayAdOptions {
  return {
    ...(demo && { demo: true }),
    // NitroPay enables outstream video automatically unless a placement opts out.
    outstream: "never",
    refreshLimit: 10,
    refreshTime: 30,
    // Do not start bidder and creative work for placements that are still offscreen.
    renderVisibleOnly: true,
    report: {
      enabled: true,
      icon: true,
      wording: "Report Ad",
    },
    sizes,
  }
}

export function nitroPayReportNeedsFrameGuard(tagName: string | undefined, source: string | undefined) {
  return tagName?.toLowerCase() === "iframe" && !source?.startsWith("http") && !source?.startsWith("//")
}

export function guardNitroPayReportFrameAccess(holder: HTMLElement, eventTarget: EventTarget | null) {
  if (!(eventTarget instanceof Element) || !eventTarget.closest(".report-link")) return

  const creative = holder.firstElementChild as HTMLIFrameElement | null
  if (!nitroPayReportNeedsFrameGuard(creative?.tagName, creative?.src)) return

  // NitroPay reads the document of a direct, non-URL iframe while opening its
  // report form. Chrome throws when a failed creative has become chrome-error.
  // A layout-neutral first child makes the reporter submit the slot markup
  // instead of dereferencing the failed iframe document.
  const guard = document.createElement("template")
  guard.dataset.nitroPayReportGuard = ""
  holder.prepend(guard)
}

export type NitroPayRenderedEventResult = "filled" | "no_fill" | "unrelated"

export function classifyNitroPayRenderedEvent(event: Event, id: string): NitroPayRenderedEventResult {
  const renderedEvent = event as NitroPayRenderedEvent
  const adInfo = renderedEvent.adInfo ?? renderedEvent.detail?.adInfo

  if (adInfo?.adUnitCode !== id || !adInfo.bidder) return "unrelated"

  // NitroPay emits `nitroAds.rendered` for its no-bid fallback too. Matching
  // bidder="blank" events confirm that this request has no creative.
  return adInfo.bidder === "blank" ? "no_fill" : "filled"
}

export function isNitroPayRenderedEventForPlacement(event: Event, id: string): boolean {
  return classifyNitroPayRenderedEvent(event, id) === "filled"
}

export function isNitroPayContainerCurrent(
  container: HTMLElement,
  signal: AbortSignal,
  currentContainer: HTMLElement | null = document.getElementById(container.id),
): boolean {
  return !signal.aborted && container.isConnected && currentContainer === container
}

export async function requestNitroPayAd(
  siteID: string,
  id: string,
  sizes: NitroPaySize[],
  demo: boolean,
  container: HTMLElement,
  signal: AbortSignal,
): Promise<NitroPayAd[]> {
  await loadNitroPay(siteID)
  if (!isNitroPayContainerCurrent(container, signal)) return []

  const result = await Promise.resolve(
    window.nitroAds?.createAd(id, nitroPayAdOptions(sizes, demo)) ?? null,
  )

  if (!result) return []
  return Array.isArray(result) ? result : [result]
}

export function clearNitroPayAds(ads: NitroPayAd[]) {
  ads.forEach((ad) => ad.onNavigate())
}
