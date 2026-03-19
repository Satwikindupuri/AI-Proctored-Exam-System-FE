import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { showToast } from "../utils/toast";
import "../styles/CodingExamForms.css";

const AddCodingQuestions = () => {
const { examId } = useParams();
const navigate = useNavigate();
const token = localStorage.getItem("token");

const [questions, setQuestions] = useState([]);

const [formData, setFormData] = useState({
title: "",
description: "",
difficulty: "MEDIUM",
functionName: "",
parameters: "",
returnType: "",
sampleTestCases: [{ input: "", expectedOutput: "" }],
hiddenTestCases: [{ input: "", expectedOutput: "" }],
marks: 10
});

const handleChange = (e) => {
setFormData({
...formData,
[e.target.name]: e.target.value
});
};

const updateSampleTestCase = (index, field, value) => {
  const updated = [...formData.sampleTestCases];
  updated[index][field] = value;
  setFormData({
    ...formData,
    sampleTestCases: updated
  });
};

const addHiddenTestCase = () => {
  if (formData.hiddenTestCases.length >= 5) {
    showToast("error", "Maximum 5 hidden test cases allowed");
    return;
  }

  setFormData({
    ...formData,
    hiddenTestCases: [
      ...formData.hiddenTestCases,
      { input: "", expectedOutput: "" }
    ]
  });
};

const removeHiddenTestCase = (index) => {
  const updated = [...formData.hiddenTestCases];
  updated.splice(index, 1);
  setFormData({
    ...formData,
    hiddenTestCases: updated
  });
};

const updateHiddenTestCase = (index, field, value) => {
  const updated = [...formData.hiddenTestCases];
  updated[index][field] = value;
  setFormData({
    ...formData,
    hiddenTestCases: updated
  });
};

const addQuestion = async () => {
  if (!examId) {
    showToast("error", "Missing exam id in the URL. Please create an exam first.");
    return;
  }

  if (formData.hiddenTestCases.length === 0) {
    showToast("error", "At least one hidden test case required");
    return;
  }

  const requestPayload = {
    title: formData.title,
    description: formData.description,
    difficulty: formData.difficulty,
    functionName: formData.functionName,
    parameters: [],
    returnType: formData.returnType,
    sampleTestCases: formData.sampleTestCases,
    hiddenTestCases: formData.hiddenTestCases,
    marks: Number(formData.marks)
  };

try {
// Convert parameters string → array
const parsedParams = formData.parameters
? formData.parameters.split(",").map(p => {
const [name, type] = p.trim().split(":");
return { name, type };
})
: [];

  requestPayload.parameters = parsedParams;

  const res = await axios.post(
    "http://localhost:5000/api/faculty/coding-question",
    requestPayload,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );

  const questionId = res.data._id;

  // Attach question to exam
  await axios.post(
    `http://localhost:5000/api/faculty/exams/${examId}/add-coding-question`,
    { questionId },
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );

  setQuestions(prev => [...prev, res.data]);

  showToast("success", "Coding question added successfully");

} catch (error) {
  console.error("Add coding question failed", {
    message: error?.message,
    status: error?.response?.status,
    data: error?.response?.data,
    requestPayload,
    examId
  });
  showToast("error", "Failed to add coding question");
}
};

const publishExam = async () => {
try {
await axios.patch(
`http://localhost:5000/api/faculty/exams/${examId}/publish`,
{},
{
headers: { Authorization: `Bearer ${token}` }
}
);

  showToast("success", "Exam Published Successfully");
  navigate("/faculty");

} catch (error) {
  showToast("error", "Publish failed");
}
};

return (
<div className="coding-form-page">
  <div className="coding-form-shell">
    <header className="coding-form-header">
      <h1>Add Coding Questions</h1>
      <p>Add one or more coding questions, then publish the exam.</p>
    </header>

    <div className="coding-form-card">
      <div className="coding-guide-card">
        <h4>Input / Output Format Guide</h4>
        <p>
          Format test case input exactly as your code expects to read it.
        </p>
        <ul>
          <li>Use new lines for multi-line input.</li>
          <li>Spaces and line breaks should match expected parsing.</li>
          <li>Output must match exactly, including whitespace.</li>
        </ul>
        <div className="coding-guide-snippet">
          5
          <br />
          1 2 3 4 5
        </div>
      </div>

      <div className="coding-form-grid">
        <div className="coding-field">
          <label htmlFor="title">Question Title</label>
          <input id="title" name="title" placeholder="e.g. Sum of Array" onChange={handleChange} value={formData.title} />
        </div>

        <div className="coding-field">
          <label htmlFor="functionName">Function Name</label>
          <input id="functionName" name="functionName" placeholder="e.g. solve" onChange={handleChange} value={formData.functionName} />
        </div>

        <div className="coding-field">
          <label htmlFor="parameters">Parameters</label>
          <input
            id="parameters"
            name="parameters"
            placeholder="e.g. a:int,b:int"
            onChange={handleChange}
            value={formData.parameters}
          />
        </div>

        <div className="coding-field">
          <label htmlFor="returnType">Return Type</label>
          <input id="returnType" name="returnType" placeholder="e.g. int" onChange={handleChange} value={formData.returnType} />
        </div>

        <div className="coding-field">
          <label htmlFor="difficulty">Difficulty</label>
          <select id="difficulty" name="difficulty" value={formData.difficulty} onChange={handleChange}>
            <option value="EASY">EASY</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HARD">HARD</option>
          </select>
        </div>

        <div className="coding-field">
          <label htmlFor="marks">Marks</label>
          <input
            id="marks"
            type="number"
            name="marks"
            placeholder="e.g. 10"
            onChange={handleChange}
            value={formData.marks}
            min="1"
          />
        </div>
      </div>

      <div className="coding-field" style={{ marginTop: 14 }}>
        <label htmlFor="description">Description</label>
        <textarea
          id="description"
          name="description"
          placeholder="Describe the coding problem"
          onChange={handleChange}
          value={formData.description}
        />
      </div>

      <h3>Sample Test Case</h3>
      <p className="coding-inline-note">This case is visible to students.</p>
      <div className="coding-question-block">
        <div className="coding-field">
          <label>Sample Input</label>
          <textarea
            placeholder="Sample input"
            value={formData.sampleTestCases[0]?.input || ""}
            onChange={(e) => updateSampleTestCase(0, "input", e.target.value)}
          />
        </div>
        <div className="coding-field" style={{ marginTop: 10 }}>
          <label>Expected Output</label>
          <textarea
            placeholder="Expected output"
            value={formData.sampleTestCases[0]?.expectedOutput || ""}
            onChange={(e) => updateSampleTestCase(0, "expectedOutput", e.target.value)}
          />
        </div>
      </div>

      <h3>Hidden Test Cases (Min 1, Max 5)</h3>
      {formData.hiddenTestCases.map((test, index) => (
        <div key={index} className="coding-question-block">
          <div className="coding-field">
            <label>Test Case {index + 1} Input</label>
            <textarea
              placeholder="Hidden input"
              value={test.input}
              onChange={(e) => updateHiddenTestCase(index, "input", e.target.value)}
            />
          </div>
          <div className="coding-field" style={{ marginTop: 10 }}>
            <label>Test Case {index + 1} Expected Output</label>
            <textarea
              placeholder="Hidden expected output"
              value={test.expectedOutput}
              onChange={(e) => updateHiddenTestCase(index, "expectedOutput", e.target.value)}
            />
          </div>
          {formData.hiddenTestCases.length > 1 && (
            <button className="coding-danger-btn" onClick={() => removeHiddenTestCase(index)} style={{ marginTop: 10 }}>
              Remove Test Case
            </button>
          )}
        </div>
      ))}

      <div className="coding-row" style={{ marginTop: 10 }}>
        <button className="coding-secondary-btn" onClick={addHiddenTestCase}>Add Hidden Test Case</button>
        <button className="coding-primary-btn" onClick={addQuestion}>Add Question</button>
      </div>

      <div className="coding-added-list">
        <h3>Added Questions</h3>
        {questions.length === 0 && <p className="coding-inline-note">No questions added yet.</p>}
        {questions.map((q, index) => (
          <div key={index} className="coding-added-item">
            <strong>{q.title}</strong> ({q.marks} marks)
          </div>
        ))}

        {questions.length > 0 && (
          <button className="coding-primary-btn" onClick={publishExam}>Publish Exam</button>
        )}
      </div>
    </div>
  </div>
</div>
);
};

export default AddCodingQuestions;