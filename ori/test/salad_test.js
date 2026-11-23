// (11/23 한 번) 유러피안 샐러드야채 2일차 30, 3일차 일정 취소  node salad_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
const t0 = new Date(); t0.setHours(0, 0, 0, 0); const day = n => new Date(t0.getTime() + n * 86400000), md = d => (d.getMonth() + 1) + '.' + d.getDate();
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
  mk({ '진행일': day(1), '명단 제목': '#' + md(day(1)) + ' 가짜 샐러드야채 20 (뽀짝오리)', '카톡방': '#' + md(day(1)) + ' 가짜 샐러드야채 20', '시트ID': 'S1', '진행 상태': '진행예정', '요청ID': 'giixndtl-2', '목표인원': 20, '인원': 0, '총건수': 50, '캠페인': '가짜 샐러드야채', '일차': 2 }),
  mk({ '진행일': day(0), '명단 제목': '#' + md(day(0)) + ' 가짜 샐러드야채 20 (뽀짝오리)', '카톡방': '#' + md(day(0)) + ' 가짜 샐러드야채 20', '시트ID': 'S1', '진행 상태': '진행중', '요청ID': 'giixndtl', '목표인원': 20, '인원': 20, '총건수': 50, '캠페인': '가짜 샐러드야채', '일차': 1 })]);
const PH = G('PLAN_HEAD');
env.__ss.sheets['일정'] = new H.Sheet('일정', [PH.slice(), ['giixndtl-3', '가짜 샐러드야채', 3, day(2), '#' + md(day(2)) + ' 가짜 샐러드야채 10', '#' + md(day(2)) + ' 가짜 샐러드야채 10 (뽀짝오리)', 10, '[]', '대기', '{}']]);
G("renameRunFiles_ = function () { return []; }; updatePay_ = function () {}; payRename_ = function () {};");
let e = ''; try { G('salad30_()'); } catch (x) { e = String(x.stack || x); }
ok(!e, '오류 ' + e);
const r = G('readRuns_()').filter(x => x['요청ID'] === 'giixndtl-2')[0];
ok(r && G('bareTitle_')(r['명단 제목']) === '#' + md(day(1)) + ' 가짜 샐러드야채 30' && Number(r['목표인원']) === 30, '2일차 30 ' + (r && r['명단 제목'] + ' ' + r['목표인원']));
ok(/^취소/.test(env.__ss.sheets['일정'].rows[1][8]), '3일차 일정 취소 ' + env.__ss.sheets['일정'].rows[1][8]);
ok(/^✓/.test(env.__props.get('SALAD30')), '기록 ' + env.__props.get('SALAD30'));
console.log(fails.length ? 'XX 샐러드야채 시험 실패:\n- ' + fails.join('\n- ') : '✓ 샐러드야채 2일차 30 시험 통과');
process.exit(fails.length ? 1 : 0);
