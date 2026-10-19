// Editor tab: annotate the screenshot (or trim the recording), describe the bug and upload it to UpTrack.

import { Annotator, type Tool } from "./annotate";
import { ApiError, fetchProjects, SignInRequired, upload } from "./shared/api";
import { deleteDraft, getDraft } from "./shared/drafts";
import { getSettings, signInUrl } from "./shared/settings";
import {
  describeUserAgent,
  inFilter,
  isFailed,
  NETWORK_FILTERS,
  SEVERITIES,
  type CaptureLog,
  type Draft,
  type NetworkEntry,
  type PageInfo,
  type ReportableProject,
} from "./shared/types";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const COLORS = ["#e11d48", "#f97316", "#facc15", "#16a34a", "#2563eb", "#0a0a0a"];

let draft: Draft;
let annotator: Annotator | null = null;
let trim = { start: 0, end: 0 };
/** Moments marked in a recording ("the bug happens here"), in milliseconds, with an optional note. */
let markers: { atMs: number; label: string }[] = [];
/** The timestamp whose tab is open. */
let activeStamp = 0;
let submitted = false;

function fail(message: string) {
  const el = $("load-error");
  el.textContent = message;
  el.hidden = false;
  $<HTMLButtonElement>("submit").disabled = true;
}

function formatTime(ms: number) {
  // Round down, like the video player's own clock.
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const capitalize = (value: string) => value[0].toUpperCase() + value.slice(1);

function fillSelect(id: string, options: { value: string; label: string }[], selected: string) {
  const select = $<HTMLSelectElement>(id);
  select.replaceChildren(...options.map((o) => new Option(o.label, o.value, false, o.value === selected)));
}

// ---- Project and version pickers ----

let projects: ReportableProject[] = [];
const LAST_CHOICE = "lastReportTarget";

/** A required picker that starts on a disabled "Choose a …" line, or on a remembered choice still offered. */
function fillChoice(id: string, items: { id: string; name: string }[], prompt: string, remembered?: string) {
  const placeholder = new Option(prompt, "", true, true);
  placeholder.disabled = true;
  const pick = items.some((i) => i.id === remembered) ? remembered : "";
  $<HTMLSelectElement>(id).replaceChildren(placeholder, ...items.map((i) => new Option(i.name, i.id, false, i.id === pick)));
}

interface LastChoice {
  projectId?: string;
  /** The project's bug list, for the popup's home button. */
  listPath?: string;
  versionId?: string;
  platformId?: string;
  componentId?: string;
}

function showVersions(projectId: string, preferred: LastChoice = {}) {
  const project = projects.find((p) => p.id === projectId);
  const versions = project?.versions ?? [];
  // Default to what the reporter used last, else whatever QA is testing now.
  const pick = versions.find((v) => v.id === preferred.versionId) ?? versions.find((v) => v.status === "in_testing") ?? versions[0];
  fillSelect(
    "version",
    versions.map((v) => ({ value: v.id, label: `${v.name}${v.status === "in_testing" ? " (in testing)" : ""}` })),
    pick?.id ?? "",
  );
  // Projects that cover several products (admin panel, website, app) need the platform too.
  const platforms = project?.platforms ?? [];
  $("platform-field").hidden = platforms.length === 0;
  $<HTMLSelectElement>("platform").required = platforms.length > 0;
  fillChoice("platform", platforms, "Choose a platform", preferred.platformId);
  // Every bug names its feature; a project without any can't take reports yet.
  const features = project?.components ?? [];
  fillChoice("module", features, features.length ? "Choose a feature" : "No features yet", preferred.componentId);
}

/** Projects in a picker, grouped by organization when the reporter belongs to several. */
function fillProjects(selected: string) {
  const select = $<HTMLSelectElement>("project");
  const option = (p: ReportableProject) => new Option(`${p.name} (${p.key})`, p.id, false, p.id === selected);
  const orgs = [...new Set(projects.map((p) => p.organization.name))];
  if (orgs.length < 2) return select.replaceChildren(...projects.map(option));
  select.replaceChildren(
    ...orgs.map((name) => {
      const group = document.createElement("optgroup");
      group.label = name;
      group.append(...projects.filter((p) => p.organization.name === name).map(option));
      return group;
    }),
  );
}

const NO_SERVER = "Set up UpTrack first: open the extension's menu and enter your UpTrack address.";

/** Explains why reporting can't continue; offers sign-in when that's the reason. */
function blockProjects(message: string, signIn?: string) {
  const notice = $("projects-error");
  notice.replaceChildren(message);
  if (signIn) {
    const link = Object.assign(document.createElement("a"), { href: signIn, target: "_blank", textContent: "Sign in to UpTrack" });
    link.className = "btn btn-primary btn-sm notice-action";
    notice.append(link);
  }
  notice.hidden = false;
  $<HTMLButtonElement>("submit").disabled = true;
}

let projectsReady = false;

async function loadProjects() {
  const settings = await getSettings();
  if (!settings) return blockProjects(NO_SERVER);
  try {
    projects = (await fetchProjects(settings)).filter((p) => p.versions.length > 0);
  } catch (err) {
    if (err instanceof SignInRequired) return blockProjects(err.message, signInUrl(settings));
    return blockProjects(err instanceof ApiError ? err.message : "Couldn't load your projects.");
  }
  if (projects.length === 0) {
    return blockProjects("You aren't on any project with an active version you can report to. Ask a project manager to add you.");
  }
  $("projects-error").hidden = true;
  $<HTMLButtonElement>("submit").disabled = !$("load-error").hidden;
  projectsReady = true;
  const last = ((await chrome.storage.local.get(LAST_CHOICE))[LAST_CHOICE] ?? {}) as LastChoice;
  const projectId = projects.some((p) => p.id === last.projectId) ? last.projectId! : projects[0].id;
  fillProjects(projectId);
  showVersions(projectId, last);
}

$<HTMLSelectElement>("project").addEventListener("change", (e) => showVersions((e.target as HTMLSelectElement).value));
// Coming back after signing in (or being added to a project) in another tab: try again.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !projectsReady) void loadProjects();
});

