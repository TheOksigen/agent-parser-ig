import Link from "next/link";
import {
  Archive,
  BookOpen,
  ListChecks,
  Smartphone,
  Users,
  ArrowUpRight,
} from "lucide-react";
import { Logout } from "./controls";

const nav = [
  { path: "/", label: "Paylaşımlar", icon: BookOpen },
  { path: "/profiles", label: "Profillər", icon: Users },
  { path: "/tasks", label: "Tapşırıqlar", icon: ListChecks },
  { path: "/devices", label: "Cihazlar", icon: Smartphone },
];
export function Shell({
  active,
  children,
}: {
  active: string;
  children: React.ReactNode;
}) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Məzmuna keç
      </a>
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-mark">
            <Archive size={22} />
          </span>
          <span>
            postarxiv<span className="brand-sub">INSTAGRAM ARXİVİ</span>
          </span>
        </Link>
        <div className="workspace-label">İŞ SAHƏSİ</div>
        <nav aria-label="Əsas naviqasiya">
          {nav.map(({ path, label, icon: Icon }) => (
            <Link
              key={path}
              href={path}
              className={active === path ? "nav-item active" : "nav-item"}
              aria-current={active === path ? "page" : undefined}
            >
              <Icon size={19} />
              {label}
              {active === path && <span className="nav-dot" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="agent-note">
            <span className="tiny-dot" />
            Android ilə toplanır
            <p>
              İctimai paylaşımlar.
              <br />
              Mətnlər tam saxlanılır.
            </p>
          </div>
          <Logout />
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            Instagram /{" "}
            <strong>{nav.find((n) => n.path === active)?.label}</strong>
          </span>
          <span className="prototype-badge">
            İlkin prototip <ArrowUpRight size={13} />
          </span>
          <div className="mobile-logout">
            <Logout />
          </div>
        </header>
        <main id="main">{children}</main>
        <footer>
          Postarxiv{" "}
          <span>Tarixçə yalnız əldə edilmiş məlumatları əhatə edir.</span>
        </footer>
      </div>
    </div>
  );
}
export function PageHeading({
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p className="description">{description}</p>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
export function Empty({
  title,
  children,
  icon: Icon = Archive,
}: {
  title: string;
  children: React.ReactNode;
  icon?: typeof Archive;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={28} strokeWidth={1.5} />
      </div>
      <h2>{title}</h2>
      <div className="muted">{children}</div>
    </div>
  );
}
const statuses: Record<string, [string, string]> = {
  QUEUED: ["Növbədə", "neutral"],
  RUNNING: ["İcra olunur", "green"],
  WAITING_USER: ["Müdaxilə gözləyir", "amber"],
  SUCCEEDED: ["Tamamlanıb", "green"],
  PARTIAL: ["Toplanıb · natamam", "amber"],
  FAILED: ["Xəta", "red"],
  CANCELLED: ["Dayandırılıb", "neutral"],
};
export function Status({ value }: { value: string }) {
  const [label, color] = statuses[value] ?? [value, "neutral"];
  return (
    <span className={`status ${color}`}>
      <span />
      {label}
    </span>
  );
}
