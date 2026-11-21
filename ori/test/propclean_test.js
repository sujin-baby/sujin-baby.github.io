// 속성 정리 (11/16 데이터 용량 오류): 캐시성 속성만, 진행목록에 없는 명단 시트 것·30일 지난 리뷰 글·사흘 지난 체크 시각  node propclean_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const LIVE = 'L'.repeat(30), DEAD = 'D'.repeat(30);
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(), mk({ '진행일': new Date(), '명단 제목': '#11.16 a 1', '시트ID': LIVE })]);
const old = '20200101', now = new Date(), d8 = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
[['LISTK_' + LIVE, 'x'], ['LISTK_' + DEAD, 'x'], ['RVSEEN_' + DEAD, 'x'], ['THUMB_' + DEAD, 'x'], ['RVDONE_' + DEAD, '1'], ['RVTXT_RVMSGD_' + LIVE + '_' + old, 'x'], ['RVTXT_RVMSGD_' + LIVE + '_' + d8, 'x'],
 ['MSGV_S_a', String(Date.now() - 5 * 86400000)], ['MSGV_S_b', String(Date.now())], ['RVIMG_' + DEAD, 'keep']].forEach(([k, v]) => env.__props.set(k, v));
const n = G('propsCleanup_()');
const has = k => env.__props.get(k) != null;
ok(n === 5, '지운 개수 ' + n);
ok(has('LISTK_' + LIVE) && !has('LISTK_' + DEAD) && !has('RVSEEN_' + DEAD) && !has('THUMB_' + DEAD), '진행목록에 없는 캐시만');
ok(has('RVDONE_' + DEAD) && has('RVIMG_' + DEAD), '캐시 아닌 것은 그대로');
ok(!has('RVTXT_RVMSGD_' + LIVE + '_' + old) && has('RVTXT_RVMSGD_' + LIVE + '_' + d8), '30일 지난 리뷰 글만');
ok(!has('MSGV_S_a') && has('MSGV_S_b'), '사흘 지난 체크 시각만');
ok(G('propsCleanup_()') === 0, '하루 한 번');
console.log(fails.length ? 'XX 속성 정리 시험 실패:\n- ' + fails.join('\n- ') : '✓ 속성 정리 시험 통과');
process.exit(fails.length ? 1 : 0);
