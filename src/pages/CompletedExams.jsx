import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/api.js";
import "../styles/CompletedExams.css";

export default function CompletedExams() {
  const navigate = useNavigate();

  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
                onClick={() => navigate(`/faculty/completed/${exam._id}`)}
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
    </div>
  );
}
