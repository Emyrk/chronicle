import { useEffect } from "react";

interface NitroPayAPI {
  createAd: (id: string, options: NitroPayAdOptions) => unknown | Promise<unknown>;
  queue: unknown[];
}

interface NitroPayAdOptions {
  refreshLimit: number;
  refreshTime: number;
  report: {
    enabled: boolean;
    icon: boolean;
    wording: string;
  };
  sizes: Array<[number, number]>;
}

declare global {
  interface Window {
    nitroAds?: NitroPayAPI;
  }
}

const siteID = import.meta.env.CHRONICLE_NITROPAY_SITE_ID;

export function NitroAd() {
  const id = "nitropay-landing-supported-servers";

  useEffect(() => {
    if (!siteID) return;

    void Promise.resolve(
      window.nitroAds?.createAd(id, {
        refreshLimit: 10,
        refreshTime: 30,
        report: {
          enabled: true,
          icon: true,
          wording: "Report Ad",
        },
        sizes: [
          [728, 90],
          [970, 90],
          [970, 250],
          [300, 250],
        ],
      }),
    ).catch((error: unknown) => console.error("Unable to load NitroPay landing ad", error));
  }, []);

  if (!siteID) return null;

  return (
    <aside
      className="relative mb-12 hidden w-full lg:block"
      aria-label="Advertisement"
      data-ad-placement="landing-supported-servers"
      data-ad-provider="nitropay"
    >
      <div id={id} />
    </aside>
  );
}
