// deep-test visual probe: shared by the /deep-test skill (pasted into javascript_tool) and
// tests/deep.mjs in CI (page.evaluate). Must stay one self-contained expression.
// Finds small icon buttons (♪, ▶ ⏸ ⏭, ×, avatar, bottom-bar icons…) and measures where the
// icon's actual ink sits inside its button, not its text box, because glyph boxes include
// font padding that hides real misalignment. Also flags clipped text.
// Optional: set window.__vtRoot = "<css selector>" first to check one area (e.g. ".mdock"),
// and window.__vtAll = true to also get every button's measurement, not just the failures.
// Read-only apart from a 0×0 marker span added and removed per button to find the text baseline.
(() => {
  const root = (window.__vtRoot && document.querySelector(window.__vtRoot)) || document;
  const TOL = 1.5;                 // px; anything further off-centre than this (or 6% of the box) is reported
  const ctx = document.createElement("canvas").getContext("2d");
  const visible = (el) => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && +s.opacity !== 0 && !el.closest("[hidden]");
  };
  const label = (el) => {
    const cls = typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
    const data = [...el.attributes].find((a) => /^data-/.test(a.name));
    return el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + cls + (data ? `[${data.name}${data.value ? "=" + data.value : ""}]` : "");
  };
  const textNodes = (el) => {
    const out = [], w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) if (n.nodeValue.trim() && visible(n.parentElement)) out.push(n);
    return out;
  };

  // ink box of one text node, in viewport px
  function textInk(node) {
    const el = node.parentElement, s = getComputedStyle(el), txt = node.nodeValue.trim();
    const lead = node.nodeValue.length - node.nodeValue.trimStart().length;
    const range = document.createRange(); range.setStart(node, lead); range.setEnd(node, lead + txt.length);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0);
    if (!rects.length) return null;
    const left = rects[0].left;
    // baseline: a 0x0 inline-block sits on it. It has to share an inline box with the text, so wrap
    // both in a temporary span — in a flex/grid button a bare marker would become its own item.
    const wrap = document.createElement("span"), mark = document.createElement("span");
    mark.style.cssText = "display:inline-block;width:0;height:0;padding:0;margin:0;border:0;vertical-align:baseline";
    const parent = node.parentNode, next = node.nextSibling;
    parent.insertBefore(wrap, node); wrap.appendChild(node); wrap.appendChild(mark);
    const baseline = mark.getBoundingClientRect().bottom;
    parent.insertBefore(node, next); wrap.remove();
    ctx.font = s.font || `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    const m = ctx.measureText(txt);
    return { left: left - m.actualBoundingBoxLeft, right: left + m.actualBoundingBoxRight,
      top: baseline - m.actualBoundingBoxAscent, bottom: baseline + m.actualBoundingBoxDescent,
      kind: `glyph "${txt.slice(0, 6)}"`, emoji: isColorGlyph(txt, ctx.font) };
  }
  // true when the glyph renders as a colour emoji (blue/yellow tiles) rather than a flat text glyph
  function isColorGlyph(txt, font) {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d"); g.font = font.replace(/[\d.]+px/, "40px"); g.fillStyle = "#000"; g.textBaseline = "middle";
    g.fillText(txt, 4, 32);
    const d = g.getImageData(0, 0, 64, 64).data;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 40 && Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) > 40) return true;
    return false;
  }
  // ink box of svg shapes (geometry, no stroke)
  function svgInk(svg) {
    const shapes = [...svg.querySelectorAll("path, circle, rect, line, polyline, polygon, ellipse, text, use")].filter((n) => !n.closest("defs, mask, clipPath, symbol"));
    const rs = (shapes.length ? shapes : [svg]).map((n) => n.getBoundingClientRect()).filter((r) => r.width || r.height);
    if (!rs.length) return null;
    return { left: Math.min(...rs.map((r) => r.left)), right: Math.max(...rs.map((r) => r.right)),
      top: Math.min(...rs.map((r) => r.top)), bottom: Math.max(...rs.map((r) => r.bottom)), kind: "svg" };
  }
  function union(a, b) { return !a ? b : !b ? a : { left: Math.min(a.left, b.left), right: Math.max(a.right, b.right), top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom), kind: a.kind + "+" + b.kind, emoji: !!(a.emoji || b.emoji) }; }

  // icon buttons: small, roughly square, with ≤2 visible characters or only an svg/img/<i> icon
  const candidates = [...root.querySelectorAll("button, a[href], [role=button], summary, label.switch")].filter(visible).filter((el) => {
    const r = el.getBoundingClientRect();
    if (r.width > 72 || r.height > 72 || r.width < 12 || r.height < 12) return false;
    const ratio = r.width / r.height; if (ratio < 0.7 || ratio > 1.45) return false;
    const chars = [...(el.textContent || "").trim()].length;
    return chars <= 2 || (chars === 0 && el.querySelector("svg, img, i"));
  });

  const misaligned = [], unmeasured = [], measured = [], groups = new Map();
  for (const el of candidates) {
    const b = el.getBoundingClientRect(), s = getComputedStyle(el);
    // centre of the padding box (borders can be uneven)
    const cx = b.left + parseFloat(s.borderLeftWidth) + (b.width - parseFloat(s.borderLeftWidth) - parseFloat(s.borderRightWidth)) / 2;
    const cy = b.top + parseFloat(s.borderTopWidth) + (b.height - parseFloat(s.borderTopWidth) - parseFloat(s.borderBottomWidth)) / 2;
    let ink = null;
    for (const t of textNodes(el)) ink = union(ink, textInk(t));
    for (const svg of el.querySelectorAll("svg")) if (visible(svg)) ink = union(ink, svgInk(svg));
    for (const img of el.querySelectorAll("img")) if (visible(img)) { const r = img.getBoundingClientRect(); ink = union(ink, { left: r.left, right: r.right, top: r.top, bottom: r.bottom, kind: "img" }); }
    if (!ink) {   // CSS-drawn icon (<i class="fi">, ::before) — the tools can't see pseudo-element ink
      if (el.querySelector("i") || getComputedStyle(el, "::before").content !== "none") unmeasured.push(label(el));
      continue;
    }
    const dx = (ink.left + ink.right) / 2 - cx, dy = (ink.top + ink.bottom) / 2 - cy;
    const tolX = Math.max(TOL, b.width * 0.06), tolY = Math.max(TOL, b.height * 0.06);
    const round = parseFloat(s.borderTopLeftRadius) >= Math.min(b.width, b.height) / 2 - 1;
    const overflows = ink.left < b.left - 0.5 || ink.right > b.right + 0.5 || ink.top < b.top - 0.5 || ink.bottom > b.bottom + 0.5;
    measured.push(`${label(el)} ${Math.round(b.width)}x${Math.round(b.height)} ${ink.kind}${ink.emoji ? " (emoji)" : ""} dx=${dx.toFixed(1)} dy=${dy.toFixed(1)}`);
    // sibling icon buttons (same toolbar) should share one icon style
    const grp = el.closest(".mdock__row, .mdock__ctrls, [role=toolbar], nav, .tabs__actions, .mnav") || el.parentElement;
    if (!groups.has(grp)) groups.set(grp, []);
    groups.get(grp).push({ el: label(el), emoji: !!ink.emoji, h: ink.bottom - ink.top, box: b.height });
    if (Math.abs(dx) > tolX || Math.abs(dy) > tolY || overflows) {
      misaligned.push({
        el: label(el), name: (el.getAttribute("aria-label") || el.title || "").slice(0, 30), shape: round ? "circle" : "box",
        box: `${Math.round(b.width)}x${Math.round(b.height)}`, icon: ink.kind,
        offPx: { x: +dx.toFixed(1), y: +dy.toFixed(1) },   // + = icon sits right / low
        inkSpillsOut: overflows,
        zoom: [Math.floor(b.left - 12), Math.floor(b.top - 12), Math.ceil(b.right + 12), Math.ceil(b.bottom + 12)]
      });
    }
  }

  // a toolbar mixing colour emoji with flat glyphs, or icons of very different visual size
  const mixedIconStyles = [];
  for (const [grp, items] of groups) {
    if (items.length < 2) continue;
    const emo = items.filter((i) => i.emoji), flat = items.filter((i) => !i.emoji);
    if (emo.length && flat.length) mixedIconStyles.push(`${label(grp)}: colour emoji ${emo.map((i) => i.el).join(", ")} next to flat ${flat.map((i) => i.el).join(", ")}`);
    const sameBox = items.filter((i) => Math.abs(i.box - items[0].box) < 2);
    if (sameBox.length > 1) {
      const hs = sameBox.map((i) => i.h), lo = Math.min(...hs), hi = Math.max(...hs);
      if (lo > 0 && hi / lo > 1.6) mixedIconStyles.push(`${label(grp)}: icon heights ${lo.toFixed(0)}–${hi.toFixed(0)}px in same-size buttons`);
    }
  }

  // text cut off without an ellipsis (labels, tabs, track titles, names)
  const clipped = [...root.querySelectorAll("*")].filter((el) => {
    if (!el.firstChild || !visible(el) || !textNodes(el).length) return false;
    const s = getComputedStyle(el);
    const hidesX = /hidden|clip/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 1 && s.textOverflow !== "ellipsis";
    const hidesY = /hidden|clip/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 2 && !/-webkit-box/.test(s.display);
    return hidesX || hidesY;
  }).slice(0, 15).map((el) => `${label(el)} "${el.textContent.trim().slice(0, 30)}"`);

  return {
    url: location.href, viewport: `${document.documentElement.clientWidth}x${innerHeight}`, dpr: devicePixelRatio,
    theme: document.documentElement.dataset.theme, skin: document.documentElement.dataset.skin, scope: window.__vtRoot || "page",
    iconButtonsChecked: candidates.length, misaligned, mixedIconStyles, unmeasuredCssIcons: [...new Set(unmeasured)].slice(0, 20), clippedText: [...new Set(clipped)],
    ...(window.__vtAll ? { allMeasurements: measured } : {})
  };
})()
