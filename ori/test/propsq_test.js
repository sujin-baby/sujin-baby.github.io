// (11/24) 속성 저장 공간: 4일 지난 리뷰 가이드 사본·끝난 시트 캐시·오래된 썸네일 지움, 공간이 차면 15분 확인 맨 앞에서 바로  node propsq_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
const t0 = new Date(); t0.setHours(0, 0, 0, 0); const day = n => new Date(t0.getTime() + n * 86400000);
const ymd = d => d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
const A = 'A'.repeat(30), B = 'B'.repeat(30), C = 'C'.repeat(30);
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
  mk({ '진행일': day(-1), '명단 제목': '#1.1 가짜 지금 5', '시트ID': A, '진행 상태': '진행중' }),
  mk({ '진행일': day(-12), '명단 제목': '#1.1 가짜 지난 5', '시트ID': B, '진행 상태': '진행중' }),
  mk({ '진행일': day(-20), '명단 제목': '#1.1 가짜 끝 5', '시트ID': C, '진행 상태': '종료' })]);
const P = env.__props;
const set = (k, v) => P.set(k, v);
set('RVTXT_RVMSGD_' + A + '_' + ymd(day(-1)), '글'); set('RVTXT_RVMSGD_' + A + '_' + ymd(day(-6)), '옛 글'); set('RVMSGD_' + A + '_' + ymd(day(-6)), '1'); set('RVSIG_RVMSGD_' + B + '_' + ymd(day(-12)), 'x');
set('LISTK_' + A, 'k'); set('LISTK_' + C, 'k'); set('THUMB_' + A, 'u'); set('THUMB_' + B, 'u'); set('GRANT_' + A + '_' + C, '1'); set('GRANT_' + A + '_' + A, '1');
set('RVDAYREQ_#1.1가짜끝5', '1'); set('RVROOMDONE_#1.1가짜끝5', '1'); set('DASH_MEMOS', '{"x":"메모"}'); set('RV_' + C, '{}');
set('MSGV_S_m1', String(Date.now() - 3 * 86400000)); set('MSGV_S_m2', String(Date.now()));
let e = ''; try { G('propsCleanup_(null, true)'); } catch (x) { e = String(x.stack || x); }
ok(!e, '오류 ' + e);
const has = k => P.get(k) !== undefined && P.get(k) !== null;
ok(has('RVTXT_RVMSGD_' + A + '_' + ymd(day(-1))), '최근 가이드 사본 남김');
ok(!has('RVTXT_RVMSGD_' + A + '_' + ymd(day(-6))) && !has('RVMSGD_' + A + '_' + ymd(day(-6))) && !has('RVSIG_RVMSGD_' + B + '_' + ymd(day(-12))), '4일 지난 가이드 사본 지움');
ok(has('LISTK_' + A) && !has('LISTK_' + C), '끝난 시트 LISTK_만 지움');
ok(has('THUMB_' + A) && !has('THUMB_' + B), '10일 지난 시트 썸네일 지움');
ok(has('GRANT_' + A + '_' + A) && !has('GRANT_' + A + '_' + C), '끝난 시트 GRANT_ 지움');
ok(has('RVDAYREQ_#1.1가짜끝5') && has('RVROOMDONE_#1.1가짜끝5') && has('DASH_MEMOS') && has('RV_' + C), '한 번만 표시·메모·리뷰 정보는 안 지움');
ok(!has('MSGV_S_m1') && has('MSGV_S_m2'), '이틀 지난 보냄 시각만');
// propsSqueeze_: 작으면 안 돎
ok(G('propsSqueeze_()') === 0, '공간 여유 있으면 안 돎');
const src = require('fs').readFileSync(process.argv[2], 'utf8');
ok(/try \{ propsSqueeze_\(\); \}[^\n]*\n  const S = cfLoad_\(\);/.test(src), '15분 확인 맨 앞');
ok((src.match(/try \{ props\.setProperty\('WANT_LOCK', String\(Date\.now\(\)\)\); \} catch \(e\) \{\}/g) || []).length === 2, '직접 하는 일은 공간이 차도');
console.log(fails.length ? 'XX 속성 정리 시험 실패:\n- ' + fails.join('\n- ') : '✓ 속성 정리: 4일 지난 가이드 사본·끝난 시트 캐시만, 공간 차면 바로 시험 통과');
process.exit(fails.length ? 1 : 0);
