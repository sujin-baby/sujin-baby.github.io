// 네이버 상품 페이지에서 확장 프로그램이 '바로 꺼지던 것' (11/20 사용자 제보, 확장 1.8.6)
//  ① page.js 네이버 readProduct()가 parts를 안 만들어 'parts is not defined'로 즉시 실패 (1.8.4부터)
//     → 이제 최소 DOM mock으로 실제로 돌려 { site: "naver", name, seller, pid, price }가 나오는지 확인
//  ② bg.js autoRun이 네이버라는 이유만으로 상품 탭을 무조건 닫아(autoRun) 탭·확장이 바로 꺼져 보임
//     → 실패(out 없음)면 탭을 닫지 않고 활성 탭으로 남기는지, naverProduct는 검색 탭을 연 뒤 true를 주는지 확인
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

/* ---------- 1) page.js 네이버 readProduct(): 최소 DOM mock으로 실제 실행 ---------- */
const NM = '에큐어 젊음크림 노화억제크림 주름개선 탭력 50ml', ST = '에큐어샵', PID = '1234567890';
const TITLE = NM + ' : ' + ST;
const TXT = [NM, '50ml', '29,900원', '배송비 3,000원'].join('\n');
function naverPage() {
  const ogMap = { title: TITLE, site_name: '네이버 스마트스토어', image: '//shop-phinf.pstatic.net/a.jpg' };
  const ld = { '@context': 'https://schema.org', '@type': 'Product', name: NM, brand: { '@type': 'Brand', name: '에큐어' } };
  const document = {
    title: TITLE,
    querySelector(sel) {
      const m = String(sel).match(/^meta\[property="og:(\w+)"\]$/);
      if (m) return ogMap[m[1]] != null ? { content: ogMap[m[1]] } : null;
      return null;
    },
    querySelectorAll(sel) {
      if (/application\/ld\+json/.test(sel)) return [{ textContent: JSON.stringify(ld) }];
      if (/^h1, h2, h3/.test(sel)) return [{ innerText: NM, children: [], querySelector: () => null }];
      return [];
    },
    documentElement: { innerHTML: '<script>window.__S={"discountedSalePrice":29900,"salePrice":39000};</script>' },
    body: { innerText: TXT },
    createElement: () => ({ style: {}, appendChild() {}, setAttribute() {}, remove() {} })
  };
  const location = { href: 'https://smartstore.naver.com/ecureshop/products/' + PID, hostname: 'smartstore.naver.com', pathname: '/ecureshop/products/' + PID, search: '' };
  const window = {};
  const ctx = { window, document, location, navigator: { userAgent: 'Mozilla/5.0 (Macintosh)' }, setTimeout, clearTimeout, console, URL, URLSearchParams, Node: { DOCUMENT_POSITION_FOLLOWING: 4 } };
  vm.createContext(ctx);
  vm.runInContext(pg, ctx);
  return ctx;
}
{
  let r = null, err = null;
  const ctx = naverPage();
  try { r = vm.runInContext('window.__PL.readProduct()', ctx); } catch (e) { err = e; }
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
  const rp = fnSrc(pg, 'function readProduct(');
  ok(rp.indexOf('const parts') > 0 && rp.indexOf('const parts') < rp.indexOf('parts.length'), 'page.js: 네이버 readProduct()가 parts를 쓰기 전에 만듦');
  ok(oy.indexOf('const parts') > 0 && oy.indexOf('const parts') < oy.indexOf('parts.length'), 'oy.js: parts를 쓰기 전에 만듦');
  ok(/const parts = \(document\.title \|\| ""\)\.split\(\/\\s\+:\\s\+\/\);/.test(pg), 'page.js: title이 없어도 안 터지게 (document.title || "")');
}

