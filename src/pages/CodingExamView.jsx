import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api/api";
import { initFaceDetector, detectFaces } from "../ai/faceProctor";

// --- REUSEABLE CAMERA COMPONENT ---
const CameraPreview = ({ stream, videoRef }) => {
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, videoRef]);

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      style={{
        width: "100%",
        borderRadius: "8px",
        transform: "scaleX(-1)",
        backgroundColor: "#000"
      }}
    />
  );
};

export default function CodingExamView() {
  const { examId } = useParams();
  const navigate = useNavigate();

  // CORE CODING STATES
  const [exam, setExam] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("python");
  const [output, setOutput] = useState("");
  const [loadingRun, setLoadingRun] = useState(false);
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [totalScore, setTotalScore] = useState(0);
  const [submittedQuestions, setSubmittedQuestions] = useState(new Set());
  const [submitResult, setSubmitResult] = useState(null);
  const [toastMessage, setToastMessage] = useState("");
  const [timeLeft, setTimeLeft] = useState(null);

  // PROCTORING STATES
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [violations, setViolations] = useState(0);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [showModal, setShowModal] = useState(true);
  const [modalType, setModalType] = useState("PERMISSIONS"); 
  const [warningMsg, setWarningMsg] = useState(""); 
  const [isLocked, setIsLocked] = useState(false); 
  const [noiseWarnings, setNoiseWarnings] = useState(0);
  const [headPoseWarnings, setHeadPoseWarnings] = useState(0);
  const [noiseLevel, setNoiseLevel] = useState(0);
  const [micStatus, setMicStatus] = useState("unknown");

  const MAX_VIOLATIONS = 3;
  const NOISE_MIN_RMS = 0.01;
  const HEAD_POSE_WARN_SUSTAIN_MS = 3500;
  const HEAD_POSE_WARN_COOLDOWN_MS = 15000;
  const FACE_CENTER_TOLERANCE_X = 0.27;
  const FACE_CENTER_TOLERANCE_Y = 0.3;
  const FACE_MIN_AREA_RATIO = 0.025;
  const FACE_YAW_TOLERANCE = 0.55;
  const HEAD_POSE_EVIDENCE_REQUIRED = 3;
  const violationsRef = useRef(0);
  const noiseWarningsRef = useRef(0);
  const headPoseWarningsRef = useRef(0);
  const proctoringPaused = useRef(true);
  const cooldown = useRef(false);
  const faceDetectorRef = useRef(null); 
  const noFaceStartRef = useRef(null);
  const startedRef = useRef(false);
  const finishedRef = useRef(false);
  const webcamVideoRef = useRef(null); 
  const modalVideoRef = useRef(null);
  const aiIntervalRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioAnalyserRef = useRef(null);
  const audioSinkGainRef = useRef(null);
  const noiseMonitorRef = useRef(null);
  const noiseEvidenceRef = useRef(0);
  const noiseBaselineRef = useRef(0.004);
  const noiseCooldownRef = useRef(false);
  const headPoseOffStartRef = useRef(null);
  const headPoseCooldownRef = useRef(false);
  const headPoseEvidenceRef = useRef(0);
  const examTimerRef = useRef(null);
  const hasSubmittedOnTimeUpRef = useRef(false);
  const finishExamRef = useRef(null);

  const parsePoint = (point) => {
    if (!point) return null;
    if (Array.isArray(point)) {
      return { x: Number(point[0] ?? 0), y: Number(point[1] ?? 0) };
    }
    return { x: Number(point.x ?? 0), y: Number(point.y ?? 0) };
  };

  const getFaceBox = (face) => {
    if (face?.box) {
      const { xMin = 0, yMin = 0, width = 0, height = 0 } = face.box;
      return { x: xMin, y: yMin, width, height };
    }

    const topLeft = parsePoint(face?.boundingBox?.topLeft);
    const bottomRight = parsePoint(face?.boundingBox?.bottomRight);
    if (!topLeft || !bottomRight) return null;

    return {
      x: topLeft.x,
      y: topLeft.y,
      width: Math.max(0, bottomRight.x - topLeft.x),
      height: Math.max(0, bottomRight.y - topLeft.y),
    };
  };

  const getFaceKeypoint = (face, names) => {
    const points = face?.keypoints || [];
    const byName = points.find((p) => names.includes(p?.name));
    if (!byName) return null;
    return parsePoint(byName);
  };

  const triggerHeadPoseWarning = useCallback(() => {
    setHeadPoseWarnings((prev) => {
      const next = prev + 1;
      headPoseWarningsRef.current = next;
      setWarningMsg("Please keep your face straight and centered. Don't change your face position.");
      setTimeout(() => setWarningMsg(""), 3500);
      return next;
    });
  }, []);

  const evaluateHeadPose = useCallback((faces, videoEl) => {
    if (!videoEl || !startedRef.current || finishedRef.current) return;

    if (!Array.isArray(faces) || faces.length !== 1) {
      headPoseOffStartRef.current = null;
      headPoseEvidenceRef.current = 0;
      return;
    }

    const face = faces[0];
    const box = getFaceBox(face);
    if (!box || !videoEl.videoWidth || !videoEl.videoHeight) return;

    const centerX = (box.x + box.width / 2) / videoEl.videoWidth;
    const centerY = (box.y + box.height / 2) / videoEl.videoHeight;
    const areaRatio = (box.width * box.height) / (videoEl.videoWidth * videoEl.videoHeight);

    const offCenter =
      Math.abs(centerX - 0.5) > FACE_CENTER_TOLERANCE_X ||
      Math.abs(centerY - 0.5) > FACE_CENTER_TOLERANCE_Y ||
      areaRatio < FACE_MIN_AREA_RATIO;

    const leftEye = getFaceKeypoint(face, ["leftEye"]);
    const rightEye = getFaceKeypoint(face, ["rightEye"]);
    const nose = getFaceKeypoint(face, ["noseTip", "nose"]);

    let turnedSideways = false;
    if (leftEye && rightEye && nose) {
      const eyeDistance = Math.max(1, Math.abs(rightEye.x - leftEye.x));
      const eyeMidX = (leftEye.x + rightEye.x) / 2;
      const yawRatio = Math.abs(nose.x - eyeMidX) / eyeDistance;
      turnedSideways = yawRatio > FACE_YAW_TOLERANCE;
    }

    const badPose = offCenter || turnedSideways;
    const now = Date.now();

    if (badPose) {
      headPoseEvidenceRef.current = Math.min(headPoseEvidenceRef.current + 1, 8);

      if (headPoseEvidenceRef.current < HEAD_POSE_EVIDENCE_REQUIRED) {
        headPoseOffStartRef.current = null;
        return;
      }

      if (!headPoseOffStartRef.current) {
        headPoseOffStartRef.current = now;
      }

      if (
        now - headPoseOffStartRef.current >= HEAD_POSE_WARN_SUSTAIN_MS &&
        !headPoseCooldownRef.current
      ) {
        headPoseCooldownRef.current = true;
        headPoseOffStartRef.current = null;
        headPoseEvidenceRef.current = 0;
        triggerHeadPoseWarning();
        setTimeout(() => {
          headPoseCooldownRef.current = false;
        }, HEAD_POSE_WARN_COOLDOWN_MS);
      }
    } else {
      headPoseOffStartRef.current = null;
      headPoseEvidenceRef.current = Math.max(0, headPoseEvidenceRef.current - 1);
    }
  }, [triggerHeadPoseWarning]);

  // 1. AI PROCTORING ENGINE
  const startAIProctoring = async () => {
    noFaceStartRef.current = null;
    proctoringPaused.current = false;

    if (aiIntervalRef.current) clearInterval(aiIntervalRef.current);
    aiIntervalRef.current = setInterval(async () => {
      if (proctoringPaused.current) return;
      const video = webcamVideoRef.current;
      if (!video || video.readyState < 2) return;

      try {
        const faces = await detectFaces(video);
        if (faces.length === 0) {
          if (!noFaceStartRef.current) noFaceStartRef.current = Date.now();
          if ((Date.now() - noFaceStartRef.current) / 1000 >= 5) handleViolation("NO_FACE_DETECTED");
        } else {
          noFaceStartRef.current = null;
        }

        evaluateHeadPose(faces, video);
      } catch (err) { console.error(err); }
    }, 1000);
  };

  useEffect(() => {
    startedRef.current = started;
    finishedRef.current = finished;
  }, [started, finished]);

  // 2. RESUME EXAM AFTER VIOLATION
  const resumeExam = () => {
    setShowModal(false);
    proctoringPaused.current = true;
    noFaceStartRef.current = null;
    if (webcamVideoRef.current) {
      webcamVideoRef.current.play().catch(e => console.log("Play error", e));
    }
    setTimeout(() => {
      startAIProctoring();
    }, 1500);
  };

  const stopNoiseMonitoring = useCallback(() => {
    if (noiseMonitorRef.current) {
      clearInterval(noiseMonitorRef.current);
      noiseMonitorRef.current = null;
    }

    audioAnalyserRef.current = null;
    audioSinkGainRef.current = null;
    noiseEvidenceRef.current = 0;
    noiseBaselineRef.current = 0.004;
    noiseCooldownRef.current = false;
    setNoiseLevel(0);

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, []);

  const triggerNoiseWarning = useCallback(() => {
    setNoiseWarnings((prev) => {
      const newCount = prev + 1;
      noiseWarningsRef.current = newCount;

      setWarningMsg(`Please stay in a calm environment. Noise warning ${newCount}.`);
      setTimeout(() => setWarningMsg(""), 3500);

      return newCount;
    });
  }, []);

  const startNoiseMonitoring = useCallback((stream) => {
    const hasAudioTrack = stream?.getAudioTracks?.().length > 0;
    if (!hasAudioTrack) return;

    stopNoiseMonitoring();

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    const audioContext = new AudioContextClass();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    const sinkGain = audioContext.createGain();
    sinkGain.gain.value = 0;
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.15;
    source.connect(analyser);
    analyser.connect(sinkGain);
    sinkGain.connect(audioContext.destination);

    audioContext.resume().catch(() => {});

    audioContextRef.current = audioContext;
    audioAnalyserRef.current = analyser;
    audioSinkGainRef.current = sinkGain;

    const sampleBuffer = new Uint8Array(analyser.fftSize);
    const frequencyBuffer = new Uint8Array(analyser.frequencyBinCount);

    noiseMonitorRef.current = setInterval(() => {
      if (!startedRef.current || finishedRef.current || proctoringPaused.current) return;
      if (audioContext.state === "suspended") {
        audioContext.resume().catch(() => {});
        return;
      }

      analyser.getByteTimeDomainData(sampleBuffer);
      analyser.getByteFrequencyData(frequencyBuffer);

      let sumSquares = 0;
      for (let i = 0; i < sampleBuffer.length; i += 1) {
        const normalized = (sampleBuffer[i] - 128) / 128;
        sumSquares += normalized * normalized;
      }

      const rms = Math.sqrt(sumSquares / sampleBuffer.length);

      let freqSum = 0;
      for (let i = 0; i < frequencyBuffer.length; i += 1) {
        freqSum += frequencyBuffer[i];
      }
      const freqAvg = (freqSum / frequencyBuffer.length) / 255;

      // Use strongest signal between time-domain and frequency-domain estimations.
      const signalLevel = Math.max(rms, freqAvg * 0.35);

      setNoiseLevel(signalLevel);
      const baseline = Math.max(NOISE_MIN_RMS, noiseBaselineRef.current);

      // Update baseline only when close to ambient level (avoids learning active speech as baseline).
      if (signalLevel < baseline * 1.35) {
        noiseBaselineRef.current = baseline * 0.92 + signalLevel * 0.08;
      }

      const dynamicThreshold = Math.max(NOISE_MIN_RMS * 2.5, baseline * 3.0);

      if (signalLevel > dynamicThreshold) {
        noiseEvidenceRef.current += 1;
      } else {
        noiseEvidenceRef.current = Math.max(0, noiseEvidenceRef.current - 1);
      }

      if (noiseEvidenceRef.current >= 2 && !noiseCooldownRef.current) {
        noiseCooldownRef.current = true;
        noiseEvidenceRef.current = 0;
        triggerNoiseWarning();
        setTimeout(() => {
          noiseCooldownRef.current = false;
        }, 12000);
      }
    }, 1500);
  }, [stopNoiseMonitoring, triggerNoiseWarning]);

  // 3. VIOLATION HANDLER
  const handleViolation = useCallback((reason) => {
    if (finished || submitting || proctoringPaused.current || cooldown.current) return;
    cooldown.current = true;
    proctoringPaused.current = true;
    
    if (aiIntervalRef.current) clearInterval(aiIntervalRef.current);

    setViolations((prev) => {
      const newCount = prev + 1;
      violationsRef.current = newCount;
      api.post(`/student/exams/${examId}/violation`, { reason, count: newCount }).catch(() => {});
      if (newCount >= MAX_VIOLATIONS) {
        handleFinishExam(true);
      } else {
        setModalType("VIOLATION");
        setShowModal(true);
      }
      return newCount;
    });
    setTimeout(() => { cooldown.current = false; }, 2000);
  }, [examId, finished, submitting]);

  // 4. INITIAL LOAD
  useEffect(() => {
    api.get(`/student/exams/${examId}`).then((res) => setExam(res.data)).catch(() => alert("Error loading exam"));
  }, [examId]);

  const requestCamera = async () => {
    try {
      let stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      if (stream.getAudioTracks().length === 0) {
        const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        stream = new MediaStream([...stream.getVideoTracks(), ...audioOnly.getAudioTracks()]);
      }

      const micTrack = stream.getAudioTracks()[0];
      setMicStatus(
        micTrack
          ? `${micTrack.readyState} | ${micTrack.enabled ? "enabled" : "disabled"} | ${micTrack.muted ? "muted" : "unmuted"}`
          : "no-audio-track"
      );

      setCameraStream(stream);
      setModalType("START"); 
      noiseWarningsRef.current = 0;
      setNoiseWarnings(0);
      startNoiseMonitoring(stream);
    } catch (err) { alert("Camera and microphone access are required."); }
  };

  const enterFullscreenAndStart = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      await initFaceDetector();
      if (!started) {
        await api.post(`/student/exams/${examId}/start`).catch(() => {});
        setStarted(true);
        hasSubmittedOnTimeUpRef.current = false;
      }
      setIsFullScreen(true); setShowModal(false); setIsLocked(false);
      setTimeout(() => startAIProctoring(), 1500);
    } catch (err) { alert("Fullscreen is mandatory."); }
  };

  useEffect(() => {
    if (!started || finished || !exam?.duration) return;
    if (timeLeft !== null) return;

    const durationInSeconds = Number(exam.duration) * 60;
    setTimeLeft(Number.isFinite(durationInSeconds) ? durationInSeconds : 0);
  }, [started, finished, exam, timeLeft]);

  // 5. FULLSCREEN EXIT DETECTION
  useEffect(() => {
    if (!started || finished) return;
    const onFullscreenChange = () => {
      if (!document.fullscreenElement && !proctoringPaused.current) {
        setIsFullScreen(false);
        setIsLocked(true);
        setModalType("FULLSCREEN_EXIT");
        setShowModal(true);
        proctoringPaused.current = true;
        if (aiIntervalRef.current) clearInterval(aiIntervalRef.current);
        handleViolation("Exited Fullscreen");
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [started, finished, handleViolation]);

  // 6. SECURITY LISTENERS
  useEffect(() => {
    if (!started || finished) return;
    const checkIntegrity = () => {
      if (document.fullscreenElement && (window.screen.width - window.innerWidth > 100)) {
        setIsLocked(true); handleViolation("Sidebar extension detected");
      }
    };
    const interval = setInterval(checkIntegrity, 2000);
    const onBlur = () => handleViolation("Focus Loss (Extension/Popup)");
    window.addEventListener("blur", onBlur);
    return () => { clearInterval(interval); window.removeEventListener("blur", onBlur); };
  }, [started, finished, handleViolation]);

  // 7. CODING LOGIC
  const currentQuestion = exam?.codingQuestions?.[currentIndex];

  const handleRun = async () => {
    if (!currentQuestion) return;
    setLoadingRun(true); setOutput("");
    try {
      const res = await api.post(`/student/exams/${examId}/coding/${currentQuestion._id}/run`, {
        code,
        language
      });
      setOutput(res.data.error || res.data.output || "Executed");
    } catch { setOutput("Execution error"); }
    finally { setLoadingRun(false); }
  };

  const handleSubmitQuestion = async () => {
    if (!currentQuestion) return;
    
    setLoadingSubmit(true);
    try {
      const res = await api.post(`/student/exams/${examId}/coding/${currentQuestion._id}/submit`, {
        code,
        language
      });
      
      // Store result (test results only, not marks)
      const result = {
        passed: res.data.passed,
        totalCases: res.data.totalCases,
        marksAwarded: res.data.marksAwarded,
        submittedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setSubmitResult(result);
      
      // Update total score (but don't show to student)
      setTotalScore((prev) => prev + (res.data.marksAwarded || 0));
      
      // Track submitted questions (for UI indicator only)
      setSubmittedQuestions(prev => new Set([...prev, currentQuestion._id]));
      
      // Show toast WITHOUT marks
      const isResubmit = submittedQuestions.has(currentQuestion._id);
      setToastMessage(isResubmit 
        ? `✅ Updated! ${res.data.passed}/${res.data.totalCases} tests passed`
        : `✅ Submitted! ${res.data.passed}/${res.data.totalCases} tests passed`
      );
      setTimeout(() => setToastMessage(""), 4000);
      
    } catch (error) {
      setToastMessage("❌ Submission failed: " + (error.response?.data?.message || error.message));
      setTimeout(() => setToastMessage(""), 4000);
    }
    finally { setLoadingSubmit(false); }
  };

  const handleFinishExam = async (auto = false) => {
    if (submitting || finished) return;
    setSubmitting(true);
    setFinished(true);
    proctoringPaused.current = true;
    if (aiIntervalRef.current) clearInterval(aiIntervalRef.current);
    try {
      await api.post(`/student/exams/${examId}/final-submit`, { autoSubmit: auto });
      setToastMessage(auto ? "Time/violations reached: exam auto-submitted." : "Exam submitted successfully.");
    } finally {
      stopNoiseMonitoring();
      if (cameraStream) cameraStream.getTracks().forEach(t => t.stop());
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      navigate("/student");
    }
  };

  useEffect(() => {
    finishExamRef.current = handleFinishExam;
  }, [handleFinishExam]);

  useEffect(() => {
    if (!started || finished || timeLeft === null) return;

    if (examTimerRef.current) {
      clearInterval(examTimerRef.current);
    }

    examTimerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null) return prev;

        if (prev <= 1) {
          if (examTimerRef.current) {
            clearInterval(examTimerRef.current);
            examTimerRef.current = null;
          }

          if (!hasSubmittedOnTimeUpRef.current) {
            hasSubmittedOnTimeUpRef.current = true;
            finishExamRef.current?.(violationsRef.current >= MAX_VIOLATIONS);
          }

          return 0;
        }

        return prev - 1;
      });
    }, 1000);

    return () => {
      if (examTimerRef.current) {
        clearInterval(examTimerRef.current);
        examTimerRef.current = null;
      }
    };
  }, [started, finished, timeLeft]);

  useEffect(() => {
    return () => {
      if (aiIntervalRef.current) {
        clearInterval(aiIntervalRef.current);
        aiIntervalRef.current = null;
      }
      if (examTimerRef.current) {
        clearInterval(examTimerRef.current);
        examTimerRef.current = null;
      }
      stopNoiseMonitoring();
    };
  }, [stopNoiseMonitoring]);

  const formatTime = (totalSeconds) => {
    if (totalSeconds === null || totalSeconds === undefined) return "--:--";
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  if (!exam) return <div style={{color: 'white', textAlign: 'center', marginTop: '20%'}}>Loading...</div>;

  return (
    <div id="exam-root-container" style={mainContainerStyle}>
      {warningMsg && <div style={warningToastStyle}>{warningMsg}</div>}
      {toastMessage && <div style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        backgroundColor: toastMessage.includes('✅') ? "#4caf50" : "#ff6b6b",
        color: "#fff",
        padding: "12px 20px",
        borderRadius: "6px",
        zIndex: 99998,
        fontWeight: "bold"
      }}>{toastMessage}</div>}

      {(showModal || isLocked) && (
        <div style={modalOverlayStyle}>
          <div style={modalBoxStyle}>
            {cameraStream && (
              <div style={{ marginBottom: "20px", width: "240px", margin: "0 auto 20px" }}>
                <CameraPreview stream={cameraStream} videoRef={modalVideoRef} />
              </div>
            )}
            {isLocked ? (
              <><h2>⚠️ FULLSCREEN REQUIRED</h2><p>You must return to fullscreen to continue.</p><button style={btnStyle} onClick={enterFullscreenAndStart}>Return to Fullscreen</button></>
            ) : modalType === "PERMISSIONS" ? (
              <button style={btnStyle} onClick={requestCamera}>Allow Camera</button>
            ) : modalType === "START" ? (
              <button style={btnStyle} onClick={enterFullscreenAndStart}>Start Exam</button>
            ) : modalType === "FULLSCREEN_EXIT" ? (
              <><h2>⚠️ FULLSCREEN EXITED</h2><p>Violation recorded. Return to fullscreen.</p><button style={btnStyle} onClick={enterFullscreenAndStart}>Return to Fullscreen</button></>
            ) : (
              <><h2>⚠️ Violation Detected!</h2><p>Violations: {violations}/{MAX_VIOLATIONS}</p><button style={btnStyle} onClick={resumeExam}>Return to Exam</button></>
            )}
          </div>
        </div>
      )}

      {started && isFullScreen && (
        <div style={{ display: "flex", gap: "30px", opacity: showModal ? 0.3 : 1 }}>
          <div style={{ flex: 1 }}>
            <h2>{exam.title}</h2>
            <p style={{ color: "#ff4d4d", fontWeight: "bold" }}>Violations: {violations}/{MAX_VIOLATIONS}</p>
            <p style={{ color: "#ffcc80", fontWeight: "bold" }}>Noise Warnings: {noiseWarnings}</p>
            <p style={{ color: "#ffab91", fontWeight: "bold" }}>Head Position Warnings: {headPoseWarnings}</p>
            <p style={{ color: "#90caf9", fontWeight: "bold" }}>Noise Level: {noiseLevel.toFixed(4)}</p>
            <p style={{ color: "#b0bec5", fontSize: 13 }}>Mic: {micStatus}</p>
            <p style={timerStyle}>Time Left: {formatTime(timeLeft)}</p>
            <div style={{ marginBottom: 20 }}>
              {(exam.codingQuestions || []).map((q, idx) => (
                <button key={q._id} onClick={() => setCurrentIndex(idx)} style={{ marginRight: 10, padding: 10, background: currentIndex === idx ? '#007bff' : '#444', color: 'white' }}>
                  Q{idx + 1}
                </button>
              ))}
            </div>

            {currentQuestion && (
              <div style={questionCardStyle}>
                <h3>{currentQuestion.title}</h3>
                <p>{currentQuestion.description}</p>
              </div>
            )}

            <select value={language} onChange={(e) => setLanguage(e.target.value)} style={{marginBottom: 10}}>
              <option value="python">Python</option>
              <option value="java">Java</option>
              <option value="cpp">C++</option>
            </select>

            <textarea rows={15} style={editorStyle} value={code} onChange={(e) => setCode(e.target.value)} />

            <div style={{ marginTop: 10 }}>
              <button style={btnStyle} onClick={handleRun} disabled={loadingRun}>Run</button>
              <button 
                style={{
                  ...btnStyle, 
                  background: submittedQuestions.has(currentQuestion?._id) ? '#28a745' : 'purple', 
                  marginLeft: 10
                }} 
                onClick={handleSubmitQuestion} 
                disabled={loadingSubmit}
              >
                {submittedQuestions.has(currentQuestion?._id) ? 'Resubmit' : 'Submit Q'}
              </button>
            </div>

            {submitResult && (
              <div style={{
                marginTop: 15,
                padding: '12px',
                backgroundColor: '#1a5a1a',
                border: '2px solid #4caf50',
                borderRadius: '6px',
                color: '#4caf50'
              }}>
                <p style={{ margin: '5px 0', fontWeight: 'bold' }}>✅ Test Results</p>
                <p style={{ margin: '5px 0' }}>Passed: {submitResult.passed}/{submitResult.totalCases}</p>
                <p style={{ margin: '5px 0', fontSize: '12px', color: '#888' }}>Last updated: {submitResult.submittedAt}</p>
              </div>
            )}

            <div style={outputBoxStyle}><pre>{output}</pre></div>

            <div style={{ marginTop: 15, display: 'flex', gap: '10px' }}>
              {currentIndex < (exam.codingQuestions || []).length - 1 && (
                <button 
                  style={{...btnStyle, background: '#17a2b8', flex: 1}} 
                  onClick={() => {
                    setCurrentIndex(currentIndex + 1);
                    setCode("");
                    setOutput("");
                    setSubmitResult(null);
                  }}
                >
                  Next Question →
                </button>
              )}
              <button style={{...btnStyle, background: 'green', flex: 1, marginTop: 0}} onClick={() => handleFinishExam(false)}>Finish Exam</button>
            </div>
          </div>

          <div style={{ width: "280px" }}>
            <div style={webcamContainerStyle}>
              <CameraPreview stream={cameraStream} videoRef={webcamVideoRef} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// STYLES
const mainContainerStyle = { minHeight: "100vh", padding: "20px", backgroundColor: "#121212", color: "white" };
const modalOverlayStyle = { position: "fixed", inset: 0, backgroundColor: "#000", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 99999 };
const modalBoxStyle = { backgroundColor: "#fff", padding: "40px", borderRadius: "15px", textAlign: "center", color: '#000' };
const btnStyle = { padding: "12px 24px", cursor: "pointer", backgroundColor: "#007bff", color: "#fff", border: "none", borderRadius: "8px" };
const questionCardStyle = { padding: "20px", borderRadius: "10px", marginBottom: "20px", backgroundColor: "#1e1e1e" };
const editorStyle = { width: "100%", backgroundColor: "#1e1e1e", color: "#fff", padding: "15px", fontFamily: "monospace" };
const outputBoxStyle = { background: "#000", color: "#0f0", padding: "15px", marginTop: "20px", minHeight: "100px" };
const webcamContainerStyle = { position: "sticky", top: "20px", border: "2px solid #444", padding: "10px", backgroundColor: "#000" };
const warningToastStyle = { position: "fixed", top: "20px", left: "50%", transform: "translateX(-50%)", backgroundColor: "#ffc107", padding: "10px 20px", borderRadius: "20px", color: "#000", zIndex: 99999 };
const timerStyle = { fontSize: "18px", fontWeight: "bold", marginBottom: "12px", color: "#ffd54f" };