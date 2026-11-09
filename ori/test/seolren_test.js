// (11/9 한 번) 하루 미룸 뒤 방제 29·31: 진행목록 방제·카톡방·목표인원, 택배시트 마감 시각 값도 새 방제로  node seolren_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1', 'TAKCUT_#택11.9오늘과일설향딸기외30': '875' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
  mk({ '진행일': new Date(2026, 10, 10), '명단 제목': '#택11.10 오늘과일 설향딸기외 30 (뽀짝오리)', '카톡방': '#택11.10 오늘과일 설향딸기외 30', '택대': 'Y', '시트ID': 'S1', '목표인원': 31, '총건수': 120, '진행 상태': '진행예정' }),
  mk({ '진행일': new Date(2026, 10, 9), '명단 제목': '#택11.9 오늘과일 설향딸기외 30 (뽀짝오리)', '카톡방': '#택11.9 오늘과일 설향딸기외 30', '택대': 'Y', '시트ID': 'S1', '목표인원': 29, '인원': 29, '총건수': 120, '진행 상태': '진행중' })]);
env.__ss.sheets['보낼메시지'] = new H.Sheet('보낼메시지', [['ID', '보낼 날짜', '종류', '카톡방', '메시지', '보냄 체크'], ['m1', new Date(2026, 10, 9), '방 공지', '#택11.9 오늘과일 설향딸기외 30', '공지', '대기']]);
G("payRename_ = function (a, b) { (globalThis.__PR = globalThis.__PR || []).push(a + '→' + b); }; renameRunFiles_ = function () { return []; }; updatePay_ = function () { globalThis.__UP = 1; };");
let err = ''; try { G('seolRename1_()'); } catch (e) { err = String(e.stack || e); }
ok(!err, '오류 ' + err);
const rr = () => G('readRuns_()').map(r => [String(r['명단 제목']), String(r['카톡방']), Number(r['목표인원'])]);
const s9 = rr().filter(x => /11\.9/.test(x[0]))[0], s10 = rr().filter(x => /11\.10/.test(x[0]))[0];
ok(s9[0] === '#택11.9 오늘과일 설향딸기외 29 (뽀짝오리)' && s9[1] === '#택11.9 오늘과일 설향딸기외 29' && s9[2] === 29, '11.9 ' + JSON.stringify(s9) + ' ' + env.__props.get('SEOLREN1') + ' ' + env.__notes().join(' | '));
ok(s10[0] === '#택11.10 오늘과일 설향딸기외 31 (뽀짝오리)' && s10[1] === '#택11.10 오늘과일 설향딸기외 31' && s10[2] === 31, '11.10 ' + JSON.stringify(s10));
ok(/^✓/.test(env.__props.get('SEOLREN1')), '결과 ' + env.__props.get('SEOLREN1'));
ok(JSON.stringify(G('__PR')) === JSON.stringify(['#택11.9 오늘과일 설향딸기외 30→#택11.9 오늘과일 설향딸기외 29', '#택11.10 오늘과일 설향딸기외 30→#택11.10 오늘과일 설향딸기외 31']) && G('__UP') === 1, '월급시트 이름·다시 맞춤 ' + JSON.stringify(G('__PR')));
ok(env.__props.get('TAKCUT_#택11.9오늘과일설향딸기외29') === '875' && !env.__props.get('TAKCUT_#택11.9오늘과일설향딸기외30'), '택배시트 마감 시각도 새 방제로');
ok(env.__ss.sheets['보낼메시지'].rows[1][3] === '#택11.9 오늘과일 설향딸기외 29', '보낼메시지 방 ' + env.__ss.sheets['보낼메시지'].rows[1][3]);
console.log(fails.length ? 'XX 방제 29·31 시험 실패:\n- ' + fails.join('\n- ') : '✓ 하루 미룸 방제 29·31 (진행목록·카톡방·월급시트·마감 시각) 시험 통과');
process.exit(fails.length ? 1 : 0);
