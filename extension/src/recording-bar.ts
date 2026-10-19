// Recording controls and on-page tools for the tab being recorded.
//
// The controls (stop, pause/resume, time, pen, blur) live in a small floating Picture-in-Picture window. That window
// is outside the tab, so the controls never show up in the recording. Chrome only opens it on a click in the page, so
// a recording starts with a "Start recording" card on the page, which is gone before the recorder starts. When the
// page navigates, its floating window closes with it; the controls come back on the next click in the page. Where
// Picture-in-Picture isn't available, the controls sit on the page instead (and are recorded).
//
// The pen and blur work on the page itself, so what they draw and hide is recorded.

import { recordedMs, type BackgroundMessage, type RecordingState, type TabMessage } from "./shared/types";

const HOST_ID = "uptrack-recording-bar";
const INK = "#f43f5e";
/** Pen strokes stay this long after they're drawn, then fade out. */
const STROKE_MS = 2500;
const FADE_MS = 700;

const ICONS = {
  stop: '<svg viewBox="0 0 20 20"><rect x="3.5" y="3.5" width="13" height="13" rx="3" fill="#f43f5e"/></svg>',
  pause: '<svg viewBox="0 0 20 20" fill="currentColor"><rect x="5" y="4" width="3.5" height="12" rx="1.2"/><rect x="11.5" y="4" width="3.5" height="12" rx="1.2"/></svg>',
  resume: '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M6.5 4.2a1 1 0 0 1 1.5-.86l8.2 5.03a1 1 0 0 1 0 1.71L8 15.12a1 1 0 0 1-1.5-.86V4.2Z"/></svg>',
  pen: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m13.5 3.5 3 3L7 16H4v-3l9.5-9.5Z"/><path d="M3 18.5c2.5-1.2 5-1.2 7.5 0s5 1.2 7.5 0"/></svg>',
  blur: '<svg viewBox="0 0 20 20"><g fill="currentColor"><rect x="3" y="3" width="4.6" height="4.6" rx="1"/><rect x="12.4" y="3" width="4.6" height="4.6" rx="1" opacity=".55"/><rect x="7.7" y="7.7" width="4.6" height="4.6" rx="1" opacity=".8"/><rect x="3" y="12.4" width="4.6" height="4.6" rx="1" opacity=".4"/><rect x="12.4" y="12.4" width="4.6" height="4.6" rx="1"/><rect x="7.7" y="3" width="4.6" height="4.6" rx="1" opacity=".25"/><rect x="3" y="7.7" width="4.6" height="4.6" rx="1" opacity=".7"/><rect x="12.4" y="7.7" width="4.6" height="4.6" rx="1" opacity=".3"/><rect x="7.7" y="12.4" width="4.6" height="4.6" rx="1" opacity=".6"/></g></svg>',
  grip: '<svg viewBox="0 0 20 20" fill="currentColor"><circle cx="7" cy="5" r="1.4"/><circle cx="13" cy="5" r="1.4"/><circle cx="7" cy="10" r="1.4"/><circle cx="13" cy="10" r="1.4"/><circle cx="7" cy="15" r="1.4"/><circle cx="13" cy="15" r="1.4"/></svg>',
};

/** The page layer: pen ink, blurs, and the start card. */
const PAGE_CSS = `
  .ink { position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: none; }
  .ink.on { pointer-events: auto; cursor: crosshair; }
  .catcher { position: fixed; inset: 0; cursor: crosshair; }
  .blurs { position: absolute; top: 0; left: 0; }
  .blurred { position: absolute; border-radius: 6px; background: rgb(255 255 255 / 0.06);
    backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); pointer-events: none; }
  .preview { position: fixed; border: 1.5px dashed #fff; border-radius: 6px; outline: 1px dashed rgb(0 0 0 / 0.6);
    background: rgb(255 255 255 / 0.1); pointer-events: none; }
  .ready { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); display: flex; align-items: center; gap: 18px;
    padding: 12px 12px 12px 18px; border: 1px solid rgb(255 255 255 / 0.12); border-radius: 14px; background: rgb(24 24 27 / 0.96);
    box-shadow: 0 12px 32px rgb(0 0 0 / 0.35); color: #fff; font: 14px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif; }
  .ready p { margin: 0; display: grid; gap: 2px; }
  .ready small { color: rgb(255 255 255 / 0.6); font-size: 12px; }
  .ready .actions { display: flex; gap: 8px; }
  .ready button { all: unset; padding: 8px 14px; border-radius: 9px; font-weight: 600; cursor: pointer; }
  .ready .start { background: #f43f5e; color: #fff; }
  .ready .start:hover { background: #e11d48; }
  .ready .cancel { color: rgb(255 255 255 / 0.8); }
  .ready .cancel:hover { background: rgb(255 255 255 / 0.1); }
  .ready button:focus-visible { outline: 2px solid #fff; }
`;

