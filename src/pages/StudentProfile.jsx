import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import api from "../api/api";

const emptyItem = {
  title: "",
  issuer: "",
  date: "",
  link: "",
};

function normalizeItems(items) {
  return items
    .map((item) => ({
      title: (item.title || "").trim(),
      issuer: (item.issuer || "").trim(),
      date: (item.date || "").trim(),
      link: (item.link || "").trim(),
    }))
    .filter((item) => item.title || item.issuer || item.date || item.link);
}

export default function StudentProfile() {
  const outletContext = useOutletContext();
  const setHasUnsavedChanges = outletContext?.setHasUnsavedChanges;
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({
    skills: [],
    achievements: [],
    certificates: [],
    resumeUrl: "",
  });
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [newSkill, setNewSkill] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);

  const showToast = (type, text) => {
    setToast({ type, text });
  };

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const normalizedForm = useMemo(
    () => ({
      skills: form.skills.map((skill) => skill.trim()).filter(Boolean),
      achievements: normalizeItems(form.achievements),
      certificates: normalizeItems(form.certificates),
      resumeUrl: form.resumeUrl.trim(),
    }),
    [form]
  );

  const currentSnapshot = useMemo(() => JSON.stringify(normalizedForm), [normalizedForm]);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await api.get("/student/profile");
        setProfile(res.data);
        const nextForm = {
          skills: res.data.skills || [],
          achievements: res.data.achievements || [],
          certificates: res.data.certificates || [],
          resumeUrl: res.data.resumeUrl || "",
        };
        setForm(nextForm);
        setSavedSnapshot(
          JSON.stringify({
            skills: (nextForm.skills || []).map((skill) => String(skill || "").trim()).filter(Boolean),
            achievements: normalizeItems(nextForm.achievements || []),
            certificates: normalizeItems(nextForm.certificates || []),
            resumeUrl: String(nextForm.resumeUrl || "").trim(),
          })
        );
      } catch (err) {
        console.error("Failed to load profile", err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  useEffect(() => {
    if (!setHasUnsavedChanges) {
      return;
    }

    setHasUnsavedChanges(!loading && currentSnapshot !== savedSnapshot);
  }, [currentSnapshot, loading, savedSnapshot, setHasUnsavedChanges]);

  useEffect(() => {
    return () => {
      if (setHasUnsavedChanges) {
        setHasUnsavedChanges(false);
      }
    };
  }, [setHasUnsavedChanges]);

  const getInitials = (name) => {
    if (!name) return "S";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const addSkill = () => {
    const skill = newSkill.trim();
    if (!skill) {
      return;
    }

    if (form.skills.includes(skill)) {
      setNewSkill("");
      return;
    }

    setForm((prev) => ({
      ...prev,
      skills: [...prev.skills, skill],
    }));
    setNewSkill("");
  };

  const removeSkill = (skill) => {
    setForm((prev) => ({
      ...prev,
      skills: prev.skills.filter((item) => item !== skill),
    }));
  };

  const addItem = (type) => {
    setForm((prev) => ({
      ...prev,
      [type]: [...prev[type], { ...emptyItem }],
    }));
  };

  const removeItem = (type, index) => {
    setForm((prev) => ({
      ...prev,
      [type]: prev[type].filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const updateItem = (type, index, field, value) => {
    setForm((prev) => ({
      ...prev,
      [type]: prev[type].map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item;
        }

        return {
          ...item,
          [field]: value,
        };
      }),
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);

    try {
      const payload = normalizedForm;

      const res = await api.patch("/student/profile", payload);
      const updated = res.data.profile;

      setProfile(updated);
      setForm({
        skills: updated.skills || [],
        achievements: updated.achievements || [],
        certificates: updated.certificates || [],
        resumeUrl: updated.resumeUrl || "",
      });
      setSavedSnapshot(
        JSON.stringify({
          skills: (updated.skills || []).map((skill) => String(skill || "").trim()).filter(Boolean),
          achievements: normalizeItems(updated.achievements || []),
          certificates: normalizeItems(updated.certificates || []),
          resumeUrl: String(updated.resumeUrl || "").trim(),
        })
      );
      showToast("success", "Profile updated successfully.");
    } catch (err) {
      console.error("Failed to save profile", err);
      showToast("error", "Failed to update profile.");
    } finally {
      setIsSaving(false);
    }
  };

  const renderItems = (label, type) => {
    const items = form[type];

    return (
      <section className="student-profile-section">
        <div className="student-profile-section-header">
          <h3>{label}</h3>
          <button
            type="button"
            className="student-profile-add-btn"
            onClick={() => addItem(type)}
          >
            + Add
          </button>
        </div>

        {items.length === 0 && (
          <p className="student-profile-empty-text">No {label.toLowerCase()} added yet.</p>
        )}

        <div className="student-profile-items-grid">
          {items.map((item, index) => (
            <div key={`${type}-${index}`} className="student-profile-item-card">
              <div className="student-profile-item-row">
                <label>Title</label>
                <input
                  value={item.title || ""}
                  onChange={(event) => updateItem(type, index, "title", event.target.value)}
                  placeholder="Title"
                />
              </div>

              <div className="student-profile-item-row">
                <label>Issuer</label>
                <input
                  value={item.issuer || ""}
                  onChange={(event) => updateItem(type, index, "issuer", event.target.value)}
                  placeholder="Issuer / Organization"
                />
              </div>

              <div className="student-profile-item-row">
                <label>Date</label>
                <input
                  value={item.date || ""}
                  onChange={(event) => updateItem(type, index, "date", event.target.value)}
                  placeholder="Month YYYY"
                />
              </div>

              <div className="student-profile-item-row">
                <label>Link</label>
                <input
                  value={item.link || ""}
                  onChange={(event) => updateItem(type, index, "link", event.target.value)}
                  placeholder="https://..."
                />
              </div>

              <button
                type="button"
                className="student-profile-remove-btn"
                onClick={() => removeItem(type, index)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>
    );
  };

  return (
    <div className="student-content-area">
      {toast && (
        <div className={`student-profile-toast ${toast.type}`}>
          {toast.text}
        </div>
      )}

      <div className="student-page-header">
        <h1>My Profile</h1>
        <p>Update your skills, achievements, certificates, and resume link.</p>
      </div>

      {loading && <p className="student-info-text">Loading profile...</p>}

      {!loading && !profile && (
        <div className="student-empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
          </svg>
          <p>Unable to load profile information.</p>
        </div>
      )}

      {!loading && profile && (
        <div className="student-profile-layout">
          <aside className="student-profile-card">
            <div className="student-profile-avatar">
              {getInitials(profile.name)}
            </div>

            <div className="student-profile-name">{profile.name}</div>
            <div className="student-profile-email">{profile.email}</div>

            <div className="student-profile-fields">
              <div className="student-profile-field">
                <span className="student-profile-field-label">Role</span>
                <span className="student-profile-field-value" style={{ textTransform: "capitalize" }}>
                  {profile.role}
                </span>
              </div>
              {profile.branch && (
                <div className="student-profile-field">
                  <span className="student-profile-field-label">Branch</span>
                  <span className="student-profile-field-value">{profile.branch}</span>
                </div>
              )}
              {profile.year && (
                <div className="student-profile-field">
                  <span className="student-profile-field-label">Year</span>
                  <span className="student-profile-field-value">{profile.year}</span>
                </div>
              )}
              {profile.section && (
                <div className="student-profile-field">
                  <span className="student-profile-field-label">Section</span>
                  <span className="student-profile-field-value">{profile.section}</span>
                </div>
              )}
              {profile.rollNo && (
                <div className="student-profile-field">
                  <span className="student-profile-field-label">Roll No.</span>
                  <span className="student-profile-field-value">{profile.rollNo}</span>
                </div>
              )}
            </div>
          </aside>

          <main className="student-profile-editor">
            <section className="student-profile-section">
              <div className="student-profile-section-header">
                <h3>Professional Skills</h3>
              </div>

              <div className="student-profile-skill-input-row">
                <input
                  value={newSkill}
                  onChange={(event) => setNewSkill(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addSkill();
                    }
                  }}
                  placeholder="Add skill"
                />
                <button type="button" className="student-profile-add-btn" onClick={addSkill}>
                  + Add
                </button>
              </div>

              <div className="student-profile-skills-wrap">
                {form.skills.length === 0 && (
                  <p className="student-profile-empty-text">No skills added yet.</p>
                )}
                {form.skills.map((skill) => (
                  <button
                    key={skill}
                    type="button"
                    className="student-profile-skill-chip"
                    onClick={() => removeSkill(skill)}
                    title="Click to remove"
                  >
                    {skill} ×
                  </button>
                ))}
              </div>
            </section>

            {renderItems("Achievements", "achievements")}
            {renderItems("Certificates", "certificates")}

            <section className="student-profile-section">
              <div className="student-profile-section-header">
                <h3>Resume Link</h3>
              </div>

              <div className="student-profile-item-row">
                <label>Resume URL</label>
                <input
                  value={form.resumeUrl}
                  onChange={(event) => setForm((prev) => ({ ...prev, resumeUrl: event.target.value }))}
                  placeholder="https://your-resume-link"
                />
              </div>
            </section>

            <div className="student-profile-save-row">
              <button
                type="button"
                className="student-start-btn"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : "Save Profile"}
              </button>
              {!loading && currentSnapshot !== savedSnapshot && (
                <p className="student-profile-save-message">You have unsaved changes.</p>
              )}
            </div>
          </main>
        </div>
      )}
    </div>
  );
}
