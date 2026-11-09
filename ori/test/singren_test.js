// (11/10 한 번) 싱싱곳간 방제 20자: '#택11.10 싱싱곳간 시나노골드10', 다음 날도. 월급시트 이름도 (상품 이름이 줄어도)  node singren_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
  mk({ '진행일': new Date(2026, 10, 11), '명단 제목': '#택11.11 싱싱곳간시나노골드사과10 (뽀짝오리)', '카톡방': '#택11.11 싱싱곳간시나노골드사과10', '택대': 'Y', '시트ID': 'S1', '목표인원': 10, '총건수': 20, '진행 상태': '진행예정', '캠페인': '싱싱곳간시나노골드사과' }),
  mk({ '진행일': new Date(2026, 10, 10), '명단 제목': '#택11.10 싱싱곳간시나노골드사과10 (뽀짝오리)', '카톡방': '#택11.10 싱싱곳간시나노골드사과10', '택대': 'Y', '시트ID': 'S1', '목표인원': 10, '총건수': 20, '진행 상태': '진행중', '캠페인': '싱싱곳간시나노골드사과' })]);
env.__ss.sheets['보낼메시지'] = new H.Sheet('보낼메시지', [['ID', '보낼 날짜', '종류', '카톡방', '메시지', '보냄 체크'], ['m1', new Date(2026, 10, 11), '방 공지', '#택11.11 싱싱곳간시나노골드사과10', '공지', '대기']]);
G("payRename_ = (function (o) { return function (a, b) { (globalThis.__PR = globalThis.__PR || []).push(a + '→' + b + (globalThis.__PAY_RENAME_ANY ? ' (any)' : '')); }; })(); renameRunFiles_ = function () { return []; }; updatePay_ = function () { globalThis.__UP = 1; };");
let err = ''; try { G('singRename1_()'); } catch (e) { err = String(e.stack || e); }
ok(!err, '오류 ' + err);
const tt = G('readRuns_()').map(r => String(r['명단 제목']) + '|' + r['카톡방'] + '|' + r['목표인원']);
ok(tt.indexOf('#택11.10 싱싱곳간 시나노골드10 (뽀짝오리)|#택11.10 싱싱곳간 시나노골드10|10') >= 0 && tt.indexOf('#택11.11 싱싱곳간 시나노골드10 (뽀짝오리)|#택11.11 싱싱곳간 시나노골드10|10') >= 0, '방제 ' + JSON.stringify(tt) + ' ' + env.__props.get('SINGREN1'));
ok(/^✓/.test(env.__props.get('SINGREN1')) && G('__UP') === 1, '결과 ' + env.__props.get('SINGREN1'));
ok((G('__PR') || []).length === 2 && G('__PR').every(x => / \(any\)$/.test(x)), '월급시트 이름 (상품 이름이 줄어도) ' + JSON.stringify(G('__PR')));
ok(env.__ss.sheets['보낼메시지'].rows[1][3] === '#택11.11 싱싱곳간 시나노골드10', '보낼메시지 방');
ok(G('globalThis.__PAY_RENAME_ANY') === false, '끝나면 원래대로');
console.log(fails.length ? 'XX 싱싱곳간 방제 시험 실패:\n- ' + fails.join('\n- ') : '✓ 싱싱곳간 방제 20자로 바꿈 시험 통과');
process.exit(fails.length ? 1 : 0);
