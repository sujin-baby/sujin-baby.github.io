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
  name: /이름|성함|주문자|예금주/,
  account: /계좌|예금주|은행/,
  dup: /아이디|계정|이메일|전화|연락처|휴대폰|핸드폰|주소/,   // 한 명단 시트에서 겹치면 중복(빨간색). 이름은 동명이인이 많아서 뺌
  reviewFee: /리뷰비/,
  nick: /카카오\s*톡?\s*닉네임|카톡\s*닉네임/,   // '방에 참여한 카카오톡 닉네임' (옵션 확인은 이 닉네임으로)
  opt: /옵션/
};
const NICK_Q = '방에 참여한 카카오톡 닉네임';

// 진행목록 열. 맨 뒤 3개(시트ID, 폼ID, 요청ID)는 스크립트가 쓰는 칸이라 숨겨 둠
//  시트ID: 응답 시트를 찾아 인원 세기, 명단 양식 적용, 폼수정 탭에서 씀
//  폼ID: 명단이 차면 폼 닫기, 폼수정 탭에서 응답 삭제할 때 씀
//  요청ID: 새 진행 만들기를 두 번 눌러도 한 번만 만들어지게 할 때 씀
const LIST_HEADER = ['등록일', '진행일', '명단 제목', '유형', '택대', '실배송', '플랫폼', '목표인원', '인원', '진행 상태', '마감 시각', '택배 옮김', '캠페인', '일차', '총건수', '업체', '구매시간', '포토', '가격', '카톡방', '업체방', '폼 링크', '시트 링크', '폴더 링크', '시트ID', '폼ID', '요청ID'];
const LIST_HIDDEN = ['시트ID', '폼ID', '요청ID'];
const LIST_ALIAS = { '마감': '마감 시각' };   // 예전 열 이름 → 새 이름

function lc_(name) { return LIST_HEADER.indexOf(name) + 1; }

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
function campKey_(s) { return campOf_(s).replace(/\s+/g, ''); }

// 같은 캠페인 진행들을 날짜순으로 묶어서 '한 의뢰'씩 나눔: 총건수를 다 채우면 다음 진행은 새 의뢰
function chainsOf_(runs) {
  const by = {};
  runs.filter(function (r) { return r['진행일'] instanceof Date; }).forEach(function (r) {
    const k = campKey_(r['캠페인'] || r['명단 제목']);
    (by[k] = by[k] || []).push(r);
  });
  const chains = [];
  Object.keys(by).forEach(function (k) {
    const list = by[k].sort(function (a, b) { return a['진행일'] - b['진행일']; });
    let cur = null;
    list.forEach(function (r) {
      const total = Number(r['총건수']) || 0;
      const sameSheet = cur && r['시트ID'] && cur.runs.some(function (x) { return String(x['시트ID']) === String(r['시트ID']); });
      if (!cur || (cur.total && cur.done >= cur.total && !sameSheet)) { cur = { key: k, total: total, done: 0, runs: [] }; chains.push(cur); }
      if (!cur.total && total) cur.total = total;
      cur.runs.push(r);
      cur.done += Number(r['목표인원']) || 0;
    });
  });
  return chains;
}

// 같은 진행인지 (방제 끝 숫자만 다를 때): 날짜(10.15)와 캠페인 이름이 같으면 같은 진행
function dateTok_(t) { const m = String(t || '').match(/(\d{1,2})\.(\d{1,2})/); return m ? Number(m[1]) + '.' + Number(m[2]) : ''; }
function sameRunTitle_(a, b) { return !!dateTok_(a) && dateTok_(a) === dateTok_(b) && campKey_(a) === campKey_(b); }
function bareTitle_(t) { return String(t || '').replace(/\s*\([^)]*\)\s*$/, '').trim(); }

// 방제(명단 제목) 바꾸기: 진행목록 명단 제목·카톡방, 보낼 메시지함의 대기 중인 방 이름. 월급시트 캠페인명은 15분 갱신 때 같은 날짜·캠페인 줄을 찾아 바꿈
function renameRun_(r, title) {
  title = bareTitle_(title);
  if (!title || title === bareTitle_(r['명단 제목'])) return false;
  const cm = title.match(/(\d+)\s*$/);
  if (cm && Number(cm[1]) > 0) { setRun_(r.row, '목표인원', Number(cm[1])); r['목표인원'] = Number(cm[1]); }
  const nick = (String(r['명단 제목']).match(/\s*\([^)]*\)\s*$/) || [''])[0];
  const oldRoom = String(r['카톡방'] || bareTitle_(r['명단 제목']));
  setRun_(r.row, '명단 제목', title + nick); r['명단 제목'] = title + nick;
  setRun_(r.row, '카톡방', title); r['카톡방'] = title;
  try {
    const ob = outboxSheet_(), last = ob.getLastRow();
    if (last >= 2) ob.getRange(2, 4, last - 1, 3).getValues().forEach(function (v, i) {
      if (String(v[0]) === oldRoom && (v[2] === '대기' || v[2] === '방 못 찾음')) ob.getRange(i + 2, 4).setValue(title);
    });
  } catch (e) {}
  return true;
}

// 의뢰서 하나 = 명단 시트(폼) 하나. 날짜마다 카톡방만 새로 만들고 같은 폼, 같은 명단 시트에 이어서 받음
// 같은 명단 시트를 쓰는 진행들 (진행일 순)
function siblings_(runs, r) {
  return runs.filter(function (x) { return x['시트ID'] && String(x['시트ID']) === String(r['시트ID']) && x['진행일'] instanceof Date; })
    .sort(function (a, b) { return (a['진행일'] - b['진행일']) || (a.row - b.row); });
}

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
  return raw.getRange(2, 1, last - 1, 1).getValues().map(function (x) { return x[0] instanceof Date ? x[0].getTime() : null; }).filter(function (t) { return t !== null; });
}

// 폼에 실제로 들어온 응답 시각 (명단 시트보다 폼이 정확: 시트 연결이 끊겨도 셀 수 있음)
function formTimes_(formId) {
  return FormApp.openById(formId).getResponses().map(function (x) { return x.getTimestamp().getTime(); });
}

