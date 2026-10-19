import type { Settings } from "./settings";

export class ApiError extends Error {}

async function message(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {}
  return `UpTrack answered with HTTP ${res.status}.`;
}

/** Checks the server address and token; returns the name the token belongs to. */
export async function ping(settings: Settings): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${settings.serverUrl}/api/captures`, { headers: { Authorization: `Bearer ${settings.token}` } });
  } catch {
    throw new ApiError("Couldn't reach UpTrack at that address. Is it running, and is the address right?");
  }
  if (!res.ok) throw new ApiError(await message(res));
  return ((await res.json()) as { name: string }).name;
}

export interface UploadResult {
  id: string;
  number: number;
  shareUrl: string;
  bugUrl: string;
}

/** Uploads with XMLHttpRequest, which (unlike fetch) reports upload progress for big recordings. */
export function upload(settings: Settings, form: FormData, onProgress: (fraction: number) => void): Promise<UploadResult> {
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
      if (xhr.status === 201 && body.id) resolve(body as UploadResult);
      else reject(new ApiError(body.error ?? `UpTrack answered with HTTP ${xhr.status}.`));
    };
    xhr.onerror = () => reject(new ApiError("The upload failed. Check your connection and try again."));
    xhr.send(form);
  });
}
