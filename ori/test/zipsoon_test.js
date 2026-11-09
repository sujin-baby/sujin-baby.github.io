// 받는 곳에서 사진이 들어간 다 끝난 의뢰 → 5분마다 보고 글 확인 (11/9 나주배: 30분 정리에서만 봐서 늦게 뜸)  node zipsoon_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const now = Date.now();
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1', RVZIPSOON_S1: String(now - 60000), RVRPT_S1: '1', RVZIPSOON_S2: String(now - 60000), RVZIPSOON_S3: String(now - 60000), RVRPT_S3: '1', RVZIPSOON_S4: String(now - 4 * 3600000), RVRPT_S4: '1' } });
const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
const d = new Date(now - 10 * 86400000);
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
  mk({ '진행일': d, '명단 제목': '#10.30 나주배 20 (뽀짝오리)', '시트ID': 'S1', '인원': 20, '폴더 링크': 'x' }),
  mk({ '진행일': d, '명단 제목': '#10.30 아직 10 (뽀짝오리)', '시트ID': 'S2', '인원': 10, '폴더 링크': 'x' }),
  mk({ '진행일': d, '명단 제목': '#10.30 보낸것 5 (뽀짝오리)', '시트ID': 'S3', '인원': 5, '폴더 링크': 'x', '업체 전송': d }),
  mk({ '진행일': d, '명단 제목': '#10.30 오래됨 5 (뽀짝오리)', '시트ID': 'S4', '인원': 5, '폴더 링크': 'x' })]);
G("rvFolder_ = function () { return { img: {}, parent: {} }; }; rvZip_ = function (f, n, props, sid) { (globalThis.__Z = globalThis.__Z || []).push(sid); if (!globalThis.__WAIT) props.setProperty('RVZIP_' + sid, 'v4:new'); };");
G("DriveApp.getFileById = function (id) { return { getName: function () { return '# ' + id; }, getLastUpdated: function () { return new Date(); } }; }");
// 1) 사진이 아직 올라가는 중(rvZip_가 보고 글 안 만듦) → 표시 남김
env.__WAIT = true;
G('rvZipSoon_()');
ok(JSON.stringify(G('__Z')) === '["S1"]', '다 끝나고 안 보낸 의뢰만 봄 ' + JSON.stringify(G('__Z')));
ok(env.__props.get('RVZIPSOON_S1') && env.__props.get('RVZIPSOON_S2'), '아직이면 표시 남김');
ok(!env.__props.get('RVZIPSOON_S3') && !env.__props.get('RVZIPSOON_S4'), '보낸 의뢰·3시간 지난 표시는 지움');
// 2) 보고 글 생김 → 표시 지움
env.__WAIT = false; env.__Z = [];
ok(G('rvZipSoon_()') === 1 && !env.__props.get('RVZIPSOON_S1') && env.__props.get('RVZIP_S1') === 'v4:new', '보고 글 생기면 표시 지움');
ok(env.__props.get('RVZIPSOON_S2'), '리뷰 아직인 의뢰 표시는 남김');
console.log(fails.length ? 'XX 보고 글 5분 확인 시험 실패:\n- ' + fails.join('\n- ') : '✓ 받는 곳 사진 → 보고 글 5분 확인 시험 통과');
process.exit(fails.length ? 1 : 0);
