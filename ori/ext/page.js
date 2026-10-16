/* 상품 위치 찾기: 쇼핑몰 화면 안에서 도는 부분 (상품 정보 읽기, 검색 화면 읽기, 결과 상자) */
(() => {
  if (window.__PL) return;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = t => String(t || "").replace(/[\s\[\]\(\)\/,.·\-_+~!*'"]/g, "").toLowerCase();
  const isNaver = /naver\.com$/.test(location.hostname);
  const numOf = s => Number(String(s || "").replace(/[^0-9]/g, "")) || 0;

  /* 고른 옵션: '색상 × 수량' 같은 이름표를 찾아 바로 옆 값 (콜론은 화면 꾸밈이라 글에 없을 때가 있음) */
  const OPT_LAB = /^(색상|옵션|사이즈|수량|구성|선택|용량|맛|종류|컬러|타입)(\s*[×x\/·,]\s*(색상|옵션|사이즈|수량|구성|선택|용량|맛|종류|컬러|타입))*\s*[:：]?$/;
  function readOption() {
    const labs = [...document.querySelectorAll("span,div,dt,th,td,strong,b,label,p,em")].filter(e => e.children.length <= 2 && OPT_LAB.test((e.innerText || "").trim()));
    for (const lab of labs) {
      let v = "";
      if (lab.nextElementSibling) v = lab.nextElementSibling.innerText || "";
      if (!v.trim() && lab.parentElement) v = (lab.parentElement.innerText || "").replace(lab.innerText, "");
      v = v.replace(/^\s*[:：]\s*/, "").replace(/\s+/g, " ").trim();
      if (v && v.length <= 60 && !/선택하세요|선택해\s*주세요|^\d+$/.test(v)) return v;
    }
    const om = document.body.innerText.match(/(?:색상|옵션|구성|사이즈|수량|선택)[^\n]{0,12}[:：]\s*([^\n]{1,40})/);
    return om ? om[1].trim() : "";
  }
  /* 상품명: 화면에 보이는 제목(h1). og:title은 쿠팡이 ' - 일반거치대' 같은 분류를 붙여서 마지막에 */
  function visibleTitle() {
    const h = [...document.querySelectorAll("h1, h2, h3")].map(e => (e.innerText || "").replace(/\s+/g, " ").trim()).find(t => t.length >= 6 && t.length <= 200 && !/쿠팡|coupang|네이버|장바구니|카테고리/i.test(t));
    return h || "";
  }

  /* ---------- 상품 페이지: 상품명, 판매처, 상품번호, 옵션, 가격, 썸네일 ---------- */
  /* 제목 바로 뒤에 처음 나오는 가격 (할인·쿠폰·적립·배송 금액은 건너뜀) */
  function priceAfter(txt, name) {
    const i0 = name ? txt.indexOf(name.slice(0, 12)) : -1;
    const t = i0 >= 0 ? txt.slice(i0, i0 + 2500) : txt.slice(0, 4000);
    const re = /(\d{1,3}(?:,\d{3})+)\s*원/g;
    let m;
    while ((m = re.exec(t))) {
      const before = t.slice(Math.max(0, m.index - 12), m.index), after = t.slice(m.index, m.index + m[0].length + 6);
      if (/할인|쿠폰|적립|캐시|배송|최대|이상/.test(before) || /할인|이상/.test(after)) continue;
      const v = numOf(m[1]); if (v >= 100) return v;
    }
    return 0;
  }
  function readProduct() {
    const L = location;
    const og = n => { const m = document.querySelector('meta[property="og:' + n + '"]'); return m ? (m.content || "") : ""; };
    const html = document.documentElement.innerHTML, txt = document.body.innerText;
    let img = og("image"); if (img.indexOf("//") === 0) img = "https:" + img;
    const num = s => Number(String(s || "").replace(/[^0-9]/g, "")) || 0;
    const firstPrices = (t, n) => (t.match(/\d{1,3}(?:,\d{3})+\s*원/g) || []).slice(0, n).map(num).filter(x => x >= 100);
    if (!isNaver) {
      const pm = L.pathname.match(/\/v[pm]\/products\/(\d+)/);
      if (!pm) return { err: "쿠팡 상품 상세 페이지에서 눌러 주세요." };
      const qs = new URLSearchParams(L.search);
      let item = qs.get("itemId") || qs.get("itemid") || "";
      if (!item) { const m = html.match(/["']?itemId["']?\s*[:=]\s*["']?(\d{8,})/); if (m) item = m[1]; }
      let name = visibleTitle();
      if (!name) name = (og("title") || document.title).replace(/\s*[-|]\s*쿠팡!?\s*$/, "").replace(/\s+-\s+[^-]{1,20}$/, "").trim();
      let seller = "";
      const sm = txt.match(/판매자\s*[:：]?\s*([^\n]{1,60})/);
      if (sm) seller = sm[1].replace(/\s*(판매자\s*)?(상품\s*)?보러\s*가기.*$/, "").replace(/\s*판매자\s*평가.*$/, "").trim();
      if (!seller || seller.length > 30 || /가입|보러가기|평가|정보/.test(seller)) { const s2 = txt.match(/상호\s*\/\s*대표자\s*([^\n\/]{1,40})/); seller = s2 ? s2[1].trim() : ""; }
      let opt = readOption();
      if (!opt) { const oe = document.querySelector('.prod-option__selected .value, .prod-option__selected-container .value'); if (oe) opt = oe.textContent.replace(/\s+/g, " ").trim().slice(0, 60); }
      let price = 0;
      const pe = document.querySelector('.prod-sale-price .total-price strong, .total-price strong, [class*="final-price"] [class*="amount"], .price-amount.final-price-amount, [class*="finalPrice"]');
      if (pe) price = num(pe.textContent);
      if (!price) price = priceAfter(txt, name);
      return { site: "coupang", mob: /^m\./.test(L.hostname), pid: pm[1], item: item, name: name, seller: seller, opt: opt, price: price, img: img };
    }
    const pm = L.pathname.match(/products\/(\d+)/);
    if (!pm) return { err: "네이버는 스마트스토어(또는 브랜드스토어) 상품 페이지에서 눌러 주세요." };
    const parts = document.title.split(/\s+:\s+/);
    const name = (og("title") || parts[0] || "").split(/\s+:\s+/)[0].trim();
    const seller = (parts.length > 1 ? parts[parts.length - 1] : og("site_name")).replace(/\s*[-|]?\s*네이버.*$/, "").trim();
    /* 가격: 페이지 안 상품 데이터(할인가 → 판매가) → 화면에서 상품명 바로 뒤 가격 중 낮은 것(정가 줄 그은 것 말고 할인가) */
    let price = 0;
    const dm = html.match(/"discountedSalePrice"\s*:\s*(\d{3,})/) || html.match(/"mobileDiscountedSalePrice"\s*:\s*(\d{3,})/);
    if (dm) price = Number(dm[1]);
    if (!price) { const sm2 = html.match(/"salePrice"\s*:\s*(\d{3,})/); if (sm2) price = Number(sm2[1]); }
    if (!price) { const i = name ? txt.indexOf(name.slice(0, 10)) : -1; const p = firstPrices(i >= 0 ? txt.slice(i, i + 1500) : txt, 2); if (p.length) price = Math.min.apply(null, p); }
    const opt = readOption();
    return { site: "naver", mob: /^m\./.test(L.hostname), pid: pm[1], item: "", name: name, seller: seller, opt: opt, price: price, img: img };
  }

  /* ---------- 검색 화면: 상품 칸을 위에서부터 순서대로 ---------- */
  const NAVER_PROD = /smartstore\.naver\.com|brand\.naver\.com|shopping\.naver\.com|adcr|nv_?mid|nvmid|catalog|bridge|\/products\//i;
  const NOT_TITLE = /^(\d[\d,]*\s*원?|가격비교.*|리뷰.*|찜.*|구매.*|등록일.*|정보|신고.*|광고|AD|더보기|판매처.*|\d+)$/;
  function cardList() {
    let anchors, keyOf;
    if (!isNaver) {
      anchors = [...document.querySelectorAll('a[href*="/products/"]')].filter(a => /\/v[pm]\/products\/\d+/.test(a.getAttribute("href") || ""));
      keyOf = a => (a.getAttribute("href").match(/products\/(\d+)/) || [])[1];
    } else {
      /* 네이버: 상품 이름이 적힌 링크 하나 = 상품 칸 하나 */
      anchors = [...document.querySelectorAll("a[href]")].filter(a => {
        const t = (a.innerText || "").trim();
        return t.length >= 8 && !NOT_TITLE.test(t) && /[가-힣a-z]/i.test(t) && NAVER_PROD.test(a.href);
      });
      keyOf = a => norm(a.innerText).slice(0, 40);
    }
    const keyed = anchors.map(a => ({ a: a, k: keyOf(a) })).filter(x => x.k);
    const keysIn = el => { const s = new Set(); keyed.forEach(x => { if (el.contains(x.a)) s.add(x.k); }); return s; };
    const seen = new Set(), cards = [];
    keyed.forEach(x => {
      let el = x.a;
      while (el.parentElement && el.parentElement !== document.body && keysIn(el.parentElement).size <= 1) el = el.parentElement;
      if (seen.has(el)) return;
      seen.add(el); cards.push({ el: el, k: x.k });
    });
    /* 같은 목록(같은 부모)에 3개 이상 있는 칸만: 배너, 추천 한두 개는 빼기 */
    const byParent = new Map();
    cards.forEach(c => byParent.set(c.el.parentElement, (byParent.get(c.el.parentElement) || 0) + 1));
    const list = cards.filter(c => byParent.get(c.el.parentElement) >= 3);
    list.sort((a, b) => a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    return list;
  }
  const AD_TXT = /(^|[\s·|])(광고|AD)([\s·|]|$)/;
  const isAd = el => AD_TXT.test(el.innerText || "") || !!el.querySelector('a[href*="adcr"], [class*="ad-badge"], [class*="adBadge"], [class*="ad_label"], [class*="AdMark"], img[alt="광고"], img[alt="AD"]');
  function matchOf(el, o) {
    const pidRe = new RegExp((isNaver ? "(^|\\D)" : "products/") + o.pid + "(?!\\d)");
    if (!isNaver) return pidRe.test(el.innerHTML) ? "상품번호" : "";
    if (o.pid && o.pid.length >= 8 && pidRe.test(el.innerHTML)) return "상품번호";
    const t = norm(el.innerText), nk = norm(o.nm).slice(0, 25);
    if (nk.length >= 6 && t.indexOf(nk) !== -1) return o.st && t.indexOf(norm(o.st)) !== -1 ? "상품명+스토어" : "상품명";
    return "";
  }
  /* 쇼핑몰이 띄운 보안 확인(캡차) 화면인지: 상품 칸이 하나도 없고 보안 확인 문구가 있을 때만 */
  const BLOCK_RE = /자동\s*입력\s*방지|보안\s*확인|영수증|비정상적인|일시적으로\s*제한|접속이\s*(제한|불가)|로봇이\s*아닙|Access Denied|captcha|unusual traffic/i;
  const blockedText = () => !!document.body && BLOCK_RE.test(document.body.innerText.slice(0, 4000)) && cardList().length === 0;
  const snippet = () => ((document.title || "") + " | " + (document.body ? document.body.innerText : "")).replace(/\s+/g, " ").trim().slice(0, 90);
  async function waitReady() {
    let last = -1, same = 0;
    for (let i = 0; i < 50; i++) {
      await sleep(300);
      if (!document.body) continue;
      const n = document.body.innerText.length + cardList().length * 1000;
      if (n > 300 && n === last) { if (++same >= 2) return; } else same = 0;
      last = n;
    }
  }
  /* 아래로 끝까지 내려서 그 화면 상품을 다 그리게 함. o.until(카드 목록)이 참이면 멈춤 */
  async function loadAll(maxSteps, until) {
    let last = -1, same = 0;
    for (let i = 0; i < maxSteps; i++) {
      if (until && until()) break;
      window.scrollBy(0, Math.max(800, window.innerHeight * 0.9));
      await sleep(400);
      const n = document.documentElement.scrollHeight + cardList().length * 1000;
      if (n === last && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 5) { if (++same >= 3) break; } else same = 0;
      last = n;
    }
  }
  /* o: {pid, nm, st, scroll: 모바일처럼 계속 내려가는 화면이면 true, max} */
  async function scan(o) {
    try { return await scan0(o); } catch (e) { return { error: String((e && e.message) || e), snip: snippet(), n: 0, keys: [] }; }
  }
  async function scan0(o) {
    await waitReady();
    if (blockedText()) return { blocked: true, url: location.href, snip: snippet() };
    const found = () => cardList().some(c => matchOf(c.el, o) && !isAd(c.el));
    if (o.quick) {}
    else if (o.scroll) await loadAll(80, () => found() || cardList().length >= (o.max || 200));
    else await loadAll(40);
    const list = cardList();
    let hit = -1, how = "", adHit = -1;
    list.forEach((c, i) => { const h = matchOf(c.el, o); if (!h) return; if (isAd(c.el)) { if (adHit < 0) adHit = i; return; } if (hit < 0 || (how === "상품명" && h !== "상품명")) { hit = i; how = h; } });
    const body = document.body.innerText;
    window.scrollTo(0, 0);
    return { n: list.length, hit: hit, how: how, adHit: adHit, keys: list.slice(0, 6).map(c => c.k), url: location.href, len: body.length, snip: list.length ? "" : snippet(),
      noResult: /검색\s*결과가\s*없|검색결과가\s*없|상품이\s*없습니다/.test(body) && list.length === 0,
      priceChip: o.lo ? new RegExp(o.lo.toLocaleString("ko-KR") + "\\s*원?\\s*~\\s*" + o.hi.toLocaleString("ko-KR")).test(body) : false };
  }
  /* 가격 직접입력 칸에 넣고 검색 단추 (주소로 가격 필터가 안 먹을 때) */
  function setVal(inp, v) {
    const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    inp.focus(); d.set.call(inp, String(v));
    inp.dispatchEvent(new Event("input", { bubbles: true })); inp.dispatchEvent(new Event("change", { bubbles: true }));
  }
  async function priceUI(lo, hi) {
    const ins = [...document.querySelectorAll("input")].filter(i => i.type !== "hidden" && i.type !== "checkbox" && i.type !== "radio" &&
      /원|가격|price|최소|최대|min|max/i.test([i.placeholder, i.getAttribute("aria-label"), i.name, i.id, i.className, i.title].join(" ")));
    if (ins.length < 2) return false;
    setVal(ins[0], lo); setVal(ins[1], hi);
    let box = ins[0].parentElement; while (box && !box.contains(ins[1])) box = box.parentElement;
    let btn = null;
    for (let el = box, i = 0; el && i < 3 && !btn; el = el.parentElement, i++) btn = [...el.querySelectorAll("button, a[role=button], input[type=submit]")].find(b => { const t = (b.innerText || b.value || b.getAttribute("aria-label") || "").trim(); return !/^\d+$/.test(t); });
    ins[1].dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
    await sleep(300);
    if (btn) btn.click();
    return true;
  }
  /* 페이지 번호 단추 누르기 (주소로 다음 페이지가 안 열릴 때) */
  function clickPage(n) {
    const els = [...document.querySelectorAll("a,button")].filter(e => (e.innerText || "").trim() === String(n));
    const btn = els.find(e => e.parentElement && /\b(1|2|3)\b/.test(e.parentElement.innerText.replace(String(n), ""))) || els.pop();
    if (!btn) return false;
    btn.click(); return true;
  }

  /* ---------- 결과 상자 (원래 상품 페이지 오른쪽 아래) ---------- */
  function box(s) {
    let bx = document.getElementById("__pl_box");
    if (!bx) {
      bx = document.createElement("div"); bx.id = "__pl_box";
      bx.style.cssText = "position:fixed;right:8px;bottom:8px;z-index:2147483647;width:360px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow-y:auto;overflow-x:hidden;box-sizing:border-box;background:#fff;color:#1d1a24;border:2px solid #5b2a86;border-radius:10px;padding:14px;font:13px/1.5 sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.2);text-align:left";
      document.body.appendChild(bx);
    }
    bx.textContent = "";
    const add = (tag, css, text) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; bx.appendChild(e); return e; };
    add("b", "display:block;margin-bottom:4px", s.title || "상품 위치 찾기");
    if (s.big) add("div", "font-size:16px;font-weight:700;color:#5b2a86;margin:4px 0;white-space:pre-wrap", s.big);
    if (s.msg) add("div", "white-space:pre-wrap", s.msg);
    if (s.out != null) {
      const ta = add("textarea", "width:100%;height:215px;margin:6px 0;font:12px/1.5 monospace;box-sizing:border-box");
      ta.value = s.out;
      const row = add("div", "display:flex;gap:8px");
      const mk = (t, solid, f) => { const b = document.createElement("button"); b.textContent = t; b.style.cssText = "flex:1;padding:8px;border:1px solid #5b2a86;border-radius:6px;cursor:pointer;font:13px sans-serif;" + (solid ? "background:#5b2a86;color:#fff" : "background:#fff;color:#5b2a86"); b.onclick = f; row.appendChild(b); return b; };
      const cp = mk(s.copied ? "복사됨" : "복사", true, () => { ta.select(); try { document.execCommand("copy"); cp.textContent = "복사됨"; } catch (e) {} if (navigator.clipboard) navigator.clipboard.writeText(ta.value).then(() => { cp.textContent = "복사됨"; }, () => {}); });
      mk("닫기", false, () => bx.remove());
    }
    if (s.actions && s.actions.length) {
      const row2 = add("div", "display:flex;flex-direction:column;gap:6px;margin-top:8px");
      s.actions.forEach(a => { const b = document.createElement("button"); b.textContent = a.label; b.style.cssText = "padding:9px;border:0;border-radius:6px;cursor:pointer;font:bold 13px sans-serif;background:" + (a.color || "#03c75a") + ";color:#fff"; b.onclick = () => { b.disabled = true; b.textContent = "잠깐만요…"; try { chrome.runtime.sendMessage({ type: "act", act: a.act }); } catch (e) {} }; row2.appendChild(b); });
    }
    (s.notes || []).forEach(n => add("div", "color:" + (n.warn ? "#a35a00" : "#555") + ";font-size:12px;margin-top:6px;white-space:pre-wrap", n.t));
    if (s.img) { const im = add("img", "display:block;max-width:100%;max-height:150px;width:auto;height:auto;margin-top:8px;border-radius:6px;border:1px solid #ddd"); im.src = s.img; im.alt = "대표 썸네일"; }
    return true;
  }

  /* 결과 복사 (확장 프로그램 권한으로 누르지 않아도 복사됨) */
  function copy(text) {
    const t = document.createElement("textarea");
    t.value = text; t.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.appendChild(t); t.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch (e) {}
    t.remove();
    return ok;
  }

  /* 찾은 상품 칸 표시 */
  function mark(i) {
    const c = cardList()[i]; if (!c) return false;
    c.el.style.outline = "4px solid #e5397a"; c.el.style.outlineOffset = "2px";
    c.el.scrollIntoView({ block: "center" });
    return true;
  }
  /* 지금 화면의 검색어, 가격 필터, 페이지 */
  function here() {
    const qp = new URL(location.href).searchParams;
    let query = qp.get("query") || "";
    if (!query) { const inp = document.querySelector('input[type="search"], input[name="query"], header input[type="text"]'); if (inp) query = inp.value || ""; }
    let lo = numOf(qp.get("minPrice")), hi = numOf(qp.get("maxPrice"));
    const m = document.body.innerText.slice(0, 8000).match(/(\d{1,3}(?:,\d{3})+)\s*원?\s*~\s*(\d{1,3}(?:,\d{3})+)\s*원/);
    if (m) { lo = numOf(m[1]); hi = numOf(m[2]); }
    let page = numOf(qp.get("pagingIndex"));
    if (!page) {
      const cur = [...document.querySelectorAll("a,button,strong,span,em")].find(e => /^\d{1,2}$/.test((e.innerText || "").trim()) && (e.getAttribute("aria-current") === "page" || e.getAttribute("aria-selected") === "true" || /active|current|selected|(^|[\s_-])on($|[\s_-])/i.test(String(e.className || ""))));
      page = cur ? Number(cur.innerText.trim()) : 1;
    }
    return { query: query.trim(), lo: lo, hi: hi, page: page, mob: /^m/.test(location.hostname) };
  }
  const state = () => ({ blocked: blockedText(), n: cardList().length, url: location.href });
  /* 찾는 창 위쪽 안내 줄 */
  function banner(t) {
    let b = document.getElementById("__pl_banner");
    if (!b) { b = document.createElement("div"); b.id = "__pl_banner"; b.style.cssText = "position:fixed;left:0;right:0;top:0;z-index:2147483647;background:#5b2a86;color:#fff;font:bold 15px/1.5 sans-serif;padding:10px 14px;text-align:center"; document.documentElement.appendChild(b); }
    b.textContent = t; return true;
  }
  window.__PL = { mark: mark, here: here, state: state, banner: banner, readProduct: readProduct, scan: scan, priceUI: priceUI, clickPage: clickPage, box: box, copy: copy };
})();
