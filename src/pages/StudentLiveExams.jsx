import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/api";

export default function StudentLiveExams() {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchExams = async () => {
      try {
        const res = await api.get("/student/exams/live");
        console.log("Exams Data:", res.data);
        const sorted = [...res.data].sort((a, b) => {
          const dateA = new Date(a.createdAt || a.startTime || 0);
          const dateB = new Date(b.createdAt || b.startTime || 0);
          return dateB - dateA;
        });
        setExams(sorted);
      } catch (err) {
        alert("Failed to load exams");
      } finally {
        setLoading(false);
      }
    };
    fetchExams();
  }, []);

  const handleOpenExam = (exam) => {
    console.log(`Navigating to ${exam.examType} exam: ${exam._id}`);
    const type = exam.examType?.toLowerCase();
    if (type === "coding") {
      navigate(`/coding-exam/${exam._id}`);
    } else {
      navigate(`/exam/${exam._id}`);
    }
  };

  const getExamTypeColor = (type) => {
    const t = type?.toLowerCase();
    if (t === "coding") return { bg: "#f5f3ff", border: "#8b5cf6", badge: "#8b5cf6" };
    return { bg: "#eff6ff", border: "#3b82f6", badge: "#3b82f6" };
  };

  return (
    <div className="student-content-area">
      <div className="student-page-header">
        <h1>Live Exams</h1>
        <p>Exams currently available for you to take.</p>
      </div>

      {loading && <p className="student-info-text">Loading exams...</p>}

      {!loading && exams.length === 0 && (
        <div className="student-empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          <p>No live exams available right now. Check back later.</p>
        </div>
      )}

      <div className="student-exam-list">
        {exams.map((exam) => {
          const colors = getExamTypeColor(exam.examType);
          return (
            <div
              key={exam._id}
              className="student-exam-card"
              style={{ borderLeft: `4px solid ${colors.border}`, background: colors.bg }}
            >
              <div className="student-exam-card-top">
                <div>
                  <h3 className="student-exam-title">{exam.title}</h3>
                  <div className="student-exam-meta">
                    <span
                      className="student-exam-badge"
                      style={{ background: colors.badge }}
                    >
                      {exam.examType}
                    </span>
                    <span className="student-exam-duration">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 3" />
                      </svg>
                      {exam.duration} mins
                    </span>
                  </div>
                </div>
                <button
                  className="student-start-btn"
                  disabled={exam.attempted}
                  onClick={() => handleOpenExam(exam)}
                >
                  {exam.attempted ? "Submitted" : "Start Exam"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
