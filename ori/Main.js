/** ORI-MAIN
 * 체험단 진행 자동화 (Google Apps Script)
 * 이 파일(Main.js)은 GitHub에 있고, 내 스크립트의 Code(로더)가 실행될 때마다 받아 와서 돌려요(10분 캐시).
 * 그래서 코드를 고쳐도 붙여넣기, 배포가 필요 없어요. 설정값(CONFIG)은 내 스크립트의 Settings 파일에 있어요.
 * ------------------------------------------------------------
 * 하는 일
 *  1) 새 진행 만들기: 템플릿 구글폼 복사 → 제목·설명 입력 → 응답 시트 생성·연결
 *     → 팀 메일 권한 + "링크가 있는 모든 사용자" 보기 권한 → 진행목록에 기록
 *  2) 응답 시트 서식: 입대/업체입금이면 계좌·예금주 열 그룹으로 숨김,
 *     실배송이면 리뷰비 열 숨김 + 실배송 칸 추가 + 노란색 표시
 *  3) 중복 자동 표시: 주문번호·이름 열이 겹치면 빨간색
 *  4) 명단 자동 마감: 신청이 목표 인원만큼 차면 폼을 닫고 명단방, 업체방 문구를 메일과 보낼 메시지함에 넣음
 *  (리뷰 확인은 다른 담당자가 해서 리뷰 제출, 리뷰 기한, 페이백 기능은 없음)
 *
 * 설치 (처음 한 번)
 *  1. 새 구글 스프레드시트를 하나 만들고 이름을 "체험단 관리"로 짓습니다.
 *  2. 메뉴 [확장 프로그램] → [Apps Script]를 열고, 기본 코드를 지운 뒤 이 파일 전체를 붙여넣고 저장합니다.
 *  3. Settings 파일의 설정(CONFIG)에 템플릿 폼 ID와 팀 메일을 넣습니다.
 *     - 템플릿 폼 ID: 평소 쓰던 구글폼 편집 주소 docs.google.com/forms/d/【이 부분】/edit
 *  4. 스프레드시트로 돌아가 새로고침하면 상단에 [체험단 도구] 메뉴가 생깁니다.
 *     처음 실행할 때 구글 권한 승인 창이 뜨면 허용합니다.
 *  5. [체험단 도구] → [매일 알림 켜기]를 누르면 매일 오전 9시에 진행목록 인원 수를 갱신합니다.
 */


// 응답 시트 헤더에서 찾는 이름들 (폼 질문 제목에 이 말이 들어 있으면 인식)
const MATCH = {
  order: /주문\s*번호/,
  name: /이름|성함|주문자|예금주|수령인|계정명/,   // 폼 질문 '이름'은 '계정명(수령인)'으로 바꿈 (사용자 요청 10/20)
  account: /계좌|예금주|은행/,
  dup: /아이디|계정(?!명)|이메일|전화|연락처|휴대폰|핸드폰|주소/,   // 한 명단 시트에서 겹치면 중복(빨간색). 이름은 동명이인이 많아서 뺌
  reviewFee: /리뷰비/,
  nick: /카카오\s*톡?\s*닉네임|카톡\s*닉네임/,   // '방에 참여한 카카오톡 닉네임' (옵션 확인은 이 닉네임으로)
  opt: /옵션/,
  expSet: /작성한\s*링크\s*묶음/   // 기대평 폼 '작성한 링크 묶음'(A 14개·B 13개, 10/26). 진행비 건수 셈용이라 명단 탭(업체가 보는 곳)에는 안 넣음
};
const NICK_Q = '방에 참여한 카카오톡 닉네임';

// 진행목록 열. 맨 뒤 3개(시트ID, 폼ID, 요청ID)는 스크립트가 쓰는 칸이라 숨겨 둠
//  시트ID: 응답 시트를 찾아 인원 세기, 명단 양식 적용, 폼수정 탭에서 씀
//  폼ID: 명단이 차면 폼 닫기, 폼수정 탭에서 응답 삭제할 때 씀
//  요청ID: 새 진행 만들기를 두 번 눌러도 한 번만 만들어지게 할 때 씀
const LIST_HEADER = ['등록일', '진행일', '명단 제목', '유형', '택대', '실배송', '플랫폼', '목표인원', '인원', '진행 상태', '마감 시각', '택배 옮김', '캠페인', '일차', '총건수', '업체', '구매시간', '포토', '가격', '카톡방', '업체방', '폼 링크', '시트 링크', '폴더 링크', '시트ID', '폼ID', '요청ID', '리뷰 취합', '업체 전송'];
const LIST_HIDDEN = ['시트ID', '폼ID', '요청ID'];
const LIST_ALIAS = { '마감': '마감 시각' };   // 예전 열 이름 → 새 이름

function lc_(name) { return LIST_HEADER.indexOf(name) + 1; }

// 실행 중 생긴 문제를 모아 둠 (메뉴로 돌리면 창으로, 자동 실행이면 한눈에 탭 P1에 보임)
function note_(msg) { (globalThis.__ORI_NOTES = globalThis.__ORI_NOTES || []).push(String(msg)); Logger.log(msg); }

function report_(name, ok) {
  const all = (globalThis.__ORI_NOTES || []).filter(function (x) { return !/메시지함 기록 실패: TypeError: Utilities/.test(x); });
  globalThis.__ORI_NOTES = [];
  const done = all.filter(function (x) { return /^✓/.test(x); }), notes = all.filter(function (x) { return !/^✓/.test(x); });
  const when = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'M/d HH:mm');
  const took = globalThis.__ORI_T0 ? ' (' + Math.round((Date.now() - globalThis.__ORI_T0) / 1000) + '초)' : '';
  globalThis.__ORI_T0 = 0;
  // 다른 작업(보통 15분 자동 확인)이 돌고 있어서 건너뛴 경우: 오류가 아님. 한눈에 칸은 안 건드림(돌고 있는 확인의 ⏳ 표시가 남게)
  //  메뉴로 눌렀을 때만 창으로 알림 (10/19 '다른 작업 중이라 건너뜀'이 빨간 글씨로 계속 떠서 헷갈렸음)
  if (ok === false && !notes.length) {
    try { SpreadsheetApp.getUi().alert('지금 15분 자동 확인이 돌고 있어서 이번엔 건너뛰었어요 (오류 아님).\n\n한눈에 탭 Q1의 ⏳가 ✔로 바뀌면 끝난 거예요. 그 확인이 같은 일을 하니 다시 누르지 않아도 돼요.'); } catch (e) {}
    globalThis.__ORI_STEPS = [];
    return;
  }
  const head = ok === false ? '⚠ ' + when + ' ' + name + ': 다른 작업 중이라 건너뜀' : (notes.length ? '⚠ ' + when + ' ' + name + ' 문제 ' + notes.length + '건' + took + ' ↓' : '✔ ' + when + ' ' + name + ' 정상' + took);
  const lines = notes.map(function (x) { return '⚠ ' + x; }).concat(done.map(function (x) { return '· ' + x.replace(/^✓\s*/, ''); }));
  // 단계별 걸린 시간 (오래 걸린 것만, 느린 원인 찾기용)
  const st = globalThis.__ORI_STEPS || [];
  globalThis.__ORI_STEPS = [];
  if (st.length) {
    st[st.length - 1].s = Math.round((Date.now() - st[st.length - 1].t) / 1000);
    const slow = st.filter(function (x) { return x.s >= 10; });
    if (slow.length) lines.push('· 걸린 시간: ' + slow.map(function (x) { return x.w + ' ' + x.s + '초'; }).join(', '));
  }
  const text = head + (lines.length ? '\n' + lines.join('\n') : '');
  // 원격 점검(?p=diag)용: 최근 확인 결과 15개 (6시간 보관)
  try { const c = CacheService.getScriptCache(); let log = []; try { log = JSON.parse(c.get('REPORT_LOG') || '[]'); } catch (e) {} log.unshift(text.slice(0, 1500)); c.put('REPORT_LOG', JSON.stringify(log.slice(0, 15)), 21600); } catch (e) {}
  // 한눈에 Q1은 한 줄 요약, 자세한 건 Q2부터 한 줄씩 (위 표 옆이라 잘 보이게)
  try {
    const d = adminSs_().getSheetByName(DASH_TAB);
    if (d) {
      d.getRange(1, 17).setValue(head).setFontColor(notes.length || ok === false ? '#b91c1c' : '#2f7a2f').setFontWeight('bold').setWrap(false);
      // 왼쪽(위 표 바로 아래 줄)에도 같은 한 줄 + 자세한 건 메모(마우스 올리면 보임)
      const bar = Number(PropertiesService.getScriptProperties().getProperty('DASH_BAR_ROW')) || 0;
      PropertiesService.getScriptProperties().setProperty('LAST_REPORT', head);
      if (bar) d.getRange(bar, 8).setValue(head).clearNote().setFontColor(notes.length || ok === false ? '#b91c1c' : '#2f7a2f').setFontWeight('bold').setWrap(false).setHorizontalAlignment('left');
      d.getRange(2, 17, 12, 1).clearContent();
      if (lines.length) d.getRange(2, 17, Math.min(lines.length, 12), 1).setValues(lines.slice(0, 12).map(function (x) { return [x.slice(0, 120)]; }))
        .setFontColor('#555555').setFontWeight('normal').setWrap(false).setHorizontalAlignment('left');
    }
  } catch (e) {}
  try { SpreadsheetApp.getUi().alert(text); } catch (e) {}   // 메뉴로 돌렸을 때만 창이 뜸
}

// 한 번에 한 작업만 진행목록을 고치게 (진행목록을 최신순으로 정렬해서 줄 번호가 바뀌기 때문). 이미 잡고 있으면 그대로 실행
function locked_(fn, ms) {
  if (globalThis.__ORI_LOCK) return fn();
  const l = LockService.getScriptLock();
  if (!l.tryLock(ms || 60000)) return;
  globalThis.__ORI_LOCK = true;
  try { return fn(); } finally { globalThis.__ORI_LOCK = false; l.releaseLock(); }
}

// 진행목록 최신순 (진행일, 등록일 늦은 게 위)
function sortList_() {
  const sh = ensureListSheet_(), last = sh.getLastRow();
  if (last < 3) return;
  sh.getRange(2, 1, last - 1, LIST_HEADER.length).sort([{ column: lc_('진행일'), ascending: false }, { column: lc_('등록일'), ascending: false }]);
}

function readRuns_() {
  const list = ensureListSheet_();
  const last = list.getLastRow();
  if (last < 2) return [];
  return list.getRange(2, 1, last - 1, LIST_HEADER.length).getValues().map(function (v, i) {
    const o = { row: i + 2 };
    LIST_HEADER.forEach(function (h, k) { o[h] = v[k]; });
    return o;
  });
}

function setRun_(row, name, value) { ensureListSheet_().getRange(row, lc_(name)).setValue(value); }

// 캠페인 이름: 명단 제목에서 닉네임, #택, 날짜, 끝 건수를 뺀 것 (#택10.14 모두의농수산옥광밤외12 → 모두의농수산옥광밤외)
function campOf_(title) {
  return String(title || '').replace(/\s*\([^)]*\)\s*$/, '').replace(/^[#업택\s]*\d{1,2}\.\d{1,2}\s*/, '').replace(/\s*\d+\s*$/, '').trim();
}

// 같은 캠페인인지 비교할 때 쓰는 키 (#택, 날짜, 끝 건수, 띄어쓰기 뺌)
// 실배송 표시 '실'은 위치가 바뀌어도(10/19: 끝 → 날짜 오른쪽) 같은 캠페인으로 보게 뺌
//  '실/빈'(실배송·일반배송이 섞인 의뢰, 10/26 치약걸이 보냉백)도 같은 표시로 봄
function campKey_(s) { return campOf_(s).replace(/(^|\s)실(\/빈)?(?=\s|$)/g, ' ').replace(/\s+/g, '').replace(/^실|실$/g, ''); }

// 같은 캠페인 진행들을 날짜순으로 묶어서 '한 의뢰'씩 나눔: 총건수를 다 채우면 다음 진행은 새 의뢰
function chainsOf_(runs) {
  const by = {};
  runs.filter(function (r) { return r['진행일'] instanceof Date; }).forEach(function (r) {
    const k = campKey_(r['캠페인'] || r['명단 제목']);
    (by[k] = by[k] || []).push(r);
  });
  const chains = [];
  Object.keys(by).forEach(function (k) {
    const list = by[k].sort(function (a, b) { return (a['진행일'] - b['진행일']) || (a.row - b.row); });
    // 의뢰서 하나 = 명단 시트 하나. 같은 업체·상품이어도 새로 받은 의뢰서(생성기에서 1일차로 새로 만든 진행)는 따로 묶음
    let cur = null;
    const bySheet = {};
    list.forEach(function (r) {
      const total = Number(r['총건수']) || 0, sid = String(r['시트ID'] || '');
      let c = sid ? bySheet[sid] : null;
      if (!c) {
        const fresh = Number(r['일차'] || 1) <= 1 && !/^(next|add)-/.test(String(r['요청ID'])) && String(r['요청ID'] || '') !== '';
        c = (!cur || fresh || (cur.total && cur.done >= cur.total)) ? null : cur;
        if (!c) { c = { key: k, total: total, done: 0, runs: [] }; chains.push(c); }
      }
      if (sid) bySheet[sid] = c;
      cur = c;
      if (!c.total && total) c.total = total;
      c.runs.push(r);
      // 끝낸(종료) 진행은 실제 받은 인원으로 셈: 취소해서 끝낸 진행(0명)이 '다 진행함'으로 세져 다음 일차가 건너뛰어지던 것 (10/24 기대평 10/27~ 전부 건너뜀)
      c.done += r['진행 상태'] === '종료' ? (Number(r['인원']) || 0) : (Number(r['목표인원']) || 0);
    });
  });
  return chains;
}

// 같은 진행인지 (방제 끝 숫자만 다를 때): 날짜(10.15)와 캠페인 이름이 같으면 같은 진행
function dateTok_(t) { const m = String(t || '').match(/(\d{1,2})\.(\d{1,2})/); return m ? Number(m[1]) + '.' + Number(m[2]) : ''; }
function sameRunTitle_(a, b) { return !!dateTok_(a) && dateTok_(a) === dateTok_(b) && campKey_(a) === campKey_(b); }
function bareTitle_(t) { return String(t || '').replace(/\s*\([^)]*\)\s*$/, '').trim(); }

// 진행 날짜 옮기기: 방제·명단 제목 날짜(#10.22 → #10.23), 진행 상태, 보낼메시지(안 보낸 것) 방·날짜·글 속 방제, 월급시트 줄 이름·진행일
//  같은 명단 시트의 뒤 진행·일정 탭 대기 계획은 날짜가 겹치거나 앞서면 다음 진행일로 차례로 미룸 (예: 목요일 건너뛰기 → 목→금, 금→월)
function moveRunDate_(r, d) {
  d = new Date(d); d.setHours(0, 0, 0, 0);
  const oldBare = bareTitle_(r['명단 제목']), md = function (x) { return (x.getMonth() + 1) + '.' + x.getDate(); };
  if (dateTok_(oldBare) === md(d)) { setRun_(r.row, '진행 상태', statusFor_(d)); return oldBare + ': 날짜가 같아요.'; }
  const one = function (run, day) {
    const ob0 = bareTitle_(run['명단 제목']), nb = retitleDate_(ob0, day);
    setRun_(run.row, '진행일', day); run['진행일'] = day;
    if (run['진행 상태'] !== '종료') setRun_(run.row, '진행 상태', statusFor_(day));
    renameRun_(run, nb);
    // 안 보낸 메시지: 글 속 옛 방제도 새 방제로, 보낼 날짜 다시
    try {
      const ob = outboxSheet_(), ol = ob.getLastRow();
      if (ol >= 2) ob.getRange(2, 1, ol - 1, 6).getValues().forEach(function (v, i) {
        if (v[5] === '보냄' || String(v[3]) !== nb) return;
        const m2 = String(v[4]).split(ob0).join(nb);
        if (m2 !== String(v[4])) obSet_(ob, v[0], 5, m2);
        if (v[2] !== '포토 가이드') obSet_(ob, v[0], 2, sendDate_(v[3], m2, v[2]));   // 포토 가이드는 '포토전달대기' 그대로
      });
    } catch (e) {}
    // 월급시트 줄 이름·진행일
    try {
      payTabsNow_().forEach(function (sh) {
        const L = payLayout_(sh); if (!L) return;
        const n = Math.max(sh.getLastRow() - L.head, 1), names = sh.getRange(L.head + 1, L.name, n, 1).getValues();
        names.forEach(function (x, i) {
          if (String(x[0]).replace(/\s+/g, '') !== ob0.replace(/\s+/g, '')) return;
          sh.getRange(L.head + 1 + i, L.name).setValue(nb);
          if (L.date) sh.getRange(L.head + 1 + i, L.date).setValue(day).setNumberFormat('M/d');
        });
      });
    } catch (e) {}
    return ob0 + ' → ' + nb;
  };
  // 원래 날짜 = 방제의 날짜 (진행일 칸은 이미 새 날짜로 고쳐져 있음)
  const om = (dateTok_(oldBare) || '').split('.'), oldDay = om.length === 2 ? new Date(d.getFullYear(), Number(om[0]) - 1, Number(om[1])) : d;
  // 뒤 진행 (같은 명단 시트, 원래 이 진행보다 뒤): 겹치거나 앞서면 다음 진행일로
  let prev = d;
  const moves = [[r, d]];
  const later = readRuns_().filter(function (x) { return x.row !== r.row && x['시트ID'] && String(x['시트ID']) === String(r['시트ID']) && x['진행일'] instanceof Date && x['진행 상태'] !== '종료' && dayStart_(x['진행일']) > dayStart_(oldDay); })
    .sort(function (a, b) { return a['진행일'] - b['진행일']; });
  later.forEach(function (x) {
    if (dayStart_(x['진행일']) > dayStart_(prev)) { prev = x['진행일']; return; }
    const nd = nextWorkday_(prev);
    moves.push([x, nd]); prev = nd;
  });
  // 늦은 날짜 진행부터 바꿈 (10/24 #10.26 공지들이 사라진 원인): 앞 진행을 먼저 #10.26으로 바꾸면 아직 안 바뀐 뒤 진행도 #10.26이라
  //  뒤 진행을 #10.27로 바꿀 때 보낼메시지에서 '#10.26' 방 공지를 둘 다 데려가서 #10.26 공지가 없어지고, 똑같은 공지 두 개는 하나가 지워졌음
  const done = moves.slice().reverse().map(function (m) {
    const ob1 = bareTitle_(m[0]['명단 제목']), res = one(m[0], m[1]);
    renameTodo_(m[0], ob1, retitleDate_(ob1, m[1]));
    return res;
  }).reverse();
  // 일정 탭 대기 계획 (아직 안 만든 다음 일차)
  try {
    const ps = planSheet_(), pl = ps.getLastRow(), ck = campKey_(r['캠페인'] || r['명단 제목']);
    if (pl >= 2) {
      const rows = ps.getRange(2, 1, pl - 1, PLAN_HEAD.length).getValues().map(function (x, i) { return { x: x, i: i }; })
        .filter(function (o) { return o.x[8] === '대기' && campKey_(o.x[1]) === ck && o.x[3] instanceof Date && dayStart_(o.x[3]) > dayStart_(oldDay); }).sort(function (a, b) { return a.x[3] - b.x[3]; });
      rows.forEach(function (o) {
        if (dayStart_(o.x[3]) > dayStart_(prev)) { prev = o.x[3]; return; }
        const nd = nextWorkday_(prev);
        ps.getRange(o.i + 2, 4, 1, 3).setValues([[nd, retitleDate_(o.x[4], nd), retitleDate_(o.x[5], nd)]]);
        done.push('(일정) ' + bareTitle_(o.x[5]) + ' → ' + bareTitle_(retitleDate_(o.x[5], nd))); prev = nd;
      });
    }
  } catch (e) {}
  return '✓ 진행일 바꿈: ' + done.join(', ');
}

// 하루 인원 바꾸기 (10/23): from 날짜부터 이 의뢰의 진행(아직 안 끝난 것)·일정(대기)을 하루 n명씩. 총건수에서 앞 날짜 인원을 뺀 만큼만,
//  남는 일차는 진행 '종료'·일정 '취소', 모자라면 마지막 일정 줄을 복사해 다음 진행일로 추가. 방제 끝 숫자·폼 설명·안 보낸 방 공지 '(N명)'도 같이
function changeDaily_(anchor, from, n) {
  const runs = readRuns_(), ck = campKey_(anchor['캠페인'] || anchor['명단 제목']), fd = dayStart_(from);
  const chain = chainsOf_(runs).filter(function (c) { return c.runs.some(function (x) { return x.row === anchor.row; }); })[0];
  if (!chain || !chain.total) return '총건수를 몰라서 못 바꿨어요 (진행목록 총건수 칸 확인)';
  const before = chain.runs.filter(function (x) { return x['진행일'] instanceof Date && dayStart_(x['진행일']) < fd; })
    .reduce(function (a, x) { return a + (dayStart_(x['진행일']) < today_().getTime() ? (Number(x['인원']) || 0) : (Number(x['목표인원']) || 0)); }, 0);
  let left = chain.total - before;
  const items = chain.runs.filter(function (x) { return x['진행일'] instanceof Date && dayStart_(x['진행일']) >= fd && x['진행 상태'] !== '종료'; })
    .map(function (x) { return { run: x, d: x['진행일'] }; });
  const ps = planSheet_(), pl = ps.getLastRow();
  const prow = pl >= 2 ? ps.getRange(2, 1, pl - 1, PLAN_HEAD.length).getValues() : [];
  prow.forEach(function (x, i) { if (x[8] === '대기' && campKey_(x[1]) === ck && x[3] instanceof Date && dayStart_(x[3]) >= fd) items.push({ plan: i, x: x, d: x[3] }); });
  items.sort(function (a, b) { return a.d - b.d; });
  const cnt = function (t, c) { return String(t).replace(/\d+(\s*(\([^)]*\))?\s*)$/, c + '$1'); };
  const one = function (t, c) { const m = String(t).match(/\(\s*\d+\s*명\)/g); return m && m.length === 1 ? String(t).replace(/\(\s*\d+\s*명\)/, '(' + c + '명)') : String(t); };
  const done = [];
  items.forEach(function (it) {
    const c = Math.max(0, Math.min(n, left)); left -= c;
    if (it.run) {
      const r = it.run, old = bareTitle_(r['명단 제목']);
      if (c > 0) {
        if (Number(r['목표인원']) === c && /\d+\s*$/.test(old) && Number(old.match(/(\d+)\s*$/)[1]) === titleCount_(r, c)) return;
        const room = String(r['카톡방'] || old);
        renameRun_(r, cnt(old, titleCount_(r, c))); setRun_(r.row, '목표인원', c);
        try { if (r['폼ID']) { const f = FormApp.openById(r['폼ID']); f.setDescription(one(f.getDescription(), c)); } } catch (e) {}
        try { const ob = outboxSheet_(), ol = ob.getLastRow(); if (ol >= 2) ob.getRange(2, 1, ol - 1, 6).getValues().forEach(function (v) { if ((String(v[3]) === room || String(v[3]) === cnt(old, c)) && v[2] === '방 공지' && v[5] !== '보냄') obSet_(ob, v[0], 5, one(v[4], c)); }); } catch (e) {}
        done.push(old + ' → ' + cnt(old, c));
      } else {
        setRun_(r.row, '진행 상태', '종료');
        // 폼은 절대 안 닫음 (사용자 요청 10/21 '폼 닫지 마'. 10/24 실링팬: 남는 날을 끝내면서 같은 폼을 쓰는 받는 날 폼까지 닫혔음)
        // 안 보낸 메시지는 지움 (예전엔 보냄 칸에 '취소'를 썼는데 체크칸이라 안 들어가서 '대기'로 남았음, 10/26 실링팬 10.30·11.02~11.04)
        try { delPendingFor_(String(r['카톡방'] || old)); } catch (e) {}
        done.push(old + ' 취소(종료)');
      }
    } else {
      const x = it.x, row = it.plan + 2;
      if (c > 0) {
        let cc = []; try { cc = JSON.parse(x[7]); } catch (e) {}
        cc = (cc || []).map(function (g) { g = (g || []).slice(); g[0] = c; if (g[1] && g[1].length === 1) g[1] = [c]; return g; });
        let tc = titleCount_(anchor, c);
        if (isExpect_(anchor)) { const pc = expPlanCount_(dateTok_(x[5]), c); if (pc !== null) tc = pc; else { try { tc = c * Math.round(Number(JSON.parse(x[9]).prices) / 1000); } catch (e) {} } }
        ps.getRange(row, 5, 1, 4).setValues([[cnt(x[4], tc), cnt(x[5], tc), c, JSON.stringify(cc)]]);
        done.push('(일정) ' + bareTitle_(x[5]) + ' → ' + bareTitle_(cnt(x[5], tc)));
      } else { ps.getRange(row, 9).setValue('취소 (하루 인원 바꿈)'); done.push('(일정) ' + bareTitle_(x[5]) + ' 취소'); }
    }
  });
  // 모자라면 마지막 일정 줄을 복사해서 다음 진행일로
  const lastPlan = items.filter(function (it) { return it.x; }).pop();
  let prevD = items.length ? items[items.length - 1].d : from, k0 = lastPlan ? Number(lastPlan.x[2]) : 0, add = 0;
  while (left > 0 && lastPlan && add < 30) {
    const c = Math.min(n, left); left -= c; add++;
    const nd = nextWorkday_(prevD); prevD = nd; k0++;
    let cc = []; try { cc = JSON.parse(lastPlan.x[7]); } catch (e) {}
    cc = (cc || []).map(function (g) { g = (g || []).slice(); g[0] = c; if (g[1] && g[1].length === 1) g[1] = [c]; return g; });
    let tc2 = titleCount_(anchor, c);
    if (isExpect_(anchor)) { const pc2 = expPlanCount_(dateTok_(lastPlan.x[5]), c); if (pc2 !== null) tc2 = pc2; else { try { tc2 = c * Math.round(Number(JSON.parse(lastPlan.x[9]).prices) / 1000); } catch (e) {} } }
    ps.appendRow([String(lastPlan.x[0]).replace(/-\d+$/, '') + '-' + k0, lastPlan.x[1], k0, nd, cnt(retitleDate_(lastPlan.x[4], nd), tc2), cnt(retitleDate_(lastPlan.x[5], nd), tc2), c, JSON.stringify(cc), '대기', lastPlan.x[9]]);
    done.push('(일정 추가) ' + bareTitle_(cnt(retitleDate_(lastPlan.x[5], nd), tc2)));
  }
  return '✓ 하루 ' + n + '명으로: ' + (done.join(', ') || '바뀐 것 없음') + (left > 0 ? ' / ⚠ ' + left + '건이 남아요 (일정 탭에 줄이 없어서 못 늘림)' : '');
}

// 스크립트가 방제를 바꿨을 때(인원 줄임, 날짜 옮김) 보낼메시지 '할 일': 카톡방 이름 바꾸기 + (명단을 이미 보냈으면) 오리명단방 명단 메시지 고치기. 그날 할 일
function renameTodo_(r, oldBare, newBare, fresh) {
  if (!oldBare || oldBare === newBare) return;
  const lines = ['[방제 바뀜] ' + oldBare + ' → ' + newBare, '1. 카톡방 이름을 ' + newBare + ' 로 바꾸기'];
  // 진행일이 지났거나 오늘이면 명단을 이미 보냈을 수 있어서 고칠 글도 같이 (명단 전달을 방금 새로 넣었으면 고칠 글이 없음)
  if (fresh) lines.push('2. 오리명단방 명단 글(모자란 건수 포함)은 보낼메시지에 넣어 뒀어요');
  else if (r['시트 링크'] && r['진행일'] instanceof Date && dayStart_(r['진행일']) <= today_().getTime()) lines.push('2. 오리명단방에 보낸 명단 카톡 메시지를 아래 글로 수정 (새로 보내지 말고 수정)', '', r['시트 링크'] + '\n\n' + newBare + ((String(r['명단 제목']).match(/\s*\([^)]*\)\s*$/) || [''])[0]));
  queueMsg_('내 할 일', lines.join('\n'), '할 일');
}

// 방제(명단 제목) 바꾸기: 진행목록 명단 제목·카톡방, 보낼 메시지함의 대기 중인 방 이름. 월급시트 캠페인명은 15분 갱신 때 같은 날짜·캠페인 줄을 찾아 바꿈
function renameRun_(r, title, why) {
  title = bareTitle_(title);
  if (!title || title === bareTitle_(r['명단 제목'])) return false;
  // 다른 진행(다른 상품)의 방제로는 절대 안 바꿈 (10/23: 한눈에 탭 방제 칸에 속눈썹영양제 방제가 들어가 기대평 진행 이름·보낼메시지 방이 속눈썹으로 바뀐 것)
  const other = readRuns_().filter(function (x) { return x.row !== r.row && x['진행 상태'] !== '종료' && (bareTitle_(x['명단 제목']) === title || sameRunTitle_(x['명단 제목'], title)) && campKey_(x['명단 제목']) !== campKey_(r['명단 제목']); })[0];
  if (other) { note_('⛔ 방제 안 바꿈: ' + bareTitle_(r['명단 제목']) + ' → ' + title + ' (다른 진행 ' + bareTitle_(other['명단 제목']) + '의 방제라서)' + (why ? ' [' + why + ']' : '')); return false; }
  // 같은 상품의 다른 날 진행이 아직 그 방 이름(같은 날짜)을 쓰고 있으면 안 바꿈: 바꾸면 두 진행의 보낼메시지가 한 방으로 섞임 (10/24 #10.26 공지 사라진 원인)
  const twin = readRuns_().filter(function (x) { return x.row !== r.row && x['진행 상태'] !== '종료' && campKey_(x['명단 제목']) === campKey_(r['명단 제목']) && dateTok_(x['명단 제목']) === dateTok_(title) && dateTok_(title) !== dateTok_(r['명단 제목']); })[0];
  if (twin) { note_('⛔ 방제 안 바꿈: ' + bareTitle_(r['명단 제목']) + ' → ' + title + ' (같은 날짜 진행 ' + bareTitle_(twin['명단 제목']) + '이 아직 있어서)' + (why ? ' [' + why + ']' : '')); return false; }
  note_('방제 바꿈' + (why ? '(' + why + ')' : '') + ': ' + bareTitle_(r['명단 제목']) + ' → ' + title);
  const cm = title.match(/(\d+)\s*$/);
  if (cm && Number(cm[1]) > 0 && !isExpect_(r)) { setRun_(r.row, '목표인원', Number(cm[1])); r['목표인원'] = Number(cm[1]); }   // 기대평은 방제 끝이 건수(사람 × 27)
  const nick = (String(r['명단 제목']).match(/\s*\([^)]*\)\s*$/) || [''])[0];
  const oldRoom = String(r['카톡방'] || bareTitle_(r['명단 제목']));
  const oldTitle = String(r['명단 제목']);
  setRun_(r.row, '명단 제목', title + nick); r['명단 제목'] = title + nick;
  // 월급시트 캠페인명도 바로 같이 (안 하면 새 이름 줄이 하나 더 생겨 같은 진행이 두 줄이 됨, 10/21 써니마켓)
  try { payRename_(bareTitle_(oldTitle), title); } catch (e) { note_('월급시트 이름 바꾸기 실패: ' + e); }
  // 배정 탭의 명단 제목도 새 이름으로
  try {
    const as = assignSheet_(), al = as.getLastRow();
    if (al >= 2) as.getRange(2, 1, al - 1, 1).getValues().forEach(function (v, i) { if (String(v[0]) === oldTitle) as.getRange(i + 2, 1).setValue(title + nick); });
  } catch (e) {}
  setRun_(r.row, '카톡방', title); r['카톡방'] = title;
  // 명단 시트·폼·폴더 이름도 같이 (10/26 효자손: 방제만 바뀌고 시트·폼은 '# 실 유앤아이푸드 효자손외'로 남아 서로 달랐음)
  try { renameRunFiles_(r, sheetName_(oldTitle), sheetName_(title)); } catch (e) { note_('명단 시트·폼 이름 바꾸기 실패: ' + e); }
  try {
    const ob = outboxSheet_(), last = ob.getLastRow();
    if (last >= 2) ob.getRange(2, 1, last - 1, 6).getValues().forEach(function (v, i) {
      if (String(v[3]) !== oldRoom || !(v[5] === '대기' || v[5] === '방 못 찾음')) return;
      obSet_(ob, v[0], 4, title);
      // 보낼 날짜도 새 방 날짜로 (10/24: 주말 건너뛰기로 #10.24 → #10.27로 바뀐 공지가 보낼 날짜 10/23에 그대로 남았음)
      if (v[1] instanceof Date) obSet_(ob, v[0], 2, sendDate_(title, v[4], v[2]));
    });
  } catch (e) {}
  return true;
}

// 진행의 명단 시트·폼(제목·파일)·폴더 이름을 옛 이름 → 새 이름 (끝의 ' (응답)'은 그대로). 지금 이름이 옛 이름과 같을 때만 (손으로 바꾼 이름은 안 건드림)
function renameRunFiles_(r, oldN, newN) {
  oldN = String(oldN || '').trim(); newN = String(newN || '').trim();
  if (!oldN || !newN || oldN === newN) return [];
  const done = [];
  const ren = function (kind, get, set) {
    const cur = String(get()), tail = (cur.match(/\s*\(응답\)\s*$/) || [''])[0], base = cur.slice(0, cur.length - tail.length).trim();
    if (base.replace(/\s+/g, '') !== oldN.replace(/\s+/g, '')) return;
    set(newN + tail); done.push(kind);
  };
  const sid = String(r['시트ID'] || ''), fid = String(r['폼ID'] || ''), fo = (String(r['폴더 링크'] || '').match(/[-\w]{25,}/) || [])[0];
  if (sid) try { const f = DriveApp.getFileById(sid); ren('명단 시트', function () { return f.getName(); }, function (n) { f.setName(n); }); } catch (e) {}
  if (fid) {
    try { const fm = FormApp.openById(fid); ren('폼 제목', function () { return fm.getTitle(); }, function (n) { fm.setTitle(n); }); } catch (e) {}
    try { const ff = DriveApp.getFileById(fid); ren('폼 파일', function () { return ff.getName(); }, function (n) { ff.setName(n); }); } catch (e) {}
  }
  if (fo) try { const d = DriveApp.getFolderById(fo); ren('폴더', function () { return d.getName(); }, function (n) { d.setName(n); }); } catch (e) {}
  if (done.length) note_('✓ ' + done.join('·') + ' 이름: ' + oldN + ' → ' + newN);
  return done;
}
// 의뢰서 하나 = 명단 시트(폼) 하나. 날짜마다 카톡방만 새로 만들고 같은 폼, 같은 명단 시트에 이어서 받음
// 같은 명단 시트를 쓰는 진행들 (진행일 순)
function siblings_(runs, r) {
  return runs.filter(function (x) { return x['시트ID'] && String(x['시트ID']) === String(r['시트ID']) && x['진행일'] instanceof Date; })
    .sort(function (a, b) { return (a['진행일'] - b['진행일']) || (a.row - b.row); });
}

// 진행 안 하는 날: 토, 일, 공휴일 (대체공휴일 포함). 자동으로 만드는 다음 날·추가 모집·다음 일차는 이 날을 건너뜀.
//  예외로 그날 진행해야 하면 생성기에서 진행 날짜를 직접 고르면 됨(직접 고른 날은 안 바꿈). CONFIG.EXTRA_HOLIDAYS / WORK_DAYS로 더하거나 뺄 수 있음
const KR_HOLIDAYS = [
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-03-02', '2026-05-05', '2026-05-25', '2026-06-03', '2026-08-17',
  '2026-09-24', '2026-09-25', '2026-09-26', '2026-10-05', '2026-10-09', '2026-12-25',
  '2027-01-01', '2027-02-08', '2027-02-09', '2027-03-01', '2027-05-05', '2027-05-13', '2027-08-16', '2027-09-14', '2027-09-15', '2027-09-16',
  '2027-10-04', '2027-10-11', '2027-12-27'
];
function isWorkday_(d) {
  const iso = Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy-MM-dd');
  if ((CONFIG.WORK_DAYS || []).indexOf(iso) >= 0) return true;
  const ymd = iso.split('-').map(Number), dow = new Date(Date.UTC(ymd[0], ymd[1] - 1, ymd[2])).getUTCDay();   // 0 일 ~ 6 토
  return dow > 0 && dow < 6 && KR_HOLIDAYS.indexOf(iso) === -1 && (CONFIG.EXTRA_HOLIDAYS || []).indexOf(iso) === -1;
}
// 공휴일을 시트 날짜 숫자로 (1899-12-30부터 날 수). 진행해야 하는 예외 날(CONFIG.WORK_DAYS)은 뺌
function holidaySerials_() {
  return KR_HOLIDAYS.concat(CONFIG.EXTRA_HOLIDAYS || []).filter(function (iso, i, a) { return a.indexOf(iso) === i && (CONFIG.WORK_DAYS || []).indexOf(iso) === -1; })
    .map(function (iso) { const y = iso.split('-').map(Number); return Math.round((Date.UTC(y[0], y[1] - 1, y[2]) - Date.UTC(1899, 11, 30)) / 86400000); });
}
// d 다음 진행일 (d가 금요일이면 월요일)
function nextWorkday_(d) {
  const x = new Date(d); x.setHours(12, 0, 0, 0);
  do { x.setDate(x.getDate() + 1); } while (!isWorkday_(x));
  x.setHours(0, 0, 0, 0);
  return x;
}
// d가 진행일이 아니면 그다음 진행일
function workdayOnOrAfter_(d) {
  const x = new Date(d); x.setHours(12, 0, 0, 0);
  while (!isWorkday_(x)) x.setDate(x.getDate() + 1);
  x.setHours(0, 0, 0, 0);
  return x;
}
// 방제·명단 제목의 날짜(10.17)를 바꿈
function retitleDate_(t, d) { return String(t || '').replace(/\d{1,2}\.\d{1,2}/, (d.getMonth() + 1) + '.' + d.getDate()); }

function dayStart_(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); }

// 이 진행 몫의 응답 시간 범위: 첫 진행은 처음부터, 다음 진행은 진행일 0시부터 그다음 진행 0시 전까지
function windowOf_(runs, r) {
  const sib = siblings_(runs, r);
  const i = sib.findIndex(function (x) { return x.row === r.row; });
  return {
    from: i > 0 ? dayStart_(r['진행일']) : 0,
    to: i >= 0 && i < sib.length - 1 ? dayStart_(sib[i + 1]['진행일']) : Infinity,
    first: i <= 0, last: i === sib.length - 1, shared: sib.length > 1
  };
}

// 응답 시트 A열(타임스탬프) 시각 목록
function respTimes_(sheetId) {
  const raw = responseSheet_(SpreadsheetApp.openById(sheetId));
  const last = raw.getLastRow();
  if (last < 2) return [];
  // 시각만 있고 답이 없는 줄은 사람으로 안 셈 (10/21)
  const w = Math.max(raw.getLastColumn(), 1);
  return raw.getRange(2, 1, last - 1, w).getValues().map(function (x) { return x[0] instanceof Date && x.slice(1).some(function (v) { return v !== '' && v !== null; }) ? x[0].getTime() : null; }).filter(function (t) { return t !== null; });
}

// 폼에 실제로 들어온 응답 시각 (명단 시트보다 폼이 정확: 시트 연결이 끊겨도 셀 수 있음)
function formTimes_(formId) {
  return FormApp.openById(formId).getResponses().map(function (x) { return x.getTimestamp().getTime(); });
}

// 명단 시트에 연결된 모든 폼의 응답 시각 (한 의뢰를 여러 폼으로 받아도 다 셈)
//  formId + formTimes를 주면 그 폼은 폼에서 바로 가져온 시각을 씀 (방금 낸 응답이 시트에 아직 안 들어왔을 수 있어서)
function allRespTimes_(sheetId, formId, formTimes) {
  const out = (formTimes || []).slice();
  SpreadsheetApp.openById(sheetId).getSheets().filter(function (t) { return !!t.getFormUrl(); }).forEach(function (t) {
    const m = String(t.getFormUrl()).match(/\/forms\/d\/([-\w]{25,})/);
    if (formTimes && m && m[1] === String(formId)) return;
    const last = t.getLastRow();
    if (last < 2) return;
    // 시각만 있고 답이 없는 줄은 사람으로 안 셈 (10/21)
    t.getRange(2, 1, last - 1, Math.max(t.getLastColumn(), 1)).getValues().forEach(function (v) { if (v[0] instanceof Date && v.slice(1).some(function (x) { return x !== '' && x !== null; })) out.push(v[0].getTime()); });
  });
  return out;
}

function runCount_(runs, r, times) {
  const w = windowOf_(runs, r);
  if (!times) { try { times = allRespTimes_(r['시트ID']); } catch (e) { try { times = formTimes_(r['폼ID']); } catch (e2) { times = []; } } }
  return times.filter(function (t) { return t >= w.from && t < w.to; }).length;
}

// 이 진행의 구매 시간 글: 폼 설명(공지) 맨 윗줄이 시간 글이면 그걸(직접 고친 공지 반영), 아니면 진행목록 구매시간
const SLOT_CACHE = {};
function runSlot_(r) {
  const id = String(r['폼ID'] || '');
  if (id && SLOT_CACHE[id] === undefined) {
    SLOT_CACHE[id] = '';
    try {
      const first = String(FormApp.openById(id).getDescription() || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean)[0] || '';
      if (/자정|바로구매|오전|오후/.test(first) && first.length < 40) SLOT_CACHE[id] = first;
    } catch (e) {}
  }
  return (id && SLOT_CACHE[id]) || String(r['구매시간'] || '');
}

// 구매 마감 시각이 지났는지 (자정 ~ 오전 7시 00분 → 진행일 7:00). 시간이 없으면 진행일이 지났을 때만
function pastEnd_(r) {
  if (!(r['진행일'] instanceof Date)) return false;
  const m = runSlot_(r).match(/~\s*(오전|오후)\s*(\d{1,2})\s*시\s*(?:(\d{1,2})\s*분)?/);
  const end = new Date(r['진행일']);
  if (m) end.setHours((m[1] === '오후' && Number(m[2]) < 12 ? 12 : 0) + Number(m[2]), Number(m[3] || 0), 0, 0);
  else end.setHours(23, 59, 59, 0);
  return Date.now() > end.getTime();
}

// 과일: 공지 구매 시간이 '자정 ~ 오전 7시' (업체 마감 8시라 잠수 대비 7시로 공지). 다른 자정 진행은 오전 8시 20분
const FRUIT_RE = /(사과|감귤|귤|한라봉|천혜향|황금향|레드향|오렌지|포도|샤인머스캣|복숭아|천도|자두|딸기|수박|참외|멜론|키위|망고|블루베리|체리|단감|대봉|홍시|곶감|대추|석류|무화과|자몽|레몬|파인애플|바나나|아보카도|매실|살구|유자|신고배|나주배)$/;
const DESC_CACHE = {};
function isFruit_(r) {
  if (/자정[^\n]*오전\s*7\s*시/.test(runSlot_(r))) return true;
  const id = String(r['폼ID'] || '');
  if (id && DESC_CACHE[id] === undefined) { DESC_CACHE[id] = ''; try { DESC_CACHE[id] = FormApp.openById(id).getDescription() || ''; } catch (e) {} }
  const words = [];
  noticeProducts_(DESC_CACHE[id] || '').forEach(function (p) { words.push(p.name); });
  (String(DESC_CACHE[id] || '').match(/(?:키워드|상품명)\s*[:：][^\n]*/g) || []).forEach(function (l) { l.replace(/^.*?[:：]/, '').split(/[\s,]+/).forEach(function (w) { words.push(w); }); });
  return words.some(function (w) { return FRUIT_RE.test(String(w)) || w === '배' || w === '감'; });
}

// 명단 시트·폼·폴더 이름: 방제에서 날짜와 끝 인원 수를 뺀 것 (#택10.14 모두의농수산옥광밤외12 → #택 모두의농수산옥광밤외, #택10.19 휴대폰거치대 10 → #택 휴대폰거치대)
//  인원 수는 취소·미구매로 다음 날 밀리면 날마다 바뀌어서 카톡 방제·명단방 문구에만 씀 (사용자 지시 10/18)
function sheetName_(s) {
  return noCount_(String(s || '').replace(/\s*\([^)]*\)\s*$/, '').replace(/^([#업택\s]*?)\s*\d{1,2}\.\d{1,2}\s*/, '$1 ').replace(/\s+/g, ' ').trim());
}
function noCount_(t) {
  t = String(t || '').trim();
  const tail = (t.match(/\s*\(응답\)$/) || [''])[0];
  t = t.slice(0, t.length - tail.length);
  t = /\s\d+$/.test(t) ? t.replace(/\s+\d+$/, '') : t.replace(/(외|실)\d+$/, '$1');
  return t + tail;
}

// (한 번만) 진행 중인 폼·명단 시트·폴더 이름에서 끝 인원 수 빼기
// (10/18 한 번만) 진행 중인 명단 시트의 '명단' 탭에서 손으로 적는 칸(송장번호, 실배송) 지우기. 칸에 뭐가 적혀 있으면 지우지 않고 알림
function dropManualColsOnce_(runs) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('DROPMANUAL_V1')) return;
  props.setProperty('DROPMANUAL_V1', '1');
  const seen = {}, kept = [];
  let n = 0;
  runs.forEach(function (r) {
    const id = String(r['시트ID'] || '');
    if (!id || seen[id] || r['진행 상태'] === '종료') return;
    seen[id] = 1;
    try {
      const sh = SpreadsheetApp.openById(id).getSheetByName(LIST_TAB);
      if (!sh) return;
      const lc = Math.max(sh.getLastColumn(), 1), head = sh.getRange(2, 1, 1, lc).getValues()[0].map(String);
      for (let c = head.length - 1; c >= 0; c--) {
        if (!/^(송장번호|실배송)$/.test(head[c].trim()) || sh.getRange(2, c + 1).getFormula()) continue;
        const last = sh.getLastRow();
        const filled = last >= 3 && sh.getRange(3, c + 1, last - 2, 1).getValues().some(function (x) { return String(x[0]).trim() !== ''; });
        if (filled) { kept.push(bareTitle_(r['명단 제목']) + ' ' + head[c]); continue; }
        sh.deleteColumn(c + 1); n++;
      }
    } catch (e) {}
  });
  if (n) note_('✓ 명단 시트 송장번호·실배송 칸 ' + n + '개 지움');
  if (kept.length) note_('적힌 내용이 있어서 안 지운 칸: ' + kept.join(', '));
}

// 이 폼의 응답이 들어가는 탭 (못 찾으면 null)
function linkedTab_(ss, formId) {
  const tabs = ss.getSheets().filter(function (s) { return !!s.getFormUrl(); });
  for (let i = 0; i < tabs.length; i++) {
    const u = String(tabs[i].getFormUrl());
    if (u.indexOf(String(formId)) !== -1) return tabs[i];
    try { if (FormApp.openByUrl(u).getId() === String(formId)) return tabs[i]; } catch (e) {}
  }
  return null;
}
// 폼 응답이 명단 시트에 안 들어오면 다시 연결: 응답 탭이 아예 없거나, 폼엔 응답이 있는데 탭이 비어 있을 때(마지막 응답 5분 뒤에도)
//  다시 연결하면 그 시트에 응답 탭이 새로 생기고 지금까지 응답이 다 들어감 → 명단 탭은 fixListRef_/ensureListTab_가 새 탭을 보게 고침. 폼마다 3시간에 한 번까지
function relinkIfMissing_(r, form) {
  const sid = String(r['시트ID'] || '');
  if (!sid) return '';
  const resp = form.getResponses();
  if (!resp.length) return '';
  const ss = SpreadsheetApp.openById(sid), tab = linkedTab_(ss, r['폼ID']);
  let rows = 0;
  if (tab && tab.getLastRow() >= 2) rows = tab.getRange(2, 1, tab.getLastRow() - 1, 1).getValues().filter(function (x) { return x[0] instanceof Date; }).length;
  if (tab && rows > 0) return '';
  const newest = resp[resp.length - 1].getTimestamp().getTime();
  if (tab && Date.now() - newest < 5 * 60000) return '';
  const props = PropertiesService.getScriptProperties(), key = 'RELINK_' + r['폼ID'];
  if (Date.now() - Number(props.getProperty(key) || 0) < 3 * 3600000) return '폼 응답 ' + resp.length + '개가 명단 시트에 아직 안 들어옴 (다시 연결해 둠, 기다리는 중)';
  props.setProperty(key, String(Date.now()));
  try { form.removeDestination(); } catch (e) {}
  form.setDestination(FormApp.DestinationType.SPREADSHEET, sid);
  SpreadsheetApp.flush();
  return '폼 응답 ' + resp.length + '개가 명단 시트에 ' + (tab ? '안 들어와 있어서' : '응답 탭이 없어서') + ' 다시 연결함';
}

// 명단 탭이 폼 응답 탭을 보고 있는지: 새 진행을 만들 때 폼 응답 탭이 늦게 생기면(15초 넘게) 명단 탭이 빈 기본 탭을 보게 되고,
//  그 빈 탭이 지워지면 명단·한눈에 탭에 응답이 하나도 안 보임 → 명단 탭을 다시 만듦
function fixListRef_(ss, r) {
  // (10/19) 명단 탭은 값, 스크립트가 세는 수식은 숨은 '응답합본' 탭. 합본 수식을 맞추고, 명단 탭이 아직 수식이면 값으로 한 번 바꿈
  buildMergeTab_(ss);
  if (!PropertiesService.getScriptProperties().getProperty('LISTV_' + ss.getId())) { convertListToValues_(ss); return true; }
  return false;
}

// 숨은 '응답합본' 탭: 이 시트에 연결된 폼 응답 탭(들)을 수식으로 합쳐 둠 (2행 머리글, 3행부터 응답, 시각 순)
//  인원 세기·한눈에 탭·배정 '산 수'가 여기를 봄. 사람은 안 보고 안 고침
//  수식은 줄 번호 없이 열 전체(A:M)로 쓰고 머리글은 ROW()>1로 뺌: 'A2:M'처럼 쓰면 구글폼이 응답 줄을 끼워 넣을 때마다 A3, A4…로 밀림(10/19). DROP은 구글 시트에 없음
const MERGE_TAB = '응답합본';
const MERGE_TS_FMT = 'yyyy. M. d am/pm h:mm:ss';
// 시트 값 → 시각(ms). 날짜면 그대로, 날짜 서식이 없어 숫자(일련번호, 한국 시간)로 오면 바꿈
function tsMs_(v) {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number' && v > 40000 && v < 80000) return Math.round((v - 25569) * 864e5) - 9 * 3600000;
  return NaN;
}
const REAL_YELLOW = '#fff2a8';
function buildMergeTab_(ss) {
  const tabs = ss.getSheets().filter(function (t) { return !!t.getFormUrl(); });
  if (!tabs.length) return null;
  let mt = ss.getSheetByName(MERGE_TAB);
  if (!mt) mt = ss.insertSheet(MERGE_TAB, ss.getSheets().length);
  try { if (!mt.isSheetHidden()) mt.hideSheet(); } catch (e) {}
  const ref = function (t) { return "'" + t.getName().replace(/'/g, "''") + "'!"; };
  let f2 = '', v2 = null, f3;
  if (tabs.length === 1) {
    const L = colLetter_(Math.max(tabs[0].getLastColumn(), rawHead_(tabs[0]).length, 1));
    f2 = '={' + ref(tabs[0]) + 'A1:' + L + '1}';
    f3 = '=IFERROR(FILTER(' + ref(tabs[0]) + 'A:' + L + ', ROW(' + ref(tabs[0]) + 'A:A)>1, ' + ref(tabs[0]) + 'A:A<>""), "")';
  } else {
    const heads = tabs.map(rawHead_), union = heads[0].slice();
    heads.slice(1).forEach(function (h) { h.forEach(function (x) { if (x && union.indexOf(x) === -1) union.push(x); }); });
    const parts = tabs.map(function (t, i) {
      const L = colLetter_(Math.max(heads[i].length, 1));
      const cols = union.map(function (u) { const k = heads[i].indexOf(u); return k >= 0 ? 'CHOOSECOLS(d,' + (k + 1) + ')' : 'MAKEARRAY(ROWS(d),1,LAMBDA(rr,cc,""))'; });
      return 'LET(d,FILTER(' + ref(t) + 'A:' + L + ',ROW(' + ref(t) + 'A:A)>1),HSTACK(' + cols.join(',') + '))';
    });
    v2 = union;
    f3 = '=IFERROR(LET(v,VSTACK(' + parts.join(',') + '),SORT(FILTER(v,INDEX(v,0,1)<>""),1,TRUE)),"")';
  }
  if (f2 ? mt.getRange('A2').getFormula() !== f2 : String(mt.getRange(2, 1, 1, v2.length).getValues()[0].join('|')) !== v2.join('|')) {
    mt.getRange(2, 1, 1, Math.max(mt.getMaxColumns(), 1)).clearContent();
    if (f2) mt.getRange('A2').setFormula(f2); else mt.getRange(2, 1, 1, v2.length).setValues([v2]);
  }
  if (mt.getRange('A3').getFormula() !== f3) mt.getRange('A3').setFormula(f3);
  // 타임스탬프 칸은 날짜 서식으로: 수식이 A:M(1행 글자 머리글부터)을 보면 결과가 숫자(46314.01)로 나와서
  //  스크립트가 날짜로 못 읽고 '합본 0'으로 셌음 (10/19)
  if (mt.getMaxRows() >= 3 && mt.getRange('A3').getNumberFormat() !== MERGE_TS_FMT) mt.getRange(3, 1, mt.getMaxRows() - 2, 1).setNumberFormat(MERGE_TS_FMT);
  tabs.forEach(function (t) { try { t.hideSheet(); } catch (e) {} });
  return mt;
}

// 명단 탭을 수식 → 값으로 한 번 바꿈 (1행 요약은 그대로, 2행 머리글과 응답을 값으로 다시 씀)
function convertListToValues_(ss) {
  const sh = ss.getSheetByName(LIST_TAB);
  const props = PropertiesService.getScriptProperties(), id = ss.getId();
  if (!sh) return;
  const mr = sh.getMaxRows(), mc = sh.getMaxColumns();
  if (mr >= 2) sh.getRange(2, 1, mr - 1, mc).clearContent();
  if (mr >= 3) sh.getRange(3, 1, mr - 2, mc).setBackground(null);
  sh.setConditionalFormatRules([]);   // 날짜 색 규칙은 값으로 칠함
  const tabs = ss.getSheets().filter(function (t) { return !!t.getFormUrl(); }), heads = [];
  tabs.forEach(function (t) { rawHead_(t).map(hk_).forEach(function (x) { if (x && heads.indexOf(x) === -1 && !MATCH.nick.test(x) && !MATCH.expSet.test(x)) heads.push(x); }); });
  if (heads.length) sh.getRange(2, 1, 1, heads.length).setValues([heads]);
  props.setProperty('LISTV_' + id, '1');
  props.deleteProperty('LISTK_' + id); props.deleteProperty('LISTH_' + id);
  syncList_(ss);
}

// 머리글 비교용: 끝 띄어쓰기·줄바꿈 무시 (폼 질문 제목 끝에 공백이 있으면 '전화번호 '와 '전화번호'가 달라서 값이 빈칸으로 들어갔음, 10/19)
function hk_(h) { return String(h == null ? '' : h).replace(/\s+/g, ' ').trim(); }

// (한 번) 값 명단 탭 고치기: ① 같은 머리글이 또 생긴 빈 칸 지우기 ② 이미 넣은 줄의 빈칸을 응답 값으로 채우기(있는 값은 안 건드림)
//  ③ 예전 수식 명단 때 걸어 둔 열 숨김(계좌 칸 묶음)이 엉뚱한 칸을 숨기고 있어서 풀고 다 보이게
function showAllCols_(sh) {
  try { sh.expandAllColumnGroups(); } catch (e) {}
  try { for (let c = 1; c <= sh.getMaxColumns(); c++) { let n = 0; while (sh.getColumnGroupDepth(c) > 0 && n++ < 5) sh.getRange(1, c).getEntireColumn().shiftColumnGroupDepth(-1); } } catch (e) {}
  sh.showColumns(1, sh.getMaxColumns());
}
function repairList_(sh, rows) {
  showAllCols_(sh);
  const lr = sh.getLastRow();
  let lc = Math.max(sh.getLastColumn(), 1), hdr = sh.getRange(2, 1, 1, lc).getValues()[0].map(hk_);
  for (let j = hdr.length - 1; j >= 0; j--) {
    if (!hdr[j] || hdr.indexOf(hdr[j]) === j) continue;
    const empty = lr < 3 || sh.getRange(3, j + 1, lr - 2, 1).getValues().every(function (x) { return x[0] === '' || x[0] === null; });
    if (empty) sh.deleteColumn(j + 1);
  }
  lc = Math.max(sh.getLastColumn(), 1); hdr = sh.getRange(2, 1, 1, lc).getValues()[0].map(hk_);
  sh.getRange(2, 1, 1, lc).setValues([hdr]);
  const cT = hdr.indexOf('타임스탬프') + 1;
  if (!cT || lr < 3) return;
  const by = {}; rows.forEach(function (x) { by[x.t] = x.o; });
  const v = sh.getRange(3, 1, lr - 2, lc).getValues();
  hdr.forEach(function (h, j) {
    if (!h || j + 1 === cT) return;
    let changed = false;
    const col = v.map(function (row) {
      const ts = row[cT - 1], o = ts instanceof Date ? by[ts.getTime()] : null;
      if (o && (row[j] === '' || row[j] === null) && Object.prototype.hasOwnProperty.call(o, h) && o[h] !== '') { changed = true; return [o[h]]; }
      return [row[j]];
    });
    if (changed) sh.getRange(3, j + 1, col.length, 1).setValues(col);
  });
}

// 명단 탭(값)에 새 응답만 아래에 붙임. 이미 넣은 줄은 절대 안 건드림 → 사장님·사용자가 체크칸을 넣고, 열·줄을 지우고, 고쳐도 유지
//  어느 응답을 넣었는지는 스크립트 속성 LISTK_<시트ID>(응답 시각)로 기억 → 지운 줄도 다시 안 생김
//  칸은 2행 머리글 글자로 찾아서 넣음(지운 칸은 안 채움, 다시 안 만듦). 폼에 새로 생긴 질문만 오른쪽 끝에 칸을 더함(LISTH_)
//  폼에서 지운 응답(취소 등)은 줄을 남기고 타임스탬프 칸 메모 + 회색 글자
// 전화번호를 010-0000-0000 모양으로 (택배시트에 하이픈 없이 들어가면 오류, 10/23). 숫자로 들어와 앞 0이 빠진 것(1087582349)도 고침
// 기대평 댓글 진행 (구매 없음, 10/23 100발100중): 결제금액·리뷰 가이드·리뷰 확인·포토·월급시트 자동은 안 함
function isExpect_(r) { return String(r && r['플랫폼'] || '') === '기대평'; }
function phoneFmt_(v) {
  if (v === '' || v === null || v === undefined) return v;
  let d = String(v).replace(/\D/g, '');
  if (/^1[016789]\d{7,8}$/.test(d)) d = '0' + d;
  if (/^01\d{9}$/.test(d)) return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
  if (/^01\d{8}$/.test(d)) return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
  return v;
}
function syncList_(ss) {
  const sh = ss.getSheetByName(LIST_TAB);
  if (!sh) return 0;
  const props = PropertiesService.getScriptProperties(), id = ss.getId();
  if (!props.getProperty('LISTV_' + id)) return 0;
  const tabs = ss.getSheets().filter(function (t) { return !!t.getFormUrl(); });
  if (!tabs.length) return 0;
  const heads = [], rows = [];
  tabs.forEach(function (t) {
    const lr = t.getLastRow(), h = rawHead_(t).map(hk_);
    h.forEach(function (x) { if (x && heads.indexOf(x) === -1 && !MATCH.nick.test(x) && !MATCH.expSet.test(x)) heads.push(x); });
    if (lr < 2 || !h.length) return;
    t.getRange(2, 1, lr - 1, h.length).getValues().forEach(function (x) {
      if (!(x[0] instanceof Date)) return;
      // 시각만 있고 답이 하나도 없는 줄은 사람이 아니라서 명단에 안 넣음 (10/21 마켓담온 귤 8행)
      if (!x.slice(1).some(function (v) { return v !== '' && v !== null; })) return;
      const o = {}; h.forEach(function (name, j) { o[name] = /전화|연락처|휴대폰|핸드폰/.test(name) ? phoneFmt_(x[j]) : x[j]; });
      rows.push({ t: x[0].getTime(), o: o });
    });
  });
  rows.sort(function (a, b) { return a.t - b.t; });
  // (10/19 한 번) 이미 값으로 바뀐 명단 탭에서 카톡 닉네임 칸 지우기 (한눈에 탭에서만 보이게)
  if (!props.getProperty('LISTNONICK_' + id)) {
    props.setProperty('LISTNONICK_' + id, '1');
    const h0 = sh.getRange(2, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
    for (let c = h0.length - 1; c >= 0; c--) if (MATCH.nick.test(String(h0[c]))) sh.deleteColumn(c + 1);
  }
  const real = !!props.getProperty('LISTREAL_' + id);
  // 날·옵션마다 실배송이 다른 의뢰 (10/26 치약걸이 보냉백: 10.27부터 치약걸이만 실배송, 보냉백은 일반배송) → 실배송 줄만 노란색
  let realOpt = []; try { realOpt = JSON.parse(props.getProperty('LISTREALOPT_' + id) || '[]') || []; } catch (e) {}
  // (10/19 한 번) 머리글 끝 띄어쓰기·줄바꿈 때문에 전화번호·옵션·결제금액·계좌번호 등이 빈칸으로 들어가고 오른쪽에 같은 이름 칸이 또 생긴 것 고치기
  if (!props.getProperty('LISTFIX1_' + id)) { props.setProperty('LISTFIX1_' + id, '1'); try { repairList_(sh, rows); } catch (e) { note_('명단 탭 고치기 실패: ' + e); } }
  // 은행·계좌번호·예금주 칸은 접어서 숨김(+ 단추로 펼침). 고치기(repairList_)가 묶음을 풀었으면 다시 접음. 한 번만 (사용자가 펼쳐 두면 그대로)
  if (!props.getProperty('LISTHIDE_' + id)) {
    props.setProperty('LISTHIDE_' + id, '1');
    try {
      const h1 = sh.getRange(2, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(hk_), cols = [];
      h1.forEach(function (h, i) { if (MATCH.account.test(h) || (real && MATCH.reviewFee.test(h))) cols.push(i + 1); });
      groupColumns_(sh, cols);
    } catch (e) { note_('명단 탭 계좌 칸 숨기기 실패: ' + e); }
  }
  // (10/19 한 번) 실배송이면 응답 줄 전부 노란색 (날짜별 색 대신)
  if (real && !props.getProperty('LISTYEL_' + id)) {
    props.setProperty('LISTYEL_' + id, '1');
    if (sh.getLastRow() >= 3) sh.getRange(3, 1, sh.getLastRow() - 2, Math.max(sh.getLastColumn(), 1)).setBackground(REAL_YELLOW);
  }
  let lc = Math.max(sh.getLastColumn(), 1), hdr = sh.getRange(2, 1, 1, lc).getValues()[0].map(hk_);
  // 폼 질문 '이름'을 '계정명(수령인)'으로 바꾸면(10/20) 응답 탭 머리글도 바뀜 → 명단 탭 '이름' 칸 머리글을 바꿔서 그 칸에 이어 씀 (오른쪽 끝에 새 칸 안 생기게)
  if (heads.indexOf(ACCOUNT_Q) >= 0 && hdr.indexOf(ACCOUNT_Q) === -1 && hdr.indexOf('이름') >= 0) {
    sh.getRange(2, hdr.indexOf('이름') + 1).setValue(ACCOUNT_Q);
    hdr[hdr.indexOf('이름')] = ACCOUNT_Q;
  }
  // 옛 폼(질문이 '이름') 응답도 그 칸에
  if (hdr.indexOf(ACCOUNT_Q) >= 0 && hdr.indexOf('이름') === -1) rows.forEach(function (x) { if (Object.prototype.hasOwnProperty.call(x.o, '이름') && !Object.prototype.hasOwnProperty.call(x.o, ACCOUNT_Q)) x.o[ACCOUNT_Q] = x.o['이름']; });
  let known = []; try { known = JSON.parse(props.getProperty('LISTH_' + id) || '[]').map(hk_); } catch (e) {}
  if (!known.length) known = hdr.filter(Boolean);
  heads.filter(function (h) { return hdr.indexOf(h) === -1 && known.indexOf(h) === -1; }).forEach(function (h) {
    known.push(h);
    sh.getRange(2, Math.max(sh.getLastColumn(), 1) + 1).setValue(h);
    lc = Math.max(sh.getLastColumn(), 1); hdr = sh.getRange(2, 1, 1, lc).getValues()[0].map(hk_);
  });
  props.setProperty('LISTH_' + id, JSON.stringify(known));
  // 리뷰 확인 체크칸: 맨 오른쪽에서 한 칸 띄우고, 머리글 글자·칸 색 없이 (사용자 요청 10/20). 머리글 칸 메모로 알아봄(열을 옮겨도 따라감)
  //  한 번만 만듦 → 지우거나 옮겨도 다시 안 만듦. 그날 사람 전부 체크하면 취완 메시지(reviewDone_)
  if (!props.getProperty('RVCOL2_' + id)) {
    props.setProperty('RVCOL2_' + id, '1');
    const old = hdr.indexOf(RV_CHECK);
    if (old >= 0) {
      // 먼저 만든 '리뷰 확인' 칸(글자·색 있음) → 글자·색 지우고 앞에 빈 칸 하나
      const c0 = old + 1, rows = Math.max(sh.getLastRow() - 1, 1);
      sh.getRange(2, c0).setValue('');
      sh.getRange(2, c0, rows, 1).setBackground(null);
      sh.insertColumnBefore(c0);
      sh.getRange(2, c0, rows, 1).clearContent().clearDataValidations().setBackground(null);
      sh.getRange(2, c0).clearNote();
    } else if (!props.getProperty('RVCOL_' + id) && rvCol_(sh, lc) < 0) {
      const c = lc + 1;   // 맨 오른쪽 바로 옆 칸 (사용자 요청 10/21: M칸)
      if (sh.getMaxColumns() < c) sh.insertColumnsAfter(sh.getMaxColumns(), c - sh.getMaxColumns());
      rvMark_(sh, c);
      if (sh.getLastRow() >= 3) sh.getRange(3, c, sh.getLastRow() - 2, 1).insertCheckboxes().setHorizontalAlignment('center');
    }
    props.setProperty('RVCOL_' + id, '1');
    lc = Math.max(sh.getLastColumn(), 1); hdr = sh.getRange(2, 1, 1, lc).getValues()[0].map(hk_);
  }
  // 체크칸 머리글 메모가 마우스를 올리면 보여서 → 남아 있으면 매번 지우고 숨은 표시로 (10/20: 새 시트에 다시 생겼던 것)
  try {
    const notes = sh.getRange(2, 1, 1, Math.min(sh.getMaxColumns(), lc + 3)).getNotes()[0], i = notes.findIndex(function (n) { return String(n).indexOf('리뷰 확인 칸') === 0; });
    if (i >= 0) { rvMark_(sh, i + 1); sh.getRange(2, i + 1).clearNote(); }
  } catch (e) {}
  let rvc = rvCol_(sh, lc);   // 체크칸 (1부터, 없으면 -1)
  // (한 번, 10/21) 한 칸 띄운 체크칸(N)을 바로 옆(M)으로: 앞 칸이 통째로 비어 있을 때만
  if (rvc > 2 && !props.getProperty('RVCOLM_' + id)) {
    props.setProperty('RVCOLM_' + id, '1');
    try {
      const gap = sh.getRange(1, rvc - 1, Math.max(sh.getLastRow(), 2), 1).getValues();
      if (gap.every(function (x) { return x[0] === '' || x[0] === null; })) { sh.moveColumns(sh.getRange(colLetter_(rvc) + ':' + colLetter_(rvc)), rvc - 1); rvc--; props.setProperty('RVCOLN_' + id, String(rvc)); lc = Math.max(sh.getLastColumn(), 1); hdr = sh.getRange(2, 1, 1, lc).getValues()[0].map(hk_); }
    } catch (e) { note_('체크칸 옮기기 실패: ' + e); }
  }
  const paint = rvc > 0 ? Math.max(Math.min(lc, rvc - (hdr[rvc - 2] ? 1 : 2)), 1) : lc;   // 줄 색은 체크칸 앞 빈 칸 전까지만
  const cT = hdr.indexOf('타임스탬프') + 1;
  let done = String(props.getProperty('LISTK_' + id) || '').split(',').filter(Boolean);
  if (!done.length && cT && sh.getLastRow() >= 3) done = sh.getRange(3, cT, sh.getLastRow() - 2, 1).getValues().map(function (x) { return x[0] instanceof Date ? String(x[0].getTime()) : ''; }).filter(Boolean);
  const add = rows.filter(function (x) { return done.indexOf(String(x.t)) === -1; });
  if (add.length) {
    const start = Math.max(sh.getLastRow(), 2) + 1, n = add.length;
    if (sh.getMaxRows() < start + n) sh.insertRowsAfter(sh.getMaxRows(), start + n - sh.getMaxRows());
    // 머리글이 있는 칸에만 값 (사용자가 넣은 체크칸 등 머리글이 다른 칸은 비워 둠)
    hdr.forEach(function (h, j) {
      if (!h || !add.some(function (x) { return Object.prototype.hasOwnProperty.call(x.o, h); })) return;
      sh.getRange(start, j + 1, n, 1).setValues(add.map(function (x) { return [Object.prototype.hasOwnProperty.call(x.o, h) ? x.o[h] : '']; }));
    });
    if (cT) sh.getRange(start, cT, n, 1).setNumberFormat('yyyy. M. d am/pm h:mm:ss');
    // 사용자가 만든 체크칸(바로 위 줄이 체크칸인 칸)은 새 줄에도 체크칸
    if (start > 3) {
      const above = sh.getRange(start - 1, 1, 1, lc).getValues()[0];
      above.forEach(function (v, j) { if (typeof v === 'boolean' && heads.indexOf(hdr[j]) === -1 && j + 1 !== rvc) sh.getRange(start, j + 1, n, 1).insertCheckboxes(); });
    }
    if (rvc > 0) sh.getRange(start, rvc, n, 1).insertCheckboxes().setHorizontalAlignment('center');
    // 날짜별 연한 색. 실배송이면 전부 노란색 (사용자 요청 10/19). 실배송 의뢰 안의 일반배송 줄은 색 없음 (10/26 '나머지는 노란색 색칠하지마')
    sh.getRange(start, 1, n, paint).setBackgrounds(add.map(function (x) {
      const day = Math.floor((x.t + 9 * 3600000) / 86400000) + 25569;
      return Array(paint).fill(realRow_(real, realOpt, x) ? REAL_YELLOW : real ? '#ffffff' : DAY_COLORS[day % 7]);
    }));
    done = done.concat(add.map(function (x) { return String(x.t); }));
    try { payCheck_(ss, add); } catch (e) { note_('결제금액 확인 실패: ' + e); }
  }
  if (cT && sh.getLastRow() >= 3) {
    const live = {}; rows.forEach(function (x) { live[x.t] = 1; });
    const rg = sh.getRange(3, cT, sh.getLastRow() - 2, 1), tv = rg.getValues(), nt = rg.getNotes();
    tv.forEach(function (x, i) {
      if (!(x[0] instanceof Date) || live[x[0].getTime()] || nt[i][0]) return;
      sh.getRange(i + 3, cT).setNote('폼에서 지운 응답이에요 (취소 등). 줄은 그대로 둬요.');
      sh.getRange(i + 3, 1, 1, lc).setFontColor('#999999');
    });
  }
  let save = done.join(',');
  while (save.length > 8500) { done.shift(); save = done.join(','); }
  props.setProperty('LISTK_' + id, save);
  return add.length;
}

// 명단 줄이 실배송(노란색)인지: 실배송 의뢰면 그렇고, 규칙 [{ from: '2026-10-27', opt: '치약걸이' }]이 있으면 그 날부터는 고른 옵션에 opt 글자가 있을 때만
function realRow_(real, rules, x) {
  if (!real) return false;
  const d = Utilities.formatDate(new Date(x.t), CONFIG.TIMEZONE, 'yyyy-MM-dd');
  const r = (rules || []).filter(function (y) { return y && d >= String(y.from); }).sort(function (a, b) { return a.from < b.from ? -1 : 1; }).pop();
  if (!r) return true;
  const k = Object.keys(x.o || {}).filter(function (h) { return MATCH.opt.test(h); })[0];
  return !!k && String(x.o[k]).indexOf(String(r.opt)) >= 0;
}
// 명단 탭에 이미 들어온 줄을 규칙대로 다시 칠함 (규칙 날짜 이후 줄만). 칠한 줄 수
function repaintRealRows_(ss, rules) {
  const sh = ss.getSheetByName(LIST_TAB);
  if (!sh || sh.getLastRow() < 3 || !rules.length) return 0;
  const lc = Math.max(sh.getLastColumn(), 1), hdr = sh.getRange(2, 1, 1, lc).getValues()[0].map(hk_), cT = hdr.indexOf('타임스탬프');
  if (cT < 0) return 0;
  const rvc = rvCol_(sh, lc), paint = rvc > 0 ? Math.max(Math.min(lc, rvc - (hdr[rvc - 2] ? 1 : 2)), 1) : lc;
  const from = rules.map(function (y) { return String(y.from); }).sort()[0];
  let n = 0;
  sh.getRange(3, 1, sh.getLastRow() - 2, lc).getValues().forEach(function (v, i) {
    if (!(v[cT] instanceof Date) || Utilities.formatDate(v[cT], CONFIG.TIMEZONE, 'yyyy-MM-dd') < from) return;
    const o = {}; hdr.forEach(function (h, j) { if (h) o[h] = v[j]; });
    sh.getRange(i + 3, 1, 1, paint).setBackground(realRow_(true, rules, { t: v[cT].getTime(), o: o }) ? REAL_YELLOW : '#ffffff');
    n++;
  });
  return n;
}
// 결제금액 확인 (사용자 요청 10/20): 새 응답의 결제금액이 공지 가격(배송비 포함)과 다르면 보낼메시지 '내 할 일'에. 명단 시트에는 아무것도 안 씀
//  공지 가격: 고른 옵션 글의 '(17,200원)', 없으면 진행목록 가격(하나거나 다 같을 때만). 2~5개 산 금액(가격 × 개수)은 맞는 걸로
function payCheck_(ss, add) {
  const sid = ss.getId(), runs = readRuns_(), mine = runs.filter(function (r) { return String(r['시트ID']) === sid && r['진행일'] instanceof Date; });
  if (!mine.length || mine.some(isExpect_)) return;   // 기대평은 결제가 없음
  const num = function (x) { return Number(String(x == null ? '' : x).replace(/[^0-9]/g, '')) || 0; };
  const won = function (n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '원'; };
  const bad = {};
  const pm = optPriceMap_(mine.map(function (m) { return String(m['명단 제목']); }), sid);
  // 배정 가격도 없으면 같은 옵션 다른 사람들이 가장 많이 낸 금액 (3명 이상, 절반 넘게 같은 값일 때만. 10/27 양배추 배정이 비어 있어서 못 잡음)
  let maj = null;
  const majOf = function (opt) {
    if (!maj) {
      maj = {};
      try {
        const info = rawInfo_(sid, mine[0]['폼ID']), raw = info.raw, lr = raw.getLastRow(), hd = headers_(raw);
        const co = hd.findIndex(function (h) { return MATCH.opt.test(h) && !MATCH.nick.test(h); }), cp = hd.findIndex(function (h) { return /결제\s*금액|결제\s*가격|구매\s*금액|결제한\s*금액/.test(h); });
        if (lr >= 2 && co >= 0 && cp >= 0) raw.getRange(2, 1, lr - 1, hd.length).getValues().forEach(function (v) { const o = String(v[co]).trim(), p = num(v[cp]); if (!o || !p) return; (maj[o] = maj[o] || {})[p] = (maj[o][p] || 0) + 1; });
      } catch (e) {}
    }
    const c = maj[String(opt).trim()];
    if (!c) return 0;
    const tot = Object.keys(c).reduce(function (a, p) { return a + c[p]; }, 0), top = Object.keys(c).sort(function (a, b) { return c[b] - c[a]; })[0];
    return tot >= 3 && c[top] * 2 > tot ? Number(top) : 0;
  };
  add.forEach(function (x) {
    const keys = Object.keys(x.o);
    const kPay = keys.filter(function (k) { return /결제\s*금액|결제\s*가격|구매\s*금액|결제한\s*금액/.test(k); })[0];
    const paid = kPay ? num(x.o[kPay]) : 0;
    if (!paid) return;
    const r = mine.filter(function (m) { const w = windowOf_(runs, m); return x.t >= w.from && x.t < w.to; })[0] || mine[mine.length - 1];
    const kOpt = keys.filter(function (k) { return MATCH.opt.test(k); })[0];
    const om = kOpt ? String(x.o[kOpt]).match(/\(\s*([\d,]+)\s*원\s*\)/) : null;
    let exp = om ? num(om[1]) : 0;
    // 폼 보기에 가격이 없으면(여러 상품 의뢰) 배정 탭의 그 보기 가격 (10/27 양배추채칼외 변기솔 8,300인데 8,500 결제를 못 잡음)
    if (!exp && cartN_(r) > 1) { const cp = runPrices_(r['가격']); if (cp.length === cartN_(r)) exp = cp.reduce(function (a, b) { return a + b; }, 0); }   // 장바구니건: 상품 합계
    if (!exp && kOpt) exp = pm[String(x.o[kOpt]).trim()] || 0;
    if (!exp && kOpt) exp = majOf(x.o[kOpt]);
    if (!exp) { const ps = runPrices_(r['가격']); if (ps.length && ps.every(function (p) { return p === ps[0]; })) exp = ps[0]; }
    const kName = keys.filter(function (k) { return /수령인|계정명/.test(k); })[0] || keys.filter(function (k) { return /이름|성함/.test(k) && !MATCH.nick.test(k); })[0];
    const room = bareTitle_(r['명단 제목']);
    // 기준 가격을 못 찾으면 넘어가지 않고 '확인 필요'로 (사용자 요청 10/27)
    if (!exp) { (bad[room] = bad[room] || []).push((kName ? String(x.o[kName]).trim() : '?') + ': ' + won(paid) + ' 결제 (공지 가격을 못 찾음' + (kOpt ? ', 옵션 ' + String(x.o[kOpt]).trim() : '') + ') → 확인 필요'); return; }
    for (let k = 1; k <= 5; k++) if (paid === exp * k) return;
    (bad[room] = bad[room] || []).push((kName ? String(x.o[kName]).trim() : '?') + ': ' + won(paid) + ' 결제 (공지 ' + won(exp) + ', ' + (paid > exp ? '더 비싸게 삼' : '더 싸게 삼') + ')');
  });
  Object.keys(bad).forEach(function (room) {
    queueMsg_('내 할 일', '[결제금액 확인] ' + room + '\n' + bad[room].join('\n') + '\n→ 결제 캡처를 보고, 다르면 그분께 따로 물어보기 (쿠폰·할인이면 그대로 둬도 돼요)', '할 일');
    note_('결제금액 다른 사람 ' + bad[room].length + '명: ' + room);
  });
}
// 폼 보기 → 공지 가격 (배정 탭 H 폼 보기 → I 가격, 같은 보기면 가장 많이 나온 값). 폼 보기에 가격이 없는 여러 상품 의뢰용 (10/27)
function optPriceMap_(titles, sid) {
  const out = {}, cnt = {};
  if (sid) try { Object.assign(out, JSON.parse(PropertiesService.getScriptProperties().getProperty('OPTPRICE_' + sid) || '{}')); } catch (e) {}
  try {
    const as = assignSheet_(), al = as.getLastRow();
    if (al >= 2) as.getRange(2, 1, al - 1, 9).getValues().forEach(function (v) {
      if (titles.indexOf(String(v[0])) < 0) return;
      const c = String(v[7]).trim(), p = Number(String(v[8]).replace(/[^0-9]/g, '')) || 0;
      if (!c || !p) return;
      cnt[c + '|' + p] = (cnt[c + '|' + p] || 0) + 1;
      if (!out[c] || cnt[c + '|' + p] > cnt[c + '|' + out[c]]) out[c] = p;
    });
  } catch (e) {}
  return out;
}
// 진행목록 '가격' 칸 → 숫자 목록. 예전 의뢰는 '17, 200, 23, 400'처럼 쉼표가 갈라져 저장돼서 세 자리 조각은 앞 숫자에 붙임
function runPrices_(s) {
  const out = [];
  let short = false;
  String(s || '').split(/[,\s]+/).filter(Boolean).forEach(function (t) {
    t = t.replace(/[^0-9]/g, '');
    if (!t) return;
    if (t.length === 3 && out.length && short) { out[out.length - 1] = out[out.length - 1] * 1000 + Number(t); short = false; return; }
    out.push(Number(t)); short = t.length <= 3;
  });
  return out.filter(function (n) { return n >= 100; });
}

// 최근 30일 의뢰의 명단 시트도 값 명단으로 바꾸고 새 응답 붙이기 (15분 확인에서 안 보는 끝난 진행용, 시트마다 25분에 한 번)
function listTabsRecent_(runs, skip) {
  const cut = Date.now() - 30 * 86400000, ids = [];
  runs.forEach(function (r) { const sid = String(r['시트ID'] || ''); if (sid && !skip[sid] && ids.indexOf(sid) === -1 && r['진행일'] instanceof Date && r['진행일'].getTime() >= cut) ids.push(sid); });
  const props = PropertiesService.getScriptProperties();
  ids.forEach(function (sid) {
    if (late_(270)) return;
    const k = 'LISTAT_' + sid;
    if (runs.some(function (x) { return String(x['시트ID']) === sid && x['실배송'] === 'Y'; })) props.setProperty('LISTREAL_' + sid, '1');
    if (Date.now() - Number(props.getProperty(k) || 0) < 25 * 60000) return;
    props.setProperty(k, String(Date.now()));
    try {
      const lss = SpreadsheetApp.openById(sid);
      if (fixListRef_(lss)) note_('✓ 명단 탭을 값으로 바꿈: ' + lss.getName());
      else syncList_(lss);
    } catch (e) { note_('명단 탭 값으로 바꾸기 실패 ' + sid + ': ' + e); }
  });
}

// 진행목록에 없는 폼(지운 진행의 폼 등)에 응답이 들어오면: 같은 상품(공지의 상품번호나 상품명)으로 진행 중인 진행이 있으면
//  그 폼 응답을 그 진행의 명단 시트로 연결(지금까지 응답도 같이 들어감, 명단·한눈에·인원에 바로 보임), 없으면 메일로 알림
//  예) 진행을 지우고 다시 만들었는데 카톡방에는 옛 공지(옛 폼 링크)가 나가 있을 때. 30분마다
function adoptOrphanForms_(runs) {
  const props = PropertiesService.getScriptProperties();
  if (Date.now() - Number(props.getProperty('ORPHAN_AT') || 0) < 30 * 60000) return;
  props.setProperty('ORPHAN_AT', String(Date.now()));
  const known = {};
  runs.forEach(function (r) { if (r['폼ID']) known[String(r['폼ID'])] = 1; });
  const pnos = function (d) { const out = []; String(d || '').split('\n').forEach(function (l) { if (/상품\s*번호/.test(l)) (l.match(/\d{8,}/g) || []).forEach(function (x) { out.push(x); }); }); return out; };
  const names = function (d) { return noticeProducts_(d).map(function (p) { return String(p.name || '').replace(/\s+/g, ''); }).filter(Boolean); };
  const live = runs.filter(function (r) { return r['진행 상태'] !== '종료' && r['폼ID'] && r['시트ID'] && r['진행일'] instanceof Date; }).map(function (r) {
    let d = ''; try { d = FormApp.openById(r['폼ID']).getDescription(); } catch (e) {}
    return { r: r, nums: pnos(d), names: names(d) };
  });
  if (!live.length) return;
  const since = Date.now() - 10 * 86400000, me = Session.getEffectiveUser().getEmail();
  const it = rootFolder_().getFolders();
  while (it.hasNext()) {
    const fo = it.next();
    if (fo.getLastUpdated().getTime() < since) continue;
    const fi = fo.getFilesByType(MimeType.GOOGLE_FORMS);
    while (fi.hasNext()) {
      const file = fi.next(), fid = file.getId();
      if (known[fid] || file.isTrashed()) continue;
      let form, cnt = 0;
      try { form = FormApp.openById(fid); cnt = form.getResponses().length; } catch (e) { continue; }
      if (!cnt) continue;
      const d = form.getDescription(), nums = pnos(d), nms = names(d), made = file.getDateCreated().getTime();
      const hit = live.filter(function (x) {
        return nums.some(function (n) { return x.nums.indexOf(n) !== -1; }) || (!nums.length && nms.some(function (n) { return x.names.indexOf(n) !== -1; }));
      }).sort(function (a, b) { return Math.abs(a.r['진행일'].getTime() - made) - Math.abs(b.r['진행일'].getTime() - made); })[0];
      if (!hit) {
        if (!props.getProperty('ORPHANMAIL_' + fid)) {
          props.setProperty('ORPHANMAIL_' + fid, '1');
          MailApp.sendEmail(me, '[체험단] 진행목록에 없는 폼에 응답이 들어왔어요: ' + form.getTitle(), '폼 \'' + form.getTitle() + '\'에 응답 ' + cnt + '개가 있어요. 진행목록에는 없는 폼이라 명단·한눈에 탭에 안 보여요.\n카톡방 공지에 옛 폼 링크가 나가 있는지 확인해 주세요.\n폼: ' + file.getUrl());
          note_('진행목록에 없는 폼에 응답 ' + cnt + '개: ' + form.getTitle());
        }
        continue;
      }
      const sid = String(hit.r['시트ID']);
      let dest = ''; try { dest = form.getDestinationId(); } catch (e) {}
      if (dest === sid) continue;
      form.setDestination(FormApp.DestinationType.SPREADSHEET, sid);
      SpreadsheetApp.flush();
      const ok = 'ORPHANS_' + sid, list = String(props.getProperty(ok) || '').split(',').filter(Boolean);
      if (list.indexOf(fid) === -1) { list.push(fid); props.setProperty(ok, list.join(',')); }
      note_('✓ 옛 폼 \'' + form.getTitle() + '\' 응답 ' + cnt + '개를 ' + bareTitle_(hit.r['명단 제목']) + ' 명단 시트로 가져옴');
      MailApp.sendEmail(me, '[체험단] 옛 폼 응답을 새 명단 시트로 가져왔어요: ' + bareTitle_(hit.r['명단 제목']),
        '카톡방에 옛 공지(옛 폼 링크)가 나가 있었던 것 같아요.\n옛 폼 \'' + form.getTitle() + '\'에 들어온 응답 ' + cnt + '개를 ' + bareTitle_(hit.r['명단 제목']) + ' 명단 시트로 연결했어요. 앞으로 옛 링크로 들어오는 응답도 이 명단 시트에 들어가고, 명단이 다 차면 같이 닫혀요.\n카톡방 공지는 새 공지(새 폼 링크)로 바꿔 두는 게 좋아요.');
    }
  }
}

// (10/23 한 번만) 옛 이름 '#10.22 실 발목무압박기모양말외5' 진행이 진행목록에 남아서 월급시트에 줄이 다시 생김 (같은 날 '#10.22 실 오즈네즈 양말 담요5'가 진짜).
//  옛 이름 진행만 '종료'(폼·명단 시트는 그대로) + 월급시트 그 줄 지움
function fixAnkleDupOnce_(runs) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('ANKLEDUP_V1')) return;
  props.setProperty('ANKLEDUP_V1', '1');
  const md = function (r) { return r['진행일'] instanceof Date ? Utilities.formatDate(r['진행일'], CONFIG.TIMEZONE, 'MMdd') : ''; };
  const good = runs.filter(function (r) { return /오즈네즈/.test(String(r['명단 제목'])) && r['진행 상태'] !== '종료'; });
  runs.filter(function (r) { return /발목무압박/.test(String(r['명단 제목'])) && r['진행 상태'] !== '종료'; }).forEach(function (r) {
    if (!good.some(function (g) { return md(g) === md(r); })) return;
    setRun_(r.row, '진행 상태', '종료');
    note_('✓ 옛 이름 진행 종료: ' + bareTitle_(r['명단 제목']));
  });
  try {
    payTabsNow_().forEach(function (sh) {
      const L = payLayout_(sh); if (!L) return;
      const last = sh.getLastRow(); if (last <= L.head) return;
      const v = sh.getRange(L.head + 1, L.name, last - L.head, 1).getValues().map(function (x) { return String(x[0]).replace(/\s+/g, ''); });
      const has = function (d) { return v.some(function (x) { return x.indexOf(d) >= 0 && /오즈네즈/.test(x); }); };
      v.map(function (x, i) { return { x: x, i: i }; }).filter(function (o) { const d = (o.x.match(/\d{1,2}\.\d{1,2}/) || [''])[0]; return /발목무압박/.test(o.x) && d && has(d); })
        .reverse().forEach(function (o) { note_('✓ 월급시트 옛 이름 줄 지움: ' + o.x); sh.deleteRow(L.head + 1 + o.i); });
    });
  } catch (e) { note_('월급시트 옛 이름 줄 지우기 실패: ' + e); }
}
// (10/23 한 번만) 실링팬: 10/26(월)부터 하루 2명 (사용자 요청)
function fixCeilingOnce_(runs) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('CEIL2_V1')) return;
  const rs = runs.filter(function (r) { return /실링팬/.test(String(r['명단 제목'])) && r['진행일'] instanceof Date; }).sort(function (a, b) { return a['진행일'] - b['진행일']; });
  if (!rs.length) return;
  props.setProperty('CEIL2_V1', '1');
  note_(changeDaily_(rs[rs.length - 1], new Date(2026, 9, 26), 2));
}
// (10/23 한 번만) 양모볼 폼 옵션 오타 '모던 오렍비' → '모던 오렌지' (폼 + 안 보낸 방 공지)
function fixOrangeOnce_(runs) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('ORANGE_V1')) return;
  props.setProperty('ORANGE_V1', '1');
  runs.filter(function (r) { return r['폼ID'] && /양모볼/.test(String(r['명단 제목'])) && r['진행 상태'] !== '종료'; }).forEach(function (r) {
    try {
      const f = FormApp.openById(r['폼ID']);
      f.getItems(FormApp.ItemType.MULTIPLE_CHOICE).forEach(function (it) {
        const mc = it.asMultipleChoiceItem(), ch = mc.getChoices().map(function (c) { return c.getValue(); });
        if (ch.some(function (c) { return /오렍비/.test(c); })) { mc.setChoiceValues(ch.map(function (c) { return c.replace(/오렍비/g, '오렌지'); })); note_('✓ 양모볼 폼 오타 고침: 오렍비 → 오렌지'); }
      });
      if (/오렍비/.test(f.getDescription())) f.setDescription(f.getDescription().replace(/오렍비/g, '오렌지'));
    } catch (e) { note_('양모볼 폼 오타 실패: ' + e); }
  });
  try {
    const ob = outboxSheet_(), ol = ob.getLastRow();
    if (ol >= 2) ob.getRange(2, 1, ol - 1, 6).getValues().forEach(function (v) { if (v[5] !== '보냄' && /오렍비/.test(String(v[4]))) obSet_(ob, v[0], 5, String(v[4]).replace(/오렍비/g, '오렌지')); });
  } catch (e) {}
}
// (10/22 한 번만) 양모볼 폼: '목보호대 소프트그레이 L 남성용, M 여성용 리뷰어 선택' → 옵션 2개로, '리뷰어 선택' 빼기 (폼 + 안 보낸 방 공지)
function fixNeckOptOnce_(runs) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('NECKOPT_V1')) return;
  props.setProperty('NECKOPT_V1', '1');
  const bad = /리뷰어\s*선택/;
  runs.filter(function (r) { return r['폼ID'] && /양모볼/.test(String(r['명단 제목'])) && r['진행 상태'] !== '종료'; }).forEach(function (r) {
    try {
      FormApp.openById(r['폼ID']).getItems(FormApp.ItemType.MULTIPLE_CHOICE).forEach(function (it) {
        const mc = it.asMultipleChoiceItem(), ch = mc.getChoices().map(function (c) { return c.getValue(); });
        if (!ch.some(function (c) { return bad.test(c); })) return;
        const out = [];
        ch.forEach(function (c) {
          if (!bad.test(c)) { out.push(c); return; }
          const pr = (c.match(/\s*\([0-9,]+\s*원\)\s*$/) || [''])[0];
          out.push('목보호대 소프트그레이 L 남성용' + pr, '목보호대 소프트그레이 M 여성용' + pr);
        });
        mc.setChoiceValues(out);
        note_('✓ 양모볼 폼 옵션 나눔: ' + out.join(' / '));
      });
    } catch (e) { note_('양모볼 폼 옵션 실패: ' + e); }
  });
  try {
    const ob = outboxSheet_(), ol = ob.getLastRow();
    if (ol >= 2) ob.getRange(2, 1, ol - 1, 6).getValues().forEach(function (v) {
      if (v[5] !== '보냄' && /소프트그레이 L 남성용, M 여성용 리뷰어 선택/.test(String(v[4]))) obSet_(ob, v[0], 5, String(v[4]).split('소프트그레이 L 남성용, M 여성용 리뷰어 선택').join('소프트그레이 L 남성용 / 소프트그레이 M 여성용'));
    });
  } catch (e) {}
}
// (10/22 한 번만) 과일 방제에 업체명: '#택10.22 대봉감 30' → '#택10.22 노티아 대봉감 30'. 진행목록·배정·보낼메시지·월급시트·일정·명단 시트·폼·폴더 이름. 카톡방은 사용자가 바꿈
function fixDaebongOnce_(runs) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('DAEBONG_V1')) return;
  props.setProperty('DAEBONG_V1', '1');
  const fix = function (t) { return String(t).replace(/(^|\s)대봉감/, '$1노티아 대봉감'); }, done = {};
  runs.filter(function (r) { const b = bareTitle_(r['명단 제목']); return r['진행 상태'] !== '종료' && /대봉감/.test(b) && !/노티아/.test(b); }).forEach(function (r) {
    const nt = fix(bareTitle_(r['명단 제목']));
    try { renameRun_(r, nt); note_('✓ 이름 바꿈: ' + nt); } catch (e) { note_('대봉감 이름 실패: ' + e); }
    const nm = sheetName_(nt);
    const ren = function (get, set) { try { if (String(get()) !== nm) set(nm); } catch (e) {} };
    const sid = String(r['시트ID'] || ''), fid = String(r['폼ID'] || ''), fo = (String(r['폴더 링크'] || '').match(/[-\w]{25,}/) || [])[0];
    if (sid && !done[sid]) { done[sid] = 1; const f = DriveApp.getFileById(sid); ren(function () { return f.getName(); }, function (n) { f.setName(n); }); }
    if (fid && !done[fid]) { done[fid] = 1; const fm = FormApp.openById(fid), ff = DriveApp.getFileById(fid); ren(function () { return fm.getTitle(); }, function (n) { fm.setTitle(n); }); ren(function () { return ff.getName(); }, function (n) { ff.setName(n); }); }
    if (fo && !done[fo]) { done[fo] = 1; const d = DriveApp.getFolderById(fo); ren(function () { return d.getName(); }, function (n) { d.setName(n); }); }
  });
  try {
    const ps = planSheet_(), pl = ps.getLastRow();
    if (pl >= 2) ps.getRange(2, 1, pl - 1, 6).getValues().forEach(function (v, i) {
      if (/대봉감/.test(String(v[5])) && !/노티아/.test(String(v[5]))) ps.getRange(i + 2, 2, 1, 5).setValues([[fix(v[1]), v[2], v[3], fix(v[4]), fix(v[5])]]);
    });
  } catch (e) {}
}
// (10/19 한 번만) 진행 중인 실배송 진행의 이름을 새 모양으로: '#10.19 런치버스 텀블러 실 7' → '#10.19 실 런치버스 텀블러 7'
//  진행목록 명단 제목·카톡방, 배정 탭, 보낼메시지(대기) 방 이름, 일정 탭(대기), 명단 시트·폼·폴더 이름. 이미 만든 카톡방 이름은 사용자가 바꿈
function fixSilOnce_(runs) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('SILPOS_V1')) return;
  props.setProperty('SILPOS_V1', '1');
  const old = /\s실\s+\d+\s*$/, done = {}, log = [];
  runs.filter(function (r) { return r['진행 상태'] !== '종료' && old.test(bareTitle_(r['명단 제목'])); }).forEach(function (r) {
    const nt = withSil_(bareTitle_(r['명단 제목']));
    try { if (renameRun_(r, nt)) log.push(nt); } catch (e) { note_('실 위치 바꾸기 실패 ' + r['명단 제목'] + ': ' + e); }
    const nm = sheetName_(nt);
    const ren = function (get, set) { try { if (String(get()) !== nm) set(nm); } catch (e) {} };
    const sid = String(r['시트ID'] || ''), fid = String(r['폼ID'] || ''), fo = (String(r['폴더 링크'] || '').match(/[-\w]{25,}/) || [])[0];
    if (sid && !done[sid]) { done[sid] = 1; const f = DriveApp.getFileById(sid); ren(function () { return f.getName(); }, function (n) { f.setName(n); }); }
    if (fid && !done[fid]) { done[fid] = 1; const fm = FormApp.openById(fid), ff = DriveApp.getFileById(fid); ren(function () { return fm.getTitle(); }, function (n) { fm.setTitle(n); }); ren(function () { return ff.getName(); }, function (n) { ff.setName(n); }); }
    if (fo && !done[fo]) { done[fo] = 1; const d = DriveApp.getFolderById(fo); ren(function () { return d.getName(); }, function (n) { d.setName(n); }); }
  });
  try {
    const ps = planSheet_(), pl = ps.getLastRow();
    if (pl >= 2) ps.getRange(2, 1, pl - 1, 9).getValues().forEach(function (v, i) {
      if (v[8] !== '대기') return;
      [4, 5].forEach(function (c) { const t = String(v[c]); const b = bareTitle_(t); if (old.test(b)) ps.getRange(i + 2, c + 1).setValue(withSil_(b) + t.slice(b.length)); });
    });
  } catch (e) {}
  if (log.length) note_('✓ 실 위치 바꿈: ' + log.join(', '));
}

function fixNoCountNamesOnce_(runs) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('NOCOUNT_V1')) return;
  const done = {}, log = [];
  runs.filter(function (r) { return r['진행 상태'] !== '종료'; }).forEach(function (r) {
    const ren = function (kind, get, set) {
      try { const cur = String(get()); const nw = noCount_(cur); if (nw && nw !== cur) { set(nw); log.push(kind + ': ' + cur + ' → ' + nw); } } catch (e) {}
    };
    const sid = String(r['시트ID'] || ''), fid = String(r['폼ID'] || '');
    if (sid && !done[sid]) { done[sid] = 1; const f = DriveApp.getFileById(sid); ren('명단 시트', function () { return f.getName(); }, function (n) { f.setName(n); }); }
    if (fid && !done[fid]) {
      done[fid] = 1;
      const fm = FormApp.openById(fid), ff = DriveApp.getFileById(fid);
      ren('폼 제목', function () { return fm.getTitle(); }, function (n) { fm.setTitle(n); });
      ren('폼 파일', function () { return ff.getName(); }, function (n) { ff.setName(n); });
    }
    const fo = (String(r['폴더 링크'] || '').match(/[-\w]{25,}/) || [])[0];
    if (fo && !done[fo]) { done[fo] = 1; const d = DriveApp.getFolderById(fo); ren('폴더', function () { return d.getName(); }, function (n) { d.setName(n); }); }
  });
  props.setProperty('NOCOUNT_V1', '1');
  if (log.length) note_('✓ 이름에서 인원 수 뺌 ' + log.length + '개');
}

// 공지(폼 설명)의 '🐥가격' 줄에서 가격만 뽑기
function pricesFromNotice_(text) {
  const out = []; let on = false;
  String(text || '').split('\n').forEach(function (l) {
    if (/^🐥가격/.test(l)) { on = true; l = l.replace(/^🐥가격\s*[:：]?/, ''); }
    else if (/^🐥|^\s*$|^-{5,}/.test(l)) on = false;
    if (on) (l.match(/\d{1,3}(?:,\d{3})+|\d{4,}/g) || []).forEach(function (x) { x = x.replace(/,/g, ''); if (out.indexOf(x) === -1) out.push(x); });
  });
  return out;
}

// 진행목록 빈칸 자동 채우기: 캠페인, 총건수(같은 캠페인에서), 가격(폼 공지에서), 날짜 모양
function normalizeRuns_() {
  const list = ensureListSheet_();
  formatList_(list);
  const runs = readRuns_();
  runs.forEach(function (r) {
    if (!String(r['캠페인']).trim() && r['명단 제목']) { r['캠페인'] = campOf_(r['명단 제목']); setRun_(r.row, '캠페인', r['캠페인']); }
    // 방제 끝 숫자 = 그날 목표 인원 (끝 숫자를 고치면 목표도 같이. 다 찼으면 조용히 마감 표시)
    const tm = bareTitle_(r['명단 제목']).match(/(\d+)\s*$/);
    if (tm && Number(tm[1]) > 0 && Number(r['목표인원']) !== Number(tm[1]) && r['진행 상태'] !== '종료' && !isExpect_(r)) {   // 기대평은 방제 끝이 건수
      r['목표인원'] = Number(tm[1]); setRun_(r.row, '목표인원', r['목표인원']);
      if (!r['마감 시각'] && Number(r['인원']) >= r['목표인원'] && pastEnd_(r)) setRun_(r.row, '마감 시각', new Date());
    }
    // 진행목록에서 명단 제목 끝 숫자를 고치면 카톡방도 같이
    const bt = bareTitle_(r['명단 제목']);
    if (bt && String(r['카톡방']).trim() && String(r['카톡방']).trim() !== bt && sameRunTitle_(r['카톡방'], bt)) { r['카톡방'] = bt; setRun_(r.row, '카톡방', bt); }
    // 진행목록 '시트 링크'를 직접 바꾸면 그 시트를 씀
    const m = String(r['시트 링크'] || '').match(/\/d\/([-\w]{25,})/);
    if (m && m[1] !== String(r['시트ID'])) { r['시트ID'] = m[1]; setRun_(r.row, '시트ID', m[1]); }
  });
  // 업체, 구매시간, 포토가 비었으면 폼 공지(설명)에서 채움 → 월급시트 스토어, 진행시간, 특이사항에 씀
  // (10/23 정리) 폼을 여는 건 느려서 같은 진행은 6시간에 한 번만 (포토 칸처럼 공지에서 못 찾는 칸이 있으면 매번 폼을 열었음)
  const fcache = CacheService.getScriptCache();
  runs.forEach(function (r) {
    if (!r['폼ID'] || r['진행 상태'] === '종료' || (String(r['업체']).trim() && String(r['구매시간']).trim() && String(r['포토']).trim())) return;
    if (fcache.get('NF_' + r['폼ID'] + '_' + r.row)) return;
    fcache.put('NF_' + r['폼ID'] + '_' + r.row, '1', 21600);
    let desc = '';
    try { desc = FormApp.openById(r['폼ID']).getDescription() || ''; } catch (e) { return; }
    if (!String(r['업체']).trim()) {
      const p = noticeProducts_(desc)[0];
      const shop = p ? p.shop : (desc.match(/판매처\s*[:：]\s*(.+)/) || ['', ''])[1].replace(/판매자\s*[:：]?|주식회사|\(주\)|㈜|\s+/g, '');
      if (shop) { r['업체'] = shop; setRun_(r.row, '업체', shop); }
    }
    if (!String(r['구매시간']).trim()) {
      const slot = runSlot_(r).replace(/★/g, '').trim();
      if (slot) { r['구매시간'] = slot; setRun_(r.row, '구매시간', slot); }
    }
    if (!String(r['포토']).trim()) {
      const m = desc.match(/포토[^\n]{0,12}?(없음|미제공|무|있음|제공|유|필수)/);
      if (m) { r['포토'] = /없음|미제공|무/.test(m[1]) ? '무' : '유'; setRun_(r.row, '포토', r['포토']); }
    }
  });
  // 의뢰서 하나 = 명단 시트 하나: 같은 의뢰(총건수가 있는 묶음)의 날들은 첫 날 명단 시트로 모음
  //  (폼은 날마다 달라도 됨. 15분 확인에서 폼 응답이 이 시트로 가게 연결하고 명단 탭이 합쳐 보여 줌)
  chainsOf_(runs).forEach(function (c) {
    if (!c.total) return;
    const first = c.runs.filter(function (x) { return x['시트ID']; })[0];
    if (!first) return;
    c.runs.forEach(function (r) {
      if (!r['시트ID'] || String(r['시트ID']) === String(first['시트ID'])) return;
      r['시트ID'] = first['시트ID']; setRun_(r.row, '시트ID', first['시트ID']);
      r['시트 링크'] = first['시트 링크']; setRun_(r.row, '시트 링크', first['시트 링크']);
    });
  });
  // 일차 바로잡기: 2일차를 1일차로 만들었어도 같은 의뢰의 순서대로 1, 2, 3...
  //  업체, 포토, 업체방이 빈 날은 같은 의뢰 다른 날 값으로 채움 (추가 모집 등)
  chainsOf_(runs).forEach(function (c) {
    c.runs.forEach(function (r, i) { if (Number(r['일차']) !== i + 1) { r['일차'] = i + 1; setRun_(r.row, '일차', i + 1); } });
    ['업체', '포토', '업체방'].forEach(function (h) {
      const v = (c.runs.filter(function (x) { return String(x[h]).trim(); })[0] || {})[h];
      if (v) c.runs.forEach(function (r) { if (!String(r[h]).trim()) { r[h] = v; setRun_(r.row, h, v); } });
    });
  });
  const key = function (r) { return String(r['캠페인']).replace(/\d+\s*$/, '').replace(/\s+/g, ''); };
  runs.forEach(function (r) {
    if (!Number(r['총건수'])) {
      const t = runs.filter(function (x) { return key(x) === key(r) && Number(x['총건수']); }).map(function (x) { return Number(x['총건수']); })[0];
      if (t) setRun_(r.row, '총건수', t);
    }
    const pv = String(r['가격']);
    if (r['폼ID'] && r['진행 상태'] !== '종료' && (!/^\d{3,}(\s*,\s*\d{3,})*$/.test(pv) || /e\+/i.test(pv)) && !fcache.get('NP_' + r['폼ID'] + '_' + r.row)) {
      fcache.put('NP_' + r['폼ID'] + '_' + r.row, '1', 21600);
      try {
        const ps = pricesFromNotice_(FormApp.openById(r['폼ID']).getDescription());
        if (ps.length) setRun_(r.row, '가격', ps.join(', '));
      } catch (e) {}
    }
    // '택배 옮김' 체크칸은 택대 진행만 (택배시트에 옮길 게 없는 진행은 빈칸)
    const tc = ensureListSheet_().getRange(r.row, lc_('택배 옮김'));
    if (r['택대'] === 'Y') { if (!tc.getDataValidation()) tc.insertCheckboxes(); }
    else if (tc.getDataValidation() || tc.getValue() !== '') { tc.clearDataValidations(); tc.clearContent(); }
  });
  sortList_();
}

function today_() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }

// 진행일이 오늘보다 뒤면 '진행예정', 아니면 '진행중' (종료는 그대로)
function statusFor_(day) { return (day instanceof Date && day > today_()) ? '진행예정' : '진행중'; }

// 명단 제목의 "10.15"에서 진행일 추정 (예전 행용)
function dayFromTitle_(title) {
  const m = String(title || '').match(/(\d{1,2})\.(\d{1,2})/);
  if (!m) return '';
  const t = today_(), d = new Date(t.getFullYear(), Number(m[1]) - 1, Number(m[2]));
  if (d - t > 180 * 864e5) d.setFullYear(d.getFullYear() - 1);
  return d;
}

// 날짜 칸 모양 통일: 등록일, 진행일은 2026-10-14, 마감 시각은 10/14 10:02, 가격은 글자 그대로
function formatList_(sh) {
  const n = sh.getMaxRows() - 1;
  sh.getRange(2, lc_('등록일'), n, 1).setNumberFormat('yyyy-mm-dd');
  sh.getRange(2, lc_('진행일'), n, 1).setNumberFormat('yyyy-mm-dd');
  sh.getRange(2, lc_('마감 시각'), n, 1).setNumberFormat('M/d HH:mm');
  sh.getRange(2, lc_('리뷰 취합'), n, 2).setNumberFormat('M/d');   // 리뷰 취합·업체 전송 = 체크한 날 (한눈에 탭 '리뷰 취합할 것'에서 체크)
  sh.getRange(2, lc_('가격'), n, 1).setNumberFormat('@');
  // 보기 좋게: 가운데 맞춤, 명단 제목·링크는 왼쪽
  sh.getRange(1, 1, n + 1, LIST_HEADER.length).setHorizontalAlignment('center').setVerticalAlignment('middle');
  ['명단 제목', '캠페인', '카톡방', '업체방', '폼 링크', '시트 링크', '폴더 링크'].forEach(function (h) { sh.getRange(2, lc_(h), n, 1).setHorizontalAlignment('left'); });
  sh.getRange(2, lc_('진행 상태'), n, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['진행예정', '진행중', '종료'], true).build());
  // 실배송 줄은 노란색: 줄 순서가 바뀌거나 자동으로 만든 다음 일차 줄도 빠짐없이 (조건부 서식)
  const f = '=$' + colLetter_(lc_('실배송')) + '2="Y"';
  const keep = (sh.getConditionalFormatRules() || []).filter(function (r) { const c = r.getBooleanCondition(); return !(c && String((c.getCriteriaValues() || [])[0]) === f); });
  keep.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(f).setBackground('#fff2a8').setRanges([sh.getRange(2, 1, n, LIST_HEADER.length)]).build());
  sh.setConditionalFormatRules(keep);
}

/* ---------------- 메뉴 ---------------- */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('체험단 도구')
    .addItem('새 진행 만들기', 'showNewDialog')
    .addItem('선택한 진행 명단 양식 적용', 'reformatSelected')
    .addItem('지금 현황 업데이트', 'dailyCheck')
    .addItem('지금 명단 마감 확인', 'checkFull')
    .addItem('폼수정 탭 만들기 (응답 삭제)', 'setupEditTab')
    .addItem('월급시트 칩 오류 보기', 'showChipError')
    .addItem('한눈에 탭 새로 만들기', 'rebuildDashboard')
    .addSeparator()
    .addItem('지금 최신 버전으로 업데이트', 'updateNow')
    .addSeparator()
    .addItem('매일 알림 켜기', 'installDailyTrigger')
    .addItem('매일 알림 끄기', 'removeDailyTrigger')
    .addToUi();
  ensureListSheet_();
}

function showNewDialog() {
  const html = HtmlService.createHtmlOutput(DIALOG_HTML + '<script>window.__K=' + JSON.stringify(CONFIG.KEY) + ';</' + 'script>').setWidth(460).setHeight(560);
  SpreadsheetApp.getUi().showModalDialog(html, '새 진행 만들기');
}

const DIALOG_HTML = `
<style>
  body{font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif;font-size:13px;margin:0;padding:4px 2px}
  label{display:block;margin:10px 0 4px;color:#555;font-weight:600}
  input[type=text],select,textarea{width:100%;box-sizing:border-box;padding:7px;border:1px solid #ccc;border-radius:4px;font:inherit}
  textarea{height:150px}
  .row{display:flex;gap:14px;margin-top:10px}
  .row label{display:flex;align-items:center;gap:5px;margin:0;font-weight:400;color:#222}
  button{margin-top:14px;padding:9px 16px;background:#5b2a86;color:#fff;border:0;border-radius:4px;font:inherit;cursor:pointer}
  #msg{margin-top:10px;white-space:pre-wrap}
  #done textarea{height:220px;margin-top:6px}
</style>
<div id="auto" style="display:none;font-size:15px;line-height:1.6"></div>
<div id="fields">
<label>명단 제목 (생성기의 '명단 제목' 붙여넣기)</label>
<input type="text" id="title" placeholder="택대 # 10.14 머루포도 15 닉네임">
<label>목표 인원 (이만큼 신청이 차면 폼을 자동으로 닫음, 비우면 안 닫음)</label>
<input type="text" id="daily" inputmode="numeric">
<label>유형</label>
<select id="type"><option value="입대">입금대행 (#)</option><option value="업체입금">업체입금 (업)</option></select>
<div class="row">
  <label><input type="checkbox" id="takdae"> 택배대행</label>
  <label><input type="checkbox" id="realship"> 실배송</label>
</div>
<label>플랫폼</label>
<select id="platform"><option>쿠팡</option><option>네이버</option><option>11번가</option><option>옥션</option><option>G마켓</option><option>위메프</option><option>GS SHOP</option><option>알리익스프레스</option><option>오늘의집</option><option>기타</option></select>
<label>폼 설명 (생성기의 '방 공지' 붙여넣기, 선택)</label>
<textarea id="desc"></textarea>
<button id="go" onclick="go()">만들기</button>
</div>
<div id="done" style="display:none"><label>완성된 카톡 공지 (폼 링크 들어감)</label><textarea id="notice" readonly></textarea><button onclick="cp('notice')">공지 복사</button>
<label>명단방에 보낼 문구 (폼 명단 다 받으면)</label><textarea id="listmsg" readonly style="height:90px"></textarea><button onclick="cp('listmsg')">명단 문구 복사</button></div>
<div id="msg"></div>
<script>
function cp(id){var t=document.getElementById(id||'notice');t.select();
  (navigator.clipboard?navigator.clipboard.writeText(t.value):Promise.reject()).then(function(){},function(){document.execCommand('copy');});
  document.getElementById('msg').textContent=id==='listmsg'?'명단 문구를 복사했어요. 명단방에 붙여넣으세요.':'공지를 복사했어요. 카톡방 공지에 붙여넣으세요.';}
function go(){
  var d={daily:document.getElementById('daily').value.trim(),title:document.getElementById('title').value.trim(),type:document.getElementById('type').value,
    takdae:document.getElementById('takdae').checked,realship:document.getElementById('realship').checked,
    platform:document.getElementById('platform').value,desc:document.getElementById('desc').value,fname:window.__FNAME||'',k:window.__K||'',n:window.__N||'',opts:window.__OPTS||'',shop:window.__SHOP||'',slot:window.__SLOT||'',photo:window.__PHOTO||'',date:window.__DATE||'',plan:window.__PLAN||'',slot2:window.__SLOT2||'',day:window.__DAY||'',total:window.__TOTAL||'',room:window.__ROOM||'',croom:window.__CROOM||'',rv:window.__RV||'',cart:window.__CART||''};
  if(!d.title){document.getElementById('msg').textContent='명단 제목을 넣어 주세요.';return;}
  document.getElementById('go').disabled=true;
  var t0=Date.now(),tick=function(){var s=Math.round((Date.now()-t0)/1000);document.getElementById('msg').textContent='만드는 중이에요… '+s+'초\\n(보통 30초~1분. 15분 자동 확인이 돌고 있으면 그게 멈출 때까지 1~2분 더 걸릴 수 있어요. 창을 닫지 마세요)';};
  tick();var timer=setInterval(tick,1000);
  google.script.run.withSuccessHandler(function(r){
    clearInterval(timer);
    if(!r){document.getElementById('fields').style.display='block';document.getElementById('go').disabled=false;document.getElementById('msg').textContent='실패: 응답이 비어 있어요. 다시 눌러 주세요.';return;}
    document.getElementById('fields').style.display='none';
    document.getElementById('auto').textContent=(r.again?'이미 만든 진행이에요: ':'만들었어요: ')+d.title;
    if(r.notice){document.getElementById('notice').value=r.notice;}
    document.getElementById('listmsg').value=r.sheetUrl+'\\n\\n'+d.title;
    document.getElementById('done').style.display='block';
    document.getElementById('msg').textContent=(r.assign?r.assign+'\\n':'')+'\\n폼 응답자 링크:\\n'+r.formUrl+'\\n\\n시트: '+r.sheetUrl+'\\n폴더: '+r.folderUrl+'\\n\\n진행목록에도 기록했어요.';
  }).withFailureHandler(function(e){
    clearInterval(timer);
    document.getElementById('fields').style.display='block';
    document.getElementById('go').disabled=false;
    document.getElementById('msg').textContent='실패: '+e.message;
  }).createRun(d);
}
function autoGo(){
  if(!window.__AUTO)return;
  document.getElementById('fields').style.display='none';
  var a=document.getElementById('auto');a.style.display='block';
  a.textContent='새 진행을 만들고 있어요: '+document.getElementById('title').value;
  go();
}
</script>`;

// (읽기만) 진행마다 리뷰 확인 체크가 몇 개 됐는지 = reviewDone_와 같은 방법으로 셈 (한눈에 '리뷰 취합할 것'에 왜 안 뜨는지 보기)
function rvExplain_() {
  const props = PropertiesService.getScriptProperties(), runs = readRuns_(), cut = today_().getTime() - 40 * 86400000, out = [], bySheet = {};
  runs.forEach(function (r) { if (r['시트ID'] && !isExpect_(r) && r['진행일'] instanceof Date && r['진행일'].getTime() >= cut) (bySheet[r['시트ID']] = bySheet[r['시트ID']] || []).push(r); });
  Object.keys(bySheet).forEach(function (sid) {
    const mine = bySheet[sid].sort(function (a, b) { return a['진행일'] - b['진행일']; });
    const o = { sheet: sid.slice(0, 10), runs: mine.map(function (r) { return bareTitle_(r['명단 제목']); }), listv: !!props.getProperty('LISTV_' + sid) };
    // 의뢰 폴더(진행목록 '폴더 링크')와 그 안 '리뷰이미지' 폴더에 사진이 어떻게 들어 있는지 (읽기만)
    try {
      const fl = (String((mine.filter(function (x) { return x['폴더 링크']; })[0] || {})['폴더 링크'] || '').match(/[-\w]{25,}/) || [])[0];
      if (fl) {
        const fo = DriveApp.getFolderById(fl), names = function (it) { const a = []; while (it.hasNext()) a.push(it.next().getName()); return a; };
        const imgs = function (f) { let n = 0; const it = f.getFiles(); while (it.hasNext()) if (/^image\//.test(it.next().getMimeType())) n++; return n; };
        const sp = [], spIt = DriveApp.getFileById(sid).getParents(); while (spIt.hasNext()) sp.push(spIt.next().getName());
        o.folder = { name: fo.getName(), up: names(fo.getParents()), sub: names(fo.getFolders()), files: names(fo.getFiles()), sheetName: DriveApp.getFileById(sid).getName(), sheetIn: sp };
        const ri = fo.getFoldersByName(RV_IMG_FOLDER);
        if (ri.hasNext()) { const rf = ri.next(), subs = [], si = rf.getFolders(); while (si.hasNext()) { const x = si.next(), kinds = {}, fi = x.getFiles(), ff = x.getFolders(), inner = []; while (fi.hasNext()) { const m = fi.next().getMimeType(); kinds[m] = (kinds[m] || 0) + 1; } while (ff.hasNext()) { const y = ff.next(); inner.push(y.getName() + ' ' + imgs(y) + '장'); } subs.push(x.getName() + ' ' + imgs(x) + '장 ' + JSON.stringify(kinds) + (inner.length ? ' 안쪽 폴더: ' + inner.join(', ') : '')); } o.folder.rvImg = { direct: imgs(rf), subs: subs }; }
        // 의뢰 폴더 안 모든 폴더(리뷰캡처 등)의 사진 수 (3단계까지, 읽기만)
        const tree = function (f, d) { const ch = [], it = f.getFolders(); if (d < 3) while (it.hasNext()) ch.push(tree(it.next(), d + 1)); return f.getName() + ' ' + imgs(f) + '장' + (ch.length ? ' [' + ch.join(', ') + ']' : ''); };
        o.folder.tree = []; const tf = fo.getFolders(); while (tf.hasNext()) o.folder.tree.push(tree(tf.next(), 0));
        // 날마다 폴더 링크가 다른 예전 진행 (그 폴더 이름과 안쪽 폴더)
        const seenF = {}; seenF[fl] = 1; o.folder.other = [];
        mine.forEach(function (x) { const id = (String(x['폴더 링크'] || '').match(/[-\w]{25,}/) || [])[0]; if (!id || seenF[id]) return; seenF[id] = 1; try { o.folder.other.push(bareTitle_(x['명단 제목']) + ': ' + tree(DriveApp.getFolderById(id), 0)); } catch (e) { o.folder.other.push(bareTitle_(x['명단 제목']) + ': ' + e); } });
        o.folder.zipKey = props.getProperty('RVZIP_' + sid) || '';
        // 압축 파일 안 모양 (폴더별 사진 수)
        const zi = fo.getFiles(); o.folder.zips = [];
        while (zi.hasNext()) { const z = zi.next(); if (!/\.zip$/i.test(z.getName())) continue; const dirs = {}; try { Utilities.unzip(z.getBlob()).forEach(function (b) { const d = String(b.getName()).indexOf('/') > 0 ? String(b.getName()).split('/')[0] : '(맨 위)'; dirs[d] = (dirs[d] || 0) + 1; }); } catch (e) { dirs.err = String(e); } o.folder.zips.push(z.getName() + ' ' + JSON.stringify(dirs)); }
      }
    } catch (e) { o.folderErr = String(e); }
    try {
      const sh = SpreadsheetApp.openById(sid).getSheetByName(LIST_TAB);
      if (!sh) { o.why = '명단 탭 없음'; out.push(o); return; }
      const lc = Math.max(sh.getLastColumn(), 1), hdr = sh.getRange(2, 1, 1, lc).getValues()[0].map(hk_), cT = hdr.indexOf('타임스탬프');
      if (cT < 0 || sh.getLastRow() < 3) { o.why = '타임스탬프 칸 없음/빈 시트'; out.push(o); return; }
      const v = sh.getRange(3, 1, sh.getLastRow() - 2, lc).getValues(), nt = sh.getRange(3, cT + 1, sh.getLastRow() - 2, 1).getNotes();
      const live = v.map(function (x, i) { return x[cT] instanceof Date && !nt[i][0] ? i : -1; }).filter(function (i) { return i >= 0; });
      const isChk = function (c) { return live.every(function (i) { return typeof v[i][c] === 'boolean'; }); };
      const rc = rvCol_(sh, lc); let cc = rc > 0 && isChk(rc - 1) ? rc - 1 : -1;
      for (let c = lc - 1; cc < 0 && c >= 0; c--) if (isChk(c)) cc = c;
      o.checkCol = cc >= 0 ? colLetter_(cc + 1) : '없음(모든 줄이 체크칸인 칸을 못 찾음)';
      o.days = mine.map(function (r) {
        const w = windowOf_(runs, r), rows = live.filter(function (i) { const t = v[i][cT].getTime(); return t >= w.from && t < w.to; });
        return bareTitle_(r['명단 제목']) + ': ' + rows.filter(function (i) { return cc >= 0 && v[i][cc] === true; }).length + '/' + rows.length + ' 체크, 마감=' + (r['마감 시각'] instanceof Date) + ', RVDONE=' + !!props.getProperty('RVDONE_' + String(r['명단 제목']).replace(/\s+/g, ''));
      });
    } catch (e) { o.why = String(e); }
    out.push(o);
  });
  return out;
}
// 읽기 전용 점검 데이터. 시트·폼·속성을 읽기만 함 (쓰기·정렬·트리거 변경 없음)
function diag_(p) {
  const tz = CONFIG.TIMEZONE, f = function (d, fmt) { return d instanceof Date ? Utilities.formatDate(d, tz, fmt || 'yyyy-MM-dd') : d; };
  const out = { now: f(new Date(), 'yyyy-MM-dd HH:mm:ss') };
  const days = Number(p.days || 10), cut = today_().getTime() - days * 86400000;
  try {
    out.runs = readRuns_().filter(function (r) { return p.all || r['진행 상태'] !== '종료' || (r['진행일'] instanceof Date && r['진행일'].getTime() >= cut); })
      .map(function (r) { return { row: r.row, title: r['명단 제목'], day: f(r['진행일']), k: r['일차'], target: r['목표인원'], got: r['인원'], st: r['진행 상태'], closed: f(r['마감 시각'], 'MM-dd HH:mm'), camp: r['캠페인'], total: r['총건수'], room: r['카톡방'], slot: r['구매시간'], form: String(r['폼 링크'] || ''), formId: String(r['폼ID'] || '').slice(0, 12), req: r['요청ID'], reg: f(r['등록일']), rvColl: f(r['리뷰 취합']), rvSend: f(r['업체 전송']) }; });
  } catch (e) { out.runsErr = String(e); }
  try {
    const ps = planSheet_(), pl = ps.getLastRow();
    out.plans = pl >= 2 ? ps.getRange(2, 1, pl - 1, PLAN_HEAD.length).getValues().filter(function (x) { return p.all || x[8] === '대기' || (x[3] instanceof Date && x[3].getTime() >= cut); })
      .map(function (x) { return { id: x[0], camp: x[1], k: x[2], day: f(x[3]), room: x[4], title: x[5], n: x[6], st: x[8] }; }) : [];
  } catch (e) { out.plansErr = String(e); }
  try {
    const ob = outboxSheet_(), ol = ob.getLastRow();
    out.outbox = ol >= 2 ? ob.getRange(2, 1, ol - 1, 6).getValues().map(function (x, i) {
      const link = (String(x[4]).match(/https:\/\/forms\.gle\/[\w-]+/) || [''])[0];
      return { r: i + 2, id: String(x[0]), idType: typeof x[0], send: x[1] instanceof Date ? f(x[1]) : String(x[1]), kind: x[2], room: x[3], st: x[5], link: link, head: String(x[4]).slice(0, p.full ? 5000 : 60) };
    }) : [];
  } catch (e) { out.outboxErr = String(e); }
  // 보낼메시지 B열에 수식·검증·필터가 있는지 (10/24 '포토전달대기'가 여러 줄에 퍼진 원인 찾기)
  try {
    const ob = outboxSheet_(), ol = ob.getLastRow(), fl = ob.getFilter();
    out.outboxSheet = { filter: fl ? fl.getRange().getA1Notation() : '', lastRow: ol, maxRows: ob.getMaxRows(), hiddenA: ob.isColumnHiddenByUser(1),
      bFormulas: ol >= 2 ? ob.getRange(2, 2, ol - 1, 1).getFormulas().map(function (x, i) { return x[0] ? (i + 2) + ':' + x[0] : ''; }).filter(Boolean).slice(0, 50) : [],
      bValidation: ol >= 2 ? ob.getRange(2, 2, ol - 1, 1).getDataValidations().map(function (x, i) { return x[0] ? (i + 2) + ':' + x[0].getCriteriaType() : ''; }).filter(Boolean).slice(0, 20) : [],
      bFormats: ol >= 2 ? ob.getRange(2, 2, ol - 1, 1).getNumberFormats().map(function (x) { return x[0]; }).filter(function (x, i, a) { return a.indexOf(x) === i; }) : [] };
    // 필터 조건(칸마다)과 필터·사용자가 숨긴 줄 (10/26 새 방 공지가 '안 보인다' 원인 찾기)
    if (fl) {
      const rg = fl.getRange(), c0 = rg.getColumn(), crit = [];
      for (let j = 0; j < rg.getNumColumns(); j++) { let k = null; try { k = fl.getColumnFilterCriteria(c0 + j); } catch (e) {} if (!k) continue; const o = { col: colLetter_(c0 + j) }; try { o.hidden = k.getHiddenValues(); } catch (e) {} try { o.visible = k.getVisibleValues(); } catch (e) {} try { o.type = String(k.getCriteriaType() || ''); o.values = (k.getCriteriaValues() || []).map(String); } catch (e) {} crit.push(o); }
      out.outboxSheet.criteria = crit;
    }
    const hid = [];
    for (let i = 2; i <= ol; i++) { const a = ob.isRowHiddenByFilter(i), u = ob.isRowHiddenByUser(i); if (a || u) hid.push(i + (a ? 'F' : '') + (u ? 'U' : '')); }
    out.outboxSheet.hiddenRows = hid;
  } catch (e) { out.outboxSheetErr = String(e); }
  // 보낼메시지 위쪽 칸 자세히 (값·수식·표시값·서식), 보호 범위, 병합, G~Z 수식 (10/24 정렬해도 B열 몇 칸만 '포토전달대기'로 남는 원인 찾기)
  try {
    const ob = outboxSheet_(), n = Math.min(ob.getLastRow(), Number(p.rows || 22)), rg = ob.getRange(1, 1, n, 6);
    const vv = rg.getValues(), ff = rg.getFormulas(), dd = rg.getDisplayValues(), nf = rg.getNumberFormats();
    out.cells = vv.map(function (row, i) { return (i + 1) + ' | ' + row.map(function (c, j) { return (ff[i][j] ? '{' + ff[i][j] + '}' : '') + (j === 4 ? String(dd[i][j]).slice(0, 15) : dd[i][j]) + (j === 1 ? ' <' + (c instanceof Date ? 'Date' : typeof c) + ',' + nf[i][j] + '>' : ''); }).join(' | '); });
    out.protections = ob.getProtections(SpreadsheetApp.ProtectionType.RANGE).map(function (x) { return x.getRange().getA1Notation() + (x.isWarningOnly() ? ' (경고만)' : '') + ' ' + x.getDescription(); })
      .concat(ob.getProtections(SpreadsheetApp.ProtectionType.SHEET).map(function (x) { return 'SHEET ' + (x.isWarningOnly() ? '(경고만)' : '') + ' ' + x.getDescription(); }));
    out.merged = ob.getRange(1, 1, Math.min(ob.getMaxRows(), 300), 26).getMergedRanges().map(function (x) { return x.getA1Notation(); });
    const gz = ob.getRange(1, 7, Math.min(ob.getMaxRows(), 300), 20).getFormulas(), gzl = [];
    gz.forEach(function (row, i) { row.forEach(function (c, j) { if (c && gzl.length < 20) gzl.push(String.fromCharCode(71 + j) + (i + 1) + ':' + c.slice(0, 120)); }); });
    out.formulasGZ = gzl;
    const af = ob.getRange(1, 1, Math.min(ob.getMaxRows(), 300), 1).getFormulas(), afl = [];
    af.forEach(function (row, i) { if (row[0] && afl.length < 10) afl.push('A' + (i + 1) + ':' + row[0].slice(0, 120)); });
    out.formulasA = afl;
    try { out.namedRanges = SpreadsheetApp.openById(CONFIG.ADMIN_SHEET_ID).getNamedRanges().map(function (x) { return x.getName() + '=' + x.getRange().getSheet().getName() + '!' + x.getRange().getA1Notation(); }); } catch (e) {}
  } catch (e) { out.cellsErr = String(e); }
  // (읽기만) 일정 탭 계획으로 만든 공지(planNotice_)가 보낼메시지에 있는 그날 공지와 같은지 (빠진 공지를 다시 넣을 때 맞는 글이 들어가는지 확인용)
  if (p.pn) try {
    const ob = outboxSheet_(), ol = ob.getLastRow(), rows = ol >= 2 ? ob.getRange(2, 1, ol - 1, 6).getValues() : [];
    const nz = function (t) { return String(t || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean); };
    out.planNotices = readRuns_().filter(function (r) { return r['진행 상태'] !== '종료' && r['진행일'] instanceof Date && dayStart_(r['진행일']) >= today_().getTime() && r['폼 링크']; }).map(function (r) {
      const room = String(r['카톡방'] || bareTitle_(r['명단 제목'])), link = String(r['폼 링크']);
      const have = rows.filter(function (x) { return x[2] === '방 공지' && String(x[4]).indexOf(link) >= 0 && dateTok_(String(x[3])) === dateTok_(room); })[0];
      let made = '';
      try { made = planNotice_(r, link); if (made && !isExpect_(r)) made = withSlotLine_(made, runSlot_(r), chainFruit_(r)); } catch (e) { made = 'ERR ' + e; }
      const a = nz(made), b = nz(have ? have[4] : '');
      let diff = '';
      for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) { diff = (i + 1) + '줄: 계획="' + (a[i] || '') + '" / 공지="' + (b[i] || '') + '"'; break; }
      return { room: room, plan: !!made, outbox: !!have, same: !!made && !!have && !diff, diff: diff };
    });
  } catch (e) { out.pnErr = String(e); }
  if (p.rv) try { out.rvExplain = rvExplain_(); } catch (e) { out.rvErr = String(e); }
  try { out.obUserEdit = JSON.parse(CacheService.getScriptCache().get('OB_USEREDIT') || '[]'); } catch (e) {}
  // &pay=글자: 월급시트에서 캠페인명에 그 글자가 든 줄 (읽기만, 같은 진행이 두 줄인지 보기)
  if (p.pay) try {
    out.payRows = [];
    payTabsNow_().forEach(function (sh) { const L = payLayout_(sh); if (!L) return; const last = sh.getLastRow(); if (last <= L.head) return; sh.getRange(L.head + 1, L.name, last - L.head, 1).getValues().forEach(function (x, i) {
      if (String(x[0]).indexOf(String(p.pay)) < 0) return;
      const row = L.head + 1 + i, lc = Math.min(sh.getLastColumn(), 60), hd = sh.getRange(L.head, 1, 1, lc).getDisplayValues()[0], dv = sh.getRange(row, 1, 1, lc).getDisplayValues()[0], fm = sh.getRange(row, 1, 1, lc).getFormulas()[0];
      out.payRows.push(sh.getName() + '!' + row + ' ' + x[0]);
      out.payDetail = (out.payDetail || []).concat([{ row: row, cells: hd.map(function (h, j) { return (dv[j] || fm[j]) ? colLetter_(j + 1) + '[' + h + ']=' + dv[j] + (fm[j] ? ' {' + fm[j] + '}' : '') : ''; }).filter(Boolean), L: L }]);
    }); });
  } catch (e) { out.payErr = String(e); }
  // &resp=요청ID: 그 진행 명단 시트의 폼 응답 (시각, 닉네임, 수령인, 전화 뒤 4자리, 옵션) — 중복·두 번 낸 사람 찾기 (읽기만)
  if (p.resp) try {
    const rr = runByRequest_(p.resp); out.resp = [];
    if (rr) SpreadsheetApp.openById(rr['시트ID']).getSheets().filter(function (t) { return !!t.getFormUrl(); }).forEach(function (t) {
      const h = headers_(t).map(hk_), lr = t.getLastRow(); if (lr < 2) return;
      const ci = function (re, not) { return h.findIndex(function (x) { return re.test(x) && !(not && not.test(x)); }); };
      const cN = ci(MATCH.nick), cA = ci(/수령인|계정명/), cP = ci(/전화|연락처|휴대폰/), cO = ci(MATCH.opt, MATCH.nick);
      t.getRange(2, 1, lr - 1, h.length).getValues().forEach(function (x) { if (!(x[0] instanceof Date)) return; out.resp.push([t.getName(), Utilities.formatDate(x[0], CONFIG.TIMEZONE, 'MM-dd HH:mm:ss'), cN >= 0 ? x[cN] : '', cA >= 0 ? x[cA] : '', cP >= 0 ? String(x[cP]).slice(-4) : '', cO >= 0 ? x[cO] : ''].join(' | ')); });
    });
    // 결제금액 확인 기준 보기 (10/27): 배정 가격표와 응답 머리글
    if (rr) { out.respPm = optPriceMap_(readRuns_().filter(function (x) { return String(x['시트ID']) === String(rr['시트ID']); }).map(function (x) { return String(x['명단 제목']); }));
      try { out.respHead = headers_(rawInfo_(rr['시트ID'], rr['폼ID']).raw); } catch (e) {} }
  } catch (e) { out.respErr = String(e); }
  // &rvj=글자: 진행 제목에 그 글자가 든 의뢰의 리뷰 정보(RV_: 종류·개수·가이드) (읽기만)
  if (p.rvj) try { const pr = PropertiesService.getScriptProperties(), seen = {}; out.rvj = []; readRuns_().forEach(function (r) { const sid = String(r['시트ID'] || ''); if (!sid || seen[sid] || String(r['명단 제목']).indexOf(String(p.rvj)) < 0) return; seen[sid] = 1; out.rvj.push(bareTitle_(r['명단 제목']) + ' | ' + String(pr.getProperty('RV_' + sid) || '').slice(0, 600)); }); } catch (e) { out.rvjErr = String(e); }
  // &payhead=1: 월급시트(이달) 위쪽 머리 줄과 맨 아래 합계 줄의 값·수식, 완료보고(H)를 쓰는 수식 (진행비 총액이 어떻게 나오는지 보기, 읽기만)
  if (p.payhead) try {
    const sh = payTab_(today_().getMonth() + 1), L = payLayout_(sh), lc = Math.min(sh.getLastColumn(), 30), last = sh.getLastRow();
    const dump = function (r) { const dv = sh.getRange(r, 1, 1, lc).getDisplayValues()[0], fm = sh.getRange(r, 1, 1, lc).getFormulas()[0]; return r + ': ' + dv.map(function (v, j) { return (v || fm[j]) ? colLetter_(j + 1) + '=' + v + (fm[j] ? '{' + fm[j] + '}' : '') : ''; }).filter(Boolean).join(' | '); };
    out.payHead = { tab: sh.getName(), L: L, top: [1, 2, 3, 4, 5].filter(function (r) { return r <= last; }).map(dump), bottom: [last - 1, last].filter(function (r) { return r > 5; }).map(dump) };
    const all = sh.getRange(1, 1, last, Math.min(sh.getLastColumn(), 120)).getFormulas(), refs = [];
    all.forEach(function (row, i) { row.forEach(function (f, j) { if (f && /\$?H\$?\d|H:H|\$H/.test(f) && refs.length < 15) refs.push(colLetter_(j + 1) + (i + 1) + ' ' + f); }); });
    out.payHead.hRefs = refs;
  } catch (e) { out.payHeadErr = String(e); }
  // &fo=1: 끝나지 않은 진행 폼의 옵션 보기 (읽기만)
  // (읽기만) 배정 탭 줄(숨은 H열 폼 옵션 포함)·폼수정 E2·그 진행 폼 설명: ?asg=방제 일부 (10/27 효자손 '아직'·'초과' 원인 보기)
  if (p.asg) try {
    const ss0 = adminSs_(), as0 = ss0.getSheetByName(ASSIGN_TAB), want = String(p.asg);
    out.asgRows = [];
    if (as0 && as0.getLastRow() >= 2) {
      const av = as0.getRange(2, 1, as0.getLastRow() - 1, ASSIGN_HEAD.length).getDisplayValues(), af = as0.getRange(2, 5, as0.getLastRow() - 1, 1).getFormulas();
      av.forEach(function (x, i) { if (String(x[0]).indexOf(want) >= 0) out.asgRows.push((i + 2) + ' | ' + x.join(' | ') + (i === 0 || out.asgRows.length === 0 ? ' | E식=' + String(af[i][0]).slice(0, 400) : '')); });
    }
    const et = ss0.getSheetByName(EDIT_TAB); out.editE2 = et ? String(et.getRange('E2').getValue()).slice(0, 4000) : '';
    const rr = readRuns_().filter(function (x) { return bareTitle_(x['명단 제목']).indexOf(want) >= 0 && x['폼ID']; })[0];
    if (rr) { const fm = FormApp.openById(rr['폼ID']); out.asgForm = { title: fm.getTitle(), desc: String(fm.getDescription() || '').slice(0, 4000), choices: formChoices_(fm) }; }
  } catch (e) { out.asgErr = String(e); }
  if (p.fo) try {
    const seen = {}; out.formOpts = [];
    readRuns_().forEach(function (r) { const fid = String(r['폼ID'] || ''); if (!fid || seen[fid] || r['진행 상태'] === '종료') return; seen[fid] = 1; try { out.formOpts.push(bareTitle_(r['명단 제목']) + ': ' + formChoices_(FormApp.openById(fid)).join(' / ')); } catch (e) { out.formOpts.push(bareTitle_(r['명단 제목']) + ': ' + e); }
      // 기대평 폼은 질문 목록도 (A·B묶음 질문 확인)
      if (isExpect_(r)) try { const fm = FormApp.openById(fid); out.formOpts.push('  ↳ 질문: ' + fm.getItems().map(function (it) { let q = it.getTitle(); try { if (it.getType() === FormApp.ItemType.MULTIPLE_CHOICE) { const mc = it.asMultipleChoiceItem(); q += (mc.isRequired() ? '*' : '') + ' {' + mc.getChoices().map(function (c) { return c.getValue(); }).join(' | ') + '}'; } } catch (e) {} return q; }).join(' / ') + ' · 응답받기=' + fm.isAcceptingResponses()); } catch (e) {} });
  } catch (e) { out.foErr = String(e); }
  try { out.triggers = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction() + '|' + t.getEventType() + (t.getTriggerSourceId() ? '|' + String(t.getTriggerSourceId()).slice(0, 10) : ''); }); } catch (e) { out.triggersErr = String(e); }
  try {
    const pr = PropertiesService.getScriptProperties().getProperties(), keep = {};
    ['PAY_PENDING', 'PAY_PROG', 'PAY_SIG', 'SLOW_AT', 'WANT_LOCK', 'SOON_TRIG_AT', 'MID_TRIG_AT', 'LAST_REPORT', 'DASH_VER', 'MORNING_LAST', 'DASH_RV'].forEach(function (k) { if (pr[k] !== undefined) keep[k] = /_AT$|WANT_LOCK/.test(k) && Number(pr[k]) ? f(new Date(Number(pr[k])), 'MM-dd HH:mm:ss') : String(pr[k]).slice(0, 300); });
    keep.onceFlags = Object.keys(pr).filter(function (k) { return /_V\d+$|ONCE/.test(k); }).sort();
    keep.rvKeys = Object.keys(pr).filter(function (k) { return /^(RVDONE_|RVRPT_|RVSENT_|LISTV_|RVLATE)/.test(k); }).sort();
    out.props = keep;
  } catch (e) { out.propsErr = String(e); }
  try { out.reports = JSON.parse(CacheService.getScriptCache().get('REPORT_LOG') || '[]'); } catch (e) { out.reportsErr = String(e); }
  try { out.obTrace = JSON.parse(CacheService.getScriptCache().get('OB_TRACE') || '[]'); } catch (e) {}
  try { const d = adminSs_().getSheetByName(DASH_TAB); if (d) out.dashQ = d.getRange(1, 17, 13, 1).getValues().map(function (x) { return String(x[0]); }).filter(Boolean); } catch (e) {}
  return out;
}

/* 아이폰 등에서 쓰는 웹 앱: 배포 링크로 열면 '새 진행 만들기' 창이 뜸 (주소 뒤 값으로 미리 채움) */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.k !== CONFIG.KEY) return HtmlService.createHtmlOutput('링크가 올바르지 않아요. 체험단 가이드 생성기의 버튼으로 열어 주세요.');
  if (p.p === 'queue') return ContentService.createTextOutput(queueText_());
  // 읽기 전용 점검 (10/24): 진행목록·일정·보낼메시지·트리거·최근 확인 결과를 JSON으로. 아무것도 안 바꿈 (원격으로 버그 원인 찾기용)
  if (p.p === 'diag') return ContentService.createTextOutput(JSON.stringify(diag_(p), null, 1)).setMimeType(ContentService.MimeType.JSON);
  if (p.p === 'sent') { markMsg_(p.id, p.st === 'fail' ? '대기' : '보냄'); return ContentService.createTextOutput('ok'); }
  if (p.p === 'rank') return rankPage_(p);
  if (p.p === 'review') return reviewPage_(p);
  if (p.p === 'tools') {
    try { ensureCheckTrigger_(); } catch (e) {}
    return toolsPage_(toolsRequest_(p), 'web');
  }
  if (p.p === 'outbox') {
    const items = JSON.stringify(outboxItems_()).replace(/</g, '\\u003c');
    return HtmlService.createHtmlOutput(OUTBOX_HTML.replace('__ITEMS__', function () { return items; }).replace('__K__', JSON.stringify(CONFIG.KEY)))
      .setTitle('보낼 메시지함').addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  if (p.d64) {
    try { p.desc = Utilities.newBlob(Utilities.base64DecodeWebSafe(p.d64)).getDataAsString('UTF-8'); } catch (err) {}
    delete p.d64;
  }
  // 긴 공지는 생성기가 gzip으로 압축해서 보냄 (10/26: 주소가 길어 공지가 빠진 채로 만들어졌음)
  if (p.z64) {
    try { p.desc = Utilities.ungzip(Utilities.newBlob(Utilities.base64DecodeWebSafe(p.z64), 'application/x-gzip')).getDataAsString('UTF-8'); } catch (err) {}
    delete p.z64;
  }
  // 생성기 버튼으로 열면(auto=1) 값이 다 채워진 채로 바로 만들기 실행. 같은 요청ID는 한 번만 만들어짐
  const pre = '<script>window.__CART=' + JSON.stringify(p.cart || '') + ';window.__N=' + JSON.stringify(p.n || '') + ';window.__ROOM=' + JSON.stringify(p.room || '') + ';window.__DATE=' + JSON.stringify(p.date || '') + ';window.__SHOP=' + JSON.stringify(p.shop || '') + ';window.__OPTS=' + JSON.stringify(p.opts || '') + ';window.__SLOT=' + JSON.stringify(p.slot || '') + ';window.__PHOTO=' + JSON.stringify(p.photo || '') + ';window.__PLAN=' + JSON.stringify(p.plan || '') + ';window.__SLOT2=' + JSON.stringify(p.slot2 || '') + ';window.__DAY=' + JSON.stringify(p.day || '') + ';window.__TOTAL=' + JSON.stringify(p.total || '') + ';window.__CROOM=' + JSON.stringify(p.croom || '') + ';window.__RV=' + JSON.stringify(p.rv || '') + ';window.__AUTO=' + (p.auto === '1' && p.title ? 'true' : 'false') + ';</' + 'script>';
  const fill = pre + '<script>window.__K=' + JSON.stringify(CONFIG.KEY) + ';window.__FNAME=' + JSON.stringify(p.fname || '') + ';(function(){var p=' + JSON.stringify(p).replace(/</g, '\\u003c') + ';var $=function(i){return document.getElementById(i)};if(p.title)$("title").value=p.title;if(p.daily)$("daily").value=p.daily;if(p.desc)$("desc").value=p.desc;if(p.type)$("type").value=p.type;if(p.platform)$("platform").value=p.platform;$("takdae").checked=p.takdae==="1";$("realship").checked=p.realship==="1";autoGo();})();</' + 'script>';
  return HtmlService.createHtmlOutput(DIALOG_HTML + fill).setTitle('새 진행 만들기').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ---------------- 1) 새 진행 만들기 ---------------- */

function createRun(d) {
  if (!d || d.k !== CONFIG.KEY) throw new Error('권한이 없어요. 생성기 버튼이나 시트 메뉴로 열어 주세요.');
  // 진행 도우미 페이지의 버튼도 이 이름으로 받음 (로더에 이미 있는 이름이라 붙여넣기 없이 됨)
  //  보기·공지 저장은 진행목록 줄을 안 바꿔서 15분 확인이 돌고 있어도 바로 (기다리면 버튼이 안 눌리는 것처럼 보임)
  // 예전에 열어 둔 진행 도우미 화면(동작이 다름)에서 누른 건 하지 않고 다시 열라고 알림
  if (d.act && !/^(info|sent)$/.test(d.act) && String(d.pv || '') !== TOOLS_PV)
    return Object.assign(toolAction_({ act: 'info', title: d.title }), { msg: '⚠ 진행 도우미 화면이 예전 것이에요. 저장 안 했어요.\n창을 닫고 다시 열어 주세요 (시트 옆이면 X 누르고 한눈에 체크칸 다시, 휴대폰이면 새로고침).' });
  if (d.act && /^(info|sent|assign|unassign|move)$/.test(d.act)) return toolAction_(d);
  if (d.act) return locked_(function () { return toolAction_(d); }, 30000) || { msg: '다른 작업 중이에요. 잠시 뒤 다시 눌러 주세요.' };
  // 15분 확인이 돌고 있으면 다음 단계에서 멈추라고 알리고 기다림 (예전엔 60초 넘게 기다리면 아무것도 안 하고 화면만 멈춰 있었음)
  // 공지(폼 설명)가 비었으면 안 만듦 (10/26 효자손외·양배추채칼외: 공지가 구매 시간 한 줄만 남은 채로 폼·방 공지가 만들어졌음)
  if (!String(d.desc || '').split('\n').some(function (l) { return l.trim() && !isSlotLine_(l); }))
    throw new Error('공지(폼 설명)가 비어 있어요. 생성기에서 공지를 복사해 이 화면 폼 설명 칸에 붙여넣고 다시 만들기를 눌러 주세요.');
  const props = PropertiesService.getScriptProperties();
  props.setProperty('WANT_LOCK', String(Date.now()));
  let out;
  try { out = locked_(function () { props.deleteProperty('WANT_LOCK'); return createRunLocked_(d); }, 240000); }
  finally { props.deleteProperty('WANT_LOCK'); }
  if (!out) throw new Error('자동 확인이 아직 안 끝났어요. 1분 뒤 같은 버튼을 다시 눌러 주세요. (다시 눌러도 두 번 만들어지지 않아요)');
  return out;
}
function createRunLocked_(d) {
  {
    // 이미 만든 진행(같은 요청ID, 또는 생성기를 다시 열어 같은 방제로 누름)이면 새로 안 만들고
    //  공지에 살 사람 이름이 있으면 배정 저장 + 폼 설명·안 보낸 방 공지를 이름 넣은 공지로
    const run = (d.n && runByRequest_(d.n)) || runByTitle_(d) || runByUrls_(d);
    if (run) {
      const prev = againResult_(run);
      prev.assign = autoAssign_(run, d.desc);
      // 폼 설명이 비어 있으면(공지가 빠진 채로 만들어진 진행) 이번 공지로 채움 (10/26)
      let empty = false; try { empty = !!run['폼ID'] && !String(FormApp.openById(run['폼ID']).getDescription() || '').split('\n').some(function (l) { return l.trim() && !isSlotLine_(l); }); } catch (e) {}
      if (prev.assign || empty) { try { prev.notice = refreshNotice_(run, d) || prev.notice; if (empty) note_('✓ 빈 공지 채움: ' + bareTitle_(run['명단 제목'])); } catch (e) { note_('공지 다시 넣기 실패: ' + e); } }
      return prev;
    }
    const res = createRunInner_(d);
    const made = d.n ? runByRequest_(d.n) : null;
    res.assign = made ? autoAssign_(made, d.desc) : '';
    return res;
  }
}

// 생성기 공지에 옵션 줄 뒤 살 사람 이름이 있으면(화이트 (2명) 김민희 선우승) 관리 시트 '배정' 탭에 바로 저장
//  (폼수정 탭에 공지를 붙여넣는 것과 같음). 이름이 없으면 아무것도 안 함
function autoAssign_(r, text) {
  try {
    if (!r || !parseAssign_(String(text || ''), []).length) return '';
    return assignRun_(r, String(text));
  } catch (e) { note_('공지 이름 배정 실패: ' + e); return '배정 저장 실패: ' + e.message; }
}

// 이름을 넣은 공지로 폼 설명과 아직 안 보낸 방 공지도 바꿈 (이미 보낸 공지는 그대로)
function refreshNotice_(r, d) {
  if (!r || !r['폼ID'] || !String(d.desc || '').trim()) return '';
  const notice = withSlotLine_(String(d.desc).split('(구글폼 링크)').join(r['폼 링크']), d.slot, d.fruit || chainFruit_(r));
  FormApp.openById(r['폼ID']).setDescription(formDesc_(notice));
  const room = String(r['카톡방'] || bareTitle_(r['명단 제목'])), ob = outboxSheet_(), last = ob.getLastRow();
  if (last >= 2) ob.getRange(2, 1, last - 1, 6).getValues().forEach(function (v, i) { if (String(v[3]) === room && v[2] === '방 공지' && v[5] !== '보냄') obSet_(ob, v[0], 5, notice); });
  return notice;
}

function runByRequest_(n) {
  return readRuns_().filter(function (x) { return String(x['요청ID']) === String(n); })[0] || null;
}
// 생성기 페이지를 다시 열면 요청ID가 새로 생겨서, 방제(끝 인원 수 빼고, #택·실 포함)와 진행일이 같은 1일차 진행을 같은 진행으로 봄
function runByTitle_(d) {
  const key = function (t) { return bareTitle_(t).replace(/\s+/g, '').replace(/\d+$/, ''); };
  const want = key(d.realship ? withSil_(d.title) : d.title);
  if (!want || !dateTok_(want)) return null;
  return readRuns_().filter(function (x) {
    return x['진행 상태'] !== '종료' && !/^(next|add)-/.test(String(x['요청ID'])) && key(x['명단 제목']) === want &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.date || '')) || !(x['진행일'] instanceof Date) || Utilities.formatDate(x['진행일'], CONFIG.TIMEZONE, 'yyyy-MM-dd') === d.date);
  })[0] || null;
}
// 방제가 바뀌어도(20자 줄임 등) 같은 날 같은 상품 링크로 만든 1일차 진행이면 같은 진행 (10/26)
function runByUrls_(d) {
  const u = String(d.urls || '').trim();
  if (!u || !/^\d{4}-\d{2}-\d{2}$/.test(String(d.date || ''))) return null;
  const props = PropertiesService.getScriptProperties();
  return readRuns_().filter(function (x) {
    return x['진행 상태'] !== '종료' && x['시트ID'] && !/^(next|add)-/.test(String(x['요청ID'])) && x['진행일'] instanceof Date &&
      Utilities.formatDate(x['진행일'], CONFIG.TIMEZONE, 'yyyy-MM-dd') === d.date && String(props.getProperty('PURL_' + x['시트ID']) || '').trim() === u.slice(0, 2000);
  })[0] || null;
}
function findRunByRequest_(n) { const r = runByRequest_(n); return r ? againResult_(r) : null; }
function againResult_(r) {
  let notice = '';
  try { notice = FormApp.openById(r['폼ID']).getDescription(); } catch (e) {}
  return { again: true, notice: notice, formUrl: r['폼 링크'], sheetUrl: r['시트 링크'], folderUrl: r['폴더 링크'] };
}

function createRunInner_(d) {
  // 실배송이면 방제·명단 제목(→ 명단 시트 이름)에 '실'
  if (d.realship) { d.title = withSil_(d.title); if (d.room) d.room = withSil_(d.room); if (d.fname) d.fname = withSil_(d.fname); }
  if (!CONFIG.TEMPLATE_FORM_ID || CONFIG.TEMPLATE_FORM_ID.indexOf('여기에') === 0) {
    throw new Error('CONFIG의 TEMPLATE_FORM_ID를 먼저 넣어 주세요.');
  }
  // 2일차부터(또는 추가 모집)는 같은 의뢰의 폼, 명단 시트를 그대로 씀 (의뢰서 하나 = 명단 시트 하나)
  let reuse = d.reuse || null;
  if (!reuse && Number(d.day) > 1) {
    const ck = campKey_(d.camp || campOf_(d.title));
    const chain = chainsOf_(readRuns_()).filter(function (c) { return c.key === ck; }).pop();
    const withForm = chain ? chain.runs.filter(function (x) { return x['시트ID'] && x['폼ID']; }) : [];
    reuse = withForm[0] || null;   // 의뢰서 하나 = 폼 하나 (첫 날 폼, 공지의 '(구글폼 링크)'도 이 폼 링크로)
    if (reuse && !d.sheetId) d.sheetId = withForm[0]['시트ID'];   // 명단 시트는 그 의뢰의 첫 명단 시트
  }
  let form, ss, folder, formUrl;
  if (reuse) {
    form = FormApp.openById(reuse['폼ID']);
    ss = SpreadsheetApp.openById(d.sheetId || reuse['시트ID']);
    formUrl = reuse['폼 링크'] || form.getPublishedUrl();
    try { folder = DriveApp.getFolderById(String(reuse['폴더 링크']).match(/[-\w]{25,}/)[0]); } catch (e) { folder = DriveApp.getFileById(ss.getId()).getParents().next(); }
    // 폼은 진행일 0시에 다시 열림 (checkFull). 진행일이 오늘이거나 지났으면 바로 엶
    const runDay0 = /^\d{4}-\d{2}-\d{2}$/.test(String(d.date || '')) ? new Date(d.date + 'T00:00:00') : dayFromTitle_(d.title);
    if (!(runDay0 instanceof Date) || runDay0 <= new Date()) form.setAcceptingResponses(true);
  } else {
    // 이름 규칙: 방제에서 날짜 뺀 것. 오리컴퍼니 폴더 안에 의뢰마다 같은 이름의 하위 폴더
    const fname = sheetName_(d.fname || d.title);
    folder = rootFolder_().createFolder(fname);
    const formFile = DriveApp.getFileById(CONFIG.TEMPLATE_FORM_ID).makeCopy(fname, folder);
    form = FormApp.openById(formFile.getId());
    form.setTitle(fname);
    // 새 구글폼은 복사본이 '게시 안 됨' 상태라 먼저 게시
    if (typeof form.setPublished === 'function') form.setPublished(true);
    form.setAcceptingResponses(true);
    try { setOptionChoices_(form, d.opts); } catch (e) { note_('옵션 질문 바꾸기 실패: ' + e); }
    try { ensureNickQuestion_(form); } catch (e) { note_('닉네임 질문 넣기 실패: ' + e); }

    // 응답 시트 생성·연결
    ss = SpreadsheetApp.create(fname);
    ss.setSpreadsheetTimeZone(CONFIG.TIMEZONE);
    DriveApp.getFileById(ss.getId()).moveTo(folder);
    form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
    SpreadsheetApp.flush();
    // 응답 시트가 실제로 생길 때까지 잠깐 기다림 (최대 약 15초)
    for (let i = 0; i < 6; i++) {
      Utilities.sleep(2500);
      const linked = SpreadsheetApp.openById(ss.getId()).getSheets().some(function (s) { return !!s.getFormUrl(); });
      if (linked) break;
    }

    // 공유: 시트는 팀 메일 + 명단 편집 권한 메일 + 링크 보기, 폼은 내 계정만 편집
    shareFile_(ss.getId(), false, CONFIG.LIST_EDITORS);
    shareFile_(formFile.getId(), true);

    // 서식 (명단 1행 총건수 = 의뢰 전체 건수)
    const opts = { type: d.type, takdae: !!d.takdae, realship: !!d.realship, platform: d.platform, target: Number(d.total) || d.daily, prices: d.prices };
    formatResponseSheet_(SpreadsheetApp.openById(ss.getId()), opts);
    formUrl = form.getPublishedUrl();
    try { formUrl = form.shortenFormUrl(formUrl); } catch (e) {}
  }

  // 진행목록 기록
  const list = ensureListSheet_();
  const runDay = /^\d{4}-\d{2}-\d{2}$/.test(String(d.date || '')) ? new Date(d.date + 'T00:00:00') : dayFromTitle_(d.title);
  const rec = {
    '등록일': new Date(), '진행일': runDay, '명단 제목': d.title, '유형': d.type, '택대': d.takdae ? 'Y' : '', '실배송': d.realship ? 'Y' : '', '플랫폼': d.platform,
    '목표인원': /^\d+$/.test(String(d.daily || '')) ? Number(d.daily) : '', '인원': 0, '진행 상태': statusFor_(runDay), '마감 시각': '',
    '캠페인': String(d.camp || campOf_(d.title)), '업체': String(d.shop || ''), '구매시간': String(d.slot || ''), '포토': String(d.photo || ''), '일차': Number(d.day) || 1, '총건수': Number(d.total) || '',
    '가격': String(d.prices || '').split(',').filter(Boolean).join(', '), '카톡방': String(d.room || ''), '업체방': String(d.croom || ''),
    '폼 링크': formUrl, '시트 링크': ss.getUrl(), '폴더 링크': folder.getUrl(),
    '시트ID': ss.getId(), '폼ID': form.getId(), '요청ID': String(d.n || '')
  };
  list.appendRow(LIST_HEADER.map(function (h) { return rec[h]; }));
  formatList_(list);
  try { ensureEditTab_(); } catch (e) { note_('폼수정 탭 갱신 실패: ' + e); }
  try { ensureCheckTrigger_(); } catch (e) { note_('마감 확인 트리거 실패: ' + e); }
  // 한눈에 탭·월급시트는 오래 걸려서(각 40초 넘게) 여기서 안 하고 1분 뒤 자동 확인이 갱신
  try { soonCheck_(); } catch (e) { note_('1분 뒤 확인 예약 실패: ' + e); }

  // 공지의 '(구글폼 링크)' 자리에 폼 링크를 넣어서 폼 설명과 카톡 공지를 한 번에 완성
  const fruit0 = d.fruit || (reuse && chainFruit_(reuse));
  const notice = withSlotLine_(String(d.desc || '').split('(구글폼 링크)').join(formUrl), d.slot, fruit0);
  if (notice) form.setDescription(formDesc_(notice));
  if (d.platform !== '기대평') try { fixFormQuestions_(form, !!d.realship); } catch (e) { note_('폼 질문 필수/선택 실패: ' + e.message); }
  if (notice && d.room) queueMsg_(d.room, notice, '방 공지');
  // 여러 날 진행이면 다음 일차 계획 저장 (공지는 폼 링크 넣기 전 원본을 템플릿으로)
  if (d.plan) { try { savePlan_(d); } catch (e) { note_('일정 저장 실패: ' + e); } }
  const r = list.getLastRow();
  if (d.realship) list.getRange(r, 1, 1, LIST_HEADER.length).setBackground('#fff2a8');
  if (d.takdae) list.getRange(r, lc_('택배 옮김')).insertCheckboxes();
  sortList_();

  // 생성기가 넘긴 리뷰 정보(상품별 리뷰 종류·개수, 리뷰 안내, 공지 종류)를 의뢰(명단 시트)마다 저장 → 리뷰 배정 페이지가 씀
  // 상품 페이지 주소 (한눈에 탭 '상품' 칸 링크)
  if (d.urls) { try { PropertiesService.getScriptProperties().setProperty('PURL_' + ss.getId(), String(d.urls).slice(0, 2000)); } catch (e) {} }
  // 장바구니건 (10/28): 한 사람이 상품 N개를 한 번에. 진행목록 인원·총건수는 사람, 방 제목·명단 시트 이름·한눈에·월급시트 건수는 물건 수(사람 × N)
  if (Number(d.cart) > 1) { try { PropertiesService.getScriptProperties().setProperty('CART_' + ss.getId(), String(Number(d.cart))); } catch (e) {} }
  if (d.rv) { try { const pk = 'RV_' + ss.getId(), pr = PropertiesService.getScriptProperties(); if (!pr.getProperty(pk)) pr.setProperty(pk, String(d.rv).slice(0, 8000)); } catch (e) {} }
  return { notice: notice, formUrl: formUrl, sheetUrl: ss.getUrl(), folderUrl: folder.getUrl() };
}

// 폼의 '옵션' 질문 보기를 이번 가이드 옵션으로 바꿈 (예전 템플릿은 '단일옵션' 하나뿐이라 다 단일옵션으로 들어왔음)
// 옵션이 숫자만('1', '1 (21,800원)')이면 '단일옵션' (의뢰서 '구매옵션 : 1' = 1개, 사용자 요청 10/20)
function optDigits_(x) { return String(x).replace(/^\s*\d+\s*(개|ea)?\s*(?=\(|$)/i, '단일옵션 ').replace(/\s+$/, ''); }
// 폼 옵션 보기에는 가격을 안 붙임 (사용자 요청 10/25: 로켓배송은 가격이 매일 바뀌어서 폼 가격과 실제 결제가 달라 폼을 두 번 쓰는 사람이 생김). 가격은 방 공지에만
const OPT_PRICE_RE = /\s*\(\s*[\d,]+\s*원\s*\)\s*$/;
function setOptionChoices_(form, opts) {
  const list = String(opts || '').split('\n').map(function (x) { return optDigits_(x.trim().replace(OPT_PRICE_RE, '')); })
    .filter(function (x, i, a) { return x && a.indexOf(x) === i; });
  if (!list.length) return;
  form.getItems().forEach(function (it) {
    if (!/옵션/.test(it.getTitle())) return;
    const t = it.getType();
    if (t === FormApp.ItemType.MULTIPLE_CHOICE) it.asMultipleChoiceItem().setChoiceValues(list);
    else if (t === FormApp.ItemType.LIST) it.asListItem().setChoiceValues(list);
    else if (t === FormApp.ItemType.CHECKBOX) it.asCheckboxItem().setChoiceValues(list);
    else if (t === FormApp.ItemType.TEXT) it.asTextItem().setHelpText('구매한 옵션을 그대로 적어 주세요: ' + list.join(' / '));
  });
}

// 폼 맨 위에 '방에 참여한 카카오톡 닉네임' 질문 (필수). 수취인 이름이 아니라 이 닉네임으로 옵션을 맞게 샀는지 확인함
function ensureNickQuestion_(form) {
  const has = form.getItems().some(function (it) { return MATCH.nick.test(it.getTitle()); });
  if (has) return false;
  const item = form.addTextItem().setTitle(NICK_Q).setRequired(true)
    .setHelpText('공지에 적힌 이름과 같게 적어 주세요. 두 계정으로 사면 두 번 다 같은 닉네임으로.');
  form.moveItem(item.getIndex(), 0);
  return true;
}

// 폼의 옵션 질문 보기 목록
function formChoices_(form) {
  let out = [];
  form.getItems().forEach(function (it) {
    if (out.length || !MATCH.opt.test(it.getTitle())) return;
    const t = it.getType();
    if (t === FormApp.ItemType.MULTIPLE_CHOICE) out = it.asMultipleChoiceItem().getChoices();
    else if (t === FormApp.ItemType.LIST) out = it.asListItem().getChoices();
    else if (t === FormApp.ItemType.CHECKBOX) out = it.asCheckboxItem().getChoices();
    out = out.map(function (c) { return c.getValue(); });
  });
  return out;
}

function formOf_(raw) {
  const url = raw.getFormUrl();
  return url ? FormApp.openByUrl(url) : null;
}

function shareFile_(id, editorsOnly, extra) {
  const file = DriveApp.getFileById(id);
  CONFIG.TEAM_EMAILS.concat(extra || []).filter(Boolean).forEach(function (m) {
    try { file.addEditor(m); } catch (e) { note_('권한 추가 실패 ' + m + ': ' + e); }
  });
  if (editorsOnly) return;
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    note_('링크 공유 설정 실패(회사 계정 정책일 수 있음): ' + e);
  }
}

/* ---------------- 2)·3)·4) 응답 시트 서식 ---------------- */

function responseSheet_(ss) {
  const sheets = ss.getSheets();
  const withForm = sheets.filter(function (s) { return !!s.getFormUrl(); });
  const sheet = withForm[0] || sheets[0];
  // 폼 연결 후 남는 빈 기본 시트 정리
  sheets.forEach(function (s) {
    if (s.getSheetId() !== sheet.getSheetId() && !s.getFormUrl() && s.getLastRow() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(s);
    }
  });
  return sheet;
}

// 이 폼의 응답이 들어가는 탭 (명단 시트 하나에 여러 날 폼이 연결되면 탭이 여러 개)
function rawFor_(ss, formId) {
  const tabs = ss.getSheets().filter(function (s) { return !!s.getFormUrl(); });
  if (formId) {
    // 응답 탭의 폼 주소에 폼 ID가 들어 있으면 폼을 안 열고 비교 (폼 여는 게 느리고 가끔 구글 쪽 시간 초과가 남)
    const idOf = function (t) { const m = String(t.getFormUrl()).match(/\/forms\/d\/([-\w]{25,})/); return m ? m[1] : ''; };
    for (let i = 0; i < tabs.length; i++) if (idOf(tabs[i]) === String(formId)) return tabs[i];
    for (let i = 0; i < tabs.length; i++) {
      if (idOf(tabs[i])) continue;
      try { if (FormApp.openByUrl(tabs[i].getFormUrl()).getId() === String(formId)) return tabs[i]; } catch (e) {}
    }
  }
  return tabs[0] || responseSheet_(ss);
}

// 폼 응답 탭의 질문 머리글 (빈칸이나 예전 도우미 칸 전까지)
// 폼 응답에 '방에 참여한 카카오톡 닉네임'이 빈 줄 → 배정과 비교가 안 돼 '아직'·'닉네임 확인'으로 나옴 (10/19 김설하·김동욱)
//  ① 닉네임 칸이 둘(폼 질문을 지우고 다시 만든 경우)이면 다른 칸 값 ② 이름·쿠팡닉네임이 그 진행 배정 이름과 같으면 그 이름
//  ③ 아니면 바로 앞 응답(10분 안)의 닉네임, 그 사람이 계정수만큼 아직 안 샀을 때만 (두 계정으로 연달아 산 경우)
//  응답 탭 빈칸에만 쓰고 메모를 남김. 넣은 값이 틀리면 그 칸을 고치면 됨 (다시 안 덮어씀)
function fillBlankNicks_(r, w) {
  const sh = assignSheet_(), al = sh.getLastRow();
  if (al < 2) return '';
  const norm = function (x) { return String(x == null ? '' : x).replace(/\s+/g, '').toLowerCase(); };
  const quota = {}, title = String(r['명단 제목']);
  sh.getRange(2, 1, al - 1, 4).getValues().forEach(function (v) { if (String(v[0]) === title && norm(v[1])) quota[norm(v[1])] = { name: String(v[1]).trim(), n: (quota[norm(v[1])] ? quota[norm(v[1])].n : 0) + (v[3] === '' ? 1 : Number(v[3]) || 0) }; });
  if (!Object.keys(quota).length) return '';
  const ss = SpreadsheetApp.openById(r['시트ID']), out = [];
  ss.getSheets().filter(function (t) { return !!t.getFormUrl(); }).forEach(function (t) {
    const last = t.getLastRow();
    if (last < 2) return;
    const head = headers_(t).map(hk_);
    const nks = [], names = [];
    head.forEach(function (h, i) { if (MATCH.nick.test(h)) nks.push(i); else if (/^이름$|성함|수취인|수령인|쿠팡\s*닉네임|후기에\s*노출/.test(h)) names.push(i); });
    // 닉네임 질문이 없는 옛 폼의 응답 탭: 오른쪽 끝(머리글 바로 다음)에 닉네임 칸을 만들어 채움 (한눈에·배정이 이 칸을 봄)
    if (!nks.length) {
      const rh = rawHead_(t).length;
      if (!rh || !names.length || String(head[rh] || '').trim()) return;
      t.getRange(1, rh + 1).setValue(NICK_Q).setNote('옛 폼이라 카톡 닉네임 질문이 없어서 스크립트가 만든 칸');
      head[rh] = NICK_Q; nks.push(rh);
    }
    const v = t.getRange(2, 1, last - 1, head.length).getValues().map(function (x) { while (x.length < head.length) x.push(''); return x; }), used = {};
    let prev = null;
    v.forEach(function (row, i) {
      if (!(row[0] instanceof Date) || row[0].getTime() < w.from || row[0].getTime() >= w.to) return;
      let nk = norm(row[nks[0]]), why = '';
      if (!nk) {
        const other = nks.slice(1).map(function (c) { return String(row[c]).trim(); }).filter(Boolean)[0];
        const byName = names.map(function (c) { return norm(row[c]); }).filter(function (x) { return quota[x]; })[0];
        if (other) { nk = norm(other); why = '다른 닉네임 칸 값'; }
        else if (byName) { nk = byName; why = '이름이 배정 이름과 같음'; }
        else if (prev && row[0].getTime() - prev.t <= 600000 && quota[prev.nk] && (used[prev.nk] || 0) < quota[prev.nk].n) { nk = prev.nk; why = '바로 앞 응답(' + quota[prev.nk].name + ')의 두 번째 계정으로 봄'; }
        if (nk) {
          const val = quota[nk] ? quota[nk].name : other;
          t.getRange(i + 2, nks[0] + 1).setValue(val).setNote('카톡 닉네임을 비워서 자동으로 넣음: ' + why + '. 틀리면 고쳐 주세요');
          out.push(String(row[names[0]] || '').trim() + '→' + val);
        }
      }
      if (nk) { used[nk] = (used[nk] || 0) + 1; prev = { nk: nk, t: row[0].getTime() }; }
    });
  });
  return out.join(', ');
}

function rawHead_(raw) {
  const all = headers_(raw);
  let n = 0;
  while (n < all.length && all[n] !== '' && OLD_HELPER.indexOf(all[n]) === -1) n++;
  return all.slice(0, n);
}

// 명단 탭 1행: 총건수 = 의뢰 총건수, 진행건수 = 지금까지 들어온 응답(모든 날), 잔여건수 = 총건수 - 진행건수
// 명단 탭 줄을 날짜별 연한 색으로 (글씨가 잘 보이게 연한 색 7가지를 날짜마다 돌려 씀). 송장번호·실배송처럼 손으로 적는 칸은 빼고
const DAY_COLORS = ['#fff2cc', '#d9ead3', '#cfe2f3', '#ead1dc', '#fce5cd', '#d0e0e3', '#d9d2e9'];
function dayColors_(ss) {
  const sh = ss.getSheetByName(LIST_TAB);
  if (!sh) return;
  const props = PropertiesService.getScriptProperties();
  const head = sh.getRange(2, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(String);
  let width = head.findIndex(function (h) { return /송장번호|실배송/.test(h); });
  if (width < 0) width = head.filter(function (h) { return h; }).length;
  width = Math.max(width, 1);
  const key = 'DAYCOL1_' + ss.getId();
  if (props.getProperty(key) === String(width)) return;
  const rg = sh.getRange(3, 1, Math.max(sh.getMaxRows() - 2, 1), width);
  const keep = (sh.getConditionalFormatRules() || []).filter(function (r) {
    const c = r.getBooleanCondition();
    return !(c && /MOD\(INT\(\$A3\),7\)/.test(String((c.getCriteriaValues() || [])[0])));
  });
  const mine = DAY_COLORS.map(function (col, k) {
    return SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND(ISNUMBER($A3),MOD(INT($A3),7)=' + k + ')').setBackground(col).setRanges([rg]).build();
  });
  sh.setConditionalFormatRules(keep.concat(mine));
  props.setProperty(key, String(width));
}

// 명단 시트 맨 오른쪽 '리뷰체크' 탭: 사장님이 리뷰를 체크하고 고치는 곳 (사용자 요청 10/19)
//  폼 응답의 모든 칸(계좌 등 하나도 안 뺌) + 맨 오른쪽 '리뷰 확인' 체크칸. 수식이 아니라 값으로 넣어서 체크·수정·줄 삭제·열 삭제를 해도 안 사라짐
//  새 응답만 아래에 붙이고, 이미 넣은 줄은 절대 안 건드림. 어느 응답을 넣었는지는 스크립트 속성 RVTK_<시트ID>(응답 시각)로 기억 → 사장님이 지운 줄도 다시 안 생김
//  칸은 1행 머리글 글자로 찾아서 넣음(열을 지우거나 옮겨도 됨, 지운 칸은 안 채움). 폼에 새 질문이 생기면 체크칸 왼쪽에 칸을 더함
//  폼에서 지운 응답은 그 줄에 메모 + 회색 글자만
const RVT_TAB = '리뷰체크', RVT_CHECK = '리뷰 확인';
// (10/19 한 번만) 명단 시트마다 만들어 둔 '리뷰체크' 탭 지우기 (사용자: "리뷰체크 탭 없애")
function dropReviewTabsOnce_(runs) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('DROP_RVT_V1')) return;
  props.setProperty('DROP_RVT_V1', '1');
  const ids = [];
  runs.forEach(function (r) { const sid = String(r['시트ID'] || ''); if (sid && ids.indexOf(sid) === -1) ids.push(sid); });
  let n = 0;
  ids.forEach(function (sid) {
    if (!props.getProperty('RVTK_' + sid) && !props.getProperty('RVT_AT_' + sid)) return;   // 스크립트가 만든 적 없는 시트는 안 엶
    try { const ss = SpreadsheetApp.openById(sid), sh = ss.getSheetByName(RVT_TAB); if (sh) { ss.deleteSheet(sh); n++; } } catch (e) {}
    ['RVTK_', 'RVTH_', 'RVT_AT_'].forEach(function (k) { props.deleteProperty(k + sid); });
  });
  if (n) note_('✓ 리뷰체크 탭 ' + n + '개 지움');
}
// (안 씀) 예전 리뷰체크 탭 만들기
function reviewTabs_(runs) {
  const cut = Date.now() - 30 * 86400000, ids = [];
  runs.forEach(function (r) { const sid = String(r['시트ID'] || ''); if (sid && ids.indexOf(sid) === -1 && r['진행일'] instanceof Date && r['진행일'].getTime() >= cut) ids.push(sid); });
  const props = PropertiesService.getScriptProperties();
  ids.forEach(function (sid) {
    if (late_(270)) return;
    const k = 'RVT_AT_' + sid;
    if (Date.now() - Number(props.getProperty(k) || 0) < 25 * 60000) return;
    props.setProperty(k, String(Date.now()));
    try { const n = reviewTab_(SpreadsheetApp.openById(sid)); if (n) note_('✓ 리뷰체크 탭에 ' + n + '줄 추가'); } catch (e) { note_('리뷰체크 탭 실패 ' + sid + ': ' + e); }
  });
}
function reviewTab_(ss) {
  const tabs = ss.getSheets().filter(function (t) { return !!t.getFormUrl(); });
  if (!tabs.length) return 0;
  const heads = [], rows = [];
  tabs.forEach(function (t) {
    const lr = t.getLastRow(), lc = t.getLastColumn();
    if (lc < 1) return;
    const h = rawHead_(t);
    h.forEach(function (x) { if (x && heads.indexOf(x) === -1) heads.push(x); });
    if (lr < 2) return;
    t.getRange(2, 1, lr - 1, h.length).getValues().forEach(function (x) {
      if (!(x[0] instanceof Date)) return;
      // 시각만 있고 답이 하나도 없는 줄은 사람이 아니라서 명단에 안 넣음 (10/21 마켓담온 귤 8행)
      if (!x.slice(1).some(function (v) { return v !== '' && v !== null; })) return;
      const o = {}; h.forEach(function (name, j) { o[name] = x[j]; });
      rows.push({ t: x[0].getTime(), o: o });
    });
  });
  if (!heads.length) return 0;
  rows.sort(function (a, b) { return a.t - b.t; });
  const props = PropertiesService.getScriptProperties(), key = 'RVTK_' + ss.getId();
  let sh = ss.getSheetByName(RVT_TAB), done = String(props.getProperty(key) || '').split(',').filter(Boolean);
  // 10/19 아침에 잠깐 만든 4칸짜리(리뷰 확인/타임스탬프/옵션/성함) 탭: 아직 체크한 게 없으면 새 모양으로 다시 만듦
  if (sh) {
    const h0 = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(function (x) { return String(x).trim(); }).filter(Boolean).join('|');
    if (h0 === '리뷰 확인|타임스탬프|옵션|성함') {
      const checked = sh.getLastRow() >= 2 && sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().some(function (x) { return x[0] === true; });
      if (!checked) { ss.deleteSheet(sh); sh = null; }
    }
  }
  if (!sh) {
    sh = ss.insertSheet(RVT_TAB, ss.getSheets().length);   // 맨 오른쪽 탭
    const hd = heads.concat([RVT_CHECK]);
    sh.getRange(1, 1, 1, hd.length).setValues([hd]).setFontWeight('bold').setBackground('#efe6f7').setWrap(true).setVerticalAlignment('bottom');
    sh.setFrozenRows(1);
    sh.setColumnWidths(1, hd.length, 140);
    done = [];
    props.setProperty('RVTH_' + ss.getId(), JSON.stringify(heads));
  }
  let lc = Math.max(sh.getLastColumn(), 1), hdr = sh.getRange(1, 1, 1, lc).getValues()[0].map(function (x) { return String(x).trim(); });
  // 폼에 새로 생긴 질문은 체크칸 왼쪽(없으면 맨 끝)에 칸 추가. 사장님이 지운 칸(예전에 넣었던 머리글)은 다시 안 만듦
  let known = []; try { known = JSON.parse(props.getProperty('RVTH_' + ss.getId()) || '[]'); } catch (e) {}
  if (!known.length) known = hdr.slice();
  heads.filter(function (h) { return hdr.indexOf(h) === -1 && known.indexOf(h) === -1; }).forEach(function (h) {
    known.push(h);
    const cc = hdr.indexOf(RVT_CHECK) + 1;
    if (cc) { sh.insertColumnBefore(cc); sh.getRange(1, cc).setValue(h).setFontWeight('bold').setBackground('#efe6f7'); }
    else sh.getRange(1, lc + 1).setValue(h).setFontWeight('bold').setBackground('#efe6f7');
    lc = Math.max(sh.getLastColumn(), 1); hdr = sh.getRange(1, 1, 1, lc).getValues()[0].map(function (x) { return String(x).trim(); });
  });
  props.setProperty('RVTH_' + ss.getId(), JSON.stringify(known));
  const cT = hdr.indexOf('타임스탬프') + 1, cC = hdr.indexOf(RVT_CHECK) + 1;
  // 기억이 없는데 탭에 줄이 있으면(속성이 지워진 경우) 탭의 타임스탬프로 다시 기억 → 중복으로 안 넣음
  if (!done.length && cT && sh.getLastRow() >= 2) done = sh.getRange(2, cT, sh.getLastRow() - 1, 1).getValues().map(function (x) { return x[0] instanceof Date ? String(x[0].getTime()) : ''; }).filter(Boolean);
  const add = rows.filter(function (x) { return done.indexOf(String(x.t)) === -1; });
  if (add.length) {
    const start = Math.max(sh.getLastRow(), 1) + 1, n = add.length;
    if (sh.getMaxRows() < start + n) sh.insertRowsAfter(sh.getMaxRows(), start + n - sh.getMaxRows());
    // 머리글 칸마다 그 값(체크칸 빼고). 지운 칸은 머리글이 없으니 안 채움
    sh.getRange(start, 1, n, lc).setValues(add.map(function (x) {
      return hdr.map(function (h, j) { return j + 1 === cC ? false : (h && Object.prototype.hasOwnProperty.call(x.o, h) ? x.o[h] : ''); });
    }));
    if (cC) sh.getRange(start, cC, n, 1).insertCheckboxes();
    if (cT) sh.getRange(start, cT, n, 1).setNumberFormat('yyyy. M. d am/pm h:mm:ss');
    // 날짜별 연한 색 (명단 탭과 같은 색)
    sh.getRange(start, 1, n, lc).setBackgrounds(add.map(function (x) {
      const day = Math.floor((x.t + 9 * 3600000) / 86400000) + 25569;
      return Array(lc).fill(DAY_COLORS[day % 7]);
    }));
    done = done.concat(add.map(function (x) { return String(x.t); }));
  }
  // 폼에서 지운 응답: 줄은 그대로 두고 타임스탬프 칸에 메모 + 회색 글자
  if (cT && sh.getLastRow() >= 2) {
    const live = {}; rows.forEach(function (x) { live[x.t] = 1; });
    const rg = sh.getRange(2, cT, sh.getLastRow() - 1, 1), tv = rg.getValues(), nt = rg.getNotes();
    tv.forEach(function (x, i) {
      if (!(x[0] instanceof Date) || live[x[0].getTime()] || nt[i][0]) return;
      sh.getRange(i + 2, cT).setNote('폼에서 지운 응답이에요 (취소 등). 줄은 그대로 둬요.');
      sh.getRange(i + 2, 1, 1, lc).setFontColor('#999999');
    });
  }
  let save = done.join(',');
  while (save.length > 8500) { done.shift(); save = done.join(','); }
  props.setProperty(key, save);
  return add.length;
}

function listSummary_(ss, total) {
  const sh = ss.getSheetByName(LIST_TAB);
  if (!sh || String(sh.getRange('A1').getValue()) !== '총건수') return;
  if (total && Number(sh.getRange('B1').getValue()) !== Number(total)) sh.getRange('B1').setValue(Number(total));
  const f = '=SUMPRODUCT(--(LEN(A3:A)>0))';
  if (sh.getRange('D1').getFormula() !== f) sh.getRange('D1').setFormula(f);
  if (sh.getRange('F1').getFormula() !== '=IF(B1="","",B1-D1)') sh.getRange('F1').setFormula('=IF(B1="","",B1-D1)');
}

// 명단 탭이 이 시트에 연결된 모든 폼 응답 탭을 합쳐 보여 주게 (의뢰서 하나 = 명단 시트 하나, 날마다 폼이 달라도 아래로 이어짐)
//  머리글은 첫 탭 기준 + 다른 탭에만 있는 질문은 뒤에. 손으로 적는 칸(송장번호, 실배송)은 밀어서 안 겹치게
function ensureListTab_(ss) {
  // (10/19) 합치는 수식은 숨은 '응답합본' 탭에만. 명단 탭은 값(syncList_)
  buildMergeTab_(ss);
  return false;
}

// 명단 탭에 손으로 붙여넣은 응답 줄(A열이 날짜 값) 지우기. 같은 응답은 폼에서 자동으로 들어오고, 남아 있으면 명단 수식이 막힘(#REF!)
//  수식을 잠깐 비워서 수식이 펼친 값과 붙여넣은 값을 구분한 뒤 다시 넣음
function clearPasted_(sh, width) {
  const f = sh.getRange('A3').getFormula();
  if (!f) return 0;
  sh.getRange('A3').clearContent();
  SpreadsheetApp.flush();
  const last = sh.getLastRow();
  let n = 0;
  if (last >= 4) {
    sh.getRange(4, 1, last - 3, 1).getValues().forEach(function (v, i) {
      if (v[0] instanceof Date || /^\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}/.test(String(v[0]))) { sh.getRange(4 + i, 1, 1, width).clearContent(); n++; }
    });
  }
  sh.getRange('A3').setFormula(f);
  return n;
}

function headers_(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
}

function colLetter_(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// 명단 양식: 폼 응답 탭은 숨기고, 맨 앞 '명단' 탭에 우리 양식으로 보여 줌
//  1행: 총건수 | 목표 | 진행건수 | 신청 수 | 잔여건수 | 남은 수 (파랑, 초록, 주황 칸 + 굵은 테두리)
//  2행: 폼 질문 제목 (응답 탭을 그대로 가져옴)
//  3행부터: 응답 (새 응답이 들어오면 자동으로 늘어남)
// 폼 응답 탭은 구글이 보라색 표로 만들어서 직접 꾸밀 수 없기 때문에 이렇게 따로 보여 줌
const LIST_TAB = '명단';
const OLD_HELPER = ['배송완료일', '리뷰기한', '리뷰완료', '상태', '리뷰캡처', '리뷰링크', '업체전달', '송장번호', '실배송'];

function formatResponseSheet_(ss, opts) {
  const raw = responseSheet_(ss);
  const all = headers_(raw);
  let n = 0;
  while (n < all.length && all[n] !== '' && OLD_HELPER.indexOf(all[n]) === -1) n++;
  let form = null;
  try { form = formOf_(raw); } catch (e) {}
  let head = all.slice(0, n);
  if (n <= 1) {
    // 머리글이 아직 안 생겼으면 폼 질문 순서로 짐작 (응답 시트 머리글과 같은 순서)
    head = ['타임스탬프'];
    if (form) {
      if (form.collectsEmail()) head.push('이메일 주소');
      const skip = [FormApp.ItemType.SECTION_HEADER, FormApp.ItemType.PAGE_BREAK, FormApp.ItemType.IMAGE, FormApp.ItemType.VIDEO];
      form.getItems().forEach(function (it) { if (skip.indexOf(it.getType()) === -1) head.push(it.getTitle()); });
    }
    n = Math.max(head.length, 26);
    while (head.length < n) head.push('');
  }
  const L = colLetter_(n);
  const ref = "'" + raw.getName().replace(/'/g, "''") + "'!";

  let sh = ss.getSheetByName(LIST_TAB);
  // 값으로 바뀐 명단 탭(사장님·사용자가 열을 지우고 체크칸을 넣는 곳)은 절대 안 비움. 숨은 합본 탭만 다시
  const vprops = PropertiesService.getScriptProperties();
  if (sh && vprops.getProperty('LISTV_' + ss.getId())) { buildMergeTab_(ss); try { raw.hideSheet(); } catch (e) {} return sh; }
  if (!sh) sh = ss.insertSheet(LIST_TAB, 0);
  ss.setActiveSheet(sh);
  ss.moveActiveSheet(1);
  sh.clear();
  sh.clearConditionalFormatRules();
  sh.setFrozenRows(0);
  // 열 묶음(숨김)이 남아 있으면 풀기
  try { for (let c = 1; c <= sh.getMaxColumns(); c++) while (sh.getColumnGroupDepth(c) > 0) sh.getRange(1, c).getEntireColumn().shiftColumnGroupDepth(-1); } catch (e) {}
  sh.showColumns(1, sh.getMaxColumns());

  // 1행 요약
  const target = /^\d+$/.test(String(opts.target || '')) ? Number(opts.target) : '';
  sh.getRange('A1:F1').setValues([['총건수', target, '진행건수', '', '잔여건수', '']]);
  sh.getRange('D1').setFormula('=SUMPRODUCT(--(LEN(A3:A)>0))');
  sh.getRange('F1').setFormula('=IF(B1="","",B1-D1)');
  const top = sh.getRange('A1:F1');
  top.setFontWeight('bold').setFontSize(11).setHorizontalAlignment('center').setVerticalAlignment('middle').setBackground('#ffffff')
    .setBorder(true, true, true, true, true, false, '#000000', SpreadsheetApp.BorderStyle.SOLID)
    .setBorder(true, true, true, true, null, null, '#000000', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sh.getRange('A1').setBackground('#a4c2f4');
  sh.getRange('C1').setBackground('#b6d7a8');
  sh.getRange('E1').setBackground('#f9cb9c');
  sh.setRowHeight(1, 26);

  // 2행 머리글, 3행부터 응답: 수식이 아니라 값 (사용자 요청 10/19: 리뷰 체크할 때 명단 탭에서 열을 지우고 체크칸을 넣어도 유지되게)
  //  새 응답은 15분 확인이 아래에 값으로 붙임(syncList_). 스크립트가 세는 건 숨은 '응답합본' 탭(수식)으로
  //  '방에 참여한 카카오톡 닉네임'은 명단 시트(업체도 봄)에서 뺌 → 한눈에 탭(관리 시트)에서만 보임 (사용자 요청 10/19)
  const head2 = head.filter(function (h) { return !MATCH.nick.test(h); });
  sh.getRange(2, 1, 1, Math.max(head.length, 1)).clearContent();
  sh.getRange(2, 1, 1, head2.length).setValues([head2]);
  vprops.setProperty('LISTV_' + ss.getId(), '1');
  if (opts.realship) vprops.setProperty('LISTREAL_' + ss.getId(), '1');
  vprops.deleteProperty('LISTK_' + ss.getId()); vprops.deleteProperty('LISTH_' + ss.getId());
  buildMergeTab_(ss);
  // 손으로 적는 칸(택대 송장번호, 실배송)은 안 만듦 (사용자 요청 10/18)
  const extra = n;
  // 명단 시트는 업체도 보는 곳이라 중복, 옵션, 금액 확인 표시는 넣지 않음 (관리 시트 한눈에, 폼수정 탭에서만 보임)
  try { moveOldAssign_(ss); } catch (e) { note_('예전 배정 탭 옮기기 실패: ' + e); }

  const maxRows = sh.getMaxRows();
  sh.getRange(2, 1, 1, extra).setWrap(true).setVerticalAlignment('bottom').setFontWeight('normal');
  sh.setRowHeight(2, 52);
  sh.getRange(3, 1, maxRows - 2, extra).setFontSize(10).setVerticalAlignment('middle');
  sh.getRange(3, 1, maxRows - 2, 1).setNumberFormat('yyyy. M. d am/pm h:mm:ss');
  sh.setFrozenRows(2);
  sh.setColumnWidths(1, extra, 150);
  head.forEach(function (h, i) { if (h.length > 20) sh.setColumnWidth(i + 1, 220); });

  sh.setConditionalFormatRules([]);

  // 계좌, 예금주 열 숨기기(접힌 묶음, + 단추로 펼침). 실배송이면 리뷰비 열도 (10/19 사용자 재확인: 입금대행은 숨김이 맞음)
  const hide = [];
  head.forEach(function (h, i) {
    if (MATCH.account.test(h)) hide.push(i + 1);
    if (opts.realship && MATCH.reviewFee.test(h)) hide.push(i + 1);
  });
  groupColumns_(sh, hide);

  if (opts.realship) sh.setTabColor('#f4d03f');

  // 원래 폼 응답 탭은 숨김 (응답은 계속 여기로 들어오고, 명단 탭이 따라 보여 줌)
  try { raw.hideSheet(); } catch (e) {}
  return sh;
}

const CHECK_HEAD = '옵션 확인';
const ASSIGN_TAB = '배정';
const ASSIGN_HEAD = ['명단 제목', '닉네임', '공지 옵션', '계정수', '산 수', '확인', '시트ID', '폼 옵션', '가격'];
const CHECK_ROWS = 500;
// 옵션 비교는 띄어쓰기·대소문자와 끝의 가격 '(16,800원)'은 무시 (폼 보기에 가격이 붙기 전·후 응답이 섞여서 옵션 틀림으로 나온 것, 10/22 오즈네즈)
//  카톡 닉네임에 숨은 글자(폭 없는 공백·한글 채움 문자 등)가 있으면 같은 닉네임인데 '닉네임 확인'으로 나와서 그것도 무시 (10/23 짜니엉아)
const NORM = function (r) { return 'LOWER(REGEXREPLACE(TO_TEXT(' + r + '),"\\(\\s*[0-9,]+\\s*원\\s*\\)|\\s|[\\x{200B}-\\x{200F}\\x{2060}\\x{FEFF}\\x{3164}\\x{115F}\\x{1160}\\x{00A0}]",""))'; };

// 옵션 확인 수식 (한눈에 탭 명단 옆 칸). nkR, okR: 닉네임, 옵션 칸 범위, rows: 줄 수, sid: 명단 시트ID
//  관리 시트 '배정' 탭에서 같은 명단 시트 줄만 가져와 비교. 닉네임과 옵션은 띄어쓰기, 대소문자 무시
//  한 사람이 두 계정이면 계정수 2, 또는 옵션마다 한 줄씩
function checkFormula_(nkR, okR, rows, sid, title) {
  const A = "'" + ASSIGN_TAB + "'!";
  const cond = title ? A + 'A2:A="' + String(title).replace(/"/g, '""') + '"' : A + 'G2:G="' + sid + '"';   // 그 진행(날짜) 배정만
  const f = function (c) { return 'FILTER(' + A + c + '2:' + c + ',' + cond + ')'; };
  return '=IFERROR(LET(' +
    'an,ARRAYFORMULA(' + NORM(f('B')) + '),ao,ARRAYFORMULA(' + NORM(f('H')) + '),ac,ARRAYFORMULA(IF(' + f('D') + '="",1,IFERROR(VALUE(' + f('D') + '),1))),' +
    'nk,ARRAYFORMULA(' + NORM(nkR) + '),ok,ARRAYFORMULA(' + NORM(okR) + '),ix,SEQUENCE(' + rows + '),' +
    'MAP(nk,ok,ix,LAMBDA(nn,oo,ii,IF(nn="","",LET(' +
      'hasn,SUMPRODUCT((an=nn)*1),' +
      'got,SUMPRODUCT((an=nn)*(((ao=oo)+(ao=""))>0)*ac),' +
      'used,SUMPRODUCT((ix<=ii)*(nk=nn)*(ok=oo)),' +
      'canc,SUMPRODUCT((an=nn)*(ac=0)),' +
      'IF(hasn=0,"닉네임 확인",IF(AND(got=0,canc>0),"취소한 사람",IF(got=0,"옵션 틀림",IF(used>got,"초과 구매","✔"))))))))),"")';
}

// 관리 시트 '배정' 탭: 명단 제목 | 닉네임 | 옵션 | 계정수 | 산 수 | 확인 | (숨김) 시트ID
//  폼수정 탭 E2에 공지를 붙여넣으면 채워지고, 직접 고쳐도 됨. 산 수, 확인은 수식이라 바로 바뀜
function assignSheet_() {
  const ss = adminSs_();
  let sh = ss.getSheetByName(ASSIGN_TAB);
  // 예전 모양(옵션 칸 하나)이면 비우고 새로 (잘못 읽힌 줄이라 다시 붙여넣기)
  if (sh && sh.getRange(1, 1, 1, ASSIGN_HEAD.length).getValues()[0].join('|') !== ASSIGN_HEAD.join('|')) { ss.deleteSheet(sh); sh = null; }
  if (!sh) {
    sh = ss.insertSheet(ASSIGN_TAB);
    sh.getRange(1, 1, 1, ASSIGN_HEAD.length).setValues([ASSIGN_HEAD]).setFontWeight('bold').setBackground('#efe6f7');
    sh.getRange('B1').setNote('공지에 적은 이름(카톡 닉네임). 한 사람이 두 계정으로 다른 옵션을 사면 옵션마다 한 줄씩.');
    sh.getRange('D1').setNote('빈칸이면 1, 0이면 취소한 사람(다음 날 추가 모집 인원에 들어감)');
    sh.getRange('C1').setNote('공지에 적힌 옵션. 숨긴 H열(폼 옵션)이 폼 보기와 맞는 것이고, 비어 있으면 닉네임만 확인');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 260); sh.setColumnWidth(3, 160);
    sh.hideColumns(7, 3);
    sh.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('초과').setBackground('#ea9999').setRanges([sh.getRange('F2:F')]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith('아직').setBackground('#fff2cc').setRanges([sh.getRange('F2:F')]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('취소').setFontColor('#999999').setRanges([sh.getRange('A2:F')]).build()
    ]);
  }
  return sh;
}

// 배정 줄의 '산 수' 수식: 그 명단 시트에서 이 진행 기간에 이 닉네임(+옵션)으로 낸 응답 수
function boughtFormula_(row, info) {
  const imp = function (c) { return 'IMPORTRANGE("' + info.url + '","' + info.ref + c + (info.start || 2) + ':' + c + '3000")'; };
  const day = function (t) { return isFinite(t) && t > 0 ? 'DATE(' + Utilities.formatDate(new Date(t), CONFIG.TIMEZONE, 'yyyy,M,d') + ')' : (t > 0 ? '99999' : '0'); };
  return '=IFERROR(LET(t,' + imp('A') + ',nk,' + imp(info.nick) + ',ok,' + imp(info.opt || info.nick) + ',' +
    // 그 기간 응답에 닉네임이 하나도 없으면(닉네임 질문 전 응답) 셀 수 없어서 빈칸
    'IF(SUMPRODUCT(ISNUMBER(t)*(t>=' + day(info.from) + ')*(t<' + day(info.to) + ')*(LEN(nk)>0))=0,"",' +
    // 닉네임이 같거나, 배정 닉네임 뒤에 기호로 덧붙여 낸 것도 같은 사람 (10/27 '종이' → 폼 '종이/jenny', '백이왕자' → '백이왕자❤️찐쇼우쯔')
    //  덧붙임 계산이 시트에서 오류가 나도 IFERROR로 0 → 원래(닉네임 같음) 계산은 그대로
    'SUMPRODUCT(ISNUMBER(t)*(t>=' + day(info.from) + ')*(t<' + day(info.to) + ')*(((ARRAYFORMULA(' + NORM('nk') + ')=' + NORM('$B' + row) + ')+' +
      'IFERROR(ARRAYFORMULA((LEFT(' + NORM('nk') + ',LEN(' + NORM('$B' + row) + '))=' + NORM('$B' + row) + ')*(LEN(' + NORM('nk') + ')>LEN(' + NORM('$B' + row) + '))*(LEN(' + NORM('$B' + row) + ')>0)*' +
      'REGEXMATCH(MID(' + NORM('nk') + ',LEN(' + NORM('$B' + row) + ')+1,1),"[^가-힣ㄱ-ㅎa-z0-9]")),0))>0)*' +
    '(((ARRAYFORMULA(' + NORM('ok') + ')=' + NORM('$H' + row) + ')+($H' + row + '=""))>0)))),"")';
}

function needFormula_(row) {
  const n = 'IF($D' + row + '="",1,$D' + row + ')';
  return '=IF($B' + row + '="","",IF(AND($D' + row + '<>"",$D' + row + '=0),"취소",IF($E' + row + '="","",IF($E' + row + '<' + n + ',"아직 "&(' + n + '-$E' + row + '),IF($E' + row + '>' + n + ',"초과","✔")))))';
}

// 명단 시트의 응답 탭 이름, 닉네임·옵션 열 글자
function rawInfo_(sheetId, formId) {
  // 한 번 실행하는 동안 같은 시트·폼은 한 번만 찾음
  const memo = globalThis.__RAWINFO = globalThis.__RAWINFO || {}, mk = sheetId + '|' + formId;
  if (!memo[mk]) memo[mk] = rawInfo0_(sheetId, formId);
  return Object.assign({}, memo[mk]);   // from/to를 진행마다 따로 넣으니 복사해서 줌
}
function rawInfo0_(sheetId, formId) {
  const ss = SpreadsheetApp.openById(sheetId);
  const raw = rawFor_(ss, formId);
  // 한 의뢰를 폼 여러 개로 받았으면(예: 10.15에 14일 폼으로 낸 사람) 모든 응답을 합친 명단 탭에서 셈
  let src = raw, start = 2, head = headers_(raw);
  const lt = ss.getSheetByName(MERGE_TAB);
  if (lt && /VSTACK/.test(String(lt.getRange('A3').getFormula()))) {
    src = lt; start = 3; head = lt.getRange(2, 1, 1, Math.max(lt.getLastColumn(), 1)).getValues()[0].map(String);
  }
  // 닉네임 질문이 없는 예전 폼은 사람별 확인은 못 하고(수취인 이름은 공지 이름과 다름) 옵션별 인원만 셈
  const n = head.findIndex(function (h) { return MATCH.nick.test(h); }) + 1;
  const pc = head.findIndex(function (h) { return /결제\s*금액|금액|가격/.test(h); }) + 1;
  const o = head.findIndex(function (h) { return MATCH.opt.test(h) && !MATCH.nick.test(h); }) + 1;
  return { raw: raw, src: src, start: start, head: head, nickCol: n, optCol: o, priceCol: pc, nick: n ? colLetter_(n) : '', opt: o ? colLetter_(o) : '',
    ref: "'" + src.getName().replace(/'/g, "''") + "'!", url: 'https://docs.google.com/spreadsheets/d/' + sheetId + '/edit' };
}

// 배정 탭 '산 수' 수식을 새 모양으로 한 번 다시 씀 (닉네임 질문 전 응답이면 빈칸)
function refreshAssignFormulasOnce_(runs) {
  const sh = assignSheet_(), last = sh.getLastRow();
  if (last >= 2) {
    const infos = {};
    const vals = sh.getRange(2, 1, last - 1, 7).getValues();
    vals.forEach(function (v, i) {
      let r = runs.filter(function (x) { return String(x['명단 제목']) === String(v[0]); })[0];
      // 방제 끝 숫자를 바꿔서 제목이 달라졌으면 같은 날짜·캠페인 진행을 찾아 제목을 맞춤
      if (!r) r = runs.filter(function (x) { return sameRunTitle_(x['명단 제목'], v[0]) && (!v[6] || String(x['시트ID']) === String(v[6]) || x['폼ID']); })[0];
      if (!r || !r['시트ID']) return;
      if (String(v[0]) !== String(r['명단 제목'])) { sh.getRange(i + 2, 1).setValue(r['명단 제목']); v[0] = r['명단 제목']; }
      if (String(v[6]) !== String(r['시트ID'])) sh.getRange(i + 2, 7).setValue(String(r['시트ID']));
      if (!infos[v[0]]) { const info = rawInfo_(r['시트ID'], r['폼ID']); const w = windowOf_(runs, r); info.from = w.from; info.to = w.to; infos[v[0]] = info; }
      const info = infos[v[0]];
      const f = info.nick ? boughtFormula_(i + 2, info) : '';
      const c = sh.getRange(i + 2, 5);
      if (c.getFormula() !== f) { if (f) c.setFormula(f); else c.clearContent(); }
    });
  }
}

// 이 진행의 배정 줄을 통째로 바꿈
function writeAssign_(r, rows) {
  const runs = readRuns_();
  const info = rawInfo_(r['시트ID'], r['폼ID']);
  const w = windowOf_(runs, r);
  info.from = w.from; info.to = w.to;
  const sh = assignSheet_();
  const title = String(r['명단 제목']);
  const last = sh.getLastRow();
  if (last >= 2) {
    const v = sh.getRange(2, 1, last - 1, 1).getValues();
    for (let i = v.length - 1; i >= 0; i--) if (String(v[i][0]) === title) sh.deleteRow(i + 2);
  }
  if (!rows.length) return;
  const start = Math.max(sh.getLastRow(), 1) + 1;
  sh.getRange(start, 1, rows.length, 9).setValues(rows.map(function (x, i) {
    const row = start + i;
    return [title, x[0], x[1], x[2], info.nick ? boughtFormula_(row, info) : '', needFormula_(row), String(r['시트ID']), x[3] || '', x[4] || ''];
  }));
  grantImport_(adminSs_().getId(), r['시트ID']);
  // 옵션 가격을 시트마다 따로 기억 (사용자가 지난 배정 줄을 날마다 지워도 결제금액 확인이 되게, 10/27)
  try {
    const pp = PropertiesService.getScriptProperties(), pk = 'OPTPRICE_' + r['시트ID'];
    const mp = JSON.parse(pp.getProperty(pk) || '{}');
    rows.forEach(function (x) { if (x[3] && Number(x[4]) > 0) mp[String(x[3]).trim()] = Number(x[4]); });
    pp.setProperty(pk, JSON.stringify(mp));
  } catch (e) {}
  try {
    const choices = globalThis.__CHOICES || formChoices_(formOf_(info.raw));
    if (choices.length > 1) sh.getRange(start, 8, rows.length, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(choices, true).setAllowInvalid(true).build());
  } catch (e) {}
}

// 이 진행의 배정 줄 + 그 기간 응답
function assignState_(runs, r) {
  const sh = assignSheet_();
  const last = sh.getLastRow();
  if (last < 2) return null;
  const mine = sh.getRange(2, 1, last - 1, 9).getValues().filter(function (x) { return String(x[0]) === String(r['명단 제목']) && String(x[1]).trim(); });
  if (!mine.length) return null;
  const info = rawInfo_(r['시트ID'], r['폼ID']);
  const w = windowOf_(runs, r);
  const src = info.src || info.raw, st = info.start || 2, lr = src.getLastRow();
  const data = lr < st ? [] : src.getRange(st, 1, lr - st + 1, info.head.length).getValues()
    .filter(function (x) { return x[0] instanceof Date && x[0].getTime() >= w.from && x[0].getTime() < w.to; });
  return { mine: mine, info: info, data: data };
}

// 옵션별 [필요, 산 수, 취소] : 폼 보기가 나뉘어 있으면 고른 옵션으로, 아니면 결제금액으로 어느 옵션인지 셈
function optionCounts_(st) {
  const k = function (x) { return String(x || '').toLowerCase().replace(/\s+/g, ''); };
  const num = function (x) { return Number(String(x).replace(/[^0-9]/g, '')) || 0; };
  const by = {};
  st.mine.forEach(function (x) {
    const o = by[x[2]] = by[x[2]] || { need: 0, canc: 0, got: 0, choice: x[7], price: Number(x[8]) || 0, names: [] };
    if (x[3] !== '' && Number(x[3]) === 0) o.canc++;
    else { o.need += Number(x[3]) || 1; if (o.names.indexOf(String(x[1]).trim()) === -1) o.names.push(String(x[1]).trim()); }
  });
  // 여러 옵션이 같은 가격이면 금액으로는 어느 옵션인지 모름
  const priceUse = {};
  Object.keys(by).forEach(function (l) { if (by[l].price) priceUse[by[l].price] = (priceUse[by[l].price] || 0) + 1; });
  Object.keys(by).forEach(function (l) {
    const o = by[l];
    if (o.price && priceUse[o.price] > 1) o.price = 0;
    if (o.choice && st.info.optCol) o.got = st.data.filter(function (y) { return k(y[st.info.optCol - 1]) === k(o.choice); }).length;
    else if (o.price && st.info.priceCol) o.got = st.data.filter(function (y) { return num(y[st.info.priceCol - 1]) === o.price; }).length;
    else o.got = o.need;   // 어느 옵션인지 알 수 없으면 셈에서 뺌
  });
  return by;
}

// 아직 안 산 사람 [이름, 남은 수, 공지 옵션]. 닉네임 칸이 있으면 사람별, 없으면 옵션별(그 옵션에 배정된 이름들)
function notBought_(runs, r) {
  const st = assignState_(runs, r);
  if (!st) return null;
  const k = function (x) { return String(x || '').toLowerCase().replace(/\s+/g, ''); };
  const out = [];
  if (st.info.nickCol && st.data.some(function (y) { return String(y[st.info.nickCol - 1]).trim(); })) {
    st.mine.forEach(function (x) {
      if (x[3] !== '' && Number(x[3]) === 0) return;
      const need = Number(x[3]) || 1;
      const got = st.data.filter(function (y) { return k(y[st.info.nickCol - 1]) === k(x[1]) && (!String(x[7]).trim() || !st.info.optCol || k(y[st.info.optCol - 1]) === k(x[7])); }).length;
      if (got < need) out.push([String(x[1]).trim(), need - got, String(x[2])]);
    });
    return out;
  }
  const by = optionCounts_(st);
  Object.keys(by).forEach(function (l) { const o = by[l]; if (o.got < o.need) out.push([o.names.join(' '), o.need - o.got, l]); });
  return out;
}

// 다음 날 추가 모집 인원 {공지 옵션: 수} = 옵션별 (배정 - 산 수) + 취소한 사람
function shortByOption_(runs, r) {
  const out = {};
  const st = assignState_(runs, r);
  if (st) {
    const by = optionCounts_(st);
    Object.keys(by).forEach(function (l) { const c = Math.max(by[l].need - by[l].got, 0) + by[l].canc; if (c) out[l] = c; });
  }
  Object.defineProperty(out, '__any', { value: Object.keys(out).length > 0, enumerable: false });
  return out;
}

// 그날 공지: 보낼메시지의 그 방 공지(폼 링크가 든 것 중 마지막), 없거나 비었으면 폼 설명
function dayNotice_(r) {
  const room = String(r['카톡방'] || bareTitle_(r['명단 제목'])), link = String(r['폼 링크'] || '');
  const full = function (t) { return String(t || '').split('\n').some(function (l) { return l.trim() && !isSlotLine_(l); }); };
  let t = '';
  try {
    const ob = outboxSheet_(), ol = ob.getLastRow();
    if (ol >= 2) ob.getRange(2, 1, ol - 1, 6).getValues().forEach(function (v) { if (v[2] === '방 공지' && String(v[3]) === room && (!link || String(v[4]).indexOf(link) >= 0) && full(v[4])) t = String(v[4]); });
  } catch (e) {}
  if (!full(t)) try { t = String(FormApp.openById(r['폼ID']).getDescription() || ''); } catch (e) {}
  return t;
}
// 그날 모자란 옵션 [[보일 이름, 남은 수, 공지 열쇠(상품명|옵션 또는 공지 옵션)]] (명단방 글·다음 날 공지용, 사용자 요청 10/27)
//  옵션 인원 = 그날 공지의 (N명), 산 수 = 그날 응답의 옵션. 공지에서 못 읽으면 배정(그날 인원을 다 배정했을 때만). 그래도 모르면 null
function shortOpts_(runs, r) {
  const k = function (x) { return String(x || '').toLowerCase().replace(/\s+/g, ''); };
  const show = function (c) { return String(c).replace(/\s*\([\d,\s]+원\)\s*$/, '').replace(/\s*\(\s*옵션\s*단일\s*\)\s*$/, '').trim(); };
  const info = rawInfo_(r['시트ID'], r['폼ID']), w = windowOf_(runs, r);
  let choices = [];
  try { choices = formChoices_(FormApp.openById(r['폼ID'])); } catch (e) {}
  const opts = (parseAssign_(dayNotice_(r), choices).opts || []).filter(function (o) { return o[2] > 0 && !REVIEW_OPT_RE.test(o[0]); });
  if (opts.length && info.optCol) {
    const src = info.src || info.raw, st = info.start || 2, lr = src.getLastRow();
    const got = (lr < st ? [] : src.getRange(st, 1, lr - st + 1, info.head.length).getValues())
      .filter(function (x) { return x[0] instanceof Date && x[0].getTime() >= w.from && x[0].getTime() < w.to; }).map(function (x) { return k(x[info.optCol - 1]); });
    const by = {}, order = [];
    for (let i = 0; i < opts.length; i++) {
      const o = opts[i], key = o[1] ? 'c' + k(o[1]) : o[3] ? 'p' + k(o[3]) : '';
      if (!key) return null;   // 어느 보기인지 모르는 옵션이 있으면 셀 수 없음
      if (!by[key]) { by[key] = { show: o[1] ? show(o[1]) : o[0], label: o[4] || o[0], n: 0 }; order.push(key); }
      by[key].n += o[2];
    }
    return order.map(function (key) {
      const x = by[key], c = key.slice(1), n = got.filter(function (v) { return key[0] === 'c' ? v === c : v.indexOf(c) >= 0; }).length;
      return [x.show, x.n - n, x.label];
    }).filter(function (x) { return x[1] > 0; });
  }
  const st2 = assignState_(runs, r);
  if (!st2) return null;
  const by2 = optionCounts_(st2), labs = Object.keys(by2);
  if (labs.reduce(function (a, l) { return a + by2[l].need + by2[l].canc; }, 0) !== Number(r['목표인원'])) return null;   // 배정 안 된 자리가 있으면 모름
  return labs.map(function (l) { return [by2[l].choice ? show(by2[l].choice) : l.replace(/\s*(마감|완료|품절)\s*$/, ''), Math.max(by2[l].need - by2[l].got, 0) + by2[l].canc, l]; })
    .filter(function (x) { return x[1] > 0; });
}
// 명단방 글 아래 붙일 모자란 건수 (사용자 캡처 모양): 구매요청55건 진행45건 잔여10건 / [내일 구매로 진행] / 옵션>잔여4건
//  옵션별 수를 다 더한 게 잔여와 다르면 옵션 줄은 뺌 (틀린 숫자를 보내지 않게)
function shortBlock_(goal, got, so) {
  const left = goal - got, L = ['구매요청' + goal + '건 진행' + got + '건 잔여' + left + '건', '[내일 구매로 진행]'];
  if (so && so.length && so.reduce(function (a, x) { return a + x[1]; }, 0) === left) so.forEach(function (x) { L.push(x[0] + '>잔여' + x[1] + '건'); });
  return L.join('\n');
}
function listShortKey_(r) { return 'LISTSHORT_' + r['시트ID'] + '_' + (r['진행일'] instanceof Date ? Utilities.formatDate(r['진행일'], CONFIG.TIMEZONE, 'yyyyMMdd') : ''); }

// 예전 방식(명단 시트 안 '배정' 탭, '옵션 확인' 칸)이 있으면 관리 시트로 옮기고 명단 시트에서 지움
function moveOldAssign_(ss) {
  const old = ss.getSheetByName(ASSIGN_TAB);
  if (old) {
    const last = old.getLastRow();
    const rows = last < 2 ? [] : old.getRange(2, 1, last - 1, 3).getValues().filter(function (x) { return String(x[0]).trim(); })
      .map(function (x) { return [x[0], x[1], Number(x[2]) || 1, x[1], 0]; });
    const r = rows.length ? readRuns_().filter(function (x) { return String(x['시트ID']) === ss.getId(); }).pop() : null;
    if (r) writeAssign_(r, rows);
    ss.deleteSheet(old);
  }
  const lt = ss.getSheetByName(LIST_TAB);
  if (lt && lt.getLastColumn() > 0) {
    const c = lt.getRange(2, 1, 1, lt.getLastColumn()).getValues()[0].indexOf(CHECK_HEAD) + 1;
    if (c) lt.getRange(2, c, lt.getMaxRows() - 1, 1).clearContent().clearNote();
  }
}

// 상품 짧은 이름: 꾸밈말을 빼고 마지막 낱말 (유기농 공주 햇 옥광밤 대과 → 옥광밤, GAP인증 프리미엄 제주산 황금향 → 황금향)
function shortProduct_(t) {
  const drop = /^(유기농|무농약|친환경|햇|햇것|대과|특대|특|왕|대|중|소|프리미엄|고당도|꿀|명품|국내산|국산|산지직송|당일수확|정품|가정용|선물용|제철)$|인증$|산$/;
  const w = String(t || '').replace(/\([^)]*\)/g, ' ').split(',')[0].split(/\s+/).filter(function (x) { return x && !drop.test(x) && !/\d/.test(x); });
  return w.length ? w[w.length - 1] : '';
}

// 공지(폼 설명)에서 가이드마다 상품 짧은 이름, 판매처, 가격들
function noticeProducts_(text) {
  return String(text || '').split(/\n-{5,}\s*\n?/).map(function (b) {
    const line = function (re) { const m = b.match(re); return m ? m[1].trim() : ''; };
    const name = shortProduct_(line(/(?:🐥\s*)?★?\s*키워드\s*[:：]\s*(.+)/) || line(/(?:🐥\s*)?상품명\s*[:：]\s*(.+)/));
    const prices = [];
    b.split('\n').forEach(function (l) { if (/가격|결제\s*[:：]/.test(l)) (l.match(/\d{1,3}(?:,\d{3})+|\d{4,}/g) || []).forEach(function (x) { x = Number(x.replace(/,/g, '')); if (prices.indexOf(x) === -1) prices.push(x); }); });
    return { name: name, shop: line(/판매처\s*[:：]\s*(.+)/).replace(/판매자\s*[:：]?|주식회사|\(주\)|㈜|\s+/g, ''), prices: prices };
  }).filter(function (x) { return x.name; });
}

// 구분선 없이 상품 정보가 여러 개 이어진 글(링크타고 검색▼ … 🐥상품명 … 가 두 번 이상)을 상품마다 나눔 (10/27)
//  둘째 상품부터, 그 상품명 줄 바로 위 빈 줄에서 자름 (앞 상품 가격 줄 뒤에 붙은 이름 줄은 앞 상품 것)
function splitByProduct_(b) {
  const ls = String(b).split('\n'), at = [];
  ls.forEach(function (l, i) { if (/상품명\s*[:：]/.test(l)) at.push(i); });
  if (at.length < 2) return [String(b)];
  const out = []; let s = 0;
  for (let j = 1; j < at.length; j++) {
    let c = at[j];
    for (let i = at[j] - 1; i > at[j - 1]; i--) if (!ls[i].trim()) { c = i; break; }
    out.push(ls.slice(s, c).join('\n')); s = c;
  }
  out.push(ls.slice(s).join('\n'));
  return out;
}

// 공지 글에서 '옵션 → 이름들' 읽기 (사용자 공지 모양)
//  1) 1kg*1 2명 (박지수(취소) 정수연)          ← 'N명' 뒤 괄호 안 이름
//  🐥옵션 : 1kg×3 (2명) 송기주 2              ← '(N명)' 뒤 이름, 이름 뒤 숫자(띄어 써도) = 계정 수
//  이름(취소) = 취소한 사람 (계정수 0, 다음 날 추가 모집 인원에 들어감)
//  이름(타) = 타계정(다른 사람 계정으로 구매). 닉네임은 그 사람 것이라 표시만 빼고 그대로 셈
//  옵션 줄 바로 아래 줄에 이름만 있어도 읽음
// 돌려주는 줄: [닉네임, 공지 옵션(가이드 여럿이면 상품명 붙임), 계정수, 폼 보기(맞는 게 없으면 빈칸), 가격]
function parseAssign_(text, choices) {
  text = String(text || '').normalize('NFC').replace(/[\u200B-\u200F\uFEFF\u3164\u115F\u1160]/g, '');   // 숨은 글자 빼기 (10/23)
  // 띄어쓰기 있는 닉네임은 대괄호로 묶어 한 사람: [시묘 심효진] (U+2060으로 잠깐 붙였다가 이름에서 다시 띄어 씀)
  //  괄호 안에 'N명'이 있으면 이름이 아니라 배정 줄 전체를 묶은 것 → 괄호만 뺌 (10/27 '🐥[실배송 3명 - 현지 슬기 선우승]'이 한 사람으로 들어감)
  text = String(text || '').replace(/\[([^\[\]\n]{1,40})\]/g, function (m, g) { if (/\d\s*명/.test(g)) return ' ' + g.trim() + ' '; return g.length <= 20 ? g.trim().replace(/\s+/g, '\u2060') : m; });
  const k = function (x) { return String(x || '').toLowerCase().replace(/[\s\u2060]+/g, ''); };
  const bare = function (c) { return k(String(c).replace(/\s*\([\d,\s]+원\)\s*$/, '')); };
  // 상품 구분선: ---- 또는 ———— (카톡에서 긴 줄로 바뀜, 10/21 오즈네즈)
  //  구분선 없이 상품 정보가 여러 개 이어진 공지는 상품마다 나눔: 이름 줄은 바로 위 상품 것 (10/27 치약걸이 보냉백)
  const blocks = [].concat.apply([], String(text || '').split(/\n\s*[-—─_]{5,}\s*\n?/).map(splitByProduct_));
  const multi = noticeProducts_(text).length > 1 || blocks.length > 1;
  const junk = /http|★|☆|▶|▼|※|🐥|[:!?]|\d\s*원|\d{1,3},\d{3}|구매|리뷰|링크|가격|배송|검색|사업자|입금|참고|안내/;
  const rows = [], at = {}, priceMemo = {};
  const opts = [];   // 옵션 줄마다 [공지 옵션, 폼 보기, N명, 상품 짧은 이름, 상품명|옵션] (이름이 없어도): 그날 모자란 옵션 셈·다음 날 공지용 (10/27)
  const toChoice = function (label, opt, full, prod) {
    const a = k(label), b = k(opt);
    let cs = choices.filter(function (c) { return bare(c) === a || bare(c) === b; });
    if (!cs.length) cs = choices.filter(function (c) { return a && bare(c).indexOf(a) >= 0; });
    if (!cs.length && !multi) cs = choices.filter(function (c) { return b && bare(c).indexOf(b) >= 0; });
    // 여러 상품인데 옵션 글자로 못 찾으면 그 상품 짧은 이름이 들어간 보기 (10/27 '효자손 마감' → 코코스무 효자손 우드)
    const byProd = !cs.length && multi && !!prod;
    if (byProd) {
      cs = choices.filter(function (c) { return bare(c).indexOf(k(prod)) >= 0; });
      const cb = cs.filter(function (c) { return b && bare(c).indexOf(b) >= 0; });   // 그 상품 보기 중 옵션 글자가 들어간 것
      if (cb.length) cs = cb;
    }
    // 짧은 이름이 같은 상품이 여럿이면(10/27 거치대 3종: 맥세이프 휴대폰 / 대쉬보드 시야확보 / 계기판 집게형) 그 가이드의 키워드·상품명 낱말이 가장 많이 겹치는 보기
    if (cs.length > 1 && full) {
      const toks = String(full).split(/[\s,()\[\]\/·]+/).map(k).filter(function (t, i, arr) { return t.length >= 2 && arr.indexOf(t) === i; });
      const sc = function (c) { return toks.filter(function (t) { return bare(c).indexOf(t) >= 0; }).length; };
      const best = Math.max.apply(null, cs.map(sc)), top = cs.filter(function (c) { return sc(c) === best; });
      if (best > 0 && top.length === 1) cs = top;
    }
    // 상품 이름으로만 찾았는데 보기가 여럿이면(블랙, 그레이, 네이비 중 택1) 하나를 찍지 않음 → 닉네임으로만 셈 (10/27 보냉백)
    if (byProd && cs.length > 1) return '';
    return cs[0] || '';
  };
  const add = function (names, label, choice) {
    let lastKey = null;
    String(names).replace(/\(\s*타\s*(?:계정|아이디)?\s*\)/g, '').replace(/\(\s*취소\s*\)/g, '#취소').replace(/[()\[\],·\/]/g, ' ').split(/\s+/).forEach(function (tok) {
      tok = tok.replace(/^@+/, '').trim();
      if (!tok) return;
      if (/^[2-9]$/.test(tok) && lastKey) { rows[at[lastKey]][2] = Number(tok); return; }   // '송기주 2'
      if (!/[A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ]/.test(tok) || /^\d+명$/.test(tok)) return;
      if (/^(마감|완료|품절|끝)$/.test(tok)) return;   // 사람 이름이 아니라 표시 (10/27 '눈썹제모기 로즈핑크 (5명) 마감 …'에서 '마감'이 이름으로 들어감)   // 'ㅁㅈ'처럼 자음만인 닉네임도 (10/23)
      const cancel = /#취소$/.test(tok);
      tok = tok.replace(/#취소$/, '');
      let n = 1;
      const m = tok.match(/^(.*\D)([2-9])$/);
      if (m && !cancel) { tok = m[1]; n = Number(m[2]); }
      if (cancel) n = 0;
      const key = k(tok) + '|' + label;
      if (at[key] !== undefined) { rows[at[key]][2] += n; lastKey = key; return; }
      at[key] = rows.length; rows.push([tok.replace(/\u2060/g, ' '), label, n, choice, 0]); lastKey = key;
    });
  };
  // 옵션 줄에 'N명'이 없는 공지(옵션 하나): 공지 아래쪽에 이름만 적은 줄을 그 옵션으로 읽음
  //  예) 🐥옵션 : 1개 … (빈 줄) 정진아 이혜미2 신선영 / 이강희2 임수진 이수진
  const namesOnly = function () {
    const all = String(text || '').split(/\r?\n/);
    const optLine = all.filter(function (l) { return /🐥\s*옵션\s*[:：]/.test(l); })[0] || '';
    const opt = optLine.replace(/^.*?옵션\s*[:：]\s*/, '').trim();
    const choice = choices.length === 1 ? choices[0] : toChoice(opt, opt);
    const priceM = String(text).match(/🐥\s*(?:가격|결제)\s*[:：]\s*([\d,]+)/);
    const price = priceM ? Number(priceM[1].replace(/,/g, '')) : 0;
    // 이름 줄은 상품 정보(🐥) 아래 또는 폼 링크 바로 아래(생성기 공지: 폼 링크 → 이름 → 상품 정보, 10/20) 중 먼저 나오는 곳부터
    const birdAt = all.findIndex(function (l) { return /🐥/.test(l); });
    const formAt = all.findIndex(function (l) { return /forms\.gle|docs\.google\.com\/forms|구글폼\s*링크/.test(l); });
    const firstBird = formAt >= 0 && (birdAt < 0 || formAt < birdAt) ? formAt + 1 : birdAt;
    const nameTok = /^@?[A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ][^\s\d:!?~]{0,11}\d?$/;
    all.forEach(function (l, i) {
      const t = l.trim();
      if (!t || i < firstBird || junk.test(t)) return;
      const toks = t.split(/[\s,]+/).filter(Boolean);
      if (toks.length > 12 || !toks.every(function (x) { return nameTok.test(x) || /^[2-9]$/.test(x) || /^[^\s]+\(\s*취소\s*\)$/.test(x); })) return;
      add(t, opt || choice || '', choice);
    });
    rows.forEach(function (x) { if (!x[4]) x[4] = price; });
  };
  blocks.forEach(function (b) {
    const prod = multi ? (noticeProducts_(b)[0] || {}).name || '' : '';
    // 그 가이드의 키워드·상품명 전체 (짧은 이름이 같은 상품 구분용)
    const full = multi ? ((b.match(/키워드\s*[:：]\s*(.+)/) || [])[1] || '') + ' ' + ((b.match(/상품명\s*[:：]\s*(.+)/) || [])[1] || '') : '';
    // 상품마다 다른 열쇠 (짧은 이름이 같은 상품이 여럿일 때: 거치대 3종): 상품명 전체 + '|' + 옵션
    const pkey = function (o) { return ((b.match(/상품명\s*[:：]\s*(.+)/) || [])[1] || '').trim() + '|' + o; };
    const lines = b.split(/\r?\n/);
    // 옵션 가격: '🐥옵션 : X (N명)' 다음 '🐥가격 : 20500', 또는 '1kg*1 : 17200원 / 1kg*2개 : 29200' 같은 줄
    //  생성기 공지처럼 가격 칸이 여러 줄이면('🐥가격 : 1kg*1 17,200' 다음 줄 '1kg*2개 29,800') 이어진 줄도 가격 줄로 봄
    const priceLines = [];
    lines.forEach(function (l, i) {
      if (!/가격|결제\s*[:：]/.test(l)) return;
      priceLines.push(l);
      for (let j = i + 1; j < lines.length && lines[j].trim() && !/🐥|http|★/.test(lines[j]) && /\d{1,3},\d{3}|\d{4,}/.test(lines[j]); j++) priceLines.push(lines[j]);
    });
    const priceOf = function (opt, idx) {
      const o = k(opt);
      for (let i = 0; i < priceLines.length; i++) {
        const segs = priceLines[i].split('/');
        for (let j = 0; j < segs.length; j++) {
          const sg = segs[j].replace(/🐥[^:：]*[:：]/g, ' ');
          const pos = k(sg).indexOf(o);
          if (pos === -1) continue;
          const m = sg.replace(new RegExp('^.*?' + opt.split('').map(function (ch) { return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('\\s*')), '').match(/\d{1,3}(?:,\d{3})+|\d{4,}/);
          if (m) return Number(m[0].replace(/,/g, ''));
        }
      }
      const next = lines[idx + 1] || '';
      if (/^\s*🐥\s*가격/.test(next)) { const m = next.match(/\d{1,3}(?:,\d{3})+|\d{4,}/); if (m) return Number(m[0].replace(/,/g, '')); }
      // 옵션마다 가격이 따로 없고 가이드에 가격이 하나뿐이면 그 가격 (예: 🐥결제 : 108500, 🐥가격 : 12,900)
      const all = (noticeProducts_(b)[0] || {}).prices || [];
      return all.length === 1 ? all[0] : 0;
    };
    let cur = null;
    lines.forEach(function (line, idx) {
      const t = line.trim();
      if (!t) { cur = null; return; }
      const m = t.match(/^(.*?)\(?\s*(\d+)\s*명\s*\)?(.*)$/);
      if (m) {
        const opt = m[1].replace(/^\d+\)\s*/, '').replace(/^🐥\s*옵션\s*[:：]?\s*/, '').replace(/^🐥\s*/, '').trim();
        // '1) 2명 - 임수진 이혜미(타)': 옵션이 하나인 상품은 머리줄에 이름 (옵션 줄에 (N명)이 없을 때만)
        //  이름이 없는 '1) 5명' 머리 줄도 옵션 인원으로는 셈 (다음 날 공지 인원 확인용, 10/27)
        if (!opt && /^\d+\)/.test(t)) {
          const nm = m[3].replace(/^[\s\-–—:]+/, '').trim();
          const oi = lines.findIndex(function (l) { return /🐥\s*옵션\s*[:：]/.test(l); });
          const ol = oi >= 0 ? lines[oi] : '';
          if (ol && !/\(\s*\d*\s*명\s*\)/.test(ol)) {
            const o2 = ol.replace(/^.*?옵션\s*[:：]\s*/, '').trim(), label2 = [prod, o2].filter(Boolean).join(' '), ch2 = toChoice(label2, o2, full, prod);
            opts.push([label2, ch2, Number(m[2]), prod, pkey(o2)]);
            if (nm) {
              add(nm, label2, ch2);
              const pr2 = priceOf(o2, oi);
              rows.forEach(function (x) { if (x[1] === label2 && !x[4]) x[4] = pr2; });
            }
          }
          cur = null; return;
        }
        if (!opt || /가격|원$/.test(opt)) { cur = null; return; }
        const label = [prod, opt].filter(Boolean).join(' ');
        cur = { label: label, choice: toChoice(label, opt, full, prod) };
        opts.push([label, cur.choice, Number(m[2]), prod, pkey(opt)]);
        const before = rows.length;
        add(m[3], cur.label, cur.choice);
        const pr = priceOf(opt, idx);
        rows.forEach(function (x) { if (x[1] === label && !x[4]) x[4] = pr; });
        if (rows.length === before && pr) priceMemo[label] = pr;
        return;
      }
      if (cur && !junk.test(t) && t.split(/\s+/).length <= 8) { add(t, cur.label, cur.choice); rows.forEach(function (x) { if (x[1] === cur.label && !x[4]) x[4] = priceMemo[cur.label] || 0; }); return; }
      cur = null;
    });
  });
  if (!rows.length) namesOnly();
  rows.opts = opts;
  return rows;
}

function groupColumns_(sheet, cols) {
  if (!cols.length) return;
  cols = cols.filter(function (c, i, a) { return a.indexOf(c) === i; }).sort(function (a, b) { return a - b; });
  let start = cols[0], prev = cols[0];
  const runs = [];
  for (let i = 1; i <= cols.length; i++) {
    if (cols[i] === prev + 1) { prev = cols[i]; continue; }
    runs.push([start, prev]); start = cols[i]; prev = cols[i];
  }
  runs.forEach(function (r) {
    try {
      const range = sheet.getRange(1, r[0], 1, r[1] - r[0] + 1).getEntireColumn();
      if (range.getColumn() && sheet.getColumnGroupDepth(r[0]) === 0) range.shiftColumnGroupDepth(1);
      const g = sheet.getColumnGroup(r[0], 1);
      if (g) g.collapse();
    } catch (e) {
      sheet.hideColumns(r[0], r[1] - r[0] + 1);
    }
  });
}

/* 진행목록에서 행을 선택하고 실행: 폼 질문을 바꾼 뒤 서식을 다시 맞출 때 */
function reformatSelected() {
  const list = ensureListSheet_();
  const row = list.getActiveRange() ? list.getActiveRange().getRow() : 0;
  const r = readRuns_().filter(function (x) { return x.row === row; })[0];
  if (!r || !r['시트ID']) { SpreadsheetApp.getUi().alert('진행목록에서 다시 적용할 진행의 행을 먼저 선택해 주세요.'); return; }
  const added = reformatRun_(r);
  shareFile_(r['시트ID'], false, CONFIG.LIST_EDITORS);
  try { buildDashboard_(true); } catch (e) {}
  SpreadsheetApp.getUi().alert('명단 양식과 편집 권한을 다시 적용했어요: ' + r['명단 제목'] + (added ? '\n폼에 \'' + NICK_Q + '\' 질문도 넣었어요 (이미 낸 사람은 닉네임 칸이 비어 있어요).' : ''));
}

// 폼에 닉네임 질문이 없으면 넣고 명단 양식을 다시 적용. 질문을 넣었으면 true
function reformatRun_(r) {
  let added = false;
  if (r['폼ID']) { try { added = ensureNickQuestion_(FormApp.openById(r['폼ID'])); } catch (e) { note_('닉네임 질문 넣기 실패: ' + e); } }
  if (added) { SpreadsheetApp.flush(); Utilities.sleep(2000); }
  formatResponseSheet_(SpreadsheetApp.openById(r['시트ID']), {
    type: r['유형'], takdae: r['택대'] === 'Y', realship: r['실배송'] === 'Y', platform: r['플랫폼'], target: Number(r['총건수']) || r['목표인원'], prices: r['가격']
  });
  return added;
}

/* ---------------- 4) 진행목록 인원, 명단 마감 ---------------- */

function dailyCheck() {
  let ran = false;
  globalThis.__ORI_T0 = Date.now();
  locked_(function () { ran = true; try { dailyCheckInner_(); } catch (e) { note_('멈춤: ' + (e && e.message || e)); } }, 120000);
  report_('현황 업데이트', ran);
}

function dailyCheckInner_() {
  try { archiveOld_(); } catch (e) { note_('보관 실패: ' + e); }
  try { normalizeRuns_(); } catch (e) {}
  const runs = readRuns_();
  runs.forEach(function (r) {
    if (r['진행 상태'] === '종료' || !r['시트ID']) return;
    const day = r['진행일'] || dayFromTitle_(r['명단 제목']);
    if (day instanceof Date && (today_() - day) / 864e5 >= CONFIG.AUTO_END_DAYS) { setRun_(r.row, '진행 상태', '종료'); return; }
    const st = statusFor_(day);
    if (st !== r['진행 상태']) setRun_(r.row, '진행 상태', st);
    try { setRun_(r.row, '인원', runCount_(runs, r)); } catch (e) {}
  });
  try { ensureEditTab_(); } catch (e) {}
  try { ensureCheckTrigger_(); } catch (e) { note_('자동 확인 트리거 실패: ' + e); }
  try { updatePay_(); } catch (e) { note_('월급시트 갱신 실패: ' + e); }
}

function countResponses_(sheetId) {
  const sheet = responseSheet_(SpreadsheetApp.openById(sheetId));
  const last = sheet.getLastRow();
  return last < 2 ? 0 : sheet.getRange(2, 1, last - 1, 1).getValues().filter(function (x) { return x[0] !== ''; }).length;
}

function checkFull() {
  // 메뉴로 누르면(시트 화면에서) 명단 탭만 바로 새로고침하고, 오래 걸리는 나머지는 1분 뒤 뒤에서 (사용자: 메뉴 실행이 너무 느림 10/20)
  //  자동 확인(15분·0시·1분 뒤 예약)은 화면이 없어서 getUi()가 안 되므로 원래대로 전부
  let ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) {}
  if (ui) return quickCheck_(ui);
  let ran = false;
  globalThis.__ORI_T0 = Date.now();
  // 0시대에는 폼 열기를 잠금 없이 먼저 (15분 확인이 마침 돌고 있어 잠금을 못 잡아도 0시에 바로 열리게)
  try { if (Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'H') === '0') openStartingForms_(readRuns_(), outboxRows_()); } catch (e) { note_('0시 폼 열기 실패: ' + e); }
  locked_(function () {
    ran = true;
    try { checkFullInner_(); } catch (e) {
      if (e && e.yieldLock) { note_('✓ 직접 하신 일(폼수정 탭·새 진행 만들기 등) 먼저 하게 확인을 잠깐 멈춤 (1분 뒤 이어서)'); try { soonCheck_(); } catch (e2) {} }
      else note_('멈춤: ' + (e && e.message || e));
    }
  }, 120000);
  report_('자동 확인', ran);
}

function quickCheck_(ui) {
  const t0 = Date.now();
  let added = 0, sheets = 0;
  const ok = locked_(function () {
    const runs = readRuns_(), today = today_().getTime(), seen = {};
    runs.forEach(function (r) {
      const sid = String(r['시트ID'] || '');
      if (!sid || seen[sid] || r['진행 상태'] === '종료' || !(r['진행일'] instanceof Date) || dayStart_(r['진행일']) < today - 2 * 86400000) return;
      seen[sid] = 1; sheets++;
      try { added += syncList_(SpreadsheetApp.openById(sid)) || 0; } catch (e) {}
    });
    return true;
  }, 15000);
  try { soonCheck_(); } catch (e) {}
  if (!ok) { ui.alert('지금 15분 자동 확인이 돌고 있어서 이번엔 건너뛰었어요 (오류 아님).\n한눈에 탭 Q1의 ⏳가 ✔로 바뀌면 끝난 거예요.'); return; }
  ui.alert('명단 탭 새로고침 했어요 (명단 시트 ' + sheets + '개, 새 줄 ' + added + '개, ' + Math.round((Date.now() - t0) / 1000) + '초).\n\n나머지(인원 세기, 폼 닫기, 한눈에 탭, 월급시트)는 1분 뒤 뒤에서 자동으로 해요. 기다리지 않아도 돼요.');
}

// 한눈에 Q1에 지금 어디까지 했는지 (6분 제한에 걸려 멈추면 ⏳가 그대로 남아서 알 수 있게)
function step_(what) {
  // 새 진행 만들기가 기다리고 있으면 여기서 멈추고 잠금을 넘김 (남은 건 1분 뒤 다시 도는 확인이 함)
  if (globalThis.__ORI_T0) {
    const want = Number(PropertiesService.getScriptProperties().getProperty('WANT_LOCK') || 0);
    if (want && Date.now() - want < 300000) throw { yieldLock: 1 };
  }
  const now = Date.now(), st = globalThis.__ORI_STEPS = globalThis.__ORI_STEPS || [];
  if (st.length) st[st.length - 1].s = Math.round((now - st[st.length - 1].t) / 1000);
  st.push({ w: what, t: now, s: 0 });
  try {
    const d = adminSs_().getSheetByName(DASH_TAB);
    if (d) d.getRange(1, 17).setValue('⏳ ' + Utilities.formatDate(new Date(globalThis.__ORI_T0 || Date.now()), CONFIG.TIMEZONE, 'HH:mm') + ' 확인 중: ' + what).setFontColor('#9a6700');
  } catch (e) {}
}
// 직접 하는 일(폼수정 탭·새 진행 만들기)이 잠금을 기다리면 지금 멈추고 넘김 (step_과 같음, 긴 단계 안에서 씀)
function yieldIfWanted_() {
  if (!globalThis.__ORI_T0) return;
  const want = Number(PropertiesService.getScriptProperties().getProperty('WANT_LOCK') || 0);
  if (want && Date.now() - want < 300000) throw { yieldLock: 1 };
}
function late_(sec) { return Date.now() - (globalThis.__ORI_T0 || Date.now()) > sec * 1000; }

// 이 진행이 받는 폼들: 진행목록 폼ID + 이 방 공지(보낼메시지)에 들어간 폼 링크의 폼 (공지 링크가 다른 날 폼이어도 그 폼을 열어 둠)
function runFormIds_(r, runs, msgs) {
  const ids = [String(r['폼ID'])], room = String(r['카톡방'] || bareTitle_(r['명단 제목']));
  const links = [];
  (msgs || []).forEach(function (v) { if (v[2] === '방 공지' && String(v[3]) === room) (String(v[4]).match(FORM_LINK_RE) || []).forEach(function (l) { links.push(l); }); });
  runs.forEach(function (x) { if (x['폼ID'] && x['폼 링크'] && links.indexOf(String(x['폼 링크'])) >= 0 && ids.indexOf(String(x['폼ID'])) === -1) ids.push(String(x['폼ID'])); });
  return ids.filter(Boolean);
}
function outboxRows_() { const ob = outboxSheet_(), last = ob.getLastRow(); return last >= 2 ? ob.getRange(2, 1, last - 1, 6).getValues() : []; }

// 진행일 0시가 된 진행의 폼을 엶 (같은 폼을 쓰는 다음 진행). 한 번 연 뒤 손으로 닫으면 다시 안 엶
function openStartingForms_(runs, msgs) {
  const props = PropertiesService.getScriptProperties(), now = Date.now();
  runs.forEach(function (r) {
    if (r['진행 상태'] === '종료' || !r['폼ID'] || r['마감 시각'] || !(r['진행일'] instanceof Date)) return;
    const w = windowOf_(runs, r);
    if (w.first || now < w.from || runOver_(runs, r, now) || pastEnd_(r)) return;
    const key = 'OPEN_' + r['폼ID'] + '_' + Utilities.formatDate(r['진행일'], CONFIG.TIMEZONE, 'yyyyMMdd');
    if (props.getProperty(key)) return;
    let ok = true;
    runFormIds_(r, runs, msgs).forEach(function (fid) {
      try { const f = FormApp.openById(fid); if (!f.isAcceptingResponses()) { f.setAcceptingResponses(true); note_('✓ 폼 엶: ' + bareTitle_(r['명단 제목'])); } } catch (e) { ok = false; note_('폼 열기 실패 ' + bareTitle_(r['명단 제목']) + ': ' + e.message); }
    });
    // 열기에 실패하면 표시를 안 남겨서 다음 확인(15분 뒤)에 다시 엶
    if (ok) props.setProperty(key, '1');
  });
}

// 1분 뒤 자동 확인 한 번 (새 진행을 만든 뒤 한눈에·월급시트 갱신, 확인을 중간에 멈췄을 때 이어서)
function soonCheck_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SOON_TRIG_ID'), at = Number(props.getProperty('SOON_TRIG_AT') || 0);
  if (id && at > Date.now()) return;   // 이미 걸려 있음
  if (id) ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getUniqueId() === id) ScriptApp.deleteTrigger(t); });
  const t = ScriptApp.newTrigger('checkFull').timeBased().after(60000).create();
  props.setProperty('SOON_TRIG_ID', t.getUniqueId()); props.setProperty('SOON_TRIG_AT', String(Date.now() + 60000));
}

// 정확히 0시에 한 번 더 확인 (15분 확인만 있으면 최대 15분 늦게 열림). 매일 다음 0시 20초에 한 번 도는 예약을 걸어 둠
function ensureMidnightTrigger_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('MID_TRIG_ID'), at = Number(props.getProperty('MID_TRIG_AT') || 0);
  // 예약이 한국 시간 0시가 아니면(예전에 스크립트 시간대로 잡은 것) 다시 잡음
  if (id && at > Date.now() && Utilities.formatDate(new Date(at), CONFIG.TIMEZONE || 'Asia/Seoul', 'H') === '0') return;
  if (id) ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getUniqueId() === id) ScriptApp.deleteTrigger(t); });
  // 한국 시간 다음 날 0시 0분 20초 (스크립트 시간대 설정과 상관없이)
  const next = new Date(Utilities.formatDate(new Date(Date.now() + 86400000), CONFIG.TIMEZONE || 'Asia/Seoul', 'yyyy-MM-dd') + 'T00:00:20+09:00');
  const t = ScriptApp.newTrigger('checkFull').timeBased().at(next).create();
  props.setProperty('MID_TRIG_ID', t.getUniqueId()); props.setProperty('MID_TRIG_AT', String(next.getTime()));
}

// 지금 받는 진행이 없는 폼은 닫아 둠 (같은 폼을 쓰는 다음 진행은 그 진행일 0시에 다시 열림)
//  받는 진행 = 기간(진행일 0시 ~ 같은 명단 다음 진행일 0시) 안이고 아직 마감 안 된 것
function closeIdleForms_(runs, msgs) {
  // 폼은 자동으로 절대 안 닫음 (사용자 요청 10/21, 10/24 다시). 초과 응답은 한눈에 '확인 필요' 칸에 표시
}

// 받는 기간이 끝난 진행: 같은 명단 다음 진행일 0시가 지났거나, 같은 캠페인의 더 늦은 진행이 이미 시작함 (명단 시트가 달라도)
function runOver_(runs, r, now) {
  now = now || Date.now();
  if (now >= windowOf_(runs, r).to) return true;
  if (!(r['진행일'] instanceof Date)) return false;
  const k = campKey_(r['캠페인'] || r['명단 제목']);
  return runs.some(function (x) { return x !== r && x['진행일'] instanceof Date && x['진행일'] > r['진행일'] && dayStart_(x['진행일']) <= now && campKey_(x['캠페인'] || x['명단 제목']) === k; });
}

function checkFullInner_() {
  step_('진행목록');
  try { removeOldUpdateTrigger_(); } catch (e) {}
  try { normalizeRuns_(); } catch (e) { note_('진행목록 정리 실패: ' + e); }
  // (10/24) 밀린 월급시트·정리를 맨 앞에서 하던 것 없앰: 월급시트가 6분 안에 안 끝나서 확인이 매번 맨 앞에서 끊겼고,
  //  그 뒤 일(다음 일차 만들기, 방 공지, 폼 트리거, 보낼 날짜)이 몇 시간 동안 하나도 안 됨. 이제 급한 일 먼저, 월급시트는 끝에서 나눠서 이어 함
  // 단계를 잘게 나눠서 폼수정 탭 삭제 같은 직접 하는 일이 덜 기다리게 (10/26 '진행목록' 단계가 126초 걸려 삭제가 2분 늦음)
  step_('다음 일차');
  try { makeDueDays_(); } catch (e) { note_('다음 일차 만들기 실패: ' + e); }
  step_('다음 날 진행');
  try { autoNextDay_(); } catch (e) { note_('다음 날 진행 만들기 실패: ' + e); }
  const me = Session.getEffectiveUser().getEmail();
  const props = PropertiesService.getScriptProperties();
  let changed = false;
  // 빨리 끝나고 꼭 해야 하는 것 먼저 (뒤에서 시간이 모자라도 이건 되게)
  // 새로 만든 진행이 한눈에 탭에 아직 없으면 먼저 다시 그림 (맨 끝 '한눈에' 단계까지 5분 넘게 걸려서, 10/20)
  try {
    const shown = JSON.parse(PropertiesService.getScriptProperties().getProperty('DASH_TITLES') || '[]');
    if (readRuns_().some(function (r) { return r['진행 상태'] !== '종료' && r['시트ID'] && !dashHidden_(r) && shown.indexOf(bareTitle_(r['명단 제목'])) === -1; })) { step_('한눈에(새 진행)'); buildDashboard_(false); }
  } catch (e) { note_('한눈에 탭(새 진행) 실패: ' + e); }
  step_('보낼메시지, 폼 닫기');
  try { tidyOutbox_(); } catch (e) { note_('보낼메시지 정리 실패: ' + e); }
  try { const rr = readRuns_(), mm = outboxRows_(); closeIdleForms_(rr, mm); openStartingForms_(rr, mm); } catch (e) { note_('폼 열고 닫기 실패: ' + e); }
  try { ensureMidnightTrigger_(); } catch (e) { note_('0시 확인 예약 실패: ' + e); }
  step_('공지 모양');
  try { ensureRunNotices_(readRuns_()); } catch (e) { note_('방 공지 확인 실패: ' + e); }
  try { fixMisroutedNotices_(readRuns_()); } catch (e) { note_('방 공지 카톡방 확인 실패: ' + e); }
  try { morningCheck_(); } catch (e) { note_('새벽 점검 실패: ' + e); }
  if (!props.getProperty('EXPECT_V4')) try { setupExpectOnce_(); } catch (e) { note_('기대평 진행 만들기 실패: ' + e); }
  if (!props.getProperty('EXPECT_V5')) try { fixExpect5Once_(); } catch (e) { note_('기대평 다시 나누기 실패: ' + e); }
  if (!props.getProperty('MORNING_FA_V1')) { props.setProperty('MORNING_FA_V1', '1'); try { const ob = outboxSheet_(), ol = ob.getLastRow(); if (ol >= 2) ob.getRange(2, 1, ol - 1, 6).getValues().forEach(function (v) { if (v[2] === '할 일' && v[5] !== '보냄' && /^🌅 새벽 점검 \(10\/24/.test(String(v[4]))) obSet_(ob, v[0], 6, '보냄'); }); } catch (e) {} }   // 10/24 밤 첫 점검의 잘못된 알림(예전 월급시트 안내를 문제로 셈) 치움
  if (!props.getProperty('EXPPLAN_V8')) try { expPlanRestoreOnce_(); } catch (e) { note_('기대평 일정 되살리기 실패: ' + e); }
  if (!props.getProperty('EXPPLAN_CLEAN_V1')) try { expPlanCleanOnce_(); } catch (e) { note_('기대평 옛 일정 지우기 실패: ' + e); }
  if (!props.getProperty('FORMNOPRICE_V1')) try { formNoPriceOnce_(); } catch (e) { note_('폼 옵션 가격 빼기 실패: ' + e); }
  if (!props.getProperty('MERGE_BAG_V1')) try { mergeBagOnce_(); } catch (e) { note_('치약걸이·보냉백 합치기 실패: ' + e); }
  if (!props.getProperty('NOTICE1026_V1')) try { notice1026Once_(); } catch (e) { note_('10/26 공지 고치기 실패: ' + e); }
  if (!props.getProperty('COCO1026_V1')) try { cocoRunOnce_(); } catch (e) { note_('코코스무 진행 만들기 실패: ' + e); }
  if (!props.getProperty('DEL_SEULBI_V1')) try { delSeulbiOnce_(); } catch (e) { note_('이슬비 응답 지우기 실패: ' + e); }
  if (!props.getProperty('FIX1026B_V1')) try { fix1026bOnce_(); } catch (e) { note_('10/26 실링팬·치약걸이 고치기 실패: ' + e); }
  if (!props.getProperty('SILING_DAYMIX_V1')) try { silingDayMixOnce_(); } catch (e) { note_('실링팬 10.27 리뷰 종류 실패: ' + e); }
  if (!props.getProperty('FIX1026C_V1')) try { fix1026cOnce_(); } catch (e) { note_('10/26 보낼메시지 정리 실패: ' + e); }
  if (!props.getProperty('TALKDEAL_G_V1')) try { talkdealQtyOnce_(); } catch (e) { note_('톡딜 월급시트 상태 실패: ' + e); }
  if (!props.getProperty('EXPMIX_V1')) try { expMixOnce_(); } catch (e) { note_('기대평 A·B묶음 바꾸기 실패: ' + e); }
  if (!props.getProperty('RVCAMP_V1')) try { rvCampOnce_(); } catch (e) { note_('리뷰 취합 의뢰 단위로 바꾸기 실패: ' + e); }
  if (!props.getProperty('EXPFEE_AB_V1')) try { expFeeAbOnce_(); } catch (e) { note_('기대평 폼 리뷰비 보기 바꾸기 실패: ' + e); }
  if (!props.getProperty('HYOJA_ROOM_V1')) try { hyojaRoomOnce_(); } catch (e) { note_('효자손 방제 줄이기 실패: ' + e); }
  if (!props.getProperty('ASGFIX1027_V1')) try { assignFix1027Once_(); } catch (e) { note_('배정 옵션 빈칸 채우기 실패: ' + e); }
  if (!props.getProperty('BAGASG1027_V1')) try { bagAssign1027Once_(); } catch (e) { note_('치약걸이 보냉백 배정 다시 읽기 실패: ' + e); }
  if (!props.getProperty('CABBAGE_DEL_V1')) try { cabbageRocketDelOnce_(); } catch (e) { note_('양배추채칼외 로켓 응답 지우기 실패: ' + e); }
  if (!props.getProperty('EXPSCHED_V1')) try { expSchedOnce_(); } catch (e) { note_('기대평 2주차 일정 바꾸기 실패: ' + e); }
  if (!props.getProperty('HYOJA1028_V1')) try { hyoja1028Once_(); } catch (e) { note_('효자손외 10.28 만들기 실패: ' + e); }
  if (!props.getProperty('FIX1027B_V1')) try { fix1027bOnce_(); } catch (e) { note_('10/27 저녁 고치기 실패: ' + e); }
  if (!props.getProperty('PROTECT_V1')) try { protectSystemOnce_(); } catch (e) { note_('자동 칸 경고 잠금 실패: ' + e); }
  if (!props.getProperty('RVGUIDE1027_V1')) try { rvGuide1027Once_(); } catch (e) { note_('10.27 리뷰 가이드 다시 쓰기 실패: ' + e); }
  if (!props.getProperty('TUMBRV_V1')) try { tumbRvOnce_(); } catch (e) { note_('텀블러 리뷰 설정 실패: ' + e); }
  if (!props.getProperty('EXPWHO1029_V1')) try { expWho1029Once_(); } catch (e) { note_('기대평 10.29 이름 넣기 실패: ' + e); }
  if (!props.getProperty('EXPWHO1029_V2')) { props.deleteProperty('EXPWHO1029_V1'); props.setProperty('EXPWHO1029_V2', '1'); }   // 10.29 B: '.' → 김혜란 (11.5 공지 다시)
  if (!props.getProperty('SALAD1028_V1')) try { salad1028Once_(); } catch (e) { note_('유러피안샐러드외 장바구니 고치기 실패: ' + e); }
  if (!props.getProperty('OPTPRICE_SEED_V1')) try { optPriceSeedOnce_(); } catch (e) { note_('옵션 가격 기억 실패: ' + e); }
  if (!props.getProperty('PAYRETRO_V2')) try { payRetro2Once_(); } catch (e) { note_('양배추 결제금액 다시 보기 실패: ' + e); }
  if (!props.getProperty('PAYRETRO_V1')) try { payRetroOnce_(); } catch (e) { note_('지난 결제금액 다시 보기 실패: ' + e); }
  if (!props.getProperty('CABBAGE_SOJ_V1')) try { cabbageSojungOnce_(); } catch (e) { note_('양배추채칼외 소정 배정 지우기 실패: ' + e); }
  if (!props.getProperty('HYOJA_ASG_V1')) try { hyojaAssignOnce_(); } catch (e) { note_('효자손 배정 옵션 고치기 실패: ' + e); }
  if (!props.getProperty('TUMB1027_V1')) try { tumbler1027Once_(); } catch (e) { note_('텀블러 옵션 인원 채우기 실패: ' + e); }
  if (!props.getProperty('FIX1027_V1')) try { fix1027Once_(); } catch (e) { note_('10/27 보낼메시지 정리 실패: ' + e); }
  if (!props.getProperty('NAMES1026_V1')) try { names1026Once_(); } catch (e) { note_('효자손·보냉백 이름 맞추기 실패: ' + e); }
  if (!props.getProperty('BAG_SILBIN_V1')) try { bagSilBinOnce_(); } catch (e) { note_('치약걸이 보냉백 실/빈 바꾸기 실패: ' + e); }
  if (!props.getProperty('BUYU_PHOTO_V1')) { props.setProperty('BUYU_PHOTO_V1', '1'); props.setProperty('RVSENT_' + campKey_('#택10.21 써니마켓 부유단감 5') + '_10.21', '1'); note_('✓ 부유단감 10.21 포토 전달됨으로 표시 (사용자 확인)'); }
  if (!props.getProperty('SENT1026_V1')) try { sent1026Once_(); } catch (e) { note_('10.26 공지 보냄 처리 실패: ' + e); }
  if (!props.getProperty('REOPEN_V1')) try { reopenClosedOnce_(); } catch (e) { note_('닫힌 폼 다시 열기 실패: ' + e); }
  if (!props.getProperty('WONGO_V1')) try { fixWongoOnce_(); } catch (e) { note_('원고 가이드 고치기 실패: ' + e); }
  if (!props.getProperty('EXPECT_V6')) try { fixExpect6Once_(); } catch (e) { note_('기대평 하루 3명 실패: ' + e); }
  if (!props.getProperty('EXPECT_V7')) try { fixExpect7Once_(); } catch (e) { note_('기대평 이름 되돌리기 실패: ' + e); }
  if (!props.getProperty('TALKDEAL_DATE_V1')) try { talkdealDateOnce_(); } catch (e) { note_('톡딜 진행일 실패: ' + e); }
  if (!props.getProperty('REDATE_V2')) try { redateNoticesOnce_(); } catch (e) { note_('공지 날짜 바꾸기 실패: ' + e); }
  if (!props.getProperty('TALKDEAL_V2')) try { talkdealNoticeOnce_(); } catch (e) { note_('톡딜 공지 다시 넣기 실패: ' + e); }
  if (!props.getProperty('EXPECT_DUP_V1')) try { expectDupOnce_(); } catch (e) { note_('기대평 공지 하나로 실패: ' + e); }
  if (!props.getProperty('TALKDEAL_V1')) try { talkdealOnce_(); } catch (e) { note_('톡딜 넣기 실패: ' + e); }
  if (!props.getProperty('ANKLEDUP_V1')) try { fixAnkleDupOnce_(readRuns_()); } catch (e) { note_('발목무압박 중복 정리 실패: ' + e); }
  if (!props.getProperty('CEIL2_V1')) try { fixCeilingOnce_(readRuns_()); } catch (e) { note_('실링팬 하루 인원 실패: ' + e); }
  if (!props.getProperty('ORANGE_V1')) try { fixOrangeOnce_(readRuns_()); } catch (e) { note_('오렌지 오타 실패: ' + e); }
  if (!props.getProperty('NECKOPT_V1')) try { fixNeckOptOnce_(readRuns_()); } catch (e) { note_('목보호대 옵션 실패: ' + e); }
  if (!props.getProperty('DAEBONG_V1')) try { fixDaebongOnce_(readRuns_()); } catch (e) { note_('대봉감 이름 실패: ' + e); }
  if (!props.getProperty('OMEGA_V1')) try { fixOmegaOnce_(readRuns_()); } catch (e) { note_('오메가3 날짜 실패: ' + e); }
  if (!props.getProperty('OPTDIGIT_V1')) try { fixOptDigitsOnce_(readRuns_()); } catch (e) { note_('폼 옵션 단일옵션 실패: ' + e); }
  const runs = readRuns_(), times = {};
  step_('알림');
  try { fruitCheck_(runs); } catch (e) { note_('안 산 사람 확인 실패: ' + e); }
  try { takbaeCheck_(runs); } catch (e) { note_('택배시트 알림 실패: ' + e); }
  try { photoWaitCheck_(runs); } catch (e) { note_('포토대기 알림 실패: ' + e); }
  try { photoAskCheck_(runs); } catch (e) { note_('포토 요청 알림 실패: ' + e); }
  try { ensureListMsgs_(runs); } catch (e) { note_('명단 전달 확인 실패: ' + e); }
  try { ensureReviewGuideMsgs_(runs); } catch (e) { note_('리뷰 가이드 메시지 실패: ' + e); }
  try { adoptOrphanForms_(runs); } catch (e) { note_('진행목록에 없는 폼 확인 실패: ' + e); }
  const errs = {}, listed = {};
  // 보낼메시지 점검용 (방 공지가 방마다 하나씩, 그 진행 폼 링크로 맞게 있는지, 사용자 요청 10/21)
  let obAll = []; try { const ob0 = outboxSheet_(), ol0 = ob0.getLastRow(); if (ol0 >= 2) obAll = ob0.getRange(2, 1, ol0 - 1, 6).getValues(); } catch (e) {}
  step_('폼 인원');
  try { ensureSubmitTriggers_(runs); } catch (e) { note_('응답 트리거 실패: ' + e); }
  runs.forEach(function (r) {
    yieldIfWanted_();   // 폼수정 탭 같은 직접 하는 일이 기다리면 진행 하나 끝날 때마다 바로 넘김 (10/26 '폼 인원' 한 단계가 100초 넘어 붙여넣기가 실패)
    if (r['진행 상태'] === '종료' || !r['폼ID']) return;
    // 어제 이전에 끝난 진행은 15분마다 안 봄 (폼을 열 때마다 느리고 구글 쪽 시간 초과가 남. 인원은 매일 9시 현황 업데이트가 다시 셈)
    if (r['진행일'] instanceof Date && r['진행일'] < today_() && runOver_(runs, r)) return;
    // 진행 하나에서 오류가 나도 다른 진행은 계속 (오류는 한눈에 탭 '확인 필요' 칸에 보임)
    try { checkRun_(r); } catch (e) { errs[r['명단 제목']] = String(e.message || e).slice(0, 120); note_('진행 확인 실패 ' + r['명단 제목'] + ': ' + e); }
  });
  // 폼을 다 연결한 뒤 명단 탭이 그 시트의 모든 폼 응답을 합쳐 보여 주게
  step_('명단 시트');
  Object.keys(listed).forEach(function (id) {
    yieldIfWanted_();
    try {
      const lss = SpreadsheetApp.openById(id);
      if (runs.some(function (x) { return String(x['시트ID']) === id && x['실배송'] === 'Y'; })) props.setProperty('LISTREAL_' + id, '1');
      try { if (fixListRef_(lss)) note_('✓ 명단 탭을 값으로 바꿈 (열을 지워도 유지): ' + lss.getName()); else { const na = syncList_(lss); if (na) note_('✓ 명단 탭에 새 응답 ' + na + '줄: ' + lss.getName()); } } catch (e) { note_('명단 탭 갱신 실패: ' + e); }
      // 총건수 = 이 명단 시트를 쓰는 의뢰의 총건수 (없으면 날마다 목표인원 합)
      const mine = runs.filter(function (x) { return String(x['시트ID']) === id; });
      const total = mine.reduce(function (m, x) { return Math.max(m, Number(x['총건수']) || 0); }, 0) ||
        mine.reduce(function (a, x) { return a + (Number(x['목표인원']) || 0); }, 0);
      listSummary_(lss, total);
      if (!props.getProperty('LISTV_' + id)) { try { dayColors_(lss); } catch (e) { note_('명단 날짜 색 실패: ' + e); } }
    } catch (e) { note_('명단 탭 합치기 실패: ' + e); }
  });
  props.setProperty('RUN_ERRORS', JSON.stringify(errs));
  // 리뷰체크 탭은 사용자 요청으로 없앰(10/19). 만들어 둔 탭은 한 번 지움
  try { refreshEditTab_(); } catch (e) { note_('폼수정 탭 새로고침 실패: ' + e); }
  function checkRun_(r) {
    let form;
    try { form = FormApp.openById(r['폼ID']); } catch (e) {
      // 폼ID가 잘못됐으면 같은 폼 링크나 같은 명단 시트의 다른 날 폼으로 고침
      const alt = runs.filter(function (x) { return x !== r && x['폼ID'] && String(x['폼ID']) !== String(r['폼ID']) && ((x['폼 링크'] && x['폼 링크'] === r['폼 링크']) || (x['시트ID'] && String(x['시트ID']) === String(r['시트ID']))); })
        .sort(function (a, b) { return (b['진행일'] || 0) - (a['진행일'] || 0); });
      for (let i = 0; i < alt.length && !form; i++) {
        try { form = FormApp.openById(alt[i]['폼ID']); if (alt[i]['폼 링크'] !== r['폼 링크'] && r['폼 링크'] && alt[i]['폼 링크']) form = null; } catch (e2) { form = null; }
        if (form) { setRun_(r.row, '폼ID', alt[i]['폼ID']); r['폼ID'] = alt[i]['폼ID']; }
      }
      if (!form) throw e;
    }
    // 폼 응답이 진행목록의 명단 시트가 아닌 다른 시트로 가면 알려 줌 (명단이 안 보이는 원인)
    // 폼 응답이 진행목록의 명단 시트로 가게 연결 (다르면 그 시트에 응답 탭이 새로 생기고 지금까지 응답도 같이 들어감)
    if (r['시트ID']) {
      let dest = '';
      try { dest = form.getDestinationId(); } catch (e) {}
      // 연결은 폼·시트 짝마다 한 번만 시도 (매번 하면 응답 탭이 계속 새로 생기고 느려짐)
      const dkey = 'DEST_' + r['폼ID'] + '_' + r['시트ID'];
      if (dest !== String(r['시트ID']) && !props.getProperty(dkey)) {
        props.setProperty(dkey, '1');
        try {
          form.setDestination(FormApp.DestinationType.SPREADSHEET, String(r['시트ID']));
          SpreadsheetApp.flush();
          note_('✓ ' + bareTitle_(r['명단 제목']) + ' 폼 응답을 명단 시트로 연결');
        } catch (e) { errs[r['명단 제목']] = '폼 응답을 명단 시트로 연결하지 못했어요: ' + e.message; }
      } else if (dest && dest !== String(r['시트ID'])) errs[r['명단 제목']] = '폼 응답이 진행목록의 명단 시트가 아닌 다른 시트로 가요';
      listed[r['시트ID']] = 1;
    }
    // 오늘·앞으로 진행할 폼에는 '방에 참여한 카카오톡 닉네임' 질문이 꼭 있게 (예전 폼을 이어 쓰는 의뢰도)
    //  공지에 옛 폼 링크가 남아 그 폼으로 들어오는 경우(10/19 김설하·김동욱 닉네임 빈칸)도 있어서, 이 진행 응답을 받는 폼 전부 + 필수로
    if (r['진행일'] instanceof Date && r['진행일'] >= today_() && !isExpect_(r)) {   // 기대평 폼은 질문이 따로라 안 건드림
      if (!globalThis.__OBROWS) { try { globalThis.__OBROWS = outboxRows_(); } catch (e) { globalThis.__OBROWS = []; } }
      const fids = runFormIds_(r, runs, globalThis.__OBROWS).concat(String(props.getProperty('ORPHANS_' + r['시트ID']) || '').split(',').filter(Boolean));
      fids.filter(function (x, i, a) { return a.indexOf(x) === i; }).forEach(function (fid) {
        // 폼 질문 확인은 폼마다 6시간에 한 번 (10/23 정리: 15분마다 폼 질문을 다 훑어서 느렸음)
        const qk = 'NQ_' + fid + '_' + (r['실배송'] === 'Y' ? 1 : 0), qc = CacheService.getScriptCache();
        if (qc.get(qk)) return;
        qc.put(qk, '1', 21600);
        try {
          const f = String(fid) === String(r['폼ID']) ? form : FormApp.openById(fid);
          if (ensureNickQuestion_(f)) note_('✓ ' + bareTitle_(r['명단 제목']) + ' 폼에 닉네임 질문 넣음' + (f === form ? '' : ' (공지 속 다른 폼)'));
          if (f !== form) fixFormQuestions_(f, r['실배송'] === 'Y');
        } catch (e) { note_(bareTitle_(r['명단 제목']) + ' 닉네임 질문 실패: ' + e.message); }
      });
      try { const qc = CacheService.getScriptCache(), qk = 'NQF_' + r['폼ID'] + '_' + (r['실배송'] === 'Y' ? 1 : 0); if (!qc.get(qk)) { qc.put(qk, '1', 21600); fixFormQuestions_(form, r['실배송'] === 'Y'); } } catch (e) {}
    }
    const w = windowOf_(runs, r);
    if (Date.now() < w.from) return;   // 아직 시작 전인 다음 일차
    // 인원은 폼에 들어온 응답으로 셈 (마감된 뒤에도 지우거나 늦게 들어온 게 반영되게)
    const tk = r['시트ID'] + '|' + r['폼ID'];
    if (!times[tk]) {
      const ft = form.getResponses().map(function (x) { return x.getTimestamp().getTime(); });
      try { times[tk] = allRespTimes_(r['시트ID'], r['폼ID'], ft); } catch (e) { times[tk] = ft; }
    }
    // 폼에는 응답이 있는데 명단 시트에 응답 탭이 없거나 비어 있으면 폼 응답을 다시 연결 (구글이 연결을 늦게 하거나 놓친 경우)
    try { const why = relinkIfMissing_(r, form); if (why) { errs[r['명단 제목']] = why; note_('✓ ' + bareTitle_(r['명단 제목']) + ': ' + why); } } catch (e) { errs[r['명단 제목']] = '응답 연결 확인 실패: ' + e.message; }
    const n = runCount_(runs, r, times[tk]);
    if (Number(r['인원']) !== n) setRun_(r.row, '인원', n);
    try { const fb = fillBlankNicks_(r, w); if (fb) note_('✓ ' + bareTitle_(r['명단 제목']) + ' 카톡 닉네임 빈칸 채움: ' + fb); } catch (e) { note_('닉네임 빈칸 채우기 실패: ' + e.message); }
    // 블랙리스트 사람이 폼을 냈으면 한눈에 '확인 필요' 칸 + 메일 한 번
    if (r['진행일'] instanceof Date && r['진행일'] >= new Date(today_().getTime() - 86400000)) {
      try {
        const bh = blackInRun_(r, w);
        if (bh.length) {
          errs[r['명단 제목']] = '⛔ 블랙리스트 응답: ' + bh.join(', ') + ' (폼수정 탭에서 지우세요)';
          const bk = 'BLKMAIL_' + String(r['명단 제목']).replace(/\s+/g, '') + '_' + bh.join(',');
          if (!props.getProperty(bk)) { props.setProperty(bk, '1'); MailApp.sendEmail(me, '[체험단] ⛔ 블랙리스트 응답: ' + bh.join(', '), bareTitle_(r['명단 제목']) + ' 폼에 블랙리스트에 있는 사람(' + bh.join(', ') + ')이 응답했어요.\n관리 시트 폼수정 탭에서 그 응답을 지우세요.'); }
        }
      } catch (e) { note_('블랙리스트 확인 실패: ' + e.message); }
    }
    // 진단: 폼 응답 수 / 명단 시트 응답 탭 수 / 명단 탭에 보이는 수 (그날 몫)가 다르면 한눈에 '확인 필요' 칸에 적음
    if (!errs[r['명단 제목']] && n > 0) {
      try {
        const inW = function (t) { return t >= w.from && t < w.to; };
        const sheetN = allRespTimes_(r['시트ID']).filter(inW).length;
        const lss0 = SpreadsheetApp.openById(r['시트ID']);
        const lt = lss0.getSheetByName(MERGE_TAB);
        if (!lt) { buildMergeTab_(lss0); throw { quiet: 1 }; }   // 합본 탭을 이제 만들었으면 이번엔 안 비교 (다음 확인부터)
        const listN = lt && lt.getLastRow() >= 3 ? lt.getRange(3, 1, lt.getLastRow() - 2, 1).getValues().filter(function (x) { const t = tsMs_(x[0]); return isFinite(t) && inW(t); }).length : 0;
        if (sheetN !== n || listN !== n) errs[r['명단 제목']] = '응답 수가 안 맞아요: 폼 ' + n + ' / 응답 탭 ' + sheetN + ' / 합본 ' + listN + (lt ? ' (합본 A3: ' + String(lt.getRange('A3').getFormula()).slice(0, 60) + ')' : ' (합본 탭 없음)');
      } catch (e) { if (!e || !e.quiet) errs[r['명단 제목']] = '응답 수 확인 실패: ' + (e && e.message); }
    }
    // 목표보다 많이 들어오면 한눈에 '확인 필요' 칸에만 표시 (폼은 안 닫음, 사용자 요청 10/21)
    if (r['목표인원'] && n > Number(r['목표인원'])) errs[r['명단 제목']] = (errs[r['명단 제목']] ? errs[r['명단 제목']] + ' / ' : '') + '초과 ' + (n - Number(r['목표인원'])) + '명 (목표 ' + r['목표인원'] + ', 받은 ' + n + ')';
    try {
      if (r['진행일'] instanceof Date && dayStart_(r['진행일']) >= today_().getTime() && r['폼 링크']) {
        const room = String(r['카톡방'] || bareTitle_(r['명단 제목']));
        const notices = obAll.filter(function (v) { return String(v[3]) === room && /양식 작성 폼/.test(String(v[4])); });
        const wrong = notices.filter(function (v) { return String(v[4]).indexOf(String(r['폼 링크'])) === -1; });
        const pend = notices.filter(function (v) { return v[5] !== '보냄'; });
        const msg = !notices.length ? '📭 보낼메시지에 방 공지 없음' : wrong.length ? '🔀 방 공지 ' + wrong.length + '개가 다른 진행 내용 (폼 링크 다름)' : pend.length > 1 ? '📑 방 공지가 ' + pend.length + '개 (하나만 보내기)' : '';
        if (msg) errs[r['명단 제목']] = (errs[r['명단 제목']] ? errs[r['명단 제목']] + ' / ' : '') + msg;
      }
    } catch (e) {}
    try { if (photoLate_(r, props)) errs[r['명단 제목']] = (errs[r['명단 제목']] ? errs[r['명단 제목']] + ' / ' : '') + '📷 업체 포토 아직 (사장님께 요청)'; } catch (e) {}
    if (!r['목표인원'] || r['마감 시각'] || n < Number(r['목표인원'])) return;
    // 명단 시트(합본)에 실제로 다 들어왔을 때만 명단 전달 (폼→시트가 늦게 옮겨질 때 4명인데 명단 보내라고 뜬 문제, 10/22)
    try {
      const lt2 = SpreadsheetApp.openById(r['시트ID']).getSheetByName(MERGE_TAB);
      const got2 = lt2 && lt2.getLastRow() >= 3 ? lt2.getRange(3, 1, lt2.getLastRow() - 2, 1).getValues().filter(function (x) { const t = tsMs_(x[0]); return isFinite(t) && t >= w.from && t < w.to; }).length : 0;
      if (got2 < Number(r['목표인원'])) { try { syncList_(SpreadsheetApp.openById(r['시트ID'])); } catch (e) {} try { soonCheck_(); } catch (e) {} return; }
    } catch (e) { return; }
    // 폼은 안 닫음 (사용자 요청 10/21) → 인원이 차면 마감 시각만 적고 명단·리뷰 가이드 메시지
    setRun_(r.row, '마감 시각', new Date());
    changed = true;
    const listMsg = pendingListMsg_(r) || queueListMsgs_(r);
    // 폼이 다 차면 리뷰 가이드도 바로 보낼메시지에 (다음 확인까지 안 기다리게, 사용자 요청 10/21)
    try { ensureReviewGuideMsgs_(readRuns_()); } catch (e) { note_('리뷰 가이드 메시지 실패: ' + e); }
    MailApp.sendEmail(me, '[체험단] 명단 마감: ' + r['명단 제목'], [
      '신청 ' + n + '명이 모여서 폼을 자동으로 닫았어요.',
      dupSummary_(r['시트ID']),
      '',
      '[명단방에 붙여넣을 문구]',
      listMsg,
      '',
      '보낼 메시지함 (아이폰에서 복사해서 보내기): ' + outboxUrl_(),
      '',
      '잘못 산 사람을 빼려면 관리 시트 폼수정 탭에서 지우세요. 인원이 모자라면 폼이 다시 열려요.',
      r['택대'] === 'Y' ? '\n★ 택배시트에 옮겨 적기 (2시 전까지): 한눈에 탭에서 A~K 복사 → 붙여넣기 → \'택배 옮김\' 체크' : ''
    ].join('\n'));
  }
  step_('한눈에');
  try { buildDashboard_(false); } catch (e) { note_('한눈에 탭 실패: ' + e); }
  // 월급시트·배정 수식은 진행이 바뀌었을 때(인원·방제·날짜·상태) 또는 30분마다만 (10/23 정리: 매번 하면 확인이 5분 넘게 걸려 명단이 늦게 뜸)
  const rr = readRuns_(), sigOf = function (o) { return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(o), Utilities.Charset.UTF_8)); };
  const live = rr.filter(function (r) { return r['진행 상태'] !== '종료'; });
  const runSig = sigOf([Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyyMMdd'), live.map(function (r) { return [r['명단 제목'], String(r['진행일']), r['시트ID'], r['폼ID'], r['진행 상태']]; })]);
  const paySig = sigOf([runSig, live.map(function (r) { return [r['인원'], r['목표인원'], r['가격'], r['총건수'], r['업체'], r['구매시간']]; })]);
  const slowAge = Date.now() - Number(props.getProperty('SLOW_AT') || 0), slow = slowAge > 30 * 60000;
  if (slow || props.getProperty('RUN_SIG') !== runSig) {
    step_('배정 수식'); try { refreshAssignFormulasOnce_(rr); props.setProperty('RUN_SIG', runSig); } catch (e) { note_('배정 수식 갱신 실패: ' + e); }
  }
  // 급하지 않은 정리(취완·리뷰 독촉·리뷰 보고·사용법 탭 등)는 30분마다. 밀렸으면 월급시트보다 먼저 (월급시트는 나눠서 다음 확인에서 이어 함)
  //  10/26: 월급시트가 매번 90초 걸려 4분을 넘기는 바람에 정리가 16:53부터 2시간 넘게 안 돌았음 → 정리 시각이 안 바뀌어 월급시트가 또 매번 도는 악순환
  //  1시간 넘게 밀리면 조금 늦게(4분 30초 전까지) 시작해도 돌림. 2시간 넘게 못 돌면 실행 기록에 ⚠
  if (slow && !late_(slowAge > 60 * 60000 ? 270 : 240)) { step_('정리'); slowTasks_(rr, listed); }
  else if (slow && slowAge > 120 * 60000) note_('⚠ 정리(취완·리뷰 독촉·리뷰 보고)가 ' + Math.floor(slowAge / 3600000) + '시간 넘게 못 돌았어요: 확인이 오래 걸려서 (다음 확인에서 다시)');
  if (CONFIG.PAY_SHEET_ID && (slow || props.getProperty('PAY_SIG') !== paySig || props.getProperty('PAY_PENDING'))) {
    props.setProperty('PAY_PENDING', '1');   // 끝나야 지움 → 시간이 모자라면 다음 확인 끝에서 이어서 (한 일은 다시 안 함)
    if (!late_(250)) {
      step_('월급시트');
      try { updatePay_(true); props.setProperty('PAY_SIG', paySig); props.deleteProperty('PAY_PENDING'); }
      catch (e) { if (e && e.payLate) note_('✓ 월급시트 나눠서 하는 중 (' + e.payLate + ', 다음 확인에서 이어서. 오류 아님)'); else note_('월급시트 갱신 실패: ' + e); }
    }
  }
}
// 30분 정리: 다 끝나야 시각을 적음 (중간에 끊기면 다음 확인에서 다시)
function slowTasks_(rr, listed) {
  rr = rr || readRuns_(); listed = listed || {};
  const rvN = function () { return Object.keys(PropertiesService.getScriptProperties().getProperties()).filter(function (k) { return /^(RVDONE_|RVRPT_|RVZIPURL_)/.test(k); }).length; }, rv0 = rvN();
  try { reviewDone_(readRuns_()); } catch (e) { note_('리뷰 완료 확인 실패: ' + e); }
  // 의뢰 리뷰가 다 끝나거나 압축 파일이 처음 생기면 한눈에 '리뷰 취합할 것'에 바로 보이게 다시 그림 (전엔 한눈에를 먼저 그려서 15~30분 늦게 떴음, 10/25)
  if (rvN() !== rv0 && !late_(300)) { try { buildDashboard_(false); } catch (e) { note_('한눈에 탭 실패: ' + e); } }
  try { listTabsRecent_(rr, listed); } catch (e) { note_('지난 명단 탭 실패: ' + e); }
  try { blackSheet_(); } catch (e) { note_('블랙리스트 탭 만들기 실패: ' + e); }
  try { ensureUsageTab_(); } catch (e) { note_('사용법 탭 만들기 실패: ' + e); }
  try { cleanListSheetsOnce_(rr); } catch (e) { note_('명단 시트 표시 정리 실패: ' + e); }
  try { pruneOutbox_(); } catch (e) { note_('보낸 메시지 정리 실패: ' + e); }
  try { ensureEditTab_(); } catch (e) { note_('폼수정 탭 만들기 실패: ' + e); }
  PropertiesService.getScriptProperties().setProperty('SLOW_AT', String(Date.now()));
}

// 명단방 형식 (사장님 예시): 시트 링크 → 빈 줄 → 명단 제목
//  업체방(업체 명단)은 안 넣음: 아직 업체 명단방에 없어서 (사용자 요청 10/19). 다시 쓰려면 SEND_COMPANY_LIST = true
const SEND_COMPANY_LIST = false;
// 명단 전달 글: 시트 링크 + 명단 제목(닉네임 붙임). 의뢰 마지막 날이면 맨 밑에 '10.14~ 10.21  50건 구매완료', 하루로 끝나는 의뢰는 '마지막' (사용자 요청 10/21)
function listMsgText_(r) {
  let t = String(r['명단 제목']).trim();
  if (!/\([^)]*\)\s*$/.test(t)) t += ' (뽀짝오리)';
  let tail = '';
  try {
    const runs = readRuns_(), me = runs.filter(function (x) { return x.row === r.row; })[0] || r;
    const sib = siblings_(runs, me), total = Number(me['총건수']) || 0;
    const got = sib.reduce(function (a, x) { return a + (Number(x['인원']) || 0); }, 0);
    if (total && sib.length && sib[sib.length - 1].row === me.row && got >= total) {
      const md = function (x) { return (x['진행일'].getMonth() + 1) + '.' + String(x['진행일'].getDate()).padStart(2, '0'); };
      tail = sib.length === 1 ? '마지막' : md(sib[0]) + '~ ' + md(me) + '  ' + (isExpect_(me) ? EXP_LINKS.length * 15 + '건 작성완료' : total + '건 구매완료');
    }
  } catch (e) {}
  // 앞 진행일보다 공지 가격이 바뀌었으면 '가격변동 9100 > 9200' (사용자 요청 10/28 마켓담온 귤). 그날 방 공지(없으면 폼 설명)의 🐥가격
  if (!/가격변동/.test(tail)) try {
    const runs2 = readRuns_(), me2 = runs2.filter(function (x) { return x.row === r.row; })[0] || r, sib2 = siblings_(runs2, me2), i2 = sib2.findIndex(function (x) { return x.row === me2.row; });
    if (i2 > 0) {
      const pr = function (x) { const ps = (noticeProducts_(dayNotice_(x))[0] || {}).prices || []; return ps.length === 1 ? ps[0] : 0; };
      const a = pr(sib2[i2 - 1]), b = pr(me2);
      if (a && b && a !== b) tail = (tail ? tail + '\n' : '') + '가격변동 ' + a + ' > ' + b;
    }
  } catch (e) {}
  // 그날 모자라서 다음 날로 넘긴 건수 (shrinkToGot_이 저장, 10/27 사용자 캡처 모양)
  let sk = '';
  try { sk = PropertiesService.getScriptProperties().getProperty(listShortKey_(r)) || ''; } catch (e) {}
  if (cartN_(r) > 1) tail = (tail ? tail + '\n' : '') + '장바구니건';   // 사용자 요청 10/28
  return r['시트 링크'] + '\n\n' + t + (tail ? '\n' + tail : '') + (sk ? '\n\n' + sk : '');
}
// 이 진행의 명단 전달이 아직 안 보내고 대기 중이면 새로 넣지 않고 그 글을 지금 내용으로 고침 (인원을 늘려 다시 마감될 때 두 줄 생기지 않게, 10/26)
function pendingListMsg_(r) {
  const ob = outboxSheet_(), ol = ob.getLastRow();
  if (ol < 2) return '';
  const want = listMsgText_(r);
  let hit = '';
  ob.getRange(2, 1, ol - 1, 6).getValues().forEach(function (v) {
    if (hit || v[2] !== '명단 전달' || v[5] !== '대기') return;
    if (!String(v[4]).split('\n').some(function (l) { return l.trim() && sameRunTitle_(l, r['명단 제목']); })) return;
    if (String(v[4]) !== want) obSet_(ob, v[0], 5, want);
    hit = want;
  });
  return hit;
}
function queueListMsgs_(r, onlyWithRoom) {
  const listMsg = listMsgText_(r);
  queueMsg_(CONFIG.ROOM_LIST, listMsg, '명단 전달');
  if (SEND_COMPANY_LIST && (!onlyWithRoom || String(r['업체방'] || '').trim())) queueMsg_(r['업체방'], listMsg + '\n오늘 명단입니다. 실시간 시트에서 확인 부탁드립니다!', '업체 명단');
  return listMsg;
}

// 오늘 마감됐는데 명단 전달 메시지가 없는 진행(방제 숫자를 고쳐서 조용히 마감된 것 등)은 지금 넣음.
//  대기 중인 명단 전달이 옛 방제면 새 방제로 고침
function ensureListMsgs_(runs) {
  const tk = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyyMMdd');
  const ob = outboxSheet_(), last = ob.getLastRow();
  const v = last >= 2 ? ob.getRange(2, 1, last - 1, 6).getValues() : [];
  runs.forEach(function (r) {
    if (r['진행 상태'] === '종료' || !(r['마감 시각'] instanceof Date) || !r['시트 링크']) return;
    if (Utilities.formatDate(r['마감 시각'], CONFIG.TIMEZONE, 'yyyyMMdd') !== tk) return;
    if (PropertiesService.getScriptProperties().getProperty('NOLISTMSG_' + bareTitle_(r['명단 제목']).replace(/\s+/g, ''))) return;   // 인원을 줄여서 끝낸 진행: 보낸 메시지를 고치는 할 일로 대신
    const want = listMsgText_(r);
    let found = false;
    v.forEach(function (x, i) {
      if (x[2] !== '명단 전달') return;
      if (!String(x[4]).split('\n').some(function (l) { return l.trim() && sameRunTitle_(l, r['명단 제목']); })) return;
      found = true;
      if (x[5] === '대기' && String(x[4]) !== want) obSet_(ob, x[0], 5, want);
    });
    if (!found) { queueListMsgs_(r, true); note_('✓ 명단 전달 메시지 넣음: ' + bareTitle_(r['명단 제목'])); }
  });
}

// 그날 명단이 다 차면(마감) 그 카톡방에 보낼 '리뷰내용 가이드'를 보낼메시지(방 공지)에 넣음 (사용자 요청 10/19, 안 까먹게)
//  ⭐️리뷰내용 가이드⭐️ / 포토+한줄리뷰(1명) : 이름 / 별점(6명) : 이름 … / ⭐️⭐️⭐️⭐️⭐️(의뢰서 리뷰내용 가이드) !!!!!⭐️⭐️⭐️⭐️⭐️
//  리뷰 종류·개수와 가이드는 생성기가 넘긴 RV_<명단시트ID>(의뢰서 전체). 그날 몫은 남은 개수 비율대로. 이름은 배정 탭(공지 이름) 순서, 없으면 폼 카톡 닉네임
//  가이드나 리뷰 종류가 의뢰서에 없으면 메시지에 표시 + '사장님께 물어보기' 할 일도 넣음. 포토대기(업체 사진)·구확건 의뢰는 리뷰 배정 페이지로
function reviewGuideMsg_(rv, ppl, counts, k) {
  // 의뢰서 가이드 칸 정리 (10/23): '별점 13개 사진 7개 텍스트 10개'처럼 리뷰 개수가 가이드 칸에 들어갔으면 개수로 옮기고,
  //  '없음', '대표님을 믿습니다'처럼 가이드가 아닌 말은 뺌 (가이드 없음 = 사장님께 물어보지 않음)
  rv = Object.assign({}, rv);
  const NOG = /^(없음|없어요|없습니다|x|-|무|자율|자유|알아서.*|대표님(을|께)?\s*믿습니다\.?!?|믿습니다\.?)$/i;
  let noGuide = false;
  const gl = String(rv.guide || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean).filter(function (x) {
    if (NOG.test(x.replace(/[.!~\s]+$/, '').trim()) || NOG.test(x)) { noGuide = true; return false; }
    if (/^((별점|사진|포토|텍스트|글씨|한\s*줄|1줄)\S*\s*\d+\s*(개|건|명)?[\s,/]*)+$/.test(x)) { if (!String(rv.mix || '').trim()) rv.mix = x; return false; }
    return true;
  });
  rv.guide = gl.join('\n');
  const totals = [];
  parseRvMix_(rv.mix || '').forEach(function (p) { p.mix.forEach(function (m) { const t = totals.filter(function (x) { return x.label === m.label; })[0]; if (t) t.n += m.n; else totals.push({ label: m.label, n: m.n }); }); });
  const left = totals.map(function (t) { return t.n; });
  let today = totals.map(function () { return 0; });
  for (let d = 0; d <= k; d++) {
    let n = counts[d] || 0;
    today = totals.map(function () { return 0; });
    while (n > 0 && left.some(function (x) { return x > 0; })) {
      let bi = -1, bv = -1;
      left.forEach(function (x, i) { const q = x / (totals[i].n || 1); if (x > 0 && q > bv) { bv = q; bi = i; } });
      today[bi]++; left[bi]--; n--;
    }
  }
  const pretty = function (l) { return String(l).replace(/포토\s*리뷰\s*\(\s*(1|한)\s*줄\s*리뷰\s*\)/, '포토+한줄리뷰').replace(/별점만/, '별점').replace(/글씨리뷰/, '텍스트리뷰').replace(/^사진$/, '포토'); };
  const nm = function (p) { return p.n > 1 ? p.nm + p.n : p.nm; };
  const lines = [], queue = ppl.slice();
  let pw = [];   // 업체 사진을 기다리는 몫(포토대기): 리뷰 가이드 대신 ⭐️포토대기⭐️
  const ask = [];
  // 가이드: 상품마다 '상품 : 줄 / 줄 / …' (한 줄이면 상품 하나). 줄은 원래대로 한 줄씩
  const prods = String(rv.guide || '').split('\n').map(function (x) { return x.replace(/[^:：\s/][^:：/]{0,30}(예시|요청|참고)\s*[:：]\s*/g, ' ').trim(); }).filter(Boolean).map(function (x) {
    const m = x.match(/^([^:：/]{1,20})\s*[:：]\s*(.+)$/);
    const body = m ? m[2] : x;
    return { name: m ? m[1].trim() : '', lines: body.split(/\s*\/\s*/).map(function (y) { return y.trim(); }).filter(Boolean) };
  });
  const multi = prods.length > 1 && prods.every(function (p) { return p.name; });
  const used = [];
  // 색상(옵션)마다 포토 한 명 (사용자 요청 10/27 텀블러): 포토 몫은 아직 포토가 없는 옵션을 산 사람부터 먼저 고름. rv.photoUsed = 이미 포토가 나간 옵션
  const pre = {}, photoUsed = (rv.photoUsed || []).slice(), photoOpts = [];
  if (rv.photoPerOpt) totals.forEach(function (t, i) {
    if (!/포토|사진/.test(t.label) || /대기/.test(t.label)) return;
    let need = today[i]; pre[i] = [];
    queue.slice().forEach(function (p) {
      if (need <= 0 || !p.opt || photoUsed.indexOf(p.opt) >= 0) return;
      queue.splice(queue.indexOf(p), 1); pre[i].push(p); need -= p.n; photoUsed.push(p.opt); photoOpts.push(p.opt);
    });
  });
  totals.forEach(function (t, i) {
    const who = (pre[i] || []).slice();
    let need = today[i] - who.reduce(function (a, y) { return a + y.n; }, 0);
    while (need > 0 && queue.length) { const p = queue.shift(); who.push(p); need -= p.n; }
    if (today[i] <= 0) return;
    if (/포토\s*대기/.test(t.label)) { pw = pw.concat(who); return; }
    const note = rv.lineNote && rv.lineNote[pretty(t.label)];   // 종류 줄 밑 한 줄 설명 (→ 별점 5점만 …)
    lines.push(pretty(t.label) + '(' + today[i] + '명) : ' + who.map(nm).join(' ') + (note ? '\n' + note : ''));
    used.push.apply(used, who);
  });
  if (!totals.length) { if (queue.length) { lines.push((rv.kind === 'self' || rv.kind === 'photo' || /사진|촬영|컷|포토/.test(rv.guide || '') ? '포토리뷰' : '텍스트리뷰') + '(' + queue.reduce(function (a, y) { return a + y.n; }, 0) + '명) : ' + queue.map(nm).join(' ')); used.push.apply(used, queue); } }
  else if (queue.length) { lines.push('리뷰 종류 확인 필요(' + queue.reduce(function (a, y) { return a + y.n; }, 0) + '명) : ' + queue.map(nm).join(' ')); ask.push('리뷰 종류·개수'); used.push.apply(used, queue); }
  if (!prods.length && !noGuide) ask.push('리뷰내용 가이드');
  // 상품이 여럿이면 상품마다 [그 상품 산 사람] + 가이드 (옵션 글에 상품 이름 끝말이 있으면 그 상품)
  const EMO = function (n) { return /양말/.test(n) ? '🧦' : /담요|이불|블랭킷/.test(n) ? '🧶' : '🐥'; };
  const suf2 = function (a) { return String(a).replace(/\s+/g, '').slice(-2); };
  const mkBody = function (used) {
  const body = [];
  if (multi) {
    prods.forEach(function (p, i) {
      const who = used.filter(function (x) { return x.opt && x.opt.replace(/\s+/g, '').indexOf(suf2(p.name)) >= 0; });
      body.push(EMO(p.name) + p.name + ' 리뷰내용 가이드 : ', who.length ? '[' + who.map(nm).join(' ') + ']' : '', '');
      body.push.apply(body, p.lines); body.push('');
    });
  } else if (prods.length) {
    const ls = prods[0].lines.slice();
    // 맨 앞 짧은 부탁 문장(최대한 티안나게 깔끔하게 해주세요)은 '하단 내용 참고하셔서 …!'로
    if (ls.length > 1 && /해\s*주세요\s*[.!]*$/.test(ls[0]) && ls[0].length <= 30) body.push('하단 내용 참고하셔서 ' + ls.shift().replace(/[.!\s]+$/, '') + '!', '');
    body.push.apply(body, ls); body.push('');
  }
  return body;
  };
  const days = 7;   // 맺음말은 모든 플랫폼 '7일이내' (사용자 요청 10/21)
  // 맨 밑 고정 (10/23): … 🐥 / 빈 줄 / 전체 리뷰완료 후 @회오리 태그걸어주세요! / 0/(그 방 인원) / 빈 줄 / 🐥
  const BAR = '🐥🐥🐥🐥🐥🐥🐥🐥🐥🐥';
  const foot = function (n) { return [BAR, '배송완료 후 ' + days + '일이내로 작성해주시되', '몰리지 않게 리뷰 부탁드려요!', '감사합니다 🫶🏻', BAR, '', '전체 리뷰완료 후 @회오리 태그걸어주세요!', '0/' + n, '', BAR]; };
  const sumN = function (people) { return people.reduce(function (a, y) { return a + (y.n || 1); }, 0); };
  // 리뷰 종류 줄 사이는 빈 줄 (별점(13명) : … / 빈 줄 / 텍스트(10명) : …)
  const spread = function (head) { const o = []; head.forEach(function (h, i) { if (i) o.push(''); o.push(h); }); return o; };
  const guideOf = function (head, people) { return ['🐥리뷰내용 가이드🐥', ''].concat(spread(head), [''], prods.length ? mkBody(people) : noGuide ? [] : ['(리뷰 가이드: 사장님께 물어보고 채우기)', ''], foot(sumN(people))).join('\n'); };
  const pwLine = pw.length ? '포토리뷰(' + pw.reduce(function (a, y) { return a + y.n; }, 0) + '명) : ' + pw.map(nm).join(' ') : '';
  // 한 방에 텍스트와 포토(업체 사진 대기)가 섞이면 가이드 하나에 둘 다, 맨 밑 0/그 방 인원 (사용자 요청 10/26: 실링팬 2인데 0/1로 나뉘어 나옴)
  if (lines.length && pw.length) return { msg: guideOf([pwLine].concat(lines), pw.concat(used)), ask: ask, photoWait: true, pwMsg: '', photoOpts: photoOpts };
  const msg = lines.length ? guideOf(lines, used) : '';
  // 방 사람이 모두 업체 사진 대기면 가이드는 미리 만들어 두고 사진 전달 뒤 보냄 (사용자 요청 10/21)
  const pwMsg = pw.length ? guideOf([pwLine], pw) : '';
  return { msg: msg, ask: ask, photoWait: pw.length > 0, pwMsg: pwMsg, photoOpts: photoOpts };
}
// 그날 응답의 수령인(계정) 이름 순서대로 [{nm, n:1}] (한 사람이 두 계정이면 계정마다 따로). 수령인 칸: 수령인·수취인·이름·성함
function receivers_(r, w) {
  const info = rawInfo_(r['시트ID'], r['폼ID']), src = info.src || info.raw, st = info.start || 2, lr = src.getLastRow();
  const head = info.head.map(hk_);
  let c = head.findIndex(function (h) { return /수령인|수취인/.test(h); });
  if (c < 0) c = head.findIndex(function (h) { return /^이름$|^성함$|^이름\s*\(|^성함\s*\(/.test(h); });
  if (c < 0) c = head.findIndex(function (h) { return /이름|성함/.test(h) && !MATCH.nick.test(h) && !MATCH.account.test(h) && !/쿠팡|닉네임/.test(h); });
  if (c < 0 || lr < st) return [];
  const co = head.findIndex(function (h) { return MATCH.opt.test(h); });   // 고른 옵션 (상품이 여럿이면 어느 상품인지)
  const rows = [];
  src.getRange(st, 1, lr - st + 1, head.length).getValues().forEach(function (x) {
    const t = tsMs_(x[0]);
    if (!isFinite(t) || t < w.from || t >= w.to) return;
    const nm = String(x[c]).replace(/\s+/g, '');
    if (nm) rows.push({ t: t, nm: nm, n: 1, opt: co >= 0 ? String(x[co]) : '' });
  });
  rows.sort(function (a, b) { return a.t - b.t; });
  return rows.map(function (x) { return { nm: x.nm, n: 1, opt: x.opt }; });
}
function ensureReviewGuideMsgs_(runs) {
  const props = PropertiesService.getScriptProperties(), now = Date.now();
  let assign = null;
  const namesOf = function (x) {
    if (!assign) { assign = []; try { const as = assignSheet_(), al = as.getLastRow(); if (al >= 2) assign = as.getRange(2, 1, al - 1, 4).getValues(); } catch (e) {} }
    const out = [];
    assign.forEach(function (v) { if (String(v[0]) === String(x['명단 제목']) && Number(v[3]) > 0) out.push({ nm: String(v[1]).replace(/\s+/g, ''), n: Number(v[3]) || 1 }); });
    return out;
  };
  chainsOf_(runs).forEach(function (c) {
    c.runs.forEach(function (r, k) {
      if (isExpect_(r)) return;   // 기대평: 가이드는 방 공지에 이미
      if (r['진행 상태'] === '종료' || !(r['마감 시각'] instanceof Date) || now - r['마감 시각'].getTime() > 2 * 86400000) return;
      // V2(10/19): 카톡 이름 대신 수령인(계정) 이름으로. 예전(카톡 이름) 메시지가 아직 대기면 새 글로 바꿈, 보냈으면 그대로
      const key0 = 'RVMSG_' + String(r['명단 제목']).replace(/\s+/g, ''), key = 'RVMSG2_' + String(r['명단 제목']).replace(/\s+/g, '');
      if (props.getProperty(key)) { try { refreshGuide_(r, k, c); } catch (e) { note_('리뷰 가이드 다시 맞추기 실패: ' + e); } return; }
      // 방제를 바꿔도 같은 날 같은 명단이면 한 번만 (10/21 부유단감 두 번 들어간 것)
      const keyD = 'RVMSGD_' + r['시트ID'] + '_' + Utilities.formatDate(r['진행일'] instanceof Date ? r['진행일'] : new Date(), CONFIG.TIMEZONE, 'yyyyMMdd');
      if (props.getProperty(keyD)) { props.setProperty(key, '1'); return; }
      props.setProperty(keyD, '1');
      const first = c.runs.filter(function (x) { return x['시트ID']; })[0] || r;
      let rv = null; try { rv = JSON.parse(props.getProperty('RV_' + first['시트ID']) || 'null'); } catch (e) {}
      // 포토제공(사진 받은 뒤 진행 도우미로 세트 배정)·구매확정만은 리뷰 가이드 없음. 리뷰 정보가 없는 예전 진행도 이름은 넣고 가이드는 '사장님께 물어보기'로 (10/21)
      if (!rv) rv = { kind: 'text', mix: '', guide: '' };
      if (rv.kind === 'confirm') return;
      // 원고제공·자율 의뢰는 사용자 원고 가이드 글 (전체 포토리뷰, 10/23)
      if (isWongo_(rv)) { queueMsg_(String(r['카톡방'] || bareTitle_(r['명단 제목'])), WONGO_GUIDE, '방 공지'); note_('✓ 원고 리뷰 가이드 넣음: ' + bareTitle_(r['명단 제목'])); return; }
      // 포토제공 의뢰: 폼이 차면 그 방에 '⭐️포토대기⭐️' (사진은 받은 뒤 따로, 사용자 요청 10/21)
      const photoAll = rv.kind === 'photo';   // 포토제공: ⭐️포토대기⭐️ + 가이드는 '포토전달대기'로 미리
      props.setProperty(key, '1');
      const old = !!props.getProperty(key0);
      props.setProperty(key0, '1');
      let ppl = [];
      try { ppl = receivers_(r, windowOf_(runs, r)); } catch (e) { note_('리뷰 가이드 수령인 찾기 실패: ' + e.message); }
      if (!ppl.length) ppl = namesOf(r);
      if (!ppl.length) {
        try {
          const info = rawInfo_(r['시트ID'], r['폼ID']), w = windowOf_(runs, r), src = info.src || info.raw, st = info.start || 2, lr = src.getLastRow();
          if (info.nickCol && lr >= st) src.getRange(st, 1, lr - st + 1, info.head.length).getValues().forEach(function (x) {
            if (!(x[0] instanceof Date) || x[0].getTime() < w.from || x[0].getTime() >= w.to) return;
            const nm = String(x[info.nickCol - 1]).replace(/\s+/g, ''); if (!nm) return;
            const hit = ppl.filter(function (p) { return p.nm === nm; })[0]; if (hit) hit.n++; else ppl.push({ nm: nm, n: 1 });
          });
        } catch (e) {}
      }
      const counts = c.runs.slice(0, k + 1).map(function (x, d) {
        const p = d === k ? ppl : namesOf(x);
        return p.length ? p.reduce(function (a, y) { return a + y.n; }, 0) : (Number(x['인원']) || Number(x['목표인원']) || 0);
      });
      rv.days = !r['플랫폼'] || /쿠팡|네이버/.test(String(r['플랫폼'])) ? 7 : 10;
      // 그날만 사용자가 정한 리뷰 종류 개수 (RV_.dayMix['#10.27실링팬2'] = '포토대기 1, 텍스트리뷰 1'): 앞 날을 손으로 바꿔서 비율 계산이 안 맞을 때 (10/26 실링팬)
      const dm = rv.dayMix && rv.dayMix[bareTitle_(r['명단 제목']).replace(/\s+/g, '')];
      const res = dm ? reviewGuideMsg_(Object.assign({}, rv, { mix: dm }), ppl, [counts[k]], 0) : reviewGuideMsg_(rv, ppl, counts, k);
      const room = String(r['카톡방'] || bareTitle_(r['명단 제목']));
      // 장바구니건: 한 사람이 상품 N개 리뷰를 다 씀 (사용자 10/28)
      if (cartN_(r) > 1 && res.msg) res.msg = res.msg.replace('🐥리뷰내용 가이드🐥\n', '🐥리뷰내용 가이드🐥\n🛒 장바구니 상품 ' + cartN_(r) + '개 모두 리뷰 작성해 주세요\n');
      // 나중에 명단이 바뀌면(중복 지움·늦게 낸 사람) 대기 중인 가이드를 다시 맞추려고 그때 이름·글을 저장 (10/27 텀블러: 허예인 두 번·구정선 빠짐)
      props.setProperty('RVSIG_' + keyD, ppl.map(function (p) { return p.nm + '/' + p.opt; }).join('|'));
      if (res.msg && !photoAll && !res.photoWait) props.setProperty('RVTXT_' + keyD, res.msg);
      if (res.photoOpts && res.photoOpts.length) { savePhotoUsed_(first['시트ID'], res.photoOpts, []); props.setProperty('RVPH_' + keyD, JSON.stringify(res.photoOpts)); }
      if (old) {
        // 예전 카톡 이름 글: 아직 안 보냈으면 이 글로 바꾸고, 보냈으면 그대로 둠
        const ob = outboxSheet_(), ol = ob.getLastRow();
        if (ol >= 2) ob.getRange(2, 1, ol - 1, 6).getValues().forEach(function (v, i) {
          if (String(v[3]) === room && /^⭐️리뷰내용 가이드⭐️/.test(String(v[4])) && v[5] !== '보냄') obSet_(ob, v[0], 5, res.msg);
        });
        note_('✓ 리뷰 가이드 메시지를 수령인 이름으로 바꿈: ' + room);
        return;
      }
      if (res.photoWait) { queueMsg_(room, '⭐️포토대기⭐️', '방 공지'); if (res.pwMsg) queueMsg_(room, res.pwMsg, '포토 가이드'); }   // 그날 몫이 업체 사진 대기면 (10/21 실링팬 하루 포토·하루 텍스트)
      if (photoAll) { queueMsg_(room, '⭐️포토대기⭐️', '방 공지'); if (res.msg) queueMsg_(room, res.msg, '포토 가이드'); }
      else if (res.msg) queueMsg_(room, res.msg, '방 공지');
      if (res.ask.length) queueMsg_('사장님', '[' + room + '] 의뢰서에 ' + res.ask.join(', ') + '이(가) 없어요. 사장님께 물어보고 리뷰 가이드 공지를 고쳐서 보내기', '할 일');
      note_('✓ 리뷰 가이드 메시지 넣음: ' + room + (res.ask.length ? ' (사장님께 물어볼 것: ' + res.ask.join(', ') + ')' : ''));
    });
  });
}

// 포토가 나간 옵션 목록 고치기 (RV_.photoUsed): add는 넣고 drop은 뺌
function savePhotoUsed_(sid, add, drop) {
  const props = PropertiesService.getScriptProperties();
  let rv = null; try { rv = JSON.parse(props.getProperty('RV_' + sid) || 'null'); } catch (e) {}
  if (!rv) return;
  let u = (rv.photoUsed || []).filter(function (o) { return (drop || []).indexOf(o) < 0; });
  (add || []).forEach(function (o) { if (u.indexOf(o) < 0) u.push(o); });
  rv.photoUsed = u;
  props.setProperty('RV_' + sid, JSON.stringify(rv));
}
// 대기 중인 리뷰 가이드: 명단(수령인)이 처음 만들 때와 달라졌고 글을 손으로 안 고쳤으면 지금 명단으로 다시 (사용자 요청 10/27: 한눈에 명단이 최종)
function refreshGuide_(r, k, c) {
  const props = PropertiesService.getScriptProperties();
  const keyD = 'RVMSGD_' + r['시트ID'] + '_' + Utilities.formatDate(r['진행일'] instanceof Date ? r['진행일'] : new Date(), CONFIG.TIMEZONE, 'yyyyMMdd');
  const old = props.getProperty('RVTXT_' + keyD), sig0 = props.getProperty('RVSIG_' + keyD);
  if (!old || sig0 === null) return;
  const room = String(r['카톡방'] || bareTitle_(r['명단 제목']));
  const ob = outboxSheet_(), ol = ob.getLastRow();
  if (ol < 2) return;
  const row = ob.getRange(2, 1, ol - 1, 6).getValues().filter(function (v) { return v[2] === '방 공지' && v[5] === '대기' && String(v[4]) === old; })[0];
  if (!row) return;   // 보냈거나 손으로 고쳤으면 그대로
  const runs = readRuns_();
  const ppl = receivers_(r, windowOf_(runs, r));
  const sig = ppl.map(function (p) { return p.nm + '/' + p.opt; }).join('|');
  if (!ppl.length || sig === sig0) return;
  const first = c.runs.filter(function (x) { return x['시트ID']; })[0] || r;
  let rv = null; try { rv = JSON.parse(props.getProperty('RV_' + first['시트ID']) || 'null'); } catch (e) {}
  if (!rv) rv = { kind: 'text', mix: '', guide: '' };
  let ph = []; try { ph = JSON.parse(props.getProperty('RVPH_' + keyD) || '[]'); } catch (e) {}
  rv.photoUsed = (rv.photoUsed || []).filter(function (o) { return ph.indexOf(o) < 0; });   // 이 날 몫은 다시 고름
  const counts = c.runs.slice(0, k + 1).map(function (x, d) { return d === k ? ppl.reduce(function (a, y) { return a + y.n; }, 0) : (Number(x['인원']) || Number(x['목표인원']) || 0); });
  rv.days = !r['플랫폼'] || /쿠팡|네이버/.test(String(r['플랫폼'])) ? 7 : 10;
  const dm = rv.dayMix && rv.dayMix[bareTitle_(r['명단 제목']).replace(/\s+/g, '')];
  const res = dm ? reviewGuideMsg_(Object.assign({}, rv, { mix: dm }), ppl, [counts[k]], 0) : reviewGuideMsg_(rv, ppl, counts, k);
  if (!res.msg || res.photoWait) return;
  obSet_(ob, row[0], 5, res.msg);
  props.setProperty('RVTXT_' + keyD, res.msg); props.setProperty('RVSIG_' + keyD, sig);
  savePhotoUsed_(first['시트ID'], res.photoOpts || [], ph); props.setProperty('RVPH_' + keyD, JSON.stringify(res.photoOpts || []));
  note_('✓ 리뷰 가이드 명단 다시 맞춤: ' + room + ' (' + ppl.map(function (p) { return p.nm; }).join(' ') + ')');
}

function dupSummary_(sheetId) {
  try {
    const sheet = responseSheet_(SpreadsheetApp.openById(sheetId));
    const head = headers_(sheet), last = sheet.getLastRow();
    if (last < 2) return '중복 없음';
    const data = sheet.getRange(2, 1, last - 1, head.length).getValues();
    const found = [];
    head.forEach(function (h, c) {
      if (!(MATCH.dup.test(h) && !MATCH.account.test(h))) return;
      const seen = {};
      data.forEach(function (r) { const k = String(r[c]).replace(/\s/g, ''); if (k) seen[k] = (seen[k] || 0) + 1; });
      Object.keys(seen).forEach(function (k) { if (seen[k] > 1) found.push(h + ' ' + k + ' (' + seen[k] + '번)'); });
    });
    return found.length ? '중복 확인 필요: ' + found.join(', ') : '중복 없음';
  } catch (e) { return '중복 확인 못 함: ' + e.message; }
}

function ensureCheckTrigger_() {
  const has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'checkFull'; });
  if (!has) ScriptApp.newTrigger('checkFull').timeBased().everyMinutes(15).create();
}

function installDailyTrigger() {
  removeDailyTrigger(true);
  try { ensureEditTab_(); } catch (e) {}
  ScriptApp.newTrigger('dailyCheck').timeBased().atHour(CONFIG.ALERT_HOUR).everyDays(1).inTimezone(CONFIG.TIMEZONE).create();
  SpreadsheetApp.getUi().alert('매일 오전 ' + CONFIG.ALERT_HOUR + '시에 진행목록 인원 수를 업데이트합니다.');
}

function removeDailyTrigger(silent) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyCheck') ScriptApp.deleteTrigger(t);
  });
  if (silent !== true) SpreadsheetApp.getUi().alert('매일 알림을 껐어요.');
}

/* ---------------- 공통 ---------------- */

function adminSs_() {
  return SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(CONFIG.ADMIN_SHEET_ID);
}

function ensureListSheet_() {
  const ss = adminSs_();
  let sh = ss.getSheetByName(CONFIG.LIST_SHEET);
  if (!sh) sh = ss.insertSheet(CONFIG.LIST_SHEET, 0);
  const have = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(String);
  if (have.slice(0, LIST_HEADER.length).join('|') !== LIST_HEADER.join('|')) migrateList_(sh, have);
  return sh;
}

// 진행목록 열이 예전 모양이면 열 이름 기준으로 옮겨 담고 새 모양으로 다시 꾸밈 (예전 리뷰 열은 버림)
function migrateList_(sh, have) {
  const last = sh.getLastRow();
  const rows = (last >= 2 && have[0] !== '') ? sh.getRange(2, 1, last - 1, have.length).getValues() : [];
  const idx = function (h) {
    let k = have.indexOf(h);
    if (k < 0) Object.keys(LIST_ALIAS).forEach(function (a) { if (LIST_ALIAS[a] === h && have.indexOf(a) >= 0) k = have.indexOf(a); });
    return k;
  };
  const out = rows.map(function (r) {
    const o = LIST_HEADER.map(function (h) { const k = idx(h); return k >= 0 ? r[k] : ''; });
    const di = lc_('진행일') - 1, si = lc_('진행 상태') - 1, pi = lc_('가격') - 1;
    if (!o[di]) o[di] = dayFromTitle_(o[lc_('명단 제목') - 1]);
    if (o[si] !== '종료') o[si] = statusFor_(o[di]);
    o[pi] = String(o[pi] || '');
    return o;
  });
  sh.clear();
  sh.clearConditionalFormatRules();
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).clearDataValidations();
  try { for (let c = 1; c <= sh.getMaxColumns(); c++) while (sh.getColumnGroupDepth(c) > 0) sh.getRange(1, c).getEntireColumn().shiftColumnGroupDepth(-1); } catch (e) {}
  sh.showColumns(1, sh.getMaxColumns());
  sh.getRange(1, 1, 1, LIST_HEADER.length).setValues([LIST_HEADER]).setFontWeight('bold').setBackground('#efe6f7');
  formatList_(sh);
  if (out.length) sh.getRange(2, 1, out.length, LIST_HEADER.length).setValues(out);
  sh.setFrozenRows(1);
  formatList_(sh);
  sh.setColumnWidth(lc_('명단 제목'), 280);
  out.forEach(function (r, i) { if (r[lc_('실배송') - 1] === 'Y') sh.getRange(i + 2, 1, 1, LIST_HEADER.length).setBackground('#fff2a8'); });
  groupColumns_(sh, LIST_HIDDEN.map(lc_));
}

function rootFolder_() {
  if (CONFIG.FOLDER_ID) return DriveApp.getFolderById(CONFIG.FOLDER_ID);
  const it = DriveApp.getRootFolder().getFoldersByName(CONFIG.ROOT_FOLDER_NAME);
  if (it.hasNext()) return it.next();
  const f = DriveApp.getRootFolder().createFolder(CONFIG.ROOT_FOLDER_NAME);
  try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  return f;
}



/* ---------------- 6) 보낼 메시지함 (PC 카톡 도우미, 아이폰 메시지함이 같이 씀) ---------------- */
// 상태: 대기 → 보냄 / 방 못 찾음. 메시지는 사람이 직접 보내기(Enter)를 눌러야 나감

const OUTBOX_SHEET = '보낼메시지';

function outboxSheet_() {
  const ss = adminSs_();
  let sh = ss.getSheetByName(OUTBOX_SHEET);
  // 예전 줄도 한 번 최신순으로 정렬, 상태는 고를 수 있게
  // 메시지 칸은 한 줄로 잘라 보여 줘서 시각, 종류, 카톡방, 상태가 한눈에 (전체 글은 칸을 누르거나 메시지함 페이지에서)
  if (sh && !PropertiesService.getScriptProperties().getProperty('OUTBOX_FMT2')) {
    const last = Math.max(sh.getLastRow(), 2);
    sh.getRange(1, 1, last, 6).setVerticalAlignment('middle').setWrap(false);
    sh.getRange(2, 5, last - 1, 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
    sh.setRowHeights(2, last - 1, 21);
    sh.setFrozenRows(1);
    PropertiesService.getScriptProperties().setProperty('OUTBOX_FMT2', '1');
  }
  if (sh && !PropertiesService.getScriptProperties().getProperty('OUTBOX_SORTED')) {
    const last = sh.getLastRow();
    if (last >= 3) sh.getRange(2, 1, last - 1, 6).sort({ column: 2, ascending: false });
    if (last >= 2) sh.getRange(2, 6, last - 1, 1).setDataValidation(obCheck_());
    sh.getRange(1, 1, Math.max(last, 1), 6).setVerticalAlignment('middle');
    sh.getRange(1, 1, Math.max(last, 1), 4).setHorizontalAlignment('center');
    sh.getRange(1, 6, Math.max(last, 1), 1).setHorizontalAlignment('center');
    PropertiesService.getScriptProperties().setProperty('OUTBOX_SORTED', '1');
  }
  if (!sh) {
    sh = ss.insertSheet(OUTBOX_SHEET, 1);
    sh.appendRow(['ID', '보낼 날짜', '종류', '카톡방', '메시지', '보냄 체크']);
    sh.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#efe6f7');
    sh.setFrozenRows(1);
    sh.setColumnWidth(5, 420);
  }
  return sh;
}

// 보낼메시지: 최신순, 한 줄씩(메시지 칸은 잘라 보이고 시각·종류·카톡방·상태가 위로 맞춰 보이게)
// 안 보낸 메시지의 보낼 날짜를 매번 카톡방 날짜로 다시 맞춤 (방 이름이 바뀌어도 날짜가 옛날 그대로 남지 않게, 10/24 #10.27·#10.28 공지가 10/23).
//  방 공지는 전 진행일(지난 날이면 오늘), 나머지는 방 날짜. '포토전달대기'는 포토 가이드에만
//  (10/24 #10.27 실링팬·마켓담온 귤·속눈썹영양제 방 공지가 '포토전달대기'로 되어 있었음 → 날짜로 고치고 어느 줄이었는지 기록)
// 메시지 번호(A열): 'm' + 글자 (예전 번호는 시트가 숫자로 바꾸거나(0012… → 12…) 같은 번호가 두 줄에 생길 수 있었음.
//  같은 번호가 두 줄이면 번호로 고치는 칸(보낼 날짜 등)이 엉뚱한 줄에 써짐 → 10/24 방 공지에 '포토전달대기'가 들어간 것)
// (10/24 원인 찾기) 보낼메시지 보낼 날짜 고침·정렬 추적 → ?p=diag 의 obTrace
function obTrace_(t) { try { const c = CacheService.getScriptCache(); let a = []; try { a = JSON.parse(c.get('OB_TRACE') || '[]'); } catch (e) {} a.push(Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'HH:mm:ss') + ' ' + t); c.put('OB_TRACE', JSON.stringify(a.slice(-80)), 21600); } catch (e) {} }
function newObId_() { return 'm' + Utilities.getUuid().replace(/-/g, '').slice(0, 12); }
function dedupeObIds_(sh) {
  const last = sh.getLastRow();
  if (last < 2) return;
  const rg = sh.getRange(2, 1, last - 1, 1), ids = rg.getValues(), seen = {};
  let n = 0;
  const out = ids.map(function (x) {
    const k = String(x[0]);
    if (!k || seen[k] || /^\d/.test(k) && typeof x[0] === 'number') { n++; const id = newObId_(); seen[id] = 1; return [id]; }
    seen[k] = 1; return [x[0]];
  });
  if (n) { rg.setNumberFormat('@').setValues(out); note_('⚠ 보낼메시지 번호가 겹치거나 깨진 줄 ' + n + '개 번호 새로 줌'); }
}
function redateOutbox_(sh) {
  dedupeObIds_(sh);
  const last = sh.getLastRow();
  if (last < 2) return;
  let n = 0, sentFix = 0;
  const odd = [], pprops = PropertiesService.getScriptProperties();
  sh.getRange(2, 1, last - 1, 6).getValues().forEach(function (x) {
    // 포토 가이드를 보냄 체크 = 업체 포토를 받아 리뷰어에게 전달함 → '업체 포토 아직' 알림 끔
    if (x[2] === '포토 가이드' && x[5] === '보냄' && x[3]) { const pk = 'RVSENT_' + campKey_(x[3]) + '_' + dateTok_(String(x[3])); if (!pprops.getProperty(pk)) pprops.setProperty(pk, '1'); }
    // 보낸·취소 줄도 '포토전달대기'로 잘못 바뀐 보낼 날짜는 날짜로 되돌림 (10/24 필터 때문에 40줄 가까이 바뀜. 날짜가 아니면 오래돼도 안 지워짐)
    if (!(x[5] === '대기' || x[5] === '방 못 찾음') || !x[0]) { if (x[0] && x[2] !== '포토 가이드' && x[1] === '포토전달대기') { obSet_(sh, x[0], 2, sendDate_(x[3], x[4], x[2])); sentFix++; } return; }
    if (x[2] === '포토 가이드') { if (x[1] !== '포토전달대기') { obSet_(sh, x[0], 2, '포토전달대기'); odd.push(x[3] + '(포토 가이드: ' + x[1] + ')'); } return; }
    const d = sendDate_(x[3], x[4], x[2]);
    if (!(x[1] instanceof Date)) {
      obSet_(sh, x[0], 2, d); odd.push(x[3] + '(' + x[2] + ': ' + (x[1] === '' ? '빈칸' : x[1]) + ')');
      try { SpreadsheetApp.flush(); const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(function (y) { return String(y[0]); }), at = ids.indexOf(String(x[0])); obTrace_('고침 ' + x[0] + ' ' + x[3] + ' 줄' + (at + 2) + ' 다시 읽음=' + (at >= 0 ? sh.getRange(at + 2, 2).getValue() : '못 찾음')); } catch (e) { obTrace_('추적 실패 ' + e); }
      return;
    }
    if (d.getTime() !== dayStart_(x[1])) { obSet_(sh, x[0], 2, d); n++; }
  });
  if (n) note_('보낼 날짜를 카톡방 날짜에 맞춤: ' + n + '줄');
  if (odd.length) note_('⚠ 보낼 날짜 칸이 종류와 안 맞아서 고침: ' + odd.join(', '));
  if (sentFix) note_('✓ 보낸 메시지 보낼 날짜 ' + sentFix + '줄 날짜로 되돌림 (포토전달대기로 잘못 바뀐 것)');
}
function tidyOutboxInner_() {
  const sh = outboxSheet_();
  let last = sh.getLastRow();
  if (last < 2) return;
  // (10/19 한 번) A열 ID는 숨기고, B열을 '보낼 날짜'로 (예전 줄도 방 날짜로 바꿈)
  const op = PropertiesService.getScriptProperties();
  if (!op.getProperty('OUTBOX_V3')) {
    op.setProperty('OUTBOX_V3', '1');
    sh.getRange('B1').setValue('보낼 날짜');
    try { sh.hideColumns(1); } catch (e) {}
    const v = sh.getRange(2, 1, last - 1, 6).getValues();
    sh.getRange(2, 2, last - 1, 1).setValues(v.map(function (x) { return [sendDate_(x[3], x[4], x[2])]; }));
  }
  // 업체 명단 줄은 지움 (사용자 요청 10/19)
  if (!SEND_COMPANY_LIST) {
    const kinds = sh.getRange(2, 3, last - 1, 1).getValues();
    for (let i = kinds.length - 1; i >= 0; i--) if (String(kinds[i][0]) === '업체 명단') sh.deleteRow(i + 2);
    last = sh.getLastRow();
    if (last < 2) return;
  }
  // (한 번, 10/20) 상태 칸을 체크칸으로: 체크하면 보냄. '방 못 찾음'은 대기로
  if (!op.getProperty('OUTBOX_V4')) {
    op.setProperty('OUTBOX_V4', '1');
    const st = sh.getRange(2, 6, last - 1, 1), sv = st.getValues();
    st.setValues(sv.map(function (x) { return [x[0] === '보냄' ? '보냄' : '대기']; })).setDataValidation(obCheck_());
    sh.getRange(1, 6).setValue('보냄 체크');
  }
  redateOutbox_(sh);
  sortOutbox_(sh);
  sh.getRange(1, 1, last, 6).setVerticalAlignment('top').setWrap(false);
  sh.getRange(2, 5, last - 1, 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  sh.setRowHeights(2, last - 1, 21);
  sh.getRange(2, 2, last - 1, 1).setNumberFormat('M/d (ddd)');
  sh.setFrozenRows(1);
  // 보낼 것(대기) 줄은 날짜별 색, 보낸 건 회색 글씨
  const all = sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), 6);
  const obRules = function (hol) { return [
    // 안 보낸 것: 보낼 날짜가 지났으면 빨강, 오늘 연두, 다음 진행일(금→월, 공휴일 건너뜀) 하늘색, 그 뒤는 노랑 (사용자 요청 10/20, 한눈에 탭과 같은 색)
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($F2="대기",ISNUMBER($B2),INT($B2)<TODAY())').setBackground('#f4cccc').setRanges([all]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($F2="대기",ISNUMBER($B2),INT($B2)=TODAY())').setBackground('#d9ead3').setRanges([all]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($F2="대기",ISNUMBER($B2),INT($B2)=WORKDAY(TODAY(),1' + (hol ? ',{' + holidaySerials_().join(',') + '}' : '') + '))').setBackground('#cfe2f3').setRanges([all]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$F2="대기"').setBackground('#fff2cc').setRanges([all]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$F2="보냄"').setFontColor('#9e9e9e').setRanges([all]).build()
  ]; };
  try { sh.setConditionalFormatRules(obRules(true)); } catch (e) { sh.setConditionalFormatRules(obRules(false)); }   // 공휴일 목록을 시트가 안 받으면 주말만
  sh.getRange(2, 6, last - 1, 1).setFontWeight('bold').setHorizontalAlignment('center');
}

// 보낼메시지 B열 = 보낼 날짜 (사용자 요청 10/19: 만든 시각은 헷갈림). 방 이름(없으면 메시지 앞부분)의 날짜, 없으면 오늘
//  카톡방 첫 공지(구글폼 링크가 든 방 공지)는 진행일 0시 전에 올려야 해서 그 전 진행일(월요일 진행이면 금요일). 오늘보다 앞이면 오늘
//  리뷰내용 가이드, 명단 전달, 할 일은 그 날짜
function sendDate_(room, msg, kind) {
  const t = dateTok_(room) || dateTok_(String(msg || '').slice(0, 300));
  const now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!t) return today;
  const p = t.split('.'), m = Number(p[0]), d = Number(p[1]), cur = now.getMonth() + 1;
  let day = new Date(now.getFullYear() + (m < cur - 6 ? 1 : m > cur + 6 ? -1 : 0), m - 1, d);
  // 방 공지(폼 링크 있는 것)는 전 진행일 (월요일 진행이면 금요일, 사용자 요청 10/24)
  if (kind === '방 공지' && /forms\.gle\/|docs\.google\.com\/forms\//.test(String(msg || '')) && !/리뷰내용 가이드/.test(String(msg || '').slice(0, 40))) {
    let x = new Date(day.getTime() - 86400000);
    for (let i = 0; i < 10 && !isWorkday_(x); i++) x = new Date(x.getTime() - 86400000);
    day = x;
  }
  if (day < today && kind === '방 공지') day = today;
  return day;
}

// 보낼메시지 순서 (사용자 요청 10/19): 대기(·방 못 찾음)가 맨 위, 그중 먼저 보낼 것(방 날짜가 이른 것: 20일 → 21일 → 22일)이 위. 보낸 건 아래에 최신순
function sortOutbox_(sh) {
  sh = sh || outboxSheet_();
  const last = sh.getLastRow();
  if (last < 3) return;
  const rg = sh.getRange(2, 1, last - 1, 6), v = rg.getValues();
  const dk = function (x) { const t = dateTok_(x[3]) || dateTok_(String(x[4]).slice(0, 300)); if (!t) return 9999; const p = t.split('.'); return Number(p[0]) * 100 + Number(p[1]); };
  const tm = function (x) { return x[1] instanceof Date ? x[1].getTime() : 0; };
  const wait = function (x) { return x[5] === '대기' || x[5] === '방 못 찾음'; };
  const sorted = v.slice().sort(function (a, b) {
    if (wait(a) !== wait(b)) return wait(a) ? -1 : 1;
    if (wait(a)) return (tm(a) - tm(b)) || (dk(a) - dk(b));   // 보낼 날짜(B) 이른 것 먼저
    return tm(b) - tm(a);
  });
  if (sorted.some(function (x, i) { return x[0] !== v[i][0]; })) {
    rg.setValues(sorted);
    // (10/24 원인 찾기) 쓴 값과 다시 읽은 값이 다른 보낼 날짜 칸
    try {
      SpreadsheetApp.flush();
      const back = sh.getRange(2, 1, sorted.length, 2).getValues(), diff = [];
      sorted.forEach(function (x, i) { const a = x[1] instanceof Date ? x[1].getTime() : String(x[1]), b = back[i][1] instanceof Date ? back[i][1].getTime() : String(back[i][1]); if (a !== b || String(back[i][0]) !== String(x[0])) diff.push((i + 2) + ':' + x[0] + ' 씀=' + (x[1] instanceof Date ? 'D' : x[1]) + ' 읽음=' + (back[i][1] instanceof Date ? 'D' : back[i][1]) + (String(back[i][0]) !== String(x[0]) ? ' 번호다름' : '')); });
      obTrace_('정렬 ' + sorted.length + '줄' + (diff.length ? ' 안 맞음: ' + diff.slice(0, 12).join(', ') : ' 맞음'));
    } catch (e) { obTrace_('정렬 추적 실패 ' + e); }
  }
}

// 보낼메시지 줄을 번호(A열)로 찾아서 고침. 줄 위치로 고치면 사이에 새 메시지가 들어오거나 정렬돼서 다른 줄을 덮어씀
//  (10/21 마켓담온 귤 공지가 오즈네즈 방 이름 줄로 들어간 것)
// 방 공지인데 글 속 폼 링크가 다른 진행 것이면 카톡방 이름을 그 진행 것으로 바로잡음 (매번, 안 보낸 것만)
function fixMisroutedNoticesInner_(runs) {
  const ob = outboxSheet_(), last = ob.getLastRow();
  if (last < 2) return;
  ob.getRange(2, 1, last - 1, 6).getValues().forEach(function (v) {
    if (v[2] !== '방 공지' || v[5] === '보냄') return;
    const link = (String(v[4]).match(/https:\/\/forms\.gle\/[\w-]+|https:\/\/docs\.google\.com\/forms\/[^\s]+/) || [])[0];
    if (!link) return;
    const mine = runs.filter(function (r) { return String(r['폼 링크'] || '') === link; });
    if (!mine.length) return;
    const room = String(v[3]);
    if (mine.some(function (r) { return String(r['카톡방'] || bareTitle_(r['명단 제목'])) === room; })) return;
    const tok = dateTok_(room), hit = mine.filter(function (r) { return dateTok_(r['명단 제목']) === tok; })[0];
    if (!hit) return;
    const right = String(hit['카톡방'] || bareTitle_(hit['명단 제목']));
    obSet_(ob, v[0], 4, right);
    note_('✓ 방 공지 카톡방 바로잡음: ' + room + ' → ' + right);
  });
}
// (10/23) 오늘·다음 진행일 진행마다 방 공지가 보낼메시지에 꼭 하나: 없으면(10.23 속눈썹영양제 빠진 것) 폼 설명으로 다시 만들어 넣고,
//  같은 방에 글자까지 똑같은 방 공지가 둘이면(10.23 텀블러 두 번) 나중 것(안 보낸 것)만 지움
function ensureRunNoticesInner_(runs) {
  const ob = outboxSheet_(), last = ob.getLastRow();
  const v = last >= 2 ? ob.getRange(2, 1, last - 1, 6).getValues() : [];
  const t1 = nextWorkday_(today_()).getTime();
  // 똑같은 방 공지 두 개
  const seen = {}, del = [];
  v.map(function (x, i) { return { x: x, i: i }; }).reverse().forEach(function (o) {
    if (o.x[2] !== '방 공지') return;
    const k = String(o.x[3]) + '\u0001' + String(o.x[4]);
    if (seen[k] && o.x[5] !== '보냄') del.push(o.i); else seen[k] = 1;
  });
  del.sort(function (a, b) { return b - a; }).forEach(function (i) { note_('✓ 똑같은 방 공지 하나 지움: ' + v[i][3]); ob.deleteRow(i + 2); v.splice(i, 1); });
  runs.forEach(function (r) {
    if (r['진행 상태'] === '종료' || !(r['진행일'] instanceof Date) || !r['폼ID'] || !r['폼 링크']) return;
    // 오늘 이후 진행 모두 (10/24: 미리 만들어 둔 뒤 날짜 진행 공지가 빠져도 보낼 날 전에 다시 들어가게). 보낼 날짜(전 진행일)가 지난 건
    //  이미 직접 보냈을 수 있어서 안 넣음 (두 번 보내지 않게)
    const d = dayStart_(r['진행일']); if (d < today_().getTime()) return;
    { const sd = new Date(d); sd.setHours(12, 0, 0, 0); do { sd.setDate(sd.getDate() - 1); } while (!isWorkday_(sd)); sd.setHours(0, 0, 0, 0); if (sd.getTime() < today_().getTime()) return; }
    // 폼을 같이 쓰는 여러 날 진행(폼 설명은 가장 늦은 날 공지)은 일정 탭의 그날 계획으로 공지를 다시 만듦 (10/24 #10.26 속눈썹영양제 공지가 빠졌는데 여기서 건너뛰어 다시 안 생겼음)
    const shared = runs.some(function (x) { return x !== r && String(x['폼ID']) === String(r['폼ID']) && x['진행일'] instanceof Date && dayStart_(x['진행일']) > d && x['진행 상태'] !== '종료'; });
    const room = String(r['카톡방'] || bareTitle_(r['명단 제목'])), link = String(r['폼 링크']);
    // 같은 날짜 방(방 이름이 바뀌었어도 날짜는 같음)에 이 폼 링크 공지가 있으면 있는 것 (여러 날 진행은 폼을 같이 써서 날짜로 구분)
    if (v.some(function (x) { return x[2] === '방 공지' && String(x[4]).indexOf(link) >= 0 && (String(x[3]) === room || dateTok_(String(x[3])) === dateTok_(room)); })) return;
    const props = PropertiesService.getScriptProperties(), pk = 'NOTICEFIX_' + r['폼ID'] + '_' + Utilities.formatDate(r['진행일'], CONFIG.TIMEZONE, 'yyyyMMdd');
    if (props.getProperty(pk)) return;   // 한 번만 (사용자가 지웠으면 다시 안 넣음)
    let desc = '';
    if (shared) {
      desc = planNotice_(r, link);
      if (!desc) { note_('⚠ ' + room + ' 방 공지가 보낼메시지에 없는데 일정 탭에 그날 계획이 없어 못 만들었어요. 다른 날 공지를 복사해 인원만 고쳐 보내 주세요'); props.setProperty(pk, '1'); return; }
    } else {
      try { desc = FormApp.openById(r['폼ID']).getDescription(); } catch (e) { return; }
      if (!desc || desc.indexOf(link) < 0) return;
    }
    props.setProperty(pk, '1');
    queueMsg_(room, isExpect_(r) ? desc : withSlotLine_(desc, runSlot_(r), chainFruit_(r)), '방 공지');
    note_('✓ 빠진 방 공지 넣음: ' + room + (shared ? ' (일정 탭 그날 계획으로)' : ''));
  });
}
// 일정 탭에서 이 진행(같은 캠페인, 같은 날짜)의 계획 → 그날 공지 (다음 일차 만들 때와 같은 방법, 폼 링크 넣음)
function planNotice_(r, link) {
  const ps = planSheet_(), pl = ps.getLastRow();
  if (pl < 2) return '';
  const ck = campKey_(r['캠페인'] || r['명단 제목']), tk = dateTok_(r['명단 제목']);
  const x = ps.getRange(2, 1, pl - 1, PLAN_HEAD.length).getValues().filter(function (y) { return campKey_(y[1]) === ck && dateTok_(y[5]) === tk && !/취소/.test(String(y[8])); })[0];
  if (!x) return '';
  let cfg = {}, cnt = [];
  try { cfg = JSON.parse(x[9]); cnt = JSON.parse(x[7]); } catch (e) { return ''; }
  if (!cfg.desc) return '';
  const t = cfg.platform === '기대평' ? cfg.desc : adjustNotice_(stripNames_(cfg.desc), cnt, cfg.slot2);
  return String(t).split('(구글폼 링크)').join(link);
}
// 보낼메시지에 필터(데이터 → 필터 만들기)가 걸려 있으면 스크립트가 쓴 값이 일부 칸에 안 들어감
//  (10/24 실제로 확인: 필터가 있을 때 B14:B17에 날짜를 써도 '포토전달대기'로 남고, 필터를 빼고 쓰면 들어감. 방 공지 보낼 날짜가 '포토전달대기'로 보이던 원인)
//  → 보낼메시지를 고치는 동안만 필터를 빼고, 끝나면 같은 범위·조건으로 다시 검. 중간에 멈춰도 다음 실행이 다시 걸게 조건을 속성(OB_FILTER)에 적어 둠
function withObWrite_(fn) {
  if (globalThis.__OB_UNF) return fn();
  let sh = null, f = null;
  try { sh = adminSs_().getSheetByName(OUTBOX_SHEET); f = sh ? sh.getFilter() : null; } catch (e) {}
  if (!f) {
    const r = fn();
    try { const j = JSON.parse(PropertiesService.getScriptProperties().getProperty('OB_FILTER') || 'null'); if (j && Date.now() - Number(j.at || 0) > 7 * 60000) obFilterRestore_(sh, null); } catch (e) {}
    return r;
  }
  const saved = obFilterSave_(f);
  try { f.remove(); } catch (e) { return fn(); }
  globalThis.__OB_UNF = true;
  try { return fn(); } finally { globalThis.__OB_UNF = false; obFilterRestore_(sh, saved); }
}
function obFilterSave_(f) {
  const rg = f.getRange(), col0 = rg.getColumn(), live = [], json = [];
  for (let j = 0; j < rg.getNumColumns(); j++) {
    let k = null; try { k = f.getColumnFilterCriteria(col0 + j); } catch (e) {}
    if (!k) continue;
    live.push([col0 + j, k]);
    const o = { col: col0 + j };
    try { o.h = k.getHiddenValues() || []; } catch (e) {}
    try { o.vis = k.getVisibleValues() || []; } catch (e) {}
    try { const t = k.getCriteriaType(); if (t) { o.t = String(t); o.v = (k.getCriteriaValues() || []).map(function (x) { return x instanceof Date ? { d: x.getTime() } : x; }); } } catch (e) {}
    json.push(o);
  }
  const saved = { a1: rg.getA1Notation(), live: live };
  try { PropertiesService.getScriptProperties().setProperty('OB_FILTER', JSON.stringify({ a1: saved.a1, crit: json, at: Date.now() })); } catch (e) {}
  return saved;
}
function obFilterRestore_(sh, saved) {
  const props = PropertiesService.getScriptProperties();
  try {
    if (!sh) sh = adminSs_().getSheetByName(OUTBOX_SHEET);
    if (!sh) return;
    if (sh.getFilter()) { props.deleteProperty('OB_FILTER'); return; }
    if (!saved) { const j = JSON.parse(props.getProperty('OB_FILTER') || 'null'); if (!j) return; saved = { a1: j.a1, json: j.crit }; }
    // 범위 끝 줄은 지금 마지막 줄까지 (메시지가 늘거나 줄었을 수 있음)
    const m = String(saved.a1).match(/^([A-Z]+)(\d+):([A-Z]+)\d+$/);
    const a1 = m ? m[1] + m[2] + ':' + m[3] + Math.max(sh.getLastRow(), Number(m[2]) + 1) : saved.a1;
    const nf = sh.getRange(a1).createFilter();
    if (saved.live) saved.live.forEach(function (k) { try { nf.setColumnFilterCriteria(k[0], k[1]); } catch (e) {} });
    else (saved.json || []).forEach(function (o) {
      try {
        let b = SpreadsheetApp.newFilterCriteria();
        if (o.h && o.h.length) b = b.setHiddenValues(o.h);
        if (o.vis && o.vis.length) b = b.setVisibleValues(o.vis);
        if (o.t && SpreadsheetApp.BooleanCriteria[o.t]) b = b.withCriteria(SpreadsheetApp.BooleanCriteria[o.t], (o.v || []).map(function (x) { return x && x.d ? new Date(x.d) : x; }));
        nf.setColumnFilterCriteria(o.col, b.build());
      } catch (e) {}
    });
    props.deleteProperty('OB_FILTER');
  } catch (e) { note_('⚠ 보낼메시지 필터를 다시 못 걸었어요 (' + e.message + '). 종류 칸 필터를 다시 걸어 주세요'); }
}
// 그 카톡방의 안 보낸 메시지 줄을 지움 (취소된 진행)
function delPendingFor_(room) { return withObWrite_(function () {
  const ob = outboxSheet_(), ol = ob.getLastRow(), del = [];
  if (ol < 2 || !room) return 0;
  ob.getRange(2, 1, ol - 1, 6).getValues().forEach(function (v, i) { if (String(v[3]) === room && v[5] !== '보냄') del.push(i + 2); });
  for (let j = del.length - 1; j >= 0; j--) ob.deleteRow(del[j]);
  return del.length;
}); }
function obSet_(ob, id, col, val) { return withObWrite_(function () { return obSetInner_(ob, id, col, val); }); }
function queueMsg_(room, msg, kind) { return withObWrite_(function () { return queueMsgInner_(room, msg, kind); }); }
function markMsg_(id, st) { return withObWrite_(function () { return markMsgInner_(id, st); }); }
function tidyOutbox_() { return withObWrite_(function () { return tidyOutboxInner_(); }); }
function ensureRunNotices_(runs) { return withObWrite_(function () { return ensureRunNoticesInner_(runs); }); }
function fixMisroutedNotices_(runs) { return withObWrite_(function () { return fixMisroutedNoticesInner_(runs); }); }
function pruneOutbox_() { return withObWrite_(function () { return pruneOutboxInner_(); }); }
function obSetInner_(ob, id, col, val) {
  const last = ob.getLastRow();
  if (last < 2 || !id) return false;
  const ids = ob.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) { ob.getRange(i + 2, col).setValue(val); return true; }
  return false;
}
function queueMsgInner_(room, msg, kind) {
  if (!msg) return;
  try {
    // 최신 메시지가 맨 위
    const ob = outboxSheet_();
    ob.insertRowBefore(2);
    // 포토 가이드: 보낼 날짜 대신 '포토전달대기' (사진 받은 뒤 보냄, 맨 위에 보이게)
    ob.getRange(2, 1, 1, 6).setValues([[newObId_(), kind === '포토 가이드' ? '포토전달대기' : sendDate_(room, msg, kind), kind || '', String(room || ''), String(msg), '대기']]);
    ob.getRange(2, 6).setDataValidation(obCheck_());
    ob.getRange(2, 1, 1, 6).setWrap(false).setVerticalAlignment('middle').setFontWeight('normal').setBackground(null);
    ob.getRange(2, 5).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
    ob.setRowHeight(2, 21);
    sortOutbox_(ob);
  } catch (e) { note_('메시지함 기록 실패: ' + e); }
}

function outboxItems_() {
  const sh = outboxSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 6).getValues()
    .filter(function (r) { return r[5] === '대기' || r[5] === '방 못 찾음'; })
    .map(function (r) { return { id: String(r[0]), kind: String(r[2]), room: String(r[3]), msg: String(r[4]), st: String(r[5]) }; });
}

// PC 도우미용: 한 줄에 하나, ID 탭 방이름(base64) 탭 메시지(base64). 방 이름이 있는 대기 건만
function queueText_() {
  const b = function (t) { return Utilities.base64Encode(t, Utilities.Charset.UTF_8); };
  return outboxItems_().filter(function (x) { return x.st === '대기' && x.room; })
    .map(function (x) { return x.id + '\t' + b(x.room) + '\t' + b(x.msg); }).join('\n');
}

// 보낼메시지 상태 칸 = 체크칸 (체크 = '보냄', 빈칸 = '대기'). 값은 글자 그대로라 다른 코드는 안 바꿔도 됨. '방 못 찾음'은 없앰 (사용자 요청 10/20)
function obCheck_() { return SpreadsheetApp.newDataValidation().requireCheckbox('보냄', '대기').build(); }
function markMsgInner_(id, st) {
  if (st !== '보냄') st = '대기';
  const sh = outboxSheet_();
  const last = sh.getLastRow();
  if (last < 2 || !id) return;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) { sh.getRange(i + 2, 6).setValue(st); return; }
}

function markSentFromPage(k, id) {
  if (k !== CONFIG.KEY) throw new Error('권한이 없어요.');
  markMsg_(id, '보냄');
  return true;
}

/* ---------------- 진행 도우미 (휴대폰 페이지): 공지 붙여넣기, 중복 지우기, 내일 추가 모집을 한 화면에서 ---------------- */

function showToolsSidebar_() {
  let o;
  try { o = toolAction_({ act: 'info' }); } catch (e) { o = { msg: '불러오기 실패: ' + e.message }; }
  SpreadsheetApp.getUi().showSidebar(toolsPage_(o, 'side'));
}

// 진행 도우미 페이지: 서버가 내용을 채워서 보냄 (페이지가 서버 응답을 기다리지 않게)
const TOOLS_PV = '4';   // 진행 도우미 화면 버전. 화면 동작을 바꾸면 올림 → 예전에 열어 둔 화면은 저장을 막고 다시 열라고 알림
function toolsPage_(o, mode) {
  const j = function (x) { return JSON.stringify(x).replace(/</g, '\\u003c'); };
  const html = TOOLS_HTML.replace('__K__', function () { return j(CONFIG.KEY); }).replace('__INIT__', function () { return j(o || {}); }).replace('__PV__', function () { return j(TOOLS_PV); })
    .replace('__MODE__', function () { return j(mode); }).replace('__EXEC__', function () { return j(CONFIG.WEBAPP_URL || ''); });
  return HtmlService.createHtmlOutput(html).setTitle('진행 도우미').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// 웹(휴대폰)에서 버튼을 누르면 이 주소로 다시 열림: ?p=tools&a=동작&t=진행&x=공지&n=인원&ts=시각들&nc=한 번만 표시
function toolsRequest_(p) {
  const d = { k: CONFIG.KEY, act: String(p.a || 'info'), title: String(p.t || ''), text: String(p.x || ''), n: Number(p.n) || 0,
    times: p.ts ? String(p.ts).split(',').filter(Boolean) : [], to: String(p.to || ''), pv: String(p.pv || '') };
  if (d.act !== 'info' && p.nc) {
    // 새로고침해도 같은 버튼이 두 번 실행되지 않게 (최근 30개 기억)
    const props = PropertiesService.getScriptProperties();
    let seen = [];
    try { seen = JSON.parse(props.getProperty('TOOL_NC') || '[]'); } catch (e) {}
    if (seen.indexOf(String(p.nc)) >= 0) d.act = 'info';
    else props.setProperty('TOOL_NC', JSON.stringify(seen.concat([String(p.nc)]).slice(-30)));
  }
  try {
    let o = createRun(d);
    if (o && o.saved) o = Object.assign(toolAction_({ act: 'info', title: o.title }), { msg: o.msg });
    return o;
  } catch (e) {
    let o = {};
    try { o = toolAction_({ act: 'info', title: d.title }); } catch (e2) {}
    return Object.assign(o, { msg: '오류: ' + (e && e.message || e) + '\n(캡처해서 보내 주세요)' });
  }
}

/* ---------------- 네이버 쇼핑 순위 (네이버 공식 쇼핑 검색 API) ----------------
   생성기 '네이버 위치 자동 확인' → 웹앱 ?p=rank&kw=대표|서브…&pid=상품번호&nm=상품명&st=스토어&pr=가격
   대표 키워드 → 대표 키워드 + 가격 필터(±10%) → 서브 키워드 순서로, 키워드마다 네이버 쇼핑 정확도순 1~200위(PC 5페이지 = 40개씩)에서 찾음
   API 순위는 광고를 뺀 순위라 실제 화면과 조금 다를 수 있음. 키(Client ID/Secret)는 처음 열 때 이 페이지에서 한 번 넣으면 스크립트 속성에 저장 */
function naverKeys_() {
  const p = PropertiesService.getScriptProperties();
  return { id: p.getProperty('NAVER_ID') || CONFIG.NAVER_CLIENT_ID || '', secret: p.getProperty('NAVER_SECRET') || CONFIG.NAVER_CLIENT_SECRET || '' };
}
function naverShop_(q, start) {
  const k = naverKeys_();
  const r = UrlFetchApp.fetch('https://openapi.naver.com/v1/search/shop.json?query=' + encodeURIComponent(q) + '&display=100&start=' + start + '&sort=sim',
    { headers: { 'X-Naver-Client-Id': k.id, 'X-Naver-Client-Secret': k.secret }, muteHttpExceptions: true });
  const code = r.getResponseCode();
  if (code === 401) throw new Error('네이버 API 키가 맞지 않아요 (401). 아래에서 키를 다시 넣어 주세요.');
  if (code !== 200) throw new Error('네이버 API 오류 ' + code + ': ' + r.getContentText().slice(0, 150));
  return JSON.parse(r.getContentText()).items || [];
}
function naverRank_(o) {
  const norm = function (t) { return String(t || '').replace(/<[^>]+>/g, '').replace(/[\s\[\]\(\)\/,.·\-_+~!*'"]/g, '').toLowerCase(); };
  const nmK = norm(o.nm).slice(0, 12), stK = norm(o.st), pr = Number(o.pr) || 0;
  const lo = pr ? Math.floor(pr * 0.9 / 100) * 100 : 0, hi = pr ? Math.ceil(pr * 1.1 / 100) * 100 : 0;
  // 1) 상품번호(스마트스토어 주소) 2) 상품명 앞부분 + 스토어 3) 상품명 앞부분 (가격비교 묶음 등)
  const find = function (items) {
    let best = null;
    items.forEach(function (it, i) {
      const t = norm(it.title), m = norm(it.mallName);
      const how = o.pid && String(it.link || '').indexOf(o.pid) !== -1 ? '상품번호' : (nmK && t.indexOf(nmK) !== -1 ? (stK && m === stK ? '상품명+스토어' : '상품명') : '');
      const rank = { '상품번호': 3, '상품명+스토어': 2, '상품명': 1 }[how] || 0;
      if (rank && (!best || rank > best.r)) best = { i: i, r: rank, how: how };
    });
    return best;
  };
  const steps = [], log = [];
  if (o.kws.length) steps.push([o.kws[0], false, '① 대표']);
  if (o.kws.length && pr) steps.push([o.kws[0], true, '② 가격필터']);
  o.kws.slice(1).forEach(function (k) { steps.push([k, false, '③ 서브']); });
  const cache = {};
  for (let s = 0; s < steps.length; s++) {
    const k = steps[s][0], f = steps[s][1], lab = steps[s][2];
    if (!cache[k]) cache[k] = naverShop_(k, 1).concat(naverShop_(k, 101));
    const items = f ? cache[k].filter(function (it) { const v = Number(it.lprice) || 0; return v >= lo && v <= hi; }) : cache[k];
    const b = find(items);
    if (b) return { page: Math.floor(b.i / 40) + 1, rank: b.i + 1, kw: k, filter: f ? '가격 ' + lo.toLocaleString('ko-KR') + '~' + hi.toLocaleString('ko-KR') + '원' : '', how: b.how, step: lab, log: log };
    log.push(lab + " '" + k + "' " + items.length + '개 중 없음');
  }
  return { page: 0, log: log };
}
function rankPage_(p) {
  const props = PropertiesService.getScriptProperties();
  let msg = '';
  if (p.nid && p.nsecret) { props.setProperty('NAVER_ID', String(p.nid).trim()); props.setProperty('NAVER_SECRET', String(p.nsecret).trim()); msg = '✔ 키를 저장했어요.'; }
  const o = { kws: String(p.kw || '').split('|').map(function (x) { return x.trim(); }).filter(Boolean), pid: String(p.pid || '').replace(/\D/g, ''), nm: String(p.nm || ''), st: String(p.st || ''), pr: String(p.pr || '') };
  const keys = naverKeys_();
  let out = '', err = '', r = null;
  if (keys.id && keys.secret && o.kws.length) {
    try { r = naverRank_(o); } catch (e) { err = String(e.message || e); }
    if (r && r.page) out = ['찾은 페이지 : ' + r.page + '페이지', '찾은 기기 : PC', '찾은 키워드 : ' + r.kw, r.filter ? '필터 : ' + r.filter : '',
      '확인 : 네이버 쇼핑 API ' + r.rank + '위 (' + r.step + ', ' + r.how + '로 찾음, 광고 뺀 순위)'].filter(Boolean).join('\n');
    else if (r) out = ['찾은 페이지 : 못 찾음', '찾은 기기 : PC', '확인한 것 : ' + r.log.join(' / ')].join('\n');
  }
  const esc = function (t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); };
  const hidden = ['k', 'kw', 'pid', 'nm', 'st', 'pr'].map(function (n) { return '<input type="hidden" name="' + n + '" value="' + esc(p[n] || '') + '">'; }).join('') + '<input type="hidden" name="p" value="rank">';
  const keyForm = '<form method="get" action="' + esc(CONFIG.WEBAPP_URL || '') + '" target="_top">' + hidden +
    '<p class="h">네이버 API 키 넣기 (처음 한 번만)</p><ol class="s"><li><a href="https://developers.naver.com/apps/#/register" target="_blank">네이버 개발자 센터 → 애플리케이션 등록</a> (네이버 로그인)</li>' +
    '<li>이름: 체험단 순위 / 사용 API: <b>검색</b> / 환경 추가: <b>WEB 설정</b>, 웹 서비스 URL: https://script.google.com → 등록</li><li>나온 <b>Client ID</b>, <b>Client Secret</b>을 아래에 붙여넣고 저장</li></ol>' +
    '<input name="nid" placeholder="Client ID"><input name="nsecret" placeholder="Client Secret"><button>저장하고 위치 확인</button></form>';
  const body = '<h1>네이버 위치 확인</h1>' + (msg ? '<p class="ok">' + msg + '</p>' : '') +
    (o.kws.length ? '<p class="s">키워드: ' + esc(o.kws.join(' → ')) + (o.pr ? ' / 가격 필터 기준 ' + esc(o.pr) + '원' : '') + (o.nm ? '<br>상품: ' + esc(o.nm) + (o.st ? ' (' + esc(o.st) + ')' : '') : '') + '</p>' : '<p class="err">키워드가 없어요. 생성기의 버튼으로 열어 주세요.</p>') +
    (err ? '<p class="err">' + esc(err) + '</p>' : '') +
    (out ? '<p class="h">결과 — 복사해서 생성기 \'상품 정보\' 칸에 붙여넣기</p><textarea id="o" readonly>' + esc(out) + '</textarea><button onclick="c()">복사</button>' : '') +
    (!(keys.id && keys.secret) || /401|키/.test(err) ? keyForm : '');
  const html = '<style>body{font-family:-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;font-size:15px;margin:0;padding:16px;background:#f4f4f8;color:#1d1a24}h1{font-size:20px;margin:0 0 10px}' +
    '.h{font-weight:700;margin:14px 0 6px}.s{color:#555;font-size:13px}.ok{color:#2f7a2f}.err{color:#a3271b;white-space:pre-wrap}textarea,input{width:100%;box-sizing:border-box;font:inherit;padding:10px;border:1px solid #cfc9db;border-radius:8px;margin:4px 0;background:#fff}' +
    'textarea{height:130px}button{width:100%;padding:12px;border:0;border-radius:8px;background:#03c75a;color:#fff;font:inherit;font-weight:700;margin-top:6px}</style>' + body +
    '<script>function c(){var t=document.getElementById("o");t.select();try{navigator.clipboard.writeText(t.value).then(function(){document.querySelector("button").textContent="복사됨"},function(){document.execCommand("copy")})}catch(e){document.execCommand("copy")}}</' + 'script>';
  return HtmlService.createHtmlOutput(html).setTitle('네이버 위치 확인').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ---------------- 리뷰 배정 (구매·폼이 다 끝난 뒤 카톡방에 새로 보내는 리뷰 공지) ----------------
   ?p=review : 의뢰(명단 시트 하나 = 의뢰서 하나)를 고르면 모든 일차 응답에서 수취인 이름과 산 상품을 읽어서
   상품별 리뷰 종류·개수(예: 옥광밤 별점 4, 텍스트리뷰 6)를 날마다 고르게 사람(수취인 이름 기준)에게 나눔 → 일차(카톡방)마다 공지
   공지 종류: 나눠 배정 / 전체 텍스트리뷰 / 포토대기 / 구확건 / 직접 찍은 사진 포토리뷰(0/N) */
const RV_KINDS = { mix: '리뷰 종류 나눠 배정', text: '전체 텍스트리뷰', photo: '포토대기 (업체가 사진 줌)', self: '직접 찍은 사진 포토리뷰', confirm: '구확건 (구매확정만)' };
const RECIP_RE = /수취인|받는\s*(분|사람)|받으시는/;

// '옥광밤 : 별점 4, 텍스트리뷰 6 / 황금향 : 별점 5, 텍스트리뷰 9' → [{name, mix:[{label,n}]}]  (상품 하나면 '별점 2, 텍스트리뷰 3'만 써도 됨)
function parseRvMix_(text) {
  const TYPE = /^(별점|텍스트|글씨|포토|사진|리뷰|한\s*줄|1줄|일반)/;
  return String(text || '').split(/\s*(?:\/|\n)\s*/).map(function (seg) {
    let m = seg.match(/^\s*([^:：]+?)\s*[:：]\s*(.*)$/), name = '', body = seg;
    if (m) { name = m[1].trim(); body = m[2]; }
    else { m = seg.match(/^\s*(\S+)\s+(.*\d.*)$/); if (m && !TYPE.test(m[1])) { name = m[1]; body = m[2]; } }
    const mix = [];
    // '별점 4, 텍스트리뷰 6' / '별점4 텍스트리뷰6' / '포토리뷰(1줄리뷰) 5'
    const re = /([^,\s\d][^,]*?)\s*(\d+)\s*(?:개|건|명)?\s*(?=,|$|\s+[^\d\s,])/g;
    let x;
    while ((x = re.exec(body))) { const l = x[1].replace(/^[,\s]+|[,\s]+$/g, '').replace(/\s+/g, ''); if (l) mix.push({ label: l, n: Number(x[2]) }); }
    return { name: name, mix: mix };
  }).filter(function (p) { return p.mix.length; });
}

// 이 의뢰의 모든 일차 응답: [{day, run, t, name(수취인), nick, opt, price, prod}]
function reviewRows_(runs, chain, prods) {
  const k = function (x) { return String(x || '').toLowerCase().replace(/\s+/g, ''); };
  const num = function (x) { return Number(String(x).replace(/[^0-9]/g, '')) || 0; };
  const rows = [];
  chain.runs.forEach(function (r, di) {
    if (!r['시트ID']) return;
    const info = rawInfo_(r['시트ID'], r['폼ID']);
    const w = windowOf_(runs, r);
    const src = info.src || info.raw, st = info.start || 2, lr = src.getLastRow();
    let rc = info.head.findIndex(function (h) { return RECIP_RE.test(h); }) + 1;
    if (!rc) rc = info.head.findIndex(function (h) { return MATCH.name.test(h) && !MATCH.nick.test(h) && !/예금주/.test(h); }) + 1;
    const data = lr < st ? [] : src.getRange(st, 1, lr - st + 1, info.head.length).getValues()
      .filter(function (x) { return x[0] instanceof Date && x[0].getTime() >= w.from && x[0].getTime() < w.to; });
    // 상품 알아내기: 폼 옵션 글에 상품 이름 → 결제 금액이 그 상품 가격 → 배정 탭(닉네임 → 공지 옵션) → 상품이 하나면 그것
    let desc = '';
    try { desc = FormApp.openById(r['폼ID']).getDescription() || ''; } catch (e) {}
    const np = noticeProducts_(desc);
    const asg = {}, optNicks = [];
    try {
      const as = assignSheet_(), last = as.getLastRow();
      if (last >= 2) as.getRange(2, 1, last - 1, 9).getValues().forEach(function (v) {
        if (String(v[0]) !== String(r['명단 제목'])) return;
        asg[k(v[1])] = String(v[2]);
        if (!(v[3] !== '' && Number(v[3]) === 0)) optNicks.push({ nick: String(v[1]).trim(), choice: k(v[7]), price: num(v[8]) });   // 취소(0)는 빼고
      });
    } catch (e) {}
    // 닉네임 질문이 없던 예전 폼: 저장한 공지(배정 탭)에서 그 옵션을 산 사람이 한 명뿐이면 그 사람 주문으로 봄
    const nickByOpt = function (opt, price) {
      const ns = optNicks.filter(function (o) { return (o.choice && o.choice === k(opt)) || (!o.choice && o.price && o.price === price); }).map(function (o) { return o.nick; });
      const u = ns.filter(function (x, i) { return ns.indexOf(x) === i; });
      return u.length === 1 ? u[0] : '';
    };
    const prodOf = function (opt, price, nick) {
      if (prods.length === 1) return prods[0].name;
      const hit = function (t) { const tt = k(t); return prods.filter(function (p) { return p.name && tt.indexOf(k(p.name)) !== -1; })[0]; };
      let p = hit(opt) || (asg[k(nick)] ? hit(asg[k(nick)]) : null);
      if (!p && price) { const g = np.filter(function (x) { return x.prices.indexOf(price) !== -1; }); if (g.length === 1) p = hit(g[0].name); }
      return p ? p.name : '';
    };
    data.forEach(function (x) {
      const opt = info.optCol ? String(x[info.optCol - 1]).trim() : '', price = info.priceCol ? num(x[info.priceCol - 1]) : 0;
      const nick = info.nickCol ? String(x[info.nickCol - 1]).trim() : nickByOpt(opt, price);
      rows.push({ day: di, run: r, t: x[0].getTime(), name: rc ? String(x[rc - 1]).trim() : '', nick: nick, opt: opt, price: price, prod: prodOf(opt, price, nick) });
    });
  });
  return rows;
}

// 개수를 n에 맞게 (남는 건 소수점 큰 쪽부터)
function rvScale_(mix, n) {
  const sum = mix.reduce(function (a, o) { return a + o.n; }, 0);
  if (!sum || sum === n) return mix.map(function (o) { return o.n; });
  const ex = mix.map(function (o) { return o.n * n / sum; }), res = ex.map(Math.floor);
  let rest = n - res.reduce(function (a, x) { return a + x; }, 0);
  ex.map(function (x, i) { return [x - Math.floor(x), i]; }).sort(function (a, b) { return b[0] - a[0]; }).forEach(function (q) { if (rest > 0) { res[q[1]]++; rest--; } });
  return res;
}
// 상품 하나의 구매들에 리뷰 종류 배정: 날마다 고르게(남은 개수 비율대로), 그날 안에서는 옵션이 섞이게 번갈아
function rvAssign_(items, mix, nDays) {
  const left = rvScale_(mix, items.length);
  for (let d = 0; d < nDays; d++) {
    const day = items.filter(function (it) { return it.day === d; }).sort(function (a, b) { return a.opt < b.opt ? -1 : a.opt > b.opt ? 1 : a.t - b.t; });
    if (!day.length) continue;
    const L = left.reduce(function (a, x) { return a + x; }, 0);
    const take = rvScale_(left.map(function (x) { return { n: x }; }), Math.min(day.length, L));
    const room = take.slice();
    // 한 사람(카톡 닉네임)이 여러 계정·수취인으로 샀으면 되도록 같은 리뷰 종류로 (많이 산 사람부터, 남은 자리가 큰 종류에)
    //  공지에는 주문마다 수취인 이름이 따로 나감 (박미영 → 송석민, 박장환, 황귀순, 박미영)
    const groups = {}, order = [];
    day.forEach(function (it) { const key = it.nick ? 'n:' + it.nick : (it.name ? 'r:' + it.name : 't:' + it.t); if (!groups[key]) { groups[key] = []; order.push(key); } groups[key].push(it); });
    order.sort(function (a, b) { return groups[b].length - groups[a].length; }).forEach(function (key) {
      groups[key].forEach(function (it) {
        let bi = -1;
        const fit = room.map(function (x, i) { return [x, i]; }).filter(function (q) { return q[0] >= groups[key].length; });
        const pickFrom = fit.length ? fit : room.map(function (x, i) { return [x, i]; }).filter(function (q) { return q[0] > 0; });
        if (pickFrom.length) bi = pickFrom.sort(function (a, b) { return b[0] - a[0] || a[1] - b[1]; })[0][1];
        if (it.__rvKey === key && it.__rvI !== undefined && room[it.__rvI] > 0) bi = it.__rvI;
        if (bi < 0) { it.rv = ''; return; }
        room[bi]--; it.rv = mix[bi].label;
        groups[key].forEach(function (o) { o.__rvKey = key; o.__rvI = bi; });
      });
    });
    take.forEach(function (tn, i) { left[i] -= tn - room[i]; });
  }
}
// 일차(카톡방)마다 리뷰 공지 글
// 리뷰 공지 맨 밑 (사용자 문구 그대로)
const RV_END = '배송완료 후 7일이내로 작성해주시되\n몰리지 않게 리뷰 부탁드려요!\n감사합니다 🫶🏻';
function rvNotice_(kind, guide, items, prods) {
  const t = rvNotice0_(kind, guide, items, prods);
  // 구확건, 사진 오기 전 포토대기는 아직 리뷰 쓰는 게 아니라 맺음말 없음
  return kind === 'confirm' || /^★★★포토대기★★★/.test(t) ? t : t + '\n\n' + RV_END;
}
function rvNotice0_(kind, guide, items, prods) {
  const gl = guide ? '리뷰내용 가이드 : ' + guide : '';
  if (kind === 'text') return ['★★★전체 텍스트리뷰★★★', gl].filter(Boolean).join('\n');
  if (kind === 'photo') {
    // 업체 사진이 오기 전: 포토대기. 사진 세트를 나눴으면 사람마다 세트 번호 (같은 배경 사진은 한 사람에게)
    if (!items.some(function (it) { return it.set; })) return ['★★★포토대기★★★', gl].filter(Boolean).join('\n');
    const nm = function (it) { return it.name || (it.nick ? it.nick + '(닉네임)' : '이름 없음'); };
    const none = items.filter(function (it) { return !it.set; });
    return ['★★★리뷰 안내★★★', gl, '수취인 이름으로 본인 사진 세트 확인해 주세요! (사진은 따로 보내드려요)', '']
      .concat(items.filter(function (it) { return it.set; }).map(function (it) { return '세트' + it.set + ' : ' + nm(it); }))
      .concat(none.length ? ['', '사진 준비 중 : ' + none.map(nm).join(', ') + ' (사진 오면 따로 안내드려요)'] : []).filter(function (x, i) { return x !== '' || i > 0; }).join('\n');
  }
  if (kind === 'confirm') return '★★★구확건★★★';
  if (kind === 'self') return ['0/' + items.length + ' 사진 5장 이상 사용샷 포토리뷰', '너무 성의 없는 리뷰는 수정 요청 올 수 있어요', gl].filter(Boolean).join('\n');
  // 같은 방에서 한 사람이 리뷰 종류가 두 개로 나뉘면 어느 주문인지 옵션을 붙임
  const nm = function (it) { return it.name || (it.nick ? it.nick + '(닉네임)' : '이름 없음'); };
  const kinds = {};
  items.forEach(function (it) { (kinds[nm(it)] = kinds[nm(it)] || {})[it.rv || ''] = 1; });
  const optShort = function (o) { return String(o || '').replace(/\s*\([\d,\s]+원\)\s*$/, '').replace(new RegExp('^(' + prods.map(function (p) { return p.name; }).filter(Boolean).join('|') + ')\\s*'), '').trim(); };
  const who = function (list) {
    const c = {}, order = [];
    list.forEach(function (it) {
      const n = nm(it) + (Object.keys(kinds[nm(it)]).length > 1 && optShort(it.opt) ? '(' + optShort(it.opt) + ')' : '');
      if (!c[n]) { c[n] = 0; order.push(n); } c[n]++;
    });
    return order.map(function (n) { return c[n] > 1 ? n + ' ' + c[n] : n; }).join(', ');
  };
  const out = ['★★★리뷰 안내★★★', gl, '수취인 이름으로 본인 리뷰 종류 확인해 주세요!'].filter(Boolean);
  const names = prods.map(function (p) { return p.name; }).concat(items.some(function (it) { return !it.prod; }) ? [''] : []);
  names.forEach(function (pn) {
    const mine = items.filter(function (it) { return it.prod === pn; });
    if (!mine.length) return;
    out.push('');
    if (prods.length > 1) out.push('[' + (pn || '상품 모름 — 직접 확인') + ']');
    const p = prods.filter(function (x) { return x.name === pn; })[0];
    (p ? p.mix.map(function (o) { return o.label; }) : []).concat(['']).forEach(function (lab) {
      const l = mine.filter(function (it) { return (it.rv || '') === lab; });
      if (l.length) out.push((lab || '종류 미정') + ' (' + l.length + '명) : ' + who(l));
    });
  });
  return out.join('\n');
}
// 의뢰 하나 계산: 일차마다 {room, title, items, notice}
function reviewPlan_(runs, chain, o) {
  const prods = parseRvMix_(o.mix);
  if (!prods.length && o.kind === 'mix') return { err: '리뷰 종류와 개수를 넣어 주세요 (예: 옥광밤 : 별점 4, 텍스트리뷰 6 / 황금향 : 별점 5, 텍스트리뷰 9)' };
  if (prods.length === 1 && !prods[0].name) prods[0].name = '상품';
  const rows = reviewRows_(runs, chain, prods.length ? prods : [{ name: '상품', mix: [] }]);
  if (o.kind === 'mix') prods.forEach(function (p) { rvAssign_(rows.filter(function (it) { return it.prod === p.name; }), p.mix, chain.runs.length); });
  // 포토: 업체 사진 세트 수만큼 앞사람부터 세트 번호 (일차 순, 응답 순)
  const nSets = Number(o.sets) || 0;
  if (o.kind === 'photo' && nSets) rows.slice().sort(function (a, b) { return a.day - b.day || a.t - b.t; }).forEach(function (it, i) { if (i < nSets) it.set = i + 1; });
  const days = chain.runs.map(function (r, di) {
    const items = rows.filter(function (it) { return it.day === di; });
    return { room: String(r['카톡방'] || bareTitle_(r['명단 제목'])), title: String(r['명단 제목']), items: items, notice: items.length ? rvNotice_(o.kind, o.guide, items, prods) : '' };
  });
  let sum = prods.map(function (p) {
    const mine = rows.filter(function (it) { return it.prod === p.name; });
    return p.name + ' ' + mine.length + '명: ' + p.mix.map(function (x) { return x.label + ' ' + mine.filter(function (it) { return it.rv === x.label; }).length; }).join(', ') + (p.mix.reduce(function (a, x) { return a + x.n; }, 0) !== mine.length ? ' (의뢰서 ' + p.mix.map(function (x) { return x.label + ' ' + x.n; }).join(', ') + ' → 실제 인원에 맞춰 나눔)' : '');
  });
  const unknown = rows.filter(function (it) { return !it.prod; }).length;
  if (o.kind === 'photo' && nSets) sum = ['사진 세트 ' + nSets + '개 / ' + rows.length + '명' + (nSets < rows.length ? ' → ' + (rows.length - nSets) + '명 사진 모자람: 업체에 인원별 사진 더 요청하세요' : (nSets > rows.length ? ' (세트 ' + (nSets - rows.length) + '개 남음)' : ''))];
  return { days: days, sum: sum, unknown: unknown, total: rows.length };
}

function reviewPage_(p) {
  const esc = function (t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); };
  const url = function (q) { return esc((CONFIG.WEBAPP_URL || '') + '?p=review&k=' + encodeURIComponent(CONFIG.KEY) + Object.keys(q).map(function (x) { return '&' + x + '=' + encodeURIComponent(q[x]); }).join('')); };
  const runs = readRuns_();
  const chains = chainsOf_(runs).filter(function (c) { return c.runs.length && c.runs[0]['시트ID']; });
  const now = Date.now();
  let body = '<h1>리뷰 배정</h1><p class="s">구매·폼 작성이 다 끝난 뒤 카톡방에 새로 보내는 리뷰 공지예요. 사람은 <b>수취인 이름</b> 기준.</p>';
  const sid = String(p.s || '');
  const chain = chains.filter(function (c) { return String(c.runs[0]['시트ID']) === sid; })[0];
  if (!chain) {
    const recent = chains.filter(function (c) { const last = c.runs[c.runs.length - 1]['진행일']; return last instanceof Date && now - last.getTime() < 21 * 86400000; })
      .sort(function (a, b) { return b.runs[b.runs.length - 1]['진행일'] - a.runs[a.runs.length - 1]['진행일']; });
    body += '<p class="h">어느 의뢰예요?</p>' + (recent.length ? recent.map(function (c) {
      const f = c.runs[0], l = c.runs[c.runs.length - 1];
      const md = function (d) { return (d.getMonth() + 1) + '.' + d.getDate(); };
      return '<a class="pick" href="' + url({ s: String(f['시트ID']) }) + '" target="_top">' + esc(campOf_(f['명단 제목'])) + '<span class="s"> ' + md(f['진행일']) + (c.runs.length > 1 ? '~' + md(l['진행일']) : '') + ' · ' + c.runs.length + '일 · ' +
        c.runs.reduce(function (a, r) { return a + (Number(r['인원']) || 0); }, 0) + '명</span></a>';
    }).join('') : '<p class="s">최근 3주 진행이 없어요.</p>');
  } else {
    const pr = PropertiesService.getScriptProperties();
    let saved = {};
    try { saved = JSON.parse(pr.getProperty('RV_' + sid) || '{}'); } catch (e) {}
    let desc = '';
    try { desc = FormApp.openById(chain.runs[0]['폼ID']).getDescription() || ''; } catch (e) {}
    const o = { kind: String(p.kind || saved.kind || (/^\s*유/.test(String(chain.runs[0]['포토'] || '')) ? 'photo' : 'mix')), mix: p.mix != null ? String(p.mix) : String(saved.mix || noticeProducts_(desc).map(function (x) { return x.name + ' : '; }).join(' / ')), guide: p.guide != null ? String(p.guide) : String(saved.guide || ''),
      sets: p.sets != null ? String(p.sets).replace(/\D/g, '') : String(saved.sets || '') };
    // 고친 값은 다음에 열 때도 그대로
    if (p.mix != null || p.kind || p.guide != null || p.sets != null) { try { pr.setProperty('RV_' + sid, JSON.stringify(o)); } catch (e) {} }
    const plan = reviewPlan_(runs, chain, o);
    let msg = '';
    if (p.q != null && plan.days && plan.days[Number(p.q)] && plan.days[Number(p.q)].notice) { const d = plan.days[Number(p.q)]; queueMsg_(d.room, d.notice, '리뷰'); msg = '✔ 보낼 메시지함에 넣었어요: ' + d.room; if (!(o.kind === 'photo' && !Number(o.sets))) pr.setProperty('RVSENT_' + campKey_(d.title) + '_' + dateTok_(d.title), '1'); }
    const hidden = '<input type="hidden" name="p" value="review"><input type="hidden" name="k" value="' + esc(CONFIG.KEY) + '"><input type="hidden" name="s" value="' + esc(sid) + '">';
    body += '<p class="h">' + esc(campOf_(chain.runs[0]['명단 제목'])) + ' <a class="s" href="' + url({}) + '" target="_top">(다른 의뢰)</a></p>' + (msg ? '<p class="ok">' + esc(msg) + '</p>' : '') +
      '<form method="get" action="' + esc(CONFIG.WEBAPP_URL || '') + '" target="_top">' + hidden +
      '<label>공지 종류<select name="kind">' + Object.keys(RV_KINDS).map(function (x) { return '<option value="' + x + '"' + (x === o.kind ? ' selected' : '') + '>' + RV_KINDS[x] + '</option>'; }).join('') + '</select></label>' +
      '<label>리뷰 종류와 개수 (의뢰서 전체 기준. 상품마다 / 로 나눔)<textarea name="mix" placeholder="옥광밤 : 별점 4, 텍스트리뷰 6 / 황금향 : 별점 5, 텍스트리뷰 9">' + esc(o.mix) + '</textarea></label>' +
      '<label>리뷰내용 가이드<input name="guide" value="' + esc(o.guide) + '" placeholder="예: 너무 길지 않게 간단하게 부탁드려요"></label>' +
      '<label>포토대기일 때: 업체에서 받은 사진 세트 수 (같은 배경 사진끼리 한 세트, 비우면 \'포토대기\' 공지)<input name="sets" inputmode="numeric" value="' + esc(o.sets) + '" placeholder="예: 16"></label><button>이대로 나누기</button></form>';
    if (plan.err) body += '<p class="err">' + esc(plan.err) + '</p>';
    else {
      body += '<p class="s">' + esc(plan.total + '명 · ' + plan.sum.join(' / ')) + (plan.unknown ? '<br><b class="err">' + plan.unknown + '명은 어느 상품을 샀는지 몰라요 (아래 공지에 따로 표시)</b>' : '') + '</p>';
      plan.days.forEach(function (d, i) {
        body += '<div class="day"><p class="h">' + (i + 1) + '일차 · ' + esc(d.room) + ' (' + d.items.length + '명)</p>';
        if (!d.items.length) { body += '<p class="s">응답이 없어요.</p></div>'; return; }
        body += '<textarea id="t' + i + '" readonly>' + esc(d.notice) + '</textarea><div class="row"><button type="button" onclick="c(' + i + ',this)">복사</button><a class="btn" href="' + url({ s: sid, q: String(i) }) + '" target="_top">보낼 메시지함에 넣기</a></div>' +
          '<details><summary>누가 뭘 샀는지 보기</summary><table><tr><th>수취인</th><th>닉네임</th><th>산 것</th><th>리뷰</th></tr>' +
          d.items.map(function (it) { return '<tr><td>' + esc(it.name) + '</td><td>' + esc(it.nick) + '</td><td>' + esc(it.opt ? (it.prod && it.opt.indexOf(it.prod) === -1 ? it.prod + ' · ' : '') + it.opt.replace(/\s*\([\d,\s]+원\)\s*$/, '') : (it.prod || '?')) + '</td><td>' + esc(it.rv || '') + '</td></tr>'; }).join('') + '</table></details></div>';
      });
    }
  }
  const html = '<style>body{font-family:-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;font-size:15px;margin:0;padding:16px;background:#f4f4f8;color:#1d1a24;max-width:720px}h1{font-size:20px;margin:0 0 6px}' +
    '.h{font-weight:700;margin:14px 0 6px}.s{color:#666;font-size:13px;font-weight:400}.ok{color:#2f7a2f}.err{color:#a3271b;white-space:pre-wrap}label{display:block;margin:8px 0;font-size:13px;color:#444}' +
    'textarea,input,select{width:100%;box-sizing:border-box;font:inherit;padding:10px;border:1px solid #cfc9db;border-radius:8px;margin:4px 0;background:#fff}textarea{height:90px}.day textarea{height:220px;font-size:14px}' +
    'button,.btn{display:block;width:100%;box-sizing:border-box;text-align:center;padding:12px;border:0;border-radius:8px;background:#5b2a86;color:#fff;font:inherit;font-weight:700;margin-top:6px;text-decoration:none}.row{display:flex;gap:8px}.row>*{flex:1}' +
    '.pick{display:block;padding:12px;margin:6px 0;background:#fff;border:1px solid #ddd;border-radius:8px;color:#1d1a24;text-decoration:none;font-weight:700}.day{background:#fff;border-radius:10px;padding:10px 12px;margin:12px 0}' +
    'table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-bottom:1px solid #eee;padding:4px;text-align:left;white-space:nowrap}details{overflow-x:auto}</style>' + body +
    '<script>function c(i,b){var t=document.getElementById("t"+i);t.select();try{navigator.clipboard.writeText(t.value).then(function(){b.textContent="복사됨"},function(){document.execCommand("copy");b.textContent="복사됨"})}catch(e){document.execCommand("copy");b.textContent="복사됨"}}</' + 'script>';
  return HtmlService.createHtmlOutput(html).setTitle('리뷰 배정').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function toolsUrl_() { return (CONFIG.WEBAPP_URL || '') + '?p=tools&k=' + CONFIG.KEY; }

function toolAction_(d) {
  const runs = readRuns_();
  const list = runs.filter(function (r) { return r['진행 상태'] !== '종료' && r['폼ID'] && r['시트ID']; })
    .sort(function (a, b) { return (b['진행일'] || 0) - (a['진행일'] || 0); });
  const out = { runs: list.map(function (r) { return { title: String(r['명단 제목']), label: bareTitle_(r['명단 제목']) + '  (' + (Number(r['인원']) || 0) + '/' + (r['목표인원'] || '?') + '명)' }; }) };
  // 휴대폰에서 한눈에 탭 대신 보는 현황 (한눈에 탭은 명단 시트 20여 개를 실시간으로 불러와서 휴대폰 앱에서 잘 안 뜸, 10/20)
  try {
    const t0 = today_().getTime(), md = function (x) { return (x.getMonth() + 1) + '/' + x.getDate(); };
    const st = runs.filter(function (r) { return r['진행 상태'] !== '종료' && r['진행일'] instanceof Date; });
    const grp = function (r) { const t = dayStart_(r['진행일']); return t === t0 ? 0 : t > t0 ? 1 : 2; };
    st.sort(function (a, b) { return grp(a) - grp(b) || (grp(a) === 2 ? b['진행일'] - a['진행일'] : a['진행일'] - b['진행일']); });
    out.status = st.slice(0, 40).map(function (r) {
      const got = Number(r['인원']) || 0, goal = Number(r['목표인원']) || 0;
      return { d: md(r['진행일']), t: bareTitle_(r['명단 제목']), got: got, goal: goal, g: grp(r), done: r['마감 시각'] instanceof Date, real: r['실배송'] === 'Y' };
    });
    out.last = String(PropertiesService.getScriptProperties().getProperty('LAST_REPORT') || '');
    out.black = Object.keys(blacklist_()).map(function (k) { return blacklist_()[k]; });
  } catch (e) { out.status = []; }
  if (d.act === 'sent' && d.id) markMsg_(String(d.id), '보냄');
  try { out.outbox = outboxItems_().filter(function (x) { return x.st === '대기'; }).slice(0, 15); } catch (e) { out.outbox = []; }
  let r = list.filter(function (x) { return String(x['명단 제목']) === String(d.title || ''); })[0];
  // 공지를 붙여넣으면 어느 진행인지 알아서 찾음 (진행을 안 골라도 됨)
  if (d.act === 'assign' && String(d.text || '').trim()) {
    const found = findRunByNotice_(list, String(d.text));
    // 직접 고른 진행이 있고 같은 의뢰면 그걸로 (자동으로 찾은 것보다 우선)
    const same = function (a, b) { return a && b && campKey_(a['캠페인'] || a['명단 제목']) === campKey_(b['캠페인'] || b['명단 제목']); };
    let note = '';
    if (r && (same(r, found.run) || (!found.run && noticeMatches_(r, d.text)))) { /* 고른 진행 그대로 */ }
    else if (found.run) { if (r) note = '⚠ 고른 진행(' + bareTitle_(r['명단 제목']) + ')과 공지 상품이 달라서 공지에 맞는 진행으로 저장했어요.\n'; r = found.run; }
    else if (!r || !noticeMatches_(r, d.text)) { out.msg = found.msg || '⚠ 이 공지가 어느 진행 건지 못 찾았어요. (저장 안 함)'; return out; }
    out.msg = note + assignRun_(r, String(d.text));
    // 저장은 여기서 끝. 중복·모자란 인원은 화면이 바로 이어서 따로 불러옴 (저장 결과가 빨리 보이게)
    out.title = String(r['명단 제목']); out.saved = true;
    return out;
  }
  if (!r) return out;   // 진행을 고르기 전에는 아무것도 안 함
  if (d.act === 'unassign') { writeAssign_(r, []); out.msg = '이 진행 배정을 비웠어요.'; }
  if (d.act === 'move' && d.to) {
    const to = list.filter(function (x) { return String(x['명단 제목']) === String(d.to); })[0];
    out.msg = to ? moveAssign_(r, to) : '옮길 진행을 못 찾았어요.';
    if (to) r = to;
  }
  if (d.act === 'remove') { out.msg = deleteRun_(r); return Object.assign(toolAction_({ act: 'info' }), { msg: out.msg }); }
  if (d.act === 'delete' && (d.times || []).length) out.msg = deleteRunTimes_(r, d.times.map(Number));
  if (d.act === 'more') out.msg = addMoreRun_(r, Number(d.n) || 0);
  out.empty = !(Number(r['인원']) > 0);
  // ④ 추가 모집이 만들어질 날짜 = 이 진행 다음 날 (지난 진행이면 내일)
  const nb = nextWorkday_(r['진행일'] instanceof Date && r['진행일'] >= today_() ? r['진행일'] : today_());
  out.nextMd = (nb.getMonth() + 1) + '.' + nb.getDate();
  // 같은 의뢰의 다른 날 (배정을 잘못된 날에 넣었을 때 옮기기 버튼)
  out.alts = list.filter(function (x) { return x !== r && campKey_(x['캠페인'] || x['명단 제목']) === campKey_(r['캠페인'] || r['명단 제목']); })
    .map(function (x) { return { title: String(x['명단 제목']), label: bareTitle_(x['명단 제목']) }; });
  const me = readRuns_().filter(function (x) { return String(x['명단 제목']) === String(r['명단 제목']) || (sameRunTitle_(x['명단 제목'], r['명단 제목']) && String(x['시트ID']) === String(r['시트ID'])); })[0] || r;
  out.title = String(me['명단 제목']);
  out.count = Number(me['인원']) || 0; out.target = Number(me['목표인원']) || 0;
  try { out.dups = dupList_(me); } catch (e) { out.dups = []; out.dupErr = e.message; }
  try { out.short = shortByOption_(readRuns_(), me); } catch (e) { out.short = {}; }
  const as = assignSheet_(), last = as.getLastRow();
  out.assigned = last >= 2 && as.getRange(2, 1, last - 1, 1).getValues().some(function (x) { return String(x[0]) === out.title; });
  return out;
}

// 붙여넣은 카톡 공지가 어느 진행 건지: 폼 링크가 같으면 확실, 아니면 판매처·상품 이름. 같은 폼을 여러 날 쓰면 오늘 진행 (없으면 가장 가까운 지난 진행)
function findRunByNotice_(list, text) {
  const link = (String(text).match(FORM_LINK_RE) || [])[0] || '';
  const prods = noticeProducts_(text);
  // 빠르게: 진행목록의 폼 링크가 같으면 폼을 안 열고 바로 (폼 여는 데 한 개에 1초쯤 걸림)
  let quick = link ? list.filter(function (r) { return String(r['폼 링크']).trim() === link; }) : [];
  // 그다음: 진행목록 업체 이름이 공지 판매처와 같은 것 (폼 안 열고)
  const nk = function (x) { return String(x || '').replace(/\s+/g, ''); };
  if (!quick.length && prods.length) quick = list.filter(function (r) { return nk(r['업체']) && prods.some(function (p) { return p.shop && nk(p.shop) === nk(r['업체']); }); });
  const yday = today_().getTime() - 864e5;
  const scored = quick.length ? quick.map(function (r) { return { r: r, sc: 2 }; }) : list.filter(function (r) { return !(r['진행일'] instanceof Date) || r['진행일'].getTime() >= yday; }).map(function (r) {
    let desc = '';
    try { desc = FormApp.openById(r['폼ID']).getDescription() || ''; } catch (e) {}
    let sc = 0;
    if (link && (desc.indexOf(link) >= 0 || String(r['폼 링크']) === link)) sc = 2;
    else if (prods.length) { const b = noticeProducts_(desc); if (prods.some(function (x) { return b.some(function (y) { return (x.name && x.name === y.name) || (x.shop && x.shop === y.shop); }); })) sc = 1; }
    return { r: r, sc: sc };
  }).filter(function (x) { return x.sc > 0; });
  if (!scored.length) return { msg: '⚠ 이 공지가 어느 진행 건지 못 찾았어요. 아래에서 진행을 고르고 다시 저장해 주세요. (저장 안 함)' };
  const best = Math.max.apply(null, scored.map(function (x) { return x.sc; }));
  const c = scored.filter(function (x) { return x.sc === best; }).map(function (x) { return x.r; });
  if (c.map(function (x) { return campKey_(x['캠페인'] || x['명단 제목']); }).filter(function (k, i, a) { return a.indexOf(k) === i; }).length > 1)
    return { msg: '⚠ 이 공지와 비슷한 진행이 여러 개예요. 아래에서 진행을 고르고 다시 저장해 주세요. (저장 안 함)' };
  return { run: pickRunForNotice_(list, c, text), cands: c };
}

// 같은 폼·같은 의뢰의 여러 날 중 이 공지가 어느 날 건지
//  1) 공지 이름이 그날 응답 닉네임과 가장 많이 겹치는 날
//  2) 아무도 안 겹치면(아직 신청 전): 아직 안 끝났고 마감 전인 가장 이른 날 → 안 끝난 가장 이른 날 → 가장 늦은 날
//  (예: 10.15 저녁에 10.16 공지를 붙여넣으면 10.14가 아니라 10.16)
function pickRunForNotice_(list, c, text) {
  if (c.length === 1) return c[0];
  const norm = function (x) { return String(x || '').toLowerCase().replace(/\s+/g, ''); };
  let names = [];
  try { names = parseAssign_(text, []).map(function (x) { return norm(x[0]); }).filter(Boolean); } catch (e) {}
  const day = function (x) { return x['진행일'] instanceof Date ? x['진행일'].getTime() : 0; };
  const all = c.slice().sort(function (a, b) { return day(a) - day(b); });
  // 이미 끝난 날은 빼고 봄 (같은 사람이 예전 날에도 참여했으면 그날로 잘못 가지 않게). 다 끝났으면 전부에서
  const live = all.filter(function (r) { return !runOver_(list, r); });
  const asc = live.length ? live : all;
  if (names.length) {
    let best = null, bestN = 0;
    asc.forEach(function (r) {
      try {
        const info = rawInfo_(r['시트ID'], r['폼ID']);
        if (!info.nickCol) return;
        const src = info.src || info.raw, st = info.start || 2, lr = src.getLastRow();
        if (lr < st) return;
        const w = windowOf_(list, r);
        const v = src.getRange(st, 1, lr - st + 1, info.nickCol).getValues();
        const nicks = v.filter(function (x) { return x[0] instanceof Date && x[0].getTime() >= w.from && x[0].getTime() < w.to; }).map(function (x) { return norm(x[info.nickCol - 1]); });
        const n = names.filter(function (nm) { return nicks.indexOf(nm) >= 0; }).length;
        if (n > bestN) { bestN = n; best = r; }
      } catch (e) {}
    });
    if (best) return best;
  }
  return live.filter(function (r) { return !r['마감 시각']; })[0] || live[0] || all[all.length - 1];
}

// 배정을 다른 날 진행으로 옮기기 (공지를 엉뚱한 날에 저장했을 때)
function moveAssign_(from, to) {
  const sh = assignSheet_(), last = sh.getLastRow();
  const v = last >= 2 ? sh.getRange(2, 1, last - 1, 9).getValues() : [];
  const rows = v.filter(function (x) { return String(x[0]) === String(from['명단 제목']) && String(x[1]).trim(); })
    .map(function (x) { return [String(x[1]), String(x[2]), x[3] === '' ? 1 : Number(x[3]), String(x[7] || ''), Number(x[8]) || 0]; });
  if (!rows.length) return bareTitle_(from['명단 제목']) + '에 옮길 배정이 없어요.';
  writeAssign_(to, rows);
  writeAssign_(from, []);
  return '✔ 배정을 [' + bareTitle_(from['명단 제목']) + '] → [' + bareTitle_(to['명단 제목']) + '] 로 옮겼어요. (' + assignSummary_(rows) + ')';
}

// 배정 줄 요약: 8명 10계정 (윤정, 강은아 2, …) / 취소 박지수
function assignSummary_(rows) {
  const ok = rows.filter(function (x) { return x[2] > 0; }), canc = rows.filter(function (x) { return !x[2]; });
  const acc = ok.reduce(function (a, x) { return a + x[2]; }, 0);
  const opts = {};
  ok.forEach(function (x) { opts[x[1] || '옵션 모름'] = (opts[x[1] || '옵션 모름'] || 0) + x[2]; });
  const ok2 = Object.keys(opts).length > 1 ? ' / 옵션별 ' + Object.keys(opts).map(function (o) { return o + ' ' + opts[o]; }).join(', ') : '';
  return ok.length + '명 ' + acc + '계정: ' + ok.map(function (x) { return x[0] + (x[2] > 1 ? ' ' + x[2] : ''); }).join(', ') + ok2 + (canc.length ? ' / 취소 ' + canc.map(function (x) { return x[0]; }).join(' ') : '');
}

// (한 번만, 10/15) 10.16 고구마말랭이 공지가 10.14 진행에 저장된 것을 10.16으로 옮김
function fixGogumaAssignOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('FIX_GOGUMA_1016_V1')) return;
  props.setProperty('FIX_GOGUMA_1016_V1', '1');
  const runs = readRuns_();
  const r14 = runs.filter(function (r) { return dateTok_(r['명단 제목']) === '10.14' && /고구마말랭이/.test(String(r['명단 제목'])); })[0];
  const r16 = runs.filter(function (r) { return dateTok_(r['명단 제목']) === '10.16' && /고구마말랭이/.test(String(r['명단 제목'])); })[0];
  if (!r14 || !r16) return;
  const sh = assignSheet_(), last = sh.getLastRow();
  const v = last >= 2 ? sh.getRange(2, 1, last - 1, 2).getValues() : [];
  const has = function (r) { return v.some(function (x) { return String(x[0]) === String(r['명단 제목']) && String(x[1]).trim(); }); };
  if (has(r14) && !has(r16)) note_('✓ ' + moveAssign_(r14, r16));
}

// (한 번만, 10/19) 10.19 고구마말랭이 배정의 '이진선'은 실제로 이정환 (사용자 확인: 김설하2 김유미2 이문금2 김미경2 이혜영 이정환)
function fixGoguma1019Once_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('FIX_GOGUMA_1019_V1')) return;
  props.setProperty('FIX_GOGUMA_1019_V1', '1');
  const sh = assignSheet_(), last = sh.getLastRow();
  if (last < 2) return;
  sh.getRange(2, 1, last - 1, 2).getValues().forEach(function (v, i) {
    if (dateTok_(v[0]) === '10.19' && /고구마말랭이/.test(String(v[0])) && String(v[1]).trim() === '이진선') { sh.getRange(i + 2, 2).setValue('이정환'); note_('✓ 10.19 고구마말랭이 배정: 이진선 → 이정환'); }
  });
}

// (한 번만, 10/15) 10.16 모두의농수산 공지(김민재, 김동환, 강지연)가 10.14 진행에 저장된 것을 10.16으로
function fixModuAssignOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('FIX_MODU_1016_V1')) return;
  props.setProperty('FIX_MODU_1016_V1', '1');
  const runs = readRuns_();
  const r14 = runs.filter(function (r) { return dateTok_(r['명단 제목']) === '10.14' && /모두의농수산/.test(String(r['명단 제목'])); })[0];
  const r16 = runs.filter(function (r) { return dateTok_(r['명단 제목']) === '10.16' && /모두의농수산/.test(String(r['명단 제목'])); })[0];
  if (!r14 || !r16) return;
  const sh = assignSheet_(), last = sh.getLastRow();
  const v = last >= 2 ? sh.getRange(2, 1, last - 1, 2).getValues() : [];
  const mine = v.filter(function (x) { return String(x[0]) === String(r14['명단 제목']) && String(x[1]).trim(); }).map(function (x) { return String(x[1]).trim(); });
  if (mine.length && mine.every(function (n) { return ['김민재', '김동환', '강지연'].indexOf(n) >= 0; })) note_('✓ ' + moveAssign_(r14, r16));
}

// (한 번만, 10/16) 토요일로 자동으로 만든 10.17 고구마말랭이 지우기 (응답 0일 때). 다음 진행은 15분 확인이 월요일로 다시 만듦
function fixWeekendOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('FIX_WEEKEND_1017_V1')) return;
  props.setProperty('FIX_WEEKEND_1017_V1', '1');
  readRuns_().filter(function (r) { return dateTok_(r['명단 제목']) === '10.17' && /고구마말랭이/.test(String(r['명단 제목'])) && !Number(r['인원']); })
    .sort(function (a, b) { return b.row - a.row; }).forEach(function (r) { note_('✓ 주말 진행 정리: ' + deleteRun_(r)); });
}

// (한 번만) 템플릿 폼(새 진행 폼의 원본) 질문 필수/선택 맞추기
function fixTemplateOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('FIX_TEMPLATE_Q_V1') || !CONFIG.TEMPLATE_FORM_ID) return;
  props.setProperty('FIX_TEMPLATE_Q_V1', '1');
  const n = fixFormQuestions_(FormApp.openById(CONFIG.TEMPLATE_FORM_ID));
  if (n) note_('✓ 템플릿 폼 질문 필수/선택 ' + n + '개 고침');
}
// (한 번) 템플릿 폼의 '이름' 질문 → '계정명(수령인)' (앞으로 만드는 폼 전부). 오늘·앞으로 진행 폼은 15분 확인이 fixFormQuestions_로 바꿈
function fixTemplateNameOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('FIX_TEMPLATE_NAMEQ_V1') || !CONFIG.TEMPLATE_FORM_ID) return;
  props.setProperty('FIX_TEMPLATE_NAMEQ_V1', '1');
  fixFormQuestions_(FormApp.openById(CONFIG.TEMPLATE_FORM_ID));
  note_('✓ 템플릿 폼 질문 이름 → ' + ACCOUNT_Q);
}

// (한 번만) 폼수정 탭을 지금 고른 진행으로 다시 불러옴 (모든 폼 응답을 보여 주게 바뀐 뒤 B1을 안 바꿔도 보이게)
function reloadEditTabOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('RELOAD_EDIT_V2')) return;
  props.setProperty('RELOAD_EDIT_V2', '1');
  const sh = adminSs_().getSheetByName(EDIT_TAB);
  if (sh && String(sh.getRange('B1').getValue()).trim()) { loadEditTab_(sh); note_('✓ 폼수정 탭 다시 불러옴'); }
}

// 잘못 만든 진행 지우기 (응답이 0명일 때만): 진행목록 줄, 보낼메시지의 대기 중 공지, 배정 줄, 월급시트 그 줄의 스크립트가 넣은 칸
function deleteRun_(r) {
  if (Number(r['인원']) > 0) return '응답이 있는 진행은 못 지워요.';
  const room = String(r['카톡방'] || bareTitle_(r['명단 제목'])), title = String(r['명단 제목']);
  try {
    const ob = outboxSheet_(), last = ob.getLastRow();
    if (last >= 2) { const v = ob.getRange(2, 1, last - 1, 6).getValues(); for (let i = v.length - 1; i >= 0; i--) if (String(v[i][3]) === room && v[i][5] !== '보냄') ob.deleteRow(i + 2); }
  } catch (e) {}
  try {
    const as = assignSheet_(), last = as.getLastRow();
    if (last >= 2) { const v = as.getRange(2, 1, last - 1, 1).getValues(); for (let i = v.length - 1; i >= 0; i--) if (String(v[i][0]) === title) as.deleteRow(i + 2); }
  } catch (e) {}
  try {
    if (CONFIG.PAY_SHEET_ID && r['진행일'] instanceof Date) {
      const sh = payTab_(r['진행일'].getMonth() + 1), L = payLayout_(sh);
      if (L) {
        const last = sh.getLastRow(), names = sh.getRange(L.head + 1, L.name, Math.max(last - L.head, 1), 1).getValues();
        const i = names.findIndex(function (x) { return String(x[0]).replace(/\s+/g, '') === bareTitle_(title).replace(/\s+/g, ''); });
        if (i >= 0) {
          const row = L.head + 1 + i, day = r['진행일'];
          const dcol = L.days[(day.getMonth() + 1) + '-' + day.getDate()] || L.days[String(day.getDate())];
          [L.name, L.qty, L.sum, L.store, L.time, L.note, L.prev, dcol].forEach(function (c) { if (c && !sh.getRange(row, c).getFormula()) sh.getRange(row, c).clearContent(); });
        }
      }
    }
  } catch (e) {}
  // 1일차를 지우면 '일정' 탭의 다음 일차 계획(대기)도 지움 (안 지우면 옛 방제로 다음 날 폼이 자동으로 생김)
  let plans = 0;
  try {
    const id = String(r['요청ID'] || '');
    if (id && !/^(next|add)-/.test(id)) {
      const ps = planSheet_(), pl = ps.getLastRow();
      if (pl >= 2) { const v = ps.getRange(2, 1, pl - 1, 9).getValues(); for (let i = v.length - 1; i >= 0; i--) if (String(v[i][0]).indexOf(id + '-') === 0 && String(v[i][8]) === '대기') { ps.deleteRow(i + 2); plans++; } }
    }
  } catch (e) {}
  ensureListSheet_().deleteRow(r.row);
  return title + ' 진행을 지웠어요.' + (plans ? ' (다음 일차 계획 ' + plans + '개도)' : '');
}

// (10/15 한 번만) 진행 도우미에서 잘못 만든 10.17 추가 모집을 지우고, 10.16 배정에 잘못 들어간 고구마말랭이 이름을 빼고, 10.16 공지를 옵션 인원 넣고 이름 뺀 걸로 다시
function fixOct16Once_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('FIX_1016_V1')) return;
  props.setProperty('FIX_1016_V1', '1');
  let runs = readRuns_();
  runs.filter(function (r) { return /^add-.*2026-10-17$/.test(String(r['요청ID'])) && /모두의농수산옥광밤외/.test(String(r['명단 제목'])) && !Number(r['인원']); })
    .sort(function (a, b) { return b.row - a.row; }).forEach(function (r) { note_('✓ 정리: ' + deleteRun_(r)); });
  const as = assignSheet_(), al = as.getLastRow();
  if (al >= 2) { const v = as.getRange(2, 1, al - 1, 3).getValues(); for (let i = v.length - 1; i >= 0; i--) if (/^#택10\.16 모두의농수산옥광밤외/.test(String(v[i][0])) && String(v[i][2]) === '1개') as.deleteRow(i + 2); }
  runs = readRuns_();
  const r16 = runs.filter(function (r) { return /^add-.*2026-10-16$/.test(String(r['요청ID'])) && /모두의농수산옥광밤외/.test(String(r['명단 제목'])); })[0];
  const r15 = runs.filter(function (r) { return dateTok_(r['명단 제목']) === '10.15' && /모두의농수산옥광밤외/.test(String(r['명단 제목'])); })[0];
  if (!r16 || !r15) return;
  const short = shortByOption_(runs, r15);
  if (!Object.keys(short).length) return;
  const form = FormApp.openById(r16['폼ID']);
  const ob0 = outboxSheet_(), l0 = ob0.getLastRow(), room0 = String(r16['카톡방'] || bareTitle_(r16['명단 제목']));
  const src = (l0 >= 2 ? ob0.getRange(2, 1, l0 - 1, 6).getValues() : []).filter(function (v) { return String(v[3]) === room0 && v[2] === '방 공지'; }).map(function (v) { return String(v[4]); })[0];
  const notice = noticeForMore_(src || String(form.getDescription() || ''), short);
  form.setDescription(notice);
  const ob = outboxSheet_(), last = ob.getLastRow(), room = String(r16['카톡방'] || bareTitle_(r16['명단 제목']));
  if (last >= 2) ob.getRange(2, 1, last - 1, 6).getValues().forEach(function (v, i) { if (String(v[3]) === room && v[2] === '방 공지' && v[5] !== '보냄') obSet_(ob, v[0], 5, notice); });
}

// (한 번만) 이미 만든 추가 모집·다음 날 진행 공지에서 어제 이름 줄 지우기: 보낼메시지(보내기 전)와 폼 설명
function fixNamesOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('FIX_NAMES_V1')) return;
  props.setProperty('FIX_NAMES_V1', '1');
  const runs = readRuns_().filter(function (r) { return /^(add|next)-/.test(String(r['요청ID'])) && r['진행 상태'] !== '종료'; });
  const rooms = {};
  runs.forEach(function (r) {
    rooms[String(r['카톡방'] || bareTitle_(r['명단 제목']))] = 1;
    if (r['진행일'] instanceof Date && r['진행일'] > new Date()) {
      try { const f = FormApp.openById(r['폼ID']); const d = f.getDescription() || '', nd = stripTrailingNames_(d); if (nd !== d) f.setDescription(nd); } catch (e) {}
    }
  });
  const ob = outboxSheet_(), last = ob.getLastRow();
  if (last >= 2) ob.getRange(2, 1, last - 1, 6).getValues().forEach(function (v, i) {
    if (v[2] === '방 공지' && v[5] !== '보냄' && rooms[String(v[3])]) { const nm = stripTrailingNames_(String(v[4])); if (nm !== String(v[4])) obSet_(ob, v[0], 5, nm); }
  });
}

// (한 번만) (타)를 이름으로 잘못 읽어 배정에 들어간 '타' 줄 지우기
function fixTaOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('FIX_TA_V1')) return;
  props.setProperty('FIX_TA_V1', '1');
  const as = assignSheet_(), last = as.getLastRow();
  if (last < 2) return;
  const v = as.getRange(2, 1, last - 1, 2).getValues();
  let n = 0;
  for (let i = v.length - 1; i >= 0; i--) if (/^타(계정|아이디)?$/.test(String(v[i][1]).trim())) { as.deleteRow(i + 2); n++; }
  if (n) note_('✓ 배정에서 (타)를 이름으로 읽은 줄 ' + n + '개 지움');
}

// 붙여넣은 공지가 이 진행 공지와 같은 상품인지 (폼 링크나 판매처·상품 이름으로)
function noticeMatches_(r, text) {
  let desc = '';
  try { desc = FormApp.openById(r['폼ID']).getDescription() || ''; } catch (e) { return true; }
  const link = String(text).match(/forms\.gle\/\w+/);
  if (link && desc.indexOf(link[0]) >= 0) return true;
  const a = noticeProducts_(text), b = noticeProducts_(desc);
  if (!a.length || !b.length) return !link;
  return a.some(function (x) { return b.some(function (y) { return (x.name && x.name === y.name) || (x.shop && x.shop === y.shop); }); });
}

// 이 진행 폼 응답 중 중복(한 명단 시트에서 계정, 전화번호, 주소 중 하나가 먼저 낸 응답과 같음)
function dupList_(r) {
  const ss = SpreadsheetApp.openById(r['시트ID']);
  const own = rawFor_(ss, r['폼ID']);
  const w = windowOf_(readRuns_(), r);   // 보여 주는 건 그 진행 날짜 응답만 (다른 날 응답과 겹치는 것도 잡음)
  const rows = [];
  ss.getSheets().filter(function (t) { return !!t.getFormUrl(); }).forEach(function (t) {
    const h = rawHead_(t), last = t.getLastRow();
    if (last < 2 || !h.length) return;
    t.getRange(2, 1, last - 1, h.length).getValues().forEach(function (v) { if (v[0] instanceof Date) rows.push({ t: v[0].getTime(), own: t.getSheetId() === own.getSheetId(), h: h, v: v }); });
  });
  rows.sort(function (a, b) { return a.t - b.t; });
  const seen = {}, out = [];
  rows.forEach(function (x) {
    const why = [], keys = [];
    let name = '', phone = '', nick = '';
    x.h.forEach(function (h, c) {
      if (!nick && MATCH.nick.test(h)) nick = String(x.v[c]);
      if (!name && MATCH.name.test(h) && !MATCH.account.test(h) && !MATCH.nick.test(h)) name = String(x.v[c]);
      if (!phone && /전화|연락처|휴대폰|핸드폰/.test(h)) phone = String(x.v[c]);
      if (!MATCH.dup.test(h) || MATCH.account.test(h)) return;
      const val = String(x.v[c]).trim().toLowerCase().replace(/[\s-]/g, '');
      if (!val) return;
      const key = (/주소/.test(h) && !/이메일/.test(h) ? '주소' : /전화|연락처|휴대폰|핸드폰/.test(h) ? '전화번호' : '계정') + '|' + val;
      if (seen[key]) why.push(key.split('|')[0]); else keys.push(key);
    });
    keys.forEach(function (k) { seen[k] = 1; });
    // 그날 응답 전부 (중복이면 why에 이유 → 화면에서 미리 체크)
    if (x.t >= w.from && x.t < w.to) out.push({ t: x.t, label: Utilities.formatDate(new Date(x.t), CONFIG.TIMEZONE, 'M/d HH:mm') + '  ' + (nick ? nick + ' / ' : '') + name + '  ' + phone, why: why.join(', ') });
  });
  return out;
}

// String.raw: 안의 \n, \. 같은 글자가 그대로 페이지 코드에 들어가게 (그냥 템플릿이면 줄바꿈으로 바뀌어 페이지 코드가 깨짐)
const TOOLS_HTML = String.raw`
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;font-size:15px;margin:0;padding:16px;background:#f4f4f8;color:#1d1a24}
  h1{font-size:20px;margin:0 0 10px}
  select,textarea,input{width:100%;font:inherit;font-size:15px;padding:10px;border:1px solid #cfc9db;border-radius:8px;background:#fff}
  textarea{height:150px}
  .card{background:#fff;border:1px solid #e1dee8;border-radius:12px;padding:14px;margin:12px 0}
  .card h2{font-size:16px;margin:0 0 8px;color:#5b2a86}
  .hint{color:#676274;font-size:13px;margin:0 0 8px}
  button{width:100%;margin-top:10px;padding:13px;border-radius:8px;border:0;background:#5b2a86;color:#fff;font:inherit;font-weight:700;font-size:15px}
  button:disabled{opacity:.5}
  .msg{background:#eef8ee;border:1px solid #b6d7a8;border-radius:8px;padding:10px;margin-top:10px;white-space:pre-wrap;display:none}
  label.row{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid #f0eef4}
  label.row input{width:22px;height:22px;flex:none;margin-top:2px}
  .why{color:#a3271b;font-size:13px}
  .ok{color:#2f7a2f}
  .ob{border-top:1px solid #f0eef4;padding:10px 0}
  .ob .rm{font-weight:700;color:#5b2a86}.ob .kd{color:#676274;font-size:13px;margin-left:6px}
  .ob pre{white-space:pre-wrap;word-break:break-all;margin:6px 0 0;font:inherit;font-size:13px;max-height:74px;overflow:hidden;color:#444;background:#f7f6fa;border-radius:8px;padding:8px}
  .two{display:flex;gap:8px}.two button,.two a{flex:1}
  .two a{display:block;text-align:center;margin-top:10px;padding:13px;border-radius:8px;border:1px solid #5b2a86;color:#5b2a86;font-weight:700;text-decoration:none}
</style>
<h1>진행 도우미</h1>
<div class="msg" id="msg"></div>
<div class="card"><h2>현황 (한눈에 탭 요약)</h2>
  <p class="hint" id="statlast">15분마다 자동 확인이 인원을 셉니다.</p>
  <div id="stat"></div></div>
<div class="card" id="altcard" style="display:none;border-color:#e0b4b4"><h2 style="color:#a3271b">날짜가 틀렸으면 눌러서 옮기기</h2>
  <p class="hint">방금 저장한 이름들을 아래 날짜 진행으로 옮겨요. (다시 붙여넣을 필요 없음)</p>
  <div id="alts"></div></div>
<div class="card"><h2>① 카톡에 보낼 것</h2>
  <p class="hint">[복사]를 누르면 보낸 걸로 표시돼요. 카톡 방에 붙여넣고 보내기는 직접 눌러 주세요.</p>
  <div id="ob"></div></div>
<div class="card"><h2>리뷰 공지 (구매·폼이 다 끝난 뒤)</h2>
  <p class="hint">의뢰를 고르면 모든 날 명단의 <b>수취인 이름</b>과 산 상품을 보고 리뷰 종류(별점·텍스트·포토)를 날마다 고르게 나눠서, 카톡방마다 보낼 리뷰 공지를 만들어요.</p>
  <a id="rvlink" href="#" target="_top" style="display:block;text-align:center;padding:12px;border-radius:8px;background:#5b2a86;color:#fff;font-weight:700;text-decoration:none">리뷰 배정 열기</a></div>
<div class="card"><h2>② 카톡 공지 저장 (누가 어떤 옵션 샀는지)</h2>
  <p class="hint"><b>순서</b><br>
  1. 아래 칸에서 <b>이 공지가 어느 진행인지</b> 고르세요. 카톡방 이름(방제)과 같은 걸 고르면 돼요. 예) 10.16 모두의농수산 방 공지 → "#택10.16 모두의농수산…"<br>
  &nbsp;&nbsp;&nbsp;잘 모르겠으면 "자동으로 찾기"로 두세요 (폼 링크·날짜로 찾아요).<br>
  2. 카톡방에서 이름까지 다 적힌 공지를 통째로 복사해서 붙여넣기<br>
  3. 저장 → 맨 위 초록 칸에 <b>어느 진행에 누가 저장됐는지</b> 나와요. 틀렸으면 빨간 칸의 "옮기기"를 두 번 누르면 돼요.</p>
  <select id="run"></select>
  <p class="hint" id="asg" style="margin-top:6px"></p>
  <textarea id="txt" placeholder="여기에 카톡 공지 붙여넣기" style="margin-top:6px"></textarea>
  <button id="b1">이 진행에 저장</button></div>
<p class="hint" id="pick" style="margin:0 4px"></p>
<div class="card" id="card3"><h2>③ 응답 목록 · 지우기 (②에서 고른 진행)</h2>
  <p class="hint">그날 폼 응답 전부예요. <b>빨간 글씨 = 중복</b>(계정, 전화번호, 주소가 먼저 낸 사람과 같음)이라 미리 체크돼 있어요.<br>
  방을 나간 사람 등 지울 사람이 있으면 체크하고 '체크한 것 지우기'를 두 번 누르세요. 폼과 명단 시트에서 같이 지워지고, 인원이 모자라면 폼이 다시 열려요.</p>
  <div id="dups"></div>
  <button id="b2">체크한 것 지우기</button></div>
<div class="card" id="card4"><h2 id="h4">④ 다음 날 추가 모집</h2>
  <p class="hint">②에서 고른 진행에서 취소·안 산 사람만큼 <b>그 진행 다음 날</b>에 더 받아요. 그날 진행이 이미 있으면 새로 안 만들고 그 진행 인원을 늘려요. 공지를 올리는 지금 단계에서는 누를 필요 없어요.</p>
  <p class="hint" id="short"></p>
  <input id="n" type="number" min="1" placeholder="인원">
  <button id="b3">다음 날 추가 모집 만들기</button></div>
<div class="card" id="card5"><h2>잘못 넣었을 때</h2>
  <button id="b4" style="background:#fff;color:#5b2a86;border:1px solid #5b2a86">이 진행 배정 비우기</button>
  <button id="b5" style="background:#fff;color:#a3271b;border:1px solid #a3271b">이 진행 지우기 (응답 0명일 때만)</button></div>
<script>
// 화면에 처음부터 서버가 채운 내용(INIT)을 보여 줌 → 서버를 기다리느라 버튼이 막히는 일 없음
//  휴대폰·웹(MODE web): 버튼을 누르면 페이지가 그대로 새로 열리며 처리 (google.script.run을 안 씀. 아이폰 사파리 등에서 응답이 안 오는 문제 피함)
//  시트 옆 사이드바(MODE side): google.script.run
var K = __K__, INIT = __INIT__, MODE = __MODE__, EXEC = __EXEC__, PV = __PV__, $ = function (i) { return document.getElementById(i); }, running = false, tick = null, NEXTMD = '', JUST = false;
try { $('rvlink').href = EXEC + '?p=review&k=' + encodeURIComponent(K); if (MODE !== 'web') $('rvlink').target = '_blank'; } catch (e) {}
function say(t) { $('msg').style.display = t ? 'block' : 'none'; $('msg').textContent = t || ''; if (t) $('msg').scrollIntoView({ block: 'nearest' }); }
function busy(on, label) {
  running = on;
  ['b1','b2','b3','b4','b5'].forEach(function (b) { $(b).style.opacity = on ? .6 : 1; });
  clearInterval(tick);
  if (on && label) { var t0 = Date.now(); say(label); tick = setInterval(function () { say(label + ' ' + Math.round((Date.now() - t0) / 1000) + '초'); }, 1000); }
}
// 지우기처럼 되돌리기 어려운 건 두 번 눌러야 실행 (confirm 창은 휴대폰에서 막히는 경우가 있어서)
function twice(btn, text, fn) {
  if (btn.getAttribute('data-arm') === '1') { btn.setAttribute('data-arm', ''); btn.textContent = btn.getAttribute('data-txt'); fn(); return; }
  btn.setAttribute('data-txt', btn.textContent); btn.setAttribute('data-arm', '1'); btn.textContent = text + ' (한 번 더 누르면 실행)';
  setTimeout(function () { if (btn.getAttribute('data-arm') === '1') { btn.setAttribute('data-arm', ''); btn.textContent = btn.getAttribute('data-txt'); } }, 6000);
}
// 카톡 공지에서 필요한 부분만 (폼 링크부터 끝까지, 쿠팡 링크 줄 빼고) → 주소가 너무 길어지지 않게
function slim(t) {
  var L = String(t).split('\n'), i = L.findIndex(function (l) { return /forms\.gle|docs\.google\.com\/forms/.test(l); });
  if (i > 0) L = L.slice(i);
  return L.filter(function (l) { return !/coupa\.ng|링크타고|상번이/.test(l); }).join('\n').slice(0, 3000);
}
function go(d, label) {
  if (running) return say('아직 처리 중이에요. 잠깐만 기다려 주세요.');
  if (d.title === undefined) d.title = $('run').value;
  if (MODE === 'web') {
    busy(true, label || '불러오는 중…');
    var f = document.createElement('form'); f.method = 'get'; f.action = EXEC; f.target = '_top';
    var add = function (k, v) { var i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = v; f.appendChild(i); };
    add('p', 'tools'); add('k', K); add('a', d.act); add('t', d.title || ''); add('nc', String(Date.now())); add('pv', PV);
    if (d.text) add('x', d.text); if (d.n) add('n', d.n); if (d.times) add('ts', d.times.join(',')); if (d.to) add('to', d.to);
    document.body.appendChild(f); f.submit(); return;
  }
  busy(true, label || (d.act === 'info' ? '' : '처리 중이에요…'));
  d.k = K; d.pv = PV;
  if (d.act !== 'info') JUST = false;
  google.script.run.withSuccessHandler(function (o) {
    if (o && o.saved) JUST = true;
    busy(false); show(o || {});
    if (!(o && o.msg) && label && /불러오는 중…$/.test(label)) say(label.replace(/\n\n중복·인원 불러오는 중…$/, ''));
    if (o && o.saved) go({ act: 'info', title: o.title }, (o.msg || '저장했어요.') + '\n\n중복·인원 불러오는 중…');
  }).withFailureHandler(function (e) { busy(false); say('오류: ' + e.message + '\n(한 번 더 눌러 보고, 또 나오면 이 글을 캡처해서 보내 주세요)'); }).createRun(d);
}
function outbox(list) {
  var box = $('ob'); box.innerHTML = '';
  if (!(list || []).length) { box.innerHTML = '<span class="ok">✔ 보낼 거 없어요</span>'; return; }
  list.forEach(function (x) {
    var c = document.createElement('div'); c.className = 'ob';
    c.innerHTML = '<span class="rm"></span><span class="kd"></span><pre></pre><div class="two"><button>복사</button><a href="kakaotalk://">카톡 열기</a></div>';
    c.querySelector('.rm').textContent = x.room || '(방 이름 없음)'; c.querySelector('.kd').textContent = x.kind; c.querySelector('pre').textContent = x.msg;
    var b = c.querySelector('button');
    b.onclick = function () {
      var done = function () {
        b.textContent = '복사됨 ✔ (보냄 표시)';
        try { google.script.run.markSentFromPage(K, x.id); } catch (e) {}
        if (MODE === 'web') { try { new Image().src = EXEC + '?p=sent&k=' + encodeURIComponent(K) + '&id=' + encodeURIComponent(x.id); } catch (e) {} }
      };
      if (navigator.clipboard) navigator.clipboard.writeText(x.msg).then(done, fb); else fb();
      function fb() { var t = document.createElement('textarea'); t.value = x.msg; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); done(); }
    };
    box.appendChild(c);
  });
}
function show(o) {
  if (o.outbox) outbox(o.outbox);
  // 방금 저장·옮기기 했으면 같은 의뢰 다른 날로 옮기는 버튼
  var alts = ((o.msg && /저장했어요|옮겼어요/.test(o.msg)) || JUST) ? (o.alts || []) : [];
  $('altcard').style.display = alts.length ? '' : 'none';
  var ab = $('alts'); ab.innerHTML = '';
  alts.forEach(function (a) {
    var b = document.createElement('button'); b.style.background = '#fff'; b.style.color = '#a3271b'; b.style.border = '1px solid #a3271b';
    b.textContent = '→ ' + a.label + ' 로 옮기기';
    b.onclick = function () { twice(b, a.label + ' 로 옮겨요', function () { go({ act: 'move', title: o.title, to: a.title }, '옮기는 중…'); }); };
    ab.appendChild(b);
  });
  if (o.status) {
    var sb = $('stat'); sb.innerHTML = '';
    if (o.last) $('statlast').textContent = '마지막 확인: ' + o.last;
    if (o.black && o.black.length) { var bl = document.createElement('div'); bl.textContent = '⛔ 블랙리스트 (받으면 안 됨): ' + o.black.join(', '); bl.style.cssText = 'font-weight:700;color:#a3271b;background:#fde8e6;border-radius:8px;padding:8px;margin:6px 0'; sb.appendChild(bl); }
    var heads = ['오늘', '앞으로', '지난 진행'], lastG = -1;
    o.status.forEach(function (x) {
      if (x.g !== lastG) { var h = document.createElement('div'); h.textContent = heads[x.g]; h.style.cssText = 'font-weight:700;font-size:15px;margin:10px 0 4px;color:#5b2a86'; sb.appendChild(h); lastG = x.g; }
      var row = document.createElement('div'), left = x.goal ? x.goal - x.got : 0;
      row.style.cssText = 'display:flex;gap:8px;padding:6px 4px;border-bottom:1px solid #eee;font-size:16px' + (x.real ? ';background:#fff2a8' : '');
      var a = document.createElement('span'); a.textContent = x.d; a.style.cssText = 'min-width:40px;color:#676274';
      var b = document.createElement('span'); b.textContent = x.t; b.style.cssText = 'flex:1';
      var c = document.createElement('span'); c.textContent = x.done ? '마감 ' + x.got + '/' + x.goal : x.got + '/' + x.goal + (left > 0 ? ' (남은 ' + left + ')' : '');
      c.style.cssText = 'white-space:nowrap;font-weight:700;color:' + (x.done ? '#2f7a2f' : left > 0 && x.g === 0 ? '#d00000' : '#333');
      row.appendChild(a); row.appendChild(b); row.appendChild(c); sb.appendChild(row);
    });
  }
  var sel = $('run'); sel.innerHTML = '<option value="">자동으로 찾기 (모르면 이대로)</option>';
  (o.runs || []).forEach(function (r) { var op = document.createElement('option'); op.value = r.title; op.textContent = r.label; sel.appendChild(op); });
  if (o.title) sel.value = o.title;
  $('pick').textContent = sel.value ? '' : '③ 중복, ④ 추가 모집은 ②에서 진행을 고르면 나와요.';
  if (o.msg) say(o.msg);
  ['card3','card4','card5'].forEach(function (c) { $(c).style.display = sel.value ? '' : 'none'; });
  if (!sel.value) { $('asg').textContent = ''; return; }
  $('asg').innerHTML = o.assigned ? '<span class="ok">✔ 이 진행은 공지를 넣어 뒀어요. 다시 넣으면 새로 바뀌어요.</span>' : '아직 공지를 안 넣었어요.';
  var box = $('dups'); box.innerHTML = '';
  var nd = (o.dups || []).filter(function (x) { return x.why; }).length;
  if (!(o.dups || []).length) box.innerHTML = '<span class="hint">아직 응답이 없어요</span>';
  else box.innerHTML = nd ? '<span class="why">중복 ' + nd + '개 (미리 체크)</span>' : '<span class="ok">✔ 중복 없어요 (' + o.dups.length + '명)</span>';
  (o.dups || []).forEach(function (x) {
    var l = document.createElement('label'); l.className = 'row';
    l.innerHTML = '<input type="checkbox" value="' + x.t + '"' + (x.why ? ' checked' : '') + '><div><div></div><div class="why"></div></div>';
    l.querySelector('div div').textContent = x.label; l.querySelector('.why').textContent = x.why ? '겹침: ' + x.why : '';
    box.appendChild(l);
  });
  $('b2').style.display = (o.dups || []).length ? '' : 'none';
  var sh = o.short || {}, ks = Object.keys(sh), sum = ks.reduce(function (a, k) { return a + sh[k]; }, 0);
  var left = Math.max((o.target || 0) - (o.count || 0), 0);
  $('short').textContent = sum ? '모자란 인원 (안 산 계정 + 취소): ' + ks.map(function (k) { return k + ' ' + sh[k]; }).join(', ') + ' → 합 ' + sum + '명. 공지 옵션 인원도 이대로 들어가요.'
    : '지금 ' + (o.count || 0) + '/' + (o.target || 0) + '명' + (left ? ' (' + left + '명 모자람)' : '') + '. 공지를 넣어 두면 옵션별로 계산해요.';
  $('n').value = sum || left || '';
  NEXTMD = o.nextMd || '';
  if (o.nextMd) { $('h4').textContent = '④ ' + o.nextMd + ' 추가 모집 (이 진행 다음 날)'; $('b3').textContent = o.nextMd + ' 추가 모집 만들기'; }
}
$('run').onchange = function () { say(''); go({ act: 'info' }); };
$('b1').onclick = function () { var t = $('txt').value.trim(); if (!t) return say('공지를 붙여넣어 주세요.'); go({ act: 'assign', text: slim(t), title: $('run').value }, '저장 중이에요…'); };
$('b2').onclick = function () {
  var t = [].slice.call(document.querySelectorAll('#dups input:checked')).map(function (x) { return x.value; });
  if (!t.length) return say('지울 걸 체크해 주세요.');
  twice($('b2'), t.length + '개 지워요', function () { go({ act: 'delete', times: t }, '지우는 중…'); });
};
$('b3').onclick = function () { var n = Number($('n').value); if (!n) return say('인원을 적어 주세요.'); twice($('b3'), (NEXTMD || '다음 날') + ' ' + n + '명 만들어요', function () { go({ act: 'more', n: n }, '만드는 중…'); }); };
$('b4').onclick = function () { twice($('b4'), '배정 비워요', function () { go({ act: 'unassign' }, '비우는 중…'); }); };
$('b5').onclick = function () { twice($('b5'), '이 진행 지워요', function () { go({ act: 'remove' }, '지우는 중…'); }); };
show(INIT || {});
</script>`;

function outboxUrl_() { return (CONFIG.WEBAPP_URL || '') + '?p=outbox&k=' + CONFIG.KEY; }

const OUTBOX_HTML = `
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;font-size:15px;margin:0;padding:16px;background:#f4f4f8;color:#1d1a24}
  h1{font-size:19px;margin:0 0 4px}
  p.sub{margin:0 0 14px;color:#676274;font-size:13px}
  .card{background:#fff;border:1px solid #e1dee8;border-radius:12px;padding:14px;margin-bottom:12px}
  .head{display:flex;justify-content:space-between;gap:8px;font-size:13px;color:#676274;margin-bottom:6px}
  .room{font-weight:700;color:#5b2a86}
  pre{white-space:pre-wrap;word-break:break-all;margin:0 0 10px;font:inherit;font-size:14px;max-height:180px;overflow:auto;background:#f7f6fa;border-radius:8px;padding:10px}
  .btns{display:flex;gap:8px}
  .btns a,.btns button{flex:1;text-align:center;padding:11px 6px;border-radius:8px;font:inherit;font-size:14px;font-weight:700;border:1px solid #5b2a86;text-decoration:none}
  .b1{background:#5b2a86;color:#fff}.b2{background:#fff;color:#5b2a86}
  .warn{color:#a3271b;font-size:13px;margin-bottom:6px}
</style>
<h1>보낼 메시지함</h1>
<p class="sub">복사 → 카톡 열기 → 해당 방에 붙여넣고 직접 보내기 → 보냄 표시</p>
<div id="list"></div>
<script>
var ITEMS = __ITEMS__, K = __K__;
var box = document.getElementById('list');
if (!ITEMS.length) box.textContent = '보낼 메시지가 없어요.';
ITEMS.forEach(function (x) {
  var c = document.createElement('div'); c.className = 'card';
  var h = document.createElement('div'); h.className = 'head';
  var r = document.createElement('span'); r.className = 'room'; r.textContent = x.room || '(방 이름 없음, 직접 골라서 보내기)';
  var k = document.createElement('span'); k.textContent = x.kind;
  h.appendChild(r); h.appendChild(k); c.appendChild(h);
  if (x.st === '방 못 찾음') { var w = document.createElement('div'); w.className = 'warn'; w.textContent = 'PC 도우미가 이 방을 못 찾았어요. 직접 보내 주세요.'; c.appendChild(w); }
  var pre = document.createElement('pre'); pre.textContent = x.msg; c.appendChild(pre);
  var bs = document.createElement('div'); bs.className = 'btns';
  var cp = document.createElement('button'); cp.className = 'b1'; cp.textContent = '복사';
  cp.onclick = function () {
    // 복사하면 보낸 걸로 표시 (최종 보내기는 카톡에서 직접)
    var done = function () { cp.textContent = '복사됨 (보냄 표시)'; google.script.run.markSentFromPage(K, x.id); };
    if (navigator.clipboard) navigator.clipboard.writeText(x.msg).then(done, function () { fallback(); });
    else fallback();
    function fallback() { var t = document.createElement('textarea'); t.value = x.msg; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); done(); }
  };
  var op = document.createElement('a'); op.className = 'b2'; op.textContent = '카톡 열기'; op.href = 'kakaotalk://';
  var ok = document.createElement('button'); ok.className = 'b2'; ok.textContent = '보냄 표시';
  ok.onclick = function () { ok.disabled = true; google.script.run.withSuccessHandler(function () { c.remove(); }).withFailureHandler(function () { ok.disabled = false; }).markSentFromPage(K, x.id); };
  bs.appendChild(cp); bs.appendChild(op); bs.appendChild(ok); c.appendChild(bs);
  box.appendChild(c);
});
</script>`;

/* ---------------- 7) 폼수정 탭: 신청한 사람 지우기 (관리 시트) ---------------- */
// B1에서 진행을 고르면 그 진행의 응답이 아래에 나옴 → 지울 사람의 A열 체크 → E1 '삭제 실행' 체크
// 폼 응답과 응답 시트 행이 같이 지워져서 명단 탭에도 바로 반영됨. 인원이 목표보다 적어지면 닫힌 폼을 다시 엶
// 휴대폰 구글 시트 앱에서도 체크만으로 됨

const EDIT_TAB = '폼수정';

function showChipError() {
  SpreadsheetApp.getUi().alert('파일 칩 마지막 오류: ' + (PropertiesService.getScriptProperties().getProperty('CHIP_ERROR') || '없음 (Sheets API가 추가 안 됐을 수 있어요)'));
}

function setupEditTab() {
  // 안 되면 이유를 그대로 보여 줌 (캡처해서 보내 주세요)
  let sh;
  try { sh = ensureEditTab_(); } catch (e) {
    SpreadsheetApp.getUi().alert('폼수정 탭을 못 만들었어요.\n\n이유: ' + e.message + '\n\n이 창을 캡처해서 보내 주세요.');
    return;
  }
  SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(sh);
  SpreadsheetApp.getUi().alert('폼수정 탭을 만들었어요. B1에서 진행을 고르세요.');
}

function ensureEditTab_() {
  const ss = adminSs_();
  let sh = ss.getSheetByName(EDIT_TAB);
  if (!sh) {
    sh = ss.insertSheet(EDIT_TAB, 1);
    sh.getRange('A1').setValue('진행 선택 →').setFontWeight('bold');
    sh.getRange('D1').setValue('삭제 실행 →').setFontWeight('bold').setHorizontalAlignment('right');
    sh.getRange('E1').insertCheckboxes();
    sh.getRange('A2').setValue('공지용 명단').setFontWeight('bold');
    sh.setFrozenRows(3);
    sh.setColumnWidth(2, 320);
    sh.getRange('B1').setBackground('#f0e8f8');
    sh.getRange('E1').setBackground('#f8c9c4');
  }
  if (sh.getRange('D2').getValue() === '') {
    sh.getRange('D2').setValue('옵션 배정 (공지 붙여넣기) →').setFontWeight('bold').setHorizontalAlignment('right').setWrap(true);
    sh.getRange('E2').setBackground('#fff2cc').setWrap(true)
      .setNote('B1에서 진행을 고르고, 카톡 공지(옵션 아래 이름 적은 것)를 통째로 여기 붙여넣으세요.\n명단 시트 \'배정\' 탭에 사람별 옵션이 들어가고, 명단 탭 \'옵션 확인\' 칸에서 틀리게 산 사람이 빨간색이 돼요.\n이름 뒤 숫자(이혜미2)는 계정 수.');
    sh.setColumnWidth(5, 220);
  }
  ensureDupControl_(sh);
  // 어제 진행부터 앞으로 진행만, 날짜순 (사용자 요청 10/21)
  const yd = today_().getTime() - 86400000;
  const titles = readRuns_().filter(function (r) { return r['진행 상태'] !== '종료' && r['시트ID'] && r['진행일'] instanceof Date && dayStart_(r['진행일']) >= yd; })
    .sort(function (a, b) { return (a['진행일'] - b['진행일']) || (a.row - b.row); }).map(function (r) { return String(r['명단 제목']); });
  sh.getRange('B1').setDataValidation(titles.length ? SpreadsheetApp.newDataValidation().requireValueInList(titles, true).setAllowInvalid(true).build() : null);
  const has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'onAdminEdit'; });
  if (!has) ScriptApp.newTrigger('onAdminEdit').forSpreadsheet(ss).onEdit().create();
  return sh;
}

function onAdminEdit(e) {
  if (e && e.response) return onRunSubmit_(e);   // 폼 제출 트리거도 이 이름으로 받음 (로더에 이미 있는 이름이라)
  if (!e || !e.range) return;
  try { if (e.range.getSheet().getName() === OUTBOX_SHEET) obUserEdit_(e); } catch (err) {}
  // 한눈에 탭 '진행 도우미' 체크 → 시트 오른쪽에 진행 도우미 (새 탭 없이)
  if (e.range.getSheet().getName() === DASH_TAB && e.range.getColumn() === 1 && String(e.range.getRow()) === PropertiesService.getScriptProperties().getProperty('DASH_BAR_ROW')) {
    if (String(e.value).toUpperCase() !== 'TRUE') return;
    e.range.setValue(false);
    try { showToolsSidebar_(); } catch (err) { e.range.getSheet().getRange(e.range.getRow(), 2).setValue('도우미 열기 실패: ' + err.message + ' → 옆 링크로 열어 주세요'); }
    return;
  }
  // 손으로 하는 동작(폼수정 탭 칸, 진행목록 진행일, 한눈에 방제·택배 옮김)은 15분 자동 확인이 돌고 있어도 양보받아서 함
  //  (예전엔 30초만 기다리고 조용히 안 해서 공지 붙여넣기가 배정에 안 들어갔음, 10/20)
  const sh0 = e.range.getSheet(), nm0 = sh0.getName(), a10 = e.range.getA1Notation();
  const action = (nm0 === EDIT_TAB && /^(B1|E1|E2|G2|I2)$/.test(a10)) || (nm0 === CONFIG.LIST_SHEET && e.range.getColumn() === lc_('진행일')) ||
    (nm0 === DASH_TAB && (e.range.getColumn() === 2 || e.range.getColumn() === 13)) || (nm0 === DASH_TAB && e.range.getColumn() === 1 && isRvRow_(e.range.getRow()));
  if (!action) return;
  const props = PropertiesService.getScriptProperties();
  if (nm0 === EDIT_TAB && a10 !== 'B1') { try { sh0.getRange('G1').setValue('⏳ 처리 중… (자동 확인이 돌고 있으면 1~2분 걸려요)'); } catch (err) {} }
  props.setProperty('WANT_LOCK', String(Date.now()));
  let ran = false, out;
  try { out = locked_(function () { ran = true; props.deleteProperty('WANT_LOCK'); return onAdminEditInner_(e); }, 270000); }
  finally { props.deleteProperty('WANT_LOCK'); }
  if (!ran) {
    const msg = '⚠ 자동 확인이 안 끝나서 못 했어요. 1~2분 뒤 다시 해 주세요 (붙여넣기면 다시 붙여넣기)';
    try { if (nm0 === EDIT_TAB) sh0.getRange('G1').setValue(msg); else e.source.toast(msg, '체험단', 10); } catch (err) {}
  }
  return out;
}

// 한눈에 '리뷰 취합할 것' 체크칸 줄인지 (10/25: 이 칸이 위 목록에 없어서 체크해도 진행목록에 저장이 안 됐음)
function isRvRow_(row) {
  try { return !!JSON.parse(PropertiesService.getScriptProperties().getProperty('DASH_RV') || '{}')[String(row)]; } catch (e) { return false; }
}

// 보낼메시지를 사람이 고친 기록 (스크립트가 쓴 건 편집 트리거가 안 불림) → 점검 주소 obUserEdit (10/26: 방 공지 칸 글이 위 줄 명단 전달 글로 바뀐 원인을 기록이 없어 못 가림)
//  메시지 칸에 다른 줄과 똑같은 글이 들어오면(복사한 걸 시트에 잘못 붙여넣기) 바로 알림
function obUserEdit_(e) {
  const sh = e.range.getSheet(), r0 = e.range.getRow(), n = e.range.getNumRows(), c0 = e.range.getColumn(), c1 = c0 + e.range.getNumColumns() - 1;
  if (r0 < 2) return;
  const ids = sh.getRange(r0, 1, n, 1).getValues().map(function (x) { return String(x[0]); });
  const nv = e.range.getValues();
  const item = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'MM-dd HH:mm:ss') + ' ' + e.range.getA1Notation() + ' 번호 ' + ids.join(',') +
    ' 전="' + String(e.oldValue == null ? '' : e.oldValue).slice(0, 50).replace(/\n/g, ' / ') + '" 후="' + String(nv[0][0]).slice(0, 50).replace(/\n/g, ' / ') + '"';
  const c = CacheService.getScriptCache();
  let log = []; try { log = JSON.parse(c.get('OB_USEREDIT') || '[]'); } catch (err) {}
  log.unshift(item); c.put('OB_USEREDIT', JSON.stringify(log.slice(0, 40)), 21600);
  if (c0 <= 5 && c1 >= 5 && n === 1) {
    const val = String(sh.getRange(r0, 5).getValue()), last = sh.getLastRow();
    if (val.length > 20 && last >= 2) {
      const all = sh.getRange(2, 5, last - 1, 1).getValues(), same = [];
      all.forEach(function (x, i) { if (i + 2 !== r0 && String(x[0]) === val) same.push(i + 2); });
      // 다른 줄 글을 그대로 붙여넣은 것(카톡에 붙이려고 복사한 걸 시트 칸에 붙여넣음)은 바로 원래 글로 되돌림 (10/26 E27, 10/27 E30: 줄넘기 방 공지가 속눈썹 명단 전달 글로 바뀜)
      if (same.length && e.oldValue != null && String(e.oldValue).length > 0 && String(e.oldValue) !== val) {
        sh.getRange(r0, 5).setValue(e.oldValue);
        log.unshift(Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'MM-dd HH:mm:ss') + ' E' + r0 + ' 되돌림 (' + same.join(',') + '행과 같은 글이 붙여넣어짐)'); c.put('OB_USEREDIT', JSON.stringify(log.slice(0, 40)), 21600);
        try { e.source.toast(r0 + '행 메시지 칸에 ' + same.join(', ') + '행 글이 붙여넣어져서 원래 글로 되돌렸어요. (카톡에 붙여넣을 때는 카톡 창을 먼저 누르고 붙여넣기)', '⚠ 보낼메시지 되돌림', 20); } catch (err) {}
      } else if (same.length) { try { e.source.toast(r0 + '행 메시지 글이 ' + same.join(', ') + '행과 똑같아요. 복사한 걸 시트에 잘못 붙여넣었으면 Ctrl+Z(되돌리기) 해 주세요.', '⚠ 보낼메시지', 20); } catch (err) {} }
    }
  }
}

function onAdminEditInner_(e) {
  const sh = e.range.getSheet();
  // 진행목록 '진행일'을 고치면 그 진행 날짜를 옮김 (방제·카톡방·보낼메시지·월급시트, 뒤 일차·일정은 겹치지 않게 미룸) (사용자 요청 10/20)
  if (sh.getName() === CONFIG.LIST_SHEET && e.range.getColumn() === lc_('진행일') && e.range.getRow() >= 2 && e.range.getNumRows() === 1) {
    const d = e.range.getValue();
    if (!(d instanceof Date)) { try { e.source.toast('진행일은 날짜로 적어 주세요 (예: 10/23)', '진행일', 8); } catch (err) {} return; }
    const r = readRuns_().filter(function (x) { return x.row === e.range.getRow(); })[0];
    if (!r) return;
    let msg = '';
    try { msg = moveRunDate_(r, d); } catch (err) { msg = '날짜 옮기기 실패: ' + err.message; }
    try { e.source.toast(msg, '진행일 바꿈', 15); } catch (err) {}
    note_(msg);
    return;
  }
  // 진행목록 '목표인원'을 고치면 그날부터 하루 인원을 그 숫자로 (뒤 일차·일정도, 남는 일차는 취소, 모자라면 일정 추가) (사용자 요청 10/23 실링팬)
  if (sh.getName() === CONFIG.LIST_SHEET && e.range.getColumn() === lc_('목표인원') && e.range.getRow() >= 2 && e.range.getNumRows() === 1) {
    const n = Number(e.range.getValue());
    if (!(n > 0) || Math.floor(n) !== n) { try { e.source.toast('목표인원은 숫자로 적어 주세요 (예: 2)', '하루 인원', 8); } catch (err) {} return; }
    const r = readRuns_().filter(function (x) { return x.row === e.range.getRow(); })[0];
    if (!r || !(r['진행일'] instanceof Date)) return;
    let msg = '';
    try { msg = changeDaily_(r, r['진행일'], n); } catch (err) { msg = '하루 인원 바꾸기 실패: ' + err.message; }
    try { e.source.toast(msg, '하루 인원 바꿈', 20); } catch (err) {}
    note_(msg);
    return;
  }
  if (sh.getName() === DASH_TAB && e.range.getColumn() === 2 && e.range.getRow() >= 2 && e.oldValue && e.value) {
    // 한눈에 탭 방제를 고치면 진행목록, 카톡방, 보낼 메시지함, 월급시트까지 같이
    const r = readRuns_().filter(function (x) { return bareTitle_(x['명단 제목']) === String(e.oldValue).trim() || sameRunTitle_(x['명단 제목'], e.oldValue); }).pop();
    if (!r) return;
    // 같은 상품(같은 날짜·캠페인)의 숫자만 바꾸는 것만 받음. 다른 진행 방제가 들어오면(붙여넣기 실수 등) 칸을 되돌리고 안 바꿈 (10/23)
    if (campKey_(String(e.value)) !== campKey_(r['명단 제목']) || !renameRun_(r, e.value, '한눈에 탭에서 고침')) {
      try { e.range.setValue(e.oldValue); e.source.toast('한눈에 탭 방제 칸에 다른 진행 이름이 들어와서 되돌렸어요. 방제는 같은 상품의 숫자만 여기서 바꿀 수 있어요.', '방제', 15); } catch (err) {}
      if (campKey_(String(e.value)) !== campKey_(r['명단 제목'])) note_('⛔ 한눈에 탭 방제 칸 되돌림: ' + e.oldValue + ' 자리에 ' + e.value + ' (다른 상품)');
      return;
    }
    try { updatePay_(); } catch (err) {}
    return;
  }
  if (sh.getName() === DASH_TAB && e.range.getColumn() === 1 && e.range.getNumRows() === 1) {
    // 한눈에 '리뷰 취합할 것' 체크 → 진행목록 '리뷰 취합'(그날) / '업체 전송'(의뢰 전체)에 체크한 날 저장, 풀면 지움
    let m = {}; try { m = JSON.parse(PropertiesService.getScriptProperties().getProperty('DASH_RV') || '{}'); } catch (err) {}
    const it = m[String(e.range.getRow())];
    if (it) {
      const on = String(e.value).toUpperCase() === 'TRUE', val = on ? today_() : '';
      const runs = readRuns_();
      if (it.type === 'day') { const r = runs.filter(function (x) { return bareTitle_(x['명단 제목']) === it.title; }).pop(); if (r) setRun_(r.row, '리뷰 취합', val); }
      else runs.filter(function (x) { return String(x['시트ID']) === String(it.sid); }).forEach(function (x) { setRun_(x.row, '업체 전송', val); });
      try { sh.getRange(e.range.getRow(), 3).setValue(val).setNumberFormat('M/d'); } catch (err) {}
      try { e.source.toast(on ? '체크한 날 저장했어요 (3일 뒤 이 줄은 사라져요)' : '체크 풀었어요', '리뷰 취합', 8); } catch (err) {}
      return;
    }
  }
  if (sh.getName() === DASH_TAB && e.range.getColumn() === 13 && e.range.getRow() >= 2) {
    // 한눈에 탭 '택배 옮김' 체크 → 진행목록에 저장
    const t = String(sh.getRange(e.range.getRow(), 2).getValue());
    const r = readRuns_().filter(function (x) { return String(x['명단 제목']).replace(/\s*\([^)]*\)\s*$/, '') === t; }).pop();
    if (r) setRun_(r.row, '택배 옮김', String(e.value).toUpperCase() === 'TRUE');
    return;
  }
  if (sh.getName() !== EDIT_TAB) return;
  const a1 = e.range.getA1Notation();
  if (a1 === 'B1') loadEditTab_(sh);
  else if (a1 === 'G2' && String(e.value).toUpperCase() === 'TRUE') {
    try { sh.getRange('G1').setValue(pickDups_(sh)); } finally { sh.getRange('G2').setValue(false); }
  }
  else if (a1 === 'I2' && /^\d+$/.test(String(e.range.getValue()).trim())) {
    try { sh.getRange('G1').setValue(addMore_(sh, Number(e.range.getValue()))); sh.getRange('I2').clearContent(); }
    catch (err) { sh.getRange('G1').setValue('추가 모집 실패: ' + err.message); }
  }
  else if (a1 === 'E2' && String(e.range.getValue()).trim()) {
    const text = String(e.range.getValue());
    sh.getRange('E2').clearContent().setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);   // 긴 글이 칸을 키우지 않게 바로 비움
    sh.setRowHeight(2, 42);
    try { sh.getRange('G1').setValue(applyAssign_(sh, text)); }
    catch (err) { sh.getRange('G1').setValue('배정 실패: ' + err.message); }
  }
  else if (a1 === 'E1' && String(e.value).toUpperCase() === 'TRUE') {
    try { deleteChecked_(sh); } finally { sh.getRange('E1').setValue(false); }
  }
}

// 폼수정 탭 F2 '중복 고르기' + G2 체크박스 (휴대폰에서도 B1만 바꾸면 생김)
function ensureDupControl_(sh) {
  if (sh.getRange('H2').getValue() !== '내일 추가 모집 →') {
    sh.getRange('H2').setValue('내일 추가 모집 →').setFontWeight('bold').setHorizontalAlignment('right');
    sh.getRange('I2').setBackground('#fff2cc')
      .setNote('B1에서 진행을 고르고 모자란 인원 수(예: 5)를 적으면, 같은 명단 시트로 내일 날짜 진행을 만들어요.\n새 카톡방 방제와 공지가 보낼 메시지함과 메일로 와요. 폼은 내일 0시에 다시 열려요.');
  }
  if (sh.getRange('F2').getValue() === '중복 고르기 →') return;
  sh.getRange('F2').setValue('중복 고르기 →').setFontWeight('bold').setHorizontalAlignment('right');
  sh.getRange('G2').insertCheckboxes().setBackground('#f8c9c4')
    .setNote('체크하면 명단에서 빨간색(중복)인 응답을 A열에서 골라 줘요. 같은 것끼리 맨 처음 낸 것은 남겨요. 확인하고 E1 삭제 실행을 체크하면 지워져요.');
}

// 명단 탭에서 빨간색인 응답(주문번호, 이름, 아이디, 전화, 주소 중 하나라도 앞 응답과 같음)을 골라서 A열 체크
//  같은 것끼리 맨 처음 낸 것 하나는 남기고 뒤에 낸 것만 고름. 옵션 확인 빨간색은 해당 없음
function dupRows_(sh) {
  const last = sh.getLastRow(), width = sh.getLastColumn();
  if (last < 4 || width < 3) return [];
  const head = sh.getRange(3, 2, 1, width - 1).getValues()[0].map(String);
  const vals = sh.getRange(4, 2, last - 3, width - 1).getValues();
  const cols = [];
  head.forEach(function (h, c) { if (MATCH.dup.test(h) && !MATCH.account.test(h)) cols.push(c); });
  const norm = function (x) { return String(x).trim().toLowerCase(); };
  const seen = cols.map(function () { return {}; });
  return vals.map(function (v) {
    if (!(v[0] instanceof Date)) return false;
    let dup = false;
    cols.forEach(function (c, k) { const x = norm(v[c]); if (!x) return; if (seen[k][x]) dup = true; seen[k][x] = true; });
    return dup;
  });
}

function pickDups_(sh) {
  if (!editRun_(sh)) return '먼저 B1에서 진행을 고르세요.';
  loadEditTab_(sh);
  const marks = dupRows_(sh);
  const n = marks.filter(Boolean).length;
  if (!n) return '중복이 없어요.';
  sh.getRange(4, 1, marks.length, 1).setValues(marks.map(function (m) { return [m]; }));
  return '빨간색 중복 ' + n + '개 골랐어요 (같은 것끼리 맨 처음 낸 것은 남김). 확인하고 E1 삭제 실행을 체크하면 지워져요.';
}

// 진행 중인 폼마다 '제출하면 바로' 트리거 (월급시트, 인원이 바로 바뀌게). 끝난 폼 트리거는 지움.
//  트리거는 계정당 20개까지라 (10/24 '스크립트에 트리거가 너무 많습니다'): 다 돈 1회 예약을 먼저 치우고, 남는 자리만큼 오늘 진행 → 다가오는 진행 → 지난 진행 순서로.
//  트리거가 없는 폼도 15분 확인에서 똑같이 명단에 들어감 (늦을 뿐)
function ensureSubmitTriggers_(runs) {
  const props = PropertiesService.getScriptProperties(), now = Date.now();
  const isFormT = function (t) { return t.getHandlerFunction() === 'onAdminEdit' && t.getEventType() === ScriptApp.EventType.ON_FORM_SUBMIT; };
  let all = ScriptApp.getProjectTriggers();
  // 1) 이미 돈 1분 뒤·0시 예약, 겹친 15분 확인 정리
  const live = [];
  [['SOON_TRIG_ID', 'SOON_TRIG_AT'], ['MID_TRIG_ID', 'MID_TRIG_AT']].forEach(function (k) {
    const id = props.getProperty(k[0]), at = Number(props.getProperty(k[1]) || 0);
    if (id && at > now - 5 * 60000) live.push(id);
  });
  const cf = all.filter(function (t) { return t.getHandlerFunction() === 'checkFull' && live.indexOf(t.getUniqueId()) === -1; });
  let cleaned = 0;
  if (cf.length > 1) {
    cf.forEach(function (t) { ScriptApp.deleteTrigger(t); cleaned++; });
    ScriptApp.newTrigger('checkFull').timeBased().everyMinutes(15).create(); cleaned--;
  }
  // 같은 일을 하는 트리거가 둘 이상이면 하나만 (편집, 9시 알림 등)
  const seen = {};
  all.forEach(function (t) {
    if (t.getHandlerFunction() === 'checkFull' || isFormT(t)) return;
    const k = t.getHandlerFunction() + '|' + t.getEventType() + '|' + (t.getTriggerSourceId() || '');
    if (seen[k]) { ScriptApp.deleteTrigger(t); cleaned++; } else seen[k] = 1;
  });
  if (cleaned > 0) { note_('✓ 다 돈 예약·겹친 트리거 ' + cleaned + '개 지움'); all = ScriptApp.getProjectTriggers(); }
  // 2) 폼 트리거: 남는 자리만큼 (1분 뒤·0시 예약을 새로 걸 자리 2개는 비워 둠)
  const room = Math.max(0, 20 - all.filter(function (t) { return !isFormT(t); }).length - 2);
  const t0 = today_().getTime();
  const pri = function (r) { const d = r['진행일'] instanceof Date ? dayStart_(r['진행일']) : t0; return d === t0 ? [0, 0] : d > t0 ? [1, d - t0] : [2, t0 - d]; };
  const want = [];
  runs.filter(function (r) { return r['진행 상태'] !== '종료' && r['폼ID']; })
    .sort(function (a, b) { const x = pri(a), y = pri(b); return (x[0] - y[0]) || (x[1] - y[1]); })
    .forEach(function (r) { const id = String(r['폼ID']); if (want.indexOf(id) === -1 && want.length < room) want.push(id); });
  const have = {};
  all.forEach(function (t) {
    if (!isFormT(t)) return;
    const id = t.getTriggerSourceId();
    if (want.indexOf(id) === -1 || have[id]) ScriptApp.deleteTrigger(t); else have[id] = 1;
  });
  want.forEach(function (id) {
    if (have[id]) return;
    try { ScriptApp.newTrigger('onAdminEdit').forForm(id).onFormSubmit().create(); } catch (e) { note_('폼 트리거 만들기 실패 ' + id + ': ' + e); }
  });
}

// 폼이 제출되면: 그 폼 진행들의 인원 → 월급시트, 한눈에 탭. 다 찼으면 마감 확인까지
function onRunSubmit_(e) {
  // 폼 응답은 바로 명단에 (10/23 정리): 15분 확인이 돌고 있으면 그 확인이 다음 단계에서 멈추고 잠금을 넘김(1분 뒤 이어서). 최대 60초 기다림
  let ran = false;
  const props0 = PropertiesService.getScriptProperties();
  props0.setProperty('WANT_LOCK', String(Date.now()));
  let out;
  try { out = locked_(function () {
    props0.deleteProperty('WANT_LOCK');
    ran = true;
    const formId = e.source.getId();
    const runs = readRuns_();
    const ft = e.source.getResponses().map(function (x) { return x.getTimestamp().getTime(); });
    // 이 폼을 쓰는 명단 시트의 진행 전부 (다른 날 폼으로 들어온 응답도 그날 진행 인원에 들어가게)
    const sids = {};
    runs.forEach(function (r) { if (String(r['폼ID']) === formId && r['시트ID']) sids[String(r['시트ID'])] = 1; });
    const tm = {};
    let full = false;
    runs.forEach(function (r) {
      if (!(String(r['폼ID']) === formId || sids[String(r['시트ID'])]) || r['진행 상태'] === '종료') return;
      const sid = String(r['시트ID']);
      if (!tm[sid]) { try { tm[sid] = allRespTimes_(sid, formId, ft); } catch (err) { tm[sid] = ft; } }
      const n = runCount_(runs, r, tm[sid]);
      if (Number(r['인원']) !== n) setRun_(r.row, '인원', n);
      if (r['목표인원'] && !r['마감 시각'] && n >= Number(r['목표인원'])) full = true;
    });
    // 명단 탭(값)에 새 응답 줄을 바로 (15분 기다리지 않게, 사용자 요청 10/20). 몇 초면 됨
    // 명단 탭에 바로 (기다리지 않음: 10/22 30초 기다리기가 자동 확인을 막아서 뺌)
    Object.keys(sids).forEach(function (sid) { try { syncList_(SpreadsheetApp.openById(sid)); } catch (err) {} });
    // 월급시트·한눈에 탭은 오래 걸려서(합쳐 몇 분) 응답마다 하면 6분 제한에 걸려 한눈에 탭이 비워진 채 멈출 수 있음 (10/20)
    //  → 1분 뒤 자동 확인 한 번이 둘 다 갱신 (응답이 몰려도 한 번만)
    // 인원이 다 찼으면(마감·명단 전달) 1분 뒤 확인이 함. 여기서 전체 확인을 돌리면 몇 분 동안 잠금을 잡아 다른 사람 응답이 명단에 늦게 떴음 (10/23)
    try { soonCheck_(); } catch (err) {}
  }, 60000); } finally { props0.deleteProperty('WANT_LOCK'); }
  if (!ran) { try { soonCheck_(); } catch (err) {} }
  return out;
}

function editRun_(sh) {
  const t = String(sh.getRange('B1').getValue());
  return readRuns_().filter(function (r) { return String(r['명단 제목']) === t; }).pop();
}

// 폼수정 탭 체크 상태 (스크립트가 불러온 뒤 사람이 손댔는지 보려고)
function editMarks_(sh) {
  const last = sh.getLastRow();
  const v = last >= 4 ? sh.getRange(4, 1, last - 3, 2).getValues() : [];
  return String(sh.getRange('B1').getValue()) + '|' + v.filter(function (x) { return x[0] === true; }).map(function (x) { return x[1] instanceof Date ? x[1].getTime() : String(x[1]); }).join(',');
}
function loadEditTab_(sh, msg) {
  loadEditTab0_(sh, msg);
  try { PropertiesService.getScriptProperties().setProperty('EDIT_MARKS', editMarks_(sh)); } catch (e) {}
}
// 15분마다 폼수정 탭을 새 응답으로 다시 불러옴 (불러온 뒤 체크를 손으로 바꿨으면 그대로 둠)
function refreshEditTab_() {
  const sh = adminSs_().getSheetByName(EDIT_TAB);
  if (!sh || !String(sh.getRange('B1').getValue()).trim()) return;
  if (editMarks_(sh) !== PropertiesService.getScriptProperties().getProperty('EDIT_MARKS')) return;
  loadEditTab_(sh);
}
function loadEditTab0_(sh, msg) {
  const max = sh.getMaxRows();
  if (max > 3) { sh.getRange(4, 1, max - 3, sh.getMaxColumns()).clearContent().clearDataValidations().setBackground(null).setFontColor(null); }
  sh.getRange('B2').clearContent();
  sh.getRange('G1').setValue(msg || '');
  try { ensureDupControl_(sh); } catch (e) {}
  const r = editRun_(sh);
  if (!r) { sh.getRange(3, 1, 1, sh.getMaxColumns()).clearContent(); return; }
  // 명단 시트에 폼이 여럿 연결돼 있으면 합친 명단 탭에서 (다른 날 폼 링크로 낸 사람도 보이게)
  const info = rawInfo_(r['시트ID'], r['폼ID']), raw = info.src || info.raw, st = info.start || 2;
  const head = info.head.slice(0, Math.max(info.head.filter(function (h, i) { return h; }).length, 1));
  sh.getRange(3, 1, 1, sh.getMaxColumns()).clearContent();
  sh.getRange(3, 1, 1, head.length + 1).setValues([['삭제'].concat(head)]).setFontWeight('bold').setBackground('#efe6f7').setWrap(true);
  const last = raw.getLastRow();
  // 그 진행 날짜 몫만 (같은 폼을 여러 날 쓰니까 다른 날 응답은 안 보이게: 진행일 0시 ~ 다음 진행 0시)
  const w = windowOf_(readRuns_(), r);
  const data = last < st ? [] : raw.getRange(st, 1, last - st + 1, head.length).getValues()
    .filter(function (x) { return x[0] instanceof Date && x[0].getTime() >= w.from && x[0].getTime() < w.to; });
  if (data.length) {
    if (sh.getMaxColumns() < head.length + 1) sh.insertColumnsAfter(sh.getMaxColumns(), head.length + 1 - sh.getMaxColumns());
    sh.getRange(4, 2, data.length, head.length).setValues(data);
    sh.getRange(4, 1, data.length, 1).insertCheckboxes();
    sh.getRange(4, 2, data.length, 1).setNumberFormat('M/d HH:mm:ss');
    // 중복은 여기(관리 시트)에서만 빨간색으로 보여 줌. 명단 시트는 업체도 보니까 표시 안 함
    head.forEach(function (h, c) {
      if (!MATCH.dup.test(h) || MATCH.account.test(h)) return;
      const cnt = {};
      data.forEach(function (x) { const v = String(x[c]).trim().toLowerCase(); if (v) cnt[v] = (cnt[v] || 0) + 1; });
      data.forEach(function (x, i) {
        const v = String(x[c]).trim().toLowerCase();
        if (v && cnt[v] > 1) sh.getRange(4 + i, c + 2).setBackground('#f8c9c4').setFontColor('#8a1c12');
      });
    });
    // 중복(같은 것끼리 처음 낸 것 빼고)은 미리 체크해 둠 → E1만 체크하면 지워짐
    const marks = dupRows_(sh);
    const nd = marks.filter(Boolean).length;
    if (nd) {
      sh.getRange(4, 1, marks.length, 1).setValues(marks.map(function (m) { return [m]; }));
      if (!msg) sh.getRange('G1').setValue('중복 ' + nd + '개를 미리 체크해 뒀어요. 맞으면 E1 삭제 실행을 체크하세요.');
    }
  }
  // 공지용 명단: 같은 이름이 여러 번이면 '이름2', 1번은 이름만, 5명씩 한 줄 (사장님 형식)
  let cName = head.findIndex(function (h) { return MATCH.nick.test(h); });   // 카톡 닉네임이 있으면 닉네임으로
  head.forEach(function (h, k) { if (cName < 0 && MATCH.name.test(h) && !MATCH.account.test(h)) cName = k; });
  if (cName >= 0) {
    const order = [], cnt = {};
    data.forEach(function (x) { const nm = String(x[cName]).trim(); if (!nm) return; if (!cnt[nm]) order.push(nm); cnt[nm] = (cnt[nm] || 0) + 1; });
    const words = order.map(function (nm) { return cnt[nm] > 1 ? nm + cnt[nm] : nm; });
    const lines = [];
    for (let i = 0; i < words.length; i += 5) lines.push(words.slice(i, i + 5).join(' '));
    sh.getRange('B2').setValue(lines.join('\n')).setWrap(true);
  }
}

// 폼수정 탭 E2에 붙여넣은 공지 → 관리 시트 '배정' 탭 (명단 시트에는 안 넣음, 업체도 보는 곳이라)
function applyAssign_(sh, text) {
  const r = editRun_(sh);
  if (!r) return '먼저 B1에서 진행을 고르세요.';
  return assignRun_(r, text);
}

/* ---------------- 리뷰 완료: 취완 · 사장님 보고 · 리뷰 이미지 압축 (사용자 요청 10/20, A + B1) ----------------
   A. 명단 탭 맨 오른쪽 '리뷰 확인' 체크칸(syncList_가 만듦)을 그 방(그날) 사람 전부 체크하면 → 보낼메시지에 그 카톡방 '취완'
      의뢰(명단 시트) 전체가 다 진행되고 전부 체크되면 → 사장님 갠톡 '안녕하세요 [명단 시트 이름] 리뷰완료되어 보고드립니다 !'
   B1. 의뢰 폴더 안 '리뷰이미지' 폴더(명단이 마감되면 자동으로 만듦)에 카톡 사진을 올려 두면 → 압축 파일(명단 시트 이름.zip)을 의뢰 폴더에 만들고
      보낼메시지 '할 일'에 다운로드 링크 (받아서 사장님 톡에 첨부). 사진을 더 올리면 다시 압축 */
const RV_IMG_FOLDER = '리뷰이미지', RV_CHECK = '리뷰 확인', RV_NOTE = '리뷰 확인 칸: 그날(그 방) 사람을 전부 체크하면 보낼메시지에 취완이 들어가요';
// 명단 탭 리뷰 확인 체크칸 열 (1부터): 열에 숨겨 둔 표시(개발자 메타데이터, 화면에 안 보이고 열을 옮겨도 따라감),
//  없으면 예전 2행 메모, 없으면 예전 '리뷰 확인' 머리글, 없으면 -1
const RV_MD_KEY = 'ori_review_check';
// 숨은 표시가 안 붙는 시트도 있어서(새 시트에서 메모가 다시 보임, 10/20) 열 번호를 속성에도 적어 둠. 메모는 안 씀
function rvMark_(sh, c) {
  try { PropertiesService.getScriptProperties().setProperty('RVCOLN_' + sh.getParent().getId(), String(c)); } catch (e) {}
  try { sh.getRange(colLetter_(c) + ':' + colLetter_(c)).addDeveloperMetadata(RV_MD_KEY); } catch (e) {}
}
function rvCol_(sh, lc) {
  try {
    const md = sh.createDeveloperMetadataFinder().withKey(RV_MD_KEY).find();
    for (let i = 0; i < md.length; i++) { const col = md[i].getLocation().getColumn(); if (col) return col.getColumn(); }
  } catch (e) {}
  lc = lc || Math.max(sh.getLastColumn(), 1);
  const notes = sh.getRange(2, 1, 1, lc).getNotes()[0], hdr = sh.getRange(2, 1, 1, lc).getValues()[0].map(hk_);
  const i = notes.findIndex(function (n) { return String(n).indexOf('리뷰 확인 칸') === 0; });
  if (i >= 0) return i + 1;
  if (hdr.indexOf(RV_CHECK) >= 0) return hdr.indexOf(RV_CHECK) + 1;
  let pc = 0; try { pc = Number(PropertiesService.getScriptProperties().getProperty('RVCOLN_' + sh.getParent().getId()) || 0); } catch (e) {}
  return pc > 0 ? pc : -1;
}
function reviewDone_(runs) {
  const props = PropertiesService.getScriptProperties(), cut = today_().getTime() - 40 * 86400000;
  // 처음 한 번은 이미 다 체크된 예전 의뢰를 '보낸 걸로' 기억만 (예전에 직접 보낸 취완·보고가 다시 안 들어가게)
  const init = !props.getProperty('RVDONE_INIT');
  const bySheet = {};
  runs.forEach(function (r) { if (r['시트ID'] && !isExpect_(r) && r['진행일'] instanceof Date && r['진행일'].getTime() >= cut) (bySheet[r['시트ID']] = bySheet[r['시트ID']] || []).push(r); });
  let pend = {};
  try { const ps = planSheet_(), pl = ps.getLastRow(); if (pl >= 2) ps.getRange(2, 1, pl - 1, PLAN_HEAD.length).getValues().forEach(function (x) { if (x[8] === '대기') pend[campKey_(x[1])] = 1; }); } catch (e) {}
  Object.keys(bySheet).forEach(function (sid) {
    const mine = bySheet[sid].sort(function (a, b) { return a['진행일'] - b['진행일']; });
    if (!mine.some(function (r) { return r['마감 시각'] instanceof Date; })) return;   // 아직 명단이 하나도 안 끝난 의뢰
    try {
      const lss = SpreadsheetApp.openById(sid), name = lss.getName();
      const folder = rvFolder_(mine, props, sid);
      const sh = lss.getSheetByName(LIST_TAB);
      if (!sh || !props.getProperty('LISTV_' + sid) || sh.getLastRow() < 3) return;
      const lc = Math.max(sh.getLastColumn(), 1), hdr = sh.getRange(2, 1, 1, lc).getValues()[0].map(hk_);
      const cT = hdr.indexOf('타임스탬프');
      if (cT < 0) return;
      const rg = sh.getRange(3, 1, sh.getLastRow() - 2, lc), v = rg.getValues(), nt = sh.getRange(3, cT + 1, sh.getLastRow() - 2, 1).getNotes();
      // 체크칸: 값이 있는 줄이 전부 참/거짓인 칸 (머리글에 체크·확인·리뷰가 있으면 그 칸 먼저)
      const live = v.map(function (x, i) { return x[cT] instanceof Date && !nt[i][0] ? i : -1; }).filter(function (i) { return i >= 0; });
      if (!live.length) return;
      const isChk = function (c) { return live.every(function (i) { return typeof v[i][c] === 'boolean'; }); };
      const rc = rvCol_(sh, lc);
      let cc = rc > 0 && isChk(rc - 1) ? rc - 1 : -1;
      // 없으면 맨 오른쪽 체크칸 (값이 전부 참/거짓인 칸)
      for (let c = lc - 1; cc < 0 && c >= 0; c--) if (isChk(c)) cc = c;
      if (cc < 0) return;
      // 포토 받음: 그날 사람 중 한 명이라도 리뷰 확인(체크)이 되면 업체 포토를 받아 전달한 것 → '업체 포토 아직' 알림 끔
      //  (10/24 부유단감: 포토를 카톡으로 받아 카톡으로 전달해서 시스템이 몰랐음)
      mine.forEach(function (r) {
        const pk = 'RVSENT_' + campKey_(r['명단 제목']) + '_' + dateTok_(r['명단 제목']);
        if (props.getProperty(pk)) return;
        const w = windowOf_(runs, r);
        if (live.some(function (i) { const t = v[i][cT].getTime(); return t >= w.from && t < w.to && v[i][cc] === true; })) { props.setProperty(pk, '1'); note_('✓ 포토 전달된 걸로 봄(리뷰 확인 체크 있음): ' + bareTitle_(r['명단 제목'])); }
      });
      // C. 리뷰 독촉 (사용자 요청 10/20): 진행일부터 주말 포함 10일(쿠팡·네이버. 리뷰 기한이 10일인 다른 플랫폼은 13일) 지나도
      //  체크칸이 안 된 사람 → 그 방에 독촉 글. 3일 뒤에도 남아 있으면 한 번 더. 기한이 10일 넘게 지난 예전 진행은 건너뜀. 명단 시트에는 안 씀
      const cName = (function () { let i = hdr.findIndex(function (h) { return /수령인|계정명/.test(h); }); if (i < 0) i = hdr.findIndex(function (h) { return /이름|성함/.test(h) && !MATCH.nick.test(h); }); return i; })();
      mine.forEach(function (r) {
        if (cName < 0) return;
        const D = !r['플랫폼'] || /쿠팡|네이버/.test(String(r['플랫폼'])) ? 10 : 13;
        const due = dayStart_(r['진행일']) + D * 86400000, now = today_().getTime();
        if (now < due || now - due > 10 * 86400000) return;
        const key = String(r['명단 제목']).replace(/\s+/g, ''), k1 = 'RVLATE_' + key, k2 = 'RVLATE2_' + key;
        const again = !!props.getProperty(k1);
        if (again && (props.getProperty(k2) || now < due + 3 * 86400000)) return;
        const w = windowOf_(runs, r);
        const names = live.filter(function (i) { const t = v[i][cT].getTime(); return t >= w.from && t < w.to && v[i][cc] !== true; })
          .map(function (i) { return String(v[i][cName]).trim(); }).filter(Boolean);
        if (!names.length) return;
        props.setProperty(again ? k2 : k1, '1');
        queueMsg_(String(r['카톡방'] || bareTitle_(r['명단 제목'])), [
          '⏰ 리뷰 작성 기한이 ' + (again ? '3일 지났어요' : '지났어요'),
          '아직 리뷰 확인이 안 된 분: ' + names.join(', '),
          '이미 쓰셨으면 리뷰 캡처를 올려 주시고, 아직이면 오늘 중으로 작성 부탁드려요!'
        ].join('\n'), '리뷰 독촉');
        note_('✓ 리뷰 독촉 넣음: ' + bareTitle_(r['명단 제목']) + ' ' + names.length + '명');
      });
      // A-1. 그날(그 방) 사람 전부 체크 → 취완
      mine.forEach(function (r) {
        if (!(r['마감 시각'] instanceof Date) && !pastEnd_(r)) return;
        const w = windowOf_(runs, r);
        const rows = live.filter(function (i) { const t = v[i][cT].getTime(); return t >= w.from && t < w.to; });
        if (!rows.length || !rows.every(function (i) { return v[i][cc] === true; })) return;
        const k = 'RVDONE_' + String(r['명단 제목']).replace(/\s+/g, '');
        if (props.getProperty(k)) return;
        props.setProperty(k, '1');
        if (init) return;
        queueMsg_(String(r['카톡방'] || bareTitle_(r['명단 제목'])), '취완', '취완');
        // 리뷰 사진은 날마다 말고 의뢰가 다 끝난 뒤 한 번에 취합 (사용자 요청 10/26) → 아래 A-2에서 '리뷰 캡처 올리기' 할 일
        note_('✓ 취완 메시지 넣음: ' + bareTitle_(r['명단 제목']));
      });
      // A-2. 의뢰 전체 끝 + 전부 체크 → 사장님 보고
      const total = mine.reduce(function (m, x) { return Math.max(m, Number(x['총건수']) || 0); }, 0);
      const got = mine.reduce(function (a, x) { return a + (Number(x['인원']) || 0); }, 0);
      const allDone = (!total || got >= total) && !pend[campKey_(mine[0]['캠페인'] || mine[0]['명단 제목'])] && live.every(function (i) { return v[i][cc] === true; });
      const rk = 'RVRPT_' + sid;
      // 구매확정만 의뢰는 리뷰 캡처가 없음 → 캡처 올리기·압축 없이 보고 글 바로
      let rvKind = ''; try { rvKind = (JSON.parse(props.getProperty('RV_' + sid) || '{}') || {}).kind || ''; } catch (e) {}
      const capF = rvKind === 'confirm' ? null : folder;
      if (allDone && !props.getProperty(rk)) {
        props.setProperty(rk, '1');
        // 리뷰이미지 폴더가 있으면 보고 글은 압축 파일이 생길 때 링크와 같이 넣음 (먼저 보내고 나중에 링크 글이 또 가지 않게, 10/26)
        if (!init && !capF) queueMsg_('사장님', rvReportLine_(name), '리뷰 보고');
        if (!init) note_('✓ 의뢰 리뷰 다 끝남: ' + name);
      }
      // 의뢰 리뷰가 다 끝나면 한 번: 리뷰 캡처를 의뢰 폴더 '리뷰이미지'에 전부 올리라는 할 일 (폴더 링크, 사용자 요청 10/26 '한 캠페인이 모두 완료되면 그때 취합')
      if (capF && props.getProperty(rk) && !props.getProperty('RVUP_' + sid)) {
        props.setProperty('RVUP_' + sid, '1');
        if (!init) queueMsg_('내 할 일', rvUploadMsg_(name, capF.img.getUrl()), '할 일');
      }
      // B1. 리뷰이미지 폴더 사진 → 압축 (다 끝난 뒤에 한 번에 업체로)
      if (capF && props.getProperty(rk)) rvZip_(capF, name, props, sid, mine);
    } catch (e) { note_('리뷰 완료 확인 실패 ' + sid + ': ' + e.message); }
  });
  if (init) props.setProperty('RVDONE_INIT', '1');
}
// 의뢰 폴더 안 '리뷰이미지' 폴더 (없으면 만듦)
function rvFolder_(mine, props, sid) {
  const first = mine.filter(function (x) { return x['폴더 링크']; })[0];
  if (!first) return null;
  const id = (String(first['폴더 링크']).match(/[-\w]{25,}/) || [])[0];
  if (!id) return null;
  const parent = DriveApp.getFolderById(id), it = parent.getFoldersByName(RV_IMG_FOLDER);
  let img = it.hasNext() ? it.next() : null;
  if (!img) { img = parent.createFolder(RV_IMG_FOLDER); note_('✓ 리뷰 이미지 폴더 만듦: ' + parent.getName() + '/' + RV_IMG_FOLDER); }
  // 한눈에 '리뷰 취합할 것' 줄의 '사진 올릴 곳' 링크
  if (props.getProperty('RVIMG_' + sid) !== img.getId()) props.setProperty('RVIMG_' + sid, img.getId());
  return { parent: parent, img: img };
}
const RV_TYPES = ['포토', '텍스트', '별점'];
// 사장님 리뷰 완료 보고 첫 줄 (명단 시트 이름에서 예전 '(응답)'은 뺌)
function rvReportLine_(name) { return '안녕하세요 ' + String(name).replace(/\s*\(응답\)\s*$/, '').trim() + ' 리뷰완료되어 보고드립니다 !'; }
function rvTypeOf_(folderName) { const m = String(folderName || '').trim().match(/^(포토|텍스트|별점)/); return m ? m[1] : ''; }
// 의뢰서(생성기 리뷰 정보 RV_)의 종류별 개수 → 압축 개수와 다르면 할 일에 알림. 모르면 null
function rvExpect_(sid, mine) {
  let rv = {}; try { rv = JSON.parse(PropertiesService.getScriptProperties().getProperty('RV_' + sid) || '{}') || {}; } catch (e) {}
  const total = mine.reduce(function (m, x) { return Math.max(m, Number(x['총건수']) || 0); }, 0), out = { 포토: 0, 텍스트: 0, 별점: 0 };
  if (rv.kind === 'confirm') return null;
  if (isWongo_(rv)) { out['포토'] = total; return total ? out : null; }   // 원고제공·자율 = 전체 포토리뷰
  if (rv.kind === 'text') { out['텍스트'] = total; return total ? out : null; }
  if (rv.kind === 'photo' || rv.kind === 'self') { out['포토'] = total; return total ? out : null; }
  const prods = parseRvMix_(rv.mix);
  if (!prods.length) return null;
  prods.forEach(function (p) { p.mix.forEach(function (m) { out[/^별점/.test(m.label) ? '별점' : /^(포토|사진)/.test(m.label) ? '포토' : '텍스트'] += m.n; }); });
  return out;
}
// 리뷰 캡처 올리기 할 일 (의뢰 리뷰가 다 끝났을 때 한 번, 사용자 요청 10/26: 날짜별 말고 의뢰가 다 끝나면 한 번에)
function rvUploadMsg_(name, url) {
  return '📦 [' + rvBase_(name) + '] 의뢰 리뷰가 다 끝났어요 → 이 의뢰 리뷰 캡처를 전부 아래 폴더에 올려 주세요 (날짜·포토·텍스트·별점 안 나눠도 돼요)\n' + url +
    '\n올리고 10~40분 뒤 자동으로 압축돼요. 압축 파일 안에 포토·텍스트·별점 개수가 적히고, 보낼메시지 \'리뷰 보고\'(사장님)에 압축 파일 링크가 붙어요 → 받아서 보고 글과 같이 보내기';
}
// 캠페인명 (명단 시트 이름에서 '(응답)'과 끝 건수 뺌) = 압축 파일 이름
function rvBase_(name) { return String(name).replace(/\s*\(응답\)\s*$/, '').replace(/\s*\d+\s*$/, '').trim(); }
const RV_CAP_RE = /^리뷰\s*캡[처쳐]/;   // 의뢰 폴더에 직접 만든 '리뷰캡처' 폴더도 같이 (10/26 옥광밤)
// 의뢰 방마다 보낸 리뷰 가이드 글('포토리뷰(2명) : 가 나2', 원고는 '전체 포토리뷰')에서 실제로 배정한 리뷰 종류별 인원
//  같은 방에 가이드가 여러 번 나갔으면 이름으로 합침 (같은 글 두 번 = 한 번, 10/26 실링팬처럼 포토 가이드가 사람마다 따로 = 더함). 이름 끝 숫자는 계정 수
//  → { 포토, 텍스트, 별점 } / 방 하나라도 가이드를 못 찾으면 { miss: [방] }, 합친 인원이 방 인원보다 많으면(사람이 종류를 바꿈) { odd: [방] }
function rvGuideCounts_(mine, obRows) {
  const rooms = {};
  mine.forEach(function (r) { const n = Number(r['인원']) || 0; if (n > 0) rooms[String(r['카톡방'] || bareTitle_(r['명단 제목']))] = n; });
  const per = {};
  obRows.forEach(function (v, vi) {
    const room = String(v[3]), m = String(v[4]);
    if (!rooms[room] || !/^\S{0,4}리뷰내용 가이드/.test(m)) return;
    const c = per[room] = per[room] || { 포토: {}, 텍스트: {}, 별점: {}, bad: 0 };
    if (/^[^\n]*리뷰내용 가이드[^\n]*전체\s*포토\s*리뷰/.test(m)) { c['포토']['(방 전체)'] = rooms[room]; return; }
    m.split('\n').forEach(function (l, li) {
      const x = l.match(/^\s*([^():\n]{1,20}?)\s*\((\d+)명\)\s*:(.*)$/);
      if (!x) return;
      if (/종류\s*확인/.test(x[1])) { c.bad = 1; return; }
      const t = /별점/.test(x[1]) ? '별점' : /포토|사진/.test(x[1]) ? '포토' : '텍스트', n = Number(x[2]) || 0;
      const who = String(x[3]).trim().split(/\s+/).filter(Boolean).map(function (w) { const y = w.match(/^(.*?\D)(\d+)$/); return y ? { nm: y[1], n: Number(y[2]) } : { nm: w, n: 1 }; });
      // 이름 수가 (N명)과 맞으면 이름으로, 아니면 그 줄 통째로 (못 합침)
      if (who.reduce(function (a, y) { return a + y.n; }, 0) === n) who.forEach(function (y) { c[t][y.nm] = y.n; });
      else c[t]['#' + vi + '_' + li] = n;
    });
  });
  const out = { 포토: 0, 텍스트: 0, 별점: 0 }, miss = [], odd = [];
  const sumOf = function (o) { return Object.keys(o).reduce(function (a, k) { return a + o[k]; }, 0); };
  Object.keys(rooms).forEach(function (room) {
    const c = per[room];
    if (!c || c.bad) { miss.push(room); return; }
    const k = {}; RV_TYPES.forEach(function (t) { k[t] = sumOf(c[t]); });
    const sum = k['포토'] + k['텍스트'] + k['별점'];
    if (!sum) { miss.push(room); return; }
    if (sum > rooms[room]) { odd.push(room); return; }
    RV_TYPES.forEach(function (t) { out[t] += k[t]; });
  });
  if (!Object.keys(rooms).length) return { miss: ['(인원 없음)'] };
  if (miss.length) return { miss: miss };
  if (odd.length) return { odd: odd };
  return out;
}
function rvCntText_(c) { return RV_TYPES.filter(function (t) { return c[t] > 0; }).map(function (t) { return t + ' ' + c[t]; }).join(', '); }
// 리뷰 사진 압축 (사용자 요청 10/26): 의뢰 리뷰가 다 끝나면(RVRPT_) 의뢰 폴더 '리뷰이미지'(와 직접 만든 '리뷰캡처') 사진을 전부 모아 '캠페인명.zip'
//  사진은 안 나눠도 됨: 압축 안에 '포토 5, 텍스트 10, 별점 5.txt'(개수 = 방마다 보낸 리뷰 가이드 배정, 못 찾으면 의뢰서)
//  포토·텍스트·별점으로 시작하는 폴더에 나눠 올린 사진은 압축 안에서도 '포토 N/' 폴더로 (전부 나눴으면 폴더 이름이 개수라 메모 파일 없음)
//  다 올릴 때까지 기다림: 마지막 사진을 올리고 10분 동안 새 사진이 없을 때 만듦. 사진을 더 올리면 다시 만듦. 사진 내용은 안 봄
function rvZip_(f, name, props, sid, mine) {
  const byType = { 포토: [], 텍스트: [], 별점: [] }, loose = [], seen = {};
  const walk = function (fo, depth, type) {
    const t = rvTypeOf_(fo.getName()) || type, it = fo.getFiles();
    while (it.hasNext()) { const x = it.next(); if (!/^image\//.test(x.getMimeType()) || seen[x.getId()]) continue; seen[x.getId()] = 1; if (t) byType[t].push(x); else loose.push(x); }
    if (depth < 4) { const fi = fo.getFolders(); while (fi.hasNext()) walk(fi.next(), depth + 1, t); }
  };
  walk(f.img, 0, '');
  const ci = f.parent.getFolders();
  while (ci.hasNext()) { const x = ci.next(); if (RV_CAP_RE.test(String(x.getName()).trim())) walk(x, 0, ''); }
  const typed = byType['포토'].concat(byType['텍스트'], byType['별점']), files = typed.concat(loose);
  if (!files.length) return;
  const newest = files.reduce(function (m, x) { return Math.max(m, x.getLastUpdated().getTime(), x.getDateCreated().getTime()); }, 0);
  const sig = 'v2:' + RV_TYPES.map(function (t) { return byType[t].length; }).join(',') + ':' + loose.length + ':' + newest;
  if (props.getProperty('RVZIP_' + sid) === sig) return;
  if (Date.now() - newest < 10 * 60000) return;   // 아직 올리는 중일 수 있음 → 다음 확인에서
  const base = rvBase_(name), zipName = base.replace(/\//g, '／').replace(/[\\:*?"<>|]/g, '') + '.zip', warn = [];   // 파일 이름에 못 쓰는 글자 (# 실/빈 → 실／빈)
  const size = files.reduce(function (a, x) { return a + x.getSize(); }, 0);
  if (size > 45 * 1024 * 1024) { props.setProperty('RVZIP_' + sid, sig); queueMsg_('내 할 일', '[' + base + '] 리뷰 사진이 너무 커서(' + Math.round(size / 1048576) + 'MB) 압축 못 했어요 → 사진을 줄이거나 나눠서 보내기', '할 일'); return; }
  // 개수: 전부 종류 폴더에 나눴으면 폴더 사진 수, 아니면 리뷰 가이드 배정(못 찾으면 의뢰서)
  let cnt = null, from = '';
  if (!loose.length) {
    cnt = { 포토: byType['포토'].length, 텍스트: byType['텍스트'].length, 별점: byType['별점'].length }; from = '폴더';
    const ex = rvExpect_(sid, mine);
    if (ex && RV_TYPES.some(function (t) { return ex[t] !== cnt[t]; })) warn.push('⚠ 의뢰서(' + rvCntText_(ex) + ')와 폴더 사진 수(' + rvCntText_(cnt) + ')가 달라요');
  }
  else {
    let obRows = [];
    try { const ob = outboxSheet_(), ol = ob.getLastRow(); if (ol >= 2) obRows = ob.getRange(2, 1, ol - 1, 6).getValues(); } catch (e) {}
    const g = rvGuideCounts_(mine, obRows), ex = rvExpect_(sid, mine);
    if (!g.miss && !g.odd) {
      cnt = g; from = '가이드';
      if (ex && RV_TYPES.some(function (t) { return ex[t] !== g[t]; })) warn.push('⚠ 의뢰서(' + rvCntText_(ex) + ')와 실제 배정(' + rvCntText_(g) + ')이 달라요 → 압축 파일에는 실제 배정대로 적었어요');
    } else if (ex) {
      cnt = ex; from = '의뢰서';
      warn.push('⚠ ' + (g.odd ? '리뷰 가이드가 여러 번 나간 방(' + g.odd.join(', ') + ')이 있어서' : '리뷰 가이드를 못 찾은 방(' + g.miss.join(', ') + ')이 있어서') + ' 개수를 의뢰서대로 적었어요 → 맞는지 확인');
    } else warn.push('⚠ 리뷰 종류별 개수를 몰라서 압축 파일에 못 적었어요 (사진 ' + files.length + '장)');
  }
  const total = cnt ? cnt['포토'] + cnt['텍스트'] + cnt['별점'] : 0;
  if (from !== '폴더' && total && files.length < total) warn.push('⚠ 리뷰 ' + total + '건인데 사진이 ' + files.length + '장이에요 → 빠진 캡처가 없는지 확인 (더 올리면 다시 압축돼요)');
  const used = {}, blobs = [];
  const add = function (n, x) { while (used[n]) n = n.replace(/([^/]*)$/, '_$1'); used[n] = 1; blobs.push(x.getBlob().setName(n)); };
  RV_TYPES.forEach(function (t) { byType[t].forEach(function (x) { add(t + ' ' + byType[t].length + '/' + x.getName(), x); }); });
  loose.forEach(function (x) { add(x.getName(), x); });
  if (from !== '폴더' && total) {
    const txt = rvCntText_(cnt);
    used[txt + '.txt'] = 1;
    blobs.push(Utilities.newBlob('\uFEFF' + base + ' 리뷰\r\n' + RV_TYPES.filter(function (t) { return cnt[t] > 0; }).map(function (t) { return t + ' ' + cnt[t]; }).join('\r\n') + '\r\n총 ' + total + '건\r\n', 'text/plain', txt + '.txt'));
  }
  const old = f.parent.getFilesByName(zipName);
  while (old.hasNext()) old.next().setTrashed(true);
  const zip = f.parent.createFile(Utilities.zip(blobs, zipName));
  props.setProperty('RVZIP_' + sid, sig);   // 압축을 다 만든 뒤에 기억 (중간에 끊기면 다음 확인에서 다시)
  props.setProperty('RVZIPURL_' + sid, zip.getUrl());
  const cntTxt = cnt ? rvCntText_(cnt) : '개수 모름';
  // 사장님께 보낼 글 하나: 리뷰 완료 보고 + 압축 파일 링크 (사용자 요청 10/26 '하나로 붙여'). 안 보낸 보고 글이 있으면 거기에 링크를 붙이거나 새 링크로 바꿈
  const line = rvReportLine_(name), msg = line + '\n' + zip.getUrl();
  const ob = outboxSheet_(), ol = ob.getLastRow();
  let done = false;
  if (ol >= 2) ob.getRange(2, 1, ol - 1, 6).getValues().forEach(function (v) { if (!done && v[2] === '리뷰 보고' && v[5] !== '보냄' && String(v[4]).split('\n')[0].replace(/\s*\(응답\)/, '') === line) { obSet_(ob, v[0], 5, msg); done = true; } });
  if (!done) queueMsg_('사장님', msg, '리뷰 보고');
  if (warn.length) queueMsg_('내 할 일', '[' + base + '] 리뷰 압축 확인 (사진 ' + files.length + '장 · ' + cntTxt + ')\n' + warn.join('\n'), '할 일');
  note_('✓ 리뷰 압축: ' + zipName + ' (사진 ' + files.length + '장 · ' + cntTxt + (from ? ', ' + from + ' 기준' : '') + ')' + (warn.length ? ' ' + warn.join(' ') : ''));
}

/* ---------------- 사용법 탭 (맨 앞, 사용자 요청 10/20). 글을 바꾸면 USAGE_VER를 올림 → 다시 씀 ---------------- */
const USAGE_TAB = '사용법', USAGE_VER = '15';
const USAGE_ROWS = [
  ['체험단 관리 시트 사용법', '(스크립트가 쓰는 탭이라 여기 고친 글은 다음 업데이트 때 다시 써져요)'],
  ['', ''],
  ['■ 탭', ''],
  ['한눈에', '오늘·앞으로·지난 진행 현황과 날마다 명단. 휴대폰에서는 표 아래 "휴대폰: ▶ 진행 도우미" 링크(홈 화면에 추가)로 보기'],
  ['블랙리스트', '받으면 안 되는 사람. 이름만 아래에 추가. 배정·폼 응답에 있으면 ⛔로 알려 줌'],
  ['보낼메시지', '카톡에 보낼 글. 위에서부터(보낼 날짜 빠른 순) 복사해서 보내고 맨 오른쪽 "보냄 체크" 칸 체크'],
  ['진행목록', '모든 진행 기록. "진행일" 칸을 고치면 그 진행 날짜가 옮겨짐 (아래 "날짜 바꾸기")'],
  ['폼수정', 'B1에서 진행 고르기 → E2 공지 붙여넣기(배정) / 응답 체크 후 삭제 실행 / I2에 숫자 = 추가 모집'],
  ['배정', '누가 어떤 옵션을 사기로 했는지 (공지 이름에서 자동). 한눈에 탭 "안 산 사람"·"옵션 확인"이 이걸로 나옴. 지우지 마세요 (중복 확인은 배정과 상관없이 한눈에 명단에서 빨간 글씨)'],
  ['일정', '아직 안 만든 다음 일차 예약(상태 "대기"). 진행일 자정(0시)에 자동으로 진행목록으로 넘어감(폼·방 공지 생김). 진행목록에서 날짜를 고치면 일정도 따라 밀려서 보통은 안 봐도 됨'],
  ['진행목록 vs 일정', '진행목록 = 이미 만든 진행(폼·명단 시트·방 공지 있음) → 날짜를 바꾸려면 여기 "진행일". 일정 = 아직 안 만든 다음 일차 → 그 날짜만 따로 바꿀 때만 일정 탭 "진행일"'],
  ['', ''],
  ['■ 매일 할 일', ''],
  ['1. 새 의뢰', '생성기에 의뢰서 붙여넣기 → 공지에 살 사람 이름 적기 → [이 내용으로 새 진행 만들기] (폼·명단 시트·방 공지·배정·다음 일차 계획까지 자동)'],
  ['2. 카톡 보내기', '보낼메시지 "대기"를 위에서부터 복사 → 카톡방에 붙여넣고 보내기 → 보냄 체크'],
  ['3. 폼', '진행일 0시에 자동으로 열리고, 인원이 차면 자동으로 닫힘 → 명단 전달·리뷰내용 가이드 메시지가 보낼메시지에 들어감'],
  ['4. 택배대행', '한눈에 탭 그날 명단에서 A~K 복사 → 택배시트에 붙여넣기 → "택배 옮김" 체크 (2시 전)'],
  ['', ''],
  ['■ 이럴 땐', ''],
  ['날짜 바꾸기', '예) 목요일 건너뛰고 금요일에: 진행목록에서 그 진행 "진행일"을 새 날짜(10/23)로 고치기 → 방제·카톡방 이름·보낼메시지·월급시트·뒤 일차까지 같이 바뀜 (오른쪽 아래 알림). 이미 만든 카톡방 이름은 직접 바꾸기. 아직 안 만든 일차는 "일정" 탭 진행일을 고치기'],
  ['하루 건너뛰기 (예: 오메가3)', '예) 오늘(목)은 그대로 2시 전까지 받고, 내일(금)만 쉬고 월요일에: 진행목록에서 "내일" 진행의 "진행일"을 월요일(10/26)로 고치기 → 그 뒤 일차·일정·방제·보낼메시지 날짜가 같이 밀림. 내일 진행이 진행목록에 아직 없으면 "일정" 탭에서 그 줄 진행일을 월요일로 (그 뒤 줄도 하루씩 직접). 오늘 진행은 건드리지 않기. 카톡방 이름이 이미 있으면 직접 바꾸기'],
  ['하루 인원 바꾸기 (예: 실링팬 하루 2명)', '진행목록에서 바꾸기 시작할 날 진행의 "목표인원"을 새 숫자(2)로 고치기 → 그날부터 뒤 일차·일정 탭까지 하루 2명으로 바뀜 (방제 끝 숫자·폼 설명·안 보낸 방 공지 "(N명)"도). 총건수를 넘는 남는 날은 취소, 모자라면 일정 줄이 추가됨 (오른쪽 아래 알림으로 결과). 그날 진행이 진행목록에 아직 없으면 일정 탭 "건수" 칸과 방제·명단 제목 끝 숫자를 직접 고치기. 이미 만든 카톡방 이름은 직접 바꾸기'],
  ['기대평 진행 (백발백중 도서)', '구매 없이 링크에 기대평만. 27개 링크 × 15개 = 405건, 11/6까지(주말 빼고). 매일 27개 링크가 다 나가게 하루 3계정을 A묶음(14개)·B묶음(13개)으로 나눔(10/26부터). 한 계정은 한 주에 한 묶음, 다음 주에 같은 계정이 나머지 묶음. 폼 \'작성한 링크 묶음\'으로 사람마다 14·13건을 세서 방제 끝 건수·월급시트 수량(× 500원)에 씀. 자정 ~ 오전 8시 20분 작성. 진행목록 목표인원은 사람 수. 캡처는 카톡방으로'],
  ['안 산 사람 (인원 모자람)', '그대로 두면 됨. 의뢰 마지막 날이면 그날 오후 2시 이후 다음 진행일에 모자란 만큼 진행이 자동으로 생김(보낼메시지에 방 공지). 그날 방제는 산 인원으로 바뀜(10→8, 월급시트 캠페인명도) → 보낼메시지 "할 일"대로 카톡방 이름·오리명단방 명단 메시지를 수정. 중간 날 모자란 건 마지막 날 끝난 뒤 한꺼번에. 바로 더 받으려면 폼수정 탭 I2에 인원 숫자'],
  ['잘못 산 사람·방 나간 사람', '폼수정 탭 B1에서 진행 고르기 → 그 응답 체크 → 삭제 실행. 그날 안이면 폼이 다시 열려 다른 사람을 받음'],
  ['살 사람 배정', '생성기 공지에 이름을 적고 만들었으면 자동. 나중에 바뀌면 폼수정 탭 E2에 카톡 공지를 통째로 붙여넣기'],
  ['리뷰 완료 (취완)', '명단 시트 "명단" 탭 맨 오른쪽 "리뷰 확인" 체크칸에 체크 → 그 방 사람 전부 체크되면 보낼메시지에 그 방 "취완". 의뢰 전체가 끝나고 전부 체크되면 보낼메시지 "할 일"에 리뷰 캡처 올릴 폴더 링크'],
  ['리뷰 사진 압축', '날마다 말고 의뢰가 다 끝난 뒤 한 번에: 그 의뢰 리뷰 캡처를 전부 의뢰 폴더 안 "리뷰이미지"(할 일·한눈에 "리뷰 취합할 것" 줄의 링크)에 올리기. 날짜·포토·텍스트·별점으로 안 나눠도 됨 → 10~40분 뒤 캠페인명.zip이 생기고(안에 "포토 N, 텍스트 N, 별점 N" 메모 파일, 개수는 방마다 보낸 리뷰 가이드대로 자동) 보낼메시지 "리뷰 보고"(사장님)에 압축 파일 링크 → 받아서 보고 글과 같이 업체에 보내고, 한눈에 그 줄 체크. 사진이 리뷰 건수보다 적거나 개수가 의뢰서와 다르면 할 일에 ⚠'],
  ['블랙리스트 사람이 폼을 냄', '한눈에 "확인 필요" 칸에 ⛔ + 메일 → 폼수정 탭에서 그 응답 지우기'],
  ['명단이 안 보임', '메뉴 체험단 도구 → 지금 명단 마감 확인 (명단 탭만 바로 새로고침, 나머지는 1분 뒤 자동)'],
  ['화면이 이상함', '메뉴 → 지금 최신 버전으로 업데이트 → 한눈에 탭 새로 만들기'],
  ['', ''],
  ['■ 주의', ''],
  ['탭', '탭 순서는 마음대로 옮겨도 됨. 탭 이름은 바꾸지 마세요 (스크립트가 이름으로 찾아요)'],
  ['택배시트', '스크립트가 절대 안 고침 (직접)'],
  ['카톡', '보내기는 항상 직접 (스크립트는 글만 준비)'],
  ['한눈에 Q1 ⏳', '자동 확인이 도는 중. ✔로 바뀔 때까지 메뉴를 누르지 말고 기다리기']
];
function ensureUsageTab_() {
  const props = PropertiesService.getScriptProperties(), ss = adminSs_();
  let sh = ss.getSheetByName(USAGE_TAB);
  if (sh && props.getProperty('USAGE_VER') === USAGE_VER) return;
  if (!sh) { sh = ss.insertSheet(USAGE_TAB, 0); sh.setTabColor('#5b2a86'); }
  sh.clear();
  sh.getRange(1, 1, USAGE_ROWS.length, 2).setValues(USAGE_ROWS).setWrap(true).setVerticalAlignment('top');
  sh.setColumnWidth(1, 190); sh.setColumnWidth(2, 820);
  sh.getRange(1, 1).setFontSize(14).setFontWeight('bold');
  USAGE_ROWS.forEach(function (r, i) {
    if (/^■/.test(r[0])) sh.getRange(i + 1, 1, 1, 2).setFontWeight('bold').setBackground('#efe6f7');
    else if (r[0] && i > 0) sh.getRange(i + 1, 1).setFontWeight('bold');
  });
  sh.getRange(1, 2).setFontColor('#888888');
  props.setProperty('USAGE_VER', USAGE_VER);
}

/* ---------------- 블랙리스트: 받으면 안 되는 리뷰어 (사용자 요청 10/20) ----------------
   관리 시트 '블랙리스트' 탭(한눈에 바로 옆, 빨간 탭). A 이름 | B 메모 | C 추가일. 이름만 적으면 됨 (띄어쓰기 무시)
   ① 공지 붙여넣기·생성기로 배정할 때 이름이 있으면 ⛔ 알림 ② 폼 응답 이름·계정명·예금주·닉네임에 있으면 한눈에 '확인 필요' 칸 + 메일 한 번 */
const BLACK_TAB = '블랙리스트';
function blackSheet_() {
  const ss = adminSs_();
  let sh = ss.getSheetByName(BLACK_TAB);
  if (sh) return sh;
  sh = ss.insertSheet(BLACK_TAB, Math.min(1, ss.getSheets().length));
  sh.getRange(1, 1, 1, 3).setValues([['이름', '메모', '추가일']]).setFontWeight('bold').setBackground('#f4cccc');
  sh.getRange(2, 1, 2, 3).setValues([['배지민', '받으면 안 됨', new Date()], ['김영필', '받으면 안 됨', new Date()]]);
  sh.getRange(2, 3, 50, 1).setNumberFormat('yyyy-mm-dd');
  sh.setColumnWidth(1, 140); sh.setColumnWidth(2, 360); sh.setFrozenRows(1);
  sh.setTabColor('#cc0000');
  sh.getRange('E1').setValue('여기 적힌 사람은 받으면 안 돼요. 이름을 아래에 추가하면 배정·폼 응답 때 ⛔로 알려 줘요.').setFontColor('#a3271b').setFontWeight('bold');
  note_('✓ 블랙리스트 탭 만듦 (배지민, 김영필)');
  return sh;
}
function blacklist_() {
  if (globalThis.__BLACK) return globalThis.__BLACK;
  const out = {};
  try {
    const sh = blackSheet_(), last = sh.getLastRow();
    if (last >= 2) sh.getRange(2, 1, last - 1, 1).getValues().forEach(function (v) { const k = String(v[0]).replace(/\s+/g, ''); if (k) out[k] = String(v[0]).trim(); });
  } catch (e) {}
  return (globalThis.__BLACK = out);
}
// 이름 목록 중 블랙리스트에 있는 사람 (끝의 계정 수 숫자 '이혜미2'는 빼고 비교)
function blackHits_(names) {
  const bl = blacklist_(), hit = [];
  names.forEach(function (n) { const k = String(n || '').replace(/\s+/g, '').replace(/[2-9]$/, ''); if (k && bl[k] && hit.indexOf(bl[k]) === -1) hit.push(bl[k]); });
  return hit;
}
// 그날 폼 응답에 블랙리스트 사람이 있으면 이름 목록 (이름·계정명·예금주·카톡/쿠팡 닉네임 칸)
function blackInRun_(r, w) {
  if (!Object.keys(blacklist_()).length) return [];
  const ss = SpreadsheetApp.openById(r['시트ID']), names = [];
  ss.getSheets().filter(function (t) { return !!t.getFormUrl(); }).forEach(function (t) {
    if (t.getLastRow() < 2) return;
    const head = headers_(t).map(hk_), cols = [];
    head.forEach(function (h, i) { if (MATCH.name.test(h) || MATCH.nick.test(h) || /닉네임/.test(h)) cols.push(i); });
    if (!cols.length) return;
    t.getRange(2, 1, t.getLastRow() - 1, head.length).getValues().forEach(function (v) {
      const ts = tsMs_(v[0]);
      if (!isFinite(ts) || ts < w.from || ts >= w.to) return;
      cols.forEach(function (c) { names.push(v[c]); });
    });
  });
  return blackHits_(names);
}

function assignRun_(r, text) {
  const note = '';
  const info = rawInfo_(r['시트ID'], r['폼ID']);
  let choices = [];
  try { choices = formChoices_(r['폼ID'] ? FormApp.openById(r['폼ID']) : formOf_(info.raw)); } catch (e) {}
  globalThis.__CHOICES = choices;
  const rows = parseAssign_(text, choices);
  if (!rows.length) return '이름을 못 찾았어요. 옵션 줄 뒤나 아래 줄에 이름을 띄어쓰기로 적어 주세요.';
  writeAssign_(r, rows);
  let warn = assignWarn_(text, rows);
  const black = blackHits_(rows.map(function (x) { return x[0]; }));
  if (black.length) warn = '\n⛔ 블랙리스트에 있는 사람이에요 (받으면 안 됨): ' + black.join(', ') + warn;
  const by = {};
  let canc = [];
  rows.forEach(function (x) { if (!x[2]) { canc.push(x[0]); return; } const o = String(x[1]) || '옵션 모름'; by[o] = (by[o] || 0) + x[2]; });
  // 한눈에 탭은 배정 탭을 수식으로 보고 있어서 다시 만들 필요 없음 (다시 만들면 30초 넘게 걸림)
  return '✔ [' + bareTitle_(r['명단 제목']) + '] 에 저장했어요.\n' + assignSummary_(rows) + note + warn;
}

// 옵션 인원(그린 (2명))보다 이름이 많으면 알림: 띄어쓰기 있는 닉네임이 둘로 나뉘었을 수 있음
function assignWarn_(text, rows) {
  const want = [];
  String(text || '').split('\n').forEach(function (l) {
    const m = l.replace(/^\s*\d+\)\s*/, '').replace(/^.*?옵션\s*[:：]\s*/, '').match(/^(.+?)\s*\(\s*(\d+)\s*명\s*\)/);
    if (m) want.push({ o: m[1].replace(/\s+/g, ''), n: Number(m[2]) });
  });
  const out = [];
  const labels = rows.map(function (x) { return x[1]; }).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
  labels.forEach(function (lab) {
    const lk = String(lab).replace(/\s+/g, '');
    const w = want.filter(function (x) { return lk === x.o || lk.slice(-x.o.length) === x.o; })[0];
    const got = rows.filter(function (x) { return x[1] === lab && x[2] > 0; });
    const cnt = got.reduce(function (a, x) { return a + x[2]; }, 0);
    if (w && w.n && cnt > w.n) out.push(lab + ' (' + w.n + '명)인데 이름이 ' + cnt + '명: ' + got.map(function (x) { return x[0]; }).join(', '));
  });
  return out.length ? '\n⚠ ' + out.join('\n⚠ ') + '\n  띄어쓰기 있는 닉네임이면 공지에 [시묘 심효진]처럼 대괄호로 묶거나 시묘심효진처럼 붙여 쓰고 다시 눌러 주세요.' : '';
}

// 이 진행이 속한 의뢰의 첫 명단 시트(첫 진행). 예전에 날마다 시트를 따로 만든 의뢰도 첫 시트로 모음
function firstSheetRun_(r) {
  const ck = campKey_(r['캠페인'] || r['명단 제목']);
  const chain = chainsOf_(readRuns_()).filter(function (c) { return c.key === ck && c.runs.some(function (x) { return x.row === r.row; }); })[0];
  return (chain && chain.runs.filter(function (x) { return x['시트ID'] && x['폼ID']; })[0]) || r;
}

// 의뢰 총건수가 남았는데 내일 진행이 없으면(일정 탭 계획이 없는 의뢰 등) 오늘 오전 10시(NEXT_DAY_HOUR)부터 내일 진행을 자동으로
//  같은 폼·같은 명단 시트, 공지는 오늘 공지(폼 설명)에서 이름을 뺀 것, 건수 = min(일 진행 건수, 남은 건수)
const SHORT_NEXT_HOUR = 14;
function shrinkToGot_(r, blk) {
  const got = Number(r['인원']) || 0, goal = Number(r['목표인원']) || 0;
  if (!got || got >= goal) return;
  const oldBare = bareTitle_(r['명단 제목']), nb = oldBare.replace(/\d+\s*$/, String(titleCount_(r, got)));
  if (nb === oldBare || !renameRun_(r, nb)) return;
  setRun_(r.row, '목표인원', got);
  // 그날은 이 인원으로 끝: 마감 시각을 직접 넣어서 새 명단 전달 메시지를 만들지 않음 (이미 보낸 카톡 메시지를 고치면 됨, 사용자 10/20)
  if (!(r['마감 시각'] instanceof Date)) { setRun_(r.row, '마감 시각', new Date()); r['마감 시각'] = new Date(); }
  PropertiesService.getScriptProperties().setProperty('NOLISTMSG_' + nb.replace(/\s+/g, ''), '1');
  // 보낼메시지에 있는 그 진행 명단 전달 글도 새 방제로 (보낸 것도 기록이 맞게)
  try {
    const ob = outboxSheet_(), ol = ob.getLastRow();
    if (ol >= 2) ob.getRange(2, 1, ol - 1, 6).getValues().forEach(function (v, i) { if (v[2] === '명단 전달' && String(v[4]).indexOf(oldBare) >= 0) obSet_(ob, v[0], 5, String(v[4]).split(oldBare).join(nb)); });
  } catch (e) {}
  // 명단방 글에 모자란 건수 붙이기 (10/28 진행부터, 사용자 요청 10/27): 명단 전달이 아직 없으면 새로 넣고(모자란 날은 마감이 안 돼서 안 들어갔음), 대기 중이면 고침
  let fresh = false;
  if (blk && r['진행일'] instanceof Date && dayStart_(r['진행일']) >= new Date(2026, 9, 28).getTime()) try {
    PropertiesService.getScriptProperties().setProperty(listShortKey_(r), blk);
    const me = readRuns_().filter(function (x) { return String(x['시트ID']) === String(r['시트ID']) && bareTitle_(x['명단 제목']) === nb; })[0];
    if (me && me['시트 링크']) {
      const want = listMsgText_(me), ob = outboxSheet_(), ol = ob.getLastRow();
      let found = false;
      if (ol >= 2) ob.getRange(2, 1, ol - 1, 6).getValues().forEach(function (v) {
        if (v[2] !== '명단 전달' || !String(v[4]).split('\n').some(function (l) { return l.trim() && sameRunTitle_(l, me['명단 제목']); })) return;
        found = true;
        if (v[5] === '대기' && String(v[4]) !== want) obSet_(ob, v[0], 5, want);
      });
      if (!found) { queueListMsgs_(me, true); fresh = true; }
    }
  } catch (e) { note_('명단방 글 모자란 건수 실패: ' + e); }
  renameTodo_(r, oldBare, nb, fresh);
  note_('✓ 인원 맞춤: ' + oldBare + ' → ' + nb);
}
// (한 번, 10/20) 이미 모자란 만큼 다음 날 진행을 만든 진행(# 10.20 고구마말랭이 10, 8명)도 방제를 실제 인원으로
function fixShrinkOnce_(runs) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('FIX_SHRINK_V1')) return;
  props.setProperty('FIX_SHRINK_V1', '1');
  runs.forEach(function (r) {
    if (r['진행 상태'] === '종료' || !(r['진행일'] instanceof Date) || !pastEnd_(r)) return;
    const iso = Utilities.formatDate(r['진행일'], CONFIG.TIMEZONE, 'yyyy-MM-dd');
    if (!runs.some(function (x) { return String(x['요청ID']).indexOf('next-' + r['시트ID'] + '-') === 0 && x['진행일'] instanceof Date && x['진행일'] > r['진행일'] && Utilities.formatDate(x['진행일'], CONFIG.TIMEZONE, 'yyyy-MM-dd') !== iso; })) return;
    if (runs.some(function (x) { return x !== r && String(x['시트ID']) === String(r['시트ID']) && x['진행일'] instanceof Date && x['진행일'] > r['진행일'] && !/^next-/.test(String(x['요청ID'])); })) return;   // 마지막 날만
    shrinkToGot_(r);
  });
}
function autoNextDay_() {
  const hour = Number(Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'H'));
  if (hour < (Number(CONFIG.NEXT_DAY_HOUR) || 10)) return;
  const runs = readRuns_();
  const todayKey = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyyMMdd');
  // 일정 탭에 이 캠페인의 대기 중인 계획이 있으면 그쪽(makeDueDays_)이 만듦
  const pend = {};
  try {
    const ps = planSheet_(), pl = ps.getLastRow();
    if (pl >= 2) ps.getRange(2, 1, pl - 1, PLAN_HEAD.length).getValues().forEach(function (x) { if (x[8] === '대기') pend[campKey_(x[1])] = 1; });
  } catch (e) {}
  chainsOf_(runs).forEach(function (c) {
    if (!c.total || pend[c.key]) return;
    const last = c.runs[c.runs.length - 1];
    if (!last['폼ID'] || last['진행 상태'] === '종료' || !(last['진행일'] instanceof Date)) return;
    if (Utilities.formatDate(last['진행일'], CONFIG.TIMEZONE, 'yyyyMMdd') !== todayKey) return;   // 오늘이 마지막 진행인 의뢰만
    // 지난 날은 실제 인원, 오늘은 구매 시간(예: 오전 8시 20분)이 지났으면 실제 인원 → 오늘 모자란 만큼(안 산 사람) 다음 날 자동으로 더 모집 (10/20 고구마말랭이 8/10)
    const planned = c.runs.reduce(function (a, x) { return a + (x['진행일'] < today_() || pastEnd_(x) ? (Number(x['인원']) || 0) : (Number(x['목표인원']) || 0)); }, 0);
    const left = c.total - planned;
    if (left <= 0) return;
    // 남은 건수가 오늘 안 산 사람 때문에만 생긴 거면 오후 2시 이후에 (늦게 사는 사람 기다림, 사용자 요청 10/20)
    const byTarget = c.total - c.runs.reduce(function (a, x) { return a + (x['진행일'] < today_() ? (Number(x['인원']) || 0) : (Number(x['목표인원']) || 0)); }, 0);
    if (byTarget <= 0 && hour < SHORT_NEXT_HOUR) return;
    if (pastEnd_(last) && !(Number(last['인원']) > 0)) return;   // 오늘 인원이 0이면 세기가 잘못됐을 수 있어서 자동으로 안 만듦
    const daily = Number(c.runs[0]['목표인원']) || Number(last['목표인원']) || left;
    // 남는 건수가 일 건수의 절반보다 적으면 마지막 날에 같이 (총 50 / 일 7 → 마지막 날 8, 사용자 요청 10/20. 생성기 numDays와 같은 규칙)
    const n = left > daily && left - daily < daily / 2 ? left : Math.min(daily, left);
    // 오늘 모자란 옵션 (공지 (N명) - 산 수): 내일이 오늘 모자란 것만이면 내일 공지 옵션 인원으로, 명단방 글에도 (사용자 요청 10/27)
    const goal0 = Number(last['목표인원']) || 0, got0 = Number(last['인원']) || 0;
    let so = null;
    if (pastEnd_(last)) try { so = shortOpts_(runs, last); } catch (e) { so = null; }
    const soSum = so ? so.reduce(function (a, x) { return a + x[1]; }, 0) : 0;
    const made = addMoreRun_(last, n, { next: true, short: so && soSum && soSum === n ? so : null });
    if (!/^⚠ 공지가 비어/.test(made)) note_('✓ 다음 날 진행: ' + made);   // 공지가 빈 건 할 일로 한 번만 알림 (15분마다 같은 글 안 쌓이게)
    // 오늘 진행은 실제 산 인원으로 방제·목표를 줄임 (# 10.20 고구마말랭이 10 → 8, 사용자 요청 10/20) + 카톡방 이름·명단 메시지 고치기 할 일
    // 위에서 다음 날 진행을 만들면 진행목록이 다시 정렬돼서 줄 번호가 바뀜 → 이 진행을 다시 읽어서 (옛 줄 번호로 다른 진행 이름을 고치던 것, 10/23)
    const cur = readRuns_().filter(function (x) { return String(x['명단 제목']) === String(last['명단 제목']) && String(x['시트ID']) === String(last['시트ID']); })[0];
    if (cur) shrinkToGot_(cur, got0 < goal0 ? shortBlock_(goal0, got0, so) : '');
  });
}

// 모자란 인원을 다음 날 같은 명단 시트(같은 폼)로 더 받기
//  방제: #택10.15 모두의농수산옥광밤외12 → #택10.16 모두의농수산옥광밤외5, 공지는 지금 폼 설명에서 옵션 인원만 비움
function addMore_(sh, n) {
  const r = editRun_(sh);
  if (!r) return '먼저 B1에서 진행을 고르세요.';
  return addMoreRun_(r, n);
}

function addMoreRun_(r, n, opt) {
  opt = opt || {};
  const base = nextWorkday_(r['진행일'] instanceof Date && r['진행일'] >= today_() ? r['진행일'] : today_());   // 주말·공휴일 건너뜀
  const md = (base.getMonth() + 1) + '.' + base.getDate();
  const iso = Utilities.formatDate(base, CONFIG.TIMEZONE, 'yyyy-MM-dd');
  const reqId = (opt.next ? 'next-' : 'add-') + r['시트ID'] + '-' + iso;
  if (findRunByRequest_(reqId)) return md + (opt.next ? ' 진행은 이미 만들었어요.' : ' 추가 모집은 이미 만들었어요.');
  if (!n && (opt.next || !shortByOption_(readRuns_(), r).__any)) return '인원을 1 이상으로 적어 주세요.';
  // 그날 같은 명단 시트 진행이 이미 있으면(자동으로 만든 다음 날 진행 등) 새로 만들지 않고 그 진행 인원을 늘림
  if (!opt.next) {
    if (!n) n = Object.keys(shortByOption_(readRuns_(), r)).reduce(function (a, o) { return a + shortByOption_(readRuns_(), r)[o]; }, 0);
    const same = readRuns_().filter(function (x) { return x['진행 상태'] !== '종료' && x['진행일'] instanceof Date && Utilities.formatDate(x['진행일'], CONFIG.TIMEZONE, 'yyyy-MM-dd') === iso && campKey_(x['캠페인'] || x['명단 제목']) === campKey_(r['캠페인'] || r['명단 제목']); })[0];
    if (same) {
      const total = (Number(same['목표인원']) || 0) + n;
      renameRun_(same, bareTitle_(same['명단 제목']).replace(/\d+\s*$/, String(total)));
      setRun_(same.row, '목표인원', total);
      const left0 = Number(r['목표인원']) - n, me0 = readRuns_().filter(function (x) { return String(x['명단 제목']) === String(r['명단 제목']); })[0];
      if (left0 > 0 && me0) { renameRun_(me0, bareTitle_(me0['명단 제목']).replace(/\d+\s*$/, String(left0))); setRun_(me0.row, '목표인원', left0); }
      return md + ' 진행이 이미 있어서 거기에 ' + n + '명을 더했어요 → ' + bareTitle_(same['명단 제목']).replace(/\d+\s*$/, String(total)) + '. 카톡 공지의 인원도 ' + total + '명으로 고쳐 주세요.';
    }
  }
  const nick = (String(r['명단 제목']).match(/\s*\([^)]*\)\s*$/) || [''])[0];
  const roomOld = String(r['카톡방'] || String(r['명단 제목']).replace(/\s*\([^)]*\)\s*$/, ''));
  const room = roomOld.replace(/\d{1,2}\.\d{1,2}/, md).replace(/\d+\s*$/, String(titleCount_(r, n)));
  const form = FormApp.openById(r['폼ID']);
  // 모자란 옵션별 인원 = 배정에서 안 산 계정 + 취소한 사람 (배정이 없으면 옵션 인원은 비워 둠)
  let short = opt.next ? {} : shortByOption_(readRuns_(), r);
  // 다음 날 진행이 오늘 모자란 것만이면(한 날 의뢰 등) 공지 옵션 인원을 그 수로 (10/27 양배추채칼외 → 스트랩 4·음식물거름망 4·방수테이프 2)
  if (opt.next && opt.short) { short = {}; opt.short.forEach(function (x) { short[x[2]] = (short[x[2]] || 0) + x[1]; }); }
  let sum = Object.keys(short).reduce(function (a, o) { return a + short[o]; }, 0);
  const desc = String(opt.desc || form.getDescription() || '');   // opt.desc: 폼 설명이 빈 진행에 쓸 공지 (10/27 효자손외)
  // 새로 모집하는 공지라 옵션 줄 뒤의 이름(어제 사람)은 지움
  const blankCounts = function () { return desc.split('\n').map(function (l) { return l.replace(/(\(\s*\d*\s*명\s*\)|\d+\s*명).*$/, '(  명)'); }).join('\n'); };
  let notice = stripNames_(sum ? noticeForMore_(desc, short) : blankCounts());
  // 오늘 모자란 수로 채운 다음 날 공지는 다시 읽어서 인원 합이 맞을 때만 씀. 안 맞으면 예전처럼 (  명) 빈칸 (틀린 인원 공지가 안 나가게, 10/27)
  if (opt.next && sum) {
    let back = -1;
    try { back = (parseAssign_(notice, []).opts || []).reduce(function (a, o) { return a + (REVIEW_OPT_RE.test(o[0]) ? 0 : o[2]); }, 0); } catch (e) {}
    if (back !== sum) { note_('다음 날 공지 옵션 인원을 못 채움(' + back + '/' + sum + '): ' + bareTitle_(r['명단 제목']) + ' → (  명) 빈칸으로'); notice = stripNames_(blankCounts()); short = {}; sum = 0; }
  }
  if (sum && !n) n = sum;
  // 공지(폼 설명)가 비었으면 만들지 않음: 빈 방 공지가 나감 (10/27 효자손외·양배추채칼외는 폼 설명이 빈 채로 만들어졌음). 할 일로 한 번 알림
  if (!String(notice).split('\n').some(function (l) { return l.trim() && !isSlotLine_(l); })) {
    const fk = 'NOTICEEMPTY_' + r['시트ID'] + '_' + iso, pp = PropertiesService.getScriptProperties();
    if (!pp.getProperty(fk)) {
      pp.setProperty(fk, '1');
      queueMsg_('내 할 일', '[' + md + ' 진행 못 만듦] ' + bareTitle_(r['명단 제목']) + '\n구글폼 설명(공지)이 비어 있어서 ' + md + ' 진행·공지를 안 만들었어요.\n→ 오늘 방에 올린 공지를 구글폼 설명에 붙여 넣으면 다음 자동 확인 때 만들어요.', '할 일');
    }
    return '⚠ 공지가 비어서 ' + md + ' 진행을 안 만들었어요: ' + bareTitle_(r['명단 제목']);
  }
  // 의뢰서 하나 = 폼 하나: 첫 날 폼을 계속 씀 (공지 안 폼 링크도 첫 날 폼으로)
  const first = firstSheetRun_(r);
  let res;
  locked_(function () {
    res = createRunInner_({
      k: CONFIG.KEY, n: reqId, title: room + nick, room: room, fname: room, camp: r['캠페인'] || campOf_(r['명단 제목']),
      day: (Number(r['일차']) || 1) + 1, total: r['총건수'], daily: String(n), date: iso, desc: first['폼 링크'] ? notice.replace(FORM_LINK_RE, first['폼 링크']) : notice, type: r['유형'],
      takdae: r['택대'] === 'Y', realship: r['실배송'] === 'Y', platform: r['플랫폼'], prices: r['가격'], croom: r['업체방'],
      shop: r['업체'], photo: r['포토'], slot: r['구매시간'], reuse: first, sheetId: first['시트ID']
    });
  }, 60000);
  if (!res) return '다른 작업 중이라 못 만들었어요. 잠시 뒤 다시 해 주세요.';
  if (opt.next) {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), '[체험단] ' + md + ' 진행 준비됐어요: ' + room, [
      room + ' (' + n + '건, 같은 폼·같은 명단 시트)',
      '카톡방을 이 방제로 만들고 아래 공지를 올리세요. 보낼 메시지함에도 들어가 있어요. ' + (sum ? '옵션 인원은 오늘 모자란 수로 채웠어요.' : '옵션이 여러 개면 옵션 인원 (  명)은 채워 주세요.'),
      '폼은 ' + md + ' 0시에 다시 열려요.',
      '',
      res.notice,
      '',
      '보낼 메시지함: ' + outboxUrl_()
    ].join('\n'));
    return md + ' 진행을 만들었어요: ' + room;
  }
  // 오늘 진행은 실제로 한 인원으로: 목표와 방제 끝 숫자를 (목표 - 추가 모집 인원)으로 (예: 12 → 7)
  const left = Number(r['목표인원']) - n;
  if (left > 0) {
    const me = readRuns_().filter(function (x) { return String(x['명단 제목']) === String(r['명단 제목']); })[0];
    if (me) {
      renameRun_(me, bareTitle_(me['명단 제목']).replace(/\d+\s*$/, String(left)));
      setRun_(me.row, '목표인원', left);
    }
  }
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), '[체험단] ' + md + ' 추가 모집 ' + n + '명: ' + room, [
    room + ' (' + n + '명, 같은 명단 시트)',
    '카톡방을 이 방제로 만들고 아래 공지를 올리세요.' + (sum ? ' 옵션 인원은 배정(안 산 계정 + 취소)으로 채웠어요.' : ' 옵션 인원 (  명)은 채워 주세요.') + ' 보낼 메시지함에도 들어가 있어요.',
    '폼은 ' + md + ' 0시에 다시 열려요.',
    '',
    res.notice,
    '',
    '보낼 메시지함: ' + outboxUrl_()
  ].join('\n'));
  const what = sum ? Object.keys(short).map(function (o) { return o + ' ' + short[o]; }).join(', ') : '옵션 인원은 공지에서 채워 주세요';
  return md + ' 추가 ' + n + '명 진행을 만들었어요: ' + room + ' (' + what + ')' + (sum && sum !== n ? ' ※ 적은 수(' + n + ')와 배정으로 센 수(' + sum + ')가 달라요' : '') + '. 공지는 보낼 메시지함과 메일에 있어요. 폼은 ' + md + ' 0시에 열려요.';
}

const FRUIT_SLOT_LINE = '★★★자정 ~ 오전 7시까지 구매★★★';

// 같은 의뢰에 과일 진행(자정 ~ 오전 7시)이 있는지
function chainFruit_(r) {
  const ck = campKey_(r['캠페인'] || r['명단 제목']);
  return readRuns_().some(function (x) { return campKey_(x['캠페인'] || x['명단 제목']) === ck && isFruit_(x); }) || isFruit_(r);
}

// 맨 위 구매 시간 줄인지 (★★★바로구매★★★, ★★★자정 ~ 오전 8시 20분 구매★★★ …)
function isSlotLine_(l) { l = String(l || '').trim(); return l.length < 40 && /자정|바로구매|오전|오후/.test(l) && /구매|★/.test(l); }
// 폼 설명(구글폼 맨 위 글)은 구매 시간 줄 없이 '가격이 높으면 사지 마세요!'부터 (사용자 요청). 카톡 공지는 그대로
function formDesc_(text) {
  const L = String(text || '').split('\n');
  let i = 0;
  while (i < L.length && !L[i].trim()) i++;
  if (i < L.length && isSlotLine_(L[i])) { i++; while (i < L.length && !L[i].trim()) i++; return L.slice(i).join('\n'); }
  return String(text || '');
}
// 카톡 공지 맨 위에 구매 시간 줄이 없으면 넣음 (폼 설명에서 가져온 공지로 다음 날 공지를 만들 때)
function withSlotLine_(text, slot, fruit) {
  const L = String(text || '').split('\n'), i = L.findIndex(function (l) { return l.trim(); });
  if (i >= 0 && isSlotLine_(L[i])) return noticeStyle_(text, fruit);
  const s0 = fruit ? FRUIT_SLOT_LINE : (String(slot || '').replace(/★/g, '').trim() ? '★★★' + String(slot).replace(/★/g, '').trim() + '★★★' : '');
  return noticeStyle_(s0 ? s0 + '\n\n' + String(text || '') : String(text || ''), fruit);
}

// 구글폼 질문 필수/선택 (사용자 요청): 방에 참여한 카카오톡 닉네임·쿠팡닉네임 = 필수, 리뷰비 계좌 다를 시 작성 = 선택
const ACCOUNT_Q = '계정명(수령인)';
function fixFormQuestions_(form, real) {
  const T = FormApp.ItemType;
  let n = 0;
  // 실배송은 리뷰비를 따로 안 보내서 '리뷰비 계좌 다를 시 작성' 질문을 뺌 (사용자 요청 10/23)
  if (real) form.getItems().filter(function (it) { return /리뷰비계좌.*다를/.test(String(it.getTitle() || '').replace(/\s+/g, '')); }).forEach(function (it) { form.deleteItem(it); n++; });
  form.getItems().forEach(function (it) {
    // '이름' 질문 → '계정명(수령인)' (사용자 요청 10/20. 리뷰 가이드·택배시트가 이 칸을 수령인으로 씀)
    if (String(it.getTitle() || '').trim() === '이름') { it.setTitle(ACCOUNT_Q); n++; }
    const t = String(it.getTitle() || '').replace(/\s+/g, '');
    let want = null;
    if (MATCH.nick.test(it.getTitle()) || /쿠팡닉네임/.test(t)) want = true;
    else if (/리뷰비계좌.*다를/.test(t)) want = false;
    if (want === null) return;
    const ty = it.getType();
    const x = ty === T.TEXT ? it.asTextItem() : ty === T.PARAGRAPH_TEXT ? it.asParagraphTextItem() : ty === T.MULTIPLE_CHOICE ? it.asMultipleChoiceItem()
      : ty === T.LIST ? it.asListItem() : ty === T.CHECKBOX ? it.asCheckboxItem() : null;
    if (x && x.isRequired() !== want) { x.setRequired(want); n++; }
  });
  return n;
}

// 실배송이면 방제·명단 제목·명단 시트·폼 이름에 '실'을 날짜 바로 오른쪽에 (사용자 지정 10/19): #10.19 실 런치버스 텀블러 7 (뽀짝오리)
//  예전 모양(#10.19 런치버스 텀블러 실 7)이 오면 새 모양으로 바꿈
function withSil_(t) {
  t = String(t || '');
  t = t.replace(/\s+실(\s+\d+(?:\s*\([^)]*\))?\s*)$/, '$1');   // 끝 쪽 '실 7' → '7'
  if (/^[#업택\s]*\d{1,2}\.\d{1,2}\s+실(\/빈)?(\s|$)/.test(t)) return t;   // '실/빈'도 이미 있는 걸로
  return /^[#업택\s]*\d{1,2}\.\d{1,2}/.test(t) ? t.replace(/^([#업택\s]*\d{1,2}\.\d{1,2})\s*/, '$1 실 ') : t;
}

// 공지 모양 맞추기: '🐥포토 : 포토대기' → '🐥리뷰 : ★★★포토대기★★★', 과일은 구매 시간 줄을 '★★★자정 ~ 오전 7시까지 구매★★★'
function noticeStyle_(text, fruit) {
  let t = String(text || '').split('\n').map(function (l) { return /포토\s*[:：]\s*포토\s*대기/.test(l) && !/★/.test(l) && l.length < 30 ? '🐥리뷰 : ★★★포토대기★★★' : l; }).join('\n');
  if (fruit) {
    const lines = t.split('\n');
    const i = lines.findIndex(function (l) { return l.trim(); });
    if (i >= 0 && /자정|바로구매|오전|오후/.test(lines[i]) && lines[i].length < 40) lines[i] = FRUIT_SLOT_LINE;
    t = lines.join('\n').replace(/★*\s*자정\s*~\s*오전\s*(?:7\s*시\s*00\s*분|8\s*시\s*20\s*분)\s*구매\s*★*/g, FRUIT_SLOT_LINE);
  } else {
    // 과일이 아니어도 맨 위 구매 시간 줄은 ★★★…★★★ (예: ★★★자정 ~ 오전 8시 20분 구매★★★)
    const lines = t.split('\n');
    const i = lines.findIndex(function (l) { return l.trim(); });
    if (i >= 0 && /자정|바로구매|오전|오후/.test(lines[i]) && /구매/.test(lines[i]) && lines[i].length < 40) lines[i] = '★★★' + lines[i].replace(/★/g, '').trim() + '★★★';
    t = lines.join('\n');
  }
  return t;
}

// (15분마다) 오늘·앞으로 진행 공지 맞추기
//  - 의뢰서 하나 = 폼 하나: 다음 날·추가 모집 진행이 다른 폼을 가리키고 공지를 아직 안 보냈으면 첫 날 폼으로 바꾸고 공지 링크도 바꿈
//  - 포토대기 줄, 과일 '자정 ~ 오전 7시까지 구매' 줄, 맨 아래 어제 이름 줄 (보낸 공지도 글은 고쳐 둠, 링크는 안 바꿈)
const FORM_LINK_RE = /https?:\/\/(?:forms\.gle\/[\w-]+|docs\.google\.com\/forms\/[^\s]+)/g;
// (한 번, 10/20) 이미 만든 폼의 옵션 보기가 '1 (21,800원)'처럼 숫자만이면 '단일옵션 (21,800원)'으로 (최근 7일 진행)
// (한 번, 10/21) 오즈네즈 폼 제목 '# 실 발목무압박기모양말외' → '#10.21 실 오즈네즈 양말 담요' (사용자 요청)
// (한 번, 10/21) 자동으로 닫았던 폼 다시 열기 + 토스 부유단감 이름을 '#택10.21 써니마켓 부유단감 5'로 (사용자 요청)
function reopenAndSunnyOnce_(runs) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('REOPEN_SUNNY_V1')) return;
  props.setProperty('REOPEN_SUNNY_V1', '1');
  const seen = {};
  runs.forEach(function (r) {
    const fid = String(r['폼ID'] || '');
    if (!fid || seen[fid] || r['진행 상태'] === '종료' || !(r['진행일'] instanceof Date) || dayStart_(r['진행일']) < today_().getTime()) return;
    seen[fid] = 1;
    try { const f = FormApp.openById(fid); if (!f.isAcceptingResponses()) { f.setAcceptingResponses(true); note_('✓ 폼 다시 열음: ' + bareTitle_(r['명단 제목'])); } } catch (e) {}
  });
  const r = runs.filter(function (x) { return /부유단감/.test(String(x['명단 제목'])); }).pop();
  if (!r) return;
  const day = new Date(2026, 9, 21);
  if (!(r['진행일'] instanceof Date) || dayStart_(r['진행일']) !== day.getTime()) setRun_(r.row, '진행일', day);
  setRun_(r.row, '업체', '써니마켓');
  renameRun_(r, '#택10.21 써니마켓 부유단감 5');
  try { if (r['폼ID']) { const f = FormApp.openById(r['폼ID']); f.setTitle('#택10.21 써니마켓 부유단감'); f.setAcceptingResponses(true); } } catch (e) { note_('부유단감 폼 이름 실패: ' + e); }
  try { if (r['시트ID']) SpreadsheetApp.openById(r['시트ID']).rename('#택10.21 써니마켓 부유단감'); } catch (e) { note_('부유단감 시트 이름 실패: ' + e); }
  note_('✓ 부유단감 → #택10.21 써니마켓 부유단감 5');
}
// (한 번, 10/21) 하루로 끝나는 부유단감인데 생긴 10/22 1명 진행·남은 일정 지우기 (생성기가 '1일간 진행'을 하루 1건으로 읽었던 것)
function dropSunnyExtraOnce_(runs) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('SUNNY_DROP_V1')) return;
  props.setProperty('SUNNY_DROP_V1', '1');
  runs.filter(function (x) { return /부유단감/.test(String(x['명단 제목'])) && /10\.2[2-9]/.test(String(x['명단 제목'])); }).sort(function (a, b) { return b.row - a.row; })
    .forEach(function (x) { note_('부유단감 추가 진행 지움: ' + bareTitle_(x['명단 제목']) + ' → ' + (deleteRun_(x) || 'OK')); });
  try { const ps = planSheet_(), pl = ps.getLastRow(); if (pl >= 2) { const v = ps.getRange(2, 1, pl - 1, 9).getValues(); for (let i = v.length - 1; i >= 0; i--) if (/부유단감/.test(String(v[i][1]) + String(v[i][4])) && String(v[i][8]) === '대기') ps.deleteRow(i + 2); } } catch (e) {}
}
// (한 번, 10/21 2차) 오즈네즈: 이름 '#10.21 실 오즈네즈 양말 담요5', 폼·명단 시트 '# 실 오즈네즈 양말 담요', 로켓배송이라 포토대기 → 포토리뷰 + 상품별 가이드.
//  부유단감: 리뷰 가이드 새 모양(텍스트리뷰, 머리말 빼기)으로 다시. 안 보낸 잘못된 메시지(포토대기, 옛 가이드, (업체명) 명단 전달)는 지우고 다시 넣음
// (한 번, 10/21 3차) 부유단감은 포토제공(Y) → 리뷰 가이드 대신 ⭐️포토대기⭐️ (가이드는 사진 전달 뒤 마지막에 직접).
//  오즈네즈 가이드는 상품별 전체 문장으로 (사용자가 준 글 그대로)
const OZ_GUIDE = '기모양말 : 일반 양말보다 훨씬 두껍다 / 왠만한 수면양말급이다 / 기모가 두툼하다 / 발가락까지 따뜻해서 좋다 / 다른양말들하고는 차원이 다르다 / 한켤레 더 줘서 좋다 / 하나 더 사서 동생줬다 / 깔별로 다있어서 좋다 / 귀여운 선물용봉투까지 센스있다 / 일단 발목이 확 조이지않아서 편하다 / 돌돌 말려 내려가지않아서 좋다\n' +
  '무릎담요 : 운전할때 무릎 덮으려고 샀는데 따뜻하다 / 속 안감이 부들부들하다 / 묶을필요없이 똑딱이 단추있어서 편하다 / 똑딱이가 단단해서 잘 안풀린다 / 등부터 어깨 목까지 다 따숩다 / 회사일할때 허리 감싸고 있으니 다리까지 따셔서 좋다 / 점심시간에 잘때 이불처럼 덮기 좋다 / 캠핑갈때 챙겨가니까 딱이다 / 옆으로 길어서 뭐 어디둘러도 거의 다 덮힌다';
// (한 번, 10/21 4차) 오즈네즈 리뷰 가이드를 새 모양(🐥, 상품별 [이름] + 줄마다)으로 다시: 안 보낸 옛 가이드 지우고 다시 넣음
// (한 번, 10/21 5차) 부유단감: ⭐️포토대기⭐️만 들어갔던 것 → 가이드도 '포토전달대기'로 (안 보낸 포토대기는 지우고 다시)
// (한 번, 10/21) 10.22 오즈네즈 공지: 1일차 인원·옵션이 그대로 나온 것 → 양말 2명, 담요 3명(브라운체크 1, 블랙체크 1, 민트체크 1)
function fixOzneDay2Once_(runs) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('OZ_D2_V1')) return;
  const r = runs.filter(function (x) { return /오즈네즈/.test(String(x['명단 제목'])) && /10\.22/.test(String(x['명단 제목'])); })[0];
  if (!r) return;
  props.setProperty('OZ_D2_V1', '1');
  const counts = [[2, []], [3, [1, 0, 1, 1], '', ['브라운체크', '화이트그레이', '블랙체크', '민트체크']]];
  const fix = function (t) {
    const first = String(t).split('\n')[0];
    return adjustNotice_(t, counts, first);
  };
  const room = String(r['카톡방'] || bareTitle_(r['명단 제목']));
  try { const ob = outboxSheet_(), last = ob.getLastRow(); if (last >= 2) ob.getRange(2, 1, last - 1, 6).getValues().forEach(function (v, i) { if (String(v[3]) === room && v[5] !== '보냄' && /양식 작성 폼/.test(String(v[4]))) obSet_(ob, v[0], 5, fix(v[4])); }); } catch (e) { note_('10.22 오즈네즈 공지 고치기 실패: ' + e); }
  note_('✓ 10.22 오즈네즈 공지: 양말 2명, 담요 3명(브라운·블랙·민트 1명씩)으로 고침 (폼 설명은 그대로라 공지만 보세요)');
}
// (한 번, 10/21) 플랫폼 칸 바로잡기: 부유단감 = 토스, 속눈썹영양제 = 올리브영 (생성기에 플랫폼이 없던 때 만든 것)
// 폼 옵션 보기가 그 진행 자기 공지(같은 폼 링크)의 옵션과 다르면 공지대로 되돌림 (한 번, 10/21 속눈썹영양제 폼에 색상이 들어간 것)
// (한 번, 10/22) 10.22 오즈네즈 배정: 처음 붙여넣을 때 구분선(————)과 '1) 2명 - 이름'을 못 읽어 담요 3명만 들어갔던 것 → 다시
function fixOzAssignOnce_(runs) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('OZ_ASSIGN_V1')) return;
  const r = runs.filter(function (x) { return /오즈네즈/.test(String(x['명단 제목'])) && /10\.22/.test(String(x['명단 제목'])); })[0];
  if (!r || !r['폼ID']) return;
  props.setProperty('OZ_ASSIGN_V1', '1');
  const text = '1) 2명 - 임수진 이혜미(타)\n🐥옵션 : 혼합10결레\n🐥가격 : 18,900\n\n————————————————————————\n\n2) 3명 - 임수진(타) 김은지 윤회선\n🐥옵션 : 브라운체크 (1명) 윤회선\n블랙체크 (1명) 김은지\n민트체크 (1명) 임수진(타)\n\n🐥가격 : 16,800';
  const rows = parseAssign_(text, formChoices_(FormApp.openById(r['폼ID'])));
  if (rows.length) { writeAssign_(r, rows); note_('✓ 10.22 오즈네즈 배정 다시: ' + rows.map(function (x) { return x[0] + '-' + x[1]; }).join(', ')); }
}
function fixFormOptsOnce_(runs) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('FORMOPTS_V1')) return;
  props.setProperty('FORMOPTS_V1', '1');
  const ob = outboxSheet_(), ol = ob.getLastRow();
  const msgs = ol >= 2 ? ob.getRange(2, 1, ol - 1, 6).getValues() : [];
  const seen = {};
  runs.forEach(function (r) {
    const fid = String(r['폼ID'] || '');
    if (!fid || seen[fid] || r['진행 상태'] === '종료' || !(r['진행일'] instanceof Date) || dayStart_(r['진행일']) < today_().getTime() - 86400000 || !r['폼 링크']) return;
    seen[fid] = 1;
    const own = msgs.filter(function (v) { return v[2] === '방 공지' && String(v[4]).indexOf(String(r['폼 링크'])) >= 0; })[0];
    if (!own) return;
    const text = String(own[4]);
    let want = optionLabels_(text);
    if (want.length < 2) {
      const ol1 = (text.match(/🐥\s*옵션\s*[:：]\s*([^\n]+)/) || [])[1], pr = (text.match(/🐥\s*가격\s*[:：]\s*([\d,]+)/) || [])[1];
      if (!ol1 || /\(\s*\d*\s*명\s*\)/.test(ol1)) return;
      want = [optDigits_(ol1.trim()) + (pr ? ' (' + pr + '원)' : '')];
    }
    try {
      const fo = FormApp.openById(fid), cur = formChoices_(fo);
      if (cur.join('\n') === want.join('\n')) return;
      const k = function (x) { return String(x).replace(/\s*\([\d,\s]+원\)\s*$/, '').replace(/\s+/g, ''); };
      if (cur.length === want.length && cur.every(function (c, i) { return k(c) === k(want[i]); })) return;
      setOptionChoices_(fo, want.join('\n'));
      note_('✓ 폼 옵션 되돌림: ' + bareTitle_(r['명단 제목']) + ' (' + cur.join(', ') + ' → ' + want.join(', ') + ')');
    } catch (e) { note_('폼 옵션 되돌리기 실패 ' + bareTitle_(r['명단 제목']) + ': ' + e); }
  });
}
// 오메가3(10/22 사용자 요청): 10/22는 그대로 진행(2시 전 5명), 10/23(금)은 건너뛰고 10/26(월)로. 뒤 일차도 밀림
function fixOmegaOnce_(runs) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('OMEGA_V1')) return;
  props.setProperty('OMEGA_V1', '1');
  const D = function (m, d) { return new Date(2026, m - 1, d); }, day = function (x) { return x instanceof Date ? dayStart_(x) : 0; };
  const om = runs.filter(function (r) { return /오메가/.test(String(r['명단 제목']) + String(r['캠페인'] || '')) && r['진행 상태'] !== '종료'; });
  const on = function (rs, d) { return rs.filter(function (r) { return day(r['진행일']) === dayStart_(d); })[0]; };
  // 10/22 진행이 10/23으로 밀려 있으면 10/22로 되돌림
  if (!on(om, D(10, 22)) && on(om, D(10, 23))) note_(moveRunDate_(on(om, D(10, 23)), D(10, 22)));
  const om2 = readRuns_().filter(function (r) { return /오메가/.test(String(r['명단 제목']) + String(r['캠페인'] || '')) && r['진행 상태'] !== '종료'; });
  const r23 = on(om2, D(10, 23));
  if (r23) { note_(moveRunDate_(r23, D(10, 26))); return; }
  // 10/23이 아직 일정 탭(대기)이면 일정만 밀기
  const ps = planSheet_(), pl = ps.getLastRow();
  if (pl < 2) return;
  const rows = ps.getRange(2, 1, pl - 1, PLAN_HEAD.length).getValues().map(function (x, i) { return { x: x, i: i }; })
    .filter(function (o) { return o.x[8] === '대기' && /오메가/.test(String(o.x[1]) + String(o.x[5])) && day(o.x[3]) >= dayStart_(D(10, 23)); })
    .sort(function (a, b) { return a.x[3] - b.x[3]; });
  if (!rows.length || day(rows[0].x[3]) !== dayStart_(D(10, 23))) return;
  let prev = D(10, 23);
  rows.forEach(function (o, k) {
    if (k > 0 && day(o.x[3]) > dayStart_(prev)) { prev = o.x[3]; return; }
    const nd = k === 0 ? D(10, 26) : nextWorkday_(prev);
    ps.getRange(o.i + 2, 4, 1, 3).setValues([[nd, retitleDate_(o.x[4], nd), retitleDate_(o.x[5], nd)]]);
    note_('(일정) ' + bareTitle_(o.x[5]) + ' → ' + bareTitle_(retitleDate_(o.x[5], nd))); prev = nd;
  });
}
function fixPlatOnce_(runs) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('PLATFIX_V1')) return;
  props.setProperty('PLATFIX_V1', '1');
  runs.forEach(function (r) {
    const t = String(r['명단 제목']);
    if (/부유단감/.test(t) && r['플랫폼'] !== '토스') setRun_(r.row, '플랫폼', '토스');
    if (/속눈썹영양제/.test(t) && r['플랫폼'] !== '올리브영') setRun_(r.row, '플랫폼', '올리브영');
  });
}
function fixSunny5Once_(runs) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('SUNNY5_V1')) return;
  props.setProperty('SUNNY5_V1', '1');
  const sunny = runs.filter(function (x) { return /부유단감/.test(String(x['명단 제목'])); });
  const rooms = {}; sunny.forEach(function (r) { rooms[String(r['카톡방'] || bareTitle_(r['명단 제목']))] = 1; });
  try { const ob = outboxSheet_(), last = ob.getLastRow(); if (last >= 2) { const v = ob.getRange(2, 1, last - 1, 6).getValues(); for (let i = v.length - 1; i >= 0; i--) if (v[i][5] !== '보냄' && rooms[String(v[i][3])] && /^⭐️포토대기⭐️/.test(String(v[i][4]))) ob.deleteRow(i + 2); } } catch (e) {}
  sunny.forEach(function (r) {
    props.deleteProperty('RVMSG2_' + String(r['명단 제목']).replace(/\s+/g, ''));
    if (r['진행일'] instanceof Date) props.deleteProperty('RVMSGD_' + r['시트ID'] + '_' + Utilities.formatDate(r['진행일'], CONFIG.TIMEZONE, 'yyyyMMdd'));
  });
}
function fixOzne4Once_(runs) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('OZNE4_V1')) return;
  props.setProperty('OZNE4_V1', '1');
  const oz = runs.filter(function (x) { return /발목무압박기모양말|오즈네즈/.test(String(x['명단 제목'])); });
  const rooms = {}; oz.forEach(function (r) { rooms[String(r['카톡방'] || bareTitle_(r['명단 제목']))] = 1; });
  try { const ob = outboxSheet_(), last = ob.getLastRow(); if (last >= 2) { const v = ob.getRange(2, 1, last - 1, 6).getValues(); for (let i = v.length - 1; i >= 0; i--) if (v[i][5] !== '보냄' && rooms[String(v[i][3])] && /^⭐️리뷰내용 가이드⭐️/.test(String(v[i][4]))) ob.deleteRow(i + 2); } } catch (e) {}
  oz.forEach(function (r) {
    props.deleteProperty('RVMSG2_' + String(r['명단 제목']).replace(/\s+/g, ''));
    if (r['진행일'] instanceof Date) props.deleteProperty('RVMSGD_' + r['시트ID'] + '_' + Utilities.formatDate(r['진행일'], CONFIG.TIMEZONE, 'yyyyMMdd'));
  });
}
function fixOzneSunny3Once_(runs) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('OZNE_SUNNY3_V1')) return;
  props.setProperty('OZNE_SUNNY3_V1', '1');
  const oz = runs.filter(function (x) { return /발목무압박기모양말|오즈네즈/.test(String(x['명단 제목'])); });
  const sunny = runs.filter(function (x) { return /부유단감/.test(String(x['명단 제목'])); });
  const rooms = {};
  oz.concat(sunny).forEach(function (r) { rooms[String(r['카톡방'] || bareTitle_(r['명단 제목']))] = 1; });
  try {
    const ob = outboxSheet_(), last = ob.getLastRow();
    if (last >= 2) { const v = ob.getRange(2, 1, last - 1, 6).getValues(); for (let i = v.length - 1; i >= 0; i--) if (v[i][5] !== '보냄' && rooms[String(v[i][3])] && /^⭐️(포토대기|리뷰내용 가이드)⭐️/.test(String(v[i][4]))) ob.deleteRow(i + 2); }
  } catch (e) {}
  const setRv = function (r, f) { if (!r || !r['시트ID']) return; const k = 'RV_' + r['시트ID']; let rv = {}; try { rv = JSON.parse(props.getProperty(k) || '{}'); } catch (e) {} f(rv); props.setProperty(k, JSON.stringify(rv)); };
  setRv(oz[0], function (rv) { rv.kind = 'self'; rv.mix = ''; rv.guide = OZ_GUIDE; });
  setRv(sunny[0], function (rv) { rv.kind = 'photo'; });
  oz.concat(sunny).forEach(function (r) {
    props.deleteProperty('RVMSG2_' + String(r['명단 제목']).replace(/\s+/g, ''));
    if (r['진행일'] instanceof Date) props.deleteProperty('RVMSGD_' + r['시트ID'] + '_' + Utilities.formatDate(r['진행일'], CONFIG.TIMEZONE, 'yyyyMMdd'));
  });
  note_('✓ 부유단감 포토대기, 오즈네즈 상품별 가이드로 다시');
}
function fixOzneSunny2Once_(runs) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('OZNE_SUNNY2_V1')) return;
  props.setProperty('OZNE_SUNNY2_V1', '1');
  const oz = runs.filter(function (x) { return /발목무압박기모양말|오즈네즈/.test(String(x['명단 제목'])); });
  const sunny = runs.filter(function (x) { return /부유단감/.test(String(x['명단 제목'])); });
  const rooms = {};
  oz.forEach(function (r) { rooms[String(r['카톡방'] || bareTitle_(r['명단 제목']))] = 1; });
  sunny.forEach(function (r) { rooms[String(r['카톡방'] || bareTitle_(r['명단 제목']))] = 1; });
  // 1) 안 보낸 잘못된 메시지 지우기
  try {
    const ob = outboxSheet_(), last = ob.getLastRow();
    if (last >= 2) { const v = ob.getRange(2, 1, last - 1, 6).getValues(); for (let i = v.length - 1; i >= 0; i--) {
      if (v[i][5] === '보냄') continue;
      const m = String(v[i][4]);
      if ((rooms[String(v[i][3])] && /^⭐️(포토대기|리뷰내용 가이드)⭐️/.test(m)) || (v[i][2] === '명단 전달' && /\(업체명\)\s*부유단감/.test(m))) ob.deleteRow(i + 2);
    } }
  } catch (e) { note_('오즈네즈·부유단감 메시지 정리 실패: ' + e); }
  // 2) 오즈네즈 이름·리뷰 정보
  oz.forEach(function (r) {
    const d = r['진행일'] instanceof Date ? (r['진행일'].getMonth() + 1) + '.' + r['진행일'].getDate() : dateTok_(r['명단 제목']);
    renameRun_(r, '#' + d + ' 실 오즈네즈 양말 담요' + (Number(r['목표인원']) || ''));
  });
  const oz0 = oz[0];
  if (oz0) {
    try { if (oz0['폼ID']) FormApp.openById(oz0['폼ID']).setTitle('# 실 오즈네즈 양말 담요'); } catch (e) {}
    try { if (oz0['시트ID']) SpreadsheetApp.openById(oz0['시트ID']).rename('# 실 오즈네즈 양말 담요'); } catch (e) {}
    try {
      const k = 'RV_' + oz0['시트ID'], rv = JSON.parse(props.getProperty(k) || '{}'), parts = String(rv.guide || '').split(/\s+\/\s+/);
      rv.kind = 'self';
      if (parts.length === 2) rv.guide = '기모양말 : ' + parts[0].trim() + '\n무릎담요 : ' + parts[1].trim();
      props.setProperty(k, JSON.stringify(rv));
    } catch (e) {}
  }
  // 3) 리뷰 가이드 다시 넣게 기억 지우기
  oz.concat(sunny).forEach(function (r) {
    props.deleteProperty('RVMSG2_' + String(r['명단 제목']).replace(/\s+/g, ''));
    if (r['진행일'] instanceof Date) props.deleteProperty('RVMSGD_' + r['시트ID'] + '_' + Utilities.formatDate(r['진행일'], CONFIG.TIMEZONE, 'yyyyMMdd'));
  });
  Object.keys(props.getProperties()).forEach(function (k) { if (/^RVMSG2_.*(부유단감|발목무압박|오즈네즈)/.test(k)) props.deleteProperty(k); });
  note_('✓ 오즈네즈 이름·포토리뷰 가이드, 부유단감 가이드 다시');
}
function fixOzneOnce_(runs) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('OZNE_TITLE_V1')) return;
  const r = runs.filter(function (x) { return x['폼ID'] && /발목무압박기모양말/.test(String(x['명단 제목'])); })[0];
  if (!r) return;
  props.setProperty('OZNE_TITLE_V1', '1');
  FormApp.openById(r['폼ID']).setTitle('#10.21 실 오즈네즈 양말 담요');
  note_('✓ 폼 제목 바꿈: #10.21 실 오즈네즈 양말 담요');
}
function fixOptDigitsOnce_(runs) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('OPTDIGIT_V1')) return;
  props.setProperty('OPTDIGIT_V1', '1');
  const cut = today_().getTime() - 7 * 86400000, seen = {};
  runs.forEach(function (r) {
    const fid = String(r['폼ID'] || '');
    if (!fid || seen[fid] || !(r['진행일'] instanceof Date) || r['진행일'].getTime() < cut) return;
    seen[fid] = 1;
    try {
      FormApp.openById(fid).getItems().forEach(function (it) {
        if (!/옵션/.test(it.getTitle())) return;
        const t = it.getType();
        const item = t === FormApp.ItemType.MULTIPLE_CHOICE ? it.asMultipleChoiceItem() : t === FormApp.ItemType.LIST ? it.asListItem() : t === FormApp.ItemType.CHECKBOX ? it.asCheckboxItem() : null;
        if (!item) return;
        const cur = item.getChoices().map(function (c) { return c.getValue(); }), want = cur.map(optDigits_);
        if (want.join('\n') === cur.join('\n')) return;
        item.setChoiceValues(want);
        note_('✓ 폼 옵션 숫자 → 단일옵션: ' + bareTitle_(r['명단 제목']) + ' (' + cur.join(', ') + ' → ' + want.join(', ') + ')');
      });
    } catch (e) { note_('폼 옵션 단일옵션 바꾸기 실패 ' + bareTitle_(r['명단 제목']) + ': ' + e); }
  });
}
function fixStyleOnce_() {
  const runs = readRuns_();
  const ob = outboxSheet_(), last = ob.getLastRow();
  const msgs = last >= 2 ? ob.getRange(2, 1, last - 1, 6).getValues() : [];
  runs.filter(function (r) { return r['진행 상태'] !== '종료' && r['진행일'] instanceof Date && r['진행일'] >= today_(); }).forEach(function (r) {
    const fruit = chainFruit_(r), room = String(r['카톡방'] || bareTitle_(r['명단 제목']));
    const mine = msgs.map(function (v, i) { return { v: v, i: i }; }).filter(function (m) { return String(m.v[3]) === room && m.v[2] === '방 공지'; });
    // (예전에는 여기서 다음 날 진행을 첫 날 폼으로 바꿨는데, 이미 카톡에 올린 공지 링크와 달라져서 0시에 엉뚱한 폼이 열림 → 안 바꿈)
    mine.forEach(function (m) {
      const nm = noticeStyle_(stripTrailingNames_(String(m.v[4])), fruit);
      if (nm !== String(m.v[4])) { obSet_(ob, m.v[0], 5, nm); m.v[4] = nm; note_('✓ ' + room + ' 공지 고침'); }
    });
    // 폼 옵션 질문이 '단일옵션' 하나뿐인데 공지 옵션이 여러 개면 옵션별로 나눔 (옵션 나누기 전에 만든 폼)
    try {
      const fo = FormApp.openById(r['폼ID']);
      try { fixReviewOptions_(fo, r); } catch (e) { note_(room + ' 폼 옵션 되돌리기 실패: ' + e.message); }
      // (예전: 폼 옵션이 하나면 보낼메시지 공지의 옵션으로 나눴는데, 공지가 다른 방 줄에 잘못 들어가 있으면 엉뚱한 옵션(색상)이 들어가서 뺌, 10/21 속눈썹영양제)
    } catch (e) { note_(room + ' 폼 옵션 나누기 실패: ' + e.message); }
    // 폼 설명 = 그 진행 공지 (아직 시작 안 한 진행만, 같은 폼으로 오늘 받는 중이면 그대로)
    const busyToday = runs.some(function (x) { return x !== r && String(x['폼ID']) === String(r['폼ID']) && x['진행일'] instanceof Date && Utilities.formatDate(x['진행일'], CONFIG.TIMEZONE, 'yyyyMMdd') === Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyyMMdd') && !x['마감 시각']; });
    try {
      const f = FormApp.openById(r['폼ID']);
      const src = !busyToday && mine.length && r['진행일'] > today_() ? String(mine[0].v[4]) : (f.getDescription() || '');
      const nd = formDesc_(busyToday ? src : noticeStyle_(stripTrailingNames_(src), fruit));   // 폼 설명은 구매 시간 줄 빼고
      if (nd !== (f.getDescription() || '')) f.setDescription(nd);
      const qk = 'FQ1_' + r['폼ID'];
      if (!PropertiesService.getScriptProperties().getProperty(qk)) {
        const c = fixFormQuestions_(f);
        PropertiesService.getScriptProperties().setProperty(qk, '1');
        if (c) note_('✓ ' + room + ' 폼 질문 필수/선택 ' + c + '개 고침');
      }
    } catch (e) {}
  });
  // 보내기 전인 다른 공지도 포토대기 줄은 바꿈
  msgs.forEach(function (v, i) { if (v[2] === '방 공지' && v[5] !== '보냄') { const nm = noticeStyle_(String(v[4]), false); if (nm !== String(v[4])) obSet_(ob, v[0], 5, nm); } });
}

// 공지에서 옵션 보기 목록 (가이드 여럿이면 상품 이름 붙임, 옵션마다 가격이 다르면 '(17,200원)') — 옵션 줄 'X (N명)', 'X N명', 'X (  명)'
const REVIEW_OPT_RE = /리뷰|별점|포토|한줄|텍스트/;
// 폼 옵션 보기가 리뷰 종류(별점·텍스트리뷰)로 잘못 바뀐 폼: 응답에 남은 진짜 옵션(예: 2.5kg 1건 (30,900원))으로 되돌리고,
//  진짜 옵션이 하나뿐이면 리뷰 종류로 들어온 응답의 옵션 칸(응답 탭·명단 탭)도 그 옵션으로 고침 (택배시트에 옵션이 맞게)
function fixReviewOptions_(form, r) {
  const ch = formChoices_(form);
  if (!ch.length || !ch.every(function (c) { return REVIEW_OPT_RE.test(c); })) return;
  const ss = SpreadsheetApp.openById(r['시트ID']), cnt = {}, fixCells = [];
  ss.getSheets().filter(function (t) { return !!t.getFormUrl(); }).forEach(function (t) {
    const head = headers_(t).map(hk_), c = head.findIndex(function (h) { return MATCH.opt.test(h) && !MATCH.nick.test(h); });
    if (c < 0 || t.getLastRow() < 2) return;
    t.getRange(2, c + 1, t.getLastRow() - 1, 1).getValues().forEach(function (v, i) {
      const x = String(v[0]).trim();
      if (!x) return;
      if (REVIEW_OPT_RE.test(x)) fixCells.push({ t: t, row: i + 2, col: c + 1 }); else cnt[x] = (cnt[x] || 0) + 1;
    });
  });
  const real = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; });
  if (!real.length) { note_(bareTitle_(r['명단 제목']) + ': 폼 옵션이 리뷰 종류(' + ch.join(', ') + ')로 되어 있어요. 진짜 옵션을 몰라서 못 고침 → 폼에서 옵션 보기를 직접 고쳐 주세요'); return; }
  setOptionChoices_(form, real.join('\n'));
  note_('✓ ' + bareTitle_(r['명단 제목']) + ' 폼 옵션을 리뷰 종류(' + ch.join(', ') + ')에서 ' + real.join(', ') + '(으)로 되돌림');
  if (real.length !== 1 || !fixCells.length) return;
  fixCells.forEach(function (x) { x.t.getRange(x.row, x.col).setValue(real[0]).setNote('폼 옵션이 리뷰 종류로 잘못 바뀌어 있던 때 낸 응답이라 옵션을 ' + real[0] + '(으)로 고침 (10/20)'); });
  // 명단 탭(값)도
  const sh = ss.getSheetByName(LIST_TAB);
  if (sh && sh.getLastRow() >= 3) {
    const hdr = sh.getRange(2, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(hk_), oc = hdr.findIndex(function (h) { return MATCH.opt.test(h) && !MATCH.nick.test(h); });
    if (oc >= 0) {
      const rg = sh.getRange(3, oc + 1, sh.getLastRow() - 2, 1), v = rg.getValues();
      let n = 0;
      v.forEach(function (x) { if (REVIEW_OPT_RE.test(String(x[0]))) { x[0] = real[0]; n++; } });
      if (n) rg.setValues(v);
    }
  }
  note_('✓ ' + bareTitle_(r['명단 제목']) + ': 리뷰 종류로 들어온 응답 ' + fixCells.length + '개의 옵션을 ' + real[0] + '(으)로 고침');
}

function optionLabels_(text) {
  // 공지 읽기(parseAssign_)를 그대로 쓰려고 옵션 줄 끝에 가짜 이름을 붙여서 읽음
  const t = String(text || '').split('\n').map(function (l) { return /(\(\s*\d*\s*명\s*\)|\d+\s*명)/.test(l) && !/가격|★|http/.test(l) ? l + ' 가' : l; }).join('\n');
  // 리뷰 배정 줄(텍스트리뷰 (3명) / 별점 (2명))은 상품 옵션이 아님 (10/20 감홍사과 폼 옵션이 별점·텍스트리뷰로 바뀐 원인)
  const out = [], xs = parseAssign_(t, []).filter(function (x) { return x[1] && !REVIEW_OPT_RE.test(x[1]); });
  // 옵션 가격이 다 같으면 가격은 빼고 옵션(색상 등)만 (사용자 요청 10/18)
  const same = xs.every(function (x) { return x[4] === xs[0][4]; });
  xs.forEach(function (x) {
    const lab = x[1] + (x[4] && !same ? ' (' + Number(x[4]).toLocaleString('ko-KR') + '원)' : '');
    if (out.indexOf(lab) === -1) out.push(lab);
  });
  return out;
}

// (한 번, 10/20) 예전에 저장한 다음 일차 공지 틀에 1일차 살 사람 이름이 남아서 2일차+ 방 공지(보낼메시지 대기)에 전날 이름이 뜸
//  → 그 진행에 배정(이름)이 따로 없으면 대기 중인 방 공지와 (그 폼을 마지막으로 쓰는 진행이면) 폼 설명에서 이름을 뺌
function fixStaleNamesOnce_(runs) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('FIX_STALENAMES_V1')) return;
  props.setProperty('FIX_STALENAMES_V1', '1');
  const assigned = {}, as = assignSheet_(), al = as.getLastRow();
  if (al >= 2) as.getRange(2, 1, al - 1, 2).getValues().forEach(function (v) { if (String(v[1]).trim()) assigned[String(v[0])] = 1; });
  const ob = outboxSheet_(), ol = ob.getLastRow(), fixed = [];
  if (ol < 2) return;
  ob.getRange(2, 1, ol - 1, 6).getValues().forEach(function (v, i) {
    if (v[2] !== '방 공지' || v[5] === '보냄') return;
    const room = String(v[3]);
    const r = runs.filter(function (x) { return String(x['카톡방'] || bareTitle_(x['명단 제목'])) === room; })[0];
    if (!r || !(Number(r['일차']) > 1) || assigned[String(r['명단 제목'])]) return;
    const msg = String(v[4]), clean = stripNames_(msg);
    if (clean === msg) return;
    obSet_(ob, v[0], 5, clean); fixed.push(room);
    const latest = runs.filter(function (x) { return String(x['폼ID']) === String(r['폼ID']) && x['진행일'] instanceof Date; }).sort(function (a, b) { return b['진행일'] - a['진행일']; })[0];
    if (latest === r && r['폼ID']) { try { FormApp.openById(r['폼ID']).setDescription(formDesc_(clean)); } catch (e) {} }
  });
  if (fixed.length) note_('✓ 다음 일차 방 공지에서 전날 이름 뺌: ' + fixed.join(', '));
}

// 공지에서 살 사람 이름 빼기 (다음 일차 공지 틀, 다음 일차 방 공지): ① 옵션 줄 '(2명)' 뒤 이름 ② 폼 링크 아래 이름만 있는 줄 ③ 맨 끝 이름 줄
function stripNames_(text) {
  const lines = String(text || '').split('\n').map(function (l) { return l.replace(/(\(\s*\d*\s*명\s*\))[^\n]*$/, '$1'); });
  const formAt = lines.findIndex(function (l) { return /forms\.gle|docs\.google\.com\/forms|구글폼\s*링크/.test(l); });
  // ②는 폼 링크와 상품 정보(🐥) 사이 줄만 (상품 정보 안의 옵션 이름 줄은 안 건드림)
  const birdAt = lines.findIndex(function (l, i) { return i > formAt && /🐥/.test(l); });
  const out = lines.filter(function (l, i) { return formAt < 0 || i <= formAt || (birdAt >= 0 && i >= birdAt) || !isNamesLine_(l); });
  // 이름 줄을 빼서 생긴 빈 줄 겹침 정리
  return stripTrailingNames_(out.join('\n').replace(/\n{3,}/g, '\n\n'));
}
function isNamesLine_(l) {
  const nameTok = /^@?[A-Za-z가-힣][^\s\d:!?~]{0,11}\d?$/;
  const t = String(l).trim();
  if (!t || /http|🐥|★|☆|▶|▼|※|[:!?]|\d\s*원|구매|리뷰|링크|가격|배송|검색|사업자|입금|참고|안내|폼/.test(t)) return false;
  const toks = t.split(/[\s,]+/).filter(Boolean);
  return toks.length <= 12 && toks.every(function (x) { return nameTok.test(x) || /^[2-9]$/.test(x) || /^[^\s]+\(\s*취소\s*\)$/.test(x); });
}
// 공지 끝(가이드마다 맨 아래)에 이름만 적은 줄 지우기 (예: '정진아 이혜미2 신선영 / 이강희2 임수진') → 새로 모집하는 공지에 어제 사람이 안 들어가게
function stripTrailingNames_(text) {
  const nameTok = /^@?[A-Za-z가-힣][^\s\d:!?~]{0,11}\d?$/;
  const isNames = function (l) {
    const t = l.trim();
    if (!t || /http|🐥|★|☆|▶|※|[:!?]|\d\s*원|구매|리뷰|링크|가격|배송|검색|사업자|입금|참고|안내|폼/.test(t)) return false;
    const toks = t.split(/[\s,]+/).filter(Boolean);
    return toks.length <= 12 && toks.every(function (x) { return nameTok.test(x) || /^[2-9]$/.test(x) || /^[^\s]+\(\s*취소\s*\)$/.test(x); });
  };
  return String(text || '').split(/(\n\s*-{5,}\s*\n)/).map(function (part, i) {
    if (i % 2) return part;
    const lines = part.split('\n');
    let end = lines.length;
    while (end > 0 && (!lines[end - 1].trim() || isNames(lines[end - 1]))) end--;
    // 지운 게 이름 줄일 때만 (빈 줄만 있으면 그대로)
    return lines.slice(0, end).some(function () { return true; }) && lines.slice(end).some(isNames) ? lines.slice(0, end).join('\n') : part;
  }).join('');
}

// 추가 모집 공지: 옵션 인원을 모자란 수로 바꾸고 이름은 지움. 0명인 옵션 줄(바로 아래 가격 줄도), 0명인 가이드는 뺌
function noticeForMore_(desc, short) {
  const k = function (x) { return String(x || '').toLowerCase().replace(/\s+/g, ''); };
  const want = {};
  Object.keys(short).forEach(function (o) { want[k(o)] = short[o]; });
  // 구분선(-----)으로, 구분선이 없으면 상품명 줄로 상품마다 나눔 (생성기 공지는 구분선이 없음, 10/27)
  const parts = [].concat.apply([], String(desc).split(/\n\s*-{5,}\s*\n/).map(splitByProduct_));
  const multi = parts.length > 1;
  const kept = [];
  let headOnly = false;
  for (let i = 0; i < parts.length; i++) {
    const prod = multi ? (noticeProducts_(parts[i])[0] || {}).name || '' : '';
    let total = 0, header = -1;
    const lines = parts[i].split('\n'), out = [];
    const pn = ((parts[i].match(/상품명\s*[:：]\s*(.+)/) || [])[1] || '').trim();
    const cnt = function (o) { return want[k(pn + '|' + o)] || want[k([prod, o].filter(Boolean).join(' '))] || want[k(o)] || 0; };
    for (let j = 0; j < lines.length; j++) {
      const t = lines[j];
      const m = t.match(/^(\s*(?:\d+\)\s*)?(?:🐥\s*옵션\s*[:：]?\s*)?)(.*?)\s*(?:\(\s*\d*\s*명\s*\)|\d+\s*명)(.*)$/);   // (3명), (  명), 3명
      if (!m) {
        // 인원이 머리 줄('3) 5명 - 이름')에 있고 옵션 줄엔 없는 공지: 옵션 줄로 그 상품 수를 셈 (줄은 그대로, 10/27)
        const om = t.match(/^\s*🐥\s*옵션\s*[:：]\s*(.+?)\s*$/);
        if (om && !/\d\s*명/.test(om[1])) total += cnt(om[1]);
        out.push(t); continue;
      }
      // '🐥[실배송 3명 - 이름]'처럼 옵션 앞에 🐥·괄호가 붙은 줄 (10/27 치약걸이 보냉백)
      const lead = !m[1] && /^\s*🐥/.test(m[2]) ? '🐥' : '';
      const opt = m[2].replace(/^\s*🐥\s*/, '').replace(/^\[\s*/, '').trim();
      if (!opt) { header = out.length; out.push(t); continue; }   // '1) 5명' 가이드 머리
      if (/가격|원$/.test(opt)) { out.push(t); continue; }
      const c = cnt(opt);
      if (!c) { if (/^\s*🐥\s*가격/.test(lines[j + 1] || '') && ((lines[j + 1].match(/\d{1,3}(?:,\d{3})+|\d{4,}/g) || []).length === 1)) j++; continue; }
      total += c;
      out.push(m[1] + lead + opt + (/\(\s*\d*\s*명/.test(t) ? ' (' + c + '명)' : ' ' + c + '명'));   // 원래 모양 그대로 (N명) 또는 N명
    }
    if (multi && !total && i > 0) continue;
    // 첫 덩어리는 위쪽 공지(폼 링크 등)가 들어 있어서 남김. 그 안 첫 상품이 이번에 필요 없으면 상품 정보는 빼고 위쪽 공지만 (10/27)
    if (multi && !total) {
      const pi = out.findIndex(function (l) { return /상품명\s*[:：]/.test(l); });
      if (pi >= 0) { let c = pi; for (let j = pi - 1; j >= 0; j--) if (!out[j].trim()) { c = j; break; } out.splice(c); headOnly = true; if (header >= c) header = -1; }
    }
    if (header >= 0) out[header] = out[header].replace(/\d+\s*명/, total + '명');
    kept.push(out.join('\n'));
  }
  let g = 0;
  const num = kept.map(function (b) { return b.replace(/^(\s*)\d+\)/m, function (x, sp) { return sp + (++g) + ')'; }); });
  const SEP = '\n\n------------------------------------------------\n\n';
  return (headOnly ? num[0].replace(/\s+$/, '') + '\n\n' + num.slice(1).join(SEP) : num.join(SEP)).replace(/\n{3,}/g, '\n\n');
}

// 과일(자정 ~ 오전 7시): 7시에 배정에서 아직 안 산 사람을 모아 보낼 메시지함 + 메일, 7시 30분에 한 번 더 메일
function fruitCheck_(runs) {
  const hm = Number(Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'HHmm'));
  if (hm < 700 || hm > 830) return;
  const props = PropertiesService.getScriptProperties();
  const today = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyyMMdd');
  runs.forEach(function (r) {
    if (r['진행 상태'] === '종료' || !r['시트ID'] || !isFruit_(r) || !(r['진행일'] instanceof Date)) return;
    if (Utilities.formatDate(r['진행일'], CONFIG.TIMEZONE, 'yyyyMMdd') !== today) return;
    const k7 = 'NB7_' + r['시트ID'] + '_' + today, k73 = 'NB73_' + r['시트ID'] + '_' + today;
    const step = !props.getProperty(k7) ? 7 : (hm >= 730 && !props.getProperty(k73) ? 73 : 0);
    if (!step) return;
    const list = notBought_(runs, r);
    if (list === null) return;   // 배정을 아직 안 넣음
    props.setProperty(step === 7 ? k7 : k73, '1');
    if (!list.length) return;
    const names = list.map(function (x) { return x[0].split(' ').map(function (nm) { return '@' + nm; }).join(' ') + (x[1] > 1 ? ' (' + x[1] + '건)' : '') + (x[0].indexOf(' ') >= 0 ? ' - ' + x[2] : ''); });
    const me = Session.getEffectiveUser().getEmail();
    if (step === 7) {
      const msg = '📢 아직 구매 확인이 안 된 분들이에요\n' + names.join('\n') + '\n\n구매부탁드립니당! 30분까지 답장없으시면 대체할게용 ㅠ_ㅠ';   // 사용자 문구 (10/21)
      if (r['카톡방']) queueMsg_(r['카톡방'], msg, '안 산 사람');
      MailApp.sendEmail(me, '[체험단] 7시 안 산 사람 ' + list.length + '명: ' + r['명단 제목'], names.join(' ') + '\n\n카톡방에 보낼 글 (보낼 메시지함에도 있어요):\n\n' + msg + '\n\n' + outboxUrl_());
    } else {
      MailApp.sendEmail(me, '[체험단] 7시 30분 아직 안 산 사람 ' + list.length + '명: ' + r['명단 제목'], names.join(' ') + '\n\n답이 없으면 새로 구하세요. 8시 전에 구매가 끝나야 명단을 넘길 수 있어요.');
    }
  });
}

// 택배시트는 2시 전까지: 오늘 택대 진행 중 '택배 옮김' 체크가 안 된 것을 12시 30분, 1시 30분에 메일로 알림
// 포토대기 진행: 리뷰 기한(배송완료 후 7일)이 있어서 사진을 오래 기다리면 리뷰가 몰림 → 진행 2일 뒤부터 매일 한 번 '업체 사진 왔는지 사장님께 물어보세요' 메일
// 포토대기 진행: 진행일부터 2일이 지나도 업체 포토(리뷰 가이드 보냄 표시)가 없으면 사장님께 '업체에 포토 요청' 부탁 메시지 (한 번, 사용자 요청 10/21)
//  리뷰 기한이 수령 후 7일이라 사진이 늦으면 리뷰가 몰림. 한눈에 탭 '확인 필요' 칸에도 (checkFull errs)
function photoLate_(r, props) {
  if (isExpect_(r)) return false;
  if (!(r['진행일'] instanceof Date) || !(Number(r['인원']) > 0) || r['진행 상태'] === '종료') return false;
  let rv = null; try { rv = JSON.parse(props.getProperty('RV_' + r['시트ID']) || 'null'); } catch (e) {}
  const wait = /^\s*(유|y)/i.test(String(r['포토'] || '')) && !(rv && rv.kind === 'self') || (rv && (rv.kind === 'photo' || /포토\s*대기/.test(String(rv.mix || ''))));
  if (!wait) return false;
  const days = Math.round((today_().getTime() - dayStart_(r['진행일'])) / 86400000);
  return days >= 2 && days <= 9 && !props.getProperty('RVSENT_' + campKey_(r['명단 제목']) + '_' + dateTok_(r['명단 제목']));
}
function photoAskCheck_(runs) {
  const props = PropertiesService.getScriptProperties();
  runs.forEach(function (r) {
    if (!photoLate_(r, props)) return;
    const k = 'PHOTOASK_' + String(r['명단 제목']).replace(/\s+/g, '');
    if (props.getProperty(k)) return;
    props.setProperty(k, '1');
    queueMsg_('사장님', '[' + bareTitle_(r['명단 제목']) + '] 진행 2일 지났는데 업체 포토를 아직 못 받았어요. 업체에 포토 요청 부탁드립니다!', '할 일');
    note_('포토 요청 메시지 넣음: ' + bareTitle_(r['명단 제목']));
  });
}
function photoWaitCheck_(runs) {
  const hm = Number(Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'HHmm'));
  if (hm < 1000) return;
  const today = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyyMMdd');
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('PHOTOWAIT_' + today)) return;
  props.setProperty('PHOTOWAIT_' + today, '1');
  const now = today_().getTime();
  const wait = runs.filter(function (r) {
    if (!/^\s*유/.test(String(r['포토'] || '')) || !(r['진행일'] instanceof Date) || !(Number(r['인원']) > 0)) return false;
    const days = Math.round((now - dayStart_(r['진행일'])) / 86400000);
    return days >= 2 && days <= 9 && !props.getProperty('RVSENT_' + campKey_(r['명단 제목']) + '_' + dateTok_(r['명단 제목']));
  });
  if (!wait.length) return;
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), '[체험단] 포토대기 ' + wait.length + '개: 업체 사진 왔는지 사장님께 확인하세요',
    wait.map(function (r) { return '- ' + bareTitle_(r['명단 제목']) + ' (진행 ' + Math.round((now - dayStart_(r['진행일'])) / 86400000) + '일 지남, ' + (r['인원'] || 0) + '명)'; }).join('\n') +
    '\n\n리뷰는 배송완료 후 7일 안에 써야 해서 사진을 오래 기다리면 리뷰가 한꺼번에 몰려요.\n사진이 오면: 같은 배경 사진끼리 세트로 나눠서 진행 도우미 → 리뷰 배정 → 공지 종류 \'포토대기\' + 세트 수 넣기.\n사진이 사람 수만큼 세트로 안 나뉘어 있으면 업체에 다시 요청하세요.');
}

function takbaeCheck_(runs) {
  const hm = Number(Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'HHmm'));
  const step = hm >= 1330 && hm < 1400 ? 2 : hm >= 1230 && hm < 1400 ? 1 : 0;
  if (!step) return;
  const today = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyyMMdd');
  const props = PropertiesService.getScriptProperties();
  const key = 'TAKBAE_' + step + '_' + today;
  if (props.getProperty(key)) return;
  const left = runs.filter(function (r) {
    return r['택대'] === 'Y' && r['진행 상태'] !== '종료' && r['택배 옮김'] !== true && r['진행일'] instanceof Date &&
      Utilities.formatDate(r['진행일'], CONFIG.TIMEZONE, 'yyyyMMdd') === today;
  });
  props.setProperty(key, '1');
  if (!left.length) return;
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), '[체험단] 택배시트 2시까지! 아직 안 옮긴 명단 ' + left.length + '개',
    left.map(function (r) { return '- ' + r['명단 제목'] + ' (' + (r['인원'] || 0) + '/' + (r['목표인원'] || '?') + '명)'; }).join('\n') +
    '\n\n관리 시트 한눈에 탭 명단 덩어리의 A~K를 복사해서 택배시트에 붙여넣고, 위 표 \'택배 옮김\'을 체크하세요.\n택배시트: ' + (CONFIG.TAKBAE_SHEET_URL || ''));
}

// 명단 시트(업체도 봄)에 예전에 넣은 중복·금액·옵션 표시를 한 번 지움 (진행 중인 것만)
function cleanListSheetsOnce_(runs) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('CLEAN_LIST_V1')) return;
  const seen = {};
  runs.forEach(function (r) {
    if (r['진행 상태'] === '종료' || !r['시트ID'] || seen[r['시트ID']]) return;
    seen[r['시트ID']] = 1;
    try {
      const ss = SpreadsheetApp.openById(r['시트ID']);
      const lt = ss.getSheetByName(LIST_TAB);
      if (lt) {
        lt.setConditionalFormatRules([]);
        const w = lt.getLastColumn();
        if (w) {
          const notes = lt.getRange(2, 1, 1, w).getNotes()[0];
          notes.forEach(function (t, c) { if (/주황|배정 탭/.test(t)) lt.getRange(2, c + 1).clearNote(); });
        }
      }
      moveOldAssign_(ss);
    } catch (e) { note_('정리 실패 ' + r['명단 제목'] + ': ' + e); }
  });
  props.setProperty('CLEAN_LIST_V1', '1');
}

function deleteChecked_(sh) {
  const r = editRun_(sh);
  if (!r) { sh.getRange('G1').setValue('먼저 B1에서 진행을 고르세요.'); return; }
  const max = sh.getLastRow();
  if (max < 4) return;
  const rows = sh.getRange(4, 1, max - 3, 3).getValues();
  const picked = rows.filter(function (x) { return x[0] === true && x[1] instanceof Date; }).map(function (x) { return x[1]; });
  if (!picked.length) { sh.getRange('G1').setValue('A열에서 지울 사람을 먼저 체크하세요.'); return; }
  loadEditTab_(sh, deleteRunTimes_(r, picked));
}

// 이 진행 폼에서 고른 시각의 응답을 폼과 명단 시트에서 지움. 결과 문구를 돌려줌
function deleteRunTimes_(r, dates) {
  const picked = dates.map(function (d) { return [null, d instanceof Date ? d : new Date(Number(d))]; });
  const near = function (a, b) { return Math.abs(a.getTime() - b.getTime()) < 1500; };
  // 1) 폼 응답 삭제 + 2) 응답 탭 행 삭제: 이 명단 시트에 연결된 폼 전부에서 (다른 날 폼으로 낸 응답도 지워지게)
  const form = FormApp.openById(r['폼ID']);
  const lss = SpreadsheetApp.openById(r['시트ID']);
  lss.getSheets().filter(function (t) { return !!t.getFormUrl(); }).forEach(function (raw) {
    const ts = raw.getRange(2, 1, Math.max(raw.getLastRow() - 1, 1), 1).getValues();
    const rows = [];
    ts.forEach(function (v, i) { if (v[0] instanceof Date && picked.some(function (x) { return near(v[0], x[1]); })) rows.push(i + 2); });
    if (!rows.length) return;
    let f = null;
    const m = String(raw.getFormUrl()).match(/\/forms\/d\/([-\w]{25,})/);
    try { f = m && m[1] === String(r['폼ID']) ? form : (m ? FormApp.openById(m[1]) : FormApp.openByUrl(raw.getFormUrl())); } catch (e) { f = null; }
    if (f) {
      const resps = f.getResponses();
      picked.forEach(function (x) { const hit = resps.filter(function (fr) { return near(fr.getTimestamp(), x[1]); })[0]; if (hit) f.deleteResponse(hit.getId()); });
    }
    rows.reverse().forEach(function (row) { raw.deleteRow(row); });
  });
  // 값 명단 탭에서도 그 응답 줄을 지움 (진행 도우미·폼수정에서 일부러 지운 것이라)
  try {
    const lt = lss.getSheetByName(LIST_TAB);
    if (lt && PropertiesService.getScriptProperties().getProperty('LISTV_' + lss.getId()) && lt.getLastRow() >= 3) {
      const hd = lt.getRange(2, 1, 1, Math.max(lt.getLastColumn(), 1)).getValues()[0].map(function (x) { return String(x).trim(); });
      const cT = hd.indexOf('타임스탬프') + 1;
      if (cT) {
        const tv = lt.getRange(3, cT, lt.getLastRow() - 2, 1).getValues(), del = [];
        tv.forEach(function (v, i) { if (v[0] instanceof Date && picked.some(function (x) { return near(v[0], x[1]); })) del.push(i + 3); });
        del.reverse().forEach(function (row) { lt.deleteRow(row); });
      }
    }
  } catch (e) { note_('명단 탭 줄 지우기 실패: ' + e); }
  // 3) 인원 갱신, 모자라면 폼 다시 열기 (그날 받는 기간 안이면 구매 시간이 지났어도: 조금 늦게 사는 사람도 있어서, 사용자 요청 10/20)
  const runs = readRuns_();
  const me = runs.filter(function (x) { return x.row === r.row; })[0] || r;
  const n = runCount_(runs, me);
  setRun_(r.row, '인원', n);
  let reopened = '';
  if (r['목표인원'] && n < Number(r['목표인원']) && !form.isAcceptingResponses() && !runOver_(runs, me)) {
    form.setAcceptingResponses(true);
    setRun_(r.row, '마감 시각', '');
    reopened = ' 인원이 모자라서 폼을 다시 열었어요.';
  }
  const short = Number(r['목표인원']) - n;
  try { buildDashboard_(false); } catch (e) {}
  return picked.length + '명 지웠어요 (지금 ' + n + '명).' + reopened + (!reopened && short > 0 ? ' ' + short + '명 모자라요. 내일 추가 모집을 만들 수 있어요.' : '');
}

/* ---------------- 8) 여러 날 진행: 다음 일차 자동 만들기 ---------------- */
// 1일차를 만들 때 생성기가 보낸 계획(일차, 날짜, 건수, 옵션 인원)을 '일정' 탭에 저장
// 15분마다(checkFull) 진행일 0시가 되면 그 일차 폼, 시트, 공지를 만듦 (10/23부터. 예전: 전날 10시)
// 만들면 메일 + 보낼 메시지함(그날 방제의 카톡방)으로 공지가 감

const PLAN_TAB = '일정';
const PLAN_HEAD = ['ID', '캠페인', '일차', '진행일', '방제', '명단 제목', '건수', '인원', '상태', '설정'];
const NOTICE_SEP = '\n\n------------------------------------------------\n\n';

function planSheet_() {
  const ss = adminSs_();
  let sh = ss.getSheetByName(PLAN_TAB);
  if (!sh) {
    sh = ss.insertSheet(PLAN_TAB);
    sh.getRange(1, 1, 1, PLAN_HEAD.length).setValues([PLAN_HEAD]).setFontWeight('bold').setBackground('#efe6f7');
    sh.setFrozenRows(1);
    sh.getRange('D:D').setNumberFormat('yyyy-mm-dd');
    sh.setColumnWidth(10, 80);
  }
  // (10/20) 숨겨 두던 탭을 보이게: 아직 안 만든 다음 일차 날짜를 직접 고칠 수 있게. 스크립트용 칸(ID, 옵션 인원, 설정)만 숨김
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('PLAN_SHOWN_V1')) {
    props.setProperty('PLAN_SHOWN_V1', '1');
    try {
      sh.showSheet();
      sh.hideColumns(1); sh.hideColumns(8); sh.hideColumns(10);
      sh.setColumnWidth(5, 220); sh.setColumnWidth(6, 260);
      sh.getRange('D1').setNote('아직 안 만든 다음 일차의 진행일. 고치면 그 날짜로 만들어져요 (방제 날짜도 맞춰짐). 상태가 "대기"인 줄만 해당');
      sh.setTabColor('#93c47d');
    } catch (e) {}
  }
  return sh;
}

function savePlan_(d) {
  const plan = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(d.plan)).getDataAsString('UTF-8'));
  if (!plan.length) return;
  const camp = campOf_(d.title);
  // 다음 일차 공지 틀에는 오늘 살 사람 이름을 빼고 저장 (화이트 (2명) 김민희 → 화이트 (2명))
  const tpl = stripNames_(d.desc);
  const cfg = JSON.stringify({ type: d.type, takdae: !!d.takdae, realship: !!d.realship, platform: d.platform, prices: d.prices,
    croom: d.croom, shop: d.shop, photo: d.photo, opts: d.opts, desc: tpl, slot2: d.slot2 || '자정 ~ 오전 8시 20분 구매', total: d.total, camp: camp, base: d.n });
  const sh = planSheet_();
  plan.forEach(function (x) {
    sh.appendRow([String(d.n || camp) + '-' + x.k, camp, x.k, new Date(x.date + 'T00:00:00'), x.room, x.title, x.n, JSON.stringify(x.c), '대기', cfg]);
  });
}

// 1일차 공지(폼 링크 넣기 전)에서 맨 윗줄, 가이드 머리 인원 "1) 5명", 옵션 인원 "(3명)"만 그 일차 값으로 바꿈
function adjustNotice_(tpl, counts, slot2) {
  // 상품 구분선(---- 또는 ———)으로 나눔. 구분선 글자가 조금 달라도 (10/21 오즈네즈 2일차가 1일차 인원 그대로 나온 것)
  const parts = String(tpl).split(/(\n\s*[-—─_]{10,}\s*\n)/);
  const blocks = parts.filter(function (x, i) { return i % 2 === 0; }), seps = parts.filter(function (x, i) { return i % 2 === 1; });
  const multi = blocks.length > 1;
  const out = blocks.map(function (b, i) {
    const c = counts[i];
    if (!c) return b;
    // 옵션 이름 목록이 있으면 옵션 줄을 그날 인원으로 다시 씀 (0명 옵션은 빼고, 앞 일차에 0명이라 빠진 옵션도 다시 넣음)
    let rebuilt = false;
    if (c[3] && c[1] && c[3].length === c[1].length) {
      rebuilt = true;
      const ol = c[3].map(function (l, j) { return Number(c[1][j]) > 0 ? l + ' (' + c[1][j] + '명)' : null; }).filter(Boolean).join('\n');
      b = b.replace(/(🐥옵션 *: *)[\s\S]*?(?=\n\s*🐥가격)/, function (m0, h) { return h + ol; });
    }
    if (multi) b = b.replace(new RegExp('^' + (i + 1) + '\\) *\\d*명?', 'm'), (i + 1) + ') ' + c[0] + '명');
    let k = 0;
    if (!rebuilt) b = b.replace(/\(\s*\d*\s*명\)/g, function () { const v = (c[1] || [])[k++]; return '(' + (v === undefined || v === null ? '  ' : v) + '명)'; });
    // 리뷰 종류를 날마다 고르게 나눈 줄 (생성기가 일차마다 계산해서 넘김)
    if (c[2]) b = b.replace(/^(🐥)?리뷰 배정 *:.*$/m, function (m0, d) { return (d || '') + '리뷰 배정 : ' + c[2]; });
    return b;
  }).map(function (b, i) { return b + (i < seps.length ? seps[i] : ''); }).join('').split('\n');
  out[0] = slot2;
  return out.join('\n');
}

function makeDueDays_() {
  const sh = planSheet_();
  const last = sh.getLastRow();
  if (last < 2) return;
  const rows = sh.getRange(2, 1, last - 1, PLAN_HEAD.length).getValues();
  const runs = readRuns_();
  const now = new Date();
  rows.forEach(function (x, i) {
    if (x[8] !== '대기') return;
    const cfg = JSON.parse(x[9]);
    const k = Number(x[2]);
    // 이 캠페인이 이미 총건수만큼 진행됐으면(직접 다음 일차를 만든 경우 등) 만들지 않음
    const ck = campKey_(x[1]);
    // 이 계획을 만든 1일차 진행(요청ID)의 의뢰로 (같은 이름의 다른 의뢰서와 섞이지 않게)
    const baseRun = cfg.base ? runs.filter(function (r) { return String(r['요청ID']) === String(cfg.base); })[0] : null;
    const chain = baseRun ? chainsOf_(runs).filter(function (c) { return c.runs.indexOf(baseRun) >= 0; })[0]
      : chainsOf_(runs).filter(function (c) { return c.key === ck; }).pop();
    if (chain && chain.total && chain.done >= chain.total) { sh.getRange(i + 2, 9).setValue('건너뜀 (이미 다 진행)'); return; }
    const sameDay = function (d0) { return chain ? chain.runs.filter(function (r) { return r['진행일'] instanceof Date && Utilities.formatDate(r['진행일'], CONFIG.TIMEZONE, 'yyyyMMdd') === Utilities.formatDate(new Date(d0), CONFIG.TIMEZONE, 'yyyyMMdd'); })[0] : null; };
    const clash = sameDay(x[3]);
    if (clash && Number(clash['일차']) === k) { sh.getRange(i + 2, 9).setValue('건너뜀 (그날 진행 있음)'); return; }
    // 다른 일차가 그날에 있으면(날짜를 옮겨서 겹침) 빈 진행일로 미룸 (10/20)
    if (clash) { let nd = nextWorkday_(new Date(x[3])); while (sameDay(nd)) nd = nextWorkday_(nd); x[3] = nd; sh.getRange(i + 2, 4).setValue(nd); }
    const prev = chain ? chain.runs[chain.runs.length - 1] : null;
    // 계획 날짜가 주말·공휴일이면 다음 진행일로 미룸 (방제·명단 제목 날짜도)
    const day0 = new Date(x[3]), dayW = cfg.platform === '기대평' ? new Date(dayStart_(day0)) : workdayOnOrAfter_(day0);   // 기대평은 주말에도 (구매·배송 없음)
    if (dayW.getTime() !== dayStart_(day0) || (dateTok_(x[5]) && dateTok_(x[5]) !== (dayW.getMonth() + 1) + '.' + dayW.getDate())) {   // 주말이라 미뤘거나 일정 탭에서 날짜를 직접 고침
      x[3] = dayW; x[4] = retitleDate_(x[4], dayW); x[5] = retitleDate_(x[5], dayW);
      sh.getRange(i + 2, 4, 1, 3).setValues([[dayW, x[4], x[5]]]);
    }
    // 전 진행일 0시에 만듦 (사용자 요청 10/24: 월요일 진행이면 금요일 0시. 0시 예약 확인이 바로 만듦)
    const due = new Date(dayW); due.setHours(12, 0, 0, 0);
    do { due.setDate(due.getDate() - 1); } while (!isWorkday_(due));
    due.setHours(0, 0, 0, 0);
    if (now < due) return;
    locked_(function () {
      if (findRunByRequest_(x[0])) { sh.getRange(i + 2, 9).setValue('생성됨'); return; }
      const dateIso = Utilities.formatDate(new Date(x[3]), CONFIG.TIMEZONE, 'yyyy-MM-dd');
      const exp = cfg.platform === '기대평';   // 기대평 공지는 시간 줄·인원 줄 없이 그대로
      const desc = exp ? cfg.desc : adjustNotice_(stripNames_(cfg.desc), JSON.parse(x[7]), cfg.slot2);   // 예전에 저장한 틀에 이름이 남아 있어도 빼고
      const res = createRunInner_({
        k: CONFIG.KEY, n: x[0], title: x[5], room: x[4], fname: x[4], camp: cfg.camp, day: k, total: cfg.total,
        daily: String(x[6]), date: dateIso, desc: desc, type: cfg.type, takdae: cfg.takdae, realship: cfg.realship,
        platform: cfg.platform, prices: cfg.prices, croom: cfg.croom, opts: cfg.opts, shop: cfg.shop, photo: cfg.photo, slot: exp ? (/백발백중/.test(String(cfg.camp)) ? '자정 ~ 오전 8시 20분' : '') : cfg.slot2,   // 백발백중 기대평 진행시간 (사용자 요청 10/27)
        reuse: baseRun && baseRun['폼ID'] ? baseRun : undefined, sheetId: baseRun ? baseRun['시트ID'] : undefined
      });
      sh.getRange(i + 2, 9).setValue('생성됨');
      MailApp.sendEmail(Session.getEffectiveUser().getEmail(), '[체험단] ' + k + '일차 준비됐어요: ' + x[4], [
        x[4] + ' (' + k + '일차, ' + x[6] + '건)',
        '카톡방을 이 방제로 만들고 아래 공지를 올리세요. 보낼 메시지함에도 들어가 있어요.',
        '',
        res.notice,
        '',
        '[명단방 문구 (폼 명단 다 받으면)]',
        res.sheetUrl + '\n\n' + x[5],
        '',
        '보낼 메시지함: ' + outboxUrl_()
      ].join('\n'));
    }, 60000);
  });
}

/* ---------------- 9) 월급시트 자동 채우기 ---------------- */
// 진행(날짜)마다 한 줄 (사용자 시트 모양):
//  캠페인명 = 명단 제목에서 닉네임 뺀 것 (예: #10.15 고구마말랭이 10)
//  계약 수량 = 그날 명단 시트 링크 (글자는 시트 이름)
//  총액 = 그날 시작할 때 남은 총 건수 (총 50, 하루 10이면 1일차 50, 2일차 40, 3일차 30...)
//  날짜 칸(예: '10월 15' 아래 '수량') = 그날 신청 인원
// 머리글 글자로 칸을 찾고, 값만 넣음 (서식, 수식 칸은 안 건드림)

function payTab_(month, noCreate) {
  const ss = SpreadsheetApp.openById(CONFIG.PAY_SHEET_ID);
  // 같은 달 이름 탭이 여럿이면(작년 1월 탭 등) 날짜 칸의 연도가 맞는 탭
  const want = payYear_(month);
  //  탭 이름에 'N월'이 없으면(예: 오리방) 머리글 위 날짜 칸의 달로 봄
  const byName = ss.getSheets().filter(function (s) {
    if (new RegExp('(^|\\D)' + month + '월').test(s.getName())) { const y = tabYear_(s); return y === null || y === want; }
    if (/(^|\D)\d{1,2}월/.test(s.getName())) return false;
    const ym = tabYM_(s); return !!ym && ym.m === month && ym.y === want;
  })[0];
  if (byName) return byName;
  // 이번 달·다음 달 탭이 없으면 지난달 탭을 복사해서 새로 만듦 (사용자 요청 10/18). 다른 달 진행이 엉뚱한 탭에 들어가지 않게
  const cur = new Date().getMonth() + 1;
  if (!noCreate && (month === cur || month === cur % 12 + 1)) {
    try { const t = newMonthTab_(ss, month); if (t) return t; } catch (e) { note_('월급시트 ' + month + '월 탭 만들기 실패: ' + e); }
  }
  return byName || ss.getSheets().filter(function (s) { return s.getSheetId() === CONFIG.PAY_TAB_GID; })[0] || ss.getSheets()[0];
}

// 탭 달의 연도: 지금보다 6달 넘게 앞 달이면 내년 (12월에 만드는 1월 탭)
//  (1월에 보는 12월 탭은 작년)
function payYear_(month) { const now = new Date(), cur = now.getMonth() + 1; return now.getFullYear() + (month < cur - 6 ? 1 : month > cur + 6 ? -1 : 0); }
// 탭의 연도: 머리글 위쪽 날짜 칸에서 처음 나오는 날짜의 연도 (없으면 null)
function tabYear_(sh) { const ym = tabYM_(sh); return ym ? ym.y : null; }
// 탭의 연·월: 머리글 위쪽 날짜 칸에서 처음 나오는 날짜 (없으면 null)
function tabYM_(sh) {
  const memo = globalThis.__TABYEAR = globalThis.__TABYEAR || {};
  if (memo[sh.getSheetId()] !== undefined) return memo[sh.getSheetId()];
  let y = null;
  try {
    const v = sh.getRange(1, 1, Math.min(Math.max(sh.getLastRow(), 1), 5), Math.min(Math.max(sh.getLastColumn(), 1), 120)).getValues();
    // 진행일 칸(줄마다 날짜)은 빼고 머리글 위 날짜 칸만
    let skip = -1;
    v.forEach(function (row) { row.forEach(function (x, c) { if (/^진행일(자)?$/.test(String(x).replace(/\s/g, ''))) skip = c; }); });
    v.some(function (row) { return row.some(function (x, c) { if (c !== skip && x instanceof Date) { y = { y: x.getFullYear(), m: x.getMonth() + 1 }; return true; } return false; }); });
    // 날짜가 글자(10월 01일)로 적힌 탭: 연도는 지금 기준
    if (!y) v.some(function (row) { return row.some(function (x, c) { const m = c !== skip && String(x).trim().match(/^(\d{1,2})\s*월\s*\d{1,2}\s*일/); if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) { y = { y: payYear_(Number(m[1])), m: Number(m[1]) }; return true; } return false; }); });
  } catch (e) {}
  return (memo[sh.getSheetId()] = y);
}

// 새 달 탭: 지난달 탭 복사 → 이름의 달 바꾸기 → 줄 내용 비우기(수식은 두고, 남은·상태 수식은 원래 모양으로, 완료보고 체크 해제) → 날짜 칸을 새 달 1일부터
function newMonthTab_(ss, month) {
  const prevM = (month + 10) % 12 + 1;
  const src = payTab_(prevM, true);
  if (!src) return null;
  // 이름에 'N월'이 없는 탭은 머리글 날짜가 지난달일 때만 복사 (이번 달 탭을 이번 달로 또 복사하지 않게)
  if (!new RegExp('(^|\\D)' + prevM + '월').test(src.getName())) { const ym = tabYM_(src); if (!ym || ym.m !== prevM) return null; }
  const year = payYear_(month);
  // 지난달 탭 이름에 'N월'이 있으면 그 자리만 바꾸고, 없으면(예: 시트1) 'M월'
  let name = new RegExp('(^|\\D)' + prevM + '월').test(src.getName())
    ? src.getName().replace(new RegExp('(^|\\D)' + prevM + '월'), function (m, a) { return a + month + '월'; })
    : month + '월';
  if (month === 1) name = name.replace(/20\d{2}/, function (y) { return String(Number(y) + 1); });
  // 같은 이름 탭(작년 것)이 있으면 연도를 앞에 붙임: 2027년 1월
  if (ss.getSheets().some(function (x) { return x.getName() === name; })) name = year + '년 ' + name;
  const sh = src.copyTo(ss).setName(name);
  ss.setActiveSheet(sh); ss.moveActiveSheet(src.getIndex() + 1);
  const L = payLayout_(sh);
  if (!L) return sh;
  const last = sh.getLastRow(), lc = sh.getLastColumn();
  if (last > L.head) {
    const rg = sh.getRange(L.head + 1, 1, last - L.head, lc), fs = rg.getFormulas(), vs = rg.getValues();
    rg.setValues(fs.map(function (row, i) {
      return row.map(function (f, c) {
        if (!f) return typeof vs[i][c] === 'boolean' ? false : '';
        if (c + 1 === L.left) return f.replace(/^(=[A-Z]+\d+-[A-Z]+\d+-[A-Z]+\d+)-\d+$/, '$1');
        if (c + 1 === L.status) return f.replace(/IF\(\s*OR\(\s*([A-Z]+\d+)\s*=\s*0\s*,\s*[A-Z]+\d+\s*=\s*0\s*\)/, 'IF($1=0');
        return f;
      });
    }));
  }
  // 날짜 칸: 왼쪽부터 1일, 2일 … (수식으로 이어진 칸은 그대로 두면 따라 바뀜). 그 달에 없는 날(11월 31일)은 비움
  const dim = new Date(year, month, 0).getDate(), p2 = function (n, w) { return w === 2 ? ('0' + n).slice(-2) : String(n); };
  const cols = Object.keys(L.days).map(function (k) { return L.days[k]; }).filter(function (c, i, a) { return a.indexOf(c) === i; }).sort(function (a, b) { return a - b; });
  cols.forEach(function (c, i) {
    const d = i + 1;
    [L.head - 1, L.head - 2].forEach(function (r) {
      if (r < 1) return;
      const cell = sh.getRange(r, c);
      if (cell.getFormula()) return;
      const v = cell.getValue();
      if (v instanceof Date) cell.setValue(d <= dim ? new Date(year, month - 1, d) : '');
      else if (/^\s*\d{1,2}\s*[\/.\-월]\s*\d{1,2}/.test(String(v))) cell.setValue(d <= dim ? String(v).replace(/^(\s*)(\d{1,2})(\s*[\/.\-월]\s*)(\d{1,2})/, function (m, s0, a, sep, b) { return s0 + p2(month, a.length) + sep + p2(d, b.length); }) : '');
    });
  });
  globalThis.__TABYEAR = {};
  // 이 탭은 스크립트가 만든 탭이라 지난달 안 끝난 캠페인 '이월' 줄을 넣어도 됨 (손으로 만든 탭에는 안 넣음)
  PropertiesService.getScriptProperties().setProperty('PAYCARRY_' + sh.getSheetId(), '1');
  note_('✓ 월급시트 ' + name + ' 탭을 만들었어요 (' + src.getName() + ' 복사)');
  return sh;
}

// 지난달에 시작해서 아직 안 끝난 캠페인: 이번 달에 진행이 아직 없으면 '이월' 줄로 (총액 = 총건수, 전월 = 지난달까지 한 수량 → 남은 = 남은 캠페인 수량)
//  이번 달 첫 진행이 생기면 그 진행 줄이 이 이월 줄을 그대로 씀(writePayRow_)
function payCarry_(all, month) {
  const sh = payTab_(month, true);
  if (!sh || !new RegExp('(^|\\D)' + month + '월').test(sh.getName())) return;
  if (!PropertiesService.getScriptProperties().getProperty('PAYCARRY_' + sh.getSheetId())) return;
  const L = payLayout_(sh);
  if (!L || !L.note) return;
  const year = payYear_(month), start = new Date(year, month - 1, 1), end = new Date(year, month, 1), prevStart = new Date(year, month - 2, 1);
  const got = function (x) { return x['인원'] === '' || x['인원'] === null ? (Number(x['목표인원']) || 0) : Number(x['인원']) || 0; };
  const read = function () { const last = Math.max(sh.getLastRow(), L.head + 1); return { names: sh.getRange(L.head + 1, L.name, last - L.head, 1).getValues().map(function (x) { return String(x[0]); }), notes: sh.getRange(L.head + 1, L.note, last - L.head, 1).getValues().map(function (x) { return String(x[0]); }) }; };
  let t = read();
  chainsOf_(all).forEach(function (c) {
    if (!c.total) return;
    const before = c.runs.filter(function (r) { return r['진행일'] < start; });
    if (!before.length || c.runs.some(function (r) { return r['진행일'] >= start && r['진행일'] < end; })) return;
    const lastRun = before[before.length - 1];
    if (lastRun['진행일'] < prevStart) return;   // 지난달에 진행이 있던 것만 (오래 멈춘 캠페인은 안 넘김)
    const done = before.reduce(function (a, x) { return a + got(x); }, 0);
    if (done >= c.total) return;
    let i = t.names.findIndex(function (nm, k) { return nm && /이월/.test(t.notes[k]) && campKey_(nm) === c.key; });
    if (i === -1) i = t.names.findIndex(function (nm) { return !nm.trim(); });
    const row = i === -1 ? Math.max(sh.getLastRow(), L.head) + 1 : L.head + 1 + i;
    const set = function (col, val) { if (col && !sh.getRange(row, col).getFormula() && sh.getRange(row, col).getValue() !== val) sh.getRange(row, col).setValue(val); };
    set(L.name, campOf_(lastRun['캠페인'] || lastRun['명단 제목']) || campOf_(lastRun['명단 제목']));
    set(L.note, '이월 (' + Utilities.formatDate(lastRun['진행일'], CONFIG.TIMEZONE, 'M/d') + '까지 ' + done + '건)');
    set(L.store, String(lastRun['업체'] || '').replace(/\s+/g, ''));
    set(L.sum, c.total);
    set(L.prev, done);
    if (L.qty && lastRun['시트ID'] && !sh.getRange(row, L.qty).getValue()) {
      const url = 'https://docs.google.com/spreadsheets/d/' + lastRun['시트ID'] + '/edit';
      if (!putFileChip_(sh, row, L.qty, url)) sh.getRange(row, L.qty).setRichTextValue(SpreadsheetApp.newRichTextValue().setText(url).setLinkUrl(url).build());
    }
    t = read();
  });
}

// 이번 달 탭(이름에 'N월'이 없어도 지금 쓰는 탭) + 이미 만들어진 다음 달 탭
function payTabsNow_() {
  const m1 = new Date().getMonth() + 1, m2 = m1 % 12 + 1, out = [];
  const t1 = payTab_(m1, true), t2 = payTab_(m2, true);
  if (t1) out.push(t1);
  if (t2 && (!t1 || t2.getSheetId() !== t1.getSheetId()) && new RegExp('(^|\\D)' + m2 + '월').test(t2.getName())) out.push(t2);
  return out;
}

// 스토어 왼쪽에 '진행일' 칸을 끼움 (오른쪽 칸 수식은 구글 시트가 알아서 따라 바뀜). 서식은 스토어 칸 것을 그대로
function payDateCol_(sh) {
  const L = payLayout_(sh);
  if (!L || L.date || !L.store) return;
  sh.insertColumnBefore(L.store);
  const mr = sh.getMaxRows();
  sh.getRange(1, L.store + 1, mr, 1).copyTo(sh.getRange(1, L.store, mr, 1), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  sh.getRange(1, L.store, L.head - 1, 1).clearContent();
  if (mr > L.head) sh.getRange(L.head + 1, L.store, mr - L.head, 1).clearContent().setNumberFormat('M/d').setHorizontalAlignment('center');
  sh.getRange(L.head, L.store).setValue('진행일');
  sh.setColumnWidth(L.store, 70);
  globalThis.__TABYEAR = {};
  note_('✓ 월급시트 ' + sh.getName() + ': 스토어 왼쪽에 진행일 칸을 넣었어요');
}

// 진행일 칸이 비었으면 캠페인명의 날짜(#10.14 …)로 채우고, 줄을 진행일 순서로 (빠른 날이 위)
//  줄 통째로 옮겨서(moveRows) 칩·체크·수식이 같이 움직임. 날짜 없는 줄(이월 등)은 맨 위, 빈 줄은 맨 아래. 이미 순서대로면 아무것도 안 함
function payOrder_(sh) {
  const L = payLayout_(sh);
  if (!L || !L.date) return;
  const last = sh.getLastRow(), n = last - L.head;
  if (n < 2) return;
  const base = L.head + 1, year = tabYear_(sh) || new Date().getFullYear();
  const names = sh.getRange(base, L.name, n, 1).getValues().map(function (x) { return String(x[0]).trim(); });
  const dr = sh.getRange(base, L.date, n, 1), dv = dr.getValues(), df = dr.getFormulas();
  let fill = false;
  const dates = dv.map(function (x, i) {
    if (x[0] instanceof Date) return x[0];
    if (df[i][0] || !names[i]) return null;
    const m = names[i].match(/(\d{1,2})\.(\d{1,2})/);
    if (!m) return null;
    const d = new Date(year, Number(m[1]) - 1, Number(m[2]));
    dv[i][0] = d; fill = true;
    return d;
  });
  if (fill) dr.setValues(dv.map(function (x, i) { return df[i][0] ? [df[i][0]] : x; })).setNumberFormat('M/d');
  // 이름이 없는 줄은 맨 아래, 이름은 있는데 날짜가 없으면 맨 위, 나머지는 날짜순 (같은 날은 지금 순서)
  const key = function (i) { return !names[i] ? Infinity : dates[i] ? dates[i].getTime() : -Infinity; };
  const want = names.map(function (_, i) { return i; }).sort(function (a, b) { return key(a) - key(b) || a - b; });
  if (want.every(function (x, i) { return x === i; })) return;
  // 위쪽 합계 수식(진행비 총액, 금일 진행비 =SUM(X5:X) 등)은 줄을 옮겨도 그대로 (5행 앞에 줄이 들어가면 X6:X로 밀리는 것 막음)
  const top = sh.getRange(1, 1, L.head, sh.getLastColumn()), topF = top.getFormulas();
  const cur = names.map(function (_, i) { return i; });
  let moved = 0;
  // 줄 하나 옮길 때마다 위쪽 수식을 되돌림 (6분 제한에 걸려 중간에 멈춰도 합계가 밀린 채로 남지 않게). 시간이 모자라면 다음 확인 때 이어서
  const restore = function () { const now = top.getFormulas(); topF.forEach(function (row, r) { row.forEach(function (f, c) { if (f && now[r][c] !== f) sh.getRange(r + 1, c + 1).setFormula(f); }); }); };
  want.some(function (id, p) {
    if (late_(320)) return true;
    const j = cur.indexOf(id);
    if (j === p) return false;
    sh.moveRows(sh.getRange((base + j) + ':' + (base + j)), base + p);
    if (p === 0) restore();   // 맨 윗줄 앞에 넣을 때만 합계 범위(X5:X)가 밀림
    cur.splice(j, 1); cur.splice(p, 0, id); moved++;
    return false;
  });
  if (moved) restore();
  if (moved) note_('✓ 월급시트 ' + sh.getName() + ': 진행일 순서로 ' + moved + '줄 옮김');
}

// 날짜순으로 섞여도 같은 캠페인을 알아보게 캠페인명 칸에 캠페인마다 다른 연한 색 (사용자 선택 10/19)
//  색은 탭마다 캠페인 처음 나온 순서로 정해서 저장(PAYCOLOR_<탭ID>) → 줄이 옮겨지거나 새 진행이 생겨도 같은 색. 빈 줄은 옆 스토어 칸 색
const PAY_CAMP_COLORS = ['#d9ead3', '#cfe2f3', '#ead1dc', '#d9d2e9', '#fce5cd', '#d0e0e3', '#f4cccc', '#c9daf8', '#b6d7a8', '#f9cb9c', '#a2c4c9', '#b4a7d6'];
function payColors_(sh) {
  const L = payLayout_(sh);
  if (!L || !L.name) return;
  const last = sh.getLastRow(), n = last - L.head;
  if (n < 1) return;
  const props = PropertiesService.getScriptProperties(), pk = 'PAYCOLOR_' + sh.getSheetId();
  let map = {}; try { map = JSON.parse(props.getProperty(pk) || '{}'); } catch (e) {}
  const names = sh.getRange(L.head + 1, L.name, n, 1).getValues().map(function (x) { return String(x[0]).trim(); });
  const rg = sh.getRange(L.head + 1, L.name, n, 1), cur = rg.getBackgrounds();
  const base = L.store ? sh.getRange(L.head + 1, L.store, n, 1).getBackgrounds() : cur;
  let added = false;
  const want = names.map(function (nm, i) {
    if (!nm) return [base[i][0]];
    const k = campKey_(nm) || nm;
    if (map[k] === undefined) { map[k] = Object.keys(map).length % PAY_CAMP_COLORS.length; added = true; }
    return [PAY_CAMP_COLORS[map[k]]];
  });
  if (added) props.setProperty(pk, JSON.stringify(map));
  if (want.some(function (w, i) { return String(w[0]).toLowerCase() !== String(cur[i][0]).toLowerCase(); })) rg.setBackgrounds(want);
  // 오늘 진행하는 줄은 진행일~계약 수량 글자를 빨간색으로 (사용자 요청 10/20, 굵게는 빼고). 탭마다 한 번 (지우면 다시 안 넣음)
  //  상태 칸 색 규칙과 겹치지 않게 계약 수량까지만, 규칙 목록 맨 뒤에. 먼저 넣었던 빨간 굵은 글씨 규칙(=$B5=TODAY())은 빼고 새로
  try {
    const tk = 'PAYTODAY2_' + sh.getSheetId();
    if (L.date && !props.getProperty(tk)) {
      const f0 = '=$' + colLetter_(L.date) + (L.head + 1) + '=TODAY()';
      const keep = sh.getConditionalFormatRules().filter(function (r) { try { const b = r.getBooleanCondition(); return !(b && String(b.getCriteriaValues()[0] || '').replace(/\s/g, '') === f0); } catch (e) { return true; } });
      const endC = Math.max(L.qty || L.name, L.name), rows = sh.getMaxRows() - L.head;
      const rule = SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(f0)
        .setFontColor('#d00000').setRanges([sh.getRange(L.head + 1, L.date, rows, endC - L.date + 1)]).build();
      sh.setConditionalFormatRules(keep.concat([rule]));
      props.setProperty(tk, '1');
    }
  } catch (e) { note_('월급시트 오늘 빨간 글씨 실패: ' + e); }
  // 상태 칸 색(진행중 청록, 완료 주황)이 오늘 빨간 글씨 규칙을 넣을 때 같이 사라져서(10/21) 다시. 탭마다 한 번, 규칙 목록 맨 앞에
  try {
    const sk = 'PAYSTATUS1_' + sh.getSheetId();
    if (L.status && !props.getProperty(sk)) {
      const rg = sh.getRange(L.head + 1, L.status, sh.getMaxRows() - L.head, 1);
      const mk = function (t, bg, fc) { return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(t).setBackground(bg).setFontColor(fc).setRanges([rg]).build(); };
      sh.setConditionalFormatRules([mk('진행중', '#46bdc6', '#000000'), mk('완료', '#ff6d01', '#000000')].concat(sh.getConditionalFormatRules()));
      props.setProperty(sk, '1');
    }
  } catch (e) { note_('월급시트 상태 색 실패: ' + e); }
}

function payLayout_(sh) {
  const rows = Math.min(sh.getLastRow(), 15), cols = sh.getLastColumn();
  if (rows < 1 || cols < 1) return null;
  const v = sh.getRange(1, 1, rows, cols).getValues();
  const L = { days: {} };
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const t = String(v[r][c]).replace(/\s/g, '');
    if (!L.name && /캠페인/.test(t)) { L.head = r + 1; L.name = c + 1; }
  }
  if (!L.name) return null;
  // 계약 수량, 총액은 캠페인명과 같은 머리글 줄에서만 찾음 (위쪽 '진행비 총액' 같은 칸과 헷갈리지 않게)
  for (let c = 0; c < cols; c++) {
    const t = String(v[L.head - 1][c]).replace(/\s/g, '');
    if (!L.qty && /계약/.test(t)) L.qty = c + 1;
    if (!L.sum && /^총액$|총진행/.test(t)) L.sum = c + 1;
    if (!L.store && /스토어/.test(t)) L.store = c + 1;
    if (!L.time && /진행시간/.test(t)) L.time = c + 1;
    if (!L.note && /특이사항/.test(t)) L.note = c + 1;
    if (!L.prev && /^전월$/.test(t)) L.prev = c + 1;
    if (!L.left && /^남은$/.test(t)) L.left = c + 1;
    if (!L.status && /^상태$/.test(t)) L.status = c + 1;
    if (!L.report && /완료보고/.test(t)) L.report = c + 1;
    if (!L.date && /^진행일(자)?$/.test(t)) L.date = c + 1;
  }
  // 날짜 칸: 머리글 줄과 그 위 줄에서 찾음
  [L.head - 1, L.head - 2].forEach(function (r) {
    if (r < 0) return;
    for (let c = 0; c < cols; c++) {
      if (c + 1 === L.name || c + 1 === L.qty || c + 1 === L.sum) continue;
      const x = v[r][c];
      let key = '';
      if (x instanceof Date) key = (x.getMonth() + 1) + '-' + x.getDate();
      else {
        const t = String(x).trim(); let m;
        if ((m = t.match(/^(\d{1,2})\s*[\/.\-월]\s*(\d{1,2})/))) key = Number(m[1]) + '-' + Number(m[2]);
        else if ((m = t.match(/^(\d{1,2})\s*일?$/)) && Number(m[1]) >= 1 && Number(m[1]) <= 31) key = String(Number(m[1]));
      }
      if (key && !L.days[key]) L.days[key] = c + 1;
    }
  });
  return L;
}

// resumable(15분 확인에서): 확인 시작부터 300초가 넘으면 한 데까지 적어 두고 멈춤 → 다음 확인이 남은 것부터 (10/24 매번 6분 제한에 끊기던 것)
function updatePay_(resumable) {
  if (!CONFIG.PAY_SHEET_ID) return;
  const props = PropertiesService.getScriptProperties();
  let prog = null;
  if (resumable) { try { prog = JSON.parse(props.getProperty('PAY_PROG') || 'null'); } catch (e) {} if (!prog || !prog.done) prog = { done: [], post: 0 }; }
  // 줄마다 넣을 값이 지난번과 같으면 건너뜀 (10/24: 줄 하나에 10초 넘게 걸려 54줄이 확인 4번에 나뉘었음). 같아도 6시간마다는 다시 씀(손으로 지운 줄 되살리기)
  let rowSig = {}; try { rowSig = JSON.parse(props.getProperty('PAY_ROWSIG') || '{}'); } catch (e) {}
  const sigOf = function (a) { return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(a), Utilities.Charset.UTF_8)).slice(0, 12); };
  const fresh = function (rid, sig) { const o = rowSig[rid]; return o && o.s === sig && Date.now() - o.t < 6 * 3600000; };
  const saveSig = function () { try { const keep = {}; runs.forEach(function (r) { const k = r.row + '|' + nameOf(r); if (rowSig[k]) keep[k] = rowSig[k]; }); props.setProperty('PAY_ROWSIG', JSON.stringify(keep)); } catch (e) {} };
  const stop = function (what) { props.setProperty('PAY_PROG', JSON.stringify(prog)); saveSig(); throw { payLate: what }; };
  const tooLate = function () { return resumable && late_(300); };
  const all = readRuns_().filter(function (r) { return r['시트ID'] && r['진행일'] instanceof Date; });
  const runs = all.filter(function (r) { return r['진행 상태'] !== '종료'; });
  // 스토어 왼쪽에 '진행일' 칸 (사용자 요청 10/19). 탭마다 한 번 (있으면 그대로)
  try { fixPaySunnyOnce_(); } catch (e) { note_('월급시트 써니마켓 정리 실패: ' + e); }
  try { payTabsNow_().forEach(payDateCol_); } catch (e) { note_('월급시트 진행일 칸 만들기 실패: ' + e); }
  const nameOf = function (r) { return String(r['명단 제목']).replace(/\s*\([^)]*\)\s*$/, '').trim(); };
  // 같은 캠페인 묶기: 캠페인 칸, 없으면 방제에서 #, 택, 날짜, 건수, 띄어쓰기를 뺀 이름이 앞부분까지 같으면 같은 캠페인
  const keyOf = function (r) { return String(r['캠페인'] || nameOf(r)).replace(/^[#업택\s]*\d{1,2}\.\d{1,2}/, '').replace(/\d+\s*$/, '').replace(/\s+/g, ''); };
  const same = function (a, b) { return a && b && (a.indexOf(b) === 0 || b.indexOf(a) === 0); };
  // 같은 상품이 다시 의뢰돼도 섞이지 않게: 이 진행 직전의 '1일차'부터를 한 의뢰로 봄
  runs.forEach(function (r) {
    const rid = r.row + '|' + nameOf(r);
    if (prog && prog.done.indexOf(rid) >= 0) return;
    if (tooLate()) stop('줄 ' + prog.done.length + '/' + runs.length);
    const k = keyOf(r);
    const group = all.filter(function (x) { return same(keyOf(x), k) && x['진행일'] <= r['진행일']; })
      .sort(function (a, b) { return a['진행일'] - b['진행일']; });
    let start = 0;
    group.forEach(function (x, i) { if (Number(x['일차']) === 1 || !Number(x['일차'])) start = i; });
    const mine = group.slice(start);
    const total = mine.reduce(function (m, x) { return Math.max(m, Number(x['총건수']) || 0); }, 0) || Number(r['목표인원']) || 0;
    // 앞 일차는 실제로 받은 인원으로 셈 (모자라서 다음 날 추가 모집하면 남은 건수가 맞게)
    const got = function (x) { return x['인원'] === '' || x['인원'] === null ? (Number(x['목표인원']) || 0) : Number(x['인원']) || 0; };
    const before = mine.filter(function (x) { return x['진행일'] < r['진행일']; }).reduce(function (a, x) { return a + got(x); }, 0);
    // 전월: 지난달에 시작한 캠페인이 이번 달로 넘어오면 지난달까지 끝낸 건수 (남은 = 총액 - 전월 - 누계 수식에 맞춰 총액에 다시 더함)
    const ym = function (d) { return d.getFullYear() * 12 + d.getMonth(); };
    const prev = mine.filter(function (x) { return ym(x['진행일']) < ym(r['진행일']); }).reduce(function (a, x) { return a + got(x); }, 0);
    // 같은 의뢰에 과일(자정 ~ 오전 7시) 진행이 있으면 모든 날 진행시간을 그걸로, 스토어·포토는 비었으면 같은 의뢰 값
    const fruit = mine.filter(isFruit_)[0];
    const pick = function (h) { return r[h] || (mine.filter(function (x) { return x[h]; })[0] || {})[h] || ''; };
    // 총액 = 의뢰서 총 구매 건수(날마다 같음). 남은 = 총액 - 전월 - 그날 수량 - 이번 달 앞 날들 수량 (남은 칸 수식에 앞 날들 수를 빼 줌)
    const earlier = mine.filter(function (x) { return x['진행일'] < r['진행일'] && ym(x['진행일']) === ym(r['진행일']); }).reduce(function (a, x) { return a + got(x); }, 0);
    // 기대평은 사람 × 건수(1주차 14, 2주차 13, 건당 500원): 총액 405건, 전월·앞 날·그날 수량도 건수로 (사용자 요청 10/23)
    if (isExpect_(r)) {
      const gw = function (x) { return expCount_(x, got(x), all); };   // A묶음 14·B묶음 13 (10/26)
      const prevW = mine.filter(function (x) { return ym(x['진행일']) < ym(r['진행일']); }).reduce(function (a, x) { return a + gw(x); }, 0);
      const earlierW = mine.filter(function (x) { return x['진행일'] < r['진행일'] && ym(x['진행일']) === ym(r['진행일']); }).reduce(function (a, x) { return a + gw(x); }, 0);
      const exE = { store: pick('업체'), time: payTime_(runSlot_(r)), photo: '', earlier: earlierW, mult: expPer_(r), count: expCount_(r, Number(r['인원']) || 0, all) }, shE = siblings_(all, r).length > 1;
      const sigE = sigOf([nameOf(r), EXP_LINKS.length * 15, prevW, shE, exE, String(r['시트ID']), String(r['진행일']), r['인원'], r['택대'], r['실배송'], r['일차']]);
      if (!fresh(rid, sigE)) { writePayRow_(r, nameOf(r), EXP_LINKS.length * 15, prevW, shE, exE); rowSig[rid] = { s: sigE, t: Date.now() }; }
      if (prog) prog.done.push(rid);
      return;
    }
    const cf = cartN_(r);   // 장바구니건은 물건 수로 (사람 × 상품 수, 사용자 요청 10/28)
    const exN = { store: pick('업체'), time: fruit ? '자정 ~ 오전 7시' : payTime_(runSlot_(r)), photo: pick('포토'), earlier: earlier * cf, mult: cf }, shN = siblings_(all, r).length > 1;
    const sigN = sigOf([nameOf(r), total * cf, prev * cf, shN, exN, String(r['시트ID']), String(r['진행일']), r['인원'], r['택대'], r['실배송'], r['일차']]);
    if (!fresh(rid, sigN)) { writePayRow_(r, nameOf(r), total * cf, prev * cf, shN, exN); rowSig[rid] = { s: sigN, t: Date.now() }; }
    if (prog) prog.done.push(rid);
  });
  // 줄 다음 정리들도 하나씩 (시간이 모자라면 다음 확인에서 그 단계부터)
  const post = [
    function () { payTabsNow_().forEach(payColors_); },
    function () { payDedupe_(all); },
    function () { payStatusAll_(all); },
    function () { payTabsNow_().forEach(payOrder_); },
    function () { payTabsNow_().forEach(payColors_); },
    function () { payRate_(); },
    function () { const m0 = new Date().getMonth() + 1; payTab_(m0); payCarry_(all, m0); payCarry_(all, m0 % 12 + 1); }
  ];
  const postName = ['캠페인 색', '중복 줄', '상태', '날짜순 정렬', '캠페인 색', '진행비', '이월'];
  for (let i = prog ? prog.post : 0; i < post.length; i++) {
    if (tooLate()) stop(postName[i] + ' 단계');
    try { post[i](); } catch (e) { note_('월급시트 ' + postName[i] + ' 실패: ' + e); }
    if (prog) prog.post = i + 1;
  }
  saveSig();
  if (resumable) props.deleteProperty('PAY_PROG');
}
// 진행비 = 1건(1명)당 500원, 리뷰비 없음 (사용자 요청 10/18). 이번 달·다음 달 탭만 (지난달 이전은 그대로)
//  날짜 칸의 진행비는 그날그날 정산: =$G5*BG5(완료보고 × 수량) → =BG5*500 (완료보고와 상관없이 그날 수량 × 500원)
//  날짜 칸 리뷰비는 비우고, 리뷰비 열은 한 번 숨김. 위쪽 '리뷰비 총액', '금일 리뷰비' 글자와 값도 지우고 '진행비 총액' 값 열은 보이게
//  15분마다 돌아도 이미 바꾼 칸은 그대로라 새로 생긴 줄만 바뀜
const PAY_RATE = 500;
function payRate_() {
  const now = new Date(), seen = {};
  [now.getMonth() + 1, (now.getMonth() + 1) % 12 + 1].forEach(function (mo) {
    const sh = payTab_(mo, mo !== now.getMonth() + 1);
    if (!sh || seen[sh.getSheetId()]) return;
    seen[sh.getSheetId()] = 1;
    if (mo !== now.getMonth() + 1 && !new RegExp('(^|\\D)' + mo + '월').test(sh.getName())) return;   // 다음 달 탭이 아직 없으면 건너뜀
    const L = payLayout_(sh);
    if (!L) return;
    const dayCols = Object.keys(L.days).map(function (k) { return L.days[k]; });
    if (!dayCols.length) return;
    const start = Math.min.apply(null, dayCols), lastCol = sh.getLastColumn(), lastRow = sh.getLastRow();
    if (lastRow <= L.head || lastCol < start) return;
    const head = sh.getRange(L.head, 1, 1, lastCol).getValues()[0].map(function (x) { return String(x).replace(/\s/g, ''); });
    const n = lastRow - L.head, w = lastCol - start + 1;
    const rng = sh.getRange(L.head + 1, start, n, w), fs = rng.getFormulas(), vs = rng.getValues();
    const rep = L.report ? colLetter_(L.report) : 'G';
    let changed = 0, odd = '';
    for (let c = 0; c < w; c++) {
      const h = head[start - 1 + c];
      if (h === '진행비') {
        let dirty = false;
        const col = fs.map(function (r, i) {
          const f = r[c];
          if (!f) return [vs[i][c]];
          // =$G5*BG5 또는 =$G5*BG5*500 (완료보고 × 수량) → =BG5*500
          const m = f.match(/^=\$?([A-Z]+)\$?\d+\s*\*\s*(\$?[A-Z]+\$?\d+)(?:\s*\*\s*\d+)?$/);
          if (m && m[1] === rep) { dirty = true; changed++; return ['=' + m[2] + '*' + PAY_RATE]; }
          if (/^=\$?[A-Z]+\$?\d+\s*\*\s*\$?[A-Z]+\$?\d+$/.test(f)) { dirty = true; changed++; return [f + '*' + PAY_RATE]; }
          if (!odd && !/\*\s*\d{3,}/.test(f)) odd = f;
          return [f];
        });
        if (dirty) sh.getRange(L.head + 1, start + c, n, 1).setValues(col);
      } else if (h === '리뷰비') {
        if (fs.some(function (r, i) { return r[c] || vs[i][c] !== ''; })) { sh.getRange(L.head + 1, start + c, n, 1).clearContent(); changed++; }
      }
    }
    // 리뷰비 열(합계 열 포함) 숨기기: 탭마다 한 번만 (직접 다시 펴면 그대로 둠)
    const props = PropertiesService.getScriptProperties(), hk = 'PAYNOREV_' + sh.getSheetId();
    if (!props.getProperty(hk)) {
      head.forEach(function (h, i) { if (h === '리뷰비') sh.hideColumns(i + 1); });
      props.setProperty(hk, '1');
    }
    // 머리글 위쪽(1~3행): '리뷰비 총액', '금일 리뷰비' 글자와 그 오른쪽 값(리뷰비 열) 지우기, '진행비 총액' 값 열 보이기 (탭마다 한 번)
    const hk2 = 'PAYHDR_V1_' + sh.getSheetId();
    if (!props.getProperty(hk2) && L.head > 1) {
      const top = sh.getRange(1, 1, L.head - 1, lastCol), tv = top.getValues(), tf = top.getFormulas();
      const isRev = function (c) { return head[c] === '리뷰비'; };
      tv.forEach(function (row, r) {
        row.forEach(function (x, c) {
          const t = String(x).replace(/\s/g, '');
          if (t !== '리뷰비총액' && t !== '금일리뷰비' && t !== '진행비총액') return;
          let v = c + 1;
          while (v < row.length && row[v] === '' && !tf[r][v]) v++;
          if (t === '진행비총액') {
            // 값 칸(예: S1)이 리뷰비 열이라 같이 숨겨졌음 → 열을 다시 보이게, 그 열의 리뷰비 머리글·줄 수식은 지움
            if (v < row.length) {
              sh.showColumns(v + 1);
              if (isRev(v) && v + 1 < start) { sh.getRange(L.head, v + 1, n + 1, 1).clearContent(); changed++; }
            }
            return;
          }
          sh.getRange(r + 1, c + 1).clearContent(); changed++;
          if (v < row.length && isRev(v)) { sh.getRange(r + 1, v + 1).clearContent(); changed++; }
        });
      });
      props.setProperty(hk2, '1');
    }
    // 날짜 위 줄(예: T2)에 '금일 진행비'와 그날 진행비 합계 (사용자 요청 10/18). 예전 '금일 리뷰비'(두 칸 합친 글자 + 숨긴 리뷰비 열 값) 자리
    const hk3 = 'PAYHDR_V2_' + sh.getSheetId();
    if (!props.getProperty(hk3) && L.head > 2) {
      const r2 = L.head - 2;
      dayCols.filter(function (c, i, a) { return a.indexOf(c) === i; }).forEach(function (c) {
        const jc = [c, c + 1, c + 2].filter(function (x) { return head[x - 1] === '진행비'; })[0];
        if (!jc) return;
        const t = String(sh.getRange(r2, c).getValue()).replace(/\s/g, '');
        if (t && t !== '금일리뷰비' && t !== '금일진행비') return;
        try { sh.getRange(r2, c, 1, 2).breakApart(); } catch (e) {}
        sh.getRange(r2, c).setValue('금일 진행비');
        sh.getRange(r2, c + 1).setFormula('=SUM(' + colLetter_(jc) + (L.head + 1) + ':' + colLetter_(jc) + ')').setNumberFormat('#,##0');
        if (head[c + 1] === '리뷰비') sh.getRange(r2, c + 2).clearContent();
        changed++;
      });
      props.setProperty(hk3, '1');
    }
    if (changed) note_('✓ 월급시트 ' + sh.getName() + ': 진행비 1건 ' + PAY_RATE + '원(그날그날), 리뷰비 비움 (' + changed + '곳)');
    if (odd && props.getProperty('PAYODD_' + sh.getSheetId()) !== odd) { note_('월급시트 ' + sh.getName() + ' 진행비 칸에 모르는 수식이 있어 안 바꿈: ' + odd); props.setProperty('PAYODD_' + sh.getSheetId(), odd); }
  });
}

// 의뢰(같은 명단 시트 묶음)마다 월급시트 줄을 찾아 상태 칸을 마지막 날 줄에 잇기 (끝난 진행 줄도)
function payStatusAll_(all) {
  const tabs = {};
  const tabOf = function (d) {
    const k = d.getFullYear() + '-' + (d.getMonth() + 1);
    if (!tabs[k]) {
      const sh = payTab_(d.getMonth() + 1), L = payLayout_(sh);
      const last = L ? Math.max(sh.getLastRow(), L.head) : 0;
      tabs[k] = L ? { sh: sh, L: L, names: sh.getRange(L.head + 1, L.name, Math.max(last - L.head, 1), 1).getValues().map(function (x) { return String(x[0]).replace(/\s+/g, ''); }) } : null;
    }
    return tabs[k];
  };
  chainsOf_(all).forEach(function (c) {
    // 하루짜리 의뢰도 (끝나면 완료보고 체크). 예전엔 2일 이상만 봐서 신발패드 문어괄사·노티아 대봉감·양모볼외가 빠졌음 (10/26)
    if (!c.runs.length) return;
    const rows = [];
    c.runs.forEach(function (r) {
      const t = tabOf(r['진행일']);
      if (!t) return;
      const nm = String(r['명단 제목']).replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+/g, '');
      let i = t.names.indexOf(nm);
      if (i === -1) i = t.names.findIndex(function (x) { return x && sameRunTitle_(x, nm); });
      if (i !== -1) rows.push({ sh: t.sh, L: t.L, row: t.L.head + 1 + i, d: r['진행일'] });
    });
    rows.sort(function (a, b) { return a.d - b.d || a.row - b.row; });
    payStatusLink_(rows);
  });
}

// 월급시트 진행시간: 바로구매 → 긴급건, 별과 '구매' 글자는 뺌 (자정 ~ 오전 8시 20분)
function payTime_(t) {
  t = String(t || '');
  if (/바로구매/.test(t)) return '긴급건';
  const x = t.replace(/★/g, '').replace(/\s*구매\s*$/, '').replace(/\s+00\s*분/, '').replace(/\s*까지\s*$/, '').replace(/\s+/g, ' ').trim();
  return /오전|오후/.test(x) && !/자정/.test(x) ? '시간지정' : x;
}

// 월급시트에서 옛 캠페인명 줄을 새 이름으로 (이번 달·다음 달 탭)
function payRename_(oldName, newName) {
  const o = String(oldName).replace(/\s+/g, ''), n = String(newName).replace(/\s+/g, '');
  if (!o || o === n) return;
  if (campKey_(oldName) !== campKey_(newName) && !globalThis.__PAY_RENAME_ANY) { note_('⛔ 월급시트 이름 안 바꿈 (다른 상품): ' + oldName + ' → ' + newName); return; }   // 다른 진행 줄 이름을 바꾸지 않게 (10/23)
  payTabsNow_().forEach(function (sh) {
    const L = payLayout_(sh); if (!L) return;
    const last = sh.getLastRow(); if (last <= L.head) return;
    const rg = sh.getRange(L.head + 1, L.name, last - L.head, 1), v = rg.getValues(), f = rg.getFormulas();
    const hasNew = v.some(function (x) { return String(x[0]).replace(/\s+/g, '') === n; });
    v.forEach(function (x, i) { if (!f[i][0] && !hasNew && String(x[0]).replace(/\s+/g, '') === o) { sh.getRange(L.head + 1 + i, L.name).setValue(newName); note_('✓ 월급시트 이름 바꿈: ' + oldName + ' → ' + newName); } });
  });
}
// (한 번, 10/21) 써니마켓 중복 줄: 옛 '(업체명)' 줄은 새 이름으로 바꾸고(직접 넣은 체크 등이 있는 줄이라 남김), 나중에 생긴 '써니마켓' 줄은 지움.
//  지운 10/22 '(업체명) 부유단감 1' 진행 줄도 지움
function fixPaySunnyOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('PAYSUNNY_V1')) return;
  props.setProperty('PAYSUNNY_V1', '1');
  payTabsNow_().forEach(function (sh) {
    const L = payLayout_(sh); if (!L) return;
    const last = sh.getLastRow(); if (last <= L.head) return;
    const v = sh.getRange(L.head + 1, L.name, last - L.head, 1).getValues().map(function (x) { return String(x[0]).replace(/\s+/g, ''); });
    const oldI = v.findIndex(function (x) { return /10\.21/.test(x) && /\(업체명\)부유단감/.test(x); });
    const newI = v.findIndex(function (x) { return /10\.21/.test(x) && /써니마켓부유단감/.test(x); });
    const del = [];
    if (oldI >= 0 && newI >= 0) { sh.getRange(L.head + 1 + oldI, L.name).setValue('#택10.21 써니마켓 부유단감 5'); del.push(newI); }
    else if (oldI >= 0) sh.getRange(L.head + 1 + oldI, L.name).setValue('#택10.21 써니마켓 부유단감 5');
    v.forEach(function (x, i) { if (/10\.2[2-9]/.test(x) && /부유단감/.test(x)) del.push(i); });
    del.sort(function (a, b) { return b - a; }).forEach(function (i) { note_('✓ 월급시트 중복 줄 지움: ' + v[i]); sh.deleteRow(L.head + 1 + i); });
  });
}
// 같은 명단 시트(계약 수량 링크) + 같은 날짜 줄이 둘 이상이면 한 진행이 두 줄이 된 것 (방제를 바꿔서 새 줄이 생김).
//  먼저 있던 줄(직접 넣은 체크 등이 있을 수 있음)을 남기고 이름은 지금 방제로, 나중 줄은 지움. 매번 확인 (돈 관련이라 사용자 요청 10/21)
function payDedupe_(runs) {
  payTabsNow_().forEach(function (sh) {
    const L = payLayout_(sh); if (!L || !L.qty) return;
    const last = sh.getLastRow(); if (last <= L.head) return;
    const n = last - L.head;
    const names = sh.getRange(L.head + 1, L.name, n, 1).getValues().map(function (x) { return String(x[0]).trim(); });
    const linkOf = function (rt) { try { if (rt.getLinkUrl()) return rt.getLinkUrl(); const rr = rt.getRuns(); for (let i = 0; i < rr.length; i++) if (rr[i].getLinkUrl()) return rr[i].getLinkUrl(); } catch (e) {} return ''; };
    const sids = sh.getRange(L.head + 1, L.qty, n, 1).getRichTextValues().map(function (x) { const u = x[0] ? linkOf(x[0]) : ''; return (u.match(/\/d\/([-\w]{25,})/) || [])[1] || ''; });
    const seen = {}, del = [];
    names.forEach(function (nm, i) {
      if (!nm || !sids[i] || !dateTok_(nm)) return;
      const k = sids[i] + '|' + dateTok_(nm);
      if (seen[k] === undefined) { seen[k] = i; return; }
      const keep = seen[k];
      const cur = runs.filter(function (r) { return String(r['시트ID']) === sids[i] && dateTok_(r['명단 제목']) === dateTok_(nm); })[0];
      if (cur) sh.getRange(L.head + 1 + keep, L.name).setValue(bareTitle_(cur['명단 제목']));
      del.push(i);
      note_('⚠ 월급시트 같은 진행 두 줄 → 하나로: ' + names[keep] + ' / ' + nm);
    });
    del.sort(function (a, b) { return b - a; }).forEach(function (i) { sh.deleteRow(L.head + 1 + i); });
  });
}
function writePayRow_(r, name, remain, prevMonth, shared, ex) {
  ex = ex || { store: r['업체'], time: payTime_(r['구매시간']), photo: r['포토'] };
  const day = r['진행일'];
  const sh = payTab_(day.getMonth() + 1);
  const L = payLayout_(sh);
  if (!L) return;
  const last = Math.max(sh.getLastRow(), L.head);
  const names = sh.getRange(L.head + 1, L.name, Math.max(last - L.head, 1), 1).getValues().map(function (x) { return String(x[0]).replace(/\s+/g, ''); });
  // 계약 수량 칸에 이미 이 명단 시트 링크(칩)가 있는 줄이 있으면 그 줄을 씀
  const sid = String(r['시트ID']);
  const linkOf = function (rt) { try { if (rt.getLinkUrl()) return rt.getLinkUrl(); const runs = rt.getRuns(); for (let i = 0; i < runs.length; i++) if (runs[i].getLinkUrl()) return runs[i].getLinkUrl(); } catch (e) {} return ''; };
  const links = L.qty ? sh.getRange(L.head + 1, L.qty, Math.max(last - L.head, 1), 1).getRichTextValues().map(function (x) { return x[0] ? linkOf(x[0]) : ''; }) : [];
  // 명단 시트 하나를 여러 날이 같이 쓰면 링크가 같으니 이름(날짜 들어간 방제)으로 먼저 찾음
  let byName = names.indexOf(name.replace(/\s+/g, ''));
  // 방제 끝 숫자를 고친 경우: 같은 날짜·캠페인 줄을 찾아 캠페인명을 새 이름으로
  let renamed = false;
  if (byName === -1) { byName = names.findIndex(function (nm) { return nm && sameRunTitle_(nm, name); }); renamed = byName !== -1; }
  let row = shared && byName !== -1 ? byName : links.findIndex(function (u, i) { return u && u.indexOf(sid) !== -1 && (!shared || !names[i]); });
  const hasLink = row !== -1 && !!links[row];
  if (row === -1) row = byName;
  // 이달 첫 진행: 같은 캠페인 '이월' 줄이 있으면 그 줄을 씀 (특이사항 '이월'은 지우고 이 진행 값으로)
  if (row === -1 && L.note) {
    const notes = sh.getRange(L.head + 1, L.note, Math.max(last - L.head, 1), 1).getValues(), ck = campKey_(name);
    row = names.findIndex(function (nm, i) { return nm && /이월/.test(String(notes[i][0])) && campKey_(nm) === ck; });
    if (row !== -1) { sh.getRange(L.head + 1 + row, L.name).setValue(name); sh.getRange(L.head + 1 + row, L.note).setValue(''); }
  }
  if (renamed && row === byName && !sh.getRange(L.head + 1 + row, L.name).getFormula()) sh.getRange(L.head + 1 + row, L.name).setValue(name);
  if (row === -1) row = names.indexOf('');
  row = row === -1 ? last + 1 : L.head + 1 + row;
  const put = function (col, val) {
    if (!col) return;
    const c = sh.getRange(row, col);
    if (c.getFormula()) return;
    c.setValue(val);
  };
  if (!hasLink || !sh.getRange(row, L.name).getValue()) put(L.name, name);
  if (L.qty && !hasLink && !sh.getRange(row, L.qty).getFormula()) {
    // 파일 칩(초록 시트 아이콘)으로 넣기. 편집기 '서비스'에 Google Sheets API를 추가해야 됨, 없으면 글자 링크
    const url = 'https://docs.google.com/spreadsheets/d/' + r['시트ID'] + '/edit';
    if (!putFileChip_(sh, row, L.qty, url)) {
      // 칩을 못 만들면 주소를 그대로 넣음 (그 칸에서 '칩으로 바꾸기'가 되도록)
      const cell = sh.getRange(row, L.qty);
      cell.setRichTextValue(SpreadsheetApp.newRichTextValue().setText(url).setLinkUrl(url).setTextStyle(cell.getTextStyle()).build());
    }
  }
  put(L.sum, remain);
  if (prevMonth) put(L.prev, prevMonth);
  // 남은 칸 수식(=H-M-Q)에 같은 의뢰 앞 날들 수량을 빼 줌: =H8-M8-Q8-12 (그날 수량은 Q로 실시간)
  if (L.left) {
    const lc = sh.getRange(row, L.left), lf = lc.getFormula();
    const m = lf.match(/^=([A-Z]+)(\d+)-([A-Z]+)(\d+)-([A-Z]+)(\d+)(?:-\d+)?$/);
    if (m) {
      const nf = '=' + m[1] + m[2] + '-' + m[3] + m[4] + '-' + m[5] + m[6] + (ex.earlier ? '-' + ex.earlier : '');
      if (nf !== lf) lc.setFormula(nf);
    }
  }
  // 스토어, 진행시간, 특이사항은 비어 있을 때만 채움 (직접 고친 건 그대로)
  const putIfEmpty = function (col, val) { if (col && val && sh.getRange(row, col).getValue() === '' && !sh.getRange(row, col).getFormula()) sh.getRange(row, col).setValue(val); };
  // 스토어가 없으면 월급시트에서 같은 캠페인 다른 줄의 스토어를 가져옴 (직접 적어 둔 것)
  let store = String(ex.store || '');
  if (!store && L.store) {
    const ck = campKey_(name), stores = sh.getRange(L.head + 1, L.store, Math.max(last - L.head, 1), 1).getValues();
    names.forEach(function (nm, i) { if (!store && nm && i !== row - L.head - 1 && campKey_(nm) === ck && stores[i][0]) store = String(stores[i][0]); });
  }
  putIfEmpty(L.store, store.replace(/\s+/g, ''));
  // 진행시간: 비었거나 스크립트가 넣던 말(긴급건, 시간지정, 자정 ~ …)이면 지금 값으로 바꿈
  if (L.time && ex.time) {
    const c = sh.getRange(row, L.time), cur = String(c.getValue()).trim();
    if (!c.getFormula() && cur !== ex.time && (cur === '' || /^(긴급건|시간지정|자정\s*~)/.test(cur))) c.setValue(ex.time);
  }
  putIfEmpty(L.note, [r['택대'] === 'Y' ? '택대' : '', r['실배송'] === 'Y' ? '실배송' : '', Number(r['일차']) ? r['일차'] + '일차' : '', /유/.test(String(ex.photo || '')) ? '포토' : ''].filter(Boolean).join(' / '));
  const col = L.days[(day.getMonth() + 1) + '-' + day.getDate()] || L.days[String(day.getDate())];
  put(col, ex.count != null ? ex.count : (Number(r['인원']) || 0) * (ex.mult || 1));
  if (L.date) { const dc = sh.getRange(row, L.date), dv = dc.getValue(); if (!dc.getFormula() && !(dv instanceof Date && dv.getTime() === day.getTime())) dc.setValue(day).setNumberFormat('M/d'); }
  return { sh: sh, row: row, L: L };
}

// 상태 칸: 의뢰가 다 끝나면(마지막 날 줄의 남은 = 0) 앞 날 줄도 '완료' (사용자 요청 10/18)
//  사용자 수식 =IF(H5=0,"시작전",IF(N5=0,"완료",…))의 완료 조건만 IF(OR(N5=0,N마지막=0),"완료",…)로 바꿈. 마지막 날 줄은 원래 모양
function payStatusLink_(rows) {
  if (!rows.length) return;
  const last = rows[rows.length - 1];
  // 의뢰가 다 끝나면(마지막 날 남은 = 0) 그 의뢰 모든 날 '완료보고' 체크 (표시만. 진행비는 10/18부터 그날 수량 × 500원이라 완료보고와 상관없음)
  //  줄마다 한 번만 체크 (사람이 체크를 풀면 다시 안 건드림)
  try {
    if (last.L.left && last.L.report && last.sh.getRange(last.row, last.L.left).getValue() === 0) {
      const props = PropertiesService.getScriptProperties();
      rows.forEach(function (x) {
        if (!x.L.report || x.sh.getSheetId() !== last.sh.getSheetId()) return;
        const nm = String(x.sh.getRange(x.row, x.L.name).getValue()).replace(/\s+/g, '');
        const key = 'PAYREP_' + x.sh.getSheetId() + '_' + nm;
        if (!nm || props.getProperty(key)) return;
        const c = x.sh.getRange(x.row, x.L.report);
        if (c.getValue() !== true) c.setValue(true);
        props.setProperty(key, '1');
      });
    }
  } catch (e) { note_('완료보고 체크 실패: ' + e); }
  rows.forEach(function (x) {
    if (!x.L.status || x.sh.getSheetId() !== last.sh.getSheetId()) return;
    const c = x.sh.getRange(x.row, x.L.status), f = c.getFormula();
    const re = /IF\(\s*(?:OR\(\s*)?([A-Z]+)(\d+)\s*=\s*0\s*(?:,\s*[A-Z]+\d+\s*=\s*0\s*\))?\s*,\s*"완료"/;
    const m = f.match(re);
    if (!m || Number(m[2]) !== x.row) return;
    const want = x.row === last.row ? 'IF(' + m[1] + m[2] + '=0,"완료"' : 'IF(OR(' + m[1] + m[2] + '=0,' + m[1] + last.row + '=0),"완료"';
    const nf = f.replace(re, want);
    if (nf !== f) c.setFormula(nf);
  });
}

function putFileChip_(sh, row, col, url) {
  try {
    if (typeof Sheets === 'undefined') return false;
    Sheets.Spreadsheets.batchUpdate({ requests: [{ updateCells: {
      range: { sheetId: sh.getSheetId(), startRowIndex: row - 1, endRowIndex: row, startColumnIndex: col - 1, endColumnIndex: col },
      rows: [{ values: [{ userEnteredValue: { stringValue: '@' }, chipRuns: [{ startIndex: 0, chip: { richLinkProperties: { uri: url } } }] }] }],
      fields: 'userEnteredValue,chipRuns'
    } }] }, sh.getParent().getId());
    return true;
  } catch (e) { note_('파일 칩 실패: ' + e); PropertiesService.getScriptProperties().setProperty('CHIP_ERROR', String(e)); return false; }
}

/* ---------------- 10) 한눈에 탭: 진행 중인 것 전부 한 화면에 ---------------- */
// 위: 진행마다 한 줄 (진행일, 방제, 상태, 목표, 신청, 남은, 마감, 바로가기 명단/폼/월급시트/택배시트)
// 아래: 진행마다 명단 내용 (각 명단 시트를 그대로 보여 줌, 읽기 전용)
// 신청 수와 명단 내용은 IMPORTRANGE 수식이라 응답이 들어오면 몇 초~1분 안에 바로 바뀜 (스크립트를 기다리지 않음)
// 택배시트는 바로가기만 걸고 절대 고치지 않음

const DASH_TAB = '한눈에';
// 한눈에 '상태' 칸 (진행목록 '진행 상태'는 그대로 둠): 앞으로 = 진행예정, 오늘 받는 중 = 진행중, 오늘 마감했거나 지난 날 = 진행완료 (사용자 요청 10/20)
// 한눈에 '상품' 칸: 상품 페이지 주소와 플랫폼. 생성기가 넘긴 주소(PURL_)가 없으면 방 공지의 상품번호로 만듦 (예전 진행, 10/21)
function purlOf_(r, props, obNotices) {
  let url = String(props.getProperty('PURL_' + r['시트ID']) || '').split('\n')[0];
  let plat = String(r['플랫폼'] || '').trim();
  const room = String(r['카톡방'] || bareTitle_(r['명단 제목']));
  const n = (obNotices || []).filter(function (v) { return String(v[0]) === room; })[0] || (obNotices || []).filter(function (v) { return campKey_(v[0]) === campKey_(room); })[0];
  const pno = n ? ((String(n[1]).match(/🐥\s*상품번호\s*[:：]\s*([^\n]+)/) || [])[1] || '').trim() : '';
  if (/^A\d{9,}/.test(pno) && (!plat || plat === '기타')) plat = '올리브영';
  if (!url && pno) {
    const id = (pno.match(/A?\d{6,}/) || [''])[0];
    if (plat === '올리브영') url = 'https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=' + id;
    else if (plat === '토스') url = 'https://toss.shopping/i/' + id;
    else if (plat === '네이버') url = 'https://smartstore.naver.com/main/products/' + id;
    else if (id && (plat === '쿠팡' || / - /.test(pno))) url = 'https://www.coupang.com/vp/products/' + id;
    if (url) props.setProperty('PURL_' + r['시트ID'], url);
  }
  return { url: url, plat: plat };
}
// 한눈에 탭에서 빼는 진행: 진행완료이고 진행일이 3일 넘게 지난 것 (쌓이면 느려져서, 사용자 요청 10/21)
function dashHidden_(r) { return dashStatus_(r) === '진행완료' && r['진행일'] instanceof Date && dayStart_(r['진행일']) < today_().getTime() - 3 * 86400000; }
function dashStatus_(r) {
  if (!(r['진행일'] instanceof Date)) return r['진행 상태'];
  const d = dayStart_(r['진행일']), t = today_().getTime();
  if (d > t) return '진행예정';
  if (d === t && !(r['마감 시각'] instanceof Date)) return '진행중';
  return '진행완료';
}
const DASH_VER = '27';
// 한눈에 '리뷰 취합할 것' 칸에 보일 것: 의뢰 전체 리뷰가 끝난(RVRPT_) 의뢰 중 업체 전송 체크 안 했거나 체크한 지 3일 안 된 것. 최근 40일 진행만, 기대평 빼고
//  날마다 취합하던 줄은 없앰 (사용자 요청 10/26: 날짜별로 말고 한 캠페인이 다 끝나면 그때 한 번에)
function rvItems_(allRuns, props) {
  const all = props.getProperties(), t0 = today_().getTime(), cut = t0 - 40 * 86400000, keep = function (d) { return !(d instanceof Date) || dayStart_(d) >= t0 - 3 * 86400000; };
  const md = function (d) { return d instanceof Date ? Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy-MM-dd') : ''; };
  const runs = allRuns.filter(function (r) { return r['시트ID'] && !isExpect_(r) && r['진행일'] instanceof Date && r['진행일'].getTime() >= cut; })
    .sort(function (a, b) { return a['진행일'] - b['진행일']; });
  const items = [];
  const bySheet = {};
  runs.forEach(function (r) { (bySheet[r['시트ID']] = bySheet[r['시트ID']] || []).push(r); });
  Object.keys(bySheet).forEach(function (sid) {
    const mine = bySheet[sid];
    if (!all['RVRPT_' + sid] || !keep(mine[0]['업체 전송'])) return;
    const f = function (r) { return (r['진행일'].getMonth() + 1) + '.' + r['진행일'].getDate(); };
    const span = f(mine[0]) === f(mine[mine.length - 1]) ? f(mine[0]) : f(mine[0]) + '~' + f(mine[mine.length - 1]);
    const todo = all['RVZIPURL_' + sid] ? '압축 완료 → 보낼메시지 \'리뷰 보고\' 압축 파일 받아서 업체에 보내고 체크' : '리뷰 캡처 전부 올리기(오른쪽 리뷰이미지) → 압축되면 업체에 보내고 체크';
    const img = all['RVIMG_' + sid] ? 'https://drive.google.com/drive/folders/' + all['RVIMG_' + sid] : String(mine[0]['폴더 링크'] || '');
    items.push({ type: 'req', sid: sid, label: '📦 의뢰 끝: ' + campOf_(mine[0]['명단 제목']) + ' (' + span + ') ' + todo, at: md(mine[0]['업체 전송']), sheet: String(mine[0]['시트 링크'] || ''), folder: img });
  });
  return items;
}
// 한눈에 '리뷰 취합할 것' 체크칸 상태 → 진행목록 '리뷰 취합'/'업체 전송' (편집 트리거가 못 받은 체크도 다시 그릴 때 저장. 10/25 # 10.15 고구마말랭이 체크가 안 남았음)
function syncRvChecks_(ss, allRuns, props) {
  let m = {}; try { m = JSON.parse(props.getProperty('DASH_RV') || '{}'); } catch (e) { return; }
  const sh = ss.getSheetByName(DASH_TAB);
  if (!sh) return;
  Object.keys(m).forEach(function (row) {
    const it = m[row], v = sh.getRange(Number(row), 1, 1, 2).getValues()[0];
    if (typeof v[0] !== 'boolean') return;   // 체크칸이 아니면(줄이 바뀜) 안 건드림
    if (it.type === 'day' ? String(v[1]).trim() !== it.title : String(v[1]).indexOf('📦') !== 0) return;   // 다른 줄이면 안 건드림
    const col = it.type === 'day' ? '리뷰 취합' : '업체 전송';
    const mine = it.type === 'day' ? allRuns.filter(function (x) { return bareTitle_(x['명단 제목']) === it.title; }).slice(-1) : allRuns.filter(function (x) { return String(x['시트ID']) === String(it.sid); });
    mine.forEach(function (r) {
      if (v[0] === (r[col] instanceof Date)) return;
      const val = v[0] ? today_() : '';
      setRun_(r.row, col, val); r[col] = val;
      note_('✓ 리뷰 취합 체크 ' + (v[0] ? '저장' : '풀림') + ': ' + bareTitle_(r['명단 제목']) + ' (' + col + ')');
    });
  });
}
const DASH_LIST_DAYS = 2;   // 아래 명단 덩어리를 보여 줄 지난 날 수   // 모양을 바꾸면 올려서 다시 만들게 함

function rebuildDashboard() {
  buildDashboard_(true);
  SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(adminSs_().getSheetByName(DASH_TAB));
}

function grantImport_(destId, srcId) {
  // 같은 계정의 시트끼리 IMPORTRANGE '액세스 허용'을 미리 눌러 둠 (안 되면 칸의 '허용'을 한 번 누르면 됨)
  //  한 번 허용되면 계속 유지되니 짝마다 한 번만 (매번 하면 느려짐)
  const key = 'GRANT_' + destId + '_' + srcId, props = PropertiesService.getScriptProperties();
  if (props.getProperty(key)) return;
  try {
    const res = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + destId + '/externaldata/addimportrangepermissions?donorDocId=' + srcId,
      { method: 'post', headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    if (res && res.getResponseCode && res.getResponseCode() === 200) props.setProperty(key, '1');
  } catch (e) {}
}

function buildDashboard_(force) {
  const allRuns = readRuns_();
  const runs = allRuns.filter(function (r) { return r['진행 상태'] !== '종료' && r['시트ID'] && !dashHidden_(r); })
    // 오늘 할 것 맨 위 → 내일, 모레… (가까운 날부터) → 지난 진행(최근 것부터) (사용자 요청 10/19, 보낼메시지와 같게)
    .sort(function (a, b) {
      const t0 = dayStart_(new Date()), key = function (r) { const d = r['진행일'] instanceof Date ? Math.round((dayStart_(r['진행일']) - t0) / 86400000) : -9999; return d >= 0 ? [d === 0 ? 0 : 1, d] : [2, -d]; };
      const ka = key(a), kb = key(b);
      return (ka[0] - kb[0]) || (ka[1] - kb[1]) || ((a.row || 0) - (b.row || 0));
    });
  const props = PropertiesService.getScriptProperties();
  const ss = adminSs_();
  try { syncRvChecks_(ss, allRuns, props); } catch (e) {}
  // 명단 시트(의뢰)마다 한 덩어리. 명단 탭(여러 날 폼 응답을 합친 것)이 있으면 거기서 가져옴
  let sheets = {}, order = [];
  runs.forEach(function (r) {
    const id = String(r['시트ID']);
    if (sheets[id]) { sheets[id].runs.push(r); return; }
    order.push(id);
    let src = '', start = 2, cols = 12, keep = [], hd = [], count = 0;
    try {
      const rss = SpreadsheetApp.openById(id);
      // 숨은 '응답합본' 탭(수식, 모든 폼 응답)에서 가져옴. 명단 탭은 사람이 열을 지우고 고치는 값이라 안 씀
      const lt = rss.getSheetByName(MERGE_TAB);
      if (lt && lt.getLastColumn() > 0 && String(lt.getRange('A2').getValue()) !== '') {
        src = MERGE_TAB; start = 3; cols = lt.getLastColumn();
        hd = lt.getRange(2, 1, 1, cols).getValues()[0].map(String);
        count = Math.max(lt.getLastRow() - 2, 0);
      } else {
        const rs = responseSheet_(rss); src = rs.getName(); cols = Math.max(rs.getLastColumn(), 1);
        hd = headers_(rs);
        count = Math.max(rs.getLastRow() - 1, 0);
      }
      // 계좌, 은행, 예금주 열은 빼고 보여 줌
      hd.forEach(function (h, k) { if (h && !MATCH.account.test(h) && OLD_HELPER.indexOf(h) === -1 && k < 26) keep.push(k + 1); });
    } catch (e) {}
    sheets[id] = { id: id, runs: [r], keep: keep, hd: hd, count: count, start: start, ref: "'" + src.replace(/'/g, "''") + "'!", cols: Math.min(cols, 26), url: 'https://docs.google.com/spreadsheets/d/' + id + '/edit' };
  });
  // 진행(날짜)마다 한 덩어리: 같은 명단 시트를 여러 날 써도 그날 응답만 보여 줌 (택배시트에도 그날 것만 옮기게)
  const blk = {}, border = [];
  runs.forEach(function (r, i) {
    const b0 = sheets[String(r['시트ID'])];
    if (!b0) return;
    const w = windowOf_(allRuns, r);
    const b = Object.assign({}, b0, { key: 'b' + i, sid: b0.id, runs: [r], from: w.from, to: w.to, count: Number(r['인원']) || 0 });
    blk[b.key] = b; border.push(b.key);
  });
  sheets = blk; order = border;
  // 아래 명단 덩어리는 최근 것만 (오늘·앞으로 + 지난 2일, 택배 옮김 안 한 택대). 진행이 쌓일수록 IMPORTRANGE가 많아져 느려져서 (사용자 10/20)
  //  위 표(신청·남은)는 전부 그대로. 지난 명단은 위 표 '명단' 링크로
  const recentCut = today_().getTime() - DASH_LIST_DAYS * 86400000;
  const show = order.filter(function (id) {
    const r = sheets[id].runs[0];
    return !(r['진행일'] instanceof Date) || r['진행일'].getTime() >= recentCut || (r['택대'] === 'Y' && r['택배 옮김'] !== true);
  });
  // 덩어리 줄 수는 지금 인원 + 여유 5줄 (넘칠 것 같으면 다시 만듦). 빈칸이 너무 길지 않게
  order.forEach(function (id) {
    const x = sheets[id];
    const goal = Number(x.runs[0]['목표인원']) || 0;
    x.n = Math.max(Math.ceil((x.count + 5) / 5) * 5, 6);   // 5줄 단위라 응답 몇 개마다만 다시 만듦
    if (goal) x.n = Math.min(x.n, Math.max(goal + 3, x.count + 2));
  });
  const rvItems = rvItems_(allRuns, props);
  const sig = JSON.stringify(rvItems) + '|' + DASH_VER + '|' + show.join(',') + '|' + runs.map(dashStatus_).join(',') + '|' + props.getProperty('RUN_ERRORS') + '|' + order.map(function (id) { return id + ':' + sheets[id].n; }).join(',') + '|' + runs.map(function (r) { return r['시트ID'] + ':' + r['목표인원'] + ':' + r['진행 상태'] + ':' + r['진행일'] + ':' + r['택배 옮김']; }).join('|');
  let sh = ss.getSheetByName(DASH_TAB);
  // 한눈에 탭에서 방제를 직접 고쳐 둔 게 있으면 다시 만들기 전에 진행목록에 반영
  //  (지난번에 스크립트가 적은 값과 다를 때만 = 한눈에서 직접 고친 것. 진행목록에서 고친 걸 옛 값으로 되돌리지 않게)
  let written = [];
  try { written = JSON.parse(props.getProperty('DASH_TITLES') || '[]'); } catch (e) {}
  if (sh && sh.getLastRow() >= 2) {
    let changed = false;
    sh.getRange(2, 2, Math.min(sh.getLastRow() - 1, 60), 1).getValues().forEach(function (v, i) {
      const t = String(v[0]).trim();
      if (!t || t.charAt(0) === '■' || t === written[i] || written.indexOf(t) >= 0) return;   // 지난번에 스크립트가 쓴 값이 자리만 밀린 것은 고친 게 아님 (예전 이름으로 되돌리던 것)
      const r = runs.filter(function (x) { return sameRunTitle_(x['명단 제목'], t) && bareTitle_(x['명단 제목']) !== t; })[0];
      if (r && renameRun_(r, t, '한눈에 탭 값')) changed = true;
    });
    if (changed) { force = true; try { updatePay_(); } catch (e) {} }
  }
  // 남은·신청 칸이 날짜로 보이지 않게 숫자 서식은 매번 (다시 만들지 않을 때도)
  if (sh && runs.length) { try { sh.getRange(2, 4, runs.length, 4).setNumberFormat('0'); } catch (e) {} }
  // 서명이 같아도 위 표가 비어 있으면(지난번에 지우고 쓰다가 멈춤) 다시 만듦
  if (!force && sh && props.getProperty('DASH_SIG') === sig && (!runs.length || String(sh.getRange(2, 2).getValue()).trim() !== '')) return;
  // 지우기 전에 서명을 지워 둠: 쓰다가 멈추면 다음 확인이 꼭 다시 만들게
  props.deleteProperty('DASH_SIG');
  order.forEach(function (id) { grantImport_(ss.getId(), sheets[id].sid); });
  if (!sh) sh = ss.insertSheet(DASH_TAB, 0);
  // 1행은 글자만 지우고 서식은 둠 (직접 칠한 색이 안 풀리게)
  sh.getRange(1, 1, 1, sh.getMaxColumns()).clearContent();
  sh.getRange(2, 1, sh.getMaxRows() - 1, sh.getMaxColumns()).clear().clearDataValidations();
  sh.setFrozenRows(1);
  const q = function (t) { return '"' + String(t).replace(/"/g, '""') + '"'; };
  // D = 의뢰서 총 구매 건수, E = 그날 목표 (그날 하루 받을 인원)
  // K = 상품 페이지 링크(글자는 플랫폼: 쿠팡·네이버·올리브영·토스 …). 택배시트 링크는 아래 줄 월급시트 옆에 하나만 (사용자 요청 10/21)
  const head = ['진행일', '방제', '상태', '의뢰 총건수', '그날 목표', '신청', '남은', '마감 시각', '명단', '폼', '상품', '틀린 옵션', '택배 옮김', '확인 필요'];
  let obNotices = []; try { const ob0 = outboxSheet_(), ol0 = ob0.getLastRow(); if (ol0 >= 2) obNotices = ob0.getRange(2, 4, ol0 - 1, 2).getValues().filter(function (v) { return /🐥\s*상품번호/.test(String(v[1])); }); } catch (e) {}
  // 칸마다 남아 있던 메모(clear로는 안 지워져서 줄이 바뀌면 엉뚱한 칸에 보임)는 다 지움
  try { sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).clearNote(); } catch (e) {}
  let errs = {};
  try { errs = JSON.parse(props.getProperty('RUN_ERRORS') || '{}'); } catch (e) {}
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#efe6f7');
  const payUrl = CONFIG.PAY_SHEET_ID ? 'https://docs.google.com/spreadsheets/d/' + CONFIG.PAY_SHEET_ID + '/edit#gid=' + CONFIG.PAY_TAB_GID : '';
  // 아래 덩어리 자리 먼저 계산 (위 표 '틀린 옵션'이 덩어리의 옵션 확인 칸을 셈). 위 표 아래 줄 다음에 '리뷰 취합할 것' 칸이 있으면 그만큼 아래로
  let row = runs.length + 4 + (rvItems.length ? rvItems.length + 2 : 0);
  show.forEach(function (id) {
    const x = sheets[id];
    x.top = row;
    // 택배시트 칸 순서 그대로 (A 시간, B 이름, C 아이디, D 전화, E 주소, F 옵션, G 금액, H~J 빈칸, K 업체+상품) → 그대로 복사해서 붙여넣기
    //  그 뒤에 나머지 질문(닉네임, 주문번호 등), 맨 끝에 옵션 확인
    const find = function (re, not) { return x.hd.findIndex(function (h) { return h && re.test(h) && !(not && not.test(h)) && !MATCH.account.test(h); }) + 1; };
    //  택대가 아니면 택배시트에 옮길 게 없으니 H~K(택배 상품)는 빼고 A~G 다음에 나머지 질문
    x.tak = x.runs.some(function (r) { return r['택대'] === 'Y'; });
    const T = [['타임스탬프', 1], ['이름', find(MATCH.name)], ['아이디', find(/아이디|계정(?!명)|이메일/)], ['전화번호', find(/전화|연락처|휴대폰|핸드폰/)],
      ['주소', find(/주소/, /이메일/)], ['옵션', find(MATCH.opt, MATCH.nick)], ['결제금액', find(/결제\s*금액|금액|가격/)]]
      .concat(x.tak ? [['', 0], ['', 0], ['', 0], ['택배 상품', 'K']] : []);
    const used = T.map(function (t) { return t[1]; });
    const rest = (x.keep.length ? x.keep : []).filter(function (c) { return used.indexOf(c) === -1; });
    x.layout = T.concat(rest.map(function (c) { return [x.hd[c - 1], c]; }));
    const at = function (src) { return x.layout.findIndex(function (t) { return t[1] === src && src; }) + 1; };
    x.nick = at(find(MATCH.nick));
    x.opt = T[5][1] ? 6 : 0;
    x.chk = x.nick && x.opt ? x.layout.length + 1 : 0;
    // 택배 상품 = 업체명 + 상품 짧은 이름 (옵션 글자나 결제금액으로 어느 상품인지 찾음)
    x.prods = [];
    try { x.prods = noticeProducts_(FormApp.openById(x.runs[0]['폼ID']).getDescription()); } catch (e) {}
    x.shop = String(x.runs[0]['업체'] || (x.prods[0] || {}).shop || '').replace(/\s+/g, '');
    // 판매 상품 이름: 방제의 상품명(업체명, '외' 뺌) 예) 고구마말랭이, 옥광밤. 상품이 여럿이면 공지의 상품마다 이름
    x.item = campOf_(x.runs[x.runs.length - 1]['명단 제목']).replace(/\s+/g, '');
    if (x.shop && x.item.indexOf(x.shop) === 0) x.item = x.item.slice(x.shop.length);
    x.item = x.item.replace(/실(배송)?$/, '').replace(/외$/, '');
    row += x.n + 4;
  });
  const fmt = function (t) { return 'DATE(' + Utilities.formatDate(new Date(t), CONFIG.TIMEZONE, 'yyyy,M,d') + ')'; };
  runs.forEach(function (r, i) {
    const rr = i + 2, x = sheets['b' + i];
    // 기대평은 건수로 (의뢰 총건수 405, 그날 목표·신청 = 사람 × 그 주 건수, 사용자 요청 10/24)
    const per = isExpect_(r) ? expPer_(r) : cartN_(r), mixDay = isExpect_(r) && !!EXP_MIX[dateTok_(r['명단 제목'])];   // A·B묶음 섞인 기대평 날은 건수를 직접 셈 (10/26)
    sh.getRange(rr, 1, 1, 5).setValues([[r['진행일'], String(r['명단 제목']).replace(/\s*\([^)]*\)\s*$/, ''), dashStatus_(r), isExpect_(r) ? EXP_LINKS.length * 15 : ((Number(r['총건수']) || 0) * per || ''), (mixDay ? expCount_(r, Number(r['목표인원']) || 0, allRuns) : (Number(r['목표인원']) || 0) * per) || r['목표인원']]]);
    const w = windowOf_(allRuns, r);
    const ts = 'IMPORTRANGE(' + q(x.url) + ',' + q(x.ref + 'A' + x.start + ':A') + ')';
    // 명단 시트 하나를 여러 날이 같이 쓰면 그날 몫(진행일 0시 ~ 다음 진행 0시)만 셈
    if (mixDay) sh.getRange(rr, 6).setValue(expCount_(r, Number(r['인원']) || 0, allRuns));
    else sh.getRange(rr, 6).setFormula(w.shared
      ? '=IFERROR(' + (per > 1 ? per + '*' : '') + 'LET(v,' + ts + ',SUMPRODUCT(ISNUMBER(v)*(v>=' + (w.from ? fmt(w.from) : 0) + ')*(v<' + (isFinite(w.to) ? fmt(w.to) : 99999) + '))),"허용 필요")'
      : '=IFERROR(' + (per > 1 ? per + '*' : '') + 'SUMPRODUCT(ISNUMBER(' + ts + ')),"허용 필요")');   // 응답 없는 새 명단 시트는 빈 글자("")가 와서 COUNTA면 1로 셈 → 날짜(타임스탬프)만 셈
    sh.getRange(rr, 7).setFormula('=IF(ISNUMBER(F' + rr + '),E' + rr + '-F' + rr + ',"")');
    sh.getRange(rr, 8).setValue(r['마감 시각']);
    sh.getRange(rr, 9).setFormula('=HYPERLINK(' + q(x.url) + ',"명단")');
    if (r['폼 링크']) sh.getRange(rr, 10).setFormula('=HYPERLINK(' + q(r['폼 링크']) + ',"폼")');
    { const pp = purlOf_(r, props, obNotices), pu = pp.url, pl = pp.plat;
      if (pu) sh.getRange(rr, 11).setFormula('=HYPERLINK(' + q(pu) + ',' + q(pl || '상품') + ')'); else if (pl) sh.getRange(rr, 11).setValue(pl); }
    // 택대면 '택배 옮김' 체크 (명단을 택배시트에 옮겨 적었으면 체크, 2시 전까지). 체크하면 진행목록에도 저장
    if (r['택대'] === 'Y') sh.getRange(rr, 13).insertCheckboxes().setValue(r['택배 옮김'] === true);
    if (errs[r['명단 제목']]) sh.getRange(rr, 14).setValue('⚠ ' + errs[r['명단 제목']]).setFontColor('#b91c1c');
    if (x.chk) {
      const c = colLetter_(x.chk), rg = c + (x.top + 2) + ':' + c + (x.top + 1 + x.n);
      sh.getRange(rr, 12).setFormula('=COUNTIF(' + rg + ',"옵션 틀림")+COUNTIF(' + rg + ',"초과 구매")');
    }
  });
  // 위 표 바로 아래 줄(왼쪽): 진행 도우미 체크(시트 오른쪽에 열림), 휴대폰용 링크, 마지막 확인 결과
  const bar = runs.length + 2;
  props.setProperty('DASH_BAR_ROW', String(bar));
  sh.getRange(bar, 1).insertCheckboxes().setValue(false);
  sh.getRange(bar, 1, 1, 2).setBackground('#efe6f7');
  sh.getRange(bar, 2).setValue('◀ 체크하면 진행 도우미가 시트 오른쪽에 열려요').setFontWeight('bold').setFontColor('#5b2a86').setHorizontalAlignment('left');
  if (CONFIG.WEBAPP_URL) sh.getRange(bar, 4).setFormula('=HYPERLINK(' + q(toolsUrl_()) + ',"휴대폰: ▶ 진행 도우미")').setFontWeight('bold').setHorizontalAlignment('left');
  if (payUrl) sh.getRange(bar, 6).setFormula('=HYPERLINK(' + q(payUrl) + ',"▶ 월급시트")').setFontWeight('bold').setHorizontalAlignment('left');
  if (CONFIG.TAKBAE_SHEET_URL) sh.getRange(bar, 7).setFormula('=HYPERLINK(' + q(CONFIG.TAKBAE_SHEET_URL) + ',"▶ 택배시트")').setFontWeight('bold').setHorizontalAlignment('left');
  try { sh.getRange(bar, 8).setValue(String(props.getProperty('LAST_REPORT') || '')).setFontWeight('bold').setHorizontalAlignment('left').setWrap(false); } catch (e) {}
  // 리뷰 취합할 것 (사용자 요청 10/24, 10/26부터 의뢰 단위만): 의뢰 리뷰가 다 끝나면 '캡처 올리기 → 업체에 보내기' 줄 → 보내면 체크. 체크하고 3일 뒤 사라짐
  const rvMap = {};
  if (rvItems.length) {
    const rt = bar + 2;
    sh.getRange(rt, 1, 1, 5).setValues([['보냄', '리뷰 취합할 것 (의뢰 리뷰가 다 끝난 것 · 업체에 보내면 체크 → 3일 뒤 사라짐)', '체크한 날', '명단', '사진 올릴 곳']]).setFontWeight('bold').setBackground('#e6f4ea');
    rvItems.forEach(function (it, i) {
      const rr = rt + 1 + i;
      rvMap[rr] = it.type === 'req' ? { type: 'req', sid: it.sid } : { type: 'day', title: it.title };
      sh.getRange(rr, 1).insertCheckboxes().setValue(!!it.at);
      sh.getRange(rr, 2).setValue(it.label).setHorizontalAlignment('left');
      if (it.type === 'req') sh.getRange(rr, 2).setFontWeight('bold').setFontColor('#1e5631');
      if (it.at) sh.getRange(rr, 3).setValue(new Date(it.at + 'T00:00:00')).setNumberFormat('M/d');
      if (it.sheet) sh.getRange(rr, 4).setFormula('=HYPERLINK(' + q(it.sheet) + ',"명단")');
      if (it.folder) sh.getRange(rr, 5).setFormula('=HYPERLINK(' + q(it.folder) + ',' + q(it.type === 'req' ? '리뷰이미지' : '폴더') + ')');
    });
    sh.getRange(rt, 1, rvItems.length + 1, 5).setBorder(true, true, true, true, true, true, '#cfe8d6', SpreadsheetApp.BorderStyle.SOLID).setVerticalAlignment('middle');
  }
  props.setProperty('DASH_RV', JSON.stringify(rvMap));
  // 월급시트·진행 도우미 링크는 위 표 바로 아래 줄에만 (O1, P1은 비움)
  if (runs.length) {
    // 위 표 보기 좋게: 가운데 맞춤, 방제는 왼쪽, 테두리
    sh.getRange(1, 1, runs.length + 1, head.length).setHorizontalAlignment('center').setVerticalAlignment('middle')
      .setBorder(true, true, true, true, true, true, '#d9d2e9', SpreadsheetApp.BorderStyle.SOLID);
    sh.getRange(2, 2, runs.length, 1).setHorizontalAlignment('left');
    sh.getRange(2, 14, runs.length, 1).setHorizontalAlignment('left');
    sh.setRowHeight(1, 28);
    sh.getRange(2, 1, runs.length, 1).setNumberFormat('M/d');
    sh.getRange(2, 4, runs.length, 4).setNumberFormat('0');   // 총건수, 그날 목표, 신청, 남은은 숫자로 (날짜로 보이지 않게)
    sh.getRange(2, 8, runs.length, 1).setNumberFormat('M/d HH:mm');
  }
  // 아래: 명단 내용 (중복, 금액, 옵션 확인 표시는 여기서만. 명단 시트는 업체도 봐서 깨끗하게 둠)
  const rules = [];
  const A = "'" + ASSIGN_TAB + "'!";
  show.forEach(function (id) {
    const x = sheets[id], top = x.top, n = x.n, width = Math.max(x.layout.length + (x.chk ? 1 : 0), 6);
    const titles = x.runs.map(function (r) { return String(r['명단 제목']).replace(/\s*\([^)]*\)\s*$/, ''); }).reverse();
    sh.getRange(top, 1, 1, width).setBackground('#f0e8f8');
    // 제목 + 안 산 사람 (관리 시트 배정 탭에서 '아직'인 사람, 응답이 들어오면 바로 바뀜)
    const label = '■ ' + titles[0] + '   (명단 시트: ' + sheetName_(titles[0]) + ')';
    const rt = String(x.runs[0]['명단 제목']).replace(/"/g, '""');
    sh.getRange(top, 1).setFormula('=' + q(label) + '&IFERROR("   ▶ 안 산 사람: "&TEXTJOIN(" ",TRUE,FILTER(' + A + 'B2:B&IF(' + A + 'F2:F="아직 1","","("&MID(' + A + 'F2:F,4,9)&"건)"),' + A + 'A2:A="' + rt + '",LEFT(' + A + 'F2:F,2)="아직")),"")')
      .setFontWeight('bold');
    const width2 = x.layout.length + (x.chk ? 1 : 0);
    const c = function (k) { return 'CHOOSECOLS(e,' + k + ')'; };
    const blank = 'MAKEARRAY(ROWS(e),1,LAMBDA(rr,cc,""))';
    const prodOf = function () {
      if (x.prods.length <= 1) return q(x.item || (x.prods[0] || {}).name || '');
      let f = '""';
      if (x.layout[6][1]) {
        const nn = 'IFERROR(VALUE(REGEXREPLACE(TO_TEXT(pp),"[^0-9]","")),0)';
        x.prods.slice().reverse().forEach(function (p) { if (p.prices.length) f = 'IF(OR(' + p.prices.map(function (v) { return nn + '=' + v; }).join(',') + '),' + q(p.name) + ',' + f + ')'; });
      }
      x.prods.slice().reverse().forEach(function (p) { f = 'IF(REGEXMATCH(TO_TEXT(oo),' + q(p.name) + '),' + q(p.name) + ',' + f + ')'; });
      return f;
    };
    const kcol = 'MAP(' + c(x.layout[5][1] || 1) + ',' + c(x.layout[6][1] || 1) + ',LAMBDA(oo,pp,TRIM(' + q(x.shop) + '&" "&' + prodOf() + ')))';
    // 전화번호는 010-0000-0000 (택배시트에 하이픈 없이 붙으면 오류, 10/23). 숫자로 들어와 앞 0이 빠진 것도
    const phoneCol = function (k) { return 'MAP(' + c(k) + ',LAMBDA(v,LET(dg,REGEXREPLACE(TO_TEXT(v),"[^0-9]",""),dgt,IF(AND(LEN(dg)=10,LEFT(dg,1)="1"),"0"&dg,dg),IF(AND(LEN(dgt)=11,LEFT(dgt,2)="01"),LEFT(dgt,3)&"-"&MID(dgt,4,4)&"-"&RIGHT(dgt,4),IF(AND(LEN(dgt)=10,LEFT(dgt,2)="01"),LEFT(dgt,3)&"-"&MID(dgt,4,3)&"-"&RIGHT(dgt,4),v)))))'; };
    const parts = x.layout.map(function (t) { return t[1] === 'K' ? kcol : t[0] === '전화번호' && t[1] ? phoneCol(t[1]) : t[1] ? c(t[1]) : blank; });
    const imp = 'IMPORTRANGE(' + q(x.url) + ',' + q(x.ref + 'A' + x.start + ':' + colLetter_(x.cols)) + ')';   // 시트 전체를 가져와 그날 것만 거름
    sh.getRange(top + 1, 1, 1, x.layout.length).setValues([x.layout.map(function (t) { return t[0]; })]);
    const dt = function (t) { return isFinite(t) && t > 0 ? 'DATE(' + Utilities.formatDate(new Date(t), CONFIG.TIMEZONE, 'yyyy,M,d') + ')' : (t > 0 ? '99999' : '0'); };
    const inWin = '(INDEX(d,0,1)<>"")*(INDEX(d,0,1)>=' + dt(x.from) + ')*(INDEX(d,0,1)<' + dt(x.to) + ')';
    sh.getRange(top + 2, 1).setFormula('=IFERROR(LET(d,' + imp + ',IF(COUNTA(INDEX(d,0,1))=0,"",IFERROR(LET(e,FILTER(d,' + inWin + '),HSTACK(' + parts.join(',') + ')),""))),"이 칸을 눌러 액세스 허용을 한 번 눌러 주세요")');
    sh.getRange(top + 1, 1, 1, Math.max(width2, 6)).setFontWeight('bold').setBackground('#faf7fd');
    // 보기 좋게: 가운데 맞춤, 제목 줄은 왼쪽, 머리글 굵게, 테두리
    // 머리글 줄은 가운데, 명단 줄은 왼쪽 맞춤
    sh.getRange(top + 1, 1, n + 1, Math.max(width2, 6)).setHorizontalAlignment('left').setVerticalAlignment('middle')
      .setBorder(true, true, true, true, true, false, '#d9d2e9', SpreadsheetApp.BorderStyle.SOLID);
    sh.getRange(top + 1, 1, 1, Math.max(width2, 6)).setWrap(true).setHorizontalAlignment('center');
    sh.setRowHeight(top, 28);
    sh.getRange(top, 1).setHorizontalAlignment('left').setFontSize(11);
    sh.getRange(top + 2, 1, n, 1).setNumberFormat('M/d HH:mm');
    const r0 = top + 2, r1 = top + 1 + n;
    const colRange = function (k) { return sh.getRange(r0, k, n, 1); };
    if (x.chk) {
      const L = function (k) { return colLetter_(k) + r0 + ':' + colLetter_(k) + r1; };
      sh.getRange(top + 1, x.chk).setValue(CHECK_HEAD); void('관리 시트 배정 탭과 비교. ✔ 맞음 / 옵션 틀림 / 초과 구매 / 닉네임 확인(배정에 없음) / 취소한 사람. 배정이 없으면 빈칸');
      sh.getRange(r0, x.chk).setFormula(checkFormula_(L(x.nick), L(x.opt), n, x.sid, String(x.runs[0]['명단 제목'])));
      const X = colLetter_(x.chk);
      const rg = [x.nick, x.opt, x.chk].map(colRange);
      rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=OR($' + X + r0 + '="옵션 틀림",$' + X + r0 + '="초과 구매")')
        .setBackground('#ea9999').setFontColor('#7f0000').setBold(true).setRanges(rg).build());
      rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=OR($' + X + r0 + '="닉네임 확인",$' + X + r0 + '="취소한 사람")').setBackground('#ffe599').setRanges(rg).build());
    }
    // 중복 빨간색: 한 명단 시트 안에서 계정(아이디), 전화번호, 주소 중 하나라도 겹치면 (이름은 동명이인이 많아서 뺌)
    x.layout.forEach(function (t, k) {
      if (typeof t[1] !== 'number' || !t[1]) return;
      const h = x.hd[t[1] - 1] || '', L = colLetter_(k + 1);
      if (MATCH.dup.test(h) && !MATCH.account.test(h)) {
        rules.push(SpreadsheetApp.newConditionalFormatRule()
          .whenFormulaSatisfied('=AND(' + L + r0 + '<>"",COUNTIF($' + L + '$' + r0 + ':$' + L + '$' + r1 + ',' + L + r0 + ')>1)')
          .setBackground('#ea9999').setFontColor('#7f0000').setBold(true).setRanges([colRange(k + 1)]).build());
      }
    });
    // 결제금액이 가이드 가격과 다르면 주황색
    const prices = [];
    x.prods.forEach(function (p) { p.prices.forEach(function (v) { if (prices.indexOf(v) === -1) prices.push(v); }); });
    (String(x.runs[0]['가격'] || '').match(/\d{3,}/g) || []).forEach(function (v) { v = Number(v); if (prices.indexOf(v) === -1) prices.push(v); });
    // 옵션마다 가격을 알면(배정 탭) 그 옵션 가격과 비교 (10/27: 상품 여럿이면 다른 상품 가격과 같기만 해도 넘어가던 것)
    const pm = optPriceMap_(x.runs.map(function (m) { return String(m['명단 제목']); }), x.sid), pc = Object.keys(pm);
    if ((prices.length || pc.length) && x.layout[6][1]) {
      const num = 'VALUE(REGEXREPLACE(TO_TEXT(G' + r0 + '),"[^0-9]",""))', F = 'TRIM(F' + r0 + ')';
      const any = prices.length ? 'NOT(OR(' + prices.map(function (v) { return num + '=' + v; }).join(',') + '))' : 'FALSE';
      const byOpt = pc.length && x.layout[5] && x.layout[5][1] ? 'IF(OR(' + pc.map(function (c) { return F + '=' + q(c); }).join(',') + '),NOT(OR(' + pc.map(function (c) { return 'AND(' + F + '=' + q(c) + ',OR(' + [1, 2, 3].map(function (k) { return num + '=' + pm[c] * k; }).join(',') + '))'; }).join(',') + ')),' + any + ')' : any;
      rules.push(SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied('=AND(G' + r0 + '<>"",' + byOpt + ')')
        .setBackground('#f9cb9c').setFontColor('#7a3a00').setRanges([colRange(7)]).build());
    }
  });
  // 상태·숫자 칸은 좁게 (아래 명단 덩어리 C·D·F·G 칸은 글자가 잘리면 칸을 늘려 보세요, 사용자 요청 10/21)
  [[1, 95], [2, 240], [3, 80], [4, 70], [5, 220], [6, 55], [7, 55]].forEach(function (w) { sh.setColumnWidth(w[0], w[1]); });
  if (runs.length) {
    // 남은이 0이 아니면 빨간 굵은 글씨
    rules.unshift(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND(ISNUMBER(G2),G2<>0)').setFontColor('#d00000').setBold(true).setRanges([sh.getRange(2, 7, runs.length, 1)]).build());
    // 빨간 글씨인 '남은' 칸도 오늘·다음 진행일 색은 칠함 (규칙은 먼저 맞는 하나만 적용돼서 합친 규칙을 앞에, 10/21)
    const gR = sh.getRange(2, 7, runs.length, 1), hs = '{' + holidaySerials_().join(',') + '}';
    rules.unshift(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND(ISNUMBER(G2),G2<>0,INT($A2)=WORKDAY(TODAY(),1,' + hs + '))').setFontColor('#d00000').setBold(true).setBackground('#cfe2f3').setRanges([gR]).build());
    rules.unshift(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND(ISNUMBER(G2),G2<>0,INT($A2)=TODAY())').setFontColor('#d00000').setBold(true).setBackground('#d9ead3').setRanges([gR]).build());
    // 상태가 진행완료면 회색
    rules.unshift(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('진행완료').setBackground('#d9d9d9').setFontColor('#666666').setRanges([sh.getRange(2, 3, runs.length, 1)]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0).setBackground('#ea9999').setFontColor('#7f0000').setBold(true).setRanges([sh.getRange(2, 12, runs.length, 1)]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND(ISLOGICAL(M2),M2=FALSE)').setBackground('#ea9999').setRanges([sh.getRange(2, 13, runs.length, 1)]).build());
    // 오늘 진행 = 연두, 다음 진행일(금요일이면 월요일, 공휴일도 건너뜀) = 하늘색. 수식이라 날이 바뀌면 저절로 바뀜 (사용자 요청 10/20). 위 빨간 표시가 먼저
    //  공휴일은 스크립트의 공휴일 목록(KR_HOLIDAYS + CONFIG.EXTRA_HOLIDAYS)을 날짜 숫자로 WORKDAY에 넣음
    const top = sh.getRange(2, 1, runs.length, head.length);
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=INT($A2)=TODAY()').setBackground('#d9ead3').setRanges([top]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=INT($A2)=WORKDAY(TODAY(),1,{' + holidaySerials_().join(',') + '})').setBackground('#cfe2f3').setRanges([top]).build());
  }
  // 명단 줄 번갈아 연한 색 (읽기 쉽게, 다른 표시보다 약하게 맨 뒤에)
  show.forEach(function (id) {
    const x = sheets[id];
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($A' + (x.top + 2) + '<>"",ISEVEN(ROW()))').setBackground('#f6f4fb')
      .setRanges([sh.getRange(x.top + 2, 1, x.n, Math.max(x.layout.length + (x.chk ? 1 : 0), 6))]).build());
  });
  // 공휴일 넣은 다음 진행일 색 규칙이 안 먹으면(시트가 수식을 거부) 그 규칙만 공휴일 없이
  try { sh.setConditionalFormatRules(rules); }
  catch (e) {
    note_('한눈에 색 규칙 공휴일 빼고 다시: ' + e.message);
    sh.setConditionalFormatRules(rules.map(function (r) {
      const c = r.getBooleanCondition(), f = c ? String((c.getCriteriaValues() || [])[0] || '') : '';
      return /WORKDAY\(TODAY\(\),1,\{/.test(f) ? SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(f.replace(/,\{[^}]*\}/, '')).setBackground('#cfe2f3').setRanges(r.getRanges()).build() : r;
    }));
  }
  props.setProperty('DASH_SIG', sig);
  props.setProperty('DASH_TITLES', JSON.stringify(runs.map(function (r) { return bareTitle_(r['명단 제목']); })));
}

/* ---------------- 11) 최신 버전 바로 받기 ---------------- */
// 코드는 로더가 10분마다 새로 받아 옴. 바로 받고 싶을 때 메뉴에서 이걸 누르면 캐시를 지움

function removeOldUpdateTrigger_() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'autoUpdate') ScriptApp.deleteTrigger(t); });
}

function updateNow() {
  try { CacheService.getScriptCache().removeAll(['ori_src_n', 'ori_src_0', 'ori_src_1']); } catch (e) {}
  SpreadsheetApp.getUi().alert('최신 버전을 받도록 했어요. 다음 실행부터 바로 새 버전으로 돌아가요.');
}

/* ---------------- 12) 오래된 줄 정리 (매일 9시) ---------------- */
// 진행일이 6개월(CONFIG.ARCHIVE_DAYS, 기본 180일) 지난 진행은 진행목록에서 숨긴 '보관' 탭으로 옮김 (지우지 않음, 폼과 시트 파일도 그대로)
// 보낼메시지는 보냄 처리된 지 30일 지난 줄, 일정은 끝난 지 30일 지난 줄을 지움

function archiveOld_() {
  const days = Number(CONFIG.ARCHIVE_DAYS) || 180;
  const list = ensureListSheet_();
  const runs = readRuns_();
  const old = runs.filter(function (r) { return r['진행일'] instanceof Date && (today_() - r['진행일']) / 864e5 > days; });
  if (old.length) {
    const ss = adminSs_();
    let ar = ss.getSheetByName('보관');
    if (!ar) {
      ar = ss.insertSheet('보관');
      ar.getRange(1, 1, 1, LIST_HEADER.length).setValues([LIST_HEADER]).setFontWeight('bold');
      ar.setFrozenRows(1);
      ar.hideSheet();
    }
    const vals = list.getRange(2, 1, list.getLastRow() - 1, LIST_HEADER.length).getValues();
    old.forEach(function (r) { ar.appendRow(vals[r.row - 2]); });
    old.map(function (r) { return r.row; }).sort(function (a, b) { return b - a; }).forEach(function (row) { list.deleteRow(row); });
  }
  const cut = new Date(Date.now() - 30 * 864e5);
  const ob = outboxSheet_();
  if (ob.getLastRow() >= 2) {
    const v = ob.getRange(2, 1, ob.getLastRow() - 1, 6).getValues();
    for (let i = v.length - 1; i >= 0; i--) if (v[i][5] === '보냄' && v[i][1] instanceof Date && v[i][1] < cut) ob.deleteRow(i + 2);
  }
  const pl = planSheet_();
  if (pl.getLastRow() >= 2) {
    const v = pl.getRange(2, 1, pl.getLastRow() - 1, PLAN_HEAD.length).getValues();
    for (let i = v.length - 1; i >= 0; i--) if (v[i][8] !== '대기' && v[i][3] instanceof Date && v[i][3] < cut) pl.deleteRow(i + 2);
  }
}

/* ---------------- 기대평 댓글 진행 (10/23 100발100중 = 백발백중 도서, 구매 없음) ----------------
 * 한 사람이 아래 27개 링크에 기대평을 다 씀 = 1명 27건. 하루 1~2명, 10/26~11/6(진행일 10일) 총 15명
 * 방제는 '건수'로 (사용자 요청 10/23): 10.26 백발백중 도서 기대평 54 (2명 × 27건). # 없음 (입금대행 아님). 진행목록 목표인원은 사람 수
 * 폼: 계정명(이름), 예스24·알라딘·교보문고 아이디(따로), 리뷰비 계좌, 기대평 댓글 리뷰비(총 27건, 27,000원 하나). 캡처는 카톡방으로 받음
 */
const EXP_PER = 27;
const EXP_LINKS = [
  ['예스24', '짱 수학서술형 1-1', 'https://www.yes24.com/product/goods/196262050'],
  ['예스24', '짱 수학서술형 2-1', 'https://www.yes24.com/product/goods/196262218'],
  ['예스24', '짱 수학서술형 3-1', 'https://www.yes24.com/product/goods/196262221'],
  ['예스24', '짱 개념수학 1-1', 'https://www.yes24.com/product/goods/196346549'],
  ['예스24', '짱 개념수학 2-1', 'https://www.yes24.com/product/goods/196346560'],
  ['예스24', '짱 개념수학 3-1', 'https://www.yes24.com/product/goods/196346563'],
  ['예스24', '짱 개념연산 1-1', 'https://www.yes24.com/product/goods/196217934'],
  ['예스24', '짱 개념연산 2-1', 'https://www.yes24.com/product/goods/196218068'],
  ['예스24', '짱 개념연산 3-1', 'https://www.yes24.com/product/goods/196218268'],
  ['알라딘', '짱 수학서술형 1-1', 'https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=401820897'],
  ['알라딘', '짱 수학서술형 2-1', 'https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=401821538'],
  ['알라딘', '짱 수학서술형 3-1', 'https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=401821289'],
  ['알라딘', '짱 개념수학 1-1', 'https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=401984016'],
  ['알라딘', '짱 개념수학 2-1', 'https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=401983343'],
  ['알라딘', '짱 개념수학 3-1', 'https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=401983620'],
  ['알라딘', '짱 개념연산 1-1', 'https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=401750548'],
  ['알라딘', '짱 개념연산 2-1', 'https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=401751607'],
  ['알라딘', '짱 개념연산 3-1', 'https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=401751748'],
  ['교보문고', '짱 수학서술형 1-1', 'https://product.kyobobook.co.kr/detail/S000221248813'],
  ['교보문고', '짱 수학서술형 2-1', 'https://product.kyobobook.co.kr/detail/S000221248819'],
  ['교보문고', '짱 수학서술형 3-1', 'https://product.kyobobook.co.kr/detail/S000221248826'],
  ['교보문고', '짱 개념수학 1-1', 'https://product.kyobobook.co.kr/detail/S000221268619'],
  ['교보문고', '짱 개념수학 2-1', 'https://product.kyobobook.co.kr/detail/S000221268625'],
  ['교보문고', '짱 개념수학 3-1', 'https://product.kyobobook.co.kr/detail/S000221268629'],
  ['교보문고', '짱 개념연산 1-1', 'https://product.kyobobook.co.kr/detail/S000221237525'],
  ['교보문고', '짱 개념연산 2-1', 'https://product.kyobobook.co.kr/detail/S000221237576'],
  ['교보문고', '짱 개념연산 3-1', 'https://product.kyobobook.co.kr/detail/S000221237983']
];
const EXP_SLOT = '★★★자정 ~ 오전 8시 20분 작성·제출★★★';   // 사용자 요청 10/23
// 업체 요청 '매주 개인당 13~14건' (10/23): 한 사람이 두 번에 나눠 씀. 1주차(10/26~11/1) A묶음 14건, 2주차(11/2~11/8) B묶음 13건
//  묶음은 플랫폼·교재가 고르게: A = 예스24 1~5, 알라딘 1~5, 교보문고 1~4 / B = 예스24 6~9, 알라딘 6~9, 교보문고 5~9. 건당 1,000원
const EXP_SETS = {
  A: EXP_LINKS.filter(function (x) { const i = EXP_LINKS.filter(function (y) { return y[0] === x[0]; }).indexOf(x); return x[0] === '교보문고' ? i < 4 : i < 5; }),
  B: EXP_LINKS.filter(function (x) { const i = EXP_LINKS.filter(function (y) { return y[0] === x[0]; }).indexOf(x); return x[0] === '교보문고' ? i >= 4 : i >= 5; })
};
function expFee_(set) { const n = EXP_SETS[set].length; return '총 ' + n + '건, ' + (n * 1000).toLocaleString('en-US') + '원'; }
// 폼 '기대평 댓글 리뷰비' 보기 (10/26 A·B묶음: 예전 '1주차/2주차' 글은 같은 날 A·B가 섞이면서 헷갈려서 바꿈. 금액은 같음)
function expFeeCh_() { return ['A묶음 ' + expFee_('A'), 'B묶음 ' + expFee_('B')]; }
function expNotice_(set) {
  // 사용자가 고친 글 그대로 (10/23). 사업자 줄 없음. 맨 위 시간 줄, 예스24 한줄평 50자·알라딘 마이리뷰 안내 (사용자 요청 10/26)
  const links = EXP_SETS[set], wk = set === 'A' ? '1주차' : '2주차', n = links.length;
  const L = ['★★★자정 ~ 오전 8시 20분까지 작성★★★', '※구매 아님! 아래 링크 ' + n + '개에 기대평 댓글만 작성해주세요 (' + wk + ')※', '',
    '▶ 공백 제외 100~150자 이상, 긍정적인 기대평 (예스24는 한줄평이 50자까지만 써져서 50자 꽉 채워서)',
    '▶ 알라딘은 100자평 말고 "마이리뷰"로 써 주세요',
    '▶ "구매했다"는 내용 금지 금지 금지 !!!!! → 구매하고 싶다 or 기대된다는 내용으로 부탁드려요',
    '▶ 짧은 기대평 or 복붙 같은 글 금지 금지 금지 !!!!! (교재마다 다르게)',
    '▶ ' + n + '개 다 작성 후 캡처해서 [당일 바로] 카톡방에 올려주세요!',
    '▶ [' + wk + '] 리뷰비는 ' + expFee_(set) + ' 입니다.', '',
    '☆★☆★ 양식 작성 폼 ☆★☆★', '(구글폼 링크)', '',
    '🐥교재별로 넣을 내용🐥',
    '[짱 개념연산] 시험에 자주 나오는 연산 유형 집중 대비 / 개념 문제로 내신 대비·연산 실력 향상 / 빠르고 정확한 연산 연습에 좋을 것 같아 써 보고 싶다',
    '[짱 수학서술형] 서술형 기출·내신·수행평가 대비 / 기본 서술형부터 변형문제, 쌍둥이 문제로 반복 학습 / 서술형 대비에 유용할 것 같아 풀어 보고 싶다',
    '[짱 개념수학] 시험에 필요한 개념과 유형을 체계적으로 / 개념북 세분화 학습 + 익힘북 반복·복습 / 개념부터 유형까지 확실히 대비할 것 같아 풀어 보고 싶다'];
  ['예스24', '알라딘', '교보문고'].forEach(function (pl) {
    const xs = links.filter(function (x) { return x[0] === pl; });
    if (!xs.length) return;
    L.push('', '🐥' + pl + ({ 예스24: ' (한줄평 50자 꽉 채우기, 한두 줄 짧은 글은 안 돼요)', 알라딘: ' (100자평 말고 마이리뷰로)' }[pl] || ''));
    xs.forEach(function (x, i) { L.push((i + 1) + '. ' + x[1] + ' ' + x[2]); });
  });
  return L.join('\n');
}
// 기대평 공지 (A·B묶음 같이, 사용자 요청 10/26): 하루 3계정이 A묶음(14개)·B묶음(13개)을 나눠 매일 27개 링크가 다 나가게.
//  who = { A: '윤주영 2계정', B: '신규 1계정' }처럼 누가 어느 묶음인지 (없으면 인원만)
function expNoticeMix_(a, b, who) {
  who = who || {};
  const nA = EXP_SETS.A.length, nB = EXP_SETS.B.length;
  const part = function (k, n, cnt) { return k + '묶음(' + n + '개 링크) ' + cnt + '명' + (who[k] ? ' - ' + who[k] : ''); };
  const L = ['★★★자정 ~ 오전 8시 20분까지 작성★★★', '※구매 아님! 아래 링크에 기대평 댓글만 작성해주세요※', '',
    '▶ 오늘: ' + [a ? part('A', nA, a) : '', b ? part('B', nB, b) : ''].filter(Boolean).join(' / '),
    '▶ 한 계정은 한 주에 한 묶음만! 다음 주에 같은 계정으로 나머지 묶음을 한 번 더 해 주세요',
    '▶ 폼에서 \'' + EXP_SET_Q + '\'(A 또는 B)을 꼭 골라 주세요',
    '▶ 공백 제외 100~150자 이상, 긍정적인 기대평 (예스24는 한줄평이 50자까지만 써져서 50자 꽉 채워서)',
    '▶ 알라딘은 100자평 말고 "마이리뷰"로 써 주세요',
    '▶ "구매했다"는 내용 금지 금지 금지 !!!!! → 구매하고 싶다 or 기대된다는 내용으로 부탁드려요',
    '▶ 짧은 기대평 or 복붙 같은 글 금지 금지 금지 !!!!! (교재마다 다르게)',
    '▶ 다 작성 후 캡처해서 [당일 바로] 카톡방에 올려주세요!',
    '▶ 리뷰비: A묶음 ' + expFee_('A') + ' / B묶음 ' + expFee_('B'), '',
    '☆★☆★ 양식 작성 폼 ☆★☆★', '(구글폼 링크)', '',
    '🐥교재별로 넣을 내용🐥',
    '[짱 개념연산] 시험에 자주 나오는 연산 유형 집중 대비 / 개념 문제로 내신 대비·연산 실력 향상 / 빠르고 정확한 연산 연습에 좋을 것 같아 써 보고 싶다',
    '[짱 수학서술형] 서술형 기출·내신·수행평가 대비 / 기본 서술형부터 변형문제, 쌍둥이 문제로 반복 학습 / 서술형 대비에 유용할 것 같아 풀어 보고 싶다',
    '[짱 개념수학] 시험에 필요한 개념과 유형을 체계적으로 / 개념북 세분화 학습 + 익힘북 반복·복습 / 개념부터 유형까지 확실히 대비할 것 같아 풀어 보고 싶다'];
  [['A', '🔵'], ['B', '🟢']].forEach(function (s0) {
    const k = s0[0], links = EXP_SETS[k];
    if (!(k === 'A' ? a : b)) return;   // 그날 아무도 안 하는 묶음은 링크를 안 보임 (11.2는 B묶음만)
    L.push('', '', s0[1] + ' ' + k + '묶음 (' + links.length + '개 링크)' + (who[k] ? ' - ' + who[k] : ''));
    ['예스24', '알라딘', '교보문고'].forEach(function (pl) {
      const xs = links.filter(function (x) { return x[0] === pl; });
      if (!xs.length) return;
      L.push('', '🐥' + pl + ({ 예스24: ' (한줄평 50자 꽉 채우기, 한두 줄 짧은 글은 안 돼요)', 알라딘: ' (100자평 말고 마이리뷰로)' }[pl] || ''));
      xs.forEach(function (x, i) { L.push((i + 1) + '. ' + x[1] + ' ' + x[2]); });
    });
  });
  return L.join('\n');
}
function expDays_() {
  // 주말 빼고 (사용자 요청 10/23): 1주차 10/26~10/30 A묶음, 2주차 11/2~11/6 B묶음. 주마다 15명 = 하루 3명
  //  하루 3명씩 고르게 (10/23: 월요일만 5명은 많음 → 윤주영 5계정은 월 3 + 화 2로 나눔)
  const out = [], per = [3, 3, 3, 3, 3];
  [[new Date(2026, 9, 26), 'A'], [new Date(2026, 10, 2), 'B']].forEach(function (w) {
    per.forEach(function (n, k) { out.push({ d: new Date(w[0].getFullYear(), w[0].getMonth(), w[0].getDate() + k), n: n, set: w[1] }); });
  });
  return out;
}
function expTitle_(d, n, set) { return (d.getMonth() + 1) + '.' + String(d.getDate()).padStart(2, '0') + ' 백발백중 도서 기대평 ' + (n * EXP_SETS[set].length); }
// 기대평 한 사람 건수 = 그 진행 가격(리뷰비) / 1,000 (1주차 14, 2주차 13)
function expPer_(r) { return Math.round((Number((String(r && r['가격'] || '').replace(/,(?=\d{3})/g, '').match(/\d+/) || [])[0]) || EXP_PER * 1000) / 1000); }
// 기대평 하루 계획 (사용자 요청 10/26): 매일 27개 링크가 다 나가게 하루 3계정을 A묶음(14개)·B묶음(13개)으로 나눔.
//  한 계정은 한 주에 한 묶음, 다음 주에 같은 계정이 나머지 묶음 → 링크마다 15개 = 405건, 11/6까지. [A묶음 계정 수, B묶음 계정 수]
//  10.26(월)은 이미 A묶음 3계정(윤주영)으로 끝남. 다음 주는 이번 주 계정이 반대 묶음 + 10.26 계정 3은 B묶음
//  (10/27 사용자 요청) 2주차 = 1주차와 같은 요일에 같은 계정이 반대 묶음 → 11.2~11.6은 10.26~10.30을 뒤집은 것
const EXP_MIX = { '10.26': [3, 0], '10.27': [2, 1], '10.28': [1, 2], '10.29': [1, 2], '10.30': [2, 1], '11.2': [0, 3], '11.3': [1, 2], '11.4': [2, 1], '11.5': [2, 1], '11.6': [1, 2] };
// 2주차 날 공지에 넣을 사람 (1주차 같은 요일 사람이 반대 묶음)
const EXP_WHO = { '10.28': { A: '김미주', B: '임혜영 주은' }, '11.2': { B: '윤주영 3계정' }, '11.3': { A: '10.27 B묶음 하신 분', B: '윤주영 2계정' },
  '11.4': { A: '임혜영 주은', B: '김미주' }, '10.29': { A: '조아린', B: '김혜란 방윤아' }, '11.5': { A: '김혜란 방윤아', B: '조아린' }, '11.6': { A: '10.30 B묶음 하신 분', B: '10.30 A묶음 하신 2분' } };
const EXP_SET_Q = '작성한 링크 묶음', EXP_SET_CH = ['A묶음 (14개 링크)', 'B묶음 (13개 링크)'];
// 계획대로 n명이면 몇 건 (A묶음 자리 먼저). 계획 없는 날이면 null
function expPlanCount_(tok, n) {
  const mx = EXP_MIX[tok]; n = Math.max(0, Number(n) || 0);
  if (!mx) return null;
  const a = Math.min(n, mx[0]);
  return a * EXP_SETS.A.length + (n - a) * EXP_SETS.B.length;
}
// 기대평 그날 건수 (진행비·방제·한눈에): 폼 '작성한 링크 묶음' 답(A 14·B 13)으로 세고, 답이 없는 사람(예전 응답)은 그날 계획(EXP_MIX)의 남은 자리(A 먼저)로.
//  계획 없는 날은 예전처럼 사람 × expPer_
function expCount_(r, n, runs) {
  n = Math.max(0, Number(n) || 0);
  const mx = EXP_MIX[dateTok_(r && r['명단 제목'])];
  if (!mx) return n * expPer_(r);
  const ans = expAnswers_(r, runs);
  let a = ans.a, b = ans.b;
  while (a + b > n) { if (b > 0) b--; else a--; }
  let rest = n - a - b;
  const addA = Math.min(rest, Math.max(0, mx[0] - a)); a += addA; rest -= addA; b += rest;
  return a * EXP_SETS.A.length + b * EXP_SETS.B.length;
}
// 그날(진행일 0시 ~ 다음 진행 0시) 폼 응답의 '작성한 링크 묶음' 답 수 {a, b} (한 번 실행에 진행마다 한 번만 읽음)
function expAnswers_(r, runs) {
  const memo = globalThis.__EXPANS = globalThis.__EXPANS || {}, key = String(r['명단 제목']);
  if (memo[key]) return memo[key];
  const out = memo[key] = { a: 0, b: 0 };
  try {
    if (!r['시트ID']) return out;
    const w = windowOf_(runs || readRuns_(), r);
    SpreadsheetApp.openById(r['시트ID']).getSheets().filter(function (t) { return !!t.getFormUrl(); }).forEach(function (t) {
      const lr = t.getLastRow(), lc = t.getLastColumn();
      if (lr < 2 || lc < 2) return;
      const head = t.getRange(1, 1, 1, lc).getValues()[0].map(hk_), c = head.findIndex(function (h) { return MATCH.expSet.test(h); });
      if (c < 0) return;
      t.getRange(2, 1, lr - 1, c + 1).getValues().forEach(function (x) {
        const tm = tsMs_(x[0]);
        if (!isFinite(tm) || tm < w.from || tm >= w.to) return;
        const v = String(x[c]).trim();
        if (/^A/.test(v)) out.a++; else if (/^B/.test(v)) out.b++;
      });
    });
  } catch (e) {}
  return out;
}
// 방제 끝 숫자: 기대평은 사람 × 건수, 나머지는 사람 수 (월급시트 수량·총액도 기대평은 건수)
function titleCount_(r, n) { return isExpect_(r) ? expCount_(r, n) : n * cartN_(r); }   // 장바구니건 방 제목 = 물건 수 (사람 × 상품 수, 사용자 10/28)
// 장바구니건 상품 수 (아니면 1)
function cartN_(r) { try { return Number(PropertiesService.getScriptProperties().getProperty('CART_' + (r && r['시트ID']))) || 1; } catch (e) { return 1; } }
function setupExpectOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('EXPECT_V4')) return;
  if (today_().getTime() > new Date(2026, 9, 26).getTime()) return;
  // 앞서 만든 것(1차: 캡처 올리기, 2차: 2·1명 번갈아)은 응답이 없으면 치우고 다시 만듦
  const runs = readRuns_();
  const olds = runs.filter(function (r) { return /^exp-100-[123]$/.test(String(r['요청ID'])) && r['진행 상태'] !== '종료'; });
  for (let oi = 0; oi < olds.length; oi++) { const old = olds[oi];
    let n = 0;
    try { SpreadsheetApp.openById(old['시트ID']).getSheets().forEach(function (t) { if (t.getFormUrl()) n += Math.max(t.getLastRow() - 1, 0); }); } catch (e) {}
    if (n > 0) { props.setProperty('EXPECT_V4', 'skip'); note_('⚠ 기대평 폼(' + bareTitle_(old['명단 제목']) + ')에 응답이 있어서 다시 만들지 않았어요'); return; }
    setRun_(old.row, '진행 상태', '종료');
    try { const ps = planSheet_(), pl = ps.getLastRow(); if (pl >= 2) ps.getRange(2, 1, pl - 1, 1).getValues().forEach(function (v, i) { if (String(v[0]).indexOf(String(old['요청ID']) + '-') === 0) ps.getRange(i + 2, 9).setValue('취소 (다시 만듦)'); }); } catch (e) {}
    try { const ob = outboxSheet_(), ol = ob.getLastRow(); if (ol >= 2) { const v = ob.getRange(2, 1, ol - 1, 6).getValues(); for (let i = v.length - 1; i >= 0; i--) if (String(v[i][3]) === bareTitle_(old['명단 제목']) && v[i][5] !== '보냄') ob.deleteRow(i + 2); } } catch (e) {}
    try { DriveApp.getFolderById(String(old['폴더 링크']).match(/[-\w]{25,}/)[0]).setTrashed(true); } catch (e) {}
    Object.keys(props.getProperties()).forEach(function (k) { if (k.indexOf('UP_') === 0) props.deleteProperty(k); });
    note_('✓ 기대평 예전 것(응답 없음) 치움: ' + bareTitle_(old['명단 제목']) + ' 진행 종료, 일정 취소, 안 보낸 공지 지움, 폴더 휴지통');
  }
  props.setProperty('EXPECT_V4', '1');
  props.setProperty('EXPECT_V5', '1');   // 새로 만들면 아래 고치기(fixExpect5Once_)는 필요 없음
  const days = expDays_(), d0 = days[0], title = expTitle_(d0.d, d0.n, d0.set), fname = sheetName_(title);
  const folder = rootFolder_().createFolder(fname);
  const form = FormApp.create(fname);
  DriveApp.getFileById(form.getId()).moveTo(folder);
  form.setTitle(fname);
  form.addTextItem().setTitle('계정명(이름)').setRequired(true);
  ['예스24', '알라딘', '교보문고'].forEach(function (pl) { form.addTextItem().setTitle(pl + ' 아이디').setRequired(true); });
  form.addTextItem().setTitle('리뷰비 계좌').setHelpText('은행 / 계좌번호 / 예금주').setRequired(true);
  form.addMultipleChoiceItem().setTitle('기대평 댓글 리뷰비').setChoiceValues(expFeeCh_()).setRequired(true);
  const ss = SpreadsheetApp.create(fname);
  ss.setSpreadsheetTimeZone(CONFIG.TIMEZONE);
  DriveApp.getFileById(ss.getId()).moveTo(folder);
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  SpreadsheetApp.flush();
  for (let i = 0; i < 6; i++) { Utilities.sleep(2500); if (SpreadsheetApp.openById(ss.getId()).getSheets().some(function (s) { return !!s.getFormUrl(); })) break; }
  shareFile_(ss.getId(), false, CONFIG.LIST_EDITORS);
  shareFile_(form.getId(), true);
  formatResponseSheet_(SpreadsheetApp.openById(ss.getId()), { type: '입대', takdae: false, realship: false, platform: '기대평', target: 15, prices: '27000' });
  let formUrl = form.getPublishedUrl();
  try { formUrl = form.shortenFormUrl(formUrl); } catch (e) {}
  const tpl = expNotice_('A');
  const notice = tpl.split('(구글폼 링크)').join(formUrl);
  form.setDescription(formDesc_(notice));
  const list = ensureListSheet_();
  const reqId = 'exp-100-4';
  const rec = {
    '등록일': new Date(), '진행일': d0.d, '명단 제목': title, '유형': '', '택대': '', '실배송': '', '플랫폼': '기대평',
    '목표인원': d0.n, '인원': 0, '진행 상태': statusFor_(d0.d), '마감 시각': '', '캠페인': campOf_(title), '업체': '백발백중', '구매시간': '자정 ~ 오전 8시 20분',
    '포토': '', '일차': 1, '총건수': 30, '가격': String(EXP_SETS.A.length * 1000), '카톡방': title, '업체방': '',
    '폼 링크': formUrl, '시트 링크': ss.getUrl(), '폴더 링크': folder.getUrl(), '시트ID': ss.getId(), '폼ID': form.getId(), '요청ID': reqId
  };
  list.appendRow(LIST_HEADER.map(function (h) { return rec[h]; }));
  formatList_(list);
  queueMsg_(title, notice, '방 공지');
  // 다음 일차는 일정 탭 (진행일 0시에 만들어짐, 같은 폼·명단 시트). 일정 '건수'는 사람 수, 방제 끝은 건수
  //  일정 '건수'는 사람 수, 방제 끝은 건수. 주마다 공지(링크 묶음)·리뷰비가 다름
  const cfgOf = function (set) { return JSON.stringify({ type: '', takdae: false, realship: false, platform: '기대평', prices: String(EXP_SETS[set].length * 1000), croom: '', shop: '백발백중', photo: '', opts: '',
    desc: expNotice_(set), slot2: '', total: 30, camp: campOf_(title), base: reqId }); };
  const ps = planSheet_();
  days.slice(1).forEach(function (x, i) {
    const t = expTitle_(x.d, x.n, x.set);
    ps.appendRow([reqId + '-' + (i + 2), campOf_(title), i + 2, x.d, t, t, x.n, JSON.stringify([[x.n, [x.n]]]), '대기', cfgOf(x.set)]);
  });
  try { sortList_(); } catch (e) {}
  note_('✓ 기대평 진행 만듦: ' + title + ' + 일정 ' + (days.length - 1) + '일 (15명 × 2번 = 405건)');
}

// (10/23 한 번) 이미 만든 기대평(exp-100-4)을 그대로 두고 고침: 주말 빼고 다시 나눔(5·3·3·2·2), 공지 글, 폼 설명, 일정, 보낼메시지(기대평 공지 하나만), 윤주영 5계정 배정
function fixExpect5Once_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('EXPECT_V5')) return;
  const r = readRuns_().filter(function (x) { return String(x['요청ID']) === 'exp-100-4' && x['진행 상태'] !== '종료'; })[0];
  if (!r) return;
  props.setProperty('EXPECT_V5', '1');
  const days = expDays_(), d0 = days[0], title = expTitle_(d0.d, d0.n, d0.set);
  setRun_(r.row, '목표인원', d0.n);
  setRun_(r.row, '구매시간', '자정 ~ 오전 8시 20분');
  renameRun_(r, title);
  const notice = expNotice_('A').split('(구글폼 링크)').join(r['폼 링크']);
  try { FormApp.openById(r['폼ID']).setDescription(formDesc_(notice)); } catch (e) { note_('기대평 폼 설명 실패: ' + e); }
  // 보낼메시지: 안 보낸 기대평 공지는 다 지우고(방 이름이 틀린 것·두 개인 것 포함) 하나만
  try {
    const ob = outboxSheet_(), ol = ob.getLastRow();
    if (ol >= 2) { const v = ob.getRange(2, 1, ol - 1, 6).getValues(); for (let i = v.length - 1; i >= 0; i--) if (v[i][5] !== '보냄' && /기대평 댓글만 작성/.test(String(v[i][4]))) ob.deleteRow(i + 2); }
  } catch (e) { note_('기대평 공지 정리 실패: ' + e); }
  queueMsg_(title, notice, '방 공지');
  // 일정: 예전 계획 취소하고 새로
  const ps = planSheet_(), pl = ps.getLastRow();
  let cfg0 = null;
  if (pl >= 2) ps.getRange(2, 1, pl - 1, PLAN_HEAD.length).getValues().forEach(function (v, i) {
    if (String(v[0]).indexOf('exp-100-4-') !== 0) return;
    if (!cfg0) { try { cfg0 = JSON.parse(v[9]); } catch (e) {} }
    if (v[8] === '대기') ps.getRange(i + 2, 9).setValue('취소 (다시 나눔)');
  });
  const cfgOf = function (set) { return JSON.stringify(Object.assign({}, cfg0 || {}, { type: '', takdae: false, realship: false, platform: '기대평', prices: String(EXP_SETS[set].length * 1000), croom: '', shop: '백발백중', photo: '', opts: '',
    desc: expNotice_(set), slot2: '', total: 30, camp: campOf_(title), base: 'exp-100-4' })); };
  days.slice(1).forEach(function (x, i) {
    const t = expTitle_(x.d, x.n, x.set);
    ps.appendRow(['exp-100-4-v5-' + (i + 2), campOf_(title), i + 2, x.d, t, t, x.n, JSON.stringify([[x.n, [x.n]]]), '대기', cfgOf(x.set)]);
  });
  // 윤주영 (계정 5개) 배정
  try {
    const as = assignSheet_(), row = as.getLastRow() + 1;
    as.getRange(row, 1, 1, 9).setValues([[readRuns_().filter(function (x) { return x.row === r.row; })[0]['명단 제목'], '윤주영', '', 5, '', '', String(r['시트ID']), '', '']]);
    as.getRange(row, 6).setFormula(needFormula_(row));
  } catch (e) { note_('윤주영 배정 실패: ' + e); }
  note_('✓ 기대평 다시 나눔: ' + days.map(function (x) { return expTitle_(x.d, x.n, x.set); }).join(', ') + ' / 윤주영 5계정 배정');
}

// 원고제공·자율 의뢰 리뷰 가이드 (사용자가 단체방에 보낸 글 그대로, 10/23). 원고는 사용자가 업체에서 받아 직접 나눠 줌
const WONGO_GUIDE = ['🐥리뷰내용 가이드🐥 : 전체 포토리뷰!', '', '원고 언급 안되신 나머지 분들은 포토+원고자율작성 부탁드려요 :)', '',
  '원고제공되신 분들은 상황연출은 변형되도 되어서 ', '원고는 약간 참고만 하면됩니다 !', '',
  '그리고 포토리뷰 올릴때는 무조건 사용샷으로 뜯어서 사용해주세요 !!! 항상 감사합니다 !', '', '🐥🐥🐥🐥🐥🐥🐥🐥🐥🐥'].join('\n');
function isWongo_(rv) { return !!rv && /원고/.test(String(rv.guide || '') + ' ' + String(rv.mix || '')); }
// (10/23 한 번) 양모볼 리뷰 가이드: '포토전달대기·텍스트리뷰'로 잘못 들어간 것 → 원고 가이드 글로 바꾸고 보냄 (사용자가 이미 단체방에 보냄)
function fixWongoOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('WONGO_V1')) return;
  props.setProperty('WONGO_V1', '1');
  const ob = outboxSheet_(), ol = ob.getLastRow();
  if (ol < 2) return;
  ob.getRange(2, 1, ol - 1, 6).getValues().forEach(function (v) {
    if (v[5] === '보냄' || !/양모볼/.test(String(v[3]))) return;
    if (!/^(🐥|⭐️)(리뷰내용 가이드|포토대기)/.test(String(v[4]))) return;
    obSet_(ob, v[0], 2, today_()); obSet_(ob, v[0], 3, '방 공지'); obSet_(ob, v[0], 5, /포토대기⭐️$/.test(String(v[4]).trim()) ? String(v[4]) : WONGO_GUIDE); obSet_(ob, v[0], 6, '보냄');
  });
  note_('✓ 양모볼 리뷰 가이드를 원고 가이드로 바꿈 (이미 보내셔서 보냄 처리)');
}

// (10/23 한 번) 10/24(토) 카카오톡딜 구확건: 다른 진행자분 폼으로 진행 (우리 폼·명단 시트 없음) → 방 공지·구매확정 안내를 보낼메시지에, 월급시트에 50건 줄
function talkdealOnce_(skipGuide) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('TALKDEAL_V1')) return;
  props.setProperty('TALKDEAL_V1', '1');
  const room = '#10.24 5시 톡딜 홍삼스틱 50';
  const notice = ['★xxx광고(AD)절대 주문금지 xxxx ★', '★스중 상중 불가★(제가 가능하면 이야기합니다)', '▶리뷰는 7일이내 (배송문제  네이버 제외)',
    '⛧3분 체류 스토어찜 상품찜 결제스샷은 기본입니다.', '※오리방 페이백 리뷰비 안내※', '빈박스3~5일 안으로', '리뷰비는 방전원 다 쓰셔야지 진행자가',
    '요청완료 기준으로 3일 뒤에 입금되는 점', '참고하여 주세요!', '', '★사업자 4971201389  ★', '★사업자 4971201389 ★ ', '☆★☆★☆★☆★☆★☆★☆★', '양식 작성 폼▼',
    'https://docs.google.com/forms/d/e/1FAIpQLSes93VRMqQFfiqSvK2wrCVRSnVXCE06dzkBCeN5doXR8Glcug/viewform', '☆★☆★☆★☆★☆★☆★☆★', '1.',
    '링크타고 검색▼( 상번이 네이버일때 무시)', 'https://store.kakao.com/', '🐥판매처:마이픽',
    '🐥상품명 :[환절기선물]6년근 장홍삼 에브리데이 홍삼스틱 110포(대용량)/100포(선물용)', '🐥상품번호 :316704778', '🐥★키워드 :홍삼스틱', '🐥위치:1p',
    '🐥옵션:1. 장홍삼 110포', '🐥가격:24,900'].join('\n');
  queueMsg_(room, notice, '방 공지');
  if (!skipGuide) queueMsg_(room, '🐥리뷰내용 가이드🐥 : 구매확정\n\n🐥🐥🐥🐥🐥🐥🐥🐥🐥🐥', '방 공지');
  // 월급시트: 우리 명단 시트가 없어서 링크 칩 없이 직접 한 줄 (수량 50 = 계획. 실제 산 수가 다르면 날짜 칸만 고치기)
  try {
    const day = new Date(2026, 9, 24), sh = payTab_(10), L = payLayout_(sh);
    if (!L) return;
    const last = Math.max(sh.getLastRow(), L.head);
    const names = sh.getRange(L.head + 1, L.name, Math.max(last - L.head, 1), 1).getValues().map(function (x) { return String(x[0]).replace(/\s+/g, ''); });
    if (names.indexOf(room.replace(/\s+/g, '')) >= 0) return;
    let row = names.indexOf(''); row = row === -1 ? last + 1 : L.head + 1 + row;
    const put = function (c, v) { if (c && !sh.getRange(row, c).getFormula()) sh.getRange(row, c).setValue(v); };
    put(L.name, room); put(L.store, '마이픽'); put(L.time, '오후 5시 ~ 오후 6시'); put(L.sum, 50); put(L.note, '구확 / 톡딜');
    put(L.days[(day.getMonth() + 1) + '-' + day.getDate()] || L.days[String(day.getDate())], 50);
    if (L.date) { put(L.date, day); sh.getRange(row, L.date).setNumberFormat('M/d'); }
    try { payOrder_(sh); } catch (e) {}
    note_('✓ 톡딜 홍삼스틱: 방 공지·구매확정 안내 넣음, 월급시트 50건 줄');
  } catch (e) { note_('톡딜 월급시트 줄 실패: ' + e); }
}

// (10/23 한 번) 기대평 하루 3명씩 (월 5명은 많음). 윤주영 5계정 = 10/26 3 + 10/27 2
function fixExpect6Once_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('EXPECT_V6')) return;
  const r = readRuns_().filter(function (x) { return String(x['요청ID']) === 'exp-100-4' && x['진행 상태'] !== '종료'; })[0];
  if (!r) return;
  props.setProperty('EXPECT_V6', '1');
  note_(changeDaily_(r, new Date(2026, 9, 26), 3));
  try {
    const me = readRuns_().filter(function (x) { return x.row === r.row; })[0], sid = String(r['시트ID']);
    const t27 = expTitle_(new Date(2026, 9, 27), 3, 'A');
    const as = assignSheet_(), al = as.getLastRow();
    const v = al >= 2 ? as.getRange(2, 1, al - 1, 7).getValues() : [];
    const i26 = v.findIndex(function (x) { return String(x[1]) === '윤주영' && String(x[6]) === sid && String(x[0]) !== t27; });
    if (i26 >= 0) { as.getRange(i26 + 2, 1).setValue(me['명단 제목']); as.getRange(i26 + 2, 4).setValue(3); }
    else { const row = as.getLastRow() + 1; as.getRange(row, 1, 1, 9).setValues([[me['명단 제목'], '윤주영', '', 3, '', '', sid, '', '']]); as.getRange(row, 6).setFormula(needFormula_(row)); }
    if (!v.some(function (x) { return String(x[1]) === '윤주영' && String(x[0]) === t27; })) {
      const row = as.getLastRow() + 1;
      as.getRange(row, 1, 1, 9).setValues([[t27, '윤주영', '', 2, '', '', sid, '', '']]); as.getRange(row, 6).setFormula(needFormula_(row));
    }
    note_('✓ 윤주영 배정: ' + bareTitle_(me['명단 제목']) + ' 3 / ' + t27 + ' 2');
  } catch (e) { note_('윤주영 배정 나누기 실패: ' + e); }
}

// (10/23 한 번) 월급시트 톡딜 줄 진행일 칸이 비어 있던 것 → 10/24 넣고 날짜순으로
function talkdealDateOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('TALKDEAL_DATE_V1') || !props.getProperty('TALKDEAL_V1')) return;
  props.setProperty('TALKDEAL_DATE_V1', '1');
  payTabsNow_().forEach(function (sh) {
    const L = payLayout_(sh); if (!L || !L.date) return;
    const last = sh.getLastRow(); if (last <= L.head) return;
    sh.getRange(L.head + 1, L.name, last - L.head, 1).getValues().forEach(function (v, i) {
      if (String(v[0]).replace(/\s+/g, '') !== '#10.245시톡딜홍삼스틱50') return;
      const c = sh.getRange(L.head + 1 + i, L.date);
      if (!c.getFormula() && !(c.getValue() instanceof Date)) { c.setValue(new Date(2026, 9, 24)).setNumberFormat('M/d'); note_('✓ 월급시트 톡딜 줄 진행일 10/24 넣음'); }
    });
    payOrder_(sh);
  });
}

// (10/23 한 번) 기대평 진행(exp-100-4) 이름이 다른 진행(속눈썹영양제 등) 방제로 바뀌어 있으면 되돌림: 진행목록 명단 제목·카톡방, 기대평 공지(폼 링크로 찾음) 방 이름, 배정 탭
function fixExpect7Once_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('EXPECT_V7')) return;
  const r = readRuns_().filter(function (x) { return String(x['요청ID']) === 'exp-100-4' && x['진행 상태'] !== '종료'; })[0];
  if (!r) return;
  props.setProperty('EXPECT_V7', '1');
  const title = expTitle_(new Date(2026, 9, 26), 3, 'A'), cur = bareTitle_(r['명단 제목']), sid = String(r['시트ID']), link = String(r['폼 링크']);
  if (cur !== title) {
    setRun_(r.row, '명단 제목', title); setRun_(r.row, '카톡방', title); setRun_(r.row, '캠페인', campOf_(title)); setRun_(r.row, '목표인원', 3);
    note_('✓ 기대평 진행 이름 되돌림: ' + cur + ' → ' + title);
  } else if (Number(r['목표인원']) !== 3) setRun_(r.row, '목표인원', 3);
  // 기대평 공지(이 폼 링크)는 기대평 방으로
  try {
    const ob = outboxSheet_(), ol = ob.getLastRow();
    if (ol >= 2) ob.getRange(2, 1, ol - 1, 6).getValues().forEach(function (v) {
      if (v[5] !== '보냄' && String(v[4]).indexOf(link) >= 0 && String(v[3]) !== title) { obSet_(ob, v[0], 4, title); note_('✓ 기대평 공지 방 되돌림: ' + v[3] + ' → ' + title); }
    });
  } catch (e) {}
  // 배정 탭: 이 명단 시트 줄인데 기대평 이름이 아닌 것 → 10/26 기대평 (10/27 줄은 그대로)
  try {
    const as = assignSheet_(), al = as.getLastRow(), t27 = expTitle_(new Date(2026, 9, 27), 3, 'A');
    if (al >= 2) as.getRange(2, 1, al - 1, 7).getValues().forEach(function (v, i) {
      if (String(v[6]) === sid && String(v[0]) !== t27 && bareTitle_(v[0]) !== title) as.getRange(i + 2, 1).setValue(title);
    });
  } catch (e) {}
}

// 보낼메시지: 보냄 체크하고 보낼 날짜가 2일 넘게 지난 줄은 지움 (탭이 너무 길어짐, 사용자 요청 10/24). 30분마다
function pruneOutboxInner_() {
  const ob = outboxSheet_(), last = ob.getLastRow();
  if (last < 3) return;
  const cut = today_().getTime() - 2 * 86400000;
  const v = ob.getRange(2, 1, last - 1, 6).getValues();
  let n = 0;
  // 방 날짜가 오늘 이후인 메시지(앞으로 진행할 방 공지)는 보냈어도 안 지움 (10/24 #10.26 공지가 안 보였던 것)
  const roomDay = function (x) { const t = dateTok_(x[3]); if (!t) return 0; const p = t.split('.'), now = new Date(); return new Date(now.getFullYear(), Number(p[0]) - 1, Number(p[1])).getTime(); };
  const t0 = today_().getTime();
  for (let i = v.length - 1; i >= 0; i--) if (v[i][5] === '보냄' && v[i][1] instanceof Date && v[i][1].getTime() < cut && roomDay(v[i]) < t0) { ob.deleteRow(i + 2); n++; }
  if (n) note_('✓ 보낸 지 오래된 메시지 ' + n + '줄 지움');
}
// (10/24 한 번) 안 보낸 방 공지의 보낼 날짜를 지금 규칙(전 진행일)으로 다시
function redateNoticesOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('REDATE_V2')) return;
  props.setProperty('REDATE_V2', '1');
  const ob = outboxSheet_(), last = ob.getLastRow();
  if (last < 2) return;
  const v = ob.getRange(2, 1, last - 1, 6).getValues();
  let n = 0;
  v.forEach(function (x) {
    if (x[2] !== '방 공지' || x[5] === '보냄' || !(x[1] instanceof Date)) return;
    const d = sendDate_(x[3], x[4], x[2]);
    if (d.getTime() !== dayStart_(x[1])) { obSet_(ob, x[0], 2, d); n++; }
  });
  sortOutbox_(ob);
  note_('✓ 방 공지 보낼 날짜를 전 진행일로: ' + n + '줄');
}
// 새벽 점검 (사용자 요청 10/24: 아침 6시 전에 일어나니 매일 새벽 5시에). 5시 넘어 처음 도는 15분 확인에서 하루 한 번.
//  이상한 게 있으면 보낼메시지 '할 일'(내 할 일)과 메일로, 없으면 한눈에 Q열에 '이상 없음'만. 고치지는 않고 알리기만 함
function morningCheck_() {
  const props = PropertiesService.getScriptProperties(), now = new Date(), tk = Utilities.formatDate(now, CONFIG.TIMEZONE, 'yyyyMMdd');
  if (Number(Utilities.formatDate(now, CONFIG.TIMEZONE, 'H')) < 5 || props.getProperty('MORNING_DAY') === tk) return;
  props.setProperty('MORNING_DAY', tk);
  const t0 = today_().getTime(), issues = [];
  const prevWork = function (d) { const x = new Date(d); x.setHours(12, 0, 0, 0); do { x.setDate(x.getDate() - 1); } while (!isWorkday_(x)); x.setHours(0, 0, 0, 0); return x.getTime(); };
  const runs = readRuns_().filter(function (r) { return r['진행 상태'] !== '종료' && r['진행일'] instanceof Date; });
  const ob = outboxSheet_(), ol = ob.getLastRow(), rows = ol >= 2 ? ob.getRange(2, 1, ol - 1, 6).getValues() : [];
  const roomOf = function (r) { return String(r['카톡방'] || bareTitle_(r['명단 제목'])); };
  // 1. 앞으로 진행할 진행마다 방 공지 (보낼 날짜가 아직 안 지난 것만. 지난 건 이미 보냈을 수 있음)
  const noNotice = runs.filter(function (r) {
    if (!r['폼 링크'] || dayStart_(r['진행일']) < t0 || prevWork(r['진행일']) < t0) return false;
    const link = String(r['폼 링크']), room = roomOf(r);
    return !rows.some(function (x) { return x[2] === '방 공지' && String(x[4]).indexOf(link) >= 0 && dateTok_(String(x[3])) === dateTok_(room); });
  }).map(roomOf);
  if (noNotice.length) issues.push('방 공지가 보낼메시지에 없음: ' + noNotice.join(', '));
  // 2. 보낼 날짜가 지났는데 안 보낸 메시지 (할 일·포토 가이드 빼고)
  const late = rows.filter(function (x) { return x[5] === '대기' && x[1] instanceof Date && dayStart_(x[1]) < t0 && x[2] !== '할 일' && x[2] !== '포토 가이드'; });
  if (late.length) issues.push('보낼 날짜가 지났는데 안 보낸 메시지 ' + late.length + '개: ' + late.slice(0, 6).map(function (x) { return x[3] + '(' + x[2] + ')'; }).join(', '));
  // 3. 보낼 날짜 칸이 날짜가 아닌 대기 줄 (포토 가이드 빼고)
  const odd = rows.filter(function (x) { return x[5] === '대기' && x[2] !== '포토 가이드' && !(x[1] instanceof Date); });
  if (odd.length) issues.push('보낼 날짜 칸이 날짜가 아님: ' + odd.slice(0, 6).map(function (x) { return x[3] + '(' + x[1] + ')'; }).join(', '));
  // 4. 오늘 진행인데 폼이 닫혀 있음
  const seen = {};
  runs.filter(function (r) { return dayStart_(r['진행일']) === t0 && r['폼ID'] && !(r['마감 시각'] instanceof Date); }).forEach(function (r) {
    const fid = String(r['폼ID']); if (seen[fid]) return; seen[fid] = 1;
    try { if (!FormApp.openById(fid).isAcceptingResponses()) issues.push('오늘 진행 폼이 닫혀 있음: ' + roomOf(r)); } catch (e) { issues.push('폼을 못 열었음: ' + roomOf(r)); }
  });
  // 5. 만들어졌어야 할 다음 일차가 일정 탭에 '대기'로 남아 있음
  try {
    const ps = planSheet_(), pl = ps.getLastRow();
    const stuck = pl >= 2 ? ps.getRange(2, 1, pl - 1, PLAN_HEAD.length).getValues().filter(function (x) { return x[8] === '대기' && x[3] instanceof Date && prevWork(x[3]) < t0; }) : [];
    if (stuck.length) issues.push('만들어졌어야 할 다음 일차가 안 만들어짐: ' + stuck.slice(0, 6).map(function (x) { return bareTitle_(x[4]); }).join(', '));
  } catch (e) {}
  // 6. 트리거
  try {
    const ts = ScriptApp.getProjectTriggers();
    if (ts.length >= 20) issues.push('트리거가 한도(20개)에 닿음');
    if (!ts.some(function (t) { return t.getHandlerFunction() === 'checkFull'; })) issues.push('15분 자동 확인 트리거가 없음');
  } catch (e) {}
  // 7. 지난 12시간 확인 결과 중 문제
  try {
    // 월급시트 나눠서 하는 중(오류 아님) 줄만 있는 결과는 빼고
    const realProb = function (t) { return t.split('\n').slice(1).some(function (l) { return /^⚠/.test(l) && !/월급시트.*(이어서|나눠서)/.test(l); }); };
    const log = JSON.parse(CacheService.getScriptCache().get('REPORT_LOG') || '[]').filter(function (t) { return /^⚠/.test(t) && !/다른 작업 중이라 건너뜀/.test(t) && realProb(t); });
    if (log.length) issues.push('최근 자동 확인에서 문제 ' + log.length + '번 (한눈에 Q열/실행 기록): ' + log[0].split('\n').slice(1, 3).join(' / ').slice(0, 160));
  } catch (e) {}
  const when = Utilities.formatDate(now, CONFIG.TIMEZONE, 'M/d HH:mm');
  props.setProperty('MORNING_LAST', when + ' ' + (issues.length ? issues.length + '개: ' + issues.join(' | ') : '이상 없음').slice(0, 1500));
  if (!issues.length) { note_('✓ 새벽 점검: 이상 없음'); return; }
  queueMsg_('내 할 일', '🌅 새벽 점검 (' + when + '): 확인할 것 ' + issues.length + '개\n' + issues.map(function (x) { return '- ' + x; }).join('\n'), '할 일');
  try { MailApp.sendEmail(Session.getEffectiveUser().getEmail(), '[체험단] 새벽 점검: 확인할 것 ' + issues.length + '개', issues.map(function (x) { return '- ' + x; }).join('\n') + '\n\n보낼메시지 탭 할 일에도 넣었어요.'); } catch (e) {}
  note_('⚠ 새벽 점검: 확인할 것 ' + issues.length + '개 (보낼메시지 할 일)');
}
// (10/24 한 번) 기대평(exp-100-4) 10/27~ 일정이 '건너뜀 (이미 다 진행)'이 된 것 → 대기로 되돌림 (취소한 예전 기대평 진행 목표인원 27·54가 '다 진행'으로 세졌던 것)
function expPlanRestoreOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('EXPPLAN_V8')) return;
  props.setProperty('EXPPLAN_V8', '1');
  const ps = planSheet_(), pl = ps.getLastRow();
  if (pl < 2) return;
  const runs = readRuns_(), n = [];
  ps.getRange(2, 1, pl - 1, PLAN_HEAD.length).getValues().forEach(function (x, i) {
    if (String(x[0]).indexOf('exp-100-4-v5-') !== 0 || !/건너뜀/.test(String(x[8])) || !(x[3] instanceof Date) || dayStart_(x[3]) < today_().getTime()) return;
    if (runs.some(function (r) { return isExpect_(r) && r['진행 상태'] !== '종료' && r['진행일'] instanceof Date && dayStart_(r['진행일']) === dayStart_(x[3]); })) return;
    ps.getRange(i + 2, 9).setValue('대기'); n.push(bareTitle_(x[4]));
  });
  note_('✓ 기대평 일정 되살림 (전 진행일 0시에 진행·공지가 만들어짐): ' + (n.join(', ') || '없음'));
}
// (10/26 한 번, 사용자 요청)
//  1) 보낼메시지에서 #10.26 실 치약걸이 보냉백 5 '리뷰내용 가이드'(m4c368e96e61e) 글이 기대평 명단 전달 글로 바뀌어 있음 → 원래 글로 되돌림
//  2) #10.26 실링팬 2: 둘 다 포토 (허예인 텍스트리뷰 → 포토리뷰). 업체 포토를 받아 10.22·10.26 사람에게 전달함 → 포토 받음 표시
const BAG_RVGUIDE_1026 = "🐥리뷰내용 가이드🐥 : 전체 포토리뷰!\n\n원고 언급 안되신 나머지 분들은 포토+원고자율작성 부탁드려요 :)\n\n원고제공되신 분들은 상황연출은 변형되도 되어서 \n원고는 약간 참고만 하면됩니다 !\n\n그리고 포토리뷰 올릴때는 무조건 사용샷으로 뜯어서 사용해주세요 !!! 항상 감사합니다 !\n\n🐥🐥🐥🐥🐥🐥🐥🐥🐥🐥";
function fix1026bOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('FIX1026B_V1')) return;
  props.setProperty('FIX1026B_V1', '1');
  const ob = outboxSheet_(), ol = ob.getLastRow(), v = ol >= 2 ? ob.getRange(2, 1, ol - 1, 6).getValues() : [], log = [];
  v.forEach(function (x) {
    if (String(x[0]) === 'm4c368e96e61e' && x[5] === '대기' && /백발백중 도서 기대평/.test(String(x[4]))) { obSet_(ob, x[0], 5, BAG_RVGUIDE_1026); log.push('치약걸이 리뷰 가이드 되돌림'); }
    if (String(x[3]) === '#10.26 실링팬 2' && x[5] === '대기' && /텍스트리뷰\(1명\)\s*:\s*허예인/.test(String(x[4]))) { obSet_(ob, x[0], 5, String(x[4]).replace(/텍스트리뷰\(1명\)(\s*:\s*허예인)/, '포토리뷰(1명)$1')); log.push('실링팬 10.26 허예인 포토리뷰로'); }
  });
  ['#10.22 실링팬 1', '#10.26 실링팬 2'].forEach(function (t) { props.setProperty('RVSENT_' + campKey_(t) + '_' + dateTok_(t), '1'); });
  log.push('실링팬 10.22·10.26 포토 받음');
  note_('✓ 10/26 고침: ' + log.join(', '));
}
// (10/26 한 번, 사용자 요청) 기대평을 A·B묶음 섞어서 (EXP_MIX): 폼에 '작성한 링크 묶음' 질문, 10.27 진행(윤주영 2계정 A + 신규 1계정 B = 41건) 방제·공지·폼 설명,
//  앞으로 만들 일정(대기)의 방제 건수·공지 틀
function expMixOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('EXPMIX_V1')) return;
  props.setProperty('EXPMIX_V1', '1');
  const log = [];
  let runs = readRuns_();
  const exps = runs.filter(function (r) { return isExpect_(r) && r['진행 상태'] !== '종료' && r['폼ID']; });
  // 1) 폼 질문 (닉네임 질문 바로 뒤, 필수)
  const seen = {};
  exps.forEach(function (r) {
    const fid = String(r['폼ID']);
    if (seen[fid]) return;
    seen[fid] = 1;
    try {
      const fo = FormApp.openById(fid), items = fo.getItems();
      if (items.some(function (it) { return MATCH.expSet.test(String(it.getTitle() || '')); })) return;
      const q = fo.addMultipleChoiceItem().setTitle(EXP_SET_Q).setChoiceValues(EXP_SET_CH).setRequired(true).setHelpText('공지에 적힌 내 묶음 (A 14개 / B 13개)');
      const ni = items.findIndex(function (it) { return MATCH.nick.test(String(it.getTitle() || '')); });
      fo.moveItem(q.getIndex(), ni >= 0 ? ni + 1 : 0);
      log.push('폼 질문 추가 (' + bareTitle_(r['명단 제목']) + ' 폼)');
    } catch (e) { note_('기대평 폼 질문 추가 실패: ' + e); }
  });
  // 2) 10.27 진행: 방제 41건, 공지·폼 설명
  const r27 = exps.filter(function (r) { return dateTok_(r['명단 제목']) === '10.27'; })[0];
  if (r27) {
    const nt = '10.27 백발백중 도서 기대평 ' + expPlanCount_('10.27', 3);
    if (bareTitle_(r27['명단 제목']) !== nt) renameRun_(r27, nt, '기대평 A·B묶음');
    runs = readRuns_();
    const r = runs.filter(function (x) { return x.row === r27.row; })[0] || r27;
    const room = String(r['카톡방'] || bareTitle_(r['명단 제목']));
    const text = expNoticeMix_(2, 1, { A: '윤주영 2계정', B: '신규 1계정' }).split('(구글폼 링크)').join(String(r['폼 링크']));
    const ob = outboxSheet_(), ol = ob.getLastRow();
    let n = 0;
    if (ol >= 2) ob.getRange(2, 1, ol - 1, 6).getValues().forEach(function (v) { if (String(v[3]) === room && v[2] === '방 공지' && v[5] !== '보냄' && /양식 작성 폼/.test(String(v[4]))) { obSet_(ob, v[0], 5, text); n++; } });
    if (!n) queueMsg_(room, text, '방 공지');   // 이미 보냈으면 새 공지로 하나 더
    try { FormApp.openById(r['폼ID']).setDescription(formDesc_(text)); } catch (e) { note_('기대평 폼 설명 실패: ' + e); }
    log.push(bareTitle_(r['명단 제목']) + ' 공지 ' + (n ? '고침' : '새로 넣음'));
  }
  // 3) 일정 탭 대기 계획: 방제 건수, 공지 틀
  try {
    const ps = planSheet_(), pl = ps.getLastRow();
    if (pl >= 2) ps.getRange(2, 1, pl - 1, PLAN_HEAD.length).getValues().forEach(function (x, i) {
      // 대기 계획 + 이미 만든 10.27 계획(공지가 빠지면 이 틀로 다시 넣으니 같이 맞춤)
      if (!(x[8] === '대기' || (x[8] === '생성됨' && dateTok_(x[5]) === '10.27')) || String(x[0]).indexOf('exp-100-4-v5-') !== 0) return;
      const tok = dateTok_(x[5]), mx = EXP_MIX[tok];
      if (!mx) return;
      const cnt = expPlanCount_(tok, Number(x[6]) || mx[0] + mx[1]);
      const cfg = JSON.parse(x[9]);
      cfg.desc = expNoticeMix_(mx[0], mx[1], tok === '10.27' ? { A: '윤주영 2계정', B: '신규 1계정' } : null);
      ps.getRange(i + 2, 5, 1, 2).setValues([[String(x[4]).replace(/\d+\s*$/, String(cnt)), String(x[5]).replace(/\d+(\s*(?:\([^)]*\))?\s*)$/, cnt + '$1')]]);
      ps.getRange(i + 2, 10).setValue(JSON.stringify(cfg));
      log.push(tok + ' ' + cnt + '건 (A' + mx[0] + '·B' + mx[1] + ')');
    });
  } catch (e) { note_('기대평 일정 바꾸기 실패: ' + e); }
  note_('✓ 기대평 A·B묶음: ' + log.join(', '));
}
// (10/26 한 번, 사용자 요청) 월급시트 톡딜 줄 상태가 '시작전': 상태 수식 =IF(G=0,"시작전",…)이 계약 수량 칸(G, 보통 명단 시트 링크)을 보는데
//  톡딜은 명단 시트가 없어서 G가 비어 있었음 → G에 글자를 넣어 수식대로 '완료'(남은 0)가 되게. 돈 칸(완료보고·진행비)은 안 건드림
function talkdealQtyOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('TALKDEAL_G_V1')) return;
  props.setProperty('TALKDEAL_G_V1', '1');
  const sh = payTab_(10), L = payLayout_(sh);
  if (!L || !L.qty) return;
  const last = sh.getLastRow(), names = sh.getRange(L.head + 1, L.name, Math.max(last - L.head, 1), 1).getValues();
  names.forEach(function (x, i) {
    if (String(x[0]).replace(/\s+/g, '') !== '#10.245시톡딜홍삼스틱50') return;
    const c = sh.getRange(L.head + 1 + i, L.qty);
    if (String(c.getValue()).trim() || c.getFormula()) return;
    c.setValue('톡딜 (명단 시트 없음)');
    note_('✓ 월급시트 톡딜 줄 계약 수량 칸 채움 (상태 수식이 시작전으로 나오던 것): ' + sh.getName() + '!' + (L.head + 1 + i));
  });
}
// (10/26 한 번, 사용자 요청) '#10.27 실 유앤아이푸드 효자손외 20'(23자) → '#10.27 실 효자손외 20' (카톡방 이름 20자까지. 생성기 v96 규칙과 같게)
function hyojaRoomOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('HYOJA_ROOM_V1')) return;
  props.setProperty('HYOJA_ROOM_V1', '1');
  const r = readRuns_().filter(function (x) { return bareTitle_(x['명단 제목']) === '#10.27 실 유앤아이푸드 효자손외 20' && x['진행 상태'] !== '종료'; })[0];
  if (!r) { note_('효자손 방제: 진행을 못 찾음 (이미 바뀜?)'); return; }
  globalThis.__PAY_RENAME_ANY = true;
  try { if (renameRun_(r, '#10.27 실 효자손외 20', '방제 20자')) note_('✓ 방제 20자로: #10.27 실 유앤아이푸드 효자손외 20 → #10.27 실 효자손외 20 (카톡방 이름도 바꿔 주세요)'); }
  finally { globalThis.__PAY_RENAME_ANY = false; }
}
// (10/27 한 번, 사용자 요청 '안민지 2계정 맞는데 왜 초과') 배정 탭에서 폼 옵션(H) 빈칸 줄 = 공지 옵션이 'XXX 마감'이라 폼 보기와 못 이어진 줄
//  → 그 상품 이름이 든 폼 보기가 하나뿐이면 그걸로 (빈칸이면 닉네임만 세서 2계정이 두 줄 다 '초과'로 나옴). '마감'이 이름으로 들어간 줄은 지움
function assignFix1027Once_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('ASGFIX1027_V1')) return;
  props.setProperty('ASGFIX1027_V1', '1');
  const as = assignSheet_(), al = as.getLastRow(); if (al < 2) return;
  const runs = readRuns_(), cut = today_().getTime() - 3 * 86400000, chMemo = {}, log = [], del = [];
  const k = function (x) { return String(x || '').toLowerCase().replace(/\s+/g, '').replace(/\([\d,\s]+원\)$/, ''); };
  as.getRange(2, 1, al - 1, 8).getValues().forEach(function (v, i) {
    const r = runs.filter(function (x) { return String(x['명단 제목']) === String(v[0]); })[0];
    if (!r || !r['폼ID'] || !(r['진행일'] instanceof Date) || r['진행일'].getTime() < cut) return;
    if (String(v[1]).trim() === '마감') { del.push(i + 2); return; }
    if (String(v[7]).trim()) return;
    if (!chMemo[r['폼ID']]) { try { chMemo[r['폼ID']] = formChoices_(FormApp.openById(r['폼ID'])); } catch (e) { chMemo[r['폼ID']] = []; } }
    const ch = chMemo[r['폼ID']], lab = String(v[2]).replace(/\s*(마감|완료|품절)\s*$/, '').trim();
    if (!lab) return;
    let hit = ch.filter(function (c) { return k(c).indexOf(k(lab)) >= 0; });
    if (hit.length !== 1) hit = ch.filter(function (c) { return k(c).indexOf(k(lab.split(/\s+/)[0])) >= 0; });
    if (hit.length !== 1) return;
    as.getRange(i + 2, 8).setValue(hit[0]); log.push(String(v[1]) + '→' + hit[0]);
  });
  for (let j = del.length - 1; j >= 0; j--) as.deleteRow(del[j]);
  note_('✓ 배정 옵션 빈칸 채움 ' + log.length + '줄' + (del.length ? ', 이름이 아닌 \'마감\' 줄 ' + del.length + '개 지움' : ''));
}
// (10/27 한 번) '#10.27 실/빈 치약걸이 보냉백 5' 배정: 공지의 '🐥[실배송 3명 - 현지 슬기 선우승]'을 한 사람으로 읽었던 것 → 고친 읽기로 다시
function bagAssign1027Once_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('BAGASG1027_V1')) return;
  props.setProperty('BAGASG1027_V1', '1');
  const r = readRuns_().filter(function (x) { return /^#10\.27 실\/빈 치약걸이 보냉백 5/.test(String(x['명단 제목'])); })[0];
  if (!r) { note_('치약걸이 보냉백 10.27 진행을 못 찾음 (배정 그대로)'); return; }
  const ob = outboxSheet_(), ol = ob.getLastRow();
  const t = ol >= 2 ? ob.getRange(2, 5, ol - 1, 1).getValues().map(function (v) { return String(v[0]); }).filter(function (x) { return /실배송 3명 - 현지 슬기 선우승/.test(x); })[0] : '';
  if (!t) { note_('치약걸이 보냉백 10.27 공지를 못 찾음 (배정 그대로)'); return; }
  note_('✓ 치약걸이 보냉백 10.27 배정 다시 읽음: ' + String(assignRun_(r, t)).split('\n')[0]);
}
// (10/27 한 번, 사용자 요청) #10.27 실 양배추채칼외: 음식물거름망을 로켓(7,900원)으로 잘못 산 응답을 지움 (롼롼이 빼고 → 45건)
//  지울 사람이 예상한 사람(ㅁㅈ, 박소정, 워니, 박민아, 종이/jenny)이고 결제금액이 7,900원인 것만. 그 밖의 것은 안 지우고 알림
function cabbageRocketDelOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('CABBAGE_DEL_V1')) return;
  props.setProperty('CABBAGE_DEL_V1', '1');
  const runs = readRuns_();
  const r = runs.filter(function (x) { return /^#10\.27 실 양배추채칼외/.test(String(x['명단 제목'])) && x['폼ID'] && x['시트ID']; })[0];
  if (!r) { note_('⚠ 양배추채칼외 10.27 진행을 못 찾음 (응답 안 지움)'); return; }
  const info = rawInfo_(r['시트ID'], r['폼ID']), w = windowOf_(runs, r);
  if (!info.nickCol || !info.optCol || !info.priceCol) { note_('⚠ 양배추채칼외 응답에서 닉네임·옵션·결제금액 칸을 못 찾음 (응답 안 지움)'); return; }
  const src = info.src || info.raw, st = info.start || 2, lr = src.getLastRow();
  const nk = function (x) { return String(x || '').toLowerCase().replace(/\s+/g, ''); };
  const want = ['ㅁㅈ', '박소정', '워니', '박민아', '종이/jenny'].map(nk);
  const del = [], skip = [];
  if (lr >= st) src.getRange(st, 1, lr - st + 1, info.head.length).getValues().forEach(function (x) {
    if (!(x[0] instanceof Date) || x[0].getTime() < w.from || x[0].getTime() >= w.to) return;
    if (!/음식물거름망/.test(String(x[info.optCol - 1]))) return;
    const n = String(x[info.nickCol - 1]).trim(), price = Number(String(x[info.priceCol - 1]).replace(/[^\d]/g, '')) || 0;
    if (nk(n) === nk('롼롼이')) return;
    if (want.indexOf(nk(n)) >= 0 && price === 7900) del.push({ t: x[0], n: n }); else skip.push(n + ' ' + price + '원');
  });
  if (!del.length || del.length > 5) { note_('⚠ 양배추채칼외 음식물거름망 로켓 응답: 지울 것 ' + del.length + '개라 안 지움' + (skip.length ? ' (그 밖: ' + skip.join(', ') + ')' : '')); return; }
  const res = deleteRunTimes_(r, del.map(function (x) { return x.t; }));
  note_('✓ 양배추채칼외 음식물거름망 로켓(7,900원) 응답 지움: ' + del.map(function (x) { return x.n; }).join(', ') + ' → ' + res + (skip.length ? ' / 안 지운 것: ' + skip.join(', ') : ''));
}
// (10/27 한 번, 사용자 요청) 기대평 일정: 2주차는 1주차 같은 요일 계정이 반대 묶음 (EXP_MIX·EXP_WHO). 대기 계획 공지·방제 건수, 10.28 대기 공지에 이름
function expSchedOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('EXPSCHED_V1')) return;
  props.setProperty('EXPSCHED_V1', '1');
  const log = [];
  const ps = planSheet_(), pl = ps.getLastRow();
  if (pl >= 2) ps.getRange(2, 1, pl - 1, PLAN_HEAD.length).getValues().forEach(function (x, i) {
    if (x[8] !== '대기' || String(x[0]).indexOf('exp-100-4-v5-') !== 0) return;
    const tok = dateTok_(x[5]), mx = EXP_MIX[tok];
    if (!mx) return;
    const cnt = expPlanCount_(tok, mx[0] + mx[1]), cfg = JSON.parse(x[9]);
    cfg.desc = expNoticeMix_(mx[0], mx[1], EXP_WHO[tok] || null);
    ps.getRange(i + 2, 5, 1, 2).setValues([[String(x[4]).replace(/\d+\s*$/, String(cnt)), String(x[5]).replace(/\d+(\s*(?:\([^)]*\))?\s*)$/, cnt + '$1')]]);
    ps.getRange(i + 2, 10).setValue(JSON.stringify(cfg));
    log.push(tok + ' A' + mx[0] + '·B' + mx[1] + ' ' + cnt + '건');
  });
  // 10.28 대기 공지: 누가 어느 묶음인지
  const ob = outboxSheet_(), ol = ob.getLastRow(), w = EXP_WHO['10.28'];
  if (ol >= 2) ob.getRange(2, 1, ol - 1, 6).getValues().forEach(function (v) {
    if (v[2] !== '방 공지' || v[5] !== '대기' || !/^10\.28 백발백중 도서 기대평/.test(String(v[3]))) return;
    const t = String(v[4]).replace(/(A묶음\(\d+개 링크\) \d+명)(?! -)/, '$1 - ' + w.A).replace(/(B묶음\(\d+개 링크\) \d+명)(?! -)/, '$1 - ' + w.B)
      .replace(/(🔵 A묶음 \(\d+개 링크\))(?! -)/, '$1 - ' + w.A).replace(/(🟢 B묶음 \(\d+개 링크\))(?! -)/, '$1 - ' + w.B);
    if (t !== String(v[4])) { obSet_(ob, v[0], 5, t); log.push('10.28 공지 이름'); }
  });
  note_('✓ 기대평 2주차 일정: ' + log.join(', '));
}
// (10/27 한 번, 사용자 요청) #10.28 실 효자손외 6: 폼 설명(공지)이 비어서 자동으로 못 만든 것. 맥세이프 1 + 계기판 5
//  쿠팡 링크·상품번호·키워드·위치·계기판 가격은 모르는 값이라 [확인 필요]로 둠 (보낼메시지 공지에서 채워서 보내기)
function hyoja1028Once_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('HYOJA1028_V1')) return;
  props.setProperty('HYOJA1028_V1', '1');
  const r = readRuns_().filter(function (x) { return /^#10\.27 실 효자손외/.test(String(x['명단 제목'])) && x['폼ID']; })[0];
  if (!r) { note_('⚠ 효자손외 10.27 진행을 못 찾음'); return; }
  const prod = function (nm, kw, cnt, price) { return ['링크타고 검색▼( 상번이 네이버일때 무시)', '[쿠팡 링크 확인 필요]', '🐥판매처 : 유앤아이푸드', '🐥상품명 : ' + nm, '🐥상품번호 : [확인 필요]', '🐥★키워드 : ' + kw, '🐥위치 : [확인 필요]', '🐥옵션 : 블랙 (' + cnt + '명)', '🐥가격 : ' + price].join('\n'); };
  const desc = ['가격이 높으면 사지 마세요!', '★ 광고(AD) 상품으로 주문 절대 금지 ★', '★ 스중 상중 불가 ★ (가능하면 진행자가 따로 안내합니다)', '▶ 리뷰는 배송완료 후 7일 이내 작성', '▶ 결제 스크린샷은 필수입니다', '',
    '※오리방 페이백 리뷰비 안내※', '리뷰비는 방전원 다 쓰셔야지 진행자가', '요청완료 기준으로 3일 뒤에 입금되는 점', '참고하여 주세요!', '실배송은 방에 인원이 다쓰셔야 페이백 요청됩니다', '일정기간 지나면 회오리가 방탈합니다!', '지급이 어려울수 있으니 안내된 기간은 지켜주세요! 감사합니다', '★사업자 4971201389 ★', '',
    '☆★☆★ 양식 작성 폼 ☆★☆★', String(r['폼 링크']), '', prod('코코스무 맥세이프 휴대폰 거치대 블랙', '[확인 필요]', 1, '12,900'), '', prod('코코스무 계기판 대쉬보드 집게형 거치대 블랙', '[확인 필요]', 5, '[확인 필요]')].join('\n');
  const so = [['코코스무 맥세이프 휴대폰 거치대 블랙', 1, '코코스무 맥세이프 휴대폰 거치대 블랙|블랙'], ['코코스무 계기판 대쉬보드 집게형 거치대 블랙', 5, '코코스무 계기판 대쉬보드 집게형 거치대 블랙|블랙']];
  note_('✓ 효자손외 10.28: ' + addMoreRun_(r, 6, { next: true, short: so, desc: desc }));
}
// (10/27 한 번, 사용자 요청) 10.28 효자손외 공지(사용자가 준 글), 월급시트 스토어(신발패드 = 유앤아이푸드, 양배추채칼외 = 로이시마켓), 백발백중 기대평 진행시간
const HYOJA1028_NOTICE = ['★★★자정 ~ 오전 8시 20분 구매★★★', '가격이 높으면 사지 마세요!', '★ 광고(AD) 상품으로 주문 절대 금지 ★', '★ 스중 상중 불가 ★ (가능하면 진행자가 따로 안내합니다)', '▶ 리뷰는 배송완료 후 7일 이내 작성', '▶ 결제 스크린샷은 필수입니다', '',
  '※오리방 페이백 리뷰비 안내※', '리뷰비는 방전원 다 쓰셔야지 진행자가', '요청완료 기준으로 3일 뒤에 입금되는 점', '참고하여 주세요!', '실배송은 방에 인원이 다쓰셔야 페이백 요청됩니다', '일정기간 지나면 회오리가 방탈합니다!', '지급이 어려울수 있으니 안내된 기간은 지켜주세요! 감사합니다', '★사업자 4971201389 ★', '',
  '☆★☆★ 양식 작성 폼 ☆★☆★', 'https://forms.gle/Z6wGQbKQc3bbmrd19', '', '------------------------------------------------', '',
  '1) 1명', '링크타고 검색▼( 상번이 네이버일때 무시)', 'https://coupa.ng/b59klT', '🐥판매처 : 유앤아이푸드', '🐥상품명 : 코코스무 맥세이프 360도 회전 차량용 강력 진공 흡착식 접이식 휴대폰 핸드폰 태블릿 대시보드 거치대', '🐥상품번호 : 9791573679 - 2931***5485', '🐥★키워드 : 코코스무 맥세이프 휴대폰 거치대', '🐥위치 : 1페이지', '🐥옵션 : 블랙 (옵션단일)', '🐥가격 : 12,900', '',
  '------------------------------------------------', '',
  '2) 5명', '링크타고 검색▼( 상번이 네이버일때 무시)', 'https://coupa.ng/b59klT', '🐥판매처 : 유앤아이푸드', '🐥상품명 : 코코스무 차량용 전방주시 안전운행 계기판 대쉬보드 각도조절 원터치 휴대폰 강력 집게형 거치대', '🐥상품번호 : 9791478092 - 2931***6849', '🐥★키워드 : 코코스무 계기판 대쉬보드 집게형 거치대', '🐥위치 : 1페이지', '🐥옵션 : 블랙 (옵션단일)', '🐥가격 : 9,900'].join('\n');
function fix1027bOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('FIX1027B_V1')) return;
  props.setProperty('FIX1027B_V1', '1');
  const log = [], runs = readRuns_(), SLOT = '자정 ~ 오전 8시 20분';
  // 1) 10.28 효자손외 공지: 보낼메시지(대기)와 폼 설명
  const hy = runs.filter(function (x) { return /^#10\.28 실 효자손외/.test(String(x['명단 제목'])); })[0];
  if (hy) {
    const ob = outboxSheet_(), ol = ob.getLastRow();
    if (ol >= 2) ob.getRange(2, 1, ol - 1, 6).getValues().forEach(function (v) { if (v[2] === '방 공지' && v[5] === '대기' && /^#10\.28 실 효자손외/.test(String(v[3])) && /양식 작성 폼/.test(String(v[4]))) { obSet_(ob, v[0], 5, HYOJA1028_NOTICE); log.push('효자손외 10.28 공지'); } });
    try { FormApp.openById(hy['폼ID']).setDescription(formDesc_(HYOJA1028_NOTICE)); log.push('효자손외 폼 설명'); } catch (e) { note_('효자손외 폼 설명 실패: ' + e); }
  } else note_('⚠ #10.28 실 효자손외 진행이 아직 없어 공지 못 넣음');
  // 2) 진행목록 업체·구매시간 (월급시트 스토어·진행시간이 이걸로 채워짐)
  runs.forEach(function (x) {
    const t = String(x['명단 제목']);
    if (/^#10\.26 실 신발패드 문어괄사/.test(t) && !x['업체']) { setRun_(x.row, '업체', '유앤아이푸드'); log.push('신발패드 업체'); }
    if (/^#10\.27 실 양배추채칼외/.test(t) && !x['업체']) { setRun_(x.row, '업체', '로이시마켓'); log.push('양배추 업체'); }
    if (/백발백중 도서 기대평/.test(t) && x['진행 상태'] !== '종료' && x['구매시간'] !== SLOT) { setRun_(x.row, '구매시간', SLOT); log.push(dateTok_(t) + ' 기대평 시간'); }
  });
  // 3) 월급시트 칸 직접 (❗·빈칸·'…까지 작성')
  payTabsNow_().forEach(function (sh) {
    const L = payLayout_(sh); if (!L) return;
    const last = sh.getLastRow(); if (last <= L.head) return;
    sh.getRange(L.head + 1, L.name, last - L.head, 1).getValues().forEach(function (v, i) {
      const nm = String(v[0]), row = L.head + 1 + i;
      if (L.store && /^#10\.26 실 신발패드 문어괄사/.test(nm)) { sh.getRange(row, L.store).setValue('유앤아이푸드'); log.push(sh.getName() + ' 신발패드 스토어'); }
      if (L.store && /^#10\.27 실 양배추채칼외/.test(nm)) { sh.getRange(row, L.store).setValue('로이시마켓'); log.push(sh.getName() + ' 양배추 스토어'); }
      if (L.time && /^\d+\.\d+ 백발백중 도서 기대평/.test(nm) && !sh.getRange(row, L.time).getFormula()) { sh.getRange(row, L.time).setValue(SLOT); log.push(sh.getName() + ' ' + nm.slice(0, 5) + ' 기대평 시간'); }
    });
  });
  note_('✓ 10/27 저녁: ' + log.join(', '));
}
// (10/27 한 번, 사용자 요청) 사용자가 고치면 안 되는 자동 칸에 경고 잠금 (고치려 하면 경고창, 스크립트는 그대로 씀)
//  관리 시트: 배정 E(산 수)·F(확인)·G(시트ID), 보낼메시지 A(ID)·C(종류), 진행목록 인원·마감 시각·시트ID·폼ID·요청ID / 월급시트: 수식 칸
function protectSystemOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('PROTECT_V1')) return;
  props.setProperty('PROTECT_V1', '1');
  const DESC = '자동 칸 (스크립트가 씀, 고치지 마세요)', done = [];
  const lock = function (rg, what) {
    rg.getSheet().getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (p) { if (p.getDescription() === DESC && p.getRange().getA1Notation() === rg.getA1Notation()) p.remove(); });
    rg.protect().setDescription(DESC).setWarningOnly(true); done.push(what);
  };
  const col = function (sh, c, what) { if (c > 0) lock(sh.getRange(2, c, Math.max(sh.getMaxRows() - 1, 1), 1), sh.getName() + ' ' + what); };
  try { const as = assignSheet_(); col(as, 5, '산 수'); col(as, 6, '확인'); col(as, 7, '시트ID'); } catch (e) { note_('배정 잠금 실패: ' + e); }
  try { const ob = outboxSheet_(); col(ob, 1, 'ID'); col(ob, 3, '종류'); } catch (e) { note_('보낼메시지 잠금 실패: ' + e); }
  try {
    const ls = ensureListSheet_(), hd = ls.getRange(1, 1, 1, ls.getLastColumn()).getValues()[0].map(String);
    ['인원', '마감 시각', '시트ID', '폼ID', '요청ID'].forEach(function (h) { col(ls, hd.indexOf(h) + 1, h); });
  } catch (e) { note_('진행목록 잠금 실패: ' + e); }
  try {
    payTabsNow_().forEach(function (sh) {
      const L = payLayout_(sh); if (!L) return;
      const last = Math.max(sh.getLastRow(), L.head + 1), fm = sh.getRange(L.head + 1, 1, 1, sh.getLastColumn()).getFormulas()[0];
      fm.forEach(function (f, j) { if (f) lock(sh.getRange(L.head + 1, j + 1, sh.getMaxRows() - L.head, 1), sh.getName() + ' ' + colLetter_(j + 1)); });
    });
  } catch (e) { note_('월급시트 잠금 실패: ' + e); }
  note_('✓ 자동 칸 경고 잠금 ' + done.length + '곳: ' + done.join(', '));
}
// (10/27 한 번, 사용자 요청) 10.27 리뷰 가이드 다시: 텀블러 = 포토 2명·별점 3명 (의뢰서 '2개 정도만 사진, 나머지는 별점'),
//  효자손외 = 상품마다 포토3·글2 (의뢰서), 거치대 3종 가이드를 상품별로 (전엔 다 같은 사람·텍스트리뷰 14명으로 나감)
function rvGuide1027Once_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('RVGUIDE1027_V1')) return;
  props.setProperty('RVGUIDE1027_V1', '1');
  const F = ['🐥🐥🐥🐥🐥🐥🐥🐥🐥🐥', '배송완료 후 7일이내로 작성해주시되', '몰리지 않게 리뷰 부탁드려요!', '감사합니다 🫶🏻', '🐥🐥🐥🐥🐥🐥🐥🐥🐥🐥', '', '전체 리뷰완료 후 @회오리 태그걸어주세요!'];
  const tumb = ['🐥리뷰내용 가이드🐥', '', '포토리뷰(2명) : 이선순 김광태', '→ 사진 2장 이상 + 짧은 글 (텀블러 사용하는 모습, 색상 잘 보이게)', '', '별점(3명) : 허예인 허예인 김누리', '→ 별점 5점만 (글·사진 없이)', ''].concat(F, ['0/5', '', '🐥🐥🐥🐥🐥🐥🐥🐥🐥🐥']).join('\n');
  const hy = ['🐥리뷰내용 가이드🐥', '', '포토리뷰(8명) : 강효수 박소영 장정원 서민영 김채은 신윤정 양슬기 안종원', '텍스트리뷰(6명) : 김애자 정기혜 김미숙 장혜연 신현규 류가영', '',
    '🐥효자손 리뷰내용 가이드 (코코스무 효자손)', '포토리뷰(3명) : 강효수 박소영 장정원', '텍스트리뷰(2명) : 김애자 정기혜', '글100자이상', '1. 2개구성으로 거실하나 방하나 두고 편하게 쓸수있어서 좋다', '2. 길이가 넉넉해서 원하는곳 가능', '',
    '🐥맥세이프 휴대폰 거치대 리뷰내용 가이드', '포토리뷰(2명) : 서민영 김채은', '텍스트리뷰(2명) : 김미숙 장혜연', '글100자이상', '1. 강력흡착으로 차량아니어도 사용가능 단단한 고정력', '2. 360도 회전으로 자유로운 각도조절', '3. 깔끔한디자인 휴대편리', '',
    '🐥대쉬보드 시야확보 거치대 리뷰내용 가이드', '포토리뷰(3명) : 신윤정 양슬기 안종원', '텍스트리뷰(2명) : 신현규 류가영', '글100자이상', '1. 강력한 흡착력 유리,대쉬보드 다가능', '2. 시야확보 멘트 무조건', '3. 폭포수 유선 디자인', '4. 각도조절 자유롭다', ''].concat(F, ['0/14', '', '🐥🐥🐥🐥🐥🐥🐥🐥🐥🐥']).join('\n');
  const ob = outboxSheet_(), ol = ob.getLastRow(), log = [];
  if (ol >= 2) ob.getRange(2, 1, ol - 1, 6).getValues().forEach(function (v) {
    if (v[2] !== '방 공지' || v[5] !== '대기' || !/^🐥리뷰내용 가이드🐥/.test(String(v[4]))) return;
    if (/^#10\.27 실 런치버스 텀블러/.test(String(v[3]))) { obSet_(ob, v[0], 5, tumb); log.push('텀블러'); }
    if (/^#10\.27 실 효자손외/.test(String(v[3]))) { obSet_(ob, v[0], 5, hy); log.push('효자손외'); }
  });
  note_('✓ 10.27 리뷰 가이드 다시: ' + (log.join(', ') || '대기 중인 글 없음'));
}
// (10/27 한 번, 사용자 요청) 실 런치버스 텀블러(10.27~): 하루 5명 중 포토 1명·별점 4명, 색상마다 포토 한 명 (10.27 연그린 = 이선순 이미 함)
function tumbRvOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('TUMBRV_V1')) return;
  props.setProperty('TUMBRV_V1', '1');
  const runs = readRuns_(), me = runs.filter(function (x) { return /^#10\.27 실 런치버스 텀블러/.test(String(x['명단 제목'])); })[0];
  if (!me) { note_('⚠ 텀블러 10.27 진행을 못 찾음'); return; }
  const c = chainsOf_(runs).filter(function (ch) { return ch.runs.some(function (x) { return x.row === me.row; }); })[0];
  const sids = {};
  [(c && c.runs.filter(function (x) { return x['시트ID']; })[0]) || me, me].forEach(function (x) { if (x['시트ID']) sids[x['시트ID']] = 1; });
  const dayMix = {};
  ['10.28', '10.29', '10.30'].forEach(function (d) { runs.forEach(function (x) { if (new RegExp('^#' + d.replace('.', '\\.') + ' 실 런치버스 텀블러').test(String(x['명단 제목']))) dayMix[bareTitle_(x['명단 제목']).replace(/\s+/g, '')] = '포토리뷰 1, 별점 4'; }); });
  Object.keys(sids).forEach(function (sid) {
    let rv = {}; try { rv = JSON.parse(props.getProperty('RV_' + sid) || '{}') || {}; } catch (e) {}
    rv.kind = 'mix'; rv.guide = '없음'; rv.photoPerOpt = true; rv.photoUsed = ['연그린'];
    rv.dayMix = Object.assign({}, rv.dayMix || {}, dayMix);
    rv.lineNote = { '포토리뷰': '→ 사진 1~2장  + 짧은 글', '별점': '→ 별점 5점만 (글, 사진 없이 !!!)' };
    props.setProperty('RV_' + sid, JSON.stringify(rv));
  });
  // 10.27 대기 가이드는 사용자가 보낸 글로 (제가 다시 쓴 글은 이름이 틀렸음)
  const SENT = ['🐥리뷰내용 가이드🐥', '', '포토리뷰(1명) : 이선순', '→ 사진 1~2장  + 짧은 글', '', '별점(4명) : 허예인 김누리 구정선 김광태', '→ 별점 5점만 (글, 사진 없이 !!!)', '', '🐥🐥🐥🐥🐥🐥🐥🐥🐥🐥', '배송완료 후 7일이내로 작성해주시되', '몰리지 않게 리뷰 부탁드려요!', '감사합니다 🫶🏻', '🐥🐥🐥🐥🐥🐥🐥🐥🐥🐥', '', '전체 리뷰완료 후 @회오리 태그걸어주세요!', '0/5'].join('\n');
  const ob = outboxSheet_(), ol = ob.getLastRow();
  if (ol >= 2) ob.getRange(2, 1, ol - 1, 6).getValues().forEach(function (v) { if (v[2] === '방 공지' && v[5] === '대기' && /^#10\.27 실 런치버스 텀블러/.test(String(v[3])) && /^🐥리뷰내용 가이드🐥/.test(String(v[4]))) obSet_(ob, v[0], 5, SENT); });
  note_('✓ 텀블러 리뷰: 날마다 포토 1·별점 4, 색상마다 포토 한 명 (' + Object.keys(dayMix).join(', ') + ')');
}
// (10/28 한 번, 사용자 요청) 기대평 10.29(조아린 A, . 방윤아 B)·11.5(반대) 공지에 이름: 일정 탭 계획과 이미 만든 대기 공지
function expWho1029Once_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('EXPWHO1029_V1')) return;
  props.setProperty('EXPWHO1029_V1', '1');
  const log = [];
  const ps = planSheet_(), pl = ps.getLastRow();
  if (pl >= 2) ps.getRange(2, 1, pl - 1, PLAN_HEAD.length).getValues().forEach(function (x, i) {
    const tok = dateTok_(x[5]);
    if (String(x[0]).indexOf('exp-100-4-v5-') !== 0 || (tok !== '10.29' && tok !== '11.5')) return;
    const mx = EXP_MIX[tok], cfg = JSON.parse(x[9]);
    cfg.desc = expNoticeMix_(mx[0], mx[1], EXP_WHO[tok]);
    ps.getRange(i + 2, 10).setValue(JSON.stringify(cfg)); log.push(tok + ' 계획');
  });
  const ob = outboxSheet_(), ol = ob.getLastRow(), w = EXP_WHO['10.29'];
  if (ol >= 2) ob.getRange(2, 1, ol - 1, 6).getValues().forEach(function (v) {
    if (v[2] !== '방 공지' || v[5] !== '대기' || !/^10\.29 백발백중 도서 기대평/.test(String(v[3]))) return;
    const t = String(v[4]).replace(/(A묶음\(\d+개 링크\) \d+명)(?! -)/, '$1 - ' + w.A).replace(/(B묶음\(\d+개 링크\) \d+명)(?! -)/, '$1 - ' + w.B)
      .replace(/(🔵 A묶음 \(\d+개 링크\))(?! -)/, '$1 - ' + w.A).replace(/(🟢 B묶음 \(\d+개 링크\))(?! -)/, '$1 - ' + w.B);
    if (t !== String(v[4])) { obSet_(ob, v[0], 5, t); log.push('10.29 대기 공지'); }
  });
  note_('✓ 기대평 10.29·11.5 이름: ' + (log.join(', ') || '바꿀 것 없음'));
}
// (10/28 한 번, 사용자 요청) #10.28 유러피안샐러드외: 장바구니건(3종)인데 장바구니 표시가 서버까지 안 와서 방제 20·결제금액 10,380원으로 봄
//  → 장바구니 3, 방제·명단 시트·월급시트 60, 잘못 들어간 결제금액 확인 할 일(대기) 지움
function salad1028Once_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('SALAD1028_V1')) return;
  props.setProperty('SALAD1028_V1', '1');
  const r = readRuns_().filter(function (x) { return /^#10\.28 유러피안샐러드외/.test(String(x['명단 제목'])) && x['시트ID']; })[0];
  if (!r) { note_('⚠ 유러피안샐러드외 진행을 못 찾음'); return; }
  props.setProperty('CART_' + r['시트ID'], '3');
  try { const pk = 'OPTPRICE_' + r['시트ID'], mp = JSON.parse(props.getProperty(pk) || '{}'); Object.keys(mp).forEach(function (c) { if (/\+/.test(c)) mp[c] = 32020; }); props.setProperty(pk, JSON.stringify(mp)); } catch (e) {}
  const nb = bareTitle_(r['명단 제목']).replace(/\d+\s*$/, '60');
  const ok = renameRun_(r, nb, '장바구니 60건');
  const ob = outboxSheet_(), ol = ob.getLastRow(), del = [];
  if (ol >= 2) ob.getRange(2, 1, ol - 1, 6).getValues().forEach(function (v, i) { if (v[2] === '할 일' && v[5] === '대기' && /\[결제금액 확인\] #10\.28 유러피안샐러드외/.test(String(v[4])) && /공지 10,380원/.test(String(v[4]))) del.push(i + 2); });
  for (let j = del.length - 1; j >= 0; j--) ob.deleteRow(del[j]);
  note_('✓ 유러피안샐러드외 장바구니: ' + (ok ? '방제 ' + nb : '방제 그대로') + ', 잘못된 결제금액 확인 ' + del.length + '줄 지움');
}
// (10/27 한 번) 지금 배정 탭에 남은 줄의 옵션 가격을 시트마다 기억 (앞으로는 배정을 쓸 때마다 기억)
function optPriceSeedOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('OPTPRICE_SEED_V1')) return;
  props.setProperty('OPTPRICE_SEED_V1', '1');
  const as = assignSheet_(), al = as.getLastRow(), by = {};
  if (al >= 2) as.getRange(2, 1, al - 1, 9).getValues().forEach(function (v) { const sid = String(v[6]), c = String(v[7]).trim(), p = Number(String(v[8]).replace(/[^0-9]/g, '')) || 0; if (sid && c && p) (by[sid] = by[sid] || {})[c] = p; });
  // 양배추채칼외는 배정 줄이 지워져서 10/27 낮에 본 값으로
  by['1o5XI6KkuMbYZDRujaYGdhswOL55w4ttFYZJU2UThYjE'] = Object.assign({ '양배추 채칼 메탈실버 1개': 9800, '턱걸이스트랩 다크블랙': 14600, '주방가위': 10800, '음식물거름망 올리브그린': 8900, '안경세척기 퓨어화이트': 17800, '전자레인지찜기 그레이 블루': 9700, '도어스토퍼 다크블랙': 17800, '변기솔 화이트': 8300, '오토바이방한장갑 블랙워머': 15800, '방수테이프 화이트 2개': 8600, '눈썹제모기 로즈핑크': 12800 }, by['1o5XI6KkuMbYZDRujaYGdhswOL55w4ttFYZJU2UThYjE'] || {});
  Object.keys(by).forEach(function (sid) { const k = 'OPTPRICE_' + sid; let mp = {}; try { mp = JSON.parse(props.getProperty(k) || '{}'); } catch (e) {} props.setProperty(k, JSON.stringify(Object.assign(by[sid], mp))); });
  note_('✓ 옵션 가격 기억: 시트 ' + Object.keys(by).length + '개');
}
// (10/27 한 번) 양배추채칼외 결제금액 다시 (배정 줄이 비어서 V1에서 못 본 것 → 같은 옵션 다수 금액으로)
function payRetro2Once_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('PAYRETRO_V2')) return;
  props.setProperty('PAYRETRO_V2', '1');
  const r = readRuns_().filter(function (x) { return /^#10\.27 실 양배추채칼외/.test(String(x['명단 제목'])) && x['시트ID']; })[0];
  if (!r) return;
  const info = rawInfo_(r['시트ID'], r['폼ID']), raw = info.raw, lr = raw.getLastRow();
  if (lr < 2) return;
  const head = headers_(raw), add = [];
  raw.getRange(2, 1, lr - 1, head.length).getValues().forEach(function (v) { if (!(v[0] instanceof Date)) return; const o = {}; head.forEach(function (h, j) { o[h] = v[j]; }); add.push({ t: v[0].getTime(), o: o }); });
  payCheck_(SpreadsheetApp.openById(r['시트ID']), add);
  note_('✓ 양배추채칼외 결제금액 다시 봄 (응답 ' + add.length + '개)');
}
// (10/27 한 번) 결제금액 확인을 배정 가격으로 다시: 10.26~ 진행 응답 전부 (그때는 폼 보기에 가격이 없어 못 본 것)
function payRetroOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('PAYRETRO_V1')) return;
  props.setProperty('PAYRETRO_V1', '1');
  const seen = {};
  readRuns_().forEach(function (r) {
    if (!r['시트ID'] || seen[r['시트ID']] || isExpect_(r) || !(r['진행일'] instanceof Date) || r['진행일'] < new Date(2026, 9, 26)) return;
    seen[r['시트ID']] = 1;
    try {
      const info = rawInfo_(r['시트ID'], r['폼ID']), raw = info.raw, lr = raw.getLastRow();
      if (lr < 2) return;
      const head = headers_(raw), add = [];
      raw.getRange(2, 1, lr - 1, head.length).getValues().forEach(function (v) { if (!(v[0] instanceof Date)) return; const o = {}; head.forEach(function (h, j) { o[h] = v[j]; }); add.push({ t: v[0].getTime(), o: o }); });
      payCheck_(SpreadsheetApp.openById(r['시트ID']), add);
    } catch (e) { note_('결제금액 다시 보기 실패 ' + bareTitle_(r['명단 제목']) + ': ' + e); }
  });
}
// (10/27 한 번, 사용자 요청) #10.27 실 양배추채칼외 배정 탭에서 '소정' 줄 지움 (안 사고 나감. 박소정은 다른 사람이라 그대로)
function cabbageSojungOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('CABBAGE_SOJ_V1')) return;
  props.setProperty('CABBAGE_SOJ_V1', '1');
  const as = assignSheet_(), al = as.getLastRow();
  if (al < 2) return;
  const del = [];
  as.getRange(2, 1, al - 1, 2).getValues().forEach(function (v, i) { if (/^#10\.27 실 양배추채칼외/.test(String(v[0])) && String(v[1]).trim() === '소정') del.push(i + 2); });
  if (del.length !== 1) { note_('⚠ 양배추채칼외 배정에서 소정 줄이 ' + del.length + '개라 안 지움'); return; }
  as.deleteRow(del[0]);
  note_('✓ 양배추채칼외 배정에서 소정 줄 지움 (안 사고 나감)');
}
// (10/27 한 번, 사용자 요청) 효자손외 배정 탭: 거치대 줄 7개가 모두 '맥세이프 휴대폰 거치대'로, 효자손 줄은 빈칸으로 연결돼 있었음
//  (공지 상품 이름을 끝 낱말 '거치대'로만 줄여 3종류를 구분 못 함). 효자손 줄 → 코코스무 효자손 우드, 신현규·신윤정·슬기·워니 → 대쉬보드 시야확보 거치대(폼에 낸 것)
function hyojaAssignOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('HYOJA_ASG_V1')) return;
  props.setProperty('HYOJA_ASG_V1', '1');
  const as = assignSheet_(), al = as.getLastRow(); if (al < 2) return;
  const HY = '코코스무 효자손 우드 (옵션단일)', DASH = '코코스무 대쉬보드 시야확보 거치대 블랙 (옵션단일)', log = [];
  as.getRange(2, 1, al - 1, 8).getValues().forEach(function (v, i) {
    if (String(v[0]) !== '#10.27 실 효자손외 20 (뽀짝오리)') return;
    const nk = String(v[1]).trim(), lab = String(v[2]);
    let want = '';
    if (/효자손/.test(lab)) want = HY;
    else if (/거치대/.test(lab) && /^(신현규|신윤정|슬기|워니)$/.test(nk)) want = DASH;
    if (!want || String(v[7]) === want) return;
    as.getRange(i + 2, 8).setValue(want); log.push(nk);
  });
  note_('✓ 효자손외 배정 옵션 고침: ' + (log.join(', ') || '바꿀 것 없음'));
}
// (10/27 한 번) 런치버스 텀블러 4색상(색마다 5개, 하루 5명): 다음 일차 공지·일정이 '검정 (  명)'처럼 인원이 비어 있음 (만들 때 생성기가 옵션 이름 없이 '4색상'으로 읽어서)
//  10.27 실제 2·1·1·1 → 10.28 1·2·1·1, 10.29 1·1·2·1, 10.30 1·1·1·2 (색마다 5개). 안 보낸 10.28 공지, 폼 설명(빈 인원이 있을 때만), 10.29·10.30 일정
function tumbler1027Once_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('TUMB1027_V1')) return;
  props.setProperty('TUMB1027_V1', '1');
  const C = ['검정', '아이보리', '연그린', '하늘색'], log = [];
  const fill = function (t, n) {
    return String(t).split('\n').map(function (l) {
      const m = l.match(/^(\s*(?:🐥\s*옵션\s*[:：]\s*)?)(검정|아이보리|연그린|하늘색)\s*\(\s*명\s*\)\s*$/);
      return m ? m[1] + m[2] + ' (' + n[C.indexOf(m[2])] + '명)' : l;
    }).join('\n');
  };
  const d28 = [1, 2, 1, 1];
  const r28 = readRuns_().filter(function (x) { return bareTitle_(x['명단 제목']) === '#10.28 실 런치버스 텀블러 5' && x['진행 상태'] !== '종료'; })[0];
  if (r28) {
    withObWrite_(function () {
      const ob = outboxSheet_(), ol = ob.getLastRow(); if (ol < 2) return;
      ob.getRange(2, 1, ol - 1, 6).getValues().forEach(function (v) {
        if (String(v[3]) === '#10.28 실 런치버스 텀블러 5' && v[2] === '방 공지' && v[5] !== '보냄' && /\(\s*명\s*\)/.test(String(v[4]))) { obSet_(ob, v[0], 5, fill(v[4], d28)); log.push('10.28 공지 1·2·1·1'); }
      });
    });
    try { const f = FormApp.openById(r28['폼ID']), ds = String(f.getDescription() || ''); if (/(검정|아이보리|연그린|하늘색)\s*\(\s*명\s*\)/.test(ds)) { f.setDescription(fill(ds, d28)); log.push('폼 설명'); } } catch (e) { log.push('폼 설명 실패: ' + e); }
  } else log.push('10.28 진행 못 찾음');
  try {
    const ps = planSheet_(), pl = ps.getLastRow();
    if (pl >= 2) ps.getRange(2, 1, pl - 1, PLAN_HEAD.length).getValues().forEach(function (v, i) {
      const want = String(v[0]) === '8cwumhm2-3' ? [1, 1, 2, 1] : String(v[0]) === '8cwumhm2-4' ? [1, 1, 1, 2] : null;
      if (!want || v[8] !== '대기') return;
      ps.getRange(i + 2, 8).setValue(JSON.stringify([[5, want, '', C]]));
      log.push(String(v[4]) + ' ' + want.join('·'));
    });
  } catch (e) { log.push('일정 실패: ' + e); }
  note_('✓ 텀블러 옵션 인원 채움: ' + (log.join(', ') || '바꿀 것 없음'));
}
// (10/27 한 번, 사용자 요청) '#택10.28 줄넘기 2' 방 공지 칸(m11062be8d2a5)에 속눈썹 명단 전달 글이 붙여넣어진 것(10/27 08:04 사람이 붙여넣기, 기록 있음) → 지움
//  같은 방의 정상 공지(m47cc8b6581ca)가 따로 있어서 그 줄만 남김. 글이 그새 바뀌었으면 안 건드림
function fix1027Once_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('FIX1027_V1')) return;
  props.setProperty('FIX1027_V1', '1');
  const res = withObWrite_(function () {
    const ob = outboxSheet_(), ol = ob.getLastRow(); if (ol < 2) return '보낼메시지 비어 있음';
    const v = ob.getRange(2, 1, ol - 1, 6).getValues();
    const bad = v.findIndex(function (x) { return String(x[0]) === 'm11062be8d2a5' && /^https:\/\/docs\.google\.com\/spreadsheets/.test(String(x[4])) && /속눈썹영양제/.test(String(x[4])) && x[5] !== '보냄'; });
    const good = v.some(function (x) { return String(x[0]) !== 'm11062be8d2a5' && String(x[3]) === '#택10.28 줄넘기 2' && x[2] === '방 공지' && /양식 작성 폼/.test(String(x[4])); });
    if (bad < 0) return '그 줄이 없거나 이미 고쳐짐';
    if (!good) return '줄넘기 10.28 정상 공지가 없어서 안 지움';
    ob.deleteRow(bad + 2);
    return '줄넘기 10.28 방에 잘못 들어간 속눈썹 명단 글 지움 (정상 공지 줄은 그대로)';
  });
  note_('✓ 10/27 보낼메시지: ' + res);
}
// (10/26 한 번, 사용자 요청 '이렇게 달라지면 안 된다고') 1) 효자손: 명단 시트·폼·폴더 '# 실 유앤아이푸드 효자손외' → '# 실 효자손외' (방제와 같게)
//  2) '#10.27 실 치약걸이 보냉백 5' → '#10.27 실/빈 치약걸이 보냉백 5' (시트·폼은 이미 '# 실/빈 치약걸이 보냉백'). 10.26은 전부 실배송이라 그대로
function names1026Once_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('NAMES1026_V1')) return;
  props.setProperty('NAMES1026_V1', '1');
  const runs = readRuns_(), log = [];
  const h = runs.filter(function (x) { return /^#10\.27 실 (유앤아이푸드 )?효자손외 20$/.test(bareTitle_(x['명단 제목'])) && x['진행 상태'] !== '종료'; })[0];
  if (h) { const d = renameRunFiles_(h, '# 실 유앤아이푸드 효자손외', '# 실 효자손외'); log.push('효자손 ' + (d.length ? d.join('·') : '바꿀 것 없음')); } else log.push('효자손 진행 못 찾음');
  const b = runs.filter(function (x) { return bareTitle_(x['명단 제목']) === '#10.27 실 치약걸이 보냉백 5' && x['진행 상태'] !== '종료'; })[0];
  if (b) {
    globalThis.__PAY_RENAME_ANY = true;
    try { log.push(renameRun_(b, '#10.27 실/빈 치약걸이 보냉백 5', '실/빈') ? '보냉백 10.27 → #10.27 실/빈 치약걸이 보냉백 5' : '보냉백 방제 못 바꿈'); }
    finally { globalThis.__PAY_RENAME_ANY = false; }
  } else log.push('보냉백 10.27 진행 못 찾음');
  note_('✓ 10/26 이름 맞추기: ' + log.join(', ') + ' (카톡방 이름은 직접 바꿔 주세요)');
}
// (10/26 한 번, 사용자 요청) 치약걸이 보냉백: 명단 시트·폼·폴더 이름 '# 실 치약걸이 보냉백' → '# 실/빈 치약걸이 보냉백' (방제·카톡방은 그대로)
//  명단 탭 노란색: 10.26은 전부 실배송(치약걸이 2 + 보냉백 3), 10.27부터는 치약걸이(실배송)만, 보냉백(일반배송)은 안 칠함
function bagSilBinOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('BAG_SILBIN_V1')) return;
  props.setProperty('BAG_SILBIN_V1', '1');
  const r = readRuns_().filter(function (x) { return String(x['요청ID']) === 'm9qmh8ds' && /치약걸이/.test(x['명단 제목']) && /보냉백/.test(x['명단 제목']); })[0];
  if (!r || !r['시트ID']) { note_('치약걸이 보냉백 실/빈: 진행을 못 찾음'); return; }
  const OLD = '# 실 치약걸이 보냉백', NEW = '# 실/빈 치약걸이 보냉백', log = [];
  const ren = function (kind, get, set) { try { const cur = String(get()); if (cur.indexOf(OLD) === 0) { set(NEW + cur.slice(OLD.length)); log.push(kind); } else log.push(kind + ' 그대로(' + cur + ')'); } catch (e) { log.push(kind + ' 실패: ' + e); } };
  const sid = String(r['시트ID']), fid = String(r['폼ID'] || ''), fo = (String(r['폴더 링크'] || '').match(/[-\w]{25,}/) || [])[0];
  ren('명단 시트', function () { return DriveApp.getFileById(sid).getName(); }, function (n) { DriveApp.getFileById(sid).setName(n); });
  if (fid) {
    let fm = null; try { fm = FormApp.openById(fid); } catch (e) { log.push('폼 못 엶: ' + e); }
    if (fm) ren('폼 제목', function () { return fm.getTitle(); }, function (n) { fm.setTitle(n); });
    ren('폼 파일', function () { return DriveApp.getFileById(fid).getName(); }, function (n) { DriveApp.getFileById(fid).setName(n); });
  }
  if (fo) ren('폴더', function () { return DriveApp.getFolderById(fo).getName(); }, function (n) { DriveApp.getFolderById(fo).setName(n); });
  const rule = [{ from: '2026-10-27', opt: '치약걸이' }];
  props.setProperty('LISTREALOPT_' + sid, JSON.stringify(rule));
  let re = 0; try { re = repaintRealRows_(SpreadsheetApp.openById(sid), rule); } catch (e) { log.push('색 다시 칠하기 실패: ' + e); }
  note_('✓ 치약걸이 보냉백 → ' + NEW + ' (' + log.join(', ') + '). 명단 노란색: 10.26 전부 + 10.27부터 치약걸이만' + (re ? ' (이미 들어온 10.27 줄 ' + re + '개 다시 칠함)' : ''));
}
// (10/26 한 번) 기대평 폼 '기대평 댓글 리뷰비' 보기 1주차/2주차 → A묶음/B묶음 (A·B묶음으로 바꿀 때 못 고친 예전 글. 금액 같음, 이미 낸 응답 값은 그대로)
function expFeeAbOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('EXPFEE_AB_V1')) return;
  props.setProperty('EXPFEE_AB_V1', '1');
  const seen = {}, log = [];
  readRuns_().forEach(function (r) {
    const fid = String(r['폼ID'] || '');
    if (!isExpect_(r) || !fid || seen[fid] || r['진행 상태'] === '종료') return;
    seen[fid] = 1;
    try {
      FormApp.openById(fid).getItems(FormApp.ItemType.MULTIPLE_CHOICE).forEach(function (it) {
        if (!/기대평\s*댓글\s*리뷰비/.test(it.getTitle())) return;
        const mc = it.asMultipleChoiceItem(), cur = mc.getChoices().map(function (c) { return c.getValue(); });
        if (!cur.some(function (c) { return /주차/.test(c); })) return;
        mc.setChoiceValues(expFeeCh_());
        log.push(bareTitle_(r['명단 제목']) + ' (' + cur.join(' / ') + ' → ' + expFeeCh_().join(' / ') + ')');
      });
    } catch (e) { log.push(bareTitle_(r['명단 제목']) + ' 실패: ' + e); }
  });
  note_('✓ 기대평 폼 리뷰비 보기: ' + (log.join(', ') || '고칠 폼 없음'));
}
// (10/26 한 번, 사용자 요청 '날짜별로 말고 한 캠페인이 모두 완료되면 그때 취합') 날마다 넣던 '그날 리뷰가 다 확인됐어요 → 리뷰 사진 취합하기' 할 일 중
//  안 보낸 것만 지움 (이제 의뢰가 다 끝나면 '리뷰 캡처 올리기' 할 일 하나). 취완 글은 그대로
function rvCampOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('RVCAMP_V1')) return;
  props.setProperty('RVCAMP_V1', '1');
  const gone = withObWrite_(function () {
    const ob = outboxSheet_(), ol = ob.getLastRow(), del = [];
    if (ol < 2) return [];
    ob.getRange(2, 1, ol - 1, 6).getValues().forEach(function (v, i) {
      if (v[2] === '할 일' && String(v[3]) === '내 할 일' && v[5] !== '보냄' && /그날 리뷰가 다 확인됐어요 → 리뷰 사진 취합하기/.test(String(v[4]))) del.push({ row: i + 2, t: (String(v[4]).match(/^\[([^\]]+)\]/) || [])[1] || '' });
    });
    for (let j = del.length - 1; j >= 0; j--) ob.deleteRow(del[j].row);
    return del.map(function (x) { return x.t; });
  });
  note_('✓ 리뷰 취합을 의뢰 단위로: 날마다 넣던 리뷰 사진 취합 할 일 ' + gone.length + '개 지움' + (gone.length ? ' (' + gone.join(', ') + ')' : '') + ' → 의뢰가 다 끝나면 리뷰 캡처 올리기 할 일 하나');
}
// (10/26 한 번, 사용자 요청) 보낼메시지 정리
//  1) 하루 인원 바꾸기로 취소된 실링팬 진행(10.30, 11.02~11.04)의 안 보낸 공지 지움 (예전 코드가 '취소'를 못 써서 '대기'로 남음)
//  2) #10.26 실링팬 2 리뷰 가이드: 윤정(포토 가이드)·허예인(방 공지)으로 나뉜 걸 하나로 (포토리뷰 2명, 0/2), 포토는 이미 전달함
//  3) 옥광밤 리뷰 보고 글의 '(응답)' 뺌
function fix1026cOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('FIX1026C_V1')) return;
  props.setProperty('FIX1026C_V1', '1');
  const log = [], runs = readRuns_();
  ['#10.30 실링팬 1', '#11.02 실링팬 1', '#11.03 실링팬 1', '#11.04 실링팬 1'].forEach(function (room) {
    const r = runs.filter(function (x) { return bareTitle_(x['명단 제목']) === room; })[0];
    if (r && r['진행 상태'] !== '종료') return;   // 취소(종료)된 진행만
    const n = delPendingFor_(room); if (n) log.push(room + ' ' + n + '줄 지움');
  });
  const ob = outboxSheet_(), ol = ob.getLastRow(), v = ol >= 2 ? ob.getRange(2, 1, ol - 1, 6).getValues() : [];
  const g1 = v.filter(function (x) { return String(x[3]) === '#10.26 실링팬 2' && x[2] === '포토 가이드' && x[5] !== '보냄' && /포토리뷰\(1명\)\s*:\s*윤정/.test(String(x[4])); })[0];
  const g2 = v.filter(function (x) { return String(x[3]) === '#10.26 실링팬 2' && x[2] === '방 공지' && x[5] !== '보냄' && /포토리뷰\(1명\)\s*:\s*허예인/.test(String(x[4])); })[0];
  if (g1 && g2) {
    const t = String(g2[4]).replace(/포토리뷰\(1명\)\s*:\s*허예인/, '포토리뷰(2명) : 윤정 허예인').replace(/\n0\/1\n/, '\n0/2\n');
    obSet_(ob, g2[0], 5, t);
    withObWrite_(function () { const o2 = outboxSheet_(), l2 = o2.getLastRow(), ids = o2.getRange(2, 1, l2 - 1, 1).getValues(); for (let i = ids.length - 1; i >= 0; i--) if (String(ids[i][0]) === String(g1[0])) o2.deleteRow(i + 2); });
    log.push('#10.26 실링팬 2 가이드 하나로 (포토리뷰 2명, 0/2)');
  }
  v.forEach(function (x) { if (x[2] === '리뷰 보고' && x[5] !== '보냄' && /\(응답\)/.test(String(x[4]))) { obSet_(ob, x[0], 5, String(x[4]).replace(/\s*\(응답\)/g, '')); log.push('리뷰 보고 (응답) 뺌'); } });
  note_('✓ 10/26 보낼메시지 정리: ' + (log.join(', ') || '고칠 것 없음'));
}
// (10/26 한 번, 사용자 요청) 실링팬 10.27은 포토 1 + 텍스트 1 (10.26을 둘 다 포토로 바꿔서 비율 계산과 달라짐. 10.28·10.29는 계산대로 각각 포토 1 + 텍스트 1 → 포토 6 · 텍스트 4)
function silingDayMixOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('SILING_DAYMIX_V1')) return;
  props.setProperty('SILING_DAYMIX_V1', '1');
  const r = readRuns_().filter(function (x) { return /^#10\.27 실링팬/.test(bareTitle_(x['명단 제목'])) && x['진행 상태'] !== '종료'; })[0];
  if (!r || !r['시트ID']) { note_('실링팬 10.27 리뷰 종류: 진행을 못 찾음'); return; }
  const k = 'RV_' + r['시트ID'];
  let rv = {}; try { rv = JSON.parse(props.getProperty(k) || '{}') || {}; } catch (e) {}
  rv.dayMix = rv.dayMix || {};
  rv.dayMix[bareTitle_(r['명단 제목']).replace(/\s+/g, '')] = '포토대기 1, 텍스트리뷰 1';
  props.setProperty(k, JSON.stringify(rv));
  note_('✓ 실링팬 10.27 리뷰 종류: 포토 1 + 텍스트 1');
}
// (10/26 한 번, 사용자 요청) 신발패드 문어괄사 진행에서 이슬비가 폼을 두 번 냄 → 맨 처음 것 지움 (폼 응답·응답 탭·명단 탭, 인원 다시 셈 = 폼수정 탭 삭제와 같음)
function delSeulbiOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('DEL_SEULBI_V1')) return;
  props.setProperty('DEL_SEULBI_V1', '1');
  const r = runByRequest_('coco1026');
  if (!r || !r['시트ID']) { note_('이슬비 응답 지우기: 진행을 못 찾음'); return; }
  const hits = [];
  SpreadsheetApp.openById(r['시트ID']).getSheets().filter(function (t) { return !!t.getFormUrl(); }).forEach(function (t) {
    const lr = t.getLastRow(), lc = Math.max(t.getLastColumn(), 1);
    if (lr < 2) return;
    t.getRange(2, 1, lr - 1, lc).getValues().forEach(function (x) { if (x[0] instanceof Date && x.slice(1).some(function (v) { return String(v).replace(/\s+/g, '').indexOf('이슬비') >= 0; })) hits.push(x[0]); });
  });
  hits.sort(function (a, b) { return a - b; });
  const f = function (d) { return Utilities.formatDate(d, CONFIG.TIMEZONE, 'HH:mm:ss'); };
  if (hits.length < 2) { note_('⚠ 이슬비 응답이 ' + hits.length + '개라 안 지움' + (hits.length ? ' (' + f(hits[0]) + ')' : '')); return; }
  note_('✓ 이슬비 첫 응답 지움 (' + f(hits[0]) + ', 남은 것 ' + hits.slice(1).map(f).join(', ') + '): ' + deleteRunTimes_(r, [hits[0]]));
}
// (10/26 한 번, 사용자 요청: 아이폰이라 생성기 확장 프로그램을 못 써서) 코코스무 의뢰서 2개(신발 뒤꿈치 패드 5 + 문어 괄사 3)를 한 진행으로
//  생성기와 같은 값(생성기를 그대로 돌려서 나온 공지·옵션·리뷰 정보). 방제는 20자 안으로 '#10.26 실 신발패드 문어괄사 8'
//  상품명·판매처·위치·가격은 의뢰서에 없고 쿠팡을 서버에서 못 읽어서 공지에 ❗로 비워 둠 (사용자가 채워서 보냄)
//  실배송 '포토 N명' = 받은 사람이 직접 찍는 포토리뷰 (업체 사진 아님) → 리뷰 종류 self
const COCO_NOTICE = "★★★바로구매★★★\n가격이 높으면 사지 마세요!\n★ 광고(AD) 상품으로 주문 절대 금지 ★\n★ 스중 상중 불가 ★ (가능하면 진행자가 따로 안내합니다)\n▶ 리뷰는 배송완료 후 7일 이내 작성\n▶ 결제 스크린샷은 필수입니다\n\n※오리방 페이백 리뷰비 안내※\n리뷰비는 방전원 다 쓰셔야지 진행자가\n요청완료 기준으로 3일 뒤에 입금되는 점\n참고하여 주세요!\n실배송은 방에 인원이 다쓰셔야 페이백 요청됩니다\n일정기간 지나면 회오리가 방탈합니다!\n지급이 어려울수 있으니 안내된 기간은 지켜주세요! 감사합니다\n★사업자 4971201389 ★\n\n☆★☆★ 양식 작성 폼 ☆★☆★\n(구글폼 링크)\n\n1) 5명\n링크타고 검색▼( 상번이 네이버일때 무시)\nhttps://coupa.ng/b59klT\n🐥판매처 : ❗\n🐥상품명 : ❗\n🐥상품번호 : 9785776578\n🐥★키워드 : 코코스무 신발 뒤꿈치 패드\n🐥위치 : ❗\n🐥옵션 : 블랙\n🐥가격 : ❗가격 넣기\n\n------------------------------------------------\n\n2) 3명\n링크타고 검색▼( 상번이 네이버일때 무시)\nhttps://coupa.ng/b59klT\n🐥판매처 : ❗\n🐥상품명 : ❗\n🐥상품번호 : 9783998793\n🐥★키워드 : 코코스무 문어 괄사\n🐥위치 : ❗\n🐥옵션 : 핑크\n🐥가격 : ❗가격 넣기";
function cocoRunOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('COCO1026_V1')) return;
  props.setProperty('COCO1026_V1', '1');
  if (Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyyMMdd') !== '20261026') { note_('코코스무 진행: 10/26이 지나서 안 만듦'); return; }
  const title = '#10.26 실 신발패드 문어괄사 8';
  const res = createRunLocked_({
    k: CONFIG.KEY, n: 'coco1026', title: title + ' (뽀짝오리)', room: title, fname: title, daily: '8', total: '8', day: '1', date: '2026-10-26',
    desc: COCO_NOTICE, type: '입대', platform: '쿠팡', takdae: false, realship: true, opts: '신발 뒤꿈치 패드 블랙\n문어 괄사 핑크',
    shop: '', slot: '★★★바로구매★★★', photo: '무', plan: '', slot2: '', croom: '',
    rv: "{\"kind\": \"self\", \"mix\": \"\", \"guide\": \"코코스무 신발 뒤꿈치 패드 : 손쉬운 부착 강력한 접착 / 원하는 크기로 부착가능 / 스티커제품 때서 붙히면끝 / 새신발 뒤꿈치 까짐 미리보호\\n코코스무 문어 괄사 : 8개의 돌기 설계로 두피 혈자리를 한번에 / 머리,얼굴,목,승모근,팔다리 다양한 부위가능 / 컴팩트한 싸이즈로 휴대자유롭다 / 1+1 구성으로 집,사무실 하나씩 또는 선물가능 / 물세척이 가능한 위생 안심소재\"}",
    urls: 'https://www.coupang.com/vp/products/9785776578?vendorItemId=96214179259\nhttps://www.coupang.com/vp/products/9783998793'
  });
  const r = runByRequest_('coco1026');
  note_('✓ 코코스무 진행 만듦: ' + (r ? bareTitle_(r['명단 제목']) + ' / 폼 ' + r['폼 링크'] + ' / 시트 ' + r['시트 링크'] : '진행목록에서 못 찾음') + (res && res.again ? ' (이미 있던 진행)' : ''));
}
// (10/26 한 번, 사용자 요청) 공지 고치기
//  치약걸이·보냉백: 오늘 방 공지 = 사용자가 보낸 글, 10.27 방 공지·폼 설명 = 같은 모양(자정 구매, 보냉백 옵션 3색 중 택1)
//  기대평: 시간 줄·예스24 50자·알라딘 마이리뷰 (expNotice_) → 10.27 방 공지·폼 설명, 앞으로 만들 일정(대기)
const BAG_NOTICE_1026 = "★★★바로구매★★★\n가격이 높으면 사지 마세요!\n★ 광고(AD) 상품으로 주문 절대 금지 ★\n★ 스중 상중 불가 ★ (가능하면 진행자가 따로 안내합니다)\n▶ 리뷰는 배송완료 후 7일 이내 작성\n▶ 결제 스크린샷은 필수입니다\n\n※오리방 페이백 리뷰비 안내※\n리뷰비는 방전원 다 쓰셔야지 진행자가\n요청완료 기준으로 3일 뒤에 입금되는 점\n참고하여 주세요!\n실배송은 방에 인원이 다쓰셔야 페이백 요청됩니다\n일정기간 지나면 회오리가 방탈합니다!\n지급이 어려울수 있으니 안내된 기간은 지켜주세요! 감사합니다\n★사업자 4971201389 ★\n\n☆★☆★ 양식 작성 폼 ☆★☆★\nhttps://forms.gle/JvUNH6HVbto5uvvH8\n\n링크타고 검색▼( 상번이 네이버일때 무시)\nhttps://coupa.ng/b59klT\n🐥판매처 : 아이누빅\n🐥상품명 : 루오넬 무타공 치약걸이 벽부착 롱 튜브 홀더 화이트 1개\n🐥상품번호 : \n🐥★키워드 : 무타공 치약걸이\n🐥위치 : 1페이지(로켓으로 들어가서 일반상품으로 변경해주세요!!)\n🐥옵션 : 클린화이트\n🐥가격 : 17,800\n\n링크타고 검색▼( 상번이 네이버일때 무시)\nhttps://coupa.ng/b59klT\n🐥판매처 : 아이누빅\n🐥상품명 : 루오넬 데일리 보온 보냉백 이유식 도시락가방 런치백, XL\n🐥상품번호 : \n🐥★키워드 : 보냉백\n🐥위치 : 1페이지(가검 17,000, 필터 패턴/프린트 : 단색)\n🐥옵션 : 블랙 - 고지은, 네이비 - 박민아, 그레이-민아\n🐥가격 : 17,000";
const BAG_NOTICE_1027 = "★★★자정 ~ 오전 8시 20분 구매★★★\n가격이 높으면 사지 마세요!\n★ 광고(AD) 상품으로 주문 절대 금지 ★\n★ 스중 상중 불가 ★ (가능하면 진행자가 따로 안내합니다)\n▶ 리뷰는 배송완료 후 7일 이내 작성\n▶ 결제 스크린샷은 필수입니다\n\n※오리방 페이백 리뷰비 안내※\n리뷰비는 방전원 다 쓰셔야지 진행자가\n요청완료 기준으로 3일 뒤에 입금되는 점\n참고하여 주세요!\n실배송은 방에 인원이 다쓰셔야 페이백 요청됩니다\n일정기간 지나면 회오리가 방탈합니다!\n지급이 어려울수 있으니 안내된 기간은 지켜주세요! 감사합니다\n★사업자 4971201389 ★\n\n☆★☆★ 양식 작성 폼 ☆★☆★\nhttps://forms.gle/JvUNH6HVbto5uvvH8\n\n링크타고 검색▼( 상번이 네이버일때 무시)\nhttps://coupa.ng/b59klT\n🐥판매처 : 아이누빅\n🐥상품명 : 루오넬 무타공 치약걸이 벽부착 롱 튜브 홀더 화이트 1개\n🐥상품번호 : \n🐥★키워드 : 무타공 치약걸이\n🐥위치 : 1페이지(로켓으로 들어가서 일반상품으로 변경해주세요!!)\n🐥옵션 : 클린화이트\n🐥가격 : 17,800\n\n링크타고 검색▼( 상번이 네이버일때 무시)\nhttps://coupa.ng/b59klT\n🐥판매처 : 아이누빅\n🐥상품명 : 루오넬 데일리 보온 보냉백 이유식 도시락가방 런치백, XL\n🐥상품번호 : \n🐥★키워드 : 보냉백\n🐥위치 : 1페이지(가검 17,000, 필터 패턴/프린트 : 단색)\n🐥옵션 : 블랙, 그레이, 네이비 중 택1\n🐥가격 : 17,000";
function notice1026Once_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('NOTICE1026_V1')) return;
  props.setProperty('NOTICE1026_V1', '1');
  const runs = readRuns_(), log = [];
  const ob = outboxSheet_(), ol = ob.getLastRow(), v = ol >= 2 ? ob.getRange(2, 1, ol - 1, 6).getValues() : [];
  const setNotice = function (room, text) {
    let n = 0;
    v.forEach(function (x) { if (x[2] === '방 공지' && x[5] === '대기' && String(x[3]) === room && /양식 작성 폼/.test(String(x[4]))) { obSet_(ob, x[0], 5, text); n++; } });
    return n;
  };
  // 치약걸이·보냉백
  const b1 = runs.filter(function (r) { return String(r['요청ID']) === 'm9qmh8ds' && r['진행 상태'] !== '종료'; })[0], b2 = runs.filter(function (r) { return String(r['요청ID']) === 'm9qmh8ds-2' && r['진행 상태'] !== '종료'; })[0];
  if (b1 && /보냉백/.test(b1['명단 제목'])) log.push('10.26 치약걸이·보냉백 공지 ' + setNotice(String(b1['카톡방']), BAG_NOTICE_1026) + '개');
  if (b2 && /보냉백/.test(b2['명단 제목'])) {
    log.push('10.27 치약걸이·보냉백 공지 ' + setNotice(String(b2['카톡방']), BAG_NOTICE_1027) + '개');
    try { FormApp.openById(b2['폼ID']).setDescription(BAG_NOTICE_1027); log.push('치약걸이·보냉백 폼 설명'); } catch (e) { note_('치약걸이·보냉백 폼 설명 실패: ' + e); }
  }
  // 기대평 10.27 (1주차 A)
  const e2 = runs.filter(function (r) { return isExpect_(r) && r['진행 상태'] !== '종료' && dateTok_(r['명단 제목']) === '10.27'; })[0];
  if (e2 && e2['폼 링크']) {
    const t = expNotice_('A').split('(구글폼 링크)').join(String(e2['폼 링크']));
    log.push('10.27 기대평 공지 ' + setNotice(String(e2['카톡방'] || bareTitle_(e2['명단 제목'])), t) + '개');
    try { FormApp.openById(e2['폼ID']).setDescription(t); log.push('기대평 폼 설명'); } catch (e) { note_('기대평 폼 설명 실패: ' + e); }
  }
  // 기대평 앞으로 만들 일정(대기)의 공지 틀
  try {
    const ps = planSheet_(), pl = ps.getLastRow();
    let n = 0;
    if (pl >= 2) ps.getRange(2, 1, pl - 1, PLAN_HEAD.length).getValues().forEach(function (x, i) {
      if (x[8] !== '대기' || String(x[0]).indexOf('exp-100-4-v5-') !== 0) return;
      const cfg = JSON.parse(x[9]), set = Number(String(cfg.prices).replace(/[^0-9]/g, '')) === EXP_SETS.B.length * 1000 ? 'B' : 'A';
      cfg.desc = expNotice_(set);
      ps.getRange(i + 2, 10).setValue(JSON.stringify(cfg)); n++;
    });
    log.push('기대평 일정 공지 틀 ' + n + '개');
  } catch (e) { note_('기대평 일정 공지 틀 실패: ' + e); }
  note_('✓ 10/26 공지 고침: ' + log.join(', '));
}
// (10/26 한 번, 사용자 요청) 치약걸이 의뢰(m9qmh8ds)에 같은 업체(아이누빅) 보냉백 의뢰를 합침: 같은 폼·명단 시트
//  10.26 5명 = 치약걸이 2(이미 삼) + 보냉백 3 실배송, 10.27 5명 = 치약걸이 3 실배송 + 보냉백 2 일반 → 총 10건, 10.28 치약걸이 1 계획은 취소
//  폼 옵션 치약걸이/보냉백 3색, 폼·명단 시트·폴더 이름 '# 실 치약걸이 보냉백'(다른 의뢰처럼 날짜·인원 없이). 이미 들어온 응답은 그대로
function mergeBagOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('MERGE_BAG_V1')) return;
  props.setProperty('MERGE_BAG_V1', '1');
  const find = function (req) { return readRuns_().filter(function (x) { return String(x['요청ID']) === req && x['진행 상태'] !== '종료'; })[0]; };
  let r1 = find('m9qmh8ds'), r2 = find('m9qmh8ds-2');
  if (!r1 || !r2 || !/치약걸이/.test(r1['명단 제목']) || !/치약걸이/.test(r2['명단 제목']) || String(r1['폼ID']) !== String(r2['폼ID'])) { note_('치약걸이·보냉백 합치기: 진행을 못 찾아서 안 함'); return; }
  const old1 = bareTitle_(r1['명단 제목']), log = [];
  // 늦은 날짜부터 이름 바꿈 (10/24 규칙)
  // 상품 이름이 바뀌어도 월급시트 그 진행 줄 이름을 같이 바꿈 (안 하면 새 이름 줄이 하나 더 생겨 같은 진행이 두 줄 = 돈 두 번)
  globalThis.__PAY_RENAME_ANY = true;
  try { [[r2, '#10.27 실 치약걸이 보냉백 5'], [r1, '#10.26 실 치약걸이 보냉백 5']].forEach(function (x) { if (renameRun_(x[0], x[1], '보냉백 합침')) log.push(x[1]); }); }
  finally { globalThis.__PAY_RENAME_ANY = false; }
  [r2, r1].forEach(function (r) { setRun_(r.row, '캠페인', '실 치약걸이 보냉백'); setRun_(r.row, '총건수', 10); setRun_(r.row, '목표인원', 5); setRun_(r.row, '가격', '17800, 17000'); });
  setRun_(r1.row, '마감 시각', '');   // 2명 → 5명이 돼서 다시 받는 중
  r1 = find('m9qmh8ds');
  // 폼: 옵션, 받기, 이름 (폼·명단 시트·폴더)
  const nm = sheetName_('#10.26 실 치약걸이 보냉백 5');
  try {
    const fo = FormApp.openById(r1['폼ID']);
    setOptionChoices_(fo, '치약걸이 클린화이트\n보냉백 블랙\n보냉백 그레이\n보냉백 네이비');
    if (!fo.isAcceptingResponses()) fo.setAcceptingResponses(true);
    fo.setTitle(nm);
    DriveApp.getFileById(r1['폼ID']).setName(nm);
    log.push('폼 옵션: ' + formChoices_(fo).join(', '));
  } catch (e) { note_('보냉백 합치기 폼 실패: ' + e); }
  try { DriveApp.getFileById(r1['시트ID']).setName(nm); } catch (e) { note_('보냉백 합치기 명단 시트 이름 실패: ' + e); }
  try { const fid = (String(r1['폴더 링크'] || '').match(/[-\w]{25,}/) || [])[0]; if (fid) DriveApp.getFolderById(fid).setName(nm); } catch (e) {}
  // 10.28 치약걸이 1 계획 취소 (치약걸이 2 + 3 = 5건 끝)
  try {
    const ps = planSheet_(), pl = ps.getLastRow();
    if (pl >= 2) ps.getRange(2, 1, pl - 1, 9).getValues().forEach(function (v, i) { if (String(v[0]).indexOf('m9qmh8ds-') === 0 && v[8] === '대기') { ps.getRange(i + 2, 9).setValue('취소 (보냉백과 합침)'); log.push('계획 취소: ' + v[4]); } });
  } catch (e) {}
  // 대기 중인 명단 전달(2명일 때 들어간 것)은 새 이름으로. 5명이 차면 새로 안 넣고 이 줄을 씀(pendingListMsg_)
  try {
    const ob = outboxSheet_(), ol = ob.getLastRow();
    if (ol >= 2) ob.getRange(2, 1, ol - 1, 6).getValues().forEach(function (v) { if (v[2] === '명단 전달' && v[5] === '대기' && String(v[4]).indexOf(old1) >= 0) obSet_(ob, v[0], 5, listMsgText_(r1)); });
  } catch (e) {}
  note_('✓ 치약걸이·보냉백 합침: ' + log.join(' / '));
}
// (10/25 한 번, 사용자 요청) 지금 받는 폼들의 옵션 보기에서 가격 '(10,630원)' 빼기 (끝나지 않은 진행의 폼)
function formNoPriceOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('FORMNOPRICE_V1')) return;
  props.setProperty('FORMNOPRICE_V1', '1');
  const seen = {}, done = [];
  readRuns_().forEach(function (r) {
    const fid = String(r['폼ID'] || '');
    if (!fid || seen[fid] || r['진행 상태'] === '종료') return;
    seen[fid] = 1;
    try {
      const fo = FormApp.openById(fid), cur = formChoices_(fo);
      if (!cur.some(function (c) { return OPT_PRICE_RE.test(String(c)); })) return;
      setOptionChoices_(fo, cur.join('\n'));
      done.push(bareTitle_(r['명단 제목']) + ' (' + formChoices_(fo).join(', ') + ')');
    } catch (e) { note_('폼 옵션 가격 빼기 실패 ' + bareTitle_(r['명단 제목']) + ': ' + e); }
  });
  note_('✓ 폼 옵션 보기에서 가격 뺌 ' + done.length + '개' + (done.length ? ': ' + done.join(' / ') : ''));
}
// (10/25 한 번, 사용자 허락) 일정 탭의 기대평 옛 계획 줄 지우기: 10/23~24에 계획을 다시 만들며 남은 exp-100-1/2/3 '취소 (다시 만듦)', exp-100-4 '건너뜀' (지금 쓰는 exp-100-4-v5-*는 그대로)
function expPlanCleanOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('EXPPLAN_CLEAN_V1')) return;
  props.setProperty('EXPPLAN_CLEAN_V1', '1');
  const ps = planSheet_(), pl = ps.getLastRow();
  if (pl < 2) return;
  const del = [];
  ps.getRange(2, 1, pl - 1, PLAN_HEAD.length).getValues().forEach(function (x, i) {
    const id = String(x[0]), st = String(x[8]);
    if ((/^exp-100-[123]-\d+$/.test(id) && st === '취소 (다시 만듦)') || (/^exp-100-4-\d+$/.test(id) && st === '건너뜀 (이미 다 진행)')) del.push(i + 2);
  });
  for (let j = del.length - 1; j >= 0; j--) ps.deleteRow(del[j]);   // 아래 줄부터 지워야 줄 번호가 안 밀림
  note_('✓ 일정 탭 기대평 옛 계획 ' + del.length + '줄 지움 (지금 계획 exp-100-4-v5는 그대로)');
}
// (10/24 한 번) #10.26 방 공지(오메가3 빼고)는 보낼메시지에 안 떠서 사용자가 직접 보냄 → 다시 넣지 않고, 혹시 들어간 대기 줄은 '보냄'으로
function sent1026Once_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('SENT1026_V1')) return;
  props.setProperty('SENT1026_V1', '1');
  props.setProperty('LASH1026_V1', '1');
  const ob = outboxSheet_(), ol = ob.getLastRow();
  if (ol < 2) return;
  const n = [];
  ob.getRange(2, 1, ol - 1, 6).getValues().forEach(function (x) {
    if (x[2] !== '방 공지' || x[5] === '보냄' || dateTok_(String(x[3])) !== '10.26' || !/^#/.test(String(x[3])) || !/양식 작성 폼/.test(String(x[4]))) return;
    obSet_(ob, x[0], 6, '보냄'); n.push(x[3]);
  });
  if (n.length) note_('✓ 직접 보낸 #10.26 방 공지 보냄 처리: ' + n.join(', '));
}
// (10/24 한 번) 하루 인원 바꾸기(changeDaily_)가 남는 날 진행을 끝내면서 같은 폼을 쓰는 진행 중 폼까지 닫은 것 → 받는 중(진행중, 아직 마감 전)인 진행 폼은 다시 엶
function reopenClosedOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('REOPEN_V1')) return;
  props.setProperty('REOPEN_V1', '1');
  const seen = {};
  readRuns_().forEach(function (r) {
    if (r['진행 상태'] !== '진행중' || r['마감 시각'] || !r['폼ID'] || seen[r['폼ID']]) return;
    seen[r['폼ID']] = 1;
    try { const f = FormApp.openById(r['폼ID']); if (!f.isAcceptingResponses()) { f.setAcceptingResponses(true); note_('✓ 닫혀 있던 폼 다시 엶: ' + bareTitle_(r['명단 제목'])); } } catch (e) {}
  });
}
// (10/24 한 번) 10/24 톡딜 방 공지가 보낼메시지에 없으면 다시 넣음
function talkdealNoticeOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('TALKDEAL_V2')) return;
  props.setProperty('TALKDEAL_V2', '1');
  const ob = outboxSheet_(), last = ob.getLastRow();
  const v = last >= 2 ? ob.getRange(2, 1, last - 1, 6).getValues() : [];
  if (v.some(function (x) { return /316704778/.test(String(x[4])) && /양식 작성 폼/.test(String(x[4])); })) return;
  props.deleteProperty('TALKDEAL_V1');
  // talkdealOnce_가 공지·구매확정 안내·월급시트 줄을 다시 (구매확정 안내·월급시트 줄은 있으면 안 넣음)
  const room = '#10.24 5시 톡딜 홍삼스틱 50';
  const hasGuide = v.some(function (x) { return String(x[3]) === room && /구매확정/.test(String(x[4])); });
  talkdealOnce_(hasGuide);
  note_('✓ 10/24 톡딜 방 공지 다시 넣음');
}
// (10/24 한 번) 기대평 방 공지가 2개 → 지금 공지(1주차 글)와 같은 것 하나만 남기고 안 보낸 나머지는 지움
function expectDupOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('EXPECT_DUP_V1')) return;
  const r = readRuns_().filter(function (x) { return String(x['요청ID']) === 'exp-100-4' && x['진행 상태'] !== '종료'; })[0];
  if (!r) return;
  props.setProperty('EXPECT_DUP_V1', '1');
  const room = String(r['카톡방'] || bareTitle_(r['명단 제목'])), link = String(r['폼 링크']);
  const want = expNotice_('A').split('(구글폼 링크)').join(link);
  const ob = outboxSheet_(), last = ob.getLastRow();
  if (last < 2) return;
  const v = ob.getRange(2, 1, last - 1, 6).getValues();
  const mine = v.map(function (x, i) { return { x: x, i: i }; }).filter(function (o) { return o.x[2] === '방 공지' && o.x[5] !== '보냄' && String(o.x[4]).indexOf(link) >= 0; });
  if (mine.length <= 1) return;
  let keep = mine.filter(function (o) { return String(o.x[4]) === want; })[0] || mine[0];
  obSet_(ob, keep.x[0], 4, room);
  mine.filter(function (o) { return o !== keep; }).map(function (o) { return o.i; }).sort(function (a, b) { return b - a; }).forEach(function (i) { ob.deleteRow(i + 2); });
  note_('✓ 기대평 방 공지 하나만 남김 (' + (mine.length - 1) + '개 지움)');
}
