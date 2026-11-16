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
    { id: 'xp', t: 'XP 100 모으기', need: 100 },
    { id: 'lec', t: '강의 2개 체크하기', need: 2 }
  ];

  /* ---------- state ---------- */
  var S = {
    xp: 0, streak: { n: 0, last: '', best: 0 }, checked: {}, wrong: {},
    ans: 0, ok: 0, muted: false, subj: 'cri', course: {}, qlen: 10, mix: false, days: {},
    dday: DTARGET, ddayNote: '예상일', unit: {}, node: {}, qok: {}, gpSeeded: false, goal: { xp: 50, q: 10 }, bestCombo: 0,
    planLog: {}, planSubj: '', planPerDay: 2, speedBest: 0
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
    $('#ddaySub').textContent = iso + ' (' + weekday(iso) + ') · ' + (S.ddayNote || '예상일') + ' (1월 공고 시 수정 가능)';
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
      '<div class="gp-note">조건(힌트)은 <b class="gp-cond">파랑</b>, 정답 공식은 <b class="gp-ans">노랑</b>으로 봐요.</div>' +
      '<div class="gp-jump">';
    GP_TABLE.forEach(function (grp, gi) {
      h += '<button class="gp-jbtn" data-goto="' + gi + '">' + esc(grp.g) + '</button>';
    });
    h += '</div>';
    GP_TABLE.forEach(function (grp, gi) {
      h += '<div class="gp-group" id="gp-g' + gi + '"><div class="gp-group-h">' + esc(grp.g) + '</div>';
      grp.rows.forEach(function (r) {
        h += '<div class="gp-row">' +
          '<div class="gp-no">' + esc(r[0]) + '</div>' +
          '<div class="gp-body"><div class="gp-cond">' + esc(r[1]) + '</div>' +
          '<div class="gp-ans">👉 ' + esc(r[2]) + '</div></div></div>';
      });
      if (grp.tip) h += '<div class="gp-tip">💡 ' + esc(grp.tip) + '</div>';
      h += '</div>';
    });
    h += '<button class="btn primary wide" data-close="1" style="margin-top:10px">확인</button>';
    $('#sheetIn').innerHTML = h;
    $('#sheet').classList.remove('hidden');
    $$('.gp-jbtn').forEach(function (b) {
      b.onclick = function () {
        var t = $('#gp-g' + b.getAttribute('data-goto'));
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
        $$('.gp-jbtn').forEach(function (x) { x.classList.toggle('on', x === b); });
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
    $('#xpN').textContent = S.xp || 0;
    $('#mute').textContent = S.muted ? '🔇' : '🔊';
    var rk = rankOf(S.xp || 0);
    $('#rankBadge').innerHTML = '<span>' + rk.r.e + '</span>' + rk.r.n;
    $('#rankBadge').title = rk.next ? (rk.next.n + '까지 ' + (rk.next.xp - (S.xp || 0)) + ' XP') : '최고 계급';
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
  function openRankSheet(rank, promoted) {
    var rk = rankOf(S.xp || 0);
    var html = '<button class="sheet-close" data-close="1">✕</button>' ;
    if (promoted) {
      html += '<div class="promo"><div class="promo-emoji">' + rank.e + '</div>' +
        '<h2>' + rank.n + ' 승진!</h2><p>축하합니다! XP ' + (S.xp || 0) + '로 <b>' + rank.n + '</b>이 되었어요.</p></div>';
    } else {
      html += '<div class="sheet-num">나의 계급</div><div class="sheet-title">' + rk.r.e + ' ' + rk.r.n + '</div>' +
        '<div class="sheet-meta">XP ' + (S.xp || 0) + (rk.next ? ' · 다음 계급 ' + rk.next.n + '까지 ' + (rk.next.xp - (S.xp || 0)) + ' XP' : ' · 최고 계급') + '</div>';
    }
    html += '<div class="rank-list">';
    RANKS.forEach(function (r, i) {
      var cls = 'rank-item' + (i <= rk.i ? ' got' : '');
      html += '<div class="' + cls + '"><span>' + r.e + '</span><b>' + r.n + '</b><i>' + r.xp + ' XP</i></div>';
    });
    html += '</div><button class="btn primary" data-close="1">확인</button>';
    $('#sheetIn').innerHTML = html;
    $('#sheet').classList.remove('hidden');
  }
  function renderSubtabs() {
    var el = $('#subtabs'); el.innerHTML = '';
    D.subjects.forEach(function (s) {
      var b = document.createElement('button');
      b.className = 'stab' + (s.id === S.subj ? ' on' : '');
      if (s.id === S.subj) b.style.background = s.color;
      b.setAttribute('data-sub', s.id);
      b.innerHTML = '<b>' + s.emoji + ' ' + s.name + '</b><i>' + s.teacher + '</i>';
      b.onclick = function () {
        if (S.subj === s.id) return;
        S.subj = s.id; save(); sfx('tap');
        renderAll(); window.scrollTo({ top: 0, behavior: 'smooth' });
      };
      el.appendChild(b);
    });
    var onTab = el.querySelector('.stab.on');
    if (onTab && onTab.scrollIntoView) { try { onTab.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (e) {} }
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
    $('#goalXpTxt').textContent = (d.xp || 0) + ' / ' + S.goal.xp + ' XP';
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
  function renderMascot() {
    var d = dayRec();
    var left = Math.max(0, S.goal.q - (d.ans || 0));
    var msg;
    if ((d.ans || 0) >= S.goal.q && (d.xp || 0) >= S.goal.xp) msg = '오늘 목표 완료! 이대로만 가자 🎉';
    else if (!(d.ans || 0)) msg = '오늘 목표는 ' + S.goal.q + '문제 · ' + S.goal.xp + ' XP야. 가볍게 시작해 볼까?';
    else msg = '목표까지 ' + left + '문제 남았어. 콤보 이어가면 보너스 XP도 쌓여!';
    $('#homeBubble').textContent = msg;
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
    $('#courseBtn').onclick = openCourseSheet;
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

  function renderPath(c) {
    var path = $('#path'); path.innerHTML = '';
    var wrap = path.parentElement;
    var W = wrap.clientWidth || 360;
    var gp = isGP(c), today = todayStr(), doneSet = ckMap(c.id);
    var cur = nextLecture(c.id);
    var list = [], y = 46, lastU = -2;
    c.lec.forEach(function (L) {
      var ui = unitIndex(c.id, L.n);
      if (ui !== lastU) { list.push({ kind: 'banner', ui: ui, y: y }); y += 44; lastU = ui; }
      list.push({ kind: 'node', L: L, y: y });
      y += 90;
    });
    var H = y + 30;
    path.style.height = H + 'px';
    var pts = [], unitCount = {};
    c.lec.forEach(function (L) {
      var ui = unitIndex(c.id, L.n);
      unitCount[ui] = (unitCount[ui] || 0) + 1;
    });
    list.forEach(function (it) {
      if (it.kind === 'banner') {
        var u = c.units[it.ui];
        if (!u) return;
        var nums = [];
        c.lec.forEach(function (L) { if (L.n >= u.a && L.n <= u.b) nums.push(L.n); });
        var doneN = nums.filter(function (n) { return doneSet[n]; }).length;
        var el = document.createElement('div');
        el.className = 'unit-banner';
        el.style.top = (it.y - 20) + 'px';
        el.style.background = 'linear-gradient(100deg,' + shade(SUBJ[S.subj].color, 0.12) + ',' + SUBJ[S.subj].accent + ')';
        el.style.color = shade(SUBJ[S.subj].color, -0.35);
        el.innerHTML = '<span class="ub-n">UNIT ' + (it.ui + 1) + '</span>' +
          '<span class="ub-t">' + esc(u.n) + '</span>' +
          '<span class="ub-p">' + (gp ? 'G-POINT ' + u.a + (u.b !== u.a ? '~' + u.b : '') : u.a + '~' + u.b + '강') +
          ' · ' + doneN + '/' + nums.length + '</span>';
        path.appendChild(el);
        return;
      }
      var L = it.L;
      var x = W / 2 + Math.sin(it.y * 0.0125) * (W * 0.27);
      var w = document.createElement('div');
      w.className = 'node-wrap';
      w.style.left = x + 'px'; w.style.top = it.y + 'px';
      var b = document.createElement('button');
      var cls = 'node';
      if (doneSet[L.n]) cls += ' done';
      else if (L.n === cur) cls += ' current';
      if (!L.up) cls += ' plan';
      if (doneSet[L.n] === today) cls += ' today';
      if (isMastered(c.id, L.n)) cls += ' master';
      b.className = cls;
      var inner = '<span class="num">' + L.n + '</span>';
      if (isMastered(c.id, L.n)) inner += '<span class="crown">👑</span>';
      b.innerHTML = inner;
      b.setAttribute('aria-label', (gp ? 'G-POINT ' + L.n : L.n + '강') + (L.d ? ' · ' + L.d + ' 업로드' : ''));
      b.onclick = function () { sfx('tap'); openSheet(c.id, L.n); };
      w.appendChild(b);
      if (L.n === cur) {
        var tg = document.createElement('span'); tg.className = 'node-tag'; tg.textContent = '여기서부터';
        w.appendChild(tg);
      } else if (L.n === 1) {
        var t2 = document.createElement('span'); t2.className = 'node-tag gold'; t2.textContent = 'START';
        w.appendChild(t2);
      }
      if (L.d) {
        var dd = document.createElement('span'); dd.className = 'node-date'; dd.textContent = L.d;
        w.appendChild(dd);
      }
      path.appendChild(w);
      // 이전 노드와 연결
      pts.push([x, it.y]);
    });
    // 연결선
    var svg = $('#pathSvg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('width', W);
    if (pts.length) {
      var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
      var lastDone = -1;
      c.lec.forEach(function (L, i) { if (doneSet[L.n]) lastDone = i; });
      var dDone = '';
      if (lastDone > 0) {
        dDone = pts.slice(0, lastDone + 1).map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
      }
      svg.innerHTML = '<path d="' + d + '" fill="none" stroke="#dfe5f0" stroke-width="7" stroke-linecap="round" stroke-dasharray="1 13"/>' +
        (dDone ? '<path d="' + dDone + '" fill="none" stroke="' + SUBJ[S.subj].color + '" stroke-width="7" stroke-linecap="round" stroke-opacity=".5"/>' : '');
    }
    if (!path._scrolled) {
      path._scrolled = true;
      var target = 46 + (Math.min(cur, c.lec.length) - 1) * 90 - (window.innerHeight * 0.45);
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
    return D.questions.filter(function (q) {
      if (!ids.length) return false;
      if (!S.wrong[q.i]) return false;
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
        esc(q.q) + '<div class="wi-e">정답: ' + esc(q.o[q.a]) + '<br>' + esc(q.e) + '</div>';
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
      pool = D.questions.filter(function (q) { return opt.ids.indexOf(q.i) >= 0; });
      title = opt.title || '틀린 문제 다시 풀기';
    } else if (mode === 'wrong') {
      pool = poolWrong();
      title = '오답 집중 복습';
    } else if (mode === 'speed') {
      pool = S.mix ? D.questions.slice() : D.questions.filter(function (q) { return q.s === S.subj; });
      title = '⏱ 1분 스피드';
    } else {
      pool = S.mix ? D.subjects.reduce(function (a, s) { return a.concat(poolForSubject(s.id, mode)); }, []) : poolForSubject(S.subj, mode);
      title = mode === 'today' ? '오늘 들은 강의' : '누적 랜덤 복습';
    }
    if (!pool.length) {
      if (mode === 'wrong') toast('아직 오답이 없어요. 먼저 문제를 풀어 주세요.');
      else if (mode === 'lecture') toast('이 강의 문제가 아직 없어요. 다른 강의를 체크해 보세요.');
      else if (mode === 'ids') toast('다시 풀 문제가 없어요.');
      else toast('먼저 스테이지에서 들은 강의를 체크해 주세요.');
      return;
    }
    var n = mode === 'lecture' ? Math.min(pool.length, 6) : Math.min(pool.length, S.qlen);
    if (mode === 'ids') n = Math.min(pool.length, 20);
    if (mode === 'speed') n = Math.min(pool.length, 60);
    var items = qs(pool, n).map(function (q) {
      var order = q.o.map(function (_, i) { return i; });   // OX(2지선다)도 지원
      shuffle(order);
      return { q: q, order: order };
    });
    QS = { items: items, i: 0, ok: 0, combo: 0, maxCombo: 0, xp: 0, mode: mode, title: title, locked: false, sel: -1, opt: opt, wrongIds: [] };
    // 🩹 오답 복수전은 XP 2배, ⏱ 스피드는 60초 제한
    QS.xpMult = mode === 'wrong' ? 2 : 1;
    if (mode === 'speed') { QS.speed = true; QS.end = Date.now() + 60000; }
    document.body.style.overflow = 'hidden';
    document.body.classList.remove('fever');
    $('#quiz').classList.remove('hidden');
    $('#qCombo').innerHTML = '🔥 0';
    setCombo(0, 0);
    $('#qTitle').innerHTML = esc(title) + (QS.xpMult > 1 ? '<span class="revenge-chip">🩹 리벤지 XP ×2</span>' : '');
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

  function renderQ() {
    var it = QS.items[QS.i], q = it.q;
    QS.locked = false; QS.sel = -1;
    $('#qBar').style.width = (QS.i / QS.items.length * 100) + '%';
    $('#qCount').textContent = (QS.i + 1) + '/' + QS.items.length;
    var pb = $('#qProg');
    if (pb) { pb.classList.remove('pop'); void pb.offsetWidth; pb.classList.add('pop'); }
    var tag = qLabel(q);
    var badge = srcBadge(q);
    var keys = ['A', 'B', 'C', 'D'];
    var h = '<div class="q-tags"><span class="q-tag">' + esc(tag) + '</span><span class="q-src ' + badge.k + '">' + esc(badge.t) + '</span></div>' +
      '<h2 class="q-text">' + esc(q.q) + '</h2><div class="opts">';
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
  }

  function setCombo(n, bonus) {
    var el = $('#qCombo'); if (!el) return;
    el.innerHTML = '🔥 <b>' + n + '</b> COMBO' + (bonus ? ' <i>+' + bonus + 'XP</i>' : '');
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
    QS.locked = true;
    var it = QS.items[QS.i], q = it.q;
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
        comboBanner('🔥 FEVER ' + QS.combo + '연속! +' + (bonus || 0) + ' XP', true);
        sfx('crown');
      } else if (bonus) comboBanner(QS.combo + '연속 정답! +' + bonus + ' XP', QS.combo >= 5);
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
    save();
    renderHud(); renderQuest(); renderMascot(); renderChallenges(); renderPass(); renderDash();
    checkPromotion();
  }

  function fb(ok, q, gain, bonus) {
    var el = $('#qFb');
    el.classList.remove('hidden', 'ok', 'no');
    el.classList.add(ok ? 'ok' : 'no');
    el.querySelector('.fb-head').innerHTML = '<img class="fb-mascot" src="assets/' + (ok ? 'mascot-happy.png' : 'mascot-happy.png') + '" alt="">' +
      '<span>' + (ok ? '정답이에요!' + (bonus ? ' 콤보 보너스 🎉' : ' 🎉') : '아쉬워요 😢') + '</span>' +
      '<span class="fb-xp">+' + gain + ' XP</span>';
    el.querySelector('.fb-text').innerHTML = '<b>해설</b> · ' + esc(q.e);
    var b = $('#fbNext');
    b.textContent = QS.i + 1 >= QS.items.length ? '결과 보기' : '다음 문제';
  }

  function nextQ() {
    $('#qFb').classList.add('hidden');
    if (QS.i + 1 >= QS.items.length) return finish();
    QS.i++; renderQ();
  }

  function finish() {
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
      '<img class="sum-mascot" src="assets/mascot-win.png" alt="">' +
      '<h2>' + ok + ' / ' + tot + ' 정답</h2><p>' + msg + '</p>' +
      '<div class="streak-pop"><span>🔥</span><b>' + (S.streak.n || 0) + '일 연속</b><i>최고 ' + (S.streak.best || 0) + '일</i></div>' +
      '<div class="rows"><div class="row"><span>정답률</span><i>' + acc + '%</i></div>' +
      '<div class="row"><span>최고 콤보</span><i>🔥 ' + QS.maxCombo + '연속</i></div>' +
      '<div class="row"><span>얻은 XP</span><i>+' + (QS.xp + bonus) + ' XP</i></div>' +
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
      '<img class="sum-mascot" src="assets/mascot-win.png" alt="">' +
      '<h2>⚡ ' + ok + '문제!</h2><p>60초 동안 ' + ok + '문제를 맞혔어요' + (isBest ? ' — 최고 기록!' : '') + '</p>' +
      '<div class="speed-score">⏱ 60초 · 최고 ' + best + '문제</div>' +
      '<div class="rows"><div class="row"><span>최고 콤보</span><i>🔥 ' + QS.maxCombo + '연속</i></div>' +
      '<div class="row"><span>얻은 XP</span><i>+' + QS.xp + ' XP</i></div></div>' +
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
    document.body.classList.remove('fever');
    document.body.style.overflow = '';
    $('#quiz').classList.add('hidden');
    $('#qBody').innerHTML = '';
    $('#qFb').classList.add('hidden');
    QS = null;
  }

  function touchStreak() {
    var t = todayStr(), st = S.streak;
    if (st.last === t) return;
    st.n = st.last === ydayStr() ? (st.n || 0) + 1 : 1;
    st.last = t;
    st.best = Math.max(st.best || 0, st.n);
  }
  function touchDay() { dayRec(); }

  /* ---------- render all ---------- */
  function renderAll() {
    applyTheme(); renderHud(); renderSubtabs(); renderDday(); renderQuest(); renderMascot();
    renderChallenges(); renderPass(); renderDash(); renderWeek(); renderStage(); renderReview(); renderStats();
    renderTodayPlan();
  }

  /* ---------- events ---------- */
  $('#mute').onclick = function () {
    S.muted = !S.muted; save(); renderHud();
    if (!S.muted) sfx('tap');
  };
  $('#planBtn').onclick = function () { sfx('tap'); openPlanSheet(); };
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
    toast('체크·XP·오답이 이 기기 브라우저에 자동 저장돼요 · 🗺️ 학습 계획에서 파일로 내보낼 수 있어요');
  };
  $$('.tab').forEach(function (b) {
    b.onclick = function () {
      $$('.tab').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      var v = b.getAttribute('data-view');
      ['stage', 'review', 'stats'].forEach(function (k) {
        $('#view-' + k).classList.toggle('hidden', k !== v);
      });
      window.scrollTo({ top: 0 });
      if (v === 'stage') { $('#path')._scrolled = false; renderStage(); }
      if (v === 'review') renderReview();
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
  $('#qClose').onclick = function () { closeQuiz(); renderAll(); };
  $('#fbNext').onclick = nextQ;
  $('#stWrongGo').onclick = function () { startSession('wrong'); };
  $('#sheet').addEventListener('click', closeSheetIfBg);
  $('#reset').onclick = function () {
    if (!confirm('학습 기록(진도·XP·스트릭·오답)을 모두 지울까요? 지텔프 G-POINT 1~8 기본 체크도 다시 적용됩니다.')) return;
    S = {
      xp: 0, streak: { n: 0, last: '', best: 0 }, checked: {}, wrong: {}, ans: 0, ok: 0,
      muted: S.muted, subj: S.subj, course: {}, qlen: 10, mix: false, days: {},
      dday: DTARGET, ddayNote: '예상일', unit: {}, node: {}, qok: {}, gpSeeded: true, goal: { xp: 50, q: 10 },
      planLog: {}, planSubj: 'done'
    };
    D.subjects.forEach(function (s) { S.course[s.id] = s.defaultCourse || s.courses[0].id; });
    var seed = {};
    for (var gi = 1; gi <= 8; gi++) seed[gi] = todayStr();
    S.checked['gtp33'] = seed;
    save(); $('#path')._scrolled = false; renderAll(); toast('초기화했어요');
  };
  $('#installTip').onclick = function () {
    toast('사파리 하단 공유(⬆️) → "홈 화면에 추가"');
  };
  window.addEventListener('resize', function () {
    if (!$('#view-stage').classList.contains('hidden')) renderStage();
  });

  /* ---------- boot ---------- */
  $('#path')._scrolled = true;   // 첫 화면에서 D-Day·히어로가 가려지지 않게 자동 스크롤 생략
  renderAll();
  if (D.questions.length === 0) toast('문제 데이터를 불러오지 못했어요');
})();
