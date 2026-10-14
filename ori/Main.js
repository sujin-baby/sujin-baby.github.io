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
  dup: /주문\s*번호|이름|성함|주문자|아이디|전화|연락처|휴대폰|주소/,   // 겹치면 빨간색으로 표시하는 열
  reviewFee: /리뷰비/
};

// 진행목록 열. 맨 뒤 3개(시트ID, 폼ID, 요청ID)는 스크립트가 쓰는 칸이라 숨겨 둠
//  시트ID: 응답 시트를 찾아 인원 세기, 명단 양식 적용, 폼수정 탭에서 씀
//  폼ID: 명단이 차면 폼 닫기, 폼수정 탭에서 응답 삭제할 때 씀
//  요청ID: 새 진행 만들기를 두 번 눌러도 한 번만 만들어지게 할 때 씀
const LIST_HEADER = ['등록일', '진행일', '명단 제목', '유형', '택대', '실배송', '플랫폼', '목표인원', '인원', '진행 상태', '마감 시각', '캠페인', '일차', '총건수', '업체', '구매시간', '포토', '가격', '카톡방', '업체방', '폼 링크', '시트 링크', '폴더 링크', '시트ID', '폼ID', '요청ID'];
const LIST_HIDDEN = ['시트ID', '폼ID', '요청ID'];
const LIST_ALIAS = { '마감': '마감 시각' };   // 예전 열 이름 → 새 이름

function lc_(name) { return LIST_HEADER.indexOf(name) + 1; }

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
  });
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
    platform:document.getElementById('platform').value,desc:document.getElementById('desc').value,fname:window.__FNAME||'',k:window.__K||'',n:window.__N||'',shop:window.__SHOP||'',slot:window.__SLOT||'',photo:window.__PHOTO||'',date:window.__DATE||'',plan:window.__PLAN||'',slot2:window.__SLOT2||'',day:window.__DAY||'',total:window.__TOTAL||'',room:window.__ROOM||'',croom:window.__CROOM||''};
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
  const pre = '<script>window.__N=' + JSON.stringify(p.n || '') + ';window.__ROOM=' + JSON.stringify(p.room || '') + ';window.__DATE=' + JSON.stringify(p.date || '') + ';window.__SHOP=' + JSON.stringify(p.shop || '') + ';window.__SLOT=' + JSON.stringify(p.slot || '') + ';window.__PHOTO=' + JSON.stringify(p.photo || '') + ';window.__PLAN=' + JSON.stringify(p.plan || '') + ';window.__SLOT2=' + JSON.stringify(p.slot2 || '') + ';window.__DAY=' + JSON.stringify(p.day || '') + ';window.__TOTAL=' + JSON.stringify(p.total || '') + ';window.__CROOM=' + JSON.stringify(p.croom || '') + ';window.__AUTO=' + (p.auto === '1' && p.title ? 'true' : 'false') + ';</' + 'script>';
  const fill = pre + '<script>window.__K=' + JSON.stringify(CONFIG.KEY) + ';window.__FNAME=' + JSON.stringify(p.fname || '') + ';(function(){var p=' + JSON.stringify(p).replace(/</g, '\\u003c') + ';var $=function(i){return document.getElementById(i)};if(p.title)$("title").value=p.title;if(p.daily)$("daily").value=p.daily;if(p.desc)$("desc").value=p.desc;if(p.type)$("type").value=p.type;if(p.platform)$("platform").value=p.platform;$("takdae").checked=p.takdae==="1";$("realship").checked=p.realship==="1";autoGo();})();</' + 'script>';
  return HtmlService.createHtmlOutput(DIALOG_HTML + fill).setTitle('새 진행 만들기').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ---------------- 1) 새 진행 만들기 ---------------- */

