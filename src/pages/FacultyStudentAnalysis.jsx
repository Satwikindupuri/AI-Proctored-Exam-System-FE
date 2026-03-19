import { useMemo, useState } from "react";
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
import api from "../api/api.js";
import { showToast } from "../utils/toast";
import "../styles/FacultyStudentAnalysis.css";

export default function FacultyStudentAnalysis() {
  const [year, setYear] = useState("");
  const [branch, setBranch] = useState("");
  const [section, setSection] = useState("");
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState(null);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const res = await api.get("/faculty/student-analysis", {
        params: { year, branch, section },
      });
      const list = Array.isArray(res.data) ? res.data : [];
      setStudents(list);
      setSelectedStudentId(null);
    } catch (err) {
      console.error(err);
      showToast("error", "Failed to load student analysis");
    } finally {
      setLoading(false);
    }
  };

  const summary = useMemo(() => {
    if (students.length === 0) {
      return {
        totalStudents: 0,
        averageScore: 0,
        totalAttempts: 0,
        totalAutoSubmits: 0,
        highRiskCount: 0,
      };
    }

    const totalScore = students.reduce((sum, student) => sum + Number(student.avgScore || 0), 0);
    const totalAttempts = students.reduce((sum, student) => sum + Number(student.totalAttempts || 0), 0);
    const totalAutoSubmits = students.reduce((sum, student) => sum + Number(student.autoSubmittedCount || 0), 0);
    const highRiskCount = students.filter((student) => student.riskLevel === "High Risk").length;

    return {
      totalStudents: students.length,
      averageScore: Number((totalScore / students.length).toFixed(1)),
      totalAttempts,
      totalAutoSubmits,
      highRiskCount,
    };
  }, [students]);

  const selectedStudent = useMemo(
    () => students.find((student) => student.studentId === selectedStudentId) || null,
    [students, selectedStudentId]
  );

  const chartData = useMemo(
    () =>
      students.slice(0, 10).map((student) => ({
        shortName: student.name?.split(" ")[0] || "Student",
        avgScore: Number(student.avgScore || 0),
        totalAttempts: Number(student.totalAttempts || 0),
        autoSubmittedCount: Number(student.autoSubmittedCount || 0),
      })),
    [students]
  );

  const getRiskTone = (riskLevel) => {
    if (riskLevel === "High Risk") return "high";
    if (riskLevel === "Average") return "average";
    return "low";
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
      <div className="faculty-analysis-tooltip">
        <p>{label}</p>
        <span>Avg score: {metrics.avgScore ?? 0}</span>
        <span>Attempts: {metrics.totalAttempts ?? 0}</span>
        <span>Auto submits: {metrics.autoSubmittedCount ?? 0}</span>
      </div>
    );
  };

  return (
    <div className="faculty-analysis-page">
      <div className="faculty-analysis-header">
        <h1>Student Analysis</h1>
        <p>Filter by class, review risk trends, and inspect each student from one view.</p>
      </div>

      <div className="faculty-analysis-filter-card">
        <div className="faculty-analysis-filter-row">
          <input
            placeholder="Year"
            value={year}
            onChange={(event) => setYear(event.target.value)}
          />
          <input
            placeholder="Branch"
            value={branch}
            onChange={(event) => setBranch(event.target.value)}
          />
          <input
            placeholder="Section"
            value={section}
            onChange={(event) => setSection(event.target.value)}
          />
          <button className="faculty-analysis-btn" onClick={fetchStudents} disabled={loading}>
            {loading ? "Loading..." : "Fetch Analysis"}
          </button>
        </div>
      </div>

      {students.length > 0 && (
        <>
          <div className="faculty-analysis-summary">
            <div className="faculty-analysis-stat" style={{ borderLeftColor: "#10b981", background: "#ecfdf5" }}>
              <p>Total Students</p>
              <h2>{summary.totalStudents}</h2>
            </div>
            <div className="faculty-analysis-stat" style={{ borderLeftColor: "#3b82f6", background: "#eff6ff" }}>
              <p>Average Score</p>
              <h2>{summary.averageScore}</h2>
            </div>
            <div className="faculty-analysis-stat" style={{ borderLeftColor: "#f59e0b", background: "#fffbeb" }}>
              <p>Total Attempts</p>
              <h2>{summary.totalAttempts}</h2>
            </div>
            <div className="faculty-analysis-stat" style={{ borderLeftColor: "#ef4444", background: "#fff1f2" }}>
              <p>High Risk</p>
              <h2>{summary.highRiskCount}</h2>
            </div>
          </div>

          <div className="faculty-analysis-grid">
            <section className="faculty-analysis-chart-card">
              <div className="faculty-analysis-card-header">
                <h3>Class Performance Trend</h3>
                <p>Top 10 students by current filter scope.</p>
              </div>
              <div className="faculty-analysis-chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="shortName" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="left" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={renderTooltip} />
                    <Legend wrapperStyle={{ fontSize: "12px" }} />
                    <Bar yAxisId="left" dataKey="avgScore" name="Avg score" fill="#3b82f6" radius={[8, 8, 0, 0]} maxBarSize={44} />
                    <Line yAxisId="right" type="monotone" dataKey="totalAttempts" name="Attempts" stroke="#10b981" strokeWidth={3} dot={{ r: 3 }} />
                    <Line yAxisId="right" type="monotone" dataKey="autoSubmittedCount" name="Auto submits" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </section>

            <aside className="faculty-analysis-insight-card">
              <h3>Selected Student Snapshot</h3>
              {!selectedStudent && <p>Select a student below to inspect detailed stats.</p>}
              {selectedStudent && (
                <>
                  <h2>{selectedStudent.name}</h2>
                  <p>{selectedStudent.rollNo} · {selectedStudent.class}</p>
                  <div className="faculty-analysis-mini-grid">
                    <div>
                      <span>Risk</span>
                      <strong>{selectedStudent.riskLevel}</strong>
                    </div>
                    <div>
                      <span>Avg Score</span>
                      <strong>{selectedStudent.avgScore}</strong>
                    </div>
                    <div>
                      <span>Attempts</span>
                      <strong>{selectedStudent.totalAttempts}</strong>
                    </div>
                    <div>
                      <span>Auto Submits</span>
                      <strong>{selectedStudent.autoSubmittedCount}</strong>
                    </div>
                  </div>
                </>
              )}
            </aside>
          </div>
        </>
      )}

      {!loading && students.length === 0 && (
        <div className="faculty-analysis-empty">No students found for the current filter.</div>
      )}

      <div className="faculty-analysis-list">
        {students.map((student) => {
          const open = selectedStudentId === student.studentId;
          return (
            <div key={student.studentId} className="faculty-analysis-student-card">
              <div className="faculty-analysis-student-top">
                <div>
                  <h4>{student.name}</h4>
                  <p>{student.rollNo} · {student.class}</p>
                </div>
                <div className="faculty-analysis-actions">
                  <span className={`faculty-risk faculty-risk--${getRiskTone(student.riskLevel)}`}>
                    {student.riskLevel}
                  </span>
                  <button
                    className="faculty-analysis-view-btn"
                    onClick={() => setSelectedStudentId(open ? null : student.studentId)}
                  >
                    {open ? "Hide Details" : "View Details"}
                  </button>
                </div>
              </div>

              {open && (
                <div className="faculty-analysis-detail-row">
                  <div>
                    <span>Average Score</span>
                    <strong>{student.avgScore}</strong>
                  </div>
                  <div>
                    <span>Total Attempts</span>
                    <strong>{student.totalAttempts}</strong>
                  </div>
                  <div>
                    <span>Auto Submits</span>
                    <strong>{student.autoSubmittedCount}</strong>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}