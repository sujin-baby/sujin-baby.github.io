/* 올리브영·토스 + 휴대폰 북마크: 생성기 북마크와 같은 코드 (생성기 bm-src에서 복사) */
(async () => {
  const L = location;
  /* 고른 옵션: '색상 × 수량' 같은 이름표 바로 옆 값 (콜론은 화면 꾸밈이라 글에 없을 때가 있음). 없으면 단일옵션 */
  const readOpt = () => {
    const OPT_LAB = /^(색상|옵션|사이즈|수량|구성|선택|용량|맛|종류|컬러|타입)(\s*[×x\/·,]\s*(색상|옵션|사이즈|수량|구성|선택|용량|맛|종류|컬러|타입))*\s*[:：]?$/;
    for (const lab of [...document.querySelectorAll("span,div,dt,th,td,strong,b,label,p,em")].filter(e => e.children.length <= 2 && OPT_LAB.test((e.innerText || "").trim()))) {
      let v = lab.nextElementSibling ? lab.nextElementSibling.innerText || "" : "";
      if (!v.trim() && lab.parentElement) v = (lab.parentElement.innerText || "").replace(lab.innerText, "");
      v = v.replace(/^\s*[:：]\s*/, "").replace(/\s+/g, " ").trim();
      if (v && v.length <= 60 && !/선택하세요|선택해\s*주세요|^\d+$/.test(v)) return v;
    }
    return "";
  };
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
  /* 키워드 추천 (생성기와 같은 규칙): 네추럴라이즈 플래티넘 오메가3 1100 … → 오메가3 | 플래티넘 오메가3 | 네추럴라이즈 오메가3 */
  const sugKw = nm => {
    const raw = String(nm || "").replace(/\(.*$/, "").replace(/\[[^\]]*\]/g, " "), dash = raw.split(/\s+-\s+/);
    let toks = dash[0].split(/[\s,]+/).filter(Boolean);
    const brand = toks.length >= 3 ? toks[0] : ""; if (brand) toks = toks.slice(1);
    const STOP = /^(탈부착식|탈부착|착붙는|무타공|세라믹|코팅|프리미엄|고급|대용량|소용량|회전|포함|정품|국내산|수입산|신상|신상품|인기|추천|최신|업그레이드|스마트|터치|겨울|여름|봄|가을|방한|보온보냉|보온|보냉|세척솔|대시보드|특가|증정|무료배송|1\+1|세트|단품|미니|슬림|휴대용|접이식)$/;
    const spec = t => /^\d|\d+(mg|g|kg|ml|l|개|캡슐|정|매|p|도|cm|mm|인치|w)\b|x\d/i.test(t) && !/^[가-힣a-z]+\d+$/i.test(t);
    const isMod = t => /(는|한|된|용)$/.test(t) && t.length <= 4;
    const cand = toks.filter(t => !spec(t) && !STOP.test(t) && !isMod(t) && t.length >= 2);
    const mods = toks.filter(t => /용$/.test(t) && t.length <= 4);
    const NOUN_SUFFIX = /(정|환|캡슐|스틱|분말|가루|원액|즙|차|오일|세럼|크림|로션|샴푸|패치|패드|거치대|매트|선풍기|텀블러|청소기|마사지기|워시|토너|앰플|마스크|비누|티슈|세제|치약|칫솔|홀더|걸이|선반|트레이|보틀|쿠션|방석|베개|슬리퍼|양말|장갑|모자|밴드)$/;
    const nounMatch = cand.find(t => NOUN_SUFFIX.test(t));
    const tail = t => t.slice(-3);
    const rep = cand.filter(t => t.length >= 4 && cand.some(u => u !== t && u.length >= 4 && tail(u) === tail(t)));
    const cat = dash[1] ? dash[1].split(/[\/,]/)[0].trim() : "";
    const main = nounMatch || rep[0] || (cat && cat.length >= 2 && !spec(cat) && !/일반|기타/.test(cat) ? cat : "") || cand.slice(0, 4).pop() || toks[0] || "";
    const alts = rep.filter(t => t !== main), out = [main];
    const add = x => { x = x.trim(); if (x && out.indexOf(x) === -1) out.push(x); };
    alts.forEach(add);
    mods.forEach(m => { add(m + " " + main); alts.forEach(a => add(m + " " + a)); });
    const rest = cand.filter(t => t !== main && alts.indexOf(t) === -1 && mods.indexOf(t) === -1);
    if (rest[0]) add(rest[0] + " " + main);
    if (brand && rest[0]) add(brand + " " + rest[0] + " " + main);
    else if (brand) add(brand + " " + main);
    rest.slice(1, 3).forEach(t => add(t + " " + main));
    return out.filter(Boolean).slice(0, 4);
  };
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
  /* 주소 뒤 #kw=…&pr=… 읽기, 결과 상자 (네이버·올리브영 같이 씀) */
  const hv = k => { const m = L.hash.match(new RegExp("[#&]" + k + "=([^&]+)")); return m ? decodeURIComponent(m[1]) : ""; };
  const show = (out, note, col) => {
    col = col || "#03c75a";
    const bx = document.createElement("div");
    bx.style.cssText = "position:fixed;right:8px;bottom:8px;z-index:2147483647;width:340px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow:auto;box-sizing:border-box;background:#fff;color:#1d1a24;border:2px solid " + col + ";border-radius:10px;padding:14px;font:13px/1.5 sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.2)";
    const hd = document.createElement("b"); hd.textContent = "생성기 '상품 정보' 칸에 붙여넣으세요"; bx.appendChild(hd);
    const ta = document.createElement("textarea"); ta.value = out; ta.style.cssText = "width:100%;height:110px;margin:6px 0;font:12px/1.5 monospace;box-sizing:border-box"; bx.appendChild(ta);
    if (note) { const n = document.createElement("div"); n.style.cssText = "color:#555;font-size:12px;margin-bottom:6px"; n.textContent = note; bx.appendChild(n); }
    const b1 = document.createElement("button"); b1.textContent = "복사"; b1.style.cssText = "width:48%;padding:7px;border:0;border-radius:6px;background:" + col + ";color:#fff";
    b1.onclick = () => { ta.select(); try { navigator.clipboard.writeText(out).then(() => { b1.textContent = "복사됨"; }, () => { document.execCommand("copy"); b1.textContent = "복사됨"; }); } catch (e) { document.execCommand("copy"); b1.textContent = "복사됨"; } };
    const b2 = document.createElement("button"); b2.textContent = "닫기"; b2.style.cssText = "width:48%;margin-left:4%;padding:7px;border:1px solid " + col + ";border-radius:6px;background:#fff;color:" + col; b2.onclick = () => bx.remove();
    bx.appendChild(b1); bx.appendChild(b2); document.body.appendChild(bx);
    try { navigator.clipboard.writeText(out).then(() => { b1.textContent = "복사됨 (생성기에 붙여넣기)"; }, () => {}); } catch (e) {}
    /* 확장 프로그램이 돌릴 때(oy.js)는 결과를 생성기로 바로 보냄. 북마크로 돌릴 때는 chrome.runtime이 없어서 건너뜀 */
    try { if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id) chrome.runtime.sendMessage(/상품번호\s*[:：]|위치\s*[:：]/.test(out) ? { type: "plResult", text: out, shot: true } : { type: "plStatus", text: [out, note].filter(Boolean).join(" · ") }); } catch (e) {}
    return bx;
  };
  /* ---------- 네이버: 스마트스토어 상품 페이지 = 상품 정보, 네이버 쇼핑 검색 화면 = 찾은 페이지 ---------- */
  if (/naver\.com$/.test(L.hostname)) {
    const pm = L.pathname.match(/products\/(\d+)/);
    if (pm) {
      /* 상품 페이지: 상품명, 판매처(스토어 이름), 상품번호, 썸네일 */
      const og = n => { const m = document.querySelector('meta[property="og:' + n + '"]'); return m ? (m.content || "") : ""; };
      const parts = document.title.split(/\s+:\s+/);
      const name = (og("title") || parts[0] || "").split(/\s+:\s+/)[0].trim();
      const seller = (parts.length > 1 ? parts[parts.length - 1] : og("site_name")).replace(/\s*[-|]?\s*네이버.*$/, "").trim();
      let img = og("image"); if (img.indexOf("//") === 0) img = "https:" + img;
      const kwh = hv("kw") || sugKw(name).join("|");
      const html0 = document.documentElement.innerHTML;
      let prh = Number(hv("pr") || 0);
      if (!prh) { const dm = html0.match(/"discountedSalePrice"\s*:\s*(\d{3,})/) || html0.match(/"salePrice"\s*:\s*(\d{3,})/); if (dm) prh = Number(dm[1]); }
      if (!prh) { const t0 = document.body.innerText, i0 = t0.indexOf(name.slice(0, 10)); const ps = ((i0 >= 0 ? t0.slice(i0, i0 + 1500) : t0).match(/\d{1,3}(?:,\d{3})+\s*원/g) || []).slice(0, 2).map(x => Number(x.replace(/[^0-9]/g, ""))); if (ps.length) prh = Math.min.apply(null, ps); }
      const mob0 = /^m\./.test(L.hostname) || /iPhone|iPad|Android/i.test(navigator.userAgent);
      const kw0 = (kwh.split("|")[0] || "").trim() || name;
      const sUrl = (mob0 ? "https://msearch.shopping.naver.com" : "https://search.shopping.naver.com") + "/search/all?query=" + encodeURIComponent(kw0) +
        "#pid=" + pm[1] + "&nm=" + encodeURIComponent(name) + "&st=" + encodeURIComponent(seller) + (kwh ? "&kw=" + encodeURIComponent(kwh) : "") + (prh ? "&pr=" + prh : "");
      const bx = show(["상품명 : " + name, "판매처 : " + seller, "상품번호 : " + pm[1], "옵션 : " + (readOpt() || "단일옵션"), prh ? "가격 : " + prh.toLocaleString("ko-KR") + "원" : "", "배송비 : " + shipOf(document.body.innerText, name, prh), img ? "썸네일 : " + img : ""].filter(Boolean).join("\n"),
        "위치는 아래 [위치 찾기] → 열린 네이버 쇼핑 화면에서 이 북마크를 한 번 더. 키워드: " + kwh.split("|").join(" → ") + (prh ? " (각각 가격 " + prh.toLocaleString("ko-KR") + "원 필터도)" : ""));
      const go = document.createElement("a"); go.href = sUrl; go.target = "_blank"; go.rel = "noopener"; go.textContent = "위치 찾기 (네이버 쇼핑 열기)";
      go.style.cssText = "display:block;margin-top:8px;padding:9px;border-radius:6px;background:#03c75a;color:#fff;text-align:center;font-weight:700;text-decoration:none";
      bx.appendChild(go);
      return;
    }
    if (/shopping\.naver\.com$/.test(L.hostname)) {
      /* 네이버 쇼핑 검색 화면: 지금 보고 있는 화면만 읽음. 자동으로 여러 페이지를 넘기면 네이버가 '접속 일시 제한'으로 막아서(10/16) 넘기기는 사람이 */
      const mobN = /^m/.test(L.hostname);
      let T = null;
      try { T = JSON.parse(localStorage.getItem("__pl_target") || "null"); } catch (e) {}
      if (hv("pid")) { T = { pid: hv("pid").replace(/\D/g, ""), nm: hv("nm"), st: hv("st"), kw: hv("kw"), pr: Number(hv("pr") || 0) }; try { localStorage.setItem("__pl_target", JSON.stringify(T)); } catch (e) {} }
      if (!T || (!T.pid && !T.nm)) { alert("먼저 네이버 상품 페이지에서 북마크 → [위치 찾기]로 이 화면을 열어 주세요."); return; }
      if (/일시적으로\s*제한|접속이\s*(제한|불가)/.test(document.body.innerText.slice(0, 3000))) { alert("네이버가 접속을 잠깐 막아 둔 상태예요. 시간이 지나면 풀려요. 풀린 뒤 다시 눌러 주세요."); return; }
      const norm = t => String(t || "").replace(/[\s\[\]\(\)\/,.·\-_+~!*'"]/g, "").toLowerCase();
      const nmK = norm(T.nm).slice(0, 25), stK = norm(T.st);
      const PROD_RE = /smartstore\.naver\.com|brand\.naver\.com|shopping\.naver\.com|adcr|nv_?mid|nvmid|catalog|bridge|\/products\//i;
      const NOT_T = /^(\d[\d,]*\s*원?|가격비교.*|리뷰.*|찜.*|구매.*|등록일.*|정보|신고.*|광고|AD|더보기|판매처.*|\d+)$/;
      const cards = () => {
        const ks = [...document.querySelectorAll("a[href]")].map(a => ({ a: a, t: (a.innerText || "").trim() })).filter(x => x.t.length >= 8 && !NOT_T.test(x.t) && /[가-힣a-z]/i.test(x.t) && PROD_RE.test(x.a.href)).map(x => ({ a: x.a, k: norm(x.t).slice(0, 40) }));
        const n = el => { const st = new Set(); ks.forEach(x => { if (el.contains(x.a)) st.add(x.k); }); return st.size; };
        const seen = new Set(), out = [];
        ks.forEach(x => { let el = x.a; while (el.parentElement && el.parentElement !== document.body && n(el.parentElement) <= 1) el = el.parentElement; if (!seen.has(el) && !el.contains(document.getElementById("__pl_bm"))) { seen.add(el); out.push(el); } });
        const cp = new Map(); out.forEach(el => cp.set(el.parentElement, (cp.get(el.parentElement) || 0) + 1));
        return out.filter(el => cp.get(el.parentElement) >= 3);
      };
      const isAd = el => /(^|[\s·|])(광고|AD)([\s·|]|$)/.test(el.innerText || "");
      const pidRe = T.pid && T.pid.length >= 8 ? new RegExp("(^|\\D)" + T.pid + "(?!\\d)") : null;
      /* 상품명 낱말 대부분 + 스토어 이름이 같아도 같은 상품 (앞부분이 조금 달라도) */
      const nToks = String(T.nm || "").split(/[\s\/,·|]+/).map(norm).filter(x => x.length >= 2);
      const nScore = t => nToks.length < 3 ? 0 : nToks.filter(x => t.indexOf(x) !== -1).length / nToks.length;
      const find = () => { const cs = cards(); let best = -1, how = "", ad = false; cs.forEach((el, i) => { const t = norm(el.innerText), stOk = stK.length >= 2 && t.indexOf(stK) !== -1, sc = nScore(t); const h = pidRe && pidRe.test(el.innerHTML) ? "상품번호" : (nmK.length >= 6 && t.indexOf(nmK) !== -1 ? (stOk ? "상품명+스토어" : "상품명") : (sc >= 0.8 && stOk ? "상품명+스토어" : (sc >= 0.95 ? "상품명" : ""))); if (!h) return; if (isAd(el)) { ad = true; return; } if (best < 0 || (how === "상품명" && h !== "상품명")) { best = i; how = h; } }); return { i: best, how: how, ad: ad, n: cs.length, el: best >= 0 ? cs[best] : null }; };
      const bx = show("", "아래로 내리면서 찾는 중… (이 화면만 봐요)");
      bx.id = "__pl_bm";
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      /* 이 화면 끝까지 천천히 내려서 상품을 다 그리게 (모바일은 200개까지) */
      let last = -1, same = 0, f = find();
      for (let i = 0; i < 60 && f.i < 0; i++) {
        scrollBy(0, Math.max(700, innerHeight * 0.8)); await sleep(600);
        f = find();
        if (mobN && f.n >= 200) break;
        const hgt = document.documentElement.scrollHeight;
        if (hgt === last && innerHeight + scrollY >= hgt - 5) { if (++same >= 3) break; } else same = 0;
        last = hgt;
      }
      /* 링크로 상품 칸을 못 잡는 화면용: 화면 글자에서 상품명(+스토어)이 든 칸을 찾고 가격 적힌 형제 칸 중 몇 번째인지 */
      if (f.i < 0 && T.nm) {
        const key = String(T.nm).split(/[\s\/,·|]+/).filter(x => x.length >= 2).sort((a, b) => b.length - a.length)[0] || "";
        const ok = el => { if (el.closest("#__pl_bm")) return false; const tc = el.textContent || ""; if (!key || tc.length > 3000 || tc.indexOf(key) === -1) return false; const t = norm(el.innerText), sc = nScore(t); return (nmK.length >= 6 && t.indexOf(nmK) !== -1) || (sc >= 0.8 && stK.length >= 2 && t.indexOf(stK) !== -1) || sc >= 0.95; };
        const all = [...document.querySelectorAll("li,div,article,section,td")].filter(ok), leaves = all.filter(el => !all.some(x => x !== el && el.contains(x)));
        const PR = /\d{1,3}(?:,\d{3})+\s*원/;
        for (const lf of leaves) { let a = lf, done = false; while (a.parentElement && a.parentElement !== document.body && !done) { const sib = [...a.parentElement.children].filter(c => PR.test(c.textContent || "")); if (sib.length >= 3 && sib.indexOf(a) >= 0) { done = true; if (!isAd(a)) f = { i: 0, how: "화면 글자", ad: false, n: f.n, el: a, org: sib.slice(0, sib.indexOf(a)).filter(c => !isAd(c)).length + 1 }; } a = a.parentElement; } if (f.i >= 0) break; }
      }
      const qp = new URLSearchParams(L.search);
      let q = qp.get("query") || ""; if (!q) { const inp = document.querySelector('input[type="search"], input[name="query"], header input[type="text"]'); if (inp) q = inp.value || ""; }
      let lo = Number(qp.get("minPrice") || 0), hi = Number(qp.get("maxPrice") || 0);
      const cm = document.body.innerText.slice(0, 8000).match(/(\d{1,3}(?:,\d{3})+)\s*원?\s*~\s*(\d{1,3}(?:,\d{3})+)\s*원/); if (cm) { lo = Number(cm[1].replace(/,/g, "")); hi = Number(cm[2].replace(/,/g, "")); }
      let pg = Number(qp.get("pagingIndex") || 0);
      if (!pg) { const cur = [...document.querySelectorAll("a,button,strong,span,em")].find(e => /^\d{1,2}$/.test((e.innerText || "").trim()) && (e.getAttribute("aria-current") === "page" || e.getAttribute("aria-selected") === "true" || /active|current|selected|(^|[\s_-])on($|[\s_-])/i.test(String(e.className || "")))); pg = cur ? Number(cur.innerText.trim()) : 1; }
      const won = n => n.toLocaleString("ko-KR");
      const filt = lo && hi ? "가격 " + won(lo) + "~" + won(hi) + "원" : "";
      bx.remove();
      if (f.i >= 0) {
        f.el.style.outline = "4px solid #e5397a"; f.el.style.outlineOffset = "2px"; f.el.scrollIntoView({ block: "center" });
        const org = f.org || cards().slice(0, f.i).filter(el => !isAd(el)).length + 1;
        const pos = mobN ? Math.max(1, Math.ceil(org / 40)) + "페이지" : pg + "페이지";
        const gg = lo && hi ? "가검" + (lo === hi ? lo : lo + "~" + hi) : "";
        /* 비슷한 상품이 많은지: 가격비교·카탈로그로 묶인 칸이거나, 같은 상품명이 광고 아닌 칸에 2개 이상 */
        const nk15 = norm(T.nm).slice(0, 15), cs2 = cards();
        const sim = /판매처\s*\d+|쇼핑몰별\s*최저가|최저\s*[\d,]+\s*원|가격\s*비교/.test(f.el.innerText || "") || (nk15.length >= 8 && cs2.filter(el => !isAd(el) && norm(el.innerText).indexOf(nk15) !== -1).length >= 2);
        show([q ? "찾은 키워드 : " + q.trim() : "", gg ? "필터 : " + gg : "", sim ? "주의 : 비슷한 상품 많음" : "", (mobN ? "모바일 위치 : " : "PC 위치 : ") + pos].filter(Boolean).join("\n"), "찾았어요 (분홍 테두리). 복사해서 생성기 '상품 정보 붙여넣기' 칸에." + (f.how === "상품명" ? " 상품명으로 찾음(스토어 이름은 화면에 없었음)." : ""));
      } else {
        const ks = String(T.kw || "").split("|").filter(Boolean);
        const nb = show("이 화면에는 없어요", "검색어 '" + q + "'" + (filt ? ", " + filt : "") + (mobN ? "" : ", " + pg + "페이지") + ", 상품 " + f.n + "개 확인" + (f.ad ? " (광고 자리에만 있어요)" : "") + ".\n" + (mobN ? "" : "다음 페이지를 누르고 북마크를 다시 눌러 주세요. ") + (ks.length > 1 ? "그다음 키워드: " + ks.slice(1).join(" → ") : ""));
        /* 가격 필터가 아직이면 단추 하나로 가격 넣은 검색 화면을 엶 (모바일은 가격 직접입력이 번거로워서, 10/21 실링팬) → 열리면 북마크 한 번 더 */
        if (T.pr && !filt) {
          const u = new URL(L.href); u.searchParams.set("minPrice", T.pr); u.searchParams.set("maxPrice", T.pr); u.searchParams.delete("pagingIndex");
          const go = document.createElement("a"); go.href = u.href; go.textContent = "가격 " + won(T.pr) + "원 넣고 다시 검색 (열리면 북마크 한 번 더)";
          go.style.cssText = "display:block;margin-top:8px;padding:10px;border-radius:6px;background:#03c75a;color:#fff;text-align:center;font-weight:700;text-decoration:none";
          nb.appendChild(go);
          /* 휴대폰은 바로 가격 넣은 화면으로 넘어감 (단추 누를 필요 없이). 열리면 북마크만 한 번 더 */
          if (mobN) { go.textContent = "가격 " + won(T.pr) + "원 넣은 화면으로 넘어가는 중… 열리면 북마크 한 번 더"; setTimeout(() => { L.href = u.href; }, 1500); }
        }
      }
      return;
    }
    alert("네이버는 스마트스토어 상품 페이지나 네이버 쇼핑 검색 화면에서 눌러 주세요.");
    return;
  }
  /* ---------- 토스쇼핑: 상품 정보만 (상품명, 판매자, 상품번호, 가격, 썸네일). 검색 순위는 토스 앱 안이라 못 찾음 ---------- */
  if (/(^|\.)toss\.(shopping|im)$/.test(L.hostname)) {
    const og = n => { const m = document.querySelector('meta[property="og:' + n + '"]'); return m ? (m.content || "") : ""; };
    const txt = document.body.innerText;
    const id = (L.pathname.match(/\/(?:i|c|p|products?)\/(\d{5,})/) || [])[1] || (L.href.match(/(\d{8,})/) || [])[1] || "";
    let name = (og("title") || document.title).replace(/\s*[|\-]\s*토스.*$/, "").trim();
    if (!name || /토스쇼핑/.test(name)) { const i0 = txt.search(/배송\s*일정|판매자/); name = i0 > 0 ? txt.slice(0, i0).split("\n").map(x => x.trim()).filter(x => x && !/토스쇼핑|QR|가격을/.test(x)).pop() || "" : ""; }
    const seller = ((txt.match(/판매자\s*\n?\s*([^\n>]{1,30})/) || [])[1] || "").trim();
    const pm = txt.match(/(\d{1,3}(?:,\d{3})+)\s*원/), price = pm ? Number(pm[1].replace(/,/g, "")) : 0;
    let img = og("image"); if (img.indexOf("//") === 0) img = "https:" + img;
    try { if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id) { const sel = [...document.querySelectorAll("div,span,dd,p")].find(e => e.children.length === 0 && (e.textContent || "").trim() === seller); const bottom = sel ? sel.getBoundingClientRect().bottom + 10 : innerHeight; const top = Math.max(0, bottom - Math.min(innerHeight, 900)); const im = document.querySelector("img"); const ir = im ? im.getBoundingClientRect() : { left: 0, width: innerWidth }; chrome.runtime.sendMessage({ type: "plShot", rc: { x: ir.left, y: top, w: ir.width || innerWidth, h: bottom - top, vw: innerWidth, vh: innerHeight }, name: name, pid: id }); } } catch (e) {}
    show(["상품명 : " + name, "판매처 : " + seller, "상품번호 : " + id, "옵션 : " + (readOpt() || "단일옵션"), price ? "가격 : " + price.toLocaleString("ko-KR") + "원" : "", price ? "배송비 : " + shipOf(txt, name, price) : "", img ? "썸네일 : " + img : ""].filter(Boolean).join("\n"), "토스는 검색 순위를 못 찾아요 (앱 안 검색). 위치는 직접 넣어 주세요.", "#3182f6");
    return;
  }
  /* ---------- 올리브영: 상품 페이지 = 상품 정보, 검색 화면 = 몇 번째 (확장 프로그램은 올리브영을 못 읽어서 북마크로) ---------- */
  if (/oliveyoung\.co\.kr$/.test(L.hostname)) {
    const OY = "#7aa61a", mobO = /^m\./.test(L.hostname) || /iPhone|iPad|Android/i.test(navigator.userAgent);
    const gq = (L.search.match(/goodsNo=(A\d{9,})/i) || [])[1];
    /* 결과 상자 위쪽 상품 정보 (검색 화면 결과에도 같이 넣어서 한 번에 붙여넣게) */
    const oyInfo = T => ["상품명 : " + (T.nm || ""), "판매처 : " + (T.st || "올리브영"), "상품번호 : " + T.gno, "옵션 : " + (T.opt || "단일옵션"), T.pr ? "가격 : " + Number(T.pr).toLocaleString("ko-KR") + "원" : "", T.ship ? "배송비 : " + T.ship : "", T.img ? "썸네일 : " + T.img : ""].filter(Boolean);
    const txtOf = sel => { const e = document.querySelector(sel); return e ? (e.innerText || e.textContent || "").replace(/\s+/g, " ").trim() : ""; };
    if (gq && /GoodsDetail/i.test(L.pathname)) {
      /* 상품 페이지: 상품명, 브랜드(판매처 칸), 상품번호(goodsNo), 가격, 썸네일 */
      const og = n => { const m = document.querySelector('meta[property="og:' + n + '"]'); return m ? (m.content || "") : ""; };
      let name = txtOf(".prd_name") || txtOf("[class*=GoodsName],[class*=goodsName],[class*=goods-name],[class*=goods_name]");
      if (!name) name = (og("title") || document.title).replace(/\s*[|\-]\s*올리브영.*$/, "").replace(/^\[?올리브영\]?\s*/, "").trim();
      const brand = (txtOf(".prd_brand") || txtOf("[class*=BrandName],[class*=brandName],[class*=brand-name],[class*=brand_name]")).replace(/\s*브랜드\s*(홈|관).*$/, "").replace(/\s*>\s*$/, "").trim();
      let img = og("image"); if (img.indexOf("//") === 0) img = "https:" + img;
      let price = Number(hv("pr") || 0);
      if (!price) { const pe = txtOf(".price-2 strong") || txtOf(".price-2"); if (pe) price = Number(pe.replace(/[^0-9]/g, "")) || 0; }
      if (!price) { const t0 = document.body.innerText, i0 = t0.indexOf(name.slice(0, 10)); const ps = ((i0 >= 0 ? t0.slice(i0, i0 + 1500) : t0).match(/\d{1,3}(?:,\d{3})+\s*원/g) || []).slice(0, 2).map(x => Number(x.replace(/[^0-9]/g, ""))); if (ps.length) price = Math.min.apply(null, ps); }
      const kwh = hv("kw") || new URLSearchParams(L.search).get("t_search_name") || sugKw(name).join("|");
      const kw0 = (kwh.split("|")[0] || "").trim() || name;
      const T = { gno: gq, nm: name, st: brand || "올리브영", pr: price, img: img, opt: readOpt() || "단일옵션", ship: shipOf(document.body.innerText, name, price), kw: kwh };
      try { localStorage.setItem("__pl_oy", JSON.stringify(T)); } catch (e) {}
      const sUrl = "https://www.oliveyoung.co.kr/store/search/getSearchMain.do?query=" + encodeURIComponent(kw0) + "#gno=" + gq + "&nm=" + encodeURIComponent(name) + "&st=" + encodeURIComponent(T.st) + (price ? "&pr=" + price : "") + "&kw=" + encodeURIComponent(kwh);
      const bx = show(oyInfo(T).join("\n"),
        "위치는 아래 [위치 찾기] → 열린 올리브영 검색 화면에서 이 북마크를 한 번 더. 키워드: " + kwh.split("|").join(" → "), OY);
      window.__plOySearch = sUrl;
      const go = document.createElement("a"); go.href = sUrl; go.target = "_blank"; go.rel = "noopener"; go.textContent = "위치 찾기 (올리브영 검색 열기)";
      go.style.cssText = "display:block;margin-top:8px;padding:9px;border-radius:6px;background:" + OY + ";color:#fff;text-align:center;font-weight:700;text-decoration:none";
      bx.appendChild(go);
      return;
    }
    /* 검색 화면: 찾는 상품(goodsNo)이 광고 빼고 몇 번째인지. 대상은 주소 뒤 #gno= → 저장해 둔 것 → 복사해 둔 상품 정보 → 직접 입력 순서 */
    let T = null;
    try { T = JSON.parse(localStorage.getItem("__pl_oy") || "null"); } catch (e) {}
    if (hv("gno")) { const o = T && T.gno === hv("gno") ? T : {}; T = Object.assign({}, o, { gno: hv("gno"), nm: hv("nm") || o.nm, st: hv("st") || o.st, pr: Number(hv("pr") || 0) || o.pr, kw: hv("kw") || o.kw }); }
    if (!T || !T.gno) { let cb = ""; try { cb = (await navigator.clipboard.readText()) || ""; } catch (e) {} const m = cb.match(/상품번호\s*[:：]\s*(A\d{9,})/), m2 = cb.match(/상품명\s*[:：]\s*([^\n]+)/); if (m) T = { gno: m[1], nm: m2 ? m2[1].trim() : "", kw: "" }; }
    if (!T || !T.gno) { const a = (prompt("찾을 올리브영 상품번호 (상품 주소의 goodsNo=A000… 부분, 주소를 통째로 붙여넣어도 돼요)", "") || "").match(/A\d{9,}/); if (!a) return; T = { gno: a[0], nm: "", kw: "" }; }
    try { localStorage.setItem("__pl_oy", JSON.stringify(T)); } catch (e) {}
    const gnoOf = el => { const s = (el.getAttribute("href") || "") + " " + [...el.attributes].filter(x => /^data-/.test(x.name)).map(x => x.value).join(" "); const m = s.match(/A\d{9,}/); return m ? m[0] : ""; };
    const cards = () => {
      const ks = [...document.querySelectorAll("a[href],[data-ref-goodsno],[data-goodsno],[data-goods-no]")].map(e => ({ e: e, g: gnoOf(e) })).filter(x => x.g && !x.e.closest("#__pl_bm"));
      const n = el => { const st = new Set(); ks.forEach(x => { if (el.contains(x.e)) st.add(x.g); }); return st.size; };
      const seen = new Set(), out = [];
      ks.forEach(x => { let el = x.e; while (el.parentElement && el.parentElement !== document.body && n(el.parentElement) <= 1) el = el.parentElement; if (!seen.has(el)) { seen.add(el); out.push({ el: el, g: x.g }); } });
      return out;
    };
    const isAd = el => /(^|[\s·|])(광고|AD|Ad)([\s·|]|$)/.test(el.innerText || "") || !!el.querySelector('img[alt="AD"],img[alt="광고"]');
    const find = () => {
      /* 같은 상품이 '최근 본 상품' 같은 작은 묶음에도 있으면, 상품이 가장 많이 모인 줄에 있는 것 */
      const cs = cards().filter(c => c.el.getClientRects().length), sib = c => cs.filter(d => d.el.parentElement === c.el.parentElement).length;
      const hit = cs.filter(c => c.g === T.gno), org = hit.filter(c => !isAd(c.el)).sort((a, b) => sib(b) - sib(a))[0];
      if (!org) return { el: null, n: cs.length, ad: hit.length > 0 };
      /* 위쪽 추천·배너 묶음은 빼고: 이 상품이 든 목록(상품 12개 이상 든 가장 작은 묶음) 안에서만 셈 */
      const need = Math.min(12, cs.length);
      let box = org.el; while (box.parentElement && box !== document.body && cs.filter(c => box.contains(c.el)).length < need) box = box.parentElement;
      const seenG = new Set(); let rank = 0;
      for (const c of cs) { if (!box.contains(c.el) || isAd(c.el) || seenG.has(c.g)) continue; seenG.add(c.g); rank++; if (c.g === T.gno) break; }
      return { el: org.el, n: cs.length, rank: rank };
    };
    const bx = show("", "찾는 중… (이 화면만 봐요)", OY);
    bx.id = "__pl_bm";
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    let f = find(), last = -1, same = 0;
    for (let i = 0; i < 40 && !f.el; i++) {
      scrollBy(0, Math.max(700, innerHeight * 0.8)); await sleep(600);
      f = find();
      const hgt = document.documentElement.scrollHeight;
      if (hgt === last && innerHeight + scrollY >= hgt - 5) { if (++same >= 3) break; } else same = 0;
      last = hgt;
    }
    const qp = new URLSearchParams(L.search);
    let q = qp.get("query") || ""; if (!q) { const inp = document.querySelector('input[type="search"], input[name="query"], #query'); if (inp) q = inp.value || ""; }
    const curP = document.querySelector(".pageing strong, .paging strong, [aria-current=page]") || [...document.querySelectorAll("a,button,strong,span")].find(e => /^\d{1,2}$/.test((e.innerText || "").trim()) && /active|current|selected|(^|[\s_-])on($|[\s_-])/i.test(String(e.className || "")));
    const pg = curP && /^\d{1,2}$/.test((curP.innerText || "").trim()) ? Number(curP.innerText.trim()) : 1;
    bx.remove();
    if (f.el) {
      f.el.style.outline = "4px solid #e00000"; f.el.style.outlineOffset = "2px"; f.el.scrollIntoView({ block: "center" });
      /* 확장 프로그램이면 이 칸을 캡처해서 저장 (빨간 테두리, 상품명·가격 보이게) */
      try { if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id) { await sleep(600); const rr = f.el.getBoundingClientRect(); chrome.runtime.sendMessage({ type: "plShot", rc: { x: rr.left, y: rr.top, w: rr.width, h: rr.height, vw: innerWidth, vh: innerHeight }, name: T.nm, pid: T.gno }); } } catch (e) {}
      /* 상품 페이지를 안 거치고 왔으면 찾은 칸에서 상품명·브랜드·가격·사진 */
      const cq = sel => { const e = f.el.querySelector(sel); return e ? (e.innerText || e.textContent || "").replace(/\s+/g, " ").trim() : ""; };
      if (!T.nm) T.nm = cq(".tx_name, [class*=name]");
      if (!T.st) T.st = cq(".tx_brand, [class*=brand]");
      if (!T.pr) T.pr = Number(cq(".tx_cur .tx_num, .tx_cur, [class*=price]").replace(/[^0-9]/g, "")) || 0;
      if (!T.img) { const im = f.el.querySelector("img"); T.img = im ? (im.currentSrc || im.src || "") : ""; }
      if (!T.ship) T.ship = /무료\s*배송/.test(f.el.innerText || "") ? "무료" : (T.pr ? shipOf(f.el.innerText || "", "", T.pr) : "");
      show(oyInfo(T).concat([q ? "찾은 키워드 : " + q.trim() : "", mobO ? "모바일 위치 : 위에서 " + f.rank + "번째" : "PC 위치 : " + pg + "페이지 (위에서 " + f.rank + "번째)"]).filter(Boolean).join("\n"), "찾았어요 (분홍 테두리, 광고 빼고 " + f.rank + "번째). 복사해서 생성기 '상품 정보 붙여넣기' 칸에.", OY);
    } else {
      show("이 화면에는 없어요", "검색어 '" + q + "', " + (mobO ? "" : pg + "페이지, ") + "상품 " + f.n + "개 확인" + (f.ad ? " (광고 자리에만 있어요)" : "") + ". 찾는 상품번호 " + T.gno + "." + (mobO ? "" : " 다음 페이지를 누르고 북마크를 다시 눌러 주세요."), OY);
    }
    return;
  }
  if (!/coupang\.com$/.test(L.hostname)) { alert("쿠팡 상품 페이지(또는 네이버 상품 페이지·네이버 쇼핑 검색 화면·올리브영 상품 페이지)에서 눌러 주세요."); return; }
  const pm = L.pathname.match(/\/v[pm]\/products\/(\d+)/);
  if (!pm) { alert("쿠팡 상품 상세 페이지에서 눌러 주세요."); return; }
  const mob = /^m\./.test(L.hostname);
  const pid = pm[1];
  const html = document.documentElement.innerHTML;
  const qs = new URLSearchParams(L.search);
  let item = qs.get("itemId") || qs.get("itemid") || "";
  if (!item) { const m = html.match(/["']?itemId["']?\s*[:=]\s*["']?(\d{8,})/); if (m) item = m[1]; }
  const mask = s => s && s.length > 8 ? s.slice(0, 4) + "***" + s.slice(-4) : s;
  /* 상품명: 화면에 보이는 제목. og:title은 ' - 일반거치대' 같은 분류가 붙어서 마지막에 */
  const og = document.querySelector('meta[property="og:title"]');
  const jv = k => { const m = document.documentElement.innerHTML.match(new RegExp('"' + k + '"\\s*:\\s*"([^"]{2,120})"')); return m ? m[1] : ""; };
  let name = [...document.querySelectorAll("h1, h2, h3")].map(e => (e.innerText || "").replace(/\s+/g, " ").trim()).find(t => t.length >= 6 && t.length <= 200 && !/쿠팡|coupang|장바구니|카테고리/i.test(t)) || "";
  if (!name) name = jv("itemName") || jv("productName");
  if (!name) name = ((og && og.content) || document.title).replace(/\s*[-|]\s*쿠팡!?\s*$/, "").replace(/\s+-\s+[^-]{1,20}$/, "").trim();
  const txt = document.body.innerText;
  let seller = "";
  const be = document.querySelector('.prod-brand-name, [class*="brand-name"], [class*="brandName"], a[class*="brand"]');
  if (be) seller = be.textContent.trim();
  if (!seller) {
    const sm = txt.match(/판매자\s*[:：]?\s*([^\n]{1,60})/);
    if (sm) seller = sm[1].replace(/\s*(판매자\s*)?(상품\s*)?보러\s*가기.*$/, "").replace(/\s*판매자\s*평가.*$/, "").trim();
  }
  /* '판매자 특가', '판매자로켓' 같은 배지 글자는 판매처가 아님 → 페이지 데이터의 판매자 이름 먼저 (10/21 아이폰 '특가') */
  const vn = jv("vendorName");
  if (vn && !seller) seller = vn;
  if (!seller || seller.length > 30 || /가입|보러가기|평가|정보|^특가|로켓|할인|쿠폰|무료|배송|와우/.test(seller)) {
    const s2 = txt.match(/상호\s*\/\s*대표자\s*([^\n\/]{1,40})/);
    if (s2 && !seller) seller = s2[1].trim();
  }
  if (!seller && name) {
    const bg = name.split(/\s+/)[0];
    if (bg && /^[가-힣a-zA-Z0-9]{2,10}$/.test(bg) && !/^(로켓|쿠팡|무료|특가|할인|배송)/.test(bg)) seller = bg;
  }
  const ogi = document.querySelector('meta[property="og:image"]');
  let img = ogi ? ogi.content : "";
  if (img.indexOf("//") === 0) img = "https:" + img;
  /* 고른 옵션 (예: 매트블랙 x 1개) */
  let opt = readOpt();
  if (!opt) { const oe = document.querySelector('.prod-option__selected .value, .prod-option__selected-container .value'); if (oe) opt = oe.textContent.replace(/\s+/g, " ").trim().slice(0, 60); }
  if (!opt) { const om = document.body.innerText.match(/(?:색상|옵션|구성|사이즈|수량|선택|용량)[^\n]{0,12}[:：]\s*([^\n]{1,40})/); if (om && !/선택하세요|선택해\s*주세요/.test(om[1])) opt = om[1].trim(); }
  if (!opt) opt = "단일옵션";
  const hk = (L.hash.match(/kw=([^&]+)/) || [])[1];
  const hp = Number((L.hash.match(/pr=(\d+)/) || [])[1] || 0);
  /* 썸네일 파일 이름 = 폼 제목 (생성기가 &fn= 으로 넘김, 사용자 요청 10/24). 주소에서 #이 빠졌으면 복사해 둔 주소에서 */
  let fnIn = "";
  try { fnIn = decodeURIComponent((L.hash.match(/fn=([^&]+)/) || [])[1] || ""); } catch (e) {}
  if (!fnIn) { try { const cb0 = ((await navigator.clipboard.readText()) || ""); fnIn = decodeURIComponent((cb0.match(/[#&]fn=([^&\s]+)/) || [])[1] || ""); } catch (e) {} }
  /* 키워드: 생성기 [상품 페이지 열기]가 주소 뒤(#kw=)에 붙여 줌. 쿠팡 단축 링크가 넘어가면서 #을 버리면, 그 버튼이 복사해 둔 의뢰서 키워드(클립보드)를 씀. */
  let kwIn = hk ? decodeURIComponent(hk) : "", kwFrom = hk ? "생성기 주소" : "";
  if (!kwIn) {
    let cb = "";
    try { cb = ((await navigator.clipboard.readText()) || "").trim(); } catch (e) {}
    const nmN = name.replace(/\s+/g, "");
    /* 생성기 [상품 페이지 열기]가 복사한 상품 주소(#kw=…)에서 키워드 (아이폰: 쿠팡이 모바일 주소로 넘어가며 #을 버림) */
    const ck = (cb.match(/[#&]kw=([^&\s]+)/) || [])[1];
    if (ck) {
      kwIn = decodeURIComponent(ck);
      kwFrom = "생성기 주소 (클립보드)";
    } else if (cb && cb.length <= 30 && !/[\n\r]|http|[:：]/.test(cb)) {
      kwIn = cb;
      kwFrom = "복사해 둔 의뢰서 키워드";
    }
  }
  // 사용자가 직접 입력하는 prompt는 제거: 없으면 알아서 상품명 자동 추천으로 탐색
  if (!kwIn) {
    kwIn = sugKw(name).join("|");
    kwFrom = "상품명 자동 추천";
  }
  const kws = kwIn.split("|").map(x => x.trim()).filter(Boolean);
  const kw = kws[0] || "";
  let price = hp;
  /* 가격: 제목 바로 뒤 첫 가격 (할인·쿠폰·적립·배송 금액은 건너뜀) */
  if (!price) {
    const i0 = txt.indexOf(name.slice(0, 12)), t0 = i0 >= 0 ? txt.slice(i0, i0 + 2500) : txt.slice(0, 4000), re0 = /(\d{1,3}(?:,\d{3})+)\s*원/g;
    let m0;
    while ((m0 = re0.exec(t0))) { const bf = t0.slice(Math.max(0, m0.index - 12), m0.index), af = t0.slice(m0.index, m0.index + m0[0].length + 6); if (/할인|쿠폰|적립|캐시|배송|최대|이상/.test(bf) || /할인|이상/.test(af)) continue; price = Number(m0[1].replace(/,/g, "")); break; }
  }
  const optPrices = readOptPrices(txt, name, price);
  if (optPrices.length && !optPrices.some(x => x.o === opt)) { const hit = optPrices.filter(x => x.p === price); if (hit.length === 1) opt = hit[0].o; }
  const lo = price ? Math.floor(price * 0.9 / 100) * 100 : 0, hi = price ? Math.ceil(price * 1.1 / 100) * 100 : 0;
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;right:8px;bottom:8px;z-index:2147483647;width:340px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow:auto;box-sizing:border-box;background:#fff;color:#1d1a24;border:2px solid #5b2a86;border-radius:10px;padding:14px;font:13px/1.5 sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.2)";
  const msg = document.createElement("div");
  box.appendChild(msg);
  document.body.appendChild(box);
  msg.style.whiteSpace = "pre-line";
  const say = t => { msg.textContent = t ? "키워드: " + kws.join(" → ") + "\n(" + kwFrom + ")\n" + t : ""; };
  /* 한 키워드로 1~5페이지에서 이 상품 찾기. 찾으면 페이지, 없으면 0, 막히면 -1 */
  const MAX = 5;
  const look = async (k, filt, label) => {
    for (let p = 1; p <= MAX; p++) {
      say(label + " '" + k + "' " + p + "/" + MAX + "페이지 확인 중…");
      try {
        const r = await fetch((mob ? "/nm/search?q=" : "/np/search?q=") + encodeURIComponent(k) + "&page=" + p + (mob ? "" : "&listSize=36") + (filt ? "&isPriceRange=true&minPrice=" + lo + "&maxPrice=" + hi : ""), { credentials: "include" });
        const body = await r.text();
        /* 검색 결과 칸만 순서대로 (광고 칸, 추천 상자는 뺌): 상품 링크 하나 = 칸 하나, 같은 목록에 3개 이상 있는 칸만 */
        const doc = new DOMParser().parseFromString(body, "text/html");
        const as = [...doc.querySelectorAll('a[href*="/products/"]')].map(a => ({ a: a, k: ((a.getAttribute("href") || "").match(/\/v[pm]\/products\/(\d+)/) || [])[1] })).filter(x => x.k);
        const nIn = el => { const st = new Set(); as.forEach(x => { if (el.contains(x.a)) st.add(x.k); }); return st.size; };
        const seenEl = new Set(), cs = [];
        as.forEach(x => { let el = x.a; while (el.parentElement && el.parentElement !== doc.body && nIn(el.parentElement) <= 1) el = el.parentElement; if (!seenEl.has(el)) { seenEl.add(el); cs.push({ el: el, k: x.k }); } });
        const cp = new Map(); cs.forEach(c => cp.set(c.el.parentElement, (cp.get(c.el.parentElement) || 0) + 1));
        const isAdC = el => /(^|\s)(AD|광고)(\s|$)/.test(el.textContent || "") || !!el.querySelector('[class*="ad-badge"], [class*="adBadge"], [class*="AdMark"], img[alt="AD"], img[alt="광고"]');
        const ids = cs.filter(c => cp.get(c.el.parentElement) >= 3 && !isAdC(c.el)).map(c => c.k);
        if (!r.ok || (p === 1 && ids.length === 0)) return filt ? 0 : -1;
        if (ids.indexOf(pid) !== -1) return p;
      } catch (e) { return -1; }
      await new Promise(res => setTimeout(res, 1500));
    }
    return 0;
  };
  /* 순서: 대표 키워드 → 대표 키워드 + 가격 필터 → 서브 키워드 */
  let pageLine = "", foundKw = "", filtLine = "", blocked = false;
  if (kw) {
    /* 순서: 대표 → 대표 + 가격 → 서브 → 서브 + 가격 … */
    const steps = [];
    kws.forEach((k, i) => { const lb = i ? "서브" : "대표"; steps.push([k, false, lb]); if (price) steps.push([k, true, lb + "+가격"]); });
    for (const [k, f, lab] of steps) {
      const pg = await look(k, f, lab);
      if (pg === -1) { blocked = true; if (!f) break; else continue; }
      if (pg > 0) { pageLine = pg + "페이지"; foundKw = k; if (f) filtLine = "가검" + (lo === hi ? lo : lo + "~" + hi); break; }
    }
    if (!pageLine) pageLine = blocked ? "자동 조회 실패, 직접 검색 필요" : MAX + "페이지 안에 없음 (쿠팡 화면에서 다른 필터로 직접 찾아 주세요)";
  }
  const out = [
    "상품명 : " + name,
    "판매처 : " + seller,
    "상품번호 : " + pid + (item ? " - " + mask(item) : ""),
    opt ? "옵션 : " + opt : "",
    price ? "가격 : " + price.toLocaleString("ko-KR") + "원" : "",
    optPrices.length ? "옵션별 가격 : " + optPrices.map(x => x.o + " " + x.p.toLocaleString("ko-KR") + "원").join(" / ") : "",
    /로켓\s*(배송|와우|프레시|그로스|직구)|판매자\s*로켓/.test(txt.slice(0, 8000)) ? "배송비 : 무료 (로켓배송)" : "배송비 : " + shipOf(txt, name, price),
    /로켓\s*(배송|와우|프레시|그로스|직구)|판매자\s*로켓/.test(txt.slice(0, 8000)) ? "배송 : 로켓배송" : "",
    foundKw ? "찾은 키워드 : " + foundKw : "",
    filtLine ? "필터 : " + filtLine : "",
    kw ? (mob ? "모바일 위치 : " : "PC 위치 : ") + pageLine : "",
    img ? "썸네일 : " + img : ""
  ].filter(Boolean).join("\n");
  say("");
  const ta = document.createElement("textarea");
  ta.value = out;
  ta.style.cssText = "width:100%;height:110px;margin:6px 0;font:12px/1.5 monospace;box-sizing:border-box";
  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:8px";
  const mk = (t, f) => { const b = document.createElement("button"); b.textContent = t; b.style.cssText = "flex:1;padding:7px;border:1px solid #5b2a86;border-radius:6px;background:#5b2a86;color:#fff;cursor:pointer"; b.onclick = f; return b; };
  const copy = mk("복사", () => { ta.select(); (navigator.clipboard ? navigator.clipboard.writeText(out) : Promise.reject()).then(() => { copy.textContent = "복사됨"; }, () => { document.execCommand("copy"); copy.textContent = "복사됨"; }); });
  const close = mk("닫기", () => box.remove());
  try { navigator.clipboard.writeText(out).then(() => { copy.textContent = "복사됨 (생성기에 붙여넣기)"; }, () => {}); } catch (e) {}
  close.style.background = "#fff"; close.style.color = "#5b2a86";
  const head = document.createElement("b");
  head.textContent = "생성기 '상품 정보' 칸에 붙여넣으세요";
  box.prepend(head);
  if (img) {
    const im = document.createElement("img");
    im.src = img; im.alt = "대표 썸네일";
    im.style.cssText = "display:block;width:100%;max-width:312px;height:auto;margin:8px 0 4px;border-radius:6px;border:1px solid #ddd";
    const a = document.createElement("a");
    a.href = img; a.target = "_blank"; a.rel = "noopener";
    a.textContent = "썸네일 원본 새 탭에서 열기 (우클릭 → 이미지 저장)";
    a.style.cssText = "font-size:12px;color:#5b2a86";
    box.appendChild(im); box.appendChild(a);
  }
  box.appendChild(ta);
  row.appendChild(copy); row.appendChild(close);
  box.appendChild(row);
  /* 썸네일 저장: PC는 바로 다운로드 폴더에(크롬 설정에서 다운로드 위치를 바탕화면으로 바꾸면 바탕화면), 휴대폰은 [앨범에 저장] → '이미지 저장' */
  if (img) {
    const phone = /iPhone|iPad|Android/i.test(navigator.userAgent);
    const fbase = fnIn ? fnIn.replace("{판매처}", String(typeof seller !== "undefined" ? seller : "").replace(/\s+/g, "")).replace(/[\\/:*?"<>|~%&{}$!'@+`=^]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40) : "thumb_" + pid;   /* 폼 제목 (없으면 상품번호) */
    let blob = null;
    const sv = mk(phone ? "썸네일 앨범에 저장" : "썸네일 저장", async () => {
      if (blob && phone && navigator.canShare) {
        const f = new File([blob], fbase + (/png/.test(blob.type) ? ".png" : ".jpg"), { type: blob.type || "image/jpeg" });
        if (navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f] }); return; } catch (e) {} }
      }
      if (blob) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = fbase + (/png/.test(blob.type) ? ".png" : ".jpg"); document.body.appendChild(a); a.click(); a.remove(); sv.textContent = "저장됨 (다운로드 폴더)"; return; }
      window.open(img, "_blank");
    });
    sv.style.marginTop = "8px"; sv.style.width = "100%";
    box.appendChild(sv);
    fetch(img).then(r => r.ok ? r.blob() : null).then(b => { blob = b; if (b && !phone) sv.onclick(); }).catch(() => { sv.textContent = "썸네일 새 탭에서 열기 (저장은 우클릭)"; });
  }
  /* PC에서 모바일 위치도: 모바일 쿠팡 상품 페이지를 열어 거기서 북마크를 한 번 더 */
  if (!mob) {
    const ml = document.createElement("a");
    ml.href = "https://m.coupang.com/vm/products/" + pid + (item ? "?itemId=" + item : "") + "#kw=" + encodeURIComponent(kwIn) + (price ? "&pr=" + price : "");
    ml.target = "_blank"; ml.rel = "noopener"; ml.textContent = "모바일 위치도 찾기 (모바일 쿠팡 열기 → 거기서 북마크)";
    ml.style.cssText = "display:block;margin-top:8px;font-size:12px;color:#5b2a86";
    box.appendChild(ml);
  }
  if (!item) { const n = document.createElement("div"); n.style.cssText = "color:#a35a00;font-size:12px;margin-top:6px"; n.textContent = "itemId를 못 찾았어요. 옵션을 한 번 눌러 주소에 itemId가 생기면 다시 눌러 주세요."; box.appendChild(n); }
})();
