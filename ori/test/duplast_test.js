// (11/26) 중복 미리 체크: 그날 안에서 겹치면 앞에 낸 것을 체크하고 맨 나중 것은 남김 (잘못 써서 다시 내는 경우), 앞날 사람과 겹치면 오늘 것 체크  node duplast_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const T = h => new Date(2026, 10, 26, h, 0);
// 1) 폼수정 탭 (dupRows_): 4행부터 응답, B열부터 머리글(3행)
{
  const rows = [['x'], ['x'], ['', '타임스탬프', '계정명(수령인)', '전화번호', '주소'],
    [false, T(1), '홍길동', '010-0000-0001', '서울 가'],
    [false, T(2), '김철수', '010-0000-0002', '서울 나'],
    [false, T(3), '홍길동', '010-0000-0001', '서울 가 2동'],   // 홍길동 다시 냄
    [false, T(4), '박영희', '010-0000-0003', '서울 다'],
    [false, T(5), '홍길동', '010-0000-0001', '서울 가 3동']];  // 홍길동 또 냄
  const sh = new H.Sheet('폼수정', rows); env.__sh = sh;
  const m = G('dupRows_(__sh)');
  ok(JSON.stringify(m) === JSON.stringify([true, false, true, false, false]), '폼수정 탭: 홍길동 1·2번째 체크, 맨 나중(3번째) 남김 ' + JSON.stringify(m));
}
// 2) 진행 도우미 (dupList_): 앞날 사람과 겹치면 오늘 것, 그날 안에서는 앞에 낸 것
{
  const head = ['타임스탬프', '방에 참여한 카카오톡 닉네임', '계정명(수령인)', '전화번호'];
  const data = [[new Date(2026, 10, 25, 9), '닉A', '이전사람', '010-1111-0000'],   // 어제
    [T(1), '닉B', '홍길동', '010-2222-0000'],
    [T(2), '닉A', '이전사람', '010-1111-0000'],   // 어제 사람이 오늘 또 → 오늘 것 체크
    [T(3), '닉B', '홍길동', '010-2222-0000']];    // 홍길동 다시 냄 → 01시 것 체크
  const tab = new H.Sheet('설문지 응답 시트1', [head].concat(data));
  tab.getFormUrl = () => 'https://forms/x'; tab.getSheetId = () => 1;
  env.__ss2 = { getSheets: () => [tab] };
  G("SpreadsheetApp.openById = function () { return __ss2; }; rawFor_ = function () { return { getSheetId: function () { return 1; } }; }; rawHead_ = function (t) { return t.getRange(1, 1, 1, 4).getValues()[0]; }; windowOf_ = function () { return { from: new Date(2026, 10, 26).getTime(), to: new Date(2026, 10, 27).getTime() }; };");
  const out = G("dupList_({ '시트ID': 'S', '폼ID': 'F' }, [])");
  const w = out.map(o => o.why ? 1 : 0).join('');
  ok(out.length === 3 && w === '110', '도우미: 홍길동 01시·어제 사람 오늘 것 체크, 홍길동 03시 남김 ' + JSON.stringify(out.map(o => [o.label, o.why])));
}
console.log(fails.length ? 'XX 중복 미리 체크 시험 실패:\n- ' + fails.join('\n- ') : '✓ 중복 미리 체크: 그날 안에선 맨 나중 것 남김 시험 통과');
process.exit(fails.length ? 1 : 0);
