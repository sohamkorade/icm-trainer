/**
 * Pitch tracking utilities for analyzing audio buffers
 */

import {
  MIN_FREQUENCY,
  MAX_FREQUENCY,
  UTTERANCE_SILENCE_THRESHOLD,
  MAX_HISTORY,
} from "../constants";
import { computeRms, yinPitch } from "../pitch/yin";

export function analyzeUserPitch(buffer, audioCtx, pitchErrorRef) {
  let pitch = 0;
  let pitchConfidence = 0;

  try {
    const { pitch: yinPitchValue, confidence } = yinPitch(
      buffer,
      audioCtx.sampleRate,
    );
    if (yinPitchValue >= MIN_FREQUENCY && yinPitchValue <= MAX_FREQUENCY) {
      pitch = yinPitchValue;
      pitchConfidence = confidence;
    }
  } catch (error) {
    if (!pitchErrorRef.current) {
      console.error("Pitch detection error:", error);
      pitchErrorRef.current = true;
    }
    pitch = 0;
    pitchConfidence = 0;
  }

  const rms = computeRms(buffer);
  if (rms < UTTERANCE_SILENCE_THRESHOLD) {
    pitch = 0;
    pitchConfidence = 0;
  }

  return {
    pitch,
    pitchConfidence,
    rms,
    hasSignal: rms >= UTTERANCE_SILENCE_THRESHOLD,
  };
}

export function analyzeTrainerPitch(
  trainerAnalyserRef,
  trainerBuffer,
  audioCtx,
  trainerPitchHistoryRef,
  trainerPitchHistoryTimestampsRef,
) {
  if (!trainerAnalyserRef.current) {
    return;
  }

  try {
    trainerAnalyserRef.current.getFloatTimeDomainData(trainerBuffer);
    const trainerRms = computeRms(trainerBuffer);
    if (trainerRms >= UTTERANCE_SILENCE_THRESHOLD) {
      const { pitch: trainerPitchValue } = yinPitch(
        trainerBuffer,
        audioCtx.sampleRate,
      );
      if (
        trainerPitchValue >= MIN_FREQUENCY &&
        trainerPitchValue <= MAX_FREQUENCY
      ) {
        const now = Date.now();
        const trainerHistory = trainerPitchHistoryRef.current;
        const trainerTimestamps = trainerPitchHistoryTimestampsRef.current;
        trainerHistory.push(Math.max(trainerPitchValue, 0));
        trainerTimestamps.push(now);

        if (trainerHistory.length > MAX_HISTORY) {
          trainerHistory.shift();
          trainerTimestamps.shift();
        }
      }
    }
  } catch (error) {
    // Silently handle trainer pitch detection errors
    // Trainer pitch detection failures are not critical
  }
}
