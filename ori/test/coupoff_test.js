// (11/10 한 번) 오늘과일 설향딸기외 쿠팡 취소: 일정 대기 줄 쿠팡 인원 0·건수·방제, 이미 만든 11.11 진행 공지 토스만·방제·목표·폼 설명·쿠팡 보기 빼기  node coupoff_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const SEP = '————————————————————————';
const blk = (n, who, kw, opt) => [n + ') ' + who, '🐥판매처 : 오늘과일', '🐥★키워드 : ' + kw, '🐥옵션 : ' + opt, '🐥가격 : 1,000', '🐥리뷰 : 포토대기'].join('\n');
const tplOf = (a, b, c, d) => ['★★★자정 ~ 오전 7시까지 구매★★★', '☆★☆★ 양식 작성 폼 ☆★☆★', 'https://forms.gle/AAA', '', blk(1, a + '명쿠팡 - ' + a + '명 :', '설향딸기', '350g(특품)x1박스'), '', SEP, '', blk(2, b + '명쿠팡 - ' + b + '명 :', '황금향', '3kg'), '', SEP, '', blk(3, c + '명토스 - ' + c + '명 :', '콜라비', '1박스'), '', SEP, '', blk(4, d + '명토스 - ' + d + '명 :', '설향딸기', '350g')].join('\n');
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
  mk({ '진행일': new Date(2026, 10, 11), '명단 제목': '#택11.11 오늘과일설향딸기외20 (뽀짝오리)', '카톡방': '#택11.11 오늘과일설향딸기외20', '택대': 'Y', '시트ID': 'S1', '폼ID': 'F1', '목표인원': 20, '총건수': 120, '진행 상태': '진행예정', '캠페인': '오늘과일 설향딸기외' }),
  mk({ '진행일': new Date(2026, 10, 10), '명단 제목': '#택11.10 오늘과일 설향딸기외 10 (뽀짝오리)', '카톡방': '#택11.10 오늘과일 설향딸기외 10', '택대': 'Y', '시트ID': 'S1', '폼ID': 'F1', '목표인원': 10, '총건수': 120, '진행 상태': '진행중', '캠페인': '오늘과일 설향딸기외' })]);
const notice11 = tplOf(5, 5, 5, 5);
env.__ss.sheets['보낼메시지'] = new H.Sheet('보낼메시지', [['ID', '보낼 날짜', '종류', '카톡방', '메시지', '보냄 체크'], ['n11', new Date(2026, 10, 11), '방 공지', '#택11.11 오늘과일설향딸기외20', notice11, '대기']]);
const cfg = JSON.stringify({ desc: tplOf(5, 5, 5, 5), opts: '설향딸기 350g(특품)x1박스\n황금향 3kg\n콜라비 1박스\n설향딸기 350g', slot2: 'S' });
env.__ss.sheets['일정'] = new H.Sheet('일정', [G('PLAN_HEAD').slice(),
  ['x-4', '오늘과일 설향딸기외', 4, new Date(2026, 10, 12), '#택11.12 오늘과일설향딸기외20', '#택11.12 오늘과일설향딸기외20 (뽀짝오리)', 20, JSON.stringify([[5], [5], [5], [5]]), '대기', cfg],
  ['x-5', '오늘과일 설향딸기외', 5, new Date(2026, 10, 13), '#택11.13 오늘과일설향딸기외20', '#택11.13 오늘과일설향딸기외20 (뽀짝오리)', 20, JSON.stringify([[10], [10], [0], [0]]), '대기', cfg],
  ['y-2', '다른 캠페인', 2, new Date(2026, 10, 12), '#11.12 밴드 5', '#11.12 밴드 5 (뽀짝오리)', 5, '[[5]]', '대기', cfg]]);
const form = { desc: G('formDesc_')(notice11), choices: ['설향딸기 350g(특품)x1박스', '황금향 3kg', '황금향 13,800', '콜라비 1박스', '설향딸기 350g', '설향딸기 25.600'] };
env.__FORM = form;
G("FormApp.openById = function () { const f = globalThis.__FORM; return { getDescription: function () { return f.desc; }, setDescription: function (d) { f.desc = d; } }; }; formChoices_ = function () { return globalThis.__FORM.choices.slice(); }; setOptionChoices_ = function (f, o) { globalThis.__FORM.choices = String(o).split('\\n'); }; formDescForget_ = function () {};");
G("payRename_ = function () {}; renameRunFiles_ = function () { return []; }; updatePay_ = function () {};");
let err = ''; try { G('seolCoupangOff1_()'); } catch (e) { err = String(e.stack || e); }
ok(!err, '오류 ' + err);
const pr = env.__ss.sheets['일정'].rows.slice(1);
ok(pr[0][6] === 10 && pr[0][7] === JSON.stringify([[0], [0], [5], [5]]) && pr[0][4] === '#택11.12 오늘과일설향딸기외10', '11.12 일정 ' + JSON.stringify(pr[0].slice(4, 9)) + ' ' + env.__props.get('SEOLCOU1'));
ok(pr[1][8] === '취소 (쿠팡 취소)', '11.13 일정(쿠팡만) 취소 ' + pr[1][8]);
ok(pr[2][6] === 5 && pr[2][8] === '대기', '다른 캠페인 그대로');
const r11 = G('readRuns_()').filter(r => /11\.11/.test(r['명단 제목']))[0];
ok(String(r11['명단 제목']) === '#택11.11 오늘과일설향딸기외10 (뽀짝오리)' && Number(r11['목표인원']) === 10, '11.11 진행 ' + r11['명단 제목'] + ' ' + r11['목표인원']);
const ob = env.__ss.sheets['보낼메시지'].rows.slice(1).filter(r => r[0] === 'n11')[0];
ok(ob && ob[4].indexOf('쿠팡') < 0 && /^1\) 5명토스/m.test(ob[4]) && ob[3] === '#택11.11 오늘과일설향딸기외10', '11.11 공지 ' + (ob && ob[3]));
ok(form.desc.indexOf('쿠팡') < 0 && form.desc.indexOf('콜라비') > 0, '폼 설명');
ok(JSON.stringify(form.choices) === JSON.stringify(['콜라비 1박스', '설향딸기 350g', '설향딸기 25.600']), '폼 보기 ' + JSON.stringify(form.choices));
const tots = G('readRuns_()').map(r => Number(r['총건수']));
ok(tots.every(x => x === 30), '총건수 = 오늘 10 + 11.11 10 + 11.12 10 = 30 ' + JSON.stringify(tots) + ' ' + env.__props.get('SEOLCOU1'));
ok(JSON.parse(env.__ss.sheets['일정'].rows[1][9]).total === 30 && JSON.parse(env.__ss.sheets['일정'].rows[3][9]).total !== 30, '일정 설정 총건수 (그 캠페인만)');
console.log(fails.length ? 'XX 쿠팡 취소 시험 실패:\n- ' + fails.join('\n- ') : '✓ 설향딸기외 쿠팡 취소 (일정·11.11 진행·공지·폼) 시험 통과');
process.exit(fails.length ? 1 : 0);