// ---- Fitting the capture on screen ----

/** Keeps the screenshot or recording as large as the stage allows, whole and undistorted. */
function fitToStage(media: HTMLElement, width: number, height: number) {
  const stage = $("stage");
  const fit = () => {
    const style = getComputedStyle(stage);
    const room = {
      width: stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
      height: stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
    };
    // 2px for the border.
    const scale = Math.max(0, Math.min((room.width - 2) / width, (room.height - 2) / height));
    media.style.width = `${Math.floor(width * scale)}px`;
    media.style.height = `${Math.floor(height * scale)}px`;
  };
  new ResizeObserver(fit).observe(stage);
  fit();
}

// ---- Screenshot annotation ----

async function setUpImage() {
  const bitmap = await createImageBitmap(draft.blob);
  $("tools").hidden = false;
  $("canvas-wrap").hidden = false;
  const a = new Annotator($<HTMLCanvasElement>("canvas"), bitmap, $<HTMLTextAreaElement>("text-input"));
  annotator = a;
  fitToStage($("canvas"), bitmap.width, bitmap.height);

  const undo = $<HTMLButtonElement>("undo");
  const clear = $<HTMLButtonElement>("clear");
  a.onChange = () => {
    undo.disabled = a.count === 0;
    clear.disabled = a.count === 0;
  };
  undo.addEventListener("click", () => a.undo());
  clear.addEventListener("click", () => a.clear());

  const setTool = (tool: Tool) => {
    a.tool = tool;
    document.querySelectorAll<HTMLButtonElement>(".tool").forEach((b) => b.classList.toggle("active", b.dataset.tool === tool));
    $("canvas-wrap").classList.toggle("text-tool", tool === "text");
  };
  document.querySelectorAll<HTMLButtonElement>(".tool").forEach((b) => b.addEventListener("click", () => setTool(b.dataset.tool as Tool)));

  const colors = $("colors");
  for (const color of COLORS) {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = `swatch${color === a.color ? " active" : ""}`;
    swatch.style.background = color;
    swatch.title = color;
    swatch.addEventListener("click", () => {
      a.color = color;
      colors.querySelectorAll(".swatch").forEach((s) => s.classList.toggle("active", s === swatch));
    });
    colors.append(swatch);
  }

  const shortcuts: Record<string, Tool> = { a: "arrow", b: "rect", t: "text", h: "blur" };
  document.addEventListener("keydown", (e) => {
    if ((e.target as HTMLElement).closest("input, textarea, select")) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      a.undo();
    } else if (!e.metaKey && !e.ctrlKey && !e.altKey && shortcuts[e.key.toLowerCase()]) {
      setTool(shortcuts[e.key.toLowerCase()]);
    }
  });
}

// ---- Recording trim ----

const MIN_TRIM_MS = 500;
const HANDLE_PX = 12;

