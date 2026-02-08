import React, { useEffect } from "react";

export default function Modal(props: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!props.open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [props.open, props.onClose]);

  useEffect(() => {
    if (!props.open) return;
    const prev = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    const supportsStableGutter =
      typeof CSS !== "undefined" && typeof (CSS as any).supports === "function"
        ? (CSS as any).supports("scrollbar-gutter: stable")
        : false;
    const scrollbarWidth = supportsStableGutter ? 0 : window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    return () => {
      document.body.style.overflow = prev;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [props.open]);

  if (!props.open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div
        className="flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl max-h-[calc(100dvh-2rem)]"
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="text-base font-black text-slate-900">{props.title}</div>
          <button
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            onClick={props.onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-4">{props.children}</div>
      </div>
    </div>
  );
}
