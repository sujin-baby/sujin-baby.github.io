// 가짜 구글 객체로 Main.js를 돌리는 시험대 (TZ=Asia/Seoul로 실행)
const fs = require('fs'), vm = require('vm');
function chain(target) { return new Proxy(target, { get(t, k) { if (k in t) return t[k]; if (k === 'then') return undefined; return function () { return proxyObj; }; } }); }
const proxyObj = new Proxy(function () {}, { get(t, k) { if (k === 'then') return undefined; if (k === Symbol.toPrimitive) return () => ''; return proxyObj; }, apply() { return proxyObj; } });
function colNum(s) { let n = 0; for (const ch of s) n = n * 26 + ch.charCodeAt(0) - 64; return n; }
function colName(n) { let s = ''; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; }
class Sheet {
  constructor(name, rows) { this.name = name; this.rows = rows || []; this.writes = []; return chain(this); }
  getName() { return this.name; }
  getLastRow() { let l = this.rows.length; while (l && this.rows[l - 1].every(c => c === '' || c == null)) l--; return l; }
  getLastColumn() { return Math.max(1, ...this.rows.map(r => r.length)); }
  getMaxRows() { return Math.max(this.rows.length, 1000); }
  cell(r, c) { while (this.rows.length < r) this.rows.push([]); const row = this.rows[r - 1]; while (row.length < c) row.push(''); return row; }
  getRange(a, b, c, d) {
    if (typeof a === 'string') { const m = a.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/); const r1 = +m[2], c1 = colNum(m[1]); const r2 = m[4] ? +m[4] : r1, c2 = m[3] ? colNum(m[3]) : c1; return new Range(this, r1, c1, r2 - r1 + 1, c2 - c1 + 1); }
    return new Range(this, a, b, c || 1, d || 1);
  }
  getDataRange() { return this.getRange(1, 1, Math.max(this.getLastRow(), 1), this.getLastColumn()); }
  insertRowBefore(r) { this.rows.splice(r - 1, 0, []); }
  insertRowsBefore(r, n) { for (let i = 0; i < n; i++) this.rows.splice(r - 1, 0, []); }
  deleteRow(r) { this.rows.splice(r - 1, 1); }
  appendRow(v) { this.rows.splice(this.getLastRow(), 0, v.slice()); }
  getFilter() { return null; }
  getSheetId() { return 1; }
}
class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); return chain(this); }
  getValues() { const out = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) { const rr = this.sh.rows[this.r - 1 + i]; row.push(rr && rr[this.c - 1 + j] !== undefined ? rr[this.c - 1 + j] : ''); } out.push(row); } return out; }
  getValue() { return this.getValues()[0][0]; }
  getDisplayValues() { return this.getValues().map(r => r.map(String)); }
  setValues(v) { v.forEach((row, i) => row.forEach((x, j) => { this.sh.cell(this.r + i, this.c + j)[this.c - 1 + j] = x; })); this.sh.writes.push(['setValues', this.r, this.c, v.length]); return this; }
  setValue(x) { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh.cell(this.r + i, this.c + j)[this.c - 1 + j] = x; this.sh.writes.push(['setValue', this.r, this.c, x]); return this; }
  getFormulas() { return this.getValues().map(r => r.map(() => '')); }
  getFormula() { return ''; }
  getNumberFormats() { return this.getValues().map(r => r.map(() => '')); }
  getRichTextValues() { return this.getValues().map(r => r.map(() => null)); }
  getRow() { return this.r; } getColumn() { return this.c; } getNumRows() { return this.nr; } getNumColumns() { return this.nc; }
  getA1Notation() { return colName(this.c) + this.r + ':' + colName(this.c + this.nc - 1) + (this.r + this.nr - 1); }
  clearContent() { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh.cell(this.r + i, this.c + j)[this.c - 1 + j] = ''; return this; }
  getSheet() { return this.sh; }
  sort(spec) { const specs = [].concat(spec).map(s => typeof s === 'number' ? { column: s, ascending: true } : s); const vals = this.getValues(); vals.sort((a, b) => { for (const s of specs) { const x = a[s.column - this.c], y = b[s.column - this.c]; const xv = x instanceof Date ? x.getTime() : x, yv = y instanceof Date ? y.getTime() : y; if (xv < yv) return s.ascending === false ? 1 : -1; if (xv > yv) return s.ascending === false ? -1 : 1; } return 0; }); this.setValues(vals); return this; }
}
class SS {
  constructor() { this.sheets = {}; return chain(this); }
  getSheetByName(n) { return this.sheets[n] || null; }
  insertSheet(n) { return (this.sheets[n] = new Sheet(n, [])); }
  getSheets() { return Object.values(this.sheets); }
  getId() { return 'ADMIN'; } getUrl() { return 'https://x/ADMIN'; }
  getNamedRanges() { return []; }
}
function fmtDate(d, tz, f) {
  const p = n => String(n).padStart(2, '0'), D = ['일', '월', '화', '수', '목', '금', '토'];
  return f.replace(/yyyy|MM|dd|HH|mm|ss|M|d|H|EEE/g, t => ({ yyyy: d.getFullYear(), MM: p(d.getMonth() + 1), dd: p(d.getDate()), HH: p(d.getHours()), mm: p(d.getMinutes()), ss: p(d.getSeconds()), M: d.getMonth() + 1, d: d.getDate(), H: d.getHours(), EEE: D[d.getDay()] })[t]);
}
function makeEnv(opts) {
  const props = new Map(Object.entries(opts.props || {})), cache = new Map(), ss = new SS(), notes = [];
  let uuid = 0;
  const env = {
    console, Date, JSON, Math, Object, Array, String, Number, RegExp, Error, Set, Map, Symbol, Promise, parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent, escape, unescape,
    CONFIG: Object.assign({ TIMEZONE: 'Asia/Seoul', ADMIN_SHEET_ID: 'ADMIN', LIST_SHEET: '진행목록', PAY_SHEET_ID: '', KEY: 'k', WEBAPP_URL: 'https://x', NEXT_DAY_HOUR: 10, AUTO_END_DAYS: 30 }, opts.config || {}),
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props.has(k) ? props.get(k) : null, setProperty: (k, v) => { props.set(k, String(v)); }, deleteProperty: k => props.delete(k), getProperties: () => Object.fromEntries(props) }) },
    CacheService: { getScriptCache: () => ({ get: k => cache.has(k) ? cache.get(k) : null, put: (k, v) => cache.set(k, v), getAll: () => ({}), putAll: () => {}, remove: k => cache.delete(k) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Utilities: { formatDate: fmtDate, getUuid: () => 'u' + (++uuid).toString().padStart(11, '0') + '-0000', computeDigest: (a, s) => Array.from(require('crypto').createHash('md5').update(String(s)).digest()), base64Encode: b => Buffer.from(typeof b === 'string' ? b : b.map(x => x & 255)).toString('base64'), DigestAlgorithm: { MD5: 'md5' }, Charset: { UTF_8: 'utf8' }, sleep: () => {} },
    SpreadsheetApp: chain({ getActiveSpreadsheet: () => ss, openById: id => id === 'ADMIN' ? ss : chain({}), flush: () => {}, getUi: () => { throw new Error('no ui'); }, WrapStrategy: {}, ProtectionType: {}, CopyPasteType: {}, BooleanCriteria: {} }),
    Session: { getEffectiveUser: () => ({ getEmail: () => 'me@x' }) },
    ScriptApp: chain({ getProjectTriggers: () => [], EventType: {} }),
    FormApp: chain({ openById: () => chain({ getDescription: () => '', isAcceptingResponses: () => true }) }),
    DriveApp: chain({}), MailApp: chain({ sendEmail: () => {} }), HtmlService: chain({}), ContentService: chain({}), UrlFetchApp: chain({}), Logger: { log: () => {} },
  };
  env.globalThis = env;
  vm.createContext(env);
  const src = fs.readFileSync(opts.main, 'utf8');
  vm.runInContext(src, env, { filename: 'Main.js' });
  env.__ss = ss; env.__props = props; env.__notes = () => env.__ORI_NOTES || [];
  return env;
}
module.exports = { makeEnv, Sheet };
