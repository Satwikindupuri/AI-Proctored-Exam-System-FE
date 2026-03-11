import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/api.js";
import "../styles/CompletedExamsDetails.css";

export default function CompletedExamDetails() {
  const { examId } = useParams();
  const navigate = useNavigate();

  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadAttempts = async () => {
      try {
        const res = await api.get(
          `/faculty/exams/${examId}/attempts`
        );

        if (Array.isArray(res.data)) {
          setAttempts(res.data);
        } else {
          setAttempts([]);
        }
      } catch (err) {
        console.error(err);
        setError("Failed to load attempts");
        setAttempts([]);
      } finally {
        setLoading(false);
      }
    };

    loadAttempts();
  }, [examId]);

  return (
    <div className="completed-details-page">
      <header className="completed-details-header">
        <div>
          <h1>Assessment Attempts</h1>
          <p className="completed-details-subtitle">
            Review submission details and download the full results.
          </p>
        </div>
        <button
          className="completed-details-back"
          onClick={() => navigate("/faculty/completed")}
        >
          ← Back to Completed
        </button>
      </header>

      <section className="completed-details-card">
        <div className="completed-details-card-header">
          <div>
            <h2>Exam Attempts</h2>
            <p className="completed-details-meta">
              {attempts.length} submission{attempts.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="completed-details-actions">
            <a
              className="completed-details-action"
              href={`http://localhost:5000/api/faculty/exams/${examId}/attempts/download`}
              target="_blank"
              rel="noreferrer"
            >
              Download Attempts (Excel)
            </a>
            <a
              className="completed-details-action"
              href={`http://localhost:5000/api/faculty/exams/${examId}/questions/download`}
              target="_blank"
              rel="noreferrer"
            >
              Download Questions
            </a>
          </div>
        </div>

        {loading && <p className="completed-details-message">Loading attempts...</p>}
        {!loading && error && (
          <p className="completed-details-error">{error}</p>
        )}

        {!loading && !error && attempts.length === 0 && (
          <p className="completed-details-message">No student attempts found</p>
        )}

        {!loading && attempts.length > 0 && (
          <div className="completed-attempts-table-wrapper">
            <table className="completed-attempts-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Roll No</th>
                  <th>Score</th>
                  <th>Time Taken</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((a, i) => (
                  <tr key={i}>
                    <td>{a.student?.name || "-"}</td>
                    <td>{a.student?.rollNo || "-"}</td>
                    <td>{a.score ?? "-"}</td>
                    <td>{a.timeTaken != null ? `${a.timeTaken} mins` : "-"}</td>
                    <td>
                      {a.autoSubmitted ? (
                        <span className="status status--warning">
                          🚩 Auto Submitted
                        </span>
                      ) : (
                        <span className="status status--ok">Submitted</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