function createRun(d) {
  if (!d || d.k !== CONFIG.KEY) throw new Error('권한이 없어요. 생성기 버튼이나 시트 메뉴로 열어 주세요.');
  const lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try {
    const prev = d.n ? findRunByRequest_(d.n) : null;
    if (prev) return prev;
    return createRunInner_(d);
  } finally { lock.releaseLock(); }
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
  // 이름 규칙: '# 키워드 (닉네임)'. 오리컴퍼니 폴더 안에 진행마다 같은 이름의 하위 폴더
  const fname = String(d.fname || d.title).trim();
  const folder = rootFolder_().createFolder(fname);

  // 폼 복사
  const formFile = DriveApp.getFileById(CONFIG.TEMPLATE_FORM_ID).makeCopy(fname, folder);
  const form = FormApp.openById(formFile.getId());
  form.setTitle(fname);
  // 새 구글폼은 복사본이 '게시 안 됨' 상태라 먼저 게시
  if (typeof form.setPublished === 'function') form.setPublished(true);
  form.setAcceptingResponses(true);

  // 응답 시트 생성·연결
  const ss = SpreadsheetApp.create(fname + ' (응답)');
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

  // 서식
  const opts = { type: d.type, takdae: !!d.takdae, realship: !!d.realship, platform: d.platform, target: d.daily, prices: d.prices };
  formatResponseSheet_(SpreadsheetApp.openById(ss.getId()), opts);

  let formUrl = form.getPublishedUrl();
  try { formUrl = form.shortenFormUrl(formUrl); } catch (e) {}
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
    '시트ID': ss.getId(), '폼ID': formFile.getId(), '요청ID': String(d.n || '')
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

  return { notice: notice, formUrl: formUrl, sheetUrl: ss.getUrl(), folderUrl: folder.getUrl() };
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
  if (n <= 1) n = 26;   // 머리글이 아직 안 생겼으면 Z열까지 넉넉히 가져옴
  const head = all.slice(0, n);
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
  sh.getRange('D1').setFormula('=COUNTA(' + ref + 'A2:A)');
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

  const maxRows = sh.getMaxRows();
  sh.getRange(2, 1, 1, extra).setWrap(true).setVerticalAlignment('bottom').setFontWeight('normal');
  sh.setRowHeight(2, 52);
  sh.getRange(3, 1, maxRows - 2, extra).setFontSize(10).setVerticalAlignment('middle');
  sh.getRange(3, 1, maxRows - 2, 1).setNumberFormat('yyyy. M. d am/pm h:mm:ss');
  sh.setFrozenRows(2);
  sh.setColumnWidths(1, extra, 150);
  head.forEach(function (h, i) { if (h.length > 20) sh.setColumnWidth(i + 1, 220); });

  // 주문번호, 이름이 겹치면 빨간색
  const rules = [];
  head.forEach(function (h, i) {
    if (MATCH.dup.test(h) && !MATCH.account.test(h)) {
      const x = colLetter_(i + 1);
      rules.push(SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied('=AND($' + x + '3<>"",COUNTIF($' + x + '$3:$' + x + ',$' + x + '3)>1)')
        .setBackground('#f8c9c4').setFontColor('#8a1c12')
        .setRanges([sh.getRange(3, i + 1, maxRows - 2, 1)]).build());
    }
  });
  // 결제금액이 가이드 가격과 다르면 주황색 (스샷 확인할 때 금액부터 보라는 사장님 지시)
  const prices = (String(opts.prices || '').match(/\d+/g) || []).filter(function (x, k, a) { return a.indexOf(x) === k; });
  head.forEach(function (h, i) {
    if (!prices.length || !/결제\s*금액|금액|가격/.test(h)) return;
    const x = colLetter_(i + 1);
    const num = 'VALUE(REGEXREPLACE(TO_TEXT($' + x + '3),"[^0-9]",""))';
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($' + x + '3<>"",NOT(OR(' + prices.map(function (v) { return num + '=' + v; }).join(',') + ')))')
      .setBackground('#f9cb9c').setFontColor('#7a3a00')
      .setRanges([sh.getRange(3, i + 1, maxRows - 2, 1)]).build());
    sh.getRange(2, i + 1).setNote('가이드 가격(' + prices.join(', ') + ')과 다르면 주황색');
  });
  sh.setConditionalFormatRules(rules);

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
  const ss = SpreadsheetApp.openById(r['시트ID']);
  formatResponseSheet_(ss, {
    type: r['유형'], takdae: r['택대'] === 'Y', realship: r['실배송'] === 'Y', platform: r['플랫폼'], target: r['목표인원'], prices: r['가격']
  });
  shareFile_(r['시트ID'], false, CONFIG.LIST_EDITORS);
  SpreadsheetApp.getUi().alert('명단 양식과 편집 권한을 다시 적용했어요: ' + r['명단 제목']);
}