function setUpVideo() {
  const video = $<HTMLVideoElement>("video");
  $("player").hidden = false;
  $("trim").hidden = false;
  video.src = URL.createObjectURL(draft.blob);

  const track = $("trim-track");
  const startHandle = $("trim-start");
  const endHandle = $("trim-end");
  const play = $("trim-play");
  const duration = () => (Number.isFinite(video.duration) ? video.duration * 1000 : (draft.durationMs ?? 0));
  const share = (ms: number) => Math.min(Math.max(ms / Math.max(duration(), 1), 0), 1);
  const at = (share: number) => `${(share * 100).toFixed(3)}%`;

  /** Places the selection, the washed-out ends, the handles and the playhead. */
  const layout = () => {
    const s = share(trim.start);
    const e = share(trim.end);
    $("trim-shade-start").style.width = at(s);
    $("trim-shade-end").style.width = at(1 - e);
    Object.assign($("trim-range").style, { left: at(s), right: at(1 - e) });
    startHandle.style.left = at(s);
    endHandle.style.left = `calc(${at(e)} - ${HANDLE_PX}px)`;
    $("trim-playhead").style.left = at(share(video.currentTime * 1000));
    // Timestamps outside the trimmed part aren't sent; say so on their pins and tabs.
    markers.forEach((m, i) => {
      const outside = m.atMs < trim.start || m.atMs > trim.end;
      $("trim-marks").children[i]?.classList.toggle("outside", outside);
      const tab = $("stamps-tabs").children[i];
      tab?.classList.toggle("outside", outside);
      tab?.setAttribute("title", outside ? "Outside the trimmed part, so it won't be sent" : m.label || "Show this moment");
      if (i === activeStamp) $("stamps-panel").classList.toggle("outside", outside);
    });
    for (const [handle, ms] of [
      [startHandle, trim.start],
      [endHandle, trim.end],
    ] as const) {
      handle.setAttribute("aria-valuemin", "0");
      handle.setAttribute("aria-valuemax", String(Math.round(duration())));
      handle.setAttribute("aria-valuenow", String(Math.round(ms)));
      handle.setAttribute("aria-valuetext", formatTime(ms));
      handle.title = `${handle === startHandle ? "Starts" : "Ends"} at ${formatTime(ms)}. Drag to trim.`;
    }
  };

  video.addEventListener("loadedmetadata", () => {
    if (video.videoWidth && video.videoHeight) fitToStage(video, video.videoWidth, video.videoHeight);
    trim = { start: 0, end: duration() };
    layout();
    void drawFilmstrip(video.src, $<HTMLCanvasElement>("trim-film"));
  });

  // Playing stays inside the selection: it starts at the selection's start and stops at its end.
  const toggle = () => {
    if (video.paused) {
      const now = video.currentTime * 1000;
      if (now < trim.start || now >= trim.end - 50) video.currentTime = trim.start / 1000;
      void video.play();
    } else video.pause();
  };
  play.addEventListener("click", toggle);
  video.addEventListener("click", toggle);
  let frame = 0;
  const follow = () => {
    if (video.currentTime * 1000 >= trim.end) {
      video.pause();
      video.currentTime = trim.end / 1000;
    }
    layout();
    if (!video.paused) frame = requestAnimationFrame(follow);
  };
  video.addEventListener("play", () => {
    play.classList.add("playing");
    play.setAttribute("aria-label", "Pause");
    frame = requestAnimationFrame(follow);
  });
  video.addEventListener("pause", () => {
    play.classList.remove("playing");
    play.setAttribute("aria-label", "Play");
    cancelAnimationFrame(frame);
    layout();
  });
  video.addEventListener("seeked", layout);

  const msAt = (clientX: number) => {
    const r = track.getBoundingClientRect();
    return share(((clientX - r.left) / r.width) * duration()) * duration();
  };
  const setStart = (ms: number) => {
    trim.start = Math.min(Math.max(ms, 0), trim.end - MIN_TRIM_MS);
    video.currentTime = trim.start / 1000;
    layout();
  };
  const setEnd = (ms: number) => {
    trim.end = Math.max(Math.min(ms, duration()), trim.start + MIN_TRIM_MS);
    video.currentTime = trim.end / 1000;
    layout();
  };

  // Dragging a handle trims (and shows that frame); pressing anywhere else on the track moves the playhead.
  // A handle is measured from its outer edge (the start handle's left, the end handle's right), so grabbing it
  // by the middle doesn't make it jump.
  const drag = (target: HTMLElement, move: (ms: number) => void, edge?: "left" | "right") => {
    target.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      video.pause();
      target.setPointerCapture(e.pointerId);
      const box = target.getBoundingClientRect();
      const offset = edge === "left" ? e.clientX - box.left : edge === "right" ? e.clientX - box.right : 0;
      if (!edge) move(msAt(e.clientX));
      const onMove = (m: PointerEvent) => move(msAt(m.clientX - offset));
      const onUp = () => {
        target.removeEventListener("pointermove", onMove);
        target.removeEventListener("pointerup", onUp);
        target.removeEventListener("pointercancel", onUp);
      };
      target.addEventListener("pointermove", onMove);
      target.addEventListener("pointerup", onUp);
      target.addEventListener("pointercancel", onUp);
    });
  };
  drag(startHandle, setStart, "left");
  drag(endHandle, setEnd, "right");
  drag(track, (ms) => {
    video.currentTime = Math.min(Math.max(ms, trim.start), trim.end) / 1000;
    layout();
  });

  // Keyboard: arrow keys move a handle by a tenth of a second, a second with Shift.
  for (const [handle, set, get] of [
    [startHandle, setStart, () => trim.start],
    [endHandle, setEnd, () => trim.end],
  ] as const) {
    handle.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 1000 : 100;
      if (e.key === "ArrowLeft") set(get() - step);
      else if (e.key === "ArrowRight") set(get() + step);
      else return;
      e.preventDefault();
    });
  }
  window.addEventListener("resize", layout);

  // ---- Timestamps: pins on the timeline, and a collapsible row under the recording with a tab for each ----

  markers = (draft.markers ?? []).map((m) => ({ atMs: m.atMs, label: m.label ?? "" }));
  $("stamps").hidden = false;
  const seek = (ms: number) => {
    video.pause();
    video.currentTime = Math.min(Math.max(ms, 0), duration()) / 1000;
    layout();
  };
  const setOpen = (open: boolean) => {
    $("stamps-toggle").setAttribute("aria-expanded", String(open));
    $("stamps-body").hidden = !open;
  };
  $("stamps-toggle").addEventListener("click", () => setOpen($("stamps-body").hidden));

  /** Opens the row on one timestamp and shows that moment in the recording. */
  const select = (i: number, focusNote = false) => {
    activeStamp = i;
    setOpen(true);
    renderStamps();
    if (markers[i]) seek(markers[i].atMs);
    if (focusNote) $("stamps-panel").querySelector("input")?.focus();
  };

  const renderStamps = () => {
    markers.sort((a, b) => a.atMs - b.atMs);
    activeStamp = Math.min(activeStamp, Math.max(markers.length - 1, 0));
    $("count-timestamps").textContent = markers.length ? String(markers.length) : "";
    $("trim-marks").replaceChildren(
      ...markers.map((m, i) => {
        const pin = el("button", "trim-pin");
        pin.type = "button";
        pin.style.left = at(share(m.atMs));
        pin.title = `${formatTime(m.atMs)}${m.label ? ` · ${m.label}` : ""}`;
        pin.setAttribute("aria-label", `Timestamp at ${formatTime(m.atMs)}`);
        pin.addEventListener("pointerdown", (e) => e.stopPropagation());
        pin.addEventListener("click", () => select(i));
        return pin;
      }),
    );
    $("stamps-tabs").replaceChildren(
      ...markers.map((m, i) => {
        const tab = el("button", "stamp-tab", formatTime(m.atMs));
        tab.type = "button";
        tab.setAttribute("role", "tab");
        tab.setAttribute("aria-selected", String(i === activeStamp));
        tab.addEventListener("click", () => select(i));
        return tab;
      }),
    );
    const m = markers[activeStamp];
    if (!m) {
      $("stamps-panel").replaceChildren(el("p", "small muted stamps-hint", "Where the bug shows up: press the flag on the timeline (or M) at that moment."));
    } else {
      const note = el("input", "marker-note");
      note.value = m.label;
      note.maxLength = 200;
      note.placeholder = "What happens here? (optional)";
      note.setAttribute("aria-label", `Note for the timestamp at ${formatTime(m.atMs)}`);
      note.addEventListener("input", () => (m.label = note.value));
      const remove = el("button", "marker-remove", "×");
      remove.type = "button";
      remove.title = "Remove this timestamp";
      remove.setAttribute("aria-label", `Remove the timestamp at ${formatTime(m.atMs)}`);
      remove.addEventListener("click", () => {
        markers.splice(markers.indexOf(m), 1);
        showMarkers();
      });
      $("stamps-panel").replaceChildren(note, remove);
    }
  };
  const showMarkers = () => {
    renderStamps();
    layout();
  };

  const addMarker = () => {
    const atMs = Math.round(video.currentTime * 1000);
    const near = markers.findIndex((m) => Math.abs(m.atMs - atMs) < 250);
    if (near >= 0) return select(near, true);
    const added = { atMs, label: "" };
    markers.push(added);
    markers.sort((a, b) => a.atMs - b.atMs);
    select(markers.indexOf(added), true);
    layout();
  };
  $("trim-mark").addEventListener("click", addMarker);
  // M marks the moment on screen, unless typing.
  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() !== "m" || e.metaKey || e.ctrlKey || e.altKey) return;
    if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
    e.preventDefault();
    addMarker();
  });
  // Pins need the length of the recording to be placed.
  video.addEventListener("loadedmetadata", showMarkers);
}

