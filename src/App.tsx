import React from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import CreditsQuery from "./components/CreditsQuery";
import Leaderboard from "./components/Leaderboard";
import Proposals from "./components/Proposals";

export default function App() {
  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="inline-flex h-9 overflow-hidden rounded-xl">
              <img
                src="/ksicon.png"
                alt="凯瑞甘生存"
                className="h-full w-auto object-contain"
                loading="eager"
                decoding="async"
              />
            </div>
            <div>
              <div className="text-sm font-black leading-4 text-slate-900">凯瑞甘生存</div>
              <div className="text-xs text-slate-500">积分助手 · 钻石议会 · 排行榜</div>
            </div>
          </div>

          <nav className="flex items-center gap-1">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                [
                  "rounded-lg px-3 py-2 text-sm font-bold transition",
                  isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100",
                ].join(" ")
              }
            >
              积分查询
            </NavLink>
            <NavLink
              to="/council"
              className={({ isActive }) =>
                [
                  "rounded-lg px-3 py-2 text-sm font-bold transition",
                  isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100",
                ].join(" ")
              }
            >
              钻石议会
            </NavLink>
            <NavLink
              to="/leaderboard"
              className={({ isActive }) =>
                [
                  "rounded-lg px-3 py-2 text-sm font-bold transition",
                  isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100",
                ].join(" ")
              }
            >
              排行榜
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <Routes>
          <Route path="/" element={<CreditsQuery />} />
          <Route path="/council" element={<Proposals />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="*" element={<CreditsQuery />} />
        </Routes>
      </main>
    </div>
  );
}
