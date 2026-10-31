// 리뷰 사진 받는 곳(rvInboxSort_): 캡처 속 상품 이름으로 압축 기다리는 의뢰를 찾아 그 의뢰 리뷰이미지/종류 폴더로, 못 찾으면 '어느 의뢰인지 모름' + 할 일  node rvinbox_test.js <Main.js>
const { makeEnv, Sheet } = require('./harness'); const vm = require('vm');
const env = makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
const it = a => { let i = 0; const c = a.slice(); return { hasNext: () => i < c.length, next: () => c[i++] }; };
function Folder(name) { this.name = name; this.files = []; this.subs = []; this.id = 'D_' + name; }
Folder.prototype = { getName() { return this.name; }, getUrl() { return 'https://drive/' + this.name; }, getId() { return this.id; }, isTrashed() { return false; },
  getFiles() { return it(this.files); }, getFolders() { return it(this.subs); },
  getFoldersByName(n) { return it(this.subs.filter(s => s.name === n)); }, createFolder(n) { const f = new Folder(n); this.subs.push(f); return f; } };
let fid = 0;
function File(ans) { this.id = 'F' + (++fid); this.ans = ans; this.parent = null; this.desc = ''; }
File.prototype = { getId() { return this.id; }, getName() { return this.id + '.jpg'; }, getMimeType() { return 'image/jpeg'; }, setDescription(d) { this.desc = d; },
  getBlob() { const me = this; return { getContentType: () => 'image/jpeg', getBytes: () => Array.from(Buffer.from(me.id)) }; },
  moveTo(f) { const p = this.parent; p.files.splice(p.files.indexOf(this), 1); f.files.push(this); this.parent = f; } };
const root = new Folder('체험단'), inbox = root.createFolder('리뷰 사진 받는 곳');
const imgA = new Folder('리뷰이미지A'), imgB = new Folder('리뷰이미지B');
const folders = { 'D_리뷰이미지A': imgA, 'D_리뷰이미지B': imgB, 'D_리뷰 사진 받는 곳': inbox };
env.DriveApp = { getFolderById: id => folders[id] };
G("rootFolder_ = function () { return globalThis.__root; }"); env.__root = root;
const R = (product, photo) => ({ kind: 'review', stars: 5, text: true, photo, product });
const add = ans => { const f = new File(ans); f.parent = inbox; inbox.files.push(f); env.__ans[Buffer.from(f.id).toString('base64')] = ans; return f; };
env.__ans = {};
add(R('[스마트스토어] 모두의농수산 엔케이 감홍사과 5kg', true));
add(R('모야무 실링팬 천장 선풍기 주방 식탁 조명', false));
add({ kind: 'purchase', stars: 0, text: false, photo: false, product: '엔케이 감홍사과 가정용 3kg' });
add(R('전혀 다른 상품 텀블러', false));
env.Utilities.base64Encode = b => Buffer.from(typeof b === 'string' ? b : b.map(x => x & 255)).toString('base64');
env.Utilities.sleep = () => {};
env.UrlFetchApp = { fetch: (u, o) => { const d = JSON.parse(o.payload).contents[0].parts[1].inline_data.data; return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(env.__ans[d]) }] } }] }) }; } };
const msgs = []; env.__msgs = msgs; G("queueMsg_ = function (room, msg, kind) { __msgs.push(room + ' | ' + kind + ' | ' + msg); }");
G("formDescRead_ = function (id) { return id === 'FA' ? '🐥상품명 : 엔케이 감홍사과 부사 5kg\\n🐥판매처 : 모두의농수산' : '🐥상품명 : 모야무 실링팬 천장 선풍기'; }");
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : ''), d0 = new Date(); d0.setHours(0, 0, 0, 0);
env.__ss.sheets['진행목록'] = new Sheet('진행목록', [LH.slice(),
  mk({ '진행일': new Date(d0 - 10 * 864e5), '명단 제목': '#택10.19 모두의농수산감홍사과 5 (뽀짝오리)', '시트ID': 'SA', '폼ID': 'FA', '진행 상태': '진행중' }),
  mk({ '진행일': new Date(d0 - 5 * 864e5), '명단 제목': '#10.26 실링팬 2 (뽀짝오리)', '시트ID': 'SB', '폼ID': 'FB', '진행 상태': '진행중' }),
  mk({ '진행일': new Date(d0 - 5 * 864e5), '명단 제목': '#10.26 텀블러 2 (뽀짝오리)', '시트ID': 'SC', '폼ID': 'FC', '진행 상태': '진행중' })]);
[['GEMINI_KEY', 'AQ.testkey_zzzzzzzzzzzzzzzzzzzzzzzzzz'], ['RVRPT_SA', '1'], ['RVIMG_SA', 'D_리뷰이미지A'], ['RVRPT_SB', '1'], ['RVIMG_SB', 'D_리뷰이미지B'], ['RVINBOX_ID', 'D_리뷰 사진 받는 곳']].forEach(([k, v]) => env.__props.set(k, v));
G('rvInboxSort_(null)');
const cnt = (f, n) => { const s = f.subs.find(x => x.name === n); return s ? s.files.length : 0; };
const res = 'A 포토 ' + cnt(imgA, '포토') + ', A 구매인증 ' + cnt(imgA, '구매인증 (압축 제외)') + ', B 텍스트 ' + cnt(imgB, '텍스트') + ', 모름 ' + cnt(inbox, '어느 의뢰인지 모름') + ', 남음 ' + inbox.files.length;
console.log(res); console.log(msgs.join('\n'));
const ok = res === 'A 포토 1, A 구매인증 1, B 텍스트 1, 모름 1, 남음 0' && msgs.length === 1 && /모르는 사진이 있어요 \(1장\)/.test(msgs[0]) && /모두의농수산감홍사과, 실링팬/.test(msgs[0]);
console.log(ok ? '✓ 리뷰 사진 받는 곳 시험 통과' : 'XX 리뷰 사진 받는 곳 시험 실패');
process.exit(ok ? 0 : 1);
