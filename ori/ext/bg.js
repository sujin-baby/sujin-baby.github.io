/* 상품 위치 찾기 (크롬 확장 프로그램)
   쿠팡 상품 페이지에서 아이콘 한 번: 상품 정보 → 썸네일 저장 → 작은 창에서 PC 검색 → 같은 조건으로 모바일 검색 → 결과 복사
     검색 순서: 대표 → 대표 + 가격 → 서브 → 서브 + 가격 … (키워드마다 1~5페이지)
   네이버는 자동으로 여러 페이지를 넘기면 '쇼핑 서비스 접속이 일시적으로 제한' 화면으로 막아서(10/16 실제로 막힘) 자동 넘기기를 안 함:
     상품 페이지에서 아이콘 → 상품 정보·썸네일 + 대표 키워드 검색 탭을 엶 → 그 화면만 읽어서 상품을 찾아 표시
     없으면 [다음 페이지] [가격 넣고 검색] [다음 키워드] 단추 (사람이 한 번 누를 때 한 화면만) */
const VERSION = chrome.runtime.getManifest().version;
const VER_URL = "https://raw.githubusercontent.com/sujin-baby/sujin-baby.github.io/refs/heads/claude/tasting-group-notice-automation-1x1kur/ori/ext/manifest.json";
const MUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const MAXP = 5;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let busy = false, busySince = 0, cancel = false, work = null;

chrome.action.onClicked.addListener(tab => { start(tab); });
/* 결과 상자의 단추 */
chrome.runtime.onMessage.addListener((m, sender) => {
  if (!m || m.type !== "act" || !sender.tab) return;
  if (m.act === "cancel") { cancel = true; closeWork(); ui(sender.tab.id, { title: "멈췄어요", msg: "다시 하려면 아이콘을 누르세요." }); return; }
  naverAct(sender.tab, m.act).catch(e => ui(sender.tab.id, { title: "멈췄어요", msg: "오류: " + ((e && e.message) || e) }));
});
/* 생성기 [상품 페이지 열기]로 연 탭: 주소 뒤 #kw=…&pr=… (의뢰서 키워드)를 탭마다 기억해 둠.
   쿠팡 단축 링크(link.coupang.com)가 상품 페이지로 넘어가면서 # 뒤를 버려서 (10/18 '런치버스 미니 텀블러' 대신 추천 키워드로 찾음) */
const hashOf = u => { const h = String(u || "").split("#")[1] || ""; return /(?:^|&)kw=/.test(h) ? h : ""; };
const pidOf = u => (String(u || "").match(/\/(?:vp|vm)\/products\/(\d+)|\/products\/(\d+)/) || []).slice(1).find(Boolean) || "";
async function keepHash(id, u) {
  const k = "hash_" + id, h = hashOf(u);
  if (h) { await chrome.storage.session.set({ [k]: { h: h, pid: pidOf(u) } }); return; }
  const o = (await chrome.storage.session.get(k))[k]; if (!o) return;
  const pid = pidOf(u); if (!pid) return;
  if (!o.pid) { o.pid = pid; await chrome.storage.session.set({ [k]: o }); }
  else if (o.pid !== pid) await chrome.storage.session.remove(k);   /* 다른 상품으로 옮겨 가면 잊음 */
}
chrome.tabs.onCreated.addListener(t => { keepHash(t.id, t.pendingUrl || t.url).catch(() => {}); });
chrome.tabs.onUpdated.addListener((id, ch) => { if (ch.url) keepHash(id, ch.url).catch(() => {}); });
chrome.tabs.onRemoved.addListener(id => { chrome.storage.session.remove("hash_" + id).catch(() => {}); });
async function tabHash(tab) {
  const h = hashOf(tab.url); if (h) return h;
  const k = "hash_" + tab.id, o = (await chrome.storage.session.get(k).catch(() => ({})))[k];
  return o && (!o.pid || o.pid === pidOf(tab.url)) ? o.h : "";
}
self.__test = async () => { const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); return start(t); };

async function start(tab) {
  if (busy && Date.now() - busySince < 12 * 60000) { await ui(tab.id, { title: "이미 찾는 중이에요", msg: "끝나면 결과가 원래 상품 페이지에 떠요. 멈추고 새로 하려면 아래 단추.", actions: [{ label: "멈추기", act: "cancel", color: "#a33" }] }); return; }
  busy = true; busySince = Date.now(); cancel = false;
  const ka = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000);   /* 오래 걸려도 확장 프로그램이 잠들지 않게 */
  try { return await run(tab); }
  catch (e) {
    const m = String((e && e.message) || e);
    await ui(tab.id, { title: "멈췄어요", msg: /No tab|No window|closed/i.test(m) ? "찾는 창을 닫아서 멈췄어요. 아이콘을 다시 눌러 주세요." : "오류: " + m });
  } finally { busy = false; clearInterval(ka); await closeWork(); }
}

