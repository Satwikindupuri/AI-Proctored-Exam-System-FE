import { useEffect, useState } from "react";
import api from "../api/api";

export default function StudentPreviousResults() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchResults = async () => {
      try {
        const res = await api.get("/student/results");
        setResults(res.data);
      } catch (err) {
        console.error("Failed to load results", err);
      } finally {
        setLoading(false);
      }
    };
    fetchResults();
  }, []);

  const getScoreColor = (score, total) => {
    if (!total) return "#64748b";
    const pct = (score / total) * 100;
    if (pct >= 75) return "#10b981";
    if (pct >= 50) return "#f59e0b";
    return "#f43f5e";
  };

  const getStatusBadge = (status) => {
    if (status === "SUBMITTED") return { label: "Genuine", color: "#10b981", bg: "#ecfdf5" };
    if (status === "AUTO_SUBMITTED") return { label: "Flagged", color: "#ef4444", bg: "#fef2f2" };
    return { label: status, color: "#64748b", bg: "#f1f5f9" };
  };

  return (
    <div className="student-content-area">
      <div className="student-page-header">
        <h1>Completed Results</h1>
        <p>Review your past exam submissions and scores.</p>
      </div>

      {loading && <p className="student-info-text">Loading results...</p>}

      {!loading && results.length === 0 && (
        <div className="student-empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6M8 13h8M8 17h5" />
          </svg>
          <p>No completed exams yet. Your results will appear here.</p>
        </div>
      )}

      <div className="student-exam-list">
        {results.map((result) => {
          const badge = getStatusBadge(result.status);
          const scoreColor = getScoreColor(result.score, result.totalQuestions);
          const cardStyle = result.status === "AUTO_SUBMITTED"
            ? { borderLeft: "4px solid #ef4444", background: "#fef2f2" }
            : { borderLeft: "4px solid #10b981", background: "#ecfdf5" };

          return (
            <div key={result._id} className="student-exam-card" style={cardStyle}>
              <div className="student-exam-card-top">
                <div style={{ flex: 1 }}>
                  <h3 className="student-exam-title">{result.examTitle || "Exam"}</h3>
                  <div className="student-exam-meta">
                    <span
                      className="student-exam-badge"
                      style={{ background: badge.color, color: "#ffffff" }}
                    >
                      {badge.label}
                    </span>
                    <span className="student-exam-duration">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2v6M12 16v6M4.93 4.93l4.24 4.24M14.83 14.83l4.24 4.24M2 12h6M16 12h6M4.93 19.07l4.24-4.24M14.83 9.17l4.24-4.24" />
                      </svg>
                      {result.examType}
                    </span>
                    <span className="student-exam-duration">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" />
                        <path d="M16 2v4M8 2v4M3 10h18" />
                      </svg>
                      {result.endTime
                        ? new Date(result.endTime).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </span>
                  </div>
                </div>
                <div className="student-score-box">
                  {result.status === "AUTO_SUBMITTED" ? (
                    <>
                      <span className="student-score-value" style={{ color: "#ef4444" }}>
                        Flagged
                      </span>
                      <span className="student-score-label">No score shown</span>
                    </>
                  ) : (
                    <>
                      <span className="student-score-value" style={{ color: scoreColor }}>
                        {result.score ?? 0}
                      </span>
                      {result.totalQuestions ? (
                        <span className="student-score-total">/ {result.totalQuestions}</span>
                      ) : null}
                      <span className="student-score-label">Score</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
