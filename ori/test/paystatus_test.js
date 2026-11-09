// 월급시트 상태: 의뢰 마지막 날이 다음 달 탭이면 앞 달 탭 줄도 그 탭 남은 칸으로 이어 '완료' (11/9 백발백중 10.26~10.30 '진행중')  node paystatus_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const tab = (name, id, f) => ({ getName: () => name, getSheetId: () => id, f, getRange: function (r, c) { const self = this; return { getFormula: () => self.f[r] || '', setFormula: v => { self.f[r] = v; }, getValue: () => 1, setValue: () => {} }; } });
const st = (r, or) => '=IF(I' + r + '=0, "시작전", IF(' + or + ',"완료", IF(O' + r + '<0,"초과진행","진행중")))';
const oct = tab('10월', 101, { 5: st(5, 'OR(O5=0,O9=0)'), 9: st(9, 'O9=0') });
const nov = tab('11월', 202, { 12: st(12, 'OR(O12=0,O20=0)'), 30: st(30, 'O30=0') });
const L = { status: 17, name: 5 };
const rows = [{ sh: oct, L, row: 5 }, { sh: oct, L, row: 9 }, { sh: nov, L, row: 12 }, { sh: nov, L, row: 30 }];
let err = ''; try { G('payStatusLink_')(rows); } catch (e) { err = String(e.stack || e); }
ok(!err, '오류 ' + err);
ok(oct.f[5] === st(5, "OR(O5=0,'11월'!O30=0)"), '10월 5행 ' + oct.f[5]);
ok(oct.f[9] === st(9, "OR(O9=0,'11월'!O30=0)"), '10월 9행(10월 마지막) ' + oct.f[9]);
ok(nov.f[12] === st(12, 'OR(O12=0,O30=0)'), '11월 12행 ' + nov.f[12]);
ok(nov.f[30] === st(30, 'O30=0'), '11월 마지막 줄은 그대로 ' + nov.f[30]);
const snap = JSON.stringify([oct.f, nov.f]);
G('payStatusLink_')(rows);
ok(JSON.stringify([oct.f, nov.f]) === snap, '두 번 돌려도 그대로');
// 다음 달로 더 이어지면 (12월 탭 마지막) 다시 이음
const dec = tab('12월', 303, { 3: st(3, 'O3=0') });
G('payStatusLink_')(rows.concat([{ sh: dec, L, row: 3 }]));
ok(oct.f[5] === st(5, "OR(O5=0,'12월'!O3=0)") && nov.f[30] === st(30, "OR(O30=0,'12월'!O3=0)"), '12월로 이어짐 ' + oct.f[5] + ' / ' + nov.f[30]);
// 지운 줄을 보던 상태 칸(#REF!)도 마지막 날 줄로 다시 이음 (11/9 황금향외 11.10 줄 삭제)
const nv2 = tab('11월', 404, { 10: st(10, 'OR(O10=0,#REF!=0)'), 41: st(41, 'O41=0') });
G('payStatusLink_')([{ sh: nv2, L, row: 10 }, { sh: nv2, L, row: 41 }]);
ok(nv2.f[10] === st(10, 'OR(O10=0,O41=0)'), '#REF! → 마지막 줄 ' + nv2.f[10]);
// 0명 취소 진행(같은 날 같은 방제)은 묶음에서 빼서 진짜 줄 이음을 되돌리지 않음
const src = require('fs').readFileSync(process.argv[2], 'utf8');
ok(/function payChainRows_[\s\S]{0,1600}'종료' && !\(Number\(r\['인원'\]\) > 0\)\) return;/.test(src) && /payStatusLink_\(payChainRows_\(/.test(src), 'payStatusAll_(payChainRows_)가 0명 취소 진행을 뺌');   // 11/9 줄 찾기를 payChainRows_로 뺌
// 미리보기(dry): 시트는 안 바꾸고 할 일만 알려 줌
const oct2 = tab('10월', 101, { 48: '=IF(G48=0, "시작전", IF(O48=0,"완료", IF(O48<0,"초과진행","진행중")))' });
const rep = G('payStatusLink_')([{ sh: oct2, L, row: 48 }, { sh: nov, L, row: 30 }], true);
ok(oct2.f[48].indexOf('OR(') < 0 && rep.some(x => /10월!48 바꿈/.test(x)), '미리보기 ' + JSON.stringify(rep));
G('payStatusLink_')([{ sh: oct2, L, row: 48 }, { sh: nov, L, row: 30 }]);
ok(oct2.f[48] === "=IF(G48=0, \"시작전\", IF(OR(O48=0,'11월'!O30=0),\"완료\", IF(O48<0,\"초과진행\",\"진행중\")))", '10.26 꼴(G48) 줄도 이음 ' + oct2.f[48]);
// 새 달 탭·새 줄: 다른 탭 참조도 원래 모양으로 (12월 탭 줄이 11월 칸을 보고 '완료'가 되면 안 됨)
const src2 = G('newMonthTab_.toString()') + G('payNewRowFromAbove_.toString()');
const reNew = /IF\\\(\\s\*OR\\\(\\s\*\(\[A-Z\]\+\\d\+\)\\s\*=\\s\*0\\s\*,\\s\*\(\?:'\(\?:\[\^'\]\|''\)\+'!\|\[\^\\s,\(\)'!\]\+!\)\?/;
ok(reNew.test(src2), '새 달 탭 정규식에 다른 탭 참조');
console.log(fails.length ? 'XX 월급시트 상태 잇기 시험 실패:\n- ' + fails.join('\n- ') : '✓ 월급시트 상태: 다음 달 탭 마지막 줄로 이음 시험 통과');
process.exit(fails.length ? 1 : 0);
