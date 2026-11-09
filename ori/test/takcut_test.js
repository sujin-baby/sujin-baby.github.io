// 택배시트 2시 마감 (11/9): 택대 진행에서 2시 이후 구매(폼 낸 시각)는 다음 택배시트로 → 다음 날 할 일 + 한눈에 파란 줄  node takcut_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
const t0 = new Date(); t0.setHours(0, 0, 0, 0);
const day = n => new Date(t0.getTime() + n * 86400000), at = (n, h) => new Date(day(n).getTime() + h * 3600000);
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
  mk({ '진행일': day(-1), '명단 제목': '#택1.1 딸기 5 (뽀짝오리)', '시트ID': 'S1', '택대': 'Y', '진행 상태': '진행중', '인원': 5, '목표인원': 5, '총건수': 10, '마감 시각': at(-1, 15.5) }),
  mk({ '진행일': day(0), '명단 제목': '#택1.2 딸기 5 (뽀짝오리)', '시트ID': 'S1', '택대': 'Y', '진행 상태': '진행중', '인원': 2, '목표인원': 5, '총건수': 10 }),
  mk({ '진행일': day(-1), '명단 제목': '#1.1 실 밴드 2 (뽀짝오리)', '시트ID': 'S2', '택대': '', '진행 상태': '진행중', '인원': 2, '목표인원': 2, '총건수': 2 })]);
const list = new H.Sheet('명단', [['딸기'], ['타임스탬프', '수령인', '옵션'],
  [at(-1, 11.2), '가', 'a'], [at(-1, 13.9), '나', 'a'], [at(-1, 14.1), '다', 'a'], [at(-1, 15.4), '라', 'a'], [at(-1, 14.5), '취소', 'a'], [at(0, 0.5), '마', 'a']]);
Object.getPrototypeOf(list.getRange(1, 1)).getNotes = function () { return this.getValues().map(r => [r[0] && list.rows.indexOf(r) === 6 ? '취소' : '']); };
list.getRange = (function (orig) { return function (r, c, nr, nc) { const rg = orig.call(this, r, c, nr, nc); rg.getNotes = function () { const o = []; for (let i = 0; i < (nr || 1); i++) o.push([list.rows[r - 1 + i] && list.rows[r - 1 + i][1] === '취소' ? '취소한 사람' : '']); return o; }; return rg; }; })(list.getRange);
env.__LSS = { getSheetByName: n => n === '명단' ? list : null };
G("(function () { const o = SpreadsheetApp.openById; SpreadsheetApp.openById = function (id) { return id === 'S1' ? globalThis.__LSS : o(id); }; })()");
env.__ss.sheets['보낼메시지'] = new H.Sheet('보낼메시지', [['ID', '보낼 날짜', '종류', '카톡방', '메시지', '보냄 체크']]);
let err = ''; try { G('takLateCheck_(readRuns_())'); } catch (e) { err = String(e.stack || e); }
ok(!err, '오류 ' + err);
const msgs = () => env.__ss.sheets['보낼메시지'].rows.slice(1).filter(r => r[0]).map(r => r[4]);
ok(msgs().length === 1 && msgs()[0] === '[#택1.1 딸기 5] 어제 2시 이후 구매 2명 → 오늘 2시 전에 택배시트에 넣어 주세요 (한눈에 탭 그 명단 파란 줄)\n다, 라', '할 일 ' + JSON.stringify(msgs()) + ' ' + env.__notes().join(' | '));
ok(env.__props.get('TAKLATE_P_#택1.1딸기5(뽀짝오리)') === '2', '한눈에 계속 보이게 표시');
try { G('takLateCheck_(readRuns_())'); } catch (e) {}
ok(msgs().length === 1, '두 번 넣음');
// 한눈에 수식: 택대 + 첫 칸 타임스탬프일 때만
const r1 = { '택대': 'Y', '진행일': new Date(2026, 10, 9) };
ok(G('takCutFormula_')(r1, [['타임스탬프', 1]]) === '(DATE(2026,11,9)+TIME(14,0,0))', '마감 수식 ' + G('takCutFormula_')(r1, [['타임스탬프', 1]]));
ok(G('takCutFormula_')({ '택대': '', '진행일': new Date() }, [['타임스탬프', 1]]) === '' && G('takCutFormula_')(r1, [['이름', 1]]) === '', '택대 아니거나 첫 칸이 타임스탬프 아니면 없음');
console.log(fails.length ? 'XX 2시 마감 시험 실패:\n- ' + fails.join('\n- ') : '✓ 택배시트 2시 마감: 2시 이후 구매 → 다음 날 할 일·한눈에 파란 줄 시험 통과');
process.exit(fails.length ? 1 : 0);
