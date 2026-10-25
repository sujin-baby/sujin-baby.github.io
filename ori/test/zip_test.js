// 리뷰 사진 압축: 방 폴더 안 포토/텍스트/별점 폴더 → '캠페인명.zip' 안 '포토 N/텍스트 N/별점 N' (rvZip_)  node zip_test.js <Main.js>
const { makeEnv } = require('./harness'); const vm = require('vm');
const env = makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
const it = a => { let i = 0; return { hasNext: () => i < a.length, next: () => a[i++] }; };
let k = 0; const img = () => { const n = 'KakaoTalk_' + (++k % 7) + '.jpg'; return { getName: () => n, getMimeType: () => 'image/jpeg', getLastUpdated: () => new Date(2026, 9, 26), getSize: () => 400000, getBlob: () => ({ setName: x => x }) }; };
const imgs = n => Array.from({ length: n }, img);
const folder = (name, files, subs) => ({ getName: () => name, getFiles: () => it(files || []), getFolders: () => it(subs || []) });
const room = (name, p, t, s) => folder(name, [], [folder('포토', imgs(p)), folder('텍스트리뷰', imgs(t)), folder('별점', imgs(s))]);
let zipped = null, msgs = [];
const parent = { getFilesByName: () => it([]), createFile: () => ({ getUrl: () => 'https://zip' }) };
env.Utilities.zip = (blobs, name) => { zipped = { name, blobs }; return {}; };
G("queueMsg_ = function (room, msg, kind) { __msgs.push(room + ' | ' + kind + ' | ' + msg); }"); env.__msgs = msgs;
G("outboxSheet_ = function () { return { getLastRow: function () { return 1; } }; }");
const show = (title, f, expect) => {
  zipped = null; msgs.length = 0; env.__f = f; env.__ex = expect; env.__props.delete('RVZIP_SID');
  G("rvZip_(__f, '#택 엔케이 감홍사과', PropertiesService.getScriptProperties(), 'SID', __ex)");
  const dirs = {}; (zipped ? zipped.blobs : []).forEach(b => { const d = b.split('/')[0]; dirs[d] = (dirs[d] || 0) + 1; });
  console.log('== ' + title + '\n압축:', zipped ? zipped.name + ' ' + JSON.stringify(dirs) : '안 함', '\n이름 겹침 처리 예:', zipped ? zipped.blobs.slice(0, 3).join(', ') : '', '\n' + msgs.join('\n') + '\n' + (env.__ORI_NOTES || []).splice(0).join('\n'));
};
// 1) 방 3개, 의뢰서와 개수 같음
show('방 3개 정상', { parent, img: folder('리뷰이미지', [], [room('#택10.20 엔케이 감홍사과 10', 2, 3, 5), room('#택10.21 엔케이 감홍사과 10', 2, 4, 4), room('#택10.22 엔케이 감홍사과 10', 1, 3, 6)]) }, { 포토: 5, 텍스트: 10, 별점: 15 });
// 2) 종류 폴더 밖 사진 + 개수 다름
show('종류 폴더 밖 사진 있음', { parent, img: folder('리뷰이미지', [], [room('#택10.20 엔케이 감홍사과 10', 2, 3, 5), folder('#택10.21 엔케이 감홍사과 10', imgs(10))]) }, { 포토: 5, 텍스트: 10, 별점: 15 });
// 3) 종류 폴더 안에 방 폴더
show('포토/텍스트/별점 폴더 안에 방 폴더', { parent, img: folder('리뷰이미지', [], [folder('포토', [], [folder('10.20', imgs(2)), folder('10.21', imgs(3))]), folder('텍스트', imgs(10)), folder('별점 15', imgs(15))]) }, null);
// 4) 같은 사진 그대로면 다시 안 함 + 같은 파일 이름 처리
console.log('== 같은 이름 사진:', zipped.blobs.filter(b => b.indexOf('/_') > 0).slice(0, 3).join(', '));
zipped = null; G("rvZip_(__f, '#택 엔케이 감홍사과', PropertiesService.getScriptProperties(), 'SID', __ex)");
console.log('== 사진 그대로일 때 두 번째 실행:', zipped ? '또 압축함(틀림)' : '다시 안 함(맞음)');
