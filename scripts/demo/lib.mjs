// 録画用の共通部品（demo-video-export スキルの方式: Playwright の recordVideo ＋ VOICEVOX ナレーション ＋ 字幕）。
// 字幕は ffmpeg に libass が無いため、ページ内のオーバーレイとして描画して動画に焼き込む。

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "/Users/hiromu.umeda/construct-pro-next/node_modules/playwright/index.mjs";

export const DRY = process.env.DEMO_DRY === "1";
export const BASE = process.env.DEMO_BASE ?? "http://localhost:3030";
export const VV = "http://127.0.0.1:50021";
export const SPEAKER = 11; // 玄野武宏（ノーマル）
export const OUT_DIR = "/Users/hiromu.umeda/construct-pro-next/docs/demo";
const WORK = path.dirname(new URL(import.meta.url).pathname);
const AUDIO_DIR = path.join(WORK, "audio");
fs.mkdirSync(AUDIO_DIR, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

/** 実時間の待ち（ナレーションの長さなど、タイミング計測に使う）。 */
export const rawSleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** 操作の間の待ち。画面の遷移を軽快にするため、台本に書いた待ち時間を圧縮する（下限120ms）。 */
export const PACE = Number(process.env.DEMO_PACE ?? 0.35);
export const sleep = (ms) => rawSleep(Math.max(120, ms * PACE));
export const findings = [];
export function chk(label, ok, detail = "") {
  findings.push({ label, ok: Boolean(ok), detail });
  console.log(
    `${ok ? "  OK " : "  NG "} ${label}${detail ? ` — ${detail}` : ""}`
  );
  return Boolean(ok);
}

// ---- 音声（VOICEVOX）----
function wavDuration(file) {
  const r = spawnSync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "csv=p=0",
    file,
  ]);
  return Number(r.stdout.toString().trim());
}
// 軽快に聞こえる速さ（約8文字/秒）。句読点の間も詰める。
const SPEED = Number(process.env.DEMO_SPEED ?? 1.3);
const PAUSE = 0.55;
const ttsCache = new Map();
export function tts(text) {
  if (!ttsCache.has(text)) {
    ttsCache.set(text, ttsOnce(text));
  }
  return ttsCache.get(text);
}
async function ttsOnce(text) {
  const key = crypto
    .createHash("md5")
    .update(`v2|${SPEAKER}|${SPEED}|${PAUSE}|${text}`)
    .digest("hex");
  const file = path.join(AUDIO_DIR, `${key}.wav`);
  if (fs.existsSync(file)) {
    return { file, dur: wavDuration(file) };
  }
  const q = await (
    await fetch(
      `${VV}/audio_query?speaker=${SPEAKER}&text=${encodeURIComponent(text)}`,
      { method: "POST" }
    )
  ).json();
  q.speedScale = SPEED;
  q.pauseLengthScale = PAUSE;
  q.prePhonemeLength = 0.05;
  q.postPhonemeLength = 0.1;
  const buf = Buffer.from(
    await (
      await fetch(`${VV}/synthesis?speaker=${SPEAKER}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(q),
      })
    ).arrayBuffer()
  );
  fs.writeFileSync(file, buf);
  return { file, dur: wavDuration(file) };
}

function splitSubtitle(text, max = 28) {
  const parts = text.split(/(?<=[。、])/);
  const out = [];
  let cur = "";
  for (const p of parts) {
    if ([...(cur + p)].length > max && cur) {
      out.push(cur);
      cur = p;
    } else {
      cur += p;
    }
  }
  if (cur) {
    out.push(cur);
  }
  return out;
}

const INIT = `
(() => {
  const css = document.createElement('style');
  css.textContent = 'nextjs-portal,[data-nextjs-dev-tools-button],#__next-build-watcher{display:none!important}'
    + '#__cur{position:fixed;z-index:2147483647;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;background:rgba(255,69,0,.28);border:2px solid #ff4500;pointer-events:none;left:-50px;top:-50px;transition:transform .12s}'
    + '#__cur.down{transform:scale(1.7)}'
    + '#__sub{position:fixed;z-index:2147483646;left:50%;bottom:26px;transform:translateX(-50%);max-width:78%;background:rgba(0,0,0,.66);color:#fff;font:600 21px/1.5 "Hiragino Sans","Noto Sans JP",sans-serif;padding:8px 18px;border-radius:8px;text-align:center;pointer-events:none;white-space:pre-wrap;display:none}';
  const add = () => {
    if (document.getElementById('__cur')) return;
    document.head.appendChild(css);
    const c = document.createElement('div'); c.id = '__cur'; document.body.appendChild(c);
    const s = document.createElement('div'); s.id = '__sub'; document.body.appendChild(s);
    document.addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    document.addEventListener('mousedown', () => c.classList.add('down'), true);
    document.addEventListener('mouseup', () => c.classList.remove('down'), true);
    window.__setSub = (t) => { s.textContent = t || ''; s.style.display = t ? 'block' : 'none'; };
  };
  if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
  setInterval(() => document.querySelectorAll('nextjs-portal').forEach((n) => n.remove()), 200);
  new MutationObserver(() => { if (document.body && !document.getElementById('__cur')) add(); }).observe(document.documentElement || document, { childList: true, subtree: !document.documentElement });
})();
`;

export class Video {
  constructor(name, opts = {}) {
    this.name = name;
    this.segments = [];
    this.viewport = opts.viewport ?? { width: 1440, height: 900 };
    this.slowMo = opts.slowMo ?? 30;
    this.workDir = path.join(WORK, "rec", name);
    this.storageState = opts.storageState;
    this.subText = "";
  }
  async open() {
    fs.rmSync(this.workDir, { recursive: true, force: true });
    fs.mkdirSync(this.workDir, { recursive: true });
    this.browser = await chromium.launch({
      channel: "chromium",
      slowMo: DRY ? 0 : this.slowMo,
    });
    this.context = await this.browser.newContext({
      storageState: this.storageState,
      viewport: this.viewport,
      ...(DRY
        ? {}
        : { recordVideo: { dir: this.workDir, size: this.viewport } }),
      locale: "ja-JP",
      timezoneId: "Asia/Tokyo",
    });
    await this.context.addInitScript(INIT);
    this.page = await this.context.newPage();
    // 新しいheadless Chromiumでは elementHandle.type が固まることがあるので、クリック＋keyboard.type に置き換える
    const LP = Object.getPrototypeOf(this.page.locator("body"));
    if (!LP.__patched) {
      LP.__patched = true;
      LP.pressSequentially = async function (t, o) {
        await this.click();
        await this.page().keyboard.type(t, {
          delay: Math.min(35, (o?.delay ?? 50) * 0.4),
        });
      };
    }
    this.page.setDefaultTimeout(DRY ? 6000 : 8000);
    this.t0 = Date.now();
    this.page.on("dialog", (d) => d.accept().catch(() => {}));
    this.page.on("pageerror", (e) =>
      console.log("  [pageerror]", String(e.message).slice(0, 160))
    );
    // ページが固まっていないかを見張る（固まったら、その旨を出力する）
    this.watch = setInterval(async () => {
      const ok = await Promise.race([
        this.page
          .evaluate(() => 1)
          .then(() => true)
          .catch(() => false),
        new Promise((r) => setTimeout(() => r(false), 6000)),
      ]);
      if (!ok) {
        console.log("  [WATCH] ページが応答しません", this.page.url());
      }
    }, 15_000);
    // ページ遷移で消えても、字幕は現在の文を出し続ける
    this.subTimer = setInterval(() => {
      this.page
        .evaluate((t) => window.__setSub?.(t), this.subText)
        .catch(() => {});
    }, 200);
    return this.page;
  }
  now() {
    return Date.now() - this.t0;
  }
  async sub(text) {
    this.subText = text;
    await this.page.evaluate((t) => window.__setSub?.(t), text).catch(() => {});
  }
  /** ナレーションを話しながら操作する。操作と音声の長いほうの間、その場面に留まる。 */
  async say(text, action) {
    if (DRY) {
      console.log(`- ${text.slice(0, 40)}`);
      tts(text).catch(() => {}); // 本番の録画に備えて、音声を先に作っておく
      try {
        if (action) {
          await Promise.race([
            action(this.page),
            new Promise((_, rej) =>
              setTimeout(() => rej(new Error("STEP TIMEOUT 75s")), 75_000)
            ),
          ]);
        }
      } catch (e) {
        if (String(e.message).includes("STEP TIMEOUT")) {
          const alive = await Promise.race([
            this.page
              .evaluate("document.readyState + ' ' + location.href")
              .catch((x) => `evalerr ${x.message.slice(0, 60)}`),
            sleep(4000).then(() => "JS-UNRESPONSIVE"),
          ]);
          console.log("  [HANG] page state:", alive);
          await Promise.race([
            this.page
              .screenshot({
                path: `/tmp/hang-${this.name}-${Date.now()}.png`,
                timeout: 4000,
              })
              .catch(() => {}),
            sleep(5000),
          ]);
        }
        console.log("  !! 操作エラー:", String(e.message).split("\n")[0]);
        chk(
          `操作: ${text.slice(0, 24)}`,
          false,
          String(e.message).split("\n")[0]
        );
      }
      await sleep(300);
      return;
    }
    const { file, dur } = await tts(text);
    const start = this.now();
    this.segEnd = start + dur * 1000;
    const chunks = splitSubtitle(text);
    const total = chunks.reduce((n, c) => n + [...c].length, 0);
    const subs = (async () => {
      for (const c of chunks) {
        await this.sub(c);
        await rawSleep((dur * 1000 * [...c].length) / total);
      }
    })();
    let actMs = 0;
    const act = (async () => {
      const t = Date.now();
      if (action) {
        await action(this.page);
      }
      actMs = Date.now() - t;
    })();
    let err;
    await Promise.all([
      act.catch((e) => {
        err = e;
      }),
      subs,
      rawSleep(dur * 1000),
    ]);
    await this.sub("");
    this.segments.push({ start, end: this.now(), text, file, dur });
    // 操作がナレーションより4秒以上長引くと、画面が止まって見える。テンポ不良として不合格にする（自動で撮り直す）
    if (actMs > dur * 1000 + 4000) {
      chk(
        `テンポ: ${text.slice(0, 24)}（操作が${(actMs / 1000).toFixed(1)}秒、音声は${dur.toFixed(1)}秒）`,
        false
      );
    }
    if (err) {
      console.log("  !! 操作エラー:", String(err.message).split("\n")[0]);
      chk(
        `操作: ${text.slice(0, 24)}`,
        false,
        String(err.message).split("\n")[0]
      );
    }
  }
  /** ナレーションの終わり近くまで、この場面に留まる（画面の説明が終わってから次の操作に移るために使う）。 */
  async untilEnd(offsetMs = -500) {
    if (DRY) {
      return;
    }
    const w = this.segEnd + offsetMs - this.now();
    if (w > 0) {
      await rawSleep(w);
    }
  }
  async quiet(ms) {
    await rawSleep(Math.max(80, ms * 0.25));
  }
  async close() {
    clearInterval(this.subTimer);
    clearInterval(this.watch);
    if (DRY) {
      await this.context.close();
      await this.browser.close();
      return;
    }
    const video = this.page.video();
    await this.context.close();
    await this.browser.close();
    const webm = await video.path();
    const out = path.join(OUT_DIR, `${this.name}.mp4`);
    // 音声: 各ナレーションを、実測の開始時刻に配置して1本に合成する
    const args = ["-y", "-i", webm];
    this.segments.forEach((s) => args.push("-i", s.file));
    let filter = "";
    this.segments.forEach((s, i) => {
      filter += `[${i + 1}:a]adelay=${Math.round(s.start)}|${Math.round(s.start)}[a${i}];`;
    });
    filter +=
      this.segments.map((_, i) => `[a${i}]`).join("") +
      `amix=inputs=${this.segments.length}:duration=longest:normalize=0[aout]`;
    args.push(
      "-filter_complex",
      filter,
      "-map",
      "0:v",
      "-map",
      "[aout]",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "veryfast",
      "-crf",
      "26",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-shortest",
      out
    );
    const r = spawnSync("ffmpeg", args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    if (r.status !== 0) {
      throw new Error("ffmpeg failed: " + r.stderr.toString().slice(-600));
    }
    // 字幕テキスト（SRT）も残す
    let srt = "";
    let n = 1;
    const ts2 = (ms) => {
      const d = new Date(ms);
      return d.toISOString().slice(11, 23).replace(".", ",");
    };
    for (const s of this.segments) {
      const chunks = splitSubtitle(s.text);
      const tot = chunks.reduce((a, c) => a + [...c].length, 0);
      let t = s.start;
      for (const c of chunks) {
        const len = ((s.end - s.start) * [...c].length) / tot;
        srt += `${n++}\n${ts2(t)} --> ${ts2(t + len)}\n${c}\n\n`;
        t += len;
      }
    }
    fs.writeFileSync(path.join(OUT_DIR, `${this.name}.srt`), srt);
    fs.rmSync(this.workDir, { recursive: true, force: true });
    const dur = Number(
      spawnSync("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "csv=p=0",
        out,
      ]).stdout.toString()
    );
    console.log(`=> ${out} (${dur.toFixed(1)}s, ${this.segments.length}場面)`);
    return { out, dur };
  }
}

// ---- 操作の補助 ----
/** APIでログインし、Cookieを保存した状態（storageState）を作る。録画の冒頭でログインを見せない動画に使う。 */
export async function authState(email, password = "testpass123") {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`login failed ${email}: ${res.status}`);
  }
  const cookies = res.headers.getSetCookie().map((c) => {
    const [kv, ...attrs] = c.split(";").map((x) => x.trim());
    const i = kv.indexOf("=");
    return {
      name: kv.slice(0, i),
      value: kv.slice(i + 1),
      domain: new URL(BASE).hostname,
      path: "/",
      httpOnly: attrs.some((a) => /^httponly/i.test(a)),
      secure: false,
      sameSite: "Lax",
    };
  });
  return { cookies, origins: [] };
}
export async function login(page, email, password = "testpass123") {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "ログイン" }).click();
}
export async function waitIdle(page, ms = 800) {
  await page
    .waitForLoadState("networkidle", { timeout: 15_000 })
    .catch(() => {});
  await sleep(ms);
}
export function saveFindings(name) {
  fs.writeFileSync(
    path.join(WORK, `findings-${name}.json`),
    JSON.stringify(findings, null, 2)
  );
}

// ---- 2段階認証（TOTP）----
import * as OTPAuth from "/Users/hiromu.umeda/construct-pro-next/node_modules/otpauth/dist/otpauth.esm.js";
export function totp(secretBase32, offsetSteps = 0) {
  const t = new OTPAuth.TOTP({
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
  return t.generate({ timestamp: Date.now() + offsetSteps * 30_000 });
}
/** 条件が満たされるまで待ってから確認する（画面の反映待ちで誤判定しないため）。 */
export async function chkWait(label, fn, timeout = 9000) {
  const t0 = Date.now();
  let ok = false;
  let detail = "";
  while (Date.now() - t0 < timeout) {
    try {
      const r = await fn();
      ok = r === true || (r && r.ok);
      detail = (r && r.detail) || "";
    } catch (e) {
      ok = false;
      detail = String(e.message).split("\n")[0];
    }
    if (ok) {
      break;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return chk(label, ok, detail);
}
export const text = async (page, sel = "main") =>
  (await page.locator(sel).first().innerText()).replace(/\n{2,}/g, "\n");

/** 動画スクリプト共通の小道具（選択・ダイアログを閉じる）。 */
export function helpers(page) {
  const rowOf = (t) => page.locator("tbody tr", { hasText: t }).first();
  const pick = async (combo, name) => {
    await combo.click();
    await sleep(400);
    await page.getByRole("option", { name, exact: true }).first().click();
    await sleep(300);
  };
  const closeDlg = async () => {
    for (let i = 0; i < 3; i++) {
      const d = page.locator("[role=dialog],[role=alertdialog]").first();
      if (!(await d.count())) {
        return;
      }
      const btn = d
        .getByRole("button", { name: /^(閉じる|キャンセル|Close)$/ })
        .first();
      if (await btn.count()) {
        await btn.click({ force: true, timeout: 3000 }).catch(() => {});
      } else {
        await page.keyboard.press("Escape");
      }
      await sleep(900);
    }
  };
  return { rowOf, pick, closeDlg };
}
