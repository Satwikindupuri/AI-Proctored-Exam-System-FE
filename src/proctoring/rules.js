export const EVENT_TYPES = {
  NO_FACE: "NO_FACE",
  MULTIPLE_FACES: "MULTIPLE_FACES",
  PHONE_DETECTED: "PHONE_DETECTED",
  MULTIPLE_PERSONS: "MULTIPLE_PERSONS",
  MODEL_ERROR: "MODEL_ERROR",
};

export const DEFAULT_POLICY = {
  intervalMs: 900,
  cooldownMs: 3500,
  minPhoneScore: 0.3,
  minPersonScore: 0.45,
  noFaceMs: 5000,
  multiFaceMs: 3000,
  phoneFramesRequired: 2,
  multiPersonsFramesRequired: 2,
};

export const DEFAULT_RUNTIME = {
  noFaceStartAt: null,
  multiFaceStartAt: null,
  phoneEvidence: 0,
  multiPersonEvidence: 0,
  lastEventAt: 0,
};
