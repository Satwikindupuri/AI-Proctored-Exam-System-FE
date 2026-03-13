import { useEffect, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import api from "../api/api";

export default function SelfAnalysis() {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalysis = async () => {
      try {
        const res = await api.get("/student/analysis");
        setAnalysis(res.data);
      } catch (err) {
        console.error("Failed to load analysis", err);
      } finally {
        setLoading(false);
      }
    };
    fetchAnalysis();
  }, []);

  const getAccuracyTone = (accuracy) => {
    if (accuracy >= 75) return { color: "#10b981", label: "Strong" };
    if (accuracy >= 50) return { color: "#f59e0b", label: "Improving" };
    return { color: "#ef4444", label: "Needs work" };
  };

  const renderTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) {
      return null;
    }

    const metrics = payload.reduce((accumulator, entry) => {
      accumulator[entry.dataKey] = entry.value;
      return accumulator;
    }, {});

    return (
      <div className="student-analysis-tooltip">
        <p>{label}</p>
        <span>Marks scored: {metrics.marksScored ?? 0}</span>
        <span>Accuracy: {metrics.accuracy ?? 0}%</span>
        <span>Times flagged: {metrics.flaggedCount ?? 0}</span>
      </div>
    );
  };

  const hasAnalysis = Boolean(analysis?.summary?.testsDone);

  const summary = analysis?.summary ?? {
    testsDone: 0,
    totalMarksScored: 0,
    totalPossibleMarks: 0,
    accuracy: 0,
    totalFlagged: 0,
    genuineAttempts: 0,
    averageMarks: 0,
  };

  const accuracyTone = getAccuracyTone(summary.accuracy);
  const recentAttempts = analysis?.recentAttempts ?? [];

  return (
    <div className="student-content-area">
      <div className="student-page-header">
        <h1>My Analysis</h1>
        <p>Track your tests done, marks scored, and flagged history in one place.</p>
      </div>

      {loading && <p className="student-info-text">Loading analysis...</p>}

      {!loading && !hasAnalysis && (
        <div className="student-empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
          </svg>
          <p>No analysis data available yet. Complete some exams to see your insights.</p>
        </div>
      )}

      {!loading && hasAnalysis && (
        <>
          <div className="student-analysis-summary">
            <div className="student-stat-card" style={{ borderLeft: "4px solid #10b981", background: "#ecfdf5" }}>
              <p className="student-stat-label">Accuracy</p>
              <h2 className="student-stat-value" style={{ color: "#10b981" }}>{summary.accuracy}%</h2>
              <p className="student-stat-subtext">Based on marks scored across completed tests</p>
            </div>
            <div className="student-stat-card" style={{ borderLeft: "4px solid #3b82f6", background: "#eff6ff" }}>
              <p className="student-stat-label">Tests Done</p>
              <h2 className="student-stat-value" style={{ color: "#3b82f6" }}>{summary.testsDone}</h2>
              <p className="student-stat-subtext">{summary.genuineAttempts} genuine submission(s)</p>
            </div>
            <div className="student-stat-card" style={{ borderLeft: "4px solid #f59e0b", background: "#fffbeb" }}>
              <p className="student-stat-label">Marks Scored</p>
              <h2 className="student-stat-value" style={{ color: "#f59e0b" }}>{summary.totalMarksScored}</h2>
              <p className="student-stat-subtext">Out of {summary.totalPossibleMarks} total available marks</p>
            </div>
            <div className="student-stat-card" style={{ borderLeft: "4px solid #f43f5e", background: "#fff1f2" }}>
              <p className="student-stat-label">Times Flagged</p>
              <h2 className="student-stat-value" style={{ color: "#f43f5e" }}>{summary.totalFlagged}</h2>
              <p className="student-stat-subtext">Auto-submits or flagged incidents across tests</p>
            </div>
          </div>

          <div className="student-analysis-grid">
            <section className="student-analysis-chart-card">
              <div className="student-analysis-card-header">
                <div>
                  <h2 className="student-section-title">Performance Trend</h2>
                  <p>Graph of tests done, marks scored, and flagged count across completed attempts.</p>
                </div>
              </div>

              <div className="student-analysis-chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={analysis.chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="shortTitle" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="left" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={renderTooltip} />
                    <Legend wrapperStyle={{ fontSize: "12px" }} />
                    <Bar yAxisId="left" dataKey="marksScored" name="Marks scored" fill="#3b82f6" radius={[8, 8, 0, 0]} maxBarSize={44} />
                    <Line yAxisId="left" type="monotone" dataKey="accuracy" name="Accuracy %" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    <Line yAxisId="right" type="monotone" dataKey="flaggedCount" name="Times flagged" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </section>

            <aside className="student-analysis-insight-card">
              <div className="student-analysis-insight-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 20V10M18 20V4M6 20v-6" />
                </svg>
              </div>
              <h2>{accuracyTone.label} performance</h2>
              <p>
                You have completed {summary.testsDone} test{summary.testsDone === 1 ? "" : "s"} with an overall
                accuracy of {summary.accuracy}% and {summary.totalFlagged} flagged incident{summary.totalFlagged === 1 ? "" : "s"}.
              </p>

              <div className="student-analysis-insight-metrics">
                <div className="student-analysis-mini-card">
                  <span>Average marks</span>
                  <strong>{summary.averageMarks}</strong>
                </div>
                <div className="student-analysis-mini-card">
                  <span>Trust status</span>
                  <strong style={{ color: summary.totalFlagged === 0 ? "#22c55e" : "#f97316" }}>
                    {summary.totalFlagged === 0 ? "Clean" : "Watchlist"}
                  </strong>
                </div>
              </div>
            </aside>
          </div>

          {recentAttempts.length > 0 && (
            <div className="student-analysis-breakdown">
              <h2 className="student-section-title">Recent Attempts</h2>
              <div className="student-exam-list">
                {recentAttempts.map((item) => (
                  <div
                    key={item.id}
                    className="student-exam-card"
                    style={{
                      borderLeft: `4px solid ${item.status === "AUTO_SUBMITTED" ? "#ef4444" : "#10b981"}`,
                      background: "#ffffff",
                    }}
                  >
                    <div className="student-exam-card-top">
                      <div style={{ flex: 1 }}>
                        <h3 className="student-exam-title">{item.examTitle}</h3>
                        <div className="student-exam-meta">
                          <span className="student-exam-badge" style={{ background: item.status === "AUTO_SUBMITTED" ? "#ef4444" : "#10b981" }}>
                            {item.status === "AUTO_SUBMITTED" ? "Flagged" : "Genuine"}
                          </span>
                          <span className="student-exam-duration">
                            {item.submittedAt
                              ? new Date(item.submittedAt).toLocaleDateString("en-IN", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                })
                              : "—"}
                          </span>
                        </div>
                      </div>
                      <div className="student-score-box">
                        <span className="student-score-value" style={{ color: item.status === "AUTO_SUBMITTED" ? "#ef4444" : accuracyTone.color }}>
                          {item.status === "AUTO_SUBMITTED" ? "Flagged" : `${item.accuracy}%`}
                        </span>
                        <span className="student-score-label">
                          {item.status === "AUTO_SUBMITTED" ? "No score shown" : `${item.marksScored}/${item.totalQuestions}`}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
