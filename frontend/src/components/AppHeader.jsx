import { Bell, Building2, CalendarDays, LayoutDashboard, Menu, MonitorPlay, X } from "../icons.jsx";
import { shortName } from "./shared";

export function AppHeader({ tab, authUser, mobileNav, setMobileNav, navigate, upcomingCount, unreadNotificationCount, equipmentOnly, browse, signOut }) {
  const items = [
    { id: "explore", label: "Explore spaces", icon: Building2, active: tab === "explore" && !equipmentOnly, action: () => browse(false) },
    { id: "equipment", label: "Find equipment", icon: MonitorPlay, active: tab === "explore" && equipmentOnly, action: () => browse(true) },
    { id: "bookings", label: "Reservations", icon: CalendarDays, count: upcomingCount },
    { id: "notifications", label: "Notifications", icon: Bell, count: unreadNotificationCount },
    ...(authUser.role === "Admin" ? [{ id: "operations", label: "Operations", icon: LayoutDashboard }] : []),
  ];
  return <header className="app-header">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <button type="button" className="brand" onClick={() => browse(false)} aria-label="SpaceSense AI home">
      <img className="brand-logo" src="/assets/spacesense-logo.png" alt="" width="38" height="38" /><span>SpaceSense<span className="brand-ai">AI</span></span>
    </button>
    <button className="icon-button mobile-menu-toggle" type="button" aria-label={mobileNav ? "Close navigation" : "Open navigation"} aria-expanded={mobileNav} aria-controls="main-navigation" onClick={() => setMobileNav(!mobileNav)}>{mobileNav ? <X size={22} /> : <Menu size={22} />}</button>
    <div className={`header-menu ${mobileNav ? "is-open" : ""}`}>
      <nav id="main-navigation" aria-label="Main navigation">
        {items.map(({ id, label, icon: Icon, count, active, action }) => <button key={id} type="button" aria-current={(active ?? tab === id) ? "page" : undefined} onClick={action || (() => navigate(id))}>
          <Icon size={17} /><span>{label}</span>{count > 0 && <span className="nav-count">{count > 99 ? "99+" : count}</span>}
        </button>)}
      </nav>
      <div className="account-menu"><span className="account-avatar" aria-hidden="true">{shortName(authUser.displayName)}</span><div><strong title={authUser.email}>{authUser.displayName}</strong><span>{authUser.role}</span></div><button className="sign-out" type="button" onClick={signOut}>Sign out</button></div>
    </div>
  </header>;
}
