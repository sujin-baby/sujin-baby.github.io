// (11/16) '실 실' 두 번 / 다음 일차 방제가 1일차(생성기에서 고친 것)를 안 따름  node plantitle_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const ws = t => G('withSil_(' + JSON.stringify(t) + ')');
ok(ws('#11.17실 에스지엠컴퍼니문풍지외3') === '#11.17실 에스지엠컴퍼니문풍지외3', '날짜에 붙은 실은 그대로 ' + ws('#11.17실 에스지엠컴퍼니문풍지외3'));
ok(ws('#11.17 실 에스지엠 3') === '#11.17 실 에스지엠 3' && ws('#11.17 에스지엠 3') === '#11.17 실 에스지엠 3', '실 없으면 붙임');
ok(ws('#11.17실/빈 김상사 케이블타이5') === '#11.17실/빈 김상사 케이블타이5', '실/빈 그대로');
ok(ws('#11.17실버반석 3') === '#11.17 실 실버반석 3', '실버반석은 실이 아님');
const pdt = (b, d, t) => G('planDayTitle_(' + [b, d, t].map(x => JSON.stringify(x)).join(',') + ')');
ok(pdt('#11.16 앨비나프레시 황금향 10', '2026-11-17', '#11.17 앨비나프레시 제주황금10') === '#11.17 앨비나프레시 황금향 10', '1일차 방제 따라 ' + pdt('#11.16 앨비나프레시 황금향 10', '2026-11-17', '#11.17 앨비나프레시 제주황금10'));
ok(pdt('#택11.16 오늘과일 설향딸기외 10', '2026-11-18', '#택11.18 오늘과일 설향딸기외 5') === '#택11.18 오늘과일 설향딸기외 5', '끝 숫자는 그날');
// savePlan_: 일정 탭에 1일차 방제 기준으로
env.__ss.sheets['일정'] = new H.Sheet('일정', [G('PLAN_HEAD').slice()]);
const plan = [{ k: 2, date: '2026-11-17', room: '#11.17 앨비나프레시 제주황금10', title: '#11.17 앨비나프레시 제주황금10 (뽀짝오리)', n: 10, c: [] }];
env.__D = { n: 'RQ1', title: '#11.16 앨비나프레시 황금향 10 (뽀짝오리)', room: '#11.16 앨비나프레시 황금향 10', desc: '공지', plan: Buffer.from(JSON.stringify(plan)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_') };
env.Utilities.base64DecodeWebSafe = b => Array.from(Buffer.from(b.replace(/-/g, '+').replace(/_/g, '/'), 'base64')); env.Utilities.newBlob = a => ({ getDataAsString: () => Buffer.from(a).toString('utf8') });
let err = ''; try { G('savePlan_(__D)'); } catch (e) { err = String(e.stack || e); }
ok(!err, '오류 ' + err);
const pr = env.__ss.sheets['일정'].rows[1] || [];
ok(pr[4] === '#11.17 앨비나프레시 황금향 10' && pr[5] === '#11.17 앨비나프레시 황금향 10 (뽀짝오리)', '일정 계획 이름 ' + JSON.stringify([pr[4], pr[5]]));
// (11/16) 이미 생긴 다음 일차: '#택11.17 과일쏙 못난이사과외 6' → 바로 앞 진행 '#택11.16 과일쏙 사과감귤 토스6' 따라
//  (11/17 v186) 날짜를 오늘 기준으로 동적 생성 — 하드코딩해 두면 날짜가 넘어갈 때 day(1)이 11.18이 되어 시험이 깨짐
{
  const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
  const t0 = new Date(); t0.setHours(0, 0, 0, 0); const day = n => new Date(t0.getTime() + n * 86400000);
  const dm = d => (d.getMonth() + 1) + '.' + d.getDate();
  const d0 = dm(day(0)), d1 = dm(day(1)), dPast = dm(day(-12));
  env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
    mk({ '진행일': day(-12), '명단 제목': '#택' + dPast + ' (업체명) 귤외 6 (뽀짝오리)', '시트ID': 'S9', '인원': 6, '진행 상태': '진행중' }),
    mk({ '진행일': day(0), '명단 제목': '#택' + d0 + ' 과일쏙 사과감귤 토스6 (뽀짝오리)', '카톡방': '#택' + d0 + ' 과일쏙 사과감귤 토스6', '시트ID': 'S1', '인원': 6, '진행 상태': '진행중' }),
    mk({ '진행일': day(1), '명단 제목': '#택' + d1 + ' 과일쏙 못난이사과외 6 (뽀짝오리)', '카톡방': '#택' + d1 + ' 과일쏙 못난이사과외 6', '시트ID': 'S1', '인원': 0, '목표인원': 6, '진행 상태': '진행예정', '요청ID': 'RQ7-2' }),
    mk({ '진행일': day(1), '명단 제목': '#택' + d1 + ' 오늘과일 귤외 6 (뽀짝오리)', '시트ID': 'S9', '인원': 0, '진행 상태': '진행예정' }),
    mk({ '진행일': day(0), '명단 제목': '#택' + d0 + ' 오늘과일 귤외 6 (뽀짝오리)', '시트ID': 'S9', '인원': 3, '진행 상태': '진행중' })]);
  G("renameRunFiles_ = function () { globalThis.__RF = 1; return []; }; updatePay_ = function () {}; payRename_ = function () {};");
  let e2 = ''; try { G('planNameFix1_()'); } catch (e) { e2 = String(e.stack || e); }
  ok(!e2, '오류2 ' + e2);
  const t = G('readRuns_()').map(r => G('bareTitle_')(r['명단 제목']));
  ok(t.includes('#택' + d1 + ' 과일쏙 사과감귤 토스6') && !t.includes('#택' + d1 + ' 과일쏙 못난이사과외 6'), '내일 진행 이름 ' + JSON.stringify(t));
  ok(t.includes('#택' + d1 + ' 오늘과일 귤외 6'), '바로 앞 진행과 같은 이름은 그대로');
  ok(G('typeof __RF === "undefined"'), '명단 시트·폼 파일 이름은 안 바꿈');
  ok(/^✓/.test(env.__props.get('PLANNAME1')), '결과 ' + env.__props.get('PLANNAME1'));
}
// (11/16 사용자 승인) '#11.17 실 실 …' → '#11.17 실 …', 명단 시트 이름도
{
  const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
  env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(), mk({ '진행일': new Date(), '명단 제목': '#11.17 실 실 에스지엠컴퍼니문풍지외3 (뽀짝오리)', '카톡방': '#11.17 실 실 에스지엠컴퍼니문풍지외3', '시트ID': 'S3', '실배송': 'Y' })]);
  G("renameRunFiles_ = function (r, o, n) { globalThis.__RN = [o, n]; return []; }");
  G('silsil1_()');
  const t = G('readRuns_()').map(r => G('bareTitle_')(r['명단 제목']));
  ok(t[0] === '#11.17 실 에스지엠컴퍼니문풍지외3' && JSON.stringify(G('__RN')) === JSON.stringify(['# 실 실 에스지엠컴퍼니문풍지외', '# 실 에스지엠컴퍼니문풍지외']), '실 실 고침 ' + JSON.stringify([t, G('__RN')]));
}
// (11/16) 문풍지 3 + 풍선 1 = 4: 11.17 방제·목표 4, 11.18 계획 2 (풍선 0)
{
  const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
  env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(), mk({ '진행일': new Date(2026, 10, 17), '명단 제목': '#11.17 실 실 에스지엠컴퍼니문풍지외3 (뽀짝오리)', '카톡방': '#11.17 실 실 에스지엠컴퍼니문풍지외3', '시트ID': 'S3', '목표인원': 3, '인원': 0, '요청ID': 'nd6', '실배송': 'Y' })]);
  env.__ss.sheets['일정'] = new H.Sheet('일정', [G('PLAN_HEAD').slice(), ['nd6-2', 'x', 2, new Date(2026, 10, 18), '#11.18 실 문풍지 풍선 3', '#11.18 실 문풍지 풍선 3 (뽀짝오리)', 3, '[[2,1],[1,1]]', '대기', '{}']]);
  G("renameRunFiles_ = function () { return []; }");
  G('mungFix1_()');
  const r = G('readRuns_()')[0], pr = env.__ss.sheets['일정'].rows[1];
  ok(G('bareTitle_')(r['명단 제목']) === '#11.17 실 에스지엠컴퍼니문풍지외4' && Number(r['목표인원']) === 4, '11.17 방제·목표 ' + r['명단 제목'] + ' ' + r['목표인원']);
  ok(pr[4] === '#11.18 실 에스지엠컴퍼니문풍지외2' && pr[6] === 2 && pr[7] === '[[2,1],[0,1]]', '11.18 계획 ' + JSON.stringify(pr.slice(4, 8)) + ' ' + env.__props.get('MUNGFIX1'));
}
// (11/21) 명단 시트·폼·폴더 이름에 끝 인원 숫자 없음 — 상품명에 붙여 쓴 숫자도 (인원 줄 때)
{
  const sn = (t, c) => G('sheetName_(' + JSON.stringify(t) + (c === undefined ? '' : ',' + JSON.stringify(c)) + ')');
  ok(sn('#11.16 실 가짜상회 크리노바5', '5') === '# 실 가짜상회 크리노바', '붙은 인원 숫자 ' + sn('#11.16 실 가짜상회 크리노바5', '5'));
  ok(sn('#11.16 실 가짜상회 크리노바5') === '# 실 가짜상회 크리노바5', '인원 모르면 붙은 숫자는 그대로 ' + sn('#11.16 실 가짜상회 크리노바5'));
  ok(sn('#택11.12 가짜상회 엔부사과 30', '30') === '#택 가짜상회 엔부사과', '띄어 쓴 인원 ' + sn('#택11.12 가짜상회 엔부사과 30', '30'));
  ok(sn('#11.16 가짜상회 장갑15', '5') === '# 가짜상회 장갑', '인원 5에 장갑15 ' + sn('#11.16 가짜상회 장갑15', '5'));
  ok(sn('#11.16 가짜상회 에어팟3 10', '10') === '# 가짜상회 에어팟3', '상품명 숫자는 남김 ' + sn('#11.16 가짜상회 에어팟3 10', '10'));
  ok(sn('#11.16 가짜상회 문풍지외4', '4') === '# 가짜상회 문풍지외', '외4 ' + sn('#11.16 가짜상회 문풍지외4', '4'));
}
console.log(fails.length ? 'XX 실 두 번·다음 일차 방제 시험 실패:\n- ' + fails.join('\n- ') : '✓ 실 두 번 안 붙음·다음 일차 방제는 1일차 따라 시험 통과');
process.exit(fails.length ? 1 : 0);