/* ---------- 화면 안 코드 부르기 ---------- */
async function call(tabId, name, args) {
  let err = null;
  for (let i = 0; i < 4; i++) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tabId }, files: ["page.js"] });
      const [r] = await chrome.scripting.executeScript({ target: { tabId: tabId }, func: (n, a) => window.__PL[n].apply(null, a), args: [name, args || []] });
      return r ? r.result : null;
    } catch (e) { err = e; if (/No tab|No window/i.test(String(e && e.message))) throw e; await sleep(1500); }
  }
  throw err;
}
const ui = (tabId, s) => call(tabId, "box", [s]).catch(() => null);

/* ---------- 키워드 추천 (생성기와 같은 규칙) ----------
   네추럴라이즈 플래티넘 오메가3 1100 1,202mgx180캡슐 → 오메가3 | 플래티넘 오메가3 | 네추럴라이즈 오메가3 */
const KW_STOP = /^(탈부착식|탈부착|착붙는|무타공|세라믹|코팅|프리미엄|고급|대용량|소용량|회전|포함|정품|국내산|수입산|신상|신상품|인기|추천|최신|업그레이드|스마트|터치|겨울|여름|봄|가을|방한|보온보냉|보온|보냉|세척솔|대시보드|특가|증정|무료배송|1\+1|세트|단품|미니|슬림|휴대용|접이식)$/;
function suggest(pname) {
  const raw = String(pname || "").replace(/\(.*$/, "").replace(/\[[^\]]*\]/g, " ");
  const dash = raw.split(/\s+-\s+/);
  let toks = dash[0].split(/[\s,]+/).map(t => t.trim()).filter(Boolean);
  const brand = toks.length >= 3 ? toks[0] : "";
  if (brand) toks = toks.slice(1);
  const spec = t => /^\d|\d+(mg|g|kg|ml|l|개|캡슐|정|매|p|도|cm|mm|인치|w)\b|x\d/i.test(t) && !/^[가-힣a-z]+\d+$/i.test(t);
  const isMod = t => /(는|한|된|용)$/.test(t) && t.length <= 4;
  const cand = toks.filter(t => !spec(t) && !KW_STOP.test(t) && !isMod(t) && t.length >= 2);
  const mods = toks.filter(t => /용$/.test(t) && t.length <= 4);
  const cat = dash[1] ? dash[1].split(/[\/,]/)[0].trim() : "";
  const tail = t => t.slice(-3);
  const rep = cand.filter(t => t.length >= 4 && cand.some(u => u !== t && u.length >= 4 && tail(u) === tail(t)));
  let main;
  if (rep.length) main = rep[0];
  else if (cat && cat.length >= 2 && !spec(cat) && !/일반|기타/.test(cat)) main = cat;
  else main = cand.slice(0, 4).pop() || toks[0] || "";
  const alts = rep.filter(t => t !== main);
  const out = [main];
  const add = s => { s = s.trim(); if (s && out.indexOf(s) === -1) out.push(s); };
  alts.forEach(add);
  mods.forEach(m => { add(m + " " + main); alts.forEach(a => add(m + " " + a)); });
  cand.filter(t => t !== main && alts.indexOf(t) === -1 && mods.indexOf(t) === -1).slice(0, 2).forEach(t => add(t + " " + main));
  if (brand) add(brand + " " + main);
  return out.filter(Boolean).slice(0, 4);
}

/* ---------- 검색 주소 ---------- */
function urlFor(site, dev, k, f, p, P) {
  const q = encodeURIComponent(k);
  let u;
  if (site === "coupang") {
    u = dev === "pc" ? "https://www.coupang.com/np/search?q=" + q + "&channel=user&listSize=36&page=" + p : "https://m.coupang.com/nm/search?q=" + q + (p > 1 ? "&page=" + p : "");
    if (f) u += "&isPriceRange=true&minPrice=" + P.lo + "&maxPrice=" + P.hi;
  } else {
    u = (dev === "pc" ? "https://search.shopping.naver.com/search/all?query=" + q + "&pagingIndex=" + p + "&pagingSize=40" : "https://msearch.shopping.naver.com/search/all?query=" + q + (p > 1 ? "&pagingIndex=" + p : ""));
    if (f) u += "&minPrice=" + P.lo + "&maxPrice=" + P.hi;
  }
  return u;
}
/* 가격 필터를 화면에서 넣은 뒤의 주소로 다음 페이지 */
function pageOf(base, site, dev, p) {
  const u = new URL(base);
  if (site === "coupang") u.searchParams.set("page", p);
  else { u.searchParams.set("pagingIndex", p); if (dev === "pc") u.searchParams.set("pagingSize", "40"); }
  return u.href;
}
const sameKeys = (a, b) => !!a && !!b && a.length > 0 && a.join("|") === b.join("|");

