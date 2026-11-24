// (11/25 한 번) 포두부 총 5 → 10: 일정 11.26 2·11.27 2·11.30 1 추가, 총건수 10, 남은 날 텍스트리뷰(dayMix), 리뷰 개수 포토5·텍스트5  node pdb10_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1', RV_S1: JSON.stringify({ kind: 'self', mix: '포토리뷰 5', guide: '포토2분' }) } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
const D = (m, d) => new Date(2026, m - 1, d);
const run = (d, n, id) => mk({ '진행일': D(11, d), '명단 제목': '#11.' + d + ' 실 포두부 ' + n + ' (뽀짝오리)', '카톡방': '#11.' + d + ' 실 포두부 ' + n, '시트ID': 'S1', '진행 상태': '진행중', '요청ID': id, '목표인원': n, '인원': n, '총건수': 5, '캠페인': '실 포두부' });
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(), run(25, 1, 'ngm0mcci-3'), run(24, 2, 'ngm0mcci-2'), run(23, 2, 'ngm0mcci')]);
const PH = G('PLAN_HEAD');
env.__ss.sheets['일정'] = new H.Sheet('일정', [PH.slice(), ['ngm0mcci-3', '실 포두부', 3, D(11, 25), '#11.25 실 포두부 1', '#11.25 실 포두부 1 (뽀짝오리)', 1, '[[1,[1]]]', '생성됨', '{"slot":"x"}']]);
let e = ''; try { G('pdb10_()'); } catch (x) { e = String(x.stack || x); }
ok(!e, '오류 ' + e);
const rows = env.__ss.sheets['일정'].rows;
ok(rows.length === 5, '일정 3줄 추가 ' + rows.length);
const r4 = rows.find(x => x[0] === 'ngm0mcci-4'), r5 = rows.find(x => x[0] === 'ngm0mcci-5'), r6 = rows.find(x => x[0] === 'ngm0mcci-6');
ok(r4 && r4[4] === '#11.26 실 포두부 2' && r4[5] === '#11.26 실 포두부 2 (뽀짝오리)' && r4[6] === 2 && r4[8] === '대기' && r4[7] === '[[2,[2]]]' && r4[9] === '{"slot":"x"}', '11.26 2 ' + JSON.stringify(r4));
ok(r5 && r5[4] === '#11.27 실 포두부 2' && r5[6] === 2 && r5[3].getDate() === 27, '11.27 2 ' + JSON.stringify(r5));
ok(r6 && r6[4] === '#11.30 실 포두부 1' && r6[6] === 1 && r6[3].getDate() === 30 && r6[2] === 6, '11.30 1 ' + JSON.stringify(r6));
const runs = G('readRuns_()');
ok(runs.every(x => Number(x['총건수']) === 10), '총건수 10 ' + runs.map(x => x['총건수']));
const rv = JSON.parse(env.__props.get('RV_S1'));
ok(rv.dayMix && rv.dayMix['#11.26실포두부2'] === '텍스트리뷰 2' && rv.dayMix['#11.27실포두부2'] === '텍스트리뷰 2' && rv.dayMix['#11.30실포두부1'] === '텍스트리뷰 1', 'dayMix ' + JSON.stringify(rv.dayMix));
ok(rv.mix === '포토리뷰 5' && rv.kind === 'self', '원래 리뷰 정보는 그대로');
const ex = G('rvExpect_("S1", readRuns_())');
ok(ex && ex['포토'] === 5 && ex['텍스트'] === 5 && ex['별점'] === 0, '리뷰 개수 포토5 텍스트5 ' + JSON.stringify(ex));
ok(/^✓/.test(env.__props.get('PDB10')), '기록 ' + env.__props.get('PDB10'));
// 그날 가이드: dayMix 텍스트리뷰 2
const res = G('reviewGuideMsg_(Object.assign({}, JSON.parse(__props.get("RV_S1")), { mix: "텍스트리뷰 2" }), [{ nm: "홍길동", n: 1 }, { nm: "김철수", n: 1 }], [2], 0)');
ok(/텍스트리뷰\(2명\) : 홍길동 김철수/.test(res.msg) && !/포토리뷰\(/.test(res.msg), '가이드 텍스트 ' + res.msg.slice(0, 120));
// 두 번 돌려도 그대로
G('pdb10_()'); ok(env.__ss.sheets['일정'].rows.length === 5, '두 번 안 넣음');
const src = require('fs').readFileSync(process.argv[2], 'utf8');
ok(/cfAlways_\(S, '진행목록'[\s\S]{0,3000}try \{ pdb10_\(\); \} catch \(e\) \{\}\n  \}\);/.test(src), '매번 단계(진행목록)에서 돎');
console.log(fails.length ? 'XX 포두부 10건 시험 실패:\n- ' + fails.join('\n- ') : '✓ 포두부 10건(일정 추가·텍스트리뷰) 시험 통과');
process.exit(fails.length ? 1 : 0);