/* ---------------- 4) 진행목록 인원, 명단 마감 ---------------- */

function dailyCheck() {
  try { normalizeRuns_(); } catch (e) {}
  readRuns_().forEach(function (r) {
    if (r['진행 상태'] === '종료' || !r['시트ID']) return;
    const day = r['진행일'] || dayFromTitle_(r['명단 제목']);
    if (day instanceof Date && (today_() - day) / 864e5 >= CONFIG.AUTO_END_DAYS) { setRun_(r.row, '진행 상태', '종료'); return; }
    const st = statusFor_(day);
    if (st !== r['진행 상태']) setRun_(r.row, '진행 상태', st);
    try { setRun_(r.row, '인원', countResponses_(r['시트ID'])); } catch (e) {}
  });
  try { ensureEditTab_(); } catch (e) {}
  try { updatePay_(); } catch (e) { Logger.log('월급시트 갱신 실패: ' + e); }
}

function countResponses_(sheetId) {
  const sheet = responseSheet_(SpreadsheetApp.openById(sheetId));
  const last = sheet.getLastRow();
  return last < 2 ? 0 : sheet.getRange(2, 1, last - 1, 1).getValues().filter(function (x) { return x[0] !== ''; }).length;
}

function checkFull() {
  try { removeOldUpdateTrigger_(); } catch (e) {}
  try { normalizeRuns_(); } catch (e) { Logger.log('진행목록 정리 실패: ' + e); }
  try { ensureEditTab_(); } catch (e) { Logger.log('폼수정 탭 만들기 실패: ' + e); }
  try { makeDueDays_(); } catch (e) { Logger.log('다음 일차 만들기 실패: ' + e); }
  const me = Session.getEffectiveUser().getEmail();
  let changed = false;
  readRuns_().forEach(function (r) {
    if (r['진행 상태'] === '종료' || !r['폼ID'] || !r['목표인원'] || r['마감 시각']) return;
    let form;
    try { form = FormApp.openById(r['폼ID']); } catch (e) { return; }
    const n = form.getResponses().length;
    setRun_(r.row, '인원', n);
    if (n < Number(r['목표인원'])) return;
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
      '잘못 산 사람을 빼려면 관리 시트 폼수정 탭에서 지우세요. 인원이 모자라면 폼이 다시 열려요.'
    ].join('\n'));
  });
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
  if (!sh) {
    sh = ss.insertSheet(OUTBOX_SHEET, 1);
    sh.appendRow(['ID', '시각', '종류', '카톡방', '메시지', '상태']);
    sh.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#efe6f7');
    sh.setFrozenRows(1);
    sh.setColumnWidth(5, 420);
  }
  return sh;
}

function queueMsg_(room, msg, kind) {
  if (!msg) return;
  try {
    outboxSheet_().appendRow([Utilities.getUuid().replace(/-/g, '').slice(0, 10), new Date(), kind || '', String(room || ''), String(msg), '대기']);
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
    var done = function () { cp.textContent = '복사됨'; };
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
  const titles = readRuns_().filter(function (r) { return r['진행 상태'] !== '종료' && r['시트ID']; }).map(function (r) { return String(r['명단 제목']); }).reverse();
  sh.getRange('B1').setDataValidation(titles.length ? SpreadsheetApp.newDataValidation().requireValueInList(titles, true).setAllowInvalid(true).build() : null);
  const has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'onAdminEdit'; });
  if (!has) ScriptApp.newTrigger('onAdminEdit').forSpreadsheet(ss).onEdit().create();
  return sh;
}

