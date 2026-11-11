// deep-test page probe: shared by the /deep-test skill (pasted into javascript_tool) and
// tests/deep.mjs in CI (page.evaluate). Must stay one self-contained expression.
// Returns one JSON report about the CURRENT page at the CURRENT viewport. Read-only: it never
// clicks, submits or writes storage. Internal links are checked with GET (same origin only).
(async () => {
  const MODULES = ["Samuka", "SamukaAuth", "SamukaAccountCore", "SamukaMe", "SamukaPalette", "SamukaArcade",
    "SamukaScores", "SamukaGlitch", "SamukaTextGlitch", "SamukaLoadGlitch", "SamukaNav"];
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  const visible = (el) => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > -window.scrollY && s.visibility !== "hidden" && s.display !== "none" && +s.opacity !== 0 && !el.closest("[hidden], [aria-hidden=true]");
  };
  const label = (el) => {
    const id = el.id ? "#" + el.id : "";
    const cls = typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
    return el.tagName.toLowerCase() + id + cls;
  };
  const name = (el) => (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim()
    || (el.querySelector("img[alt]") && el.querySelector("img[alt]").alt) || (el.getAttribute("aria-labelledby") ? "(labelledby)" : "");

  // 1. horizontal overflow: the page itself, and elements poking past the viewport
  const pageOverflow = document.documentElement.scrollWidth - vw;
  const overflowing = [...document.querySelectorAll("body *")].filter((el) => {
    if (!visible(el)) return false;
    const r = el.getBoundingClientRect();
    if (r.right <= vw + 1 && r.left >= -1) return false;
    if (r.right < 0) return false;   // parked fully off-screen on purpose (skip link, visually-hidden text)
    // ignore things inside a scroll container or deliberately clipped parents
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") return false;
    }
    return getComputedStyle(el).position !== "fixed" || r.left < -1 || r.right > vw + 1;
  }).slice(0, 15).map((el) => { const r = el.getBoundingClientRect(); return `${label(el)} [${Math.round(r.left)}→${Math.round(r.right)} of ${vw}]`; });

  // 2. broken images
  const brokenImages = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src).map((i) => i.src);

  // 3. accessibility basics
  const unnamed = [...document.querySelectorAll("a[href], button, [role=button], input, select, textarea")]
    .filter((el) => visible(el) && el.type !== "hidden")
    .filter((el) => {
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return !(el.labels && el.labels.length) && !el.getAttribute("aria-label") && !el.getAttribute("placeholder") && !el.getAttribute("title");
      return !name(el);
    }).slice(0, 15).map(label);
  const ids = {}; document.querySelectorAll("[id]").forEach((el) => { ids[el.id] = (ids[el.id] || 0) + 1; });
  const duplicateIds = Object.keys(ids).filter((k) => ids[k] > 1);
  const imgsNoAlt = [...document.images].filter((i) => visible(i) && !i.hasAttribute("alt")).map((i) => i.src).slice(0, 10);
  const headings = [...document.querySelectorAll("#main h1, main h1")].filter(visible).length;

  // 4. touch targets (only meaningful at phone width): interactive things smaller than 32x32 css px
  const smallTargets = vw < 768 ? [...document.querySelectorAll("a[href], button, [role=button], input:not([type=hidden]), select, summary")]
    .filter(visible).filter((el) => { const r = el.getBoundingClientRect(); return (r.width < 32 || r.height < 32) && !el.closest("p, li > p, .prose, article"); })
    .slice(0, 20).map((el) => { const r = el.getBoundingClientRect(); return `${label(el)} ${Math.round(r.width)}x${Math.round(r.height)} "${name(el).slice(0, 24)}"`; }) : [];

  // 5. duplicated singletons (a sign that a module re-initialised on samuka:page without cleaning up)
  const singletons = [".mnav", ".msheet", ".tabs", "#main", ".mdock", ".pal", ".arcade", ".race"]
    .map((s) => [s, document.querySelectorAll(s).length]).filter(([, n]) => n > 1).map(([s, n]) => `${s} ×${n}`);

  // 6. internal links: unique same-origin paths, fetched once each
  const hrefs = [...new Set([...document.querySelectorAll("a[href]")].map((a) => a.href)
    .filter((h) => { try { const u = new URL(h); return u.origin === location.origin && !/^(mailto|tel|javascript):/.test(u.protocol); } catch (e) { return false; } })
    .map((h) => { const u = new URL(h); return u.pathname + u.search; }))];
  const brokenLinks = [];
  await Promise.all(hrefs.map(async (p) => {
    try { const r = await fetch(p, { cache: "no-store" }); if (!r.ok) brokenLinks.push(`${r.status} ${p}`); }
    catch (e) { brokenLinks.push(`ERR ${p}`); }
  }));
  // same-page anchors that point nowhere
  const deadAnchors = [...document.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute("href"))
    .filter((h) => h.length > 1 && !document.getElementById(decodeURIComponent(h.slice(1))));

  return {
    url: location.href, viewport: `${vw}x${vh}`, dpr: devicePixelRatio, touch: navigator.maxTouchPoints,
    title: document.title, theme: document.documentElement.dataset.theme, skin: document.documentElement.dataset.skin,
    role: document.documentElement.dataset.role, auth: document.documentElement.dataset.auth,
    missingModules: MODULES.filter((m) => !window[m]),
    pageOverflowPx: pageOverflow, overflowing, brokenImages, brokenLinks: brokenLinks.sort(), deadAnchors: [...new Set(deadAnchors)],
    unnamedControls: unnamed, imgsWithoutAlt: imgsNoAlt, duplicateIds, visibleH1s: headings,
    smallTouchTargets: smallTargets, duplicatedSingletons: singletons,
    musicOn: !!(window.SamukaLofi && window.SamukaLofi.isOn && window.SamukaLofi.isOn()),
    arcadeOpen: !!(window.SamukaArcade && window.SamukaArcade.isOpen && window.SamukaArcade.isOpen()),
    linksChecked: hrefs.length
  };
})()