function runCount_(runs, r, times) {
  const w = windowOf_(runs, r);
  if (!times) { try { times = r['폼ID'] ? formTimes_(r['폼ID']) : respTimes_(r['시트ID']); } catch (e) { times = respTimes_(r['시트ID']); } }
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
function isFruit_(r) { return /자정[^\n]*오전\s*7\s*시/.test(runSlot_(r)); }

// 명단 시트·폼·폴더 이름: 방제에서 날짜를 뺀 것 (#택10.14 모두의농수산옥광밤외12 → #택 모두의농수산옥광밤외12)
function sheetName_(s) {
  return String(s || '').replace(/\s*\([^)]*\)\s*$/, '').replace(/^([#업택\s]*?)\s*\d{1,2}\.\d{1,2}\s*/, '$1 ').replace(/\s+/g, ' ').trim();
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
    if (tm && Number(tm[1]) > 0 && Number(r['목표인원']) !== Number(tm[1]) && r['진행 상태'] !== '종료') {
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
  runs.forEach(function (r) {
    if (!r['폼ID'] || r['진행 상태'] === '종료' || (String(r['업체']).trim() && String(r['구매시간']).trim() && String(r['포토']).trim())) return;
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
    if (r['폼ID'] && (!/^\d{3,}(\s*,\s*\d{3,})*$/.test(pv) || /e\+/i.test(pv))) {
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
  sh.getRange(2, lc_('가격'), n, 1).setNumberFormat('@');
  // 보기 좋게: 가운데 맞춤, 명단 제목·링크는 왼쪽
  sh.getRange(1, 1, n + 1, LIST_HEADER.length).setHorizontalAlignment('center').setVerticalAlignment('middle');
  ['명단 제목', '캠페인', '카톡방', '업체방', '폼 링크', '시트 링크', '폴더 링크'].forEach(function (h) { sh.getRange(2, lc_(h), n, 1).setHorizontalAlignment('left'); });
  sh.getRange(2, lc_('진행 상태'), n, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['진행예정', '진행중', '종료'], true).build());
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
    platform:document.getElementById('platform').value,desc:document.getElementById('desc').value,fname:window.__FNAME||'',k:window.__K||'',n:window.__N||'',opts:window.__OPTS||'',shop:window.__SHOP||'',slot:window.__SLOT||'',photo:window.__PHOTO||'',date:window.__DATE||'',plan:window.__PLAN||'',slot2:window.__SLOT2||'',day:window.__DAY||'',total:window.__TOTAL||'',room:window.__ROOM||'',croom:window.__CROOM||''};
  if(!d.title){document.getElementById('msg').textContent='명단 제목을 넣어 주세요.';return;}
  document.getElementById('go').disabled=true;
  document.getElementById('msg').textContent='만드는 중이에요… (10~20초)';
  google.script.run.withSuccessHandler(function(r){
    document.getElementById('fields').style.display='none';
    document.getElementById('auto').textContent=(r.again?'이미 만든 진행이에요: ':'만들었어요: ')+d.title;
    if(r.notice){document.getElementById('notice').value=r.notice;}
    document.getElementById('listmsg').value=r.sheetUrl+'\\n\\n'+d.title;
    document.getElementById('done').style.display='block';
    document.getElementById('msg').textContent='\\n폼 응답자 링크:\\n'+r.formUrl+'\\n\\n시트: '+r.sheetUrl+'\\n폴더: '+r.folderUrl+'\\n\\n진행목록에도 기록했어요.';
  }).withFailureHandler(function(e){
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

/* 아이폰 등에서 쓰는 웹 앱: 배포 링크로 열면 '새 진행 만들기' 창이 뜸 (주소 뒤 값으로 미리 채움) */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.k !== CONFIG.KEY) return HtmlService.createHtmlOutput('링크가 올바르지 않아요. 체험단 가이드 생성기의 버튼으로 열어 주세요.');
  if (p.p === 'queue') return ContentService.createTextOutput(queueText_());
  if (p.p === 'sent') { markMsg_(p.id, p.st === 'fail' ? '방 못 찾음' : '보냄'); return ContentService.createTextOutput('ok'); }
  if (p.p === 'tools') {
    return HtmlService.createHtmlOutput(TOOLS_HTML.replace('__K__', JSON.stringify(CONFIG.KEY)))
      .setTitle('진행 도우미').addMetaTag('viewport', 'width=device-width, initial-scale=1');
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
  // 생성기 버튼으로 열면(auto=1) 값이 다 채워진 채로 바로 만들기 실행. 같은 요청ID는 한 번만 만들어짐
  const pre = '<script>window.__N=' + JSON.stringify(p.n || '') + ';window.__ROOM=' + JSON.stringify(p.room || '') + ';window.__DATE=' + JSON.stringify(p.date || '') + ';window.__SHOP=' + JSON.stringify(p.shop || '') + ';window.__OPTS=' + JSON.stringify(p.opts || '') + ';window.__SLOT=' + JSON.stringify(p.slot || '') + ';window.__PHOTO=' + JSON.stringify(p.photo || '') + ';window.__PLAN=' + JSON.stringify(p.plan || '') + ';window.__SLOT2=' + JSON.stringify(p.slot2 || '') + ';window.__DAY=' + JSON.stringify(p.day || '') + ';window.__TOTAL=' + JSON.stringify(p.total || '') + ';window.__CROOM=' + JSON.stringify(p.croom || '') + ';window.__AUTO=' + (p.auto === '1' && p.title ? 'true' : 'false') + ';</' + 'script>';
  const fill = pre + '<script>window.__K=' + JSON.stringify(CONFIG.KEY) + ';window.__FNAME=' + JSON.stringify(p.fname || '') + ';(function(){var p=' + JSON.stringify(p).replace(/</g, '\\u003c') + ';var $=function(i){return document.getElementById(i)};if(p.title)$("title").value=p.title;if(p.daily)$("daily").value=p.daily;if(p.desc)$("desc").value=p.desc;if(p.type)$("type").value=p.type;if(p.platform)$("platform").value=p.platform;$("takdae").checked=p.takdae==="1";$("realship").checked=p.realship==="1";autoGo();})();</' + 'script>';
  return HtmlService.createHtmlOutput(DIALOG_HTML + fill).setTitle('새 진행 만들기').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ---------------- 1) 새 진행 만들기 ---------------- */

function createRun(d) {
  if (!d || d.k !== CONFIG.KEY) throw new Error('권한이 없어요. 생성기 버튼이나 시트 메뉴로 열어 주세요.');
  // 진행 도우미 페이지의 버튼도 이 이름으로 받음 (로더에 이미 있는 이름이라 붙여넣기 없이 됨)
  if (d.act) return locked_(function () { return toolAction_(d); }, 30000) || { msg: '다른 작업 중이에요. 잠시 뒤 다시 눌러 주세요.' };
  return locked_(function () {
    const prev = d.n ? findRunByRequest_(d.n) : null;
    if (prev) return prev;
    return createRunInner_(d);
  }, 60000);
}

function findRunByRequest_(n) {
  const r = readRuns_().filter(function (x) { return String(x['요청ID']) === String(n); })[0];
  if (!r) return null;
  let notice = '';
  try { notice = FormApp.openById(r['폼ID']).getDescription(); } catch (e) {}
  return { again: true, notice: notice, formUrl: r['폼 링크'], sheetUrl: r['시트 링크'], folderUrl: r['폴더 링크'] };
}

function createRunInner_(d) {
  if (!CONFIG.TEMPLATE_FORM_ID || CONFIG.TEMPLATE_FORM_ID.indexOf('여기에') === 0) {
    throw new Error('CONFIG의 TEMPLATE_FORM_ID를 먼저 넣어 주세요.');
  }
  // 2일차부터(또는 추가 모집)는 같은 의뢰의 폼, 명단 시트를 그대로 씀 (의뢰서 하나 = 명단 시트 하나)
  let reuse = d.reuse || null;
  if (!reuse && Number(d.day) > 1) {
    const ck = campKey_(d.camp || campOf_(d.title));
    const chain = chainsOf_(readRuns_()).filter(function (c) { return c.key === ck; }).pop();
    reuse = chain ? chain.runs.filter(function (x) { return x['시트ID'] && x['폼ID']; })[0] || null : null;   // 그 의뢰의 첫 명단 시트
  }
  let form, ss, folder, formUrl;
  if (reuse) {
    form = FormApp.openById(reuse['폼ID']);
    ss = SpreadsheetApp.openById(reuse['시트ID']);
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
    try { setOptionChoices_(form, d.opts); } catch (e) { Logger.log('옵션 질문 바꾸기 실패: ' + e); }
    try { ensureNickQuestion_(form); } catch (e) { Logger.log('닉네임 질문 넣기 실패: ' + e); }

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
  formatList_(list);
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
  try { ensureEditTab_(); } catch (e) { Logger.log('폼수정 탭 갱신 실패: ' + e); }
  try { buildDashboard_(true); } catch (e) { Logger.log('한눈에 탭 실패: ' + e); }
  try { ensureCheckTrigger_(); } catch (e) { Logger.log('마감 확인 트리거 실패: ' + e); }

  // 공지의 '(구글폼 링크)' 자리에 폼 링크를 넣어서 폼 설명과 카톡 공지를 한 번에 완성
  const notice = String(d.desc || '').split('(구글폼 링크)').join(formUrl);
  if (notice) form.setDescription(notice);
  if (notice && d.room) queueMsg_(d.room, notice, '방 공지');
  // 여러 날 진행이면 다음 일차 계획 저장 (공지는 폼 링크 넣기 전 원본을 템플릿으로)
  if (d.plan) { try { savePlan_(d); } catch (e) { Logger.log('일정 저장 실패: ' + e); } }
  try { updatePay_(); } catch (e) { Logger.log('월급시트 갱신 실패: ' + e); }
  const r = list.getLastRow();
  if (d.realship) list.getRange(r, 1, 1, LIST_HEADER.length).setBackground('#fff2a8');
  if (d.takdae) list.getRange(r, lc_('택배 옮김')).insertCheckboxes();
  sortList_();

  return { notice: notice, formUrl: formUrl, sheetUrl: ss.getUrl(), folderUrl: folder.getUrl() };
}

// 폼의 '옵션' 질문 보기를 이번 가이드 옵션으로 바꿈 (예전 템플릿은 '단일옵션' 하나뿐이라 다 단일옵션으로 들어왔음)
function setOptionChoices_(form, opts) {
  const list = String(opts || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
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
    try { file.addEditor(m); } catch (e) { Logger.log('권한 추가 실패 ' + m + ': ' + e); }
  });
  if (editorsOnly) return;
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    Logger.log('링크 공유 설정 실패(회사 계정 정책일 수 있음): ' + e);
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
    for (let i = 0; i < tabs.length; i++) {
      try { if (FormApp.openByUrl(tabs[i].getFormUrl()).getId() === String(formId)) return tabs[i]; } catch (e) {}
    }
  }
  return tabs[0] || responseSheet_(ss);
}

// 폼 응답 탭의 질문 머리글 (빈칸이나 예전 도우미 칸 전까지)
function rawHead_(raw) {
  const all = headers_(raw);
  let n = 0;
  while (n < all.length && all[n] !== '' && OLD_HELPER.indexOf(all[n]) === -1) n++;
  return all.slice(0, n);
}

// 명단 탭 1행: 총건수 = 의뢰 총건수, 진행건수 = 지금까지 들어온 응답(모든 날), 잔여건수 = 총건수 - 진행건수
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
  const sh = ss.getSheetByName(LIST_TAB);
  if (!sh) return false;
  const tabs = ss.getSheets().filter(function (s) { return !!s.getFormUrl(); });
  if (tabs.length < 2) {
    // 폼이 하나여도 손으로 붙여넣은 줄 때문에 명단이 막혔으면(#REF!) 치움
    if (tabs.length && /^#/.test(sh.getRange('A3').getDisplayValue())) clearPasted_(sh, rawHead_(tabs[0]).length);
    return false;
  }
  const heads = tabs.map(rawHead_);
  const union = heads[0].slice();
  heads.slice(1).forEach(function (h) { h.forEach(function (x) { if (x && union.indexOf(x) === -1) union.push(x); }); });
  const ref = function (t) { return "'" + t.getName().replace(/'/g, "''") + "'!"; };
  const parts = tabs.map(function (t, i) {
    const L = colLetter_(Math.max(heads[i].length, 1));
    const cols = union.map(function (u) { const k = heads[i].indexOf(u); return k >= 0 ? 'CHOOSECOLS(d,' + (k + 1) + ')' : 'MAKEARRAY(ROWS(d),1,LAMBDA(rr,cc,""))'; });
    return 'LET(d,' + ref(t) + 'A2:' + L + ',HSTACK(' + cols.join(',') + '))';
  });
  const f = '=IFERROR(LET(v,VSTACK(' + parts.join(',') + '),SORT(FILTER(v,INDEX(v,0,1)<>""),1,TRUE)),"")';
  if (sh.getRange('A3').getFormula() === f) {
    if (/^#/.test(sh.getRange('A3').getDisplayValue())) clearPasted_(sh, union.length);
    return false;
  }
  // 손으로 적는 칸이 합친 머리글과 겹치면 칸을 끼워 넣어 뒤로 밀기
  const row2 = sh.getRange(2, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(String);
  const manual = row2.findIndex(function (h, i) { return i >= heads[0].length && /송장번호|실배송/.test(h); }) + 1;
  if (manual && manual <= union.length) sh.insertColumnsBefore(manual, union.length - manual + 1);
  sh.getRange(2, 1, 1, union.length).setValues([union]);
  sh.getRange('A3').setFormula(f);
  clearPasted_(sh, union.length);
  tabs.forEach(function (t) { try { t.hideSheet(); } catch (e) {} });
  return true;
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

  // 2행 머리글, 3행부터 응답
  sh.getRange('A2').setFormula('={' + ref + 'A1:' + L + '1}');
  sh.getRange('A3').setFormula('=IFERROR(FILTER(' + ref + 'A2:' + L + ', ' + ref + 'A2:A<>""), "")');
  // 손으로 적는 칸 (택대 송장번호, 실배송)
  let extra = n;
  const manual = {};
  if (opts.takdae) { extra++; manual['송장번호'] = extra; sh.getRange(2, extra).setValue('송장번호').setNote('한진택배, 오후 3~5시 도착. 가끔 익일.'); }
  if (opts.realship) { extra++; manual['실배송'] = extra; sh.getRange(2, extra).setValue('실배송'); }
  // 명단 시트는 업체도 보는 곳이라 중복, 옵션, 금액 확인 표시는 넣지 않음 (관리 시트 한눈에, 폼수정 탭에서만 보임)
  try { moveOldAssign_(ss); } catch (e) { Logger.log('예전 배정 탭 옮기기 실패: ' + e); }

  const maxRows = sh.getMaxRows();
  sh.getRange(2, 1, 1, extra).setWrap(true).setVerticalAlignment('bottom').setFontWeight('normal');
  sh.setRowHeight(2, 52);
  sh.getRange(3, 1, maxRows - 2, extra).setFontSize(10).setVerticalAlignment('middle');
  sh.getRange(3, 1, maxRows - 2, 1).setNumberFormat('yyyy. M. d am/pm h:mm:ss');
  sh.setFrozenRows(2);
  sh.setColumnWidths(1, extra, 150);
  head.forEach(function (h, i) { if (h.length > 20) sh.setColumnWidth(i + 1, 220); });

  sh.setConditionalFormatRules([]);

  // 계좌, 예금주 열 숨기기 (실배송이면 리뷰비 열도)
  const hide = [];
  head.forEach(function (h, i) {
    if (MATCH.account.test(h)) hide.push(i + 1);
    if (opts.realship && MATCH.reviewFee.test(h)) hide.push(i + 1);
  });
  groupColumns_(sh, hide);

  if (opts.realship) {
    sh.setTabColor('#f4d03f');
    sh.getRange(2, manual['실배송'], maxRows - 1, 1).setBackground('#fff2a8');
  }

  // 원래 폼 응답 탭은 숨김 (응답은 계속 여기로 들어오고, 명단 탭이 따라 보여 줌)
  try { raw.hideSheet(); } catch (e) {}
  return sh;
}

const CHECK_HEAD = '옵션 확인';
const ASSIGN_TAB = '배정';
const ASSIGN_HEAD = ['명단 제목', '닉네임', '공지 옵션', '계정수', '산 수', '확인', '시트ID', '폼 옵션', '가격'];
const CHECK_ROWS = 500;
const NORM = function (r) { return 'LOWER(REGEXREPLACE(TO_TEXT(' + r + '),"\\s",""))'; };

// 옵션 확인 수식 (한눈에 탭 명단 옆 칸). nkR, okR: 닉네임, 옵션 칸 범위, rows: 줄 수, sid: 명단 시트ID
//  관리 시트 '배정' 탭에서 같은 명단 시트 줄만 가져와 비교. 닉네임과 옵션은 띄어쓰기, 대소문자 무시
//  한 사람이 두 계정이면 계정수 2, 또는 옵션마다 한 줄씩
function checkFormula_(nkR, okR, rows, sid) {
  const A = "'" + ASSIGN_TAB + "'!";
  const f = function (c) { return 'FILTER(' + A + c + '2:' + c + ',' + A + 'G2:G="' + sid + '")'; };
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
  const imp = function (c) { return 'IMPORTRANGE("' + info.url + '","' + info.ref + c + '2:' + c + '2000")'; };
  const day = function (t) { return isFinite(t) && t > 0 ? 'DATE(' + Utilities.formatDate(new Date(t), CONFIG.TIMEZONE, 'yyyy,M,d') + ')' : (t > 0 ? '99999' : '0'); };
  return '=IFERROR(LET(t,' + imp('A') + ',nk,' + imp(info.nick) + ',ok,' + imp(info.opt || info.nick) + ',' +
    // 그 기간 응답에 닉네임이 하나도 없으면(닉네임 질문 전 응답) 셀 수 없어서 빈칸
    'IF(SUMPRODUCT(ISNUMBER(t)*(t>=' + day(info.from) + ')*(t<' + day(info.to) + ')*(LEN(nk)>0))=0,"",' +
    'SUMPRODUCT(ISNUMBER(t)*(t>=' + day(info.from) + ')*(t<' + day(info.to) + ')*(ARRAYFORMULA(' + NORM('nk') + ')=' + NORM('$B' + row) + ')*' +
    '(((ARRAYFORMULA(' + NORM('ok') + ')=' + NORM('$H' + row) + ')+($H' + row + '=""))>0)))),"")';
}

function needFormula_(row) {
  const n = 'IF($D' + row + '="",1,$D' + row + ')';
  return '=IF($B' + row + '="","",IF(AND($D' + row + '<>"",$D' + row + '=0),"취소",IF($E' + row + '="","",IF($E' + row + '<' + n + ',"아직 "&(' + n + '-$E' + row + '),IF($E' + row + '>' + n + ',"초과","✔")))))';
}

// 명단 시트의 응답 탭 이름, 닉네임·옵션 열 글자
function rawInfo_(sheetId, formId) {
  const raw = rawFor_(SpreadsheetApp.openById(sheetId), formId);
  const head = headers_(raw);
  // 닉네임 질문이 없는 예전 폼은 사람별 확인은 못 하고(수취인 이름은 공지 이름과 다름) 옵션별 인원만 셈
  const n = head.findIndex(function (h) { return MATCH.nick.test(h); }) + 1;
  const pc = head.findIndex(function (h) { return /결제\s*금액|금액|가격/.test(h); }) + 1;
  const o = head.findIndex(function (h) { return MATCH.opt.test(h) && !MATCH.nick.test(h); }) + 1;
  return { raw: raw, head: head, nickCol: n, optCol: o, priceCol: pc, nick: n ? colLetter_(n) : '', opt: o ? colLetter_(o) : '',
    ref: "'" + raw.getName().replace(/'/g, "''") + "'!", url: 'https://docs.google.com/spreadsheets/d/' + sheetId + '/edit' };
}

// 배정 탭 '산 수' 수식을 새 모양으로 한 번 다시 씀 (닉네임 질문 전 응답이면 빈칸)
function refreshAssignFormulasOnce_(runs) {
  const sh = assignSheet_(), last = sh.getLastRow();
  if (last >= 2) {
    const infos = {};
    sh.getRange(2, 1, last - 1, 1).getValues().forEach(function (v, i) {
      const r = runs.filter(function (x) { return String(x['명단 제목']) === String(v[0]); })[0];
      if (!r || !r['시트ID']) return;
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
  try {
    const form = formOf_(info.raw);
    const choices = form ? formChoices_(form) : [];
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
  const lr = info.raw.getLastRow();
  const data = lr < 2 ? [] : info.raw.getRange(2, 1, lr - 1, info.head.length).getValues()
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

// 공지 글에서 '옵션 → 이름들' 읽기 (사용자 공지 모양)
//  1) 1kg*1 2명 (박지수(취소) 정수연)          ← 'N명' 뒤 괄호 안 이름
//  🐥옵션 : 1kg×3 (2명) 송기주 2              ← '(N명)' 뒤 이름, 이름 뒤 숫자(띄어 써도) = 계정 수
//  이름(취소) = 취소한 사람 (계정수 0, 다음 날 추가 모집 인원에 들어감)
//  옵션 줄 바로 아래 줄에 이름만 있어도 읽음
// 돌려주는 줄: [닉네임, 공지 옵션(가이드 여럿이면 상품명 붙임), 계정수, 폼 보기(맞는 게 없으면 빈칸), 가격]
function parseAssign_(text, choices) {
  const k = function (x) { return String(x || '').toLowerCase().replace(/\s+/g, ''); };
  const bare = function (c) { return k(String(c).replace(/\s*\([\d,\s]+원\)\s*$/, '')); };
  const blocks = String(text || '').split(/\n-{5,}\s*\n?/);
  const multi = noticeProducts_(text).length > 1 || blocks.length > 1;
  const junk = /http|★|☆|▶|▼|※|🐥|[:!?]|\d\s*원|\d{1,3},\d{3}|구매|리뷰|링크|가격|배송|검색|사업자|입금|참고|안내/;
  const rows = [], at = {}, priceMemo = {};
  const toChoice = function (label, opt) {
    const a = k(label), b = k(opt);
    let hit = choices.filter(function (c) { return bare(c) === a || bare(c) === b; })[0];
    if (!hit) hit = choices.filter(function (c) { return a && bare(c).indexOf(a) >= 0; })[0];
    if (!hit && !multi) hit = choices.filter(function (c) { return b && bare(c).indexOf(b) >= 0; })[0];
    return hit || '';
  };
  const add = function (names, label, choice) {
    let lastKey = null;
    String(names).replace(/\(\s*취소\s*\)/g, '#취소').replace(/[()\[\],·\/]/g, ' ').split(/\s+/).forEach(function (tok) {
      tok = tok.replace(/^@+/, '').trim();
      if (!tok) return;
      if (/^[2-9]$/.test(tok) && lastKey) { rows[at[lastKey]][2] = Number(tok); return; }   // '송기주 2'
      if (!/[A-Za-z가-힣]/.test(tok) || /^\d+명$/.test(tok)) return;
      const cancel = /#취소$/.test(tok);
      tok = tok.replace(/#취소$/, '');
      let n = 1;
      const m = tok.match(/^(.*\D)([2-9])$/);
      if (m && !cancel) { tok = m[1]; n = Number(m[2]); }
      if (cancel) n = 0;
      const key = k(tok) + '|' + label;
      if (at[key] !== undefined) { rows[at[key]][2] += n; lastKey = key; return; }
      at[key] = rows.length; rows.push([tok, label, n, choice, 0]); lastKey = key;
    });
  };
  blocks.forEach(function (b) {
    const prod = multi ? (noticeProducts_(b)[0] || {}).name || '' : '';
    const lines = b.split(/\r?\n/);
    // 옵션 가격: '🐥옵션 : X (N명)' 다음 '🐥가격 : 20500', 또는 '1kg*1 : 17200원 / 1kg*2개 : 29200' 같은 줄
    const priceOf = function (opt, idx) {
      const next = lines[idx + 1] || '';
      if (/^\s*🐥\s*가격/.test(next)) { const m = next.match(/\d{1,3}(?:,\d{3})+|\d{4,}/); if (m) return Number(m[0].replace(/,/g, '')); }
      const o = k(opt);
      for (let i = 0; i < lines.length; i++) {
        if (!/가격|결제\s*[:：]/.test(lines[i])) continue;
        const segs = lines[i].split('/');
        for (let j = 0; j < segs.length; j++) {
          const sg = segs[j].replace(/🐥[^:：]*[:：]/g, ' ');
          const pos = k(sg).indexOf(o);
          if (pos === -1) continue;
          const m = sg.replace(new RegExp('^.*?' + opt.split('').map(function (ch) { return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('\\s*')), '').match(/\d{1,3}(?:,\d{3})+|\d{4,}/);
          if (m) return Number(m[0].replace(/,/g, ''));
        }
      }
      // 옵션마다 가격이 따로 없고 가이드에 가격이 하나뿐이면 그 가격 (예: 🐥결제 : 108500)
      const all = (noticeProducts_(b)[0] || {}).prices || [];
      return all.length === 1 ? all[0] : 0;
    };
    let cur = null;
    lines.forEach(function (line, idx) {
      const t = line.trim();
      if (!t) { cur = null; return; }
      const m = t.match(/^(.*?)\(?\s*(\d+)\s*명\s*\)?(.*)$/);
      if (m) {
        const opt = m[1].replace(/^\d+\)\s*/, '').replace(/^🐥\s*옵션\s*[:：]?\s*/, '').trim();
        if (!opt || /가격|원$/.test(opt)) { cur = null; return; }
        const label = [prod, opt].filter(Boolean).join(' ');
        cur = { label: label, choice: toChoice(label, opt) };
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
  if (r['폼ID']) { try { added = ensureNickQuestion_(FormApp.openById(r['폼ID'])); } catch (e) { Logger.log('닉네임 질문 넣기 실패: ' + e); } }
  if (added) { SpreadsheetApp.flush(); Utilities.sleep(2000); }
  formatResponseSheet_(SpreadsheetApp.openById(r['시트ID']), {
    type: r['유형'], takdae: r['택대'] === 'Y', realship: r['실배송'] === 'Y', platform: r['플랫폼'], target: Number(r['총건수']) || r['목표인원'], prices: r['가격']
  });
  return added;
}

/* ---------------- 4) 진행목록 인원, 명단 마감 ---------------- */

function dailyCheck() { return locked_(dailyCheckInner_, 120000); }

function dailyCheckInner_() {
  try { archiveOld_(); } catch (e) { Logger.log('보관 실패: ' + e); }
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
  try { updatePay_(); } catch (e) { Logger.log('월급시트 갱신 실패: ' + e); }
}

function countResponses_(sheetId) {
  const sheet = responseSheet_(SpreadsheetApp.openById(sheetId));
  const last = sheet.getLastRow();
  return last < 2 ? 0 : sheet.getRange(2, 1, last - 1, 1).getValues().filter(function (x) { return x[0] !== ''; }).length;
}

function checkFull() { return locked_(checkFullInner_, 120000); }

function checkFullInner_() {
  try { removeOldUpdateTrigger_(); } catch (e) {}
  try { normalizeRuns_(); } catch (e) { Logger.log('진행목록 정리 실패: ' + e); }
  try { ensureEditTab_(); } catch (e) { Logger.log('폼수정 탭 만들기 실패: ' + e); }
  try { makeDueDays_(); } catch (e) { Logger.log('다음 일차 만들기 실패: ' + e); }
  const me = Session.getEffectiveUser().getEmail();
  const props = PropertiesService.getScriptProperties();
  let changed = false;
  const runs = readRuns_(), times = {};
  try { cleanListSheetsOnce_(runs); } catch (e) { Logger.log('명단 시트 표시 정리 실패: ' + e); }
  try { fruitCheck_(runs); } catch (e) { Logger.log('안 산 사람 확인 실패: ' + e); }
  try { takbaeCheck_(runs); } catch (e) { Logger.log('택배시트 알림 실패: ' + e); }
  try { refreshAssignFormulasOnce_(runs); } catch (e) { Logger.log('배정 수식 갱신 실패: ' + e); }
  try { tidyOutbox_(); } catch (e) { Logger.log('보낼메시지 정리 실패: ' + e); }
  const errs = {}, listed = {};
  try { ensureSubmitTriggers_(runs); } catch (e) { Logger.log('응답 트리거 실패: ' + e); }
  runs.forEach(function (r) {
    if (r['진행 상태'] === '종료' || !r['폼ID']) return;
    // 진행 하나에서 오류가 나도 다른 진행은 계속 (오류는 한눈에 탭 '확인 필요' 칸에 보임)
    try { checkRun_(r); } catch (e) { errs[r['명단 제목']] = String(e.message || e).slice(0, 120); Logger.log('진행 확인 실패 ' + r['명단 제목'] + ': ' + e); }
  });
  // 폼을 다 연결한 뒤 명단 탭이 그 시트의 모든 폼 응답을 합쳐 보여 주게
  Object.keys(listed).forEach(function (id) {
    try {
      const lss = SpreadsheetApp.openById(id);
      ensureListTab_(lss);
      // 총건수 = 이 명단 시트를 쓰는 의뢰의 총건수 (없으면 날마다 목표인원 합)
      const mine = runs.filter(function (x) { return String(x['시트ID']) === id; });
      const total = mine.reduce(function (m, x) { return Math.max(m, Number(x['총건수']) || 0); }, 0) ||
        mine.reduce(function (a, x) { return a + (Number(x['목표인원']) || 0); }, 0);
      listSummary_(lss, total);
    } catch (e) { Logger.log('명단 탭 합치기 실패: ' + e); }
  });
  props.setProperty('RUN_ERRORS', JSON.stringify(errs));
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
      if (dest !== String(r['시트ID'])) {
        try {
          form.setDestination(FormApp.DestinationType.SPREADSHEET, String(r['시트ID']));
          SpreadsheetApp.flush();
          Utilities.sleep(3000);
        } catch (e) { errs[r['명단 제목']] = '폼 응답을 명단 시트로 연결하지 못했어요: ' + e.message; }
      }
      listed[r['시트ID']] = 1;
    }
    const w = windowOf_(runs, r);
    if (Date.now() < w.from) return;   // 아직 시작 전인 다음 일차
    // 같은 폼을 쓰는 다음 일차: 진행일 0시가 되면 폼을 한 번 다시 엶 (그 뒤에 손으로 닫으면 다시 안 엶)
    if (!w.first && w.last && !r['마감 시각']) {
      const key = 'OPEN_' + r['폼ID'] + '_' + Utilities.formatDate(r['진행일'], CONFIG.TIMEZONE, 'yyyyMMdd');
      if (!props.getProperty(key)) {
        if (!form.isAcceptingResponses() && !pastEnd_(r)) form.setAcceptingResponses(true);
        props.setProperty(key, '1');
      }
    }
    // 인원은 폼에 들어온 응답으로 셈 (마감된 뒤에도 지우거나 늦게 들어온 게 반영되게)
    if (!times[r['폼ID']]) times[r['폼ID']] = form.getResponses().map(function (x) { return x.getTimestamp().getTime(); });
    const n = runCount_(runs, r, times[r['폼ID']]);
    if (Number(r['인원']) !== n) setRun_(r.row, '인원', n);
    if (!r['목표인원'] || r['마감 시각'] || n < Number(r['목표인원'])) return;
    form.setAcceptingResponses(false);
    setRun_(r.row, '마감 시각', new Date());
    changed = true;
    // 명단방 형식 (사장님 예시): 시트 링크 → 빈 줄 → 명단 제목
    const listMsg = r['시트 링크'] + '\n\n' + r['명단 제목'];
    queueMsg_(CONFIG.ROOM_LIST, listMsg, '명단 전달');
    queueMsg_(r['업체방'], r['시트 링크'] + '\n\n' + r['명단 제목'] + '\n오늘 명단입니다. 실시간 시트에서 확인 부탁드립니다!', '업체 명단');
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
  try { buildDashboard_(false); } catch (e) { Logger.log('한눈에 탭 실패: ' + e); }
  // 월급시트도 15분마다 같이 갱신 (계약 수량 링크, 총액, 그날 수량)
  try { updatePay_(); } catch (e) { Logger.log('월급시트 갱신 실패: ' + e); }
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
    if (last >= 2) sh.getRange(2, 6, last - 1, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['대기', '보냄', '방 못 찾음'], true).build());
    sh.getRange(1, 1, Math.max(last, 1), 6).setVerticalAlignment('middle');
    sh.getRange(1, 1, Math.max(last, 1), 4).setHorizontalAlignment('center');
    sh.getRange(1, 6, Math.max(last, 1), 1).setHorizontalAlignment('center');
    PropertiesService.getScriptProperties().setProperty('OUTBOX_SORTED', '1');
  }
  if (!sh) {
    sh = ss.insertSheet(OUTBOX_SHEET, 1);
    sh.appendRow(['ID', '시각', '종류', '카톡방', '메시지', '상태']);
    sh.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#efe6f7');
    sh.setFrozenRows(1);
    sh.setColumnWidth(5, 420);
  }
  return sh;
}

// 보낼메시지: 최신순, 한 줄씩(메시지 칸은 잘라 보이고 시각·종류·카톡방·상태가 위로 맞춰 보이게)
function tidyOutbox_() {
  const sh = outboxSheet_(), last = sh.getLastRow();
  if (last < 2) return;
  if (last >= 3) sh.getRange(2, 1, last - 1, 6).sort({ column: 2, ascending: false });
  sh.getRange(1, 1, last, 6).setVerticalAlignment('top').setWrap(false);
  sh.getRange(2, 5, last - 1, 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  sh.setRowHeights(2, last - 1, 21);
  sh.getRange(2, 2, last - 1, 1).setNumberFormat('M/d HH:mm');
  sh.setFrozenRows(1);
}

function queueMsg_(room, msg, kind) {
  if (!msg) return;
  try {
    // 최신 메시지가 맨 위
    const ob = outboxSheet_();
    ob.insertRowBefore(2);
    ob.getRange(2, 1, 1, 6).setValues([[Utilities.getUuid().replace(/-/g, '').slice(0, 10), new Date(), kind || '', String(room || ''), String(msg), '대기']]);
    ob.getRange(2, 6).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['대기', '보냄', '방 못 찾음'], true).build());
    ob.getRange(2, 1, 1, 6).setWrap(false).setVerticalAlignment('middle').setFontWeight('normal').setBackground(null);
    ob.getRange(2, 5).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
    ob.setRowHeight(2, 21);
  } catch (e) { Logger.log('메시지함 기록 실패: ' + e); }
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

function markMsg_(id, st) {
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

function toolsUrl_() { return (CONFIG.WEBAPP_URL || '') + '?p=tools&k=' + CONFIG.KEY; }

function toolAction_(d) {
  const runs = readRuns_();
  const list = runs.filter(function (r) { return r['진행 상태'] !== '종료' && r['폼ID'] && r['시트ID']; })
    .sort(function (a, b) { return (b['진행일'] || 0) - (a['진행일'] || 0); });
  const out = { runs: list.map(function (r) { return { title: String(r['명단 제목']), label: bareTitle_(r['명단 제목']) + '  (' + (Number(r['인원']) || 0) + '/' + (r['목표인원'] || '?') + '명)' }; }) };
  const r = list.filter(function (x) { return String(x['명단 제목']) === String(d.title || ''); })[0] || list[0];
  if (!r) return out;
  if (d.act === 'assign' && String(d.text || '').trim()) out.msg = assignRun_(r, String(d.text));
  if (d.act === 'delete' && (d.times || []).length) out.msg = deleteRunTimes_(r, d.times.map(Number));
  if (d.act === 'more') out.msg = addMoreRun_(r, Number(d.n) || 0);
  const me = readRuns_().filter(function (x) { return String(x['명단 제목']) === String(r['명단 제목']) || (sameRunTitle_(x['명단 제목'], r['명단 제목']) && String(x['시트ID']) === String(r['시트ID'])); })[0] || r;
  out.title = String(me['명단 제목']);
  out.count = Number(me['인원']) || 0; out.target = Number(me['목표인원']) || 0;
  try { out.dups = dupList_(me); } catch (e) { out.dups = []; out.dupErr = e.message; }
  try { out.short = shortByOption_(readRuns_(), me); } catch (e) { out.short = {}; }
  const as = assignSheet_(), last = as.getLastRow();
  out.assigned = last >= 2 && as.getRange(2, 1, last - 1, 1).getValues().some(function (x) { return String(x[0]) === out.title; });
  return out;
}

// 이 진행 폼 응답 중 중복(한 명단 시트에서 계정, 전화번호, 주소 중 하나가 먼저 낸 응답과 같음)
function dupList_(r) {
  const ss = SpreadsheetApp.openById(r['시트ID']);
  const own = rawFor_(ss, r['폼ID']);
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
    let name = '', phone = '';
    x.h.forEach(function (h, c) {
      if (!name && MATCH.name.test(h) && !MATCH.account.test(h)) name = String(x.v[c]);
      if (!phone && /전화|연락처|휴대폰|핸드폰/.test(h)) phone = String(x.v[c]);
      if (!MATCH.dup.test(h) || MATCH.account.test(h)) return;
      const val = String(x.v[c]).trim().toLowerCase().replace(/[\s-]/g, '');
      if (!val) return;
      const key = (/주소/.test(h) && !/이메일/.test(h) ? '주소' : /전화|연락처|휴대폰|핸드폰/.test(h) ? '전화번호' : '계정') + '|' + val;
      if (seen[key]) why.push(key.split('|')[0]); else keys.push(key);
    });
    keys.forEach(function (k) { seen[k] = 1; });
    if (why.length && x.own) out.push({ t: x.t, label: Utilities.formatDate(new Date(x.t), CONFIG.TIMEZONE, 'M/d HH:mm') + '  ' + name + '  ' + phone, why: why.join(', ') });
  });
  return out;
}

const TOOLS_HTML = `
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
</style>
<h1>진행 도우미</h1>
<select id="run"></select>
<div class="card"><h2>① 공지 붙여넣기 (누가 어떤 옵션)</h2>
  <p class="hint">카톡 공지(옵션 옆이나 아래에 이름 적은 것)를 통째로 복사해서 붙여넣으세요. 이름(취소), 이름2(2계정)도 알아서 읽어요.</p>
  <p class="hint" id="asg"></p>
  <textarea id="txt" placeholder="여기에 공지 붙여넣기"></textarea>
  <button id="b1">저장</button></div>
<div class="card"><h2>② 중복</h2>
  <p class="hint">계정, 전화번호, 주소가 먼저 낸 사람과 같은 응답이에요. 체크된 걸 지우면 폼과 명단 시트에서 같이 지워져요.</p>
  <div id="dups"></div>
  <button id="b2">체크한 것 지우기</button></div>
<div class="card"><h2>③ 내일 추가 모집</h2>
  <p class="hint" id="short"></p>
  <input id="n" type="number" min="1" placeholder="인원">
  <button id="b3">내일 추가 모집 만들기</button></div>
<div class="msg" id="msg"></div>
<script>
var K = __K__, $ = function (i) { return document.getElementById(i); }, cur = '';
function busy(on) { ['b1','b2','b3'].forEach(function (b) { $(b).disabled = on; }); }
function call(d) {
  busy(true); d.k = K; d.title = $('run').value || cur;
  google.script.run.withSuccessHandler(function (o) { busy(false); show(o); }).withFailureHandler(function (e) { busy(false); say('오류: ' + e.message); }).createRun(d);
}
function say(t) { $('msg').style.display = t ? 'block' : 'none'; $('msg').textContent = t || ''; }
function show(o) {
  var sel = $('run'); sel.innerHTML = '';
  (o.runs || []).forEach(function (r) { var op = document.createElement('option'); op.value = r.title; op.textContent = r.label; sel.appendChild(op); });
  if (o.title) { sel.value = o.title; cur = o.title; }
  if (o.msg) say(o.msg);
  $('asg').innerHTML = o.assigned ? '<span class="ok">✔ 이 진행은 공지를 넣어 뒀어요. 다시 넣으면 새로 바뀌어요.</span>' : '아직 공지를 안 넣었어요.';
  var box = $('dups'); box.innerHTML = '';
  if (!(o.dups || []).length) box.innerHTML = '<span class="ok">✔ 중복 없어요</span>';
  (o.dups || []).forEach(function (x) {
    var l = document.createElement('label'); l.className = 'row';
    l.innerHTML = '<input type="checkbox" checked value="' + x.t + '"><div><div></div><div class="why"></div></div>';
    l.querySelector('div div').textContent = x.label; l.querySelector('.why').textContent = '겹침: ' + x.why;
    box.appendChild(l);
  });
  $('b2').style.display = (o.dups || []).length ? '' : 'none';
  var sh = o.short || {}, ks = Object.keys(sh), sum = ks.reduce(function (a, k) { return a + sh[k]; }, 0);
  var left = Math.max((o.target || 0) - (o.count || 0), 0);
  $('short').textContent = sum ? '모자란 인원 (안 산 계정 + 취소): ' + ks.map(function (k) { return k + ' ' + sh[k]; }).join(', ') + ' → 합 ' + sum + '명. 공지 옵션 인원도 이대로 들어가요.'
    : '지금 ' + (o.count || 0) + '/' + (o.target || 0) + '명' + (left ? ' (' + left + '명 모자람)' : '') + '. 공지를 넣어 두면 옵션별로 계산해요.';
  $('n').value = sum || left || '';
}
$('run').onchange = function () { say(''); call({ act: 'info' }); };
$('b1').onclick = function () { if (!$('txt').value.trim()) return say('공지를 붙여넣어 주세요.'); call({ act: 'assign', text: $('txt').value }); $('txt').value = ''; };
$('b2').onclick = function () {
  var t = [].slice.call(document.querySelectorAll('#dups input:checked')).map(function (x) { return x.value; });
  if (!t.length) return say('지울 걸 체크해 주세요.');
  if (confirm(t.length + '개를 지울까요? 폼과 명단 시트에서 같이 지워져요.')) call({ act: 'delete', times: t });
};
$('b3').onclick = function () { var n = Number($('n').value); if (!n) return say('인원을 적어 주세요.'); if (confirm('내일 ' + n + '명 추가 모집을 만들까요?')) call({ act: 'more', n: n }); };
call({ act: 'info' });
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
  const titles = readRuns_().filter(function (r) { return r['진행 상태'] !== '종료' && r['시트ID']; }).map(function (r) { return String(r['명단 제목']); }).reverse();
  sh.getRange('B1').setDataValidation(titles.length ? SpreadsheetApp.newDataValidation().requireValueInList(titles, true).setAllowInvalid(true).build() : null);
  const has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'onAdminEdit'; });
  if (!has) ScriptApp.newTrigger('onAdminEdit').forSpreadsheet(ss).onEdit().create();
  return sh;
}

function onAdminEdit(e) {
  if (e && e.response) return onRunSubmit_(e);   // 폼 제출 트리거도 이 이름으로 받음 (로더에 이미 있는 이름이라)
  if (!e || !e.range) return;
  return locked_(function () { return onAdminEditInner_(e); }, 30000);
}

function onAdminEditInner_(e) {
  const sh = e.range.getSheet();
  if (sh.getName() === DASH_TAB && e.range.getColumn() === 2 && e.range.getRow() >= 2 && e.oldValue && e.value) {
    // 한눈에 탭 방제를 고치면 진행목록, 카톡방, 보낼 메시지함, 월급시트까지 같이
    const r = readRuns_().filter(function (x) { return bareTitle_(x['명단 제목']) === String(e.oldValue).trim() || sameRunTitle_(x['명단 제목'], e.oldValue); }).pop();
    if (r && renameRun_(r, e.value)) { try { updatePay_(); } catch (err) {} }
    return;
  }
  if (sh.getName() === DASH_TAB && e.range.getColumn() === 12 && e.range.getRow() >= 2) {
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
    try { sh.getRange('G1').setValue(applyAssign_(sh, String(e.range.getValue()))); sh.getRange('E2').clearContent(); }
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

// 진행 중인 폼마다 '제출하면 바로' 트리거 (월급시트, 인원이 바로 바뀌게). 끝난 폼 트리거는 지움. 트리거는 최대 20개라 폼은 15개까지
function ensureSubmitTriggers_(runs) {
  const want = [];
  runs.forEach(function (r) { if (r['진행 상태'] !== '종료' && r['폼ID'] && want.indexOf(String(r['폼ID'])) === -1) want.push(String(r['폼ID'])); });
  const have = {};
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() !== 'onAdminEdit' || t.getEventType() !== ScriptApp.EventType.ON_FORM_SUBMIT) return;
    const id = t.getTriggerSourceId();
    if (want.indexOf(id) === -1 || have[id]) ScriptApp.deleteTrigger(t); else have[id] = 1;
  });
  want.slice(0, 15).forEach(function (id) {
    if (have[id]) return;
    try { ScriptApp.newTrigger('onAdminEdit').forForm(id).onFormSubmit().create(); } catch (e) { Logger.log('폼 트리거 만들기 실패 ' + id + ': ' + e); }
  });
}

// 폼이 제출되면: 그 폼 진행들의 인원 → 월급시트, 한눈에 탭. 다 찼으면 마감 확인까지
function onRunSubmit_(e) {
  // 다른 작업 중이면 20초 기다리고, 그래도 바쁘면 15분 확인이 이어서 함
  return locked_(function () {
    const formId = e.source.getId();
    const runs = readRuns_();
    const times = e.source.getResponses().map(function (x) { return x.getTimestamp().getTime(); });
    let full = false;
    runs.forEach(function (r) {
      if (String(r['폼ID']) !== formId || r['진행 상태'] === '종료') return;
      const n = runCount_(runs, r, times);
      if (Number(r['인원']) !== n) setRun_(r.row, '인원', n);
      if (r['목표인원'] && !r['마감 시각'] && n >= Number(r['목표인원'])) full = true;
    });
    try { updatePay_(); } catch (err) { Logger.log('월급시트 갱신 실패: ' + err); }
    try { buildDashboard_(false); } catch (err) {}
    if (full) checkFull();
  }, 20000);
}

function editRun_(sh) {
  const t = String(sh.getRange('B1').getValue());
  return readRuns_().filter(function (r) { return String(r['명단 제목']) === t; }).pop();
}

function loadEditTab_(sh, msg) {
  const max = sh.getMaxRows();
  if (max > 3) { sh.getRange(4, 1, max - 3, sh.getMaxColumns()).clearContent().clearDataValidations().setBackground(null).setFontColor(null); }
  sh.getRange('B2').clearContent();
  sh.getRange('G1').setValue(msg || '');
  try { ensureDupControl_(sh); } catch (e) {}
  const r = editRun_(sh);
  if (!r) { sh.getRange(3, 1, 1, sh.getMaxColumns()).clearContent(); return; }
  const raw = rawFor_(SpreadsheetApp.openById(r['시트ID']), r['폼ID']);
  const head = headers_(raw);
  sh.getRange(3, 1, 1, sh.getMaxColumns()).clearContent();
  sh.getRange(3, 1, 1, head.length + 1).setValues([['삭제'].concat(head)]).setFontWeight('bold').setBackground('#efe6f7').setWrap(true);
  const last = raw.getLastRow();
  const data = last < 2 ? [] : raw.getRange(2, 1, last - 1, head.length).getValues().filter(function (x) { return x[0] !== ''; });
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

function assignRun_(r, text) {
  let note = '';
  let info = rawInfo_(r['시트ID'], r['폼ID']);
  if (!info.nickCol && r['폼ID']) {
    if (ensureNickQuestion_(FormApp.openById(r['폼ID']))) { note = ' 폼에 닉네임 질문이 없어서 넣었어요 (이미 낸 사람은 확인 못 해요).'; SpreadsheetApp.flush(); Utilities.sleep(2000); }
  }
  const form = formOf_(info.raw);
  const choices = form ? formChoices_(form) : [];
  const rows = parseAssign_(text, choices);
  if (!rows.length) return '이름을 못 찾았어요. 옵션 줄 뒤나 아래 줄에 이름을 띄어쓰기로 적어 주세요.';
  writeAssign_(r, rows);
  const by = {};
  let canc = [];
  rows.forEach(function (x) { if (!x[2]) { canc.push(x[0]); return; } const o = String(x[1]) || '옵션 모름'; by[o] = (by[o] || 0) + x[2]; });
  try { buildDashboard_(true); } catch (e) {}
  return '배정 넣었어요: ' + Object.keys(by).map(function (o) { return o + ' ' + by[o]; }).join(', ') + (canc.length ? ' / 취소 ' + canc.join(' ') : '') + '. 관리 시트 배정 탭에서 확인하세요.' + note;
}

// 이 진행이 속한 의뢰의 첫 명단 시트(첫 진행). 예전에 날마다 시트를 따로 만든 의뢰도 첫 시트로 모음
function firstSheetRun_(r) {
  const ck = campKey_(r['캠페인'] || r['명단 제목']);
  const chain = chainsOf_(readRuns_()).filter(function (c) { return c.key === ck && c.runs.some(function (x) { return x.row === r.row; }); })[0];
  return (chain && chain.runs.filter(function (x) { return x['시트ID'] && x['폼ID']; })[0]) || r;
}

// 모자란 인원을 다음 날 같은 명단 시트(같은 폼)로 더 받기
//  방제: #택10.15 모두의농수산옥광밤외12 → #택10.16 모두의농수산옥광밤외5, 공지는 지금 폼 설명에서 옵션 인원만 비움
function addMore_(sh, n) {
  const r = editRun_(sh);
  if (!r) return '먼저 B1에서 진행을 고르세요.';
  return addMoreRun_(r, n);
}

function addMoreRun_(r, n) {
  const base = r['진행일'] instanceof Date && r['진행일'] >= today_() ? new Date(r['진행일']) : today_();
  base.setDate(base.getDate() + 1);
  const md = (base.getMonth() + 1) + '.' + base.getDate();
  const iso = Utilities.formatDate(base, CONFIG.TIMEZONE, 'yyyy-MM-dd');
  const reqId = 'add-' + r['시트ID'] + '-' + iso;
  if (findRunByRequest_(reqId)) return md + ' 추가 모집은 이미 만들었어요.';
  if (!n && !shortByOption_(readRuns_(), r).__any) return '인원을 1 이상으로 적어 주세요.';
  const nick = (String(r['명단 제목']).match(/\s*\([^)]*\)\s*$/) || [''])[0];
  const roomOld = String(r['카톡방'] || String(r['명단 제목']).replace(/\s*\([^)]*\)\s*$/, ''));
  const room = roomOld.replace(/\d{1,2}\.\d{1,2}/, md).replace(/\d+\s*$/, String(n));
  const form = FormApp.openById(r['폼ID']);
  // 모자란 옵션별 인원 = 배정에서 안 산 계정 + 취소한 사람 (배정이 없으면 옵션 인원은 비워 둠)
  const short = shortByOption_(readRuns_(), r);
  const sum = Object.keys(short).reduce(function (a, o) { return a + short[o]; }, 0);
  const desc = String(form.getDescription() || '');
  const notice = sum ? noticeForMore_(desc, short) : desc.replace(/\(\s*\d*\s*명\)/g, '(  명)');
  if (sum && !n) n = sum;
  let res;
  locked_(function () {
    res = createRunInner_({
      k: CONFIG.KEY, n: reqId, title: room + nick, room: room, fname: room, camp: r['캠페인'] || campOf_(r['명단 제목']),
      day: (Number(r['일차']) || 1) + 1, total: r['총건수'], daily: String(n), date: iso, desc: notice, type: r['유형'],
      takdae: r['택대'] === 'Y', realship: r['실배송'] === 'Y', platform: r['플랫폼'], prices: r['가격'], croom: r['업체방'],
      shop: r['업체'], photo: r['포토'], slot: r['구매시간'], reuse: firstSheetRun_(r)
    });
  }, 60000);
  if (!res) return '다른 작업 중이라 못 만들었어요. 잠시 뒤 다시 해 주세요.';
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

// 추가 모집 공지: 옵션 인원을 모자란 수로 바꾸고 이름은 지움. 0명인 옵션 줄(바로 아래 가격 줄도), 0명인 가이드는 뺌
function noticeForMore_(desc, short) {
  const k = function (x) { return String(x || '').toLowerCase().replace(/\s+/g, ''); };
  const want = {};
  Object.keys(short).forEach(function (o) { want[k(o)] = short[o]; });
  const parts = String(desc).split(/(\n\s*-{5,}\s*\n)/);
  const multi = parts.length > 1;
  const kept = [];
  for (let i = 0; i < parts.length; i += 2) {
    const prod = multi ? (noticeProducts_(parts[i])[0] || {}).name || '' : '';
    let total = 0, header = -1;
    const lines = parts[i].split('\n'), out = [];
    for (let j = 0; j < lines.length; j++) {
      const t = lines[j];
      const m = t.match(/^(\s*(?:\d+\)\s*)?(?:🐥\s*옵션\s*[:：]?\s*)?)(.*?)\s*\(?\s*(\d+)\s*명\s*\)?(.*)$/);
      if (!m) { out.push(t); continue; }
      const opt = m[2].trim();
      if (!opt) { header = out.length; out.push(t); continue; }   // '1) 5명' 가이드 머리
      if (/가격|원$/.test(opt)) { out.push(t); continue; }
      const c = want[k([prod, opt].filter(Boolean).join(' '))] || want[k(opt)] || 0;
      if (!c) { if (/^\s*🐥\s*가격/.test(lines[j + 1] || '') && ((lines[j + 1].match(/\d{1,3}(?:,\d{3})+|\d{4,}/g) || []).length === 1)) j++; continue; }
      total += c;
      out.push(m[1] + opt + (/\(\s*\d+\s*명/.test(t) ? ' (' + c + '명)' : ' ' + c + '명'));   // 원래 모양 그대로 (N명) 또는 N명
    }
    if (multi && !total && i > 0) continue;
    if (multi && !total) { /* 첫 가이드는 상단 공지가 들어 있어서 옵션 줄만 빠진 채로 둠 */ }
    if (header >= 0) out[header] = out[header].replace(/\d+\s*명/, total + '명');
    kept.push(out.join('\n'));
  }
  let g = 0;
  return kept.map(function (b) { return b.replace(/^(\s*)\d+\)/m, function (x, sp) { return sp + (++g) + ')'; }); })
    .join('\n\n------------------------------------------------\n\n').replace(/\n{3,}/g, '\n\n');
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
      const msg = '📢 아직 구매 확인이 안 된 분들이에요\n' + names.join('\n') + '\n\n7시 30분까지 구매하고 폼 작성 부탁드려요!\n답이 없으면 다른 분으로 바꿀게요 🙏';
      if (r['카톡방']) queueMsg_(r['카톡방'], msg, '안 산 사람');
      MailApp.sendEmail(me, '[체험단] 7시 안 산 사람 ' + list.length + '명: ' + r['명단 제목'], names.join(' ') + '\n\n카톡방에 보낼 글 (보낼 메시지함에도 있어요):\n\n' + msg + '\n\n' + outboxUrl_());
    } else {
      MailApp.sendEmail(me, '[체험단] 7시 30분 아직 안 산 사람 ' + list.length + '명: ' + r['명단 제목'], names.join(' ') + '\n\n답이 없으면 새로 구하세요. 8시 전에 구매가 끝나야 명단을 넘길 수 있어요.');
    }
  });
}

// 택배시트는 2시 전까지: 오늘 택대 진행 중 '택배 옮김' 체크가 안 된 것을 12시 30분, 1시 30분에 메일로 알림
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
    } catch (e) { Logger.log('정리 실패 ' + r['명단 제목'] + ': ' + e); }
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
  // 1) 폼 응답 삭제
  const form = FormApp.openById(r['폼ID']);
  const resps = form.getResponses();
  picked.forEach(function (x) {
    const hit = resps.filter(function (fr) { return near(fr.getTimestamp(), x[1]); })[0];
    if (hit) form.deleteResponse(hit.getId());
  });
  // 2) 응답 시트 행 삭제 (아래에서부터)
  const raw = rawFor_(SpreadsheetApp.openById(r['시트ID']), r['폼ID']);
  const ts = raw.getRange(2, 1, Math.max(raw.getLastRow() - 1, 1), 1).getValues();
  for (let i = ts.length - 1; i >= 0; i--) {
    if (ts[i][0] instanceof Date && picked.some(function (x) { return near(ts[i][0], x[1]); })) raw.deleteRow(i + 2);
  }
  // 3) 인원 갱신, 모자라면 폼 다시 열기 (그 일차의 마지막 진행이고 구매 시간이 안 지났을 때만)
  const runs = readRuns_();
  const me = runs.filter(function (x) { return x.row === r.row; })[0] || r;
  const n = runCount_(runs, me);
  setRun_(r.row, '인원', n);
  let reopened = '';
  if (r['목표인원'] && n < Number(r['목표인원']) && !form.isAcceptingResponses() && windowOf_(runs, me).last && !pastEnd_(me)) {
    form.setAcceptingResponses(true);
    setRun_(r.row, '마감 시각', '');
    reopened = ' 인원이 모자라서 폼을 다시 열었어요.';
  }
  const short = Number(r['목표인원']) - n;
  try { buildDashboard_(true); } catch (e) {}
  return picked.length + '명 지웠어요 (지금 ' + n + '명).' + reopened + (!reopened && short > 0 ? ' ' + short + '명 모자라요. 내일 추가 모집을 만들 수 있어요.' : '');
}

/* ---------------- 8) 여러 날 진행: 다음 일차 자동 만들기 ---------------- */
// 1일차를 만들 때 생성기가 보낸 계획(일차, 날짜, 건수, 옵션 인원)을 '일정' 탭에 저장
// 15분마다(checkFull) 앞 일차 명단이 다 찼거나, 전날 CONFIG.NEXT_DAY_HOUR시가 되면 다음 일차 폼, 시트, 공지를 만듦
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
  try { if (!sh.isSheetHidden()) sh.hideSheet(); } catch (e) {}
  return sh;
}

function savePlan_(d) {
  const plan = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(d.plan)).getDataAsString('UTF-8'));
  if (!plan.length) return;
  const camp = campOf_(d.title);
  const cfg = JSON.stringify({ type: d.type, takdae: !!d.takdae, realship: !!d.realship, platform: d.platform, prices: d.prices,
    croom: d.croom, shop: d.shop, photo: d.photo, opts: d.opts, desc: String(d.desc || ''), slot2: d.slot2 || '자정 ~ 오전 8시 20분 구매', total: d.total, camp: camp, base: d.n });
  const sh = planSheet_();
  plan.forEach(function (x) {
    sh.appendRow([String(d.n || camp) + '-' + x.k, camp, x.k, new Date(x.date + 'T00:00:00'), x.room, x.title, x.n, JSON.stringify(x.c), '대기', cfg]);
  });
}

// 1일차 공지(폼 링크 넣기 전)에서 맨 윗줄, 가이드 머리 인원 "1) 5명", 옵션 인원 "(3명)"만 그 일차 값으로 바꿈
function adjustNotice_(tpl, counts, slot2) {
  const blocks = String(tpl).split(NOTICE_SEP);
  const multi = blocks.length > 1;
  const out = blocks.map(function (b, i) {
    const c = counts[i];
    if (!c) return b;
    if (multi) b = b.replace(new RegExp('^' + (i + 1) + '\\) *\\d*명?', 'm'), (i + 1) + ') ' + c[0] + '명');
    let k = 0;
    return b.replace(/\(\s*\d*\s*명\)/g, function () { const v = (c[1] || [])[k++]; return '(' + (v === undefined || v === null ? '  ' : v) + '명)'; });
  }).join(NOTICE_SEP).split('\n');
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
    const chain = chainsOf_(runs).filter(function (c) { return c.key === ck; }).pop();
    if (chain && chain.total && chain.done >= chain.total) { sh.getRange(i + 2, 9).setValue('건너뜀 (이미 다 진행)'); return; }
    if (chain && chain.runs.some(function (r) { return r['진행일'] instanceof Date && Utilities.formatDate(r['진행일'], CONFIG.TIMEZONE, 'yyyyMMdd') === Utilities.formatDate(new Date(x[3]), CONFIG.TIMEZONE, 'yyyyMMdd'); })) { sh.getRange(i + 2, 9).setValue('건너뜀 (그날 진행 있음)'); return; }
    const prev = chain ? chain.runs[chain.runs.length - 1] : null;
    const due = new Date(x[3]); due.setDate(due.getDate() - 1); due.setHours(CONFIG.NEXT_DAY_HOUR, 0, 0, 0);
    if (!((prev && prev['마감 시각']) || now >= due)) return;
    locked_(function () {
      if (findRunByRequest_(x[0])) { sh.getRange(i + 2, 9).setValue('생성됨'); return; }
      const dateIso = Utilities.formatDate(new Date(x[3]), CONFIG.TIMEZONE, 'yyyy-MM-dd');
      const desc = adjustNotice_(cfg.desc, JSON.parse(x[7]), cfg.slot2);
      const res = createRunInner_({
        k: CONFIG.KEY, n: x[0], title: x[5], room: x[4], fname: x[4], camp: cfg.camp, day: k, total: cfg.total,
        daily: String(x[6]), date: dateIso, desc: desc, type: cfg.type, takdae: cfg.takdae, realship: cfg.realship,
        platform: cfg.platform, prices: cfg.prices, croom: cfg.croom, opts: cfg.opts, shop: cfg.shop, photo: cfg.photo, slot: cfg.slot2
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

function payTab_(month) {
  const ss = SpreadsheetApp.openById(CONFIG.PAY_SHEET_ID);
  const byName = ss.getSheets().filter(function (s) { return new RegExp('(^|\\D)' + month + '월').test(s.getName()); })[0];
  return byName || ss.getSheets().filter(function (s) { return s.getSheetId() === CONFIG.PAY_TAB_GID; })[0] || ss.getSheets()[0];
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

function updatePay_() {
  if (!CONFIG.PAY_SHEET_ID) return;
  const all = readRuns_().filter(function (r) { return r['시트ID'] && r['진행일'] instanceof Date; });
  const runs = all.filter(function (r) { return r['진행 상태'] !== '종료'; });
  const nameOf = function (r) { return String(r['명단 제목']).replace(/\s*\([^)]*\)\s*$/, '').trim(); };
  // 같은 캠페인 묶기: 캠페인 칸, 없으면 방제에서 #, 택, 날짜, 건수, 띄어쓰기를 뺀 이름이 앞부분까지 같으면 같은 캠페인
  const keyOf = function (r) { return String(r['캠페인'] || nameOf(r)).replace(/^[#업택\s]+\d{1,2}\.\d{1,2}/, '').replace(/\d+\s*$/, '').replace(/\s+/g, ''); };
  const same = function (a, b) { return a && b && (a.indexOf(b) === 0 || b.indexOf(a) === 0); };
  // 같은 상품이 다시 의뢰돼도 섞이지 않게: 이 진행 직전의 '1일차'부터를 한 의뢰로 봄
  runs.forEach(function (r) {
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
    writePayRow_(r, nameOf(r), Math.max(total - before, 0) + prev, prev, siblings_(all, r).length > 1,
      { store: pick('업체'), time: payTime_(fruit ? runSlot_(fruit) : runSlot_(r)), photo: pick('포토') });
  });
}

// 월급시트 진행시간: 바로구매 → 긴급건, 별과 '구매' 글자는 뺌 (자정 ~ 오전 8시 20분)
function payTime_(t) {
  t = String(t || '');
  if (/바로구매/.test(t)) return '긴급건';
  const x = t.replace(/★/g, '').replace(/\s*구매\s*$/, '').replace(/\s+00\s*분/, '').replace(/\s+/g, ' ').trim();
  return /오전|오후/.test(x) && !/자정/.test(x) ? '시간지정' : x;
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
  put(col, Number(r['인원']) || 0);
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
  } catch (e) { Logger.log('파일 칩 실패: ' + e); PropertiesService.getScriptProperties().setProperty('CHIP_ERROR', String(e)); return false; }
}

/* ---------------- 10) 한눈에 탭: 진행 중인 것 전부 한 화면에 ---------------- */
// 위: 진행마다 한 줄 (진행일, 방제, 상태, 목표, 신청, 남은, 마감, 바로가기 명단/폼/월급시트/택배시트)
// 아래: 진행마다 명단 내용 (각 명단 시트를 그대로 보여 줌, 읽기 전용)
// 신청 수와 명단 내용은 IMPORTRANGE 수식이라 응답이 들어오면 몇 초~1분 안에 바로 바뀜 (스크립트를 기다리지 않음)
// 택배시트는 바로가기만 걸고 절대 고치지 않음

const DASH_TAB = '한눈에';
const DASH_VER = '8';   // 모양을 바꾸면 올려서 다시 만들게 함

function rebuildDashboard() {
  buildDashboard_(true);
  SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(adminSs_().getSheetByName(DASH_TAB));
}

function grantImport_(destId, srcId) {
  // 같은 계정의 시트끼리 IMPORTRANGE '액세스 허용'을 미리 눌러 둠 (안 되면 칸의 '허용'을 한 번 누르면 됨)
  try {
    UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + destId + '/externaldata/addimportrangepermissions?donorDocId=' + srcId,
      { method: 'post', headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  } catch (e) {}
}

function buildDashboard_(force) {
  const allRuns = readRuns_();
  const runs = allRuns.filter(function (r) { return r['진행 상태'] !== '종료' && r['시트ID']; })
    .sort(function (a, b) { return (b['진행일'] || 0) - (a['진행일'] || 0); });
  const props = PropertiesService.getScriptProperties();
  const ss = adminSs_();
  // 명단 시트(의뢰)마다 한 덩어리. 명단 탭(여러 날 폼 응답을 합친 것)이 있으면 거기서 가져옴
  const sheets = {}, order = [];
  runs.forEach(function (r) {
    const id = String(r['시트ID']);
    if (sheets[id]) { sheets[id].runs.push(r); return; }
    order.push(id);
    let src = '', start = 2, cols = 12, keep = [], hd = [], count = 0;
    try {
      const rss = SpreadsheetApp.openById(id);
      const lt = rss.getSheetByName(LIST_TAB);
      if (lt && lt.getLastColumn() > 0 && String(lt.getRange('A2').getValue()) !== '') {
        src = LIST_TAB; start = 3; cols = lt.getLastColumn();
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
  // 덩어리 줄 수는 지금 인원 + 여유 5줄 (넘칠 것 같으면 다시 만듦). 빈칸이 너무 길지 않게
  order.forEach(function (id) {
    const x = sheets[id];
    const total = x.runs.reduce(function (m, r) { return Math.max(m, Number(r['총건수']) || 0); }, 0);
    x.n = Math.max(Math.ceil((x.count + 5) / 5) * 5, 6);   // 5줄 단위라 응답 몇 개마다만 다시 만듦
    if (total) x.n = Math.min(x.n, Math.max(total + 2, x.count + 2));
  });
  const sig = DASH_VER + '|' + props.getProperty('RUN_ERRORS') + '|' + order.map(function (id) { return id + ':' + sheets[id].n; }).join(',') + '|' + runs.map(function (r) { return r['시트ID'] + ':' + r['목표인원'] + ':' + r['진행 상태'] + ':' + r['진행일'] + ':' + r['택배 옮김']; }).join('|');
  let sh = ss.getSheetByName(DASH_TAB);
  // 한눈에 탭에서 방제를 직접 고쳐 둔 게 있으면 다시 만들기 전에 진행목록에 반영
  if (sh && sh.getLastRow() >= 2) {
    let changed = false;
    sh.getRange(2, 2, Math.min(sh.getLastRow() - 1, 60), 1).getValues().forEach(function (v) {
      const t = String(v[0]).trim();
      if (!t || t.charAt(0) === '■') return;
      const r = runs.filter(function (x) { return sameRunTitle_(x['명단 제목'], t) && bareTitle_(x['명단 제목']) !== t; })[0];
      if (r && renameRun_(r, t)) changed = true;
    });
    if (changed) { force = true; try { updatePay_(); } catch (e) {} }
  }
  if (!force && sh && props.getProperty('DASH_SIG') === sig) return;
  order.forEach(function (id) { grantImport_(ss.getId(), id); });
  if (!sh) sh = ss.insertSheet(DASH_TAB, 0);
  // 1행은 글자만 지우고 서식은 둠 (직접 칠한 색이 안 풀리게)
  sh.getRange(1, 1, 1, sh.getMaxColumns()).clearContent();
  sh.getRange(2, 1, sh.getMaxRows() - 1, sh.getMaxColumns()).clear().clearDataValidations();
  sh.setFrozenRows(1);
  const q = function (t) { return '"' + String(t).replace(/"/g, '""') + '"'; };
  const head = ['진행일', '방제', '상태', '목표', '신청', '남은', '마감 시각', '명단', '폼', '택배시트', '틀린 옵션', '택배 옮김', '확인 필요'];
  let errs = {};
  try { errs = JSON.parse(props.getProperty('RUN_ERRORS') || '{}'); } catch (e) {}
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#efe6f7');
  const payUrl = CONFIG.PAY_SHEET_ID ? 'https://docs.google.com/spreadsheets/d/' + CONFIG.PAY_SHEET_ID + '/edit#gid=' + CONFIG.PAY_TAB_GID : '';
  // 아래 덩어리 자리 먼저 계산 (위 표 '틀린 옵션'이 덩어리의 옵션 확인 칸을 셈)
  let row = runs.length + 4;
  order.forEach(function (id) {
    const x = sheets[id];
    x.top = row;
    // 택배시트 칸 순서 그대로 (A 시간, B 이름, C 아이디, D 전화, E 주소, F 옵션, G 금액, H~J 빈칸, K 업체+상품) → 그대로 복사해서 붙여넣기
    //  그 뒤에 나머지 질문(닉네임, 주문번호 등), 맨 끝에 옵션 확인
    const find = function (re, not) { return x.hd.findIndex(function (h) { return h && re.test(h) && !(not && not.test(h)) && !MATCH.account.test(h); }) + 1; };
    //  택대가 아니면 택배시트에 옮길 게 없으니 H~K(택배 상품)는 빼고 A~G 다음에 나머지 질문
    x.tak = x.runs.some(function (r) { return r['택대'] === 'Y'; });
    const T = [['타임스탬프', 1], ['이름', find(MATCH.name)], ['아이디', find(/아이디|계정|이메일/)], ['전화번호', find(/전화|연락처|휴대폰|핸드폰/)],
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
    x.item = x.item.replace(/외$/, '');
    row += x.n + 4;
  });
  const fmt = function (t) { return 'DATE(' + Utilities.formatDate(new Date(t), CONFIG.TIMEZONE, 'yyyy,M,d') + ')'; };
  runs.forEach(function (r, i) {
    const rr = i + 2, x = sheets[String(r['시트ID'])];
    sh.getRange(rr, 1, 1, 4).setValues([[r['진행일'], String(r['명단 제목']).replace(/\s*\([^)]*\)\s*$/, ''), r['진행 상태'], r['목표인원']]]);
    const w = windowOf_(allRuns, r);
    const ts = 'IMPORTRANGE(' + q(x.url) + ',' + q(x.ref + 'A' + x.start + ':A') + ')';
    // 명단 시트 하나를 여러 날이 같이 쓰면 그날 몫(진행일 0시 ~ 다음 진행 0시)만 셈
    sh.getRange(rr, 5).setFormula(w.shared
      ? '=IFERROR(LET(v,' + ts + ',SUMPRODUCT(ISNUMBER(v)*(v>=' + (w.from ? fmt(w.from) : 0) + ')*(v<' + (isFinite(w.to) ? fmt(w.to) : 99999) + '))),"허용 필요")'
      : '=IFERROR(COUNTA(' + ts + '),"허용 필요")');
    sh.getRange(rr, 6).setFormula('=IF(ISNUMBER(E' + rr + '),D' + rr + '-E' + rr + ',"")');
    sh.getRange(rr, 7).setValue(r['마감 시각']);
    sh.getRange(rr, 8).setFormula('=HYPERLINK(' + q(x.url) + ',"명단")');
    if (r['폼 링크']) sh.getRange(rr, 9).setFormula('=HYPERLINK(' + q(r['폼 링크']) + ',"폼")');
    if (r['택대'] === 'Y' && CONFIG.TAKBAE_SHEET_URL) sh.getRange(rr, 10).setFormula('=HYPERLINK(' + q(CONFIG.TAKBAE_SHEET_URL) + ',"택배")');
    // 택대면 '택배 옮김' 체크 (명단을 택배시트에 옮겨 적었으면 체크, 2시 전까지). 체크하면 진행목록에도 저장
    if (r['택대'] === 'Y') sh.getRange(rr, 12).insertCheckboxes().setValue(r['택배 옮김'] === true);
    if (errs[r['명단 제목']]) sh.getRange(rr, 13).setValue('⚠ ' + errs[r['명단 제목']]).setFontColor('#b91c1c');
    if (x.chk) {
      const c = colLetter_(x.chk), rg = c + (x.top + 2) + ':' + c + (x.top + 1 + x.n);
      sh.getRange(rr, 11).setFormula('=COUNTIF(' + rg + ',"옵션 틀림")+COUNTIF(' + rg + ',"초과 구매")');
    }
  });
  if (CONFIG.WEBAPP_URL) sh.getRange(1, 14).setFormula('=HYPERLINK(' + q(toolsUrl_()) + ',"▶ 진행 도우미")').setFontWeight('bold');
  if (payUrl) sh.getRange(1, 15).setFormula('=HYPERLINK(' + q(payUrl) + ',"▶ 월급시트 열기")').setFontWeight('bold');
  if (runs.length) {
    // 위 표 보기 좋게: 가운데 맞춤, 방제는 왼쪽, 테두리
    sh.getRange(1, 1, runs.length + 1, head.length).setHorizontalAlignment('center').setVerticalAlignment('middle')
      .setBorder(true, true, true, true, true, true, '#d9d2e9', SpreadsheetApp.BorderStyle.SOLID);
    sh.getRange(2, 2, runs.length, 1).setHorizontalAlignment('left');
    sh.getRange(2, 13, runs.length, 1).setHorizontalAlignment('left');
    sh.setRowHeight(1, 28);
    sh.getRange(2, 1, runs.length, 1).setNumberFormat('M/d');
    sh.getRange(2, 7, runs.length, 1).setNumberFormat('M/d HH:mm');
  }
  // 아래: 명단 내용 (중복, 금액, 옵션 확인 표시는 여기서만. 명단 시트는 업체도 봐서 깨끗하게 둠)
  const rules = [];
  const A = "'" + ASSIGN_TAB + "'!";
  order.forEach(function (id) {
    const x = sheets[id], top = x.top, n = x.n, width = Math.max(x.layout.length + (x.chk ? 1 : 0), 6);
    const titles = x.runs.map(function (r) { return String(r['명단 제목']).replace(/\s*\([^)]*\)\s*$/, ''); }).reverse();
    sh.getRange(top, 1, 1, width).setBackground('#f0e8f8');
    // 제목 + 안 산 사람 (관리 시트 배정 탭에서 '아직'인 사람, 응답이 들어오면 바로 바뀜)
    const label = '■ ' + sheetName_(x.runs[x.runs.length - 1]['명단 제목']) + '   ' + titles.join(', ');
    sh.getRange(top, 1).setFormula('=' + q(label) + '&IFERROR("   ▶ 안 산 사람: "&TEXTJOIN(" ",TRUE,FILTER(' + A + 'B2:B&IF(' + A + 'F2:F="아직 1","","("&MID(' + A + 'F2:F,4,9)&"건)"),' + A + 'G2:G="' + id + '",LEFT(' + A + 'F2:F,2)="아직")),"")')
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
    const parts = x.layout.map(function (t) { return t[1] === 'K' ? kcol : t[1] ? c(t[1]) : blank; });
    const imp = 'IMPORTRANGE(' + q(x.url) + ',' + q(x.ref + 'A' + x.start + ':' + colLetter_(x.cols) + (x.start + n - 1)) + ')';
    sh.getRange(top + 1, 1, 1, x.layout.length).setValues([x.layout.map(function (t) { return t[0]; })]);
    sh.getRange(top + 2, 1).setFormula('=IFERROR(LET(d,' + imp + ',IF(COUNTA(INDEX(d,0,1))=0,"",LET(e,FILTER(d,INDEX(d,0,1)<>""),HSTACK(' + parts.join(',') + ')))),"이 칸을 눌러 액세스 허용을 한 번 눌러 주세요")');
    sh.getRange(top + 1, 1, 1, Math.max(width2, 6)).setFontWeight('bold').setBackground('#faf7fd');
    if (x.tak) sh.getRange(top + 1, 11).setNote('택배시트 K열에 그대로 붙여넣는 칸 (업체명 + 판매 상품). A~K를 한 번에 복사하면 택배시트 칸 순서와 같아요.');
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
      sh.getRange(top + 1, x.chk).setValue(CHECK_HEAD).setNote('관리 시트 배정 탭과 비교. ✔ 맞음 / 옵션 틀림 / 초과 구매 / 닉네임 확인(배정에 없음) / 취소한 사람. 배정이 없으면 빈칸');
      sh.getRange(r0, x.chk).setFormula(checkFormula_(L(x.nick), L(x.opt), n, id));
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
    if (prices.length && x.layout[6][1]) {
      const num = 'VALUE(REGEXREPLACE(TO_TEXT(G' + r0 + '),"[^0-9]",""))';
      rules.push(SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied('=AND(G' + r0 + '<>"",NOT(OR(' + prices.map(function (v) { return num + '=' + v; }).join(',') + ')))')
        .setBackground('#f9cb9c').setFontColor('#7a3a00').setRanges([colRange(7)]).build());
    }
  });
  [[1, 95], [2, 240], [3, 170], [4, 120], [5, 220], [6, 100], [7, 100]].forEach(function (w) { sh.setColumnWidth(w[0], w[1]); });
  if (runs.length) {
    // 남은이 0이 아니면 빨간 굵은 글씨
    rules.unshift(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND(ISNUMBER(F2),F2<>0)').setFontColor('#d00000').setBold(true).setRanges([sh.getRange(2, 6, runs.length, 1)]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0).setBackground('#ea9999').setFontColor('#7f0000').setBold(true).setRanges([sh.getRange(2, 11, runs.length, 1)]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND(ISLOGICAL(L2),L2=FALSE)').setBackground('#ea9999').setRanges([sh.getRange(2, 12, runs.length, 1)]).build());
  }
  // 명단 줄 번갈아 연한 색 (읽기 쉽게, 다른 표시보다 약하게 맨 뒤에)
  order.forEach(function (id) {
    const x = sheets[id];
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($A' + (x.top + 2) + '<>"",ISEVEN(ROW()))').setBackground('#f6f4fb')
      .setRanges([sh.getRange(x.top + 2, 1, x.n, Math.max(x.layout.length + (x.chk ? 1 : 0), 6))]).build());
  });
  sh.setConditionalFormatRules(rules);
  props.setProperty('DASH_SIG', sig);
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
