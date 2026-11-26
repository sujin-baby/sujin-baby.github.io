// (11/26 한 번) 월급시트 비전이공이공 황금향 옛 줄 2개만 지움  node paydelbj_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const head = ['', '진행일', '스토어', '진행시간', '캠페인명', '특이사항', '계약 수량'];
const row = n => ['', '11/23', '비전이공이공', '', n, '', ''];
const sh = new H.Sheet('11월', [['x'], head, row('#11.23비전이공이공 황금향 토스5'), row('#11.23비전이공이공 한라봉 토스5'), row('#11.24 비전이공이공 황금향 5'), row('#11.24비전이공이공 한라봉 토스5'), row('#11.25 다른 상품 3')]);
const deleted = []; sh.deleteRow = function (r) { deleted.push(r); this.rows.splice(r - 1, 1); };
env.__sh = sh;
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(), mk({ '명단 제목': '#11.23비전이공이공 한라봉 토스5 (뽀짝오리)' }), mk({ '명단 제목': '#11.24비전이공이공 한라봉 토스5 (뽀짝오리)' })]);
G("payTab_ = function () { return __sh; };");
let e = ''; try { G('payDelBj1_()'); } catch (x) { e = String(x.stack || x); }
ok(!e, '오류 ' + e);
ok(JSON.stringify(deleted) === JSON.stringify([5, 3]), '아래 줄부터 5·3행 지움 ' + JSON.stringify(deleted));
ok(sh.rows.map(r => r[4]).join('|') === '|캠페인명|#11.23비전이공이공 한라봉 토스5|#11.24비전이공이공 한라봉 토스5|#11.25 다른 상품 3', '한라봉·다른 줄은 남김 ' + sh.rows.map(r => r[4]).join('|'));
ok(/^✓/.test(env.__props.get('PAYDELBJ1')), '기록 ' + env.__props.get('PAYDELBJ1'));
deleted.length = 0; G('payDelBj1_()'); ok(deleted.length === 0, '두 번 안 지움');
console.log(fails.length ? 'XX 월급시트 옛 줄 지우기 시험 실패:\n- ' + fails.join('\n- ') : '✓ 월급시트 비전이공이공 황금향 옛 줄 2개만 지움 시험 통과');
process.exit(fails.length ? 1 : 0);
