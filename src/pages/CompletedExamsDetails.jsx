import { Fragment, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import api from "../api/api.js";
import "../styles/CompletedExamsDetails.css";
import { showToast } from "../utils/toast";

export default function CompletedExamDetails() {
  const navigate = useNavigate();
  const location = useLocation();
  const { examId } = useParams();
  const examTitleFromState = location.state?.examTitle;

  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openSnapshotsByAttempt, setOpenSnapshotsByAttempt] = useState({});
  const [snapshotStateByAttempt, setSnapshotStateByAttempt] = useState({});
  const [downloadingAttempts, setDownloadingAttempts] = useState(false);
  const [downloadingQuestions, setDownloadingQuestions] = useState(false);

  const resolveDownloadFileName = (contentDisposition, fallbackName) => {
    if (!contentDisposition) return fallbackName;

    const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
      try {
        return decodeURIComponent(utf8Match[1]);
      } catch {
        return utf8Match[1];
      }
    }

    const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
    return plainMatch?.[1] || fallbackName;
  };

  const guessExtensionFromMime = (mimeType) => {
    const mime = (mimeType || "").toLowerCase();
    if (mime.includes("spreadsheetml")) return "xlsx";
    if (mime.includes("ms-excel")) return "xls";
    if (mime.includes("csv")) return "csv";
    if (mime.includes("plain")) return "txt";
    if (mime.includes("json")) return "json";
    return "";
  };

  const saveBlobResponse = async (response, fallbackBaseName, preferredExt = "") => {
    const blob = response?.data;
    if (!blob) throw new Error("Empty download response");

    const contentDisposition = response?.headers?.["content-disposition"];
    const contentType = response?.headers?.["content-type"] || blob.type || "";

    if ((contentType || "").toLowerCase().includes("json")) {
      const errorText = await blob.text();
      throw new Error(errorText || "Server returned JSON instead of downloadable file");
    }

    const headerFileName = resolveDownloadFileName(contentDisposition, "");
    let fileName = headerFileName;

    if (!fileName) {
      const detectedExt = guessExtensionFromMime(contentType);
      const extension = preferredExt || detectedExt || "bin";
      fileName = `${fallbackBaseName}.${extension}`;
    }

    const lowerName = fileName.toLowerCase();
    if (preferredExt && !lowerName.endsWith(`.${preferredExt}`) && !contentDisposition) {
      fileName = `${fallbackBaseName}.${preferredExt}`;
    }

    const blobUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(blobUrl);
  };

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

  const handleDownloadAttempts = async () => {
    if (downloadingAttempts) return;
    setDownloadingAttempts(true);
    try {
      const response = await api.get(`/faculty/exams/${examId}/attempts/download`, {
        responseType: "blob",
      });
      const contentType = (response?.headers?.["content-type"] || "").toLowerCase();
      const preferredExt = contentType.includes("spreadsheetml") || contentType.includes("ms-excel")
        ? "xlsx"
        : contentType.includes("csv")
          ? "csv"
          : "xlsx";
      await saveBlobResponse(response, `exam-attempts-${examId}`, preferredExt);
      showToast("success", "Attempts file downloaded");
    } catch (err) {
      console.error(err);
      showToast("error", "Failed to download attempts file");
    } finally {
      setDownloadingAttempts(false);
    }
  };

  const handleDownloadQuestions = async () => {
    if (downloadingQuestions) return;
    setDownloadingQuestions(true);
    try {
      const response = await api.get(`/faculty/exams/${examId}/questions/download`, {
        responseType: "blob",
      });
      await saveBlobResponse(response, `exam-questions-${examId}`, "txt");
      showToast("success", "Questions file downloaded");
    } catch (err) {
      console.error(err);
      showToast("error", "Failed to download questions file");
    } finally {
      setDownloadingQuestions(false);
    }
  };

  return (
    <div className="completed-details-page">
      <header className="completed-details-header">
        <div>
          <h1>Exam Attempts</h1>
          <p className="completed-details-subtitle">
            Review student submissions, snapshots, and export reports.
          </p>
        </div>
        <button
          type="button"
          className="completed-details-back"
          onClick={() => navigate("/faculty/completed")}
        >
          ← Back to Completed Exams
        </button>
      </header>

      <section className="completed-details-card">
        <div className="completed-details-card-header">
          <div>
            <h2>Attempts Overview</h2>
            <p className="completed-details-meta">
              Exam: {examTitleFromState || attempts[0]?.exam?.title || attempts[0]?.title || examId}
            </p>
          </div>
          {!loading && attempts.length > 0 && (
            <div className="completed-details-actions">
              <button
                type="button"
                className="completed-details-action"
                onClick={handleDownloadAttempts}
                disabled={downloadingAttempts || downloadingQuestions}
              >
                {downloadingAttempts ? "Downloading Attempts..." : "Download Attempts (Excel)"}
              </button>

              <button
                type="button"
                className="completed-details-action"
                onClick={handleDownloadQuestions}
                disabled={downloadingQuestions || downloadingAttempts}
              >
                {downloadingQuestions ? "Downloading Questions..." : "Download Questions"}
              </button>
            </div>
          )}
        </div>

        {loading && <p className="completed-details-message">Loading attempts...</p>}

        {!loading && error && <p className="completed-details-error">{error}</p>}

        {!loading && attempts.length === 0 && !error && (
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
                        <td>{a.student?.name || "N/A"}</td>
                        <td>{a.student?.rollNo || "N/A"}</td>
                        <td>{a.score ?? 0}</td>
                        <td>{a.timeTaken ? `${a.timeTaken} mins` : "N/A"}</td>
                        <td>
                          {a.autoSubmitted ? (
                            <span className="status status--warning">Auto Submitted</span>
                          ) : (
                            <span className="status status--ok">Submitted</span>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="completed-snapshot-toggle"
                            onClick={() => toggleSnapshots(a)}
                            disabled={!canLoadSnapshots}
                          >
                            {isOpen ? "Hide" : "View"} Snapshots
                          </button>
                        </td>
                      </tr>

                      {isOpen && (
                        <tr key={`snapshots-${attemptId}`}>
                          <td colSpan={6}>
                            <div className="completed-snapshot-panel">
                              {snapshotState.loading && (
                                <p className="completed-details-message">Loading snapshots...</p>
                              )}
                              {!snapshotState.loading && snapshotState.error && (
                                <p className="completed-details-error">{snapshotState.error}</p>
                              )}
                              {!snapshotState.loading && !snapshotState.error && snapshotState.data.length === 0 && (
                                <p className="completed-details-message">
                                  No snapshots captured for this student attempt.
                                </p>
                              )}
                              {!snapshotState.loading && !snapshotState.error && snapshotState.data.length > 0 && (
                                <div className="completed-snapshot-grid">
                                  {snapshotState.data.map((snap, idx) => (
                                    <div key={`snap-${attemptId}-${idx}`} className="completed-snapshot-card">
                                      <img
                                        src={snap.imageData}
                                        alt={`Snapshot ${idx + 1}`}
                                        className="completed-snapshot-image"
                                      />
                                      <p className="completed-snapshot-time">
                                        {snap.capturedAt
                                          ? new Date(snap.capturedAt).toLocaleString()
                                          : "Time unavailable"}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}