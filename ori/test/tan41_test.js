// (11/25 한 번) 탄탄상점 레깅스 11.25 40 → 41 (11.23 한 분 반품으로 29명)  node tan41_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
const t0 = new Date(); t0.setHours(0, 0, 0, 0); const day = n => new Date(t0.getTime() + n * 86400000), md = d => (d.getMonth() + 1) + '.' + d.getDate();
const run = (n, cnt, got, id, st) => mk({ '진행일': day(n), '명단 제목': '#' + md(day(n)) + ' 실 가짜상회 레깅스 ' + cnt + ' (뽀짝오리)', '카톡방': '#' + md(day(n)) + ' 실 가짜상회 레깅스 ' + cnt, '시트ID': 'T1', '진행 상태': st, '요청ID': id, '목표인원': cnt, '인원': got, '총건수': 100, '캠페인': '가짜상회 레깅스' });
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(), run(0, 40, 36, 'tcmlx6ic-3', '진행중'), run(-1, 30, 30, 'tcmlx6ic-2', '진행중'), run(-2, 30, 29, 'tcmlx6ic', '진행중')]);
env.__ss.sheets['일정'] = new H.Sheet('일정', [G('PLAN_HEAD').slice()]);
G("renameRunFiles_ = function () { return []; }; updatePay_ = function () {}; payRename_ = function () {};");
let e = ''; try { G('tan41_()'); } catch (x) { e = String(x.stack || x); }
ok(!e, '오류 ' + e);
const r = G('readRuns_()').filter(x => x['요청ID'] === 'tcmlx6ic-3')[0];
ok(r && Number(r['목표인원']) === 41 && /레깅스 41$/.test(G('bareTitle_')(r['명단 제목'])), '11.25 41 ' + (r && r['명단 제목'] + ' ' + r['목표인원']));
ok(/^✓/.test(env.__props.get('TAN41')), '기록 ' + env.__props.get('TAN41'));
// 앞 날 인원이 안 맞으면(반품 줄이 아직 안 빠짐) 안 바꿈
{
  const e2 = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G2 = k => vm.runInContext(k, e2);
  e2.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(), run(0, 40, 36, 'tcmlx6ic-3', '진행중'), run(-1, 30, 30, 'tcmlx6ic-2', '진행중'), run(-2, 30, 30, 'tcmlx6ic', '진행중')]);
  e2.__ss.sheets['일정'] = new H.Sheet('일정', [G2('PLAN_HEAD').slice()]);
  G2('tan41_()');
  const r2 = G2('readRuns_()').filter(x => x['요청ID'] === 'tcmlx6ic-3')[0];
  ok(Number(r2['목표인원']) === 40 && /실패/.test(e2.__props.get('TAN41')), '앞 날 30·30이면 안 바꿈 ' + e2.__props.get('TAN41'));
}
const src = require('fs').readFileSync(process.argv[2], 'utf8');
ok(/try \{ tan41_\(\); \} catch \(e\) \{\}\n  \}\);/.test(src), '매번 단계에서 돎');
console.log(fails.length ? 'XX 레깅스 41 시험 실패:\n- ' + fails.join('\n- ') : '✓ 레깅스 11.25 41 시험 통과');
process.exit(fails.length ? 1 : 0);
