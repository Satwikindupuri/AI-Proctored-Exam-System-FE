import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import "../styles/StudentDashboard.css";

export default function StudentLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
    const beforeUnloadHandler = (event) => {
      if (!hasUnsavedChanges) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", beforeUnloadHandler);
    return () => window.removeEventListener("beforeunload", beforeUnloadHandler);
  }, [hasUnsavedChanges]);

  const canLeavePage = () => {
    if (!hasUnsavedChanges) {
      return true;
    }

    return window.confirm("You have unsaved profile changes. Leave without saving?");
  };

  const guardedNavigate = (path) => {
    if (path === location.pathname) {
      return;
    }

    if (!canLeavePage()) {
      return;
    }

    setHasUnsavedChanges(false);
    navigate(path);
  };

  const handleLogout = () => {
    if (!canLeavePage()) {
      return;
    }

    setHasUnsavedChanges(false);
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    navigate("/");
  };

  const navItems = [
    { key: "dashboard", label: "Dashboard", path: "/student", icon: "dashboard" },
    { key: "live", label: "Live Exams", path: "/student/live-exams", icon: "video" },
    { key: "results", label: "Completed Results", path: "/student/results", icon: "file" },
    { key: "analysis", label: "My Analysis", path: "/student/analysis", icon: "chart" },
    { key: "profile", label: "Profile", path: "/student/profile", icon: "user" },
  ];

  const renderIcon = (type) => {
    if (type === "dashboard") {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    }
    if (type === "video") {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="7" width="13" height="10" rx="2" />
          <path d="m16 10 5-3v10l-5-3" />
        </svg>
      );
    }
    if (type === "file") {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M8 13h8M8 17h8" />
        </svg>
      );
    }
    if (type === "chart") {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        </svg>
      );
    }
    if (type === "user") {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
        </svg>
      );
    }
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
      </svg>
    );
  };

  return (
    <div className="student-dashboard-page">
      <aside className="student-sidebar">
        <div>
          <div className="student-brand-row">
            <span className="student-brand-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </span>
            <h2 className="student-brand">Ai-PES</h2>
          </div>
        </div>

        <nav className="student-nav">
          {navItems.map((item) => {
            const isActive =
              item.path === "/student"
                ? location.pathname === "/student"
                : location.pathname.startsWith(item.path);

            return (
              <button
                key={item.key}
                className={`student-nav-btn ${isActive ? "active" : ""}`}
                onClick={() => guardedNavigate(item.path)}
              >
                <span className="student-nav-icon" aria-hidden="true">
                  {renderIcon(item.icon)}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <button className="student-logout-btn" onClick={handleLogout}>
          <span className="student-nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
          </span>
          <span>Logout</span>
        </button>
      </aside>

      <main className="student-main">
        <Outlet context={{ setHasUnsavedChanges }} />
      </main>
    </div>
  );
}
