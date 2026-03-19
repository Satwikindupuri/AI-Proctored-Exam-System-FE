import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { showToast } from "../utils/toast";
import "../styles/CodingExamForms.css";

const CreateCodingExam = () => {
const navigate = useNavigate();

const [formData, setFormData] = useState({
title: "",
duration: "",
instructions: "",
year: "",
branch: "",
section: ""
});

const handleChange = (e) => {
setFormData({
...formData,
[e.target.name]: e.target.value
});
};

const handleSubmit = async (e) => {
e.preventDefault();

try {
  const token = localStorage.getItem("token");

  const res = await axios.post(
    "http://localhost:5000/api/faculty/exams",
    {
      ...formData,
      examType: "CODING"
    },
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  const examId =
    res.data?._id ||
    res.data?.examId ||
    res.data?.exam?._id ||
    res.data?.data?._id;

  if (!examId) {
    console.error("Create coding exam returned unexpected payload", res.data);
    showToast("error", "Exam created, but no exam id was returned. Please contact support.");
    return;
  }

  // Redirect to add coding questions page
  navigate(`/faculty/coding-exam/${examId}/add-questions`);

} catch (error) {
  console.error("Create coding exam failed", error);
  showToast("error", "Failed to create coding exam");
}
};

return (
<div className="coding-form-page">
  <div className="coding-form-shell">
    <header className="coding-form-header">
      <h1>Create Coding Exam</h1>
      <p>Set up exam details and continue to add coding questions.</p>
    </header>

    <form className="coding-form-card" onSubmit={handleSubmit}>
      <div className="coding-form-grid">
        <div className="coding-field">
          <label htmlFor="title">Exam Title</label>
          <input
            id="title"
            type="text"
            name="title"
            placeholder="e.g. DSA Mid Term"
            value={formData.title}
            onChange={handleChange}
            required
          />
        </div>

        <div className="coding-field">
          <label htmlFor="duration">Duration (minutes)</label>
          <input
            id="duration"
            type="number"
            name="duration"
            placeholder="e.g. 90"
            value={formData.duration}
            onChange={handleChange}
            required
          />
        </div>

        <div className="coding-field">
          <label htmlFor="year">Year</label>
          <input
            id="year"
            type="text"
            name="year"
            placeholder="e.g. 4"
            value={formData.year}
            onChange={handleChange}
            required
          />
        </div>

        <div className="coding-field">
          <label htmlFor="branch">Branch</label>
          <input
            id="branch"
            type="text"
            name="branch"
            placeholder="e.g. CSE"
            value={formData.branch}
            onChange={handleChange}
            required
          />
        </div>

        <div className="coding-field">
          <label htmlFor="section">Section</label>
          <input
            id="section"
            type="text"
            name="section"
            placeholder="e.g. A"
            value={formData.section}
            onChange={handleChange}
          />
        </div>
      </div>

      <div className="coding-field">
        <label htmlFor="instructions">Instructions</label>
        <textarea
          id="instructions"
          name="instructions"
          placeholder="General instructions for students"
          value={formData.instructions}
          onChange={handleChange}
        />
      </div>

      <div className="coding-form-actions">
        <button type="submit" className="coding-primary-btn">Create Exam</button>
      </div>
    </form>
  </div>
</div>
);
};

export default CreateCodingExam;