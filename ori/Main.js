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

// 실행 중 생긴 문제를 모아 둠 (메뉴로 돌리면 창으로, 자동 실행이면 한눈에 탭 P1에 보임)
function note_(msg) { (globalThis.__ORI_NOTES = globalThis.__ORI_NOTES || []).push(String(msg)); Logger.log(msg); }

function report_(name, ok) {
  const all = (globalThis.__ORI_NOTES || []).filter(function (x) { return !/메시지함 기록 실패: TypeError: Utilities/.test(x); });
  globalThis.__ORI_NOTES = [];
  const done = all.filter(function (x) { return /^✓/.test(x); }), notes = all.filter(function (x) { return !/^✓/.test(x); });
  const when = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'M/d HH:mm');
  const took = globalThis.__ORI_T0 ? ' (' + Math.round((Date.now() - globalThis.__ORI_T0) / 1000) + '초)' : '';
  globalThis.__ORI_T0 = 0;
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
  // 한눈에 Q1은 한 줄 요약, 자세한 건 Q2부터 한 줄씩 (위 표 옆이라 잘 보이게)
  try {
    const d = adminSs_().getSheetByName(DASH_TAB);
    if (d) {
      d.getRange(1, 17).setValue(head).setFontColor(notes.length || ok === false ? '#b91c1c' : '#2f7a2f').setFontWeight('bold').setWrap(false);
      // 왼쪽(위 표 바로 아래 줄)에도 같은 한 줄 + 자세한 건 메모(마우스 올리면 보임)
      const bar = Number(PropertiesService.getScriptProperties().getProperty('DASH_BAR_ROW')) || 0;
      PropertiesService.getScriptProperties().setProperty('LAST_REPORT', head);
      if (bar) d.getRange(bar, 8).setValue(head).setNote(lines.join('\n')).setFontColor(notes.length || ok === false ? '#b91c1c' : '#2f7a2f').setFontWeight('bold').setWrap(false).setHorizontalAlignment('left');
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
      c.done += Number(r['목표인원']) || 0;
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
  const oldTitle = String(r['명단 제목']);
  setRun_(r.row, '명단 제목', title + nick); r['명단 제목'] = title + nick;
  // 배정 탭의 명단 제목도 새 이름으로
  try {
    const as = assignSheet_(), al = as.getLastRow();
    if (al >= 2) as.getRange(2, 1, al - 1, 1).getValues().forEach(function (v, i) { if (String(v[0]) === oldTitle) as.getRange(i + 2, 1).setValue(title + nick); });
  } catch (e) {}
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
  return raw.getRange(2, 1, last - 1, 1).getValues().map(function (x) { return x[0] instanceof Date ? x[0].getTime() : null; }).filter(function (t) { return t !== null; });
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
    t.getRange(2, 1, last - 1, 1).getValues().forEach(function (v) { if (v[0] instanceof Date) out.push(v[0].getTime()); });
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
  tabs.forEach(function (t) { rawHead_(t).forEach(function (x) { if (x && heads.indexOf(x) === -1) heads.push(x); }); });
  if (heads.length) sh.getRange(2, 1, 1, heads.length).setValues([heads]);
  props.setProperty('LISTV_' + id, '1');
  props.deleteProperty('LISTK_' + id); props.deleteProperty('LISTH_' + id);
  syncList_(ss);
}

// 명단 탭(값)에 새 응답만 아래에 붙임. 이미 넣은 줄은 절대 안 건드림 → 사장님·사용자가 체크칸을 넣고, 열·줄을 지우고, 고쳐도 유지
//  어느 응답을 넣었는지는 스크립트 속성 LISTK_<시트ID>(응답 시각)로 기억 → 지운 줄도 다시 안 생김
//  칸은 2행 머리글 글자로 찾아서 넣음(지운 칸은 안 채움, 다시 안 만듦). 폼에 새로 생긴 질문만 오른쪽 끝에 칸을 더함(LISTH_)
//  폼에서 지운 응답(취소 등)은 줄을 남기고 타임스탬프 칸 메모 + 회색 글자
function syncList_(ss) {
  const sh = ss.getSheetByName(LIST_TAB);
  if (!sh) return 0;
  const props = PropertiesService.getScriptProperties(), id = ss.getId();
  if (!props.getProperty('LISTV_' + id)) return 0;
  const tabs = ss.getSheets().filter(function (t) { return !!t.getFormUrl(); });
  if (!tabs.length) return 0;
  const heads = [], rows = [];
  tabs.forEach(function (t) {
    const lr = t.getLastRow(), h = rawHead_(t);
    h.forEach(function (x) { if (x && heads.indexOf(x) === -1) heads.push(x); });
    if (lr < 2 || !h.length) return;
    t.getRange(2, 1, lr - 1, h.length).getValues().forEach(function (x) {
      if (!(x[0] instanceof Date)) return;
      const o = {}; h.forEach(function (name, j) { o[name] = x[j]; });
      rows.push({ t: x[0].getTime(), o: o });
    });
  });
  rows.sort(function (a, b) { return a.t - b.t; });
  let lc = Math.max(sh.getLastColumn(), 1), hdr = sh.getRange(2, 1, 1, lc).getValues()[0].map(function (x) { return String(x).trim(); });
  let known = []; try { known = JSON.parse(props.getProperty('LISTH_' + id) || '[]'); } catch (e) {}
  if (!known.length) known = hdr.filter(Boolean);
  heads.filter(function (h) { return hdr.indexOf(h) === -1 && known.indexOf(h) === -1; }).forEach(function (h) {
    known.push(h);
    sh.getRange(2, Math.max(sh.getLastColumn(), 1) + 1).setValue(h);
    lc = Math.max(sh.getLastColumn(), 1); hdr = sh.getRange(2, 1, 1, lc).getValues()[0].map(function (x) { return String(x).trim(); });
  });
  props.setProperty('LISTH_' + id, JSON.stringify(known));
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
      above.forEach(function (v, j) { if (typeof v === 'boolean' && heads.indexOf(hdr[j]) === -1) sh.getRange(start, j + 1, n, 1).insertCheckboxes(); });
    }
    sh.getRange(start, 1, n, lc).setBackgrounds(add.map(function (x) {
      const day = Math.floor((x.t + 9 * 3600000) / 86400000) + 25569;
      return Array(lc).fill(DAY_COLORS[day % 7]);
    }));
    done = done.concat(add.map(function (x) { return String(x.t); }));
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

// 최근 30일 의뢰의 명단 시트도 값 명단으로 바꾸고 새 응답 붙이기 (15분 확인에서 안 보는 끝난 진행용, 시트마다 25분에 한 번)
function listTabsRecent_(runs, skip) {
  const cut = Date.now() - 30 * 86400000, ids = [];
  runs.forEach(function (r) { const sid = String(r['시트ID'] || ''); if (sid && !skip[sid] && ids.indexOf(sid) === -1 && r['진행일'] instanceof Date && r['진행일'].getTime() >= cut) ids.push(sid); });
  const props = PropertiesService.getScriptProperties();
  ids.forEach(function (sid) {
    if (late_(270)) return;
    const k = 'LISTAT_' + sid;
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
      try { if (hit.r['마감 시각']) form.setAcceptingResponses(false); } catch (e) {}
      note_('✓ 옛 폼 \'' + form.getTitle() + '\' 응답 ' + cnt + '개를 ' + bareTitle_(hit.r['명단 제목']) + ' 명단 시트로 가져옴');
      MailApp.sendEmail(me, '[체험단] 옛 폼 응답을 새 명단 시트로 가져왔어요: ' + bareTitle_(hit.r['명단 제목']),
        '카톡방에 옛 공지(옛 폼 링크)가 나가 있었던 것 같아요.\n옛 폼 \'' + form.getTitle() + '\'에 들어온 응답 ' + cnt + '개를 ' + bareTitle_(hit.r['명단 제목']) + ' 명단 시트로 연결했어요. 앞으로 옛 링크로 들어오는 응답도 이 명단 시트에 들어가고, 명단이 다 차면 같이 닫혀요.\n카톡방 공지는 새 공지(새 폼 링크)로 바꿔 두는 게 좋아요.');
    }
  }
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
    platform:document.getElementById('platform').value,desc:document.getElementById('desc').value,fname:window.__FNAME||'',k:window.__K||'',n:window.__N||'',opts:window.__OPTS||'',shop:window.__SHOP||'',slot:window.__SLOT||'',photo:window.__PHOTO||'',date:window.__DATE||'',plan:window.__PLAN||'',slot2:window.__SLOT2||'',day:window.__DAY||'',total:window.__TOTAL||'',room:window.__ROOM||'',croom:window.__CROOM||'',rv:window.__RV||''};
  if(!d.title){document.getElementById('msg').textContent='명단 제목을 넣어 주세요.';return;}
  document.getElementById('go').disabled=true;
  document.getElementById('msg').textContent='만드는 중이에요… (10~20초)';
  google.script.run.withSuccessHandler(function(r){
    document.getElementById('fields').style.display='none';
    document.getElementById('auto').textContent=(r.again?'이미 만든 진행이에요: ':'만들었어요: ')+d.title;
    if(r.notice){document.getElementById('notice').value=r.notice;}
    document.getElementById('listmsg').value=r.sheetUrl+'\\n\\n'+d.title;
    document.getElementById('done').style.display='block';
    document.getElementById('msg').textContent=(r.assign?r.assign+'\\n':'')+'\\n폼 응답자 링크:\\n'+r.formUrl+'\\n\\n시트: '+r.sheetUrl+'\\n폴더: '+r.folderUrl+'\\n\\n진행목록에도 기록했어요.';
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
  // 생성기 버튼으로 열면(auto=1) 값이 다 채워진 채로 바로 만들기 실행. 같은 요청ID는 한 번만 만들어짐
  const pre = '<script>window.__N=' + JSON.stringify(p.n || '') + ';window.__ROOM=' + JSON.stringify(p.room || '') + ';window.__DATE=' + JSON.stringify(p.date || '') + ';window.__SHOP=' + JSON.stringify(p.shop || '') + ';window.__OPTS=' + JSON.stringify(p.opts || '') + ';window.__SLOT=' + JSON.stringify(p.slot || '') + ';window.__PHOTO=' + JSON.stringify(p.photo || '') + ';window.__PLAN=' + JSON.stringify(p.plan || '') + ';window.__SLOT2=' + JSON.stringify(p.slot2 || '') + ';window.__DAY=' + JSON.stringify(p.day || '') + ';window.__TOTAL=' + JSON.stringify(p.total || '') + ';window.__CROOM=' + JSON.stringify(p.croom || '') + ';window.__RV=' + JSON.stringify(p.rv || '') + ';window.__AUTO=' + (p.auto === '1' && p.title ? 'true' : 'false') + ';</' + 'script>';
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
  return locked_(function () {
    // 이미 만든 진행(같은 요청ID, 또는 생성기를 다시 열어 같은 방제로 누름)이면 새로 안 만들고
    //  공지에 살 사람 이름이 있으면 배정 저장 + 폼 설명·안 보낸 방 공지를 이름 넣은 공지로
    const run = (d.n && runByRequest_(d.n)) || runByTitle_(d);
    if (run) {
      const prev = againResult_(run);
      prev.assign = autoAssign_(run, d.desc);
      if (prev.assign) { try { prev.notice = refreshNotice_(run, d) || prev.notice; } catch (e) { note_('공지 다시 넣기 실패: ' + e); } }
      return prev;
    }
    const res = createRunInner_(d);
    const made = d.n ? runByRequest_(d.n) : null;
    res.assign = made ? autoAssign_(made, d.desc) : '';
    return res;
  }, 60000);
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
  if (last >= 2) ob.getRange(2, 1, last - 1, 6).getValues().forEach(function (v, i) { if (String(v[3]) === room && v[2] === '방 공지' && v[5] !== '보냄') ob.getRange(i + 2, 5).setValue(notice); });
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
  try { ensureEditTab_(); } catch (e) { note_('폼수정 탭 갱신 실패: ' + e); }
  try { buildDashboard_(true); } catch (e) { note_('한눈에 탭 실패: ' + e); }
  try { ensureCheckTrigger_(); } catch (e) { note_('마감 확인 트리거 실패: ' + e); }

  // 공지의 '(구글폼 링크)' 자리에 폼 링크를 넣어서 폼 설명과 카톡 공지를 한 번에 완성
  const fruit0 = d.fruit || (reuse && chainFruit_(reuse));
  const notice = withSlotLine_(String(d.desc || '').split('(구글폼 링크)').join(formUrl), d.slot, fruit0);
  if (notice) form.setDescription(formDesc_(notice));
  try { fixFormQuestions_(form); } catch (e) { note_('폼 질문 필수/선택 실패: ' + e.message); }
  if (notice && d.room) queueMsg_(d.room, notice, '방 공지');
  // 여러 날 진행이면 다음 일차 계획 저장 (공지는 폼 링크 넣기 전 원본을 템플릿으로)
  if (d.plan) { try { savePlan_(d); } catch (e) { note_('일정 저장 실패: ' + e); } }
  try { updatePay_(); } catch (e) { note_('월급시트 갱신 실패: ' + e); }
  const r = list.getLastRow();
  if (d.realship) list.getRange(r, 1, 1, LIST_HEADER.length).setBackground('#fff2a8');
  if (d.takdae) list.getRange(r, lc_('택배 옮김')).insertCheckboxes();
  sortList_();

  // 생성기가 넘긴 리뷰 정보(상품별 리뷰 종류·개수, 리뷰 안내, 공지 종류)를 의뢰(명단 시트)마다 저장 → 리뷰 배정 페이지가 씀
  if (d.rv) { try { const pk = 'RV_' + ss.getId(), pr = PropertiesService.getScriptProperties(); if (!pr.getProperty(pk)) pr.setProperty(pk, String(d.rv).slice(0, 8000)); } catch (e) {} }
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
  sh.getRange(2, 1, 1, head.length).setValues([head]);
  vprops.setProperty('LISTV_' + ss.getId(), '1');
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

  // 계좌, 예금주 열 숨기기 (실배송이면 리뷰비 열도)
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
const NORM = function (r) { return 'LOWER(REGEXREPLACE(TO_TEXT(' + r + '),"\\s",""))'; };

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
    'SUMPRODUCT(ISNUMBER(t)*(t>=' + day(info.from) + ')*(t<' + day(info.to) + ')*(ARRAYFORMULA(' + NORM('nk') + ')=' + NORM('$B' + row) + ')*' +
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
//  이름(타) = 타계정(다른 사람 계정으로 구매). 닉네임은 그 사람 것이라 표시만 빼고 그대로 셈
//  옵션 줄 바로 아래 줄에 이름만 있어도 읽음
// 돌려주는 줄: [닉네임, 공지 옵션(가이드 여럿이면 상품명 붙임), 계정수, 폼 보기(맞는 게 없으면 빈칸), 가격]
function parseAssign_(text, choices) {
  // 띄어쓰기 있는 닉네임은 대괄호로 묶어 한 사람: [시묘 심효진] (U+2060으로 잠깐 붙였다가 이름에서 다시 띄어 씀)
  text = String(text || '').replace(/\[([^\]\n]{1,20})\]/g, function (m, g) { return g.trim().replace(/\s+/g, '\u2060'); });
  const k = function (x) { return String(x || '').toLowerCase().replace(/[\s\u2060]+/g, ''); };
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
    String(names).replace(/\(\s*타\s*(?:계정|아이디)?\s*\)/g, '').replace(/\(\s*취소\s*\)/g, '#취소').replace(/[()\[\],·\/]/g, ' ').split(/\s+/).forEach(function (tok) {
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
    const firstBird = all.findIndex(function (l) { return /🐥/.test(l); });
    const nameTok = /^@?[A-Za-z가-힣][^\s\d:!?~]{0,11}\d?$/;
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
  if (!rows.length) namesOnly();
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
  let ran = false;
  globalThis.__ORI_T0 = Date.now();
  // 0시대에는 폼 열기를 잠금 없이 먼저 (15분 확인이 마침 돌고 있어 잠금을 못 잡아도 0시에 바로 열리게)
  try { if (Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'H') === '0') openStartingForms_(readRuns_(), outboxRows_()); } catch (e) { note_('0시 폼 열기 실패: ' + e); }
  locked_(function () { ran = true; try { checkFullInner_(); } catch (e) { note_('멈춤: ' + (e && e.message || e)); } }, 120000);
  report_('자동 확인', ran);
}

// 한눈에 Q1에 지금 어디까지 했는지 (6분 제한에 걸려 멈추면 ⏳가 그대로 남아서 알 수 있게)
function step_(what) {
  const now = Date.now(), st = globalThis.__ORI_STEPS = globalThis.__ORI_STEPS || [];
  if (st.length) st[st.length - 1].s = Math.round((now - st[st.length - 1].t) / 1000);
  st.push({ w: what, t: now, s: 0 });
  try {
    const d = adminSs_().getSheetByName(DASH_TAB);
    if (d) d.getRange(1, 17).setValue('⏳ ' + Utilities.formatDate(new Date(globalThis.__ORI_T0 || Date.now()), CONFIG.TIMEZONE, 'HH:mm') + ' 확인 중: ' + what).setFontColor('#9a6700');
  } catch (e) {}
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
  const forms = {}, now = Date.now(), live = {};
  runs.forEach(function (r) { if (r['진행 상태'] !== '종료' && r['폼ID']) (forms[r['폼ID']] = forms[r['폼ID']] || []).push(r); });
  // 받는 중인 진행의 폼 + 그 진행 공지에 들어간 폼은 열어 둠
  runs.forEach(function (r) {
    if (r['진행 상태'] === '종료' || !r['폼ID'] || r['마감 시각']) return;
    const w = windowOf_(runs, r);
    if (now >= w.from && !runOver_(runs, r, now)) runFormIds_(r, runs, msgs).forEach(function (fid) { live[fid] = 1; });
  });
  Object.keys(forms).forEach(function (fid) {
    if (live[fid]) return;
    try {
      const f = FormApp.openById(fid);
      const next = forms[fid].filter(function (r) { return r['진행일'] instanceof Date && dayStart_(r['진행일']) > now; }).sort(function (a, b) { return a['진행일'] - b['진행일']; })[0];
      if (f.isAcceptingResponses()) { f.setAcceptingResponses(false); note_('✓ 폼 닫음: ' + bareTitle_(forms[fid][0]['명단 제목']) + (next ? ' (' + Utilities.formatDate(next['진행일'], CONFIG.TIMEZONE, 'M/d') + ' 0시에 다시 열림)' : '')); }
    } catch (e) { note_('폼 닫기 실패 ' + bareTitle_(forms[fid][0]['명단 제목']) + ': ' + e.message); }
  });
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
  try { makeDueDays_(); } catch (e) { note_('다음 일차 만들기 실패: ' + e); }
  try { fixWeekendOnce_(); } catch (e) { note_('주말 진행 정리 실패: ' + e); }
  try { autoNextDay_(); } catch (e) { note_('다음 날 진행 만들기 실패: ' + e); }
  const me = Session.getEffectiveUser().getEmail();
  const props = PropertiesService.getScriptProperties();
  let changed = false;
  // 빨리 끝나고 꼭 해야 하는 것 먼저 (뒤에서 시간이 모자라도 이건 되게)
  step_('보낼메시지, 폼 닫기');
  try { tidyOutbox_(); } catch (e) { note_('보낼메시지 정리 실패: ' + e); }
  try { const rr = readRuns_(), mm = outboxRows_(); closeIdleForms_(rr, mm); openStartingForms_(rr, mm); } catch (e) { note_('폼 열고 닫기 실패: ' + e); }
  try { ensureMidnightTrigger_(); } catch (e) { note_('0시 확인 예약 실패: ' + e); }
  step_('공지 모양');
  try { fixStyleOnce_(); } catch (e) { note_('공지 모양 정리 실패: ' + e); }
  const runs = readRuns_(), times = {};
  step_('알림');
  try { fruitCheck_(runs); } catch (e) { note_('안 산 사람 확인 실패: ' + e); }
  try { takbaeCheck_(runs); } catch (e) { note_('택배시트 알림 실패: ' + e); }
  try { photoWaitCheck_(runs); } catch (e) { note_('포토대기 알림 실패: ' + e); }
  try { fixOct16Once_(); } catch (e) { note_('10.16 정리 실패: ' + e); }
  try { fixNamesOnce_(); } catch (e) { note_('공지 이름 정리 실패: ' + e); }
  try { fixTaOnce_(); } catch (e) { note_('배정 (타) 정리 실패: ' + e); }
  try { fixGogumaAssignOnce_(); } catch (e) { note_('고구마말랭이 배정 옮기기 실패: ' + e); }
  try { reloadEditTabOnce_(); } catch (e) { note_('폼수정 탭 다시 불러오기 실패: ' + e); }
  try { fixModuAssignOnce_(); } catch (e) { note_('모두의농수산 배정 옮기기 실패: ' + e); }
  try { fixTemplateOnce_(); } catch (e) { note_('템플릿 폼 질문 고치기 실패: ' + e); }
  try { fixNoCountNamesOnce_(runs); } catch (e) { note_('이름 인원 수 빼기 실패: ' + e); }
  try { dropManualColsOnce_(runs); } catch (e) { note_('송장번호·실배송 칸 지우기 실패: ' + e); }
  try { ensureListMsgs_(runs); } catch (e) { note_('명단 전달 확인 실패: ' + e); }
  try { adoptOrphanForms_(runs); } catch (e) { note_('진행목록에 없는 폼 확인 실패: ' + e); }
  const errs = {}, listed = {};
  step_('폼 인원');
  try { ensureSubmitTriggers_(runs); } catch (e) { note_('응답 트리거 실패: ' + e); }
  runs.forEach(function (r) {
    if (r['진행 상태'] === '종료' || !r['폼ID']) return;
    // 어제 이전에 끝난 진행은 15분마다 안 봄 (폼을 열 때마다 느리고 구글 쪽 시간 초과가 남. 인원은 매일 9시 현황 업데이트가 다시 셈)
    if (r['진행일'] instanceof Date && r['진행일'] < today_() && runOver_(runs, r)) return;
    // 진행 하나에서 오류가 나도 다른 진행은 계속 (오류는 한눈에 탭 '확인 필요' 칸에 보임)
    try { checkRun_(r); } catch (e) { errs[r['명단 제목']] = String(e.message || e).slice(0, 120); note_('진행 확인 실패 ' + r['명단 제목'] + ': ' + e); }
  });
  // 폼을 다 연결한 뒤 명단 탭이 그 시트의 모든 폼 응답을 합쳐 보여 주게
  step_('명단 시트');
  Object.keys(listed).forEach(function (id) {
    try {
      const lss = SpreadsheetApp.openById(id);
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
  try { dropReviewTabsOnce_(runs); } catch (e) { note_('리뷰체크 탭 지우기 실패: ' + e); }
  step_('명단 탭(지난 의뢰)');
  try { listTabsRecent_(runs, listed); } catch (e) { note_('지난 명단 탭 실패: ' + e); }
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
    if (r['진행일'] instanceof Date && r['진행일'] >= today_()) {
      try { if (ensureNickQuestion_(form)) note_('✓ ' + bareTitle_(r['명단 제목']) + ' 폼에 닉네임 질문 넣음'); } catch (e) { note_(bareTitle_(r['명단 제목']) + ' 닉네임 질문 실패: ' + e.message); }
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
    // 진단: 폼 응답 수 / 명단 시트 응답 탭 수 / 명단 탭에 보이는 수 (그날 몫)가 다르면 한눈에 '확인 필요' 칸에 적음
    if (!errs[r['명단 제목']] && n > 0) {
      try {
        const inW = function (t) { return t >= w.from && t < w.to; };
        const sheetN = allRespTimes_(r['시트ID']).filter(inW).length;
        const lt = SpreadsheetApp.openById(r['시트ID']).getSheetByName(MERGE_TAB);
        const listN = lt && lt.getLastRow() >= 3 ? lt.getRange(3, 1, lt.getLastRow() - 2, 1).getValues().filter(function (x) { return x[0] instanceof Date && inW(x[0].getTime()); }).length : 0;
        if (sheetN !== n || listN !== n) errs[r['명단 제목']] = '응답 수가 안 맞아요: 폼 ' + n + ' / 응답 탭 ' + sheetN + ' / 합본 ' + listN + (lt ? ' (합본 A3: ' + String(lt.getRange('A3').getFormula()).slice(0, 60) + ')' : ' (합본 탭 없음)');
      } catch (e) { errs[r['명단 제목']] = '응답 수 확인 실패: ' + e.message; }
    }
    if (!r['목표인원'] || r['마감 시각'] || n < Number(r['목표인원'])) return;
    form.setAcceptingResponses(false);
    // 옛 공지 링크로 받던 폼(가져온 폼)도 같이 닫음
    String(props.getProperty('ORPHANS_' + r['시트ID']) || '').split(',').filter(Boolean).forEach(function (fid) { try { FormApp.openById(fid).setAcceptingResponses(false); } catch (e) {} });
    setRun_(r.row, '마감 시각', new Date());
    changed = true;
    const listMsg = queueListMsgs_(r);
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
  // 월급시트도 15분마다 같이 갱신 (계약 수량 링크, 총액, 그날 수량)
  step_('월급시트');
  try { updatePay_(); } catch (e) { note_('월급시트 갱신 실패: ' + e); }
  // 급하지 않은 정리는 시간이 남을 때만 (6분 넘으면 구글이 중간에 끊음)
  if (late_(240)) { note_('✓ 시간이 모자라 시트 정리는 다음 확인 때'); return; }
  step_('정리');
  try { cleanListSheetsOnce_(readRuns_()); } catch (e) { note_('명단 시트 표시 정리 실패: ' + e); }
  try { refreshAssignFormulasOnce_(readRuns_()); } catch (e) { note_('배정 수식 갱신 실패: ' + e); }
  try { ensureEditTab_(); } catch (e) { note_('폼수정 탭 만들기 실패: ' + e); }
}

// 명단방 형식 (사장님 예시): 시트 링크 → 빈 줄 → 명단 제목. 업체방에도
function queueListMsgs_(r, onlyWithRoom) {
  const listMsg = r['시트 링크'] + '\n\n' + r['명단 제목'];
  queueMsg_(CONFIG.ROOM_LIST, listMsg, '명단 전달');
  if (!onlyWithRoom || String(r['업체방'] || '').trim()) queueMsg_(r['업체방'], listMsg + '\n오늘 명단입니다. 실시간 시트에서 확인 부탁드립니다!', '업체 명단');
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
    const want = r['시트 링크'] + '\n\n' + r['명단 제목'];
    let found = false;
    v.forEach(function (x, i) {
      if (x[2] !== '명단 전달') return;
      const t = String(x[4]).split('\n').filter(function (l) { return l.trim(); }).pop() || '';
      if (!sameRunTitle_(t, r['명단 제목'])) return;
      found = true;
      if (x[5] === '대기' && String(x[4]) !== want) ob.getRange(i + 2, 5).setValue(want);
    });
    if (!found) { queueListMsgs_(r, true); note_('✓ 명단 전달 메시지 넣음: ' + bareTitle_(r['명단 제목'])); }
  });
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
  // 보낼 것(대기) 줄은 노랑 + 상태 칸 주황, 보낸 건 회색 글씨
  const all = sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), 6);
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$F2="대기"').setBackground('#fff2cc').setRanges([all]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$F2="방 못 찾음"').setBackground('#f8c9c4').setRanges([all]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$F2="보냄"').setFontColor('#9e9e9e').setRanges([all]).build()
  ]);
  sh.getRange(2, 6, last - 1, 1).setFontWeight('bold').setHorizontalAlignment('center');
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
  if (last >= 2) ob.getRange(2, 1, last - 1, 6).getValues().forEach(function (v, i) { if (String(v[3]) === room && v[2] === '방 공지' && v[5] !== '보냄') ob.getRange(i + 2, 5).setValue(notice); });
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
    if (v[2] === '방 공지' && v[5] !== '보냄' && rooms[String(v[3])]) { const nm = stripTrailingNames_(String(v[4])); if (nm !== String(v[4])) ob.getRange(i + 2, 5).setValue(nm); }
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
  const titles = readRuns_().filter(function (r) { return r['진행 상태'] !== '종료' && r['시트ID']; }).map(function (r) { return String(r['명단 제목']); }).reverse();
  sh.getRange('B1').setDataValidation(titles.length ? SpreadsheetApp.newDataValidation().requireValueInList(titles, true).setAllowInvalid(true).build() : null);
  const has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'onAdminEdit'; });
  if (!has) ScriptApp.newTrigger('onAdminEdit').forSpreadsheet(ss).onEdit().create();
  return sh;
}

