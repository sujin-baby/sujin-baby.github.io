// (11/27 한 번) 제르넬 안마기 총 50 = 1일차 10 + 하루 5: 2일차부터 5, 모자란 날은 평일로 추가  node zrn5_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
const t0 = new Date(); t0.setHours(0, 0, 0, 0); const day = n => new Date(t0.getTime() + n * 86400000), md = d => (d.getMonth() + 1) + '.' + d.getDate();
const run = (n, cnt, got, id, st) => mk({ '진행일': day(n), '명단 제목': '#택' + md(day(n)) + '실/빈 가짜 안마기' + cnt + ' (뽀짝오리)', '카톡방': '#택' + md(day(n)) + '실/빈 가짜 안마기' + cnt, '시트ID': 'Z1', '진행 상태': st, '요청ID': id, '목표인원': cnt, '인원': got, '총건수': 50, '캠페인': '실/빈 가짜 안마기' });
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(), run(3, 10, 0, 'pyqu3j1h-3', '진행예정'), run(0, 10, 0, 'pyqu3j1h-2', '진행중'), run(-1, 10, 10, 'pyqu3j1h', '진행중')]);
const PH = G('PLAN_HEAD');
env.__ss.sheets['일정'] = new H.Sheet('일정', [PH.slice(),
  ['pyqu3j1h-4', '실/빈 가짜 안마기', 4, day(4), '#택' + md(day(4)) + '실/빈 가짜 안마기10', '#택' + md(day(4)) + '실/빈 가짜 안마기10 (뽀짝오리)', 10, '[]', '대기', '{}'],
  ['pyqu3j1h-5', '실/빈 가짜 안마기', 5, day(5), '#택' + md(day(5)) + '실/빈 가짜 안마기10', '#택' + md(day(5)) + '실/빈 가짜 안마기10 (뽀짝오리)', 10, '[]', '대기', '{}']]);
G("renameRunFiles_ = function () { return []; }; updatePay_ = function () {}; payRename_ = function () {};");
let e = ''; try { G('zrn5_()'); } catch (x) { e = String(x.stack || x); }
ok(!e, '오류 ' + e);
const rs = G('readRuns_()');
const r2 = rs.find(x => x['요청ID'] === 'pyqu3j1h-2'), r3 = rs.find(x => x['요청ID'] === 'pyqu3j1h-3');
ok(Number(r2['목표인원']) === 5 && /안마기5$/.test(G('bareTitle_')(r2['명단 제목'])), '2일차 5 ' + r2['명단 제목']);
ok(Number(r3['목표인원']) === 5, '3일차 5');
const plans = env.__ss.sheets['일정'].rows.slice(1).filter(x => x[8] === '대기');
const sum = 5 + 5 + plans.reduce((a, x) => a + Number(x[6]), 0);
ok(sum === 40 && plans.every(x => Number(x[6]) === 5) && plans.length === 6, '남은 40건 하루 5건 (진행 2 + 일정 ' + plans.length + ') 합 ' + sum);
ok(/^✓/.test(env.__props.get('ZRN5')), '기록 ' + env.__props.get('ZRN5'));
// 빈박스 날은 텍스트리뷰 (dayMix)
env.__props.set('RV_Z1', JSON.stringify({ kind: 'mix', mix: '포토리뷰 10, 텍스트리뷰 40' }));
G('zrnTxt1_()');
const rv = JSON.parse(env.__props.get('RV_Z1'));
const dmk = Object.keys(rv.dayMix || {});
ok(dmk.length === 8 && dmk.every(k => rv.dayMix[k] === '텍스트리뷰 5') && !dmk.some(k => /안마기10$/.test(k)), '2일차부터 8일 텍스트리뷰 5 ' + JSON.stringify(rv.dayMix));
console.log(fails.length ? 'XX 제르넬 하루 5건 시험 실패:\n- ' + fails.join('\n- ') : '✓ 제르넬 안마기 2일차부터 하루 5건 시험 통과');
process.exit(fails.length ? 1 : 0);
