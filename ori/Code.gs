/** ORI-LOADER
 * 체험단 자동화 로더. 이 파일은 거의 바뀌지 않아요.
 * 실제 코드(Main.js)는 GitHub(Settings의 UPDATE_BASE)에서 받아 와서 돌려요.
 *  그래서 Claude가 코드를 고쳐도 붙여넣기, 배포가 필요 없어요.
 *
 * 11/28 사용자 '진행 도우미 켤 때 아직도 너무 느려 30초' 고침:
 *  ① 받아 온 코드를 캐시에 나눠 담을 때 **글자 수(9만 자)**로 잘랐는데, 한글은 글자당 3바이트라
 *     한 칸이 11만 바이트가 넘어 캐시 한 칸 한도(100KB)를 넘겼어요 → 저장이 통째로 실패해서
 *     **켤 때마다 1.2MB를 GitHub에서 다시 받고 + 드라이브에 1.2MB 백업을 쓰고 + 1.2MB를 eval** 했어요.
 *     → 이제 **바이트(80KB) 기준**으로 나눠서 저장하고, 담은 뒤 길이도 확인해요.
 *  ② 캐시는 60초만 살아서 한 시간에 한 번 열어도 매번 다시 받았어요 → 받아 둔 코드는 6시간 두고,
 *     GitHub에는 60초에 한 번만 '바뀐 게 있나' 물어봐요(If-None-Match, 304면 1.2MB를 안 받음).
 *     코드가 바뀌면 60초 안에 새 코드로 바뀌어요(예전과 같은 빠르기).
 *  ③ 드라이브 백업은 받아 온 코드가 **바뀌었을 때만** 씀 (매번 1.2MB 쓰던 것).
 *  ④ 켜는 데 걸린 시간을 캐시 ORI_LOAD 에 남겨요 (진행 도우미 점검 ?p=diag 에서 `load`로 보임).
 */

const ORI_KEEP = { chunk: 80000, ttl: 21600, chk: 60 };   // 캐시 한 칸 80KB(한도 100KB) · 6시간 보관 · 60초에 한 번 GitHub 확인

function ori_() {
  if (globalThis.__ORI_LOADED) return;
  const t0 = Date.now(), tf0 = Date.now();
  const cache = CacheService.getScriptCache();
  const props = PropertiesService.getScriptProperties();
  let src = '', msFetch = 0, msDrive = 0, how = '';
  try { src = oriCacheGet_(cache); } catch (e) { src = ''; }
  const checkedAt = Number(cache.get('ori_src_chk') || 0);
  if (!src || Date.now() - checkedAt > ORI_KEEP.chk * 1000) {
    how = src ? '확인' : '처음';
    const etag = cache.get('ori_src_etag') || '';
    let code = 0, text = '', newEtag = etag;
    const tf = Date.now();
    try {
      const opt = { muteHttpExceptions: true };
      if (src && etag) opt.headers = { 'If-None-Match': etag };
      const r = UrlFetchApp.fetch(CONFIG.UPDATE_BASE + 'Main.js?t=' + Date.now(), opt);
      code = r.getResponseCode();
      if (code === 200) { text = r.getContentText(); newEtag = oriHdr_(r, 'ETag') || etag; }
    } catch (e) { code = -1; }
    msFetch = Date.now() - tf;
    if (code === 200 && text.indexOf('/** ORI-MAIN') === 0) {
      if (text !== src) {                                  // 바뀐 게 있을 때만 캐시·백업을 새로 씀
        src = text; how = '새로받음';
        try { oriCachePut_(cache, src); } catch (e) {}
        const td = Date.now();
        try {
          const id = props.getProperty('ORI_BACKUP_ID');
          if (id) DriveApp.getFileById(id).setContent(src);
          else props.setProperty('ORI_BACKUP_ID', DriveApp.createFile('체험단_자동화_백업_코드.js', src, 'text/plain').getId());
        } catch (e) {}
        msDrive = Date.now() - td;
      } else { how = '그대로'; }
      if (newEtag) try { cache.put('ori_src_etag', newEtag, ORI_KEEP.ttl); } catch (e) {}
    } else if (code === 304 && src) {
      how = '안바뀜';                                      // 304: 받아 둔 코드 그대로 씀 (1.2MB 안 받음)
    }
    if (src.indexOf('/** ORI-MAIN') !== 0) {               // 못 받았으면 드라이브 백업으로 (예전과 같음)
      try { src = DriveApp.getFileById(props.getProperty('ORI_BACKUP_ID')).getBlob().getDataAsString('UTF-8'); how = '백업'; } catch (e) { src = ''; }
    }
    try { cache.put('ori_src_chk', String(Date.now()), ORI_KEEP.ttl); } catch (e) {}
  } else {
    how = '캐시';
  }
  if (src.indexOf('/** ORI-MAIN') !== 0) throw new Error('최신 코드를 받아오지 못했어요. 잠시 뒤 다시 해 주세요.');
  (0, eval)(src);
  globalThis.__ORI_LOADED = true;
  try {
    cache.put('ORI_LOAD', JSON.stringify({ at: Utilities.formatDate(new Date(), CONFIG.TIMEZONE || 'Asia/Seoul', 'MM-dd HH:mm:ss'), ms: Date.now() - t0, how: how, fetch: msFetch, drive: msDrive, kb: Math.round(src.length / 1000) }), 21600);
  } catch (e) {}
}

