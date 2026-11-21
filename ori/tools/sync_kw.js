// ori/tools/sync_kw.js — 키워드 사전 한 곳(ori/kw_dict.json) → 생성기·확장·북마크·유저스크립트에 써 넣기 (v208, 11/21)
//
//  왜: 같은 품목·수식어 목록이 9군데(생성기 bm-src·us-src·본문 2블록, ext/oy.js, ext/bg.js,
//      product-helper.user.js)에 복제돼 서로 어긋났어요. v207의 `면도기`는 생성기에만,
//      `무타공`은 확장에만 있었습니다. 이제 ori/kw_dict.json 만 고치고 이 명령을 돌립니다.
//
//  쓰는 법:
//    node ori/tools/sync_kw.js            사전을 각 파일의 표시 구간(/* ORI-KW-DICT:BEGIN … */)에 써 넣기
//    node ori/tools/sync_kw.js --check    각 구간이 사전과 같은지만 확인 (다르면 exit 1 — CI가 씀)
//
//  사전을 고친 뒤 순서: sync_kw.js → node ori/tools/build_userscript.js → (ext를 고쳤으면) python3 ori/tools/pack_ext.py
//  us-src·product-helper.user.js 는 bm-src 사본이라 여기서 직접 고치지 않고, --check 가 어긋남만 알려 줍니다.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DICT = path.join(ROOT, 'ori', 'kw_dict.json');

/* 정규식 안에서 뜻이 있는 글자만 이스케이프 (한글·영문·숫자는 그대로) */
const esc = s => String(s).replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&');

/* 긴 말이 먼저 오게 (읽기 좋고, '고구마말랭이'가 '말랭이'보다 앞) */
const byLen = list => list.map((w, i) => ({ w: w, i: i })).sort((a, b) => (b.w.length - a.w.length) || (a.i - b.i)).map(x => x.w);

function readDict() {
  const d = JSON.parse(fs.readFileSync(DICT, 'utf8'));
  const arr = k => {
    const v = d[k];
    if (!Array.isArray(v) || !v.length) throw new Error('ori/kw_dict.json 에 "' + k + '" 목록이 없어요');
    return v.map(x => String(x).trim()).filter(Boolean);
  };
  return { d, arr };
}

/* 사전 → 정규식 글자 (여기가 규칙의 원본) */
function sources() {
  const { arr } = readDict();
  const exact = arr('exactNouns').map(w => '^' + esc(w) + '$');     // 1글자 농산물(무·배·감)은 낱말 전체가 같을 때만
  const nouns = byLen(arr('nouns')).map(esc);
  const stops = byLen(arr('modifiers').concat(arr('tails'))).map(esc);   // 수식어 + 끝 군더더기(남성·여성·미니·대형·세트…)
  const colors = byLen(arr('colors')).map(esc);                       // 색·사이즈 (숫자+단위는 코드의 spec()이 걸러요)
  const places = byLen(arr('places')).map(esc);                       // 가구·자리 말(식탁·책상…) — 키워드에서 뺌
  const types = byLen(arr('types')).map(esc);                         // 같은 종류 상품 이름(선풍기·청소기…) — '대표 + 종류' 후보
  return {
    nouns: '/(?:' + nouns.concat(exact).join('|') + ')$/',
    stop: '/^(?:' + stops.join('|') + ')$/i',
    colors: '/^(?:' + colors.join('|') + ')$/i',
    places: '/^(?:' + places.join('|') + ')$/',
    types: '/(?:' + types.join('|') + ')$/'
  };
}

/* 써 넣을 곳 — 표시 주석 사이를 이 내용으로 바꿔요. verify:true 는 사본(생성물)이라 고치지 않고 대조만 */
const TARGETS = [
  // 생성기 안 북마크 코드 (쿠팡 PC·모바일 북마크) — us-src·product-helper.user.js 는 이 구간을 그대로 복사해요
  { file: 'guide/index.html', id: 'bm_noun', name: 'NOUN_SUFFIX', kind: 'nouns', indent: '    ' },
  { file: 'guide/index.html', id: 'bm_stop', name: 'STOP', kind: 'stop', indent: '    ' },
  { file: 'guide/index.html', id: 'bm_color', name: 'KW_COLOR', kind: 'colors', indent: '    ' },
  // 생성기 본문 — suggestKeywords(대표 키워드·짧은 상품명)와 sugKw(추천 목록)
  { file: 'guide/index.html', id: 'body_kwstop', name: 'KW_STOP', kind: 'stop', indent: '  ' },
  { file: 'guide/index.html', id: 'body_prodnoun', name: 'PROD_NOUN', kind: 'nouns', indent: '  ' },
  { file: 'guide/index.html', id: 'body_noun', name: 'NOUN_SUFFIX', kind: 'nouns', indent: '    ' },
  { file: 'guide/index.html', id: 'body_color', name: 'KW_COLOR', kind: 'colors', indent: '    ' },
  { file: 'guide/index.html', id: 'body_sugn', name: 'NOUN_SUFFIX', kind: 'nouns', indent: '    ' },
  { file: 'guide/index.html', id: 'body_sugstop', name: 'STOP', kind: 'stop', indent: '    ' },
  { file: 'guide/index.html', id: 'body_sugcolor', name: 'KW_COLOR', kind: 'colors', indent: '    ' },
  { file: 'guide/index.html', id: 'body_off', name: 'OFF', kind: 'places', indent: '    ' },
  { file: 'guide/index.html', id: 'body_type', name: 'TYPE', kind: 'types', indent: '    ' },
  // 확장 프로그램 · 휴대폰 북마크(올리브영·토스)
  { file: 'ori/ext/oy.js', id: 'oy_noun', name: 'NOUN_SUFFIX', kind: 'nouns', indent: '    ' },
  { file: 'ori/ext/oy.js', id: 'oy_stop', name: 'STOP', kind: 'stop', indent: '    ' },
  { file: 'ori/ext/oy.js', id: 'oy_color', name: 'KW_COLOR', kind: 'colors', indent: '    ' },
  // 확장 프로그램 (키워드 추천은 화면 안 page.js가 아니라 bg.js)
  { file: 'ori/ext/bg.js', id: 'bg_noun', name: 'NOUN_SUFFIX', kind: 'nouns', indent: '' },
  { file: 'ori/ext/bg.js', id: 'bg_stop', name: 'KW_STOP', kind: 'stop', indent: '' },
  { file: 'ori/ext/bg.js', id: 'bg_color', name: 'KW_COLOR', kind: 'colors', indent: '' }
];

