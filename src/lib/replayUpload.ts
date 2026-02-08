import * as Sentry from "@sentry/react";

export type UploadFileStatus = "pending" | "validating" | "uploading" | "success" | "error";

export type UploadFileEntry = {
  file: File;
  status: UploadFileStatus;
  progress: number;
  error?: string;
};

const MAX_FILE_SIZE = 3 * 1024 * 1024; // 3 MB
const SC2_MAGIC = [0x4d, 0x50, 0x51, 0x1b, 0x00, 0x02, 0x00, 0x00, 0x00, 0x04];

export async function validateReplayFile(file: File): Promise<string | null> {
  if (file.size > MAX_FILE_SIZE) {
    return `文件过大（${(file.size / 1024 / 1024).toFixed(1)} MB），最大 3 MB`;
  }
  if (file.size < SC2_MAGIC.length) {
    return "文件过小，不是有效的 SC2Replay 文件";
  }
  try {
    const buf = new Uint8Array(await file.slice(0, SC2_MAGIC.length).arrayBuffer());
    for (let i = 0; i < SC2_MAGIC.length; i++) {
      if (buf[i] !== SC2_MAGIC[i]) return "文件头不匹配，不是有效的 SC2Replay 文件";
    }
  } catch {
    return "无法读取文件内容";
  }
  return null;
}

export function uploadReplayFile(
  file: File,
  onProgress: (loaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<{ ok: boolean; status: number; body: string }> {
  return Sentry.startSpan(
    { op: "http.client", name: "POST /api/replay-upload" },
    () =>
      new Promise<{ ok: boolean; status: number; body: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/replay-upload");
        xhr.setRequestHeader("Content-Type", "application/octet-stream");

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress(e.loaded, e.total);
        };

        xhr.onload = () => {
          resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, body: xhr.responseText });
        };

        xhr.onerror = () => reject(new Error("网络错误"));
        xhr.ontimeout = () => reject(new Error("上传超时"));
        xhr.timeout = 60_000;

        if (signal) {
          if (signal.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
          }
          signal.addEventListener("abort", () => xhr.abort());
          xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
        }

        xhr.send(file);
      }),
  );
}
