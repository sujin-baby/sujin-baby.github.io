/** ORI-ROOM-LOADER
 * 오리 팀룸 로더. 이 파일만 Apps Script에 한 번 붙여넣으면 돼요.
 * 실제 코드(teamroom/Room.js)는 GitHub에서 받아 와서 돌려요 (10분 캐시). Claude가 고쳐도 다시 붙여넣을 필요 없어요.
 */
const ROOM_BASE = 'https://raw.githubusercontent.com/sujin-baby/sujin-baby.github.io/claude/tasting-group-notice-automation-1x1kur/teamroom/';

function room_() {
  if (globalThis.__ROOM_LOADED) return;
  const cache = CacheService.getScriptCache();
  let src = cache.get('room_src') || '';
  if (src.indexOf('/** ORI-ROOM') !== 0) {
    const props = PropertiesService.getScriptProperties();
    try {
      const r = UrlFetchApp.fetch(ROOM_BASE + 'Room.js?t=' + Date.now(), { muteHttpExceptions: true });
      src = r.getResponseCode() === 200 ? r.getContentText() : '';
    } catch (e) { src = ''; }
    if (src.indexOf('/** ORI-ROOM') === 0) { try { const id = props.getProperty('ROOM_BACKUP_ID'); if (id) DriveApp.getFileById(id).setContent(src); else props.setProperty('ROOM_BACKUP_ID', DriveApp.createFile('오리_팀룸_백업_코드.js', src, 'text/plain').getId()); } catch (e) {} }
    else { try { src = DriveApp.getFileById(props.getProperty('ROOM_BACKUP_ID')).getBlob().getDataAsString('UTF-8'); } catch (e) { src = ''; } }
    if (src.indexOf('/** ORI-ROOM') !== 0) throw new Error('팀룸 코드를 받아오지 못했어요. 잠시 뒤 다시 해 주세요.');
    try { if (src.length < 95000) cache.put('room_src', src, 600); } catch (e) {}
  }
  (0, eval)(src);
  globalThis.__ROOM_LOADED = true;
}
function rcall_(name, self, args) {
  room_();
  const fn = globalThis[name];
  if (typeof fn !== 'function' || fn === self) throw new Error('팀룸 코드에 ' + name + ' 이(가) 없어요.');
  return fn.apply(null, args);
}
function doGet(e) { return rcall_('doGet', doGet, [e]); }
function doPost(e) { return rcall_('doPost', doPost, [e]); }
function roomCall(k, op, a) { return rcall_('roomCall', roomCall, [k, op, a]); }
function roomTick() { return rcall_('roomTick', roomTick, []); }
