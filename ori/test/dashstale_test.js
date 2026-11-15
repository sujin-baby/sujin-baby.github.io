// 한눈에 명단 칸이 명단 시트보다 적게 보이면 다시 불러오고 경고 (11/16 콜라비 10명인데 7명)  node dashstale_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(), mk({ '진행일': new Date(), '명단 제목': '#택11.16 온드프레시 콜라비 10 (뽀짝오리)', '시트ID': 'S1', '인원': 10, '진행 상태': '진행중' })]);
const rows = []; for (let i = 0; i < 60; i++) rows.push(new Array(16).fill(''));
const D = new H.Sheet('한눈에', rows);
const RP = Object.getPrototypeOf(D.getRange(1, 1)); const F = {};
RP.getFormula = function () { return F[this.r + ',' + this.c] || ''; };
RP.setFormula = function (f) { F[this.r + ',' + this.c] = f; return this; };
env.__ss.sheets['한눈에'] = D;
const top = 42;
F[(top + 2) + ',1'] = '=IFERROR(LET(d,IMPORTRANGE("https://docs.google.com/spreadsheets/d/S1","\'명단\'!A3:N"),d),"")';
for (let i = 0; i < 7; i++) D.rows[top + 1 + i][0] = new Date(2026, 10, 16, 1 + i);
env.__props.set('DASH_LISTS', JSON.stringify([{ top: top, n: 10, row: 2, t: '#택11.16 온드프레시 콜라비 10', w: 12 }]));
let out = []; try { out = G('dashListStale_()'); } catch (e) { fails.push('오류 ' + e.stack); }
ok(out.length === 1 && /7\/10/.test(out[0]), '덜 보임 찾음 ' + JSON.stringify(out));
ok(/A3:N20000"/.test(F[(top + 2) + ',1']), '다시 불러오기(범위 바꿈) ' + F[(top + 2) + ',1']);
ok(/명단 시트는 10명인데 여기 7명/.test(D.rows[top - 1][13]), '제목 줄 경고 ' + D.rows[top - 1][13]);
G('dashListStale_()');
ok(/A3:N"/.test(F[(top + 2) + ',1']), '다음에 또 바꿈(되돌림) ' + F[(top + 2) + ',1']);
for (let i = 7; i < 10; i++) D.rows[top + 1 + i][0] = new Date(2026, 10, 16, 7, i);
out = G('dashListStale_()');
ok(out.length === 0 && !D.rows[top - 1][13], '다 보이면 경고 지움 ' + JSON.stringify(D.rows[top - 1][13]));
console.log(fails.length ? 'XX 한눈에 명단 칸 늦게 불러옴 시험 실패:\n- ' + fails.join('\n- ') : '✓ 한눈에 명단 칸 덜 불러오면 다시 불러옴·경고 시험 통과');
process.exit(fails.length ? 1 : 0);
