import React, { useEffect, useMemo, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import CreditsQuery from "./components/CreditsQuery";
import Leaderboard from "./components/Leaderboard";
import I18nSearch from "./components/I18nSearch";
import PlayerRoleQuery from "./components/PlayerRoleQuery";
import Proposals from "./components/Proposals";
import PatchNotes from "./components/PatchNotes";
import ConfigEditor from "./components/ConfigEditor";
import NavDrawer, {
  IconClipboardList,
  IconCoin,
  IconCrown,
  IconMenu,
  IconSearch,
  IconSettings,
  IconTrophy,
  IconUser,
} from "./components/NavDrawer";
import { clearAdminToken, loadAdminToken, saveAdminToken, takeBootstrapToken, validateAdminToken } from "./lib/adminToken";

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [adminEnabled, setAdminEnabled] = useState(false);
  const [adminToken, setAdminToken] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function boot() {
      const bootstrap = takeBootstrapToken();
      if (bootstrap) {
        const ok = await validateAdminToken(bootstrap);
        if (!alive) return;
        if (ok) {
          saveAdminToken(bootstrap);
          setAdminEnabled(true);
          setAdminToken(bootstrap);
        } else {
          clearAdminToken();
          setAdminEnabled(false);
          setAdminToken(null);
        }
        return;
      }

      const existing = loadAdminToken();
      if (!existing) return;
      const ok = await validateAdminToken(existing);
      if (!alive) return;
      if (ok) {
        setAdminEnabled(true);
        setAdminToken(existing);
      } else {
        clearAdminToken();
        setAdminEnabled(false);
        setAdminToken(null);
      }
    }
    void boot();
    return () => {
      alive = false;
    };
  }, []);

  const navItems = useMemo(
    () => {
      const items = [
        { to: "/", label: "积分", icon: <IconCoin className="h-5 w-5" />, end: true },
        { to: "/council", label: "议会", icon: <IconCrown className="h-5 w-5" /> },
        { to: "/leaderboard", label: "排行", icon: <IconTrophy className="h-5 w-5" /> },
        { to: "/player", label: "角色", icon: <IconUser className="h-5 w-5" /> },
        { to: "/i18n", label: "翻译", icon: <IconSearch className="h-5 w-5" /> },
        { to: "/patchnotes", label: "更新", icon: <IconClipboardList className="h-5 w-5" /> },
      ];
      if (adminEnabled) {
        items.push({ to: "/config", label: "配置", icon: <IconSettings className="h-5 w-5" /> });
      }
      return items;
    },
    [adminEnabled],
  );

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-cyan-600/10 md:hidden"
              onClick={() => setMenuOpen(true)}
              aria-label="打开菜单"
            >
              <IconMenu className="h-6 w-6" />
            </button>

            <div className="inline-flex h-9 overflow-hidden rounded-xl border border-slate-200 bg-white">
              <img
                src="/ksicon.png"
                alt="凯瑞甘生存"
                className="h-full w-auto object-contain"
                loading="eager"
                decoding="async"
              />
            </div>

            <div className="min-w-0">
              <div className="truncate text-sm font-black leading-4 text-slate-900">凯瑞甘生存·工具箱</div>
              <div className="hidden truncate text-xs text-slate-500 sm:block">常用查询与数据展示</div>
            </div>
          </div>

          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  [
                    "whitespace-nowrap rounded-xl border px-3 py-2 text-sm font-black transition",
                    "focus:outline-none focus:ring-4 focus:ring-cyan-600/10",
                    isActive
                      ? "border-cyan-200 bg-cyan-50 text-cyan-800"
                      : "border-transparent text-slate-700 hover:bg-slate-50",
                  ].join(" ")
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <Routes>
          <Route path="/" element={<CreditsQuery />} />
          <Route path="/council" element={<Proposals />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/i18n" element={<I18nSearch />} />
          <Route path="/patchnotes" element={<PatchNotes />} />
          <Route path="/player" element={<PlayerRoleQuery />} />
          <Route path="/player/:handle" element={<PlayerRoleQuery />} />
          <Route
            path="/config"
            element={
              <ConfigEditor
                token={adminToken}
                onTokenInvalid={() => {
                  clearAdminToken();
                  setAdminEnabled(false);
                  setAdminToken(null);
                }}
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <NavDrawer
        open={menuOpen}
        title="KS 工具箱"
        subtitle="选择一个功能页"
        items={navItems}
        onClose={() => setMenuOpen(false)}
      />
    </div>
  );
}
