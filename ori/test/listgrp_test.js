// 명단 탭 계좌 칸 묶음(+) (11/9): 'H:K' 열 범위로 묶고 접음. 구글이 없앤 getEntireColumn 은 가짜 시트에도 없음 → 다시 쓰면 실패  node listgrp_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
function fakeSheet(hidden) {
  const hd = ['타임스탬프', '수령인', '연락처', '주소', '옵션', '닉네임', '주문번호', '은행', '계좌번호', '예금주', '리뷰비계좌다를시', '리뷰'];
  const st = { hidden: {}, depth: {}, collapsed: {} };
  hidden.forEach(c => { st.hidden[c] = true; });
  const sh = {
    st,
    getLastColumn: () => hd.length,
    getParent: () => ({ getName: () => '가짜 명단' }),
    getRange: function (a, b, c, d) {
      if (typeof a === 'string') {   // 'H:K'
        const m = /^([A-Z]+):([A-Z]+)$/.exec(a); if (!m) throw new Error('범위 ' + a);
        const n = x => x.split('').reduce((s, ch) => s * 26 + ch.charCodeAt(0) - 64, 0), c1 = n(m[1]), c2 = n(m[2]);
        return { getColumn: () => c1, shiftColumnGroupDepth: k => { for (let i = c1; i <= c2; i++) st.depth[i] = (st.depth[i] || 0) + k; } };
      }
      return { getValues: () => [hd.slice(b - 1, b - 1 + d)] };
    },
    getColumnGroupDepth: c => st.depth[c] || 0,
    getColumnGroup: (c, d) => (st.depth[c] || 0) >= d ? {
      collapse: () => { for (let i = 1; i <= hd.length; i++) if (st.depth[i]) { st.collapsed[i] = true; st.hidden[i] = true; } },
      expand: () => { for (let i = 1; i <= hd.length; i++) if (st.depth[i]) { st.collapsed[i] = false; st.hidden[i] = false; } } } : null,
    isColumnHiddenByUser: c => !!st.hidden[c],
    showColumns: c => { st.hidden[c] = false; },
    hideColumns: (c, n) => { for (let i = c; i < c + n; i++) st.hidden[i] = true; },
  };
  return { sh, lss: { getSheetByName: n => n === G('LIST_TAB') ? sh : null } };
}
const acct = [8, 9, 10, 11];
// 1) ◀▶ 로 숨겨진 시트 → 묶고 접음(+)
const a = fakeSheet(acct);
let res, err = '';
try { res = G('listRegroup_')(a.lss, false); } catch (e) { err = String(e.stack || e); }
ok(!err, '오류 ' + err);
ok(res === true, '결과 ' + res + ' GRPERR=' + env.__props.get('GRPERR'));
ok(acct.every(c => a.sh.st.depth[c] === 1 && a.sh.st.collapsed[c] && a.sh.st.hidden[c]), '묶고 접기 ' + JSON.stringify(a.sh.st));
ok(!env.__props.get('GRPERR'), '묶기 실패 기록 ' + env.__props.get('GRPERR'));
// 2) 누가 펼쳐 둔 시트 → 묶되 펼친 채(−)
const b = fakeSheet([]);
try { res = G('listRegroup_')(b.lss, false); } catch (e) { fails.push('오류2 ' + e); }
ok(res === true && acct.every(c => b.sh.st.depth[c] === 1 && !b.sh.st.hidden[c]), '펼친 시트는 묶고 펼친 채 ' + JSON.stringify(b.sh.st));
// 3) 이미 묶인 시트는 손대지 않음
const c3 = fakeSheet(acct); acct.forEach(c => { c3.sh.st.depth[c] = 1; });
ok(G('listRegroup_')(c3.lss, false) === false && acct.every(c => c3.sh.st.depth[c] === 1), '이미 묶인 시트 다시 묶음');
console.log(fails.length ? 'XX 명단 계좌 칸 묶음 시험 실패:\n- ' + fails.join('\n- ') : '✓ 명단 계좌 칸 묶음 시험 통과 (+ 로 접힘, 펼친 시트는 −)');
process.exit(fails.length ? 1 : 0);