function onAdminEdit(e) {
  if (!e || !e.range) return;
  const sh = e.range.getSheet();
  if (sh.getName() !== EDIT_TAB) return;
  const a1 = e.range.getA1Notation();
  if (a1 === 'B1') loadEditTab_(sh);
  else if (a1 === 'E1' && String(e.value).toUpperCase() === 'TRUE') {
    try { deleteChecked_(sh); } finally { sh.getRange('E1').setValue(false); }
  }
}

function editRun_(sh) {
  const t = String(sh.getRange('B1').getValue());
  return readRuns_().filter(function (r) { return String(r['명단 제목']) === t; }).pop();
}

function loadEditTab_(sh, msg) {
  const max = sh.getMaxRows();
  if (max > 3) { sh.getRange(4, 1, max - 3, sh.getMaxColumns()).clearContent().clearDataValidations(); }
  sh.getRange('B2').clearContent();
  sh.getRange('G1').setValue(msg || '');
  const r = editRun_(sh);
  if (!r) { sh.getRange(3, 1, 1, sh.getMaxColumns()).clearContent(); return; }
  const raw = responseSheet_(SpreadsheetApp.openById(r['시트ID']));
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
  }
  // 공지용 명단: 같은 이름이 여러 번이면 '이름2', 1번은 이름만, 5명씩 한 줄 (사장님 형식)
  let cName = -1;
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

function deleteChecked_(sh) {
  const r = editRun_(sh);
  if (!r) { sh.getRange('G1').setValue('먼저 B1에서 진행을 고르세요.'); return; }
  const max = sh.getLastRow();
  if (max < 4) return;
  const rows = sh.getRange(4, 1, max - 3, 3).getValues();
  const picked = rows.filter(function (x) { return x[0] === true && x[1] instanceof Date; });
  if (!picked.length) { sh.getRange('G1').setValue('A열에서 지울 사람을 먼저 체크하세요.'); return; }
  const near = function (a, b) { return Math.abs(a.getTime() - b.getTime()) < 1500; };
  // 1) 폼 응답 삭제
  const form = FormApp.openById(r['폼ID']);
  const resps = form.getResponses();
  picked.forEach(function (x) {
    const hit = resps.filter(function (fr) { return near(fr.getTimestamp(), x[1]); })[0];
    if (hit) form.deleteResponse(hit.getId());
  });
  // 2) 응답 시트 행 삭제 (아래에서부터)
  const raw = responseSheet_(SpreadsheetApp.openById(r['시트ID']));
  const ts = raw.getRange(2, 1, Math.max(raw.getLastRow() - 1, 1), 1).getValues();
  for (let i = ts.length - 1; i >= 0; i--) {
    if (ts[i][0] instanceof Date && picked.some(function (x) { return near(ts[i][0], x[1]); })) raw.deleteRow(i + 2);
  }
  // 3) 인원 갱신, 모자라면 폼 다시 열기
  const n = form.getResponses().length;
  setRun_(r.row, '인원', n);
  let reopened = '';
  if (r['목표인원'] && n < Number(r['목표인원']) && !form.isAcceptingResponses()) {
    form.setAcceptingResponses(true);
    setRun_(r.row, '마감 시각', '');
    reopened = ' 인원이 모자라서 폼을 다시 열었어요.';
  }
  loadEditTab_(sh, picked.length + '명 지웠어요 (지금 ' + n + '명).' + reopened);
  try { buildDashboard_(true); } catch (e) {}
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
  return sh;
}