/* ---------- 찾는 창 ---------- */
function waitComplete(tabId, ms) {
  return new Promise(res => {
    let t = null;
    const done = () => { clearTimeout(t); chrome.tabs.onUpdated.removeListener(l); res(); };
    function l(id, ch) { if (id === tabId && ch.status === "complete") done(); }
    chrome.tabs.onUpdated.addListener(l);
    t = setTimeout(done, ms);
  });
}
async function openWork() {
  const w = await chrome.windows.create({ url: "about:blank", type: "popup", width: 1280, height: 900, focused: true });
  work = { winId: w.id, tabId: w.tabs[0].id, dbg: false, dnr: false };
}
async function nav(url) {
  if (cancel) throw new Error("멈춤");
  if (/coupang\.com/.test(url)) await sleep(700 + Math.random() * 1300);
  /* 네이버는 너무 빨리 넘기면 보안 확인을 띄워서 사람처럼 1~2.5초 쉬고 */
  if (/naver\.com/.test(url)) await sleep(1000 + Math.random() * 1500);
  work.lastUrl = url;
  const p = waitComplete(work.tabId, 25000);
  await chrome.tabs.update(work.tabId, { url: url });
  await p;
}
async function closeWork() {
  if (!work) return;
  await mobile(false).catch(() => {});
  try { await chrome.windows.remove(work.winId); } catch (e) {}
  work = null;
}
/* 모바일로 보이게: 개발자 도구의 기기 모드와 같은 방법(아이폰 화면). 안 되면 주소 요청만 아이폰으로 */
async function mobile(on) {
  const t = { tabId: work.tabId };
  if (on) {
    await chrome.windows.update(work.winId, { width: 430, height: 920 });
    try {
      await chrome.debugger.attach(t, "1.3");
      work.dbg = true;
      /* 안드로이드 크롬 휴대폰으로 (브라우저 정보끼리 서로 맞게: 안 맞으면 쇼핑몰이 이상한 접속으로 봄) */
      const cv = ((navigator.userAgent.match(/Chrome\/([\d.]+)/) || [])[1] || "141.0.0.0"), major = cv.split(".")[0];
      const brands = [{ brand: "Chromium", version: major }, { brand: "Google Chrome", version: major }, { brand: "Not?A_Brand", version: "99" }];
      await chrome.debugger.sendCommand(t, "Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/" + major + ".0.0.0 Mobile Safari/537.36", platform: "Linux armv8l",
        userAgentMetadata: { brands: brands, fullVersionList: brands.map(b => ({ brand: b.brand, version: b.brand === "Not?A_Brand" ? "99.0.0.0" : cv })), fullVersion: cv, platform: "Android", platformVersion: "14.0.0", architecture: "", model: "SM-S921N", mobile: true } });
      await chrome.debugger.sendCommand(t, "Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
      await chrome.debugger.sendCommand(t, "Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    } catch (e) {
      await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [1], addRules: [{ id: 1, priority: 1,
        action: { type: "modifyHeaders", requestHeaders: [{ header: "user-agent", operation: "set", value: MUA }] },
        condition: { tabIds: [work.tabId], resourceTypes: ["main_frame", "sub_frame", "xmlhttprequest", "script", "other"] } }] });
      work.dnr = true;
    }
  } else {
    if (work.dbg) { try { await chrome.debugger.detach(t); } catch (e) {} work.dbg = false; }
    if (work.dnr) { try { await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [1] }); } catch (e) {} work.dnr = false; }
  }
}

/* ---------- 화면 읽기 (보안 확인이 뜨면 사람이 풀 때까지 기다렸다가 이어서) ---------- */
let curProg = async () => {};
async function scanW(o) {
  let s = await call(work.tabId, "scan", [o]).catch(e => ({ error: String((e && e.message) || e), n: 0, keys: [] }));
  if (!s || s.error) { await sleep(2500); s = await call(work.tabId, "scan", [o]).catch(e => ({ error: String((e && e.message) || e), n: 0, keys: [] })); }   /* 화면이 아직 바뀌는 중이었으면 한 번 더 */
  if (!s) { const tb = await chrome.tabs.get(work.tabId).catch(() => null); s = { error: "빈 결과", snip: tb ? (tb.title || "") + " " + tb.url : "", n: 0, keys: [] }; }
  if (s && s.blocked) {
    work.blockSnip = s.snip || "";
    if (!(await waitHuman())) return s;
    await nav(work.lastUrl);
    s = await call(work.tabId, "scan", [o]).catch(e => ({ error: String((e && e.message) || e), n: 0, keys: [] }));
  }
  return s;
}
const HARD_BLOCK = /일시적으로\s*제한|접속이\s*(제한|불가)|Access Denied/i;
async function waitHuman() {
  if (HARD_BLOCK.test(work.blockSnip || "")) return false;   /* 접속 제한은 풀 수 있는 확인 화면이 아님 → 바로 멈춤 */
  try { await chrome.windows.update(work.winId, { focused: true, state: "normal" }); } catch (e) {}
  const msg = "쇼핑몰이 보안 확인을 띄웠어요. 이 창에서 확인을 풀어 주세요. 풀면 자동으로 이어서 찾아요 (창은 닫지 마세요)";
  await call(work.tabId, "banner", [msg]).catch(() => {});
  await curProg("⚠ 쇼핑몰이 보안 확인을 띄웠어요.\n앞에 뜬 작은 창에서 확인을 풀어 주시면 자동으로 이어서 찾아요. (5분까지 기다려요)");
  for (let i = 0; i < 150; i++) {
    await sleep(2000);
    const st = await call(work.tabId, "state").catch(() => null);
    if (st && !st.blocked) { await sleep(1500); return true; }
    if (i % 5 === 4) await call(work.tabId, "banner", [msg]).catch(() => {});
  }
  return false;
}

