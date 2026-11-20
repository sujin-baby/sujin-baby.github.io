// 네이버 상품 페이지에서 확장 프로그램이 '탭만 열리고 멈춘 것처럼' 보이던 것 (11/20 사용자 제보)
//  확장 1.8.6: ① page.js 네이버 readProduct()의 `parts is not defined` ② autoRun이 네이버라는 이유만으로 탭을 닫던 것
//  확장 1.8.7: ③ run()이 readProduct 오류를 .catch(() => null)로 뭉개 '이유 없이 멈춤'으로 보이던 것 → 실제 오류를 생성기·결과 상자에
//              ④ 상품명 빈칸 재시도가 쿠팡에만 → 네이버 스마트스토어(백그라운드 탭 지연 렌더)까지
//              ⑤ waitComplete가 이미 다 뜬 탭에서 25초를 그냥 세던 것 → 바로 통과
//              ⑥ autoRun이 상품 페이지가 아닌 주소(shopping.naver.com·naver.me)를 주소와 함께 알려 주고, 도중에 터지면 탭을 앞으로
//              ⑦ page.js readProduct가 body 없음·빈 화면에서도 예외를 안 던짐
//  확장 1.8.8 (사용자 요청 "키워드가 마음에 안 들면 검색 키워드 내가 정할 수 있게"):
//              ⑧ 결과 상자에 키워드 입력칸 + [이 키워드로 찾기] → customkw: 액션
//              ⑨ 네이버는 그 키워드로 다시 검색(naverAct), 쿠팡 검색 화면은 그 키워드로 검색해 읽기, 상품 페이지는 그 키워드로 처음부터(start)
//  생성기 v204 (사용자 요청 "모바일 Userscripts·북마크에도"):
//              ⑩ 북마크 코드(bm-src)·oy.js 결과 상자에도 같은 입력칸 + [이 키워드로 찾기] — 모바일은 background가 없어
//                 네이버·쿠팡 검색 화면은 주소의 검색어만 바꾼 1페이지로 넘기고, 쿠팡 상품 페이지는 그 화면에서 1~5페이지 다시 훑음
//  node naverprod_test.js <Main.js>
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..', '..');
const bg = fs.readFileSync(path.join(root, 'ori/ext/bg.js'), 'utf8');
const pg = fs.readFileSync(path.join(root, 'ori/ext/page.js'), 'utf8');
const oy = fs.readFileSync(path.join(root, 'ori/ext/oy.js'), 'utf8');
const man = JSON.parse(fs.readFileSync(path.join(root, 'ori/ext/manifest.json'), 'utf8'));
const gen = fs.readFileSync(path.join(root, 'guide/index.html'), 'utf8');
const fails = [], ok = (c, m) => { if (!c) fails.push(m); console.log((c ? '✓ ' : '✗ ') + m); };
/* zip 안 파일 꺼내기 (압축된 채로는 글자를 못 찾음) — 중앙 디렉터리를 읽어 deflate 풀기 */
function zipRead(buf) {
  const zlib = require('zlib'), out = {};
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) return out;
  const n = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10), csize = buf.readUInt32LE(off + 20);
    const nlen = buf.readUInt16LE(off + 28), elen = buf.readUInt16LE(off + 30), clen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const name = buf.slice(off + 46, off + 46 + nlen).toString('utf8');
    const ln = buf.readUInt16LE(lho + 26), le = buf.readUInt16LE(lho + 28);
    const ds = lho + 30 + ln + le, data = buf.slice(ds, ds + csize);
    out[name] = method === 8 ? zlib.inflateRawSync(data).toString('utf8') : data;
    off += 46 + nlen + elen + clen;
  }
  return out;
}
function fnSrc(s, head) {
  const a = s.indexOf(head); if (a < 0) throw new Error('못 찾음: ' + head);
  let i = s.indexOf('{', a), d = 0;
  for (; i < s.length; i++) { if (s[i] === '{') d++; else if (s[i] === '}' && --d === 0) return s.slice(a, i + 1); }
  throw new Error('짝 안 맞음: ' + head);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- 최소 DOM (11/20 '전체 1' 화면 시험용) ----------
   page.js의 scan()을 진짜로 돌리려고 querySelectorAll/closest/contains/compareDocumentPosition만 흔내 낸 가짜 DOM */
function splitTop(s) {
  const out = []; let cur = "", d = 0;
  for (const ch of s) { if (ch === "[") d++; if (ch === "]") d--; if (/\s/.test(ch) && d === 0) { if (cur) out.push(cur); cur = ""; } else cur += ch; }
  if (cur) out.push(cur);
  return out;
}
function compoundMatch(e, c) {
  const parts = c.match(/^[a-zA-Z][\w-]*|[#.][\w-]+|\[[^\]]*\]|\*/g) || [];
  if (!parts.length) return false;
  for (const p of parts) {
    if (p === "*") continue;
    if (p[0] === "#") { if (e.a.id !== p.slice(1)) return false; }
    else if (p[0] === ".") { if ((e.a.class || "").split(/\s+/).indexOf(p.slice(1)) < 0) return false; }
    else if (p[0] === "[") {
      const mm = p.slice(1, -1).match(/^([\w-]+)\s*([*^]?=)?\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+))?$/);
      if (!mm) return false;
      const v = e.a[mm[1]];
      if (v === undefined) return false;
      if (!mm[2]) continue;
      const want = mm[3] !== undefined ? mm[3] : mm[4] !== undefined ? mm[4] : (mm[5] || "");
      if (mm[2] === "*=") { if (String(v).indexOf(want) < 0) return false; }
      else if (mm[2] === "^=") { if (String(v).indexOf(want) !== 0) return false; }
      else if (String(v) !== want) return false;
    } else if (e.t !== p.toLowerCase()) return false;
  }
  return true;
}
function selMatch(e, sel) {
  for (const part of String(sel).split(",")) {
    const chain = splitTop(part.trim());
    if (!chain.length || !compoundMatch(e, chain[chain.length - 1])) continue;
    let ok = true, n = e.parentElement;
    for (let i = chain.length - 2; i >= 0; i--) {
      let found = null;
      for (; n; n = n.parentElement) if (compoundMatch(n, chain[i])) { found = n; n = n.parentElement; break; }
      if (!found) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}
function queryAll(root, sel) {
  const out = [];
  (function walk(n) { (n.k || []).forEach(x => { if (typeof x === "string") return; if (selMatch(x, sel)) out.push(x); walk(x); }); })(root);
  return out;
}

/* ---------- 1) page.js 네이버 readProduct(): 최소 DOM mock으로 실제 실행 ---------- */
const NM = '에큐어 젊음크림 노화억제크림 주름개선 탭력 50ml', ST = '에큐어샵', PID = '1234567890';
const TITLE = NM + ' : ' + ST;
const TXT = [NM, '50ml', '29,900원', '배송비 3,000원'].join('\n');
/* o.bare: 제목·og·JSON-LD·h1이 하나도 없는 화면(아직 안 그려진 스마트스토어), o.noBody: body가 아직 없음, o.text: body 글자 */
function naverPage(o) {
  o = o || {};
  const ogMap = o.bare ? {} : { title: TITLE, site_name: '네이버 스마트스토어', image: '//shop-phinf.pstatic.net/a.jpg' };
  const ld = o.bare ? null : { '@context': 'https://schema.org', '@type': 'Product', name: NM, brand: { '@type': 'Brand', name: '에큐어' } };
  const document = {
    title: o.bare ? '' : TITLE,
    querySelector(sel) {
      const m = String(sel).match(/^meta\[property="og:(\w+)"\]$/);
      if (m) return ogMap[m[1]] != null ? { content: ogMap[m[1]] } : null;
      return null;
    },
    querySelectorAll(sel) {
      if (/application\/ld\+json/.test(sel)) return ld ? [{ textContent: JSON.stringify(ld) }] : [];
      if (/^h1, h2, h3/.test(sel)) return o.bare ? [] : [{ innerText: NM, children: [], querySelector: () => null }];
      return [];
    },
    documentElement: { innerHTML: '<script>window.__S={"discountedSalePrice":29900,"salePrice":39000};</script>' },
    body: o.noBody ? null : { innerText: o.text != null ? o.text : TXT },
    createElement: () => ({ style: {}, appendChild() {}, setAttribute() {}, remove() {} })
  };
  const location = { href: 'https://smartstore.naver.com/ecureshop/products/' + PID, hostname: 'smartstore.naver.com', pathname: '/ecureshop/products/' + PID, search: '' };
  const window = {};
  const ctx = { window, document, location, navigator: { userAgent: 'Mozilla/5.0 (Macintosh)' }, setTimeout, clearTimeout, console, URL, URLSearchParams, Node: { DOCUMENT_POSITION_FOLLOWING: 4 } };
  vm.createContext(ctx);
  vm.runInContext(pg, ctx);
  return ctx;
}
const readProductOf = ctx => {
  let r = null, err = null;
  try { r = vm.runInContext('window.__PL.readProduct()', ctx); } catch (e) { err = e; }
  return { r, err };
};
{
  const { r, err } = readProductOf(naverPage());
  ok(!err, "page.js 네이버 readProduct()가 예외 없이 끝남 ('parts is not defined' 재발 금지): " + (err && err.message));
  ok(r && r.site === 'naver', '네이버 상품 페이지 → site: naver (' + JSON.stringify(r && r.site) + ')');
  ok(r && r.pid === PID, '상품번호 ' + PID + ' (' + (r && r.pid) + ')');
  ok(r && r.name === NM, '상품명 (' + (r && r.name) + ')');
  ok(r && r.seller === ST, '판매처 — title 마지막 칸 (' + (r && r.seller) + ')');
  ok(r && r.price === 29900, '가격 29900 (' + (r && r.price) + ')');
  ok(r && !r.err, 'err 없음 (' + (r && r.err) + ')');
}

/* ---------- 2) 미선언 변수(parts) 재발 방지: 쓰기 전에 만들었는지 (page.js·oy.js) ---------- */
{
  const rp = fnSrc(pg, 'function readProduct_(');
  ok(rp.indexOf('const parts') > 0 && rp.indexOf('const parts') < rp.indexOf('parts.length'), 'page.js: 네이버 readProduct()가 parts를 쓰기 전에 만듦');
  ok(oy.indexOf('const parts') > 0 && oy.indexOf('const parts') < oy.indexOf('parts.length'), 'oy.js: parts를 쓰기 전에 만듦');
  ok(/const parts = \(document\.title \|\| ""\)\.split\(\/\\s\+:\\s\+\/\);/.test(pg), 'page.js: title이 없어도 안 터지게 (document.title || "")');
}

/* ---------- 3) page.js: body가 없거나 화면이 비어도 readProduct가 예외를 안 던짐 (1.8.7) ---------- */
{
  const { r, err } = readProductOf(naverPage({ noBody: true, bare: true }));
  ok(!err, 'body가 없고 화면이 빈 상태에서도 예외 없음 (' + (err && err.message) + ')');
  ok(r && r.site === 'naver' && r.pid === PID, '그래도 site·상품번호는 읽음 (' + (r && r.site) + ' / ' + (r && r.pid) + ')');
  ok(r && !r.err && r.name === '', '상품명이 빈칸이면 err가 아니라 빈칸으로 — bg run()이 1초씩 다시 읽음 (' + JSON.stringify(r && r.name) + ' / err=' + (r && r.err) + ')');
  ok(r && r.price === 29900 && r.ship !== undefined, '가격·배송비도 터지지 않음 (' + (r && r.price) + ')');
}
{
  const { r, err } = readProductOf(naverPage({ text: '' }));
  ok(!err && r && r.name === NM, 'body 글자가 비어도 제목(og:title)으로 읽음 (' + (r && r.name) + ')');
}
{
  /* readProduct는 어떤 예외도 밖으로 던지지 않고 err로 돌려줌 (wrapper) */
  ok(/function readProduct\(\)\s*\{\s*try \{ return readProduct_\(\); \}/.test(pg), 'page.js: readProduct()가 try로 감싸 이유를 err로 돌려줌');
}

/* ---------- 4) bg.js run(): readProduct 오류를 뭉개지 않고 보여 주고, 네이버도 빈 상품명이면 다시 읽음 (1.8.7) ---------- */
const NVURL = 'https://smartstore.naver.com/ecureshop/products/' + PID;
function runRun(opt) {
  const statuses = [], uis = [], seen = [];
  let calls = 0;
  const ctx = {
    console, URL, URLSearchParams, Date, Promise, setTimeout, clearTimeout,
    call: async (tid, name) => { calls++; if (name !== 'readProduct') return null; const r = opt.read(calls - 1); if (r instanceof Error) throw r; return r; },
    pushGen: m => { if (m && m.status) statuses.push(m.status); },
    ui: async (id, s) => { uis.push(s); if (s && s.title) statuses.push(s.title + (s.msg ? ' · ' + String(s.msg).split('\n')[0] : '')); return null; },
    naverProduct: async (tab, info, ov) => { seen.push({ info: info, ov: ov }); return true; },
    naverHere: async () => {}, coupangHere: async () => {},
    tabHash: async () => '', fnOf: () => '', keepFn: async () => {}, suggest: n => [n].filter(Boolean),
    sleep: async () => {}, chrome: { scripting: { executeScript: async () => {} } }
  };
  vm.createContext(ctx);
  vm.runInContext(fnSrc(bg, 'async function run('), ctx);
  ctx.__tab = { id: 5, index: 1, windowId: 1, url: opt.url || NVURL };
  vm.runInContext('globalThis.__r = run(globalThis.__tab' + (opt.kw ? ', ' + JSON.stringify(opt.kw) : '') + ')', ctx);
  return vm.runInContext('globalThis.__r', ctx).then(r => ({ r, statuses, uis, seen, calls: () => calls }));
}
(async () => {
  {
    const x = await runRun({ read: () => new Error('parts is not defined') });
    ok(x.statuses.some(s => s.indexOf('parts is not defined') >= 0), "readProduct가 터지면 그 오류 글자로 생성기 상태를 남김: " + JSON.stringify(x.statuses[0] || ''));
    ok(x.uis.length === 1 && String(x.uis[0].msg).indexOf('parts is not defined') >= 0, '결과 상자에도 같은 오류를 보여 줌: ' + String((x.uis[0] || {}).msg).slice(0, 60));
    ok(x.calls() > 1, '네이버 상품 페이지는 빈 값·오류면 한 번 더 읽음 (' + x.calls() + '번)');
    ok(x.r === undefined && !x.seen.length, '못 읽었으면 검색을 시작하지 않음(엉뚱한 키워드로 열지 않음)');
  }
  {
    let n = 0;
    const x = await runRun({ read: i => (i < 3 ? { site: 'naver', name: '', seller: '', pid: PID, price: 0 } : { site: 'naver', name: NM, seller: ST, pid: PID, price: 29900 }) });
    ok(x.calls() === 4, '네이버에서 상품명이 빈칸이면 화면이 그려질 때까지 다시 읽음 (4번째에 읽음: ' + x.calls() + '번)');
    ok(x.r === true && x.seen.length === 1 && x.seen[0].info.name === NM, '다 읽은 뒤에 검색 탭 열기로 넘어감 (' + JSON.stringify(x.seen.map(i => i.info.name)) + ')');
    n = 0;
  }
  {
    /* 이미 다 읽힌 화면은 한 번만 읽음 */
    let cnt = 0;
    const x = await runRun({ read: () => { cnt++; return { site: 'naver', name: NM, seller: ST, pid: PID, price: 29900 }; } });
    ok(x.calls() === 1, '상품명이 바로 읽히면 다시 읽지 않음 (' + x.calls() + '번)');
  }
  {
    /* 쿠팡 화면이 아닌 곳(예: about:blank)은 다시 읽지 않음 */
    const x = await runRun({ url: 'https://example.com/x', read: () => { throw new Error('No body'); } });
    ok(x.calls() === 1, '쿠팡·네이버가 아닌 화면은 한 번만 읽고 안내 (' + x.calls() + '번)');
  }
  ok(fnSrc(bg, 'async function run(').indexOf('"readProduct").catch(() => null)') < 0, 'run(): readProduct 오류를 .catch(() => null)로 삼키지 않음');
  ok(/const late = \/\(coupang\\\.com\|naver\\\.com\)\/\.test/.test(fnSrc(bg, 'async function run(')), 'run(): 빈 상품명 재시도가 쿠팡·네이버 둘 다에 걸림');

  /* ---------- 5) bg.js waitComplete: 이미 다 뜬 탭은 25초를 기다리지 않음 (1.8.7) ---------- */
  function wcCtx(status) {
    const ls = [];
    const ctx = {
      console, Promise, setTimeout, clearTimeout,
      chrome: { tabs: { get: async () => ({ id: 7, status }), onUpdated: { addListener: f => ls.push(f), removeListener: () => {} } } }
    };
    vm.createContext(ctx);
    vm.runInContext(fnSrc(bg, 'async function waitComplete('), ctx);
    vm.runInContext(fnSrc(bg, 'function waitCompleteEvent('), ctx);
    return { ctx, ls };
  }
  {
    const { ctx, ls } = wcCtx('complete');
    const t0 = Date.now();
    await vm.runInContext('waitComplete(7, 25000)', ctx);
    const ms = Date.now() - t0;
    ok(ms < 500, 'waitComplete: 이미 다 뜬 탭은 25초를 안 기다리고 바로 통과 (' + ms + 'ms)');
    ok(ls.length === 0, 'waitComplete: 그때는 complete 신호를 안 기다림');
  }
  {
    const { ctx, ls } = wcCtx('loading');
    const p = vm.runInContext('waitComplete(7, 5000)', ctx);
    let done = false; p.then(() => { done = true; });
    await sleep(60);
    ok(!done && ls.length === 1, 'waitComplete: 아직 안 떴으면 complete 신호를 기다림');
    ls[0](7, { status: 'complete' });
    await p;
    ok(done, 'waitComplete: complete가 오면 넘어감');
  }
  ok(/const p = waitCompleteEvent\(work\.tabId, 25000\)/.test(bg) && /waitCompleteEvent\(tid, 25000\)/.test(bg), '주소를 넘기는 곳은 미리 걸어 두는 waitCompleteEvent를 씀 (complete를 놓치지 않게)');

  /* ---------- 6) bg.js autoRun: 실패·엉뚱한 주소에서 이유를 남기고 탭을 보여 줌 ---------- */
  function runAutoX(opt) {
    const removed = [], updated = [], pushed = [], uis = [], created = [];
    const chrome = {
      tabs: {
        create: async o => { const t = { id: 99, windowId: 1, index: 0, url: o.url, status: 'complete' }; created.push(t); return t; },
        get: async () => ({ id: 99, windowId: 1, index: 0, url: opt.url, status: 'complete' }),
        remove: async id => { removed.push(id); },
        update: async (id, o) => { updated.push([id, o]); return { id: id }; }
      }
    };
    const ctx = {
      chrome, console, URL, URLSearchParams, Date, setTimeout, clearTimeout, Promise,
      busy: false, busySince: 0, autoTab: 0, cancel: false,
      sleep: async () => {}, pushGen: m => { if (m && m.status) pushed.push(m.status); }, keepFn: async () => {}, fnOf: () => '',
      autoOy: async () => true,
      start: async () => { if (opt.startThrows) throw new Error(opt.startThrows); return opt.out; },
      ui: async (id, s) => { uis.push(s); return null; }
    };
    vm.createContext(ctx);
    vm.runInContext(fnSrc(bg, 'async function autoRun('), ctx);
    const p = vm.runInContext('autoRun("' + opt.url + '", { windowId: 1, index: 0 })', ctx);
    return Promise.resolve(p).then(() => ({ removed, updated, pushed, uis, created }));
  }
  {
    const r = await runAutoX({ url: NVURL, out: undefined });            // 네이버인데 상품 정보를 못 읽어 실패(out 없음)
    ok(r.removed.indexOf(99) < 0, '실패했으면 네이버 상품 탭을 닫지 않음 (닫음: ' + JSON.stringify(r.removed) + ')');
    ok(r.updated.some(u => u[0] === 99 && u[1] && u[1].active === true), '실패했으면 상품 탭을 활성 탭으로 보여 줌');
    ok(r.pushed.indexOf('상품 페이지 여는 중…') === 0, '진행 상태: 상품 페이지 여는 중… (' + JSON.stringify(r.pushed[0]) + ')');
    ok(r.pushed.some(s => s.indexOf('상품 정보 읽는 중…') === 0), '진행 상태: 상품 정보 읽는 중… (백그라운드에서 멈춘 것처럼 보이지 않게): ' + JSON.stringify(r.pushed));
  }
  {
    const r = await runAutoX({ url: NVURL, out: true });                 // 성공
    ok(r.removed.indexOf(99) >= 0, '성공했으면 상품 탭을 닫음 (검색 탭이 앞에 남음)');
  }
  {
    const r = await runAutoX({ url: NVURL, out: '상품 정보 결과글' });   // 쿠팡처럼 결과 글을 돌려주는 성공
    ok(r.removed.indexOf(99) >= 0, '결과 글을 받은 성공도 상품 탭을 닫음');
  }
  {
    const r = await runAutoX({ url: 'https://shopping.naver.com/catalog/123456', out: true });   // 상품 페이지가 아님
    ok(r.removed.indexOf(99) < 0 && r.updated.some(u => u[1] && u[1].active === true), '상품 페이지가 아니면 탭을 닫지 않고 앞으로 보여 줌');
    ok(r.pushed.some(s => s.indexOf('상품 페이지가 안 열렸어요') === 0 && s.indexOf('shopping.naver.com/catalog/123456') > 0), '왜 안 됐는지 주소까지 넣어 알려 줌: ' + JSON.stringify(r.pushed.filter(s => s.indexOf('안 열렸') >= 0)));
    ok(r.pushed.some(s => s.indexOf('상품 페이지 기다리는 중… (5초)') === 0), '오래 걸려도 멈춘 것처럼 보이지 않게 5초마다 진행 상태를 보냄: ' + JSON.stringify(r.pushed.filter(s => s.indexOf('기다리는') >= 0).slice(0, 3)));
  }
  {
    const r = await runAutoX({ url: NVURL, startThrows: 'parts is not defined' });   // 도중에 터짐
    ok(r.pushed.some(s => s.indexOf('멈췄어요: parts is not defined') === 0 && s.indexOf(NVURL) > 0), '도중에 터지면 오류와 그때 주소를 남김: ' + JSON.stringify(r.pushed.filter(s => s.indexOf('멈췄') >= 0)));
    ok(r.updated.some(u => u[1] && u[1].active === true) && r.uis.length === 1, '터진 탭을 앞으로 보여 주고 결과 상자에 이유를 띄움');
  }
  ok(!/out \|\| isNv/.test(bg) && !/const isNv = \/naver/.test(fnSrc(bg, 'async function autoRun(')), 'autoRun: 네이버라는 이유만으로 닫던 조건(out || isNv) 없음');

  {
    /* 사용자가 직접 정한 키워드로 다시 찾기 (1.8.8) */
    const x = await runRun({ read: () => ({ site: 'naver', name: NM, seller: ST, pid: PID, price: 29900 }), kw: ['겨울모자'] });
    ok(x.r === true && x.seen.length === 1 && JSON.stringify(x.seen[0].ov) === JSON.stringify(['겨울모자']), 'run(): 사용자 키워드가 있으면 그걸 naverProduct에 넘김 (' + JSON.stringify(x.seen[0] && x.seen[0].ov) + ')');
  }
  ok(/kwOverride && kwOverride\.length/.test(fnSrc(bg, 'async function run(')), 'run(): 사용자 키워드를 자동 추천보다 먼저 씀 (쿠팡도 같은 길)');
  ok(/async function start\(tab, kwOverride\)/.test(bg) && /return await run\(tab, kwOverride\)/.test(bg), 'start(tab, kwOverride) → run(tab, kwOverride)');

  /* ---------- 7-2) bg.js customKw: 어디서 누르든 그 키워드로 다시 찾음 ---------- */
  function runCustomKw(tabUrl, act) {
    const calls = [], uis = [];
    const ctx = {
      console, Date, Promise, setTimeout, clearTimeout, URL, URLSearchParams, busy: false, busySince: 0,
      pushGen: () => {}, ui: async (id, s) => { uis.push(s); return null; },
      naverAct: async (tab, a) => { calls.push(['naverAct', tab.id, a]); },
      coupangHere: async tab => { calls.push(['coupangHere', tab.id]); return 'here'; },
      start: async (tab, kw) => { calls.push(['start', tab.id, kw]); },
      waitCompleteEvent: async () => {}, sleep: async () => {},
      urlFor: (site, dev, k) => 'https://www.coupang.com/np/search?q=' + encodeURIComponent(k) + '&dev=' + dev,
      chrome: { tabs: { update: async (id, o) => { calls.push(['update', id, o.url]); return { id: id }; }, get: async () => ({ id: 5, url: tabUrl, status: 'complete' }) } }
    };
    vm.createContext(ctx);
    vm.runInContext(fnSrc(bg, 'async function customKw('), ctx);
    ctx.__tab = { id: 5, url: tabUrl };
    return Promise.resolve(vm.runInContext('customKw(__tab, ' + JSON.stringify(act) + ')', ctx)).then(() => ({ calls, uis }));
  }
  {
    const r = await runCustomKw('https://search.shopping.naver.com/search/all?query=A', 'customkw:겨울모자');
    ok(r.calls.length === 1 && r.calls[0][0] === 'naverAct' && r.calls[0][2] === 'customkw:겨울모자', '네이버 검색 화면: 그 키워드로 다시 찾기로 넘김 (' + JSON.stringify(r.calls) + ')');
  }
  {
    const r = await runCustomKw('https://www.coupang.com/np/search?q=A', 'customkw:겨울모자');
    ok(r.calls.some(c => c[0] === 'update' && String(c[2]).indexOf(encodeURIComponent('겨울모자')) >= 0), '쿠팡 검색 화면: 그 키워드로 검색한 화면을 엶 (' + JSON.stringify(r.calls.filter(c => c[0] === 'update')) + ')');
    ok(r.calls.some(c => c[0] === 'coupangHere'), '쿠팡 검색 화면: 연 뒤 그 화면에서 상품을 찾음');
  }
  {
    const r = await runCustomKw(NVURL, 'customkw: 겨울 모자 ');
    ok(r.calls.some(c => c[0] === 'start' && JSON.stringify(c[2]) === JSON.stringify(['겨울 모자'])), '상품 페이지: 그 키워드로 처음부터 다시 찾음 (공백 정리, ' + JSON.stringify(r.calls) + ')');
  }
  {
    const r = await runCustomKw(NVURL, 'customkw:   ');
    ok(r.uis.length === 1 && String(r.uis[0].title).indexOf('키워드를 넣어 주세요') >= 0 && !r.calls.length, '빈 키워드면 안내만 하고 아무것도 안 함');
  }
  {
    /* naverAct: 그 키워드로 네이버 검색 주소를 열고 naverHere, nvTarget.kws 맨 앞에 넣음 */
    const calls = [], pushed = [];
    let saved = null;
    const ctx = {
      console, Date, Promise, setTimeout, clearTimeout, URL, URLSearchParams,
      chrome: { storage: { local: { get: async () => ({ nvTarget: { kws: ['A', 'B'], price: 29900 } }), set: async o => { saved = o.nvTarget; calls.push(['set']); } } },
        tabs: { update: async (id, o) => { calls.push(['update', o.url]); return { id: id }; }, get: async () => ({ id: 5, url: 'https://search.shopping.naver.com/search/all?query=%EA%B2%A8%EC%9A%B8%EB%AA%A8%EC%9E%90' }) } },
      ui: async () => null, pushGen: m => { if (m && m.status) pushed.push(m.status); },
      waitCompleteEvent: async () => {}, sleep: async () => {},
      nvSearchUrl: (k, mob) => 'https://search.shopping.naver.com/search/all?query=' + encodeURIComponent(k),
      naverHere: async tab => { calls.push(['here', tab.id]); return 'H'; }
    };
    vm.createContext(ctx);
    vm.runInContext(fnSrc(bg, 'async function naverAct('), ctx);
    const r = await vm.runInContext('naverAct({ id: 5, url: "https://search.shopping.naver.com/search/all?query=A" }, "customkw:겨울모자")', ctx);
    ok(r === 'H', 'naverAct customkw: 그 키워드로 다시 찾고 naverHere를 부름 (' + JSON.stringify(r) + ')');
    ok(calls.some(c => c[0] === 'update' && c[1].indexOf(encodeURIComponent('겨울모자')) >= 0), '그 키워드로 네이버 검색 주소를 엶');
    ok(saved && saved.kws[0] === '겨울모자' && saved.kws.indexOf('A') >= 0 && saved.kws.length === 3, 'nvTarget.kws 맨 앞에 사용자 키워드 (이어지는 [다음 키워드]·가격 단추도 이 키워드 기준): ' + JSON.stringify(saved && saved.kws));
    ok(pushed.some(t => t.indexOf('겨울모자') >= 0), '생성기에도 진행 상태를 보냄');
  }

  /* ---------- 8) bg.js naverProduct: 검색 탭을 열고 찾기까지 가면 true ---------- */
  function runNaver(info, kws, ov) {
    const created = [], order = [], pushed = [];
    const ctx = {
      console, URL, URLSearchParams, Date, Promise,
      chrome: { tabs: { create: async o => { created.push(o); order.push('create'); return { id: 77, index: 0 }; } }, storage: { local: { set: async () => {}, get: async () => ({}) } } },
      tabHash: async () => '', fnOf: () => '', keepFn: async () => {},
      suggest: () => kws, infoLines: () => ['상품명 : ' + NM], copyText: async () => true,
      ui: async () => { order.push('ui'); return null; }, pushGen: m => { if (m && m.status) pushed.push(m.status); },
      waitComplete: async () => {}, sleep: async () => {},
      nvSearchUrl: (k, mob) => (mob ? 'https://msearch.shopping.naver.com' : 'https://search.shopping.naver.com') + '/search/all?query=' + encodeURIComponent(k),
      naverHere: async () => { order.push('here'); }, won: n => String(n)
    };
    vm.createContext(ctx);
    vm.runInContext(fnSrc(bg, 'async function naverProduct('), ctx);
    ctx.__tab = { id: 11, index: 2, url: NVURL, windowId: 1 };
    vm.runInContext('globalThis.__p = naverProduct(globalThis.__tab, ' + JSON.stringify(info) + (ov ? ', ' + JSON.stringify(ov) : '') + ')', ctx);
    return vm.runInContext('globalThis.__p', ctx).then(r => ({ r, created, order, pushed }));
  }
  {
    const { r, created, order, pushed } = await runNaver({ site: 'naver', name: NM, seller: ST, pid: PID, price: 29900, img: '' }, ['에큐어 젊음크림']);
    ok(r === true, 'naverProduct: 검색 탭을 열고 찾기까지 갔으면 true (' + JSON.stringify(r) + ') — 그래야 상품 탭을 닫아도 됨');
    ok(created.length === 1 && /search\.shopping\.naver\.com\/search\/all\?query=/.test(created[0].url), '검색 탭 주소: ' + (created[0] && created[0].url));
    ok(order.indexOf('create') >= 0 && order.indexOf('here') > order.indexOf('create'), '검색 탭을 연 뒤 naverHere를 부름');
    ok(pushed.some(s => s.indexOf('네이버 검색 탭 여는 중…') === 0), '진행 상태: 네이버 검색 탭 여는 중…: ' + JSON.stringify(pushed));
  }
  {
    const { r, created } = await runNaver({ site: 'naver', name: '', seller: '', pid: PID, price: 0, img: '' }, []);
    ok(r === false, 'naverProduct: 키워드를 못 만들면 false (' + JSON.stringify(r) + ') — 상품 탭을 살려 둠');
    ok(created.length === 0, "'undefined'를 검색하는 탭을 열지 않음");
  }
  {
    const { r, created } = await runNaver({ site: 'naver', name: NM, seller: ST, pid: PID, price: 29900, img: '' }, ['자동추천'], ['겨울모자']);
    ok(r === true && created.length === 1 && decodeURIComponent(created[0].url).indexOf('겨울모자') >= 0, 'naverProduct: 사용자 키워드가 있으면 자동 추천 대신 그 키워드로 검색 탭을 엶 (' + decodeURIComponent((created[0] || {}).url || '') + ')');
  }

  /* ---------- 8-2) page.js box(): 결과 상자의 키워드 입력칸 + [이 키워드로 찾기] (1.8.8) ---------- */
  function boxDom(s) {
    const sent = [];
    const mk = tag => {
      const e = { tag: tag, children: [], style: {}, _h: {}, value: '', disabled: false };
      e.appendChild = c => { e.children.push(c); return c; };
      e.addEventListener = (t, f) => { (e._h[t] = e._h[t] || []).push(f); };
      e.fire = (t, ev) => (e._h[t] || []).forEach(f => f(ev || {}));
      e.focus = () => { e.focused = true; };
      e.select = () => {};
      e.remove = () => {};
      Object.defineProperty(e, 'textContent', { get: () => e._text || '', set: v => { e._text = String(v); } });
      return e;
    };
    let root = null;
    const document = { getElementById: () => null, createElement: mk, body: { appendChild: c => { root = c; return c; } }, execCommand: () => true };
    const chrome = { runtime: { getManifest: () => ({ version: '1.8.8' }), sendMessage: m => { sent.push(m); } } };
    const ctx = { document, chrome, navigator: {}, console, setTimeout, clearTimeout, Promise, Math, Number, String, RegExp, Array, Object };
    vm.createContext(ctx);
    vm.runInContext(fnSrc(pg, 'function box('), ctx);
    ctx.__s = s;
    vm.runInContext('box(__s)', ctx);
    const bx = root;
    const find = tag => { const out = []; const walk = x => { if (x.tag === tag) out.push(x); (x.children || []).forEach(walk); }; walk(bx); return out; };
    return { bx, find, sent };
  }
  /* box()는 만든 상자를 document.body.appendChild로 넘기므로, 그 상자를 잡아 둘 수 있게 body.appendChild가 받아 둔다 */
  {
    const t = boxDom({ title: '찾았어요', big: '키워드 : A', out: '상품명 : X', kw: { val: '에큐어 젊음크림', ph: '다른 검색어로 찾기' } });
    const inp = t.find('input')[0];
    const btn = t.find('button').filter(b => b.textContent === '이 키워드로 찾기')[0];
    ok(t.find('input').length === 1 && !!btn, 'box(): 결과 상자에 키워드 입력칸·[이 키워드로 찾기] 단추가 한 벌만 (' + t.find('input').length + '칸/' + t.find('button').length + '단추)');
    ok(inp && inp.value === '에큐어 젊음크림', 'box(): 확장이 고른 키워드를 입력칸에 미리 넣어 둠 (' + (inp && inp.value) + ')');
    inp.value = '  겨울 모자  ';
    btn.onclick();
    ok(t.sent.length === 1 && t.sent[0].type === 'act' && t.sent[0].act === 'customkw:겨울 모자', '단추 → customkw:<키워드> 액션 (공백 정리, ' + JSON.stringify(t.sent) + ')');
    ok(btn.disabled === true && btn.textContent === '찾는 중…', '누른 뒤에는 두 번 못 누르게 "찾는 중…"');
  }
  {
    const t = boxDom({ title: '못 찾았어요', kw: { val: '' } });
    const inp = t.find('input')[0], btn = t.find('button').filter(b => b.textContent === '이 키워드로 찾기')[0];
    inp.value = '   ';
    btn.onclick();
    ok(t.sent.length === 0 && inp.placeholder === '검색어를 넣어 주세요', '빈 값이면 안내만 하고 안 보냄 (placeholder: ' + inp.placeholder + ')');
  }
  {
    const t = boxDom({ title: '못 찾았어요', kw: { val: 'A' } });
    const inp = t.find('input')[0];
    inp.value = '엔터 키워드';
    inp.fire('keydown', { key: 'Enter', preventDefault() {} });
    ok(t.sent.length === 1 && t.sent[0].act === 'customkw:엔터 키워드', 'Enter로도 찾기 (' + JSON.stringify(t.sent) + ')');
  }
  {
    const t = boxDom({ title: '상품 위치 찾기', msg: '안내' });
    ok(t.find('input').length === 0, '키워드 칸이 없는 상자(안내만)에는 입력칸을 안 넣음');
  }

  /* ---------- 8-3) 검색 결과가 1개뿐인 화면('전체 1')에서 '이 화면에는 없어요' (11/20 제보) ----------
     제보 화면: 왼쪽 목록에 진짜 상품 1개, 옆에 추천 묶음 9개(같은 부모), 광고 배너.
     고치기 전에는 추천 9개만 '상품'으로 세어(상품 9개 확인) 진짜 결과를 놓쳤다(hit:-1). */
  const NM2 = "국내생산 k포두부 500g 냉장 건두부 쌈두부 얇은두부면 신선 저탄수 마라탕";
  const ST2 = "K-포두부", PID2 = "1234567890";
  function scanPage(mode, src) {
    const E = (t, a, k) => ({ t: t, a: a || {}, k: k || [] });
    const card = o => E("div", { class: "product_item" }, [
      o.ad ? E("span", { class: "ad-badge" }, ["AD"]) : null,
      o.link === false ? E("span", { class: "tit" }, [o.nm]) : E("a", { href: o.href }, [o.nm]),
      E("div", { class: "price" }, [o.price]),
      E("span", { class: "store" }, [o.store])
    ].filter(Boolean));
    const rec = i => card({ nm: "추천 상품 " + i + " 국산 콩 두부 300g 냉장 두부면", href: "https://smartstore.naver.com/rec" + i + "/products/9000000" + (100 + i), price: "9,900원", store: "추천스토어" + i });
    const real = card({ nm: NM2, href: "https://smartstore.naver.com/ktofu/products/" + PID2, price: "20% 9,600원", store: ST2, link: mode !== "text" });
    const main = [];
    if (mode === "one" || mode === "text") main.push(real);
    else {
      for (let i = 1; i <= 40; i++) {
        if (i === 2) main.push(card({ nm: "광고 상품 " + i + " 두부 500g", href: "https://smartstore.naver.com/ad" + i + "/products/8000000" + (100 + i), price: "9,900원", store: "광고스토어" + i, ad: true }));
        else if (i === 6 && mode === "many") main.push(real);
        else main.push(card({ nm: "두부 상품 " + i + " 300g", href: "https://smartstore.naver.com/s" + i + "/products/7000000" + (100 + i), price: "9,900원", store: "스토어" + i }));
      }
    }
    const spec = E("div", { class: "page" }, [
      E("div", { class: "header" }, [E("a", { href: "https://shopping.naver.com/home" }, ["쇼핑홈"])]),
      E("div", { class: "filter_area" }, [E("span", null, ["카테고리"]), E("span", null, ["브랜드"])]),
      E("div", { class: "result_area" }, [
        E("div", { class: "product_list" }, main),
        E("div", { class: "paginate" }, [E("span", null, ["1"])])
      ]),
      E("aside", { class: "right_area" }, [
        E("div", { class: "recommend_widget" }, [1, 2, 3, 4, 5, 6, 7, 8, 9].map(rec)),
        E("div", { class: "ad_banner" }, [E("span", { class: "ad-badge" }, ["AD"]), E("div", null, ["메일유업 직장인스토어"]), E("div", null, ["22,000원"])])
      ])
    ]);
    const proto = {
      get children() { return this.k.filter(x => typeof x !== "string"); },
      get href() { return this.a.href; },
      get src() { return this.a.src; },
      get className() { return this.a.class || ""; },
      getAttribute(n) { return this.a[n] !== undefined ? this.a[n] : null; },
      get textContent() { return this._t !== undefined ? this._t : this.k.map(x => typeof x === "string" ? x : x.textContent).join(""); },
      set textContent(v) { this._t = String(v); this.k = []; },
      get value() { return this._v || ""; },
      set value(v) { this._v = String(v); },
      appendChild(c) { this.k.push(c); if (c && typeof c === "object") c.parentElement = this; return c; },
      remove() {}, select() {}, focus() {}, setAttribute() {},
      get innerText() { return this.k.map(x => typeof x === "string" ? x : x.innerText).join("\n"); },
      get innerHTML() { return this.k.map(x => typeof x === "string" ? x : x._h()).join(""); },
      _h() { return "<" + this.t + Object.keys(this.a).map(k => " " + k + '="' + this.a[k] + '"').join("") + ">" + this.innerHTML + "</" + this.t + ">"; },
      contains(x) { for (let n = x; n; n = n.parentElement) if (n === this) return true; return false; },
      matches(s) { return selMatch(this, s); },
      closest(s) { for (let n = this; n; n = n.parentElement) if (selMatch(n, s)) return n; return null; },
      querySelectorAll(s) { return queryAll(this, s); },
      querySelector(s) { return queryAll(this, s)[0] || null; },
      scrollIntoView() {},
      addEventListener(t, f) { this._ev = this._ev || {}; (this._ev[t] = this._ev[t] || []).push(f); },
      fire(t, ev) { ((this._ev || {})[t] || []).forEach(f => f(ev || {})); },
      getBoundingClientRect() { return { left: 0, top: 0, width: 320, height: 120 }; },
      compareDocumentPosition(o) { return o._i > this._i ? 4 : 2; }
    };
    const all = [];
    const build = (s, parent) => {
      if (typeof s === "string") return s;
      const e = Object.create(proto);
      e.t = s.t; e.a = s.a || {}; e.k = []; e.parentElement = parent; e.style = {};
      all.push(e);
      (s.k || []).forEach(k => e.k.push(build(k, e)));
      return e;
    };
    const body = build(spec, null);
    all.forEach((e, i) => { e._i = i; });
    /* 상자(show/box)가 document.body.appendChild로 들어오면 모아 둠 */
    const boxes = [];
    body.appendChild = function (c) { this.k.push(c); if (c) c.parentElement = this; boxes.push(c); return c; };
    const store = { __pl_target: JSON.stringify({ pid: PID2, nm: NM2, st: ST2, kw: "k포두부 쌈두부", pr: 9600 }) };
    const doc = {
      title: "k포두부 쌈두부 : 네이버쇼핑",
      body: body,
      documentElement: { innerHTML: "", scrollHeight: 4000 },
      getElementById: () => null,
      createElement: t => { const e = Object.create(proto); e.t = t; e.a = {}; e.k = []; e.style = {}; e.parentElement = null; all.push(e); e._i = all.length; return e; },
      querySelector: s => queryAll(body, s)[0] || null,
      querySelectorAll: s => queryAll(body, s),
      execCommand: () => true
    };
    const win = { scrollTo() {}, scrollBy() {}, innerHeight: 900, scrollY: 0 };
    const ctx = {
      window: win, document: doc,
      location: { href: "https://search.shopping.naver.com/search/all?query=k%ED%8F%AC%EB%91%90%EB%B6%80&minPrice=9600&maxPrice=9600", hostname: "search.shopping.naver.com", pathname: "/search/all", search: "?query=k%ED%8F%AC%EB%91%90%EB%B6%80&minPrice=9600&maxPrice=9600", hash: "" },
      navigator: { userAgent: "Mozilla/5.0 (Macintosh)", clipboard: { writeText: async () => {} } },
      localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } },
      alert: () => {}, prompt: () => "", confirm: () => true,
      setTimeout, clearTimeout, console, URL, URLSearchParams, Node: { DOCUMENT_POSITION_FOLLOWING: 4 }
    };
    ctx.innerHeight = 900; ctx.scrollY = 0; ctx.scrollBy = () => {}; ctx.scrollTo = () => {};
    vm.createContext(ctx);
    vm.runInContext(src || pg, ctx);
    ctx.boxes = boxes;
    return ctx;
  }
  /* 상자 글자 모으기 (show()가 넣은 textarea 값·안내 글) */
  const boxText = bx => {
    const out = [];
    (function walk(n) { (n.k || []).forEach(x => { if (typeof x === "string") { out.push(x); return; } if (x._t) out.push(x._t); if (x._v) out.push(x._v); walk(x); }); })(bx);
    return out.join("\n");
  };
  const scanOf = async mode => {
    const ctx = scanPage(mode);
    return await ctx.window.__PL.scan({ pid: PID2, nm: NM2, st: ST2, quick: true });
  };
  {
    const s = await scanOf("one");
    ok(!!s && s.hit >= 0, "'전체 1' 화면(진짜 결과 1개 + 옆 추천 9개)에서 상품을 찾음 (hit=" + (s && s.hit) + ", 상품 " + (s && s.n) + "개)");
    ok(!!s && s.org === 1, "그 상품은 이 목록의 1번째 (org=" + (s && s.org) + ")");
    ok(!!s && !!s.how, "어떻게 찾았는지도 남김 (" + (s && s.how) + ")");
  }
  {
    const s = await scanOf("text");
    ok(!!s && s.hit >= 0 && s.org === 1 && /화면 글자/.test(s.how || ""), "상품명이 링크가 아닌 1개 화면도 화면 글자로 찾음 (hit=" + (s && s.hit) + ", org=" + (s && s.org) + ", " + (s && s.how) + ")");
  }
  {
    /* 북마크(oy.js)·생성기 bm-src와 같은 코드: 같은 화면에서 실제로 찾는지 상자 글자로 확인 */
    const t = scanPage("one", oy);
    for (let i = 0; i < 40 && t.boxes.length < 2; i++) await sleep(100);
    const txt = t.boxes.length ? boxText(t.boxes[t.boxes.length - 1]) : "";
    ok(t.boxes.length >= 2 && /찾았어요/.test(txt) && /1페이지/.test(txt), "북마크(oy.js)도 '전체 1' 화면에서 찾음: " + txt.replace(/\n/g, " · ").slice(0, 70));
  }
  {
    const s = await scanOf("many");
    ok(!!s && s.hit === 5 && s.org === 5, "결과 40개 화면에서는 전과 같이 광고 빼고 5번째 (hit=" + (s && s.hit) + ", org=" + (s && s.org) + ")");
  }
  {
    const s = await scanOf("none");
    ok(!!s && s.hit < 0, "없는 상품은 옆 추천·광고가 있어도 찾았다고 하지 않음 (hit=" + (s && s.hit) + ")");
  }
  ok(/const extra = cards\.filter\(c => byParent\.get\(c\.el\.parentElement\) < 3/.test(pg) && /PRICE_CARD/.test(pg), "page.js: 3개 미만 목록(extra)·화면 전체로 커지는 것 방지 코드 있음");
  ok(/const cardGroups = \(\) => \{/.test(oy) && /walkN\(3, false\)/.test(oy) && /const PRC = /.test(oy), "oy.js(북마크)도 같은 고침");
  ok(/const cardGroups = \(\) => \{/.test(gen) && /walkN\(3, false\)/.test(gen) && /const PRC = /.test(gen), "guide/index.html 북마크 코드(bm-src)도 같은 고침");

  /* ---------- 8-4) 모바일(북마크 bm-src·oy.js) 결과 상자의 직접 키워드 칸 (생성기 v204, 사용자 요청) ----------
     확장 1.8.8과 같은 자리. 모바일에는 background가 없어서 주소를 넘겨 다시 찾는다 —
     네이버·쿠팡 검색 화면은 검색어만 바꾼 1페이지로, 쿠팡 상품 페이지는 그 화면에서 1~5페이지를 다시 훑는다. */
  const bmSrc = ((gen.match(/<script type="text\/plain" id="bm-src">([\s\S]*?)<\/script>/) || [])[1] || '');
  const kwRowN = s => (s.match(/kwRow\(/g) || []).length;
  ok(kwRowN(oy) === 6 && kwRowN(bmSrc) === 6, 'oy.js·bm-src: 직접 키워드 칸이 6곳(네이버 상품 1 · 검색 찾음/못 찾음 2 · 쿠팡 검색 찾음/못 찾음 2 · 쿠팡 상품 1) (' + kwRowN(oy) + '/' + kwRowN(bmSrc) + ')');
  ok(/키워드가 마음에 안 들면 직접 정해서 다시 찾기/.test(oy) && /이 키워드로 찾기/.test(oy) && /이 키워드로 찾기/.test(bmSrc) && /키워드가 마음에 안 들면 직접 정해서 다시 찾기/.test(bmSrc), '입력칸 이름·단추 글자가 확장 1.8.8과 같음');
  ok(/kwUrl\(v\)/.test(oy) && /kwUrl\(v\)/.test(bmSrc) && /searchKw\(kws\)/.test(oy) && /searchKw\(kws\)/.test(bmSrc), '그 키워드로 다시 찾기: 검색 화면은 kwUrl(주소), 쿠팡 상품 페이지는 그 화면에서 다시 훑기(searchKw)');
  /* 주소 만들기: 브라우저 없이 함수만 떼어 실행 */
  const kwUrlOf = (loc, ua, src) => {
    const ctx = { location: loc, navigator: { userAgent: ua || 'iPhone' }, URL, console };
    vm.createContext(ctx);
    vm.runInContext('const L = location;\n' + fnSrc(src || oy, 'const kwUrl =') + '\nglobalThis.__kw = kwUrl;', ctx);
    return vm.runInContext('globalThis.__kw', ctx);
  };
  {
    const loc = { href: 'https://search.shopping.naver.com/search/all?query=%ED%8F%AC%EB%91%90%EB%B6%80&minPrice=9600&maxPrice=9600&pagingIndex=3', hostname: 'search.shopping.naver.com', pathname: '/search/all', search: '?query=%ED%8F%AC%EB%91%90%EB%B6%80&minPrice=9600&maxPrice=9600&pagingIndex=3', hash: '' };
    const u = decodeURIComponent(kwUrlOf(loc, 'Mozilla/5.0 (Macintosh)')('겨울 모자')).replace(/\+/g, ' ');
    ok(/query=겨울 모자/.test(u) && !/pagingIndex/.test(u) && /minPrice=9600/.test(u), '네이버 검색 화면: 검색어만 바꾸고 1페이지로 (가격 필터는 그대로) — ' + u);
  }
  {
    const loc = { href: 'https://msearch.shopping.naver.com/search/all?query=a#pid=123&nm=%EC%83%81%ED%92%88&st=%EC%8A%A4%ED%86%A0%EC%96%B4&kw=a%7Cb&pr=9900', hostname: 'msearch.shopping.naver.com', pathname: '/search/all', search: '?query=a', hash: '#pid=123&nm=%EC%83%81%ED%92%88&st=%EC%8A%A4%ED%86%A0%EC%96%B4&kw=a%7Cb&pr=9900' };
    const u = decodeURIComponent(kwUrlOf(loc)('두부면'));
    ok(/query=두부면/.test(u) && u.indexOf('pid=123') > 0 && /kw=두부면/.test(u) && /pr=9900/.test(u), '모바일 네이버 검색 화면: 찾는 상품(#pid=…)은 그대로 두고 검색어 목록만 바꿈 — ' + u);
  }
  {
    const loc = { href: 'https://m.coupang.com/nm/search?q=%EB%91%90%EB%B6%80&page=3&isPriceRange=true', hostname: 'm.coupang.com', pathname: '/nm/search', search: '?q=%EB%91%90%EB%B6%80&page=3&isPriceRange=true', hash: '' };
    const u = decodeURIComponent(kwUrlOf(loc)('포두부'));
    ok(/[?&]q=포두부/.test(u) && !/[?&]page=/.test(u) && /isPriceRange=true/.test(u), '쿠팡 검색 화면: q만 바꾸고 page를 뺌 (다른 필터는 그대로) — ' + u);
  }
  {
    const pc = kwUrlOf({ href: 'https://www.coupang.com/vp/products/123', hostname: 'www.coupang.com', pathname: '/vp/products/123', search: '', hash: '' }, 'Mozilla/5.0 (Macintosh)');
    const mo = kwUrlOf({ href: 'https://m.coupang.com/vm/products/123', hostname: 'm.coupang.com', pathname: '/vm/products/123', search: '', hash: '' });
    ok(/www\.coupang\.com\/np\/search\?q=/.test(pc('텀블러')) && /m\.coupang\.com\/nm\/search\?q=/.test(mo('텀블러')), '쿠팡 상품 페이지: 그 키워드로 검색 화면 (PC /np, 모바일 /nm)');
    const nv = kwUrlOf({ href: 'https://smartstore.naver.com/ecureshop/products/123', hostname: 'smartstore.naver.com', pathname: '/ecureshop/products/123', search: '', hash: '' });
    ok(/msearch\.shopping\.naver\.com\/search\/all\?query=/.test(nv('텀블러')), '네이버 상품 페이지: 그 키워드로 쇼핑 검색 화면');
  }
  /* 실제 화면(가짜 DOM)에서: 찾았을 때 상자에 칸이 생기고, 눌러서 그 주소로 넘어가는지 — oy.js와 bm-src 둘 다 */
  const kwBoxText = bx => boxText(bx);
  const kwKids = (bx, tag) => {
    const out = [];
    (function walk(x) { if (x.t === tag) out.push(x); (x.k || []).forEach(k => { if (typeof k !== 'string') walk(k); }); })(bx);
    return out;
  };
  const kwBox = async (src, label) => {
    const t = scanPage('one', src);
    for (let i = 0; i < 60 && t.boxes.length < 2; i++) await sleep(100);
    const bx = t.boxes[t.boxes.length - 1];
    if (!bx) { ok(false, label + ': 결과 상자가 안 뜸'); return; }
    const inp = kwKids(bx, 'input')[0];
    const btn = kwKids(bx, 'button').filter(b => b.textContent === '이 키워드로 찾기')[0];
    ok(!!inp && !!btn, label + ': 찾았을 때 상자에 키워드 입력칸·[이 키워드로 찾기] (' + kwKids(bx, 'input').length + '칸/' + kwKids(bx, 'button').length + '단추)');
    ok(/키워드가 마음에 안 들면 직접 정해서 다시 찾기/.test(kwBoxText(bx)), label + ': 안내 글도 그 상자 안에 있음');
    ok(!!inp && inp.value === 'k포두부', label + ': 지금 검색어를 미리 넣어 둠 (' + (inp && inp.value) + ')');
    const before = t.location.href;
    inp.value = '두부면';
    btn.onclick();
    const after = decodeURIComponent(t.location.href).replace(/\+/g, ' ');
    ok(t.location.href !== before && /query=두부면/.test(after) && !/pagingIndex/.test(after) && /minPrice=9600/.test(after), label + ': 누르면 그 키워드로 검색한 1페이지 주소로 넘어감 — ' + after.slice(0, 80));
    /* 빈 값이면 옮겨 가지 않고 안내만 */
    const t2 = scanPage('one', src);
    for (let i = 0; i < 60 && t2.boxes.length < 2; i++) await sleep(100);
    const bx2 = t2.boxes[t2.boxes.length - 1];
    if (!bx2) { ok(false, label + ': 두 번째 시험에서 상자가 안 뜸'); return; }
    const inp2 = kwKids(bx2, 'input')[0];
    const btn2 = kwKids(bx2, 'button').filter(b => b.textContent === '이 키워드로 찾기')[0];
    const before2 = t2.location.href;
    inp2.value = '   ';
    btn2.onclick();
    ok(t2.location.href === before2 && inp2.placeholder === '검색어를 넣어 주세요', label + ': 빈 값이면 안내만 하고 안 넘어감');
    inp2.value = '엔터 키워드';
    inp2.fire('keydown', { key: 'Enter', preventDefault() {} });
    const ent = decodeURIComponent(t2.location.href).replace(/\+/g, ' ');
    ok(/query=/.test(ent) && /엔터 키워드/.test(ent), label + ': Enter로도 찾기 — ' + ent.slice(0, 70));
  };
  await kwBox(oy, 'oy.js');
  await kwBox(bmSrc, 'bm-src(북마크)');

  /* ---------- 9) 버전·배포물 한 세트 (확장 1.8.9) ---------- */
  ok(man.version === '1.8.9', 'manifest 버전 1.8.9 (' + man.version + ')');
  const ev = (gen.match(/const EXT_VER = "([\d.]+)"/) || [])[1];
  ok(ev === man.version, '생성기 EXT_VER(' + ev + ') = manifest 버전(' + man.version + ')');
  {
    const zip = require('fs').readFileSync(path.join(root, 'ori/product-locator.zip'));
    const b64 = (gen.match(/const EXT_ZIP = "([A-Za-z0-9+/=]+)"/) || [])[1] || '';
    ok(Buffer.from(b64, 'base64').equals(zip), '생성기 EXT_ZIP = ori/product-locator.zip 그대로');
    const entries = zipRead(zip);
    ok(Object.keys(entries).length === 11, 'zip 안 ext/ 파일 11개 (' + Object.keys(entries).length + '개)');
    ok(String(entries['ext/page.js']).indexOf('const parts = (document.title || "").split(/\\s+:\\s+/);') >= 0, 'zip 안 ext/page.js에 parts 선언 들어감');
    ok(/function readProduct_\(\)/.test(String(entries['ext/page.js'])), 'zip 안 ext/page.js에 readProduct 방어 코드 들어감 (1.8.7)');
    ok(/const late = \/\(coupang\\\.com\|naver\\\.com\)\//.test(String(entries['ext/bg.js'])), 'zip 안 ext/bg.js에 네이버 빈 상품명 재시도 들어감 (1.8.7)');
    ok(/\"version\":\s*\"1\.8\.9\"/.test(String(entries['ext/manifest.json'])), 'zip 안 ext/manifest.json도 1.8.9');
    ok(/const cardGroups = \(\) => \{/.test(String(entries['ext/oy.js'])) && /const extra = cards\.filter/.test(String(entries['ext/page.js'])), 'zip 안 ext/page.js·oy.js에 1~2개 결과 고침 들어감 (1.8.9)');
    ok(/customkw:/.test(String(entries['ext/bg.js'])) && /이 키워드로 찾기/.test(String(entries['ext/page.js'])), 'zip 안 ext/bg.js·page.js에 사용자 키워드 재검색 들어감 (1.8.8)');
    ok(/await naverHere\(nt\);/.test(String(entries['ext/bg.js'])), 'zip 안 ext/bg.js에 naverProduct 수정 들어감');
    ok(/kwRow\(/.test(String(entries['ext/oy.js'])) && /이 키워드로 찾기/.test(String(entries['ext/oy.js'])), 'zip 안 ext/oy.js에 직접 키워드 칸 들어감 (생성기 v204)');
  }

  console.log(fails.length ? 'XX 네이버 상품 페이지 멈춤 시험 실패:\n- ' + fails.join('\n- ') : '✓ 네이버 상품 페이지 멈춤(parts·탭·오류·재시도·waitComplete) 시험 통과');
  process.exit(fails.length ? 1 : 0);
})();