function savePlan_(d) {
  const plan = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(d.plan)).getDataAsString('UTF-8'));
  if (!plan.length) return;
  const camp = campOf_(d.title);
  const cfg = JSON.stringify({ type: d.type, takdae: !!d.takdae, realship: !!d.realship, platform: d.platform, prices: d.prices,
    croom: d.croom, shop: d.shop, photo: d.photo, desc: String(d.desc || ''), slot2: d.slot2 || '자정 ~ 오전 8시 20분 구매', total: d.total, camp: camp, base: d.n });
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
    const prev = runs.filter(function (r) { return String(r['캠페인']) === String(x[1]) && Number(r['일차']) === k - 1; })[0];
    const due = new Date(x[3]); due.setDate(due.getDate() - 1); due.setHours(CONFIG.NEXT_DAY_HOUR, 0, 0, 0);
    if (!((prev && prev['마감 시각']) || now >= due)) return;
    const lock = LockService.getScriptLock();
    lock.waitLock(60000);
    try {
      if (findRunByRequest_(x[0])) { sh.getRange(i + 2, 9).setValue('생성됨'); return; }
      const dateIso = Utilities.formatDate(new Date(x[3]), CONFIG.TIMEZONE, 'yyyy-MM-dd');
      const desc = adjustNotice_(cfg.desc, JSON.parse(x[7]), cfg.slot2);
      const res = createRunInner_({
        k: CONFIG.KEY, n: x[0], title: x[5], room: x[4], fname: x[4], camp: cfg.camp, day: k, total: cfg.total,
        daily: String(x[6]), date: dateIso, desc: desc, type: cfg.type, takdae: cfg.takdae, realship: cfg.realship,
        platform: cfg.platform, prices: cfg.prices, croom: cfg.croom, shop: cfg.shop, photo: cfg.photo, slot: cfg.slot2
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
    } finally { lock.releaseLock(); }
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
    const before = mine.filter(function (x) { return x['진행일'] < r['진행일']; }).reduce(function (a, x) { return a + (Number(x['목표인원']) || 0); }, 0);
    // 전월: 지난달에 시작한 캠페인이 이번 달로 넘어오면 지난달까지 끝낸 건수 (남은 = 총액 - 전월 - 누계 수식에 맞춰 총액에 다시 더함)
    const ym = function (d) { return d.getFullYear() * 12 + d.getMonth(); };
    const prev = mine.filter(function (x) { return ym(x['진행일']) < ym(r['진행일']); }).reduce(function (a, x) { return a + (Number(x['목표인원']) || 0); }, 0);
    writePayRow_(r, nameOf(r), Math.max(total - before, 0) + prev, prev);
  });
}

// 월급시트 진행시간: 바로구매 → 긴급건, 별과 '구매' 글자는 뺌 (자정 ~ 오전 8시 20분)
function payTime_(t) {
  t = String(t || '');
  if (/바로구매/.test(t)) return '긴급건';
  const x = t.replace(/★/g, '').replace(/\s*구매\s*$/, '').trim();
  return /오전|오후/.test(x) && !/자정/.test(x) ? '시간지정' : x;
}

