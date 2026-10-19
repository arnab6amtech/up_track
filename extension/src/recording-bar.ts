// Recording toolbar, injected into the tab being recorded: stop, pause/resume, the time so far, a pen that draws
// on the page and a blur tool that covers parts of it. It's part of the page, so it ends up in the recording along
// with whatever it draws or blurs. Everything lives in a shadow root, so the page's styles can't reach it.

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
  mark: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17.5V3"/><path d="M5 3.5h9.5l-2 3.5 2 3.5H5"/></svg>',
  pen: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m13.5 3.5 3 3L7 16H4v-3l9.5-9.5Z"/><path d="M3 18.5c2.5-1.2 5-1.2 7.5 0s5 1.2 7.5 0"/></svg>',
  blur: '<svg viewBox="0 0 20 20"><g fill="currentColor"><rect x="3" y="3" width="4.6" height="4.6" rx="1"/><rect x="12.4" y="3" width="4.6" height="4.6" rx="1" opacity=".55"/><rect x="7.7" y="7.7" width="4.6" height="4.6" rx="1" opacity=".8"/><rect x="3" y="12.4" width="4.6" height="4.6" rx="1" opacity=".4"/><rect x="12.4" y="12.4" width="4.6" height="4.6" rx="1"/><rect x="7.7" y="3" width="4.6" height="4.6" rx="1" opacity=".25"/><rect x="3" y="7.7" width="4.6" height="4.6" rx="1" opacity=".7"/><rect x="12.4" y="7.7" width="4.6" height="4.6" rx="1" opacity=".3"/><rect x="7.7" y="12.4" width="4.6" height="4.6" rx="1" opacity=".6"/></g></svg>',
  grip: '<svg viewBox="0 0 20 20" fill="currentColor"><circle cx="7" cy="5" r="1.4"/><circle cx="13" cy="5" r="1.4"/><circle cx="7" cy="10" r="1.4"/><circle cx="13" cy="10" r="1.4"/><circle cx="7" cy="15" r="1.4"/><circle cx="13" cy="15" r="1.4"/></svg>',
};

/** The page layer: pen ink and blurs. */
const PAGE_CSS = `
  .ink { position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: none; }
  .ink.on { pointer-events: auto; cursor: crosshair; }
  .catcher { position: fixed; inset: 0; cursor: crosshair; }
  .blurs { position: absolute; top: 0; left: 0; }
  .blurred { position: absolute; border-radius: 6px; background: rgb(255 255 255 / 0.06);
    backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); pointer-events: none; }
  .preview { position: fixed; border: 1.5px dashed #fff; border-radius: 6px; outline: 1px dashed rgb(0 0 0 / 0.6);
    background: rgb(255 255 255 / 0.1); pointer-events: none; }
`;

/** The toolbar pill. */
const BAR_CSS = `
  .bar { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); display: flex; align-items: center; gap: 2px;
    padding: 6px 6px 6px 8px; border: 1px solid rgb(255 255 255 / 0.12); border-radius: 14px; background: rgb(24 24 27 / 0.94);
    box-shadow: 0 12px 32px rgb(0 0 0 / 0.35); color: #fff; font: 500 14px/1 system-ui, -apple-system, "Segoe UI", sans-serif;
    user-select: none; -webkit-user-select: none; box-sizing: border-box; }
  button { all: unset; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 9px; cursor: pointer; color: #fff; }
  button:hover { background: rgb(255 255 255 / 0.1); }
  button[aria-pressed="true"] { background: rgb(255 255 255 / 0.2); }
  button:focus-visible { outline: 2px solid #fff; outline-offset: -2px; }
  button:disabled { opacity: 0.5; cursor: wait; }
  svg { width: 19px; height: 19px; }
  .stop svg { width: 22px; height: 22px; }
  .time { min-width: 52px; padding: 0 6px; text-align: center; font-variant-numeric: tabular-nums; letter-spacing: 0.02em; }
  .paused .time { color: #fbbf24; }
  .mark { position: relative; }
  .mark.flash { background: rgb(251 191 36 / 0.35); }
  .mark .count { position: absolute; top: 3px; right: 2px; min-width: 13px; height: 13px; padding: 0 3px; border-radius: 7px;
    background: #fbbf24; color: #111; font: 700 9px/13px system-ui, sans-serif; text-align: center; box-sizing: border-box; }
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
  mark: HTMLButtonElement;
  tools: HTMLButtonElement[];
}

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
    const marks = state.marks?.length ?? 0;
    let count = controls.mark.querySelector<HTMLElement>(".count");
    if (marks && !count) count = controls.mark.appendChild(Object.assign(document.createElement("span"), { className: "count" }));
    if (count) count.textContent = String(marks);
    controls.mark.setAttribute("aria-label", marks ? `Mark this moment (${marks} marked)` : "Mark this moment");
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

  // ---- The toolbar ----

  function buildControls(): Controls {
    const style = document.createElement("style");
    style.textContent = BAR_CSS;
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", "UpTrack recording");
    bar.innerHTML = `
      <button class="stop" title="Stop and review" aria-label="Stop recording">${ICONS.stop}</button>
      <button class="pause" title="Pause" aria-label="Pause recording">${ICONS.pause}</button>
      <span class="time" aria-live="off">0:00</span>
      <button class="mark" title="Mark this moment: where the bug shows up" aria-label="Mark this moment">${ICONS.mark}</button>
      <span class="sep"></span>
      <button class="tool" data-tool="pen" title="Draw on the page" aria-pressed="false" aria-label="Pen">${ICONS.pen}</button>
      <button class="tool" data-tool="blur" title="Blur part of the page: drag over it. Click a blur to remove it." aria-pressed="false" aria-label="Blur">${ICONS.blur}</button>
      <span class="grip" title="Drag to move">${ICONS.grip}</span>`;
    root.append(style, bar);

    const made: Controls = {
      bar,
      time: bar.querySelector(".time")!,
      pause: bar.querySelector(".pause")!,
      stop: bar.querySelector(".stop")!,
      mark: bar.querySelector(".mark")!,
      tools: [...bar.querySelectorAll<HTMLButtonElement>(".tool")],
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
    made.mark.addEventListener("click", async () => {
      const result = await send({ type: "record-mark" });
      if (result?.recording) state = result.recording;
      made.mark.classList.add("flash");
      setTimeout(() => made.mark.classList.remove("flash"), 500);
      showState();
    });
    made.tools.forEach((b) => b.addEventListener("click", () => setTool(b.dataset.tool as Tool)));
    makeMovable(bar);
    return made;
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

  // ---- Showing the toolbar ----

  controls = buildControls();
  syncTools();
  showState();

  // ---- Moving the toolbar ----


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
    clearInterval(ticker);
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", fitCanvas);
    window.removeEventListener("keydown", onKey, true);
    try {
      chrome.runtime.onMessage.removeListener(onMessage);
    } catch {}
    host.remove();
  }
}
