import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api/api";
import { loadProctorModels } from "../proctoring/models";
import { startProctoringEngine } from "../proctoring/engine";
import { EVENT_TYPES } from "../proctoring/rules";
import { showToast } from "../utils/toast";

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
        backgroundColor: "#000",
      }}
    />
  );
};

export default function CodingExamView() {
  const { examId } = useParams();
  const navigate = useNavigate();

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

  const [exam, setExam] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("python");
  const [output, setOutput] = useState("");
  const [loadingRun, setLoadingRun] = useState(false);
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [, setTotalScore] = useState(0);
  const [submittedQuestions, setSubmittedQuestions] = useState(new Set());
  const [submitResult, setSubmitResult] = useState(null);
  const [toastMessage, setToastMessage] = useState("");
  const [timeLeft, setTimeLeft] = useState(null);

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
  const proctoringPaused = useRef(true);
  const cooldown = useRef(false);
  const proctoringSessionRef = useRef(null);
  const startedRef = useRef(false);
  const finishedRef = useRef(false);
  const webcamVideoRef = useRef(null);
  const modalVideoRef = useRef(null);

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

  const snapshotTimerRef = useRef(null);
  const snapshotCountRef = useRef(0);

  const resetAIState = () => {
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
      const next = prev + 1;
      setWarningMsg(`Please stay in a calm environment. Noise warning ${next}.`);
      setTimeout(() => setWarningMsg(""), 3500);
      return next;
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

      const signalLevel = Math.max(rms, freqAvg * 0.35);

      setNoiseLevel(signalLevel);
      const baseline = Math.max(NOISE_MIN_RMS, noiseBaselineRef.current);

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
      console.log("Snapshot upload skipped", error?.message || error);
    }
  }, [examId, finished, submitting]);

  const handleFinishExam = useCallback(async (auto = false) => {
    if (submitting || finished) return;
    setSubmitting(true);
    setFinished(true);
    proctoringPaused.current = true;

    proctoringSessionRef.current?.stop();
    proctoringSessionRef.current = null;

    try {
      await api.post(`/student/exams/${examId}/final-submit`, { autoSubmit: auto });
      showToast("success", auto ? "Exam auto-submitted." : "Exam submitted successfully.");
    } finally {
      stopNoiseMonitoring();
      if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop());
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      navigate("/student");
    }
  }, [cameraStream, examId, finished, navigate, stopNoiseMonitoring, submitting]);

  const handleViolation = useCallback((reason) => {
    if (finished || submitting || proctoringPaused.current || cooldown.current) return;

    cooldown.current = true;
    proctoringPaused.current = true;

    proctoringSessionRef.current?.stop();
    proctoringSessionRef.current = null;

    setViolations((prev) => {
      const next = prev + 1;
      violationsRef.current = next;
      api.post(`/student/exams/${examId}/violation`, { reason, count: next }).catch(() => {});

      if (next >= MAX_VIOLATIONS) {
        finishExamRef.current?.(true);
      } else {
        setModalType("VIOLATION");
        setShowModal(true);
      }

      return next;
    });

    setTimeout(() => {
      cooldown.current = false;
    }, 2000);
  }, [examId, finished, submitting]);

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
      setNoiseWarnings(0);
      startNoiseMonitoring(stream);
    } catch (err) {
      setMicStatus("permission-or-device-error");
      showToast("error", "Camera and microphone access are required for proctoring.");
    }
  };

  const enterFullscreenAndStart = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }

      await loadProctorModels();

      if (!started) {
        await api.post(`/student/exams/${examId}/start`).catch(() => {});
        snapshotCountRef.current = 0;
        setStarted(true);
        hasSubmittedOnTimeUpRef.current = false;
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

    if (webcamVideoRef.current) {
      webcamVideoRef.current.play().catch(() => {});
    }

    setTimeout(() => {
      startAIProctoring();
    }, 1500);
  };

  const codingQuestions = exam?.codingQuestions || [];
  const totalQuestions = codingQuestions.length;
  const safeQuestionIndex = Math.min(currentIndex, Math.max(0, totalQuestions - 1));
  const currentQuestion = codingQuestions[safeQuestionIndex] || null;

  useEffect(() => {
    if (totalQuestions === 0) {
      setCurrentIndex(0);
      return;
    }
    setCurrentIndex((prev) => Math.min(prev, totalQuestions - 1));
  }, [totalQuestions]);

  useEffect(() => {
    api.get(`/student/exams/${examId}`)
      .then((res) => setExam(res.data))
      .catch(() => showToast("error", "Error loading exam"));
  }, [examId]);

  useEffect(() => {
    if (!started || finished || !exam?.duration) return;
    if (timeLeft !== null) return;

    const durationInSeconds = Number(exam.duration) * 60;
    setTimeLeft(Number.isFinite(durationInSeconds) ? durationInSeconds : 0);
  }, [started, finished, exam, timeLeft]);

  useEffect(() => {
    finishExamRef.current = handleFinishExam;
  }, [handleFinishExam]);

  useEffect(() => {
    if (!started || finished || !exam?.duration || !cameraStream) return;

    const durationMinutes = Number(exam.duration);
    const durationMs = Number.isFinite(durationMinutes) ? durationMinutes * 60 * 1000 : 0;
    if (!durationMs) return;

    const intervalMs = Math.max(30000, Math.floor(durationMs / 10));

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

  useEffect(() => {
    if (!started || finished || timeLeft === null) return;

    if (examTimerRef.current) clearInterval(examTimerRef.current);

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
    if (!started || finished) return;
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (
              node.nodeName === "IFRAME" ||
              (node.nodeType === 1 && !node.closest("#exam-root-container"))
            ) {
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

  useEffect(() => {
    if (!started || finished) return;

    const handleKeyDownCapture = (event) => {
      if (event.ctrlKey || event.altKey || event.metaKey) {
        setWarningMsg("Warning: Keyboard shortcuts prohibited!");
        setTimeout(() => setWarningMsg(""), 3000);
      }

      const forbidden = ["j", "u", "s", "p", "i", "f", "g"];
      if (event.ctrlKey && forbidden.includes(event.key.toLowerCase())) {
        event.preventDefault();
        event.stopPropagation();
        handleViolation(`Forbidden Shortcut: Ctrl+${event.key}`);
      }

      if (event.key === "F12") {
        event.preventDefault();
        event.stopPropagation();
        handleViolation("DevTools attempt");
      }
    };

    const handleResize = () => {
      if (document.fullscreenElement && !proctoringPaused.current) {
        handleViolation("Screen Resizing");
      }
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

    const onVisibilityChange = () => {
      if (document.hidden) handleViolation("Tab Switch");
    };

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
    const block = (event) => event.preventDefault();
    ["copy", "cut", "paste", "contextmenu", "selectstart", "dragstart"].forEach((eventName) =>
      document.addEventListener(eventName, block)
    );

    return () => {
      ["copy", "cut", "paste", "contextmenu", "selectstart", "dragstart"].forEach((eventName) =>
        document.removeEventListener(eventName, block)
      );
    };
  }, []);

  useEffect(() => {
    return () => {
      proctoringSessionRef.current?.stop();
      proctoringSessionRef.current = null;

      if (snapshotTimerRef.current) {
        clearInterval(snapshotTimerRef.current);
        snapshotTimerRef.current = null;
      }

      if (examTimerRef.current) {
        clearInterval(examTimerRef.current);
        examTimerRef.current = null;
      }

      stopNoiseMonitoring();
    };
  }, [stopNoiseMonitoring]);

  const handleRun = async () => {
    if (!currentQuestion) return;
    setLoadingRun(true);
    setOutput("");
    try {
      const res = await api.post(`/student/exams/${examId}/coding/${currentQuestion._id}/run`, {
        code,
        language,
      });
      setOutput(res.data.error || res.data.output || "Executed");
    } catch {
      setOutput("Execution error");
    } finally {
      setLoadingRun(false);
    }
  };

  const handleSubmitQuestion = async () => {
    if (!currentQuestion) return;

    setLoadingSubmit(true);
    try {
      const res = await api.post(`/student/exams/${examId}/coding/${currentQuestion._id}/submit`, {
        code,
        language,
      });

      const result = {
        passed: res.data.passed,
        totalCases: res.data.totalCases,
        marksAwarded: res.data.marksAwarded,
        submittedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setSubmitResult(result);

      setTotalScore((prev) => prev + (res.data.marksAwarded || 0));
      setSubmittedQuestions((prev) => new Set([...prev, currentQuestion._id]));

      const isResubmit = submittedQuestions.has(currentQuestion._id);
      setToastMessage(
        isResubmit
          ? `Updated: ${res.data.passed}/${res.data.totalCases} tests passed`
          : `Submitted: ${res.data.passed}/${res.data.totalCases} tests passed`
      );
      setTimeout(() => setToastMessage(""), 4000);
    } catch (error) {
      setToastMessage(`Submission failed: ${error.response?.data?.message || error.message}`);
      setTimeout(() => setToastMessage(""), 4000);
    } finally {
      setLoadingSubmit(false);
    }
  };

  const formatTime = (totalSeconds) => {
    if (totalSeconds === null || totalSeconds === undefined) return "--:--";
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  if (!exam) {
    return (
      <div style={loadingShellStyle}>
        <div style={loadingCardStyle}>Loading coding exam...</div>
      </div>
    );
  }

  return (
    <div id="exam-root-container" style={mainContainerStyle}>
      {warningMsg && <div style={warningToastStyle}>Security Notice: {warningMsg}</div>}

      {toastMessage && (
        <div style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          backgroundColor: toastMessage.toLowerCase().includes("failed") ? "#fee2e2" : "#dcfce7",
          color: toastMessage.toLowerCase().includes("failed") ? "#991b1b" : "#065f46",
          border: `1px solid ${toastMessage.toLowerCase().includes("failed") ? "#fca5a5" : "#86efac"}`,
          padding: "11px 14px",
          borderRadius: 12,
          zIndex: 2147483647,
          fontWeight: 700,
          boxShadow: "0 10px 20px rgba(15, 23, 42, 0.15)",
          maxWidth: 380,
        }}>
          {toastMessage}
        </div>
      )}

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
                <p style={modalTextStyle}>Close sidebar or overlay extensions and return to full screen.</p>
                <button style={btnStyle} onClick={enterFullscreenAndStart}>Resume Exam</button>
              </>
            ) : modalType === "PERMISSIONS" ? (
              <>
                <h2 style={modalTitleStyle}>Allow Camera and Microphone</h2>
                <p style={modalTextStyle}>Permissions are required before exam start.</p>
                <button style={btnStyle} onClick={requestCamera}>Allow Access</button>
              </>
            ) : modalType === "START" ? (
              <>
                <h2 style={modalTitleStyle}>Ready To Start?</h2>
                <p style={modalTextStyle}>Coding exam starts in full screen with live proctoring.</p>
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
        <div
          style={{
            ...examLayoutStyle,
            filter: showModal || isLocked ? "blur(30px)" : "none",
            opacity: showModal || isLocked ? 0.3 : 1,
            pointerEvents: showModal || isLocked ? "none" : "auto",
            transition: "all 0.3s ease",
          }}
        >
          <div style={examMainPaneStyle}>
            <div style={examHeaderCardStyle}>
              <h1 style={{ margin: 0, fontSize: 32, color: "#111827" }}>{exam.title}</h1>
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
                  <div style={questionMetaStyle}>Question {safeQuestionIndex + 1} of {totalQuestions}</div>
                  <div style={questionTitleStyle}>{currentQuestion.title}</div>
                  <p style={questionDescStyle}>{currentQuestion.description}</p>

                  <div style={editorToolbarStyle}>
                    <label style={fieldLabelStyle}>Language</label>
                    <select value={language} onChange={(e) => setLanguage(e.target.value)} style={selectStyle}>
                      <option value="python">Python</option>
                      <option value="java">Java</option>
                      <option value="cpp">C++</option>
                    </select>
                  </div>

                  <textarea
                    rows={14}
                    style={editorStyle}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="Write your solution here..."
                  />

                  <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button style={btnStyle} onClick={handleRun} disabled={loadingRun}>
                      {loadingRun ? "Running..." : "Run"}
                    </button>
                    <button
                      style={{
                        ...btnStyle,
                        background: submittedQuestions.has(currentQuestion?._id)
                          ? "linear-gradient(135deg, #16a34a 0%, #15803d 100%)"
                          : "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)",
                        boxShadow: submittedQuestions.has(currentQuestion?._id)
                          ? "0 10px 20px rgba(22, 163, 74, 0.3)"
                          : "0 10px 20px rgba(109, 40, 217, 0.32)",
                      }}
                      onClick={handleSubmitQuestion}
                      disabled={loadingSubmit}
                    >
                      {loadingSubmit ? "Submitting..." : submittedQuestions.has(currentQuestion?._id) ? "Resubmit" : "Submit Question"}
                    </button>
                  </div>

                  {submitResult && (
                    <div style={submitResultBoxStyle}>
                      <p style={{ margin: "0 0 6px", fontWeight: 800 }}>Test Results</p>
                      <p style={{ margin: "0 0 6px" }}>Passed: {submitResult.passed}/{submitResult.totalCases}</p>
                      <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>Last updated: {submitResult.submittedAt}</p>
                    </div>
                  )}

                  <div style={outputBoxStyle}>
                    <div style={outputHeaderStyle}>Output</div>
                    <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{output || "No output yet."}</pre>
                  </div>
                </div>

                <div style={questionNavCardStyle}>
                  <button
                    style={{ ...btnStyle, ...navBtnStyle, opacity: safeQuestionIndex === 0 ? 0.6 : 1 }}
                    onClick={() => {
                      setCurrentIndex((prev) => Math.max(prev - 1, 0));
                      setSubmitResult(null);
                    }}
                    disabled={safeQuestionIndex === 0}
                  >
                    Previous
                  </button>

                  <div style={questionDotsWrapStyle}>
                    {codingQuestions.map((question, idx) => {
                      const isActive = idx === safeQuestionIndex;
                      const isSubmitted = submittedQuestions.has(question._id);

                      let dotStyle = { ...questionDotStyle };
                      if (isSubmitted) dotStyle = { ...dotStyle, ...questionDotAnsweredStyle };
                      if (isActive) {
                        dotStyle = {
                          ...dotStyle,
                          ...questionDotActiveStyle,
                          ...(isSubmitted ? questionDotActiveAnsweredStyle : null),
                        };
                      }

                      return (
                        <button
                          key={question._id || idx}
                          style={dotStyle}
                          onClick={() => {
                            setCurrentIndex(idx);
                            setSubmitResult(null);
                          }}
                          aria-label={`Go to question ${idx + 1}`}
                          title={`Question ${idx + 1}`}
                        >
                          {idx + 1}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    style={{
                      ...btnStyle,
                      ...navBtnStyle,
                      opacity: safeQuestionIndex === totalQuestions - 1 ? 0.6 : 1,
                    }}
                    onClick={() => {
                      setCurrentIndex((prev) => Math.min(prev + 1, totalQuestions - 1));
                      setSubmitResult(null);
                    }}
                    disabled={safeQuestionIndex === totalQuestions - 1}
                  >
                    Next
                  </button>
                </div>
              </>
            ) : (
              <div style={questionCardStyle}>No coding questions available.</div>
            )}

            <button style={submitBtnStyle} onClick={() => handleFinishExam(false)}>Finish Exam</button>
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

const examLayoutStyle = {
  display: "flex",
  gap: "28px",
  maxWidth: 1360,
  margin: "0 auto",
};

const examMainPaneStyle = {
  flex: 1,
};

const examSidePaneStyle = {
  width: 320,
};

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
  gridTemplateColumns: "repeat(auto-fit, minmax(185px, 1fr))",
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

const modalTitleStyle = {
  margin: "2px 0 8px",
  color: "#111827",
};

const modalTextStyle = {
  color: "#4b5563",
  lineHeight: 1.5,
  margin: "0 0 12px",
};

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

const questionTitleStyle = {
  color: "#111827",
  fontSize: 22,
  marginBottom: 8,
  lineHeight: 1.45,
  fontWeight: 800,
};

const questionDescStyle = {
  color: "#334155",
  marginBottom: 14,
  lineHeight: 1.6,
  whiteSpace: "pre-wrap",
};

const editorToolbarStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginBottom: 10,
};

const fieldLabelStyle = {
  fontWeight: 700,
  color: "#334155",
  fontSize: 13,
};

const selectStyle = {
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  padding: "8px 12px",
  background: "#fff",
  color: "#0f172a",
  fontWeight: 600,
};

const editorStyle = {
  width: "100%",
  backgroundColor: "#0f172a",
  color: "#e2e8f0",
  padding: "15px",
  borderRadius: 12,
  border: "1px solid #1e293b",
  fontFamily: "Consolas, Courier New, monospace",
  fontSize: 14,
  lineHeight: 1.5,
  resize: "vertical",
  boxSizing: "border-box",
};

const submitResultBoxStyle = {
  marginTop: 14,
  padding: 12,
  backgroundColor: "#f0fdf4",
  border: "1px solid #86efac",
  borderRadius: 10,
  color: "#166534",
};

const outputBoxStyle = {
  background: "#0b1220",
  color: "#dbeafe",
  padding: "14px",
  marginTop: "16px",
  minHeight: "120px",
  borderRadius: 12,
  border: "1px solid #1f2937",
  fontFamily: "Consolas, Courier New, monospace",
};

const outputHeaderStyle = {
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  marginBottom: 8,
  color: "#93c5fd",
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

const proctorTitleStyle = {
  fontWeight: 800,
  color: "#4338ca",
  marginBottom: 10,
  fontSize: 14,
  letterSpacing: 0.5,
};

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

const timerStyle = {
  color: "#4f46e5",
  fontWeight: 800,
  fontSize: "18px",
};
