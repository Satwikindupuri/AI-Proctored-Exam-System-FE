import { useNavigate } from "react-router-dom";

export default function StudentDashboard() {
  const navigate = useNavigate();

  const modules = [
    {
      key: "live",
      label: "Live Exams",
      title: "Take",
      subtitle: "View and start currently active exams",
      className: "student-card-live",
      onClick: () => navigate("/student/live-exams"),
    },
    {
      key: "results",
      label: "Completed Results",
      title: "Review",
      subtitle: "Check your past exam scores",
      className: "student-card-results",
      onClick: () => navigate("/student/results"),
    },
    {
      key: "analysis",
      label: "My Analysis",
      title: "Insights",
      subtitle: "Track your performance over time",
      className: "student-card-analysis",
      onClick: () => navigate("/student/analysis"),
    },
    {
      key: "profile",
      label: "Profile",
      title: "Account",
      subtitle: "View your academic details",
      className: "student-card-profile",
      onClick: () => navigate("/student/profile"),
    },
  ];

  return (
    <div className="student-content-area">
      <div className="student-topbar">
        <div>
          <h1>Welcome back, Student!</h1>
          <p>Here&apos;s an overview of your exam portal.</p>
        </div>
      </div>

      <section className="student-cards">
        {modules.map((module) => (
          <button
            key={module.key}
            className={`student-card ${module.className}`}
            onClick={module.onClick}
          >
            <p className="student-card-label">{module.label}</p>
            <h3 className="student-card-title">{module.title}</h3>
            <p className="student-card-subtitle">{module.subtitle}</p>
          </button>
        ))}
      </section>
    </div>
  );
}
