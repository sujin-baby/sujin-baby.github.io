// 리뷰 사진 압축 (10/26 의뢰 단위): 리뷰이미지(+리뷰캡처)에 안 나눈 사진 → '캠페인명.zip' 안 사진 + '포토 N, 텍스트 N, 별점 N.txt' (rvZip_)
//  개수 = 방마다 보낸 리뷰 가이드 배정, 못 찾으면 의뢰서. 종류 폴더로 나눴으면 '포토 N/' 폴더.  node zip_test.js <Main.js>
const { makeEnv } = require('./harness'); const vm = require('vm');
const env = makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
const it = a => { let i = 0; return { hasNext: () => i < a.length, next: () => a[i++] }; };
let k = 0, age = 3600e3;
const img = () => { const n = 'KakaoTalk_' + (++k % 7) + '.jpg', id = 'F' + k, t = new Date(Date.now() - age); return { getId: () => id, getName: () => n, getMimeType: () => 'image/jpeg', getLastUpdated: () => t, getDateCreated: () => t, getSize: () => 400000, getBlob: () => ({ setName: x => x }) }; };
const imgs = n => Array.from({ length: n }, img);
const folder = (name, files, subs) => ({ getUrl: () => 'https://drive/' + name, getName: () => name, getFiles: () => it(files || []), getFolders: () => it(subs || []) });
let zipped = null, txt = null, msgs = [], obSets = [];
env.Utilities.zip = (blobs, name) => { zipped = { name, blobs }; return {}; };
env.Utilities.newBlob = (s, type, name) => { txt = { name, s }; return name; };
G("queueMsg_ = function (room, msg, kind) { __msgs.push(room + ' | ' + kind + ' | ' + msg); }"); env.__msgs = msgs;
G("obSet_ = function (ob, id, col, val) { __obSets.push(id + ' ' + col + ' ← ' + val); }"); env.__obSets = obSets;
let OB = [];
G("outboxSheet_ = function () { return { getLastRow: function () { return __OB.length + 1; }, getRange: function () { return { getValues: function () { return __OB; } }; } }; }");
const guide = (room, lines) => ['g' + room, '2026-10-20', '방 공지', room, '🐥리뷰내용 가이드🐥\n\n' + lines.join('\n\n') + '\n\n가이드 본문 (예: 맛있다(2명) 아님)\n\n🐥🐥🐥', '보냄'];
const runs = [['#택10.20 엔케이 감홍사과 10', 10], ['#택10.21 엔케이 감홍사과 10', 10], ['#택10.22 엔케이 감홍사과 10', 10]].map(([t, n]) => ({ '명단 제목': t, '카톡방': t, '인원': n, '총건수': 30 }));
const goodOB = () => [
  guide(runs[0]['카톡방'], ['포토리뷰(2명) : 가 나', '텍스트리뷰(3명) : 다 라 마', '별점(5명) : 바 사 아 자 차']),
  guide(runs[1]['카톡방'], ['포토리뷰(2명) : 가 나', '텍스트리뷰(4명) : 다 라 마 바', '별점(4명) : 사 아 자 차']),
  guide(runs[2]['카톡방'], ['포토+한줄리뷰(1명) : 가', '텍스트리뷰(3명) : 다 라 마', '별점(6명) : 바 사 아 자 차 카']),
  ['rep1', '2026-10-26', '리뷰 보고', '사장님', '안녕하세요 #택 엔케이 감홍사과 리뷰완료되어 보고드립니다 !', '대기']
];
const show = (title, f, opt) => {
  opt = opt || {};
  zipped = null; txt = null; msgs.length = 0; obSets.length = 0; env.__f = f; env.__runs = opt.runs || runs; env.__OB = opt.ob || goodOB();
  env.__props.set('RV_SID', JSON.stringify(opt.rv || { kind: 'mix', mix: '포토 5, 텍스트 10, 별점 15' }));
  if (!opt.keep) env.__props.delete('RVZIP_SID');
  G("rvZip_(__f, '#택 엔케이 감홍사과 (응답)', PropertiesService.getScriptProperties(), 'SID', __runs)");
  const dirs = {}; (zipped ? zipped.blobs : []).forEach(b => { const d = String(b).indexOf('/') > 0 ? String(b).split('/')[0] + '/' : String(b).match(/\.txt$/) ? b : '(사진)'; dirs[d] = (dirs[d] || 0) + 1; });
  console.log('== ' + title + '\n압축:', zipped ? zipped.name + ' ' + JSON.stringify(dirs) : '안 함', txt ? '\n메모 파일 ' + txt.name + ': ' + JSON.stringify(txt.s) : '', '\n' + obSets.concat(msgs).join('\n') + '\n' + (env.__ORI_NOTES || []).splice(0).join('\n'));
};
const flat = n => ({ parent: { getFilesByName: () => it([]), createFile: () => ({ getUrl: () => 'https://zip' }), getFolders: () => it([]) }, img: folder('리뷰이미지', imgs(n)) });
// 1) 안 나누고 리뷰이미지에 30장 → 가이드 배정 개수(포토 5, 텍스트 10, 별점 15) 메모 + 보고 글에 링크
show('1) 안 나눈 사진 30장, 가이드 3방', flat(30));
// 2) 같은 사진 그대로면 다시 안 함
zipped = null; G("rvZip_(__f, '#택 엔케이 감홍사과 (응답)', PropertiesService.getScriptProperties(), 'SID', __runs)");
console.log('== 2) 그대로 두 번째 실행:', zipped ? '또 압축함(틀림)' : '다시 안 함(맞음)');
// 3) 올린 지 10분 안 됨 → 기다림 (속성도 안 씀)
age = 3 * 60e3; show('3) 방금 올림(3분 전)', flat(30)); console.log('RVZIP 속성:', JSON.stringify(env.__props.get('RVZIP_SID'))); age = 3600e3;
// 4) 가이드 못 찾은 방 → 의뢰서대로 + 알림, 사진 모자람 알림
show('4) 10.22 가이드 없음 + 사진 25장', flat(25), { ob: goodOB().filter(r => r[3] !== runs[2]['카톡방']) });
// 5) 가이드가 두 번 나가서 방 인원보다 많음 → 의뢰서대로 + 알림
show('5) 같은 방 가이드 둘 (포토 2 + 텍스트 10)', flat(30), { ob: goodOB().concat([guide(runs[0]['카톡방'], ['텍스트리뷰(10명) : …'])]) });
// 6) 의뢰서와 실제 배정이 다름 (실링팬처럼 손으로 바꿈) → 배정대로 + 알림
show('6) 의뢰서 포토 4 텍스트 11 / 배정 포토 5 텍스트 10', flat(30), { rv: { kind: 'mix', mix: '포토 4, 텍스트 11, 별점 15' } });
// 7) 원고(전체 포토리뷰) 가이드
show('7) 원고 가이드 2방', flat(10), { runs: runs.slice(0, 2).map(r => Object.assign({}, r, { '인원': 5 })), ob: [['w1', '', '방 공지', runs[0]['카톡방'], '🐥리뷰내용 가이드🐥 : 전체 포토리뷰!\n\n원고 …', '보냄'], ['w2', '', '방 공지', runs[1]['카톡방'], '🐥리뷰내용 가이드🐥 : 전체 포토리뷰!\n\n원고 …', '대기']], rv: { kind: 'text', mix: '' } });
// 8) 리뷰 종류 확인 필요 → 의뢰서도 없으면 개수 없이 압축 + 알림
show('8) 종류 확인 필요 + 의뢰서 없음', flat(30), { ob: goodOB().concat([guide(runs[1]['카톡방'], ['리뷰 종류 확인 필요(10명) : …'])]), rv: {} });
// 9) 리뷰이미지 + 직접 만든 '리뷰캡처' 폴더(같은 사진 하나는 두 폴더에 다 있음)
{ const a = imgs(20), b = imgs(9); const capF = folder('리뷰캡처', b.concat([a[0]]));
  const f = { parent: { getFilesByName: () => it([]), createFile: () => ({ getUrl: () => 'https://zip' }), getFolders: () => it([folder('리뷰이미지', a), capF, folder('다른 폴더', imgs(5))]) }, img: folder('리뷰이미지', a) };
  show('9) 리뷰이미지 20 + 리뷰캡처 9(+겹친 1) + 다른 폴더 5', f); }
