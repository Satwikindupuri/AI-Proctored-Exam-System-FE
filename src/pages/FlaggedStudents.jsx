import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../api/api";
import "../styles/FacultyDashboard.css";
import "../styles/FlaggedStudents.css";
import { showToast } from "../utils/toast";

export default function FlaggedStudents() {
  const navigate = useNavigate();
  const location = useLocation();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadFlagged = async () => {
      try {
        const res = await api.get("/faculty/flagged");
        setStudents(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error(err);
        showToast("error", "Failed to load flagged students");
        setStudents([]);
      } finally {
        setLoading(false);
      }
    };

    loadFlagged();
  }, []);

  const navItems = [
    { key: "dashboard", label: "Dashboard", path: "/faculty", icon: "dashboard" },
    { key: "create", label: "Create Exam", path: "/faculty/create-exam", icon: "plus" },
    { key: "live", label: "Live Exams", path: "/faculty/live-exams", icon: "video" },
    { key: "completed", label: "Completed", path: "/faculty/completed", icon: "file" },
    { key: "analysis", label: "Student Analysis", path: "/faculty/faculty-student-analysis", icon: "chart" },
    { key: "flagged", label: "Flagged Students", path: "/faculty/flagged", icon: "shield" },
    { key: "coding", label: "Create Coding Exam", path: "/faculty/create-coding-exam", icon: "code" },
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
    if (type === "plus") {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v8M8 12h8" />
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
    if (type === "shield") {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    }
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
      </svg>
    );
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    navigate("/");
  };

  const parseTime = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  };

  const formatAgo = (value) => {
    const date = value instanceof Date ? value : parseTime(value);
    if (!date) return "-";

    const diffMs = Date.now() - date.getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return `just now`;
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="faculty-dashboard-page">
      <aside className="faculty-sidebar">
        <div>
          <div className="faculty-brand-row">
            <span className="faculty-brand-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </span>
            <h2 className="faculty-brand">Ai-PES</h2>
          </div>
        </div>

        <nav className="faculty-nav">
          {navItems.map((item) => {
            const isActive =
              item.path === "/faculty"
                ? location.pathname === "/faculty"
                : location.pathname.startsWith(item.path);

            return (
              <button
                key={item.key}
                className={`faculty-nav-btn ${isActive ? "active" : ""}`}
                onClick={() => navigate(item.path)}
              >
                <span className="faculty-nav-icon" aria-hidden="true">{renderIcon(item.icon)}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <button className="faculty-logout-btn" onClick={handleLogout}>
          <span className="faculty-nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
          </span>
          <span>Logout</span>
        </button>
      </aside>

      <main className="faculty-main">
        <div className="faculty-topbar">
          <div>
            <h1>Security Oversight</h1>
            <p>
              High-risk candidates are flagged automatically based on their proctoring violations.
            </p>
          </div>
        </div>

        <section className="flagged-banner">
          <div className="flagged-banner-icon">🚨</div>
          <div className="flagged-banner-text">
            <h2>High Risk Candidates</h2>
            <p>The following students have exceeded the normal threshold of proctoring violations.</p>
          </div>
        </section>

        <section className="flagged-list">
          {loading && <p className="flagged-message">Loading flagged students...</p>}
          {!loading && students.length === 0 && (
            <p className="flagged-message">No flagged students found.</p>
          )}

          {!loading && students.length > 0 && (
            <div className="flagged-cards">
              {students.map((s, idx) => {
                const totalViolations = s.violationsCount ?? s.totalViolations ?? 0;
                const lastViolationSource =
                  s.lastViolation ||
                  s.lastViolationAt ||
                  s.lastFlaggedAt ||
                  s.examCompletedAt ||
                  s.completedAt ||
                  s.examEndTime ||
                  s.endTime ||
                  s.endedAt;
                const timeAgo = formatAgo(lastViolationSource);

                return (
                  <div key={idx} className="flagged-card">
                    <div className="flagged-card-left">
                      <div className="flagged-avatar" aria-hidden="true">👤</div>
                      <div>
                        <div className="flagged-name">{s.name}</div>
                        <div className="flagged-meta">
                          {s.rollNo} • {s.class || s.section || "–"}
                        </div>
                      </div>
                    </div>

                    <div className="flagged-card-stats">
                      <div className="flagged-stat">
                        <div className="flagged-stat-label">Total Violations</div>
                        <div className="flagged-stat-value">{totalViolations}</div>
                      </div>
                      <div className="flagged-stat">
                        <div className="flagged-stat-label">Last Violation</div>
                        <div className="flagged-stat-value">{timeAgo}</div>
                      </div>
                    </div>

                    <div className="flagged-card-actions">
                      <button className="flagged-more" aria-label="More">
                        ⋮
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