/** Thumbnails of the recording along the trim track, drawn from a second, hidden copy of the video. */
async function drawFilmstrip(src: string, canvas: HTMLCanvasElement) {
  const probe = document.createElement("video");
  probe.muted = true;
  probe.preload = "auto";
  probe.src = src;
  try {
    await new Promise((resolve, reject) => {
      probe.addEventListener("loadeddata", resolve, { once: true });
      probe.addEventListener("error", reject, { once: true });
    });
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext("2d")!;
    const frameWidth = (height * dpr * probe.videoWidth) / Math.max(probe.videoHeight, 1);
    const count = Math.max(1, Math.ceil(canvas.width / frameWidth));
    const seconds = Number.isFinite(probe.duration) ? probe.duration : (draft.durationMs ?? 0) / 1000;
    for (let i = 0; i < count; i++) {
      probe.currentTime = ((i + 0.5) / count) * seconds;
      await new Promise((resolve) => probe.addEventListener("seeked", resolve, { once: true }));
      ctx.drawImage(probe, i * frameWidth, 0, frameWidth, canvas.height);
    }
  } catch {
    // No thumbnails: the track stays plain, and trimming still works.
  } finally {
    probe.removeAttribute("src");
    probe.load();
  }
}

// ---- What was captured from the page ----

/** An element with text; page data is untrusted, so it's only ever set as text. */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

// ---- Choosing what to send ----

type LogKind = "network" | "console";

/** Positions (in the captured log) of the API calls and console entries the reporter is sending. All, to start. */
const sending: Record<LogKind, Set<number>> = { network: new Set(), console: new Set() };
const rerender: Record<LogKind, () => void> = { network: () => {}, console: () => {} };
/** Entries the list currently shows (after its filters), which "all" and "none" apply to. */
const shown: Record<LogKind, number[]> = { network: [], console: [] };

/** The log as it will be uploaded: only the entries the reporter kept. */
function chosenLog(): CaptureLog {
  return {
    network: draft.log.network.filter((_, i) => sending.network.has(i)),
    console: draft.log.console.filter((_, i) => sending.console.has(i)),
  };
}

function includeBox(kind: LogKind, index: number, label: string): HTMLInputElement {
  const box = el("input", "pick");
  box.type = "checkbox";
  box.checked = sending[kind].has(index);
  box.title = "Send with the report";
  box.setAttribute("aria-label", `Send ${label}`);
  // Inside a row's summary: tick the box without opening or closing the row.
  box.addEventListener("click", (e) => e.stopPropagation());
  box.addEventListener("change", () => {
    if (box.checked) sending[kind].add(index);
    else sending[kind].delete(index);
    box.closest("li")?.classList.toggle("excluded", !box.checked);
    showSending();
  });
  return box;
}

