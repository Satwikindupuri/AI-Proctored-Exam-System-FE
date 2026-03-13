import { loadProctorModels } from "./models";
import { DEFAULT_POLICY, DEFAULT_RUNTIME, EVENT_TYPES } from "./rules";

export async function startProctoringEngine(options) {
  const policy = { ...DEFAULT_POLICY, ...(options.policy || {}) };
  const models = await loadProctorModels();

  let stopped = false;
  let timer = null;
  let runtime = { ...DEFAULT_RUNTIME };

  const emitEvent = (type, detail) => {
    const now = Date.now();
    if (now - runtime.lastEventAt < policy.cooldownMs) return;

    runtime.lastEventAt = now;
    options.onEvent?.({ type, ts: now, detail });
  };

  const scheduleNext = () => {
    if (stopped) return;
    timer = window.setTimeout(tick, policy.intervalMs);
  };

  const tick = async () => {
    if (stopped) return;

    const video = options.videoEl;
    if (!video || video.readyState < 2) {
      scheduleNext();
      return;
    }

    try {
      const now = Date.now();
      const faces = await models.faceDetector.estimateFaces(video, { flipHorizontal: true });
      const predictions = await models.coco.detect(video);

      const phone = predictions.find(
        (p) => (p.class === "cell phone" || p.class === "remote") && p.score >= policy.minPhoneScore
      );

      const personCount = predictions.filter(
        (p) => p.class === "person" && p.score >= policy.minPersonScore
      ).length;

      if (faces.length === 0) {
        if (!runtime.noFaceStartAt) runtime.noFaceStartAt = now;
        if (now - runtime.noFaceStartAt >= policy.noFaceMs) {
          emitEvent(EVENT_TYPES.NO_FACE, { faces: faces.length });
        }
      } else {
        runtime.noFaceStartAt = null;
      }

      if (faces.length > 1) {
        if (!runtime.multiFaceStartAt) runtime.multiFaceStartAt = now;
        if (now - runtime.multiFaceStartAt >= policy.multiFaceMs) {
          emitEvent(EVENT_TYPES.MULTIPLE_FACES, { faces: faces.length });
        }
      } else {
        runtime.multiFaceStartAt = null;
      }

      if (phone) {
        runtime.phoneEvidence = Math.min(runtime.phoneEvidence + 1, policy.phoneFramesRequired + 1);
        if (runtime.phoneEvidence >= policy.phoneFramesRequired) {
          emitEvent(EVENT_TYPES.PHONE_DETECTED, {
            class: phone.class,
            score: phone.score,
            bbox: phone.bbox,
          });
        }
      } else {
        runtime.phoneEvidence = Math.max(runtime.phoneEvidence - 1, 0);
      }

      if (personCount > 1) {
        runtime.multiPersonEvidence = Math.min(
          runtime.multiPersonEvidence + 1,
          policy.multiPersonsFramesRequired + 1
        );
        if (runtime.multiPersonEvidence >= policy.multiPersonsFramesRequired) {
          emitEvent(EVENT_TYPES.MULTIPLE_PERSONS, { personCount });
        }
      } else {
        runtime.multiPersonEvidence = Math.max(runtime.multiPersonEvidence - 1, 0);
      }

      options.onTick?.({
        faces,
        predictions,
        personCount,
        phoneDetected: Boolean(phone),
      });
    } catch (error) {
      emitEvent(EVENT_TYPES.MODEL_ERROR, {
        message: error?.message || String(error),
      });
    } finally {
      scheduleNext();
    }
  };

  scheduleNext();

  return {
    stop: () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    },
  };
}
