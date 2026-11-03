(() => {
  const logIDsByJobID = new Map();
  const outputsByJobID = new Map();
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

  const addOutputCopyButton = () => {
    const match = window.location.pathname.match(/\/river\/jobs\/(\d+)\/?$/);
    const existingButton = document.querySelector(".chronicle-output-copy");
    if (!match || !outputsByJobID.has(match[1])) {
      existingButton?.remove();
      return;
    }

    if (existingButton) {
      existingButton.dataset.jobID = match[1];
      return;
    }

    const metadataHeading = Array.from(document.querySelectorAll("dt")).find(
      (element) => element.firstChild?.textContent?.trim() === "Metadata",
    );
    if (!metadataHeading) return;

    metadataHeading.style.display = "flex";
    metadataHeading.style.alignItems = "center";
    metadataHeading.style.justifyContent = "space-between";
    metadataHeading.style.gap = "0.5rem";

    const copyButton = document.createElement("button");
    copyButton.className = "chronicle-output-copy";
    copyButton.dataset.jobID = match[1];
    copyButton.type = "button";
    copyButton.textContent = "Copy output";
    copyButton.setAttribute("aria-label", "Copy job output as JSON");
    copyButton.title = "Copy job output as formatted JSON";
    copyButton.style.cssText = [
      "border: 1px solid rgb(148 163 184 / 0.5)",
      "border-radius: 0.375rem",
      "cursor: pointer",
      "font-size: 0.75rem",
      "font-weight: 600",
      "line-height: 1rem",
      "padding: 0.25rem 0.5rem",
      "white-space: nowrap",
    ].join(";");
    copyButton.addEventListener("click", async () => {
      const output = outputsByJobID.get(copyButton.dataset.jobID);
      const formattedOutput = JSON.stringify(output, null, 2);
      try {
        await navigator.clipboard.writeText(formattedOutput);
        copyButton.textContent = "Copied!";
        window.setTimeout(() => {
          if (copyButton.isConnected) copyButton.textContent = "Copy output";
        }, 2000);
      } catch (error) {
        console.error("Failed to copy River job output", error);
      }
    });

    metadataHeading.append(copyButton);
  };

  const updateCustomizations = () => {
    addLogLinks();
    addOutputCopyButton();
  };

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);

    try {
      const input = args[0];
      const requestURL = new URL(
        typeof input === "string" || input instanceof URL ? input : input.url,
        window.location.href,
      );
      if (!response.ok) return response;

      if (requestURL.pathname === jobsAPIPath) {
        const payload = await response.clone().json();
        for (const job of payload.data || []) {
          const logID = job.args?.log_group_id;
          if (typeof logID === "string" && logID) {
            logIDsByJobID.set(String(job.id), logID);
          }
        }
      } else if (requestURL.pathname.startsWith(`${jobsAPIPath}/`)) {
        const jobID = requestURL.pathname.slice(jobsAPIPath.length + 1);
        if (/^\d+$/.test(jobID)) {
          const job = await response.clone().json();
          if (Object.prototype.hasOwnProperty.call(job.metadata || {}, "output")) {
            outputsByJobID.set(jobID, job.metadata.output);
          } else {
            outputsByJobID.delete(jobID);
          }
        }
      }
      updateCustomizations();
    } catch {
      // River should continue working even if its response shape changes.
    }

    return response;
  };

  new MutationObserver(updateCustomizations).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
