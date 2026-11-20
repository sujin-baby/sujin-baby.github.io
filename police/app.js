window.__policeErrors = [];
window.addEventListener('error', function (e) { try { window.__policeErrors.push(String(e.message)); } catch (x) {} });
window.addEventListener('unhandledrejection', function (e) { try { window.__policeErrors.push('promise:' + e.reason); } catch (x) {} });
(function () {
  'use strict';
  var D = window.POLICE_DATA;
  var SKEY = 'police-review-v2';
  var OLDKEY = 'police-review-v1';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var dstr = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var todayStr = function () { return dstr(new Date()); };
  var ydayStr = function () { var d = new Date(); d.setDate(d.getDate() - 1); return dstr(d); };

  /* ---------- data maps ---------- */
  var SUBJ = {}, COURSE = {};
  D.subjects.forEach(function (s) {
    SUBJ[s.id] = s;
    s.courses.forEach(function (c) { c.subj = s; COURSE[c.id] = c; });
  });
  /* 2026년 2차 순경 기출 100문항: 강좌 목록에는 넣지 않고 문제 은행(COURSE)에만 등록한다.
     → 미니 모의고사·키워드 검색·오답노트·약점 단원에서 과목 기출로 함께 잡힌다. */
  (D.examCourses || []).forEach(function (c) {
    if (!SUBJ[c.sub]) return;
    c.subj = SUBJ[c.sub];
    COURSE[c.id] = c;
  });
  var QBY = {};   // course -> unit -> [q]
  D.questions.forEach(function (q) {
    (QBY[q.c] = QBY[q.c] || {});
    (QBY[q.c][q.u] = QBY[q.c][q.u] || []).push(q);
  });

  /* ---------- 시험 일정 ---------- */
  var DTARGET = '2027-08-21';            // 2027년 2차 순경 필기 (예상일)
  var GTELP = '2026-11-29';              // 지텔프 Level 2 (수진 님 응시일)

  var RANKS = [
    { n: '순경', xp: 0, e: '👮' },
    { n: '경장', xp: 300, e: '🎖️' },
    { n: '경사', xp: 900, e: '🏅' },
    { n: '경위', xp: 2000, e: '🥇' },
    { n: '경감', xp: 4000, e: '⭐' },
    { n: '경정', xp: 8000, e: '🌟' },
    { n: '총경', xp: 15000, e: '💫' }
  ];
  var CHALLENGES = [
    { id: 'c10', t: '오늘 10문제 풀기', need: 10 },
    { id: 'combo', t: '5연속 정답 만들기', need: 5 },
    { id: 'xp', t: 'P 100 모으기', need: 100 },
    { id: 'lec', t: '강의 2개 체크하기', need: 2 }
  ];

  /* ---------- state ---------- */
  var S = {
    xp: 0, streak: { n: 0, last: '', best: 0 }, checked: {}, wrong: {},
    ans: 0, ok: 0, muted: false, subj: 'cri', course: {}, qlen: 10, mix: false, days: {},
    dday: DTARGET, ddayNote: '예상일', unit: {}, node: {}, qok: {}, gpSeeded: false, goal: { xp: 50, q: 10 }, bestCombo: 0,
    planLog: {}, planSubj: '', planPerDay: 2, speedBest: 0,
    xpSpent: 0, shields: {}, cards: {}, gpLast: {}, bossWins: 0
  };
  try {
    var raw = localStorage.getItem(SKEY);
    if (!raw) raw = localStorage.getItem(OLDKEY);       // 이전 버전 기록 이어받기
    if (raw) {
      var p = JSON.parse(raw);
      Object.keys(p).forEach(function (k) { S[k] = p[k]; });
    }
  } catch (e) {}
  function normalizeState() {
    if (!S.streak) S.streak = { n: 0, last: '', best: 0 };
    if (!S.course) S.course = {};
    if (!S.checked) S.checked = {};
    if (!S.wrong) S.wrong = {};
    if (!S.days) S.days = {};
    if (!S.unit) S.unit = {};
    if (!S.node) S.node = {};
    if (!S.qok) S.qok = {};
    if (!S.goal) S.goal = { xp: 50, q: 10 };
    if (!S.dday) S.dday = DTARGET;
    if (!S.planLog) S.planLog = {};
    if (!S.dayGoal) S.dayGoal = 30;   /* 오늘 목표 문제 수 (기본 30) */
    if (!S.miniBest) S.miniBest = {}; /* 미니 모의고사 개인 최고 */
    if (!S.miniRuns) S.miniRuns = 0;
    D.subjects.forEach(function (s) {
      if (!S.course[s.id] || !COURSE[S.course[s.id]]) S.course[s.id] = s.defaultCourse || s.courses[0].id;
    });
    if (!SUBJ[S.subj]) S.subj = 'cri';
    /* 지텔프 첫 실행: G-POINT 1~8을 '들었음'으로 미리 체크 (수진 님 현재 진도) */
    if (!S.gpSeeded) {
      S.gpSeeded = true;
      if (!S.checked['gtp33'] || !Object.keys(S.checked['gtp33']).length) {
        var seed = {};
        for (var gi = 1; gi <= 8; gi++) seed[gi] = todayStr();
        S.checked['gtp33'] = seed;
      }
    }
    /* 노베이스 시작: 이제 막 시작한 사람은 범죄학(박상민 올인원)부터 보이게 */
    if (!S.planPerDay) S.planPerDay = 2;
    if (!S.planLog) S.planLog = {};
    if (typeof S.xpSpent !== 'number') S.xpSpent = 0;
    if (!S.shields) S.shields = {};
    if (!S.cards) S.cards = {};
    if (!S.gpLast) S.gpLast = {};
    // 배분 방식이 바뀌면(업로드 반영·하루 1~2강) 예전에 저장된 오늘 몫을 버리고 다시 계산한다
    if (S.planVer !== 3) { S.planLog = {}; S.planVer = 3; }
    if (!S.planSubj) {
      S.planSubj = 'done';
      S.subj = 'cri';
      if (!S.course['cri']) S.course['cri'] = 'cri';
    }
  }
  normalizeState();

  function save() {
    scopeCache = null;
    try { localStorage.setItem(SKEY, JSON.stringify(S)); } catch (e) {}
    flashSaved();
  }
  function flashSaved() {
    var el = document.getElementById('saveBadge');
    if (!el) return;
    el.classList.add('on');
    el.innerHTML = '✅ 저장됨';
    clearTimeout(el._h);
    el._h = setTimeout(function () { el.classList.remove('on'); el.innerHTML = '💾 자동저장'; }, 1300);
  }
  /* 기록 JSON 내보내기 / 불러오기 (브라우저를 바꿔도 이어서) */
  function exportState() {
    try {
      var data = { app: 'police-review', v: 2, exportedAt: new Date().toISOString(), state: S };
      var blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '경찰복습기록-' + todayStr() + '.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { try { URL.revokeObjectURL(a.href); a.remove(); } catch (x) {} }, 1500);
      toast('기록 파일을 내보냈어요 · 새 기기에서 불러오면 그대로 이어져요');
    } catch (e) { toast('내보내기에 실패했어요'); }
  }
  function importState(file) {
    var r = new FileReader();
    r.onload = function () {
      var st = null;
      try {
        var p = JSON.parse(String(r.result));
        st = p && p.state ? p.state : p;
      } catch (e) { st = null; }
      if (!st || !st.checked) { toast('기록 파일을 읽을 수 없어요'); return; }
      if (!confirm('지금 기기 기록을 파일 기록으로 바꿀까요? (지금 기록은 사라져요)')) return;
      S = st;
      normalizeState();
      save(); closeSheet(); renderAll(); toast('기록을 불러왔어요');
    };
    r.readAsText(file);
  }
  function ckMap(cid) { return S.checked[cid] || (S.checked[cid] = {}); }
  function isChecked(cid, n) { return !!ckMap(cid)[n]; }
  function checkedNums(cid) { return Object.keys(ckMap(cid)).map(Number); }

  /* ---------- helpers ---------- */
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(t._h); t._h = setTimeout(function () { t.classList.add('hidden'); }, 2400);
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function qs(pool, n) { return shuffle(pool.slice()).slice(0, n); }
  function unitIndex(cid, n) {
    var c = COURSE[cid];
    for (var i = 0; i < c.units.length; i++) if (n >= c.units[i].a && n <= c.units[i].b) return i;
    return -1;
  }
  function unitName(cid, u) { var c = COURSE[cid]; return c.units[u] ? c.units[u].n : ''; }
  function isGP(c) { return !!(c && c.kind === 'gp'); }
  function uw(c) { return (c && c.unitWord) ? ' ' + c.unitWord : '강'; }
  function fmtDateDot(s) { return s ? String(s) : ''; }
  function srcLabel(q) {
    if (q && q.src) return q.src;
    return '';
  }
  function qLabel(q) {
    var s = SUBJ[q.s], c = COURSE[q.c];
    if (q.gp && c) return s.name + ' · G-POINT ' + q.gp + ' ' + (c.lec[q.gp - 1] ? c.lec[q.gp - 1].t : '');
    return s.name + ' · ' + (c.name ? c.name + ' · ' : '') + unitName(q.c, q.u);
  }
  /* 문제를 푸는 동안 보이는 배지: 지텔프는 G-POINT 번호·공식명을 숨긴다(스포일러 방지) */
  function qTag(q) {
    var s = SUBJ[q.s];
    if (!s) return '';
    if (q.gp) return s.name + ' · 문법 기출';
    return qLabel(q);
  }
  function gpHead(q) {
    var c = COURSE[q.c];
    var t = c && c.lec && c.lec[q.gp - 1] ? c.lec[q.gp - 1].t : '';
    return '📘 G-POINT ' + q.gp + (t ? ' · ' + t : '');
  }
  function srcBadge(q) {
    var s = srcLabel(q);
    if (s) return { k: (q.s === 'gtelp' ? 'cafe' : 'exam'), t: '📌 출처: ' + s };
    var c = COURSE[q.c];
    if (c && c.last && !isGP(c)) return { k: 'lec', t: '📅 최근 업로드 ' + c.last };
    return { k: 'book', t: '출처 미상' };
  }

  /* ---------- sound ---------- */
  var AC = null;
  function tone(f, t0, dur, type, vol) {
    var o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol || 0.06, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(AC.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function sfx(name) {
    if (S.muted) return;
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      if (AC.state === 'suspended') AC.resume();
      var t = AC.currentTime;
      if (name === 'ok') { tone(659, t, 0.1, 'sine', 0.06); tone(988, t + 0.07, 0.14, 'sine', 0.05); }
      else if (name === 'no') { tone(220, t, 0.16, 'square', 0.045); tone(155, t + 0.11, 0.2, 'square', 0.04); }
      else if (name === 'tap') { tone(540, t, 0.05, 'sine', 0.03); }
      else if (name === 'combo') { tone(880, t, 0.07, 'triangle', 0.05); tone(1180, t + 0.06, 0.09, 'triangle', 0.045); }
      else if (name === 'combo3') { [784, 988, 1319].forEach(function (f, i) { tone(f, t + i * 0.06, 0.12, 'triangle', 0.05); }); }
      else if (name === 'combo5') { [784, 988, 1175, 1568].forEach(function (f, i) { tone(f, t + i * 0.07, 0.16, 'triangle', 0.05); }); }
      else if (name === 'crown') { [1047, 1319, 1568].forEach(function (f, i) { tone(f, t + i * 0.08, 0.22, 'sine', 0.05); }); }
      else if (name === 'level') { [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(f, t + i * 0.075, 0.2, 'sine', 0.05); }); }
      else if (name === 'done') { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, t + i * 0.1, 0.22, 'sine', 0.055); }); }
    } catch (e) {}
  }

  /* ---------- confetti ---------- */
  var COLORS = ['#ffc24b', '#22c55e', '#5b7cfa', '#f97316', '#ec4899', '#14b8a6'];
  function confetti(n) {
    var fx = $('#fx');
    for (var i = 0; i < (n || 22); i++) {
      var el = document.createElement('i');
      el.className = 'conf';
      el.style.background = COLORS[Math.floor(Math.random() * COLORS.length)];
      el.style.left = (30 + Math.random() * 40) + '%';
      el.style.top = (34 + Math.random() * 12) + '%';
      fx.appendChild(el);
      var dx = (Math.random() - 0.5) * 260, dy = -60 - Math.random() * 160, rot = Math.random() * 720 - 360;
      var an = el.animate([
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        { transform: 'translate(' + dx + 'px,' + dy + 'px) rotate(' + rot + 'deg)', opacity: 1, offset: 0.45 },
        { transform: 'translate(' + (dx * 1.4) + 'px,' + (dy + 320) + 'px) rotate(' + (rot * 2) + 'deg)', opacity: 0 }
      ], { duration: 1150 + Math.random() * 400, easing: 'cubic-bezier(.2,.6,.3,1)' });
      an.onfinish = (function (e) { return function () { e.remove(); }; })(el);
    }
  }

  /* ---------- D-Day ---------- */
  function daysTo(iso) {
    var t = new Date(iso + 'T00:00:00');
    var n = new Date(); n.setHours(0, 0, 0, 0);
    return Math.round((t - n) / 86400000);
  }
  function ddayLabel(iso) {
    var d = daysTo(iso);
    if (d > 0) return 'D-' + d;
    if (d === 0) return 'D-DAY';
    return 'D+' + (-d);
  }
  function weekday(iso) {
    return ['일', '월', '화', '수', '목', '금', '토'][new Date(iso + 'T00:00:00').getDay()];
  }
  function renderDday() {
    var iso = S.dday || DTARGET;
    $('#ddayNum').textContent = ddayLabel(iso).replace(/^D-/, '');
    $('#ddayTitle').textContent = '2027년 2차 순경 필기';
    $('#ddaySub').textContent = iso + ' (' + weekday(iso) + ') · ' + (S.ddayNote || '예상일');
    var g = daysTo(GTELP);
    $('#gtChipTxt').textContent = '지텔프 ' + (g > 0 ? 'D-' + g : g === 0 ? 'D-DAY' : 'D+' + (-g));
    $('#ddayLeft').textContent = daysTo(iso) >= 0 ? daysTo(iso) + '일 남음' : Math.abs(daysTo(iso)) + '일 지남';
  }
  function openDdaySheet() {
    var iso = S.dday || DTARGET;
    $('#sheetIn').innerHTML =
      '<button class="sheet-close" data-close="1">✕</button>' +
      '<div class="sheet-num">D-DAY 설정</div>' +
      '<div class="sheet-title">2027년 2차 순경 필기 날짜</div>' +
      '<div class="sheet-meta">기본값 2027-08-21은 최근 3년 2차 필기일(2024.8.17 / 2025.8.30 / 2026.8.22)이 모두 8월 토요일이었던 것을 근거로 한 <b>예상일</b>입니다. 2027년 1월 경찰청 공고가 나오면 날짜를 눌러 고쳐 주세요.</div>' +
      '<input type="date" id="ddayInput" class="date-input" value="' + iso + '">' +
      '<button class="btn primary" id="ddaySave">이 날짜로 저장</button>' +
      '<button class="btn ghost" id="ddayReset">예상일(2027-08-21)로 되돌리기</button>' +
      '<div class="sheet-note">지텔프 Level 2 응시일 2026-11-29은 고정으로 표시합니다 · ' + ddayLabel(GTELP) + '</div>';
    $('#sheet').classList.remove('hidden');
    $('#ddaySave').onclick = function () {
      var v = $('#ddayInput').value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { toast('날짜를 선택해 주세요'); return; }
      S.dday = v; S.ddayNote = v === DTARGET ? '예상일' : '직접 설정'; save(); closeSheet(); renderDday(); sfx('ok');
      toast('목표일을 ' + v + '로 바꿨어요');
    };
    $('#ddayReset').onclick = function () {
      S.dday = DTARGET; S.ddayNote = '예상일'; save(); closeSheet(); renderDday(); sfx('tap');
    };
  }

  /* ---------- 학습 계획 (달력형) ---------- */
  var PLAN_TARGET = '2027-08-20';        // 2차 시험 전날까지 배분
  var PLAN_BLOCKS = [
    // 0단계 단기 병행 — 11/29 지텔프 시험 전 완주
    { cid: 'gtp33', stage: 0, lane: 'gp', ab: '지' },
    // 1단계 기본+심화 올인원 (노베이스 순서: 범죄학 → 형사법 → 경찰학)
    { cid: 'cri', stage: 1, ab: '범' },
    { cid: 'crim_g', stage: 1, ab: '형' },
    { cid: 'crim_a', stage: 1, ab: '형' },
    { cid: 'crim_s', stage: 1, ab: '형' },
    { cid: 'crim_e', stage: 1, ab: '형' },
    { cid: 'pol', stage: 1, ab: '경' },
    // 2단계 기출·핵심요약
    { cid: 'c4035', stage: 2, ab: '범' },
    { cid: 'c3747', stage: 2, ab: '범' },
    { cid: 'c4566', stage: 2, ab: '형' },
    { cid: 'c4390', stage: 2, ab: '형' },
    { cid: 'c4579', stage: 2, ab: '경' },
    { cid: 'c4367', stage: 2, ab: '경' },
    // 3단계 실전 문제풀이·동형 모의고사·마무리 특강
    { cid: 'c4215', stage: 3, ab: '형' },
    { cid: 'c4218', stage: 3, ab: '경' },
    { cid: 'c4226', stage: 3, ab: '범' },
    { cid: 'c4270', stage: 3, ab: '형' },
    { cid: 'c4271', stage: 3, ab: '경' },
    { cid: 'c4274', stage: 3, ab: '범' }
  ];
  var PLAN_STAGES = [
    { n: 0, t: '0단계 단기 병행 · 지텔프', d: '11/29 지텔프 시험 전까지 G-POINT를 끝내고 범죄학과 병행해요.' },
    { n: 1, t: '1단계 기본+심화 올인원', d: '박상민 범죄학 → 신광은 형사법 → 장정훈 경찰학 순서로 이론을 한 바퀴 돌려요.' },
    { n: 2, t: '2단계 기출·핵심요약', d: '기출 총정리와 네친구 핵심요약으로 2차 시험 범위를 정리해요.' },
    { n: 3, t: '3단계 실전 모의고사·마무리', d: '동형 모의고사와 마무리 특강으로 시험 전 최종 점검해요.' }
  ];
  var PLAN = { month: '', sel: '', tab: 'cal', info: null };

  function dOf(iso) { return new Date(iso + 'T00:00:00'); }
  function addDays(iso, n) { var d = dOf(iso); d.setDate(d.getDate() + n); return dstr(d); }
  function dayDiff(a, b) { return Math.round((dOf(b) - dOf(a)) / 86400000); }
  function dateList(a, b) {
    var out = [], d = dOf(a), e = dOf(b);
    if (e < d) return out;
    while (d <= e) { out.push(dstr(d)); d.setDate(d.getDate() + 1); }
    return out;
  }
  function monthTitle(ym) { return ym.slice(0, 4) + '년 ' + Number(ym.slice(5, 7)) + '월'; }
  /* 학습일 = 시험일(지텔프 11/29)은 빼고 배분 */
  function studyDays(a, b) {
    var all = dateList(a, b);
    var out = all.filter(function (d) { return d !== GTELP; });
    return out.length ? out : all;
  }
  function planMonthMax() { return String(S.dday || DTARGET).slice(0, 7); }
  function clampMonth(ym) {
    if (ym < '2026-11') return '2026-11';
    if (ym > planMonthMax()) return planMonthMax();
    return ym;
  }
  function shortName(c) {
    var mt = /^\[([^\]]+)\]\s*(.*)$/.exec(c.name || '');
    var nm = mt ? mt[2] : (c.name || '');
    nm = nm.replace(/\s*\(2[0-9]년\s*\d{1,2}월\)\s*$/, '').replace(/\s+/g, ' ').trim();
    return nm || (c.name || '');
  }
  function planAb(cid) {
    var ab = '';
    PLAN_BLOCKS.forEach(function (b) { if (b.cid === cid) ab = b.ab; });
    return ab;
  }
  function planCourses() {
    var out = [];
    PLAN_BLOCKS.forEach(function (b) {
      var c = COURSE[b.cid];
      if (!c) return;
      out.push({ cid: b.cid, c: c, subj: SUBJ[c.sub], stage: b.stage, lane: b.lane || 'main', ab: b.ab, to: c.total });
    });
    return out;
  }
  function planRemain(lane) {
    var out = [];
    planCourses().forEach(function (b) {
      if ((b.lane === 'gp') !== (lane === 'gp')) return;
      var m = ckMap(b.cid), gp = b.lane === 'gp';
      for (var n = 1; n <= b.to; n++) {
        if (m[n]) continue;
        var L = b.c.lec[n - 1];
        out.push({
          cid: b.cid, n: n, ab: b.ab, stage: b.stage, gp: gp,
          name: shortName(b.c), color: b.subj ? b.subj.color : '#5b7cfa',
          up: !!(L && L.up)
        });
      }
    });
    return out;
  }
  /* 남은 강의를 남은 날짜에 고르게 배분 (하루 몫 = 남은 강의 / 남은 날) */
  function spread(items, days) {
    var out = {}, D = days.length, N = items.length;
    if (!D || !N) return out;
    for (var k = 0; k < N; k++) {
      var idx = Math.floor(k * D / N);
      if (idx > D - 1) idx = D - 1;
      var key = days[idx];
      if (!out[key]) out[key] = [];
      out[key].push(items[k]);
    }
    return out;
  }
  function targetDate() { return S.dday || DTARGET; }
  function planEnd() {
    var t = todayStr();
    var end = targetDate() > t ? addDays(targetDate(), -1) : PLAN_TARGET;
    return end < t ? t : end;
  }
  function gpEndDay() {
    var t = todayStr();
    if (GTELP < t) return '';
    var ge = addDays(GTELP, -1);
    return ge < t ? t : ge;
  }
  function keyOf(it) { return it.cid + '#' + it.n; }
  /* 업로드 반영 배분: 이미 올라온 강의를 먼저 배치하고,
     아직 안 올라온 강의는 미래인재 업로드 리듬(목·금, 회당 3강)에 맞춰 그 뒤 날짜로 미룬다. */
  var PLAN_UP_PER_DAY = 3;
  function uploadedCount(cid) {
    var c = COURSE[cid]; if (!c) return 0;
    var n = 0;
    for (var i = 0; i < c.lec.length; i++) if (c.lec[i].up) n = i + 1;
    return n;
  }
  function nextDow(iso, dow) {
    var d = dOf(iso), i = 0;
    while (d.getDay() !== dow && i < 8) { d.setDate(d.getDate() + 1); i++; }
    return dstr(d);
  }
  function uploadEta(cid, n) {
    var c = COURSE[cid], L = c && c.lec[n - 1];
    if (L && L.up) return '';
    var U = uploadedCount(cid), k = Math.max(1, n - U);
    var per = PLAN_UP_PER_DAY;
    var week = Math.floor((k - 1) / (per * 2));
    var slot = Math.floor(((k - 1) % (per * 2)) / per);      // 0 = 목요일, 1 = 금요일
    var thu = nextDow(todayStr(), 4);
    var base = slot === 0 ? thu : addDays(thu, 1);
    return addDays(base, week * 7);
  }
  /* 하루 1~2강(S.planPerDay)으로 날짜별 배분을 계산한다 (결정적 = 같은 날 같은 결과) */
  function planDaily() {
    var t = todayStr(), end = planEnd(), ge = gpEndDay();
    var per = Math.max(1, Math.min(2, Number(S.planPerDay) || 2));
    var map = {};
    function place(items, days, cap) {
      var rest = items.slice();
      for (var di = 0; di < days.length; di++) {
        if (!rest.length) break;
        var d = days[di], slot = map[d] || [], keep = [], used = 0;   // 지텔프·본강의는 각자 하루 몫
        for (var i = 0; i < rest.length; i++) {
          var it = rest[i];
          var eta = it.up ? '' : uploadEta(it.cid, it.n);
          if (used < cap && (!eta || eta <= d)) { slot.push(it); used++; }
          else keep.push(it);
        }
        rest = keep;
        if (slot.length) map[d] = slot;
      }
      return rest.length;
    }
    var gpDays = ge ? dateList(t, ge) : [];
    var gpLeft = planRemain('gp').length;
    var gpCap = gpDays.length ? Math.min(2, Math.max(1, Math.ceil(gpLeft / gpDays.length))) : 0;
    var gpRest = gpDays.length ? place(planRemain('gp'), gpDays, gpCap) : gpLeft;
    var mainRest = place(planRemain('main'), dateList(t, end).filter(function (d) { return d !== GTELP; }), per);
    return { today: t, end: end, ge: ge, map: map, per: per, rest: gpRest + mainRest };
  }
  function planTodaySet() {
    var t = todayStr();
    if (!S.planLog) S.planLog = {};
    if (!S.planLog[t] || !S.planLog[t].length) {
      var m = planDaily().map;
      S.planLog[t] = (m[t] || []).map(keyOf);
      save();
    }
    return S.planLog[t];
  }
  function itemsByKey(keys) {
    var pool = {}, out = [];
    planRemain('gp').concat(planRemain('main')).forEach(function (it) { pool[it.cid + '#' + it.n] = it; });
    keys.forEach(function (k) { if (pool[k]) out.push(pool[k]); });
    return out;
  }
  function planAssign() {
    var daily = planDaily();
    var t = daily.today, map = daily.map;
    var todayItems = itemsByKey(planTodaySet());
    if (todayItems.length) map[t] = todayItems; else delete map[t];
    var futureDays = dateList(addDays(t, 1), daily.end);
    return {
      today: t, target: targetDate(), end: daily.end, map: map,
      gpN: planRemain('gp').length, mainN: planRemain('main').length,
      days: futureDays.length, gpDays: daily.ge ? dateList(t, daily.ge).length : 0,
      avg: daily.per, per: daily.per, left: dayDiff(t, targetDate()), rest: daily.rest
    };
  }
  function groupByCourse(items) {
    var out = [], idx = {};
    (items || []).forEach(function (it) {
      var g = idx[it.cid];
      if (!g) { g = idx[it.cid] = { cid: it.cid, ab: it.ab, color: it.color, name: it.name, gp: it.gp, nums: [], pend: 0 }; out.push(g); }
      g.nums.push(it.n);
      if (!it.up) g.pend++;
    });
    out.forEach(function (g) { g.nums.sort(function (a, b) { return a - b; }); });
    return out;
  }
  function isCont(nums) {
    for (var i = 1; i < nums.length; i++) if (nums[i] !== nums[i - 1] + 1) return false;
    return true;
  }
  function rangeTxt(g) {
    var ns = g.nums, pre = g.gp ? 'G-POINT ' : '', unit = g.gp ? '' : '강';
    if (!ns.length) return '';
    if (ns.length === 1) return pre + ns[0] + unit;
    if (isCont(ns)) return pre + ns[0] + '-' + ns[ns.length - 1] + unit;
    if (ns.length <= 4) return pre + ns.join('·') + unit;
    return pre + ns[0] + unit + ' 외 ' + (ns.length - 1) + unit;
  }
  function badgeTxt(g) {
    var ns = g.nums;
    if (ns.length === 1) return g.ab + ' ' + ns[0];
    return g.ab + ' ' + ns[0] + '-' + ns[ns.length - 1];
  }
  function doneByDay() {
    var out = {};
    D.subjects.forEach(function (s) {
      s.courses.forEach(function (c) {
        var m = S.checked[c.id];
        if (!m) return;
        Object.keys(m).forEach(function (n) {
          var d = m[n];
          if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
          if (!out[d]) out[d] = [];
          out[d].push({ cid: c.id, n: Number(n), ab: planAb(c.id), color: s.color, name: shortName(c), gp: isGP(c), up: true });
        });
      });
    });
    Object.keys(out).forEach(function (d) {
      out[d].sort(function (a, b) { return a.cid === b.cid ? a.n - b.n : (a.cid < b.cid ? -1 : 1); });
    });
    return out;
  }
  function keyParts(k) { var p = String(k).split('#'); return { cid: p[0], n: Number(p[1]) }; }
  function missedOn(iso) {
    var log = (S.planLog && S.planLog[iso]) || [];
    return log.filter(function (k) { var p = keyParts(k); return !(S.checked[p.cid] && S.checked[p.cid][p.n]); })
      .map(function (k) {
        var p = keyParts(k), c = COURSE[p.cid], L = c && c.lec[p.n - 1];
        return { cid: p.cid, n: p.n, gp: isGP(c), up: !!(L && L.up) };
      });
  }
  function calCells(ym) {
    var y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
    var first = new Date(y, m - 1, 1), pad0 = first.getDay(), last = new Date(y, m, 0).getDate();
    var cells = [], i, d;
    for (i = 0; i < pad0; i++) cells.push('');
    for (d = 1; d <= last; d++) cells.push(dstr(new Date(y, m - 1, d)));
    while (cells.length % 7) cells.push('');
    return cells;
  }
  function dayMark(iso, info, dm) {
    var t = info.today;
    if (iso > t) return '';
    var log = (S.planLog && S.planLog[iso]) || [];
    var done = (dm[iso] || []).length;
    var miss = missedOn(iso).length;
    if (iso === t) return (log.length && !miss) ? 'done' : '';
    if (log.length) {
      if (!miss) return 'done';
      if (done) return 'part';
      return 'miss';
    }
    return done ? 'done' : '';
  }
  function cellHtml(iso, info, dm) {
    var cls = 'cal-cell';
    if (iso === info.today) cls += ' today';
    if (iso === PLAN.sel) cls += ' sel';
    if (iso < info.today) cls += ' past';
    if (iso === GTELP) cls += ' exam';
    if (iso === info.target) cls += ' exam dday';
    var mark = dayMark(iso, info, dm);
    var h = '<button class="' + cls + '" data-day="' + iso + '">';
    h += '<span class="cc-d">' + Number(iso.slice(8, 10)) + '</span>';
    if (mark === 'done') h += '<i class="cc-ck">✓</i>';
    else if (mark === 'part') h += '<i class="cc-ck part">!</i>';
    else if (mark === 'miss') h += '<i class="cc-ck miss">!</i>';
    if (iso === GTELP) h += '<span class="cc-exam">지텔프</span>';
    if (iso === info.target) h += '<span class="cc-exam dday">2차</span>';
    if (iso >= info.today) {
      var groups = groupByCourse(info.map[iso]);
      groups.slice(0, 2).forEach(function (g) {
        h += '<span class="cc-b" style="background:' + shade(g.color, 0.82) + ';color:' + shade(g.color, -0.32) + '">' + badgeTxt(g) + '</span>';
      });
      if (groups.length > 2) h += '<span class="cc-b more">+' + (groups.length - 2) + '</span>';
    } else if ((dm[iso] || []).length) {
      h += '<span class="cc-b past">' + (dm[iso] || []).length + '강</span>';
    }
    h += '</button>';
    return h;
  }
  function cdRow(g, doneSet) {
    var h = '<div class="cd-row"><span class="cd-dot" style="background:' + g.color + '"></span><div class="cd-body">' +
      '<b>' + esc(g.name) + '</b>' +
      '<i>' + rangeTxt(g) + (g.pend ? ' · ⏳ 업로드 예정 ' + g.pend + (g.gp ? '개' : '강') : '') + '</i>' +
      '<div class="cd-chips">';
    g.nums.forEach(function (n) {
      var got = doneSet && doneSet.indexOf(g.cid + '#' + n) >= 0;
      h += '<button class="cd-chip' + (got ? ' got' : '') + '" data-cid="' + g.cid + '" data-n="' + n + '">' +
        (g.gp ? 'G' : '') + n + (g.gp ? '' : '강') + (got ? ' ✓' : '') + '</button>';
    });
    h += '</div></div></div>';
    return h;
  }
  function detailHtml(iso, info, dm) {
    var t = info.today;
    var plan = info.map[iso] || [];
    var done = dm[iso] || [];
    var doneSet = done.map(function (it) { return it.cid + '#' + it.n; });
    var h = '<div class="cd-date"><b>' + iso.slice(0, 4) + '.' + Number(iso.slice(5, 7)) + '.' + Number(iso.slice(8, 10)) + ' (' + weekday(iso) + ')</b>';
    if (iso === t) h += '<span class="cd-pill today">오늘</span>';
    else if (iso < t) h += '<span class="cd-pill">지난 날</span>';
    else h += '<span class="cd-pill fut">' + dayDiff(t, iso) + '일 뒤</span>';
    h += '</div>';
    if (iso === GTELP) h += '<div class="cd-exam">📘 지텔프 Level 2 시험일 — 이 날은 강의 대신 시험이에요</div>';
    if (iso === info.target) h += '<div class="cd-exam red">🏁 2027년 2차 순경 필기 시험일 — 최종 목표</div>';
    if (done.length) {
      h += '<div class="cd-sec">✅ 이 날 들은 강의 ' + done.length + '</div>';
      groupByCourse(done).forEach(function (g) { h += cdRow(g, doneSet); });
    }
    if (plan.length && iso >= t) {
      h += '<div class="cd-sec">' + (iso === t ? '📌 오늘 들을 강의 ' : '📅 이 날 계획 ') + plan.length + '</div>';
      groupByCourse(plan).forEach(function (g) { h += cdRow(g, doneSet); });
    }
    if (iso < t) {
      var miss = missedOn(iso);
      if (miss.length) h += '<div class="cd-miss">↪ 못 들은 ' + miss.length + '강은 오늘 이후로 자동 이월돼 다시 배분됐어요</div>';
    }
    if (!done.length && !plan.length && iso !== GTELP && iso !== info.target) {
      h += '<div class="cd-empty">' + (iso < t ? '이 날은 학습 기록이 없어요.' : '이 날은 배정된 강의가 없어요.') + '</div>';
    }
    return h;
  }
  function sumHtml(info) {
    var tot = 0, done = 0;
    planCourses().forEach(function (b) {
      tot += b.to;
      var m = ckMap(b.cid);
      for (var n = 1; n <= b.to; n++) if (m[n]) done++;
    });
    var rest = tot - done;
    var note = '';
    if (info.rest) note = ' · 하루 ' + info.per + '강으로는 시험 전에 다 못 넣는 강의 <b>' + info.rest + '개</b>';
    return '<div>계획 <b>' + tot + '</b>강 중 <b>' + done + '</b>강 완료 · 2차까지 <b>' + info.left + '일</b></div>' +
      '<div class="ps-sub">남은 ' + rest + '강 · 하루 <b>' + info.per + '강</b>씩(지텔프 포인트는 별도) · 이미 올라온 강의 우선, 안 올라온 강의는 목·금 업로드에 맞춰 뒤로' +
      (info.gpN ? ' · 지텔프 ' + info.gpN + '포인트는 11/28까지' : '') + note + '</div>';
  }
  function stageHtml(info) {
    var courses = planCourses(), cur = -1;
    courses.forEach(function (b) {
      if (cur >= 0) return;
      var m = ckMap(b.cid);
      for (var n = 1; n <= b.to; n++) if (!m[n]) { cur = b.stage; return; }
    });
    var h = '';
    PLAN_STAGES.forEach(function (st) {
      var tot = 0, done = 0, rows = '';
      courses.forEach(function (b) {
        if (b.stage !== st.n) return;
        var dn = 0, m = ckMap(b.cid);
        for (var n = 1; n <= b.to; n++) if (m[n]) dn++;
        tot += b.to; done += dn;
        rows += '<button class="st-row" data-cid="' + b.cid + '"><span class="st-dot" style="background:' + (b.subj ? b.subj.color : '#5b7cfa') + '"></span><b>' + esc(shortName(b.c)) + '</b><i>' + dn + '/' + b.to + (b.lane === 'gp' ? '' : '강') + '</i></button>';
      });
      if (!tot) return;
      var pct = Math.round(done / tot * 100);
      h += '<div class="st-card' + (st.n === cur ? ' now' : '') + '">' +
        '<div class="st-head"><b>' + st.t + '</b>' + (st.n === cur ? '<span class="st-now">지금</span>' : '') + '</div>' +
        '<div class="st-desc">' + st.d + '</div>' +
        '<div class="bar thin"><i style="width:' + pct + '%;background:' + (st.n === cur ? 'var(--c)' : '#c9d3e6') + '"></i></div>' +
        '<div class="st-meta">' + done + ' / ' + tot + (st.n === 0 ? ' 포인트' : '강') + ' · ' + pct + '%</div>' +
        '<div class="st-rows">' + rows + '</div></div>';
    });
    return h;
  }
  function openPlanSheet() {
    var t = todayStr();
    PLAN.month = clampMonth(t.slice(0, 7));
    PLAN.sel = t;
    PLAN.tab = 'cal';
    $('#sheetIn').innerHTML =
      '<button class="sheet-close" data-close="1">✕</button>' +
      '<div class="sheet-num">학습 계획표</div>' +
      '<div class="sheet-title">2027년 2차 시험까지 달력 계획</div>' +
      '<div class="plan-rate"><b>하루 강의</b>' +
      '<button class="rate-chip" data-per="1">1강</button>' +
      '<button class="rate-chip" data-per="2">2강</button>' +
      '<span class="pr-note">이미 올라온 강의만 오늘·내일 계획에 넣고, 아직 안 올라온 강의는 목·금 업로드(회당 3강)에 맞춰 뒤 날짜로 미뤄요.</span></div>' +
      '<div class="plan-sum" id="planSum"></div>' +
      '<div class="plan-tabs">' +
      '<button class="ptab on" id="ptabCal">📅 달력</button>' +
      '<button class="ptab" id="ptabStage">🗺️ 단계별</button>' +
      '</div>' +
      '<div id="calBody">' +
      '<div class="cal-nav"><button class="cal-mv" id="calPrev" aria-label="이전 달">‹</button>' +
      '<b id="calTitle">-</b>' +
      '<div class="cal-nav-r"><button class="cal-today" id="calToday">오늘</button><button class="cal-mv" id="calNext" aria-label="다음 달">›</button></div></div>' +
      '<div class="cal-dow"><span class="sun">일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span class="sat">토</span></div>' +
      '<div class="cal-grid" id="calGrid"></div>' +
      '<div class="cal-detail" id="calDetail"></div>' +
      '<div class="cal-legend"><span class="lg done"></span>다 들은 날 <span class="lg part"></span>일부만 <span class="lg miss"></span>못 들은 날 <span class="lg sel"></span>선택</div>' +
      '<div class="cal-key">지 지텔프 · 범 범죄학 · 형 형사법 · 경 경찰학</div>' +
      '</div>' +
      '<div id="stageBody" class="hidden"></div>' +
      '<div class="plan-foot">' +
      '<button class="mini" id="planExp">⬇️ 기록 내보내기</button>' +
      '<button class="mini" id="planImp">⬆️ 기록 불러오기</button>' +
      '<input type="file" id="planFile" accept="application/json,.json" style="display:none">' +
      '</div>' +
      '<button class="btn ghost" data-close="1" style="margin-top:8px">닫기</button>';
    $('#sheet').classList.remove('hidden');
    $('#ptabCal').onclick = function () { planTab('cal'); };
    $('#ptabStage').onclick = function () { planTab('stage'); };
    $('#calPrev').onclick = function () { moveMonth(-1); };
    $('#calNext').onclick = function () { moveMonth(1); };
    $('#calToday').onclick = function () {
      PLAN.month = clampMonth(todayStr().slice(0, 7)); PLAN.sel = todayStr(); sfx('tap'); planPaint();
    };
    $$('.rate-chip').forEach(function (b) {
      b.onclick = function () {
        var v = Number(b.getAttribute('data-per'));
        if ((S.planPerDay || 2) === v) return;
        S.planPerDay = v;
        S.planLog[todayStr()] = [];
        save(); sfx('tap'); planPaint();
        toast('하루 ' + v + '강으로 다시 계산했어요');
      };
    });
    $('#planExp').onclick = function () { exportState(); };
    $('#planImp').onclick = function () { var f = $('#planFile'); if (f) f.click(); };
    $('#planFile').onchange = function () { if (this.files && this.files[0]) importState(this.files[0]); this.value = ''; };
    planPaint();
  }
  function planTab(k) {
    PLAN.tab = k;
    $('#ptabCal').classList.toggle('on', k === 'cal');
    $('#ptabStage').classList.toggle('on', k === 'stage');
    $('#calBody').classList.toggle('hidden', k !== 'cal');
    $('#stageBody').classList.toggle('hidden', k !== 'stage');
    sfx('tap');
  }
  function moveMonth(k) {
    var y = Number(PLAN.month.slice(0, 4)), m = Number(PLAN.month.slice(5, 7)) + k;
    while (m < 1) { m += 12; y--; }
    while (m > 12) { m -= 12; y++; }
    var ym = clampMonth(y + '-' + pad(m));
    if (ym === PLAN.month) return;
    PLAN.month = ym; sfx('tap'); planPaint();
  }
  function planPaint() {
    if (!$('#calGrid')) return;
    var info = planAssign();
    PLAN.info = info;
    var dm = doneByDay();
    var h = '';
    calCells(PLAN.month).forEach(function (iso) {
      h += iso ? cellHtml(iso, info, dm) : '<span class="cal-cell blank"></span>';
    });
    $('#calGrid').innerHTML = h;
    $('#calTitle').textContent = monthTitle(PLAN.month);
    $('#calDetail').innerHTML = detailHtml(PLAN.sel, info, dm);
    $('#planSum').innerHTML = sumHtml(info);
    $$('.rate-chip').forEach(function (b) {
      b.classList.toggle('on', Number(b.getAttribute('data-per')) === (S.planPerDay || 2));
    });
    $('#calPrev').disabled = PLAN.month <= '2026-11';
    $('#calNext').disabled = PLAN.month >= planMonthMax();
    $$('#calGrid [data-day]').forEach(function (b) {
      b.onclick = function () { PLAN.sel = b.getAttribute('data-day'); sfx('tap'); planPaint(); };
    });
    $$('#calDetail [data-cid]').forEach(function (b) {
      b.onclick = function () { sfx('tap'); openSheet(b.getAttribute('data-cid'), Number(b.getAttribute('data-n'))); };
    });
    var sb = $('#stageBody');
    if (sb) {
      sb.innerHTML = stageHtml(info);
      $$('#stageBody [data-cid]').forEach(function (b) {
        b.onclick = function () { var cid = b.getAttribute('data-cid'); sfx('tap'); openSheet(cid, nextLecture(cid)); };
      });
    }
  }
  /* 첫 화면 '오늘의 계획' 한 줄 */
  function renderTodayPlan() {
    var el = $('#todayPlanTxt');
    if (!el) return;
    var info = planAssign();
    var t = info.today;
    var plan = info.map[t] || [];
    var groups = groupByCourse(plan);
    if (!groups.length) { el.textContent = '오늘 몫을 다 했어요 🎉'; return; }
    el.textContent = groups.map(function (g) {
      var ns = g.nums;
      return g.ab + ' ' + ns[0] + (ns.length > 1 ? '-' + ns[ns.length - 1] : '');
    }).join(' · ');
  }


  /* ---------- 📘 G-POINT 1~10 요약 암기표 ---------- */
  var GP_TABLE = [
    { g: '가정법 1~3', tip: '', rows: [
      ['1', 'If 과거(-ed, were)', 'wcm + 동원'],
      ['2', 'If had pp (= Had 주어 pp)', 'wcm + have pp'],
      ['3', '주요명제결충 + that절', '(should) + 동원']
    ] },
    { g: '진행형 4~7', tip: '6~10번은 시제 힌트는 같고 for/since 유무로 been ~ing 구분', rows: [
      ['4', '주절 과거 + while ~', 'while절 was/were ~ing'],
      ['5', 'when 과거 + 주절 ~', '주절 was/were ~ing'],
      ['6', '현재힌트(now, right now, at the moment)', 'am/are/is ~ing'],
      ['7', '미래힌트(tomorrow, next~, by) / 시간·조건절 현재', 'will be ~ing']
    ] },
    { g: '완료진행 8~10', tip: '시제 힌트는 같고 for/since 유무로 been ~ing 구분', rows: [
      ['8', '과거힌트 + for/since/before/until 과거', 'had been ~ing'],
      ['9', '현재힌트 + for/since', 'has/have been ~ing'],
      ['10', '미래힌트 + for/since 시간', 'will have been ~ing']
    ] },
    { g: '완료·대과거 11~12', tip: 'Unit 03 시제 마무리', rows: [
      ['11', 'by+미래시점 / before ~ (진행 아닐 때)', 'will have pp (미래완료)'],
      ['12', '과거 기준 + before/until/when 과거 (단발/상태)', 'had pp (과거완료)']
    ] },
    { g: '준동사 13~18', tip: 'Unit 04', rows: [
      ['13', 'want, hope, expect, decide, plan, refuse, agree, promise', 'to + 동원'],
      ['14', 'enjoy, finish, quit, give up, avoid, mind, suggest, consider', '~ing (동명사)'],
      ['15', 'remember / forget / regret / try', '미래 to R / 과거·시험삼아 ~ing'],
      ['16', '전치사 뒤 / look forward to, be used to, object to', '~ing'],
      ['17', 'allow·ask·encourage + O / make·let·have + O', 'to R / 동원(수동 pp)'],
      ['18', '감정·수식 분사', '하게 하면 ~ing / 느끼면·되면 pp']
    ] },
    { g: '관계사 19~22', tip: 'Unit 05', rows: [
      ['19', '선행사 + 불완전절 (주어 없음)', '주격 who(사람) / which(사물)'],
      ['20', '선행사 + S + V (목적어 없음)', '목적격 who(m) / which / that'],
      ['21', '선행사 + [빈칸] + 명사 + 동사', '소유격 whose'],
      ['22', '선행사 + 완전한 절', '관계부사 where/when/why/how (전치사+which)']
    ] },
    { g: '조동사 23~27', tip: 'Unit 06', rows: [
      ['23', '추측 강도', 'must(확신) / may·might(약함) / cannot(~일 리가)'],
      ['24', '의무·충고', 'should / ought to / had better + 동원'],
      ['25', '과거 습관·후회', 'used to R(과거상태) / should have pp(후회)'],
      ['26', '과거 추측', 'must have pp(확신) / may have pp(약함) / cannot have pp(부정)'],
      ['27', '금지 vs 불필요', 'must not(금지) / don\'t have to(불필요)']
    ] },
    { g: '연결어 28~33', tip: 'Unit 07', rows: [
      ['28', '역접 (문맥 반대)', 'however, nevertheless, on the other hand'],
      ['29', '양보 (~이지만)', 'although/though + S+V / despite + 명사'],
      ['30', '원인·결과', 'because + S+V / because of·due to + 명사 / therefore'],
      ['31', '조건', 'unless(~않는 한), as long as, provided that'],
      ['32', '시간 기간', 'while + S+V / during + 명사 / for + 숫자기간'],
      ['33', '추가·예시·요약', 'moreover·in addition / for example / in summary']
    ] }
  ];
  function openGpSheet() {
    var h = '<button class="sheet-close" data-close="1">✕</button>' +
      '<div class="sheet-num">지텔프 켈리</div>' +
      '<div class="sheet-title">G-POINT 1~33 요약 암기표</div>' +
      gpTableHtml(false) +
      '<button class="btn primary wide" data-close="1" style="margin-top:10px">확인</button>';
    $('#sheetIn').innerHTML = h;
    $('#sheet').classList.remove('hidden');
    bindGpRows($('#sheetIn'));
    $$('#sheetIn .gp-jbtn').forEach(function (b) {
      b.onclick = function () {
        var t = $('#gp-g' + b.getAttribute('data-goto'));
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
        $$('#sheetIn .gp-jbtn').forEach(function (x) { x.classList.toggle('on', x === b); });
        sfx('tap');
      };
    });
  }

  /* ---------- header / tabs ---------- */
  function hexA(hex, a) {
    var c = String(hex).replace('#', '');
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    var r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }
  function applyTheme() {
    var s = SUBJ[S.subj], rt = document.documentElement.style;
    rt.setProperty('--c', s.color);
    rt.setProperty('--c-soft', hexA(s.color, 0.16));
    rt.setProperty('--c-dark', shade(s.color, 0.22));
  }
  function shade(hex, amt) {
    var c = hex.replace('#', '');
    var r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
    var f = function (v) { v = Math.round(v + 255 * amt); return Math.max(0, Math.min(255, v)); };
    return '#' + [f(r), f(g), f(b)].map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('');
  }
  function rankOf(xp) {
    var r = RANKS[0], i = 0;
    for (var k = 0; k < RANKS.length; k++) if (xp >= RANKS[k].xp) { r = RANKS[k]; i = k; }
    return { r: r, i: i, next: RANKS[i + 1] || null };
  }
  function renderHud() {
    $('#streakN').textContent = S.streak.n || 0;
    $('#xpN').textContent = xpAvail();
    var chip = $('#xpN') && $('#xpN').parentNode;
    if (chip) chip.title = '쓸 수 있는 P ' + xpAvail() + ' · 누적 ' + (S.xp || 0) + ' P';
    $('#mute').textContent = S.muted ? '🔇' : '🔊';
    var rk = rankOf(S.xp || 0);
    $('#rankBadge').innerHTML = '<span>' + rk.r.e + '</span>' + rk.r.n;
    $('#rankBadge').title = rk.next ? (rk.next.n + '까지 ' + (rk.next.xp - (S.xp || 0)) + ' P') : '최고 계급';
  }
  function checkPromotion() {
    var now = rankOf(S.xp || 0);
    if (S.rankIdx === undefined) { S.rankIdx = now.i; return; }
    if (now.i > S.rankIdx) {
      S.rankIdx = now.i; save();
      sfx('level'); confetti(80);
      openRankSheet(now.r, true);
    } else if (now.i < S.rankIdx) { S.rankIdx = now.i; save(); }
  }
  function rankSheetHtml(rank, promoted) {
    var rk = rankOf(S.xp || 0);
    var html = '<button class="sheet-close" data-close="1">✕</button>';
    if (promoted && rank) {
      html += '<div class="promo"><div class="promo-emoji">' + rank.e + '</div>' +
        '<h2>' + rank.n + ' 승진!</h2><p>축하합니다! ' + (S.xp || 0) + ' P로 <b>' + rank.n + '</b>이 되었어요.</p></div>';
    } else {
      html += '<div class="sheet-num">나의 계급</div><div class="sheet-title">' + rk.r.e + ' ' + rk.r.n + '</div>' +
        '<div class="sheet-meta">누적 ' + (S.xp || 0) + ' P' + (rk.next ? ' · 다음 계급 ' + rk.next.n + '까지 ' + (rk.next.xp - (S.xp || 0)) + ' P' : ' · 최고 계급') + '</div>';
    }
    html += '<div class="rank-list">';
    RANKS.forEach(function (r, i) {
      var cls = 'rank-item' + (i <= rk.i ? ' got' : '');
      html += '<div class="' + cls + '"><span>' + r.e + '</span><b>' + r.n + '</b><i>' + r.xp + ' P</i></div>';
    });
    html += '</div>' + xpSpendHtml();
    html += '<button class="btn primary" data-close="1" style="margin-top:12px">확인</button>';
    return html;
  }
  function openRankSheet(rank, promoted) {
    $('#sheetIn').innerHTML = rankSheetHtml(rank, promoted);
    $('#sheet').classList.remove('hidden');
  }
  /* 헤더 실제 높이를 CSS 변수로 넘겨 과목 탭이 그 아래에 정확히 붙게 한다(카드가 반쯤 비치는 겹침 방지) */
  function syncTopHeight() {
    var h = $('header.top');
    if (!h) return;
    document.documentElement.style.setProperty('--topH', Math.round(h.offsetHeight) + 'px');
  }
  function renderSubtabs() {
    var el = $('#subtabs'); el.innerHTML = '';
    D.subjects.forEach(function (s) {
      var b = document.createElement('button');
      b.className = 'stab' + (s.id === S.subj ? ' on' : '');
      if (s.id === S.subj) b.style.background = s.color;
      b.setAttribute('data-sub', s.id);
      b.setAttribute('aria-label', s.name + ' · ' + s.teacher);
      b.innerHTML = '<span class="si">' + s.emoji + '</span><b>' + s.name + '</b>';
      b.onclick = function () {
        if (S.subj === s.id) return;
        S.subj = s.id; save(); sfx('tap');
        renderAll(); window.scrollTo({ top: 0, behavior: 'smooth' });
      };
      el.appendChild(b);
    });
    var onTab = el.querySelector('.stab.on');
    if (onTab && onTab.scrollIntoView) { try { onTab.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (e) {} }
    syncTopHeight();
  }

  /* ---------- 오늘의 목표 ---------- */
  function dayRec() {
    var t = todayStr();
    if (!S.days[t]) S.days[t] = { xp: 0, ans: 0, ok: 0 };
    return S.days[t];
  }
  function todayLectures(cid) {
    var m = ckMap(cid), t = todayStr(), out = [];
    Object.keys(m).forEach(function (n) { if (m[n] === t) out.push(Number(n)); });
    return out.sort(function (a, b) { return a - b; });
  }
  function todayLectureCount() {
    var n = 0;
    D.subjects.forEach(function (s) {
      s.courses.forEach(function (c) { n += todayLectures(c.id).length; });
    });
    return n;
  }
  function renderQuest() {
    var d = dayRec();
    var pctXp = Math.min(100, Math.round((d.xp || 0) / S.goal.xp * 100));
    var pctQ = Math.min(100, Math.round((d.ans || 0) / S.goal.q * 100));
    $('#goalXpBar').style.width = pctXp + '%';
    $('#goalQBar').style.width = pctQ + '%';
    $('#goalXpTxt').textContent = (d.xp || 0) + ' / ' + S.goal.xp + ' P';
    $('#goalQTxt').textContent = (d.ans || 0) + ' / ' + S.goal.q + '문제';
    var lecN = todayLectureCount();
    $('#goalLecTxt').textContent = lecN + '강 (목표 1강)';
    $('#questLec').classList.toggle('done', lecN >= 1);
    $('#questXp').classList.toggle('done', (d.xp || 0) >= S.goal.xp);
    $('#questQ').classList.toggle('done', (d.ans || 0) >= S.goal.q);
    var all = lecN >= 1 && (d.xp || 0) >= S.goal.xp && (d.ans || 0) >= S.goal.q;
    var done = [lecN >= 1, (d.xp || 0) >= S.goal.xp, (d.ans || 0) >= S.goal.q].filter(Boolean).length;
    $('#questPct').textContent = done + '/3 완료';
    $('#questCard').classList.toggle('all-done', all);
    renderGoalBar();
  }

  /* ---------- 오늘 목표 게이지 (문항·OX·빈칸 모두 포함) ---------- */
  function renderGoalBar() {
    var el = $('#goalBar');
    if (!el) return;
    var d = dayRec(), goal = S.dayGoal || 30, n = d.ans || 0;
    var pct = Math.min(100, Math.round(n / goal * 100));
    var done = n >= goal;
    var txt = $('#gbText'), pe = $('#gbPct'), fill = $('#gbFill');
    if (txt) txt.textContent = done ? (n + '문제 · 목표 ' + goal + ' 달성') : (n + ' / ' + goal + '문제');
    if (pe) pe.textContent = pct + '%';
    if (fill) fill.style.width = pct + '%';
    el.classList.toggle('done', done);
    var dn = $('#gbDone'); if (dn) dn.classList.toggle('hidden', !done);
    var st = $('#gbSet'); if (st) st.textContent = goal + '문제 ▾';
  }
  function openGoalSheet() {
    var opts = [10, 20, 30, 50], cur = S.dayGoal || 30;
    var h = '<button class="sheet-close" data-close="1">✕</button>' +
      '<div class="sheet-num">오늘 목표</div>' +
      '<div class="sheet-title">하루에 몇 문제 풀까요?</div>' +
      '<div class="sheet-meta">문항 풀이·OX 회독·빈칸 채우기가 모두 오늘 푼 문제로 집계돼요.</div><div class="goal-opts">';
    opts.forEach(function (n) {
      h += '<button class="goal-opt' + (n === cur ? ' on' : '') + '" data-n="' + n + '">' + n + '문제</button>';
    });
    h += '</div>';
    $('#sheetIn').innerHTML = h;
    $('#sheet').classList.remove('hidden');
    $$('#sheetIn .goal-opt').forEach(function (b) {
      b.onclick = function () {
        S.dayGoal = Number(b.getAttribute('data-n')); save(); closeSheet(); renderGoalBar(); sfx('tap');
        toast('오늘 목표를 ' + S.dayGoal + '문제로 바꿨어요');
      };
    });
  }

  /* ---------- 오늘의 챌린지 ---------- */
  function todayChallenges() {
    var d = new Date();
    var seed = d.getFullYear() * 372 + (d.getMonth() + 1) * 31 + d.getDate();
    var a = CHALLENGES[seed % CHALLENGES.length];
    var b = CHALLENGES[(seed + 2) % CHALLENGES.length];
    if (b.id === a.id) b = CHALLENGES[(seed + 1) % CHALLENGES.length];
    return [a, b];
  }
  function challengeProgress(c) {
    var day = dayRec();
    if (c.id === 'c10') return { v: day.ans || 0, n: c.need };
    if (c.id === 'combo') return { v: Math.max(S.bestCombo || 0, (typeof QS !== 'undefined' && QS ? QS.maxCombo : 0)), n: c.need };
    if (c.id === 'xp') return { v: day.xp || 0, n: c.need };
    if (c.id === 'lec') return { v: todayLectureCount(), n: c.need };
    return { v: 0, n: 1 };
  }
  function renderChallenges() {
    var el = $('#challengeList');
    if (!el) return;
    var ch = todayChallenges(), html = '';
    ch.forEach(function (c) {
      var p = challengeProgress(c);
      var done = p.v >= p.n;
      html += '<div class="ch-item' + (done ? ' done' : '') + '"><span class="ch-ico">' + (done ? '✅' : '🎯') + '</span>' +
        '<span class="ch-t">' + c.t + '</span>' +
        '<span class="ch-n">' + Math.min(p.v, p.n) + '/' + p.n + '</span></div>';
    });
    el.innerHTML = html;
  }
  function passGauge() {
    var acc = S.ans ? S.ok / S.ans : 0;
    var gtelpAns = 0, gtelpOk = 0;
    Object.keys(S.unit).forEach(function (k) { });
    // 지텔프 문법 정답률 → 26문항 환산 (문법 몰빵 전략)
    var gt = S.ans ? Math.round(acc * 26) : 0;
    var score = Math.round(26 * 100 * acc / 26);
    var band = acc >= 0.9 ? '안정권' : acc >= 0.8 ? '합격선 근접' : acc >= 0.65 ? '조금 더' : '기초 다지기';
    return { acc: Math.round(acc * 100), gt: gt, band: band, ans: S.ans || 0 };
  }
  function renderPass() {
    var p = passGauge();
    $('#passBar').style.width = Math.min(100, p.acc) + '%';
    $('#passPct').textContent = p.ans ? p.acc + '%' : '-';
    $('#passTxt').textContent = p.ans < 10 ? '문제를 10개 이상 풀면 예측이 정확해져요' : '문법 26문항 기준 ' + p.gt + '/26 · ' + p.band;
    $('#passNeed').textContent = p.ans ? (p.gt >= 22 ? '목표 22문항 달성!' : '목표 22문항까지 ' + (22 - p.gt) + '문항') : '목표: 문법 22/26';
  }

  /* ---------- 이번 주 요일별 불꽃(월~일) ---------- */
  function weekInfo() {
    var d0 = new Date(); d0.setHours(0, 0, 0, 0);
    d0.setDate(d0.getDate() - ((d0.getDay() + 6) % 7));   // 이번 주 월요일
    var L = ['월', '화', '수', '목', '금', '토', '일'], today = todayStr(), days = [], n = 0, ans = 0;
    for (var i = 0; i < 7; i++) {
      var d = new Date(d0); d.setDate(d0.getDate() + i);
      var k = dstr(d);
      var rec = (S.days && S.days[k]) || {};
      var on = !!((rec.xp || 0) > 0 || (rec.ans || 0) > 0);
      if (on) { n++; ans += (rec.ans || 0); }
      days.push({ k: k, label: L[i], on: on, today: k === today, future: k > today, ans: rec.ans || 0 });
    }
    return { days: days, n: n, ans: ans };
  }
  function renderWeek() {
    var w = weekInfo(), html = '';
    w.days.forEach(function (d) {
      html += '<div class="wk-day' + (d.on ? ' on' : '') + (d.today ? ' today' : '') + (d.future ? ' future' : '') + '"' +
        ' title="' + d.k + (d.on ? ' · 문제 ' + d.ans + '개' : '') + '">' +
        '<span class="wd">' + d.label + '</span><i class="wf">🔥</i><b class="wn">' + (d.on ? d.ans : '') + '</b></div>';
    });
    ['weekRowDash', 'weekRowRev', 'weekRowStats'].forEach(function (id) {
      var el = $('#' + id); if (el) el.innerHTML = html;
    });
    var note = '이번 주 ' + w.n + '일 · 문제 ' + w.ans + '개';
    ['weekNoteDash', 'weekNoteRev', 'weekNoteStats'].forEach(function (id) {
      var el = $('#' + id); if (el) el.textContent = note;
    });
    var msg = w.n >= 7 ? '7일 개근! 완벽한 한 주예요 🏆'
      : w.n ? '이번 주 ' + w.n + '일 불꽃 · 연속 ' + (S.streak.n || 0) + '일'
        : '오늘 한 문제라도 풀면 불꽃이 켜져요';
    var best = S.streak.best ? ' <i style="font-style:normal;color:var(--ink3)">최고 ' + S.streak.best + '일</i>' : '';
    ['weekStreakDash', 'weekStreakStats'].forEach(function (id) {
      var el = $('#' + id); if (el) el.innerHTML = '<b>🔥</b> ' + esc(msg) + best;
    });
  }

  /* ---------- 첫 화면 컴팩트 대시보드 ---------- */
  function renderDash() {
    var d = dayRec();
    var lecN = todayLectureCount();
    var done = [lecN >= 1, (d.xp || 0) >= S.goal.xp, (d.ans || 0) >= S.goal.q].filter(Boolean).length;
    var p = passGauge();
    var cd = 0;
    todayChallenges().forEach(function (c) { var pp = challengeProgress(c); if (pp.v >= pp.n) cd++; });
    var q1 = $('#dashQuest'), q2 = $('#dashPass'), q3 = $('#dashChal');
    if (q1) q1.textContent = '목표 ' + done + '/3';
    if (q2) q2.textContent = p.ans ? '합격 ' + p.acc + '%' : '합격 -';
    if (q3) q3.textContent = '챌린지 ' + cd + '/2';
    var dash = $('#dash'), panel = $('#dashPanel'), bar = $('#dashBar');
    if (dash) dash.classList.toggle('done', done >= 3 && cd >= 2);
    if (panel) panel.classList.toggle('hidden', !S.dashOpen);
    if (dash) dash.classList.toggle('open', !!S.dashOpen);
    if (bar) bar.setAttribute('aria-expanded', S.dashOpen ? 'true' : 'false');
  }

  /* ---------- mascot ---------- */
  var MV = '2026112028';
  /* 순경 공채(2027-08-21)·지텔프(2026-11-29) 목표에 맞춘 현실 자극 문구 */
  var MOT = {
    done: [
      '오늘 몫 끝. 이 페이스가 합격이에요.',
      '채웠어요. 안 한 사람과 하루 벌렸어요.',
      '오늘은 여기까지. 내일 또 {q}문제.',
      '{po}까지 이대로만 가면 돼요. 오늘은 끝.',
      '끝냈으면 쉬세요. 내일이 더 중요해요.'
    ],
    none: [
      '어제 외운 것, 오늘 안 풀면 날아가요.',
      '지텔프 {gt}. 문법부터 5문제만.',
      '0문제로 하루 넘기면 {po}만 줄어요.',
      '책 펴는 3분, 안 펴면 내일 30분.',
      '한 문제만. 시작이 제일 싸요.'
    ],
    mid: [
      '지금 잡은 오답이 시험장 1점이에요.',
      '지텔프 끝내야 형사법에 시간 써요.',
      '여기서 끊으면 내일 처음부터예요.',
      '오답 다시 맞히는 게 진짜 실력이에요.',
      '{po}. 오늘 몫은 오늘 끝내는 게 싸요.'
    ]
  };
  function motLine(key, n) {
    var arr = MOT[key] || MOT.none;
    var gd = daysTo(GTELP);
    var pool = arr.filter(function (s) { return gd >= 0 || s.indexOf('{gt}') < 0; });
    if (!pool.length) pool = arr;
    /* 날짜 + 푼 문제 수(5문제 단위)에 따라 문구가 바뀜 */
    var s = pool[seedOf(todayStr() + key + '-' + Math.floor((n || 0) / 5)) % pool.length];
    return s.replace('{gt}', ddayLabel(GTELP))
      .replace('{po}', ddayLabel(S.dday || DTARGET))
      .replace('{q}', String(S.goal.q || 10));
  }
  function renderMascot() {
    var d = dayRec();
    var lead = $('#homeBubble');
    if (lead) {
      var key = ((d.ans || 0) >= S.goal.q && (d.xp || 0) >= S.goal.xp) ? 'done' : (!(d.ans || 0) ? 'none' : 'mid');
      lead.textContent = motLine(key, d.ans || 0);
    }
    var memo = $('#bubMemo');
    if (memo) memo.textContent = memoLine();
  }

  /* ---------- stage ---------- */
  function curCourse() { return COURSE[S.course[S.subj]]; }

  function latestLectures(cid) {
    var m = ckMap(cid), best = '', nums = [];
    Object.keys(m).forEach(function (n) { if (m[n] > best) best = m[n]; });
    if (!best) return { date: '', nums: [] };
    Object.keys(m).forEach(function (n) { if (m[n] === best) nums.push(Number(n)); });
    return { date: best, nums: nums.sort(function (a, b) { return a - b; }) };
  }

  var lastCourse = '';
  function renderStage() {
    var s = SUBJ[S.subj], c = curCourse();
    if (!c) return;
    if (lastCourse !== c.id) { lastCourse = c.id; $('#path')._scrolled = false; }
    var gp = isGP(c);
    $('#heroSub').textContent = s.subLabel || (s.name + ' · ' + s.teacher + ' 교수');
    $('#heroName').textContent = c.name;
    var done = checkedNums(c.id).length;
    $('#progBar').style.width = Math.min(100, (done / c.total) * 100) + '%';
    var tL = todayLectures(c.id);
    $('#progTxt').textContent = done + ' / ' + c.total + uw(c);
    // 강좌 메타 (개강일 · 최근 업로드 · 업로드된 회차)
    var meta = [];
    if (c.open) meta.push('개강 ' + c.open);
    if (c.last) meta.push('최근 업로드 ' + c.last);
    if (!gp) meta.push('업로드 ' + c.lec.filter(function (L) { return L.up; }).length + '/' + c.total + '강');
    $('#heroMeta').textContent = meta.join(' · ');
    var note = '';
    var btn = $('#ctaToday');
    if (done === 0) {
      btn.textContent = gp ? 'G-POINT 체크하고 시작하기' : '1강부터 체크하고 시작하기';
      btn.onclick = function () { openSheet(c.id, nextLecture(c.id)); };
      note = gp ? '1번 노드를 눌러 “이 G-POINT 들었어요 ✓”를 누르면 그 포인트 문제가 바로 열려요.'
                : '1번 노드를 눌러 “이 강의 들었어요 ✓”를 누르면 그 강의 문제가 바로 열려요.';
    } else if (tL.length) {
      btn.textContent = '오늘 체크한 ' + tL.length + uw(c) + ' 문제 풀기';
      btn.onclick = function () { startSession('today'); };
      note = '오늘 체크한 ' + fmtNums(tL, c) + '에서 문제가 나옵니다.';
    } else {
      var lt = latestLectures(c.id);
      btn.textContent = '최근 체크한 ' + (gp ? 'G-POINT' : '강의') + ' 문제 풀기';
      btn.onclick = function () { startSession('today'); };
      note = '오늘은 아직 체크한 ' + (gp ? '포인트' : '강의') + '가 없어 ' + lt.date.slice(5).replace('-', '/') + '에 체크한 ' + fmtNums(lt.nums, c) + '(으)로 복습합니다.';
    }
    $('#heroNote').textContent = note;
    $('#ctaAll').onclick = function () { startSession('all'); };
    $('#ctaWrong').onclick = function () { startSession('wrong'); };
    var _tc = $('#ctaCards');
    if (_tc) _tc.onclick = function () { sfx('tap'); MEMO.seg = 'card'; cfStart(); openMemo('card'); };
    var _tb = $('#ctaBlank');
    if (_tb) _tb.onclick = function () { sfx('tap'); startBlank(); };
    $('#courseBtn').onclick = openCourseSheet;
    renderTiles();
    renderPath(c);
  }
  function fmtNums(a, c) {
    if (!a.length) return '';
    var gp = isGP(c);
    if (a.length <= 3) return (gp ? 'G-POINT ' : '') + a.join('·') + (gp ? '' : '강');
    return gp ? ('G-POINT ' + a[0] + ' 외 ' + (a.length - 1) + '개') : (a[0] + '강 외 ' + (a.length - 1) + '강');
  }
  function nextLecture(cid) {
    var m = ckMap(cid);
    for (var i = 1; i <= COURSE[cid].total; i++) if (!m[i]) return i;
    return COURSE[cid].total;
  }
  function nodePool(cid, n) { return poolForLecture(cid, n); }
  function isMastered(cid, n) {
    if (!isChecked(cid, n)) return false;
    var pool = nodePool(cid, n);
    if (!pool.length) return false;
    for (var i = 0; i < pool.length; i++) if (S.wrong[pool[i].i]) return false;
    // 그 노드 문제 중 한 개 이상을 실제로 맞혀야 왕관
    for (var j = 0; j < pool.length; j++) if (S.qok[pool[j].i]) return true;
    return false;
  }

  function shortLabel(t) {
    var s = String(t || '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    s = s.replace(/\s*\(.*\)\s*$/, '');                   // 끝 괄호 설명((will have pp) 등) 제거
    s = s.replace(/\s*\[.*\]\s*$/, '');                    // 끝 대괄호 설명 제거
    s = s.replace(/\s*p\.?\s*\d+(\s*[,~\-]\s*\d+)?\s*$/i, '');   // 끝 페이지 표기(p6~14, p24,20) 제거
    s = s.replace(/\s*\d+\s*번\s*$/, '');                 // 끝 문제 번호(12번) 제거
    s = s.replace(/^제\s*\d+\s*절\s+/, '');               // 앞머리 '제1절' 제거
    return s.trim();
  }

  function renderPath(c) {
    var path = $('#path'); path.innerHTML = '';
    var wrap = path.parentElement;
    var W = wrap.clientWidth || 360;
    var gp = isGP(c), today = todayStr(), doneSet = ckMap(c.id);
    var cur = nextLecture(c.id);
    var NODE = 52, R = NODE / 2, GAP = 72, BAND = 74;
    var list = [], y = 30, lastU = -2;
    c.lec.forEach(function (L) {
      var ui = unitIndex(c.id, L.n);
      if (ui !== lastU) { list.push({ kind: 'banner', ui: ui, y: y }); y += BAND; lastU = ui; }
      list.push({ kind: 'node', L: L, y: y, ui: ui });
      y += GAP;
    });
    var lastY = list.length ? list[list.length - 1].y : 30;
    var H = lastY + R + 26;
    path.style.height = H + 'px';

    var unitCnt = {};
    c.lec.forEach(function (L) {
      var ui = unitIndex(c.id, L.n);
      if (!unitCnt[ui]) unitCnt[ui] = [0, 0];
      unitCnt[ui][1]++;
      if (doneSet[L.n]) unitCnt[ui][0]++;
    });

    var mid = W / 2, amp = Math.min(58, W * 0.17), seq = 0, curY = 30, prevPt = null, segs = [];
    list.forEach(function (it) {
      if (it.kind === 'banner') {
        var u = c.units[it.ui];
        if (!u) return;
        var cnt = unitCnt[it.ui] || [0, 0];
        var el = document.createElement('div');
        el.className = 'unit-banner';
        el.style.top = it.y + 'px';
        el.style.setProperty('--ubc', SUBJ[S.subj].color);
        el.innerHTML = '<span class="ub-n">UNIT ' + (it.ui + 1) + '</span>' +
          '<span class="ub-t">' + esc(u.n) + '</span>' +
          '<span class="ub-p">' + (gp ? 'G-POINT ' + u.a + (u.b !== u.a ? '~' + u.b : '') : u.a + '~' + u.b + '강') +
          ' · ' + cnt[0] + '/' + cnt[1] + '</span>';
        path.appendChild(el);
        prevPt = null;            // 유닛 경계에서는 연결 점선을 긋지 않는다
        return;
      }
      var L = it.L;
      var x = mid + Math.sin(seq * 1.15) * amp;
      seq++;
      var done = !!doneSet[L.n], mast = isMastered(c.id, L.n);
      var w = document.createElement('div');
      w.className = 'node-wrap';
      w.style.left = x + 'px'; w.style.top = it.y + 'px';
      var b = document.createElement('button');
      var cls = 'node';
      if (done) cls += ' done';
      if (!L.up) cls += ' plan';
      if (L.n === cur) cls += ' current';
      if (mast) cls += ' master';
      if (doneSet[L.n] === today) cls += ' today';
      b.className = cls;
      b.innerHTML = '<span class="num">' + L.n + '</span>' +
        (mast ? '<span class="nbadge star" aria-hidden="true">★</span>'
              : done ? '<span class="nbadge" aria-hidden="true">✓</span>' : '');
      b.setAttribute('aria-label', (gp ? 'G-POINT ' + L.n : L.n + '강') + (L.d ? ' · ' + L.d + ' 업로드' : '') +
        (mast ? ' · 마스터' : done ? ' · 완료' : ''));
      b.onclick = function () { sfx('tap'); openSheet(c.id, L.n); };
      w.appendChild(b);
      var lab = shortLabel(L.t);
      if (lab) {
        // 원이 오른쪽에 있으면 라벨은 왼쪽, 왼쪽에 있으면 라벨은 오른쪽 — 어느 쪽이든 화면 안에 들어온다
        var toLeft = x > mid;
        var sp = document.createElement('span');
        sp.className = 'nlabel' + (toLeft ? ' left' : '');
        sp.textContent = lab;
        sp.style.maxWidth = Math.max(48, (toLeft ? x : W - x) - R - 14) + 'px';
        w.appendChild(sp);
      }
      path.appendChild(w);
      if (prevPt) {
        var dx = x - prevPt.x, dy = it.y - prevPt.y;
        var len = Math.sqrt(dx * dx + dy * dy), t = R + 9;
        if (len > t * 2 + 8) {
          var ux = dx / len, uy = dy / len;
          segs.push([prevPt.x + ux * t, prevPt.y + uy * t, x - ux * t, it.y - uy * t]);
        }
      }
      prevPt = { x: x, y: it.y };
      if (L.n === cur) curY = it.y;
    });

    var svg = $('#pathSvg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('width', W);
    if (segs.length) {
      svg.innerHTML = segs.map(function (s) {
        return '<path d="M' + s[0].toFixed(1) + ' ' + s[1].toFixed(1) + 'L' + s[2].toFixed(1) + ' ' + s[3].toFixed(1) +
          '" fill="none" stroke="#3a4457" stroke-width="4" stroke-linecap="round" stroke-dasharray="0.1 10"/>';
      }).join('');
    } else {
      svg.innerHTML = '';
    }

    if (!path._scrolled) {
      path._scrolled = true;
      var top = path.getBoundingClientRect().top + (window.scrollY || window.pageYOffset || 0);
      var target = top + curY - (window.innerHeight * 0.45);
      setTimeout(function () { window.scrollTo({ top: Math.max(0, target), behavior: 'auto' }); }, 60);
    }
  }

  /* ---------- sheet ---------- */
  function closeSheet() { $('#sheet').classList.add('hidden'); }
  function closeSheetIfBg(e) {
    if (e.target && e.target.getAttribute && e.target.getAttribute('data-close')) closeSheet();
  }
  function openSheet(cid, n) {
    var c = COURSE[cid], L = c.lec[n - 1];
    if (!L) return;
    var on = isChecked(cid, n);
    var pool = poolForLecture(cid, n);
    var gp = isGP(c), what = gp ? '이 포인트 문제' : '이 단원 문제';
    var st = pool.length ? '<span class="pill">' + what + ' ' + pool.length + '개</span>' : '<span class="pill plan">' + what + ' 준비 중</span>';
    var isCur = n === nextLecture(cid);
    var datePill = L.d ? '<span class="pill date">📅 ' + L.d + ' 업로드</span>' : '';
    if (gp) {
      var cnt = pool.length;
      datePill = '<span class="pill date">📘 교재 G-POINT ' + n + '</span>' + (cnt ? '<span class="pill">문제 ' + cnt + '개</span>' : '');
    }
    $('#sheetIn').innerHTML =
      '<button class="sheet-close" data-close="1">✕</button>' +
      '<div class="sheet-num">' + (gp ? SUBJ[c.sub].name + ' · G-POINT ' + n : c.name + ' · ' + n + '강') + (L.up ? '' : ' <span class="pill plan">업로드 예정</span>') + (on ? ' <span class="pill done">체크됨</span>' : '') + '</div>' +
      '<div class="sheet-title">' + (gp ? 'G-POINT ' + n + (L.t ? ' · ' + esc(L.t) : '') : (L.t ? esc(L.t) : '아직 제목이 공개되지 않은 회차예요')) + '</div>' +
      '<div class="sheet-meta">' + (unitOf(cid, n) ? esc(unitOf(cid, n)) + ' · ' : '') + datePill + ' ' + st + '</div>' +
      (posOf(cid, n) ? '<div class="sheet-pos">' + posOf(cid, n) + '</div>' : '') +
      '<button class="btn ' + (on ? 'ghost' : 'primary') + '" id="shToggle">' + (on ? '체크 해제' : (gp ? '이 G-POINT 들었어요 ✓' : '이 강의 들었어요 ✓')) + '</button>' +
      '<button class="btn ghost" id="shQuiz" ' + (on && pool.length ? '' : 'disabled style="opacity:.45"') + '>' + what + ' 풀기</button>' +
      (isCur ? '<button class="btn ghost" id="shNext">다음 ' + (gp ? 'G-POINT' : '강의') + ' 보기 →</button>' : '');
    $('#sheet').classList.remove('hidden');
    $('#shToggle').onclick = function () {
      var nm = gp ? 'G-POINT ' + n : n + '강';
      if (isChecked(cid, n)) { delete ckMap(cid)[n]; toast(nm + ' 체크를 해제했어요'); }
      else {
        ckMap(cid)[n] = todayStr(); touchDay(); toast(nm + ' 체크! 오늘의 복습에 들어갑니다'); sfx('ok');
        if (isMastered(cid, n)) { sfx('crown'); }
      }
      save(); closeSheet(); renderAll();
    };
    var qb = $('#shQuiz');
    if (qb) qb.onclick = function () { closeSheet(); startSession('lecture', { cid: cid, n: n }); };
    var nb = $('#shNext');
    if (nb) nb.onclick = function () { openSheet(cid, Math.min(c.total, n + 1)); };
  }
  function posOf(cid, n) {
    var c = COURSE[cid];
    if (!c.open || !c.dates) return '';
    return '';
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function unitOf(cid, n) {
    var c = COURSE[cid], i = unitIndex(cid, n);
    return i >= 0 ? c.units[i].n : '';
  }
  function openCourseSheet() {
    var s = SUBJ[S.subj];
    var html = '<button class="sheet-close" data-close="1">✕</button>' +
      '<div class="sheet-num">' + (s.subLabel || s.name + ' · ' + s.teacher + ' 교수') + '</div>' +
      '<div class="sheet-title">강좌 선택 <span class="pill">' + s.courses.length + '개</span></div>' +
      '<div class="sheet-meta">2026년 개설 강좌를 최신순으로 모았어요. 지금 듣는 강좌를 고르면 진도가 그 강좌 기준으로 쌓입니다.</div>' +
      '<div class="course-list">';
    s.courses.forEach(function (c) {
      var d = checkedNums(c.id).length;
      var upN = c.lec.filter(function (L) { return L.up; }).length;
      var on = S.course[s.id] === c.id;
      var mt = /^\[([^\]]+)\]\s*(.*)$/.exec(c.name);
      var tag = mt ? mt[1] : '';
      var nm = (mt ? mt[2] : c.name).replace(/\s*\(26년\s*\d{1,2}월\)/, '');
      html += '<button class="course-item' + (on ? ' on' : '') + '" data-c="' + c.id + '">' +
        '<span class="ci-top"><b class="ci-mon">' + (c.mon || '') + '</b>' +
        '<b class="ci-name">' + esc(nm) + '</b>' +
        (on ? '<span class="ci-on">선택</span>' : '') + '</span>' +
        '<span class="ci-meta">' + (tag ? '<b class="ci-tag">' + esc(tag) + '</b> · ' : '') +
        (upN ? '업로드 ' + upN + '/' + c.total + uw(c) : '아직 업로드 전') +
        (c.last ? ' · 최근 ' + c.last : '') + (d ? ' · 내 진도 ' + d + uw(c) : '') + '</span>' +
        '</button>';
    });
    html += '</div>';
    $('#sheetIn').innerHTML = html;
    $('#sheet').classList.remove('hidden');
    $$('#sheetIn [data-c]').forEach(function (b) {
      b.onclick = function () {
        S.course[s.id] = b.getAttribute('data-c');
        $('#path')._scrolled = false; save(); closeSheet(); renderAll(); sfx('tap');
      };
    });
  }

  /* ---------- pools ---------- */
  function unitBanks(cid, ui) {
    var c = COURSE[cid], u = c.units[ui];
    if (!u) return [];
    return u.bs || [[cid, ui]];
  }
  function poolForUnit(cid, ui) {
    var out = [];
    unitBanks(cid, ui).forEach(function (b) {
      var arr = (QBY[b[0]] || {})[b[1]];
      if (arr) out = out.concat(arr);
    });
    return out;
  }
  function poolForLecture(cid, n) {
    var c = COURSE[cid], out = [], m = QBY[cid] || {};
    // 지텔프 G-POINT: 포인트 번호가 곧 문제 묶음 (없으면 단원 문제로 대체하지 않는다)
    Object.keys(m).forEach(function (u) {
      m[u].forEach(function (q) { if (q.gp === n) out.push(q); });
    });
    if (out.length || isGP(c)) return out;
    var ui = unitIndex(cid, n);
    if (ui < 0) return out;
    // 그 강의가 속한 단원의 문제 (강좌별 단원 구간이 회차 기준으로 나뉘어 있어도 문제은행은 기준 강좌에서 가져온다)
    return poolForUnit(cid, ui);
  }
  function poolForCourse(cid, nums) {
    var c = COURSE[cid], out = [];
    if (!nums.length) return out;
    if (isGP(c)) {
      Object.keys(QBY[cid] || {}).forEach(function (u) {
        QBY[cid][u].forEach(function (q) { if (q.gp && nums.indexOf(q.gp) >= 0) out.push(q); });
      });
      return out;
    }
    c.units.forEach(function (u, i) {
      var hit = nums.some(function (n) { return n >= u.a && n <= u.b; });
      if (hit) out = out.concat(poolForUnit(cid, i));
    });
    return out;
  }
  function poolForSubject(subjId, numsFilter) {
    var s = SUBJ[subjId], out = [];
    s.courses.forEach(function (c) {
      var nums = checkedNums(c.id);
      if (numsFilter === 'today') {
        var m = ckMap(c.id), t = todayStr();
        nums = Object.keys(m).filter(function (n) { return m[n] === t; }).map(Number);
        if (!nums.length) {
          var lt = latestLectures(c.id);
          nums = lt.nums;
        }
      }
      out = out.concat(poolForCourse(c.id, nums));
    });
    return out;
  }
  function poolWrong() {
    var ids = Object.keys(S.wrong);
    if (!ids.length) return false;
    return D.questions.filter(function (q) {
      if (!S.wrong[q.i]) return false;
      if (!inScope(q)) return false;
      if (S.mix) return true;
      return q.s === S.subj;
    });
  }

  /* ---------- review view ---------- */
  function renderReview() {
    var c = curCourse(), s = SUBJ[S.subj];
    var tN = todayLectures(c.id).length;
    var allN = checkedNums(c.id).length;
    var wrongN = D.questions.filter(function (q) { return S.wrong[q.i] && (S.mix || q.s === S.subj); }).length;
    $('#reviewSub').textContent = (S.mix ? '전체 과목' : s.name) + ' · ' + (isGP(c) ? '체크한 G-POINT에서만' : '들은 강의에서만') + ' 문제가 나옵니다.';
    var mt = $('#mToday b'); if (mt) mt.textContent = isGP(c) ? '오늘 체크한 G-POINT' : '오늘 들은 강의';
    $('#mTodayTxt').textContent = tN ? (isGP(c) ? tN + uw(c) : '오늘 체크한 ' + tN + uw(c)) : (isGP(c) ? 'G-POINT 없음 (최근 것으로)' : '오늘 체크한 강의 없음 (최근 것으로)');
    $('#mAllTxt').textContent = '지금까지 체크한 ' + allN + uw(c) + ' 누적';
    $('#mWrongTxt').textContent = wrongN ? wrongN + '문제 대기' : '오답 없음';
    $$('#lenChips .chip').forEach(function (b) {
      b.classList.toggle('on', Number(b.getAttribute('data-len')) === S.qlen);
    });
    $('#mixAll').checked = !!S.mix;
    var sp = $('#mSpeedTxt');
    if (sp) sp.textContent = (S.speedBest || 0) ? '최고 ' + S.speedBest + '문제 · 60초' : '60초 동안 최대한 많이';
    var ox = $('#mOxTxt');
    if (ox) ox.textContent = (S.oxBest || 0) ? '최고 ' + S.oxBest + '문장 · 5분' : '기출 선지 한 문장씩 O/X';
    var mb = $('#mMiniTxt');
    if (mb) mb.textContent = S.miniRuns ? '지금까지 ' + S.miniRuns + '회 · 타이머 · OMR' : '타이머 · OMR · 제출 후 일괄 채점';
    var eb = $('#mExamTxt');
    if (eb) { var exn = examBank(null).length; eb.textContent = exn ? exn + '문항 · 형사법 40 · 경찰학 40 · 범죄학 20' : '기출 데이터 확인 중'; }
    var isGp = S.subj === 'gtelp';
    var oxBtn = $('#mOx'); if (oxBtn) oxBtn.classList.toggle('hidden', isGp);
    var wHead = $('#weakTop') && $('#weakTop').previousElementSibling;
    if (wHead && wHead.classList && wHead.classList.contains('sec-title')) wHead.classList.toggle('hidden', isGp);
    if ($('#weakTop')) $('#weakTop').classList.toggle('hidden', isGp);
    renderWeakTop();
  }

  /* ---------- stats ---------- */
  function weakUnits() {
    var arr = [];
    Object.keys(S.unit).forEach(function (k) {
      var v = S.unit[k];
      if (!v || v.a < 3) return;
      var parts = k.split(':'), cid = parts[0], ui = Number(parts[1]);
      var c = COURSE[cid];
      if (!c || !c.units[ui]) return;
      arr.push({ k: k, cid: cid, ui: ui, acc: v.ok / v.a, a: v.a, name: SUBJ[c.sub].name + ' · ' + c.units[ui].n });
    });
    arr.sort(function (x, y) { return x.acc - y.acc; });
    return arr.slice(0, 3);
  }

  /* ============================================================
     🎯 약점 단원 집중 공략 — 오답 이력으로 TOP 3를 자동 집계
     · 오답이 없으면 지금 과목에서 기출이 많은 단원을 골라 바로 시작할 수 있게
     ============================================================ */
  function weakTopList(limit) {
    var by = {};
    D.questions.forEach(function (q) {
      var w = S.wrong[q.i];
      if (!w || q.gp) return;
      var k = q.c + ':' + q.u;
      var e = by[k] || (by[k] = { cid: q.c, ui: q.u, wrong: 0, cnt: 0 });
      e.wrong += (w.c || 1);
    });
    var out = [];
    Object.keys(by).forEach(function (k) {
      var e = by[k], c = COURSE[e.cid];
      if (!c || !c.units[e.ui]) return;
      var pool = poolForUnit(e.cid, e.ui);
      if (!pool.length) return;
      var fresh = pool.filter(function (q) { return !S.qok[q.i] && !S.wrong[q.i]; }).length;
      out.push({
        cid: e.cid, ui: e.ui, wrong: e.wrong, total: pool.length, fresh: fresh,
        name: (SUBJ[c.sub] ? SUBJ[c.sub].name + ' · ' : '') + c.units[e.ui].n
      });
    });
    out.sort(function (a, b) { return b.wrong - a.wrong || b.fresh - a.fresh; });
    return out.slice(0, limit || 3);
  }
  function unitSuggest(limit) {
    var c = curCourse(), s = SUBJ[S.subj];
    if (!c || isGP(c)) return [];
    var arr = [];
    (c.units || []).forEach(function (u, i) {
      var pool = poolForUnit(c.id, i);
      if (!pool.length) return;
      arr.push({ cid: c.id, ui: i, wrong: 0, total: pool.length, fresh: pool.length, name: s.name + ' · ' + u.n });
    });
    arr.sort(function (a, b) { return b.total - a.total; });
    return arr.slice(0, limit || 3);
  }
  function renderWeakTop() {
    var el = $('#weakTop');
    if (!el) return;
    var list = weakTopList(3), suggest = false;
    if (!list.length) { list = unitSuggest(3); suggest = true; }
    var hint = $('#weakHint');
    if (hint) hint.textContent = suggest ? '오답이 쌓이면 그 단원이 1순위로 올라와요' : '틀린 문제가 많은 단원부터';
    if (!list.length) {
      el.innerHTML = '<div class="empty">문제를 몇 개 풀면 약한 단원이 여기 자동으로 올라와요.</div>';
      return;
    }
    var h = '';
    list.forEach(function (w, i) {
      h += '<button class="weak-card" data-cid="' + w.cid + '" data-u="' + w.ui + '">' +
        '<span class="wc-rank' + (i === 0 ? ' hot' : '') + '">' + (i + 1) + '</span>' +
        '<span class="wc-body"><b>' + esc(w.name) + '</b>' +
        '<i>' + (w.wrong ? '틀린 ' + w.wrong + '문제 · ' : '') + '기출 ' + w.total + '문제' +
        (w.fresh ? ' · 안 푼 ' + w.fresh : '') + '</i></span>' +
        '<span class="wc-go">집중 풀이 ›</span></button>';
    });
    if (suggest) h += '<p class="lib-sub" style="margin:8px 0 0">아직 오답 기록이 없어서 ' + esc(SUBJ[S.subj].name) + ' 기출이 많은 단원을 골랐어요. 한 단원만 풀어도 기록이 쌓여요.</p>';
    el.innerHTML = h;
    $$('#weakTop .weak-card').forEach(function (b) {
      b.onclick = function () {
        sfx('tap');
        startSession('weakUnit', { cid: b.getAttribute('data-cid'), u: Number(b.getAttribute('data-u')) });
      };
    });
  }
  function renderStats() {
    $('#stStreak').textContent = S.streak.n || 0;
    $('#stXp').textContent = S.xp || 0;
    $('#stAcc').textContent = S.ans ? Math.round((S.ok / S.ans) * 100) + '%' : '-';
    $('#stAns').textContent = S.ans || 0;
    $('#stToday').textContent = todayLectureCount();
    var el = $('#stProg'); el.innerHTML = '';
    D.subjects.forEach(function (s) {
      s.courses.forEach(function (c) {
        var d = checkedNums(c.id).length;
        if (!d && s.courses.length > 1 && S.course[s.id] !== c.id) return;
        var w = document.createElement('div');
        w.className = 'prog-item';
        w.innerHTML = '<div class="pi-top"><span>' + s.emoji + ' ' + s.name + ' · ' + esc(c.name) + '</span><i>' + d + '/' + c.total + uw(c) + '</i></div>' +
          '<div class="bar"><i style="width:' + Math.min(100, d / c.total * 100) + '%;background:' + s.color + '"></i></div>' +
          (c.last ? '<div class="pi-sub">최근 업로드 ' + c.last + (c.open ? ' · 개강 ' + c.open : '') + '</div>' : '');
        el.appendChild(w);
      });
    });
    if (!el.children.length) el.innerHTML = '<div class="empty">아직 체크한 강의가 없어요.</div>';
    // 약점 단원
    var wk = $('#stWeak'); wk.innerHTML = '';
    var ws = weakUnits();
    if (!ws.length) wk.innerHTML = '<div class="empty">문제를 3개 이상 풀면 약한 단원이 여기 표시돼요.</div>';
    ws.forEach(function (w) {
      var d = document.createElement('div');
      d.className = 'weak-item';
      d.innerHTML = '<span class="wk-name">' + esc(w.name) + '</span><span class="wk-bar"><i style="width:' + Math.round(w.acc * 100) + '%"></i></span><b>' + Math.round(w.acc * 100) + '%</b><i class="wk-n">' + w.a + '문제</i>';
      wk.appendChild(d);
    });
    // 오답노트
    var wl = $('#stWrong'); wl.innerHTML = '';
    var arr = D.questions.filter(function (q) { return S.wrong[q.i]; })
      .sort(function (a, b) { return ((S.wrong[b.i] || {}).c || 1) - ((S.wrong[a.i] || {}).c || 1); });
    if (!arr.length) wl.innerHTML = '<div class="empty">틀린 문제가 여기에 쌓입니다. 맞히면 자동으로 지워져요.</div>';
    arr.slice(0, 40).forEach(function (q) {
      var d = document.createElement('div');
      d.className = 'wrong-item';
      d.innerHTML = '<span class="wi-tag">' + esc(qLabel(q)) + ' · ' + (S.wrong[q.i].c || 1) + '번 틀림</span>' +
        '<div class="wi-q">' + stemFlat(q.q) + '</div>' +
        '<div class="wi-e">정답: ' + esc(q.o[q.a]) + '<br>' + esc(expShort(q)) + '</div>';
      wl.appendChild(d);
    });
    var nW = D.questions.filter(function (q) { return S.wrong[q.i]; }).length;
    $('#stWrongGo').classList.toggle('hidden', !nW);
    $('#stWrongGo').textContent = '🩹 오답 ' + nW + '문제 바로 복습';
  }

  /* ---------- quiz ---------- */
  var QS = null;
  function startSession(mode, opt) {
    opt = opt || {};
    var pool = [], title = '';
    if (mode === 'lecture') {
      pool = poolForLecture(opt.cid, opt.n);
      title = COURSE[opt.cid].name + ' ' + opt.n + (isGP(COURSE[opt.cid]) ? ' 포인트' : '강');
    } else if (mode === 'ids') {
      pool = D.questions.filter(function (q) { return opt.ids.indexOf(q.i) >= 0 && (opt.noScope || inScope(q)); });
      title = opt.title || '틀린 문제 다시 풀기';
    } else if (mode === 'gp') {
      pool = opt.ids && opt.ids.length
        ? D.questions.filter(function (q) { return opt.ids.indexOf(q.i) >= 0; })
        : gpQuestions(opt.n);
      if (opt.ids && opt.ids.length) {   /* 넘긴 순서(직전 문제 뒤로) 그대로 */
        var byId = {};
        pool.forEach(function (q) { byId[q.i] = q; });
        pool = opt.ids.map(function (i) { return byId[i]; }).filter(Boolean);
      }
      title = opt.title || '지텔프 문법 · 켈리 카페 기출';
    } else if (mode === 'wrong') {
      pool = poolWrong();
      title = '오답 집중 복습';
    } else if (mode === 'speed') {
      pool = S.mix ? allScopePool() : scopeQPool(S.subj);
      title = '⏱ 1분 스피드';
    } else if (mode === 'weakUnit') {
      pool = poolForUnit(opt.cid, opt.u);
      title = '🎯 약점 집중 · ' + unitName(opt.cid, opt.u);
    } else {
      pool = S.mix ? D.subjects.reduce(function (a, s) { return a.concat(poolForSubject(s.id, mode)); }, []) : poolForSubject(S.subj, mode);
      title = mode === 'today' ? '오늘 들은 강의' : '누적 랜덤 복습';
    }
    /* 체크한 진도가 0인 과목은 미수강 단원을 섞지 않고 '1강 입문' 범위만 */
    if (!pool.length && (mode === 'all' || mode === 'speed' || mode === 'today')) {
      pool = beginnerPool(S.mix ? null : S.subj);
      if (pool.length) title = title + ' · 1강 입문';
    }
    if (!pool.length) {
      if (mode === 'wrong') toast('아직 오답이 없어요. 먼저 문제를 풀어 주세요.');
      else if (mode === 'lecture') toast('이 강의 문제가 아직 없어요. 다른 강의를 체크해 보세요.');
      else if (mode === 'ids') toast('다시 풀 문제가 없어요.');
      else if (mode === 'gp') toast('이 포인트의 켈리 기출이 아직 없어요.');
      else if (mode === 'weakUnit') toast('이 단원에 연결된 기출이 아직 없어요.');
      else toast('아직 체크한 진도가 없어요. 스테이지에서 1강부터 체크해 주세요.');
      return;
    }
    /* G-POINT를 누르면 그 포인트 기출을 한 문제씩이 아니라 전부 이어서 푼다 */
    var n = mode === 'lecture' ? Math.min(pool.length, 6) : mode === 'gp' ? pool.length : Math.min(pool.length, S.qlen);
    if (mode === 'ids') n = Math.min(pool.length, opt.n || 20);
    if (mode === 'speed') n = Math.min(pool.length, 60);
    if (mode === 'weakUnit') n = Math.min(pool.length, 20);
    var pick;
    if (mode === 'gp') pick = pool.slice();
    else if (mode === 'weakUnit') {
      /* 틀린 문제 → 아직 안 푸문 같은 단원 문제 순서로 묶는다 */
      var ws = pool.filter(function (q) { return !!S.wrong[q.i]; })
        .sort(function (a, b) { return ((S.wrong[b.i] || {}).c || 1) - ((S.wrong[a.i] || {}).c || 1); });
      var rest = qs(pool.filter(function (q) { return !S.wrong[q.i]; }), n - ws.length);
      pick = ws.concat(rest).slice(0, n);
    } else pick = qs(pool, n);
    var items = pick.map(function (q) {
      var order = q.o.map(function (_, i) { return i; });   // OX(2지선다)도 지원
      shuffle(order);
      return { q: q, order: order };
    });
    QS = { items: items, i: 0, ok: 0, combo: 0, maxCombo: 0, xp: 0, mode: mode, title: title, locked: false, sel: -1, opt: opt, wrongIds: [] };
    // 👾 보스 문제: 이번 세션에 없는, 배운 범위의 어려운 문항
    QS.bossPool = bossPool(items.map(function (it) { return it.q.i; }));
    QS.bossDone = false;
    QS.pendingBoss = null;
    // 🩹 오답 복수전은 P 2배, ⏱ 스피드는 60초 제한
    QS.xpMult = mode === 'wrong' ? 2 : 1;
    if (mode === 'speed') { QS.speed = true; QS.end = Date.now() + 60000; }
    document.body.style.overflow = 'hidden';
    document.body.classList.remove('fever');
    $('#quiz').classList.remove('hidden');
    $('#qCombo').innerHTML = '🔥 0';
    setCombo(0, 0);
    $('#qTitle').innerHTML = esc(title) + (QS.xpMult > 1 ? '<span class="revenge-chip">🩹 리벤지 P ×2</span>' : '');
    if (QS.speed) {
      $('#qTitle').innerHTML = esc(title) + '<span class="revenge-chip">60초</span>';
      speedStart();
    }
    renderQ();
  }

  /* ---------- ⏱ 1분 스피드 타임어택 ---------- */
  var speedTimer = null;
  function speedStart() {
    document.body.classList.add('speed');
    var el = $('#qTimer');
    if (el) el.textContent = '⏱ 60';
    clearInterval(speedTimer);
    speedTimer = setInterval(function () {
      if (!QS || !QS.speed) { speedStop(); return; }
      var left = Math.max(0, Math.ceil((QS.end - Date.now()) / 1000));
      var tel = $('#qTimer');
      if (tel) tel.textContent = '⏱ ' + left;
      var bar = $('#qBar');
      if (bar) bar.style.width = Math.min(100, (60 - left) / 60 * 100) + '%';
      if (left <= 0) { speedStop(); if (QS) finish(); }
    }, 200);
  }
  function speedStop() {
    clearInterval(speedTimer); speedTimer = null;
    document.body.classList.remove('speed', 'fever');
  }

  /* ============================================================
     ⭕ 5분 1줄 OX 회독
     · 기존 4지선다 기출의 선지를 '한 문장 O/X'로 옮긴다
     · 정답 방향은 원문 정답키로만 정한다
       - "옳지 않은 것을" → 정답 선지는 X, 나머지 세 선지는 O
       - "옳은 것을"     → 정답 선지는 O, 나머지 세 선지는 X
     · 문장이 불완전하거나(짧음) ①~④·"모두 고른 것" 같은 복합 선지는 뺀다
     ============================================================ */
  var OX = null;
  function oxOkText(t, lo, hi) {
    t = String(t || '').replace(/\s+/g, ' ').trim();
    if (t.length < lo || t.length > hi) return false;
    if (/[①-④]|모두\s*고른|위의\s*것|㉠|㉡/.test(t)) return false;
    if (!/(다|음|함|됨)[.)]?$/.test(t)) return false;
    return true;
  }
  function oxItems(sid) {
    var out = [];
    D.questions.forEach(function (q) {
      if (q.s === 'gtelp' || (sid && q.s !== sid)) return;
      if ((q.o || []).length === 2) {
        var st = String(q.q || '').trim();
        if (!oxOkText(st, 30, 180)) return;
        out.push({ st: st, ans: Number(q.a) === 0 ? 'O' : 'X', q: q });
        return;
      }
      if ((q.o || []).length !== 4) return;
      var stem = String(q.q || '');
      if (stem.indexOf('설명으로') < 0) return;      // '학자는 누구?'·'공통점은?' 같은 선지형 제외
      var neg = /옳지\s*않은|적절하지\s*않은|틀린\s*것|아닌\s*것|옳지\s*못한/.test(stem);
      var pos = /옳은\s*것|적절한\s*것|맞는\s*것|타당한\s*것/.test(stem);
      if (neg === pos) return;
      var okAll = q.o.every(function (c) { return oxOkText(c, 25, 120); });
      if (!okAll) return;
      q.o.forEach(function (c, i) {
        var isAns = i === Number(q.a);
        out.push({
          st: String(c).replace(/\s+/g, ' ').trim(),
          ans: neg ? (isAns ? 'X' : 'O') : (isAns ? 'O' : 'X'),
          q: q, srcAns: isAns
        });
      });
    });
    return out;
  }
  function startOx() {
    var all = oxItems(S.subj === 'gtelp' ? null : S.subj);
    if (!all.length) {
      all = oxItems(null);
      if (!all.length) { toast('OX로 바뀔 경찰 기출 선지가 아직 없어요'); return; }
    }
    var pick = shuffle(all.slice()).slice(0, 80);
    OX = { items: pick, i: 0, ok: 0, done: 0, xp: 0, locked: false, end: Date.now() + 300000, timer: null };
    document.body.style.overflow = 'hidden';
    $('#oxq').classList.remove('hidden');
    clearInterval(OX.timer);
    OX.timer = setInterval(oxTick, 500);
    oxTick(); renderOx();
  }
  function oxTick() {
    if (!OX) return;
    var left = Math.max(0, Math.ceil((OX.end - Date.now()) / 1000));
    var el = $('#oxTimer');
    if (el) el.textContent = Math.floor(left / 60) + ':' + pad(left % 60);
    var bar = $('#oxBar');
    if (bar) bar.style.width = Math.min(100, (300 - left) / 300 * 100) + '%';
    if (left <= 0 && !OX.over) finishOx();
  }
  function renderOx() {
    if (!OX || OX.over) return;   /* 시간 종료·결과 화면 뒤에 늦게 도착한 타이머가 결과를 덮지 않게 */
    var it = OX.items[OX.i];
    if (!it) { finishOx(); return; }
    OX.locked = false;
    $('#oxCount').textContent = (OX.done + 1) + ' / ' + OX.items.length;
    var tag = SUBJ[it.q.s].name + ' · ' + (it.q.gp ? 'G-POINT ' + it.q.gp : unitName(it.q.c, it.q.u));
    var srcLine = it.q.src ? '<div class="ox-src">📌 ' + esc(it.q.src) + '</div>' : '';
    $('#oxBody').innerHTML =
      '<div class="ox-tag">' + esc(tag) + '</div>' +
      srcLine +
      '<div class="ox-stmt">' + esc(it.st) + '</div>' +
      '<div class="ox-btns">' +
      '<button class="ox-choice o" data-ox="O"><b>⭕ O</b><i>옳은 문장</i></button>' +
      '<button class="ox-choice x" data-ox="X"><b>❌ X</b><i>틀린 문장</i></button></div>' +
      '<div class="ox-fb" id="oxFb"></div>';
    $$('#oxBody .ox-choice').forEach(function (b) {
      b.onclick = function () { answerOx(b.getAttribute('data-ox'), b); };
    });
  }
  function answerOx(val, btn) {
    if (!OX || OX.locked) return;
    OX.locked = true;
    var it = OX.items[OX.i];
    if (!it) return;
    var right = val === it.ans;
    $$('#oxBody .ox-choice').forEach(function (b) {
      b.disabled = true;
      if (b.getAttribute('data-ox') === it.ans) b.classList.add('right');
    });
    if (!right) btn.classList.add('wrong');
    OX.done++;
    var q = it.q;
    var day = dayRec();
    S.ans++; day.ans = (day.ans || 0) + 1;
    var uk = q.c + ':' + q.u;
    var u = S.unit[uk] || (S.unit[uk] = { a: 0, ok: 0 });
    u.a++;
    var gain;
    if (right) {
      OX.ok++; S.ok++; u.ok++; day.ok = (day.ok || 0) + 1;
      S.qok[q.i] = (S.qok[q.i] || 0) + 1; delete S.wrong[q.i];
      gain = 4;
      sfx('ok');
    } else {
      var w = S.wrong[q.i] || { c: 0 };
      S.wrong[q.i] = { c: (w.c || 0) + 1, d: todayStr() };
      gain = 1;
      sfx('no');
    }
    OX.xp += gain; S.xp += gain; day.xp = (day.xp || 0) + gain;
    var why = expLine(q, '풀이') || String(q.e || '').replace(/^\[[^\]]*\]\s*/, '').replace(/([.!?])\s+/g, '$1\n').split('\n')[0] || '';
    if (!why || /^정답\s*[OX0-9①-④][.)]?$/.test(why.trim())) {
      why = (right ? '정답이에요. ' : '이 문장은 원문과 다듬어진 부분이 있는 선지예요. ') + '출처: ' + (q.src || qLabel(q));
    }
    if (why.length > 96) why = why.slice(0, 95) + '…';
    var fbEl = $('#oxFb');
    if (fbEl) {
      fbEl.className = 'ox-fb on ' + (right ? 'ok' : 'no');
      fbEl.innerHTML = '<b>' + (right ? '정답 ⭕' : '정답 ❌') + '</b>' +
        '<span>' + esc(why) + '</span>' +
        (it.srcAns ? '<i>네가 고른 선지가 원문 정답 선지</i>' : '');
    }
    touchStreak(); save();
    renderHud(); renderQuest(); renderMascot(); renderDash(); renderPass();
    clearTimeout(OX._h);
    OX._h = setTimeout(function () {
      if (!OX || OX.over) return;
      OX.i++;
      if (OX.i >= OX.items.length) finishOx(); else renderOx();
    }, right ? 850 : 1500);
  }
  function finishOx() {
    if (!OX || OX.over) return;
    OX.over = true;
    clearInterval(OX.timer); OX.timer = null;
    clearTimeout(OX._h);
    var n = OX.done, ok = OX.ok;
    if (ok > (S.oxBest || 0)) { S.oxBest = ok; }
    S.oxRuns = (S.oxRuns || 0) + 1;
    save();
    var acc = n ? Math.round(ok / n * 100) : 0;
    $('#oxBody').innerHTML =
      '<div class="ox-result"><div class="oxr-emoji">' + (acc >= 80 ? '🎉' : acc >= 60 ? '💪' : '🌱') + '</div>' +
      '<div class="oxr-t">' + n + '문장 중 ' + ok + '개 정답</div>' +
      '<div class="oxr-s">정답률 ' + acc + '% · +' + OX.xp + ' P' + (ok > 0 ? ' · 최고 기록 ' + Math.max(ok, 0) + '문장' : '') + '</div>' +
      '<p class="oxr-note">틀린 문장은 오답노트에 쌓여 약점 단원 TOP 3에 바로 반영돼요.</p>' +
      '<div class="oxr-btns"><button class="btn ghost" id="oxAgain">한 번 더</button>' +
      '<button class="btn primary" id="oxDone">닫기</button></div></div>';
    $('#oxAgain').onclick = function () { closeOx(); startOx(); };
    $('#oxDone').onclick = function () { closeOx(); renderAll(); };
    if (acc >= 80) sfx('done');
  }
  function closeOx() {
    if (OX) { clearInterval(OX.timer); clearTimeout(OX._h); OX = null; }
    $('#oxq').classList.add('hidden');
    document.body.style.overflow = '';
  }

  /* ============================================================
     문제 본문 가독성 — 질문 문장과 박스형 보기(ㄱㄴㄷㄹ · ㉠㉡㉢㉣ · 가나다라) 분리
     · 질문 문장은 읽기 편한 크기로, 보기는 어두운 카드 안에 한 줄씩 따로
     · 일반 문제·미니 모의고사·오답노트 어디서든 stemHtml() 하나로 같은 모양
     ============================================================ */
  var STEM_FAMS = [
    { m: ['㉠', '㉡', '㉢', '㉣', '㉤', '㉥', '㉦', '㉧', '㉨'], dot: false, min: 2, kind: '' },
    { m: ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ'], dot: true, min: 2, kind: 'jamo' },
    { m: ['가', '나', '다', '라', '마', '바', '사', '아'], dot: true, min: 3, kind: 'word' }
  ];
  function stemMarks(s, fam) {
    var out = [], from = 0;
    for (var k = 0; k < fam.m.length; k++) {
      var mk = fam.m[k], pos = -1, end = -1;
      for (var i = from; i + mk.length <= s.length; i++) {
        if (s.substr(i, mk.length) !== mk) continue;
        var before = i === 0 ? ' ' : s.charAt(i - 1);
        if (!/[\s)\]」』\u3000]/.test(before)) continue;          /* 낱말 가운데 'ㄱ'·'다'는 제외 */
        var after = s.substr(i + mk.length, 4), len = mk.length;
        if (fam.dot) {
          var d = after.match(/^\s*\./);
          if (!d) continue;
          len += d[0].length;
        } else if (after && !/[\s([\u3000]/.test(after.charAt(0))) continue;
        pos = i; end = i + len; break;
      }
      if (pos < 0) break;
      out.push({ m: mk, start: pos, end: end });
      from = end;
    }
    return out;
  }
  function stemParts(txt) {
    var s = String(txt || '');
    var best = null;
    for (var f = 0; f < STEM_FAMS.length; f++) {
      var fam = STEM_FAMS[f], hits = stemMarks(s, fam);
      if (hits.length < fam.min) continue;
      var lead = s.slice(0, hits[0].start).trim();
      var items = [];
      for (var i = 0; i < hits.length; i++) {
        var t = s.slice(hits[i].end, i + 1 < hits.length ? hits[i + 1].start : s.length).trim();
        t = t.replace(/(\s*[㉠-㉨])+\s*$/, '').replace(/(\s*[ㄱ-ㅎ]\s*\.\s*)+$/, '').trim();  /* 끝에 붙은 '㉠ ㉡ ㉢' 표 머리줄 제거 */
        if (!t.length) continue;
        items.push({ m: hits[i].m + (fam.dot ? '.' : ''), t: t });
      }
      if (items.length < fam.min) continue;
      var cand = { lead: lead, items: items };
      if (!best || cand.items.length > best.items.length) best = cand;
    }
    return best;
  }
  /* 목록용 간단형: 오답노트처럼 좁은 카드에서는 박스 대신 한 줄짜리 항목으로 */
  function stemFlat(txt) {
    var s = String(txt || '');
    var p = stemParts(s);
    if (!p) return esc(s);
    var h = p.lead ? '<span class="wi-lead">' + esc(p.lead) + '</span>' : '';
    p.items.forEach(function (it) {
      h += '<span class="wi-ol"><b>' + esc(it.m) + '</b>' + esc(it.t) + '</span>';
    });
    return h;
  }
  /* 해설에서 '풀이:'·'해석:' 처럼 라벨이 붙은 줄만 꺼내기 (보강된 지텔프 해설용) */
  function expLine(q, label) {
    var lines = String((q && q.e) || '').replace(/\r/g, '').split(/\n/);
    var re = new RegExp('^' + label + '\\s*[:：]\\s*');
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      if (re.test(t)) return t.replace(re, '').trim();
    }
    return '';
  }
  /* 해설 첫 줄(핵심)만 짧게 */
  function expShort(q) {
    var pick = expLine(q, '풀이') || expLine(q, '해석');
    if (pick) return pick;
    var raw = String((q && q.e) || '').split(/\n/)[0].replace(/^\[(핵심|정답|해설)\]\s*/, '').trim();
    return raw || ('정답: ' + (q && q.o && q.o[q.a] ? q.o[q.a] : ''));
  }

  function stemHtml(txt) {
    var s = String(txt || '');
    var p = stemParts(s);
    if (!p) return '<h2 class="q-text">' + esc(s) + '</h2>';
    var h = '';
    if (p.lead) h += '<h2 class="q-text">' + esc(p.lead) + '</h2>';
    h += '<div class="q-box">';
    p.items.forEach(function (it) {
      h += '<div class="q-bi"><span class="q-bk">' + esc(it.m) + '</span>' +
        '<span class="q-bt">' + esc(it.t) + '</span></div>';
    });
    return h + '</div>';
  }

  function renderQ() {
    var it = QS.items[QS.i], q = it.q;
    QS.locked = false; QS.sel = -1; QS.hintUsed = !!it.hintUsed; QS.hintGone = -1;
    document.body.classList.toggle('boss', !!it.boss);
    $('#qBar').style.width = (QS.i / QS.items.length * 100) + '%';
    $('#qCount').textContent = (QS.i + 1) + '/' + QS.items.length;
    var pb = $('#qProg');
    if (pb) { pb.classList.remove('pop'); void pb.offsetWidth; pb.classList.add('pop'); }
    var tag = qTag(q);
    var badge = srcBadge(q);
    var keys = ['A', 'B', 'C', 'D'];
    var h = '';
    if (it.boss) h += '<div class="boss-head"><span class="bh-ico">👾</span><span><b>오늘의 보스 문제</b><i>3연속 정답 기념 · 맞히면 +' + BOSS_BONUS + ' P</i></span></div>';
    h += '<div class="q-tags"><span class="q-tag">' + esc(tag) + '</span><span class="q-src ' + badge.k + '">' + esc(badge.t) + '</span>' +
      '<button class="hint-btn" id="qHint">🎟️ 힌트 -' + HINT_COST + ' P</button></div>' +
      stemHtml(q.q) +
      '<div id="hintBox"></div><div class="opts">';
    it.order.forEach(function (oi, idx) {
      h += '<button class="opt" data-i="' + oi + '"><span class="k">' + keys[idx] + '</span><span>' + esc(q.o[oi]) + '</span></button>';
    });
    h += '</div>';
    $('#qBody').innerHTML = h;
    $('#qBody').scrollTop = 0;
    $('#qFb').classList.add('hidden');
    $$('#qBody .opt').forEach(function (b) {
      b.onclick = function () { answer(Number(b.getAttribute('data-i')), b); };
    });
    var hb = $('#qHint');
    if (hb) hb.onclick = useHint;
    if (it.hintHtml && it.hintUsed) {
      var hbx = $('#hintBox');
      if (hbx) { hbx.innerHTML = it.hintHtml; hbx.classList.add('show'); }
      if (hb) { hb.disabled = true; hb.textContent = '💡 힌트 확인함'; }
    }
    /* 이미 푼 문제로 돌아온 경우: 그때 고른 보기·정답·해설을 그대로 되살린다 (재채점·P 중복 지급 없음) */
    if (it.resp) restoreAnswer(it, q);
    syncQNav();
  }

  /* ============================================================
     ← 이전 / 다음 →
     · 지나간 문제를 다시 열어 내가 고른 보기·정답·해설을 그대로 본다
     · 되살리기만 하고 answer()를 다시 부르지 않으므로 P·통계가 두 번 쌓이지 않는다
     ============================================================ */
  function restoreAnswer(it, q) {
    var r = it.resp;
    QS.locked = true;
    $$('#qBody .opt').forEach(function (b) {
      var i = Number(b.getAttribute('data-i'));
      b.disabled = true;
      if (i === q.a) b.classList.add('ok');
      else if (i === r.oi) b.classList.add('no');
    });
    if (!QS.speed) fb(r.right, q, r.gain, r.bonus);
    QS.sel = r.oi;
  }

  function syncQNav() {
    var p = $('#qPrev');
    if (p) p.disabled = !(QS && QS.i > 0 && !QS.finished && !QS.speed);
    var f = $('#fbPrev');
    if (f) f.style.display = (QS && QS.i > 0 && !QS.speed) ? '' : 'none';
  }

  function goPrev() {
    if (MINI && !MINI.over) { miniGo(-1); return; }
    if (!QS || QS.finished || QS.speed || QS.i <= 0) return;
    clearTimeout(QS._t);
    $('#qFb').classList.add('hidden');
    QS.i--;
    renderQ();
    sfx('tap');
  }

  /* ============================================================
     💡 진짜 힌트권 (30 P)
     · 보기 지우기가 아니라 '어디를 봐야 하는지' 알려주는 힌트 카드를 띄운다
     · 지텔프: 문항의 G-POINT 번호 + 그 포인트의 조건·공식
     · 경찰 과목: data.js의 문항별 hint(쟁점 한 줄). 없으면 아래 생성기가
       단원·법조문·조문번호만 뽑아 정답은 노출하지 않고 쟁점을 짚어 준다
     · 한 문제당 1회 · 사용 시 차감은 한 번만
     ============================================================ */
  var HINT_SUBJ_ICO = { crim: '⚖️', pol: '🚔', cri: '🧠' };

  /* G-POINT 암기표에서 해당 번호의 [번호, 조건, 공식] 행 찾기 */
  function gpRow(n) {
    for (var i = 0; i < GP_TABLE.length; i++) {
      var rows = GP_TABLE[i].rows || [];
      for (var j = 0; j < rows.length; j++) if (Number(rows[j][0]) === Number(n)) return rows[j];
    }
    return null;
  }

  /* 문항 해설 첫머리 [최신 교재 G-POINT 13 · to부정사 (to + 동원) · seem to + 동원]
     → 이 문항이 실제로 묻는 표현(base·spec)을 꺼낸다 */
  function gpSpec(q) {
    var m = String(q.e || '').match(/^\[([^\]]*)\]/);
    if (!m) return null;
    var s = m[1].replace(/^.*?G-POINT\s*\d+\s*·\s*/, '').replace(/^최신 교재\s*/, '');
    var parts = s.split(' · ');
    return { base: (parts[0] || '').trim(), spec: (parts[1] || '').trim() };
  }

  /* 지텔프 힌트: 이 문항의 G-POINT + 그 문항이 실제로 묻는 표현 + 짧은 구분점
     · 문항별 hint가 있으면 그것을 쓴다 (조건 목록이 문항과 어긋나 보이던 문제 해결)
     · 없으면 해설의 표현(spec) → G-POINT 암기표 행 순으로 떨어뜨린다 */
  function gpHint(q) {
    var c = COURSE[q.c];
    var sp = gpSpec(q) || {};
    var name = sp.base || ((c && c.lec && c.lec[q.gp - 1] && c.lec[q.gp - 1].t) ? c.lec[q.gp - 1].t : '');
    var kicker = '📘 G-POINT ' + q.gp + (name ? ' · ' + name : '');
    var main = q.hint || '';
    if (!main && sp.spec) main = sp.spec + ' 구문이 이 문항의 포인트예요.';
    if (!main) {
      var row = gpRow(q.gp);
      main = row ? ('조건: ' + row[1] + ' → 공식: ' + row[2]) : '';
    }
    return { k: kicker, t: main, s: '' };
  }

  /* 힌트 필드가 없는 문항용 생성기: 단원 + 법조문·조문번호만 뽑아 쟁점을 짚는다 */
  function autoHint(q) {
    var text = String(q.q || '') + ' ' + (q.o || []).join(' ');
    var laws = [], arts = [];
    (text.match(/[「『][^」』]{2,26}[」』]/g) || []).forEach(function (x) {
      var v = x.replace(/[「」『』]/g, '');
      if (laws.indexOf(v) < 0) laws.push(v);
    });
    (text.match(/제\s?\d+조(?:의\s?\d+)?/g) || []).forEach(function (x) {
      var v = x.replace(/\s+/g, '');
      if (arts.indexOf(v) < 0) arts.push(v);
    });
    var unit = unitName(q.c, q.u) || '';
    var bits = [];
    if (laws.length) bits.push('「' + laws.slice(0, 2).join('」·「') + '」');
    if (arts.length) bits.push(arts.slice(0, 4).join('·'));
    var main = '';
    if (bits.length) main = bits.join(' ') + ' 조문의 요건·주체·숫자를 먼저 대조하세요.';
    var sub;
    if ((q.o || []).length === 2) sub = '문장에서 주체·수치·결론이 바뀐 부분을 찾아보세요.';
    else sub = '①~④ 중 법조문·판례의 결론과 어긋나는 진술 하나가 정답이에요. 숫자와 주체부터 확인하세요.';
    return { k: (HINT_SUBJ_ICO[q.s] || '🎯') + ' 쟁점 힌트' + (unit ? ' · ' + unit : ''), t: main, s: sub };
  }

  /* 문항에 맞는 힌트 카드 내용 만들기 */
  function hintFor(q) {
    var h;
    if (q.gp) h = gpHint(q);
    else if (q.hint) h = { k: (HINT_SUBJ_ICO[q.s] || '🎯') + ' 쟁점 힌트' + (unitName(q.c, q.u) ? ' · ' + unitName(q.c, q.u) : ''), t: q.hint, s: '' };
    else h = autoHint(q);
    if (!h.t) h = autoHint(q);
    return h;
  }

  function useHint() {
    if (!QS || QS.locked || QS.hintUsed) return;
    var it = QS.items[QS.i], q = it.q;
    if (xpAvail() < HINT_COST) { toast('힌트권에는 ' + HINT_COST + ' P가 필요해요 · 지금 ' + xpAvail() + ' P'); return; }
    if (!spendXp(HINT_COST)) return;
    QS.hintUsed = true;
    it.hintUsed = true;
    var h = hintFor(q);
    var box = $('#hintBox');
    if (box) {
      box.innerHTML = '<div class="hint-card">' +
        '<div class="hint-top"><span class="hint-ico">💡</span><b>' + esc(h.k) + '</b><i>−' + HINT_COST + ' P</i></div>' +
        (h.t ? '<p class="hint-main">' + esc(h.t) + '</p>' : '') +
        (h.s ? '<p class="hint-sub">' + esc(h.s) + '</p>' : '') +
        '</div>';
      box.classList.add('show');
      it.hintHtml = box.innerHTML;
      /* 힌트를 열면 상단 배지가 반쯤 잘린 채로 남지 않게 스크롤을 정리한다 */
      var bd = $('#qBody');
      if (bd) {
        bd.scrollTop = 0;                       // 상단 배지가 반쯤 잘린 자리로 남지 않게 맨 위부터
        var br = bd.getBoundingClientRect(), cr = box.getBoundingClientRect();
        if (cr.top > br.bottom - 8) {           // 카드가 화면 아래로 완전히 밀렸으면 카드 위쪽부터 보이게
          var maxS = bd.scrollHeight - bd.clientHeight;
          bd.scrollTop = Math.min(maxS, bd.scrollTop + (cr.top - br.top) - 8);
        }
      }
    }
    toast('힌트를 확인했어요 · −' + HINT_COST + ' P');
    sfx('tap');
    var hb = $('#qHint');
    if (hb) { hb.disabled = true; hb.textContent = '💡 힌트 확인함'; }
  }

  function setCombo(n, bonus) {
    var el = $('#qCombo'); if (!el) return;
    el.innerHTML = '🔥 <b>' + n + '</b> COMBO' + (bonus ? ' <i>+' + bonus + 'P</i>' : '');
    el.className = 'combo' + (n >= 5 ? ' lv3' : n >= 3 ? ' lv2' : n >= 2 ? ' lv1' : '');
    if (n > 1) {
      el.classList.add('hot');
      setTimeout(function () { el.classList.remove('hot'); }, 380);
    }
  }

  function comboBanner(txt, big) {
    var el = $('#comboBanner');
    el.textContent = txt;
    el.className = 'combo-banner' + (big ? ' big' : '');
    el.classList.remove('hidden');
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    clearTimeout(el._h);
    el._h = setTimeout(function () { el.classList.add('hidden'); }, 1400);
  }

  function answer(oi, btn) {
    if (QS.locked) return;
    var it = QS.items[QS.i], q = it.q;
    if (it.resp) return;                 /* 이미 푼 문제는 다시 채점하지 않는다 */
    QS.locked = true;
    var right = oi === q.a;
    $$('#qBody .opt').forEach(function (b) {
      var i = Number(b.getAttribute('data-i'));
      b.disabled = true;
      if (i === q.a) b.classList.add('ok');
    });
    if (!right) btn.classList.add('no');
    var day = dayRec();
    S.ans++; day.ans = (day.ans || 0) + 1;
    // 단원별 정답 집계
    var uk = q.c + ':' + q.u;
    var u = S.unit[uk] || (S.unit[uk] = { a: 0, ok: 0 });
    u.a++;
    var nk = q.gp ? (q.c + ':gp' + q.gp) : (q.c + ':u' + q.u);
    var nd = S.node[nk] || (S.node[nk] = { a: 0, ok: 0 });
    nd.a++;
    if (right) {
      S.ok++; day.ok = (day.ok || 0) + 1; u.ok++; nd.ok++;
      S.qok[q.i] = (S.qok[q.i] || 0) + 1;
      QS.ok++; QS.combo++; QS.maxCombo = Math.max(QS.maxCombo, QS.combo);
      var gain = 10 + Math.min(10, (QS.combo - 1) * 2);
      var bonus = 0;
      if (QS.combo === 2) bonus = 2;
      else if (QS.combo === 3) bonus = 5;
      else if (QS.combo === 5) bonus = 10;
      else if (QS.combo > 5 && QS.combo % 5 === 0) bonus = 10;
      var total = (gain + bonus) * (QS.xpMult || 1);
      QS.xp += total; S.xp += total; day.xp = (day.xp || 0) + total;
      delete S.wrong[q.i];
      setCombo(QS.combo, bonus);
      sfx(bonus >= 10 ? 'combo5' : bonus >= 5 ? 'combo3' : QS.combo > 1 ? 'combo' : 'ok');
      if (QS.combo >= 3) {
        document.body.classList.add('fever');
        comboBanner('🔥 FEVER ' + QS.combo + '연속! +' + (bonus || 0) + ' P', true);
        sfx('crown');
      } else if (bonus) comboBanner(QS.combo + '연속 정답! +' + bonus + ' P', QS.combo >= 5);
      if (it.boss) {
        total += BOSS_BONUS; QS.xp += BOSS_BONUS; S.xp += BOSS_BONUS; day.xp = (day.xp || 0) + BOSS_BONUS;
        S.bossWins = (S.bossWins || 0) + 1;
        comboBanner('👾 보스 격파! +' + BOSS_BONUS + ' P', true);
        sfx('crown'); if (!QS.speed) confetti(70);
      } else if (QS.combo === 3 && !QS.bossDone && QS.bossPool && QS.bossPool.length) {
        QS.bossDone = true;
        QS.pendingBoss = QS.bossPool[0];
        QS.pendingAt = QS.i;      /* 이 문제에서 '다음 →'을 눌렀을 때만 보스를 끼워 넣는다 */
        comboBanner('👾 보스 등장!', true);
      }
      if (!QS.speed) confetti(bonus ? 34 : 22);
      if (!QS.speed) fb(true, q, total, bonus);
      var mk = isMastered(q.c, q.gp || 0);
      if (mk && bonus) sfx('crown');
    } else {
      QS.combo = 0;
      QS.xp += 3; S.xp += 3; day.xp = (day.xp || 0) + 3;
      var w = S.wrong[q.i] || { c: 0 };
      S.wrong[q.i] = { c: (w.c || 0) + 1, d: todayStr() };
      if (QS.wrongIds.indexOf(q.i) < 0) QS.wrongIds.push(q.i);
      setCombo(0, 0);
      document.body.classList.remove('fever');
      sfx('no');
      if (!QS.speed) { var qb = $('#quiz'); qb.classList.add('shake'); setTimeout(function () { qb.classList.remove('shake'); }, 320); }
      if (!QS.speed) fb(false, q, 3, 0);
    }
    touchStreak();
    if (QS.speed) {
      $('#qFb').classList.add('hidden');
      clearTimeout(QS._t);
      QS._t = setTimeout(function () { if (QS && QS.speed) nextQ(); }, 420);
    }
    QS.best = Math.max(QS.best || 0, QS.combo);
    if (QS.combo > (S.bestCombo || 0)) { S.bestCombo = QS.combo; }
    it.resp = { oi: oi, right: right, gain: (right ? total : 3), bonus: (right ? bonus : 0) };
    syncQNav();
    save();
    renderHud(); renderQuest(); renderMascot(); renderChallenges(); renderPass(); renderDash();
    checkPromotion();
  }

  function fb(ok, q, gain, bonus) {
    var el = $('#qFb');
    el.classList.remove('hidden', 'ok', 'no');
    el.classList.add(ok ? 'ok' : 'no');
    el.querySelector('.fb-head').innerHTML = '<img class="fb-mascot" src="assets/' + (ok ? 'mascot-win.png' : 'mascot-happy.png') + '?v=' + MV + '" alt="">' +
      '<span>' + (ok ? '정답이에요!' + (bonus ? ' 콤보 보너스 🎉' : ' 🎉') : '아쉬워요 😢') + '</span>' +
      '<span class="fb-xp">+' + gain + ' P</span>';
    el.querySelector('.fb-text').innerHTML = expHtml(q, QS && QS.items[QS.i]);
    var b = $('#fbNext');
    b.textContent = QS.i + 1 >= QS.items.length ? '결과 보기 →' : '다음 문제 →';
    syncQNav();
    /* 해설이 패널에 다 안 들어가면 스크롤 안내(아래 흐림) 표시 */
    requestAnimationFrame(function () {
      var sc = $('#qFb .fb-scroll');
      if (sc) el.classList.toggle('more', sc.scrollHeight > sc.clientHeight + 4);
    });
    /* 해설 패널이 보기 아래를 덮지 않게 바뀌었으니, 정답 보기가 화면 안에 들어오도록만 맞춘다 */
    revealAnswerOpt();
    revealAnswerOpt(true);
    revealAnswerOpt(2);
  }

  /* ============================================================
     해설 읽기 좋게 정리 (수진 님 "지텔프 해설 가독성이 너무 안 좋아")
     · 맨 앞 [G-POINT …] 메타는 본문에서 빼서 위 칩으로
     · 첫 문장(핵심)은 굵게, 나머지는 문장 단위 단락으로
     · 괄호 속 우리말 해석과 출처는 따로 떼어 맨 아래로
     ============================================================ */
  function expHtml(q, it) {
    var raw = String(q.e || '').replace(/\r/g, '').trim();
    if (!raw) return '<span class="fb-empty">해설이 아직 없어요.</span>';
    var chip = '';
    var m = raw.match(/^\[([^\]]{2,90})\]\s*/);
    if (m) { chip = m[1].replace(/^최신 교재\s*/, ''); raw = raw.slice(m[0].length); }
    if (q.gp) {
      var c = COURSE[q.c];
      var tn = c && c.lec && c.lec[q.gp - 1] ? String(c.lec[q.gp - 1].t || '') : '';
      chip = 'G-POINT ' + q.gp + (tn ? ' · ' + tn.replace(/^.*?·\s*/, '') : '');
    }
    var src = '', sm = raw.match(/\(([^()]*(?:켈리 카페|난이도|합격의법학원|적중모의고사|해설|기출문제|순경|경행경채)[^()]*)\)\s*$/);
    if (sm) { src = sm[1].trim(); raw = raw.slice(0, sm.index).trim(); }
    /* 수진 님: 카페 답지 원문은 맨 아래 카드로 따로 (본문 해석·풀이·오답과 섞이지 않게 먼저 떼어 낸다) */
    var orig = '', om = raw.match(/(?:^|\n)\s*원문\s*[:：]\s*([\s\S]*)$/);
    if (om) { orig = String(om[1] || '').replace(/\s*\n\s*/g, ' ').trim(); raw = raw.slice(0, om.index).trim(); }
    var tr = '', tm = raw.match(/\(([^()]{12,})\)\s*$/);
    if (tm && /[가-힣]/.test(tm[1]) && /다[.)]?\s*$/.test(tm[1].trim())) { tr = tm[1].trim(); raw = raw.slice(0, tm.index).trim(); }
    /* 선지별 해설(①~④ · ㉠~㉣ · ㄱ.) 줄은 한 덩어리로 두고, 나머지는 문장 단위로 끊어 읽기 좋게 */
    var OPT_LINE = /^(?:[①-④]|[㉠-㉣]|[ㄱㄴㄷㄹ]\s*\.|[가나다라]\s*\.)/;
    /* 지텔프 보강 해설: '해석:'·'풀이:'·'오답:'·'원문:' 라벨 줄과 그 아래 '· ' 목록은 통째로 한 덩어리 */
    var SEC_LINE = /^(해석|풀이|오답|원문)\s*[:：]\s*([\s\S]*)$/;
    var sents = [];
    raw.split(/\n+/).forEach(function (line) {
      line = line.trim();
      if (!line) return;
      if (OPT_LINE.test(line) || SEC_LINE.test(line) || /^[-·•]\s*\S/.test(line)) { sents.push(line); return; }
      line.replace(/([.!?])\s+(?=[^\s])/g, '$1\n').split(/\n+/).forEach(function (x) {
        x = x.trim(); if (x) sents.push(x);
      });
    });
    var isPol = q.s !== 'gtelp';
    var T = function (s) { return isPol ? hlText(s) : esc(s); };
    var h = '';
    if (chip) h += '<div class="fb-gp">📘 ' + esc(chip) + '</div>';
    if (isPol) h += '<div class="fb-legend">빨간 <span class="hl-trap">함정 표현</span> · 노란 <span class="hl-num">숫자·기간</span> 먼저 확인</div>';
    var ansTxt = q.o && q.o[q.a] ? String(q.o[q.a]) : '';
    var hasAns = !!ansTxt;
    var norm = function (x) { return String(x).replace(/[\s.,·"'“”‘’(){}\[\]]/g, ''); };
    var ansN = norm(ansTxt);
    var ai = Number(q.a) || 0;
    if (it && it.order && it.order.indexOf) { var kk = it.order.indexOf(q.a); if (kk >= 0) ai = kk; }
    var letter = 'ABCD'.charAt(ai);
    if (hasAns) h += '<div class="fb-ansline"><span>정답 ' + letter + '</span><b>' +
      esc(ansTxt.length <= 60 ? ansTxt : ansTxt.slice(0, 38) + '…') + '</b></div>';
    /* "정답 O." 같은 중복 문장을 빼고 남은 첫 문장을 핵심 박스로 */
    var body = sents.filter(function (s) {
      return !(hasAns && /^정답\s*[OX0-9①-④][.)]?$/.test(s.trim()));
    });
    /* '해석:'·'풀이:'·'오답:' 라벨 묶음 → 작은 제목이 붙은 카드 하나로 (지텔프 보강 해설) */
    var blocks = [];
    body.forEach(function (s) {
      var sm2 = s.match(SEC_LINE);
      if (sm2) { blocks.push({ k: sm2[1], b: (sm2[2] || '').trim(), li: [] }); return; }
      var last = blocks[blocks.length - 1];
      if (last && last.k && /^[-·•]\s*\S/.test(s)) { last.li.push(s.replace(/^[-·•]\s*/, '')); return; }
      blocks.push({ t: s });
    });
    /* 수진 님: 해설 카드는 '풀이 → 오답 → 해석' 순서로 읽히게. 라벨 블록만 있던 자리끼리 순서를 바꾸고
       일반 문단 자리는 그대로 둔다(경찰 기출 해설 등 라벨 없는 해설은 영향 없음) */
    var LAB_ORDER = { '풀이': 1, '오답': 2, '해석': 3, '원문': 4 };
    var labSlots = [];
    blocks.forEach(function (bk, i) { if (bk.k) labSlots.push(i); });
    if (labSlots.length > 1) {
      var labSorted = labSlots.map(function (i) { return blocks[i]; }).sort(function (a, b) {
        return (LAB_ORDER[a.k] || 9) - (LAB_ORDER[b.k] || 9);
      });
      labSlots.forEach(function (i, n) { blocks[i] = labSorted[n]; });
    }
    blocks.forEach(function (bk, i) {
      if (bk.k) {
        var cls = bk.k === '해석' ? 'tr' : (bk.k === '풀이' ? 'sol' : (bk.k === '원문' ? 'orig' : 'wrong'));
        h += '<div class="fb-sec ' + cls + '"><div class="fb-sec-k">' + esc(bk.k === '원문' ? '켈리 답지 원문' : bk.k) + '</div>' +
          (bk.b ? '<p class="fb-sec-b">' + T(bk.b) + '</p>' : '') +
          (bk.li.length ? '<ul class="fb-sec-ul">' + bk.li.map(function (x) { return '<li>' + T(x) + '</li>'; }).join('') + '</ul>' : '') +
          '</div>';
        return;
      }
      var s = bk.t;
      var op = optLineHtml(s, T, '①②③④'.charAt(Number(q.a) || 0));
      if (op) { h += op; return; }
      var tg = s.match(/^\[(정답|핵심|해설|포인트|주의|비교)\]\s*([\s\S]*)$/);
      if (tg && tg[2].trim()) { h += '<p class="fb-key"><span class="fb-tag">' + esc(tg[1]) + '</span>' + T(tg[2].trim()) + '</p>'; return; }
      /* 정답 줄과 거의 같은 문장을 핵심 박스로 또 보여주면 두 번 읽게 되니 일반 문단으로만 */
      var sN = norm(s);
      if (hasAns && blocks.length > 1 && sN.length > 10 && (sN === ansN || sN.indexOf(ansN) >= 0 || ansN.indexOf(sN) >= 0)) {
        h += '<p class="fb-p">' + T(s) + '</p>';
        return;
      }
      if (/^[①-④]/.test(s) || /^[-·•]/.test(s)) h += '<p class="fb-li">' + T(s) + '</p>';
      else if (i === 0) h += '<p class="fb-key">' + T(s) + '</p>';
      else h += '<p class="fb-p">' + T(s) + '</p>';
    });
    if (tr) h += '<div class="fb-tr"><b>해석</b>' + esc(tr) + '</div>';
    if (orig) h += '<div class="fb-sec orig"><div class="fb-sec-k">켈리 답지 원문</div>' +
      '<p class="fb-sec-b">' + esc(orig) + '</p></div>';
    if (src) h += '<div class="fb-src">' + esc(src) + '</div>';
    return h;
  }

  /* <div class="fb-op"> 선지 한 줄 카드 */
  function optLineHtml(s, T, rightKey) {
    /* 기호 뒤에 공백·괄호가 와야 선지 카드로 본다. '㉠은 …'처럼 조사가 바로 붙은 문장은 일반 문단으로 */
    var mm = String(s).match(/^(?:([①-④])|([㉠-㉣])|([ㄱㄴㄷㄹ가나다라])\s*(\.))(?=[\s(\[])\s*(?:\(([OX])\))?\s*([\s\S]*)$/);
    if (!mm) return '';
    var k = mm[1] || mm[2] || (mm[3] + '.');
    var ox = mm[5] || '';
    var rest = (mm[6] || '').trim();
    if (!rest) return '';
    return '<div class="fb-op' + (rightKey && k === rightKey ? ' right' : '') + '">' +
      '<span class="fb-opk">' + esc(k) + '</span>' +
      (ox ? '<span class="fb-ox ' + (ox === 'O' ? 'o' : 'x') + '">' + ox + '</span>' : '') +
      '<span class="fb-ot">' + T(rest) + '</span></div>';
  }

  /* 경찰 과목 해설의 함정·숫자 자동 하이라이트 */
  var TRAP_PATTERNS = [
    [/(?:할 수 있(?:다|습니다)|할 수 없(?:다|습니다))/g, 'trap'],
    [/(?:하여야 한다|해야 한다|하여야 합니다)/g, 'must'],
    [/(?:임의적|필요적)/g, 'trap'],
    [/(?:추정|간주)(?:된다|되지 않는다|한다|하지 않는다)?/g, 'trap'],
    [/(?:직접정범|간접정범)/g, 'trap'],
    [/(?:유죄|무죄)/g, 'guilt'],
    [/(?:공소시효|형의 시효|제척기간)/g, 'must'],
    [/(?:원칙적으로|예외적으로|원칙|예외)/g, 'soft'],
    [/제\s?\d+조(?:의\s?\d+)?/g, 'num'],
    [/\d+(?:년|개월|일|시간|분|초|%|퍼센트|회|명|개|cm|kg)/g, 'num']
  ];
  function hlText(s) {
    var t = esc(String(s || ''));
    TRAP_PATTERNS.forEach(function (p) {
      t = t.replace(p[0], function (m) { return '<mark class="hl-' + p[1] + '">' + m + '</mark>'; });
    });
    return t;
  }

  /* 해설이 뜰 때 정답 보기가 화면 안에 들어오고, 보기가 경계에서 반토막 나 보이지 않게 스크롤을 맞춘다
     (해설 패널은 flow라 보기를 덮지 않음 — 여기서는 보이는 위치만 정리)
     · 화면 좌표(getBoundingClientRect) 기준으로 재서 스크롤 컨테이너 안에서도 정확하게 맞춘다 */
  function revealAnswerOpt(pass) {
    setTimeout(function () {
      if (!QS) return;
      var bd = $('#qBody');
      if (!bd) return;
      var opts = $$('#qBody .opt');
      if (!opts.length) return;
      var ok = null;
      opts.forEach(function (o) { if (o.classList.contains('ok')) ok = o; });
      var bar = $('#qBody .q-tags');
      for (var round = 0; round < 3; round++) {
        var br = bd.getBoundingClientRect();
        if (br.height < 80) return;
        var barH = bar ? Math.max(0, bar.getBoundingClientRect().bottom - br.top) : 0;   /* 위에 붙은 배지 줄 높이 */
        var maxS = Math.max(0, bd.scrollHeight - bd.clientHeight);
        var delta = 0;
        if (ok) {
          var r = ok.getBoundingClientRect();
          if (r.bottom > br.bottom - 10) delta = (ok === opts[opts.length - 1]) ? (maxS - bd.scrollTop) : (r.bottom - (br.bottom - 10));
          else if (r.top < br.top + barH + 6) delta = -((br.top + barH + 6) - r.top);
        }
        if (!delta) {
          for (var i = 0; i < opts.length; i++) {
            var q = opts[i].getBoundingClientRect();
            if (q.top < br.bottom - 0.5 && q.bottom > br.bottom + 0.5) { delta = q.bottom - br.bottom + 10; break; }
          }
        }
        /* 정답 보기를 보여주려고 문제 지문의 첫 줄까지 화면 밖으로 밀지 않는다
           (수진 님: 긴 지문인데 마지막 한 문장만 보여 '한 문장짜리 문제'로 보임) */
        if (delta > 0) {
          var stEl = bd.querySelector('.q-text') || bd.querySelector('.q-box');
          if (stEl) {
            var room = (stEl.getBoundingClientRect().top - br.top) - barH;
            if (room < delta) delta = Math.max(0, room);
          }
        }
        if (Math.abs(delta) < 1) break;
        var before = bd.scrollTop;
        bd.scrollTop = Math.min(maxS, Math.max(0, before + delta));
        if (bd.scrollTop === before) break;
      }
    }, pass === 2 ? 600 : pass ? 260 : 80);
  }

  function nextQ() {
    if (!QS) return;
    clearTimeout(QS._t);
    $('#qFb').classList.add('hidden');
    document.body.classList.remove('boss');
    if (QS.pendingBoss && QS.pendingAt === QS.i) {
      var bq = QS.pendingBoss;
      QS.pendingBoss = null;
      var order = bq.o.map(function (_, i) { return i; });
      shuffle(order);
      QS.items.splice(QS.i + 1, 0, { q: bq, order: order, boss: true });
    }
    if (QS.i + 1 >= QS.items.length) { if (!QS.finished) finish(); return; }
    QS.i++; renderQ();
  }

  function finish() {
    if (!QS || QS.finished) return;
    QS.finished = true;
    syncQNav();
    if (QS.speed) return finishSpeed();
    document.body.classList.remove('fever');
    var tot = QS.items.length, ok = QS.ok, acc = Math.round(ok / tot * 100);
    var bonus = acc === 100 ? 20 : 10;
    S.xp += bonus;
    if (S.days[todayStr()]) S.days[todayStr()].xp = (S.days[todayStr()].xp || 0) + bonus;
    save();
    sfx('done'); confetti(70);
    var msg = acc === 100 ? '완벽해요! 오늘 몫 끝!' : acc >= 80 ? '아주 좋아요!' : acc >= 50 ? '조금만 더!' : '틀린 문제는 오답노트에 담아뒀어요';
    $('#qBar').style.width = '100%';
    $('#qCount').textContent = tot + '/' + tot;
    $('#qBody').innerHTML =
      '<div class="summary">' +
      '<img class="sum-mascot" src="assets/mascot-win.png?v=' + MV + '" alt="">' +
      '<h2>' + ok + ' / ' + tot + ' 정답</h2><p>' + msg + '</p>' +
      '<div class="streak-pop"><span>🔥</span><b>' + (S.streak.n || 0) + '일 연속</b><i>최고 ' + (S.streak.best || 0) + '일</i></div>' +
      '<div class="rows"><div class="row"><span>정답률</span><i>' + acc + '%</i></div>' +
      '<div class="row"><span>최고 콤보</span><i>🔥 ' + QS.maxCombo + '연속</i></div>' +
      '<div class="row"><span>얻은 P</span><i>+' + (QS.xp + bonus) + ' P</i></div>' +
      '<div class="row"><span>오늘 목표</span><i>' + (dayRec().ans || 0) + '/' + S.goal.q + '문제</i></div></div>' +
      (QS.wrongIds.length ? '<button class="btn ghost wide" id="qRetryWrong">🩹 틀린 ' + QS.wrongIds.length + '문제 바로 복습</button>' : '') +
      '<button class="btn primary wide" id="qAgain">한 번 더</button>' +
      '<button class="btn ghost wide" id="qHome">스테이지로</button></div>';
    $('#qFb').classList.add('hidden');
    var modeNow = QS.mode, optNow = QS.opt || {}, wrongNow = QS.wrongIds.slice();
    var again = $('#qAgain');
    if (again) again.onclick = function () { closeQuiz(); startSession(modeNow, optNow); };
    var home = $('#qHome');
    if (home) home.onclick = function () { closeQuiz(); renderAll(); };
    var retry = $('#qRetryWrong');
    if (retry) retry.onclick = function () { closeQuiz(); startSession('ids', { ids: wrongNow, title: '틀린 문제 다시 풀기' }); };
    renderHud(); renderReview(); renderStats(); renderQuest(); renderMascot(); renderChallenges(); renderPass(); renderDash();
    checkPromotion();
  }

  function finishSpeed() {
    speedStop();
    var ok = QS.ok, best = Math.max(S.speedBest || 0, ok);
    var isBest = ok > (S.speedBest || 0);
    S.speedBest = best; save();
    sfx('done'); confetti(60);
    $('#qBar').style.width = '100%';
    $('#qBody').innerHTML =
      '<div class="summary">' +
      '<img class="sum-mascot" src="assets/mascot-win.png?v=' + MV + '" alt="">' +
      '<h2>⚡ ' + ok + '문제!</h2><p>60초 동안 ' + ok + '문제를 맞혔어요' + (isBest ? ' — 최고 기록!' : '') + '</p>' +
      '<div class="speed-score">⏱ 60초 · 최고 ' + best + '문제</div>' +
      '<div class="rows"><div class="row"><span>최고 콤보</span><i>🔥 ' + QS.maxCombo + '연속</i></div>' +
      '<div class="row"><span>얻은 P</span><i>+' + QS.xp + ' P</i></div></div>' +
      '<button class="btn primary wide" id="qAgain">한 번 더</button>' +
      '<button class="btn ghost wide" id="qSpeedWrong">틀린 ' + QS.wrongIds.length + '문제 복습</button>' +
      '<button class="btn ghost wide" id="qHome">스테이지로</button></div>';
    $('#qFb').classList.add('hidden');
    var wrongNow = QS.wrongIds.slice();
    var again = $('#qAgain'); if (again) again.onclick = function () { closeQuiz(); startSession('speed', {}); };
    var sw = $('#qSpeedWrong'); if (sw) sw.onclick = function () { closeQuiz(); if (wrongNow.length) startSession('ids', { ids: wrongNow, title: '스피드 오답' }); };
    var home = $('#qHome'); if (home) home.onclick = function () { closeQuiz(); renderAll(); };
    renderHud(); renderReview(); renderStats(); renderQuest(); renderMascot(); renderChallenges(); renderPass(); renderDash();
    checkPromotion();
  }

  function closeQuiz() {
    speedStop();
    if (MINI) { clearInterval(MINI.timer); MINI = null; }
    document.body.classList.remove('fever', 'boss', 'mini');
    var _qc = $('#qCombo'); if (_qc) _qc.classList.remove('hidden');
    var _qt = $('#qTimer'); if (_qt) { _qt.textContent = '⏱ 60'; _qt.classList.remove('warn'); }
    document.body.style.overflow = '';
    $('#quiz').classList.add('hidden');
    $('#qBody').innerHTML = '';
    $('#qFb').classList.add('hidden');
    QS = null;
  }

  function touchStreak() {
    var t = todayStr(), st = S.streak;
    if (st.last === t) return;
    var gap = st.last ? dayDiff(st.last, t) : 99;
    var bridged = !!(S.shields && S.shields[ydayStr()]);
    st.n = (gap === 1 || (gap === 2 && bridged)) ? (st.n || 0) + 1 : 1;
    st.last = t;
    st.best = Math.max(st.best || 0, st.n);
    renderShield();
  }
  function touchDay() { dayRec(); }

  /* ---------- render all ---------- */
  function renderAll() {
    applyTheme(); renderHud(); renderSubtabs(); renderDday(); renderQuest(); renderMascot();
    renderChallenges(); renderPass(); renderDash(); renderWeek(); renderStage(); renderReview(); renderStats();
    renderTodayPlan(); renderShield(); rebuildMemo();
    if (!$('#view-memo').classList.contains('hidden')) renderMemo();
  }

  /* ---------- events ---------- */
  $('#mute').onclick = function () {
    S.muted = !S.muted; save(); renderHud();
    if (!S.muted) sfx('tap');
  };
  var _planBtn = $('#planBtn');
  if (_planBtn) _planBtn.onclick = function () { sfx('tap'); openPlanSheet(); };
  var _gpBtn = $('#gpBtn');
  if (_gpBtn) _gpBtn.onclick = function () { sfx('tap'); openGpSheet(); };
  var _dashBar = $('#dashBar');
  if (_dashBar) _dashBar.onclick = function () { S.dashOpen = !S.dashOpen; save(); sfx('tap'); renderDash(); };
  $('#rankBadge').onclick = function () { sfx('tap'); openRankSheet(rankOf(S.xp || 0).r, false); };
  $('#stWeakGo').onclick = function () {
    var ws = weakUnits();
    if (!ws.length) { toast('문제를 3개 이상 풀면 약점 단원이 잡혀요'); return; }
    var ids = [];
    ws.forEach(function (w) {
      poolForUnit(w.cid, w.ui).forEach(function (q) { if (ids.indexOf(q.i) < 0) ids.push(q.i); });
    });
    if (!ids.length) { toast('그 단원 문제가 아직 없어요'); return; }
    startSession('ids', { ids: ids, title: '약점 단원 집중 복습' });
  };
  $('#ddayEdit').onclick = function () { sfx('tap'); openDdaySheet(); };
  $('#gtChip').onclick = function () { toast('지텔프 Level 2 · 2026-11-29 (일) · ' + ddayLabel(GTELP)); };
  $('#planChip').onclick = function () { openPlanSheet(); };
  var _tpRow = $('#todayPlanRow');
  if (_tpRow) _tpRow.onclick = function () { sfx('tap'); openPlanSheet(); };
  var _saveBadge = $('#saveBadge');
  if (_saveBadge) _saveBadge.onclick = function () {
    toast('체크·P·오답이 이 기기 브라우저에 자동 저장돼요 · 🗺️ 학습 계획에서 파일로 내보낼 수 있어요');
  };
  $$('.tab').forEach(function (b) {
    b.onclick = function () {
      $$('.tab').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      var v = b.getAttribute('data-view');
      ['stage', 'review', 'memo', 'stats'].forEach(function (k) {
        var el = $('#view-' + k);
        if (el) el.classList.toggle('hidden', k !== v);
      });
      window.scrollTo({ top: 0 });
      if (v === 'stage') { $('#path')._scrolled = false; renderStage(); }
      if (v === 'review') renderReview();
      if (v === 'memo') renderMemo();
      if (v === 'stats') renderStats();
    };
  });
  $('#mToday').onclick = function () { startSession('today'); };
  $('#mAll').onclick = function () { startSession('all'); };
  $('#mWrong').onclick = function () { startSession('wrong'); };
  $$('#lenChips .chip').forEach(function (b) {
    b.onclick = function () { S.qlen = Number(b.getAttribute('data-len')); save(); renderReview(); sfx('tap'); };
  });
  $('#mixAll').onchange = function () { S.mix = this.checked; save(); renderReview(); };
  var _mSpeed = $('#mSpeed');
  if (_mSpeed) _mSpeed.onclick = function () { sfx('tap'); startSession('speed', {}); };
  var _mOx = $('#mOx');
  if (_mOx) _mOx.onclick = function () { sfx('tap'); startOx(); };
  var _gbSet = $('#gbSet');
  if (_gbSet) _gbSet.onclick = function () { sfx('tap'); openGoalSheet(); };
  var _gbBar = $('#goalBar');
  if (_gbBar) _gbBar.onclick = function (e) { if (e.target && e.target.id === 'gbSet') return; sfx('tap'); openGoalSheet(); };
  var _oxClose = $('#oxClose');
  if (_oxClose) _oxClose.onclick = function () { sfx('tap'); closeOx(); renderAll(); };  
  window.addEventListener('resize', function () { syncTopHeight(); });
  window.addEventListener('load', function () { syncTopHeight(); });
  $('#qClose').onclick = function () {
    if (MINI) { closeMini(); renderAll(); return; }
    closeQuiz(); renderAll();
  };
  $('#fbNext').onclick = nextQ;
  var _fbPrev = $('#fbPrev'); if (_fbPrev) _fbPrev.onclick = goPrev;
  var _qPrev = $('#qPrev'); if (_qPrev) _qPrev.onclick = goPrev;
  $('#stWrongGo').onclick = function () { startSession('wrong'); };
  $('#sheet').addEventListener('click', closeSheetIfBg);
  $('#reset').onclick = function () {
    if (!confirm('학습 기록(진도·P·스트릭·오답)을 모두 지울까요? 지텔프 G-POINT 1~8 기본 체크도 다시 적용됩니다.')) return;
    S = {
      xp: 0, streak: { n: 0, last: '', best: 0 }, checked: {}, wrong: {}, ans: 0, ok: 0,
      muted: S.muted, subj: S.subj, course: {}, qlen: 10, mix: false, days: {},
      dday: DTARGET, ddayNote: '예상일', unit: {}, node: {}, qok: {}, gpSeeded: true, goal: { xp: 50, q: 10 },
      planLog: {}, planSubj: 'done', xpSpent: 0, shields: {}, cards: {}, gpLast: {}, bossWins: 0,
      dayGoal: S.dayGoal || 30, oxBest: 0, oxRuns: 0
    };
    scopeCache = null;
    CF.deck = []; BQ = null;
    D.subjects.forEach(function (s) { S.course[s.id] = s.defaultCourse || s.courses[0].id; });
    var seed = {};
    for (var gi = 1; gi <= 8; gi++) seed[gi] = todayStr();
    S.checked['gtp33'] = seed;
    save(); $('#path')._scrolled = false; renderAll(); toast('초기화했어요');
  };
  $('#installTip').onclick = function () {
    toast('사파리 하단 공유(⬆️) → "홈 화면에 추가"');
  };

  /* ---------- 새 기능 바인딩 ---------- */
  var _libBtn = $('#libBtn');
  if (_libBtn) _libBtn.onclick = function () { sfx('tap'); MEMO.seg = 'lib'; openMemo('lib'); };
  $$('#memoSeg .seg-b').forEach(function (b) {
    b.onclick = function () { sfx('tap'); MEMO.seg = b.getAttribute('data-seg'); CF.flipped = false; renderMemo(); };
  });
  var _fcard = $('#fcard');
  if (_fcard) _fcard.onclick = function () { CF.flipped = !CF.flipped; sfx('tap'); cfPaint(); };
  var _fcKnown = $('#fcKnown');
  if (_fcKnown) _fcKnown.onclick = function () { cfAnswer(true); };
  var _fcHard = $('#fcHard');
  if (_fcHard) _fcHard.onclick = function () { cfAnswer(false); };
  var _cfRestart = $('#cfRestart');
  if (_cfRestart) _cfRestart.onclick = function () { sfx('tap'); CF.deck = []; cfStart(); toast('새 순서로 다시 시작해요'); };
  var _goBlank = $('#goBlank');
  if (_goBlank) _goBlank.onclick = function () { sfx('tap'); startBlank(); };
  var _shieldBar = $('#shieldBar');
  if (_shieldBar) _shieldBar.onclick = function () { buyShield(); };
  var _bClose = $('#bClose');
  if (_bClose) _bClose.onclick = function () { closeBlank(); renderAll(); };
  /* 미니 모의고사 · 2026년 2차 기출 · 키워드 검색 진입 */
  var _mMini = $('#mMini');
  if (_mMini) _mMini.onclick = function () { sfx('tap'); openMiniSheet(); };
  var _mExam = $('#mExamBank');
  if (_mExam) _mExam.onclick = function () { sfx('tap'); openExamBankSheet(); };
  var _sBtn = $('#searchBtn');
  if (_sBtn) _sBtn.onclick = function () { sfx('tap'); openSearch(); };
  $$('[data-search]').forEach(function (b) { b.onclick = function () { sfx('tap'); openSearch(); }; });
  var _sClose = $('#sClose');
  if (_sClose) _sClose.onclick = function () { closeSearch(); };
  var _sInput = $('#sInput');
  if (_sInput) {
    _sInput.addEventListener('input', function () {
      clearTimeout(SEARCH.t);
      var v = this.value;
      SEARCH.t = setTimeout(function () { renderSearch(v); }, 110);
    });
    _sInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); renderSearch(this.value); }
      if (e.key === 'Escape') { closeSearch(); }
    });
  }
  $$('#sTabs [data-f]').forEach(function (b) {
    b.onclick = function () {
      SEARCH.f = b.getAttribute('data-f');
      $$('#sTabs [data-f]').forEach(function (x) { x.classList.toggle('on', x === b); });
      renderSearch(); sfx('tap');
    };
  });
  window.addEventListener('resize', function () {
    if (!$('#view-stage').classList.contains('hidden')) renderStage();
  });


  /* ---------- 📂 미래인재경찰 자료실 (구글 드라이브 jinleeda1) ---------- */
  var LIB = [
    { sub: "공통 · 2026년 2차 기출 (헌법 제외)", rows: [
      { t: "2026년 2차 순경 문제", k: "기출", s: "헌법 1~20번 제거본 · 형사법 40 · 경찰학 40 · 범죄학 20", u: "https://drive.google.com/file/d/1pQhCmGnsticR4aYVTyJdHy4cG0_4rTNS/view" },
      { t: "2026년 2차 순경 가답안", k: "가답안", s: "헌법 열 제거본 · 형사법·경찰학·범죄학 정답", u: "https://drive.google.com/file/d/1bgG4O5g80qD-kbj4p7MxS6FoezSvqjaU/view" },
      { t: "2026년 2차 채용시험 해설지", k: "해설", s: "장정훈 경찰학 40문항 해설 (미래인재 자료실)", u: "https://drive.google.com/file/d/14xVzfFLogc8q0z3ARmtp8bzBgMye3Azf/view" },
    ] },
    { sub: "범죄학 · 박상민", rows: [
      { t: "1강 보충자료 01", k: "문제+해설", s: "26.11.12 · 박상민 범죄학 기본이론 1강", u: "https://drive.google.com/file/d/1WnoUATIwOrAXde-lKQ-lh6KApwA41MvS/view" },
      { t: "범죄학 일반", k: "문제", s: "초시생존 범죄학 일반론", u: "https://drive.google.com/file/d/1CPtZvY_FFZ43O5MJ8Ygrz3DLPDoKNjGe/view" },
      { t: "범죄학 일반", k: "해설", s: "초시생존 범죄학 일반론", u: "https://drive.google.com/file/d/1nWRJ-XL9nVJDMx9sj7AVXVGHYQBdOmYt/view" },
    ] },
    { sub: "형사법 · 신광은 초시생 기초다지기", rows: [
      { t: "각론", k: "문제", s: "신광은 초시생 기초다지기", u: "https://drive.google.com/file/d/1Nmje3RTBa7tikMel4k95rTvQFyaplTqC/view" },
      { t: "각론", k: "해설", s: "신광은 초시생 기초다지기", u: "https://drive.google.com/file/d/1qHuqa5inrYdCuonDc_dSmQlHVn8cc0Dr/view" },
      { t: "수사", k: "문제", s: "신광은 초시생 기초다지기", u: "https://drive.google.com/file/d/1DVYva1VgTArolrpe_7oeKeFQen4-ehuS/view" },
      { t: "수사", k: "해설", s: "신광은 초시생 기초다지기", u: "https://drive.google.com/file/d/1aAkstnzu1pvZcRVBtycIr83cuupcoJ-Q/view" },
      { t: "증거", k: "문제", s: "신광은 초시생 기초다지기", u: "https://drive.google.com/file/d/1RSC2dHtYuexYQ7K86ZNGmEoHYs-S-PSB/view" },
      { t: "증거", k: "해설", s: "신광은 초시생 기초다지기", u: "https://drive.google.com/file/d/1KHMy9osqJ66-_acFGfkj0SPkTakEa_Sj/view" },
      { t: "총론", k: "문제", s: "신광은 초시생 기초다지기", u: "https://drive.google.com/file/d/1gCkIXUjctQo0aS4PTEk1s_I7oDKhl0X/view" },
      { t: "총론", k: "해설", s: "신광은 초시생 기초다지기", u: "https://drive.google.com/file/d/1yIdhn2tB9dks8w_6Tqs9XOGa1nLlxMIZ/view" },
    ] },
    { sub: "경찰학 · 장정훈 초시생 기초다지기", rows: [
      { t: "경찰학의 기초이론", k: "문제", s: "장정훈 초시생 기초다지기", u: "https://drive.google.com/file/d/1Ah90hszEWxQeDv_NlWhAdq-Lof6XRqsM/view" },
      { t: "경찰학의 기초이론", k: "해설", s: "장정훈 초시생 기초다지기", u: "https://drive.google.com/file/d/1xVtaZsOkVJ-PnusRhKqudZgGZqQQhASZ/view" },
      { t: "경찰행정법", k: "문제", s: "장정훈 초시생 기초다지기", u: "https://drive.google.com/file/d/1Cj3-FzbtESgLyIUWrZhnbTPLXoHaF9bF/view" },
      { t: "경찰행정법", k: "해설", s: "장정훈 초시생 기초다지기", u: "https://drive.google.com/file/d/1ERVvHflVHrQh5KJ_cEm9LI5Z4augHZQT/view" },
      { t: "경찰행정학", k: "문제", s: "장정훈 초시생 기초다지기", u: "https://drive.google.com/file/d/18PyPuXb3_pMICOlHxRouOEa-aN7wuV2p/view" },
      { t: "경찰행정학", k: "해설", s: "장정훈 초시생 기초다지기", u: "https://drive.google.com/file/d/1tgjCGtqyVlA2dWWIqcbBLggRlwFQbsV3/view" },
      { t: "분야별 경찰활동", k: "문제", s: "장정훈 초시생 기초다지기", u: "https://drive.google.com/file/d/1rcmktHAaTTaBpuZQwEsVQxo_rbNjMXMm/view" },
      { t: "분야별 경찰활동", k: "해설", s: "장정훈 초시생 기초다지기", u: "https://drive.google.com/file/d/1VDBFCCyj5_EXd1ZMJ8xsYJZspOiyYq5-/view" },
      { t: "한국경찰의 역사와 비교경찰", k: "문제", s: "장정훈 초시생 기초다지기", u: "https://drive.google.com/file/d/1djNOYxe7ANZzZ7NMk9rNL_xvDvzpBXlO/view" },
      { t: "한국경찰의 역사와 비교경찰", k: "해설", s: "장정훈 초시생 기초다지기", u: "https://drive.google.com/file/d/1gl_-Bg1lBmbOpFyfqwHebQtbbXXcFs7a/view" },
    ] },
    { sub: "경찰학 · 장정훈 기출총정리", rows: [
      { t: "기출 모의고사 01회", k: "문제", s: "26.11.10 · 경찰학 기출 모의고사 01회(문제)", u: "https://drive.google.com/file/d/1pXms9WUmNRguM5jGIHw_36q6on2l9ALD/view" },
      { t: "기출 모의고사 02회", k: "문제", s: "26.11.16 · 경찰학 기출 모의고사 02회(문제)", u: "https://drive.google.com/file/d/1VoJNo2aZwhLLHjLqbY5rK-5DLAyMlunR/view" },
      { t: "기출 모의고사 03회", k: "문제", s: "26.11.17 · 경찰학 기출 모의고사 03회(문제)", u: "https://drive.google.com/file/d/1tAj16YYyMzdveQFlYDoSV5DI1M75HQMK/view" },
      { t: "제76기 경위공채 해설지", k: "해설", s: "26.11.09 · 경찰학 제76기 경위공채 해설지", u: "https://drive.google.com/file/d/17Iu1RtBMFKZxjiCptiqv1tYgQBg2D45F/view" },
      { t: "기출 모의고사 01회", k: "해설", s: "26.11.10 · 경찰학 기출 모의고사 01회(해설)", u: "https://drive.google.com/file/d/1LuKAprsqa-5TLkjgIPmPjYQsV19Nxctg/view" },
      { t: "기출 모의고사 02회", k: "해설", s: "26.11.16 · 경찰학 기출 모의고사 02회(해설)", u: "https://drive.google.com/file/d/1Njhy2DwvUHndb8KZYoSaf-uFf63l6z5x/view" },
      { t: "기출 모의고사 03회", k: "해설", s: "26.11.17 · 경찰학 기출 모의고사 03회(해설)", u: "https://drive.google.com/file/d/1mUBuiHsD1XtoR4VXD8l1cItrpNm5Adz3/view" },
      { t: "2026 최신기출문제집(추록)(구판)", k: "추록", s: "2026 최신기출문제집(추록)(구판)", u: "https://drive.google.com/file/d/1rNEja0HSvdWOBg330b57RFmNT1ldYCtD/view" },
      { t: "2027 최신기출문제집(추록)", k: "추록", s: "26.11.09 · 경찰학 2027 최신기출문제집(추록)", u: "https://drive.google.com/file/d/1WjYaLOt91-F9QGfxWu05zyy57M1fO8LH/view" },
      { t: "기출 총정리 추가자료", k: "추록", s: "26.11.16 · 경찰학 기출 총정리 추가자료", u: "https://drive.google.com/file/d/1sy4nA8wVzwM_47Z8ZD0w42248dCZenZG/view" },
      { t: "네친구 추가추록과 기출추록", k: "추록", s: "26.11.16 · 경찰학 네친구 추가추록과 기출추록", u: "https://drive.google.com/file/d/1fEpC8mT0ur41JYG9ow715XN2znyfN-nx/view" },
      { t: "기출총정리 수업자료", k: "기출", s: "26.11.10 · 경찰학 기출총정리 수업자료", u: "https://drive.google.com/file/d/1rQkc9aOb-tjMJ6jhxBjT9bTvdCFI3DVc/view" },
    ] },
    { sub: "경찰학 · 장정훈 올인원 9~11월", rows: [
      { t: "26년 2차 공채시험 등 문제", k: "문제", s: "26.11.13 · 경찰학 26년 2차 공채시험 등 문제", u: "https://drive.google.com/file/d/14tiAqRiGGNdxAKnHLWN9LaFIQbELu3J3/view" },
      { t: "모의고사 01회", k: "문제", s: "26.10.01 · 경찰학 올인원 모의고사 01회(문제)", u: "https://drive.google.com/file/d/1L0P2kq2NWsbMfXg8mhr_29C1lYocTny6/view" },
      { t: "모의고사 02회", k: "문제", s: "26.10.10 · 경찰학 올인원 모의고사 02회(문제)", u: "https://drive.google.com/file/d/1gYjbzda3TZP1dNn79DMRs3k0v5tR4t_u/view" },
      { t: "모의고사 03회", k: "문제", s: "26.10.23 · 경찰학 올인원 모의고사 03회(문제)", u: "https://drive.google.com/file/d/1P-Gk6-lUP8cM-3xkmkpPX1zoXxO_hZ-X/view" },
      { t: "모의고사 01회", k: "해설", s: "26.10.01 · 경찰학 올인원 모의고사 01회(해설)", u: "https://drive.google.com/file/d/1du9cW4Qb0zUHjgz3BkEalDRk8sgOz47A/view" },
      { t: "모의고사 02회", k: "해설", s: "26.10.10 · 경찰학 올인원 모의고사 02회(해설)", u: "https://drive.google.com/file/d/1dTYvqBdR0Tb-E5okT7KGQMcwyLzAnpRr/view" },
      { t: "모의고사 03회", k: "해설", s: "26.10.23 · 경찰학 올인원 모의고사 03회(해설)", u: "https://drive.google.com/file/d/1KvuyZ-pEjCKjl915Wl-97MPuK9HZlXNu/view" },
      { t: "OX 01회", k: "OX", s: "26.09.10 · 올인원 OX 복습자료 01회", u: "https://drive.google.com/file/d/1cRwcbtQEEW1q4_KvGML9C5O3JYA8OY9r/view" },
      { t: "OX 02회", k: "OX", s: "26.09.11 · 경찰학 올인원 OX 복습자료 02회", u: "https://drive.google.com/file/d/1VHIOVHtFnR9xYu8WjTY4s2ft_KUGNsBi/view" },
      { t: "OX 03회", k: "OX", s: "26.09.17 · 올인원 OX 복습자료 03회", u: "https://drive.google.com/file/d/1wIozMMa1YWGVqhsAPoL26h819UdoeK1b/view" },
      { t: "OX 04회", k: "OX", s: "26.09.18 · 경찰학 올인원 OX 복습자료 04회", u: "https://drive.google.com/file/d/1OjwHlohWT9K_Ac5pqiPwXLFBHio7plTr/view" },
      { t: "OX 05회", k: "OX", s: "26.10.01 · 경찰학 올인원 OX 복습자료 05회", u: "https://drive.google.com/file/d/1ThKNn-QJZN7AJJCCtxzkRM2jlhf66zp1/view" },
      { t: "OX 06회", k: "OX", s: "26.10.02 · 경찰학 올인원 OX 복습자료 06회", u: "https://drive.google.com/file/d/1oTdZU1qw8_zzrhrhV_075kapadPfBati/view" },
      { t: "OX 07회", k: "OX", s: "26.10.03 · 경찰학 올인원 OX 복습자료 07회", u: "https://drive.google.com/file/d/1AAUQXgINFdp7BwzTbCxPdhB95hdvwC1S/view" },
      { t: "OX 08회", k: "OX", s: "26.10.08 · 올인원 OX 복습자료 08회", u: "https://drive.google.com/file/d/13IvlwNVAmlFOAFpHXk6FtMQi42MMNded/view" },
      { t: "OX 09회", k: "OX", s: "26.10.09 · 올인원 OX 복습자료 09회", u: "https://drive.google.com/file/d/1CpdNVwzn5fq50GHlioNi3MJkfipk17PM/view" },
      { t: "OX 10회", k: "OX", s: "26.10.10 · 올인원 OX 복습자료 10회", u: "https://drive.google.com/file/d/1l-WmEXyDWiUquvGW9yjYi_9_7AvuFyUK/view" },
      { t: "OX 11회", k: "OX", s: "26.10.12 · 올인원 OX 복습자료 11회", u: "https://drive.google.com/file/d/1IlKZr-5FS_oAlpTv4Vgembs84lu_I2Au/view" },
      { t: "OX 12회", k: "OX", s: "26.10.13 · 올인원 OX 복습자료 12회", u: "https://drive.google.com/file/d/1-I1k2wNM_FcWhuLPqhMVeRcyQkEdpd02/view" },
      { t: "OX 13회", k: "OX", s: "26.10.22 · 경찰학 올인원 OX 복습자료 13회", u: "https://drive.google.com/file/d/1ejRLQ8-xUvdB3WuZb_jJtFxuzf0IWM1x/view" },
      { t: "OX 14회", k: "OX", s: "26.10.23 · 경찰학 올인원 OX 복습자료 14회", u: "https://drive.google.com/file/d/1DO0qy2R0BGPyvHCLJv_-4C4mZmFhjZuU/view" },
      { t: "OX 15회", k: "OX", s: "26.10.29 · 올인원 OX 복습자료 15회", u: "https://drive.google.com/file/d/16STY-51VStB-3OdKxmNea2iaCLK7Q8W_/view" },
      { t: "OX 16회", k: "OX", s: "26.10.30 · 경찰학 올인원 OX 복습자료 16회", u: "https://drive.google.com/file/d/1AGtJUIv9M3QdmWQGLzI4gzQqbwp38Ao8/view" },
      { t: "OX 17회", k: "OX", s: "26.11.12 · 경찰학 올인원 OX 복습자료 17회", u: "https://drive.google.com/file/d/1V2Jo-kZCAz2wq6jVe3aB0C35CwvARXKK/view" },
      { t: "OX 18회", k: "OX", s: "26.11.13 · 경찰학 올인원 OX 복습자료 18회", u: "https://drive.google.com/file/d/1JAKxoVu-jvsz7QCGKWl9GfaRn9CLdgTY/view" },
      { t: "빈칸자료 01회", k: "빈칸", s: "26.09.11 · 경찰학 올인원 빈칸자료 01회", u: "https://drive.google.com/file/d/1-VbGPnxNl2bE-aTf6FndGU1mHKe5okGV/view" },
      { t: "빈칸자료 02회", k: "빈칸", s: "26.09.17 · 올인원 빈칸자료 02회", u: "https://drive.google.com/file/d/14G6fMNncZbiHh9fTzwHeyAW1bav8M5ir/view" },
      { t: "빈칸자료 03회", k: "빈칸", s: "26.09.18 · 경찰학 올인원 빈칸자료 03회", u: "https://drive.google.com/file/d/1Vk6erLiOrIxaQui02HHEsQUsuELKGfkq/view" },
      { t: "빈칸자료 04회", k: "빈칸", s: "26.10.01 · 경찰학 올인원 빈칸자료 04회", u: "https://drive.google.com/file/d/1ViPwbaBbximHHXhLGCrMzGv_H_AHBc3B/view" },
      { t: "빈칸자료 05회", k: "빈칸", s: "26.10.02 · 경찰학 올인원 빈칸자료 05회", u: "https://drive.google.com/file/d/1rqak0n1GMMfJ4lzSDR9a15hoLXmTOxAs/view" },
      { t: "빈칸자료 06회", k: "빈칸", s: "26.10.03 · 경찰학 올인원 빈칸자료 06회", u: "https://drive.google.com/file/d/12ExPIRmCQshuPDH-30NTQ0nHreUZIbJp/view" },
      { t: "빈칸자료 07회", k: "빈칸", s: "26.10.08 · 올인원 빈칸자료 07회", u: "https://drive.google.com/file/d/14eI9HZ2Md3XBu3PXodxVMLtD3hW2bOVZ/view" },
      { t: "빈칸자료 08회", k: "빈칸", s: "26.10.09 · 올인원 빈칸자료 08회", u: "https://drive.google.com/file/d/1_b8Svdnb3gr3xKiKbaXmqEQe38FlZtwL/view" },
      { t: "빈칸자료 09회", k: "빈칸", s: "26.10.10 · 올인원 빈칸자료 09회", u: "https://drive.google.com/file/d/1_VuYQtvFp4cJuYlMjKtXskAk56q_iGBh/view" },
      { t: "빈칸자료 10회", k: "빈칸", s: "26.10.12 · 올인원 빈칸자료 10회", u: "https://drive.google.com/file/d/1NmguFNWB6niIdjx5rqFskVSCdxktk_NZ/view" },
      { t: "빈칸자료 11회", k: "빈칸", s: "26.10.13 · 올인원 빈칸자료 11회", u: "https://drive.google.com/file/d/1HUUM-ZY8X_pD9SqiGlKryYs2E-6Vx1_h/view" },
      { t: "빈칸자료 12회", k: "빈칸", s: "26.10.22 · 경찰학 올인원 빈칸자료 12회", u: "https://drive.google.com/file/d/1n6PAVR_hrf4tFBUHrJD4VpYj992Upwd3/view" },
      { t: "빈칸자료 13회", k: "빈칸", s: "26.10.23 · 경찰학 올인원 빈칸자료 13회", u: "https://drive.google.com/file/d/1kp4zdGcyusELz88pBEhPnUPZjvyBVAQE/view" },
      { t: "빈칸자료 14회", k: "빈칸", s: "26.10.29 · 올인원 빈칸자료 14회", u: "https://drive.google.com/file/d/1jmH_l5OEJLlgpL5p9NJ_GjKmN-_H6JQ1/view" },
      { t: "빈칸자료 15회", k: "빈칸", s: "26.10.30 · 경찰학 올인원 빈칸자료 15회", u: "https://drive.google.com/file/d/14QwpFXWbcrgUGXdBdMY-h82N2L7Azt1A/view" },
      { t: "빈칸자료 16회", k: "빈칸", s: "26.10.30 · 경찰학 올인원 빈칸자료 16회", u: "https://drive.google.com/file/d/1wKCZWFIXiSfDJPgx01pjXut8hWC4Ked4/view" },
      { t: "빈칸자료 17회", k: "빈칸", s: "26.11.13 · 경찰학 올인원 빈칸자료 17회", u: "https://drive.google.com/file/d/1ikTVCEas2vhkgOHYWcaAzb4lkFBuMaim/view" },
      { t: "개정사항", k: "추록", s: "26.10.22 · 경찰학 올인원 개정사항", u: "https://drive.google.com/file/d/1W7t45eKC52Oi_i2E05k__RGSaJbAidyP/view" },
      { t: "2027 경찰학[기본서] 추록", k: "추록", s: "26.11.12 · 경찰학 2027 경찰학[기본서] 추록", u: "https://drive.google.com/file/d/1GhKbVpQfvdaNJJGOkESEP1KlHtQq82Mt/view" },
      { t: "암기자료", k: "암기", s: "26.09.17 · 올인원 암기자료", u: "https://drive.google.com/file/d/1DZ6wl_KREk7E2RAJ9HRzNWZcUw7IcdkQ/view" },
      { t: "암기자료", k: "암기", s: "26.09.18 · 경찰학 올인원 암기자료", u: "https://drive.google.com/file/d/1sKZplaikmu5qZFv8V8IoY0V-1J9Gur7P/view" },
    ] },
    { sub: "경찰학 · 장정훈 올인원 7~8월", rows: [
      { t: "모의고사 05회", k: "문제", s: "26.07.20 · 경찰학 올인원 모의고사 05회(문제)", u: "https://drive.google.com/file/d/1SF1rBXJSwMlya5t-tO81Dcce2Qh5EV_t/view" },
      { t: "모의고사 06회", k: "문제", s: "26.08.03 · 경찰학 올인원 모의고사 06회(문제)", u: "https://drive.google.com/file/d/149b0CvDZtTN66V7UV-mOLIyWpyZfT479/view" },
      { t: "모의고사 07회", k: "문제", s: "26.08.17 · 경찰학 올인원 모의고사 07회(문제)", u: "https://drive.google.com/file/d/1Tb_9i5f0x8LtuqRvayGWv8_JMYDmTvxj/view" },
      { t: "모의고사 05회", k: "해설", s: "26.07.20 · 경찰학 올인원 모의고사 05회(해설)", u: "https://drive.google.com/file/d/1-D1STrMPVICo3mkKp0ul1NjPV4fJ0L_D/view" },
      { t: "모의고사 06회", k: "해설", s: "26.08.03 · 경찰학 올인원 모의고사 06회(해설)", u: "https://drive.google.com/file/d/1R9d5sN69rsAJ2Yhkh0bgHX0_tE7NzAvi/view" },
      { t: "모의고사 07회", k: "해설", s: "26.08.17 · 경찰학 올인원 모의고사 07회(해설)", u: "https://drive.google.com/file/d/14uL5-Ab1YSjPQKG140Go-xNSLwLOBgsw/view" },
      { t: "OX 19회", k: "OX", s: "26.07.13 · 경찰학 올인원 OX 복습자료 19회", u: "https://drive.google.com/file/d/1e7JC74FX9sGvWRbZLNLgiATbLX3RZbES/view" },
      { t: "OX 20회", k: "OX", s: "26.07.15 · 올인원 OX 복습자료 20회", u: "https://drive.google.com/file/d/1lNcWPYITqaTPtuH_TpCZpIkfqpRN9nqd/view" },
      { t: "OX 21회", k: "OX", s: "26.07.17 · 경찰학 올인원 OX 복습자료 21회", u: "https://drive.google.com/file/d/1pN-jPImFlJ3oGSQB2TClVDuC4pj9w0Yu/view" },
      { t: "OX 22회", k: "OX", s: "26.07.20 · 올인원 OX 복습자료 22회", u: "https://drive.google.com/file/d/1jAMSIvMPE2HZmfGk2LQX78iJC8dXOhdg/view" },
      { t: "OX 23회", k: "OX", s: "26.07.22 · 경찰학 올인원 OX 복습자료 23회", u: "https://drive.google.com/file/d/14sNOifJyMRq7x8WVHBwxavFO1gffIm6c/view" },
      { t: "OX 24회", k: "OX", s: "26.07.25 · 올인원 OX 복습자료 24회", u: "https://drive.google.com/file/d/1TzMgMvWiWp6F-D6F668EPay2pmBIdgPj/view" },
      { t: "OX 25회", k: "OX", s: "26.07.27 · 경찰학 올인원 OX 복습자료 25회", u: "https://drive.google.com/file/d/1U6dUiOxn_qNbmD5cxkMVwe9OqH2IgiuC/view" },
      { t: "OX 26회", k: "OX", s: "26.07.29 · 경찰학 올인원 OX 복습자료 26회", u: "https://drive.google.com/file/d/1NyoODMNKRXpLzFCZhX1V3Z5vw2xa8lsV/view" },
      { t: "OX 27회", k: "OX", s: "26.08.03 · 올인원 OX 복습자료 27회", u: "https://drive.google.com/file/d/1lEg51K8VPRELvk21o_S2fEfM0tT6_3KS/view" },
      { t: "OX 28회", k: "OX", s: "26.08.10 · 올인원 OX 복습자료 28회", u: "https://drive.google.com/file/d/1aMJj1Rc5h0mfUmKAzT491fvHBUDg4eQq/view" },
      { t: "OX 29회", k: "OX", s: "26.08.11 · 경찰학 OX 복습자료 29회", u: "https://drive.google.com/file/d/1m3xIpTCisQyOVD8yacfUgVnqE3iVuS82/view" },
      { t: "OX 30회", k: "OX", s: "26.08.15 · 경찰학 올인원 OX 복습자료 30회", u: "https://drive.google.com/file/d/1YR94ybdd1Vh_Mne3IA6cGPSqAhX7vos3/view" },
      { t: "OX 31회", k: "OX", s: "26.08.17 · 경찰학 올인원 OX 복습자료 31회", u: "https://drive.google.com/file/d/1W82tr8V0VhnfXZCpL57NAUUYPJH4cHt4/view" },
      { t: "빈칸자료 18회", k: "빈칸", s: "26.07.13 · 경찰학 올인원 빈칸자료 18회", u: "https://drive.google.com/file/d/1tKpw9ltxTqGLXBeICvzrp-QjeJuI-plo/view" },
      { t: "빈칸자료 19회", k: "빈칸", s: "26.07.15 · 올인원 빈칸자료 19회", u: "https://drive.google.com/file/d/1XFkoCw4CQz9dQ4-7CFRa7JQnQ6xTHhdn/view" },
      { t: "빈칸자료 20회", k: "빈칸", s: "26.07.17 · 경찰학 올인원 빈칸자료 20회", u: "https://drive.google.com/file/d/1kp3x9O_jEkmxQPyKYdw8McS2IOHoa8KK/view" },
      { t: "빈칸자료 21회", k: "빈칸", s: "26.07.20 · 올인원 빈칸자료 21회", u: "https://drive.google.com/file/d/1Z0TcTvOP7-AUaEeGd0lG54KzvhSegODF/view" },
      { t: "빈칸자료 22회", k: "빈칸", s: "26.07.22 · 경찰학 올인원 빈칸자료 22회", u: "https://drive.google.com/file/d/1RuZS-tQ4bgO3mWYBTyeZWGML0xIqXwTP/view" },
      { t: "빈칸자료 23회", k: "빈칸", s: "26.07.25 · 올인원 빈칸자료 23회", u: "https://drive.google.com/file/d/1m8dze90DCTyfmZ-KummwtiY5-kkHeMX2/view" },
      { t: "빈칸자료 24회", k: "빈칸", s: "26.07.27 · 경찰학 올인원 빈칸자료 24회", u: "https://drive.google.com/file/d/1_5uncIEFcZEApdnHMUgVlw3msiCXdwgx/view" },
      { t: "빈칸자료 25회", k: "빈칸", s: "26.07.29 · 경찰학 올인원 빈칸자료 25회", u: "https://drive.google.com/file/d/1aFyBYZCF7CBL3_lcmULHVDxHdAtfvV_j/view" },
      { t: "빈칸자료 26회", k: "빈칸", s: "26.08.03 · 올인원 빈칸자료 26회", u: "https://drive.google.com/file/d/1xz8IZlaU4qdd4UVqDqU6E9UQEvM4yZUw/view" },
      { t: "빈칸자료 27회", k: "빈칸", s: "26.08.10 · 올인원 빈칸자료 27회", u: "https://drive.google.com/file/d/16b2hGLSok1TzuEC9f6UsVcFnktNZSNsw/view" },
      { t: "빈칸자료 28회", k: "빈칸", s: "26.08.11 · 경찰학 올인원 빈칸자료 28회", u: "https://drive.google.com/file/d/1oA3nbDzAaBtdWj8_iI_92umYxLuL00D_/view" },
      { t: "빈칸자료 29회", k: "빈칸", s: "26.08.15 · 경찰학 올인원 빈칸자료 29회", u: "https://drive.google.com/file/d/1VIFn7sGBVz6F-zbv1Byd-LIX-OyFlbcM/view" },
      { t: "빈칸자료 30회", k: "빈칸", s: "26.08.17 · 경찰학 올인원 빈칸자료 30회", u: "https://drive.google.com/file/d/1-SUx7m6knr1dd6gHNnTm2xeTb3y2zee7/view" },
      { t: "자료(개정법령)", k: "추록", s: "26.07.22 · 올인원 자료(개정법령)", u: "https://drive.google.com/file/d/1zzBlsxvgXIGPz5Z88r8MRU-fnwJZbrsT/view" },
    ] },
    { sub: "형사법 · 신광은 기출OX·기출총정리", rows: [
      { t: "26년 2차대비 진도별 기출 OX 강의계획서 및 진도표(총론)", k: "계획서", s: "26.03.30 · 형사법 26년 2차대비 진도별 기출 OX 강의계획서 및 진도표(총론)", u: "https://drive.google.com/file/d/1KiguoFNmOXCcIRX3mRZmnXeiEfkIQ-b-/view" },
      { t: "26년 2차대비 기출 OX 각론 진도표", k: "계획서", s: "26.05.12 · 형사법 26년 2차대비 기출 OX 각론 진도표", u: "https://drive.google.com/file/d/1Io8WX5O716Bh_zhK4vOacyhvcXu_SH3n/view" },
      { t: "기출총정리 강의계획서(총론·각론·수사증거)", k: "계획서", s: "26.11.13 · 형사법 기출총정리 강의계획서(총론·각론·수사증거)", u: "https://drive.google.com/file/d/1aeOGSfqC2CiCdgtGThBFpsu9vl9MankC/view" },
    ] },
    { sub: "형사법 · 신광은 형법총론", rows: [
      { t: "OX 총론 1회 법률주의 유추해석금지원칙", k: "문제", s: "26.09.07 · 형사법 올인원 OX 총론 1회 법률주의 유추해석금지원칙 (문제)", u: "https://drive.google.com/file/d/1v0zpxq-QVG2sFW82oCFyDmbRE3BCBoAo/view" },
      { t: "OX 총론 2회 소급효금지원칙 보호주의에의한보충", k: "문제", s: "26.09.08 · 형사법 올인원 OX 총론 2회 소급효금지원칙 보호주의에의한보충 (문제)", u: "https://drive.google.com/file/d/1U59K-W4Z_MVYtHJ7uEH34qHvNrx4Dhg4/view" },
      { t: "OX 총론 3회 소추조건, 범죄의 종류, 법인의 범죄능력", k: "문제", s: "26.09.14 · 형사법 올인원 OX 총론 3회 소추조건, 범죄의 종류, 법인의 범죄능력 (문제)", u: "https://drive.google.com/file/d/1DHhfWtX14b6P-sCfPlOoTlw0e-hijXXm/view" },
      { t: "OX 총론 4회 부작위범, 인과관계, 구성요건적고의", k: "문제", s: "26.09.14 · 형사법 올인원 OX 총론 4회 부작위범, 인과관계, 구성요건적고의 (문제)", u: "https://drive.google.com/file/d/1aO9OvhYydzVwzIgwBKGxF_LYQ7Dnp21Y/view" },
      { t: "위클리 테스트 총론 1회 형법서론 범죄의 종류", k: "문제", s: "26.09.14 · 형사법 올인원 위클리 테스트 총론 1회 형법서론 범죄의 종류 (문제)", u: "https://drive.google.com/file/d/1Im_qRQl7RG5MqdcFgwvuvqwXxQb1aKCA/view" },
      { t: "OX 총론 5회 구성요건적 고의 결과적 가중범", k: "문제", s: "26.09.15 · 형사법 올인원 OX 총론 5회 구성요건적 고의 결과적 가중범 (문제)", u: "https://drive.google.com/file/d/1S4yDYqAXNRYOoU6HEROPYB84vxVeSV8z/view" },
      { t: "OX 총론 6회 진정 결과적 가중범 피해자의 승낙", k: "문제", s: "26.09.15 · 형사법 올인원 OX 총론 6회 진정 결과적 가중범 피해자의 승낙 (문제)", u: "https://drive.google.com/file/d/1G1pIL1EPWJ794U-dz9XKFm76nj_rZoV7/view" },
      { t: "위클리 테스트 총론 2회 범죄능력 구성요건적 착오", k: "문제", s: "26.09.15 · 형사법 올인원 위클리 테스트 총론 2회 범죄능력 구성요건적 착오 (문제)", u: "https://drive.google.com/file/d/1wUEjofGd-DWfOAhVuKy0bjljChoE0ihv/view" },
      { t: "OX 총론 7회 상당성 반무의식상태설", k: "문제", s: "26.09.21 · 형사법 올인원 OX 총론 7회 상당성 반무의식상태설 (문제)", u: "https://drive.google.com/file/d/1GlqQKXMPhZMbjitLT0L46JZx-bkkeDEx/view" },
      { t: "위클리 테스트 총론 3회 과실범 피해자의 승낙", k: "문제", s: "26.09.21 · 형사법 올인원 위클리 테스트 총론 3회 과실범 피해자의 승낙 (문제)", u: "https://drive.google.com/file/d/1WnqcgkUMhU1PairNJZXRRawozhaCWdDu/view" },
      { t: "OX 총론 8회 오인에정당한이유가있는때 장애미수", k: "문제", s: "26.09.28 · 형사법 올인원 OX 총론 8회 오인에정당한이유가있는때 장애미수 (문제)", u: "https://drive.google.com/file/d/16cy_sGPbs5KAyTldS7R1zq83Jsl-lHrR/view" },
      { t: "위클리 테스트 총론 4회 정당행위~공범과 신분", k: "문제", s: "26.09.28 · 형사법 올인원 위클리 테스트 총론 4회 정당행위~공범과 신분 (문제)", u: "https://drive.google.com/file/d/1HhtJnXW2R4eoHJUqsSQYquR6Am904kiI/view" },
      { t: "OX 총론 9회 불능미수 공동의 실행행위", k: "문제", s: "26.09.29 · 형사법 올인원 OX 총론 9회 불능미수 공동의 실행행위 (문제)", u: "https://drive.google.com/file/d/1RzVtQsT318yaCJIJS1c0qqEjlSca1aYk/view" },
      { t: "OX 총론 10회 합동범과 동시범 공범과 신분", k: "문제", s: "26.10.05 · 형사법 올인원 OX 총론 10회 합동범과 동시범 공범과 신분 (문제)", u: "https://drive.google.com/file/d/1hAVz0lvSNmAou0JnPQ4DSjHE1nW89waN/view" },
      { t: "OX 총론 11회 죄수론", k: "문제", s: "26.10.06 · 형사법 올인원 OX 총론 11회 죄수론(문제)", u: "https://drive.google.com/file/d/1LCg38l5NP5NXZwFF1ZU-lVjO69ecXRwg/view" },
      { t: "OX 총론 12회 형벌론", k: "문제", s: "26.10.05 · 형사법 올인원 OX 총론 12회 형벌론 (문제)", u: "https://drive.google.com/file/d/1GQ6d3D7rBQyerr9WlpECkQvv4LPw_XJ9/view" },
      { t: "OX 총론 1회 법률주의 유추해석금지원칙", k: "정답", s: "26.09.07 · 형사법 올인원 OX 총론 1회 법률주의 유추해석금지원칙 (정답)", u: "https://drive.google.com/file/d/1U_MzWQegkyZum4N--YCQJ5MNtWpZGvZk/view" },
      { t: "OX 총론 2회 소급효금지원칙 보호주의에의한보충", k: "정답", s: "26.09.08 · 형사법 올인원 OX 총론 2회 소급효금지원칙 보호주의에의한보충 (정답)", u: "https://drive.google.com/file/d/1rfvWnV_xXPw0S60p7M-KkOtx7Pts2Fjx/view" },
      { t: "OX 총론 3회 소추조건, 범죄의 종류, 법인의 범죄능력", k: "정답", s: "26.09.14 · 형사법 올인원 OX 총론 3회 소추조건, 범죄의 종류, 법인의 범죄능력 (정답)", u: "https://drive.google.com/file/d/1dpZTZ2ch201mGsnY4qzn82pV4_vSjpeO/view" },
      { t: "OX 총론 4회 부작위범, 인과관계, 구성요건적고의", k: "정답", s: "26.09.14 · 형사법 올인원 OX 총론 4회 부작위범, 인과관계, 구성요건적고의 (정답)", u: "https://drive.google.com/file/d/1x5449MGl2dxEL449_RXviWGdSsLzsaie/view" },
      { t: "OX 총론 5회 구성요건적 고의 결과적 가중범", k: "정답", s: "26.09.15 · 형사법 올인원 OX 총론 5회 구성요건적 고의 결과적 가중범 (정답)", u: "https://drive.google.com/file/d/1HUC0PZr9UUVmQ-r2-ILHmQ7I7ZbUmoWW/view" },
      { t: "OX 총론 6회 진정 결과적 가중범 피해자의 승낙", k: "정답", s: "26.09.15 · 형사법 올인원 OX 총론 6회 진정 결과적 가중범 피해자의 승낙 (정답)", u: "https://drive.google.com/file/d/1NCaLLXS3SUjFgh2OFNsq45mzuIPJNW_A/view" },
      { t: "OX 총론 7회 상당성 반무의식상태설", k: "정답", s: "26.09.21 · 형사법 올인원 OX 총론 7회 상당성 반무의식상태설 (정답)", u: "https://drive.google.com/file/d/1DnbN3RW_oLiesqGF9LCFxjxc0_qzx_Kg/view" },
      { t: "OX 총론 8회 오인에정당한이유가있는때 장애미수", k: "정답", s: "26.09.28 · 형사법 올인원 OX 총론 8회 오인에정당한이유가있는때 장애미수 (정답)", u: "https://drive.google.com/file/d/1feMji0TK-d_l2AqigfuQ-slVoqQMjmGt/view" },
      { t: "OX 총론 9회 불능미수 공동의 실행행위", k: "정답", s: "26.09.29 · 형사법 올인원 OX 총론 9회 불능미수 공동의 실행행위 (정답)", u: "https://drive.google.com/file/d/1SjP3ttR-QWw0RaikBFHTvUGLc22nGfe-/view" },
      { t: "OX 총론 10회 합동범과 동시범 공범과 신분", k: "정답", s: "26.10.05 · 형사법 올인원 OX 총론 10회 합동범과 동시범 공범과 신분 (정답)", u: "https://drive.google.com/file/d/1zNqS1RAdBeJOZfq8Kc1_JjxSeF7Qm5fi/view" },
      { t: "위클리 테스트 총론 1회 형법서론 범죄의 종류", k: "해설", s: "26.09.14 · 형사법 올인원 위클리 테스트 총론 1회 형법서론 범죄의 종류 (해설)", u: "https://drive.google.com/file/d/1KljpdXKR8gVCd1ID-JFQf5x63VPEDWtw/view" },
      { t: "위클리 테스트 총론 2회 범죄능력 구성요건적 착오", k: "해설", s: "26.09.15 · 형사법 올인원 위클리 테스트 총론 2회 범죄능력 구성요건적 착오 (해설)", u: "https://drive.google.com/file/d/18QORBZN10oinnwgdfYw_JdyCJ5Js62U_/view" },
      { t: "위클리 테스트 총론 3회 과실범 피해자의 승낙", k: "해설", s: "26.09.21 · 형사법 올인원 위클리 테스트 총론 3회 과실범 피해자의 승낙 (해설)", u: "https://drive.google.com/file/d/1FVrSo22LtHKsMk5MOcUsLRH-h6VwQosL/view" },
      { t: "위클리 테스트 총론 4회 정당행위~공범과 신분", k: "해설", s: "26.09.28 · 형사법 올인원 위클리 테스트 총론 4회 정당행위~공범과 신분 (해설)", u: "https://drive.google.com/file/d/1VUra8UpDuoCHuqM6Y7Pl8iOYb7uZy00U/view" },
      { t: "OX 총론 11회 죄수론", k: "해설", s: "26.10.06 · 형사법 올인원 OX 총론 11회 죄수론(해설)", u: "https://drive.google.com/file/d/1-B_zCobltN3DmX93ZpC4BPxGRRferVj7/view" },
      { t: "OX 총론 12회 형벌론", k: "해설", s: "26.10.05 · 형사법 올인원 OX 총론 12회 형벌론 (해설)", u: "https://drive.google.com/file/d/13eZ-jbFcP3tcgNveEjJ63GobRnnmvBXS/view" },
      { t: "2026 기본서 총론 개정판 교재 수정사항", k: "추록", s: "26.09.07 · 형사법 2026 기본서 총론 개정판 교재 수정사항", u: "https://drive.google.com/file/d/1LT3_jLTMQxRy29c_yfKJPzOLVCND4Snu/view" },
      { t: "26년 9월 형사법 올인원 강의계획서(총론, 수사증거)", k: "계획서", s: "26.09.07 · 형사법 26년 9월 형사법 올인원 강의계획서(총론, 수사증거)", u: "https://drive.google.com/file/d/1SvAFMQ9JEvsODWqzsArRwsZDArPHrEr9/view" },
      { t: "26년 9월 형사법 올인원 개강자료 - 구속영장 압수수색영장 수사과정확인서 피의", k: "계획서", s: "26.09.07 · 형사법 26년 9월 형사법 올인원 개강자료 - 구속영장 압수수색영장 수사과정확인서 피의자신문조서", u: "https://drive.google.com/file/d/1c1VZ7bbnMi48SLmYHfrtei2BW4IRi0TY/view" },
      { t: "26년 9월 형사법 올인원 개강자료 - 단권화요령 (칼라인쇄)", k: "계획서", s: "26.09.07 · 형사법 26년 9월 형사법 올인원 개강자료 - 단권화요령 (칼라인쇄)", u: "https://drive.google.com/file/d/1ne9hRDDAHVD103787-MOvN5xkM3F-3Au/view" },
    ] },
    { sub: "형사법 · 신광은 형법각론", rows: [
      { t: "OX 각론 1회(살인죄~학대죄)", k: "문제", s: "26.11.10 · 형사법 올인원 OX 각론 1회(살인죄~학대죄)(문제)", u: "https://drive.google.com/file/d/1dTbNce9XibVehyU22EKjlq0xD2CqA0Zc/view" },
      { t: "OX 각론 2회(협박죄~미성년자·심신미약자 간음·추행죄)", k: "문제", s: "26.11.10 · 형사법 올인원 OX 각론 2회(협박죄~미성년자·심신미약자 간음·추행죄)(문제)", u: "https://drive.google.com/file/d/178HNKpP56sCIYfeKBwBRM_YKjrbVgi9u/view" },
      { t: "위클리 테스트 각론 1회(살인죄~강간강제추행죄)", k: "문제", s: "26.11.10 · 형사법 올인원 위클리 테스트 각론 1회(살인죄~강간강제추행죄)(문제)", u: "https://drive.google.com/file/d/1UBMQ1wn_8uFRQsivEOmzYHsn84cWz0ot/view" },
      { t: "OX 각론 3회(명예에 관한 죄~주거침입죄)", k: "문제", s: "26.11.16 · 형사법 올인원 OX 각론 3회(명예에 관한 죄~주거침입죄)(문제)", u: "https://drive.google.com/file/d/10ItEV6q2onxIOZ7C55MX56hEUcehPGsF/view" },
      { t: "위클리 테스트 각론 2회(명예죄~퇴거불응죄)", k: "문제", s: "26.11.16 · 형사법 올인원 위클리 테스트 각론 2회(명예죄~퇴거불응죄)(문제)", u: "https://drive.google.com/file/d/1Cso3gDlt9Cn5w0x574FSxBQZBnPra6Hi/view" },
      { t: "OX 각론 1회(살인죄~학대죄)", k: "정답", s: "26.11.10 · 형사법 올인원 OX 각론 1회(살인죄~학대죄)(정답)", u: "https://drive.google.com/file/d/1Ulei5nCuL_qlyt9VX4_Fhqx1eA_E2xqI/view" },
      { t: "OX 각론 2회(협박죄~미성년자·심신미약자 간음·추행죄)", k: "정답", s: "26.11.10 · 형사법 올인원 OX 각론 2회(협박죄~미성년자·심신미약자 간음·추행죄)(정답)", u: "https://drive.google.com/file/d/19vpxZb1p-noWXSOKheZmwTpkh-Wy1aHu/view" },
      { t: "OX 각론 3회(명예에 관한 죄~주거침입죄)", k: "정답", s: "26.11.16 · 형사법 올인원 OX 각론 3회(명예에 관한 죄~주거침입죄)(정답)", u: "https://drive.google.com/file/d/1CEXD0GcFvr-SEF7hOY7v7GTgDntf_RNu/view" },
      { t: "위클리 테스트 각론 1회(살인죄~강간강제추행죄)", k: "해설", s: "26.11.10 · 형사법 올인원 위클리 테스트 각론 1회(살인죄~강간강제추행죄)(해설)", u: "https://drive.google.com/file/d/1teWWXJKUeoaldIQ8zpAgPH0mX9n_4LGO/view" },
      { t: "위클리 테스트 각론 2회(명예죄~퇴거불응죄)", k: "해설", s: "26.11.16 · 형사법 올인원 위클리 테스트 각론 2회(명예죄~퇴거불응죄)(해설)", u: "https://drive.google.com/file/d/1swbAiwdwV-7s_EhrWEl1l01QrZF-9xcK/view" },
      { t: "26년 11월 형사법 올인원 강의계획서 [형법 각론]", k: "계획서", s: "26.11.10 · 26년 11월 형사법 올인원 강의계획서 [형법 각론]", u: "https://drive.google.com/file/d/1v62oOHkoBAj_hTOhSY5PTAkfyxKeTcyx/view" },
    ] },
    { sub: "형사법 · 신광은 형소법·수사·증거", rows: [
      { t: "OX 수사 8회(불기소처분에 대한 불복~거증책임)", k: "문제", s: "26.02.03 · 형사법 올인원 OX 수사 8회(불기소처분에 대한 불복~거증책임)(문제)", u: "https://drive.google.com/file/d/1Sthmh6G7aZ2O8jkv0NvbHu0iqWDOu5Rl/view" },
      { t: "OX 증거 9회(증거능력관련문제~전문증거)", k: "문제", s: "26.02.05 · 형사법 올인원 OX 증거 9회(증거능력관련문제~전문증거)(문제)", u: "https://drive.google.com/file/d/1ScwlRZ0pA1INipJ1-0Yhaezo5FRlbdDL/view" },
      { t: "위클리 테스트 5회(경찰의수사종결~진술조서적용범위)", k: "문제", s: "26.02.10 · 형사법 올인원 위클리 테스트 5회(경찰의수사종결~진술조서적용범위)(문제)", u: "https://drive.google.com/file/d/1RNlTCEIjhkGHK3IYXxqbjmSaOjAdetLH/view" },
      { t: "위클리 테스트 6회(진술조서 증거능력 인정범위~증거 끝)", k: "문제", s: "26.02.18 · 형사법 올인원 위클리 테스트 6회(진술조서 증거능력 인정범위~증거 끝)(문제)", u: "https://drive.google.com/file/d/1IW8sh4v5hutrBZVc3mS26kCdxSZ_3My6/view" },
      { t: "OX 증거 10회(전문법칙의예외이론~참고하기)", k: "문제", s: "26.02.06 · 형사법 올인원 OX 증거 10회(전문법칙의예외이론~참고하기)(문제)", u: "https://drive.google.com/file/d/17SOtctg_g4giPCrnl3BPFKksZnLCo99s/view" },
      { t: "OX 증거 11회(314조~동의의주체와상대방)", k: "문제", s: "26.02.10 · 형사법 올인원 OX 증거 11회(314조~동의의주체와상대방)(문제)", u: "https://drive.google.com/file/d/1nx6SAo7ApoZ0K5t_PZRXH1J06SqnixCP/view" },
      { t: "OX 증거 12회(자유심증주의~공판조서의 증명력)", k: "문제", s: "26.02.12 · 형사법 올인원 OX 증거 12회(자유심증주의~공판조서의 증명력)(문제)", u: "https://drive.google.com/file/d/1bfjpDPC9nJja30-4opZKr3_wGC-9Vwhv/view" },
      { t: "OX 수사 8회(불기소처분에 대한 불복~거증책임)", k: "정답", s: "26.02.03 · 형사법 올인원 OX 수사 8회(불기소처분에 대한 불복~거증책임)(정답)", u: "https://drive.google.com/file/d/1w9dVlUMopsI-vD-KqLDq96Lx-nXnF-BO/view" },
      { t: "OX 증거 9회(증거능력관련문제~전문증거)", k: "정답", s: "26.02.05 · 형사법 올인원 OX 증거 9회(증거능력관련문제~전문증거)(정답)", u: "https://drive.google.com/file/d/1xAvaf2xqR1oJOLqJ4IGOAiXhNqsDN6KN/view" },
      { t: "OX 증거 10회(전문법칙의예외이론~참고하기)", k: "정답", s: "26.02.06 · 형사법 올인원 OX 증거 10회(전문법칙의예외이론~참고하기)(정답)", u: "https://drive.google.com/file/d/1gs3LXwxrBiJObDs7nP9HAJmv1aSk2KBa/view" },
      { t: "OX 증거 11회(314조~동의의주체와상대방)", k: "정답", s: "26.02.10 · 형사법 올인원 OX 증거 11회(314조~동의의주체와상대방)(정답)", u: "https://drive.google.com/file/d/1tnIQ36SMSlprI0Iu4HnFVExAPg-l0PSj/view" },
      { t: "OX 증거 12회(자유심증주의~공판조서의 증명력)", k: "정답", s: "26.02.12 · 형사법 올인원 OX 증거 12회(자유심증주의~공판조서의 증명력)(정답)", u: "https://drive.google.com/file/d/1DGaGUnGrbDJyQDEkC3am1erBo8M7Y2zT/view" },
      { t: "위클리 테스트 5회(경찰의수사종결~진술조서적용범위)", k: "해설", s: "26.02.10 · 형사법 올인원 위클리 테스트 5회(경찰의수사종결~진술조서적용범위)(해설)", u: "https://drive.google.com/file/d/1eXaCpGIubgkk8YUsxxKBrzCxVXUlx7PL/view" },
      { t: "위클리 테스트 6회(진술조서 증거능력 인정범위~증거 끝", k: "해설", s: "26.02.18 · 형사법 올인원 위클리 테스트 6회(진술조서 증거능력 인정범위~증거 끝(해설)", u: "https://drive.google.com/file/d/1_qQnF9fldNZo1byuIbRBj8LBy3E9gK0-/view" },
    ] },
  ];   /* 통합 시험지는 헌법 1~20번을 뺀 편집본 링크만 넣었다 · 자료실은 지금 고른 과목 것만 보여준다 */

  /* ============================================================
     2026-11-17 개편 모듈
     · P 사용처(힌트권·출석 방패·보상 게이지)
     · '내가 배운 진도까지만' 출제 필터 통일
     · 10초 암기 카드 · 핵심 빈칸 채우기 · 보스 문제
     · 암기·자료 탭 (카드 / G-POINT 표 / 자료실)
     ============================================================ */
  var HINT_COST = 30, SHIELD_COST = 80, BOSS_BONUS = 30;

  function xpAvail() { return Math.max(0, (S.xp || 0) - (S.xpSpent || 0)); }
  function spendXp(n) {
    if (xpAvail() < n) return false;
    S.xpSpent = (S.xpSpent || 0) + n;
    save(); renderHud();
    return true;
  }

  /* ---------- 진도 범위 판정: 체크한 강의·G-POINT가 덮는 문제은행만 ---------- */
  var scopeCache = null;
  function scopeKeys() {
    if (scopeCache) return scopeCache;
    var set = {};
    D.subjects.forEach(function (s) {
      s.courses.forEach(function (c) {
        var nums = checkedNums(c.id);
        if (!nums.length) return;
        if (isGP(c)) {
          nums.forEach(function (n) { set['g:' + c.id + ':' + n] = 1; });
          return;
        }
        nums.forEach(function (n) {
          var ui = unitIndex(c.id, n);
          if (ui < 0) return;
          var banks = c.units[ui].bs || [[c.id, ui]];
          banks.forEach(function (b) { set['b:' + b[0] + ':' + b[1]] = 1; });
        });
      });
    });
    scopeCache = set;
    return set;
  }
  function inScope(q) {
    if (!q) return false;
    var set = scopeKeys();
    if (q.gp) return !!set['g:' + q.c + ':' + q.gp];
    return !!set['b:' + q.c + ':' + q.u];
  }
  function scopeQPool(sid) {
    return D.questions.filter(function (q) { return (!sid || q.s === sid) && inScope(q); });
  }
  function allScopePool() { return scopeQPool(null); }
  /* 체크한 진도가 0인 과목의 예외: 그 강좌 첫 단원(1강 입문) 문제만 */
  function beginnerPool(sid) {
    var out = [];
    (sid ? [SUBJ[sid]] : D.subjects).forEach(function (s) {
      var c = COURSE[S.course[s.id]] || s.courses[0];
      if (!c || isGP(c)) return;
      poolForUnit(c.id, 0).forEach(function (q) { if (q.s === s.id) out.push(q); });
    });
    return out;
  }
  function subjectPool(sid) {
    var p = scopeQPool(sid);
    if (p.length) return { pool: p, beginner: false };
    return { pool: beginnerPool(sid), beginner: true };
  }

  /* ---------- 오늘의 암기 한 줄 ---------- */
  function gpRowOf(n) {
    for (var i = 0; i < GP_TABLE.length; i++) {
      var rows = GP_TABLE[i].rows;
      for (var j = 0; j < rows.length; j++) if (Number(rows[j][0]) === n) return { g: GP_TABLE[i].g, r: rows[j] };
    }
    return null;
  }
  function clip(s, n) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }
  function seedOf(str) {
    var h = 7;
    for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 99991;
    return h;
  }
  function memoLine() {
    var t = todayStr(), sid = S.subj, s = SUBJ[sid];
    if (!s) return '';
    if (sid === 'gtelp') {
      var rows = [];
      checkedNums('gtp33').sort(function (a, b) { return a - b; }).forEach(function (n) {
        var g = gpRowOf(n);
        if (g) rows.push('G-POINT ' + n + ' · ' + g.r[2]);
      });
      if (!rows.length) return 'G-POINT를 체크하면 오늘 외울 공식이 여기 나와요.';
      return rows[seedOf(t + sid) % rows.length];
    }
    var sp = subjectPool(sid);
    if (!sp.pool.length) return '강의를 체크하면 오늘 외울 한 줄이 여기 나와요.';
    var start = seedOf(t + sid) % sp.pool.length;
    var q = null, b = null;
    for (var k = 0; k < sp.pool.length && k < 12; k++) {
      var cand = sp.pool[(start + k) % sp.pool.length];
      var cb = blankOf(cand);
      if (cb && cb.key) { q = cand; b = cb; break; }
    }
    if (!q) {
      q = sp.pool[start];
      var un0 = clip(unitName(q.c, q.u) || s.name, 14);
      return '『' + un0 + '』 ' + clip(String(expLine(q, '풀이') || q.e || q.q).replace(/^\[?[^\]]*\]?\s*/, ''), 44);
    }
    var un = clip(unitName(q.c, q.u) || s.name, 14);
    return '『' + un + '』 ' + b.key;
  }

  /* ---------- 카드/빈칸 재료 ---------- */
  /* 경찰 과목 암기카드: 15줄짜리 4지선다 지문을 통째로 넣지 않고
     OX 판례문장 · 조문·판례 핵심문장(빈칸) · ㄱㄴㄷㄹ 항목별 요지를 짧게 꺼낸다 */
  var MARK_RE = /[㉠-㉩](?=\s)/g;
  function stripBoiler(s) {
    return String(s || '').replace(/\(다툼이 있는 경우[^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  }
  function clipSent(s, n) {
    s = stripBoiler(s);
    if (s.length <= n) return s;
    var cut = s.slice(0, n);
    var m = cut.match(/^[\s\S]*[.!?]\s*/);
    if (m && m[0].trim().length >= n * 0.45) return m[0].trim();
    return cut.replace(/[\s,·ㆍ.!?\-]+$/, '') + '…';
  }
  function cardFront(s) { return String(s || '').replace(/^…\s*/, '').replace(/\s+/g, ' ').trim(); }
  function splitByMarker(s) {
    var str = String(s || ''), out = [], last = null, from = 0, m;
    MARK_RE.lastIndex = 0;
    while ((m = MARK_RE.exec(str))) {
      if (last) out.push({ m: last, t: str.slice(from + 1, m.index).trim() });
      last = m[0]; from = m.index;
    }
    if (last) out.push({ m: last, t: str.slice(from + 1).trim() });
    return out.filter(function (x) { return x.t.length > 12; });
  }
  function policeCards(q) {
    var out = [], tag = SUBJ[q.s].name + ' · ' + clip(unitName(q.c, q.u) || SUBJ[q.s].name, 14);
    var ans = String(q.o[q.a] || '').trim();
    if (q.o.length === 2) {           /* OX 판례·조문 문장 */
      var v = /^O/.test(ans) ? '⭕ O (옳다)' : /^X/.test(ans) ? '❌ X (옳지 않다)' : '';
      var st = clipSent(q.q, 104);
      if (st) out.push({ id: 'q-' + q.i, tag: tag, front: '⭕/❌ ' + cardFront(st), back: v || clipSent(q.e, 96) });
      return out;
    }
    var items = splitByMarker(q.q);
    if (items.length >= 2) {          /* ㄱ, ㄴ, ㄷ, ㄹ 항목별 카드 */
      var segs = {};
      splitByMarker(q.e).forEach(function (s) { if (!segs[s.m]) segs[s.m] = s.t; });
      items.forEach(function (it) {
        var ex = segs[it.m] || '';
        var mm = ex.match(/\(([OX])\)/);
        var back = (mm ? (mm[1] === 'O' ? '⭕ O · ' : '❌ X · ') : '') + clipSent(ex.replace(/\([OX]\)/g, ''), 96);
        out.push({
          id: 'q-' + q.i + it.m, tag: tag,
          front: it.m + ' ' + cardFront(clipSent(it.t, 96)),
          back: back || clipSent(q.e, 96)
        });
      });
      return out;
    }
    var b = blankOf(q);              /* 판례·조문 핵심문장 빈칸 카드 */
    if (b) {
      out.push({ id: 'q-' + q.i, tag: tag, front: cardFront(clipSent(b.text, 104)), back: (b.key || '') + (b.note ? ' · ' + clipSent(b.note, 80) : '') });
      return out;
    }
    out.push({ id: 'q-' + q.i, tag: tag, front: cardFront(clipSent(q.q, 104)), back: clipSent(ans || q.e, 96) });
    return out;
  }
  function cardDeck() {
    var sid = S.subj, out = [], sp = subjectPool(sid);
    if (sid === 'gtelp') {
      var nums = checkedNums('gtp33').sort(function (a, b) { return a - b; });
      if (!nums.length) nums = [1];
      nums.forEach(function (n) {
        var g = gpRowOf(n);
        if (!g) return;
        out.push({ id: 'gp' + n, tag: '지텔프 · G-POINT ' + n, front: g.r[1], back: g.r[2], note: g.tip || '' });
      });
      return { cards: out, beginner: false };
    }
    var seen = {};
    sp.pool.forEach(function (q) {
      policeCards(q).forEach(function (c) {
        if (seen[c.front]) return;
        seen[c.front] = 1;
        out.push(c);
      });
    });
    return { cards: out, beginner: sp.beginner };
  }

  var BLANK_STOP = {
    '한다': 1, '된다': 1, '이다': 1, '있다': 1, '없다': 1, '하다': 1, '것이다': 1, '대한': 1, '위한': 1,
    '관한': 1, '따라': 1, '경우': 1, '때문': 1, '그리고': 1, '또는': 1, '및': 1, '등': 1, '수': 1,
    '것': 1, '자': 1, '바': 1, '때': 1, '위해': 1, '하여': 1, '되어': 1, '하지': 1, '있는': 1, '없는': 1,
    '같은': 1, '다른': 1, '모든': 1, '대하여': 1, '대해': 1, '그': 1, '이': 1, '저': 1, '더': 1
  };
  /* 빈칸 핵심어: '명사'로 끝나는 말만 채택 (동사·부사·조사형은 버린다) */
  var STRONG_END = /(성|권|죄|법|규|칙|관|계|원|청|부|처|소|장|론|책|임|벌|범|형|질|설|제|국|표|안|금|액|율|항|조|절|령|적|자|비|력|투|칙|령|원칙|주의|제도|행위|개념|의무|책임|관계|자유|평등|비례|신뢰|조서|증서|문서|규범|법령|질서)$/;
  var BAD_END2 = /(이다|한다|된다|있다|없다|하다|라고|하고자|고자|하면서|하며|하고|되고|되어|하여|으로서|로서|로써|에서|부터|까지|보다|처럼|대로|만큼)$/;
  function keyTokenIdx(toks, explain) {
    var best = -1, bs = 0, ex = String(explain || '');
    toks.forEach(function (w, i) {
      var c = w.replace(/^[「『(\[]+/, '').replace(/[.,;:!?'"”’)\]}】]+$/g, '');
      if (c.length < 3 || c.length > 12) return;
      if (!/^[가-힣]/.test(c)) return;
      if (/[「」『』()（）\[\]{}"'“”]/.test(c)) return;
      if (BLANK_STOP[c]) return;
      if (BAD_END2.test(c)) return;
      if (/(은|는|이|가|을|를|의|에|로|와|과|도|만|서|써|께)$/.test(c)) return;
      var strong = STRONG_END.test(c) || c.indexOf('·') >= 0;
      var inEx = ex && ex.indexOf(c) >= 0;
      if (!strong) return;
      var sc = c.length + (inEx ? 5 : 0) + (c.indexOf('·') >= 0 ? 2 : 0);
      if (sc > bs) { bs = sc; best = i; }
    });
    return bs >= 4 ? best : -1;
  }
  function blankFromText(src) {
    var toks = String(src || '').split(/\s+/).filter(Boolean);
    if (toks.length < 4) return null;
    var bi = keyTokenIdx(toks, '');
    if (bi < 0) return null;
    var key = toks[bi].replace(/^[「『(\\[]+/, '').replace(/[.,;:!?'"”’)\]}】]+$/g, '');
    if (key.length < 3) return null;
    var from = Math.max(0, bi - 9), to = Math.min(toks.length, bi + 10);
    var text = (from ? '… ' : '') + toks.slice(from, bi).join(' ') + ' ( ____ )';
    var tail = toks.slice(bi + 1, to).join(' ');
    if (tail) text += ' ' + tail;
    if (to < toks.length) text += ' …';
    return { text: text.trim(), key: key };
  }
  function expSentences(e) {
    var raw = String(e || '').replace(/\s+/g, ' ');
    raw = raw.replace(/다\.\s/g, '다.|').replace(/[.。]\s/g, '.|');
    return raw.split('|').map(function (x) { return x.trim(); }).filter(function (x) {
      if (x.length < 12 || x.length > 220) return false;
      if (/(적중모의고사|모의고사|난이도|켈리 카페|해설\s*:|출처|저작권)/.test(x)) return false;
      if (/^(해석|풀이|오답|원문)\s*[:：]/.test(x)) return false;   /* 보강 해설의 라벨 줄은 빈칸·카드 재료로 쓰지 않는다 */
      var digits = (x.match(/[0-9]/g) || []).length;
      if (digits / x.length > 0.22) return false;
      return true;
    });
  }
  function blankOf(q) {
    var tag = SUBJ[q.s].name + ' · ' + clip(unitName(q.c, q.u) || '', 14);
    var ans = String(q.o[q.a] || '');
    var b = blankFromText(ans);
    if (b) return { id: q.i, key: b.key, text: b.text, tag: tag, full: ans, note: clip(q.e, 110), from: '정답 지문' };
    var ss = expSentences(q.e);
    for (var i = 0; i < ss.length; i++) {
      var b2 = blankFromText(ss[i]);
      if (b2) {
        var triv = /^[OX]\s*[(（]/.test(ans) || ans.length < 8;
        return { id: q.i, key: b2.key, text: b2.text, tag: tag, full: ss[i], note: triv ? '' : ('정답 · ' + clip(ans, 90)), from: '해설' };
      }
    }
    return null;
  }
  function blankDeck() {
    var sid = S.subj, out = [], sp = subjectPool(sid);
    if (sid === 'gtelp') {
      var nums = checkedNums('gtp33').sort(function (a, b) { return a - b; });
      if (!nums.length) nums = [1];
      nums.forEach(function (n) {
        var g = gpRowOf(n);
        if (!g) return;
        out.push({ id: 'gp' + n, key: g.r[2], text: 'G-POINT ' + n + ' · ' + g.r[1] + ' → ( ____ )', tag: '지텔프 · G-POINT ' + n, full: g.r[1] + ' → ' + g.r[2], note: g.tip || '' });
      });
      return { blanks: out, beginner: false };
    }
    var seen = {};
    sp.pool.forEach(function (q) {
      var b = blankOf(q);
      if (!b || seen[b.text]) return;
      seen[b.text] = 1;
      out.push(b);
    });
    return { blanks: out, beginner: sp.beginner };
  }

  /* ---------- 보스 문제 ---------- */
  function bossPool(excludeIds) {
    var p = scopeQPool(S.subj).filter(function (q) { return excludeIds.indexOf(q.i) < 0; });
    if (!p.length) p = beginnerPool(S.subj).filter(function (q) { return excludeIds.indexOf(q.i) < 0; });
    p.sort(function (a, b) {
      var wa = (S.wrong[a.i] || {}).c || 0, wb = (S.wrong[b.i] || {}).c || 0;
      var oa = S.qok[a.i] || 0, ob = S.qok[b.i] || 0;
      if (wb !== wa) return wb - wa;
      return oa - ob;
    });
    return p;
  }

  /* ---------- 자주 쓰는 라벨(이름 바꾸기 쉽게 상수화) ---------- */
  var XP_LABEL = 'P';

  /* ---------- G-POINT 표 (모달·탭 공용) ---------- */
  function gpTableHtml(inline) {
    var h = inline ? '<div class="gp-note">조건(힌트)은 <b class="gp-cond">파랑</b>, 정답 공식은 <b class="gp-ans">노랑</b>. 항목을 누르면 그 포인트 켈리 기출이 나와요.</div>' : '';
    if (!inline) {
      h += '<div class="gp-jump">';
      GP_TABLE.forEach(function (grp, gi) {
        h += '<button class="gp-jbtn" data-goto="' + gi + '">' + esc(grp.g) + '</button>';
      });
      h += '</div>';
    }
    GP_TABLE.forEach(function (grp, gi) {
      h += '<div class="gp-group" id="gp-g' + gi + '"><div class="gp-group-h">' + esc(grp.g) + '</div>';
      grp.rows.forEach(function (r) {
        var cnt = gpQuestions(Number(r[0])).length;
        h += '<button class="gp-row" data-gp="' + esc(r[0]) + '">' +
          '<span class="gp-no">' + esc(r[0]) + '</span>' +
          '<span class="gp-cnt' + (cnt ? '' : ' zero') + '">' + (cnt ? '기출 ' + cnt : '기출 없음') + '</span>' +
          '<span class="gp-body"><span class="gp-cond">' + esc(r[1]) + '</span>' +
          '<span class="gp-ans">👉 ' + esc(r[2]) + '</span></span>' +
          '<span class="gp-go">▶</span></button>';
      });
      if (grp.tip) h += '<div class="gp-tip">💡 ' + esc(grp.tip) + '</div>';
      h += '</div>';
    });
    return h;
  }
  function bindGpRows(root) {
    $$('.gp-row', root || document).forEach(function (b) {
      b.onclick = function () { sfx('tap'); startGp(Number(b.getAttribute('data-gp'))); };
    });
  }
  function gpQuestions(n) {
    return D.questions.filter(function (q) { return q.s === 'gtelp' && Number(q.gp) === Number(n); });
  }

  /* ============================================================
     ⚖️ 경찰 과목 조문·숫자·두문자 암기표
     · 2026. 11. 현행 법령 원문(국가법령정보센터)을 직접 확인해 적은 것만 넣는다
     · rows = [조건(파랑), 정답·숫자(노랑), 근거 조문, 두문자·주의]
     ============================================================ */
  var LAW_TABLE = {
    crim: [
      { g: '형벌의 종류와 기간', tip: '형량 숫자는 기간·벌금액·구류/과료 단위까지 함께 외운다', rows: [
        ['형법상 형벌의 종류', '사형·징역·금고·자격상실·자격정지·벌금·구류·과료·몰수 (9종)', '§41',
          '두문자 사·징·금·자·자·벌·구·과·몰'],
        ['징역·금고의 기간', '1개월 이상 30년 이하 (가중하면 50년까지)', '§42', ''],
        ['자격정지의 기간', '1년 이상 15년 이하', '§44①', ''],
        ['구류 / 과료', '구류 1일 이상 30일 미만 / 과료 2천원 이상 5만원 미만', '§46·§47', ''],
        ['벌금의 최저액', '5만원 이상 (감경하면 5만원 미만도 가능)', '§45', '']
      ] },
      { g: '선고유예·집행유예·가석방', tip: '유예기간은 선고유예 2년, 집행유예 1~5년으로 서로 다르다', rows: [
        ['선고유예', '1년 이하 징역·금고·자격정지·벌금 → 유예기간 2년이 지나면 면소 간주', '§59①·§60', '보호관찰은 1년'],
        ['집행유예', '3년 이하 징역·금고 또는 500만원 이하 벌금 → 1년 이상 5년 이하 유예', '§62①', ''],
        ['집행유예 실효', '유예기간 중 고의로 범한 죄로 금고 이상의 실형이 확정된 때', '§63', '취소(§64)와 구별'],
        ['가석방', '무기형 20년 / 유기형은 형기의 1/3이 지난 후', '§72①', ''],
        ['가석방 기간', '무기형 10년 / 유기형은 남은 형기(10년 초과 불가)', '§73의2①', '기간 중 보호관찰'],
        ['형의 시효', '무기 20년 · 10년 이상 15년 · 3년 이상 10년 · 3년 미만 7년 · 벌금·몰수 5년 · 구류·과료 1년', '§78',
          '2023.8.8 개정으로 사형의 형 시효는 폐지']
      ] },
      { g: '죄수·공범', tip: '경합범은 1/2까지 가중, 상상적 경합은 가장 무거운 죄의 형', rows: [
        ['경합범 가중', '가장 무거운 죄의 장기 또는 다액의 1/2까지 (합산한 형기·액수 초과 불가)', '§38①2', ''],
        ['상상적 경합', '가장 무거운 죄에 정한 형으로 처벌', '§40', ''],
        ['공범과 신분', '신분이 없는 자는 보통 형으로 처벌', '§33', '신분이 있는 자는 신분범의 형'],
        ['종범(방조범)', '필요적으로 감경한다', '§32②', '임의적 감경 아님'],
        ['몰수·추징', '제공한 물건 / 생긴 물건 / 그 대가 3종, 몰수 못 하면 가액 추징', '§48', '임의적 몰수']
      ] },
      { g: '수사·증거 숫자 (형사소송법)', tip: '구속기간 10일+10일, 고소기간 6개월은 단골 숫자', rows: [
        ['구속기간', '사법경찰관 10일 / 검사 10일 (각각 그 안에 인치·공소제기)', '§202·§203', '2026.8.4 개정'],
        ['고소기간', '범인을 알게 된 날부터 6개월', '§230①', ''],
        ['공소시효', '사형 25년 · 무기 15년 · 장기 10년 이상 10년 · 장기 10년 미만 7년', '§249①', '장기 5년 미만은 5년'],
        ['사법경찰관 피의자신문조서', '피고인 또는 변호인이 내용을 인정할 때에만 증거로 사용', '§312③', ''],
        ['§314조 예외', '사망·질병·외국거주·소재불명 등 + 특히 신빙할 수 있는 상태', '§314', '두 요건 모두 필요']
      ] },
      { g: '판례·쟁점 비교', tip: '숫자보다 갈리는 지점을 묻는 비교형', rows: [
        ['절도 vs 횡령', '점유가 넘어갔으면 횡령 / 넘어가지 않았으면 절도', '판례 쟁점', '보관자성 판단'],
        ['사기죄 4요건', '기망 → 착오 → 처분행위 → 재산상 손실', '§347', '처분행위 없으면 사기 불성립'],
        ['공무집행방해', '직무집행이 적법할 때 성립 (위법한 직무집행은 방해죄 불성립)', '§136', ''],
        ['정당방위', '현재의 부당한 침해 + 상당한 이유', '§21①', '과잉방위는 감경·면제'],
        ['공동정범', '공동의 의사 + 기능적 행위지배', '§30', '']
      ] }
    ],
    pol: [
      { g: '경찰관 직무집행법 — 숫자', tip: '동행 6시간 · 보호 24시간 · 영치 10일, 세 숫자만 확실히', rows: [
        ['불심검문 동행', '경찰관서에 6시간을 초과하여 머물게 할 수 없다', '§3⑥', '동행은 거절 가능'],
        ['보호조치', '경찰관서에서 보호하는 기간 24시간 초과 금지', '§4⑦', ''],
        ['임시영치', '10일 초과 금지', '§4⑦', '보호와 기간이 다름'],
        ['구호대상자 3호', '정신착란·술취한 자 / 자살 시도자 / 미아·병자·부상자', '§4①', '3호는 본인이 거절하면 제외'],
        ['불심검문 절차', '증표 제시 + 소속·성명, 동행 시 장소·목적·이유 설명', '§3④', '가족·친지 통지, 변호인 권리 고지']
      ] },
      { g: '집회 및 시위에 관한 법률', tip: '신고 720~48시간, 금지통고 48시간, 이의신청 10일', rows: [
        ['옥외집회·시위 신고', '시작하기 720시간 전부터 48시간 전까지', '§6①', ''],
        ['금지 통고', '신고서를 접수한 때부터 48시간 이내', '§8①', ''],
        ['이의 신청', '통고를 받은 날부터 10일 이내 / 재결은 접수 후 24시간 이내', '§9①·②', '']
      ] },
      { g: '행정구제 기간', tip: '심판 90/180, 소송 90/1년 — 숫자 짝으로 외운다', rows: [
        ['행정심판 청구', '처분을 안 날부터 90일 / 처분이 있은 날부터 180일', '행정심판법 §27', ''],
        ['행정소송 제소', '처분을 안 날부터 90일 / 처분이 있은 날부터 1년', '행정소송법 §20', ''],
        ['국가배상 청구', '손해 및 가해자를 안 날부터 3년 / 불법행위가 있은 날부터 10년', '민법 §766 준용', '']
      ] },
      { g: '공무원·징계', tip: '징계 6종은 중징계 4 + 경징계 2로 나눠 외운다', rows: [
        ['징계의 종류', '파면·해임·강등·정직 / 감봉·견책 (6종)', '국가공무원법 §79', '중징계 4 · 경징계 2'],
        ['강등의 효력', '1계급 아래로 내리고 3개월 직무정지, 보수 전액 감', '§80①', ''],
        ['소청심사 청구', '처분사유 설명서를 받은 날부터 30일 이내', '§76①', ''],
        ['경찰 계급', '순경·경장·경사·경위·경감·경정·총경·경무관·치안감·치안정감·치안총감 (11개)', '경찰공무원법', '']
      ] },
      { g: '교통·음주', tip: '0.03%는 처벌선, 0.08%는 면허취소선', rows: [
        ['음주운전 처벌 기준', '혈중알코올농도 0.03% 이상이면 처벌', '도로교통법 §44④', ''],
        ['운전면허 취소', '혈중알코올농도 0.08% 이상', '도로교통법 §93①', '행정안전부령 기준']
      ] }
    ],
    cri: [
      { g: '이론가와 핵심 숫자', tip: '이름 → 숫자 → 항목 순서로 묶어 외운다', rows: [
        ['머튼 아노미이론', '적응양식 5 = 동조·혁신·의례·도피·반항', 'Merton 1938', '두문자 동·혁·의·도·반'],
        ['허쉬 사회유대이론', '4요소 = 애착·전념·참여·신념', 'Hirschi 1969', '두문자 애·전·참·신'],
        ['중화기술이론', '5기술 = 책임부인·가해부인·피해부인·비난자 비난·상위가치 충성', 'Sykes & Matza 1957', '두문자 책·가·피·비·상'],
        ['차별적 접촉이론', '9명제 · 친밀한 집단과의 상호작용으로 범죄를 학습', 'Sutherland 1939', ''],
        ['사회해체론', '동심원 5지대 = 중심업무·전이·주거·침입·통근', 'Shaw & McKay 1942', '해체 3요인 빈곤·이질성·이동'],
        ['비행하위문화', '3하위문화 = 범죄적·갈등적·회피적', 'Cloward & Ohlin 1960', '']
      ] },
      { g: '환경·통제 이론', tip: '요소 개수가 헷갈리면 3·4·5로 나눠 기억', rows: [
        ['일상활동이론', '3요소 = 동기화된 범죄자·적절한 대상·보호자의 부재', 'Cohen & Felson 1979', '두문자 동·대·보'],
        ['자기통제이론', '낮은 자기통제 + 범죄 기회가 만나면 범죄', 'Gottfredson & Hirschi 1990', ''],
        ['CPTED 5원칙', '자연적 감시·영역성 강화·활동의 활성화·접근통제·유지관리', '환경설계', '두문자 자·영·활·접·유'],
        ['일반긴장이론', '긴장 3유형 = 목표 달성 실패·긍정적 자극의 제거·부정적 자극의 제시', 'Agnew 1992', '']
      ] },
      { g: '낙인·생물학·회복', tip: '1차/2차, 재통합/낙인처럼 짝으로 나오는 개념', rows: [
        ['낙인론', '1차 이탈(원인과 무관) → 낙인 → 2차 이탈(정체성화)', 'Lemert', ''],
        ['재통합적 수치', '비행은 수치스럽게 하되 사람은 받아들여 복귀시킴', 'Braithwaite 1989', '낙인적 수치와 반대'],
        ['셸던 체형이론', '외배엽·중배엽·내배엽 (중배엽형이 범죄 많다고 주장)', 'Sheldon', '']
      ] }
    ]
  };
  function lawGroups() {
    return LAW_TABLE[S.subj] || null;
  }
  function lawHtml() {
    var groups = lawGroups(), s = SUBJ[S.subj];
    if (!groups) {
      return '<div class="empty">' + esc(s ? s.name : '이 과목') + '은(는) 조문 암기표를 아직 만들지 않았어요.<br>조문·숫자 암기표는 형사법·경찰학·범죄학 세 과목에 있어요.</div>';
    }
    var h = '<div class="gp-note">조건은 <b class="gp-cond">파랑</b>, 시험에 그대로 나오는 정답·숫자는 <b class="gp-ans">노랑</b>. ' +
      '근거 조문을 함께 적었어요. 법령 숫자는 <b>2026. 11. 현행 원문 확인분</b>, 판례·이론은 표준 교재 기준이에요.</div>';
    h += '<div class="gp-jump">';
    groups.forEach(function (grp, gi) {
      h += '<button class="gp-jbtn" data-lawgoto="' + gi + '">' + esc(grp.g) + '</button>';
    });
    h += '</div>';
    var n = 0;
    groups.forEach(function (grp, gi) {
      h += '<div class="gp-group" id="law-g' + gi + '"><div class="gp-group-h">' + esc(grp.g) + '</div>';
      grp.rows.forEach(function (r) {
        n++;
        h += '<div class="gp-row law-row">' +
          '<span class="gp-no law-no">' + n + '</span>' +
          '<span class="gp-body"><span class="gp-cond">' + esc(r[0]) + '</span>' +
          '<span class="gp-ans">👉 ' + esc(r[1]) + '</span>' +
          (r[3] ? '<span class="law-tip">💡 ' + esc(r[3]) + '</span>' : '') + '</span>' +
          '<span class="law-src">' + esc(r[2] || '') + '</span></div>';
      });
      if (grp.tip) h += '<div class="gp-tip">💡 ' + esc(grp.tip) + '</div>';
      h += '</div>';
    });
    h += '<p class="lib-sub" style="margin-top:10px">근거: 국가법령정보센터 현행 법령 원문(형법·형사소송법·경찰관 직무집행법·집회 및 시위에 관한 법률·국가공무원법·행정심판법·행정소송법·도로교통법) · 범죄학 이론가·연도는 표준 교재 기준.</p>';
    return h;
  }
  function bindLawRows(root) {
    $$('#segLaw .gp-jbtn', root || document).forEach(function (b) {
      b.onclick = function () {
        var t = $('#law-g' + b.getAttribute('data-lawgoto'));
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
        $$('#segLaw .gp-jbtn').forEach(function (x) { x.classList.toggle('on', x === b); });
        sfx('tap');
      };
    });
  }
  /* 표에서 G-POINT를 누르면 그 포인트 켈리 기출을 한 문제씩(직전 문제와 안 겹치게) */
  function startGp(n) {
    var pool = gpQuestions(n);
    if (!pool.length) {
      toast('G-POINT ' + n + '에 연결된 켈리 기출이 아직 없어요 · 같은 단원 문항으로 대신할 수는 있지만, 새 문제를 지어내지는 않아요');
      return;
    }
    var checkedGp = !!ckMap('gtp33')[n];
    if (!checkedGp && !confirm('G-POINT ' + n + '은 아직 체크하지 않은 진도예요.\n이 포인트 기출 ' + pool.length + '문제를 지금 볼까요?')) return;
    /* 직전에 푼 문제는 맨 뒤로 보내고, 나머지 문제를 이어서 전부 출제 */
    var last = (S.gpLast || {})[n];
    var order = pool.slice();
    if (last) {
      var li = -1;
      order.forEach(function (q, i) { if (q.i === last) li = i; });
      if (li >= 0) order = order.slice(li + 1).concat(order.slice(0, li + 1));
    } else {
      var st = seedOf(todayStr() + 'gp' + n) % pool.length;
      order = order.slice(st).concat(order.slice(0, st));
    }
    S.gpLast = S.gpLast || {};
    S.gpLast[n] = order[order.length - 1].i;
    save();
    if ($('#sheet') && !$('#sheet').classList.contains('hidden')) closeSheet();
    var ids = order.map(function (q) { return q.i; });
    startSession('gp', { n: n, ids: ids, title: '지텔프 문법 · 켈리 카페 기출 ' + ids.length + '문제' });
  }

  /* ---------- 📂 자료실 ---------- */
  var LIB_FOLDER = 'https://drive.google.com/drive/folders/1ZqFiCt3iMlGTnpZAA6pOQrAGL3-Ntatk';
  /* 고른 과목(형사법·경찰학·범죄학) 자료만 */
  function libGroups() {
    var nm = SUBJ[S.subj] ? SUBJ[S.subj].name : '';
    return LIB.filter(function (g) { return nm && (g.sub.indexOf(nm) === 0 || g.sub.indexOf('공통') === 0); });
  }
  function libRow(it) {
    var kc = it.k === '해설' ? 'a' : 'q';
    return '<a class="lib-row" href="' + it.u + '" target="_blank" rel="noopener">' +
      '<span class="lw-tag ' + kc + '">' + it.k + '</span>' +
      '<span class="lw-body"><b>' + esc(it.t) + '</b><i>' + esc(it.s) + '</i></span>' +
      '<span class="lw-go">↗</span></a>';
  }
  function libHtml() {
    var s = SUBJ[S.subj];
    var groups = libGroups();
    var h = '<a class="lib-all" href="' + LIB_FOLDER + '" target="_blank" rel="noopener">' +
      '<b>📂 구글 드라이브 폴더 전체 열기</b><i>미래인재경찰 자료실 ↗</i></a>' +
      '<p class="lib-sub">내 드라이브(jinleeda1@gmail.com)에만 있는 파일이라, 폰의 구글 계정이 같아야 바로 열려요. 2026년 2차 통합 시험지는 <b>헌법 1~20번을 뺀 편집본</b>만 올렸어요.</p>';
    if (!groups.length) {
      h += '<div class="lib-group"><div class="lib-gh">' + esc(s ? s.name : '') + ' <span>0개</span></div>' +
        '<p class="lib-sub">' + esc(s ? s.name : '지금 과목') + ' 자료는 아직 없어요. 자료실은 형사법·경찰학·범죄학 강의 자료만 모아 둬요.</p></div>';
      return h;
    }
    var tot = 0, openedSub = 0;
    groups.forEach(function (g) {
      tot += g.rows.length;
      var open = g.sub.indexOf('공통') === 0 || (g.sub.indexOf((s ? s.name : '') + ' · ') === 0 && openedSub++ === 0);
      h += '<details class="lib-group"' + (open ? ' open' : '') + '><summary class="lib-gh">' + esc(g.sub) +
        ' <span>' + g.rows.length + '개</span><i class="lib-chev">▾</i></summary>' +
        '<div class="lib-rows">';
      g.rows.forEach(function (r) { h += libRow(r); });
      h += '</div></details>';
    });
    h += '<p class="lib-sub" style="margin-top:10px">' + esc(s ? s.name : '') + ' 자료 ' + tot + '개 · 원본은 학원 교재 자료라 공개 저장소에는 올리지 않았어요.</p>';
    return h;
  }

  /* ---------- 암기·자료 탭 ---------- */
  var MEMO = { seg: 'card' };
  function openMemo(seg) {
    if (seg) MEMO.seg = seg;
    $$('.tab').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-view') === 'memo'); });
    ['stage', 'review', 'memo', 'stats'].forEach(function (k) {
      var el = $('#view-' + k);
      if (el) el.classList.toggle('hidden', k !== 'memo');
    });
    renderMemo();
    window.scrollTo({ top: 0 });
  }
  function renderMemo() {
    syncMemoSegs();
    $$('#memoSeg .seg-b').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-seg') === MEMO.seg); });
    ['Card', 'Gp', 'Law', 'Lib', 'Phys'].forEach(function (k) {
      var el = $('#seg' + k);
      if (el) el.classList.toggle('hidden', MEMO.seg !== k.toLowerCase());
    });
    var s = SUBJ[S.subj];
    var sp = subjectPool(S.subj);
    $('#memoSub').textContent = s.name + ' · ' + (sp.beginner ? '아직 체크한 진도가 없어 1강 입문 범위로 보여줘요' : '체크한 진도 ' + sp.pool.length + '문제 안에서만 나와요');
    if (MEMO.seg === 'gp') {
      var g = $('#segGp');
      if (!g._built) { g.innerHTML = gpTableHtml(true); g._built = true; bindGpRows(g); }
    }
    if (MEMO.seg === 'law') {
      var w = $('#segLaw');
      if (!w._built) { w.innerHTML = lawHtml(); w._built = true; bindLawRows(w); }
    }
    if (MEMO.seg === 'lib') {
      var l = $('#segLib');
      l.innerHTML = libHtml(); l._built = true;
    }
    if (MEMO.seg === 'phys') {
      var p = $('#segPhys');
      if (!p._built) { p.innerHTML = physHtml(); p._built = true; }
    }
    if (MEMO.seg === 'card') cfPaint();
  }
  /* 서브탭은 과목에 따라 보인다: G-POINT는 지텔프만, 자료실은 경찰 과목만 */
  function syncMemoSegs() {
    var gp = S.subj === 'gtelp';
    $$('#memoSeg .seg-b').forEach(function (b) {
      var seg = b.getAttribute('data-seg');
      var show = (seg === 'gp') ? gp : (seg === 'lib' || seg === 'law') ? !gp : true;
      b.classList.toggle('hidden', !show);
    });
    if (MEMO.seg === 'gp' && !gp) MEMO.seg = 'card';
    if ((MEMO.seg === 'lib' || MEMO.seg === 'law') && gp) MEMO.seg = 'card';
    var gb = $('#gpBtn'), lb = $('#libBtn');
    if (gb) gb.classList.toggle('hidden', !gp);
    if (lb) lb.classList.toggle('hidden', gp);
    syncTopHeight();
  }
  function rebuildMemo() {
    var g = $('#segGp'), l = $('#segLib'), p = $('#segPhys'), w = $('#segLaw');
    if (g) { g._built = false; }
    if (l) { l._built = false; }
    if (p) { p._built = false; }
    if (w) { w._built = false; }
    syncMemoSegs();
    var key = S.subj + '|' + scopeQPool(S.subj).length;
    if (CF.key !== key) { CF.deck = []; CF.key = key; }
    if (!$('#view-memo').classList.contains('hidden')) renderMemo();
  }

  /* ---------- 🃏 10초 암기 카드 ---------- */
  var CF = { deck: [], i: 0, flipped: false, hard: [] };
  function cfStart(deck) {
    if (!deck) {
      var d = cardDeck();
      var cards = d.cards.slice();
      cards.sort(function (a, b) {
        var sa = (S.cards || {})[a.id] === 'hard' ? 0 : 1;
        var sb = (S.cards || {})[b.id] === 'hard' ? 0 : 1;
        return sa - sb;
      });
      deck = shuffle(cards);
    }
    CF.deck = deck; CF.i = 0; CF.flipped = false; CF.hard = [];
    cfPaint();
  }
  function cfPaint() {
    if (!$('#fcard')) return;
    if (!CF.deck.length) cfStart();
    if (!CF.deck.length) {
      $('#cfMeta').textContent = '카드 0장';
      $('#fcTag').textContent = '준비 중';
      $('#fcFront').textContent = '체크한 진도에 카드가 아직 없어요. 강의를 체크해 주세요.';
      $('#fcBack').textContent = '';
      $('#fcard').classList.remove('flipped');
      $('#fcKnown').disabled = true; $('#fcHard').disabled = true;
      return;
    }
    $('#fcKnown').disabled = false; $('#fcHard').disabled = false;
    var card = CF.deck[CF.i];
    $('#cfMeta').textContent = (CF.i + 1) + ' / ' + CF.deck.length + '장';
    $('#fcTag').textContent = card.tag;
    $('#fcFront').textContent = card.front;
    $('#fcBack').innerHTML = esc(card.back) + (card.note ? '<span class="fc-note">' + esc(card.note) + '</span>' : '');
    $('#fcard').classList.toggle('flipped', CF.flipped);
  }
  function cfAnswer(known) {
    var card = CF.deck[CF.i];
    if (!card) return;
    S.cards = S.cards || {};
    S.cards[card.id] = known ? 'ok' : 'hard';
    if (!known) CF.hard.push(card);
    save();
    sfx(known ? 'tap' : 'no');
    CF.i++; CF.flipped = false;
    if (CF.i >= CF.deck.length) {
      if (CF.hard.length) {
        var again = CF.hard.slice();
        CF.deck = shuffle(again); CF.i = 0; CF.hard = [];
        toast('헷갈린 ' + again.length + '장만 다시 돌아와요');
      } else {
        CF.deck = []; cfStart();
        toast('한 바퀴 다 봤어요 · 새 순서로 다시!');
        return;
      }
    }
    cfPaint();
  }

  /* ---------- 🧩 핵심 빈칸 채우기 ---------- */
  var BQ = null;
  function startBlank() {
    var d = blankDeck(), items = d.blanks.slice();
    if (!items.length) {
      toast(d.beginner ? '아직 빈칸으로 만들 문항이 없어요. 강의를 체크해 주세요.' : '배운 진도에 빈칸 문항이 아직 없어요.');
      return;
    }
    var keys = [];
    items.forEach(function (it) { if (keys.indexOf(it.key) < 0) keys.push(it.key); });
    var deck = shuffle(items).slice(0, Math.min(8, items.length));
    deck.forEach(function (it) {
      var others = keys.filter(function (k) { return k !== it.key; });
      var ch = shuffle(others).slice(0, 3);
      it.choices = shuffle(ch.concat([it.key]));
    });
    BQ = { items: deck, i: 0, ok: 0, locked: false, xp: 0, answered: false };
    document.body.style.overflow = 'hidden';
    $('#blank').classList.remove('hidden');
    paintBlank();
  }
  function paintBlank() {
    var it = BQ.items[BQ.i];
    BQ.locked = false; BQ.answered = false;
    $('#bTitle').textContent = '🧩 빈칸 채우기 · ' + it.tag;
    $('#bCount').textContent = (BQ.i + 1) + '/' + BQ.items.length;
    $('#bBar').style.width = (BQ.i / BQ.items.length * 100) + '%';
    var h = '<div class="q-tag">빈칸에 들어갈 말을 골라 주세요</div>';
    h += '<p class="blank-text">' + esc(it.text).replace('( ____ )', '<b class="blk">( ____ )</b>') + '</p>';
    h += '<div class="blank-choices">';
    it.choices.forEach(function (c, i) {
      h += '<button class="blank-c" data-c="' + i + '">' + esc(c) + '</button>';
    });
    h += '</div><div id="bFb" class="blank-fb hidden"></div>';
    $('#bBody').innerHTML = h;
    $('#bBody').scrollTop = 0;
    $$('#bBody .blank-c').forEach(function (b) {
      b.onclick = function () { blankAnswer(b.getAttribute('data-c'), b); };
    });
  }
  function blankAnswer(ci, btn) {
    if (!BQ || BQ.answered) return;
    BQ.answered = true;
    var it = BQ.items[BQ.i];
    var pick = it.choices[Number(ci)];
    var ok = pick === it.key;
    $$('#bBody .blank-c').forEach(function (b) {
      b.disabled = true;
      var v = it.choices[Number(b.getAttribute('data-c'))];
      if (v === it.key) b.classList.add('ok');
    });
    if (!ok) btn.classList.add('no');
    touchStreak();
    var gain = ok ? 8 : 2;
    BQ.xp += gain; S.xp += gain;
    if (S.days[todayStr()]) S.days[todayStr()].xp = (S.days[todayStr()].xp || 0) + gain;
    if (ok) BQ.ok++;
    sfx(ok ? 'ok' : 'no');
    save(); renderHud(); renderQuest(); renderMascot(); renderChallenges(); renderDash();
    var fb = $('#bFb');
    fb.className = 'blank-fb ' + (ok ? 'ok' : 'no');
    fb.innerHTML = '<b>' + (ok ? '정답이에요!' : '아쉬워요 · 정답: ' + esc(it.key)) + '</b>' +
      '<i>원문 · ' + esc(it.full) + '</i>' +
      (it.note ? '<em>' + esc(it.note) + '</em>' : '') +
      '<button class="btn primary wide" id="bNext">' + (BQ.i + 1 >= BQ.items.length ? '결과 보기' : '다음') + '</button>';
    $('#bNext').onclick = function () {
      if (BQ.i + 1 >= BQ.items.length) return finishBlank();
      BQ.i++; paintBlank();
    };
  }
  function finishBlank() {
    var tot = BQ.items.length, ok = BQ.ok, xp = BQ.xp;
    $('#bBar').style.width = '100%';
    $('#bBody').innerHTML = '<div class="summary"><div class="big">🧩</div>' +
      '<h2>' + ok + ' / ' + tot + ' 정답</h2><p>빈칸으로 꺼내 보면 훨씬 오래 남아요</p>' +
      '<div class="rows"><div class="row"><span>얻은 P</span><i>+' + xp + ' ' + XP_LABEL + '</i></div></div>' +
      '<button class="btn primary wide" id="bAgain">한 번 더</button>' +
      '<button class="btn ghost wide" id="bHome">닫기</button></div>';
    $('#bAgain').onclick = function () { closeBlank(); startBlank(); };
    $('#bHome').onclick = function () { closeBlank(); renderAll(); };
  }
  function closeBlank() {
    $('#blank').classList.add('hidden');
    $('#bBody').innerHTML = '';
    document.body.style.overflow = '';
    BQ = null;
  }

  /* ---------- 계급 시트: 포인트 쓰기 ---------- */
  function xpSpendHtml() {
    var xp = S.xp || 0;
    return '<div class="xp-sec">' +
      '<div class="xp-use"><span>🎟️ 힌트권 · ' + HINT_COST + ' ' + XP_LABEL + '</span><span>🛡️ 출석 방패 · ' + SHIELD_COST + ' ' + XP_LABEL + '</span></div>' +
      '<div class="sheet-note" style="margin-top:6px">힌트권은 보기를 지우지 않고, 그 문제의 쟁점(지텔프는 G-POINT 번호와 공식)을 알려줘요 · 한 문제당 1회</div>' +
      '<div class="sheet-note" style="margin-top:8px">쓸 수 있는 ' + XP_LABEL + ' ' + xpAvail() + ' · 누적 ' + xp + ' (계급은 누적으로 올라가요)</div></div>';
  }

  /* ---------- 첫 화면 타일 · 방패 ---------- */
  function renderTiles() {
    var sp = subjectPool(S.subj);
    var t1 = $('#tileAllSub'); if (t1) t1.textContent = (sp.beginner ? '1강 입문 ' : '배운 진도 ') + sp.pool.length + '문제';
    var wn = poolWrong().length;
    var t2 = $('#tileWrongSub'); if (t2) t2.textContent = wn ? '오답 ' + wn + '문제' : '오답 없음';
    var cd = cardDeck().cards.length;
    var t3 = $('#tileCardSub'); if (t3) t3.textContent = cd ? '카드 ' + cd + '장' : '카드 준비 중';
    var bd = blankDeck().blanks.length;
    var t4 = $('#tileBlankSub'); if (t4) t4.textContent = bd ? '빈칸 ' + bd + '문제' : '빈칸 준비 중';
  }
  function shieldGap() {
    var st = S.streak || {}, t = todayStr();
    if (!st.last || st.last === t) return 0;
    return dayDiff(st.last, t);
  }
  function canShield() {
    if (shieldGap() !== 2) return false;
    return !((S.shields || {})[ydayStr()]);
  }
  function renderShield() {
    var el = $('#shieldBar');
    if (!el) return;
    el.classList.toggle('hidden', !canShield());
  }
  function buyShield() {
    if (!canShield()) return;
    if (xpAvail() < SHIELD_COST) { toast('🛡️ 방패에는 ' + SHIELD_COST + ' ' + XP_LABEL + '가 필요해요 · 지금 ' + xpAvail() + ' ' + XP_LABEL); return; }
    if (!spendXp(SHIELD_COST)) return;
    S.shields[ydayStr()] = 1;
    save(); sfx('crown'); confetti(40);
    toast('🛡️ 어제 불꽃을 지켰어요 · 오늘 한 문제만 풀면 연속이 이어져요');
    renderShield(); renderWeek(); renderHud();
  }

  /* ---------- 💪 경찰 순환식 체력검사 기준표 + 일상 대비 루틴 ---------- */
  function svgRun() {
    return '<svg viewBox="0 0 96 64" class="ex-svg ex-run" aria-hidden="true">' +
      '<line class="ex-ground" x1="4" y1="56" x2="92" y2="56"/>' +
      '<g class="ex-hurdle"><rect x="56" y="36" width="13" height="2.6" rx="1"/><line x1="58" y1="38" x2="58" y2="56"/><line x1="67" y1="38" x2="67" y2="56"/></g>' +
      '<g class="ex-runner"><circle cx="24" cy="21" r="4.6"/>' +
      '<line x1="24" y1="26" x2="24" y2="40"/>' +
      '<line class="ex-legA" x1="24" y1="40" x2="18" y2="53"/><line class="ex-legB" x1="24" y1="40" x2="31" y2="53"/>' +
      '<line class="ex-armA" x1="24" y1="30" x2="17" y2="36"/><line class="ex-armB" x1="24" y1="30" x2="31" y2="36"/></g>' +
      '</svg>';
  }
  function svgHurdle() {
    return '<svg viewBox="0 0 96 64" class="ex-svg ex-hurdle2" aria-hidden="true">' +
      '<line class="ex-ground" x1="4" y1="56" x2="92" y2="56"/>' +
      '<line class="ex-bar" x1="30" y1="34" x2="66" y2="34"/>' +
      '<line class="ex-bar" x1="32" y1="34" x2="32" y2="56"/><line class="ex-bar" x1="64" y1="34" x2="64" y2="56"/>' +
      '<g class="ex-jump"><g class="ex-figure"><circle cx="18" cy="20" r="4.4"/>' +
      '<line class="ex-torso" x1="18" y1="25" x2="18" y2="40"/>' +
      '<line class="ex-lim" x1="18" y1="29" x2="11" y2="34"/><line class="ex-lim" x1="18" y1="29" x2="25" y2="34"/>' +
      '<line class="ex-lim" x1="18" y1="40" x2="12" y2="52"/><line class="ex-lim" x1="18" y1="40" x2="24" y2="52"/></g></g>' +
      '</svg>';
  }
  function svgPull() {
    return '<svg viewBox="0 0 96 64" class="ex-svg ex-pull" aria-hidden="true">' +
      '<path class="ex-arc" d="M 26 50 A 22 22 0 0 1 70 50" fill="none"/>' +
      '<circle class="ex-pivot" cx="48" cy="50" r="2.6"/>' +
      '<g class="ex-lever"><line x1="48" y1="50" x2="48" y2="26"/>' +
      '<circle class="ex-knob" cx="48" cy="24" r="5"/></g>' +
      '<text class="ex-cap" x="16" y="62">당기기</text><text class="ex-cap" x="60" y="62">밀기</text>' +
      '</svg>';
  }
  function svgRescue() {
    return '<svg viewBox="0 0 96 64" class="ex-svg ex-rescue" aria-hidden="true">' +
      '<line class="ex-ground" x1="6" y1="52" x2="90" y2="52"/>' +
      '<line class="ex-dist" x1="18" y1="58" x2="78" y2="58"/>' +
      '<text class="ex-cap" x="34" y="63">10.7m</text>' +
      '<g class="ex-doll"><rect x="16" y="44" width="22" height="7" rx="3.5"/>' +
      '<circle cx="20" cy="47.5" r="3.6"/></g>' +
      '<g class="ex-puller"><circle cx="76" cy="28" r="4.2"/>' +
      '<line x1="76" y1="33" x2="72" y2="47"/><line x1="72" y1="47" x2="67" y2="52"/>' +
      '<line x1="72" y1="47" x2="78" y2="52"/><line x1="76" y1="36" x2="64" y2="42"/></g>' +
      '</svg>';
  }
  function svgTrigger() {
    return '<svg viewBox="0 0 96 64" class="ex-svg ex-trigger" aria-hidden="true">' +
      '<circle class="ex-ring" cx="48" cy="34" r="20"/>' +
      '<circle class="ex-dot" cx="48" cy="34" r="4"/>' +
      '<g class="ex-finger"><rect x="45" y="8" width="6" height="16" rx="3"/>' +
      '<line class="ex-armline" x1="48" y1="8" x2="48" y2="2"/></g>' +
      '<text class="ex-cap" x="30" y="62">16 + 15회</text>' +
      '</svg>';
  }
  /* ---- 일상 연습: 무엇을 잡고 어떻게 움직이는지 그림에 그대로 ---- */
  function svgStairs() {
    return '<svg viewBox="0 0 96 72" class="ex-svg ex-stairs" aria-hidden="true">' +
      '<path class="ex-step" d="M10 62 h20 v-13 h20 v-13 h20 v-13 h18" fill="none"/>' +
      '<text class="ex-cap" x="72" y="12">2칸씩</text>' +
      '<g class="ex-foot"><rect x="8" y="55" width="11" height="5" rx="2.5"/></g>' +
      '<g class="ex-uparrow"><line x1="31" y1="58" x2="31" y2="34"/><path d="M25 40 l6 -7 6 7" fill="none"/></g>' +
      '</svg>';
  }
  function svgBurpee() {
    return '<svg viewBox="0 0 96 72" class="ex-svg ex-burpee" aria-hidden="true">' +
      '<line class="ex-ground" x1="6" y1="64" x2="90" y2="64"/>' +
      /* 왼쪽: 선 자세 */
      '<g class="ex-stand"><circle cx="20" cy="22" r="5"/><line x1="20" y1="27" x2="20" y2="46"/>' +
      '<line x1="20" y1="46" x2="14" y2="62"/><line x1="20" y1="46" x2="26" y2="62"/>' +
      '<line x1="20" y1="32" x2="12" y2="24"/><line x1="20" y1="32" x2="28" y2="24"/></g>' +
      /* 오른쪽: 엎드린 자세 */
      '<g class="ex-plank"><circle cx="76" cy="50" r="5"/><line x1="71" y1="52" x2="50" y2="58"/>' +
      '<line x1="50" y1="58" x2="34" y2="60"/><line x1="71" y1="54" x2="74" y2="63"/>' +
      '<line x1="60" y1="55" x2="58" y2="63"/></g>' +
      '<path class="ex-arc" d="M26 34 Q44 14 60 44" fill="none"/>' +
      '<path class="ex-arrowhead" d="M54 40 l7 5 1 -8" fill="none"/>' +
      '<text class="ex-cap" x="44" y="70">엎드렸다 → 일어서기</text>' +
      '</svg>';
  }
  function svgBagWalk() {
    return '<svg viewBox="0 0 96 72" class="ex-svg ex-bagwalk" aria-hidden="true">' +
      '<line class="ex-ground" x1="6" y1="64" x2="90" y2="64"/>' +
      /* 뒤로 걸어가는 사람(몸은 오른쪽, 진행은 왼쪽) */
      '<g class="ex-walk"><circle cx="62" cy="18" r="5"/>' +
      '<line x1="62" y1="23" x2="58" y2="44"/><line x1="58" y1="44" x2="50" y2="62"/>' +
      '<line x1="58" y1="44" x2="66" y2="62"/><line x1="62" y1="28" x2="72" y2="36"/>' +
      '<line x1="62" y1="28" x2="52" y2="36"/></g>' +
      /* 무거운 가방 */
      '<g class="ex-bag"><rect x="66" y="24" width="18" height="20" rx="4"/><line x1="70" y1="24" x2="70" y2="19"/>' +
      '<line x1="80" y1="24" x2="80" y2="19"/></g>' +
      '<g class="ex-back"><line x1="46" y1="30" x2="18" y2="30"/><path d="M26 24 l-8 6 8 6" fill="none"/></g>' +
      '<text class="ex-cap" x="30" y="70">뒤로 걷기</text>' +
      '</svg>';
  }
  function svgBottleGrip() {
    return '<svg viewBox="0 0 96 72" class="ex-svg ex-bottle" aria-hidden="true">' +
      '<line class="ex-ground" x1="6" y1="64" x2="90" y2="64"/>' +
      '<g class="ex-hold"><circle cx="24" cy="18" r="5"/><line x1="24" y1="23" x2="24" y2="44"/>' +
      '<line x1="24" y1="44" x2="18" y2="62"/><line x1="24" y1="44" x2="30" y2="62"/></g>' +
      /* 앞으로 뻗은 팔 + 물병 */
      '<g class="ex-armf"><line x1="26" y1="28" x2="58" y2="28"/><rect x="58" y="18" width="11" height="22" rx="3"/>' +
      '<rect x="60" y="13" width="7" height="6" rx="2"/></g>' +
      '<circle class="ex-clock" cx="66" cy="50" r="11"/><line stroke-width="1.6" x1="66" y1="50" x2="66" y2="43"/>' +
      '<line stroke-width="1.6" x1="66" y1="50" x2="71" y2="52"/>' +
      '<text class="ex-cap" x="66" y="70">30초 버티기</text>' +
      '</svg>';
  }
  function svgDoorRow() {
    return '<svg viewBox="0 0 96 72" class="ex-svg ex-door" aria-hidden="true">' +
      '<line class="ex-ground" x1="6" y1="64" x2="90" y2="64"/>' +
      /* 문틀 */
      '<g class="ex-frame"><line x1="72" y1="6" x2="72" y2="64"/><line x1="90" y1="6" x2="90" y2="64"/>' +
      '<line x1="72" y1="6" x2="90" y2="6"/></g>' +
      /* 문틀을 잡고 뒤로 기대는 사람 */
      '<g class="ex-row"><circle cx="44" cy="20" r="5"/><line x1="46" y1="25" x2="40" y2="46"/>' +
      '<line x1="40" y1="46" x2="32" y2="64"/><line x1="40" y1="46" x2="46" y2="64"/>' +
      '<line x1="46" y1="29" x2="70" y2="26"/><line x1="45" y1="34" x2="70" y2="34"/></g>' +
      '<text class="ex-cap" x="26" y="16">등</text>' +
      '<g class="ex-pullarrow"><line x1="34" y1="28" x2="16" y2="28"/><path d="M22 23 l-7 5 7 5" fill="none"/></g>' +
      '<text class="ex-cap" x="83" y="70">문틀</text>' +
      '</svg>';
  }
  var PHYS_COURSES = [
    { n: 1, t: '장애물 달리기', s: '매트(1.5m) → 5단 계단 → 허들(0.6m) · 6바퀴', d: '2바퀴째에 1.5m 장벽 넘기 1회 포함', svg: svgRun },
    { n: 2, t: '장대 허들 넘기', s: '엎드려 넘기 ↔ 누워 넘기', d: '엎드려: 가슴·앞허벅지 닿기 / 누워: 등·엉덩이 닿기', svg: svgHurdle },
    { n: 3, t: '당기기·밀기', s: '32kg 저항 · 반원(180°) 각 3회', d: '당기며 반원 → 밀며 반원, 좌우 3회씩', svg: svgPull },
    { n: 4, t: '구조하기', s: '72kg 모형 인형 · 왕복 10.7m', d: '두 손으로 당겨 끌기', svg: svgRescue },
    { n: 5, t: '방아쇠 당기기', s: '지름 23cm 원 안 · 팔꿈치 편 채', d: '주손 16회 + 반대손 15회 격발', svg: svgTrigger }
  ];
  var PHYS_ROUTINE = [
    { t: '문틀·책상 잡고 등 당기기', part: '등·팔', rep: '10회 × 3세트', svg: svgDoorRow,
      how: '문틀(또는 튼튼한 책상 끝)을 두 손으로 잡고, 팔꿈치를 굽혀 가슴을 잡은 쪽으로 당겨요. 1초 멈췄다가 천천히 놓아요.' },
    { t: '엎드렸다 일어서기(버피)', part: '전신·심폐', rep: '10회 × 3세트', svg: svgBurpee,
      how: '선 자세에서 손을 바닥에 짚고 엎드렸다가(플랭크) 다시 두 발을 모아 일어서요. 뛰지 않아도 돼요.' },
    { t: '무거운 가방 메고 뒤로 걷기 + 앉았다 일어나기', part: '하체·등', rep: '10m × 3회 + 15회', svg: svgBagWalk,
      how: '책·물병 넣은 가방을 앞뒤로 메고 뒤로 10m 걸어요. 이어서 의자에 앉았다 일어나기를 15회 해요.' },
    { t: '물병 앞으로 들고 버티기 + 악력기 쥐기', part: '팔·어깨·악력', rep: '30초 × 3 + 20회', svg: svgBottleGrip,
      how: '물병을 들고 팔을 어깨 높이로 앞에 뻗어 30초 버티요. 악력기는 손이 아플 때까지 20회 쥐었다 펴요.' },
    { t: '계단 2칸씩 오르기', part: '하체·심폐', rep: '3세트', svg: svgStairs,
      how: '계단을 두 칸씩 오르내려요. 무릎이 아프면 한 칸씩, 10층 정도면 충분해요.' }
  ];
  function physHtml() {
    var h = '<div class="ph-top"><b>경찰 순환식 체력검사</b><i>2026년부터 전 채용 적용 · 남녀 동일 기준</i></div>';
    h += '<div class="ph-pass"><span class="pp-k">합격 기준</span>' +
      '<div class="pp-rows"><div><b>4.2kg</b><i>조끼 착용</i></div><div><b>5개 코스</b><i>연속 수행</i></div><div class="hot"><b>4분 40초</b><i>이하 완주</i></div></div></div>';
    h += '<div class="ph-list">';
    PHYS_COURSES.forEach(function (c) {
      h += '<div class="ph-item" data-ph="' + c.n + '">' +
        '<span class="ph-anim">' + c.svg() + '</span>' +
        '<span class="ph-body"><b>' + c.n + '. ' + esc(c.t) + '</b><i>' + esc(c.s) + '</i><em>' + esc(c.d) + '</em></span></div>';
    });
    h += '</div>';
    h += '<div class="ph-sub">🧍 일상에서 그대로 따라 하는 연습 <span>집에서 5분</span></div>' +
      '<p class="lib-sub ph-lead">그림에 나온 자세 그대로 하면 돼요. 한 동작 <b>10~15회 · 3세트</b>, 숨이 차면 30초 쉬어요.</p>';
    h += '<div class="ph-rt">';
    PHYS_ROUTINE.forEach(function (r, i) {
      h += '<div class="ph-rt-item"><span class="rt-anim">' + r.svg() + '</span>' +
        '<span class="rt-txt"><b>' + (i + 1) + '. ' + esc(r.t) + '</b>' +
        '<span class="rt-chips"><i class="rt-part">' + esc(r.part) + '</i><i class="rt-rep">' + esc(r.rep) + '</i></span>' +
        '<em>' + esc(r.how) + '</em></span></div>';
    });
    h += '</div><p class="lib-sub" style="margin-top:10px">· 기준(4분 40초·4.2kg·32kg·72kg·23cm·16/15회)은 경찰청 발표 자료 기준이고, 루틴은 그 코스를 겨냥한 연습 제안이에요.</p>';
    return h;
  }

  /* ============================================================
     🎯 미니 모의고사 — 타이머 · OMR · 제출 후 일괄 채점
     · 푸는 동안 정답·해설을 보여 주지 않는다
     · 제출하면 총점·소요 시간·오답 목록·문항별 해설을 한 번에
     · 틀린 문항은 오답노트(S.wrong)에 그대로 쌓인다
     ============================================================ */
  var MINI = null;
  function examBank(sid) {
    return D.questions.filter(function (q) {
      var c = COURSE[q.c];
      return c && c.exam && (!sid || q.s === sid);
    });
  }
  function miniCfgs() {
    return [
      { id: 'gt10', grp: '지텔프', name: '지텔프 문법 10문제', sub: '10문제 · 8분 · G-POINT 랜덤', n: 10, sec: 45, kind: 'gt' },
      { id: 'gt26', grp: '지텔프', name: '지텔프 실전 26문제', sub: '26문제 · 20분 · 실전 문법', n: 26, sec: 46, kind: 'gt' },
      { id: 'pol10', grp: '경찰', name: '경찰 3과목 10문제', sub: '10문제 · 10분 · 형사법·경찰학·범죄학', n: 10, sec: 60, kind: 'pol' },
      { id: 'pol20', grp: '경찰', name: '경찰 3과목 20문제', sub: '20문제 · 20분 · 형사법·경찰학·범죄학', n: 20, sec: 60, kind: 'pol' },
      { id: 'ex100', grp: '경찰', name: '2026년 2차 실전 100문항', sub: '형사법 40 · 경찰학 40 · 범죄학 20 · 100분', n: 100, sec: 60, kind: 'exam' }
    ];
  }
  function openMiniSheet() {
    var h = '<button class="sheet-close" data-close="1">✕</button>' +
      '<div class="sheet-num">실전 감각</div><div class="sheet-title">🎯 미니 모의고사</div>' +
      '<div class="sheet-meta">타이머가 돌아가고, 푸는 동안에는 정답·해설이 뜨지 않아요. 끝나고 <b>제출 및 일괄 채점</b>을 누르면 총점·소요 시간·오답·문항별 해설을 한 번에 볼 수 있어요.</div>' +
      '<div class="mini-pick">';
    miniCfgs().forEach(function (c) {
      var best = (S.miniBest || {})[c.id];
      h += '<button class="mini-opt" data-mini="' + c.id + '">' +
        '<span class="mo-top"><b>' + esc(c.name) + '</b><i>' + esc(c.sub) + '</i></span>' +
        '<span class="mo-go">' + (best ? '최고 ' + best + '/' + c.n + ' ›' : '시작 ›') + '</span></button>';
    });
    h += '</div><p class="note-mini">경찰 10·20문제는 배운 진도에서 먼저 내고, 모자라면 기출 전체에서 채워요. <b>2026년 2차 100문항</b>은 실제 시험 순서(형사법 → 경찰학 → 범죄학) 그대로 나가요.</p>';
    $('#sheetIn').innerHTML = h;
    $('#sheet').classList.remove('hidden');
    $$('#sheetIn [data-mini]').forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-mini');
        var cfg = miniCfgs().filter(function (x) { return x.id === id; })[0];
        closeSheet();
        startMini(cfg);
      };
    });
  }
  function openExamBankSheet() {
    var ex = examBank(null);
    var by = {};
    ex.forEach(function (q) { by[q.s] = (by[q.s] || 0) + 1; });
    var h = '<button class="sheet-close" data-close="1">✕</button>' +
      '<div class="sheet-num">2026년 2차 순경 공채</div>' +
      '<div class="sheet-title">📝 2026년 2차 기출 ' + ex.length + '문항</div>' +
      '<div class="sheet-meta">헌법 1~20번은 빼고 형사법·경찰학·범죄학만 넣었어요. 문항마다 출처(2026년 2차 순경 공채 …번)가 붙어 있어요.</div>' +
      '<div class="mini-pick">';
    [['crim', '형사법'], ['pol', '경찰학'], ['cri', '범죄학']].forEach(function (s) {
      if (!by[s[0]]) return;
      h += '<button class="mini-opt" data-exsub="' + s[0] + '">' +
        '<span class="mo-top"><b>' + s[1] + ' ' + by[s[0]] + '문항</b><i>한 문제씩 풀기 · 정답·해설 바로 보기</i></span>' +
        '<span class="mo-go">풀기 ›</span></button>';
    });
    h += '<button class="mini-opt" data-exall="1"><span class="mo-top"><b>전체 ' + ex.length + '문항 모의고사</b>' +
      '<i>형사법 → 경찰학 → 범죄학 · 100분 · 제출 후 일괄 채점</i></span><span class="mo-go">시작 ›</span></button>';
    h += '</div><p class="note-mini">형사법·범죄학 60문항은 공개 해설지가 없어 쟁점별 조문·판례·이론으로 직접 정리한 해설을, 경찰학 40문항은 장정훈 해설지 내용을 붙였어요. 해설은 선지별 ①②③④로 끊어 보여 줘요.</p>';
    $('#sheetIn').innerHTML = h;
    $('#sheet').classList.remove('hidden');
    $$('#sheetIn [data-exsub]').forEach(function (b) {
      b.onclick = function () {
        var sid = b.getAttribute('data-exsub');
        var ids = examBank(sid).map(function (q) { return q.i; });
        closeSheet();
        startSession('ids', {
          ids: ids, n: ids.length, noScope: true,
          title: '2026년 2차 기출 · ' + (SUBJ[sid] ? SUBJ[sid].name : '') + ' ' + ids.length + '문항'
        });
      };
    });
    var all = $('#sheetIn [data-exall]');
    if (all) all.onclick = function () { closeSheet(); startMini(miniCfgs().filter(function (x) { return x.id === 'ex100'; })[0]); };
  }
  function startMini(cfg) {
    if (!cfg) return;
    var picked = [], note = '';
    if (cfg.kind === 'gt') {
      picked = qs(D.questions.filter(function (q) { return q.s === 'gtelp' && q.gp; }), cfg.n);
      note = 'G-POINT 랜덤';
    } else if (cfg.kind === 'exam') {
      picked = examBank(null).slice(0, cfg.n);
      note = '2026년 2차 기출';
    } else {
      /* 실전 모의고사이므로 2지선다 OX 문항은 빼고 실제 시험형 4지선다만 낸다 */
      var is4 = function (q) { return (q.o || []).length === 4; };
      var ins = D.questions.filter(function (q) { return q.s !== 'gtelp' && !q.gp && is4(q) && inScope(q); });
      var all = D.questions.filter(function (q) { return q.s !== 'gtelp' && !q.gp && is4(q) && !(COURSE[q.c] && COURSE[q.c].exam); });
      if (ins.length >= cfg.n) { picked = qs(ins, cfg.n); note = '배운 진도'; }
      else {
        picked = shuffle(ins.slice());
        picked = picked.concat(qs(all.filter(function (q) { return picked.indexOf(q) < 0; }), cfg.n - picked.length));
        note = '배운 진도 + 기출';
      }
    }
    picked = picked.filter(Boolean);
    if (picked.length < 2) { toast('출제할 문제가 부족해요'); return; }
    var sec = cfg.sec * picked.length;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('mini');
    document.body.classList.remove('fever', 'boss');
    $('#quiz').classList.remove('hidden');
    $('#qFb').classList.add('hidden');
    $('#qCombo').classList.add('hidden');
    $('#qTitle').innerHTML = '🎯 미니 모의고사 · ' + esc(cfg.name);
    $('#qBar').style.width = '0%';
    MINI = {
      cfg: cfg, items: picked.map(function (q) { return { q: q, pick: null }; }),
      i: 0, note: note, over: false, confirm: false, sec: sec,
      startedAt: Date.now(), end: Date.now() + sec * 1000, timer: null, result: null
    };
    clearInterval(MINI.timer);
    MINI.timer = setInterval(miniTick, 250);
    miniTick();
    renderMini();
    sfx('tap');
  }
  function fmtDur(s) {
    s = Math.max(0, Math.round(s));
    return Math.floor(s / 60) + ':' + pad(s % 60);
  }
  function cutTxt(s, n) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }
  function miniTick() {
    if (!MINI || MINI.over) return;
    var left = Math.max(0, Math.ceil((MINI.end - Date.now()) / 1000));
    var el = $('#qTimer');
    if (el) {
      el.textContent = '⏳ ' + Math.floor(left / 60) + ':' + pad(left % 60);
      el.classList.toggle('warn', left <= 60);
    }
    if (left <= 0) { toast('시간이 끝났어요 · 자동 제출'); miniSubmit(true); }
  }
  function miniGo(d) {
    if (!MINI || MINI.over) return;
    var n = MINI.i + d;
    if (n < 0 || n >= MINI.items.length) return;
    MINI.i = n; renderMini(); sfx('tap');
  }
  function miniPick(i) {
    if (!MINI || MINI.over) return;
    var cur = MINI.i;
    MINI.items[cur].pick = i;
    MINI.confirm = false;
    sfx('tap');
    renderMini();
    if (cur < MINI.items.length - 1) {
      setTimeout(function () {
        if (MINI && !MINI.over && MINI.i === cur && MINI.items[cur].pick === i) { MINI.i = cur + 1; renderMini(); }
      }, 170);
    }
  }
  function renderMini() {
    if (!MINI || MINI.over) return;
    var it = MINI.items[MINI.i], q = it.q, tot = MINI.items.length;
    $('#qCount').textContent = (MINI.i + 1) + '/' + tot;
    $('#qBar').style.width = (MINI.i / tot * 100) + '%';
    var badge = srcBadge(q), keys = ['A', 'B', 'C', 'D'];
    var done = MINI.items.filter(function (x) { return x.pick != null; }).length;
    var h = '<div class="q-tags"><span class="q-tag">' + esc(qTag(q)) + '</span>' +
      '<span class="q-src ' + badge.k + '">' + esc(badge.t) + '</span></div>' +
      stemHtml(q.q) + '<div class="opts mini-opts">';
    q.o.forEach(function (o, i) {
      h += '<button class="opt' + (it.pick === i ? ' picked' : '') + '" data-i="' + i + '">' +
        '<span class="k">' + keys[i] + '</span><span>' + esc(o) + '</span></button>';
    });
    h += '</div>';
    h += '<div class="mini-omr"><div class="mo-head"><b>답안 표시</b><span>' + done + ' / ' + tot + ' 표시 · ' + esc(MINI.note) + '</span></div><div class="omr-grid">';
    MINI.items.forEach(function (x, j) {
      h += '<button class="omr-b' + (x.pick != null ? ' done' : '') + (j === MINI.i ? ' on' : '') + '" data-j="' + j + '">' + (j + 1) + '</button>';
    });
    h += '</div></div>';
    h += '<div class="mini-actions"><button class="btn ghost" id="mPrev"' + (MINI.i === 0 ? ' disabled' : '') + '>← 이전</button>' +
      '<button class="btn ghost" id="mNext"' + (MINI.i === tot - 1 ? ' disabled' : '') + '>다음 →</button></div>' +
      '<button class="btn primary wide" id="mSubmit">제출 및 일괄 채점</button>' +
      '<p class="mini-note">정답은 제출할 때 한꺼번에 채점해요. 표시하지 않은 문항은 제출 전에 알려 드려요.</p>';
    $('#qBody').innerHTML = h;
    $('#qBody').scrollTop = 0;
    $$('#qBody .opt').forEach(function (b) {
      b.onclick = function () { miniPick(Number(b.getAttribute('data-i'))); };
    });
    $$('#qBody .omr-b').forEach(function (b) {
      b.onclick = function () { MINI.i = Number(b.getAttribute('data-j')); renderMini(); sfx('tap'); };
    });
    var pv = $('#mPrev'); if (pv) pv.onclick = function () { miniGo(-1); };
    var nx = $('#mNext'); if (nx) nx.onclick = function () { miniGo(1); };
    var sb = $('#mSubmit'); if (sb) sb.onclick = function () { miniSubmit(false); };
  }
  function miniSubmit(force) {
    if (!MINI || MINI.over) return;
    var un = MINI.items.filter(function (x) { return x.pick == null; }).length;
    if (!force && un && !MINI.confirm) {
      MINI.confirm = true;
      var btn = $('#mSubmit');
      if (btn) btn.textContent = '그래도 제출 (' + un + '문항 비어 있음)';
      toast('아직 ' + un + '문항이 비어 있어요 · 한 번 더 누르면 제출');
      return;
    }
    MINI.over = true;
    clearInterval(MINI.timer); MINI.timer = null;
    var _toast = $('#toast'); if (_toast) _toast.classList.add('hidden');
    var timeUp = Date.now() >= MINI.end;
    var elapsed = Math.min(MINI.sec, Math.round((Date.now() - MINI.startedAt) / 1000));
    var day = dayRec(), ok = 0, wrongIds = [], tot = MINI.items.length, earned = 0;
    MINI.items.forEach(function (it) {
      var q = it.q;
      if (it.pick == null) {
        var w0 = S.wrong[q.i] || { c: 0 };
        S.wrong[q.i] = { c: (w0.c || 0) + 1, d: todayStr() };
        wrongIds.push(q.i);
        it.gain = 0;
        return;
      }
      var right = it.pick === q.a;
      S.ans++; day.ans = (day.ans || 0) + 1;
      var uk = q.c + ':' + q.u;
      var u = S.unit[uk] || (S.unit[uk] = { a: 0, ok: 0 });
      u.a++;
      var nk = q.gp ? (q.c + ':gp' + q.gp) : (q.c + ':u' + q.u);
      var nd = S.node[nk] || (S.node[nk] = { a: 0, ok: 0 });
      nd.a++;
      if (right) {
        ok++; S.ok++; u.ok++; nd.ok++; day.ok = (day.ok || 0) + 1;
        S.qok[q.i] = (S.qok[q.i] || 0) + 1;
        delete S.wrong[q.i];
        S.xp += 10; day.xp = (day.xp || 0) + 10;
        earned += 10; it.gain = 10;
      } else {
        var w = S.wrong[q.i] || { c: 0 };
        S.wrong[q.i] = { c: (w.c || 0) + 1, d: todayStr() };
        wrongIds.push(q.i);
        S.xp += 3; day.xp = (day.xp || 0) + 3;
        earned += 3; it.gain = 3;
      }
    });
    var acc = tot ? Math.round(ok / tot * 100) : 0;
    var bonus = acc === 100 ? 20 : 10;
    S.xp += bonus; day.xp = (day.xp || 0) + bonus;
    S.miniRuns = (S.miniRuns || 0) + 1;
    S.miniBest = S.miniBest || {};
    var mk = MINI.cfg.id;
    var prevBest = S.miniBest[mk] || 0;
    if (ok > prevBest) S.miniBest[mk] = ok;
    touchStreak();
    save();
    MINI.result = { ok: ok, tot: tot, acc: acc, elapsed: elapsed, timeUp: timeUp, bonus: bonus, earned: earned + bonus, prevBest: prevBest, wrongIds: wrongIds };
    renderMiniResult();
    renderHud(); renderReview(); renderStats(); renderQuest(); renderMascot(); renderChallenges(); renderPass(); renderDash();
    checkPromotion();
    sfx(acc >= 80 ? 'done' : 'tap');
    if (acc >= 80) confetti(60);
  }
  function renderMiniResult() {
    if (!MINI || !MINI.result) return;
    var r = MINI.result, tot = r.tot, ok = r.ok;
    var timer = $('#qTimer');
    if (timer) { timer.textContent = '⏱ ' + fmtDur(r.elapsed); timer.classList.remove('warn'); }
    $('#qCount').textContent = '채점 완료';
    $('#qBar').style.width = '100%';
    var msg = r.acc === 100 ? '전부 맞혔어요! 실전 감각 최고예요' : r.acc >= 80 ? '합격권이에요. 틀린 것만 확인해요' : r.acc >= 50 ? '조금만 더. 오답부터 다시' : '틀린 문제는 오답노트에 담아뒀어요';
    var avg = tot ? Math.round(r.elapsed / tot) : 0;
    var list = '';
    MINI.items.forEach(function (x, idx) {
      var q = x.q, right = x.pick === q.a;
      var pickTxt = x.pick == null ? '표시 없음' : String(q.o[x.pick]);
      list += '<details class="mi-item ' + (right ? 'ok' : 'no') + '"' + (right ? '' : ' open') + '>' +
        '<summary><span class="mi-no">' + (idx + 1) + '</span>' +
        '<span class="mi-st">' + esc(cutTxt(q.q, 64)) + '</span>' +
        '<span class="mi-res">' + (x.pick == null ? '–' : right ? 'O' : 'X') + '</span></summary>' +
        '<div class="mi-body">' +
        '<div class="mi-row"><span>내 답</span><b class="' + (right ? 'ok' : 'no') + '">' + esc(cutTxt(pickTxt, 90)) + '</b></div>' +
        expHtml(q) +
        '<div class="mi-src">📌 ' + esc(q.src || qLabel(q)) + '</div>' +
        '</div></details>';
    });
    var h = '<div class="summary mini-sum">' +
      '<div class="sum-emoji">' + (r.acc >= 80 ? '🎉' : r.acc >= 50 ? '💪' : '🌱') + '</div>' +
      '<h2>' + ok + ' / ' + tot + ' 정답</h2>' +
      '<p>' + esc(MINI.cfg.name) + ' · ' + fmtDur(r.elapsed) + ' 사용' + (r.timeUp ? ' (시간 종료)' : '') + '</p>' +
      '<div class="mini-score"><b>' + r.acc + '%</b><span>정답률 · 1문항 평균 ' + avg + '초</span></div>' +
      '<div class="rows">' +
      '<div class="row"><span>소요 시간</span><i>' + fmtDur(r.elapsed) + ' / ' + fmtDur(MINI.sec) + '</i></div>' +
      '<div class="row"><span>틀린 문항</span><i>' + r.wrongIds.length + '개 (오답노트 저장)</i></div>' +
      '<div class="row"><span>얻은 P</span><i>+' + r.earned + ' P</i></div>' +
      '<div class="row"><span>이 조건 최고</span><i>' + Math.max(r.prevBest, ok) + ' / ' + tot + '</i></div>' +
      '</div>' +
      (r.wrongIds.length ? '<button class="btn ghost wide" id="mRetryWrong">🩹 틀린 ' + r.wrongIds.length + '문항 다시 풀기</button>' : '') +
      '<button class="btn primary wide" id="mAgain">같은 조건으로 한 번 더</button>' +
      '<button class="btn ghost wide" id="mHome">닫기</button>' +
      '</div>' +
      '<h3 class="mini-h">문항별 채점 · 해설 <span>틀린 문항은 펼쳐져 있어요</span></h3>' +
      '<div class="mini-breakdown">' + list + '</div>';
    $('#qBody').innerHTML = h;
    $('#qBody').scrollTop = 0;
    $('#qFb').classList.add('hidden');
    var wrongNow = r.wrongIds.slice(), cfgNow = MINI.cfg;
    var rw = $('#mRetryWrong');
    if (rw) rw.onclick = function () { closeMini(); startSession('ids', { ids: wrongNow, n: wrongNow.length, noScope: true, title: '미니 모의고사 오답 ' + wrongNow.length + '문항' }); };
    var ag = $('#mAgain');
    if (ag) ag.onclick = function () { closeMini(); startMini(cfgNow); };
    var hm = $('#mHome');
    if (hm) hm.onclick = function () { closeMini(); renderAll(); };
  }
  function closeMini() {
    if (MINI) { clearInterval(MINI.timer); MINI = null; }
    document.body.classList.remove('mini', 'fever', 'boss');
    document.body.style.overflow = '';
    $('#quiz').classList.add('hidden');
    $('#qBody').innerHTML = '';
    var qc = $('#qCombo'); if (qc) qc.classList.remove('hidden');
    var qt = $('#qTimer'); if (qt) { qt.textContent = '⏱ 60'; qt.classList.remove('warn'); }
    var qb = $('#qBar'); if (qb) qb.style.width = '0%';
  }

  /* ============================================================
     🔎 통합 키워드 검색 — 문제 · 암기표 · 자료실
     ============================================================ */
  var SEARCH = { f: 'all', t: null };
  function searchTokens(kw) {
    return String(kw || '').toLowerCase().replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  }
  function hlEsc(s, toks) {
    var e = esc(s);
    toks.forEach(function (t) {
      if (!t) return;
      var re = new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      e = e.replace(re, '<mark>$1</mark>');
    });
    return e;
  }
  /* 검색 결과 카드의 메타 줄: 과목 · 단원 · 출처 — 같은 말을 두 번 쓰지 않게 */
  function searchMeta(q) {
    var out = [SUBJ[q.s] ? SUBJ[q.s].name : ''];
    if (q.gp) out.push('G-POINT ' + q.gp);
    else {
      var u = unitName(q.c, q.u) || '', sn = SUBJ[q.s] ? SUBJ[q.s].name : '';
      if (sn && u.indexOf(sn + ' ') === 0) u = u.slice(sn.length + 1);   /* '형사법 형사법 40문항' 같은 겹침 제거 */
      if (u) out.push(u);
    }
    var src = String(q.src || '');
    var head = out.join(' · ');
    if (src && head.indexOf(src) < 0) out.push(src);
    return out.filter(Boolean).join(' · ');
  }
  function searchProblems(toks) {
    var out = [];
    D.questions.forEach(function (q) {
      var stem = String(q.q || '').toLowerCase();
      var optsRaw = (q.o || []).join(' ');
      var explRaw = String(q.e || '');
      var opts = optsRaw.toLowerCase();
      var expl = explRaw.toLowerCase();
      var meta = ((q.src || '') + ' ' + qLabel(q)).toLowerCase();
      var all = stem + ' ' + opts + ' ' + expl + ' ' + meta;
      if (!toks.every(function (t) { return all.indexOf(t) >= 0; })) return;
      var score = 0, why = '';
      toks.forEach(function (t) {
        if (stem.indexOf(t) >= 0) score += 3;
        else if (opts.indexOf(t) >= 0) score += 2;
        else if (expl.indexOf(t) >= 0) score += 1;
      });
      /* 본문에 없고 해설·보기에서만 걸린 경우, 왜 나왔는지 한 줄 보여준다 */
      if (!toks.every(function (t) { return stem.indexOf(t) >= 0; })) {
        var miss = toks.filter(function (t) { return stem.indexOf(t) < 0; })[0];
        var inExpl = expl.indexOf(miss) >= 0;
        var srcRaw = inExpl ? explRaw : optsRaw;
        var at = (inExpl ? expl : opts).indexOf(miss);
        if (at >= 0) why = (inExpl ? '해설: ' : '보기: ') + '…' + srcRaw.slice(Math.max(0, at - 24), at + 56).replace(/\s+/g, ' ').trim() + '…';
      }
      out.push({ q: q, score: score, why: why });
    });
    out.sort(function (a, b) { return b.score - a.score; });
    return out.slice(0, 40);
  }
  function searchMemos(toks) {
    var out = [];
    GP_TABLE.forEach(function (grp) {
      grp.rows.forEach(function (r) {
        var all = (grp.g + ' ' + r[0] + ' ' + r[1] + ' ' + r[2] + ' G-POINT ' + r[0]).toLowerCase();
        if (!toks.every(function (t) { return all.indexOf(t) >= 0; })) return;
        out.push({ kind: 'gp', n: Number(r[0]), g: grp.g, cond: r[1], ans: r[2] });
      });
    });
    Object.keys(LAW_TABLE).forEach(function (sid) {
      LAW_TABLE[sid].forEach(function (grp, gi) {
        grp.rows.forEach(function (r) {
          var all = ((SUBJ[sid] ? SUBJ[sid].name : '') + ' ' + grp.g + ' ' + r.join(' ')).toLowerCase();
          if (!toks.every(function (t) { return all.indexOf(t) >= 0; })) return;
          out.push({ kind: 'law', sub: sid, gi: gi, g: grp.g, cond: r[0], ans: r[1], src: r[2], tip: r[3] });
        });
      });
    });
    return out.slice(0, 30);
  }
  function searchLibs(toks) {
    var out = [];
    LIB.forEach(function (g) {
      g.rows.forEach(function (r) {
        var all = (g.sub + ' ' + r.t + ' ' + r.s + ' ' + r.k).toLowerCase();
        if (!toks.every(function (t) { return all.indexOf(t) >= 0; })) return;
        out.push({ g: g.sub, r: r });
      });
    });
    return out.slice(0, 30);
  }
  function openSearch() {
    var el = $('#search');
    if (!el) return;
    el.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    renderSearch($('#sInput') ? $('#sInput').value : '');
    var inp = $('#sInput');
    if (inp) setTimeout(function () { try { inp.focus(); } catch (e) {} }, 80);
  }
  function closeSearch() {
    var el = $('#search');
    if (el) el.classList.add('hidden');
    document.body.style.overflow = '';
  }
  function renderSearch(kw) {
    var inp = $('#sInput');
    if (kw != null && inp && inp.value !== kw) inp.value = kw;
    kw = inp ? inp.value : (kw || '');
    var toks = searchTokens(kw);
    var body = $('#sBody');
    if (!body) return;
    if (!toks.length) {
      body.innerHTML = '<div class="s-empty"><b>무엇을 찾을까요?</b>' +
        '<p>문제 본문·보기·해설, 조문·숫자·두문자 암기표, G-POINT, 자료실 PDF를 한 번에 뒤져요.</p>' +
        '<div class="s-chips">' + ['불심검문', '가정법', '공소시효', '장정훈', '2026년 2차', '공무집행방해'].map(function (k) {
          return '<button class="s-chip" data-kw="' + esc(k) + '">' + esc(k) + '</button>';
        }).join('') + '</div></div>';
      $$('#sBody [data-kw]').forEach(function (b) {
        b.onclick = function () { if (inp) { inp.value = b.getAttribute('data-kw'); } renderSearch(); sfx('tap'); };
      });
      return;
    }
    var qs_ = searchProblems(toks), ms = searchMemos(toks), ls = searchLibs(toks);
    var f = SEARCH.f;
    var h = '<div class="s-count">‘<b>' + esc(kw) + '</b>’ 결과 · 문제 ' + qs_.length + ' · 암기표 ' + ms.length + ' · 자료실 ' + ls.length + '</div>';
    if (!qs_.length && !ms.length && !ls.length) {
      body.innerHTML = h + '<div class="s-empty"><b>결과가 없어요</b><p>다른 낱말로 찾아보세요. 띄어쓰기로 여러 낱말을 함께 넣으면 그 말이 모두 든 것만 보여줘요.</p></div>';
      return;
    }
    if ((f === 'all' || f === 'q') && qs_.length) {
      h += '<div class="s-sec"><div class="s-head">① 문제 <b>' + qs_.length + '</b><i>누르면 바로 풀어요</i></div>';
      qs_.forEach(function (r) {
        var q = r.q;
        h += '<button class="s-item" data-qid="' + esc(q.i) + '"><span class="s-k">' + esc(SUBJ[q.s].name) + '</span>' +
          '<span class="s-b"><b>' + hlEsc(cutTxt(q.q, 90), toks) + '</b>' +
          '<i>' + esc(searchMeta(q)) + '</i>' +
          (r.why ? '<em class="s-why">' + hlEsc(r.why, toks) + '</em>' : '') + '</span><span class="s-go">›</span></button>';
      });
      h += '</div>';
    }
    if ((f === 'all' || f === 'memo') && ms.length) {
      h += '<div class="s-sec"><div class="s-head">② 암기표 <b>' + ms.length + '</b><i>누르면 문제·표로 이동</i></div>';
      ms.forEach(function (m) {
        if (m.kind === 'gp') {
          h += '<button class="s-item" data-gpn="' + m.n + '"><span class="s-k gp">GP ' + m.n + '</span>' +
            '<span class="s-b"><b>' + hlEsc(m.cond, toks) + '</b><i>G-POINT ' + m.n + ' · ' + esc(m.ans) + '</i></span><span class="s-go">›</span></button>';
        } else {
          h += '<button class="s-item" data-lawsub="' + m.sub + '" data-lawgi="' + m.gi + '"><span class="s-k law">' + esc(SUBJ[m.sub] ? SUBJ[m.sub].name : '') + '</span>' +
            '<span class="s-b"><b>' + hlEsc(m.cond, toks) + '</b><i>' + esc(m.g) + ' · ' + hlEsc(m.ans, toks) + (m.src ? ' · ' + esc(m.src) : '') + '</i></span><span class="s-go">›</span></button>';
        }
      });
      h += '</div>';
    }
    if ((f === 'all' || f === 'lib') && ls.length) {
      h += '<div class="s-sec"><div class="s-head">③ 자료실 PDF <b>' + ls.length + '</b><i>누르면 드라이브로 열려요</i></div>';
      ls.forEach(function (x) {
        h += '<a class="s-item" href="' + esc(x.r.u) + '" target="_blank" rel="noopener"><span class="s-k lib">' + esc(x.r.k) + '</span>' +
          '<span class="s-b"><b>' + hlEsc(x.r.t, toks) + '</b><i>' + esc(x.g) + ' · ' + hlEsc(x.r.s, toks) + '</i></span><span class="s-go">↗</span></a>';
      });
      h += '</div>';
    }
    body.innerHTML = h;
    $$('#sBody [data-qid]').forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-qid');
        var q = D.questions.filter(function (x) { return x.i === id; })[0];
        if (!q) return;
        closeSearch();
        startSession('ids', { ids: [id], n: 1, noScope: true, title: '검색 · ' + qTag(q) });
      };
    });
    $$('#sBody [data-gpn]').forEach(function (b) {
      b.onclick = function () {
        var n = Number(b.getAttribute('data-gpn'));
        closeSearch();
        if (S.subj !== 'gtelp') { S.subj = 'gtelp'; save(); renderAll(); }
        startSession('gp', { n: n });
      };
    });
    $$('#sBody [data-lawsub]').forEach(function (b) {
      b.onclick = function () {
        var sid = b.getAttribute('data-lawsub'), gi = b.getAttribute('data-lawgi');
        closeSearch();
        S.subj = sid; save();
        openMemo('law');
        renderAll();
        setTimeout(function () {
          var t = $('#law-g' + gi);
          if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 120);
      };
    });
  }

  /* ---------- boot ---------- */
  $('#path')._scrolled = true;   // 첫 화면에서 D-Day·히어로가 가려지지 않게 자동 스크롤 생략
  renderAll();
  if (D.questions.length === 0) toast('문제 데이터를 불러오지 못했어요');
})();
