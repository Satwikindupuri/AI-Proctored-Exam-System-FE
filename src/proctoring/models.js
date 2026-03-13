import * as tf from "@tensorflow/tfjs";
import * as faceDetection from "@tensorflow-models/face-detection";
import * as cocoSsd from "@tensorflow-models/coco-ssd";

let cached = null;

export function loadProctorModels() {
  if (cached) return cached;

  cached = (async () => {
    // WebGL is typically the fastest browser backend for live video inference.
    await tf.setBackend("webgl");
    await tf.ready();

    const faceModel = faceDetection.SupportedModels.MediaPipeFaceDetector;
    const faceConfig = {
      runtime: "tfjs",
      maxFaces: 3,
    };

    const faceDetector = await faceDetection.createDetector(faceModel, faceConfig);
    const coco = await cocoSsd.load();

    return { faceDetector, coco };
  })();

  return cached;
}