const begin = id => '/* ORI-KW-DICT:BEGIN ' + id + ' */';
const end = id => '/* ORI-KW-DICT:END ' + id + ' */';
const line = t => t.indent + 'const ' + t.name + ' = ' + t.rx + ';';

function regions(text, id) {
  const re = new RegExp('(\\/\\* ORI-KW-DICT:BEGIN ' + id + ' \\*\\/)([\\s\\S]*?)(\\/\\* ORI-KW-DICT:END ' + id + ' \\*\\/)', 'g');
  const out = []; let m;
  while ((m = re.exec(text))) out.push({ start: m.index, end: m.index + m[0].length, inner: m[2], whole: m[0] });
  return out;
}

/* 구간 안에서 사전과 다른 낱말 찾기 (사람이 읽을 수 있게) */
function diffWords(inner, want) {
  const words = s => new Set((s.match(/\\?[^\s|\\/()^$;=*+]+/g) || []).map(w => w.replace(/^\\/, '')));
  const a = words(inner), b = words(want);
  const missing = [...b].filter(w => !a.has(w));
  const extra = [...a].filter(w => !b.has(w));
  return { missing: missing, extra: extra };
}

function main() {
  const check = process.argv.indexOf('--check') >= 0;
  const RXs = sources();
  const perFile = {};
  TARGETS.forEach(t => { (perFile[t.file] = perFile[t.file] || []).push(t); });

  let bad = 0, done = 0;
  Object.keys(perFile).forEach(file => {
    const full = path.join(ROOT, file);
    const before = fs.readFileSync(full, 'utf8');
    let text = before;
    perFile[file].forEach(t => {
      t.rx = RXs[t.kind];
      const want = line(t);
      const rs = regions(text, t.id);
      if (!rs.length) { console.error('✗ ' + file + ' 에 표시 구간 ' + begin(t.id) + ' 가 없어요'); bad++; return; }
      // 뒤에서부터 바꿔야 앞 구간의 위치가 안 밀려요 (같은 파일에 사본 구간이 둘일 수 있음: bm-src·us-src)
      rs.slice().reverse().forEach(r => {
        const cur = r.inner.replace(/^\s+|\s+$/g, '');
        if (cur === want.trim()) { done++; return; }
        if (check) {
          const d = diffWords(cur, want);
          console.error('✗ ' + file + ' [' + t.id + '] 사전과 달라요' +
            (d.missing.length ? ' — 빠짐: ' + d.missing.slice(0, 8).join(', ') + (d.missing.length > 8 ? ' 외 ' + (d.missing.length - 8) + '개' : '') : '') +
            (d.extra.length ? ' / 사전에 없음: ' + d.extra.slice(0, 8).join(', ') + (d.extra.length > 8 ? ' 외 ' + (d.extra.length - 8) + '개' : '') : ''));
          bad++;
        } else {
          const nl = r.inner.indexOf('\n') >= 0 ? '\n' : '';
          const ind = t.indent || '';
          text = text.slice(0, r.start) + ind + begin(t.id) + nl + want + nl + ind + end(t.id) + text.slice(r.end);
          done++;
        }
      });
    });
    if (!check && text !== before) { fs.writeFileSync(full, text, 'utf8'); }
  });

  if (check) {
    if (bad) {
      console.error('\n✗ 키워드 사전이 ' + bad + '곳에서 어긋났어요. `node ori/tools/sync_kw.js` 로 맞춘 뒤 다시 확인하세요.');
      process.exit(1);
    }
    console.log('✓ 키워드 사전 ' + done + '곳이 ori/kw_dict.json 과 같음');
  } else {
    if (bad) { console.error('\n✗ ' + bad + '곳을 못 맞췄어요'); process.exit(1); }
    console.log('✓ 키워드 사전 ' + done + '곳을 ori/kw_dict.json 으로 맞춤');
    console.log('  다음: node ori/tools/build_userscript.js  (us-src·product-helper.user.js 사본 맞추기)');
  }
}

if (require.main === module) main();
module.exports = { sources: sources, TARGETS: TARGETS };