/** The list header's checkbox and count, for the entries the list shows. */
function showPicked(kind: LogKind) {
  const picked = shown[kind].filter((i) => sending[kind].has(i)).length;
  const box = document.querySelector<HTMLInputElement>(`.list-head .pick[data-kind="${kind}"]`)!;
  box.checked = picked > 0 && picked === shown[kind].length;
  box.indeterminate = picked > 0 && picked < shown[kind].length;
  box.disabled = shown[kind].length === 0;
  const noun = kind === "network" ? "request" : "entry";
  const nouns = kind === "network" ? "requests" : "entries";
  $(`picked-${kind}`).textContent = shown[kind].length
    ? `${picked} of ${shown[kind].length} ${shown[kind].length === 1 ? noun : nouns} ticked`
    : `No ${nouns} here`;
}

/** The form's summary of what goes with the report; its checkbox is ticked, clear or half-ticked to match. */
function showSending() {
  const { network, console: entries } = draft.log;
  const total = network.length + entries.length;
  const chosen = sending.network.size + sending.console.size;
  const all = $<HTMLInputElement>("attach-log");
  all.disabled = total === 0;
  all.checked = chosen > 0;
  all.indeterminate = chosen > 0 && chosen < total;
  const failed = network.filter((e, i) => sending.network.has(i) && isFailed(e)).length;
  const parts = [
    ...(network.length ? [`${sending.network.size} of ${network.length} ${network.length === 1 ? "request" : "requests"}${failed ? ` (${failed} failed)` : ""}`] : []),
    ...(entries.length ? [`${sending.console.size} of ${entries.length} console ${entries.length === 1 ? "entry" : "entries"}`] : []),
    "page and browser details",
  ];
  $("log-summary").textContent = `Sending ${parts.join(" · ")}`;
  showPicked("network");
  showPicked("console");
}

function setAll(kind: LogKind, indexes: number[], on: boolean) {
  for (const i of indexes) {
    if (on) sending[kind].add(i);
    else sending[kind].delete(i);
  }
  rerender[kind]();
  showSending();
}

function setUpSending() {
  draft.log.network.forEach((_, i) => sending.network.add(i));
  draft.log.console.forEach((_, i) => sending.console.add(i));
  // The form's checkbox sends everything or nothing.
  $<HTMLInputElement>("attach-log").addEventListener("change", (e) => {
    const on = (e.target as HTMLInputElement).checked;
    setAll("network", draft.log.network.map((_, i) => i), on);
    setAll("console", draft.log.console.map((_, i) => i), on);
  });
  // Each list's header box ticks or clears what the list shows, so "Img" then clearing it drops just the images.
  document.querySelectorAll<HTMLInputElement>(".list-head .pick").forEach((box) =>
    box.addEventListener("change", () => {
      const kind = box.dataset.kind as LogKind;
      const all = shown[kind].every((i) => sending[kind].has(i));
      setAll(kind, shown[kind], !all);
    }),
  );
  showSending();
  $("log-missing").hidden = draft.logAvailable;
}

function showPage(page: PageInfo | null) {
  const list = $("page-details");
  if (!page) {
    list.replaceWith(el("p", "small muted", "The page's details weren't available (the tab closed before the recording finished)."));
    return;
  }
  const rows: [string, string | HTMLElement][] = [];
  if (/^https?:/.test(page.url)) {
    const link = el("a", undefined, page.url);
    link.href = page.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    rows.push(["Page", link]);
  } else {
    rows.push(["Page", page.url]);
  }
  if (page.title) rows.push(["Title", page.title]);
  rows.push(["Browser", describeUserAgent(page.userAgent)]);
  rows.push(["Window", `${page.viewport.width} × ${page.viewport.height} at ${page.devicePixelRatio}x`]);
  if (page.screen) rows.push(["Screen", `${page.screen.width} × ${page.screen.height}`]);
  rows.push(["Language", page.language]);
  rows.push(["Time zone", page.timezone]);
  for (const [label, value] of rows) {
    const dd = el("dd");
    dd.append(value);
    list.append(el("dt", undefined, label), dd);
  }
}

const headerText = (headers: Record<string, string>) => Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join("\n");

