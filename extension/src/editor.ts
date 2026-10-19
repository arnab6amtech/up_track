// Editor tab: annotate the screenshot (or trim the recording), describe the bug and upload it to UpTrack.

import { Annotator, type Tool } from "./annotate";
import { ApiError, fetchProjects, SignInRequired, upload } from "./shared/api";
import { deleteDraft, getDraft } from "./shared/drafts";
import { getSettings, signInUrl } from "./shared/settings";
import { describeUserAgent, isFailed, PRIORITIES, SEVERITIES, type CaptureLog, type Draft, type PageInfo, type ReportableProject } from "./shared/types";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const COLORS = ["#e11d48", "#f97316", "#facc15", "#16a34a", "#2563eb", "#0a0a0a"];

let draft: Draft;
let annotator: Annotator | null = null;
let trim = { start: 0, end: 0 };
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

function showVersions(projectId: string, preferred: { versionId?: string; componentId?: string } = {}) {
  const project = projects.find((p) => p.id === projectId);
  const versions = project?.versions ?? [];
  // Default to what the reporter used last, else whatever QA is testing now.
  const pick = versions.find((v) => v.id === preferred.versionId) ?? versions.find((v) => v.status === "in_testing") ?? versions[0];
  fillSelect(
    "version",
    versions.map((v) => ({ value: v.id, label: `${v.name}${v.status === "in_testing" ? " (in testing)" : ""}` })),
    pick?.id ?? "",
  );
  // Every bug names its feature; a project without any can't take reports yet.
  const features = project?.components ?? [];
  const select = $<HTMLSelectElement>("module");
  const placeholder = new Option(features.length ? "Choose a feature" : "No features yet", "", true, true);
  placeholder.disabled = true;
  const remembered = features.some((c) => c.id === preferred.componentId) ? preferred.componentId! : "";
  select.replaceChildren(placeholder, ...features.map((c) => new Option(c.name, c.id, false, c.id === remembered)));
  const missing = $("feature-missing");
  missing.textContent = project
    ? `${project.name} has no features yet, and every bug names one. Ask a project manager to add them in the project's settings.`
    : "";
  missing.hidden = !project || features.length > 0;
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
  const last = ((await chrome.storage.local.get(LAST_CHOICE))[LAST_CHOICE] ?? {}) as { projectId?: string; versionId?: string; componentId?: string };
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

function setUpVideo() {
  const video = $<HTMLVideoElement>("video");
  video.hidden = false;
  $("trim").hidden = false;
  video.src = URL.createObjectURL(draft.blob);
  const duration = () => (Number.isFinite(video.duration) ? video.duration * 1000 : (draft.durationMs ?? 0));
  const label = () => ($("trim-label").textContent = `${formatTime(trim.start)} to ${formatTime(trim.end)}`);
  video.addEventListener("loadedmetadata", () => {
    if (video.videoWidth && video.videoHeight) fitToStage(video, video.videoWidth, video.videoHeight);
    trim = { start: 0, end: duration() };
    label();
  });
  $("trim-start").addEventListener("click", () => {
    trim.start = Math.min(video.currentTime * 1000, trim.end - 500);
    label();
  });
  $("trim-end").addEventListener("click", () => {
    trim.end = Math.max(video.currentTime * 1000, trim.start + 500);
    label();
  });
  $("trim-reset").addEventListener("click", () => {
    trim = { start: 0, end: duration() };
    label();
  });
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

function showSummary(log: CaptureLog) {
  const failed = log.network.filter(isFailed).length;
  const errors = log.console.filter((c) => c.level === "error").length;
  $("log-summary").textContent =
    `${log.network.length} API ${log.network.length === 1 ? "call" : "calls"}, ${failed} failed · ` +
    `${errors} console ${errors === 1 ? "error" : "errors"} · page and browser details`;
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

function codeBlock(title: string, text: string) {
  const box = el("div");
  box.append(el("p", undefined, title), el("pre", "mono", text));
  return box;
}

const headerText = (headers: Record<string, string>) => Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join("\n");

function showNetwork(log: CaptureLog) {
  const failed = log.network.filter(isFailed).length;
  const count = $("count-network");
  count.replaceChildren(String(log.network.length));
  if (failed) count.append(" · ", el("span", "status-fail", `${failed} failed`));

  const render = () => {
    const failedOnly = $<HTMLInputElement>("failed-only").checked;
    const query = $<HTMLInputElement>("network-filter").value.trim().toLowerCase();
    const calls = log.network.filter((e) => (!failedOnly || isFailed(e)) && (!query || e.url.toLowerCase().includes(query)));
    const list = $("network-list");
    list.replaceChildren(
      ...calls.map((e) => {
        const item = el("li");
        const details = el("details", "entry net");
        const summary = el("summary");
        let path = e.url;
        try {
          const u = new URL(e.url);
          path = u.pathname + u.search;
        } catch {}
        summary.append(
          el("span", `mono ${isFailed(e) ? "status-fail" : "status-ok"}`, String(e.status || "ERR")),
          el("span", "mono", e.method),
          Object.assign(el("span", "mono path", path), { title: e.url }),
          el("span", "muted", `${Math.round(e.durationMs)} ms`),
        );
        const body = el("div", "entry-body");
        body.append(codeBlock("URL", e.url));
        if (e.error) body.append(codeBlock("Error", e.error));
        if (e.requestHeaders && Object.keys(e.requestHeaders).length) body.append(codeBlock("Request headers", headerText(e.requestHeaders)));
        if (e.requestBody) body.append(codeBlock("Request body", e.requestBody));
        if (e.responseHeaders && Object.keys(e.responseHeaders).length) body.append(codeBlock("Response headers", headerText(e.responseHeaders)));
        if (e.responseBody) body.append(codeBlock("Response body", e.responseBody));
        details.append(summary, body);
        item.append(details);
        return item;
      }),
    );
    const empty = $("network-empty");
    empty.textContent = !draft.logAvailable
      ? "No API calls were recorded: the page was open before the extension was installed. Reload it and reproduce the bug."
      : query && log.network.length
        ? "No calls match that filter."
        : failedOnly && log.network.length
          ? "No failed calls."
        : "The page made no API calls.";
    empty.hidden = calls.length > 0;
  };
  $("failed-only").addEventListener("change", render);
  $("network-filter").addEventListener("input", render);
  render();
}

function showConsole(log: CaptureLog) {
  const errors = log.console.filter((c) => c.level === "error").length;
  const count = $("count-console");
  count.replaceChildren(String(log.console.length));
  if (errors) count.append(" · ", el("span", "status-fail", `${errors} ${errors === 1 ? "error" : "errors"}`));
  $("console-list").replaceChildren(
    ...log.console.map((c) => {
      const item = el("li", "entry console-entry");
      const head = el("div", "console-head");
      const source = c.source === "exception" ? "Uncaught exception" : c.source === "rejection" ? "Unhandled promise rejection" : `console.${c.level}`;
      head.append(el("span", `level level-${c.level}`, c.level === "error" ? "Error" : "Warning"), el("span", "muted", `${source} · ${clock(c.at)}`));
      item.append(head, el("p", "mono message", c.message));
      if (c.stack) {
        const stack = el("details");
        stack.append(el("summary", "small", "Stack trace"), el("pre", "mono", c.stack));
        item.append(stack);
      }
      return item;
    }),
  );
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
  showSummary(log);
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
      componentId: $<HTMLSelectElement>("module").value,
      severity: $<HTMLSelectElement>("severity").value,
      priority: $<HTMLSelectElement>("priority").value,
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
      },
    };
    const log = $<HTMLInputElement>("attach-log").checked ? draft.log : { network: [], console: [] };

    const form = new FormData();
    form.append("meta", JSON.stringify(meta));
    form.append("log", new Blob([JSON.stringify(log)], { type: "application/json" }), "log.json");
    form.append("media", media, isImage ? "screenshot.png" : "recording.webm");

    const result = await upload(settings, form, (f) => ($("progress-bar").style.width = `${Math.round(f * 100)}%`));
    submitted = true;
    await deleteDraft(draft.id).catch(() => {});
    await chrome.storage.local.set({ [LAST_CHOICE]: { projectId: meta.projectId, versionId: meta.versionId, componentId: meta.componentId } });

    $("form").hidden = true;
    $("done").hidden = false;
    button.hidden = true;
    progress.hidden = true;
    // It's uploaded: editing the capture any further would change nothing.
    $("tools").hidden = true;
    $("trim").hidden = true;
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

// ---- Start ----

(async () => {
  fillSelect("severity", SEVERITIES.map((v) => ({ value: v, label: capitalize(v) })), "medium");
  fillSelect("priority", PRIORITIES.map((v) => ({ value: v, label: capitalize(v) })), "medium");
  const projectsLoaded = loadProjects();
  const id = new URLSearchParams(location.search).get("draft");
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
