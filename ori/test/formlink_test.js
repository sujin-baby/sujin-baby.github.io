// 진행목록 폼 링크 칸: 글자는 응답 링크 그대로, 누르면 폼 수정 화면 (11/8)  node formlink_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env); const LH = G('LIST_HEADER');
const mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
const sh = new H.Sheet('진행목록', [LH.slice(), mk({ '폼 링크': 'https://forms.gle/abc', '폼ID': 'FID1' }), mk({ '폼 링크': '', '폼ID': '' })]);
const RP = Object.getPrototypeOf(sh.getRange(1, 1)); let written = null;
const rtv = t => ({ getText: () => t, getLinkUrl: () => t });
RP.getRichTextValues = function () { return this.getValues().map(r => r.map(v => v ? rtv(String(v)) : null)); };
RP.setRichTextValues = function (v) { written = v; return this; };
G("SpreadsheetApp.newRichTextValue = function () { const o = { t: '', u: '' }; o.setText = function (t) { o.t = t; return o; }; o.setLinkUrl = function (u) { o.u = u; return o; }; o.build = function () { return { t: o.t, u: o.u }; }; return o; }");
env.__sh = sh; G('listFormEditLinks_(__sh)');
const ok = JSON.stringify(written) === JSON.stringify([[{ t: "https://forms.gle/abc", u: "https://docs.google.com/forms/d/FID1/edit" }]]);
console.log(ok ? "✓ 진행목록 폼 수정 링크 시험 통과" : "XX 진행목록 폼 수정 링크 시험 실패 " + JSON.stringify(written));
process.exit(ok ? 0 : 1);