/* ---------- 한 키워드(+가격) 단계 찾기 ---------- */
async function look(ctx, dev, k, f) {
  const { site, info, P, prog } = ctx;
  const o = { pid: info.pid, nm: info.name, st: info.seller, lo: f ? P.lo : 0, hi: f ? P.hi : 0, scroll: dev === "mo", max: 200 };
  const lab = (dev === "pc" ? "PC " : "모바일 ") + (f ? "'" + k + "' + 가격" : "'" + k + "'");
  const plainKey = dev + "|" + k;
  if (f && !ctx.plain[plainKey]) {
    /* 가격 필터가 들어갔는지 보려고 필터 없는 첫 화면을 먼저 봐 둠 */
    await prog(lab + " 준비 중…");
    await nav(urlFor(site, dev, k, false, 1, P));
    const s0 = await scanW({ pid: info.pid, nm: info.name, st: info.seller, quick: true });
    if (s0 && s0.keys) ctx.plain[plainKey] = s0.keys;
  }
  await prog(lab + " 1페이지 확인 중…");
  await nav(urlFor(site, dev, k, f, 1, P));
  let s = await scanW(o);
  if (!s) return { err: "화면을 못 읽음" };
  if (s.blocked) return { blocked: true };
  if (s.error) return { err: "화면 읽기 오류(" + s.error + ") 화면: " + (s.snip || "") };
  if (f) {
    const plain = ctx.plain[plainKey];
    let applied = s.priceChip || (plain && !sameKeys(plain, s.keys));
    if (!applied && site === "naver" && dev === "pc") {
      /* 주소로 가격이 안 들어가면 화면의 가격 칸에 직접 넣고 검색 */
      await nav(urlFor(site, dev, k, false, 1, P));
      await scanW({ pid: info.pid, nm: info.name, st: info.seller });
      const ok = await call(work.tabId, "priceUI", [P.lo, P.hi]);
      if (ok) { await sleep(3000); s = await scanW(o); applied = s && (s.priceChip || (plain && !sameKeys(plain, s.keys))); }
    }
    if (!applied) return { nofilter: true };
  } else ctx.plain[plainKey] = s.keys;
  if (s.n === 0) return { page: 0, seen: 0, empty: true, snip: s.noResult ? "" : s.snip };
  const base = s.url;
  if (dev === "mo") {
    if (s.hit >= 0) return { pos: s.hit + 1, org: s.org, how: s.how, scroll: true };
    /* 계속 내려가지 않고 페이지로 나뉘는 화면이면 다음 페이지 */
    let seen = s.n, prev = s.keys;
    for (let p = 2; p <= MAXP && s.n <= 60; p++) {
      await prog(lab + " " + p + "페이지 확인 중…");
      await nav(pageOf(base, site, dev, p));
      s = await scanW(o);
      if (!s || s.blocked || s.n === 0 || sameKeys(s.keys, prev)) break;
      if (s.hit >= 0) return { page: p, pos: s.hit + 1, org: s.org, how: s.how, scroll: false };
      seen += s.n; prev = s.keys;
    }
    return { page: 0, seen: seen, adOnly: s && s.adHit >= 0 };
  }
  let seen = 0, mode = "url";
  for (let p = 1; p <= MAXP; p++) {
    await prog(lab + " " + p + "/" + MAXP + "페이지 확인 중… (상품 " + (seen + s.n) + "개째)");
    if (s.hit >= 0) return { page: p, pos: s.hit + 1, org: s.org, how: s.how };
    seen += s.n;
    if (p === MAXP) break;
    const prev = s.keys;
    let s2 = null;
    if (mode === "url") {
      await nav(pageOf(base, site, dev, p + 1));
      s2 = await scanW(o);
      if (!s2 || s2.n === 0 || sameKeys(s2.keys, prev)) {
        /* 주소로 다음 페이지가 안 열리는 화면 → 페이지 번호 단추로 */
        mode = "click";
        await nav(base);
        s2 = await scanW(o);
        for (let q = 2; q <= p + 1 && s2; q++) {
          const before = s2.keys;
          if (!(await call(work.tabId, "clickPage", [q]))) { s2 = null; break; }
          await sleep(2500);
          s2 = await scanW(o);
          if (s2 && sameKeys(s2.keys, before)) { s2 = null; break; }
        }
      }
    } else {
      if (await call(work.tabId, "clickPage", [p + 1])) { await sleep(2500); s2 = await scanW(o); }
    }
    if (!s2 || s2.blocked || s2.n === 0 || sameKeys(s2.keys, prev)) return { page: 0, seen: seen, stuck: p };
    s = s2;
  }
  return { page: 0, seen: seen, adOnly: s.adHit >= 0 };
}