/* ---------- 3) bg.js autoRun: 실패했으면 네이버라도 상품 탭을 닫지 않음 ---------- */
const NVURL = 'https://smartstore.naver.com/ecureshop/products/' + PID;
function runAuto(out, url) {
  const removed = [], updated = [], created = [];
  const chrome = {
    tabs: {
      create: async o => { const t = { id: 99, windowId: 1, index: 0, url: o.url, status: 'complete' }; created.push(t); return t; },
      get: async () => ({ id: 99, windowId: 1, index: 0, url: url || NVURL, status: 'complete' }),
      remove: async id => { removed.push(id); },
      update: async (id, o) => { updated.push([id, o]); return { id: id }; }
    }
  };
  const ctx = {
    chrome, console, URL, URLSearchParams, Date, setTimeout, clearTimeout, Promise,
    busy: false, busySince: 0, autoTab: 0, cancel: false,
    sleep: async () => {}, pushGen: () => {}, keepFn: async () => {}, fnOf: () => '', autoOy: async () => true,
    start: async () => out
  };
  vm.createContext(ctx);
  vm.runInContext(fnSrc(bg, 'async function autoRun('), ctx);
  const p = vm.runInContext('autoRun("' + (url || NVURL) + '", { windowId: 1, index: 0 })', ctx);
  return Promise.resolve(p).then(() => ({ removed, updated, created }));
}
(async () => {
  {
    const r = await runAuto(undefined);            // 네이버인데 상품 정보를 못 읽어 실패(out 없음)
    ok(r.removed.indexOf(99) < 0, '실패했으면 네이버 상품 탭을 닫지 않음 (닫음: ' + JSON.stringify(r.removed) + ')');
    ok(r.updated.some(u => u[0] === 99 && u[1] && u[1].active === true), '실패했으면 상품 탭을 활성 탭으로 보여 줌');
  }
  {
    const r = await runAuto(true);                 // 성공
    ok(r.removed.indexOf(99) >= 0, '성공했으면 상품 탭을 닫음 (검색 탭이 앞에 남음)');
  }
  {
    const r = await runAuto('상품 정보 결과글');   // 쿠팡처럼 결과 글을 돌려주는 성공
    ok(r.removed.indexOf(99) >= 0, '결과 글을 받은 성공도 상품 탭을 닫음');
  }
  ok(!/out \|\| isNv/.test(bg) && !/const isNv = \/naver/.test(fnSrc(bg, 'async function autoRun(')), 'autoRun: 네이버라는 이유만으로 닫던 조건(out || isNv) 없음');

  /* ---------- 4) bg.js naverProduct: 검색 탭을 열고 찾기까지 가면 true ---------- */
  function runNaver(info, kws) {
    const created = [], order = [];
    const ctx = {
      console, URL, URLSearchParams, Date, Promise,
      chrome: { tabs: { create: async o => { created.push(o); order.push('create'); return { id: 77, index: 0 }; } }, storage: { local: { set: async () => {}, get: async () => ({}) } } },
      tabHash: async () => '', fnOf: () => '', keepFn: async () => {},
      suggest: () => kws, infoLines: () => ['상품명 : ' + NM], copyText: async () => true,
      ui: async () => { order.push('ui'); return null; }, waitComplete: async () => {}, sleep: async () => {},
      nvSearchUrl: (k, mob) => (mob ? 'https://msearch.shopping.naver.com' : 'https://search.shopping.naver.com') + '/search/all?query=' + encodeURIComponent(k),
      naverHere: async () => { order.push('here'); }, won: n => String(n)
    };
    vm.createContext(ctx);
    vm.runInContext(fnSrc(bg, 'async function naverProduct('), ctx);
    ctx.__tab = { id: 11, index: 2, url: NVURL, windowId: 1 };
    vm.runInContext('globalThis.__p = naverProduct(globalThis.__tab, ' + JSON.stringify(info) + ')', ctx);
    return vm.runInContext('globalThis.__p', ctx).then(r => ({ r, created, order }));
  }
  {
    const { r, created, order } = await runNaver({ site: 'naver', name: NM, seller: ST, pid: PID, price: 29900, img: '' }, ['에큐어 젊음크림']);
    ok(r === true, 'naverProduct: 검색 탭을 열고 찾기까지 갔으면 true (' + JSON.stringify(r) + ') — 그래야 상품 탭을 닫아도 됨');
    ok(created.length === 1 && /search\.shopping\.naver\.com\/search\/all\?query=/.test(created[0].url), '검색 탭 주소: ' + (created[0] && created[0].url));
    ok(order.indexOf('create') >= 0 && order.indexOf('here') > order.indexOf('create'), '검색 탭을 연 뒤 naverHere를 부름');
  }
  {
    const { r, created } = await runNaver({ site: 'naver', name: '', seller: '', pid: PID, price: 0, img: '' }, []);
    ok(r === false, 'naverProduct: 키워드를 못 만들면 false (' + JSON.stringify(r) + ') — 상품 탭을 살려 둠');
    ok(created.length === 0, "'undefined'를 검색하는 탭을 열지 않음");
  }

  /* ---------- 5) 버전·배포물 한 세트 (확장 1.8.6) ---------- */
  ok(man.version === '1.8.6', 'manifest 버전 1.8.6 (' + man.version + ')');
  const ev = (gen.match(/const EXT_VER = "([\d.]+)"/) || [])[1];
  ok(ev === man.version, '생성기 EXT_VER(' + ev + ') = manifest 버전(' + man.version + ')');
  {
    const zip = require('fs').readFileSync(path.join(root, 'ori/product-locator.zip'));
    const b64 = (gen.match(/const EXT_ZIP = "([A-Za-z0-9+/=]+)"/) || [])[1] || '';
    ok(Buffer.from(b64, 'base64').equals(zip), '생성기 EXT_ZIP = ori/product-locator.zip 그대로');
    const entries = zipRead(zip);
    ok(String(entries['ext/page.js']) .indexOf('const parts = (document.title || "").split(/\\s+:\\s+/);') >= 0, 'zip 안 ext/page.js에 parts 선언 들어감');
    ok(/"version":\s*"1\.8\.6"/.test(String(entries['ext/manifest.json'])), 'zip 안 ext/manifest.json도 1.8.6');
    ok(/await naverHere\(nt\);/.test(String(entries['ext/bg.js'])), 'zip 안 ext/bg.js에 naverProduct 수정 들어감');
  }

  console.log(fails.length ? 'XX 네이버 바로꺼짐 시험 실패:\n- ' + fails.join('\n- ') : '✓ 네이버 상품 페이지 바로꺼짐(parts·탭 닫기) 시험 통과');
  process.exit(fails.length ? 1 : 0);
})();
