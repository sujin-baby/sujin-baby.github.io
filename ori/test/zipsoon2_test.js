// 보고 글 '곧 다시 보기' (11/27 도레미파머스마켓 사과: 사진 정리가 끝났는데 한 시간 다시 보기 제한에 걸려 보고 글이 50분 늦게 뜸)
//  + 다 확인된 의뢰의 '[업체 전달 못 함]' 할 일 끝내기.  node zipsoon2_test.js <Main.js>
const { makeEnv } = require('./harness'); const vm = require('vm');
const env = makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const it = a => { let i = 0; return { hasNext: () => i < a.length, next: () => a[i++] }; };
let k = 0, age = 3600e3;
const img = () => { const id = 'F' + (++k), t = new Date(Date.now() - age); return { getId: () => id, getName: () => 'K' + id + '.jpg', getMimeType: () => 'image/jpeg', getLastUpdated: () => t, getDateCreated: () => t, getSize: () => k, getDescription: () => '' }; };
const folder = (name, files, subs) => ({ getUrl: () => 'https://drive/' + name, getId: () => 'D' + name, getName: () => name, getFiles: () => it(files || []), getFolders: () => it(subs || []), setSharing: () => {} });
const typedF = (p, t) => ({ parent: { getId: () => 'PAR', getFilesByName: () => it([]), createFile: () => ({ getUrl: () => 'https://f', setContent: () => {} }), getFolders: () => it([]) },
  img: folder('리뷰이미지', [], [folder('포토', Array.from({ length: p }, img)), folder('텍스트', Array.from({ length: t }, img))]) });
const msgs = [];
G("queueMsg_ = function (room, msg, kind) { __msgs.push(kind + ' | ' + msg); }"); env.__msgs = msgs;
G("outboxSheet_ = function () { return { getLastRow: function () { return __OB.length + 1; }, getRange: function () { return { getValues: function () { return __OB; } }; } }; }");
env.__OB = [];
const P = () => env.__props;
const mine = [{ '명단 제목': '#11.11 도레미파머스마켓 사과20', '카톡방': '#11.11 도레미파머스마켓 사과20', '인원': 20, '총건수': 20, '진행일': new Date(2026, 10, 11) }];
env.__mine = mine;
const zip = f => { env.__f = f; return G("rvZip_(__f, '# 도레미파머스마켓 사과', PropertiesService.getScriptProperties(), 'SID', __mine)"); };
// 1) 사진을 방금 옮김(3분 전) → 기다림 + 곧 다시 보기 표시
age = 3 * 60e3;
ok(zip(typedF(4, 16)) === 'wait', '방금 옮긴 사진이면 기다림');
const f1 = P().get('RVZIPSOON_SID');
ok(f1, '기다릴 때 곧 다시 보기 표시를 남김 (안 남기면 한 시간 뒤)');
ok(!P().get('RVZIP_SID') && !msgs.length, '기다릴 때는 보고 글·기록 안 씀');
// 이미 있던 표시는 새로 안 씀 (3시간 지나면 지워지게)
P().set('RVZIPSOON_SID', '12345');
zip(typedF(4, 16));
ok(P().get('RVZIPSOON_SID') === '12345', '있던 표시 시각은 안 바꿈');
// 2) 10분 지남 → 보고 글 + 'done', 다시 부르면 'same'
age = 3600e3;
ok(zip(typedF(4, 16)) === 'done', '10분 지나면 보고 글 만듦');
ok(msgs.length === 1 && /리뷰 보고/.test(msgs[0]) && /포토리뷰 4개, 텍스트리뷰 16개/.test(msgs[0]), '보고 글 개수 ' + msgs.join(' / '));
const sig = P().get('RVZIP_SID');
// 같은 사진이면 그대로 (sig는 newest 시각 포함 → 같은 파일 묶음으로 다시)
k = 0;
P().set('RVZIP_SID', sig);
// 3) 5분 확인(rvZipSoon_): rvZip_가 'same'이면 표시 지움, 'wait'이면 남김
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
const d = new Date(Date.now() - 10 * 86400000);
env.__ss.sheets['진행목록'] = new (require('./harness').Sheet)('진행목록', [LH.slice(),
  mk({ '진행일': d, '명단 제목': '#11.11 가 20', '시트ID': 'A1', '인원': 20, '폴더 링크': 'x' }),
  mk({ '진행일': d, '명단 제목': '#11.11 나 20', '시트ID': 'B1', '인원': 20, '폴더 링크': 'x' })]);
