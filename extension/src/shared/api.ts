import type { ReportableProject } from "./types";
import type { Settings } from "./settings";

export class ApiError extends Error {}

/** UpTrack doesn't know who this is: not signed in in this browser, and no working token. */
export class SignInRequired extends ApiError {}

async function failure(res: Response): Promise<ApiError> {
  let text = `UpTrack answered with HTTP ${res.status}.`;
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) text = body.error;
  } catch {}
  return res.status === 401 ? new SignInRequired(text) : new ApiError(text);
}

/** Sends the browser's UpTrack sign-in (cookies) along, plus the token when one is set. */
async function get(settings: Settings, path: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${settings.serverUrl}${path}`, {
      credentials: "include",
      headers: settings.token ? { Authorization: `Bearer ${settings.token}` } : {},
    });
  } catch {
    throw new ApiError("Couldn't reach UpTrack at that address. Is it running, and is the address right?");
  }
  if (!res.ok) throw await failure(res);
  return res;
}

export interface Who {
  name: string;
  organizations: string[];
  via: "token" | "session";
  /** The saved token no longer works; the browser's sign-in was used instead. */
  tokenRejected: boolean;
}

/** Checks the server address and returns who reports will come from. */
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

/** Uploads with XMLHttpRequest, which (unlike fetch) reports upload progress for big recordings. */
export function upload(settings: Settings, form: FormData, onProgress: (fraction: number) => void): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${settings.serverUrl}/api/captures`);
    xhr.withCredentials = true;
    if (settings.token) xhr.setRequestHeader("Authorization", `Bearer ${settings.token}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body: { error?: string } & Partial<UploadResult> = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status === 201 && body.key) return resolve(body as UploadResult);
      const text = body.error ?? `UpTrack answered with HTTP ${xhr.status}.`;
      reject(xhr.status === 401 ? new SignInRequired(text) : new ApiError(text));
    };
    xhr.onerror = () => reject(new ApiError("The upload failed. Check your connection and try again."));
    xhr.send(form);
  });
}