function writePayRow_(r, name, remain, prevMonth) {
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
  let row = links.findIndex(function (u) { return u && u.indexOf(sid) !== -1; });
  const hasLink = row !== -1;
  if (row === -1) row = names.indexOf(name.replace(/\s+/g, ''));
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
  putIfEmpty(L.store, String(r['업체'] || ''));
  putIfEmpty(L.time, payTime_(r['구매시간']));
  putIfEmpty(L.note, [r['택대'] === 'Y' ? '택대' : '', r['실배송'] === 'Y' ? '실배송' : '', Number(r['일차']) ? r['일차'] + '일차' : '', /유/.test(String(r['포토'])) ? '포토' : ''].filter(Boolean).join(' / '));
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
  const runs = readRuns_().filter(function (r) { return r['진행 상태'] !== '종료' && r['시트ID']; })
    .sort(function (a, b) { return (b['진행일'] || 0) - (a['진행일'] || 0); });
  const sig = runs.map(function (r) { return r['시트ID'] + ':' + r['목표인원'] + ':' + r['진행 상태']; }).join('|');
  const props = PropertiesService.getScriptProperties();
  const ss = adminSs_();
  let sh = ss.getSheetByName(DASH_TAB);
  if (!force && sh && props.getProperty('DASH_SIG') === sig) return;
  if (!sh) sh = ss.insertSheet(DASH_TAB, 0);
  sh.clear();
  sh.setFrozenRows(1);
  const q = function (t) { return '"' + String(t).replace(/"/g, '""') + '"'; };
  const head = ['진행일', '방제', '상태', '목표', '신청', '남은', '마감 시각', '명단', '폼', '월급시트', '택배시트'];
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#efe6f7');
  const payUrl = CONFIG.PAY_SHEET_ID ? 'https://docs.google.com/spreadsheets/d/' + CONFIG.PAY_SHEET_ID + '/edit#gid=' + CONFIG.PAY_TAB_GID : '';
  const info = runs.map(function (r) {
    let raw = '', cols = 12;
    try { const rs = responseSheet_(SpreadsheetApp.openById(r['시트ID'])); raw = rs.getName(); cols = Math.max(rs.getLastColumn(), 1); } catch (e) {}
    grantImport_(ss.getId(), r['시트ID']);
    return { r: r, ref: "'" + raw.replace(/'/g, "''") + "'!", cols: Math.min(cols, 26), url: 'https://docs.google.com/spreadsheets/d/' + r['시트ID'] + '/edit' };
  });
  info.forEach(function (x, i) {
    const row = i + 2, r = x.r;
    sh.getRange(row, 1, 1, 4).setValues([[r['진행일'], String(r['명단 제목']).replace(/\s*\([^)]*\)\s*$/, ''), r['진행 상태'], r['목표인원']]]);
    sh.getRange(row, 5).setFormula('=IFERROR(COUNTA(IMPORTRANGE(' + q(x.url) + ',' + q(x.ref + 'A2:A') + ')),"허용 필요")');
    sh.getRange(row, 6).setFormula('=IF(ISNUMBER(E' + row + '),D' + row + '-E' + row + ',"")');
    sh.getRange(row, 7).setValue(r['마감 시각']);
    sh.getRange(row, 8).setFormula('=HYPERLINK(' + q(x.url) + ',"명단")');
    if (r['폼 링크']) sh.getRange(row, 9).setFormula('=HYPERLINK(' + q(r['폼 링크']) + ',"폼")');
    if (payUrl) sh.getRange(row, 10).setFormula('=HYPERLINK(' + q(payUrl) + ',"월급")');
    if (r['택대'] === 'Y' && CONFIG.TAKBAE_SHEET_URL) sh.getRange(row, 11).setFormula('=HYPERLINK(' + q(CONFIG.TAKBAE_SHEET_URL) + ',"택배")');
  });
  if (info.length) {
    sh.getRange(2, 1, info.length, 1).setNumberFormat('M/d');
    sh.getRange(2, 7, info.length, 1).setNumberFormat('M/d HH:mm');
  }
  // 아래: 명단 내용
  let row = info.length + 4;
  info.forEach(function (x) {
    const n = Number(x.r['목표인원']) || 30;
    sh.getRange(row, 1, 1, Math.max(x.cols, 6)).setBackground('#f0e8f8');
    sh.getRange(row, 1).setValue('■ ' + x.r['명단 제목'] + '   목표 ' + (x.r['목표인원'] || '?') + '명').setFontWeight('bold');
    sh.getRange(row + 1, 1).setFormula('=IFERROR(IMPORTRANGE(' + q(x.url) + ',' + q(x.ref + 'A1:' + colLetter_(x.cols) + (n + 3)) + '),"이 칸을 눌러 액세스 허용을 한 번 눌러 주세요")');
    sh.getRange(row + 2, 1, n + 2, 1).setNumberFormat('M/d HH:mm');
    row += n + 6;
  });
  sh.setColumnWidth(2, 260);
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