function pretty(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

/** One call's URL, headers and bodies, a tab each. Opens on the response body, where the error usually is. */
function callDetails(e: NetworkEntry): HTMLElement {
  const requestHeaders = Object.keys(e.requestHeaders ?? {}).length;
  const responseHeaders = Object.keys(e.responseHeaders ?? {}).length;
  const tabs: { label: string; count?: number; text: string; empty: string }[] = [
    { label: "URL", text: e.url, empty: "" },
    { label: "Request headers", count: requestHeaders, text: headerText(e.requestHeaders ?? {}), empty: "No headers were recorded." },
    { label: "Response headers", count: responseHeaders, text: headerText(e.responseHeaders ?? {}), empty: "No headers were recorded." },
    { label: "Request body", text: e.requestBody ? pretty(e.requestBody) : "", empty: "No body was sent." },
    { label: "Response body", text: e.responseBody ? pretty(e.responseBody) : "", empty: "No body was received." },
  ];

  const box = el("div", "call");
  if (e.error) box.append(el("p", "call-error", `Error: ${e.error}`));
  const bar = el("div", "call-bar");
  const strip = el("div", "call-tabs");
  strip.setAttribute("role", "tablist");
  const copy = el("button", "btn btn-sm call-copy", "Copy");
  copy.type = "button";
  const panel = el("pre", "mono call-panel");
  panel.setAttribute("role", "tabpanel");

  let current = 0;
  const buttons = tabs.map((t, i) => {
    const button = el("button", `call-tab${t.text ? "" : " empty"}`, t.label);
    button.type = "button";
    button.setAttribute("role", "tab");
    if (t.count) button.append(el("span", "count", ` ${t.count}`));
    button.addEventListener("click", () => select(i));
    return button;
  });
  function select(i: number) {
    current = i;
    buttons.forEach((b, j) => b.setAttribute("aria-selected", String(i === j)));
    const t = tabs[i];
    panel.textContent = t.text || t.empty;
    panel.classList.toggle("muted", !t.text);
    copy.hidden = !t.text;
  }
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(tabs[current].text);
      copy.textContent = "Copied";
    } catch {
      copy.textContent = "Couldn't copy";
    }
    setTimeout(() => (copy.textContent = "Copy"), 1500);
  });

  strip.append(...buttons);
  bar.append(strip, copy);
  box.append(bar, panel);
  // The response body if there is one, else the first headers or body that has something, else the URL.
  const firstFilled = tabs.findIndex((t, i) => i > 0 && t.text);
  select(e.responseBody ? tabs.length - 1 : Math.max(firstFilled, 0));
  return box;
}

/** Short type label for files, like DevTools' Type column; API calls show their method instead. */
const TYPE_LABEL: Record<string, string> = {
  document: "Doc",
  stylesheet: "CSS",
  script: "JS",
  font: "Font",
  image: "Img",
  media: "Media",
  manifest: "Manifest",
  websocket: "WS",
  wasm: "Wasm",
  other: "Other",
};

function formatSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** The status column: the code, ERR for a failure without one, or a dash where the browser didn't say. */
const statusLabel = (e: NetworkEntry) => (e.status ? String(e.status) : isFailed(e) ? "ERR" : "—");

/** Files and sockets have no headers or bodies to show, just what the browser reported about them. */
function resourceDetails(e: NetworkEntry): HTMLElement {
  const box = el("div", "call");
  const list = el("dl", "details");
  const rows: [string, string][] = [
    ["Type", TYPE_LABEL[e.type] ?? e.type],
    ["URL", e.url],
    ["Status", e.status ? `${e.status}${e.statusText ? ` ${e.statusText}` : ""}` : "Not reported by the browser"],
    ...(e.sizeBytes ? ([["Size", formatSize(e.sizeBytes)]] as [string, string][]) : []),
    ["Time", `${Math.round(e.durationMs)} ms`],
    ...(e.error ? ([["Error", e.error]] as [string, string][]) : []),
  ];
  for (const [k, v] of rows) list.append(el("dt", undefined, k), el("dd", k === "URL" ? "mono" : undefined, v));
  box.append(list);
  return box;
}

const hasDetails = (e: NetworkEntry) =>
  Boolean(e.requestBody || e.responseBody || Object.keys(e.requestHeaders ?? {}).length || Object.keys(e.responseHeaders ?? {}).length);

/** Fetch and XHR calls show their method; everything else shows its type. */
const isCall = (e: NetworkEntry) => e.type === "fetch" || e.type === "xhr";

let typeFilter = "all";

function showNetwork(log: CaptureLog) {
  const failed = log.network.filter(isFailed).length;
  const count = $("count-network");
  count.replaceChildren(String(log.network.length));
  if (failed) count.append(" · ", el("span", "status-fail", `${failed} failed`));

  // DevTools-style type chips, each with how many requests it holds.
  const chips = NETWORK_FILTERS.map((f) => {
    const n = f.types ? log.network.filter((e) => inFilter(e, f.id)).length : log.network.length;
    const chip = el("button", `chip${n ? "" : " none"}`, f.label);
    if (n && f.types) chip.append(el("span", "count", String(n)));
    chip.type = "button";
    chip.dataset.filter = f.id;
    chip.title = `${n} ${n === 1 ? "request" : "requests"}`;
    chip.setAttribute("aria-pressed", String(f.id === typeFilter));
    chip.addEventListener("click", () => {
      typeFilter = f.id;
      chips.forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
      render();
    });
    return chip;
  });
  $("network-types").replaceChildren(...chips);

  const render = () => {
    const failedOnly = $<HTMLInputElement>("failed-only").checked;
    const query = $<HTMLInputElement>("network-filter").value.trim().toLowerCase();
    const calls = log.network
      .map((e, index) => ({ e, index }))
      .filter(({ e }) => inFilter(e, typeFilter) && (!failedOnly || isFailed(e)) && (!query || e.url.toLowerCase().includes(query)));
    shown.network = calls.map((c) => c.index);
    const list = $("network-list");
    list.replaceChildren(
      ...calls.map(({ e, index }) => {
        const item = el("li", sending.network.has(index) ? "" : "excluded");
        const details = el("details", "entry net");
        const summary = el("summary");
        let path = e.url;
        try {
          const u = new URL(e.url);
          path = u.pathname + u.search;
        } catch {}
        const size = formatSize(e.sizeBytes);
        summary.append(
          includeBox("network", index, `${e.method} ${e.url}`),
          el("span", `mono ${isFailed(e) ? "status-fail" : e.status ? "status-ok" : "muted"}`, statusLabel(e)),
          el("span", `mono${isCall(e) ? "" : " muted"}`, isCall(e) ? e.method : TYPE_LABEL[e.type]),
          Object.assign(el("span", "mono path", path), { title: e.url }),
          el("span", "muted", `${size ? `${size} · ` : ""}${Math.round(e.durationMs)} ms`),
        );
        details.append(summary, hasDetails(e) ? callDetails(e) : resourceDetails(e));
        item.append(details);
        return item;
      }),
    );
    const empty = $("network-empty");
    empty.textContent = !draft.logAvailable
      ? "No requests were recorded: the page was open before the extension was installed. Reload it and reproduce the bug."
      : !log.network.length
        ? "The page made no requests."
        : failedOnly
          ? "No failed requests here."
          : "No requests match these filters.";
    empty.hidden = calls.length > 0;
    showPicked("network");
  };
  rerender.network = render;
  $("failed-only").addEventListener("change", render);
  $("network-filter").addEventListener("input", render);
  render();
}

