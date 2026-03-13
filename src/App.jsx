import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./App.css";

import Login from "./pages/Login";
import StudentDashboard from "./pages/StudentDashboard";
import StudentLiveExams from "./pages/StudentLiveExams";
import StudentPreviousResults from "./pages/StudentPreviousResults";
import SelfAnalysis from "./pages/SelfAnalysis";
import StudentProfile from "./pages/StudentProfile";
import StudentLayout from "./pages/StudentLayout";
import FacultyDashboard from "./pages/FacultyDashboard";
import FlaggedStudents from "./pages/FlaggedStudents";
import ExamView from "./pages/ExamView";
import CompletedExams from "./pages/CompletedExams";
// import LiveExams from "./pages/LiveExams";
import CreateExam from "./pages/CreateExam";
import FacultyLiveExams from "./pages/FacultyLiveExams";
import CompletedExamDetails from "./pages/CompletedExamsDetails";
import FacultyStudentAnalysis from "./pages/FacultyStudentAnalysis";
import StudentAnalysisDetails from "./pages/StudentAnalysisDetails";
import CreateCodingExam from "./pages/CreateCodingExam";
import AddCodingQuestions from "./pages/AddCodingQuestions";
import CodingExamView from "./pages/CodingExamView";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Login />} />

        {/* Student — sidebar layout */}
        <Route path="/student" element={<StudentLayout />}>
          <Route index element={<StudentDashboard />} />
          <Route path="live-exams" element={<StudentLiveExams />} />
          <Route path="results" element={<StudentPreviousResults />} />
          <Route path="analysis" element={<SelfAnalysis />} />
          <Route path="profile" element={<StudentProfile />} />
        </Route>

        {/* Exam views — full screen, no sidebar */}
        <Route path="/exam/:examId" element={<ExamView />} />
        <Route path="/coding-exam/:examId" element={<CodingExamView />} />

        {/* Faculty */}
        <Route path="/faculty" element={<FacultyDashboard />} />
        <Route path="/faculty/flagged" element={<FlaggedStudents />} />
        <Route path="/faculty/completed" element={<CompletedExams />} />
        <Route path="/faculty/live-exams" element={<FacultyLiveExams />} />
        <Route path="/faculty/create-exam" element={<CreateExam />} />
        <Route
          path="/faculty/completed/:examId"
          element={<CompletedExamDetails />}
        />
        <Route
          path="/faculty/faculty-student-analysis"
          element={<FacultyStudentAnalysis />}
        />
        <Route
          path="/faculty/student-analysis/:studentId"
          element={<StudentAnalysisDetails />}
        />
        <Route
          path="/faculty/create-coding-exam"
          element={<CreateCodingExam />}
        />
        <Route
          path="/faculty/coding-exam/:examId/add-questions"
          element={<AddCodingQuestions/>}
        />
        
      </Routes>
    </BrowserRouter>
  );
}

export default App;
