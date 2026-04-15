import { useState } from "react";
import api from "../api/api";
import { useNavigate } from "react-router-dom";
import "../styles/CreateExam.css";
import { showToast } from "../utils/toast";

export default function CreateExam () {
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [examId, setExamId] = useState(null);
  const [loading, setLoading] = useState(false);

  // MCQ creation mode (Manual / AI placeholder)
  const [mode, setMode] = useState("MANUAL");

  const [syllabus, setSyllabus] = useState("");
  const [aiCount, setAiCount] = useState("");
  const [difficulty, setDifficulty] = useState("MEDIUM");
  const [aiLoading, setAiLoading] = useState(false);
  const [lastAiProvider, setLastAiProvider] = useState("");

  const [examData, setExamData] = useState({
    title: "",
    examType: "MCQ",
    duration: "",
    instructions: "",
    year: "",
    branch: "",
    section: "",
    targetSectionsInput: ""
  });

  const [questions, setQuestions] = useState([]);
  const [currentQ, setCurrentQ] = useState({
    questionText: "",
    options: ["", "", "", ""],
    correctAnswer: "",
    correctOptionIndex: null
  });

  const handleExamTypeChange = (examType) => {
    if (examType === "CODING") {
      navigate("/faculty/create-coding-exam");
      return;
    }

    setExamData({ ...examData, examType: "MCQ" });
  };

  // ---------------- STEP 1: CREATE EXAM (DRAFT) ----------------
  const createExam = async () => {
    if (
      !examData.title ||
      !examData.duration ||
      !examData.year ||
      !examData.branch ||
      !examData.section
    ) {
      showToast("error", "Please fill all required fields");
      return;
    }

    setLoading(true);
    try {
      const parsedSections = examData.targetSectionsInput
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      const payload = {
        ...examData,
        section: examData.section || parsedSections[0] || "",
        targetSections: parsedSections,
        status: "DRAFT"
      };

      delete payload.targetSectionsInput;

      const res = await api.post("/faculty/exams", {
        ...payload
      });

      console.log("EXAM CREATED:", res.data.exam);

      setExamId(res.data.exam._id);
      setStep(2);
    } catch (err) {
      console.error(err.response?.data || err);
      showToast("error", "Failed to create exam");
    } finally {
      setLoading(false);
    }
  };

  // ---------------- ADD MANUAL MCQ QUESTION ----------------
  const addQuestion = async () => {
if (
!currentQ.questionText ||
currentQ.options.some(o => !o) ||
currentQ.correctOptionIndex === null
) {
showToast("error", "Complete the question and select correct answer");
return;
}

const payload = {
questionType: "MCQ",
questionText: currentQ.questionText,
options: currentQ.options,
correctAnswer: currentQ.options[currentQ.correctOptionIndex],
difficulty: "MEDIUM"
};

try {
const res = await api.post(
`/faculty/exams/${examId}/questions/manual`,
payload
);

console.log("QUESTION ADDED:", res.data);

setQuestions(prev => [...prev, res.data.question]);

setCurrentQ({
  questionText: "",
  options: ["", "", "", ""],
  correctOptionIndex: null
});
} catch (err) {
console.error("ADD QUESTION ERROR:", err.response?.data || err);
showToast("error", "Failed to add question");
}
};

  return (
    <div className="create-exam-page">
      <div className="create-exam-header">
        <div>
          <h1>Create New Assessment</h1>
          <p style={{ color: "#64748b", margin: "8px 0 0" }}>
            Fill in the exam details below and add questions to publish the exam.
          </p>
        </div>
        <div className="create-exam-header-actions">
          <button
            type="button"
            className="create-exam-back-btn"
            onClick={() => navigate("/faculty")}
          >
            <span className="create-exam-back-icon" aria-hidden="true">
              &lt;-
            </span>
            Back to Dashboard
          </button>
          <div className="create-exam-step">Step {step} of 2</div>
        </div>
      </div>

      <div className="create-exam-card">
        <div className="card-section">
          <div className="card-section-header">
            <span>i</span>
            Basic Details
          </div>

          <div className="form-field">
            <label>Assessment Name</label>
            <input
              placeholder="e.g., Final Year Programming Logic"
              value={examData.title}
              onChange={(e) =>
                setExamData({ ...examData, title: e.target.value })
              }
            />
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Target Class(NO NEED TO ENTER)</label>
              <input
                placeholder="4-CSE-A"
                value={
                  examData.year || examData.branch || examData.section
                    ? `${examData.year || ""}${
                        examData.branch ? "-" + examData.branch : ""
                      }${examData.section ? "-" + examData.section : ""}`
                    : ""
                }
                onChange={(e) => {
                  // Keep the individual fields in sync so other parts can still use them.
                  const parts = e.target.value.split("-");
                  setExamData({
                    ...examData,
                    year: parts[0] || "",
                    branch: parts[1] || "",
                    section: parts[2] || ""
                  });
                }}
              />
            </div>
            <div className="form-field">
              <label>Duration (Mins)</label>
              <input
                type="number"
                placeholder="60"
                value={examData.duration}
                onChange={(e) =>
                  setExamData({ ...examData, duration: e.target.value })
                }
              />
            </div>
          </div>

          <div className="form-field">
            <label>Exam Type</label>
            <div className="button-group">
              <button
                type="button"
                className={`toggle-button ${
                  examData.examType === "MCQ" ? "active" : ""
                }`}
                onClick={() => handleExamTypeChange("MCQ")}
              >
                Multiple Choice
              </button>
              <button
                type="button"
                className={`toggle-button ${
                  examData.examType === "CODING" ? "active" : ""
                }`}
                onClick={() => handleExamTypeChange("CODING")}
              >
                Coding Assessment
              </button>
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Year</label>
              <input
                placeholder="4"
                value={examData.year}
                onChange={(e) =>
                  setExamData({ ...examData, year: e.target.value })
                }
              />
            </div>

            <div className="form-field">
              <label>Branch(CAPITAL)</label>
              <input
                placeholder="CSE"
                value={examData.branch}
                onChange={(e) =>
                  setExamData({ ...examData, branch: e.target.value })
                }
              />
            </div>

            <div className="form-field">
              <label>Section(CAPITAL)</label>
              <input
                placeholder="A"
                value={examData.section}
                onChange={(e) =>
                  setExamData({ ...examData, section: e.target.value })
                }
              />
            </div>

            <div className="form-field">
              <label>Sections (comma-separated)</label>
              <input
                placeholder="A,B"
                value={examData.targetSectionsInput}
                onChange={(e) =>
                  setExamData({ ...examData, targetSectionsInput: e.target.value })
                }
              />
            </div>
          </div>

          {step === 1 && (
            <button
              className="primary-btn"
              onClick={createExam}
              disabled={loading}
            >
              {loading ? "Creating..." : "Next → Add Questions"}
            </button>
          )}
        </div>

        <div className="card-section">
          <div className="card-section-header">
            <span>⏱</span>
            Instructions
          </div>
          <div className="form-field">
            <textarea
              placeholder="List rules, proctoring details, and scoring methodology..."
              value={examData.instructions}
              onChange={(e) =>
                setExamData({ ...examData, instructions: e.target.value })
              }
            />
          </div>

          <div className="info-box">
            <span>⚠</span>
            Anti-cheat mechanisms will be automatically enabled for this exam.
          </div>
        </div>
      </div>

      <div className="questions-section">
        <div className="questions-header">
          <h2>Questions ({questions.length})</h2>
          {step === 1 ? (
            <button
              className="secondary-btn"
              onClick={createExam}
              disabled={loading}
            >
              {loading ? "Creating..." : "Add Question"}
            </button>
          ) : (
            <button
              className="secondary-btn"
              onClick={() => setStep(1)}
            >
              Back to Details
            </button>
          )}
        </div>

        {step === 1 && (
          <p style={{ color: "#64748b" }}>
            Complete the exam details to add questions.
          </p>
        )}

        {step === 2 && (
          <>
            <div className="button-group" style={{ marginBottom: 20 }}>
              <button
                type="button"
                className={`toggle-button ${mode === "MANUAL" ? "active" : ""}`}
                onClick={() => setMode("MANUAL")}
              >
                Manual
              </button>
              <button
                type="button"
                className={`toggle-button ${mode === "AI" ? "active" : ""}`}
                onClick={() => setMode("AI")}
              >
                AI Generated
              </button>
            </div>

            {mode === "AI" && (
              <div style={{ marginBottom: 20 }}>
                <div className="form-field">
                  <label>Syllabus / Topic</label>
                  <textarea
                    placeholder="Enter syllabus / topic"
                    value={syllabus}
                    onChange={(e) => setSyllabus(e.target.value)}
                  />
                </div>

                <div className="form-row">
                  <div className="form-field">
                    <label>Number of questions</label>
                    <input
                      type="number"
                      placeholder="5"
                      value={aiCount}
                      onChange={(e) => setAiCount(e.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label>Difficulty</label>
                    <select
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value)}
                    >
                      <option value="EASY">Easy</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HARD">Hard</option>
                    </select>
                  </div>
                </div>

                <button
                  className="primary-btn"
                  disabled={aiLoading}
                  onClick={async () => {
                    if (!syllabus || !aiCount) {
                      showToast("error", "Syllabus and number of questions required");
                      return;
                    }

                    setAiLoading(true);
                    try {
                      const res = await api.post(
                        `/faculty/exams/${examId}/questions/ai-generate`,
                        {
                          syllabus,
                          numberOfQuestions: Number(aiCount),
                          difficulty
                        }
                      );
                      setQuestions((prev) => [
                        ...prev,
                        ...(Array.isArray(res.data?.questions) ? res.data.questions : [])
                      ]);
                      const provider = String(res.data?.provider || "").toLowerCase();
                      setLastAiProvider(provider);
                      showToast(
                        "success",
                        provider
                          ? `AI questions generated via ${provider}`
                          : "AI questions generated"
                      );
                    } catch (err) {
                      console.error(err.response?.data || err);
                      showToast(
                        "error",
                        err.response?.data?.message || "AI generation failed"
                      );
                    } finally {
                      setAiLoading(false);
                    }
                  }}
                >
                  {aiLoading ? "Generating..." : "Generate Questions"}
                </button>

                {lastAiProvider && (
                  <p style={{ marginTop: 10, color: "#059669", fontWeight: 600 }}>
                    Provider used: {lastAiProvider}
                  </p>
                )}
              </div>
            )}

            {mode === "MANUAL" && (
              <>
                <div className="form-field">
                  <label>Question</label>
                  <textarea
                    placeholder="Question text"
                    value={currentQ.questionText}
                    onChange={(e) =>
                      setCurrentQ({
                        ...currentQ,
                        questionText: e.target.value
                      })
                    }
                  />
                </div>

                {currentQ.options.map((opt, i) => (
                  <div key={i} className="option-row">
                    <input
                      placeholder={`Option ${i + 1}`}
                      value={opt}
                      onChange={(e) => {
                        const opts = [...currentQ.options];
                        opts[i] = e.target.value;
                        setCurrentQ({ ...currentQ, options: opts });
                      }}
                    />
                    <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="radio"
                        name="correct"
                        checked={currentQ.correctOptionIndex === i}
                        onChange={() =>
                          setCurrentQ({
                            ...currentQ,
                            correctOptionIndex: i
                          })
                        }
                      />
                      Correct
                    </label>
                  </div>
                ))}

                <button className="primary-btn" onClick={addQuestion}>
                  Add Question
                </button>
              </>
            )}

            {questions.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <h3 style={{ marginBottom: 16 }}>Questions Preview</h3>

                {questions.map((q, qIndex) => (
                  <div key={qIndex} className="question-card">
                    <div className="form-field">
                      <label>Question</label>
                      <textarea
                        value={q.questionText}
                        onChange={(e) => {
                          const updated = [...questions];
                          updated[qIndex].questionText = e.target.value;
                          setQuestions(updated);
                        }}
                      />
                    </div>

                    {q.options.map((opt, optIndex) => (
                      <div key={optIndex} className="option-row">
                        <input
                          value={opt}
                          onChange={(e) => {
                            const updated = [...questions];
                            updated[qIndex].options[optIndex] = e.target.value;
                            setQuestions(updated);
                          }}
                        />
                        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <input
                            type="radio"
                            name={`correct-${qIndex}`}
                            checked={q.correctAnswer === opt}
                            onChange={() => {
                              const updated = [...questions];
                              updated[qIndex].correctAnswer = opt;
                              setQuestions(updated);
                            }}
                          />
                          Correct
                        </label>
                      </div>
                    ))}

                    <p className="question-source">
                      Source: {q.source || "MANUAL"}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <p style={{ marginTop: 12 }}>
              Total Questions Added: <b>{questions.length}</b>
            </p>

            {questions.length > 0 && (
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <button
                  className="secondary-btn"
                  onClick={async () => {
                    try {
                      await api.patch(
                        `/faculty/exams/${examId}/questions/update`,
                        { questions }
                      );
                      showToast("success", "Questions saved successfully");
                    } catch (err) {
                      console.error(err.response?.data || err);
                      showToast("error", "Failed to save questions");
                    }
                  }}
                >
                  Save Questions
                </button>
                <button
                  className="primary-btn"
                  onClick={async () => {
                    try {
                      await api.patch(`/faculty/exams/${examId}/publish`);
                      navigate("/faculty");
                    } catch (err) {
                      showToast("error", "Failed to publish exam");
                    }
                  }}
                >
                  Publish Exam
                </button>
              </div>
            )}

            {questions.length === 0 && (
              <p style={{ color: "#dc2626" }}>
                Add at least one question to publish
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
