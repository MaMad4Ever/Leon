/* ============================================================
   Leon – popup.js
   ============================================================ */

const KEY = "leon:state";
let baseUrl = "";

const $ = (id) => document.getElementById(id);
const targetEl  = $("target");
const statusEl  = $("status");
const resultsEl = $("results");
const scanBtn   = $("scan");

/* ------------------------------------------------------------
   Wordlist
   ------------------------------------------------------------ */

async function loadWordlist() {
  const res = await fetch(browser.runtime.getURL("Wordlists/exposures.txt"));
  if (!res.ok) throw new Error(`wordlist ${res.status}`);

  const seen = new Set();
  return (await res.text())
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => (l.startsWith("/") ? l : "/" + l))
    .filter((p) => !seen.has(p) && seen.add(p));
}

/* ------------------------------------------------------------
   Render
   ------------------------------------------------------------ */

const esc = (v) =>
  String(v).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));

function render(state) {
  if (!state) {
    statusEl.textContent = "Ready.";
    resultsEl.innerHTML = "";
    scanBtn.disabled = !baseUrl;
    return;
  }

  statusEl.textContent = state.status || "Ready.";
  scanBtn.disabled = state.running || !baseUrl;

  const findings = (state.results || []).filter((r) => r.analysis?.interesting);

  if (!findings.length) {
    resultsEl.innerHTML = state.running
      ? ""
      : '<div class="empty">No obvious exposures found.</div>';
    return;
  }

  resultsEl.innerHTML = findings.map((f) => `
    <div class="result" data-url="${esc(f.url)}">
      <div class="row">
        <span class="path">${esc(f.path)}</span>
        <span class="badge status">${esc(f.status)}</span>
      </div>
      <div class="meta">
        ${f.size} bytes · ${esc(f.contentType || "unknown")} · ${f.elapsed} ms · ${esc(f.analysis.reason)}
      </div>
    </div>`).join("");

  for (const el of resultsEl.querySelectorAll(".result")) {
    el.onclick = () => browser.tabs.create({ url: el.dataset.url });
  }
}

async function refresh() {
  const o = await browser.storage.session.get(KEY);
  const state = o[KEY];

  if (state && state.baseUrl !== baseUrl) {
    render(null);
    return;
  }
  render(state);
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "session" || !changes[KEY]) return;
  const s = changes[KEY].newValue;
  if (s && s.baseUrl !== baseUrl) return;
  render(s);
});

/* ------------------------------------------------------------
   Init
   ------------------------------------------------------------ */

(async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

  try {
    const parsed = new URL(tab?.url || "");
    if (!/^https?:$/.test(parsed.protocol)) throw 0;

    baseUrl = parsed.origin;
    targetEl.textContent = baseUrl;
  } catch {
    targetEl.textContent = "Unsupported page";
    statusEl.textContent = "Open an HTTP(S) website first.";
    scanBtn.disabled = true;
    return;
  }

  await refresh();
})();

/* ------------------------------------------------------------
   Scan
   ------------------------------------------------------------ */

scanBtn.onclick = async () => {
  if (!baseUrl) return;

  scanBtn.disabled = true;
  statusEl.textContent = "Loading wordlist...";

  try {
    const paths = await loadWordlist();
    if (!paths.length) throw new Error("wordlist is empty");

    await browser.runtime.sendMessage({ action: "scan", baseUrl, paths });
  } catch (e) {
    statusEl.textContent = `Error: ${e.message}`;
    scanBtn.disabled = false;
  }
};