(() => {
  const logIDsByJobID = new Map();
  const originalFetch = window.fetch.bind(window);
  const config = JSON.parse(
    document.querySelector("script#config__json")?.textContent || "{}",
  );
  const jobsAPIPath = new URL(
    `${config.apiUrl || "/river/api"}/jobs`,
    window.location.href,
  ).pathname;

  const addLogLinks = () => {
    document.querySelectorAll("li a[href]").forEach((jobLink) => {
      const jobURL = new URL(jobLink.href, window.location.href);
      const match = jobURL.pathname.match(/\/jobs\/(\d+)$/);
      if (!match) return;

      const logID = logIDsByJobID.get(match[1]);
      const row = jobLink.closest("li");
      if (!logID || !row || row.querySelector(".chronicle-log-link")) return;

      const heading = jobLink.closest("h2");
      if (!heading) return;

      const logLink = document.createElement("a");
      logLink.className = "chronicle-log-link";
      logLink.href = `/logs/${encodeURIComponent(logID)}`;
      logLink.target = "_blank";
      logLink.rel = "noopener noreferrer";
      logLink.textContent = "View log";
      logLink.setAttribute("aria-label", `View log ${logID}`);
      logLink.style.cssText = [
        "border: 1px solid rgb(148 163 184 / 0.5)",
        "border-radius: 0.375rem",
        "font-size: 0.75rem",
        "font-weight: 600",
        "line-height: 1rem",
        "padding: 0.25rem 0.5rem",
        "white-space: nowrap",
      ].join(";");

      heading.insertAdjacentElement("afterend", logLink);
    });
  };

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);

    try {
      const input = args[0];
      const requestURL = new URL(
        typeof input === "string" || input instanceof URL ? input : input.url,
        window.location.href,
      );
      if (requestURL.pathname !== jobsAPIPath || !response.ok) return response;

      const payload = await response.clone().json();
      for (const job of payload.data || []) {
        const logID = job.args?.log_group_id;
        if (typeof logID === "string" && logID) {
          logIDsByJobID.set(String(job.id), logID);
        }
      }
      addLogLinks();
    } catch {
      // River should continue working even if its response shape changes.
    }

    return response;
  };

  new MutationObserver(addLogLinks).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
