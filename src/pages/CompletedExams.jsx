import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../api/api.js";
import "../styles/CompletedExams.css";
import "../styles/FacultyDashboard.css";

export default function CompletedExams() {
  const navigate = useNavigate();
  const location = useLocation();

  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  useEffect(() => {
    const loadCompletedExams = async () => {
      try {
        const res = await api.get("/faculty/exams/completed");

        if (Array.isArray(res.data)) {
          setExams(res.data);
        } else {
          setExams([]);
        }
      } catch (err) {
        console.error(err);
        setError("Failed to load completed exams");
        setExams([]);
      } finally {
        setLoading(false);
      }
    };

    loadCompletedExams();
  }, []);

  return (
    <div className="completed-page">
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

      <main className="completed-main">
        <header className="completed-header">
          <div>
            <h1>Assessment History</h1>
            <p className="completed-subtitle">
              Review recently evaluated exams and access detailed results.
            </p>
          </div>
        </header>

        <div className="completed-list">
          {loading && <p className="completed-message">Loading completed exams...</p>}
          {!loading && error && (
            <p className="completed-error">{error}</p>
          )}

          {!loading && !error && exams.length === 0 && (
            <p className="completed-message">No completed exams found</p>
          )}

          {!loading && exams.length > 0 && (
            <div className="completed-cards">
              {exams.map((exam) => (
                <button
                  key={exam._id}
                  className="completed-card"
                  onClick={() =>
                    navigate(`/faculty/completed/${exam._id}`, {
                      state: { examTitle: exam.title },
                    })
                  }
                >
                  <div className="completed-card-main">
                    <div className="completed-card-title">{exam.title}</div>
                    <div className="completed-card-meta">
                      {exam.year} – {exam.branch} – {exam.section}
                    </div>
                  </div>

                  <div className="completed-card-stats">
                    <div>
                      <div className="completed-card-label">Duration</div>
                      <div className="completed-card-value">
                        {exam.duration} mins
                      </div>
                    </div>
                    <div>
                      <div className="completed-card-label">Ended</div>
                      <div className="completed-card-value">
                        {exam.endTime
                          ? new Date(exam.endTime).toLocaleString()
                          : "N/A"}
                      </div>
                    </div>
                  </div>

                  <div className="completed-card-footer">
                    <span className="completed-card-action">View Results →</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