function onAdminEdit(e) {
  if (e && e.response) return onRunSubmit_(e);   // 폼 제출 트리거도 이 이름으로 받음 (로더에 이미 있는 이름이라)
  if (!e || !e.range) return;
  // 한눈에 탭 '진행 도우미' 체크 → 시트 오른쪽에 진행 도우미 (새 탭 없이)
  if (e.range.getSheet().getName() === DASH_TAB && e.range.getColumn() === 1 && String(e.range.getRow()) === PropertiesService.getScriptProperties().getProperty('DASH_BAR_ROW')) {
    if (String(e.value).toUpperCase() !== 'TRUE') return;
    e.range.setValue(false);
    try { showToolsSidebar_(); } catch (err) { e.range.getSheet().getRange(e.range.getRow(), 2).setValue('도우미 열기 실패: ' + err.message + ' → 옆 링크로 열어 주세요'); }
    return;
  }
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
  want.slice(0, 14).forEach(function (id) {   // 트리거는 계정당 20개까지 (15분·9시·편집·0시 예약 포함)
    if (have[id]) return;
    try { ScriptApp.newTrigger('onAdminEdit').forForm(id).onFormSubmit().create(); } catch (e) { note_('폼 트리거 만들기 실패 ' + id + ': ' + e); }
  });
}