async function searchDev(ctx, dev, steps) {
  const log = [];
  for (const st of steps) {
    const [k, f] = st;
    const r = await look(ctx, dev, k, f);
    const lab = f ? "'" + k + "' + 가격" : "'" + k + "'";
    if (r.blocked) { log.push((HARD_BLOCK.test(work.blockSnip || "") ? "쇼핑몰이 접속을 일시적으로 막음 (자동 검색이 많다고 봄). 잠시 뒤 다시" : "쇼핑몰 보안 확인을 5분 안에 못 풀어서 멈춤") + " (화면: " + (work.blockSnip || "") + ")"); return { log: log, blocked: true }; }
    if (r.err) { log.push(lab + " " + r.err); continue; }
    if (r.nofilter) { log.push(lab + " 가격 필터가 안 들어가서 건너뜀"); continue; }
    if (r.page > 0 || r.pos > 0) return { found: Object.assign({ k: k, f: f }, r), log: log };
    log.push(lab + (r.empty ? (r.snip ? " 상품 칸을 못 읽음 (화면: " + r.snip + ")" : " 검색 결과 없음") : r.stuck ? " " + r.stuck + "페이지까지(다음 페이지로 못 넘어감) 상품 " + r.seen + "개" : " 상품 " + r.seen + "개") + (r.adOnly ? " (광고 자리에만 있음)" : ""));
  }
  return { log: log };
}
/* 위치는 'N페이지'만 (사용자 요청). 계속 내려가는 모바일 화면은 광고 뺀 순서로 페이지를 셈 (쿠팡 36개, 네이버 40개씩) */
let PER = 36;
const posText = r => !r ? "" : r.scroll ? Math.max(1, Math.ceil((r.org || r.pos) / PER)) + "페이지" : r.page + "페이지";
/* 가격 필터는 '가검40000' (가검 = 가격검색) */
const gageom = (lo, hi) => "가검" + (lo === hi ? lo : lo + "~" + hi);

/* ---------- 썸네일 저장 ---------- */
async function saveThumb(info) {
  if (!info.img) return { t: "썸네일 주소를 못 찾았어요.", warn: true };
  const ext = ((info.img.match(/\.(png|jpe?g|webp|gif)(\?|$)/i) || [])[1] || "jpg").toLowerCase().replace("jpeg", "jpg");
  const safe = (info.name || "").replace(/[\\/:*?"<>|~#%&{}$!'@+`=^]/g, " ").replace(/\s+/g, " ").trim().slice(0, 30).replace(/[.\s]+$/, "");
  const fn = "체험단_썸네일/" + (safe ? safe + "_" : "") + info.pid + "." + ext;
  try {
    let id = null, fn2 = fn;
    try { id = await chrome.downloads.download({ url: info.img, filename: fn, conflictAction: "overwrite", saveAs: false }); }
    catch (e) { fn2 = "thumbnails/thumb_" + info.pid + "." + ext; id = await chrome.downloads.download({ url: info.img, filename: fn2, conflictAction: "overwrite", saveAs: false }); }   /* 한글 이름이 안 되는 컴퓨터 */
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      const [d] = await chrome.downloads.search({ id: id });
      if (!d) break;
      if (d.state === "complete") return { t: "썸네일 저장됨: 다운로드 폴더 › " + fn2 };
      if (d.state === "interrupted") return { t: "썸네일 저장 실패 (" + d.error + "). 결과 상자의 사진을 우클릭 → 이미지 저장", warn: true };
    }
    return { t: "썸네일 저장 중: 다운로드 폴더 › " + fn2 };
  } catch (e) { return { t: "썸네일 저장 실패 (" + ((e && e.message) || e) + "). 결과 상자의 사진을 우클릭 → 이미지 저장", warn: true }; }
}

/* ---------- 복사 (화면 밖 작은 문서에서) ---------- */
async function copyText(text, tabId) {
  if (tabId) { try { if (await call(tabId, "copy", [text])) return true; } catch (e) {} }
  try {
    try { await chrome.offscreen.createDocument({ url: "offscreen.html", reasons: ["CLIPBOARD"], justification: "결과 복사" }); } catch (e) {}
    const r = await chrome.runtime.sendMessage({ type: "copy", text: text });
    return !!(r && r.ok);
  } catch (e) { self.__copyErr = String((e && e.message) || e); return false; }
}
async function newer() {
  try { const r = await fetch(VER_URL + "?t=" + Date.now(), { cache: "no-store" }); const m = await r.json(); return m.version && m.version !== VERSION && cmpVer(m.version, VERSION) > 0 ? m.version : ""; } catch (e) { return ""; }
}
const cmpVer = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; };

