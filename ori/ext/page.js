/* 상품 위치 찾기: 쇼핑몰 화면 안에서 도는 부분 (상품 정보 읽기, 검색 화면 읽기, 결과 상자) */
(() => {
  if (window.__PL) return;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = t => String(t || "").replace(/[\s\[\]\(\)\/,.·\-_+~!*'"]/g, "").toLowerCase();
  const isNaver = /naver\.com$/.test(location.hostname);
  const numOf = s => Number(String(s || "").replace(/[^0-9]/g, "")) || 0;

  /* 고른 옵션: '색상 × 수량' 같은 이름표를 찾아 바로 옆 값 (콜론은 화면 꾸밈이라 글에 없을 때가 있음) */
  const OPT_LAB = /^(개당\s*)?(색상|옵션|사이즈|수량|구성|선택|용량|맛|종류|컬러|타입|중량|무게|개수)(\s*[×x\/·,]\s*(색상|옵션|사이즈|수량|구성|선택|용량|맛|종류|컬러|타입|중량|무게|개수))*\s*[:：]?$/;
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
  /* 옵션마다 가격 (쿠팡 '수량' 목록: 2개 29,200원 / 3개 41,200원 …, 10/24 옥광밤·황금향). 이름표(수량) 줄 다음 옵션 이름 줄 → 가격 줄.
     지금 고른 옵션 가격(cur)과 같은 줄이 목록에 없으면 잘못 읽은 걸로 보고 안 씀 */
  const readOptPrices = (txt, name, cur) => {
    const LAB = /^(개당\s*)?(색상|옵션|사이즈|수량|구성|선택|용량|맛|종류|컬러|타입|중량|무게|개수)(\s*[×x\/·,]\s*(색상|옵션|사이즈|수량|구성|선택|용량|맛|종류|컬러|타입|중량|무게|개수))*\s*[:：]?$/;
    const i0 = name ? txt.indexOf(name.slice(0, 12)) : -1;
    const ls = (i0 >= 0 ? txt.slice(i0, i0 + 5000) : txt.slice(0, 8000)).split("\n").map(x => x.replace(/\s+/g, " ").trim()).filter(Boolean);
    const out = [];
    let nm = "", on = false;
    for (const l of ls) {
      if (!on) { if (LAB.test(l)) on = true; continue; }
      if (LAB.test(l) || /^(모든\s*옵션|절약\s*금액|무료\s*배송|판매자|배송사|적립|장바구니|바로\s*구매)/.test(l)) { if (out.length) break; nm = ""; continue; }
      const pm = l.match(/(\d{1,3}(?:,\d{3})+)\s*원/);
      if (pm) {
        if (/사면|절약|적립|최대/.test(l)) continue;
        const o = l.slice(0, pm.index).trim() || nm;
        if (o && o.length <= 40 && !out.some(x => x.o === o)) out.push({ o: o, p: Number(pm[1].replace(/,/g, "")) });
        nm = "";
      } else if (l.length <= 40) nm = l;
    }
    if (out.length < 2 || (cur && !out.some(x => x.p === cur))) return [];
    return out;
  };
  /* 옵션 목록 칸(li·option)마다 '120ml × 검정 × 1개 9,500원 …' → 가격 앞 글자가 옵션 이름. 숨은 칸도 읽음. 지금 가격과 같은 줄이 없으면 안 씀 */
  const readOptItems = cur => {
    const out = [];
    document.querySelectorAll('li, [role="option"]').forEach(el => {
      if (el.querySelector('li, [role="option"]')) return;   /* 가장 안쪽 칸만 */
      const t = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (t.length > 200 || t.indexOf("×") < 0) return;
      const pm = t.match(/(\d{1,3}(?:,\d{3})+)\s*원/);
      if (!pm) return;
      const o = t.slice(0, pm.index).replace(/\s*×\s*/g, " × ").trim();
      if (!o || o.length > 40 || o.indexOf("×") < 0 || out.some(x => x.o === o)) return;
      out.push({ o: o, p: Number(pm[1].replace(/,/g, "")) });
    });
    if (out.length < 2 || (cur && !out.some(x => x.p === cur))) return [];
    return out;
  };
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
  /* 배송비: 상품명 뒤 글에서 '배송비 3,000원' / '무료배송' / '30,000원 이상 (구매 시) 무료'. 가격이 무료 조건에 맞으면 무료 (사용자 요청 10/20)
     '일반배송 | 2,500원'(올리브영)도. '추가 배송비'(제주·도서산간), 반품·교환 배송비는 건너뜀 */
  const shipOf = (txt, name, price) => {
    const i0 = name ? txt.indexOf(name.slice(0, 10)) : -1, t = (i0 >= 0 ? txt.slice(i0, i0 + 5000) : txt.slice(0, 8000)).replace(/\s+/g, " ");
    const w = n => n.toLocaleString("ko-KR");
    const thM = t.match(/(\d{1,3}(?:,\d{3})+|\d{4,})\s*원\s*이상\s*(?:구매|주문|결제)?\s*(?:시|하면)?\s*(?:배송비\s*)?무료/);
    const th = thM ? Number(thM[1].replace(/,/g, "")) : 0;
    const re = /(?:배송비|일반\s*배송|택배\s*배송|기본\s*배송)\s*[|:：]?\s*(\d{1,3}(?:,\d{3})+|\d{3,})\s*원/g;
    let fm, fee = 0;
    while ((fm = re.exec(t))) { if (/추가|도서|산간|제주|반품|교환|왕복|편도/.test(t.slice(Math.max(0, fm.index - 8), fm.index))) continue; fee = Number(fm[1].replace(/,/g, "")); break; }
    if (fee) return th && price >= th ? "무료 (" + w(th) + "원 이상 무료, 이 가격은 조건 맞음)" : w(fee) + "원" + (th ? " (" + w(th) + "원 이상 무료인데 이 가격은 안 됨)" : "");
    if (th) return price >= th ? "무료 (" + w(th) + "원 이상 무료, 이 가격은 조건 맞음)" : "확인 필요 (" + w(th) + "원 이상 무료인데 이 가격은 안 됨, 배송비 금액을 못 읽었어요)";
    if (/무료\s*배송|배송비\s*[:：]?\s*무료/.test(t)) return "무료";
    return "확인 필요 (상품 페이지에서 배송비를 못 읽었어요)";
  };
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
      if (!item) { const cm = String(txt || "").match(/쿠팡\s*상품\s*번호\s*[:：]?\s*(\d+)\s*-\s*(\d{6,})/); if (cm && cm[1] === pm[1]) item = cm[2]; }   /* 화면의 '쿠팡상품번호: 상품 - 아이템'이 먼저 (페이지 안 첫 itemId는 추천·광고 상품일 수 있음, 10/28) */
      if (!item) { const m = html.match(/["']?itemId["']?\s*[:=]\s*["']?(\d{8,})/); if (m) item = m[1]; }
      let name = visibleTitle();
      if (!name) name = (og("title") || document.title).replace(/\s*[-|]\s*쿠팡!?\s*$/, "").replace(/\s+-\s+[^-]{1,20}$/, "").trim();
      let seller = "";
      const sm = txt.match(/판매자\s*[:：]?\s*([^\n]{1,60})/);
      if (sm) seller = sm[1].replace(/\s*(판매자\s*)?(상품\s*)?보러\s*가기.*$/, "").replace(/\s*판매자\s*평가.*$/, "").trim();
      { const vm = html.match(/"vendorName"\s*:\s*"([^"]{2,60})"/); if (vm) seller = vm[1]; }   // '판매자 특가' 같은 배지 글자 말고 실제 판매자 (10/21)
      if (!seller || seller.length > 30 || /가입|보러가기|평가|정보|^특가|로켓|할인|쿠폰|무료|배송|와우/.test(seller)) { const s2 = txt.match(/상호\s*\/\s*대표자\s*([^\n\/]{1,40})/); seller = s2 ? s2[1].trim() : ""; }
      let opt = readOption();
      if (!opt) { const oe = document.querySelector('.prod-option__selected .value, .prod-option__selected-container .value'); if (oe) opt = oe.textContent.replace(/\s+/g, " ").trim().slice(0, 60); }
      let price = 0;
      const pe = document.querySelector('.prod-sale-price .total-price strong, .total-price strong, [class*="final-price"] [class*="amount"], .price-amount.final-price-amount, [class*="finalPrice"]');
      if (pe) price = num(pe.textContent);
      if (!price) price = priceAfter(txt, name);
      let optPrices = readOptPrices(txt, name, price);
      /* 옵션 목록이 닫힌 드롭다운이면 화면 글(innerText)에 안 나와서, 숨은 목록 칸의 글자(textContent)로도 읽음 (10/26 텀블러 '120ml × 검정 × 1개' 20줄) */
      if (!optPrices.length) optPrices = readOptItems(price);
      /* 고른 옵션을 못 읽었으면 목록에서 지금 가격과 같은 옵션 (하나일 때만) */
      if (optPrices.length && !optPrices.some(x => x.o === opt)) { const hit = optPrices.filter(x => x.p === price); opt = hit.length === 1 ? hit[0].o : ""; }
      /* 로켓 표시는 이 상품 칸에서만: 아래 추천 상품(이런건 어때요)의 판매자로켓을 이 상품으로 읽던 것 (10/28) */
      const rkTxt = (function (t, nm) { const c = t.search(/쿠팡\s*상품\s*번호|이런\s*건\s*어때요|함께\s*비교하면|다른\s*고객이\s*함께/); if (c > 0) t = t.slice(0, c); const ni = nm ? t.indexOf(String(nm).slice(0, 12)) : -1; if (ni > 0) t = t.slice(ni); return t.slice(0, 8000); })(txt, name);
      return { site: "coupang", mob: /^m\./.test(L.hostname), pid: pm[1], item: item, name: name, seller: seller, opt: opt || "단일옵션", price: price, optPrices: optPrices, ship: /로켓\s*(배송|와우|그로스|직구|프레시)|판매자\s*로켓/.test(rkTxt) ? "무료 (로켓배송)" : shipOf(txt, name, price), rocket: /로켓\s*(배송|와우|그로스|직구|프레시)|판매자\s*로켓/.test(rkTxt), img: img };
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
    return { site: "naver", mob: /^m\./.test(L.hostname), pid: pm[1], item: "", name: name, seller: seller, opt: opt || "단일옵션", price: price, ship: shipOf(txt, name, price), img: img };
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
  /* 광고 표시: '광고', '광고ⓘ', 'AD' (상품명 속 '광고용' 같은 건 아님) */
  const AD_TXT = /(^|[\s·|])(광고|AD)(?![가-힣A-Za-z])/;
  /* 네이버는 광고 아닌 상품 링크도 클릭 기록용 adcr 주소를 써서, 네이버에서는 링크 주소로 광고를 판단하지 않음 */
  const isAd = el => AD_TXT.test(el.innerText || "") || !!el.querySelector((isNaver ? "" : 'a[href*="adcr"], ') + '[class*="ad-badge"], [class*="adBadge"], [class*="ad_label"], [class*="AdMark"], img[alt="광고"], img[alt="AD"]');
  function matchOf(el, o) {
    const pidRe = new RegExp((isNaver ? "(^|\\D)" : "products/") + o.pid + "(?!\\d)");
    if (!isNaver) return pidRe.test(el.innerHTML) ? "상품번호" : "";
    if (o.pid && o.pid.length >= 8 && pidRe.test(el.innerHTML)) return "상품번호";
    const t = norm(el.innerText), nk = norm(o.nm).slice(0, 25), stOk = !!(o.st && norm(o.st).length >= 2 && t.indexOf(norm(o.st)) !== -1);
    if (nk.length >= 6 && t.indexOf(nk) !== -1) return stOk ? "상품명+스토어" : "상품명";
    /* 상품명 앞부분이 조금 달라도(띄어쓰기·기호·순서) 상품명 낱말 대부분 + 스토어 이름이 같으면 같은 상품 (10/20 마켓 담온 귤을 못 찾음) */
    const sc = nameScore(t, o.nm);
    if (sc >= 0.8 && stOk) return "상품명+스토어";
    if (sc >= 0.95) return "상품명";
    return "";
  }
  /* 링크로 상품 칸을 못 잡는 화면(상품명이 링크가 아님 등)용: 화면 글자에서 상품명(+스토어)이 든 가장 작은 칸을 찾고,
     가격(원)이 적힌 형제 칸들 사이에서 몇 번째인지 셈 (10/20 네이버 가격비교 화면에서 마켓 담온 귤을 못 찾음) */
  let FOUND_EL = null;
  function textFind(o) {
    const nm = String(o.nm || ""), stN = norm(o.st), nk = norm(nm).slice(0, 25);
    const toks = nm.split(/[\s\/,·|]+/).filter(x => x.length >= 2).sort((a, b) => b.length - a.length);
    if (!toks.length) return null;
    const key = toks[0];
    const ok = el => {
      if (el.closest("#__pl_box")) return false;
      const tc = el.textContent || "";
      if (tc.length > 3000 || tc.indexOf(key) === -1) return false;
      const t = norm(el.innerText), sc = nameScore(t, nm);
      return (nk.length >= 6 && t.indexOf(nk) !== -1) || (sc >= 0.8 && stN.length >= 2 && t.indexOf(stN) !== -1) || sc >= 0.95;
    };
    const all = [...document.querySelectorAll("li,div,article,section,td")].filter(ok);
    const leaves = all.filter(el => !all.some(x => x !== el && el.contains(x)));
    const PRICE = /\d{1,3}(?:,\d{3})+\s*원/;
    for (const leaf of leaves) {
      let a = leaf;
      while (a.parentElement && a.parentElement !== document.body) {
        const sib = [...a.parentElement.children].filter(c => PRICE.test(c.textContent || ""));
        if (sib.length >= 3 && sib.indexOf(a) >= 0) {
          if (isAd(a)) break;
          const org = sib.slice(0, sib.indexOf(a)).filter(c => !isAd(c)).length + 1;
          return { el: a, org: org, st: !!(stN.length >= 2 && norm(a.innerText).indexOf(stN) !== -1) };
        }
        a = a.parentElement;
      }
    }
    return null;
  }
  /* 상품명 낱말(2글자 이상) 중 칸 글자에 들어 있는 비율 */
  function nameScore(t, nm) {
    const toks = String(nm || "").split(/[\s\/,·|]+/).map(norm).filter(x => x.length >= 2);
    if (toks.length < 3) return 0;
    return toks.filter(x => t.indexOf(x) !== -1).length / toks.length;
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
    FOUND_EL = null;
    await waitReady();
    if (blockedText()) return { blocked: true, url: location.href, snip: snippet() };
    const found = () => cardList().some(c => matchOf(c.el, o) && !isAd(c.el));
    /* 지금 그려져 있는 화면에서 찾기 (링크 칸 → 안 되면 화면 글자) */
    let maxN = 0, nearBest = null;
    const probe = () => {
      const list = cardList();
      maxN = Math.max(maxN, list.length);
      let hit = -1, how = "", adHit = -1;
      list.forEach((c, i) => { const h = matchOf(c.el, o); if (!h) return; if (isAd(c.el)) { if (adHit < 0) adHit = i; return; } if (hit < 0 || (how === "상품명" && h !== "상품명")) { hit = i; how = h; } });
      let org = hit >= 0 ? list.slice(0, hit).filter(c => !isAd(c.el)).length + 1 : 0, el = hit >= 0 ? list[hit].el : null;
      if (hit < 0 && isNaver && o.nm) { const tf = textFind(o); if (tf) { el = tf.el; hit = 0; org = tf.org; how = tf.st ? "화면 글자(상품명+스토어)" : "화면 글자(상품명)"; } }
      if (hit < 0 && isNaver) list.forEach((c, i) => { const sc = nameScore(norm(c.el.innerText), o.nm); if (!nearBest || sc > nearBest.sc) nearBest = { i: i + 1, sc: sc, t: (c.el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 60), st: !!(o.st && norm(c.el.innerText).indexOf(norm(o.st)) !== -1), ad: isAd(c.el) }; });
      return { list: list, hit: hit, how: how, adHit: adHit, org: org, el: el };
    };
    let P;
    if (isNaver) {
      /* 네이버: 아래로 내리면 위쪽 상품을 화면에서 지워 버림(10/20 첫 번째 상품을 못 찾은 원인) → 맨 위에서 먼저 찾고, 한 칸씩 내리면서 매번 찾음 */
      window.scrollTo(0, 0); await sleep(300);
      P = probe();
      let last = -1, same = 0;
      for (let i = 0; !o.quick && P.hit < 0 && i < (o.scroll ? 80 : 40); i++) {
        window.scrollBy(0, Math.max(600, window.innerHeight * 0.7));
        await sleep(450);
        P = probe();
        if (o.scroll && maxN >= (o.max || 200)) break;
        const hgt = document.documentElement.scrollHeight;
        if (hgt === last && window.innerHeight + window.scrollY >= hgt - 5) { if (++same >= 3) break; } else same = 0;
        last = hgt;
      }
      if (P.el) P.el.scrollIntoView({ block: "center" });
    } else {
      if (o.quick) {}
      else if (o.scroll) await loadAll(80, () => found() || cardList().length >= (o.max || 200));
      else await loadAll(40);
      P = probe();
    }
    const list = P.list;
    let hit = P.hit, how = P.how, adHit = P.adHit, org = P.org;
    FOUND_EL = P.el;
    const body = document.body.innerText;
    if (!isNaver) window.scrollTo(0, 0);
    /* 비슷한 상품이 많은지: 가격비교·카탈로그로 묶인 칸이거나, 같은 상품명이 광고 아닌 칸에 2개 이상 */
    const nk15 = norm(o.nm).slice(0, 15);
    const sameN = nk15.length >= 8 ? list.filter(c => !isAd(c.el) && norm(c.el.innerText).indexOf(nk15) !== -1).length : 0;
    const hitEl = FOUND_EL || (hit >= 0 && list[hit] ? list[hit].el : null);
    const similar = !!hitEl && (/판매처\s*\d+|쇼핑몰별\s*최저가|최저\s*[\d,]+\s*원|가격\s*비교/.test(hitEl.innerText || "") || sameN >= 2);
    /* 못 찾았을 때 가장 비슷한 칸 (왜 못 찾았는지 보려고) */
    const near = hit < 0 ? nearBest : null;
    return { n: Math.max(list.length, maxN), hit: hit, org: org, similar: similar, how: how, adHit: adHit, near: near, keys: list.slice(0, 6).map(c => c.k), url: location.href, len: body.length, snip: list.length ? "" : snippet(),
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
    let ver = ""; try { ver = chrome.runtime.getManifest().version; } catch (e) {}
    add("div", "float:right;font-size:11px;color:#999", ver ? "v" + ver : "");   /* 설치된 버전 (잘 바뀌었는지 보려고) */
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
    if (FOUND_EL) { FOUND_EL.style.outline = "4px solid #e5397a"; FOUND_EL.style.outlineOffset = "2px"; FOUND_EL.scrollIntoView({ block: "center" }); return true; }
    const c = cardList()[i]; if (!c) return false;
    c.el.style.outline = "4px solid #e5397a"; c.el.style.outlineOffset = "2px";
    c.el.scrollIntoView({ block: "center" });
    return true;
  }
  /* 찾은 칸을 빨간 테두리로 표시하고 화면 안 위치를 돌려줌 (상품 위치 캡처 저장용, 사용자 요청 10/21) */
  async function markRect(i) {
    const el = FOUND_EL || (cardList()[i] || {}).el;
    if (!el) return null;
    el.style.outline = "4px solid #e00000"; el.style.outlineOffset = "2px";
    el.scrollIntoView({ block: "center" });
    await sleep(700);
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio || 1 };
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
  window.__PL = { markRect: markRect, mark: mark, here: here, state: state, banner: banner, readProduct: readProduct, scan: scan, priceUI: priceUI, clickPage: clickPage, box: box, copy: copy };
})();
