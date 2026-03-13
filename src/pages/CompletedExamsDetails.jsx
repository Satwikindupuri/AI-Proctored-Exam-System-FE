import { Fragment, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../api/api.js";

export default function CompletedExamDetails() {
  const { examId } = useParams();

  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openSnapshotsByAttempt, setOpenSnapshotsByAttempt] = useState({});
  const [snapshotStateByAttempt, setSnapshotStateByAttempt] = useState({});

  useEffect(() => {
    const loadAttempts = async () => {
      try {
        const res = await api.get(`/faculty/exams/${examId}/attempts`);

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

  const toggleSnapshots = async (attempt) => {
    const attemptId = attempt?._id || attempt?.attemptId;
    if (!attemptId) return;

    const isOpen = !!openSnapshotsByAttempt[attemptId];
    if (isOpen) {
      setOpenSnapshotsByAttempt((prev) => ({ ...prev, [attemptId]: false }));
      return;
    }

    const current = snapshotStateByAttempt[attemptId];
    if (current?.loaded) {
      setOpenSnapshotsByAttempt((prev) => ({ ...prev, [attemptId]: true }));
      return;
    }

    setSnapshotStateByAttempt((prev) => ({
      ...prev,
      [attemptId]: { loading: true, error: "", loaded: false, data: [] },
    }));

    try {
      const res = await api.get(`/faculty/exams/${examId}/attempts/${attemptId}/snapshots`);
      const snapshotData = Array.isArray(res.data?.snapshots) ? res.data.snapshots : [];

      setSnapshotStateByAttempt((prev) => ({
        ...prev,
        [attemptId]: { loading: false, error: "", loaded: true, data: snapshotData },
      }));
      setOpenSnapshotsByAttempt((prev) => ({ ...prev, [attemptId]: true }));
    } catch (err) {
      console.error(err);
      setSnapshotStateByAttempt((prev) => ({
        ...prev,
        [attemptId]: {
          loading: false,
          error: "Failed to load snapshots",
          loaded: true,
          data: [],
        },
      }));
      setOpenSnapshotsByAttempt((prev) => ({ ...prev, [attemptId]: true }));
    }
  };

  return (
    <div style={{ padding: 30 }}>
      <h2>Exam Attempts</h2>

      {loading && <p>Loading attempts...</p>}

      {!loading && error && <p style={{ color: "red" }}>{error}</p>}

      {!loading && attempts.length === 0 && !error && <p>No student attempts found</p>}

      {!loading && attempts.length > 0 && (
        <>
          <table border="1" cellPadding="8" style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Roll No</th>
                <th>Score</th>
                <th>Time Taken</th>
                <th>Status</th>
                <th>Snapshots</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((a, i) => {
                const attemptId = a?._id || a?.attemptId || `row-${i}`;
                const snapshotState = snapshotStateByAttempt[attemptId] || {
                  loading: false,
                  error: "",
                  loaded: false,
                  data: [],
                };
                const isOpen = !!openSnapshotsByAttempt[attemptId];

                const canLoadSnapshots = Boolean(a?._id || a?.attemptId);

                return (
                  <Fragment key={`frag-${attemptId}`}>
                    <tr key={`attempt-${attemptId}`}>
                      <td>{a.student?.name}</td>
                      <td>{a.student?.rollNo}</td>
                      <td>{a.score}</td>
                      <td>{a.timeTaken} mins</td>
                      <td>
                        {a.autoSubmitted ? (
                          <span style={{ color: "red", fontWeight: "bold" }}>Auto Submitted</span>
                        ) : (
                          "Submitted"
                        )}
                      </td>
                      <td>
                        <button onClick={() => toggleSnapshots(a)} disabled={!canLoadSnapshots}>
                          {isOpen ? "Hide" : "View"} Snapshots
                        </button>
                      </td>
                    </tr>

                    {isOpen && (
                      <tr key={`snapshots-${attemptId}`}>
                        <td colSpan={6} style={{ background: "#fafafa" }}>
                          {snapshotState.loading && <p>Loading snapshots...</p>}
                          {!snapshotState.loading && snapshotState.error && (
                            <p style={{ color: "red" }}>{snapshotState.error}</p>
                          )}
                          {!snapshotState.loading && !snapshotState.error && snapshotState.data.length === 0 && (
                            <p>No snapshots captured for this student attempt.</p>
                          )}
                          {!snapshotState.loading && !snapshotState.error && snapshotState.data.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                              {snapshotState.data.map((snap, idx) => (
                                <div
                                  key={`snap-${attemptId}-${idx}`}
                                  style={{
                                    width: 220,
                                    border: "1px solid #ddd",
                                    borderRadius: 8,
                                    padding: 8,
                                    background: "#fff",
                                  }}
                                >
                                  <img
                                    src={snap.imageData}
                                    alt={`Snapshot ${idx + 1}`}
                                    style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: 6 }}
                                  />
                                  <p style={{ margin: "8px 0 0", fontSize: 12, color: "#444" }}>
                                    {snap.capturedAt ? new Date(snap.capturedAt).toLocaleString() : "Time unavailable"}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>

          <div style={{ marginTop: 20 }}>
            <a
              href={`http://localhost:5000/api/faculty/exams/${examId}/attempts/download`}
              target="_blank"
              rel="noreferrer"
            >
              <button>Download Attempts (Excel)</button>
            </a>

            <a
              href={`http://localhost:5000/api/faculty/exams/${examId}/questions/download`}
              target="_blank"
              rel="noreferrer"
              style={{ marginLeft: 10 }}
            >
              <button>Download Questions</button>
            </a>
          </div>
        </>
      )}
    </div>
  );
}