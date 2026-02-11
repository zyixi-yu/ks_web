import React, { useCallback, useEffect, useRef, useState } from "react";
import * as Sentry from "@sentry/react";
import { Link } from "react-router-dom";
import { validateReplayFile, uploadReplayFile, type UploadFileEntry } from "../lib/replayUpload";

let entryId = 0;
type Entry = UploadFileEntry & { id: number };
const MAX_UPLOAD_ATTEMPTS = 3;

export default function ReplayUpload() {
  const { logger } = Sentry;
  const [files, setFiles] = useState<Entry[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const uploadingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const updateEntry = (id: number, patch: Partial<Entry>) =>
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const arr = Array.from(incoming).filter((f) => f.name.toLowerCase().endsWith(".sc2replay"));
      if (!arr.length) return;
      const entries: Entry[] = arr.map((f) => ({ id: ++entryId, file: f, status: "pending", progress: 0 }));
      setFiles((prev) => [...prev, ...entries]);
      logger.info("replay.files.added", { count: arr.length });
    },
    [logger],
  );

  const removeEntry = (id: number) => setFiles((prev) => prev.filter((f) => f.id !== id));

  const clearDone = () => setFiles((prev) => prev.filter((f) => f.status !== "success"));

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  const startUpload = async () => {
    if (uploadingRef.current) return;
    uploadingRef.current = true;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setUploading(true);

    const pending = files.filter((f) => f.status === "pending");
    logger.info("replay.upload.batch.start", { count: pending.length });

    for (const entry of pending) {
      if (ctrl.signal.aborted) break;

      // validate
      updateEntry(entry.id, { status: "validating", progress: 0, error: undefined });
      const err = await validateReplayFile(entry.file);
      if (err) {
        updateEntry(entry.id, { status: "error", error: err });
        logger.warn("replay.upload.validation_failed", { file: entry.file.name, error: err });
        continue;
      }

      // upload
      updateEntry(entry.id, { status: "uploading", progress: 0 });
      try {
        let uploaded = false;

        for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt++) {
          const res = await uploadReplayFile(
            entry.file,
            (loaded, total) => updateEntry(entry.id, { progress: total > 0 ? loaded / total : 0 }),
            ctrl.signal,
          );

          if (res.ok) {
            updateEntry(entry.id, { status: "success", progress: 1 });
            logger.info("replay.upload.file.ok", {
              file: entry.file.name,
              size: entry.file.size,
              attempts: attempt,
            });
            uploaded = true;
            break;
          }

          logger.warn("replay.upload.file.server_error", {
            file: entry.file.name,
            status: res.status,
            body: res.body.slice(0, 200),
            attempt,
            maxAttempts: MAX_UPLOAD_ATTEMPTS,
          });

          if (attempt === MAX_UPLOAD_ATTEMPTS) {
            updateEntry(entry.id, { status: "error", error: "服务繁忙，请稍后重试" });
            logger.error("replay.upload.file.server_error.final", {
              file: entry.file.name,
              status: res.status,
              body: res.body.slice(0, 200),
              attempts: MAX_UPLOAD_ATTEMPTS,
            });
          }
        }

        if (!uploaded) {
          continue;
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          updateEntry(entry.id, { status: "pending", progress: 0 });
          logger.info("replay.upload.cancelled");
          break;
        }
        updateEntry(entry.id, { status: "error", error: e instanceof Error ? e.message : "上传失败" });
        Sentry.captureException(e);
        logger.error("replay.upload.file.failed", { file: entry.file.name, error: e instanceof Error ? e.message : String(e) });
      }
    }

    logger.info("replay.upload.batch.done");
    setUploading(false);
    uploadingRef.current = false;
    abortRef.current = null;
  };

  const startUploadRef = useRef(startUpload);
  startUploadRef.current = startUpload;

  useEffect(() => {
    if (!uploadingRef.current && files.some((f) => f.status === "pending")) {
      startUploadRef.current();
    }
  }, [uploading, files]);

  const cancelUpload = () => abortRef.current?.abort();

  const retryFailed = () => {
    setFiles((prev) =>
      prev.map((f) => (f.status === "error" ? { ...f, status: "pending" as const, error: undefined, progress: 0 } : f)),
    );
  };

  const counts = files.reduce(
    (a, f) => {
      a[f.status] = (a[f.status] || 0) + 1;
      return a;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-center text-lg font-black text-slate-900">录像上传</h1>
        <p className="mt-1 text-center text-sm text-slate-500">
          拖拽或选择 <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">.SC2Replay</code> 文件上传 ·{" "}
          <Link to="/" className="font-black text-blue-700 hover:text-blue-800 hover:underline">
            返回积分查询
          </Link>
        </p>

        {/* drop zone */}
        <div
          className={[
            "mt-4 flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 transition",
            dragOver ? "border-blue-500 bg-blue-50" : "border-slate-300 hover:border-slate-400 hover:bg-slate-50",
          ].join(" ")}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8 text-slate-400" aria-hidden="true">
            <path d="M12 16V4m0 0L8 8m4-4l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M20 16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-sm text-slate-500">拖拽文件到此处，或点击选择文件</span>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".sc2replay"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {/* file list */}
        {files.length > 0 && (
          <div className="mt-4 space-y-2">
            {files.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2"
              >
                <StatusIcon status={entry.status} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-slate-700">{entry.file.name}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{(entry.file.size / 1024).toFixed(0)} KB</span>
                    {entry.error && <span className="truncate text-xs text-red-600">{entry.error}</span>}
                  </div>
                  {entry.status === "uploading" && (
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-blue-600 transition-all"
                        style={{ width: `${Math.round(entry.progress * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
                {!uploading && (
                  <button
                    type="button"
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    aria-label="移除"
                    onClick={() => removeEntry(entry.id)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
                      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* actions */}
        {files.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {!uploading && (counts.error || 0) > 0 && (
              <button
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-blue-700"
                onClick={retryFailed}
              >
                重试失败
              </button>
            )}
            {uploading && (
              <button
                className="rounded-xl border border-red-200 bg-white px-5 py-2.5 text-sm font-black text-red-600 transition hover:bg-red-50"
                onClick={cancelUpload}
              >
                取消
              </button>
            )}
            {!uploading && (counts.success || 0) > 0 && (
              <button
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                onClick={clearDone}
              >
                清除已完成
              </button>
            )}
            <div className="ml-auto text-xs text-slate-500">
              共 {files.length} 个{counts.success ? ` · ${counts.success} 成功` : ""}
              {counts.error ? ` · ${counts.error} 失败` : ""}
              {uploading ? " · 上传中..." : ""}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "success")
    return (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true">
        <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (status === "error")
    return (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 shrink-0 text-red-500" aria-hidden="true">
        <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  if (status === "uploading" || status === "validating")
    return <div className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />;
  return <div className="h-5 w-5 shrink-0 rounded-full border-2 border-slate-300" />;
}
