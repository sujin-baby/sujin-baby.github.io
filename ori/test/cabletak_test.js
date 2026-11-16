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
// (11/16) 사용자: 방제·명단 시트는 바꾸면 안 됨 → 원래 이름으로, 택대는 그대로
let err2 = ''; try { G('cableRevert1_()'); } catch (e) { err2 = String(e.stack || e); }
ok(!err2, '오류2 ' + err2);
const rr2 = G('readRuns_()'), t2 = rr2.map(r => G('bareTitle_')(r['명단 제목']));
ok(t2.includes('#11.16실/빈 김상사 케이블타이5') && t2.includes('#11.17실/빈 김상사 케이블타이5') && !t2.some(x => /택/.test(x)), '원래 방제 ' + JSON.stringify(t2));
ok(rr2.filter(r => /11\.1[67]/.test(r['명단 제목'])).every(r => r['택대'] === 'Y'), '택대 그대로 Y');
const pl2 = env.__ss.sheets['일정'].rows[1];
ok(pl2[4] === '#11.18실/빈 김상사 케이블타이5' && JSON.parse(pl2[9]).takdae === true, '일정 원래 이름·택대 ' + JSON.stringify([pl2[4], pl2[9]]));
ok(G("takKeep_('#11.16실/빈 김상사 케이블타이5')") === true && G("takKeep_('#11.16 다른상품 5')") === false, 'TAK_KEEP');
ok(/^✓/.test(env.__props.get('CABLEREV1')), '결과 ' + env.__props.get('CABLEREV1'));
console.log(fails.length ? 'XX 케이블타이 택대 시험 실패:\n- ' + fails.join('\n- ') : '✓ 김상사 케이블타이 오늘부터 택대 시험 통과');
process.exit(fails.length ? 1 : 0);
