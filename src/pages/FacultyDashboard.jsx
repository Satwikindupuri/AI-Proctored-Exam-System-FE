import { useLocation, useNavigate } from "react-router-dom";
import "../styles/FacultyDashboard.css";

export default function FacultyDashboard() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    navigate("/");
  };

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

  const modules = [
    {
      key: "create",
      label: "Create Exam",
      title: "New",
      subtitle: "Create a new MCQ exam",
      className: "faculty-card-create",
      onClick: () => navigate("/faculty/create-exam"),
    },
    {
      key: "live",
      label: "Live Exams",
      title: "Monitor",
      subtitle: "View currently active exams",
      className: "faculty-card-live",
      onClick: () => navigate("/faculty/live-exams"),
    },
    {
      key: "completed",
      label: "Completed",
      title: "Results",
      subtitle: "Review submitted exams",
      className: "faculty-card-completed",
      onClick: () => navigate("/faculty/completed"),
    },
    {
      key: "analysis",
      label: "Analysis",
      title: "AI Reports",
      subtitle: "Student performance insights",
      className: "faculty-card-analysis",
      onClick: () => navigate("/faculty/faculty-student-analysis"),
    },
    {
      key: "flagged",
      label: "Flagged",
      title: "Students",
      subtitle: "Potential malpractice cases",
      className: "faculty-card-flagged",
      onClick: () => navigate("/faculty/flagged"),
    },
    {
      key: "coding",
      label: "Coding Exam",
      title: "Create",
      subtitle: "Set up coding assessments",
      className: "faculty-card-coding",
      onClick: () => navigate("/faculty/create-coding-exam"),
    },
  ];

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
            <h1>Welcome back, Professor!</h1>
            <p>Here&apos;s an overview of your academic assessments.</p>
          </div>
          <button className="faculty-create-btn" onClick={() => navigate("/faculty/create-exam")}>
            + Quick Create Exam
          </button>
        </div>

        <section className="faculty-cards">
          {modules.map((module) => (
            <button
              key={module.key}
              className={`faculty-card ${module.className}`}
              onClick={module.onClick}
            >
              <p className="faculty-card-label">{module.label}</p>
              <h3 className="faculty-card-title">{module.title}</h3>
              <p className="faculty-card-subtitle">{module.subtitle}</p>
            </button>
          ))}
        </section>
      </main>
    </div>
  );
}