/** The controls, in their floating window (or on the page as a fallback). */
const BAR_CSS = `
  .bar { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); display: flex; align-items: center; gap: 2px;
    padding: 6px 6px 6px 8px; border: 1px solid rgb(255 255 255 / 0.12); border-radius: 14px; background: rgb(24 24 27 / 0.94);
    box-shadow: 0 12px 32px rgb(0 0 0 / 0.35); color: #fff; font: 500 14px/1 system-ui, -apple-system, "Segoe UI", sans-serif;
    user-select: none; -webkit-user-select: none; box-sizing: border-box; }
  .bar.floating { position: static; transform: none; width: 100%; height: 100%; justify-content: center; border: 0; border-radius: 0;
    box-shadow: none; padding: 0 8px; }
  button { all: unset; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 9px; cursor: pointer; color: #fff; }
  button:hover { background: rgb(255 255 255 / 0.1); }
  button[aria-pressed="true"] { background: rgb(255 255 255 / 0.2); }
  button:focus-visible { outline: 2px solid #fff; outline-offset: -2px; }
  button:disabled { opacity: 0.5; cursor: wait; }
  svg { width: 19px; height: 19px; }
  .stop svg { width: 22px; height: 22px; }
  .time { min-width: 52px; padding: 0 6px; text-align: center; font-variant-numeric: tabular-nums; letter-spacing: 0.02em; }
  .paused .time { color: #fbbf24; }
  .sep { width: 1px; height: 20px; margin: 0 4px; background: rgb(255 255 255 / 0.18); }
  .grip { display: grid; place-items: center; width: 18px; height: 34px; margin-left: 2px; color: rgb(255 255 255 / 0.45); cursor: grab; }
  .grip:active { cursor: grabbing; }
`;

type Tool = "pen" | "blur" | null;
interface Stroke {
  points: [number, number][];
  endedAt: number | null;
}
interface Controls {
  bar: HTMLElement;
  time: HTMLElement;
  pause: HTMLButtonElement;
  stop: HTMLButtonElement;
  tools: HTMLButtonElement[];
  /** The floating window, when the controls are in one. */
  window: Window | null;
  remove(): void;
}

type PictureInPicture = { requestWindow(options: { width: number; height: number }): Promise<Window> };

