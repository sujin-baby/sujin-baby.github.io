// (11/23 수진 님) 방제 상품 부분을 바꾸면 같은 의뢰 뒤 날짜의 아직 시작 안 한 진행(진행예정·0명)·일정 대기 줄도 새 이름으로  node renfollow_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
  mk({ '진행일': new Date(2026, 10, 23), '명단 제목': '#11.23 가짜상회 황금향 5 (뽀짝오리)', '카톡방': '#11.23 가짜상회 황금향 5', '시트ID': 'S1', '진행 상태': '진행중', '요청ID': 'abc12345', '목표인원': 5, '인원': 5 }),
  mk({ '진행일': new Date(2026, 10, 24), '명단 제목': '#11.24 가짜상회 황금향 5 (뽀짝오리)', '카톡방': '#11.24 가짜상회 황금향 5', '시트ID': 'S1', '진행 상태': '진행예정', '요청ID': 'abc12345-2', '목표인원': 5, '인원': 0 }),
  mk({ '진행일': new Date(2026, 10, 25), '명단 제목': '#11.25 가짜상회 사과 5 (뽀짝오리)', '카톡방': '#11.25 가짜상회 사과 5', '시트ID': 'S1', '진행 상태': '진행예정', '요청ID': 'abc12345-3', '목표인원': 5, '인원': 0 }),
  mk({ '진행일': new Date(2026, 10, 24), '명단 제목': '#11.24 다른상회 황금향 5 (뽀짝오리)', '카톡방': '#11.24 다른상회 황금향 5', '시트ID': 'S2', '진행 상태': '진행예정', '요청ID': 'zzz', '목표인원': 5, '인원': 0 })]);
const PH = G('PLAN_HEAD');
env.__ss.sheets['일정'] = new H.Sheet('일정', [PH.slice(),
  ['abc12345-4', '가짜상회 황금향', 4, new Date(2026, 10, 26), '#11.26 가짜상회 황금향 3', '#11.26 가짜상회 황금향 3 (뽀짝오리)', 3, '[]', '대기', JSON.stringify({ base: 'abc12345' })],
  ['qqq-2', '가짜상회 황금향', 2, new Date(2026, 10, 26), '#11.26 가짜상회 황금향 5', '#11.26 가짜상회 황금향 5 (뽀짝오리)', 5, '[]', '대기', JSON.stringify({ base: 'qqq' })]]);
G("renameRunFiles_ = function () { return []; }; updatePay_ = function () {}; payRename_ = function () {};");
let err = ''; try { G("renameRun_(readRuns_()[0], '#11.23 가짜상회 황금향 토스5', '한눈에 탭 값')"); } catch (e) { err = String(e.stack || e); }
ok(!err, '오류 ' + err);
const t = G('readRuns_()').map(r => G('bareTitle_')(r['명단 제목']));
ok(t[0] === '#11.23 가짜상회 황금향 토스5', '바꾼 진행 ' + t[0]);
ok(t[1] === '#11.24 가짜상회 황금향 토스5', '다음 날 진행예정도 ' + t[1]);
ok(t[2] === '#11.25 가짜상회 사과 5', '이름이 다르던 날은 그대로 ' + t[2]);
ok(t[3] === '#11.24 다른상회 황금향 5', '다른 의뢰는 그대로 ' + t[3]);
const pr = env.__ss.sheets['일정'].rows;
ok(pr[1][4] === '#11.26 가짜상회 황금향 토스3' && pr[1][5] === '#11.26 가짜상회 황금향 토스3 (뽀짝오리)', '일정 대기 줄 ' + JSON.stringify(pr[1].slice(4, 6)));
ok(pr[2][4] === '#11.26 가짜상회 황금향 5', '다른 의뢰 일정은 그대로 ' + pr[2][4]);
// 한 번 고치기 같은 코드가 바꾼 건 안 따라감
G("renameRun_(readRuns_()[2], '#11.25 가짜상회 배 5', '한 번 고치기')");
ok(G('bareTitle_')(G('readRuns_()')[2]['명단 제목']) === '#11.25 가짜상회 배 5', '코드가 바꾼 건 자기만');
// 날짜·인원만 바뀌면 안 따라감
G("renameRun_(readRuns_()[0], '#11.23 가짜상회 황금향 토스4', '한눈에 탭 값')");
ok(G('bareTitle_')(G('readRuns_()')[1]['명단 제목']) === '#11.24 가짜상회 황금향 토스5', '인원만 바뀐 건 안 따라감');
console.log(fails.length ? 'XX 방제 다음 일차 따라 바꾸기 시험 실패:\n- ' + fails.join('\n- ') : '✓ 방제 상품 부분을 바꾸면 다음 일차(진행예정·일정 대기)도 따라 바뀜 시험 통과');
process.exit(fails.length ? 1 : 0);
