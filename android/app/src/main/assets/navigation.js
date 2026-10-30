// Locate existing Instagram controls. Kotlin sends a tap to the same WebView;
// this script never navigates to a post URL or creates a replacement link.
(() => {
  const wanted = __REQUEST__;
  const visible = (el) =>
    !!el &&
    !!el.getClientRects().length &&
    !el.closest('[aria-hidden="true"]') &&
    getComputedStyle(el).visibility !== "hidden";
  const codeOf = (href) => {
    try {
      const url = new URL(href, location.origin);
      return ["www.instagram.com", "instagram.com"].includes(url.hostname)
        ? url.pathname.match(
            /^\/(?:[A-Za-z0-9._]{1,30}\/)?(?:p|reel)\/([A-Za-z0-9_-]{5,64})\/?$/,
          )?.[1]
        : undefined;
    } catch {
      return undefined;
    }
  };
  const dialogs = [
    ...document.querySelectorAll('[role="dialog"],[aria-modal="true"]'),
  ].filter(visible);
  const postDialog = dialogs.find((el) =>
    el.querySelector("article,time[datetime]"),
  );
  const here = codeOf(location.href);
  const onProfile =
    ["www.instagram.com", "instagram.com"].includes(location.hostname) &&
    location.pathname.replace(/^\/+|\/+$/g, "").toLowerCase() ===
      `${wanted.username.toLowerCase()}${wanted.grid === "reels" ? "/reels" : ""}` &&
    !postDialog;
  const opened =
    !!wanted.shortcode &&
    (here === wanted.shortcode ||
      dialogs.some((el) =>
        [...el.querySelectorAll("time[datetime]")].some(
          (time) => codeOf(time.closest("a[href]")?.href) === wanted.shortcode,
        ),
      ));
  const links = [
    ...document.querySelectorAll("main a[href],article a[href]"),
  ].filter(
    (a) =>
      visible(a) &&
      !a.closest('[role="dialog"],[aria-modal="true"]') &&
      codeOf(a.href),
  );
  const point = (el) => {
    if (!visible(el)) return { state: "missing" };
    const rect = el.getBoundingClientRect();
    if (
      rect.bottom <= 4 ||
      rect.top >= innerHeight - 4 ||
      rect.right <= 4 ||
      rect.left >= innerWidth - 4
    ) {
      el.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: "instant",
      });
      return { state: "positioning" };
    }
    const x =
      (Math.max(1, rect.left) + Math.min(innerWidth - 1, rect.right)) / 2;
    const y =
      (Math.max(1, rect.top) + Math.min(innerHeight - 1, rect.bottom)) / 2;
    const hit = document.elementFromPoint(x, y);
    if (!hit || !el.contains(hit)) return { state: "obscured" };
    return { state: "tap", x: x / innerWidth, y: y / innerHeight, scrollY };
  };
  if (wanted.mode === "inspect")
    return JSON.stringify({ state: "ready", onProfile, opened, scrollY });
  if (wanted.mode === "close") {
    if (!here && !postDialog) return JSON.stringify({ state: "missing" });
    const scope = postDialog || document;
    const controls = [
      ...scope.querySelectorAll(
        'button,[role="button"],a[aria-label],svg[aria-label]',
      ),
    ];
    // Instagram sometimes places its modal close control just outside role=dialog.
    if (postDialog)
      controls.push(
        ...document.querySelectorAll(
          'button[aria-label],[role="button"][aria-label],svg[aria-label]',
        ),
      );
    const control = controls.find((el) => {
      const label =
        el.getAttribute("aria-label") ||
        el.querySelector("svg[aria-label]")?.getAttribute("aria-label") ||
        el.textContent.trim();
      return (
        visible(el) &&
        /^(close|back|закрыть|назад|bağla|geri|kapat)$/i.test(label)
      );
    });
    return JSON.stringify(
      point(control?.closest('button,[role="button"],a') || control),
    );
  }
  if (!onProfile) return JSON.stringify({ state: "wrong_context" });
  if (wanted.mode === "locate") {
    const link = links.find((a) => codeOf(a.href) === wanted.shortcode);
    return JSON.stringify(
      link
        ? { ...point(link), href: link.href }
        : {
            state: "missing",
            codes: [
              ...new Set(
                links
                  .filter((a) => {
                    const r = a.getBoundingClientRect();
                    return r.bottom > 0 && r.top < innerHeight;
                  })
                  .map((a) => codeOf(a.href)),
              ),
            ],
            scrollY,
          },
    );
  }
  if (wanted.mode === "restore") {
    window.scrollTo({
      top: Math.max(0, Number(wanted.scrollY) || 0),
      behavior: "instant",
    });
    return JSON.stringify({ state: "ready" });
  }
  if (wanted.mode === "scroll") {
    window.scrollBy({
      top:
        Math.max(240, innerHeight * 0.8) * (wanted.direction === "up" ? -1 : 1),
      behavior: "instant",
    });
    return JSON.stringify({ state: "ready", scrollY });
  }
  return JSON.stringify({ state: "missing" });
})();
