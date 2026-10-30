/* 결과를 클립보드에 복사 (확장 프로그램은 화면이 없어서 여기서) */
chrome.runtime.onMessage.addListener((m, _s, reply) => {
  if (!m || m.type !== "copy") return;
  const t = document.getElementById("t");
  t.value = m.text; t.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch (e) {}
  reply({ ok: ok });
});
