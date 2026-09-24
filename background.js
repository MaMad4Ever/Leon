/* ============================================================
   Leon – background.js
   ============================================================ */

const TIMEOUT_MS = 8000;
const BODY_LIMIT = 64 * 1024;
const KEY = "leon:state";

let running = false;

const readState  = async () => (await browser.storage.session.get(KEY))[KEY] || null;
const writeState = (s) => browser.storage.session.set({ [KEY]: s });

/* ------------------------------------------------------------
   Body reader
   ------------------------------------------------------------ */

async function readBody(res) {
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  const len = Number(res.headers.get("content-length")) || 0;

  const isText =
    /text|json|xml|javascript|html|php|^$/.test(ct) ||
    (ct.includes("octet-stream") && len > 0 && len < 256 * 1024);

  if (!isText || !res.body) return "";

  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;

  try {
    while (total < BODY_LIMIT) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
  return new TextDecoder().decode(buf);
}

/* ------------------------------------------------------------
   Probe
   ------------------------------------------------------------ */

async function probe(path, baseUrl) {
  const url = new URL(path, baseUrl).href;
  const t0 = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      cache: "no-store",
      credentials: "omit",
      redirect: "follow",
      signal: ctrl.signal
    });

    const body = await readBody(res);
    return {
      path, url,
      finalUrl: res.url,
      redirected: res.redirected,
      status: res.status,
      size: Number(res.headers.get("content-length")) || new Blob([body]).size,
      contentType: res.headers.get("content-type") || "",
      elapsed: Math.round(performance.now() - t0),
      body
    };
  } catch (e) {
    return {
      path, url, finalUrl: url, redirected: false,
      status: "ERR", size: 0, contentType: "",
      elapsed: Math.round(performance.now() - t0),
      body: "", error: e.name === "AbortError" ? "timeout" : String(e)
    };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------
   Analysis
   ------------------------------------------------------------ */

const PATTERNS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/,                    "private key"],
  [/\bAKIA[0-9A-Z]{16}\b/,                                  "AWS access key"],
  [/\b(?:api[_-]?key|apikey|secret|passwd|password|token)\b\s*[:=]\s*["']?[^\s"']{6,}/i, "credential"],
  [/\b(?:DB|DATABASE)_(?:PASSWORD|PASS|USER|HOST|NAME)\b/i, "DB config"],
  [/\b(?:mysql|mariadb|postgres|postgresql|mongodb(?:\+srv)?|redis):\/\/[^\s"']+/i, "connection string"],
  [/"(?:private_key|client_secret|refresh_token)"\s*:/i,    "secret in JSON"],
  [/\[core\][\s\S]{0,200}repositoryformatversion\s*=/i,     "git config"],
  [/^ref:\s*refs\/(?:heads|remotes)\//m,                    "git HEAD"],
  [/\[remote\s+"[^"]+"\][\s\S]{0,200}url\s*=/i,             "git remote"],
  [/^[0-9a-f]{40}\s+(?:refs\/|HEAD)/m,                      "git packed-refs"]
];

const SOFT_404 = /page\s+not\s+found|does\s+not\s+exist|nothing\s+to\s+see\s+here|the\s+page\s+you\s+(?:are\s+looking\s+for|requested)/i;

function analyze(r) {
  if (r.status === "ERR")  return { interesting: false, reason: r.error || "failed" };
  if (r.status === 0)      return { interesting: false, reason: "opaque" };

  if (r.redirected) {
    try {
      const a = new URL(r.url).pathname.replace(/\/+$/, "");
      const b = new URL(r.finalUrl).pathname.replace(/\/+$/, "");
      if (a !== b) return { interesting: false, reason: "redirect → " + b };
    } catch {}
  }

  if (r.status === 200 && SOFT_404.test(r.body))
    return { interesting: false, reason: "soft 404" };

  if (r.status === 200 && r.size > 0) {
    if (!r.body) return { interesting: false, reason: "binary or empty body" };
    const hit = PATTERNS.find(([re]) => re.test(r.body));
    return { interesting: true, reason: hit ? hit[1] : "readable content" };
  }

  if (r.status === 206) return { interesting: true, reason: "partial content" };
  if (r.status === 401) return { interesting: true, reason: "auth required" };
  if (r.status === 403) return { interesting: true, reason: "forbidden" };

  return { interesting: false, reason: "" };
}

/* ------------------------------------------------------------
   Scan loop
   ------------------------------------------------------------ */

const slim = (r) => ({ ...r, body: undefined });

async function runScan(baseUrl, paths) {
  running = true;

  const results = [];
  await writeState({
    baseUrl, running: true,
    status: `Scanning 0/${paths.length}...`,
    results: []
  });

  try {
    for (let i = 0; i < paths.length; i++) {
      const r = await probe(paths[i], baseUrl);
      r.analysis = analyze(r);
      results.push(r);

      await writeState({
        baseUrl, running: true,
        status: `Scanning ${i + 1}/${paths.length}: ${paths[i]}`,
        results: results.map(slim)
      });
    }

    const n = results.filter((r) => r.analysis.interesting).length;
    await writeState({
      baseUrl, running: false,
      status: `Finished. ${n} potential finding(s) from ${results.length} paths.`,
      results: results.map(slim)
    });

  } catch (e) {
    await writeState({
      baseUrl, running: false,
      status: `Error: ${e.message}`,
      results: results.map(slim)
    });
  } finally {
    running = false;
  }
}

/* ------------------------------------------------------------
   Messages
   ------------------------------------------------------------ */

browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.action === "scan") {
    if (running) { sendResponse({ ok: false, error: "already running" }); return; }
    runScan(msg.baseUrl, msg.paths);
    sendResponse({ ok: true });
  }
  if (msg?.action === "reset") {
    browser.storage.session.remove(KEY);
    sendResponse({ ok: true });
  }
});