const now = Date.now();
['A1', 'B1'].forEach(s => { P().set('RVZIPSOON_' + s, String(now - 60000)); P().set('RVRPT_' + s, '1'); P().set('RVZIP_' + s, 'v4:old'); });
G("rvFolder_ = function () { return { img: {}, parent: {} }; }; rvZip_ = function (f, n, props, sid) { return sid === 'A1' ? 'same' : 'wait'; };");
G("DriveApp.getFileById = function (id) { return { getName: function () { return '# ' + id; } }; }");
G('rvZipSoon_()');
ok(!P().get('RVZIPSOON_A1'), "보고 글이 이미 지금 사진과 같으면('same') 표시 지움");
ok(P().get('RVZIPSOON_B1'), "아직 기다리면('wait') 표시 남김");
// 4) '[업체 전달 못 함]' 할 일 끝내기: 같은 캠페인·같은 날짜·대기인 것만
const marked = [];
G("markMsgSide_ = function (id, st) { __marked.push(id + ' ' + st); }"); env.__marked = marked;
env.__OB = [
  ['t1', '2026-11-11', '할 일', '내 할 일', '[업체 전달 못 함] 도레미파머스마켓 사과 (11.11) — 리뷰 확인 안 된 4명: 가 나 다 라\n→ 그분 리뷰를 확인하고', '대기'],
  ['t2', '2026-11-16', '할 일', '내 할 일', '[업체 전달 못 함] 도레미파머스 부사사과 (11.16) — 리뷰 확인 안 된 5명: 마', '대기'],
  ['t3', '2026-11-11', '할 일', '내 할 일', '[업체 전달 못 함] 도레미파머스마켓 사과 (11.11) — 리뷰 확인 안 된 1명: 가', '보냄'],
  ['t4', '2026-11-12', '할 일', '내 할 일', '[업체 전달 못 함] 도레미파머스마켓 사과 (11.12) — 리뷰 확인 안 된 1명: 가', '대기'],
  ['r1', '2026-11-11', '리뷰 보고', '사장님', '[업체 전달 못 함] 도레미파머스마켓 사과 (11.11) — ', '대기']];
ok(G('rvStuckTodoDone_(__mine)') === 1 && JSON.stringify(marked) === '["t1 보냄"]', '같은 의뢰 대기 할 일만 보냄으로 ' + JSON.stringify(marked));
// 5) 한 번 고치기: 막힘 표시가 없는(=다 확인됐거나 보낸) 의뢰 중 남은 할 일이 있는 것만 명단 시트를 다시 읽게
env.__ss.sheets['진행목록'] = new (require('./harness').Sheet)('진행목록', [LH.slice(),
  mk({ '진행일': new Date(2026, 10, 11), '명단 제목': '#11.11 도레미파머스마켓 사과20', '시트ID': 'S_DONE', '인원': 20 }),
  mk({ '진행일': new Date(2026, 10, 16), '명단 제목': '#11.16 도레미파머스 부사사과20', '시트ID': 'S_STUCK', '인원': 20 }),
  mk({ '진행일': new Date(2026, 10, 12), '명단 제목': '#11.12 다른캠페인20', '시트ID': 'S_NOTODO', '인원': 20 })]);
['S_DONE', 'S_STUCK', 'S_NOTODO'].forEach(s => { P().set('RVSTUCKMSG_' + s, '1'); P().set('RVSEEN_' + s, 'sig'); });
P().set('RVSTUCK_S_STUCK', '{"n":5}');
G('stuckDone1_()');
ok(!P().get('RVSEEN_S_DONE'), '다 확인된 의뢰는 다시 읽게 함');
ok(P().get('RVSEEN_S_STUCK') === 'sig', '아직 막힌 의뢰는 그대로');
ok(P().get('RVSEEN_S_NOTODO') === 'sig', '남은 할 일이 없으면 그대로');
ok(/^✓/.test(P().get('STUCKDONE1') || ''), '한 번만 ' + P().get('STUCKDONE1'));
console.log(fails.length ? 'XX 보고 글 곧 다시 보기 시험 실패:\n- ' + fails.join('\n- ') : '✓ 보고 글 곧 다시 보기·업체 전달 못 함 할 일 끝내기 시험 통과');
process.exit(fails.length ? 1 : 0);