// 폼이 제출되면: 그 폼 진행들의 인원 → 월급시트, 한눈에 탭. 다 찼으면 마감 확인까지
function onRunSubmit_(e) {
  // 다른 작업 중이면 20초 기다리고, 그래도 바쁘면 15분 확인이 이어서 함
  return locked_(function () {
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
    try { updatePay_(); } catch (err) { note_('월급시트 갱신 실패: ' + err); }
    try { buildDashboard_(false); } catch (err) {}
    if (full) checkFull();
  }, 20000);
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

function assignRun_(r, text) {
  const note = '';
  const info = rawInfo_(r['시트ID'], r['폼ID']);
  let choices = [];
  try { choices = formChoices_(r['폼ID'] ? FormApp.openById(r['폼ID']) : formOf_(info.raw)); } catch (e) {}
  globalThis.__CHOICES = choices;
  const rows = parseAssign_(text, choices);
  if (!rows.length) return '이름을 못 찾았어요. 옵션 줄 뒤나 아래 줄에 이름을 띄어쓰기로 적어 주세요.';
  writeAssign_(r, rows);
  const warn = assignWarn_(text, rows);
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
function autoNextDay_() {
  if (Number(Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'H')) < (Number(CONFIG.NEXT_DAY_HOUR) || 10)) return;
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
    const planned = c.runs.reduce(function (a, x) { return a + (x['진행일'] < today_() ? (Number(x['인원']) || 0) : (Number(x['목표인원']) || 0)); }, 0);
    const left = c.total - planned;
    if (left <= 0) return;
    const daily = Number(c.runs[0]['목표인원']) || Number(last['목표인원']) || left;
    note_('✓ 다음 날 진행: ' + addMoreRun_(last, Math.min(daily, left), { next: true }));
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
  const room = roomOld.replace(/\d{1,2}\.\d{1,2}/, md).replace(/\d+\s*$/, String(n));
  const form = FormApp.openById(r['폼ID']);
  // 모자란 옵션별 인원 = 배정에서 안 산 계정 + 취소한 사람 (배정이 없으면 옵션 인원은 비워 둠)
  const short = opt.next ? {} : shortByOption_(readRuns_(), r);
  const sum = Object.keys(short).reduce(function (a, o) { return a + short[o]; }, 0);
  const desc = String(form.getDescription() || '');
  // 새로 모집하는 공지라 옵션 줄 뒤의 이름(어제 사람)은 지움
  const notice = stripTrailingNames_(sum ? noticeForMore_(desc, short) : desc.split('\n').map(function (l) { return l.replace(/(\(\s*\d*\s*명\s*\)|\d+\s*명).*$/, '(  명)'); }).join('\n'));
  if (sum && !n) n = sum;
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
      '카톡방을 이 방제로 만들고 아래 공지를 올리세요. 보낼 메시지함에도 들어가 있어요. 옵션이 여러 개면 옵션 인원 (  명)은 채워 주세요.',
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
function fixFormQuestions_(form) {
  const T = FormApp.ItemType;
  let n = 0;
  form.getItems().forEach(function (it) {
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

// 실배송이면 방제·명단 제목·명단 시트 이름에 '실' (예: #10.19 런치버스미니텀블러 실 7 (뽀짝오리))
function withSil_(t) {
  t = String(t || '');
  if (/(^|\s)실(배송)?(\s|\d|$)/.test(bareTitle_(t))) return t;
  return t.replace(/\s*(\d+)(\s*\([^)]*\))?\s*$/, ' 실 $1$2');
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
      if (nm !== String(m.v[4])) { ob.getRange(m.i + 2, 5).setValue(nm); m.v[4] = nm; note_('✓ ' + room + ' 공지 고침'); }
    });
    // 폼 옵션 질문이 '단일옵션' 하나뿐인데 공지 옵션이 여러 개면 옵션별로 나눔 (옵션 나누기 전에 만든 폼)
    try {
      const fo = FormApp.openById(r['폼ID']);
      if (formChoices_(fo).length <= 1) {
        const labs = optionLabels_(mine.length ? String(mine[0].v[4]) : (fo.getDescription() || ''));
        if (labs.length >= 2) { setOptionChoices_(fo, labs.join('\n')); note_('✓ ' + room + ' 폼 옵션 ' + labs.length + '개로 나눔'); }
      }
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
  msgs.forEach(function (v, i) { if (v[2] === '방 공지' && v[5] !== '보냄') { const nm = noticeStyle_(String(v[4]), false); if (nm !== String(v[4])) ob.getRange(i + 2, 5).setValue(nm); } });
}

// 공지에서 옵션 보기 목록 (가이드 여럿이면 상품 이름 붙임, 옵션마다 가격이 다르면 '(17,200원)') — 옵션 줄 'X (N명)', 'X N명', 'X (  명)'
function optionLabels_(text) {
  // 공지 읽기(parseAssign_)를 그대로 쓰려고 옵션 줄 끝에 가짜 이름을 붙여서 읽음
  const t = String(text || '').split('\n').map(function (l) { return /(\(\s*\d*\s*명\s*\)|\d+\s*명)/.test(l) && !/가격|★|http/.test(l) ? l + ' 가' : l; }).join('\n');
  const out = [], xs = parseAssign_(t, []).filter(function (x) { return x[1]; });
  // 옵션 가격이 다 같으면 가격은 빼고 옵션(색상 등)만 (사용자 요청 10/18)
  const same = xs.every(function (x) { return x[4] === xs[0][4]; });
  xs.forEach(function (x) {
    const lab = x[1] + (x[4] && !same ? ' (' + Number(x[4]).toLocaleString('ko-KR') + '원)' : '');
    if (out.indexOf(lab) === -1) out.push(lab);
  });
  return out;
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
  const parts = String(desc).split(/(\n\s*-{5,}\s*\n)/);
  const multi = parts.length > 1;
  const kept = [];
  for (let i = 0; i < parts.length; i += 2) {
    const prod = multi ? (noticeProducts_(parts[i])[0] || {}).name || '' : '';
    let total = 0, header = -1;
    const lines = parts[i].split('\n'), out = [];
    for (let j = 0; j < lines.length; j++) {
      const t = lines[j];
      const m = t.match(/^(\s*(?:\d+\)\s*)?(?:🐥\s*옵션\s*[:：]?\s*)?)(.*?)\s*(?:\(\s*\d*\s*명\s*\)|\d+\s*명)(.*)$/);   // (3명), (  명), 3명
      if (!m) { out.push(t); continue; }
      const opt = m[2].trim();
      if (!opt) { header = out.length; out.push(t); continue; }   // '1) 5명' 가이드 머리
      if (/가격|원$/.test(opt)) { out.push(t); continue; }
      const c = want[k([prod, opt].filter(Boolean).join(' '))] || want[k(opt)] || 0;
      if (!c) { if (/^\s*🐥\s*가격/.test(lines[j + 1] || '') && ((lines[j + 1].match(/\d{1,3}(?:,\d{3})+|\d{4,}/g) || []).length === 1)) j++; continue; }
      total += c;
      out.push(m[1] + opt + (/\(\s*\d*\s*명/.test(t) ? ' (' + c + '명)' : ' ' + c + '명'));   // 원래 모양 그대로 (N명) 또는 N명
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
// 포토대기 진행: 리뷰 기한(배송완료 후 7일)이 있어서 사진을 오래 기다리면 리뷰가 몰림 → 진행 2일 뒤부터 매일 한 번 '업체 사진 왔는지 사장님께 물어보세요' 메일
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
  try { buildDashboard_(false); } catch (e) {}
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
  // 다음 일차 공지 틀에는 오늘 살 사람 이름을 빼고 저장 (화이트 (2명) 김민희 → 화이트 (2명))
  const tpl = stripTrailingNames_(String(d.desc || '').split('\n').map(function (l) { return l.replace(/(\(\s*\d*\s*명\s*\)).*$/, '$1'); }).join('\n'));
  const cfg = JSON.stringify({ type: d.type, takdae: !!d.takdae, realship: !!d.realship, platform: d.platform, prices: d.prices,
    croom: d.croom, shop: d.shop, photo: d.photo, opts: d.opts, desc: tpl, slot2: d.slot2 || '자정 ~ 오전 8시 20분 구매', total: d.total, camp: camp, base: d.n });
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
    b = b.replace(/\(\s*\d*\s*명\)/g, function () { const v = (c[1] || [])[k++]; return '(' + (v === undefined || v === null ? '  ' : v) + '명)'; });
    // 리뷰 종류를 날마다 고르게 나눈 줄 (생성기가 일차마다 계산해서 넘김)
    if (c[2]) b = b.replace(/^(🐥)?리뷰 배정 *:.*$/m, function (m0, d) { return (d || '') + '리뷰 배정 : ' + c[2]; });
    return b;
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
    // 이 계획을 만든 1일차 진행(요청ID)의 의뢰로 (같은 이름의 다른 의뢰서와 섞이지 않게)
    const baseRun = cfg.base ? runs.filter(function (r) { return String(r['요청ID']) === String(cfg.base); })[0] : null;
    const chain = baseRun ? chainsOf_(runs).filter(function (c) { return c.runs.indexOf(baseRun) >= 0; })[0]
      : chainsOf_(runs).filter(function (c) { return c.key === ck; }).pop();
    if (chain && chain.total && chain.done >= chain.total) { sh.getRange(i + 2, 9).setValue('건너뜀 (이미 다 진행)'); return; }
    if (chain && chain.runs.some(function (r) { return r['진행일'] instanceof Date && Utilities.formatDate(r['진행일'], CONFIG.TIMEZONE, 'yyyyMMdd') === Utilities.formatDate(new Date(x[3]), CONFIG.TIMEZONE, 'yyyyMMdd'); })) { sh.getRange(i + 2, 9).setValue('건너뜀 (그날 진행 있음)'); return; }
    const prev = chain ? chain.runs[chain.runs.length - 1] : null;
    // 계획 날짜가 주말·공휴일이면 다음 진행일로 미룸 (방제·명단 제목 날짜도)
    const day0 = new Date(x[3]), dayW = workdayOnOrAfter_(day0);
    if (dayW.getTime() !== dayStart_(day0)) {
      x[3] = dayW; x[4] = retitleDate_(x[4], dayW); x[5] = retitleDate_(x[5], dayW);
      sh.getRange(i + 2, 4, 1, 3).setValues([[dayW, x[4], x[5]]]);
    }
    // 앞 진행일 오전 10시(NEXT_DAY_HOUR)부터 만듦 (월요일 진행이면 금요일 10시)
    const due = new Date(dayW); due.setHours(12, 0, 0, 0);
    do { due.setDate(due.getDate() - 1); } while (!isWorkday_(due));
    due.setHours(CONFIG.NEXT_DAY_HOUR, 0, 0, 0);
    if (!((prev && prev['마감 시각']) || now >= due)) return;
    locked_(function () {
      if (findRunByRequest_(x[0])) { sh.getRange(i + 2, 9).setValue('생성됨'); return; }
      const dateIso = Utilities.formatDate(new Date(x[3]), CONFIG.TIMEZONE, 'yyyy-MM-dd');
      const desc = adjustNotice_(cfg.desc, JSON.parse(x[7]), cfg.slot2);
      const res = createRunInner_({
        k: CONFIG.KEY, n: x[0], title: x[5], room: x[4], fname: x[4], camp: cfg.camp, day: k, total: cfg.total,
        daily: String(x[6]), date: dateIso, desc: desc, type: cfg.type, takdae: cfg.takdae, realship: cfg.realship,
        platform: cfg.platform, prices: cfg.prices, croom: cfg.croom, opts: cfg.opts, shop: cfg.shop, photo: cfg.photo, slot: cfg.slot2,
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
  const byName = ss.getSheets().filter(function (s) { if (!new RegExp('(^|\\D)' + month + '월').test(s.getName())) return false; const y = tabYear_(s); return y === null || y === want; })[0];
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
function tabYear_(sh) {
  const memo = globalThis.__TABYEAR = globalThis.__TABYEAR || {};
  if (memo[sh.getSheetId()] !== undefined) return memo[sh.getSheetId()];
  let y = null;
  try {
    const v = sh.getRange(1, 1, Math.min(Math.max(sh.getLastRow(), 1), 5), Math.min(Math.max(sh.getLastColumn(), 1), 120)).getValues();
    v.some(function (row) { return row.some(function (x) { if (x instanceof Date) { y = x.getFullYear(); return true; } return false; }); });
  } catch (e) {}
  return (memo[sh.getSheetId()] = y);
}

// 새 달 탭: 지난달 탭 복사 → 이름의 달 바꾸기 → 줄 내용 비우기(수식은 두고, 남은·상태 수식은 원래 모양으로, 완료보고 체크 해제) → 날짜 칸을 새 달 1일부터
function newMonthTab_(ss, month) {
  const prevM = (month + 10) % 12 + 1;
  const src = payTab_(prevM, true);
  if (!src || !new RegExp('(^|\\D)' + prevM + '월').test(src.getName())) return null;
  const year = payYear_(month);
  let name = src.getName().replace(new RegExp('(^|\\D)' + prevM + '월'), function (m, a) { return a + month + '월'; });
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
    // 총액 = 의뢰서 총 구매 건수(날마다 같음). 남은 = 총액 - 전월 - 그날 수량 - 이번 달 앞 날들 수량 (남은 칸 수식에 앞 날들 수를 빼 줌)
    const earlier = mine.filter(function (x) { return x['진행일'] < r['진행일'] && ym(x['진행일']) === ym(r['진행일']); }).reduce(function (a, x) { return a + got(x); }, 0);
    writePayRow_(r, nameOf(r), total, prev, siblings_(all, r).length > 1,
      { store: pick('업체'), time: fruit ? '자정 ~ 오전 7시' : payTime_(runSlot_(r)), photo: pick('포토'), earlier: earlier });
  });
  try { payStatusAll_(all); } catch (e) { note_('월급시트 상태 잇기 실패: ' + e); }
  try { payRate_(); } catch (e) { note_('월급시트 진행비 500원 바꾸기 실패: ' + e); }
  // 이번 달 탭(없으면 만듦)과 이미 있는 다음 달 탭에 안 끝난 캠페인 이월 줄
  try { const m0 = new Date().getMonth() + 1; payTab_(m0); payCarry_(all, m0); payCarry_(all, m0 % 12 + 1); } catch (e) { note_('월급시트 이월 실패: ' + e); }
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
    if (c.runs.length < 2) return;
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
  put(col, Number(r['인원']) || 0);
  return { sh: sh, row: row, L: L };
}

// 상태 칸: 의뢰가 다 끝나면(마지막 날 줄의 남은 = 0) 앞 날 줄도 '완료' (사용자 요청 10/18)
//  사용자 수식 =IF(H5=0,"시작전",IF(N5=0,"완료",…))의 완료 조건만 IF(OR(N5=0,N마지막=0),"완료",…)로 바꿈. 마지막 날 줄은 원래 모양
function payStatusLink_(rows) {
  if (!rows.length) return;
  const last = rows[rows.length - 1];
  // 의뢰가 다 끝나면(마지막 날 남은 = 0) 그 의뢰 모든 날 '완료보고' 체크 → 진행비(=완료보고 × 수량)가 들어감
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
const DASH_VER = '15';   // 모양을 바꾸면 올려서 다시 만들게 함

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
  const runs = allRuns.filter(function (r) { return r['진행 상태'] !== '종료' && r['시트ID']; })
    .sort(function (a, b) { return (b['진행일'] || 0) - (a['진행일'] || 0); });
  const props = PropertiesService.getScriptProperties();
  const ss = adminSs_();
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
  // 덩어리 줄 수는 지금 인원 + 여유 5줄 (넘칠 것 같으면 다시 만듦). 빈칸이 너무 길지 않게
  order.forEach(function (id) {
    const x = sheets[id];
    const goal = Number(x.runs[0]['목표인원']) || 0;
    x.n = Math.max(Math.ceil((x.count + 5) / 5) * 5, 6);   // 5줄 단위라 응답 몇 개마다만 다시 만듦
    if (goal) x.n = Math.min(x.n, Math.max(goal + 3, x.count + 2));
  });
  const sig = DASH_VER + '|' + props.getProperty('RUN_ERRORS') + '|' + order.map(function (id) { return id + ':' + sheets[id].n; }).join(',') + '|' + runs.map(function (r) { return r['시트ID'] + ':' + r['목표인원'] + ':' + r['진행 상태'] + ':' + r['진행일'] + ':' + r['택배 옮김']; }).join('|');
  let sh = ss.getSheetByName(DASH_TAB);
  // 한눈에 탭에서 방제를 직접 고쳐 둔 게 있으면 다시 만들기 전에 진행목록에 반영
  //  (지난번에 스크립트가 적은 값과 다를 때만 = 한눈에서 직접 고친 것. 진행목록에서 고친 걸 옛 값으로 되돌리지 않게)
  let written = [];
  try { written = JSON.parse(props.getProperty('DASH_TITLES') || '[]'); } catch (e) {}
  if (sh && sh.getLastRow() >= 2) {
    let changed = false;
    sh.getRange(2, 2, Math.min(sh.getLastRow() - 1, 60), 1).getValues().forEach(function (v, i) {
      const t = String(v[0]).trim();
      if (!t || t.charAt(0) === '■' || t === written[i]) return;
      const r = runs.filter(function (x) { return sameRunTitle_(x['명단 제목'], t) && bareTitle_(x['명단 제목']) !== t; })[0];
      if (r && renameRun_(r, t)) changed = true;
    });
    if (changed) { force = true; try { updatePay_(); } catch (e) {} }
  }
  // 남은·신청 칸이 날짜로 보이지 않게 숫자 서식은 매번 (다시 만들지 않을 때도)
  if (sh && runs.length) { try { sh.getRange(2, 4, runs.length, 4).setNumberFormat('0'); } catch (e) {} }
  if (!force && sh && props.getProperty('DASH_SIG') === sig) return;
  order.forEach(function (id) { grantImport_(ss.getId(), sheets[id].sid); });
  if (!sh) sh = ss.insertSheet(DASH_TAB, 0);
  // 1행은 글자만 지우고 서식은 둠 (직접 칠한 색이 안 풀리게)
  sh.getRange(1, 1, 1, sh.getMaxColumns()).clearContent();
  sh.getRange(2, 1, sh.getMaxRows() - 1, sh.getMaxColumns()).clear().clearDataValidations();
  sh.setFrozenRows(1);
  const q = function (t) { return '"' + String(t).replace(/"/g, '""') + '"'; };
  // D = 의뢰서 총 구매 건수, E = 그날 목표 (그날 하루 받을 인원)
  const head = ['진행일', '방제', '상태', '의뢰 총건수', '그날 목표', '신청', '남은', '마감 시각', '명단', '폼', '택배시트', '틀린 옵션', '택배 옮김', '확인 필요'];
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
    x.item = x.item.replace(/실(배송)?$/, '').replace(/외$/, '');
    row += x.n + 4;
  });
  const fmt = function (t) { return 'DATE(' + Utilities.formatDate(new Date(t), CONFIG.TIMEZONE, 'yyyy,M,d') + ')'; };
  runs.forEach(function (r, i) {
    const rr = i + 2, x = sheets['b' + i];
    sh.getRange(rr, 1, 1, 5).setValues([[r['진행일'], String(r['명단 제목']).replace(/\s*\([^)]*\)\s*$/, ''), r['진행 상태'], Number(r['총건수']) || '', r['목표인원']]]);
    const w = windowOf_(allRuns, r);
    const ts = 'IMPORTRANGE(' + q(x.url) + ',' + q(x.ref + 'A' + x.start + ':A') + ')';
    // 명단 시트 하나를 여러 날이 같이 쓰면 그날 몫(진행일 0시 ~ 다음 진행 0시)만 셈
    sh.getRange(rr, 6).setFormula(w.shared
      ? '=IFERROR(LET(v,' + ts + ',SUMPRODUCT(ISNUMBER(v)*(v>=' + (w.from ? fmt(w.from) : 0) + ')*(v<' + (isFinite(w.to) ? fmt(w.to) : 99999) + '))),"허용 필요")'
      : '=IFERROR(SUMPRODUCT(ISNUMBER(' + ts + ')),"허용 필요")');   // 응답 없는 새 명단 시트는 빈 글자("")가 와서 COUNTA면 1로 셈 → 날짜(타임스탬프)만 셈
    sh.getRange(rr, 7).setFormula('=IF(ISNUMBER(F' + rr + '),E' + rr + '-F' + rr + ',"")');
    sh.getRange(rr, 8).setValue(r['마감 시각']);
    sh.getRange(rr, 9).setFormula('=HYPERLINK(' + q(x.url) + ',"명단")');
    if (r['폼 링크']) sh.getRange(rr, 10).setFormula('=HYPERLINK(' + q(r['폼 링크']) + ',"폼")');
    if (r['택대'] === 'Y' && CONFIG.TAKBAE_SHEET_URL) sh.getRange(rr, 11).setFormula('=HYPERLINK(' + q(CONFIG.TAKBAE_SHEET_URL) + ',"택배")');
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
  try { sh.getRange(bar, 8).setValue(String(props.getProperty('LAST_REPORT') || '')).setFontWeight('bold').setHorizontalAlignment('left').setWrap(false); } catch (e) {}
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
  order.forEach(function (id) {
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
    const parts = x.layout.map(function (t) { return t[1] === 'K' ? kcol : t[1] ? c(t[1]) : blank; });
    const imp = 'IMPORTRANGE(' + q(x.url) + ',' + q(x.ref + 'A' + x.start + ':' + colLetter_(x.cols)) + ')';   // 시트 전체를 가져와 그날 것만 거름
    sh.getRange(top + 1, 1, 1, x.layout.length).setValues([x.layout.map(function (t) { return t[0]; })]);
    const dt = function (t) { return isFinite(t) && t > 0 ? 'DATE(' + Utilities.formatDate(new Date(t), CONFIG.TIMEZONE, 'yyyy,M,d') + ')' : (t > 0 ? '99999' : '0'); };
    const inWin = '(INDEX(d,0,1)<>"")*(INDEX(d,0,1)>=' + dt(x.from) + ')*(INDEX(d,0,1)<' + dt(x.to) + ')';
    sh.getRange(top + 2, 1).setFormula('=IFERROR(LET(d,' + imp + ',IF(COUNTA(INDEX(d,0,1))=0,"",IFERROR(LET(e,FILTER(d,' + inWin + '),HSTACK(' + parts.join(',') + ')),""))),"이 칸을 눌러 액세스 허용을 한 번 눌러 주세요")');
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
    rules.unshift(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND(ISNUMBER(G2),G2<>0)').setFontColor('#d00000').setBold(true).setRanges([sh.getRange(2, 7, runs.length, 1)]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0).setBackground('#ea9999').setFontColor('#7f0000').setBold(true).setRanges([sh.getRange(2, 12, runs.length, 1)]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND(ISLOGICAL(M2),M2=FALSE)').setBackground('#ea9999').setRanges([sh.getRange(2, 13, runs.length, 1)]).build());
  }
  // 명단 줄 번갈아 연한 색 (읽기 쉽게, 다른 표시보다 약하게 맨 뒤에)
  order.forEach(function (id) {
    const x = sheets[id];
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($A' + (x.top + 2) + '<>"",ISEVEN(ROW()))').setBackground('#f6f4fb')
      .setRanges([sh.getRange(x.top + 2, 1, x.n, Math.max(x.layout.length + (x.chk ? 1 : 0), 6))]).build());
  });
  sh.setConditionalFormatRules(rules);
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
