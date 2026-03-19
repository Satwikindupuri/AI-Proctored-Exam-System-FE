import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api/api";
import { loadProctorModels } from "../proctoring/models";
import { startProctoringEngine } from "../proctoring/engine";
import { EVENT_TYPES } from "../proctoring/rules";
import { showToast } from "../utils/toast";

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

export default function ExamView() {
  const { examId } = useParams();
  const navigate = useNavigate();

  // Slightly stricter policy improves early detection of small/brief objects.
  const STRICT_PROCTOR_POLICY = {
    intervalMs: 700,
    cooldownMs: 3000,
    noFaceMs: 5000,
    multiFaceMs: 1800,
    phoneFramesRequired: 1,
    multiPersonsFramesRequired: 1,
    minPhoneScore: 0.2,
    minPersonScore: 0.35,
  };

  // CORE STATES
  const [exam, setExam] = useState(null);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  // PROCTORING STATES
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
  const proctoringSessionRef = useRef(null);
  const startedRef = useRef(false);
  const finishedRef = useRef(false);
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
  
  // 🔥 SEPARATE REFS: One for AI (Main UI), one for Modal display
  const webcamVideoRef = useRef(null); 
  const modalVideoRef = useRef(null);
  const examTimerRef = useRef(null);
  const hasSubmittedOnTimeUpRef = useRef(false);
  const submitExamRef = useRef(null);
  const snapshotTimerRef = useRef(null);
  const snapshotCountRef = useRef(0);

  const resetAIState = () => {
    console.log("RESETTING AI STATE");
    proctoringPaused.current = false;
  };

  useEffect(() => {
    startedRef.current = started;
    finishedRef.current = finished;
  }, [started, finished]);

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

  const startAIProctoring = async () => {
    console.log("AI PROCTORING ENABLED");
    resetAIState();

    if (proctoringSessionRef.current) {
      proctoringSessionRef.current.stop();
      proctoringSessionRef.current = null;
    }

    const video = webcamVideoRef.current;
    if (!video) return;

    proctoringSessionRef.current = await startProctoringEngine({
      videoEl: video,
      policy: STRICT_PROCTOR_POLICY,
      onEvent: (evt) => {
        if (proctoringPaused.current) return;

        if (evt.type === EVENT_TYPES.NO_FACE) {
          handleViolation("NO_FACE_DETECTED");
        } else if (evt.type === EVENT_TYPES.MULTIPLE_FACES) {
          handleViolation("MULTIPLE_FACE_DETECTED");
        } else if (evt.type === EVENT_TYPES.PHONE_DETECTED) {
          handleViolation("MOBILE_DEVICE_DETECTED");
        } else if (evt.type === EVENT_TYPES.MULTIPLE_PERSONS) {
          handleViolation("MULTIPLE_PERSONS_DETECTED");
        }
      },
      onTick: ({ predictions, faces }) => {
        evaluateHeadPose(faces, video);

        const labels = predictions
          .filter((p) => p.score >= 0.25)
          .map((p) => `${p.class}:${p.score.toFixed(2)}`);

        if (labels.length) {
          console.log("PROCTOR OBJECTS:", labels.join(", "));
        }
      },
    });
  };

  useEffect(() => {
    api.get(`/student/exams/${examId}`).then((res) => setExam(res.data));
  }, [examId]);

  useEffect(() => {
    if (!started || finished || !exam?.duration) return;
    if (timeLeft !== null) return;

    const durationInSeconds = Number(exam.duration) * 60;
    setTimeLeft(Number.isFinite(durationInSeconds) ? durationInSeconds : 0);
  }, [started, finished, exam, timeLeft]);

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
    } catch (err) {
      setMicStatus("permission-or-device-error");
      showToast("error", "Camera and microphone access are required for proctoring.");
    }
  };

  const enterFullscreenAndStart = async () => {
    try {
      const element = document.documentElement;
      if (!document.fullscreenElement) {
        if (element.requestFullscreen) await element.requestFullscreen();
      }
      
      await loadProctorModels();
      
      if (!started) {
        await api.post(`/student/exams/${examId}/start`);
        snapshotCountRef.current = 0;
        setStarted(true);
      }
      setIsFullScreen(true);
      setShowModal(false);
      setIsLocked(false);
      
      setTimeout(() => {
        startAIProctoring();
      }, 1500);
    } catch (err) {
      showToast("error", "Fullscreen is mandatory.");
    }
  };

  const resumeExam = () => {
    setShowModal(false);
    proctoringPaused.current = true; 

    // Ensure the main video is actually playing after modal closure
    if (webcamVideoRef.current) {
        webcamVideoRef.current.play().catch(e => console.log("Play error", e));
    }

    setTimeout(() => {
      startAIProctoring(); 
    }, 1500);
  };

  const captureAndUploadSnapshot = useCallback(async (reason = "interval") => {
    if (finished || submitting) return;
    if (snapshotCountRef.current >= 10) return;

    const video = webcamVideoRef.current;
    if (!video || video.readyState < 2) return;

    try {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 240;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = canvas.toDataURL("image/jpeg", 0.55);

      await api.post(`/student/exams/${examId}/snapshot`, {
        imageData,
        capturedAt: new Date().toISOString(),
        reason,
      });

      snapshotCountRef.current += 1;
    } catch (error) {
      // Silent mode: evidence capture should never disturb the candidate.
      console.log("Snapshot upload skipped", error?.message || error);
    }
  }, [examId, finished, submitting]);

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

  useEffect(() => {
    if (!started || finished || !exam?.duration || !cameraStream) return;

    const durationMinutes = Number(exam.duration);
    const durationMs = Number.isFinite(durationMinutes) ? durationMinutes * 60 * 1000 : 0;
    if (!durationMs) return;

    // Example: 60 mins / 10 snapshots => one every 6 mins.
    const intervalMs = Math.max(30_000, Math.floor(durationMs / 10));

    if (snapshotTimerRef.current) {
      clearInterval(snapshotTimerRef.current);
      snapshotTimerRef.current = null;
    }

    snapshotTimerRef.current = setInterval(() => {
      if (snapshotCountRef.current >= 10) {
        if (snapshotTimerRef.current) {
          clearInterval(snapshotTimerRef.current);
          snapshotTimerRef.current = null;
        }
        return;
      }

      captureAndUploadSnapshot("interval");
    }, intervalMs);

    return () => {
      if (snapshotTimerRef.current) {
        clearInterval(snapshotTimerRef.current);
        snapshotTimerRef.current = null;
      }
    };
  }, [started, finished, exam, cameraStream, captureAndUploadSnapshot]);

  const handleViolation = useCallback((reason) => {
    if (finished || submitting || proctoringPaused.current || cooldown.current) return;

    cooldown.current = true;
    proctoringPaused.current = true;

    proctoringSessionRef.current?.stop();
    proctoringSessionRef.current = null;

    setViolations((prev) => {
      const newCount = prev + 1;
      violationsRef.current = newCount;
      api.post(`/student/exams/${examId}/violation`, { reason, count: newCount }).catch(() => {});

      if (newCount >= MAX_VIOLATIONS) {
        submitExam(true);
      } else {
        setModalType("VIOLATION");
        setShowModal(true);
      }
      return newCount;
    });
    
    setTimeout(() => { cooldown.current = false; }, 2000);
  }, [examId, finished, submitting]);

  // --- Sidebar/Extension Observers ---
  useEffect(() => {
    if (!started || finished) return;
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node.nodeName === 'IFRAME' || (node.nodeType === 1 && !node.closest('#exam-root-container'))) {
               handleViolation("Extension Overlay/Sidebar Detected");
            }
          });
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [started, finished, handleViolation]);

  useEffect(() => {
    if (!started || finished) return;
    const checkIntegrity = () => {
      const diff = window.screen.width - window.innerWidth;
      if (document.fullscreenElement && diff > 100) {
        setIsLocked(true); 
        handleViolation("Side-panel extension detected");
      } else if (document.fullscreenElement) {
        setIsLocked(false);
      }
    };
    const interval = setInterval(checkIntegrity, 2000);
    return () => clearInterval(interval);
  }, [started, finished, handleViolation]);

  // --- Listeners ---
  useEffect(() => {
    if (!started || finished) return;
    const handleKeyDownCapture = (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey) {
        setWarningMsg("WARNING: Keyboard shortcuts prohibited!");
        setTimeout(() => setWarningMsg(""), 3000);
      }
      const forbidden = ["j", "u", "s", "p", "i", "f", "g"];
      if (e.ctrlKey && forbidden.includes(e.key.toLowerCase())) {
        e.preventDefault(); e.stopPropagation();
        handleViolation(`Forbidden Shortcut: Ctrl+${e.key}`);
      }
      if (e.key === "F12") {
        e.preventDefault(); e.stopPropagation();
        handleViolation("DevTools attempt");
      }
    };
    const handleResize = () => {
      if (document.fullscreenElement && !proctoringPaused.current) handleViolation("Screen Resizing");
    };
    window.addEventListener("keydown", handleKeyDownCapture, true);
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("keydown", handleKeyDownCapture, true);
      window.removeEventListener("resize", handleResize);
    };
  }, [started, finished, handleViolation]);

  useEffect(() => {
    if (!started || finished) return;
    const onFullscreenChange = () => {
      if (!document.fullscreenElement && !proctoringPaused.current) {
        setIsFullScreen(false);
        handleViolation("Exited Fullscreen");
      }
    };
    const onVisibilityChange = () => { if (document.hidden) handleViolation("Tab Switch"); };
    const onBlur = () => handleViolation("Focus Loss (Extension/Popup)");

    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onBlur);
    };
  }, [started, finished, handleViolation]);

  useEffect(() => {
    const block = (e) => e.preventDefault();
    ["copy", "cut", "paste", "contextmenu", "selectstart", "dragstart"].forEach(ev => document.addEventListener(ev, block));
    return () => ["copy", "cut", "paste", "contextmenu", "selectstart", "dragstart"].forEach(ev => document.removeEventListener(ev, block));
  }, []);

  const submitExam = useCallback(async (auto = false) => {
    if (submitting || finished) return;
    setSubmitting(true); setFinished(true);
    proctoringPaused.current = true;
    proctoringSessionRef.current?.stop();
    proctoringSessionRef.current = null;
    try {
      const payload = Object.entries(answers).map(([qid, ans]) => ({ questionId: qid, answer: ans }));
      await api.post(`/student/exams/${examId}/submit`, { answers: payload, autoSubmit: auto });
      showToast("success", auto ? "Exam auto-submitted." : "Exam submitted successfully.");
    } finally {
      stopNoiseMonitoring();
      if (cameraStream) cameraStream.getTracks().forEach(t => t.stop());
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      navigate("/student");
    }
  }, [answers, examId, finished, navigate, submitting, cameraStream, stopNoiseMonitoring]);

  useEffect(() => {
    submitExamRef.current = submitExam;
  }, [submitExam]);

  useEffect(() => {
    return () => {
      proctoringSessionRef.current?.stop();
      proctoringSessionRef.current = null;
      if (snapshotTimerRef.current) {
        clearInterval(snapshotTimerRef.current);
        snapshotTimerRef.current = null;
      }
      stopNoiseMonitoring();
    };
  }, [stopNoiseMonitoring]);

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
            submitExamRef.current?.(violationsRef.current >= MAX_VIOLATIONS);
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

  const formatTime = (totalSeconds) => {
    if (totalSeconds === null || totalSeconds === undefined) return "--:--";
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const questions = exam?.questions || [];
  const totalQuestions = questions.length;
  const safeQuestionIndex = Math.min(currentQuestionIndex, Math.max(0, totalQuestions - 1));
  const currentQuestion = questions[safeQuestionIndex] || null;

  useEffect(() => {
    if (totalQuestions === 0) {
      setCurrentQuestionIndex(0);
      return;
    }
    setCurrentQuestionIndex((prev) => Math.min(prev, totalQuestions - 1));
  }, [totalQuestions]);

  if (!exam) {
    return (
      <div style={loadingShellStyle}>
        <div style={loadingCardStyle}>Loading exam details...</div>
      </div>
    );
  }

  return (
    <div id="exam-root-container" style={mainContainerStyle}>
      {warningMsg && <div style={warningToastStyle}>Security Notice: {warningMsg}</div>}

      {(showModal || isLocked) && (
        <div style={modalOverlayStyle}>
          <div
            style={{
              ...modalBoxStyle,
              borderColor: isLocked || modalType === "VIOLATION" ? "#ef4444" : "#4f46e5",
            }}
          >
            {cameraStream && (
              <div style={modalVideoWrapperStyle}>
                <CameraPreview stream={cameraStream} videoRef={modalVideoRef} />
              </div>
            )}
            {isLocked ? (
              <>
                <h2 style={{ color: "#ef4444", marginBottom: 8 }}>Integrity Lock</h2>
                <p style={modalTextStyle}>Close the sidebar/overlay and return to full screen to continue your exam.</p>
                <button style={btnStyle} onClick={enterFullscreenAndStart}>Resume Exam</button>
              </>
            ) : modalType === "PERMISSIONS" ? (
              <>
                <h2 style={modalTitleStyle}>Allow Camera & Microphone</h2>
                <p style={modalTextStyle}>Before starting, we need camera and microphone access for live proctoring.</p>
                <button style={btnStyle} onClick={requestCamera}>Allow Access</button>
              </>
            ) : modalType === "START" ? (
              <>
                <h2 style={modalTitleStyle}>Ready To Start?</h2>
                <p style={modalTextStyle}>Keep your face visible and centered. Exam will start in full screen mode.</p>
                <button style={btnStyle} onClick={enterFullscreenAndStart}>Start Exam</button>
              </>
            ) : (
              <>
                <h2 style={{ color: "#ef4444", marginBottom: 8 }}>Security Alert</h2>
                <p style={modalTextStyle}>Violation detected. Remaining attempts: {Math.max(0, MAX_VIOLATIONS - violations)}</p>
                <button style={btnStyle} onClick={resumeExam}>I Understand</button>
              </>
            )}
          </div>
        </div>
      )}

      {started && isFullScreen && !finished && (
        <div style={{
          ...examLayoutStyle,
          filter: (showModal || isLocked) ? "blur(30px)" : "none",
          opacity: (showModal || isLocked) ? 0.3 : 1,
          pointerEvents: (showModal || isLocked) ? "none" : "auto",
          transition: "all 0.3s ease"
        }}>
          <div style={examMainPaneStyle}>
            <div style={examHeaderCardStyle}>
              <h1 style={{ margin: 0, fontSize: 34, color: "#111827" }}>{exam.title}</h1>
              <p style={{ ...timerStyle, margin: "10px 0 0" }}>Time Left: {formatTime(timeLeft)}</p>
            </div>

            <div style={statusRowStyle}>
              <div style={{ ...statusPillStyle, borderLeft: "4px solid #ef4444" }}>Violations: {violations}/{MAX_VIOLATIONS}</div>
              <div style={{ ...statusPillStyle, borderLeft: "4px solid #f59e0b" }}>Noise Warnings: {noiseWarnings}</div>
              <div style={{ ...statusPillStyle, borderLeft: "4px solid #f97316" }}>Head Warnings: {headPoseWarnings}</div>
              <div style={{ ...statusPillStyle, borderLeft: "4px solid #3b82f6" }}>Noise Level: {noiseLevel.toFixed(4)}</div>
              <div style={{ ...statusPillStyle, borderLeft: "4px solid #64748b" }}>Mic: {micStatus}</div>
            </div>

            {currentQuestion ? (
              <>
                <div style={questionCardStyle}>
                  <div style={questionMetaStyle}>
                    Question {safeQuestionIndex + 1} of {totalQuestions}
                  </div>
                  <div style={questionTitleStyle}>{currentQuestion.questionText}</div>
                  {currentQuestion.options.map((opt) => (
                    <label key={opt} style={optionLabelStyle}>
                      <input
                        type="radio"
                        checked={answers[currentQuestion._id] === opt}
                        onChange={() => setAnswers({ ...answers, [currentQuestion._id]: opt })}
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>

                <div style={questionNavCardStyle}>
                  <button
                    style={{ ...btnStyle, ...navBtnStyle, opacity: safeQuestionIndex === 0 ? 0.6 : 1 }}
                    onClick={() => setCurrentQuestionIndex((prev) => Math.max(prev - 1, 0))}
                    disabled={safeQuestionIndex === 0}
                  >
                    Previous
                  </button>

                  <div style={questionDotsWrapStyle}>
                    {questions.map((q, idx) => (
                      (() => {
                        const isActive = idx === safeQuestionIndex;
                        const isAnswered = answers[q._id] !== undefined && answers[q._id] !== null && answers[q._id] !== "";

                        let dotStyle = { ...questionDotStyle };
                        if (isAnswered) {
                          dotStyle = { ...dotStyle, ...questionDotAnsweredStyle };
                        }
                        if (isActive) {
                          dotStyle = {
                            ...dotStyle,
                            ...questionDotActiveStyle,
                            ...(isAnswered ? questionDotActiveAnsweredStyle : null),
                          };
                        }

                        return (
                      <button
                        key={q._id || idx}
                        style={dotStyle}
                        onClick={() => setCurrentQuestionIndex(idx)}
                        aria-label={`Go to question ${idx + 1}`}
                        title={`Question ${idx + 1}`}
                      >
                        {idx + 1}
                      </button>
                        );
                      })()
                    ))}
                  </div>

                  <button
                    style={{ ...btnStyle, ...navBtnStyle, opacity: safeQuestionIndex === totalQuestions - 1 ? 0.6 : 1 }}
                    onClick={() => setCurrentQuestionIndex((prev) => Math.min(prev + 1, totalQuestions - 1))}
                    disabled={safeQuestionIndex === totalQuestions - 1}
                  >
                    Next
                  </button>
                </div>
              </>
            ) : null}

            <button style={submitBtnStyle} onClick={() => submitExam(false)}>Submit Exam</button>
          </div>

          <div style={examSidePaneStyle}>
            <div style={webcamContainerStyle}>
              <div style={proctorTitleStyle}>Live Proctoring</div>
              <CameraPreview stream={cameraStream} videoRef={webcamVideoRef} />
              <div style={liveFeedBadgeStyle}>Active Feed</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// STYLES
const loadingShellStyle = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  background: "linear-gradient(180deg, #f4f6fb 0%, #e8edf7 100%)",
};
const loadingCardStyle = {
  padding: "22px 28px",
  borderRadius: 16,
  background: "#fff",
  color: "#111827",
  fontWeight: 700,
  boxShadow: "0 18px 35px rgba(15, 23, 42, 0.15)",
};
const mainContainerStyle = {
  minHeight: "100vh",
  padding: "24px",
  background: "linear-gradient(180deg, #f4f6fb 0%, #e8edf7 100%)",
  color: "#111827",
  userSelect: "none",
};
const examLayoutStyle = { display: "flex", gap: "28px", maxWidth: 1300, margin: "0 auto" };
const examMainPaneStyle = { flex: 1 };
const examSidePaneStyle = { width: 320 };
const examHeaderCardStyle = {
  backgroundColor: "#fff",
  borderRadius: 18,
  padding: "22px 24px",
  marginBottom: 16,
  boxShadow: "0 14px 28px rgba(15, 23, 42, 0.1)",
  border: "1px solid #dbe3f1",
};
const statusRowStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
  marginBottom: 16,
};
const statusPillStyle = {
  background: "#ffffff",
  borderRadius: 12,
  padding: "10px 12px",
  fontWeight: 700,
  fontSize: 13,
  color: "#1f2937",
  boxShadow: "0 6px 18px rgba(15, 23, 42, 0.08)",
};
const modalOverlayStyle = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(16, 24, 40, 0.55)",
  backdropFilter: "blur(6px)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 2147483647,
};
const modalBoxStyle = {
  backgroundColor: "#fff",
  padding: "30px",
  borderRadius: 18,
  textAlign: "center",
  minWidth: 420,
  maxWidth: 520,
  border: "2px solid #4f46e5",
  boxShadow: "0 24px 46px rgba(15, 23, 42, 0.35)",
};
const modalVideoWrapperStyle = {
  marginBottom: 18,
  width: 260,
  marginLeft: "auto",
  marginRight: "auto",
  borderRadius: 14,
  padding: 8,
  background: "#0f172a",
  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
};
const modalTitleStyle = { margin: "2px 0 8px", color: "#111827" };
const modalTextStyle = { color: "#4b5563", lineHeight: 1.5, margin: "0 0 12px" };
const btnStyle = {
  padding: "12px 24px",
  cursor: "pointer",
  background: "linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)",
  color: "#fff",
  border: "none",
  borderRadius: 12,
  fontWeight: 700,
  marginTop: "8px",
  boxShadow: "0 10px 20px rgba(79, 70, 229, 0.35)",
};
const submitBtnStyle = {
  ...btnStyle,
  background: "linear-gradient(135deg, #ef4444 0%, #e11d48 100%)",
  boxShadow: "0 10px 20px rgba(225, 29, 72, 0.35)",
  marginTop: 4,
};
const questionCardStyle = {
  padding: "20px",
  borderRadius: "14px",
  marginBottom: "16px",
  border: "1px solid #dbe3f1",
  backgroundColor: "#fff",
  boxShadow: "0 12px 24px rgba(15, 23, 42, 0.08)",
};
const questionMetaStyle = {
  display: "inline-block",
  background: "#eef2ff",
  color: "#4338ca",
  fontWeight: 800,
  fontSize: 12,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  borderRadius: 999,
  padding: "6px 10px",
  marginBottom: 12,
};
const questionTitleStyle = { color: "#111827", fontSize: 20, marginBottom: 8, lineHeight: 1.45 };
const optionLabelStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  margin: "10px 0",
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #e4e9f4",
  color: "#1f2937",
  background: "#f9fbff",
};
const questionNavCardStyle = {
  display: "grid",
  gridTemplateColumns: "auto 1fr auto",
  gap: 14,
  alignItems: "center",
  background: "#fff",
  borderRadius: 14,
  padding: "14px 16px",
  marginBottom: 12,
  border: "1px solid #dbe3f1",
  boxShadow: "0 10px 22px rgba(15, 23, 42, 0.08)",
};
const navBtnStyle = {
  marginTop: 0,
  minWidth: 110,
  padding: "10px 16px",
};
const questionDotsWrapStyle = {
  display: "flex",
  gap: 8,
  overflowX: "auto",
  padding: "2px 2px 6px",
};
const questionDotStyle = {
  minWidth: 34,
  height: 34,
  borderRadius: 999,
  border: "1px solid #d5ddf0",
  background: "#f8fafc",
  color: "#475569",
  fontWeight: 700,
  cursor: "pointer",
};
const questionDotAnsweredStyle = {
  background: "#dcfce7",
  color: "#166534",
  border: "1px solid #4ade80",
};
const questionDotActiveStyle = {
  background: "#4f46e5",
  color: "#fff",
  border: "1px solid #4338ca",
  boxShadow: "0 8px 16px rgba(79, 70, 229, 0.25)",
};
const questionDotActiveAnsweredStyle = {
  boxShadow: "0 0 0 2px #22c55e, 0 8px 16px rgba(79, 70, 229, 0.25)",
};
const webcamContainerStyle = {
  position: "sticky",
  top: "18px",
  border: "1px solid #dbe3f1",
  borderRadius: "16px",
  padding: "12px",
  backgroundColor: "#fff",
  boxShadow: "0 14px 28px rgba(15, 23, 42, 0.1)",
};
const proctorTitleStyle = { fontWeight: 800, color: "#4338ca", marginBottom: 10, fontSize: 14, letterSpacing: 0.5 };
const liveFeedBadgeStyle = {
  textAlign: "center",
  fontSize: "12px",
  marginTop: "10px",
  color: "#065f46",
  fontWeight: 700,
  background: "#dcfce7",
  borderRadius: 999,
  padding: "6px 8px",
};
const warningToastStyle = {
  position: "fixed",
  top: "18px",
  left: "50%",
  transform: "translateX(-50%)",
  backgroundColor: "#fff7ed",
  color: "#9a3412",
  border: "1px solid #fdba74",
  padding: "13px 22px",
  borderRadius: "999px",
  fontWeight: "bold",
  zIndex: 2147483647,
  boxShadow: "0 10px 20px rgba(154, 52, 18, 0.18)",
};
const timerStyle = { color: "#4f46e5", fontWeight: 800, fontSize: "18px" };






// import { useEffect, useState, useCallback, useRef } from "react";
// import { useParams, useNavigate } from "react-router-dom";
// import api from "../api/api";
// import { initFaceDetector, detectFaces } from "../ai/faceProctor";
// // --- REUSEABLE CAMERA COMPONENT ---
// // const CameraPreview = ({ stream, muted = true, style = {} }) => {
// //   const videoRef = useRef(null); // Commented: internal ref no longer used
// //   useEffect(() => {
// //     if (videoRef.current && stream) videoRef.current.srcObject = stream;
// //   }, [stream]);

// //   return (
// //     <video
// //       ref={videoRef}
// //       autoPlay
// //       muted={muted}
// //       playsInline
// //       style={{
// //         width: "100%", borderRadius: "8px", transform: "scaleX(-1)",
// //         backgroundColor: "#000", ...style
// //       }}
// //     />
// //   );
// // };

// const CameraPreview = ({ stream, videoRef }) => {
//   useEffect(() => {
//     if (videoRef.current && stream) {
//       videoRef.current.srcObject = stream;
//     }
//   }, [stream]);

//   return (
//     <video
//       ref={videoRef}
//       autoPlay
//       muted
//       playsInline
//       style={{
//         width: "100%",
//         borderRadius: "8px",
//         transform: "scaleX(-1)",
//         backgroundColor: "#000"
//       }}
//     />
//   );
// };

// export default function ExamView() {
//   const { examId } = useParams();
//   const navigate = useNavigate();

//   // CORE STATES
//   const [exam, setExam] = useState(null);
//   const [started, setStarted] = useState(false);
//   const [finished, setFinished] = useState(false);
//   const [submitting, setSubmitting] = useState(false);
//   const [answers, setAnswers] = useState({});

//   // PROCTORING STATES
//   const [violations, setViolations] = useState(0);
//   const [isFullScreen, setIsFullScreen] = useState(false);
//   const [cameraStream, setCameraStream] = useState(null);
//   const [showModal, setShowModal] = useState(true);
//   const [modalType, setModalType] = useState("PERMISSIONS"); 
//   const [warningMsg, setWarningMsg] = useState(""); 
//   const [isLocked, setIsLocked] = useState(false); // New: Persistently hides content if sidebar is open

//   const MAX_VIOLATIONS = 3;
//   const proctoringPaused = useRef(true);
//   const cooldown = useRef(false);
//   const faceDetectorRef = useRef(null); 
//   const noFaceStartRef = useRef(null);
//   const webcamVideoRef = useRef(null);
//   const aiIntervalRef = useRef(null);

//   const resetAIState = () => {
//     console.log("RESETTING AI STATE");

//     noFaceStartRef.current = null;
//     proctoringPaused.current = false;
//   };

//   const startAIProctoring = async () => {
//     console.log("AI PROCTORING ENABLED");

//     // 🔥 HARD RESET
//     resetAIState();

//     if (aiIntervalRef.current) {
//       clearInterval(aiIntervalRef.current);
//     }

//     aiIntervalRef.current = setInterval(async () => {
//       if (proctoringPaused.current) return;

//       const faces = await detectFaces(webcamVideoRef.current);
//       console.log("AI FACE COUNT:", faces.length);

//       if (faces.length === 0) {
//         if (!noFaceStartRef.current) {
//           noFaceStartRef.current = Date.now();
//         }

//         const noFaceSeconds =
//           (Date.now() - noFaceStartRef.current) / 1000;

//         console.log("NO FACE SECONDS:", noFaceSeconds);

//         if (noFaceSeconds >= 5) {
//           handleViolation("NO_FACE_DETECTED");
//         }
//       } else {
//         // 🔥 IMPORTANT RESET WHEN FACE RETURNS
//         noFaceStartRef.current = null;
//       }
//     }, 1000);
//   };

//   useEffect(() => {
//     api.get(`/student/exams/${examId}`).then((res) => setExam(res.data));
//   }, [examId]);

//   const requestCamera = async () => {
//     try {
//       const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
//       setCameraStream(stream);
//       setModalType("START"); 
//     } catch (err) {
//       alert("Webcam access is required for proctoring.");
//     }
//   };

//   const enterFullscreenAndStart = async () => {
//     try {
//       // Logic from Vibe: Use root element for maximum extension blocking coverage
//       const element = document.documentElement;
//       if (!document.fullscreenElement) {
//         if (element.requestFullscreen) await element.requestFullscreen();
//       }
      
//       await initFaceDetector();
//       faceDetectorRef.current = true;
      
//       if (!started) {
//         await api.post(`/student/exams/${examId}/start`);
//         setStarted(true);
//       }
//       setIsFullScreen(true);
//       setShowModal(false);
//       setIsLocked(false); // Unlock content
      
//       setTimeout(() => {
//         startAIProctoring();
//       }, 1500);
//     } catch (err) {
//       alert("Fullscreen is mandatory to block sidebars/extensions.");
//     }
//   };

//   const resumeExam = () => {
//     setShowModal(false);

//     setTimeout(() => {
//       startAIProctoring(); // 🔥 fresh start
//     }, 800);
//   };

//   // ---------------- MODIFIED VIOLATION LOGIC ----------------
//   const handleViolation = useCallback((reason) => {
//     if (finished || submitting || proctoringPaused.current || cooldown.current) return;

//     cooldown.current = true;
//     setViolations((prev) => {
//       const newCount = prev + 1;
//       try {
//         api.post(`/student/exams/${examId}/violation`, {
//           reason,
//           count: newCount
//         });
//       } catch (err) {
//         console.error("Violation API failed (ignored):", err.message);
//       }

//       if (newCount >= MAX_VIOLATIONS) {
//         submitExam(true);
//       } else {
//         proctoringPaused.current = true;

//         if (aiIntervalRef.current) {
//           clearInterval(aiIntervalRef.current);
//           aiIntervalRef.current = null;
//         }

//         noFaceStartRef.current = null; // 🔥 force reset
//         setModalType("VIOLATION");
//         setShowModal(true);
//       }
//       return newCount;
//     });
    
//     setTimeout(() => { cooldown.current = false; }, 2000);
//   }, [examId, finished, submitting]);



//   useEffect(() => {
//     if (!started || finished) return;

//     const observer = new MutationObserver((mutations) => {
//       for (const mutation of mutations) {
//         if (mutation.type === 'childList') {
//           mutation.addedNodes.forEach(node => {
//             // Detect if an external sidebar/div is injected outside our container
//             if (node.nodeName === 'IFRAME' || (node.nodeType === 1 && !node.closest('#exam-root-container'))) {
//                handleViolation("Extension Overlay/Sidebar Detected");
//             }
//           });
//         }
//       }
//     });

//     observer.observe(document.body, { childList: true, subtree: true });
//     return () => observer.disconnect();
//   }, [started, finished, handleViolation]);

//   // ---------------- NEW: VIEWPORT INTEGRITY HEARTBEAT ----------------
//   useEffect(() => {
//     if (!started || finished) return;

//     const checkIntegrity = () => {
//       // If window width is significantly less than screen width, a sidebar is open
//       const diff = window.screen.width - window.innerWidth;
//       if (document.fullscreenElement && diff > 100) {
//         setIsLocked(true); // Persistently hide exam content
//         handleViolation("Side-panel/Sidebar extension detected");
//       } else if (document.fullscreenElement) {
//         setIsLocked(false);
//       }
//     };

//     const interval = setInterval(checkIntegrity, 2000);
//     return () => clearInterval(interval);
//   }, [started, finished, handleViolation]);

//   // ---------------- KEYBOARD LISTENERS (CAPTURE PHASE) ----------------
//   useEffect(() => {
//     if (!started || finished) return;

//     const handleKeyDownCapture = (e) => {
//       if (e.ctrlKey || e.altKey || e.metaKey) {
//         setWarningMsg("WARNING: Keyboard shortcuts are prohibited!");
//         setTimeout(() => setWarningMsg(""), 3000);
//       }
      
//       const forbidden = ["j", "u", "s", "p", "i", "f", "g"];
//       if (e.ctrlKey && forbidden.includes(e.key.toLowerCase())) {
//         e.preventDefault();
//         e.stopPropagation();
//         handleViolation(`Forbidden Shortcut: Ctrl+${e.key}`);
//       }
      
//       if (e.key === "F12") {
//         e.preventDefault();
//         e.stopPropagation();
//         handleViolation("DevTools attempt");
//       }
//     };

//     const handleResize = () => {
//       if (document.fullscreenElement && !proctoringPaused.current) {
//         handleViolation("Screen Resizing Attempt");
//       }
//     };

//     // Use 'true' for capture phase to beat extensions
//     window.addEventListener("keydown", handleKeyDownCapture, true);
//     window.addEventListener("resize", handleResize);
//     return () => {
//       window.removeEventListener("keydown", handleKeyDownCapture, true);
//       window.removeEventListener("resize", handleResize);
//     };
//   }, [started, finished, handleViolation]);

//   // ---------------- FOCUS & BROWSER LISTENERS ----------------
//   useEffect(() => {
//     if (!started || finished) return;

//     const onFullscreenChange = () => {
//       if (!document.fullscreenElement && !proctoringPaused.current) {
//         setIsFullScreen(false);
//         handleViolation("Exited Fullscreen Mode");
//       }
//     };

//     const onVisibilityChange = () => {
//       if (document.hidden) handleViolation("Tab / Window Switch Detected");
//     };

//     const onBlur = () => {
//       // Monica AI takes focus when clicked, triggering this immediately
//       handleViolation("Focus Loss (Extension/Popup Active)");
//     };

//     document.addEventListener("fullscreenchange", onFullscreenChange);
//     document.addEventListener("visibilitychange", onVisibilityChange);
//     window.addEventListener("blur", onBlur);

//     return () => {
//       document.removeEventListener("fullscreenchange", onFullscreenChange);
//       document.removeEventListener("visibilitychange", onVisibilityChange);
//       window.removeEventListener("blur", onBlur);
//     };
//   }, [started, finished, handleViolation]);

//   // ---------------- SELECTION & DRAG BLOCKING ----------------
//   useEffect(() => {
//     const block = (e) => {
//       e.preventDefault();
//       return false;
//     };

//     document.addEventListener("copy", block);
//     document.addEventListener("cut", block);
//     document.addEventListener("paste", block);
//     document.addEventListener("contextmenu", block);
//     document.addEventListener("selectstart", block);
//     document.addEventListener("dragstart", block);

//     return () => {
//       document.removeEventListener("copy", block);
//       document.removeEventListener("cut", block);
//       document.removeEventListener("paste", block);
//       document.removeEventListener("contextmenu", block);
//       document.removeEventListener("selectstart", block);
//       document.removeEventListener("dragstart", block);
//     };
//   }, []);

//   const submitExam = useCallback(async (auto = false) => {
//     if (submitting || finished) return;
//     setSubmitting(true);
//     setFinished(true);
//     proctoringPaused.current = true;

//     try {
//       const payload = Object.entries(answers).map(([qid, ans]) => ({ questionId: qid, answer: ans }));
//       await api.post(`/student/exams/${examId}/submit`, { answers: payload, autoSubmit: auto });
//       alert(auto ? "Exam auto-submitted due to violations." : "Exam submitted successfully.");
//     } finally {
//       if (cameraStream) cameraStream.getTracks().forEach(t => t.stop());
//       if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
//       navigate("/student");
//     }
//   }, [answers, examId, finished, navigate, submitting, cameraStream]);

//   if (!exam) return <div style={{color: 'white', textAlign: 'center', marginTop: '20%'}}>Loading Exam...</div>;

//   return (
//     <div id="exam-root-container" style={mainContainerStyle}>
      
//       {/* Non-violation Warning Pop-up */}
//       {warningMsg && <div style={warningToastStyle}>{warningMsg}</div>}

//       {/* ---------------- MODAL / LOCK SCREEN ---------------- */}
//       {(showModal || isLocked) && (
//         <div style={modalOverlayStyle}>
//           <div style={modalBoxStyle}>
//             {cameraStream && (
//               <div style={{ marginBottom: "20px", width: "240px", margin: "0 auto 20px" }}>
//                 <CameraPreview stream={cameraStream} videoRef={webcamVideoRef} />
//               </div>
//             )}

//             {isLocked ? (
//               <>
//                 <h2 style={{ color: "red" }}>INTEGRITY LOCK</h2>
//                 <p style={{color: '#333'}}>A sidebar extension (like Monica) is open. <br/> Close it and return to fullscreen to continue.</p>
//                 <button style={btnStyle} onClick={enterFullscreenAndStart}>Check & Resume</button>
//               </>
//             ) : modalType === "PERMISSIONS" ? (
//               <>
//                 <h2 style={{color: '#333'}}>Step 1: Camera Access</h2>
//                 <button style={btnStyle} onClick={requestCamera}>Allow Camera</button>
//               </>
//             ) : modalType === "START" ? (
//               <>
//                 <h2 style={{color: '#333'}}>Step 2: Start Exam</h2>
//                 <button style={btnStyle} onClick={enterFullscreenAndStart}>Start Now</button>
//               </>
//             ) : (
//               <>
//                 <h2 style={{ color: "red" }}>Violation Detected!</h2>
//                 <p style={{color: '#333', fontWeight: 'bold'}}>Violations: {violations} / {MAX_VIOLATIONS}</p>
//                 <button style={btnStyle} onClick={resumeExam}>Return to Exam</button>
//               </>
//             )}
//           </div>
//         </div>
//       )}

//       {/* ---------------- EXAM UI (BLURS ON VIOLATION) ---------------- */}
//       {started && isFullScreen && !finished && (
//         <div style={{ 
//           display: "flex", 
//           gap: "30px",
//           filter: (showModal || isLocked) ? "blur(30px)" : "none",
//           opacity: (showModal || isLocked) ? 0 : 1,
//           pointerEvents: (showModal || isLocked) ? "none" : "auto",
//           transition: "all 0.3s ease"
//         }}>
//           <div style={{ flex: 1 }}>
//             <h1>{exam.title}</h1>
//             <p style={{ color: "#ff4d4d", fontWeight: "bold", fontSize: '1.2rem' }}>
//               Violations: {violations}/{MAX_VIOLATIONS}
//             </p>

//             {exam.questions.map((q, idx) => (
//               <div key={q._id} style={questionCardStyle}>
//                 <div style={{ fontSize: '1.1rem', marginBottom: '15px' }}>
//                   <strong>Q{idx + 1}:</strong> {q.questionText}
//                 </div>
//                 {q.options.map((opt) => (
//                   <label key={opt} style={{ display: "block", margin: "10px 0", cursor: "pointer" }}>
//                     <input
//                       type="radio"
//                       name={q._id}
//                       checked={answers[q._id] === opt}
//                       onChange={() => setAnswers({ ...answers, [q._id]: opt })}
//                     /> {opt}
//                   </label>
//                 ))}
//               </div>
//             ))}

//             <button style={{ ...btnStyle, backgroundColor: "#28a745" }} onClick={() => submitExam(false)}>
//               Submit Exam
//             </button>
//           </div>

//           <div style={{ width: "280px" }}>
//             <div style={webcamContainerStyle}>
//               <CameraPreview stream={cameraStream} videoRef={webcamVideoRef} />
//               <div style={{ textAlign: "center", fontSize: "12px", marginTop: "8px" }}>Live Feed Active</div>
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }

// // ---------------- STYLES (HARDENED Z-INDEX) ----------------
// const mainContainerStyle = { 
//   minHeight: "100vh", padding: "20px", backgroundColor: "#121212", color: "white",
//   userSelect: "none", WebkitUserSelect: "none", MozUserSelect: "none", msUserSelect: "none"
// };
// const modalOverlayStyle = { position: "fixed", inset: 0, backgroundColor: "#000", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 2147483647 };
// const modalBoxStyle = { backgroundColor: "#fff", padding: "40px", borderRadius: "15px", textAlign: "center", minWidth: "400px" };
// const btnStyle = { padding: "14px 28px", cursor: "pointer", backgroundColor: "#007bff", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "bold", marginTop: '10px' };
// const questionCardStyle = { padding: "20px", borderRadius: "10px", marginBottom: "20px", border: "1px solid #333", backgroundColor: "#1e1e1e" };
// const webcamContainerStyle = { position: "sticky", top: "20px", border: "2px solid #444", borderRadius: "15px", padding: "10px", backgroundColor: "#000" };
// const warningToastStyle = { position: "fixed", top: "20px", left: "50%", transform: "translateX(-50%)", backgroundColor: "#ffc107", color: "#000", padding: "15px 30px", borderRadius: "50px", fontWeight: "bold", zIndex: 2147483647 };


// // ---------------- IGNORE BELOW THIS LINE (OLD CODE)----------------

// // import { useEffect, useState, useCallback, useRef } from "react";
// // import { useParams, useNavigate } from "react-router-dom";
// // import api from "../api/api";

// // // --- REUSEABLE CAMERA COMPONENT ---
// // const CameraPreview = ({ stream, muted = true, style = {} }) => {
// //   const videoRef = useRef(null);
// //   useEffect(() => {
// //     if (videoRef.current && stream) videoRef.current.srcObject = stream;
// //   }, [stream]);

// //   return (
// //     <video
// //       ref={videoRef}
// //       autoPlay
// //       muted={muted}
// //       playsInline
// //       style={{
// //         width: "100%", borderRadius: "8px", transform: "scaleX(-1)",
// //         backgroundColor: "#000", ...style
// //       }}
// //     />
// //   );
// // };

// // export default function ExamView() {
// //   const { examId } = useParams();
// //   const navigate = useNavigate();

// //   // CORE STATES
// //   const [exam, setExam] = useState(null);
// //   const [started, setStarted] = useState(false);
// //   const [finished, setFinished] = useState(false);
// //   const [submitting, setSubmitting] = useState(false);
// //   const [answers, setAnswers] = useState({});

// //   // PROCTORING STATES
// //   const [violations, setViolations] = useState(0);
// //   const [isFullScreen, setIsFullScreen] = useState(false);
// //   const [cameraStream, setCameraStream] = useState(null);
// //   const [showModal, setShowModal] = useState(true);
// //   const [modalType, setModalType] = useState("PERMISSIONS"); 
// //   const [warningMsg, setWarningMsg] = useState(""); 

// //   const MAX_VIOLATIONS = 3;
// //   const proctoringPaused = useRef(true);
// //   const cooldown = useRef(false);

// //   useEffect(() => {
// //     api.get(`/student/exams/${examId}`).then((res) => setExam(res.data));
// //   }, [examId]);

// //   const requestCamera = async () => {
// //     try {
// //       const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
// //       setCameraStream(stream);
// //       setModalType("START"); 
// //     } catch (err) {
// //       alert("Webcam access is required for proctoring.");
// //     }
// //   };

// //   const enterFullscreenAndStart = async () => {
// //     try {
// //       if (!document.fullscreenElement) {
// //         await document.documentElement.requestFullscreen();
// //       }
// //       if (!started) {
// //         await api.post(`/student/exams/${examId}/start`);
// //         setStarted(true);
// //       }
// //       setIsFullScreen(true);
// //       setShowModal(false);
      
// //       // Safety delay before enabling proctoring listeners
// //       setTimeout(() => { proctoringPaused.current = false; }, 1200);
// //     } catch (err) {
// //       alert("Fullscreen is mandatory for this exam.");
// //     }
// //   };

// //   // ---------------- MODIFIED VIOLATION LOGIC ----------------
// //   const handleViolation = useCallback((reason) => {
// //     if (finished || submitting || proctoringPaused.current || cooldown.current) return;

// //     cooldown.current = true;
// //     setViolations((prev) => {
// //       const newCount = prev + 1;
// //       api.post(`/student/exams/${examId}/violation`, { reason, count: newCount });

// //       if (newCount >= MAX_VIOLATIONS) {
// //         submitExam(true);
// //       } else {
// //         proctoringPaused.current = true; // Stop listening while modal is up
// //         setModalType("VIOLATION");
// //         setShowModal(true);
// //       }
// //       return newCount;
// //     });
    
// //     // Cooldown prevents multiple triggers for the same event
// //     setTimeout(() => { cooldown.current = false; }, 2000);
// //   }, [examId, finished, submitting]);

// //   // ---------------- NEW: KEYBOARD & RESIZE LISTENERS ----------------
// //   useEffect(() => {
// //     if (!started || finished) return;

// //     // Detect Keyboard Shortcut Combos (Warning Only)
// //     const handleKeyDown = (e) => {
// //       if (e.ctrlKey || e.altKey || e.metaKey || (e.shiftKey && e.keyCode !== 16)) {
// //         // We don't preventDefault here to avoid breaking system accessibility, 
// //         // but we show the warning as requested.
// //         setWarningMsg("WARNING: Keyboard shortcuts are prohibited!");
// //         setTimeout(() => setWarningMsg(""), 3000);
// //       }
// //       // Detect suspicious shortcuts (log → auto-submit)
// //       if (
// //         e.ctrlKey &&
// //         ["j", "u", "s", "p", "shift", "i"].includes(e.key.toLowerCase())
// //       ) {
// //         handleViolation("Suspicious keyboard shortcut");
// //       }
// //     };

// //     // Detect Screen Resizing (Violation)
// //     const handleResize = () => {
// //       if (document.fullscreenElement && !proctoringPaused.current) {
// //         handleViolation("Screen Resizing / Split-screen Attempt");
// //       }
// //     };

// //     window.addEventListener("keydown", handleKeyDown);
// //     window.addEventListener("resize", handleResize);
// //     return () => {
// //       window.removeEventListener("keydown", handleKeyDown);
// //       window.removeEventListener("resize", handleResize);
// //     };
// //   }, [started, finished, handleViolation]);

// //   // ---------------- EXISTING BROWSER LISTENERS (Modified) ----------------
// //   useEffect(() => {
// //     if (!started || finished) return;

// //     const onFullscreenChange = () => {
// //       if (!document.fullscreenElement && !proctoringPaused.current) {
// //         setIsFullScreen(false);
// //         handleViolation("Exited Fullscreen Mode");
// //       }
// //     };

// //     const onVisibilityChange = () => {
// //       if (document.hidden) handleViolation("Tab / Window Switch Detected");
// //     };

// //     // This catches the "Pop-ups" from your screenshot. 
// //     // If an external app appears, the browser window loses "Focus".
// //     const onBlur = () => {
// //       handleViolation("On-screen Pop-up or Focus Loss Detected");
// //     };

// //     document.addEventListener("fullscreenchange", onFullscreenChange);
// //     document.addEventListener("visibilitychange", onVisibilityChange);
// //     window.addEventListener("blur", onBlur);

// //     return () => {
// //       document.removeEventListener("fullscreenchange", onFullscreenChange);
// //       document.removeEventListener("visibilitychange", onVisibilityChange);
// //       window.removeEventListener("blur", onBlur);
// //     };
// //   }, [started, finished, handleViolation]);

// //   // Block copy, cut, paste, context menu, select start
// //   useEffect(() => {
// //     const block = (e) => {
// //       e.preventDefault();
// //       return false;
// //     };

// //     document.addEventListener("copy", block);
// //     document.addEventListener("cut", block);
// //     document.addEventListener("paste", block);
// //     document.addEventListener("contextmenu", block);
// //     document.addEventListener("selectstart", block);

// //     return () => {
// //       document.removeEventListener("copy", block);
// //       document.removeEventListener("cut", block);
// //       document.removeEventListener("paste", block);
// //       document.removeEventListener("contextmenu", block);
// //       document.removeEventListener("selectstart", block);
// //     };
// //   }, []);

// //   const submitExam = useCallback(async (auto = false) => {
// //     if (submitting || finished) return;
// //     setSubmitting(true);
// //     setFinished(true);
// //     proctoringPaused.current = true;

// //     try {
// //       const payload = Object.entries(answers).map(([qid, ans]) => ({ questionId: qid, answer: ans }));
// //       await api.post(`/student/exams/${examId}/submit`, { answers: payload, autoSubmit: auto });
// //       alert(auto ? "Exam auto-submitted due to violations." : "Exam submitted successfully.");
// //     } finally {
// //       if (cameraStream) cameraStream.getTracks().forEach(t => t.stop());
// //       if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
// //       navigate("/student");
// //     }
// //   }, [answers, examId, finished, navigate, submitting, cameraStream]);

// //   if (!exam) return <div style={{color: 'white', textAlign: 'center', marginTop: '20%'}}>Loading Exam...</div>;

// //   return (
// //     <div style={{ minHeight: "100vh", padding: "20px", backgroundColor: "#121212", color: "white" }}>
      
// //       {/* Non-violation Warning Pop-up */}
// //       {warningMsg && <div style={warningToastStyle}>{warningMsg}</div>}

// //       {/* ---------------- MODAL WITH WEBCAM ---------------- */}
// //       {showModal && (
// //         <div style={modalOverlayStyle}>
// //           <div style={modalBoxStyle}>
// //             {cameraStream && (
// //               <div style={{ marginBottom: "20px", width: "240px", margin: "0 auto 20px" }}>
// //                 <CameraPreview stream={cameraStream} />
// //                 <p style={{ fontSize: "12px", color: "#666", marginTop: "5px" }}>Live Verification Feed</p>
// //               </div>
// //             )}

// //             {modalType === "PERMISSIONS" ? (
// //               <>
// //                 <h2 style={{color: '#333'}}>Step 1: Camera Access</h2>
// //                 <p style={{color: '#666'}}>Please enable your webcam to proceed.</p>
// //                 <button style={btnStyle} onClick={requestCamera}>Allow Camera</button>
// //               </>
// //             ) : modalType === "START" ? (
// //               <>
// //                 <h2 style={{color: '#333'}}>Step 2: Start Exam</h2>
// //                 <p style={{color: '#666'}}>Click below to enter secure fullscreen mode.</p>
// //                 <button style={btnStyle} onClick={enterFullscreenAndStart}>Start Now</button>
// //               </>
// //             ) : (
// //               <>
// //                 <h2 style={{ color: "red" }}>Violation Detected!</h2>
// //                 <p style={{color: '#333'}}>Pop-ups, resizing, and window switching are prohibited.</p>
// //                 <p style={{color: '#333', fontWeight: 'bold'}}>Violations: {violations} / {MAX_VIOLATIONS}</p>
// //                 <button style={btnStyle} onClick={enterFullscreenAndStart}>Return to Exam</button>
// //               </>
// //             )}
// //           </div>
// //         </div>
// //       )}

// //       {/* ---------------- EXAM UI ---------------- */}
// //       {started && isFullScreen && !finished && (
// //         <div style={{ display: "flex", gap: "30px" }}>
// //           <div style={{ flex: 1 }}>
// //             <h1>{exam.title}</h1>
// //             <p style={{ color: "#ff4d4d", fontWeight: "bold", fontSize: '1.2rem' }}>
// //               Violations: {violations}/{MAX_VIOLATIONS}
// //             </p>

// //             {exam.questions.map((q, idx) => (
// //               <div key={q._id} style={questionCardStyle}>
// //                 <div
// //                   style={{
// //                     userSelect: "none",
// //                     WebkitUserSelect: "none",
// //                     MozUserSelect: "none",
// //                     pointerEvents: "auto",
// //                     fontSize: '1.1rem'
// //                   }}
// //                 >
// //                   <strong>Q{idx + 1}:</strong> {q.questionText}
// //                 </div>
// //                 {q.options.map((opt) => (
// //                   <label key={opt} style={{ display: "block", margin: "10px 0", cursor: "pointer" }}>
// //                     <input
// //                       type="radio"
// //                       name={q._id}
// //                       checked={answers[q._id] === opt}
// //                       onChange={() => setAnswers({ ...answers, [q._id]: opt })}
// //                     /> {opt}
// //                   </label>
// //                 ))}
// //               </div>
// //             ))}

// //             <button style={{ ...btnStyle, backgroundColor: "#28a745" }} onClick={() => submitExam(false)}>
// //               Submit Exam
// //             </button>
// //           </div>

// //           <div style={{ width: "280px" }}>
// //             <div style={webcamContainerStyle}>
// //               <CameraPreview stream={cameraStream} />
// //               <div style={{ textAlign: "center", fontSize: "12px", marginTop: "8px" }}>Live Feed Active</div>
// //             </div>
// //           </div>
// //         </div>
// //       )}
// //     </div>
// //   );
// // }

// // // ---------------- STYLES ----------------
// // const modalOverlayStyle = { position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.95)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 9999 };
// // const modalBoxStyle = { backgroundColor: "#fff", padding: "40px", borderRadius: "15px", textAlign: "center", minWidth: "400px", boxShadow: '0 0 20px rgba(255,255,255,0.1)' };
// // const btnStyle = { padding: "14px 28px", cursor: "pointer", backgroundColor: "#007bff", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: '1rem', marginTop: '10px' };
// // const questionCardStyle = { padding: "20px", borderRadius: "10px", marginBottom: "20px", border: "1px solid #333", backgroundColor: "#1e1e1e" };
// // const webcamContainerStyle = { position: "sticky", top: "20px", border: "2px solid #444", borderRadius: "15px", padding: "10px", backgroundColor: "#000" };
// // const warningToastStyle = { position: "fixed", top: "20px", left: "50%", transform: "translateX(-50%)", backgroundColor: "#ffc107", color: "#000", padding: "15px 30px", borderRadius: "50px", fontWeight: "bold", zIndex: 10000, boxShadow: "0 4px 15px rgba(0,0,0,0.3)" };