// 10) 전부 포토/텍스트/별점 폴더로 나눔 → 예전처럼 '포토 N/' 폴더, 메모 없음
{ const room = (name, p, t, s) => folder(name, [], [folder('포토', imgs(p)), folder('텍스트리뷰', imgs(t)), folder('별점', imgs(s))]);
  show('10) 방마다 종류 폴더로 나눔', { parent: { getFilesByName: () => it([]), createFile: () => ({ getUrl: () => 'https://zip' }), getFolders: () => it([]) }, img: folder('리뷰이미지', [], [room('#택10.20', 2, 3, 5), room('#택10.21', 2, 4, 4), room('#택10.22', 1, 3, 6)]) }); }
// 11) 일부만 나눔 → 나눈 건 폴더, 나머지는 맨 위 + 메모
show('11) 포토 폴더 5장 + 안 나눈 25장', { parent: { getFilesByName: () => it([]), createFile: () => ({ getUrl: () => 'https://zip' }), getFolders: () => it([]) }, img: folder('리뷰이미지', imgs(25), [folder('포토', imgs(5))]) });
// 13) 실링팬처럼 한 방에 포토 가이드가 사람마다 따로(윤정 / 허예인) + 같은 글 두 번 → 이름으로 합침
show('13) 10.20 방: 포토(1명) 윤정 + 포토(1명) 허예인 + 같은 텍스트 글 두 번', flat(30), { runs: [Object.assign({}, runs[0], { '인원': 3 })], ob: [guide(runs[0]['카톡방'], ['포토리뷰(1명) : 윤정']), guide(runs[0]['카톡방'], ['포토리뷰(1명) : 허예인', '텍스트리뷰(1명) : 가']), guide(runs[0]['카톡방'], ['텍스트리뷰(1명) : 가'])], rv: { kind: 'mix', mix: '포토 2, 텍스트 1' } });
// 14) 두 계정(이름2) + 사람이 종류를 바꿈(가가 텍스트→포토) → 방 인원보다 많음 → 의뢰서대로
show('14) 나2(두 계정) 정상', flat(30), { runs: [Object.assign({}, runs[0], { '인원': 3 })], ob: [guide(runs[0]['카톡방'], ['포토리뷰(2명) : 나2', '텍스트리뷰(1명) : 가'])], rv: { kind: 'mix', mix: '포토 2, 텍스트 1' } });
show('14b) 가가 텍스트 → 포토로 바뀐 글이 또 나감', flat(30), { runs: [Object.assign({}, runs[0], { '인원': 3 })], ob: [guide(runs[0]['카톡방'], ['포토리뷰(2명) : 나2', '텍스트리뷰(1명) : 가']), guide(runs[0]['카톡방'], ['포토리뷰(1명) : 가'])], rv: { kind: 'mix', mix: '포토 2, 텍스트 1' } });
// 12) 보고 글을 이미 보냈으면 새 글로
show('12) 보고 글 이미 보냄', flat(30), { ob: goodOB().map(r => r[2] === '리뷰 보고' ? r.slice(0, 5).concat(['보냄']) : r) });
console.log('== 올리기 할 일:\n' + G("rvUploadMsg_('#택 엔케이 감홍사과 (응답)', 'https://drive.google.com/drive/folders/IMG')"));
