declare global {
  interface Window {
    dataLayer: unknown[][];
  }
}

export {};

const googleAnalyticsMeasurementID = "G-G0Q1B9GRC0";

window.dataLayer = window.dataLayer || [];

function gtag(...args: unknown[]) {
  window.dataLayer.push(args);
}

gtag("js", new Date());

const query = new URLSearchParams(window.location.search);
const chronicleAttribution: Record<string, string> = {};
for (const parameter of ["chr_src", "chr_pos", "chr_cmp"]) {
  const value = query.get(parameter);
  if (value) {
    chronicleAttribution[parameter] = value;
  }
}

gtag("config", googleAnalyticsMeasurementID, chronicleAttribution);

const script = document.createElement("script");
script.async = true;
script.src = `https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsMeasurementID}`;
document.head.append(script);
