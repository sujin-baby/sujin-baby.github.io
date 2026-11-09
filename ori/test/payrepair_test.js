// 월급시트 줄 모양 고치기 (11/10): 캠페인명은 있는데 남은 칸 수식이 없는 진행 줄 → 위 줄 서식·수식 복사(값 그대로), 손으로 넣은 줄·이월 줄은 그대로, 표 아래 여분 5줄  node payrepair_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const sh = new H.Sheet('11월', []);
const RP = Object.getPrototypeOf(sh.getRange(1, 1));
const key = (r, c) => r + ',' + c;
const F = sh.f = {};
RP.getFormula = function () { return (this.sh.f || {})[key(this.r, this.c)] || ''; };
RP.getFormulas = function () { const o = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push((this.sh.f || {})[key(this.r + i, this.c + j)] || ''); o.push(row); } return o; };
RP.setFormula = function (f) { (this.sh.f = this.sh.f || {})[key(this.r, this.c)] = f; this.sh.cell(this.r, this.c)[this.c - 1] = '(수식)'; return this; };
RP.setBackground = function () { return this; };
const fmt = [];
RP.copyTo = function (dst) {
  if (arguments.length > 1) { fmt.push([this.r, dst.r]); return; }
  const dr = dst.r - this.r;
  for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) {
    const f = (this.sh.f || {})[key(this.r + i, this.c + j)];
    if (f) { dst.sh.f[key(dst.r + i, dst.c + j)] = f.replace(/(\$?)([A-Z]{1,2})(\$?)(\d+)/g, (m, a, col, b, n) => b ? m : a + col + (Number(n) + dr)); dst.sh.cell(dst.r + i, dst.c + j)[dst.c + j - 1] = '(수식)'; }
  }
};
let maxRows = 7;
sh.getMaxRows = () => maxRows; sh.insertRowsAfter = (a, k) => { maxRows += k; };
//          A 캠페인명      B 계약 수량  C 총액  D 남은  E 상태  F 완료보고  G 특이사항  H 11/5  I 11/6  J 누계
sh.rows = [['', '', '', '', '', '', '', '', '', ''],
  ['캠페인명', '계약 수량', '총액', '남은', '상태', '완료보고', '특이사항', '11/5', '11/6', '누계'],
  ['#11.5 실 밴드 10', 10, '(수식)', '(수식)', '(수식)', true, '1일차', 7, '', '(수식)'],
  ['#11.6 실 밴드 10', 10, '', '', '', true, '2일차', '', 3, ''],          // 진행 줄인데 수식 없음 (체크는 켜져 있음)
  ['#11.6 하루비 백팩 4', 12, '', '', '', false, '1일차', '', 4, ''],      // 진행 줄인데 수식 없음
  ['손으로 넣은 줄', 5, '', '', '', '', '', '', '', ''],                  // 진행목록에 없음 → 그대로
  ['#11.6 실 이월캠 3', 9, '', '', '', '', '10월 이월', '', '', '']];      // 이월 줄 → 그대로
Object.assign(F, { '3,3': '=J3*500', '3,4': '=B3-H3-J3-7', '3,5': '=IF(OR(D3=0,D4=0),"완료","진행중")', '3,10': '=SUM(H3:I3)' });
G('payLayout_ = function () { return { head: 2, name: 1, qty: 2, sum: 3, left: 4, status: 5, report: 6, note: 7, days: { "11-5": 8, "11-6": 9 } }; }');
const known = { '#11.5실밴드10': 1, '#11.6실밴드10': 1, '#11.6하루비백팩4': 1, '#11.6실이월캠3': 1 };
let out = null, err = '';
try { out = G('payRepairRows_')(sh, known); } catch (e) { err = String(e.stack || e); }
ok(!err, '오류 ' + err);
ok(JSON.stringify(out) === JSON.stringify(['#11.6실밴드10', '#11.6하루비백팩4']), '고친 줄 ' + JSON.stringify(out));
ok(F[key(4, 4)] === '=B4-H4-J4' && F[key(5, 4)] === '=B5-H5-J5', '남은 칸 (앞 날 -7은 뗌) ' + F[key(4, 4)] + ' ' + F[key(5, 4)]);
ok(F[key(4, 5)] === '=IF(D4=0,"완료","진행중")' && F[key(4, 3)] === '=J4*500' && F[key(4, 10)] === '=SUM(H4:I4)', '상태·총액·누계 ' + [F[key(4, 5)], F[key(4, 3)], F[key(4, 10)]].join(' '));
ok(sh.rows[3][5] === true && sh.rows[4][5] === false, '완료보고 체크 그대로 ' + sh.rows[3][5] + ' ' + sh.rows[4][5]);
ok(sh.rows[3][0] === '#11.6 실 밴드 10' && sh.rows[3][8] === 3 && sh.rows[4][1] === 12, '값 그대로');
ok(!F[key(6, 4)] && !F[key(7, 4)], '손으로 넣은 줄·이월 줄은 그대로');
ok(fmt.some(x => x[1] === 4) && fmt.some(x => x[1] === 5), '서식(테두리) 복사');
// 여분 줄: 마지막 캠페인 줄(본보기: 남은 칸 수식 있는 줄) 아래 5줄
sh.rows = sh.rows.slice(0, 5); maxRows = 6; fmt.length = 0;
G('paySpareRows_')(sh);
ok(maxRows === 10, '시트 끝 늘림 ' + maxRows);
ok([6, 7, 8, 9, 10].every(r => fmt.some(x => x[1] === r)), '여분 5줄 모양 ' + JSON.stringify(fmt));
console.log(fails.length ? 'XX 월급시트 줄 모양 고치기 시험 실패:\n- ' + fails.join('\n- ') : '✓ 월급시트 줄 모양 고치기·여분 줄 시험 통과');
process.exit(fails.length ? 1 : 0);
