// Read public post data from the rendered document only. No private API requests,
// credential access, network interception, or bypass of Instagram's login gates.
(() => {
  const wanted = __REQUEST__;
  const user = wanted.username.toLowerCase();
  const visible = (el) =>
    !!el &&
    !el.closest('[aria-hidden="true"]') &&
    getComputedStyle(el).visibility !== "hidden" &&
    !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const text = document.body?.innerText || "";
  const path = location.pathname;
  const privateNotice =
    /this account is private|this profile is private|этот аккаунт закрыт|закрытый аккаунт|bu hesap gizli|bu hesab məxfidir/i.test(
      text,
    );
  const headings = [...document.querySelectorAll('h1,h2,h3,[role="heading"]')]
    .filter(visible)
    .map((e) => e.textContent.trim());
  if (
    headings.some((heading) =>
      /^(?:429[\s:–-]*)?(?:too many requests|try again later|please wait a few minutes before you try again|попробуйте.*позже|слишком много запросов|tekrar dene|daha sonra tekrar dene)[.!]?$/i.test(
        heading,
      ),
    )
  )
    return JSON.stringify({
      state: "throttled",
      message: "Instagram müvəqqəti fasilə tələb edir.",
    });
  if (
    /^chrome-error:/.test(location.protocol) ||
    (!document.querySelector("article") && /net::ERR_[A-Z_]+/.test(text))
  )
    return JSON.stringify({
      state: "navigation_error",
      message: "Instagram səhifəsi WebView-də açılmadı. Post ötürülmədi.",
    });
  const errorHeading = headings.some((heading) =>
    /^(confirm it.s you|help us confirm|suspicious activity|подтвердите.*личность)$/i.test(
      heading,
    ),
  );
  const loginDialog = [
    ...document.querySelectorAll('[role="dialog"],[aria-modal="true"]'),
  ].some(
    (el) =>
      visible(el) &&
      !el.querySelector("article,time[datetime]") &&
      /sign up or log in|log in to (?:see|view)|(?:войдите|зарегистрируйтесь).*(?:посмотреть|публикаци|профил)|(?:посмотреть|увидеть).*(?:войдите|зарегистрируйтесь)|giriş.*(?:baxmaq|görmək)|görmek.*giriş/is.test(
        el.innerText,
      ),
  );
  if (
    /\/accounts\/(login|suspended)|\/challenge|\/checkpoint/.test(path) ||
    (!!document.querySelector('input[name="password"]') &&
      !document.querySelector("article")) ||
    errorHeading ||
    loginDialog
  )
    return JSON.stringify({
      state: "blocked",
      message: "Instagram giriş və ya təhlükəsizlik yoxlaması tələb edir.",
    });
  if (privateNotice)
    return JSON.stringify({
      state: "private",
      message: "Məxfi profil toplanmır.",
    });
  if (
    /sorry, this page isn.t available|page isn.t available|страница недоступна|bu sayfaya ulaşılamıyor/i.test(
      text,
    )
  )
    return JSON.stringify({ state: "unavailable" });

  // Cache parsed script nodes while this document is alive. Scrolling doesn't reparse megabytes of JSON.
  const cache =
    window.__postarxivScripts || (window.__postarxivScripts = new WeakMap());
  const objects = [];
  let budget = 60000;
  for (const script of document.querySelectorAll(
    'script[type="application/json"],script[type="application/ld+json"]',
  )) {
    let entry = cache.get(script);
    const source = script.textContent;
    if (!entry || entry.source !== source) {
      const found = [];
      let count = 60000;
      const walk = (value, depth = 0) => {
        if (!value || typeof value !== "object" || depth > 45 || count-- <= 0)
          return;
        if (!Array.isArray(value)) found.push(value);
        for (const child of Object.values(value))
          if (child && typeof child === "object") walk(child, depth + 1);
      };
      try {
        walk(JSON.parse(source));
      } catch {}
      entry = { source, objects: found };
      cache.set(script, entry);
    }
    for (const o of entry.objects) {
      if (budget-- <= 0) break;
      objects.push(o);
    }
    if (budget <= 0) break;
  }
  const profiles = objects.filter(
    (o) => String(o.username || "").toLowerCase() === user,
  );
  if (profiles.some((o) => o.is_private === true))
    return JSON.stringify({ state: "private" });
  const ids = new Set(
    profiles.flatMap((o) => [o.pk, o.id].filter((v) => v != null).map(String)),
  );
  const username = (value) =>
    typeof value === "string" && /^[A-Za-z0-9._]{1,30}$/.test(value)
      ? value.toLowerCase()
      : undefined;
  const hasRequestedTime = (el) =>
    [...el.querySelectorAll("time[datetime]")].some((time) => {
      try {
        const url = new URL(
          time.closest("a[href]")?.href || "",
          location.origin,
        );
        return (
          ["www.instagram.com", "instagram.com"].includes(url.hostname) &&
          !url.searchParams.has("comment_id") &&
          url.pathname.match(
            /^\/(?:[A-Za-z0-9._]{1,30}\/)?(?:p|reel)\/([A-Za-z0-9_-]+)\/?$/,
          )?.[1] === wanted.shortcode
        );
      } catch {
        return false;
      }
    });
  const hereCode = path.match(
    /^\/(?:[A-Za-z0-9._]{1,30}\/)?(?:p|reel)\/([A-Za-z0-9_-]+)(?:\/|$)/,
  )?.[1];
  const dialogs = [
    ...document.querySelectorAll('[role="dialog"],[aria-modal="true"]'),
  ].filter(visible);
  const postDialog = [...dialogs]
    .reverse()
    .find(
      (el) =>
        hasRequestedTime(el) ||
        (hereCode === wanted.shortcode && el.querySelector("article")),
    );
  const articles = [...document.querySelectorAll("article")].filter(visible);
  const main = document.querySelector("main");
  // In-page posts sit above the still-mounted profile grid. Never read the grid's heading as a caption.
  const article =
    wanted.mode === "post"
      ? postDialog?.querySelector("article") ||
        postDialog ||
        articles.find(hasRequestedTime) ||
        (hereCode === wanted.shortcode &&
        articles.length === 1 &&
        articles[0].querySelector("time[datetime]")
          ? articles[0]
          : null) ||
        (main && hereCode === wanted.shortcode && hasRequestedTime(main)
          ? main
          : null)
      : articles[0] || main;
  const heading = [...(article?.querySelectorAll("h1") || [])].find(visible);
  const captionBlock =
    heading?.closest("li") || heading?.parentElement?.parentElement;
  const profileName = (a) => {
    try {
      const url = new URL(a.href);
      const name = username(
        url.pathname.match(/^\/([A-Za-z0-9._]{1,30})\/?$/)?.[1],
      );
      return ["www.instagram.com", "instagram.com"].includes(url.hostname) &&
        name === a.textContent.trim().replace(/^@/, "").toLowerCase()
        ? name
        : undefined;
    } catch {
      return undefined;
    }
  };
  // Only authors in the post header count as collaborators. Caption mentions and tags do not.
  const header =
    article?.querySelector("header") ||
    [...(article?.querySelectorAll("h2") || [])].find(
      (el) =>
        !el.closest('li,ul,[role="list"]') &&
        (!heading ||
          Boolean(
            el.compareDocumentPosition(heading) &
            Node.DOCUMENT_POSITION_FOLLOWING,
          )) &&
        [...el.querySelectorAll("a[href]")].some(profileName),
    );
  const headerAuthors = [
    ...new Set(
      [...(header?.querySelectorAll("a[href]") || [])]
        .filter(visible)
        .map(profileName)
        .filter(Boolean),
    ),
  ].slice(0, 100);
  const captionAuthor = [
    ...(captionBlock?.querySelectorAll("a[href]") || []),
  ].find(
    (a) =>
      !heading?.contains(a) &&
      Boolean(
        a.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
      ) &&
      profileName(a),
  );
  const domAuthors = headerAuthors.length
    ? headerAuthors
    : captionAuthor
      ? [profileName(captionAuthor)]
      : [];
  const participants = (o) => {
    const owner = o.owner || o.user;
    const author =
      username(owner?.username) ||
      (owner && ids.has(String(owner.pk ?? owner.id)) ? user : undefined);
    const collaborators = [
      ...new Set(
        (Array.isArray(o.coauthor_producers) ? o.coauthor_producers : [])
          .map((v) => username(v.username || v.user?.username))
          .filter(Boolean),
      ),
    ].slice(0, 100);
    // A rendered header can verify a collab when the embedded record omits its coauthors.
    if (
      wanted.mode === "post" &&
      (o.shortcode || o.code) === wanted.shortcode &&
      domAuthors.includes(user) &&
      domAuthors.includes(author)
    )
      collaborators.push(...domAuthors.filter((name) => name !== author));
    return {
      author,
      collaborators: [...new Set(collaborators)].filter(
        (name) => name !== author,
      ),
    };
  };
  const canonical = (href) => {
    try {
      const url = new URL(href, location.origin);
      const match = url.pathname.match(
        /^\/(?:[A-Za-z0-9._]{1,30}\/)?(p|reel)\/([A-Za-z0-9_-]{5,64})\/?$/,
      );
      return ["www.instagram.com", "instagram.com"].includes(url.hostname) &&
        match
        ? `https://www.instagram.com/${match[1]}/${match[2]}/`
        : null;
    } catch {
      return null;
    }
  };
  const codeOf = (url) => url.split("/")[4];
  const stamp = (value) => {
    if (
      value === null ||
      value === "" ||
      value === undefined ||
      !Number.isFinite(Number(value))
    )
      return undefined;
    const n = Number(value),
      ms = n < 1e12 ? n * 1000 : n;
    return ms >= Date.UTC(2010, 0, 1) && ms <= Date.now() + 300000
      ? new Date(ms).toISOString()
      : undefined;
  };
  const outside = (date) =>
    date &&
    (Date.parse(date) < Date.parse(wanted.from) ||
      Date.parse(date) >= Date.parse(wanted.until));
  const integer = (value) => {
    if (!(
      typeof value === "number" ||
      (typeof value === "string" && /^\d+$/.test(value))
    ))
      return undefined;
    const n = Number(value);
    return Number.isSafeInteger(n) && n >= 0 ? n : undefined;
  };
  const idString = (value) =>
    typeof value === "string"
      ? value.slice(0, 100)
      : Number.isSafeInteger(value)
        ? String(value)
        : undefined;
  const urlString = (value) => {
    if (typeof value !== "string" || value.length > 4096) return undefined;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.href.length <= 4096
        ? url.href
        : undefined;
    } catch {
      return undefined;
    }
  };
  const mediaType = (o) =>
    o.media_type === 8 || o.__typename === "GraphSidecar"
      ? "carousel"
      : o.media_type === 2 ||
          o.is_video === true ||
          o.__typename === "GraphVideo"
        ? "video"
        : o.media_type === 1 || o.__typename === "GraphImage"
          ? "image"
          : "unknown";
  const mediaData = (o) => {
    const result = {
      id: idString(o.pk ?? o.id),
      type: mediaType(o) === "unknown" ? undefined : mediaType(o),
      altText:
        typeof o.accessibility_caption === "string"
          ? o.accessibility_caption.slice(0, 10000)
          : undefined,
      imageUrl: urlString(
        o.display_url ?? o.image_versions2?.candidates?.[0]?.url,
      ),
      videoUrl: urlString(o.video_url ?? o.video_versions?.[0]?.url),
    };
    const width = integer(o.original_width ?? o.dimensions?.width),
      height = integer(o.original_height ?? o.dimensions?.height);
    if (width > 0 && width <= 100000) result.width = width;
    if (height > 0 && height <= 100000) result.height = height;
    if (
      typeof o.video_duration === "number" &&
      o.video_duration >= 0 &&
      o.video_duration <= 86400
    )
      result.durationSeconds = o.video_duration;
    return result;
  };
  const metricPaths = {
    likeCount: [
      "like_count",
      "edge_media_preview_like.count",
      "edge_liked_by.count",
    ],
    commentCount: [
      "comment_count",
      "edge_media_to_parent_comment.count",
      "edge_media_to_comment.count",
    ],
    viewCount: ["view_count", "video_view_count"],
    playCount: ["play_count", "video_play_count", "ig_play_count"],
    shareCount: ["share_count", "reshare_count"],
    repostCount: ["repost_count"],
    saveCount: ["save_count"],
  };
  const normalized = (o) => {
    const code = o.shortcode || o.code;
    const { author, collaborators } = participants(o);
    if (
      !/^[A-Za-z0-9_-]{5,64}$/.test(code || "") ||
      !author ||
      ![author, ...collaborators].includes(user)
    )
      return null;
    let caption;
    if (typeof o.caption?.text === "string") caption = o.caption.text;
    else if (typeof o.caption === "string") caption = o.caption;
    else if (o.caption === null && Object.hasOwn(o, "caption")) caption = "";
    else if (Array.isArray(o.edge_media_to_caption?.edges)) {
      const edges = o.edge_media_to_caption.edges;
      if (edges.every((e) => typeof e.node?.text === "string"))
        caption = edges.map((e) => e.node.text).join("\n");
    }
    // An explicitly shortened caption is never promoted to a full caption.
    if (
      o.caption_is_truncated === true ||
      o.caption?.is_truncated === true ||
      o.caption?.text_is_truncated === true
    )
      caption = undefined;
    const publishedAt = stamp(o.taken_at_timestamp ?? o.taken_at);
    const metrics = {};
    for (const [key, paths] of Object.entries(metricPaths)) {
      for (const p of paths) {
        const n = integer(p.split(".").reduce((v, part) => v?.[part], o));
        if (n !== undefined) {
          metrics[key] = {
            value: n,
            source: "embedded_json",
            approximate: false,
          };
          break;
        }
      }
    }
    // Hidden likes sometimes come with placeholder zeroes in page data.
    if (
      o.like_and_view_counts_disabled === true ||
      o.hide_like_and_view_counts === true
    ) {
      delete metrics.likeCount;
      delete metrics.viewCount;
    }
    const metadata = mediaData(o);
    const children =
      o.carousel_media || o.edge_sidecar_to_children?.edges?.map((e) => e.node);
    if (Array.isArray(children) && children.length) {
      metadata.media = children.slice(0, 100).filter(Boolean).map(mediaData);
      if (metadata.media.length) metadata.mediaCount = metadata.media.length;
    } else if (integer(o.carousel_media_count) > 0)
      metadata.mediaCount = Math.min(100, Number(o.carousel_media_count));
    else if (["image", "video"].includes(metadata.type))
      metadata.mediaCount = 1;
    if (typeof o.product_type === "string")
      metadata.productType = o.product_type.slice(0, 100);
    if (typeof o.is_pinned === "boolean") metadata.isPinned = o.is_pinned;
    if (
      typeof o.is_paid_partnership === "boolean" ||
      typeof o.is_ad === "boolean"
    )
      metadata.isSponsored = o.is_paid_partnership === true || o.is_ad === true;
    if (typeof o.location?.name === "string")
      metadata.location = {
        id: idString(o.location.pk ?? o.location.id),
        name: o.location.name.slice(0, 500),
        slug:
          typeof o.location.slug === "string"
            ? o.location.slug.slice(0, 500)
            : undefined,
      };
    const usernames = (values) =>
      [
        ...new Set(
          values.filter(
            (v) => typeof v === "string" && /^[A-Za-z0-9._]{1,30}$/.test(v),
          ),
        ),
      ].slice(0, 100);
    const tags = o.usertags?.in || o.edge_media_to_tagged_user?.edges;
    if (Array.isArray(tags))
      metadata.taggedUsers = usernames(
        tags.map((v) => v.user?.username || v.node?.user?.username),
      );
    metadata.collaborators = collaborators;
    return {
      state: outside(publishedAt)
        ? "outside"
        : typeof caption === "string" && publishedAt
          ? "ready"
          : "incomplete",
      username: user,
      authorUsername: author,
      collaboratorUsernames: collaborators,
      permalink: `https://www.instagram.com/${o.product_type === "clips" ? "reel" : "p"}/${code}/`,
      caption,
      publishedAt,
      fullCaption: typeof caption === "string",
      extraction: "embedded_json",
      instagramId: idString(o.pk ?? o.id),
      mediaType: mediaType(o) === "unknown" ? undefined : mediaType(o),
      metrics,
      metadata,
      countsHidden:
        o.like_and_view_counts_disabled === true ||
        o.hide_like_and_view_counts === true,
      isPinned: metadata.isPinned,
    };
  };
  const byCode = new Map();
  for (const o of objects) {
    const post = normalized(o);
    if (!post) continue;
    const code = codeOf(post.permalink),
      prev = byCode.get(code);
    if (!prev) byCode.set(code, post);
    else {
      // Page data may split a post across several records. Only merge the same verified owner/code.
      const merged = {
        ...prev,
        ...Object.fromEntries(
          Object.entries(post).filter(([, v]) => v !== undefined),
        ),
        caption: post.fullCaption ? post.caption : prev.caption,
        fullCaption: post.fullCaption || prev.fullCaption,
        metrics: { ...prev.metrics, ...post.metrics },
        metadata: {
          ...prev.metadata,
          ...Object.fromEntries(
            Object.entries(post.metadata).filter(([, v]) => v !== undefined),
          ),
        },
        collaboratorUsernames: [
          ...new Set([
            ...prev.collaboratorUsernames,
            ...post.collaboratorUsernames,
          ]),
        ],
        countsHidden: prev.countsHidden || post.countsHidden,
      };
      if (merged.countsHidden) {
        delete merged.metrics.likeCount;
        delete merged.metrics.viewCount;
      }
      merged.state = outside(merged.publishedAt)
        ? "outside"
        : merged.fullCaption && merged.publishedAt
          ? "ready"
          : "incomplete";
      byCode.set(code, merged);
    }
  }

  if (wanted.mode === "discover") {
    if (path.replaceAll("/", "").toLowerCase() !== user)
      return JSON.stringify({
        state: "unavailable",
        message: "Profil səhifəsi açılmadı.",
      });
    const candidates = new Map();
    for (const a of document.querySelectorAll("main a[href],article a[href]")) {
      if (!visible(a) || a.closest('[role="dialog"],[aria-modal="true"]'))
        continue;
      const url = canonical(a.href);
      if (!url) continue;
      const code = codeOf(url);
      if (candidates.has(code)) continue;
      const post = byCode.get(code);
      const pinned = [...a.querySelectorAll("[aria-label],title")].some((e) =>
        /pinned|закреп|sabitlen|bərkidil/i.test(
          e.getAttribute("aria-label") || e.textContent || "",
        ),
      );
      const time = a.querySelector("time[datetime]")?.getAttribute("datetime");
      const publishedAt =
        post?.publishedAt ||
        (time && Number.isFinite(Date.parse(time))
          ? new Date(time).toISOString()
          : undefined);
      candidates.set(code, {
        permalink: url,
        publishedAt,
        isPinned: pinned || post?.isPinned,
        post,
      });
    }
    // Embedded records only enrich real grid tiles. Unrendered links cannot be clicked safely.
    return JSON.stringify({
      state: "ready",
      candidates: [...candidates.values()],
      publicVerified: profiles.some((o) => o.is_private === false),
    });
  }

  const code = wanted.shortcode;
  const here = path.match(
    /^\/(?:[A-Za-z0-9._]{1,30}\/)?(?:p|reel)\/([A-Za-z0-9_-]+)(?:\/|$)/,
  )?.[1];
  if (here !== code && !(postDialog && hasRequestedTime(postDialog)))
    return JSON.stringify({
      state: "unavailable",
      message: "Paylaşım əvəzinə başqa səhifə açıldı.",
    });
  const embedded = byCode.get(code);
  if (!article)
    return JSON.stringify(
      embedded || {
        state: "incomplete",
        message: "Paylaşım səhifəsi hələ yüklənməyib.",
      },
    );

  const domMetrics = () => {
    const metrics = {};
    const labels = {
      likeCount:
        "likes?|bəyənmə|beğeni|отметок «нравится»|отметки «нравится»|нравится",
      commentCount: "comments?|şərh|yorum|комментариев|комментария|комментарий",
      viewCount: "views?|baxış|görüntüleme|просмотров|просмотра",
      playCount: "plays?|oynatma|воспроизведений",
      shareCount: "shares?|paylaşma|paylaşım|поделились",
      repostCount: "reposts?|repost|репостов|репоста",
      saveCount: "saves?|yadda saxlama|kaydetme|сохранений",
    };
    const number =
      "(\\d[\\d\\s.,\\u00a0\\u202f]*(?:[KMBkmb]|тыс\\.?|млн\\.?|млрд\\.?|min|milyon|milyar)?)";
    const parseCount = (raw) => {
      const compact = raw.trim().replace(/[\s\u00a0\u202f]/g, "");
      const match = compact.match(
        /^(.*?)(k|m|b|тыс\.?|млн\.?|млрд\.?|min|milyon|milyar)$/i,
      );
      if (match) {
        const suffix = match[2].toLowerCase().replace(".", "");
        const multiplier = /^(k|тыс|min)$/.test(suffix)
          ? 1e3
          : /^(m|млн|milyon)$/.test(suffix)
            ? 1e6
            : 1e9;
        const n = Number(match[1].replace(",", ".")) * multiplier;
        return Number.isFinite(n) &&
          n >= 0 &&
          Number.isSafeInteger(Math.round(n))
          ? { value: Math.round(n), approximate: true }
          : null;
      }
      // Whole counts only: separators must form thousands groups, never guess decimal values.
      if (!/^\d+$/.test(compact) && !/^\d{1,3}(?:[.,]\d{3})+$/.test(compact))
        return null;
      const n = integer(compact.replace(/[.,]/g, ""));
      return n === undefined ? null : { value: n, approximate: false };
    };
    for (const el of article.querySelectorAll(
      'a[href],button,[role="button"],[aria-label]',
    )) {
      if (!visible(el) || el.closest('h1,li,ul,[role="list"]')) continue;
      const values = [
        el.getAttribute("aria-label"),
        el.getAttribute("title"),
        el.innerText,
      ]
        .filter(Boolean)
        .map((v) => v.trim())
        .filter((v) => v.length <= 160);
      const labelNode = el.querySelector("svg[aria-label],svg title");
      const semantic =
        el.getAttribute("aria-label") ||
        labelNode?.getAttribute("aria-label") ||
        labelNode?.textContent;
      const countText = (el.innerText || "").trim();
      if (
        semantic &&
        /^\d[\d\s.,]*(?:[KMBkmb]|тыс\.?|млн\.?)?$/.test(countText)
      )
        values.push(`${countText} ${semantic.trim()}`);
      if (
        el.tagName === "A" &&
        el.getAttribute("href")?.includes(`/${code}/liked_by/`) &&
        countText.length < 40
      )
        values.push(`${countText} likes`);
      for (const value of values)
        for (const [key, label] of Object.entries(labels)) {
          const match =
            value.match(
              new RegExp(
                `^(?:view all|see all|все|всего|tüm|bütün)?\\s*${number}\\s*(?:${label})$`,
                "i",
              ),
            ) ||
            value.match(new RegExp(`^(?:${label})\\s*:?\\s*${number}$`, "i"));
          if (!match) continue;
          const parsed = parseCount(match[1]);
          if (!parsed) continue;
          if (
            !metrics[key] ||
            (metrics[key].approximate && !parsed.approximate)
          )
            metrics[key] = { ...parsed, source: "dom", label: value };
        }
    }
    return metrics;
  };
  if (embedded?.state === "outside") return JSON.stringify(embedded);
  const combinedMetrics = { ...domMetrics(), ...embedded?.metrics };
  if (embedded?.countsHidden) {
    delete combinedMetrics.likeCount;
    delete combinedMetrics.viewCount;
  }
  if (embedded?.state === "ready")
    return JSON.stringify({ ...embedded, metrics: combinedMetrics });

  const times = [...article.querySelectorAll("time[datetime]")];
  const time =
    times.find((t) => {
      const link = t.closest("a[href]");
      if (!link) return false;
      return (
        canonical(link.href)?.endsWith(`/${code}/`) &&
        !new URL(link.href).searchParams.has("comment_id")
      );
    }) || (times.length === 1 ? times[0] : null);
  const authorVerified = domAuthors.includes(user);
  const date = new Date(time?.getAttribute("datetime") || "");
  const publishedAt =
    embedded?.publishedAt ||
    (authorVerified && Number.isFinite(date.getTime())
      ? date.toISOString()
      : undefined);
  // Out-of-range posts don't need caption expansion, metrics, or manual caption entry.
  if (outside(publishedAt))
    return JSON.stringify({ state: "outside", publishedAt });
  if (heading && publishedAt && authorVerified) {
    const more = [
      ...(captionBlock || heading).querySelectorAll(
        'button,[role="button"],span',
      ),
    ].find(
      (e) =>
        visible(e) &&
        /^(more|… more|\.\.\. more|ещё|еще|daha fazla|daha çox)$/i.test(
          e.textContent.trim(),
        ),
    );
    if (more) {
      more.click();
      return JSON.stringify({ state: "expanding" });
    }
    const caption = heading.innerText;
    const clipped =
      heading.scrollHeight > heading.clientHeight + 3 ||
      (["hidden", "clip"].includes(getComputedStyle(heading).overflowY) &&
        heading.scrollHeight > heading.clientHeight);
    if (
      !clipped &&
      !/(?:…|\.\.\.)\s*(?:more|ещё|еще|daha fazla|daha çox)?$/i.test(caption)
    ) {
      return JSON.stringify({
        ...embedded,
        state: "ready",
        username: user,
        authorUsername: embedded?.authorUsername || domAuthors[0],
        collaboratorUsernames: [
          ...new Set([
            ...(embedded?.collaboratorUsernames || []),
            ...domAuthors.slice(1),
          ]),
        ],
        caption,
        publishedAt,
        fullCaption: true,
        extraction: "dom",
        metrics: combinedMetrics,
      });
    }
  }
  return JSON.stringify({
    ...embedded,
    state: "incomplete",
    metrics: combinedMetrics,
    message: "Tam caption, müəllif və ya dəqiq tarix təsdiqlənmədi.",
  });
})();