/* ---------- 전체 ---------- */
async function run(tab) {
  const tid = tab.id;
  if (/^https:\/\/(m?search)\.shopping\.naver\.com\//.test(tab.url || "")) return naverHere(tab);
  const info = await call(tid, "readProduct").catch(() => null);
  if (!info) { await ui(tid, { title: "상품 위치 찾기", msg: "이 화면은 읽을 수 없어요. 쿠팡·네이버 상품 페이지에서 눌러 주세요." }); return; }
  if (info.err) { await ui(tid, { title: "상품 위치 찾기", msg: info.err }); return; }
  const site = info.site;
  if (site === "naver") return naverProduct(tab, info);
  PER = 36;
  const h = await tabHash(tab);
  const hk = (h.match(/(?:^|&)kw=([^&]+)/) || [])[1], hp = Number((h.match(/(?:^|&)pr=(\d+)/) || [])[1] || 0);
  const kws = (hk ? decodeURIComponent(hk).split("|") : suggest(info.name)).map(x => x.trim()).filter(Boolean).slice(0, 4);
  const price = hp || info.price || 0;
  /* 가격 필터: 네이버는 그 가격 그대로(40,000~40,000), 쿠팡은 ±10% */
  const P = site === "naver" ? { lo: price, hi: price } : { lo: Math.floor(price * 0.9 / 100) * 100, hi: Math.ceil(price * 1.1 / 100) * 100 };
  const steps = [];
  kws.forEach(k => { steps.push([k, false]); if (price) steps.push([k, true]); });
  const head = "키워드: " + kws.join(" → ") + (hk ? "" : "\n(자동 추천 키워드예요. 의뢰서 키워드로 찾으려면 생성기의 [상품 페이지 열기]로 연 페이지에서 누르세요)") + (price ? "\n가격: " + price.toLocaleString("ko-KR") + "원" : "\n가격을 못 읽어서 가격 필터는 빼고 찾아요");
  const prog = curProg = t => ui(tid, { title: "상품 위치 찾는 중… (창을 닫지 마세요)", msg: head + "\n\n" + t });
  if (!kws.length) { await ui(tid, { title: "상품 위치 찾기", msg: "상품명을 못 읽어서 키워드를 못 만들었어요." }); return; }
  await prog("시작");
  const thumbP = saveThumb(info);
  const verP = newer();
  const ctx = { site: site, info: info, P: P, prog: prog, plain: {} };
  await openWork();
  const pc = await searchDev(ctx, "pc", steps);
  /* 모바일은 PC에서 찾은 키워드·필터 그대로 (공지 한 줄로 둘 다 쓰게). PC에서 못 찾았으면 처음부터 */
  await mobile(true);
  const mo = pc.found ? await searchDev(ctx, "mo", [[pc.found.k, pc.found.f]]) : await searchDev(ctx, "mo", steps);
  await closeWork();
  const F = pc.found || mo.found;
  const mask = s => s && s.length > 8 ? s.slice(0, 6) + "***" + s.slice(-2) : s;
  const filt = F && F.f ? gageom(P.lo, P.hi) : "";
  const out = [
    "상품명 : " + info.name,
    "판매처 : " + info.seller,
    "상품번호 : " + info.pid + (info.item ? " - " + mask(info.item) : ""),
    info.opt ? "옵션 : " + info.opt : "",
    price ? "가격 : " + price.toLocaleString("ko-KR") + "원" : "",
    F ? "찾은 키워드 : " + F.k : "",
    filt ? "필터 : " + filt : "",
    "PC 위치 : " + (pc.found ? posText(pc.found) : "못 찾음"),
    "모바일 위치 : " + (mo.found ? posText(mo.found) : "못 찾음"),
    info.img ? "썸네일 : " + info.img : ""
  ].filter(Boolean).join("\n");
  const notes = [];
  if (!pc.found && pc.log.length) notes.push({ t: "PC 확인한 것: " + pc.log.join(" / "), warn: true });
  if (!mo.found && mo.log.length) notes.push({ t: "모바일 확인한 것: " + mo.log.join(" / "), warn: true });
  [pc.found, mo.found].forEach((r, i) => { if (r && r.how === "상품명") notes.push({ t: (i ? "모바일" : "PC") + ": 상품명으로 찾았어요 (스토어 이름은 화면에 없었음)" }); });
  notes.push(await thumbP);
  const nv = await verP;
  if (nv) notes.push({ t: "새 버전(" + nv + ")이 있어요. 생성기에서 확장 프로그램을 다시 받아 바꿔 주세요.", warn: true });
  try { await chrome.windows.update(tab.windowId, { focused: true }); await chrome.tabs.update(tid, { active: true }); } catch (e) {}
  const copied = await copyText(out, tid);
  const big = (F ? "키워드 : " + F.k + "\n" : "") + "PC " + (filt && pc.found ? filt + " " : "") + (pc.found ? posText(pc.found) : "못 찾음") + "\n모바일 " + (filt && mo.found ? filt + " " : "") + (mo.found ? posText(mo.found) : "못 찾음");
  await ui(tid, { title: copied ? "복사됐어요. 생성기 '상품 정보 붙여넣기' 칸에 Ctrl+V" : "복사를 눌러서 생성기 '상품 정보 붙여넣기' 칸에 붙여넣으세요", big: big, out: out, copied: copied, notes: notes, img: info.img });
  return out;
}

/* ================= 네이버 (자동 넘기기 없이, 지금 화면만 읽기) ================= */
const mask2 = s => s && s.length > 8 ? s.slice(0, 6) + "***" + s.slice(-2) : s;
const infoLines = t => ["상품명 : " + t.name, "판매처 : " + t.seller, "상품번호 : " + t.pid + (t.item ? " - " + mask2(t.item) : ""), t.opt ? "옵션 : " + t.opt : "", t.price ? "가격 : " + t.price.toLocaleString("ko-KR") + "원" : "", t.img ? "썸네일 : " + t.img : ""].filter(Boolean);
const nvSearchUrl = (k, mob) => (mob ? "https://msearch.shopping.naver.com" : "https://search.shopping.naver.com") + "/search/all?query=" + encodeURIComponent(k);
const won = n => Number(n).toLocaleString("ko-KR");

async function naverProduct(tab, info) {
  const h = await tabHash(tab);
  const hk = (h.match(/(?:^|&)kw=([^&]+)/) || [])[1], hp = Number((h.match(/(?:^|&)pr=(\d+)/) || [])[1] || 0);
  const kws = (hk ? decodeURIComponent(hk).split("|") : suggest(info.name)).map(x => x.trim()).filter(Boolean).slice(0, 4);
  const price = hp || info.price || 0;
  const t = Object.assign({}, info, { kws: kws, price: price, at: Date.now() });
  await chrome.storage.local.set({ nvTarget: t });
  const thumb = await saveThumb(info);
  const out = infoLines(t).join("\n");
  const copied = await copyText(out, tab.id);
  await ui(tab.id, { title: "상품 정보 " + (copied ? "복사됨" : "") + " · 네이버 검색 탭을 열었어요", out: out, copied: copied, img: info.img,
    msg: "네이버는 자동으로 여러 페이지를 넘기면 접속을 막아서, 검색 화면은 한 화면씩 확인해요.\n새 탭의 검색 화면에서 상품을 찾아 표시해 드려요.\n순서: " + kws.map(k => "'" + k + "'" + (price ? " → '" + k + "' + 가격 " + won(price) + "원" : "")).join(" → "),
    notes: [thumb] });
  const nt = await chrome.tabs.create({ url: nvSearchUrl(kws[0], false), index: tab.index + 1, active: true });
  await waitComplete(nt.id, 25000);
  await sleep(2000);
  return naverHere(nt);
}

/* 지금 보고 있는 네이버 검색 화면에서 찾기 */
async function naverHere(tab) {
  const tid = tab.id;
  const { nvTarget: t } = await chrome.storage.local.get("nvTarget");
  if (!t) { await ui(tid, { title: "상품 위치 찾기", msg: "먼저 네이버 상품 페이지(스마트스토어)에서 아이콘을 눌러 주세요. 그 상품을 이 화면에서 찾아요." }); return; }
  await ui(tid, { title: "이 화면에서 찾는 중…", msg: "아래로 내리면서 '" + t.name.slice(0, 30) + "'를 찾고 있어요." });
  const mob = /msearch|^https:\/\/m\./.test(tab.url || "");
  const s = await call(tid, "scan", [{ pid: t.pid, nm: t.name, st: t.seller, scroll: mob, max: 200 }]);
  if (!s || s.error) { await ui(tid, { title: "화면을 못 읽었어요", msg: (s && s.error) || "" , notes: [{ t: "화면: " + ((s && s.snip) || ""), warn: true }] }); return; }
  if (s.blocked) {
    await ui(tid, { title: "네이버가 접속을 막아 둔 상태예요", msg: "자동 검색이 많았다고 보고 잠깐 막은 거예요. 시간이 지나면 풀려요(보통 몇 시간 안).\n그동안은 자동으로 넘기지 말고, 풀린 뒤에 이 화면에서 아이콘을 다시 눌러 주세요.\n계속 안 풀리면 화면의 '원클릭 진단'을 눌러 보세요." });
    return;
  }
  const h = await call(tid, "here");
  const plan = [];
  t.kws.forEach(k => { plan.push([k, false]); if (t.price) plan.push([k, true]); });
  const filtered = !!(h.lo && h.hi);
  if (s.hit >= 0) {
    await call(tid, "mark", [s.hit]);
    const pos = mob ? Math.max(1, Math.ceil(s.org / 40)) + "페이지" : h.page + "페이지";
    const out = infoLines(t).concat([h.query ? "찾은 키워드 : " + h.query : "", filtered ? "필터 : " + gageom(h.lo, h.hi) : "", s.similar ? "주의 : 비슷한 상품 많음" : "", (mob ? "모바일 위치 : " : "PC 위치 : ") + pos]).filter(Boolean).join("\n");
    const copied = await copyText(out, tid);
    await ui(tid, { title: copied ? "찾았어요! 복사됐어요. 생성기 '상품 정보 붙여넣기' 칸에 Ctrl+V" : "찾았어요! 복사를 눌러 생성기에 붙여넣으세요", big: "키워드 : " + h.query + "\n위치 : " + (filtered ? gageom(h.lo, h.hi) + " " : "") + pos + (s.similar ? "\n(비슷한 상품 많음 → 공지에 '판매처, 가격 보고 구매' 안내가 붙어요)" : ""), out: out, copied: copied,
      notes: [{ t: "분홍 테두리가 찾은 상품이에요." + (s.how === "상품명" ? " (상품명으로 찾음, 스토어 이름은 화면에 없었음)" : "") }, mob ? null : { t: "모바일 위치는 휴대폰에서 북마크로 확인해 주세요." }].filter(Boolean) });
    return;
  }
  /* 없으면 다음 할 일 단추 */
  const idx = plan.findIndex(p => p[0] === h.query && p[1] === filtered);
  const nextStep = plan[(idx >= 0 ? idx : -1) + 1];
  const actions = [];
  if (!mob && h.page < MAXP) actions.push({ label: "다음 페이지 (" + (h.page + 1) + "페이지) 보고 다시 찾기", act: "next" });
  if (nextStep) actions.push(nextStep[1] ? { label: "가격 " + won(t.price) + "~" + won(t.price) + "원 넣고 다시 찾기", act: "price" } : { label: "'" + nextStep[0] + "' 검색하고 다시 찾기", act: "kw:" + nextStep[0], color: "#5b2a86" });
  await ui(tid, { title: "이 화면" + (mob ? "" : "(" + h.page + "페이지)") + "에는 없어요", msg: "검색어 '" + (h.query || "?") + "'" + (filtered ? ", 가격 " + won(h.lo) + "~" + won(h.hi) + "원" : "") + ", 상품 " + s.n + "개 확인" + (s.adHit >= 0 ? " (광고 자리에만 있어요)" : "") + (s.n === 0 ? "\n화면: " + (s.snip || "") : ""),
    actions: actions, notes: [{ t: "단추를 누르면 한 화면만 넘기고 다시 찾아요. 너무 빨리 여러 번 누르지 마세요(네이버가 막아요)." }] });
}

async function naverAct(tab, act) {
  const tid = tab.id;
  const { nvTarget: t } = await chrome.storage.local.get("nvTarget");
  const h = await call(tid, "here");
  const mob = h && h.mob;
  await ui(tid, { title: "넘기는 중…", msg: "" });
  if (act === "next") {
    const ok = await call(tid, "clickPage", [h.page + 1]);
    if (!ok) { const u = new URL(tab.url); u.searchParams.set("pagingIndex", h.page + 1); const p = waitComplete(tid, 25000); await chrome.tabs.update(tid, { url: u.href }); await p; }
  } else if (act === "price") {
    const ok = await call(tid, "priceUI", [t.price, t.price]);
    if (!ok) { const u = new URL(tab.url); u.searchParams.set("minPrice", t.price); u.searchParams.set("maxPrice", t.price); u.searchParams.delete("pagingIndex"); const p = waitComplete(tid, 25000); await chrome.tabs.update(tid, { url: u.href }); await p; }
  } else if (act.indexOf("kw:") === 0) {
    const p = waitComplete(tid, 25000); await chrome.tabs.update(tid, { url: nvSearchUrl(act.slice(3), mob) }); await p;
  }
  await sleep(3500);
  const [cur] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return naverHere(cur && cur.id === tid ? cur : await chrome.tabs.get(tid));
}
