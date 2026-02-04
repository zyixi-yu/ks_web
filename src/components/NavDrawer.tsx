import React, { useEffect } from "react";
import { NavLink } from "react-router-dom";

type NavItem = {
  to: string;
  label: string;
  icon: React.ReactNode;
  end?: boolean;
};

export function IconMenu(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={props.className} aria-hidden="true">
      <path
        d="M4 7h16M4 12h16M4 17h16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconChevronRight(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={props.className} aria-hidden="true">
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconCoin(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={props.className} aria-hidden="true">
      <path
        d="M12 21c4.418 0 8-2.239 8-5V8c0-2.761-3.582-5-8-5S4 5.239 4 8v8c0 2.761 3.582 5 8 5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M20 8c0 2.761-3.582 5-8 5S4 10.761 4 8" stroke="currentColor" strokeWidth="2" />
      <path d="M20 12c0 2.761-3.582 5-8 5S4 14.761 4 12" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function IconCrown(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={props.className} aria-hidden="true">
      <path
        d="M4 8l4 5 4-7 4 7 4-5v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconTrophy(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={props.className} aria-hidden="true">
      <path
        d="M8 21h8M12 17v4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M7 4h10v6a5 5 0 0 1-10 0V4Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M7 6H5a2 2 0 0 0-2 2v1a4 4 0 0 0 4 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M17 6h2a2 2 0 0 1 2 2v1a4 4 0 0 1-4 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconUser(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={props.className} aria-hidden="true">
      <path
        d="M20 21a8 8 0 0 0-16 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconSearch(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={props.className} aria-hidden="true">
      <path
        d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M16.5 16.5 21 21"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconSettings(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={props.className} aria-hidden="true">
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M19.4 15a7.96 7.96 0 0 0 .1-1 7.96 7.96 0 0 0-.1-1l2-1.5-2-3.5-2.3 1a8.36 8.36 0 0 0-1.7-1l-.3-2.5H11l-.3 2.5a8.36 8.36 0 0 0-1.7 1l-2.3-1-2 3.5 2 1.5a7.96 7.96 0 0 0-.1 1c0 .34.03.67.1 1l-2 1.5 2 3.5 2.3-1a8.36 8.36 0 0 0 1.7 1l.3 2.5h4l.3-2.5a8.36 8.36 0 0 0 1.7-1l2.3 1 2-3.5-2-1.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function lockBodyScroll(open: boolean) {
  if (!open) return () => {};
  const prevOverflow = document.body.style.overflow;
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
    document.body.style.overflow = prevOverflow;
    document.body.style.paddingRight = prevPaddingRight;
  };
}

export default function NavDrawer(props: {
  open: boolean;
  title: string;
  subtitle?: string;
  items: NavItem[];
  onClose: () => void;
}) {
  useEffect(() => {
    if (!props.open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [props.open, props.onClose]);

  useEffect(() => lockBodyScroll(props.open), [props.open]);

  if (!props.open) return null;

  return (
    <div
      className="fixed inset-0 z-50"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-black/40 backdrop-blur-[2px]" />

      <div className="absolute inset-y-0 left-0 w-[84vw] max-w-[360px] overflow-hidden rounded-r-2xl border-r border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4">
          <div>
            <div className="text-base font-black text-slate-900">{props.title}</div>
            {props.subtitle ? <div className="mt-0.5 text-xs text-slate-500">{props.subtitle}</div> : null}
          </div>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-4 focus:ring-slate-900/10"
            onClick={props.onClose}
            aria-label="关闭菜单"
          >
            ×
          </button>
        </div>

        <nav className="p-2">
          {props.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={props.onClose}
              className={({ isActive }) =>
                [
                  "group flex items-center justify-between gap-3 rounded-xl px-3 py-3 text-sm font-bold transition",
                  "focus:outline-none focus:ring-4 focus:ring-cyan-600/10",
                  isActive
                    ? "bg-cyan-50 text-cyan-800"
                    : "text-slate-700 hover:bg-slate-50 active:bg-slate-100",
                ].join(" ")
              }
            >
              {({ isActive }) => (
                <>
                  <div className="flex items-center gap-3">
                    <span
                      className={[
                        "inline-flex h-9 w-9 items-center justify-center rounded-lg border",
                        isActive ? "border-cyan-200 bg-white text-cyan-700" : "border-slate-200 bg-white text-slate-600",
                      ].join(" ")}
                    >
                      <span className="h-5 w-5">{item.icon}</span>
                    </span>
                    <span className="text-base font-black">{item.label}</span>
                  </div>
                  <IconChevronRight className="h-5 w-5 text-slate-400 transition group-hover:text-slate-500" />
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 pb-4 pt-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
            常用查询与数据展示
          </div>
        </div>
      </div>
    </div>
  );
}
