import type { ReportableProject } from "./types";
import { clearAuth, saveAuth, type Auth, type Settings } from "./settings";

export class ApiError extends Error {}

/** The extension isn't signed in, or its sign-in expired or was revoked. */
export class SignInRequired extends ApiError {}

const UNREACHABLE = "Couldn't reach UpTrack. Check your connection and try again.";

async function failure(res: Response): Promise<ApiError> {
  let text = `UpTrack answered with HTTP ${res.status}.`;
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) text = body.error;
  } catch {}
  if (res.status !== 401) return new ApiError(text);
  // The session is gone (expired, or signed out elsewhere): forget it so the menu asks to sign in again.
  await clearAuth();
  return new SignInRequired(text);
}

/** Sends the extension's own sign-in as a bearer token; never the browser's cookies. */
async function get(settings: Settings, path: string): Promise<Response> {
  if (!settings.token) throw new SignInRequired("Sign in to UpTrack to report bugs.");
  let res: Response;
  try {
    res = await fetch(`${settings.serverUrl}${path}`, { credentials: "omit", headers: { Authorization: `Bearer ${settings.token}` } });
  } catch {
    throw new ApiError(UNREACHABLE);
  }
  if (!res.ok) throw await failure(res);
  return res;
}

/** Signs in with an email and password and keeps the session for later requests. */
export async function signIn(serverUrl: string, email: string, password: string): Promise<Auth> {
  let res: Response;
  try {
    res = await fetch(`${serverUrl}/api/extension/session`, {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new ApiError(UNREACHABLE);
  }
  const body = (await res.json().catch(() => ({}))) as { token?: string; user?: { name: string; email: string }; error?: string };
  if (!res.ok || !body.token) throw new ApiError(body.error ?? `UpTrack answered with HTTP ${res.status}.`);
  const auth: Auth = { token: body.token, name: body.user?.name ?? "", email: body.user?.email ?? email };
  await saveAuth(auth);
  return auth;
}

/** Signs out: the server ends the session, and the extension forgets it either way. */
export async function signOut(settings: Settings): Promise<void> {
  if (settings.token) {
    await fetch(`${settings.serverUrl}/api/extension/session`, {
      method: "DELETE",
      credentials: "omit",
      headers: { Authorization: `Bearer ${settings.token}` },
    }).catch(() => {});
  }
  await clearAuth();
}

export interface Who {
  name: string;
  email: string;
  /** "organization" when they belong to any organization, else "personal". */
  account: "organization" | "personal";
  /** Where reports can go: organizations first, then the personal workspace. */
  workspaces: { name: string; kind: "organization" | "personal" }[];
}

/** Who reports will come from, and where they can go. */
export async function ping(settings: Settings): Promise<Who> {
  return (await (await get(settings, "/api/captures")).json()) as Who;
}

export interface UploadResult {
  key: string;
  number: number;
  shareUrl: string;
  bugUrl: string;
  fixCommand: string;
}

/** Projects (with versions and modules) the reporter can report to. */
export async function fetchProjects(settings: Settings): Promise<ReportableProject[]> {
  return ((await (await get(settings, "/api/captures/projects")).json()) as { projects: ReportableProject[] }).projects;
}

/** Adds a platform or feature to a project while reporting; a name it already has returns that one. */
export async function addProjectOption(
  settings: Settings,
  projectId: string,
  kind: "platform" | "feature",
  name: string,
): Promise<{ id: string; name: string; existed?: boolean }> {
  if (!settings.token) throw new SignInRequired("Sign in to UpTrack to report bugs.");
  let res: Response;
  try {
    res = await fetch(`${settings.serverUrl}/api/captures/options`, {
      method: "POST",
      credentials: "omit",
      headers: { Authorization: `Bearer ${settings.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, kind, name }),
    });
  } catch {
    throw new ApiError(UNREACHABLE);
  }
  if (!res.ok) throw await failure(res);
  return (await res.json()) as { id: string; name: string; existed?: boolean };
}

/** Uploads with XMLHttpRequest, which (unlike fetch) reports upload progress for big recordings. */
export function upload(settings: Settings, form: FormData, onProgress: (fraction: number) => void): Promise<UploadResult> {
  if (!settings.token) return Promise.reject(new SignInRequired("Sign in to UpTrack to report bugs."));
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${settings.serverUrl}/api/captures`);
    xhr.setRequestHeader("Authorization", `Bearer ${settings.token}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body: { error?: string } & Partial<UploadResult> = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status === 201 && body.key) return resolve(body as UploadResult);
      const text = body.error ?? `UpTrack answered with HTTP ${xhr.status}.`;
      if (xhr.status === 401) void clearAuth().then(() => reject(new SignInRequired(text)));
      else reject(new ApiError(text));
    };
    xhr.onerror = () => reject(new ApiError("The upload failed. Check your connection and try again."));
    xhr.send(form);
  });
}
