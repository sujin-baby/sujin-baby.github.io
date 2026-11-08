// 월급시트 표 맨 아래 새 줄 (11/5 피클 인계): 위 진행 줄의 서식·수식만 복사, 값은 절대 안 가져옴, 남은 = 이 진행 앞 날 수량 빼기, 상태 = 이 줄  node paynewrow_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
// 가짜 시트에 수식 칸 (상대 참조는 복사할 때 줄만 옮김)
const sh = new H.Sheet('11월', []);
const RP = Object.getPrototypeOf(sh.getRange(1, 1));
const key = (r, c) => r + ',' + c;
const F = sh.f = {};
RP.getFormula = function () { return (this.sh.f || {})[key(this.r, this.c)] || ''; };
RP.getFormulas = function () { const o = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push((this.sh.f || {})[key(this.r + i, this.c + j)] || ''); o.push(row); } return o; };
RP.setFormula = function (f) { (this.sh.f = this.sh.f || {})[key(this.r, this.c)] = f; this.sh.cell(this.r, this.c)[this.c - 1] = '(수식)'; return this; };
const setV = RP.setValue; RP.setValue = function (x) { if (this.sh.f) delete this.sh.f[key(this.r, this.c)]; return setV.call(this, x); };
const copies = [];
RP.copyTo = function (dst) {
  if (arguments.length > 1) { copies.push(['서식', this.r, dst.r]); return; }   // 서식·체크칸만 (값 없음)
  const dr = dst.r - this.r;
  for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) {
    const f = (this.sh.f || {})[key(this.r + i, this.c + j)];
    if (f) { dst.sh.f[key(dst.r + i, dst.c + j)] = f.replace(/(\$?)([A-Z]{1,2})(\$?)(\d+)/g, (m, a, col, b, n) => b ? m : a + col + (Number(n) + dr)); dst.sh.cell(dst.r + i, dst.c + j)[dst.c + j - 1] = '(수식)'; }
    else dst.sh.cell(dst.r + i, dst.c + j)[dst.c + j - 1] = this.sh.rows[this.r - 1 + i][this.c - 1 + j];
  }
};
//          A 캠페인명      B 계약 수량  C 총액  D 남은  E 상태  F 완료보고  G 스토어  H 11/5  I 11/6  J 누계
sh.rows = [['', '', '', '', '', '', '', '', '', ''],
  ['캠페인명', '계약 수량', '총액', '남은', '상태', '완료보고', '스토어', '11/5', '11/6', '누계'],
  ['#11.5 실 밴드 10', 'S1', '(수식)', '(수식)', '(수식)', true, '아텍스', 7, '', '(수식)'],
  ['#11.6 실 밴드 10', 'S1', '(수식)', '(수식)', '(수식)', true, '아텍스', '', 3, '(수식)']];
Object.assign(F, {
  '3,3': '=J3*500', '3,4': '=B3-H3-J3', '3,5': '=IF(OR(D3=0,D4=0),"완료","진행중")', '3,10': '=SUM(H3:I3)',
  '4,3': '=J4*500', '4,4': '=B4-H4-J4-7', '4,5': '=IF(OR(D4=0,D9=0),"완료","진행중")', '4,10': '=SUM(H4:I4)',
});
G('payTab_ = function () { return globalThis.__PAY; }'); env.__PAY = sh;
const r = { '진행일': new Date(2026, 10, 6), '시트ID': 'SX', '인원': 6, '택대': '', '실배송': 'Y', '일차': 2 };
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
let res = null, err = '';
try { res = G('writePayRow_')(r, '#11.6 하루비 백팩 10', 10, 0, false, { store: '유앤아이', time: '', photo: '', earlier: 4, mult: 1 }); } catch (e) { err = String(e.stack || e); }
ok(!err, '오류 ' + err);
ok(res && res.row === 5, '새 줄 번호 ' + (res && res.row));
const v = c => sh.rows[4] ? sh.rows[4][c - 1] : undefined, f = c => F[key(5, c)] || '';
ok(v(1) === '#11.6 하루비 백팩 10', '캠페인명 ' + v(1));
ok(f(4) === '=B5-H5-J5-4', '남은 수식 ' + f(4));
ok(f(5) === '=IF(D5=0,"완료","진행중")', '상태 수식 ' + f(5));
ok(f(3) === '=J5*500' && f(10) === '=SUM(H5:I5)', '총액·누계 수식 ' + f(3) + ' ' + f(10));
ok(v(9) === 6, '11/6 수량 ' + v(9));
ok(v(8) === '' || v(8) === undefined, '11/5 칸에 위 줄 값 ' + v(8));
ok(v(7) === '유앤아이', '스토어 (위 줄 아텍스가 들어오면 안 됨) ' + v(7));
ok(v(6) === false, '완료보고 체크칸 ' + v(6));
ok(copies.some(x => x[1] === 4 && x[2] === 5), '서식 복사');
ok(F[key(4, 4)] === '=B4-H4-J4-7' && sh.rows[3][0] === '#11.6 실 밴드 10', '위 줄이 바뀜');
// 표 아래 빈 줄(체크칸만 있고 수식 없음)을 쓸 때도 위 줄 수식이 들어감 (11/8 46~50행)
sh.rows.push(['', '', '', '', '', false, '', '', '', '']);
let res2 = null;
try { res2 = G('writePayRow_')({ '진행일': new Date(2026, 10, 6), '시트ID': 'SY', '인원': 3, '택대': 'Y', '실배송': '', '일차': 1 }, '#택11.6 차량용 거치대 3', 21, 0, false, { store: '더호컴퍼니', time: '', photo: '', earlier: 0, mult: 1 }); } catch (e) { fails.push('오류2 ' + e); }
ok(res2 && res2.row === 6, '빈 줄 번호 ' + (res2 && res2.row));
ok(F[key(6, 4)] === '=B6-H6-J6' && F[key(6, 5)] === '=IF(D6=0,"완료","진행중")' && F[key(6, 10)] === '=SUM(H6:I6)', '빈 줄 수식 ' + [F[key(6, 4)], F[key(6, 5)], F[key(6, 10)]].join(' '));
ok(sh.rows[5][0] === '#택11.6 차량용 거치대 3' && sh.rows[5][8] === 3 && sh.rows[5][6] === '더호컴퍼니', '빈 줄 값 ' + JSON.stringify(sh.rows[5]));
console.log(fails.length ? 'XX 월급시트 새 줄 시험 실패:\n- ' + fails.join('\n- ') : '✓ 월급시트 새 줄 시험 통과 (서식·수식만 복사, 값 안 섞임)');
process.exit(fails.length ? 1 : 0);
