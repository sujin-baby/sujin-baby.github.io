// ==UserScript==
// @name         오리 상품정보 도우미
// @namespace    https://sujin-baby.github.io/guide/
// @version      204.0
// @description  쿠팡·네이버·토스·올리브영 화면 오른쪽 아래 단추로 상품 정보를 한 번에 가져와요 (오리방 체험단)
// @author       오리방
// @match        *://*.coupang.com/*
// @match        *://*.naver.com/*
// @match        *://toss.shopping/*
// @match        *://*.oliveyoung.co.kr/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==
/*
  오리 상품정보 도우미 (생성기 v204)
  - 생성기(guide/index.html)의 '상품 위치 찾기' 북마크 코드(bm-src)를 그대로 담고 있어요.
  - 상품 정보를 읽는 규칙을 고치면  node ori/tools/build_userscript.js  를 다시 돌려
    이 파일과 생성기 안의 스크립트(us-src)를 함께 맞춰 주세요. (안 맞으면 CI가 멈춥니다)
  - 화면 오른쪽 아래 단추:
      📋 상품정보 가져오기  상품명·판매처·상품번호·옵션·가격·위치를 한 번에 읽어 복사
      🔍 위치 찾기          위치 줄(찾은 키워드·필터·PC/모바일 위치)만
*/
(function () {
  "use strict";
  if (window.__ORI_HELPER__) return;
  window.__ORI_HELPER__ = "204.0";

  /* 상품 정보 읽기 = 생성기 북마크 코드 그대로. oriMode: "info" 전체 / "pos" 위치 줄만 */
  async function ORI_RUN(oriMode) {
  const L = location;
  /* 옆 광고·추천 영역(오른쪽 배너, '함께 본 상품' 묶음) 판별 — 검색 결과가 1~2개뿐인 화면을 보강할 때 씀 (11/20) */
  const SIDE_SEL_N = 'aside, [role="complementary"], [class*="recommend"], [class*="together"], [class*="similar"], [class*="related"], [class*="banner"], [class*="ranking"], [class*="widget"], [class*="advert"], [class*="sidebar"], [class*="side-panel"], [class*="side_panel"]';
  const inSideN = el => { try { return !!(el && el.closest && el.closest(SIDE_SEL_N)); } catch (e) { return false; } };
  /* 고른 옵션: '색상 × 수량' 같은 이름표 바로 옆 값 (콜론은 화면 꾸밈이라 글에 없을 때가 있음). 없으면 단일옵션 */
  const readOpt = () => {
    /* 1. 선택된 라디오/옵션 버튼(예: 10개) 먼저 확인 (모바일 쿠팡 수량 라디오 등, 10/31) */
    try {
      const checked = document.querySelector('input[type="radio"]:checked, [class*="radio"][class*="checked"], [aria-checked="true"], .prod-option__item--selected');
      if (checked) {
        const p = checked.closest("label, li, div, tr") || checked.parentElement;
        if (p) {
          const pt = (p.innerText || "").split("\n").map(x => x.trim()).filter(Boolean);
          const optCandidate = pt.find(x => !/\d{1,3}(?:,\d{3})+\s*원|로켓|배송|쿠폰|할인/.test(x) && x.length <= 30);
          if (optCandidate) return optCandidate;
        }
      }
    } catch (e) {}
    /* 2. 화면의 '색상: ...', '사이즈: ...' 라벨 값들 수집 */
    const OPT_LAB = /^(개당\s*)?(색상|옵션|사이즈|수량|구성|선택|용량|맛|종류|컬러|타입)(\s*[×x\/·,]\s*(색상|옵션|사이즈|수량|구성|선택|용량|맛|종류|컬러|타입))*\s*[:：]?$/;
    const vals = [];
    for (const lab of [...document.querySelectorAll("span,div,dt,th,td,strong,b,label,p,em")].filter(e => e.children.length <= 2 && OPT_LAB.test((e.innerText || "").trim()))) {
      let v = lab.nextElementSibling ? lab.nextElementSibling.innerText || "" : "";
      if (!v.trim() && lab.parentElement) v = (lab.parentElement.innerText || "").replace(lab.innerText, "");
      v = v.replace(/^\s*[:：]\s*/, "").replace(/\s+/g, " ").trim();
      if (v && v.length <= 60 && !/선택하세요|선택해\s*주세요|^\d+$/.test(v)) {
        if (!vals.includes(v)) vals.push(v);
      }
    }
    if (vals.length > 0) return vals.join(" / ");
    return "";
  };
  /* 전체 색상/옵션 목록 (11/17 v194): 고른 값 하나만 읽으면 다른 색이 있는지 몰라 '단일옵션'으로 나감.
     상품 옵션 칸 안의 색상 칩·목록·드롭다운에서 2~12개가 잡히면 '블랙 / 아이보리 / 핑크'로. 가격·배송·광고 글자는 뺌 */
  const ALL_BAD_EL = /추천|함께|비슷|관련|리뷰|광고|배너|랭킹|위젯|recommend|together|similar|related|review|banner|ranking|widget/i;
  const ALL_BAD_TXT = /^(선택\s*하세요|선택해\s*주세요|옵션\s*선택|색상\s*선택|사이즈|수량|전체|모든\s*옵션|필터|정렬|구매하기|장바구니|바로\s*구매|더\s*보기|접기|펼치기)$/;
  const ALL_BAD_WORD = /원|할인|쿠폰|적립|무료\s*배송|로켓|배송|특가|사은품|증정|이벤트|리뷰|평점|재고|품절\s*제외/;
  const readAllColors = () => {
    const out = [];
    const add = t => {
      const v = String(t || "").replace(/\s+/g, " ").replace(/^[\s:：·•\-–—]+|[\s:：·•\-–—]+$/g, "").trim();
      if (!v || v.length > 20 || !/[가-힣a-z]/i.test(v) || /^\d+$/.test(v)) return;
      if (ALL_BAD_TXT.test(v) || ALL_BAD_WORD.test(v) || /[×*]/.test(v)) return;
      const n = v.replace(/\s+/g, "");
      if (out.some(x => x.replace(/\s+/g, "") === n)) return;
      out.push(v);
    };
    const okRoot = el => { try { return !ALL_BAD_EL.test(String((el && el.className) || "")) && !(el && el.closest && el.closest('[class*="recommend"],[class*="together"],[class*="similar"],[class*="related"],[class*="review"],[class*="banner"],[class*="ranking"],[class*="widget"]')); } catch (e) { return false; } };
    let roots = [];
    try { roots = [...document.querySelectorAll('.prod-option, [class*="prod-option"], [class*="ProductOption"], [class*="option-picker"], [class*="optionPicker"], [class*="color-option"], [class*="colorOption"], [class*="color-chip"], [class*="colorChip"], [class*="swatch"], [class*="variant"]')].filter(okRoot); } catch (e) { roots = []; }
    if (!roots.length) { try { const s = document.querySelector('select[name*="옵션"], select[id*="option"], select[id*="Option"]'); if (s && okRoot(s)) roots = [s]; } catch (e) {} }
    const SEL = '[role="option"], li, button, label, [class*="chip"], [class*="swatch"], [class*="color"], [class*="option-item"], [class*="OptionItem"]';
    roots.forEach(rt => {
      try { rt.querySelectorAll("select option").forEach(o => add(o.textContent)); } catch (e) {}
      let els = []; try { els = [...rt.querySelectorAll(SEL)]; } catch (e) {}
      els.forEach(el => {
        try { if (el.querySelector(SEL)) return; } catch (e) {}
        const lbl = el.getAttribute ? el.getAttribute("aria-label") || el.getAttribute("title") || "" : "";
        add(lbl || el.textContent);
      });
      /* 색상 칩이 이미지로만 된 경우 alt 글자 */
      try { rt.querySelectorAll("img[alt]").forEach(im => add(im.getAttribute("alt"))); } catch (e) {}
    });
    /* 부모 칸 글자('블랙 아이보리 핑크'처럼 여러 색이 한 칸에 붙은 것)는 뺌 */
    const fin = out.filter(v => !/\s/.test(v) || !out.some(w => w !== v && v.indexOf(w) >= 0));
    if (fin.length < 2 || fin.length > 12) return "";
    return fin.join(" / ");
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
  /* 키워드 추천 (생성기와 같은 규칙): 네추럴라이즈 플래티넘 오메가3 1100 … → 네추럴라이즈 플래티넘 오메가3 | 플래티넘 오메가3 | 오메가3 */
  const sugKw = nm => {
    const raw = String(nm || "").replace(/\(.*$/, "").replace(/\[[^\]]*\]/g, " "), dash = raw.split(/\s+-\s+/);
    let toks = dash[0].split(/[\s,]+/).filter(Boolean);
    const NOUN_SUFFIX = /(정|환|캡슐|스틱|분말|가루|원액|즙|차|오일|세럼|크림|로션|샴푸|패치|패드|거치대|매트|선풍기|텀블러|청소기|마사지기|괄사|문어괄사|괄사마사지기|워시|토너|앰플|마스크|비누|티슈|세제|치약|칫솔|홀더|걸이|선반|트레이|보틀|쿠션|방석|베개|슬리퍼|양말|장갑|모자|밴드|스토퍼|도어스토퍼|말굽|도어체크|도어락|고정기|가드|보냉백|보온백|런치백|도시락가방|가방|파우치|보냉가방|쿨러백|쇼퍼백|에코백|토트백|크로스백|백팩|손잡이백|보냉팩|보온팩|오메가3|루테인|유산균|콜라겐|비타민|밀크씨슬|프로폴리스|마그네슘|칼슘|아연|철분|나주배|햇배|(?:^배$)|사과|부유단감|단감|대봉감|(?:^감$)|감귤|(?:^귤$)|황금향|레드향|한라봉|천혜향|샤인머스캣|포도|머루포도|거봉|복숭아|자두|살구|딸기|참외|수박|멜론|메론|토마토|방울토마토|키위|참다래|무화과|감홍사과|부사|아오리|홍옥|사과대추|대추|옥광밤|군밤|햇밤|(?:^밤$)|호두|(?:^잣$)|땅콩|과일|고구마|호박고구마|꿀고구마|감자|수미감자|옥수수|초당옥수수|양파|자색양파|마늘|의성마늘|생강|고추|청양고추|당근|열무|총각무|(?:^무$)|배추|절임배추|김치|갓김치|파김치|열무김치|쌀|백미|현미|잡곡|찹쌀|보리|귀리|서리태|(?:^콩$)|(?:^팥$)|견과|말랭이|고구마말랭이|곶감|반건시|건나물|나물|시금치|상추|깻잎|버섯|표고버섯|송이버섯|느타리버섯|팽이버섯|새송이버섯)$/;
    /* 첫 단어가 이미 대표 품목 명사(텀블러, 밴드, 보냉백, 나주배 등)이면 브랜드로 잘라내지 않음 (11/01) */
    const brand = toks.length >= 3 && !NOUN_SUFFIX.test(toks[0]) ? toks[0] : ""; if (brand) toks = toks.slice(1);
    const STOP = /^(탈부착식|탈부착|착붙는|세라믹|코팅|프리미엄|고급|대용량|소용량|회전|포함|정품|국내산|수입산|신상|신상품|인기|추천|최신|업그레이드|스마트|터치|겨울|여름|봄|가을|방한|보온보냉|보온|보냉|세척솔|대시보드|특가|증정|무료배송|1\+1|세트|단품|미니|슬림|휴대용|접이식|산지직송|직송|농장직송|당일수확|당일발송|새벽배송|고당도|꿀당도|당도선별|당도보장|brix|브릭스|꿀brix|명품|특품|가정용|선물용|제수용|파격특가|초특가|한정특가|선착순|마감임박|한정|수선|보호|잘라서쓰는|만능|두피|승모근|바디|지압|전신|붓기제거|뷰티|홈케어|원스텝|닫힘방지|데일리|초박형)$/i;
    const spec = t => /^\d|\d+(mg|g|kg|ml|l|개|박스|과|입|수|캡슐|정|매|p|도|cm|mm|인치|w)\b|x\d|한정/i.test(t) && !/^[가-힣a-z]+\d+$/i.test(t);
    const isMod = t => /(는|한|된|용|방지|차단|전용|호환|타입|형)$/.test(t) && t.length <= 6;
    let cand = toks.filter(t => !spec(t) && !STOP.test(t) && !isMod(t) && (t.length >= 2 || NOUN_SUFFIX.test(t)));
    /* 화면 카테고리(빵가루/카테고리 바)에서 카테고리 명사 보강 (예: 물병/물통/텀블러) */
    try {
      const breadcrumb = document.querySelector('[class*="breadcrumb"], [class*="category"], .prod-buy-header__breadcrumb');
      if (breadcrumb) {
        const bTxt = breadcrumb.innerText || breadcrumb.textContent || "";
        const bToks = bTxt.split(/[\s>/,]+/).filter(Boolean);
        const bNoun = bToks.reverse().find(t => NOUN_SUFFIX.test(t));
        if (bNoun && !cand.includes(bNoun)) cand.push(bNoun);
      }
    } catch (e) {}
    const mods = toks.filter(t => /용$/.test(t) && t.length <= 4);
    /* 품목 명사 매칭: 햇- 접두 수식 명사(햇배, 햇사과 등)보다 고유/지역 품종명(나주배, 옥광밤 등)을 우선, 그 외는 상품명 등장 순서 유지 (11/01 v142) */
    const nounMatches = cand.filter(t => NOUN_SUFFIX.test(t));
    nounMatches.sort((a, b) => {
      const aHaet = /^햇/.test(a) ? 1 : 0;
      const bHaet = /^햇/.test(b) ? 1 : 0;
      if (aHaet !== bHaet) return aHaet - bHaet;
      return toks.indexOf(a) - toks.indexOf(b);
    });
    const nounMatch = nounMatches[0];
    const tail = t => t.slice(-3);
    const rep = cand.filter(t => t.length >= 3 && cand.some(u => u !== t && u.length >= 3 && tail(u) === tail(t)));
    const cat = dash[1] ? dash[1].split(/[\/,]/)[0].trim() : "";
    const main = nounMatch || rep[0] || (cat && cat.length >= 2 && !spec(cat) && !/일반|기타/.test(cat) ? cat : "") || cand[cand.length - 1] || cand[0] || toks[toks.length - 1] || toks[0] || "";

    const mainIdx = cand.indexOf(main);
    const pre = mainIdx > 0 ? cand.slice(0, mainIdx) : [];

    const out = [];
    const add = x => { x = (x || "").trim(); if (x && out.indexOf(x) === -1) out.push(x); };

    /* 1순위: 브랜드 + 핵심수식어(최대 2단어) + 품목명 (예: 코코스무 신발 뒤꿈치 패드) */
    if (brand && pre.length >= 2) add(brand + " " + pre.slice(0, 2).join(" ") + " " + main);
    else if (brand && pre.length === 1) add(brand + " " + pre[0] + " " + main);

    /* 2순위: 핵심수식어(최대 2단어) + 품목명 (예: 신발 뒤꿈치 패드) */
    if (pre.length >= 2) {
      add(pre.slice(0, 2).join(" ") + " " + main);
      add(pre[pre.length - 1] + " " + main);
      add(pre[0] + " " + main);
    } else if (pre.length === 1) {
      add(pre[0] + " " + main);
    }

    /* 3순위: 브랜드 + 개별수식어 + 품목명 또는 브랜드 + 품목명 */
    if (brand && pre.length >= 2) {
      add(brand + " " + pre[pre.length - 1] + " " + main);
      add(brand + " " + pre[0] + " " + main);
    } else if (brand) {
      add(brand + " " + main);
    }

    /* 4순위: 단독 품목명 (수식어가 전혀 없거나 최후의 대체용, 단독 패드 등은 최후순위) */
    add(main);
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
  /* 키워드가 마음에 안 들면 직접 정해서 다시 찾기 (사용자 요청 11/20, 확장 1.8.8의 결과 상자와 같은 자리).
     모바일 북마크·Userscripts에는 background가 없어서, 그 키워드로 화면(주소)을 넘겨 다시 찾음.
     찾는 상품은 주소 뒤(#pid=…)·localStorage에 남아 있어서 새 화면에서도 같은 상품을 찾음 */
  const kwRow = (bx, val, ph, onGo, note, col) => {
    col = col || "#03c75a";
    const lb = document.createElement("div");
    lb.style.cssText = "margin-top:10px;font-size:12px;color:#555";
    lb.textContent = "키워드가 마음에 안 들면 직접 정해서 다시 찾기";
    bx.appendChild(lb);
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:6px;margin-top:6px";
    const inp = document.createElement("input");
    inp.type = "text"; inp.value = val || ""; inp.placeholder = ph || "검색어 직접 입력";
    inp.style.cssText = "flex:1;min-width:0;padding:8px;border:1px solid #bbb;border-radius:6px;font:13px sans-serif;box-sizing:border-box";
    const go = document.createElement("button");
    go.textContent = "이 키워드로 찾기";
    go.style.cssText = "padding:8px 10px;border:0;border-radius:6px;background:" + col + ";color:#fff;font:bold 13px sans-serif;white-space:nowrap";
    const back = () => { go.disabled = false; go.textContent = "이 키워드로 찾기"; };
    const run = () => {
      const v = String(inp.value || "").replace(/\s+/g, " ").trim();
      if (!v) { inp.placeholder = "검색어를 넣어 주세요"; inp.style.borderColor = "#e03131"; try { inp.focus(); } catch (e) {} return; }
      go.disabled = true; go.textContent = "찾는 중…";
      let r = null;
      try { r = onGo(v); } catch (e) { back(); return; }
      /* 화면을 넘기는 경우(주소 이동)에는 새 화면이 뜰 때까지 그대로, 이 화면에서 다시 찾는 경우에는 끝나면 되돌림 */
      if (r && typeof r.then === "function") r.then(back, back);
    };
    go.onclick = run;
    inp.addEventListener("keydown", e => { if (e && e.key === "Enter") { e.preventDefault(); run(); } });
    row.appendChild(inp); row.appendChild(go); bx.appendChild(row);
    if (note) { const nt = document.createElement("div"); nt.style.cssText = "color:#555;font-size:12px;margin-top:6px"; nt.textContent = note; bx.appendChild(nt); }
    return bx;
  };
  /* 그 키워드로 다시 찾을 주소 — 네이버·쿠팡 검색 화면은 지금 주소의 검색어만 바꾸고 1페이지로, 상품 페이지는 그 키워드의 검색 화면 */
  const kwUrl = kw => {
    const u = new URL(L.href);
    if (/shopping\.naver\.com$/.test(L.hostname) && /\/search\//.test(L.pathname)) {
      u.searchParams.set("query", kw); u.searchParams.delete("pagingIndex");
      if (/[#&]kw=/.test(u.hash)) u.hash = u.hash.replace(/([#&])kw=[^&]*/, "$1kw=" + encodeURIComponent(kw));
      return u.href;
    }
    if (/coupang\.com$/.test(L.hostname) && /\/n[pm]\/search/.test(L.pathname)) {
      u.searchParams.set("q", kw); u.searchParams.delete("page");
      return u.href;
    }
    const mo = /^m\./.test(L.hostname) || /iPhone|iPad|Android/i.test(navigator.userAgent);
    if (/naver\.com$/.test(L.hostname)) return (mo ? "https://msearch.shopping.naver.com" : "https://search.shopping.naver.com") + "/search/all?query=" + encodeURIComponent(kw);
    return (mo ? "https://m.coupang.com/nm/search?q=" : "https://www.coupang.com/np/search?q=") + encodeURIComponent(kw);
  };
  /* ---------- 네이버: 스마트스토어 상품 페이지 = 상품 정보, 네이버 쇼핑 검색 화면 = 찾은 페이지 ---------- */
  if (/naver\.com$/.test(L.hostname)) {
    const pm = L.pathname.match(/products\/(\d+)/);
    if (pm) {
      /* 상품 페이지: 상품명, 판매처(스토어 이름), 상품번호, 썸네일 */
      const og = n => { const m = document.querySelector('meta[property="og:' + n + '"]'); return m ? (m.content || "") : ""; };
      const parts = document.title.split(/\s+:\s+/);
      /* 상품명·판매처: 모바일 스마트스토어는 og:title·title이 짧은 이름만 담기도 해서 화면 제목·구조화 데이터(JSON-LD)까지 봄 (11/18 #77)
         - 상품명: og:title·title의 이름 → JSON-LD name → 화면 상품 제목 중 '첫 낱말이 같은' 가장 긴 것 ('에큐어 젊음크림 100ml' → '에큐어 젊음크림 노화억제크림 주름개선 탭력')
         - 판매처: title 마지막 칸(스토어 이름) → 없으면 JSON-LD brand → 화면 브랜드 ('네이버 스마트스토어'만 읽어 빈칸이 되던 것) */
      const ld = (() => { try { const out = []; document.querySelectorAll('script[type="application/ld+json"]').forEach(s => { try { const j = JSON.parse(s.textContent || "null"); (Array.isArray(j) ? j : [j]).forEach(o => { if (o && o["@graph"]) o["@graph"].forEach(x => out.push(x)); else out.push(o); }); } catch (e) {} }); return out.filter(o => o && /product/i.test(String(o["@type"] || "")))[0] || null; } catch (e) { return null; } })();
      const ldName = String((ld && ld.name) || "").replace(/\s+/g, " ").trim();
      const ldBrand = String((ld && ld.brand && (ld.brand.name || ld.brand)) || "").replace(/\s+/g, " ").trim();
      /* 판매처(스토어 이름)를 먼저 읽음 — 상품명 끝에 붙는 '| 스토어이름 · 복사'를 떼는 데 씀 (#96, 11/20) */
      let seller = (parts.length > 1 ? parts[parts.length - 1] : og("site_name")).replace(/\s*[-|]?\s*네이버.*$/, "").trim();
      if (!seller) seller = ldBrand;
      if (!seller) { try { seller = [...document.querySelectorAll('[class*="brand"], [class*="brandName"]')].map(e => (e.innerText || "").replace(/\s+/g, " ").trim()).filter(t => t.length >= 2 && t.length <= 30).sort((a, b) => a.length - b.length)[0] || ""; } catch (e) {} }
      /* 스마트스토어 상품명 칸은 '상품명 | 스토어이름 복사'처럼 스토어 이름과 복사 단추 글자까지 담아 옴 → 떼어 냄 (#96, 11/20).
         쿠팡 상품명에도 '|'가 들어갈 수 있어 판매처 이름과 같은 꼬리만 떼고, 규격 숫자·수량은 건드리지 않음 */
      const tidyNm = t => {
        let s = String(t || "").replace(/\s+/g, " ").trim();
        for (let k = 0; k < 3; k++) {
          const before = s;
          s = s.replace(/\s*(?:\||·|ㆍ|-|–)\s*(?:복사|copy)\s*$/i, "").replace(/\s*(?:복사|copy)$/i, "").trim();
          if (seller && seller.length >= 2) s = s.replace(new RegExp("\\s*(?:\\||｜|·|ㆍ|-|–)\\s*" + seller.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*(?:복사|copy)?\\s*$", "i"), "").trim();
          if (s === before) break;
        }
        return s;
      };
      const tName = tidyNm((og("title") || parts[0] || "").split(/\s+:\s+/)[0].trim());
      const domName = (() => { try { return [...document.querySelectorAll('h1, h2, h3, [class*="product-title"], [class*="prd_name"], [class*="productName"], [class*="prod_name"]')].map(e => tidyNm(e.innerText || "")).filter(t => t.length >= 6 && t.length <= 200 && !/^(?:상품|카테고리|리뷰|구매|배송|판매|네이버|NAVER|전체)/.test(t)).sort((a, b) => b.length - a.length)[0] || ""; } catch (e) { return ""; } })();
      const name = [tName, tidyNm(ldName), domName].filter(Boolean).reduce((a, b) => (b.length > a.length && (!tName || b.slice(0, 2) === tName.slice(0, 2)) ? b : a), tName || "");
      let img = og("image"); if (img.indexOf("//") === 0) img = "https:" + img;
      const kwh = hv("kw") || sugKw(name).join("|");
      const html0 = document.documentElement.innerHTML;
      let prh = Number(hv("pr") || 0);
      if (!prh) { const dm = html0.match(/"discountedSalePrice"\s*:\s*(\d{3,})/) || html0.match(/"salePrice"\s*:\s*(\d{3,})/); if (dm) prh = Number(dm[1]); }
      if (!prh) { const t0 = document.body.innerText, i0 = t0.indexOf(name.slice(0, 10)); const ps = ((i0 >= 0 ? t0.slice(i0, i0 + 1500) : t0).match(/\d{1,3}(?:,\d{3})+\s*원/g) || []).slice(0, 2).map(x => Number(x.replace(/[^0-9]/g, ""))); if (ps.length) prh = Math.min.apply(null, ps); }
      const mob0 = /^m\./.test(L.hostname) || /iPhone|iPad|Android/i.test(navigator.userAgent);
      const kw0 = (kwh.split("|")[0] || "").trim() || name;
      /* 직접 정한 키워드로 열 때도 같은 모양 — 상품번호·상품명·판매처·가격을 주소 뒤(#)에 남겨 그 화면에서 이 상품을 찾게 (11/20) */
      const sUrlOf = (k, kl) => (mob0 ? "https://msearch.shopping.naver.com" : "https://search.shopping.naver.com") + "/search/all?query=" + encodeURIComponent(k) +
        "#pid=" + pm[1] + "&nm=" + encodeURIComponent(name) + "&st=" + encodeURIComponent(seller) + "&kw=" + encodeURIComponent(kl || k) + (prh ? "&pr=" + prh : "");
      const sUrl = sUrlOf(kw0, kwh);
      const bx = show(["상품명 : " + name, "판매처 : " + seller, "상품번호 : " + pm[1], "옵션 : " + (readOpt() || "단일옵션"), prh ? "가격 : " + prh.toLocaleString("ko-KR") + "원" : "", "배송비 : " + shipOf(document.body.innerText, name, prh), img ? "썸네일 : " + img : ""].filter(Boolean).join("\n"),
        "위치는 아래 [위치 찾기] → 열린 네이버 쇼핑 화면에서 이 북마크를 한 번 더. 키워드: " + kwh.split("|").join(" → ") + (prh ? " (각각 가격 " + prh.toLocaleString("ko-KR") + "원 필터도)" : ""));
      const go = document.createElement("a"); go.href = sUrl; go.target = "_blank"; go.rel = "noopener"; go.textContent = "위치 찾기 (네이버 쇼핑 열기)";
      go.style.cssText = "display:block;margin-top:8px;padding:9px;border-radius:6px;background:#03c75a;color:#fff;text-align:center;font-weight:700;text-decoration:none";
      bx.appendChild(go);
      /* 키워드가 마음에 안 들면 직접 정해서 다시 찾기 (11/20, 확장 1.8.8과 같은 자리) — 그 키워드로 검색 화면을 열고 거기서 한 번 더 */
      kwRow(bx, kw0, "다른 검색어로 찾기", v => { L.href = sUrlOf(v, v); },
        "그 키워드로 네이버 쇼핑 검색 화면을 열어요. 열리면 이 북마크(🔍 위치 찾기)를 한 번 더 눌러 주세요.");
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
      /* 같은 부모에 3개 이상인 칸 = 검색 결과 목록. 다만 검색 결과가 1~2개뿐인 화면('전체 1'·'전체 2')은
         진짜 상품 칸의 부모에도 1~2개뿐이라 그 목록에서 빠져 '이 화면에는 없어요'로 나갔음(11/20 제보).
         → 3개 목록에 못 든 칸은 광고·옆 추천/배너 영역을 뺀 것만 extra로 */
      const cardGroups = () => {
        const ks = [...document.querySelectorAll("a[href]")].map(a => ({ a: a, t: (a.innerText || "").trim() })).filter(x => x.t.length >= 8 && !NOT_T.test(x.t) && /[가-힣a-z]/i.test(x.t) && PROD_RE.test(x.a.href)).map(x => ({ a: x.a, k: norm(x.t).slice(0, 40) }));
        const n = el => { const st = new Set(); ks.forEach(x => { if (el.contains(x.a)) st.add(x.k); }); return st.size; };
        const seen = new Set(), out = [];
        /* 한 목록에 상품이 하나뿐이면 위로 끝까지 올라가 화면 전체가 '칸'이 되므로, 가격(원)이 적힌 가까운 위 칸을 그 상품 칸으로 (11/20 '전체 1') */
        const PRC = /\d{1,3}(?:,\d{3})+\s*원/;
        ks.forEach(x => {
          let el = x.a;
          while (el.parentElement && el.parentElement !== document.body && n(el.parentElement) <= 1) el = el.parentElement;
          if (el.parentElement === document.body) { let p = x.a; while (p.parentElement && p.parentElement !== document.body && !PRC.test(p.textContent || "")) p = p.parentElement; if (PRC.test(p.textContent || "")) el = p; }
          if (!seen.has(el) && !el.contains(document.getElementById("__pl_bm"))) { seen.add(el); out.push(el); }
        });
        const cp = new Map(); out.forEach(el => cp.set(el.parentElement, (cp.get(el.parentElement) || 0) + 1));
        return { list: out.filter(el => cp.get(el.parentElement) >= 3), extra: out.filter(el => cp.get(el.parentElement) < 3 && !isAd(el) && !inSideN(el)) };
      };
      const cards = () => cardGroups().list;
      const AD_SEL_N = '[class*="ad-badge"], [class*="adBadge"], [class*="ad_label"], [class*="AdMark"], [data-is-ad="true"], [data-ad="true"], [data-ad-id], img[alt*="광고"], img[alt*="AD"]';
      const isAd = el => {
        if (!el) return false;
        try {
          if (el.matches && el.matches(AD_SEL_N)) return true;
          if (el.querySelector(AD_SEL_N)) return true;
        } catch(e) {}
        const badges = el.querySelectorAll('span, em, strong, b, div, p, i');
        for (let i = 0; i < badges.length; i++) {
          const t = (badges[i].textContent || "").trim().replace(/[ⓘi\s]/g, "");
          if (t === "광고" || t === "AD" || t === "ad" || t === "Ad") return true;
        }
        const txt = (el.innerText || el.textContent || "").trim();
        if (/(?:^|[\s·|\[\(<>\/.,\-_])(?:광고|AD|Ad)(?:$|[\s·|ⓘi\]\)>,\/.\-_])/.test(txt)) {
          if (!/(?:광고용|광고판|광고지|광고대|adidas|adapt)/i.test(txt)) return true;
        }
        return false;
      };
      const pidRe = T.pid && T.pid.length >= 8 ? new RegExp("(^|\\D)" + T.pid + "(?!\\d)") : null;
      /* 상품명 낱말 대부분 + 스토어 이름이 같아도 같은 상품 (앞부분이 조금 달라도) */
      const nToks = String(T.nm || "").split(/[\s\/,·|]+/).map(norm).filter(x => x.length >= 2);
      const nScore = t => nToks.length < 3 ? 0 : nToks.filter(x => t.indexOf(x) !== -1).length / nToks.length;
      const find = () => {
        const g = cardGroups(), cs = g.list;
        const pick = arr => { let best = -1, how = "", ad = false; arr.forEach((el, i) => { const t = norm(el.innerText), stOk = stK.length >= 2 && t.indexOf(stK) !== -1, sc = nScore(t); const h = pidRe && pidRe.test(el.innerHTML) ? "상품번호" : (nmK.length >= 6 && t.indexOf(nmK) !== -1 ? (stOk ? "상품명+스토어" : "상품명") : (sc >= 0.8 && stOk ? "상품명+스토어" : (sc >= 0.95 ? "상품명" : ""))); if (!h) return; if (isAd(el)) { ad = true; return; } if (best < 0 || (how === "상품명" && h !== "상품명")) { best = i; how = h; } }); return { i: best, how: how, ad: ad, el: best >= 0 ? arr[best] : null }; };
        let r = pick(cs);
        /* 3개 이상 목록에서 못 찾으면 1~2개뿐인 목록(전체 1·전체 2 화면)도 한 번 더 봄 */
        if (r.i < 0 && g.extra.length) { const r2 = pick(g.extra); if (r2.i >= 0) r = r2; }
        return { i: r.i, how: r.how, ad: r.ad, n: cs.length + g.extra.length, el: r.el };
      };
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
        /* 3개 이상 목록에서 먼저, 없으면 1~2개뿐인 목록도 (광고·옆 추천/배너 영역은 빼고) */
        const walkN = (minN, loose) => {
          for (const lf of leaves) {
            let a = lf, done = false;
            while (a.parentElement && a.parentElement !== document.body && !done) {
              const sib = [...a.parentElement.children].filter(c => PR.test(c.textContent || ""));
              if (sib.length >= minN && sib.indexOf(a) >= 0) {
                done = true;
                if (isAd(a) || (loose && (sib.length > 2 || inSideN(a)))) continue;
                f = { i: 0, how: "화면 글자", ad: false, n: f.n, el: a, org: sib.slice(0, sib.indexOf(a)).filter(c => !isAd(c)).length + 1 };
              }
              a = a.parentElement;
            }
            if (f.i >= 0) break;
          }
        };
        walkN(3, false);
        if (f.i < 0) walkN(1, true);
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
        const fb = show([q ? "찾은 키워드 : " + q.trim() : "", gg ? "필터 : " + gg : "", sim ? "주의 : 비슷한 상품 많음" : "", (mobN ? "모바일 위치 : " : "PC 위치 : ") + pos].filter(Boolean).join("\n"), "찾았어요 (분홍 테두리). 복사해서 생성기 '상품 정보 붙여넣기' 칸에." + (f.how === "상품명" ? " 상품명으로 찾음(스토어 이름은 화면에 없었음)." : ""));
        kwRow(fb, q.trim(), "다른 검색어로 찾기", v => { L.href = kwUrl(v); }, "그 키워드로 다시 검색한 화면을 열어요. 화면이 열리면 이 북마크(🔍 위치 찾기)를 한 번 더 눌러 주세요.");
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
        kwRow(nb, q.trim(), "다른 검색어로 찾기", v => { L.href = kwUrl(v); }, "그 키워드로 다시 검색한 화면을 열어요. 화면이 열리면 이 북마크(🔍 위치 찾기)를 한 번 더 눌러 주세요.");
      }
      return;
    }
    alert("네이버는 스마트스토어 상품 페이지나 네이버 쇼핑 검색 화면에서 눌러 주세요.");
    return;
  }
  /* ---------- 토스쇼핑: 상품 정보만 (상품명, 판매자, 상품번호, 가격, 썸네일). 검색 순위는 토스 앱 안이라 못 찾음 ---------- */
  if (/(^|\.)toss\.(shopping|im)$/.test(L.hostname)) {
    const og = n => { const m = document.querySelector('meta[property="og:' + n + '"]'); return m ? (m.content || "") : ""; };
    const readTossSeller = () => {
      for (const el of document.querySelectorAll("h1,h2,h3,h4,dt,span,div,p")) {
        const lt = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (lt !== "판매자") continue;
        const nx = el.nextElementSibling ? (el.nextElementSibling.innerText || el.nextElementSibling.textContent || "").trim() : "";
        if (nx && nx.length <= 30 && !/^(에게|는|가|를|의|와|과|\s)/.test(nx) && !/통신판매|책임|지지/.test(nx)) return nx.split("\n")[0].trim();
      }
      const m = (document.body.innerText || "").match(/(?:^|\n)\s*판매자\s*[:：\n]\s*([^\n>]{1,30})/);
      const s = m ? m[1].trim() : "";
      return s && !/^(에게|는|가|를|의)/.test(s) && !/통신판매|책임/.test(s) ? s : "";
    };
    const sleepT = ms => new Promise(r => setTimeout(r, ms));
    let seller = readTossSeller();
    for (let i = 0; i < 12 && !seller; i++) { await sleepT(500); seller = readTossSeller(); }
    const txt = document.body.innerText;
    const id = (L.pathname.match(/\/(?:i|c|p|products?)\/(\d{5,})/) || [])[1] || (L.href.match(/(\d{8,})/) || [])[1] || "";
    let name = (og("title") || document.title).replace(/\s*[|\-]\s*토스.*$/, "").trim();
    if (!name || /토스쇼핑/.test(name)) { const i0 = txt.search(/배송\s*일정|판매자/); name = i0 > 0 ? txt.slice(0, i0).split("\n").map(x => x.trim()).filter(x => x && !/토스쇼핑|QR|가격을/.test(x)).pop() || "" : ""; }
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
    const AD_SEL_OY = '[class*="ad-badge"], [class*="adBadge"], [class*="ad_label"], [class*="AdMark"], img[alt*="AD"], img[alt*="광고"]';
    const isAd = el => {
      if (!el) return false;
      try {
        if (el.matches && el.matches(AD_SEL_OY)) return true;
        if (el.querySelector(AD_SEL_OY)) return true;
      } catch(e) {}
      const badges = el.querySelectorAll('span, em, strong, b, div, p, i');
      for (let i = 0; i < badges.length; i++) {
        const t = (badges[i].textContent || "").trim().replace(/[ⓘi\s]/g, "");
        if (t === "광고" || t === "AD" || t === "ad" || t === "Ad") return true;
      }
      const txt = (el.innerText || el.textContent || "").trim();
      if (/(?:^|[\s·|\[\(<>\/.,\-_])(?:광고|AD|Ad)(?:$|[\s·|ⓘi\]\)>,\/.\-_])/.test(txt)) {
        if (!/(?:광고용|광고판|광고지|광고대|adidas|adapt)/i.test(txt)) return true;
      }
      return false;
    };
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
  const mob = /^m\./.test(L.hostname) || /iPhone|iPad|Android/i.test(navigator.userAgent);
  const AD_SEL_CP = '[class*="ad-badge"], [class*="adBadge"], [class*="ad-mark"], [class*="ad_mark"], [class*="AdMark"], ' +
    '[class*="search-product__ad"], [class*="search-product-ad"], [class*="product-ad"], ' +
    '[class*="badge-ad"], [class*="badge_ad"], [class*="ad_label"], [class*="adLabel"], ' +
    '[data-is-ad="true"], [data-ad="true"], [data-ad-id], [data-s-ad], ' +
    'img[alt*="광고"], img[alt*="AD"], img[src*="ad_badge"], img[src*="ad-badge"], ' +
    'a[href*="isSearchAd=true"], a[href*="click.coupang.com"]';
  const isAdCp = el => {
    if (!el) return false;
    try {
      if (el.matches && el.matches(AD_SEL_CP)) return true;
      if (el.querySelector(AD_SEL_CP)) return true;
    } catch(e) {}
    const badges = el.querySelectorAll('span, em, strong, b, div, p, i');
    for (let i = 0; i < badges.length; i++) {
      const t = (badges[i].textContent || "").trim().replace(/[ⓘi\s]/g, "");
      if (t === "광고" || t === "AD" || t === "ad" || t === "Ad") return true;
    }
    const txt = (el.innerText || el.textContent || "").trim();
    if (/(?:^|[\s·|\[\(<>\/.,\-_])(?:광고|AD|Ad)(?:$|[\s·|ⓘi\]\)>,\/.\-_])/.test(txt)) {
      if (!/(?:광고용|광고판|광고지|광고대|adidas|adapt)/i.test(txt)) return true;
    }
    return false;
  };
  if (/\/n[pm]\/search/.test(L.pathname)) {
    /* 쿠팡 검색 화면: 상단 및 중간중간 섞여 있는 광고(AD) 전수 식별 및 제외하여 순위 탐색 */
    let T = null;
    try { T = JSON.parse(localStorage.getItem("__pl_cp") || "null"); } catch (e) {}
    if (!T || !T.pid) {
      let cb = ""; try { cb = (await navigator.clipboard.readText()) || ""; } catch (e) {}
      const m = cb.match(/상품번호\s*[:：]\s*(\d{8,})/);
      if (m) T = { pid: m[1], nm: "", kw: "" };
    }
    if (!T || !T.pid) {
      /* 유저스크립트에서 [🔍 위치 찾기]만 눌렀을 때는 입력 팝업을 띄우지 않음 (v195) */
      if (oriMode === "pos" || oriMode === "info") { show("", "쿠팡 상품 페이지에서 [📋 상품정보 가져오기]를 먼저 한 번 눌러 주세요. 그러면 이 검색 화면에서 위치를 찾아 드려요."); return; }
      const a = (prompt("찾을 쿠팡 상품번호(상품 상세 주소의 products/ 뒤 숫자)", "") || "").match(/\d{8,}/);
      if (!a) return;
      T = { pid: a[0], nm: "", kw: "" };
    }
    const qp = new URLSearchParams(L.search);
    const q = qp.get("q") || "";
    const pg = Number(qp.get("page") || 1);
    const as = [...document.querySelectorAll('a[href*="/products/"]')].map(a => ({ a: a, k: ((a.getAttribute("href") || "").match(/\/v[pm]\/products\/(\d+)/) || [])[1] })).filter(x => x.k);
    const nIn = el => { const st = new Set(); as.forEach(x => { if (el.contains(x.a)) st.add(x.k); }); return st.size; };
    const seenEl = new Set(), cs = [];
    as.forEach(x => { let el = x.a; while (el.parentElement && el.parentElement !== document.body && nIn(el.parentElement) <= 1) el = el.parentElement; if (!seenEl.has(el)) { seenEl.add(el); cs.push({ el: el, k: x.k }); } });
    const cp = new Map(); cs.forEach(c => cp.set(c.el.parentElement, (cp.get(c.el.parentElement) || 0) + 1));
    const list = cs.filter(c => cp.get(c.el.parentElement) >= 3);
    /* 검색 결과가 1~2개뿐인 화면(가격 필터 등)은 진짜 상품 칸의 부모에도 1~2개뿐이라 위 목록에서 빠짐(11/20) */
    const extra = cs.filter(c => cp.get(c.el.parentElement) < 3 && !isAdCp(c.el) && !inSideN(c.el));
    let hit = -1, adHit = -1, base = list;
    const pickCp = arr => arr.forEach((c, i) => {
      if (c.k !== T.pid) return;
      if (isAdCp(c.el)) { if (adHit < 0) adHit = i; return; }
      if (hit < 0) hit = i;
    });
    pickCp(list);
    if (hit < 0 && extra.length) { base = extra; pickCp(extra); }
    if (hit < 0) base = list;
    const bx = show("", "쿠팡 검색 결과에서 찾는 중…");
    bx.id = "__pl_bm";
    if (hit >= 0) {
      const el = base[hit].el;
      el.style.outline = "4px solid #e5397a"; el.style.outlineOffset = "2px"; el.scrollIntoView({ block: "center" });
      const org = base.slice(0, hit).filter(c => !isAdCp(c.el)).length + 1;
      const pos = pg + "p";
      const fb = show([q ? "찾은 키워드 : " + q.trim() : "", (mob ? "모바일 위치 : " : "PC 위치 : ") + pos].filter(Boolean).join("\n"), "찾았어요 (분홍 테두리, 광고 빼고 " + org + "번째). 복사해서 생성기 '상품 정보 붙여넣기' 칸에.");
      kwRow(fb, q.trim(), "다른 검색어로 찾기", v => { L.href = kwUrl(v); }, "그 키워드로 쿠팡에서 다시 검색한 화면을 열어요. 화면이 열리면 이 북마크(🔍 위치 찾기)를 한 번 더 눌러 주세요.");
    } else {
      const nb = show("이 화면에는 없어요", "검색어 '" + q + "', " + pg + "페이지, 상품 " + (list.length + extra.length) + "개 확인" + (adHit >= 0 ? " (광고 자리에만 있어요)" : "") + ".\n다음 페이지로 이동 후 북마크를 다시 눌러 주세요.");
      kwRow(nb, q, "다른 검색어로 찾기", v => { L.href = kwUrl(v); }, "그 키워드로 쿠팡에서 다시 검색한 화면을 열어요. 화면이 열리면 이 북마크(🔍 위치 찾기)를 한 번 더 눌러 주세요.");
    }
    return;
  }
  const pm = L.pathname.match(/\/v[pm]\/products\/(\d+)/);
  if (!pm) { alert("쿠팡 상품 상세 페이지(또는 검색 결과 화면)에서 눌러 주세요."); return; }
  if (/사용권한이\s*없|접속이\s*제한|Access\s*Denied|요청하신\s*페이지/i.test((document.title || "") + " " + (document.body ? document.body.innerText.slice(0, 3000) : ""))) {
    alert("쿠팡 접속 차단('사용권한이 없습니다') 화면이에요.\n공지에 차단 문구가 들어가지 않도록 중단합니다.\n사파리 주소창에서 직접 [붙여넣기 및 이동]해 정상 상품 페이지를 열어주세요.");
    return;
  }
  const pid = pm[1];
  const html = document.documentElement.innerHTML;
  const qs = new URLSearchParams(L.search);
  let item = qs.get("itemId") || qs.get("itemid") || "";
  if (!item) {
    const vid = qs.get("vendorItemId") || qs.get("vendoritemid") || "";
    if (vid) {
      const m1 = html.match(new RegExp('["\']?itemId["\']?\\s*[:=]\\s*["\']?(\\d{8,})["\']?[^{}]{0,300}?["\']?vendorItemId["\']?\\s*[:=]\\s*["\']?' + vid + '["\']?'));
      if (m1) item = m1[1];
      if (!item) {
        const m2 = html.match(new RegExp('["\']?vendorItemId["\']?\\s*[:=]\\s*["\']?' + vid + '["\']?[^{}]{0,300}?["\']?itemId["\']?\\s*[:=]\\s*["\']?(\\d{8,})["\']?'));
        if (m2) item = m2[1];
      }
    }
  }
  if (!item) { const cm = String(document.body.innerText || "").match(/(?:쿠팡\s*)?상품\s*번호\s*[:：]?\s*(\d+)\s*-\s*(\d{6,})/); if (cm && cm[1] === pm[1]) item = cm[2]; }   /* 화면의 '쿠팡상품번호: 상품 - 아이템'이 먼저 (페이지 안 첫 itemId는 추천·광고 상품일 수 있음, 10/28) */
  if (!item) {
    for (const el of document.querySelectorAll('[class*="product-id"], [class*="productId"], .prod-buy-header__product-id')) {
      const t = el.textContent || "";
      const cm = t.match(/(\d+)\s*-\s*(\d{6,})/);
      if (cm && cm[1] === pm[1]) { item = cm[2]; break; }
    }
  }
  if (!item) { const m = html.match(/["']?itemId["']?\s*[:=]\s*["']?(\d{8,})/); if (m) item = m[1]; }
  const mask = s => s && s.length > 8 ? s.slice(0, 4) + "***" + s.slice(-4) : s;
  /* 상품명: 화면에 보이는 제목. og:title은 ' - 일반거치대' 같은 분류가 붙어서 마지막에 */
  const og = document.querySelector('meta[property="og:title"]');
  const jv = k => { const m = document.documentElement.innerHTML.match(new RegExp('"' + k + '"\\s*:\\s*"([^"]{2,120})"')); return m ? m[1] : ""; };
  let name = [...document.querySelectorAll("h1, h2, h3, .prod-buy-header__title, [class*='prod-buy-header__title'], [class*='product-title']")].map(e => (e.innerText || "").replace(/\s+/g, " ").trim()).find(t => t.length >= 2 && t.length <= 200 && !/쿠팡|coupang|장바구니|카테고리|사용권한|없습니다|Access\s*Denied|접속이\s*제한|요청하신\s*페이지/i.test(t)) || "";
  if (!name) name = jv("itemName") || jv("productName");
  if (!name) name = ((og && og.content) || document.title).replace(/\s*[-|]\s*쿠팡!?\s*$/, "").replace(/\s+-\s+[^-]{1,20}$/, "").trim();
  if (/사용권한이\s*없|접속이\s*제한|Access\s*Denied|요청하신\s*페이지/i.test(name)) {
    alert("쿠팡 접속 차단('사용권한이 없습니다') 화면이에요.\n공지에 차단 문구가 들어가지 않도록 중단합니다.");
    return;
  }
  /* 판매처: 첫 후보가 '가입' 같은 엉터리면 버리고 다음 후보로 (seller_test가 이 줄부터 잘라 시험함, 지우지 마세요) */
  const BAD_SELLER = /가입|보러가기|평가|정보|^특가|로켓|할인|쿠폰|무료|배송|와우|입점|다를\s*수|있습니다|없습니다|합니다|바랍니다|드립니다|확인|주의|안내|참고|동일|상이|기준|경우|제외|배지|인증/;
  /* '보기(2)'·'상품평 보기(12)'·'더보기' 같은 쿠팡 버튼 글자는 판매처가 아님 (11/19 #88: 판매처에 '보기(2)') */
  function isUiSeller(s) { return /^(?:[가-힣]{1,8}\s+)?보기\s*\(\s*\d+\s*\)$|^(?:보기|더\s*보기|전체\s*보기|접기|펼치기)$|^(?:상품평|리뷰|후기|판매자|판매처|옵션|색상|사이즈|수량|배송|문의|상세\s*정보)\s*\(\s*\d+\s*\)$/.test(String(s || "").replace(/\s+/g, " ").trim()); }
  const okSeller = s => !!s && s.length <= 30 && !/^(?:[는은이가의를와과]\s|[,\s])/.test(s) && !BAD_SELLER.test(s) && !isUiSeller(s);
  const readCoupangSeller = () => {
    for (const e of document.querySelectorAll('.prod-brand-name, [class*="brand-name"], [class*="brandName"], a[class*="brand"]')) {
      const t = (e.textContent || "").replace(/\s+/g, " ").trim();
      if (okSeller(t)) return t;
    }
    const tnow = document.body.innerText || "";
    const re = /판매자\s*[:：]?\s*\n?\s*([^\n]{1,60})/g;
    let sm;
    while ((sm = re.exec(tnow))) {
      const t = sm[1].replace(/\s*(판매자\s*)?(상품\s*)?보러\s*가기.*$/, "").replace(/\s*판매자\s*평가.*$/, "").trim();
      if (okSeller(t)) return t;
    }
    const vn = (String(document.documentElement.innerHTML).match(/\\?"(?:vendorName|sellerName)\\?"\s*:\s*\\?"([^"\\]{2,60})/) || [])[1] || "";
    if (okSeller(vn)) return vn;
    const s2 = tnow.match(/상호\s*\/\s*대표자\s*[:：]?\s*\n?\s*([^\n\/]{1,40})/);
    if (s2 && okSeller(s2[1].trim())) return s2[1].trim();
    return "";
  };
  let seller = readCoupangSeller();
  for (let i = 0; i < 8 && !seller; i++) { await new Promise(r => setTimeout(r, 500)); seller = readCoupangSeller(); }
  const txt = document.body.innerText;
  if (seller) {
    seller = seller.replace(/[>]\s*(?:브랜드\s*샵|브랜드샵|공식\s*몰|공식몰|공식\s*스토어|공식스토어|스토어|샵).*$/i, "").replace(/\s*(?:브랜드\s*샵|브랜드샵|공식\s*몰|공식몰|공식\s*스토어|공식스토어)\s*$/i, "").replace(/\s+(?:스토어|샵)\s*$/i, "").trim();
  }
  const ogi = document.querySelector('meta[property="og:image"]');
  let img = ogi ? ogi.content : "";
  if (img.indexOf("//") === 0) img = "https:" + img;
  /* 고른 옵션 (예: 매트블랙 x 1개) */
  let opt = readOpt();
  if (!opt) { const oe = document.querySelector('.prod-option__selected .value, .prod-option__selected-container .value'); if (oe) opt = oe.textContent.replace(/\s+/g, " ").trim().slice(0, 60); }
  if (!opt) { const om = document.body.innerText.match(/(?:색상|옵션|구성|사이즈|수량|선택|용량)[^\n]{0,12}[:：]\s*([^\n]{1,40})/); if (om && !/선택하세요|선택해\s*주세요/.test(om[1])) opt = om[1].trim(); }
  /* 고른 값 하나만으론 어떤 색이 있는지 몰라 '단일옵션'으로 나가던 것 → 페이지의 전체 색상 목록을 옵션으로 (11/17 v194) */
  { const allC = readAllColors(); if (allC && (!opt || /^단일\s*옵션$/.test(opt) || (!/[×*]/.test(opt) && opt.length <= 20))) opt = allC; }
  if (!opt) opt = "단일옵션";
  const hk = (L.search.match(/[?&]kw=([^&]+)/) || L.hash.match(/[#&]kw=([^&]+)/) || [])[1];
  const hp = Number((L.search.match(/[?&]pr=(\d+)/) || L.hash.match(/[#&]pr=(\d+)/) || [])[1] || 0);
  /* 썸네일 파일 이름 = 폼 제목 (생성기가 &fn= 으로 넘김, 사용자 요청 10/24). 주소에서 파라미터가 빠졌으면 복사해 둔 주소에서 */
  let fnIn = "";
  try { fnIn = decodeURIComponent((L.search.match(/[?&]fn=([^&]+)/) || L.hash.match(/[#&]fn=([^&]+)/) || [])[1] || ""); } catch (e) {}
  if (!fnIn) { try { const cb0 = ((await navigator.clipboard.readText()) || ""); fnIn = decodeURIComponent((cb0.match(/[?#&]fn=([^&\s]+)/) || [])[1] || ""); } catch (e) {} }
  /* 키워드: 생성기 [상품 페이지 열기]가 주소 뒤(?kw= 또는 #kw=)에 붙여 줌. 쿠팡이 단축링크/SPA 라우팅하며 해시를 지워도 쿼리 스트링에서 보존 */
  let kwIn = hk ? decodeURIComponent(hk) : "", kwFrom = hk ? "생성기 주소" : "";
  if (!kwIn) {
    let cb = "";
    try { cb = ((await navigator.clipboard.readText()) || "").trim(); } catch (e) {}
    const nmN = name.replace(/\s+/g, "");
    /* 생성기 [상품 페이지 열기]가 복사한 상품 주소에서 키워드 */
    const ck = (cb.match(/[?#&]kw=([^&\s]+)/) || [])[1];
    if (ck) {
      kwIn = decodeURIComponent(ck);
      kwFrom = "생성기 주소 (클립보드)";
    } else if (cb && cb.length <= 30 && !/[\n\r]|http|[:：]/.test(cb)) {
      kwIn = cb;
      kwFrom = "복사해 둔 의뢰서 키워드";
    }
  }
  /* URL이나 클립보드에 키워드가 없으면, 사용자에게 묻지 않고(prompt 제거) 상품명 자동 추천으로 탐색 (11/01 사용자 요청) */
  if (!kwIn) {
    const sug = sugKw(name);
    kwIn = sug.join("|");
    kwFrom = "상품명 자동 추천";
  }
  let kws = kwIn.split("|").map(x => x.trim()).filter(Boolean);
  let kw = kws[0] || "";
  let price = hp;
  /* 가격: 제목 바로 뒤 첫 가격 (할인·쿠폰·적립·배송 금액은 건너뜀) */
  if (!price) {
    const i0 = txt.indexOf(name.slice(0, 12)), t0 = i0 >= 0 ? txt.slice(i0, i0 + 2500) : txt.slice(0, 4000), re0 = /(\d{1,3}(?:,\d{3})+)\s*원/g;
    let m0;
    while ((m0 = re0.exec(t0))) { const bf = t0.slice(Math.max(0, m0.index - 12), m0.index), af = t0.slice(m0.index, m0.index + m0[0].length + 6); if (/할인|쿠폰|적립|캐시|배송|최대|이상/.test(bf) || /할인|이상/.test(af)) continue; price = Number(m0[1].replace(/,/g, "")); break; }
  }
  let optPrices = readOptPrices(txt, name, price);
  /* 옵션 목록 칸(li·option) 숨은 칸도 읽어 모바일 옵션 전수 확보 (10/31) */
  if (!optPrices.length) {
    try {
      const out = [];
      const isBadContainer = el => {
        try {
          return !!el.closest('[class*="recommend"], [class*="carousel"], [class*="together"], [class*="similar"], [class*="related"], [class*="review"], [class*="banner"], [class*="ranking"], [class*="widget"]');
        } catch (e) { return false; }
      };
      const optRoot = document.querySelector('.prod-option, .product-option, [class*="prod-option"], [class*="ProductOption"]');
      const candEls = optRoot ? optRoot.querySelectorAll('li, [role="option"], [class*="option-item"], [class*="OptionItem"]') : document.querySelectorAll('[class*="option-item"], [class*="OptionItem"], [role="option"]');
      candEls.forEach(el => {
        if (isBadContainer(el)) return;
        if (el.querySelector('[role="option"], [class*="option-item"], [class*="OptionItem"]')) return;
        const t = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (t.length > 80 || /할인\d+%|1개당|특가진행/.test(t) || (!/[×*xX]/.test(t) && !/원/.test(t))) return;
        const pm = t.match(/(\d{1,3}(?:,\d{3})+)\s*원/);
        if (!pm) return;
        const o = t.slice(0, pm.index).replace(/\s*[×*]\s*|\s+[xX]\s+/g, " × ").trim();
        if (!o || o.length > 35 || out.some(x => x.o === o)) return;
        out.push({ o: o, p: Number(pm[1].replace(/,/g, "")) });
      });
      if (out.length >= 2 && (!price || out.some(x => x.p === price))) optPrices = out;
    } catch (e) {}
  }
  if (optPrices.length && !optPrices.some(x => x.o === opt)) { const hit = optPrices.filter(x => x.p === price); if (hit.length === 1) opt = hit[0].o; }
  try { localStorage.setItem("__pl_cp", JSON.stringify({ pid: pid, item: item, nm: name, st: seller, opt: opt, pr: price, kw: kws.join("|") })); } catch (e) {}
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
        let sUrl = (mob ? "/np/search?q=" : "/np/search?q=") + encodeURIComponent(k) + "&page=" + p + "&listSize=36" + (filt ? "&isPriceRange=true&minPrice=" + lo + "&maxPrice=" + hi : "");
        let r = await fetch(sUrl, { credentials: "include" });
        if (!r.ok && mob) {
          r = await fetch("/nm/search?q=" + encodeURIComponent(k) + "&page=" + p + (filt ? "&isPriceRange=true&minPrice=" + lo + "&maxPrice=" + hi : ""), { credentials: "include" });
        }
        const body = await r.text();
        const doc = new DOMParser().parseFromString(body, "text/html");
        const as = [...doc.querySelectorAll('a[href*="/products/"]')].map(a => ({ a: a, k: ((a.getAttribute("href") || "").match(/\/v[pm]\/products\/(\d+)/) || [])[1] })).filter(x => x.k);
        const nIn = el => { const st = new Set(); as.forEach(x => { if (el.contains(x.a)) st.add(x.k); }); return st.size; };
        const seenEl = new Set(), cs = [];
        as.forEach(x => { let el = x.a; while (el.parentElement && el.parentElement !== doc.body && nIn(el.parentElement) <= 1) el = el.parentElement; if (!seenEl.has(el)) { seenEl.add(el); cs.push({ el: el, k: x.k }); } });
        const cp = new Map(); cs.forEach(c => cp.set(c.el.parentElement, (cp.get(c.el.parentElement) || 0) + 1));
        const isAdC = el => isAdCp(el);
        /* 중간중간 섞여 있는 광고 상품을 전수 식별하여 순위 및 목록에서 완전히 제외.
           3개 이상 목록이 하나도 없으면(전체 1·전체 2 화면) 1~2개뿐인 목록도 상품으로 (11/20) */
        const organicPick = min3 => cs.filter(c => !isAdC(c.el) && (min3 ? cp.get(c.el.parentElement) >= 3 : !inSideN(c.el)));
        let ids = organicPick(true).map(c => c.k);
        if (!ids.length) ids = organicPick(false).map(c => c.k);
        if (!r.ok || (p === 1 && ids.length === 0)) return filt ? 0 : -1;
        if (ids.indexOf(pid) !== -1) return p;
      } catch (e) { return -1; }
      await new Promise(res => setTimeout(res, 1500));
    }
    return 0;
  };
  /* 순서: 대표 키워드 → 대표 키워드 + 가격 필터 → 서브 키워드 */
  let pageLine = "", foundKw = "", filtLine = "", blocked = false;
  /* 한 벌의 키워드로 1~5페이지 훑기 — 직접 정한 키워드로 다시 찾을 때도 이 함수를 다시 부름 (11/20) */
  const searchKw = async list => {
    pageLine = ""; foundKw = ""; filtLine = ""; blocked = false;
    /* 순서: 대표 → 대표 + 가격 → 서브 → 서브 + 가격 … */
    const steps = [];
    list.forEach((k, i) => { const lb = i ? "서브" : "대표"; steps.push([k, false, lb]); if (price) steps.push([k, true, lb + "+가격"]); });
    for (const [k, f, lab] of steps) {
      const pg = await look(k, f, lab);
      if (pg === -1) { blocked = true; if (!f) break; else continue; }
      if (pg > 0) { pageLine = pg + "p"; foundKw = k; if (f) filtLine = "가검" + (lo === hi ? lo : lo + "~" + hi); break; }
    }
    const rk = (L.search.match(/[?&](?:searchRank|rank)=(\d+)/i) || [])[1] ? (Math.max(1, Math.ceil(Number(L.search.match(/[?&](?:searchRank|rank)=(\d+)/i)[1]) / 36)) + "p") : "";
    if (!pageLine) {
      pageLine = rk ? rk : (blocked ? "못 찾음 (쇼핑몰이 막음)" : MAX + "페이지 안에 없음 (쿠팡 화면에서 다른 필터로 직접 찾아 주세요)");
    }
  };
  if (kw) await searchKw(kws);
  const buildOut = () => [
    "상품명 : " + name,
    "판매처 : " + seller,
    "상품번호 : " + pid + (item ? " - " + mask(item) : ""),
    opt ? "옵션 : " + opt : "",
    price ? "가격 : " + price.toLocaleString("ko-KR") + "원" : "",
    optPrices.length ? "옵션별 가격 : " + optPrices.map(x => x.o + " " + x.p.toLocaleString("ko-KR") + "원").join(" / ") : "",
    /로켓\s*(배송|와우|프레시|그로스|직구)|판매자\s*로켓/.test((function (t, nm) { const c = t.search(/쿠팡\s*상품\s*번호|이런\s*건\s*어때요|함께\s*비교하면|다른\s*고객이\s*함께/); if (c > 0) t = t.slice(0, c); const ni = nm ? t.indexOf(String(nm).slice(0, 12)) : -1; if (ni > 0) t = t.slice(ni); return t.slice(0, 8000); })(txt, name)) ? "배송비 : 무료 (로켓배송)" : "배송비 : " + shipOf(txt, name, price),
    /로켓\s*(배송|와우|프레시|그로스|직구)|판매자\s*로켓/.test((function (t, nm) { const c = t.search(/쿠팡\s*상품\s*번호|이런\s*건\s*어때요|함께\s*비교하면|다른\s*고객이\s*함께/); if (c > 0) t = t.slice(0, c); const ni = nm ? t.indexOf(String(nm).slice(0, 12)) : -1; if (ni > 0) t = t.slice(ni); return t.slice(0, 8000); })(txt, name)) ? "배송 : 로켓배송" : "",
    foundKw ? "찾은 키워드 : " + foundKw : "",
    filtLine ? "필터 : " + filtLine : "",
    kw ? (mob ? "모바일 위치 : " : "PC 위치 : ") + pageLine : "",
    img ? "썸네일 : " + img : ""
  ].filter(Boolean).join("\n");
  let out = buildOut();
  /* 유저스크립트에서 [🔍 위치 찾기]로 열었을 때는 위치 줄만 (v195). 북마크릿은 oriMode가 없어 그대로 전체 */
  if (oriMode === "pos") out = out.split("\n").filter(l => /^(찾은 키워드|필터|PC 위치|모바일 위치) : /.test(l)).join("\n") || out;
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
  if (kwFrom === "상품명 자동 추천") {
    const wBox = document.createElement("div");
    wBox.style.cssText = "background:#fff5f5;border:1px solid #ff8787;border-radius:6px;padding:6px 8px;margin:6px 0;font-size:11.5px;color:#c92a2a;line-height:1.4";
    wBox.innerHTML = "⚠️ <b>키워드 자동 추천 검색됨</b><br>의뢰서 키워드를 읽지 못해 임의 키워드('<b>" + (foundKw || kw) + "</b>')로 위치를 찾았습니다. 의뢰서 키워드와 맞는지 확인하세요!";
    box.prepend(wBox);
  }
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
  /* 키워드가 마음에 안 들면 직접 정해서 다시 찾기 (11/20) — 이 화면에서 그 키워드로 1~5페이지를 다시 훑음 */
  kwRow(box, kw, "다른 검색어로 찾기", async v => {
    kws = [v]; kw = v; kwFrom = "직접 입력"; say("검색어 '" + v + "'로 이 화면에서 다시 찾는 중…");
    await searchKw(kws);
    out = buildOut();
    if (oriMode === "pos") out = out.split("\n").filter(l => /^(찾은 키워드|필터|PC 위치|모바일 위치) : /.test(l)).join("\n") || out;
    ta.value = out;
    say("");
  }, "이 화면에서 그 키워드로 1~5페이지를 다시 확인해요 (화면은 넘어가지 않아요).", "#5b2a86");
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
  if (!mob && !/iPhone|iPad|Android/i.test(navigator.userAgent)) {
    const ml = document.createElement("a");
    ml.href = "https://m.coupang.com/vm/products/" + pid + (item ? "?itemId=" + item : "") + "#kw=" + encodeURIComponent(kwIn) + (price ? "&pr=" + price : "");
    ml.target = "_blank"; ml.rel = "noopener"; ml.textContent = "모바일 위치도 찾기 (모바일 쿠팡 열기 → 거기서 북마크)";
    ml.style.cssText = "display:block;margin-top:8px;font-size:12px;color:#5b2a86";
    box.appendChild(ml);
  }
  if (!item) { const n = document.createElement("div"); n.style.cssText = "color:#a35a00;font-size:12px;margin-top:6px"; n.textContent = "itemId를 못 찾았어요. 옵션을 한 번 눌러 주소에 itemId가 생기면 다시 눌러 주세요."; box.appendChild(n); }
  }

  /* 화면 오른쪽 아래 단추 (작고 깔끔하게, 상품 화면을 가리지 않게) */
  function oriBar() {
    if (!document.body) { setTimeout(oriBar, 300); return; }
    if (document.getElementById("ori-helper-bar")) return;
    var bar = document.createElement("div");
    bar.id = "ori-helper-bar";
    var narrow = /iPhone|iPad|Android/i.test(navigator.userAgent) ||
      Math.min(window.innerWidth || 999, (window.screen && window.screen.width) || 999) < 600;
    bar.style.cssText = "position:fixed;right:10px;bottom:" + (narrow ? "calc(96px + env(safe-area-inset-bottom, 0px))" : "16px") +
      ";z-index:2147483646;display:flex;flex-direction:column;align-items:flex-end;gap:6px;" +
      "font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;";
    function mk(label, mode, bg) {
      var b = document.createElement("button");
      b.type = "button"; b.textContent = label;
      b.style.cssText = "border:1.5px solid #3a2230;border-radius:999px;padding:9px 13px;font-size:12.5px;font-weight:800;" +
        "line-height:1.2;color:#fff;background:" + bg + ";box-shadow:0 2px 8px rgba(0,0,0,.22);opacity:.92;white-space:nowrap;" +
        "cursor:pointer;-webkit-tap-highlight-color:transparent";
      b.addEventListener("click", function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        var was = b.textContent;
        b.disabled = true; b.textContent = "읽는 중…"; b.style.opacity = ".6";
        Promise.resolve().then(function () { return ORI_RUN(mode); }).catch(function (e) {
          alert("상품 정보를 읽지 못했어요: " + ((e && e.message) || e));
        }).then(function () { b.disabled = false; b.textContent = was; b.style.opacity = ".92"; });
      }, true);
      return b;
    }
    bar.appendChild(mk("📋 상품정보 가져오기", "info", "#5b2a86"));
    bar.appendChild(mk("🔍 위치 찾기", "pos", "#d63384"));
    var h = document.createElement("button");
    h.type = "button"; h.textContent = "×"; h.title = "이 화면에서 단추 치우기";
    h.style.cssText = "border:1px solid #ced4da;background:#fff;color:#868e96;border-radius:999px;width:22px;height:22px;" +
      "font-size:12px;line-height:1;padding:0;cursor:pointer;opacity:.75";
    h.addEventListener("click", function (ev) { ev.preventDefault(); ev.stopPropagation(); bar.remove(); }, true);
    bar.appendChild(h);
    document.body.appendChild(bar);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", oriBar); else oriBar();
})();
