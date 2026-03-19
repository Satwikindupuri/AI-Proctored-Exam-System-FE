import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../api/api.js";
import "../styles/FacultyLiveExams.css";
import "../styles/FacultyDashboard.css";
import { showToast } from "../utils/toast";

export default function FacultyLiveExams() {
  const navigate = useNavigate();
  const location = useLocation();
  const [exams, setExams] = useState([]);
  const [examPendingEnd, setExamPendingEnd] = useState(null);
  const [endingExam, setEndingExam] = useState(false);
  const [filters, setFilters] = useState({
    year: "",
    branch: "",
    section: ""
  });

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

  const loadExams = async () => {
    const params = {};
    if (filters.year) params.year = filters.year;
    if (filters.branch) params.branch = filters.branch;
    if (filters.section) params.section = filters.section;

    const res = await api.get("/faculty/exams/live", { params });
    setExams(res.data);
  };

  useEffect(() => {
    loadExams();
  }, []);

  const confirmEndExam = async () => {
    if (!examPendingEnd || endingExam) {
      return;
    }

    setEndingExam(true);
    try {
      await api.patch(`/faculty/exams/${examPendingEnd._id}/end`);
      showToast("success", "Exam ended");
      setExams((prev) => prev.filter((exam) => exam._id !== examPendingEnd._id));
      setExamPendingEnd(null);
    } catch (err) {
      showToast("error", "Failed to end exam");
    } finally {
      setEndingExam(false);
    }
  };

  return (
    <div className="live-exams-page">
      {examPendingEnd && (
        <div className="live-confirm-overlay" onClick={() => !endingExam && setExamPendingEnd(null)}>
          <div className="live-confirm-modal" onClick={(event) => event.stopPropagation()}>
            <div className="live-confirm-badge">Confirm Action</div>
            <h3>End this exam?</h3>
            <p>
              <strong>{examPendingEnd.title}</strong> will be closed for all students immediately.
            </p>
            <div className="live-confirm-actions">
              <button
                type="button"
                className="live-confirm-btn live-confirm-btn-cancel"
                onClick={() => setExamPendingEnd(null)}
                disabled={endingExam}
              >
                Cancel
              </button>
              <button
                type="button"
                className="live-confirm-btn live-confirm-btn-danger"
                onClick={confirmEndExam}
                disabled={endingExam}
              >
                {endingExam ? "Ending..." : "Yes, End Exam"}
              </button>
            </div>
          </div>
        </div>
      )}

      <aside className="faculty-sidebar">
        <div>
          <div className="faculty-brand-row">
            <span className="faculty-brand-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </span>
            <h2 className="faculty-brand">ExamPro</h2>
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

      <main className="live-exams-main">
        <div className="live-exams-header">
          <h1>Live Exam Monitoring</h1>
          <div className="live-system-badge">Live System Active</div>
        </div>

        <h2 className="live-exams-section-title">Ongoing Sessions</h2>

        <div className="live-exams-filters">
          <input
            className="live-filter-input"
            placeholder="Year"
            value={filters.year}
            onChange={e => setFilters({ ...filters, year: e.target.value })}
          />
          <input
            className="live-filter-input"
            placeholder="Branch"
            value={filters.branch}
            onChange={e => setFilters({ ...filters, branch: e.target.value })}
          />
          <input
            className="live-filter-input"
            placeholder="Section"
            value={filters.section}
            onChange={e => setFilters({ ...filters, section: e.target.value })}
          />

          <button className="live-filter-btn live-filter-btn-apply" onClick={loadExams}>
            Apply
          </button>
          <button
            className="live-filter-btn live-filter-btn-clear"
            onClick={() => {
              setFilters({ year: "", branch: "", section: "" });
              setTimeout(loadExams, 0);
            }}
          >
            Clear
          </button>
        </div>

        <div className="live-exams-list">
          {exams.length === 0 && (
            <div className="live-exams-empty">No live exams found</div>
          )}

          {exams.map(exam => (
            <div key={exam._id} className="live-exam-card">
              <div className="live-exam-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="7" width="13" height="10" rx="2" />
                  <path d="m16 10 5-3v10l-5-3" />
                </svg>
              </div>

              <div className="live-exam-info">
                <h3 className="live-exam-title">{exam.title}</h3>
                <p className="live-exam-meta">
                  {exam.year}-{exam.branch} • Started
                </p>
              </div>

              <div className="live-exam-stats">
                <div className="live-exam-stat">
                  <span className="live-exam-stat-label">Students</span>
                  <span className="live-exam-stat-value">
                    <svg className="live-exam-stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    --
                  </span>
                </div>
                <div className="live-exam-stat">
                  <span className="live-exam-stat-label">Duration</span>
                  <span className="live-exam-stat-value">
                    <svg className="live-exam-stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 6v6l4 2" />
                    </svg>
                    {exam.duration}m
                  </span>
                </div>
              </div>

              <div className="live-exam-actions">
                <button className="live-exam-btn live-exam-btn-end"
                  onClick={() => setExamPendingEnd(exam)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                  End Exam
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}