function showConsole(log: CaptureLog) {
  const errors = log.console.filter((c) => c.level === "error").length;
  const count = $("count-console");
  count.replaceChildren(String(log.console.length));
  if (errors) count.append(" · ", el("span", "status-fail", `${errors} ${errors === 1 ? "error" : "errors"}`));
  const render = () => {
    shown.console = log.console.map((_, i) => i);
    $("console-list").replaceChildren(
      ...log.console.map((c, index) => {
        const item = el("li", `entry console-entry${sending.console.has(index) ? "" : " excluded"}`);
        const head = el("div", "console-head");
        const source = c.source === "exception" ? "Uncaught exception" : c.source === "rejection" ? "Unhandled promise rejection" : `console.${c.level}`;
        head.append(
          includeBox("console", index, `console ${c.level}: ${c.message.slice(0, 80)}`),
          el("span", `level level-${c.level}`, c.level === "error" ? "Error" : "Warning"),
          el("span", "muted", `${source} · ${clock(c.at)}`),
        );
        item.append(head, el("p", "mono message", c.message));
        if (c.stack) {
          const stack = el("details");
          stack.append(el("summary", "small", "Stack trace"), el("pre", "mono", c.stack));
          item.append(stack);
        }
        return item;
      }),
    );
  };
  rerender.console = render;
  render();
  showPicked("console");
  const empty = $("console-empty");
  empty.textContent = draft.logAvailable ? "No console errors or warnings." : "Nothing was recorded: the page was open before the extension was installed.";
  empty.hidden = log.console.length > 0;
}

function setUpTabs() {
  const tabs = [...document.querySelectorAll<HTMLButtonElement>(".tab")];
  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      for (const t of tabs) {
        const selected = t === tab;
        t.setAttribute("aria-selected", String(selected));
        $(`tab-${t.dataset.tab}`).hidden = !selected;
      }
    });
  }
}

function showLog(log: CaptureLog) {
  setUpSending();
  showPage(draft.page);
  showNetwork(log);
  showConsole(log);
  setUpTabs();
}

// ---- Submit ----

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const error = $("submit-error");
  error.hidden = true;
  const settings = await getSettings();
  if (!settings) {
    error.textContent = NO_SERVER;
    error.hidden = false;
    return;
  }

  const button = $<HTMLButtonElement>("submit");
  const progress = $("progress");
  button.disabled = true;
  button.textContent = "Uploading…";
  progress.hidden = false;

  try {
    const isImage = draft.kind === "image";
    const media = isImage && annotator ? await annotator.toBlob() : draft.blob;
    const trimmed = !isImage && (trim.start > 0 || trim.end < (draft.durationMs ?? trim.end) - 250);
    const meta = {
      title: $<HTMLInputElement>("title").value.trim(),
      description: $<HTMLTextAreaElement>("description").value.trim(),
      projectId: $<HTMLSelectElement>("project").value,
      versionId: $<HTMLSelectElement>("version").value,
      platformId: $<HTMLSelectElement>("platform").value || undefined,
      componentId: $<HTMLSelectElement>("module").value,
      severity: $<HTMLSelectElement>("severity").value,
      // Page details can be missing when the tab closed before a recording finished.
      page: draft.page ?? {
        url: "unknown",
        title: "",
        userAgent: navigator.userAgent,
        viewport: { width: 0, height: 0 },
        devicePixelRatio: window.devicePixelRatio,
        language: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      media: {
        kind: draft.kind,
        width: draft.width,
        height: draft.height,
        durationMs: draft.durationMs,
        ...(trimmed ? { trimStartMs: Math.round(trim.start), trimEndMs: Math.round(trim.end) } : {}),
        // Only the moments viewers can see, i.e. inside the trimmed part.
        ...(isImage
          ? {}
          : {
              markers: markers
                .filter((m) => m.atMs >= trim.start && m.atMs <= trim.end)
                .map((m) => ({ atMs: m.atMs, ...(m.label.trim() ? { label: m.label.trim().slice(0, 200) } : {}) })),
            }),
      },
    };
    const log = chosenLog();

    const form = new FormData();
    form.append("meta", JSON.stringify(meta));
    form.append("log", new Blob([JSON.stringify(log)], { type: "application/json" }), "log.json");
    form.append("media", media, isImage ? "screenshot.png" : "recording.webm");

    const result = await upload(settings, form, (f) => ($("progress-bar").style.width = `${Math.round(f * 100)}%`));
    submitted = true;
    await deleteDraft(draft.id).catch(() => {});
    const reported = projects.find((p) => p.id === meta.projectId);
    const last: LastChoice = {
      projectId: meta.projectId,
      listPath: reported ? `/o/${reported.organization.slug}/p/${reported.key}` : undefined,
      versionId: meta.versionId,
      platformId: meta.platformId,
      componentId: meta.componentId,
    };
    await chrome.storage.local.set({ [LAST_CHOICE]: last });

    $("form").hidden = true;
    $("done").hidden = false;
    button.hidden = true;
    progress.hidden = true;
    // It's uploaded: editing the capture any further would change nothing.
    $("tools").hidden = true;
    $("trim").hidden = true;
    $("stamps").hidden = true;
    $("done-sub").textContent = `Added to UpTrack as ${result.key}.`;
    $<HTMLInputElement>("share").value = result.shareUrl;
    $<HTMLInputElement>("fix").value = result.fixCommand;
    $<HTMLAnchorElement>("open-bug").href = result.bugUrl;
  } catch (err) {
    error.textContent = err instanceof ApiError ? err.message : `Something went wrong: ${String(err)}`;
    error.hidden = false;
    button.disabled = false;
    button.textContent = "Create bug";
    progress.hidden = true;
  }
});

