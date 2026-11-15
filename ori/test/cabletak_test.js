// (11/16 한 번) 김상사 케이블타이 오늘부터 택대: 방제 앞 택 + 20자, 지난 진행은 그대로, 일정 계획도  node cabletak_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
const t0 = new Date(); t0.setHours(0, 0, 0, 0); const day = n => new Date(t0.getTime() + n * 86400000);
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
  mk({ '진행일': day(-3), '명단 제목': '#11.13실/빈 김상사 케이블타이5 (뽀짝오리)', '카톡방': '#11.13실/빈 김상사 케이블타이5', '시트ID': 'S1', '진행 상태': '진행중', '인원': 5, '목표인원': 5 }),
  mk({ '진행일': day(0), '명단 제목': '#11.16실/빈 김상사 케이블타이5 (뽀짝오리)', '카톡방': '#11.16실/빈 김상사 케이블타이5', '시트ID': 'S1', '진행 상태': '진행중', '인원': 5, '목표인원': 5 }),
  mk({ '진행일': day(1), '명단 제목': '#11.17실/빈 김상사 케이블타이5 (뽀짝오리)', '카톡방': '#11.17실/빈 김상사 케이블타이5', '시트ID': 'S1', '진행 상태': '진행예정', '인원': 0, '목표인원': 5 })]);
const PH = G('PLAN_HEAD');
env.__ss.sheets['일정'] = new H.Sheet('일정', [PH.slice(), ['p4', '김상사 케이블타이', 4, day(2), '#11.18실/빈 김상사 케이블타이5', '#11.18실/빈 김상사 케이블타이5 (뽀짝오리)', 5, '[]', '대기', '{"takdae":false}']]);
G("renameRunFiles_ = function () { return []; }; updatePay_ = function () {}; payRename_ = function () {};");
let err = ''; try { G('cableTak1_()'); } catch (e) { err = String(e.stack || e); }
ok(!err, '오류 ' + err);
const rr = G('readRuns_()'), t = rr.map(r => G('bareTitle_')(r['명단 제목']));
ok(t.includes('#11.13실/빈 김상사 케이블타이5') && t.includes('#택11.16실/빈 김상사케이블타이5') && t.includes('#택11.17실/빈 김상사케이블타이5'), '오늘부터만 택 ' + JSON.stringify(t));
ok(rr.filter(r => /택11\.1[67]/.test(r['명단 제목'])).every(r => r['택대'] === 'Y') && rr.find(r => /11\.13/.test(r['명단 제목']))['택대'] !== 'Y', '택대 Y');
const pl = env.__ss.sheets['일정'].rows[1];
ok(pl[4] === '#택11.18실/빈 김상사케이블타이5' && JSON.parse(pl[9]).takdae === true, '일정 계획 ' + JSON.stringify([pl[4], pl[9]]));
ok(/^✓/.test(env.__props.get('CABLETAK1')), '결과 ' + env.__props.get('CABLETAK1'));
console.log(fails.length ? 'XX 케이블타이 택대 시험 실패:\n- ' + fails.join('\n- ') : '✓ 김상사 케이블타이 오늘부터 택대 시험 통과');
process.exit(fails.length ? 1 : 0);
