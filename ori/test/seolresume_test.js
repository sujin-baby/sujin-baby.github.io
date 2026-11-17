// (11/17) 오늘과일 설향딸기외 쿠팡 남은 81건 이어서: 11.17 바로구매 21명 + 11.18~20 일정 20명씩  node seolresume_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
  mk({ '진행일': new Date(2026, 10, 10), '명단 제목': '#택11.10 오늘과일 설향딸기외 10 (뽀짝오리)', '시트ID': 'SS1', '폼ID': 'F1', '인원': 10, '목표인원': 10, '총건수': 39, '일차': 2, '요청ID': '38b3hmrt-2', '진행 상태': '진행중' }),
  mk({ '진행일': new Date(2026, 10, 9), '명단 제목': '#택11.9 오늘과일 설향딸기외 29 (뽀짝오리)', '시트ID': 'SS1', '폼ID': 'F1', '인원': 29, '목표인원': 29, '총건수': 39, '일차': 1, '요청ID': '38b3hmrt', '진행 상태': '진행중' })]);
const PH = G('PLAN_HEAD');
const tpl = '★★★바로구매★★★\n공지\n1) 10명쿠팡\n🐥옵션 : 350g(특품)x1박스 (10명)\n🐥가격 : 25,600\n🐥리뷰 배정 : 포토대기\n——————————\n2) 10명쿠팡\n🐥옵션 : 3kg(로얄과) x 1박스 (10명)\n🐥가격 : 13,800\n🐥리뷰 배정 : 포토대기\n——————————\n3) 5명토스\n🐥옵션 : 1박스, 3kg (5명)\n🐥가격 : 12,400\n——————————\n4) 5명토스\n🐥옵션 : 350g (5명)\n🐥가격 : 25,600';
const cfg = { type: '입대', takdae: true, platform: '쿠팡', prices: '25600,13800,12400,25600', desc: tpl, slot2: '★★★자정 ~ 오전 7시까지 구매★★★', total: 39, camp: '오늘과일 설향딸기외', base: '38b3hmrt', opts: '350g(특품)x1박스\n3kg(로얄과) x 1박스\n1박스, 3kg\n350g' };
const cnt = lb => JSON.stringify([[10, [], lb, ['350g(특품)x1박스', '25.600']], [10, [], '포토대기', ['3kg(로얄과) x 1박스', '13.800']], [5, [], '텍스트리뷰', ['1박스, 3kg', '12.400']], [5, [], '텍스트리뷰', ['350g', '25.600']]]);
env.__ss.sheets['일정'] = new H.Sheet('일정', [PH.slice()].concat([2, 3, 4, 5].map(k => ['38b3hmrt-' + k, '오늘과일 설향딸기외', k, new Date(2026, 10, 9 + k), 'r', 't', 30, cnt(k === 4 ? '포토대기 5명 / 텍스트리뷰 5명' : k === 2 ? '포토대기' : '텍스트리뷰'), k === 2 ? '생성됨' : '취소 (쿠팡 취소)', JSON.stringify(cfg)])));
G("createRunInner_ = function (d) { globalThis.__D = d; return { notice: d.desc }; }; updatePay_ = function () {};");
let err = ''; try { G('seolResume1_()'); } catch (e) { err = String(e.stack || e); }
ok(!err, '오류 ' + err);
const st = env.__props.get('SEOLRESUME1'); ok(/^✓/.test(st), '결과 ' + st);
const d = G('globalThis.__D') || {};
ok(d.room === '#택11.17 오늘과일 설향딸기외21' && d.daily === '21' && d.slot === '★★★바로구매★★★' && d.reuse && d.n === 'seolr-3', '오늘 진행 ' + JSON.stringify([d.room, d.daily, d.slot, d.n]));
ok(/^★★★바로구매★★★/.test(d.desc) && /350g\(특품\)x1박스 \(11명\)/.test(d.desc) && /로얄과\) x 1박스 \(10명\)/.test(d.desc) && !/토스/.test(d.desc) && /1\) 11명/.test(d.desc) && /2\) 10명/.test(d.desc), '공지 ' + d.desc);
ok(!/1박스, 3kg/.test(d.opts) && /특품/.test(d.opts), '폼 보기 ' + d.opts);
const pr = env.__ss.sheets['일정'].rows.filter(r => /^seolr-/.test(r[0]));
ok(pr.length === 3 && pr.map(r => r[4]).join('|') === '#택11.18 오늘과일 설향딸기외20|#택11.19 오늘과일 설향딸기외20|#택11.20 오늘과일 설향딸기외20' && pr.every(r => r[8] === '대기' && JSON.parse(r[9]).total === 120), '일정 ' + JSON.stringify(pr.map(r => [r[0], r[4], r[6], r[8]])));
const tot = G('readRuns_()').map(r => r['총건수']); ok(tot.every(x => Number(x) === 120), '총건수 ' + tot);
let e2 = ''; try { G('seolResume1_()'); } catch (e) { e2 = String(e); }
ok(env.__ss.sheets['일정'].rows.filter(r => /^seolr-/.test(r[0])).length === 3, '두 번 돌아도 일정 3줄');
if (fails.length) { console.log('✗ ' + fails.join('\n✗ ')); process.exit(1); }
console.log('✓ 설향딸기외 쿠팡 이어서 시험 통과');