function copyButton(buttonId: string, inputId: string) {
  $(buttonId).addEventListener("click", async () => {
    await navigator.clipboard.writeText($<HTMLInputElement>(inputId).value);
    const button = $(buttonId);
    button.textContent = "Copied";
    setTimeout(() => (button.textContent = "Copy"), 1500);
  });
}
copyButton("copy-share", "share");
copyButton("copy-fix", "fix");
$("close-tab").addEventListener("click", () => window.close());

window.addEventListener("beforeunload", (e) => {
  if (!submitted && draft) e.preventDefault();
});

// ---- Resizing the side panel ----

const SIDE_WIDTH = "sidePanelWidth";
const SIDE_MIN = 300;
/** The report keeps at least this much room. */
const REPORT_MIN = 480;

function setUpResizer() {
  const layout = document.querySelector<HTMLElement>(".layout")!;
  const handle = $("resizer");
  const panel = document.querySelector<HTMLElement>(".devtools")!;
  let saved: number | null = null;

  // Room for the panel: the layout's inside width, less the handle and the report's minimum.
  const room = () => {
    const style = getComputedStyle(layout);
    return layout.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - handle.offsetWidth - REPORT_MIN;
  };
  const limit = (width: number) => Math.round(Math.min(Math.max(width, SIDE_MIN), Math.max(SIDE_MIN, room())));
  const apply = (width: number | null) => {
    if (width === null) layout.style.removeProperty("--side");
    else layout.style.setProperty("--side", `${limit(width)}px`);
    handle.setAttribute("aria-valuenow", String(Math.round(panel.getBoundingClientRect().width)));
  };
  const save = (width: number | null) => {
    saved = width === null ? null : limit(width);
    void (saved === null ? chrome.storage.local.remove(SIDE_WIDTH) : chrome.storage.local.set({ [SIDE_WIDTH]: saved }));
  };

  void chrome.storage.local.get(SIDE_WIDTH).then((stored) => {
    if (typeof stored[SIDE_WIDTH] === "number") apply((saved = stored[SIDE_WIDTH]));
  });
  // A narrower window may not fit the saved width any more.
  window.addEventListener("resize", () => saved !== null && apply(saved));

  // The panel's width is the distance from the pointer to the layout's right edge (less its padding).
  const widthAt = (x: number) => layout.getBoundingClientRect().right - parseFloat(getComputedStyle(layout).paddingRight) - x - handle.offsetWidth / 2;
  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    document.body.classList.add("resizing");
  });
  handle.addEventListener("pointermove", (e) => {
    if (handle.hasPointerCapture(e.pointerId)) apply(widthAt(e.clientX));
  });
  const finish = (e: PointerEvent) => {
    if (!handle.hasPointerCapture(e.pointerId)) return;
    handle.releasePointerCapture(e.pointerId);
    document.body.classList.remove("resizing");
    save(panel.getBoundingClientRect().width);
  };
  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", finish);
  handle.addEventListener("dblclick", () => {
    apply(null);
    save(null);
  });
  handle.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 80 : 24;
    const width = panel.getBoundingClientRect().width;
    if (e.key === "ArrowLeft") apply(width + step);
    else if (e.key === "ArrowRight") apply(width - step);
    else return;
    e.preventDefault();
    save(panel.getBoundingClientRect().width);
  });
}

// ---- Start ----

(async () => {
  setUpResizer();
  fillSelect("severity", SEVERITIES.map((v) => ({ value: v, label: capitalize(v) })), "medium");
  const projectsLoaded = loadProjects();
  const params = new URLSearchParams(location.search);
  const problem = params.get("error");
  if (problem) return fail(problem);
  const id = params.get("draft");
  const found = id ? await getDraft(id) : undefined;
  if (!found) return fail("This capture isn't available any more. Take a new screenshot or recording from the extension.");
  draft = found;
  if (draft.page) {
    try {
      $("page-host").textContent = `from ${new URL(draft.page.url).host}`;
    } catch {}
  }
  showLog(draft.log);
  if (draft.kind === "image") await setUpImage();
  else setUpVideo();
  await projectsLoaded;
  $<HTMLInputElement>("title").focus();
})();
