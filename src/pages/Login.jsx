import { useRef, useState } from "react";
import api from "../api/api";
import "../styles/Login.css";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("student");
  const [showErrorToast, setShowErrorToast] = useState(false);
  const toastTimerRef = useRef(null);

  const handleLogin = async () => {
    try {
      const res = await api.post("/auth/login", {
        email,
        password,
        role,
      });

      localStorage.setItem("token", res.data.token);
      localStorage.setItem("role", role);

      if (role === "student") {
        window.location.href = "/student";
      } else {
        window.location.href = "/faculty";
      }
    } catch (err) {
      setShowErrorToast(true);

      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }

      toastTimerRef.current = setTimeout(() => {
        setShowErrorToast(false);
      }, 3000);
    }
  };

  return (
    <div className="login-container">
      {showErrorToast && <div className="login-toast">Invalid credentials</div>}
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <h1 className="login-title">AI PROCTORED EXAMINATION SYSTEM</h1>
          <p className="login-subtitle">Secure, Smart, Seamless Assessments</p>
        </div>

        <div className="role-toggle">
          <button
            className={`role-toggle-btn ${role === "student" ? "active" : ""}`}
            onClick={() => setRole("student")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            Student
          </button>
          <button
            className={`role-toggle-btn ${role === "faculty" ? "active" : ""}`}
            onClick={() => setRole("faculty")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
            Faculty
          </button>
        </div>

        <div className="form-group">
          <label className="form-label">Email Address</label>
          <input
            className="form-input"
            type="email"
            placeholder="DEMO:student@test.com/faculty@test.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Password</label>
          <input
            className="form-input"
            type="password"
            placeholder="DEMO:Student@123/Faculty@123"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="form-footer">
          {/* <label className="remember-me">
            <input type="checkbox" />
            Remember me
          </label> */}
          {/* <a href="#" className="forgot-password">
            Forgot password?
          </a> */}
        </div>

        <button className="login-btn" onClick={handleLogin}>
          Sign In to {role === "student" ? "Student" : "Faculty"} Portal
        </button>

        <div className="contact-admin">
          Don't have an account? <a href="#">Contact Admin</a>
        </div>
      </div>
    </div>
  );
}
