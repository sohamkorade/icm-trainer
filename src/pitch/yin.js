import { YIN_THRESHOLD } from "../constants";

function computeRms(buffer) {
  let sum = 0;
  for (const value of buffer) {
    sum += value * value;
  }
  return Math.sqrt(sum / buffer.length);
}

function computeDifference(buffer, halfSize) {
  const diff = new Float32Array(halfSize);
  diff[0] = 0;
  for (let tau = 1; tau < halfSize; tau += 1) {
    let sum = 0;
    for (let i = 0; i < halfSize; i += 1) {
      const delta = buffer[i] - buffer[i + tau];
      sum += delta * delta;
    }
    diff[tau] = sum;
  }
  return diff;
}

function computeCmnd(diff) {
  const cmnd = new Float32Array(diff.length);
  cmnd[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau < diff.length; tau += 1) {
    runningSum += diff[tau];
    cmnd[tau] = runningSum === 0 ? 1 : (diff[tau] * tau) / runningSum;
  }
  return cmnd;
}

function findTau(cmnd) {
  for (let tau = 2; tau < cmnd.length; tau += 1) {
    if (cmnd[tau] < YIN_THRESHOLD) {
      let bestTau = tau;
      while (bestTau + 1 < cmnd.length && cmnd[bestTau + 1] < cmnd[bestTau]) {
        bestTau += 1;
      }
      return bestTau;
    }
  }
  return -1;
}

function refineTau(cmnd, tauEstimate) {
  if (tauEstimate <= 0 || tauEstimate + 1 >= cmnd.length) {
    return tauEstimate;
  }
  const prev = cmnd[tauEstimate - 1];
  const curr = cmnd[tauEstimate];
  const next = cmnd[tauEstimate + 1];
  const denominator = 2 * curr - prev - next;
  if (denominator === 0) {
    return tauEstimate;
  }
  return tauEstimate + (next - prev) / (2 * denominator);
}

function yinPitch(buffer, sampleRate) {
  const halfSize = Math.floor(buffer.length / 2);
  const diff = computeDifference(buffer, halfSize);
  const cmnd = computeCmnd(diff);
  const tauEstimate = findTau(cmnd);
  if (tauEstimate === -1) {
    return { pitch: 0, confidence: 0 };
  }

  const refinedTau = refineTau(cmnd, tauEstimate);
  const pitch = sampleRate / refinedTau;
  const confidence = Math.max(0, Math.min(1, 1 - cmnd[tauEstimate]));
  if (!Number.isFinite(pitch)) {
    return { pitch: 0, confidence: 0 };
  }
  return { pitch, confidence };
}

export { computeRms, yinPitch };
