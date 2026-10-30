/** ORI-LOADER
 * 체험단 자동화 로더. 이 파일은 거의 바뀌지 않아요.
 * 실제 코드(Main.js)는 GitHub(Settings의 UPDATE_BASE)에서 받아 와서 돌려요. 10분 동안은 캐시에 저장해 두고 씀.
 * 그래서 Claude가 코드를 고쳐도 붙여넣기, 배포가 필요 없어요.
 */

function ori_() {
  if (globalThis.__ORI_LOADED) return;
  const cache = CacheService.getScriptCache();
  let src = '';
  const n = Number(cache.get('ori_src_n') || 0);
  if (n) { const parts = cache.getAll(Array.from({ length: n }, function (_, i) { return 'ori_src_' + i; })); src = Array.from({ length: n }, function (_, i) { return parts['ori_src_' + i] || ''; }).join(''); }
  if (src.indexOf('/** ORI-MAIN') !== 0) {
    const props = PropertiesService.getScriptProperties();
    let code = 0;
    try {
      const r = UrlFetchApp.fetch(CONFIG.UPDATE_BASE + 'Main.js?t=' + Date.now(), { muteHttpExceptions: true });
      code = r.getResponseCode();
      src = code === 200 ? r.getContentText() : '';
    } catch (e) { src = ''; }
    if (src.indexOf('/** ORI-MAIN') === 0) {
      // 받아온 코드는 내 드라이브에 백업 (GitHub이 잠깐 안 될 때 이걸로 돌림)
      try {
        const id = props.getProperty('ORI_BACKUP_ID');
        if (id) DriveApp.getFileById(id).setContent(src);
        else props.setProperty('ORI_BACKUP_ID', DriveApp.createFile('체험단_자동화_백업_코드.js', src, 'text/plain').getId());
      } catch (e) {}
    } else {
      try { src = DriveApp.getFileById(props.getProperty('ORI_BACKUP_ID')).getBlob().getDataAsString('UTF-8'); } catch (e) { src = ''; }
      if (src.indexOf('/** ORI-MAIN') !== 0) throw new Error('최신 코드를 받아오지 못했어요 (' + code + '). 잠시 뒤 다시 해 주세요.');
    }
    const size = 90000, chunks = {};
    let k = 0;
    for (let i = 0; i < src.length; i += size) chunks['ori_src_' + (k++)] = src.slice(i, i + size);
    chunks.ori_src_n = String(k);
    try { cache.putAll(chunks, 600); } catch (e) {}
  }
  (0, eval)(src);
  globalThis.__ORI_LOADED = true;
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
