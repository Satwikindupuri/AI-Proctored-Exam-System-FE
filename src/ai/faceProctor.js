import { loadProctorModels } from "../proctoring/models";

let detector = null;
let objectDetector = null;

export async function initFaceDetector() {
	if (detector) return detector;

	const models = await loadProctorModels();
	detector = models.faceDetector;
	return detector;
}

export async function initObjectDetector() {
	if (objectDetector) return objectDetector;

	const models = await loadProctorModels();
	objectDetector = models.coco;
	return objectDetector;
}

export async function initProctorModels() {
	const [faceModel, objectModel] = await Promise.all([
		initFaceDetector(),
		initObjectDetector(),
	]);

	return { faceModel, objectModel };
}

export async function detectFaces(videoEl) {
	if (!detector || !videoEl) return [];
	return await detector.estimateFaces(videoEl);
}

export async function detectSuspiciousDevices(videoEl) {
	if (!objectDetector || !videoEl) {
		return {
			hasMobileDevice: false,
			hasAnomalyDevice: false,
			mobileDevices: [],
			anomalyDevices: [],
			debugLabels: [],
		};
	}

	const predictions = await objectDetector.detect(videoEl);
	const confidentPredictions = predictions.filter((p) => p.score >= 0.35);

	// COCO-SSD may classify phones as "remote" in webcam frames.
	const mobileDeviceClasses = new Set(["cell phone", "remote"]);
	const anomalyDeviceClasses = new Set(["laptop", "tv", "remote"]);

	const mobileDevices = confidentPredictions.filter((p) => mobileDeviceClasses.has(p.class));
	const anomalyDevices = confidentPredictions.filter((p) => anomalyDeviceClasses.has(p.class));

	return {
		hasMobileDevice: mobileDevices.length > 0,
		hasAnomalyDevice: anomalyDevices.length > 0,
		mobileDevices,
		anomalyDevices,
		debugLabels: confidentPredictions.map((p) => `${p.class}:${p.score.toFixed(2)}`),
	};
}