/** False once the extension is reloaded or updated: this copy can't reach it any more. */
function connected(): boolean {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

async function send(message: BackgroundMessage): Promise<{ recording?: RecordingState | null } | null> {
  if (!connected()) return null;
  try {
    return await chrome.runtime.sendMessage(message);
  } catch {
    return null;
  }
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

if (!document.getElementById(HOST_ID)) void setUp();

async function setUp() {
  let state: RecordingState | null = (await send({ type: "state" }))?.recording ?? null;
  if (!state || document.getElementById(HOST_ID)) return;

  const host = document.createElement("div");
  host.id = HOST_ID;
  // Zero-sized at the document's top-left corner: blurs placed in it scroll with the page.
  host.style.cssText = "position:absolute;top:0;left:0;width:0;height:0;margin:0;padding:0;border:0;z-index:2147483647;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${PAGE_CSS}</style>
    <div class="blurs"></div>
    <canvas class="ink"></canvas>
    <div class="catcher" hidden></div>
    <div class="preview" hidden></div>`;
  document.documentElement.append(host);

  const q = <T extends Element>(selector: string) => root.querySelector(selector) as T;
  const canvas = q<HTMLCanvasElement>(".ink");
  const catcher = q<HTMLDivElement>(".catcher");
  const preview = q<HTMLDivElement>(".preview");
  const blurs = q<HTMLDivElement>(".blurs");
  let controls: Controls | null = null;
  let ended = false;

  // ---- Time and pause ----

  const showState = () => {
    if (!state || !controls) return;
    const s = Math.floor(recordedMs(state) / 1000);
    controls.time.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    const paused = state.pausedAt !== null;
    controls.bar.classList.toggle("paused", paused);
    controls.pause.innerHTML = paused ? ICONS.resume : ICONS.pause;
    controls.pause.title = paused ? "Resume" : "Pause";
    controls.pause.setAttribute("aria-label", paused ? "Resume recording" : "Pause recording");
  };
  const ticker = setInterval(() => {
    if (!connected()) return teardown();
    showState();
  }, 250);

  const onMessage = (message: TabMessage) => {
    if (message?.type === "recording-ended") teardown();
    else if (message?.type === "recording-state") {
      state = message.recording;
      showState();
    }
  };
  chrome.runtime.onMessage.addListener(onMessage);

  // ---- The controls ----

  /** Opens the floating window; needs a click in the page just before. Null where it isn't available. */
  async function openFloatingWindow(): Promise<Window | null> {
    const pip = (window as unknown as { documentPictureInPicture?: PictureInPicture }).documentPictureInPicture;
    if (!pip) return null;
    try {
      const w = await pip.requestWindow({ width: 320, height: 64 });
      w.document.title = "UpTrack recording";
      return w;
    } catch {
      return null;
    }
  }

  function buildControls(floating: Window | null): Controls {
    const doc = floating?.document ?? document;
    const container: ParentNode = floating ? doc.body : root;
    const style = doc.createElement("style");
    style.textContent = floating ? `${BAR_CSS} html, body { margin: 0; height: 100%; background: rgb(24 24 27); }` : BAR_CSS;
    const bar = doc.createElement("div");
    bar.className = floating ? "bar floating" : "bar";
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", "UpTrack recording");
    bar.innerHTML = `
      <button class="stop" title="Stop and review" aria-label="Stop recording">${ICONS.stop}</button>
      <button class="pause" title="Pause" aria-label="Pause recording">${ICONS.pause}</button>
      <span class="time" aria-live="off">0:00</span>
      <span class="sep"></span>
      <button class="tool" data-tool="pen" title="Draw on the page" aria-pressed="false" aria-label="Pen">${ICONS.pen}</button>
      <button class="tool" data-tool="blur" title="Blur part of the page: drag over it. Click a blur to remove it." aria-pressed="false" aria-label="Blur">${ICONS.blur}</button>
      ${floating ? "" : `<span class="grip" title="Drag to move">${ICONS.grip}</span>`}`;
    (floating ? doc.head : container).append(style);
    container.append(bar);

    const made: Controls = {
      bar,
      time: bar.querySelector(".time")!,
      pause: bar.querySelector(".pause")!,
      stop: bar.querySelector(".stop")!,
      tools: [...bar.querySelectorAll<HTMLButtonElement>(".tool")],
      window: floating,
      remove() {
        if (floating) floating.close();
        else {
          style.remove();
          bar.remove();
        }
      },
    };

    made.pause.addEventListener("click", async () => {
      made.pause.disabled = true;
      const result = await send({ type: state?.pausedAt != null ? "record-resume" : "record-pause" });
      if (result?.recording) state = result.recording;
      made.pause.disabled = false;
      showState();
    });
    made.stop.addEventListener("click", async () => {
      made.stop.disabled = true;
      made.pause.disabled = true;
      made.time.textContent = "Saving…";
      clearInterval(ticker);
      await send({ type: "record-stop" });
    });
    made.tools.forEach((b) => b.addEventListener("click", () => setTool(b.dataset.tool as Tool)));
    if (!floating) makeMovable(bar);

    // Closing the window (or the page navigating, which closes it too) hides the controls until the next click.
    floating?.addEventListener("pagehide", () => {
      if (controls === made) {
        controls = null;
        if (!ended) showControlsOnNextClick();
      }
    });
    return made;
  }

  async function showControls() {
    if (controls) return;
    controls = buildControls(await openFloatingWindow());
    syncTools();
    showState();
  }

  /** The floating window needs a click in the page to open; the click itself goes on to the page as usual. */
  function showControlsOnNextClick() {
    const onDown = (e: PointerEvent) => {
      if (!e.isTrusted) return;
      window.removeEventListener("pointerdown", onDown, true);
      if (!ended) void showControls();
    };
    window.addEventListener("pointerdown", onDown, true);
  }

  // Ready: the reporter starts the recording from the page, which also opens the controls. The card is gone before
  // the recorder starts, so it isn't recorded.
  if (state.phase === "ready") {
    const card = document.createElement("div");
    card.className = "ready";
    card.innerHTML = `
      <p><strong>Ready to record this tab</strong><small>The controls open in a small window that isn't recorded.</small></p>
      <div class="actions"><button class="cancel">Cancel</button><button class="start">Start recording</button></div>`;
    root.append(card);
    const start = card.querySelector<HTMLButtonElement>(".start")!;
    start.focus();
    card.querySelector(".cancel")!.addEventListener("click", () => void send({ type: "record-cancel" }));
    start.addEventListener("click", async () => {
      start.disabled = true;
      await showControls();
      card.remove();
      // Let the page repaint without the card before recording starts.
      await nextFrame();
      await nextFrame();
      const result = await send({ type: "record-begin" });
      if (result?.recording) state = result.recording;
      showState();
    });
  } else {
    showControlsOnNextClick();
  }

  // ---- Tools ----

  let tool: Tool = null;
  function syncTools() {
    controls?.tools.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tool === tool)));
    canvas.classList.toggle("on", tool === "pen");
    catcher.hidden = tool !== "blur";
  }
  function setTool(next: Tool) {
    tool = tool === next ? null : next;
    syncTools();
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && tool) setTool(tool);
  };
  window.addEventListener("keydown", onKey, true);

  // ---- Pen: strokes on a canvas over the page, fading a moment after they're drawn ----

  const ctx = canvas.getContext("2d")!;
  const strokes: Stroke[] = [];
  let drawing: Stroke | null = null;
  let frame = 0;
  const fitCanvas = () => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  fitCanvas();
  window.addEventListener("resize", fitCanvas);

  const paint = () => {
    frame = 0;
    const now = performance.now();
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (let i = strokes.length - 1; i >= 0; i--) {
      const s = strokes[i];
      const age = s.endedAt === null ? 0 : now - s.endedAt;
      if (age > STROKE_MS + FADE_MS) {
        strokes.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = age > STROKE_MS ? 1 - (age - STROKE_MS) / FADE_MS : 1;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      s.points.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      if (s.points.length === 1) ctx.lineTo(s.points[0][0] + 0.1, s.points[0][1]);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (strokes.length) frame = requestAnimationFrame(paint);
  };
  const repaint = () => {
    if (!frame) frame = requestAnimationFrame(paint);
  };

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    drawing = { points: [[e.clientX, e.clientY]], endedAt: null };
    strokes.push(drawing);
    repaint();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    drawing.points.push([e.clientX, e.clientY]);
    repaint();
  });
  const endStroke = () => {
    if (drawing) drawing.endedAt = performance.now();
    drawing = null;
    repaint();
  };
  canvas.addEventListener("pointerup", endStroke);
  canvas.addEventListener("pointercancel", endStroke);

  // ---- Blur: drag a box over the page; it stays on the page (and scrolls with it) until clicked ----

  let dragFrom: [number, number] | null = null;
  const boxFrom = (x: number, y: number) => {
    const [x0, y0] = dragFrom!;
    return { left: Math.min(x0, x), top: Math.min(y0, y), width: Math.abs(x - x0), height: Math.abs(y - y0) };
  };
  catcher.addEventListener("pointerdown", (e) => {
    // Clicking an existing blur removes it.
    const hit = [...blurs.children].reverse().find((b) => {
      const r = b.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    });
    if (hit) return hit.remove();
    catcher.setPointerCapture(e.pointerId);
    dragFrom = [e.clientX, e.clientY];
  });
  catcher.addEventListener("pointermove", (e) => {
    if (!dragFrom) return;
    const box = boxFrom(e.clientX, e.clientY);
    Object.assign(preview.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
    preview.hidden = false;
  });
  const endBlur = (e: PointerEvent) => {
    if (!dragFrom) return;
    const box = boxFrom(e.clientX, e.clientY);
    dragFrom = null;
    preview.hidden = true;
    if (box.width < 8 || box.height < 8) return;
    const blurred = document.createElement("div");
    blurred.className = "blurred";
    Object.assign(blurred.style, {
      left: `${box.left + scrollX}px`,
      top: `${box.top + scrollY}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
    });
    blurs.append(blurred);
  };
  catcher.addEventListener("pointerup", endBlur);
  catcher.addEventListener("pointercancel", endBlur);

  // ---- Moving the on-page controls (the floating window moves like any window) ----

  function makeMovable(bar: HTMLElement) {
    const grip = bar.querySelector<HTMLElement>(".grip")!;
    grip.addEventListener("pointerdown", (e) => {
      grip.setPointerCapture(e.pointerId);
      const r = bar.getBoundingClientRect();
      const offset = [e.clientX - r.left, e.clientY - r.top];
      const move = (m: PointerEvent) => {
        const left = Math.min(Math.max(m.clientX - offset[0], 8), innerWidth - r.width - 8);
        const top = Math.min(Math.max(m.clientY - offset[1], 8), innerHeight - r.height - 8);
        Object.assign(bar.style, { left: `${left}px`, top: `${top}px`, bottom: "auto", transform: "none" });
      };
      const up = () => {
        grip.removeEventListener("pointermove", move);
        grip.removeEventListener("pointerup", up);
      };
      grip.addEventListener("pointermove", move);
      grip.addEventListener("pointerup", up);
    });
  }

  // ---- Leaving ----

  function teardown() {
    ended = true;
    clearInterval(ticker);
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", fitCanvas);
    window.removeEventListener("keydown", onKey, true);
    try {
      chrome.runtime.onMessage.removeListener(onMessage);
    } catch {}
    controls?.remove();
    controls = null;
    host.remove();
  }
}