// 캐시에서 받아 둔 코드 꺼내기. 한 칸이라도 빠졌거나 길이가 안 맞으면 '' (그러면 GitHub에서 다시 받음)
function oriCacheGet_(cache) {
  const n = Number(cache.get('ori_src_n') || 0);
  if (!n || n > 200) return '';
  const keys = [];
  for (let i = 0; i < n; i++) keys.push('ori_src_' + i);
  let s = '';
  for (let i = 0; i < n; i += 8) {
    const part = cache.getAll(keys.slice(i, i + 8));
    for (let j = 0; j < Math.min(8, n - i); j++) {
      const v = part[keys[i + j]];
      if (v == null) return '';
      s += v;
    }
  }
  const len = Number(cache.get('ori_src_len') || 0);
  if (len && s.length !== len) return '';
  return s.indexOf('/** ORI-MAIN') === 0 ? s : '';
}

// 코드를 바이트 기준으로 나눠 캐시에 담기 (한 칸 100KB 한도 — 한글 3바이트라 글자 수로 자르면 넘침)
function oriCachePut_(cache, src) {
  const parts = oriChunks_(src), vals = {};
  parts.forEach(function (p, i) { vals['ori_src_' + i] = p; });
  const keys = Object.keys(vals);
  for (let i = 0; i < keys.length; i += 5) {
    const o = {};
    keys.slice(i, i + 5).forEach(function (k) { o[k] = vals[k]; });
    cache.putAll(o, ORI_KEEP.ttl);
  }
  cache.put('ori_src_len', String(src.length), ORI_KEEP.ttl);
  cache.put('ori_src_n', String(parts.length), ORI_KEEP.ttl);   // 마지막에 (중간에 끊기면 '없음'으로 읽히게)
}

function oriChunks_(src) {
  const out = [], max = ORI_KEEP.chunk;
  let cur = '', bytes = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src.charCodeAt(i);
    let w = c < 0x80 ? 1 : c < 0x800 ? 2 : 3, take = 1;
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < src.length) { w = 4; take = 2; }   // 이모지 등 (두 글자 = 4바이트)
    if (bytes + w > max && cur) { out.push(cur); cur = ''; bytes = 0; }
    cur += take === 2 ? src.substr(i, 2) : src.charAt(i);
    bytes += w; i += take - 1;
  }
  if (cur) out.push(cur);
  return out;
}

function oriHdr_(r, name) {
  try {
    const h = r.getHeaders() || {}, want = name.toLowerCase();
    const k = Object.keys(h).filter(function (x) { return x.toLowerCase() === want; })[0];
    return k ? String(h[k]) : '';
  } catch (e) { return ''; }
}

// 메뉴 (시트를 열 때 바로 뜨게 로더가 직접 만듦)
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
}

// 바깥(메뉴, 트리거, 웹 앱, 화면 버튼)에서 부르는 이름들: 최신 코드를 받아서 같은 이름의 진짜 함수로 넘김
function call_(name, self, args) {
  ori_();
  const fn = globalThis[name];
  if (typeof fn !== 'function' || fn === self) throw new Error('최신 코드에 ' + name + ' 이(가) 없어요.');
  return fn.apply(null, args);
}
function doGet(e) { return call_('doGet', doGet, [e]); }
function createRun(d) { return call_('createRun', createRun, [d]); }
function markSentFromPage(k, id) { return call_('markSentFromPage', markSentFromPage, [k, id]); }
function checkFull() { return call_('checkFull', checkFull, []); }
function dailyCheck() { return call_('dailyCheck', dailyCheck, []); }
function onAdminEdit(e) { return call_('onAdminEdit', onAdminEdit, [e]); }
function showNewDialog() { return call_('showNewDialog', showNewDialog, []); }
function reformatSelected() { return call_('reformatSelected', reformatSelected, []); }
function setupEditTab() { return call_('setupEditTab', setupEditTab, []); }
function showChipError() { return call_('showChipError', showChipError, []); }
function rebuildDashboard() { return call_('rebuildDashboard', rebuildDashboard, []); }
function updateNow() { return call_('updateNow', updateNow, []); }
function installDailyTrigger() { return call_('installDailyTrigger', installDailyTrigger, []); }
function removeDailyTrigger(s) { return call_('removeDailyTrigger', removeDailyTrigger, [s]); }
function autoUpdate() { ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'autoUpdate') ScriptApp.deleteTrigger(t); }); }
