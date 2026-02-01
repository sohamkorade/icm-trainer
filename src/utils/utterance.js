import {
  STABILITY_THRESHOLD_SEMITONES,
  TIMING_TOLERANCE_MS,
  LENGTH_TOLERANCE_MS,
  UTTERANCE_SILENCE_DURATION_MS,
} from "../constants";
import {
  getMatchResult,
  calculatePitchVariation,
  isWithinThreshold,
  toNoteValue,
  getNoteByLabel,
} from "./notes";

let utteranceIdCounter = 0;

function createUtterance(expectedNote, expectedStartTime, expectedDuration) {
  const now = Date.now();
  return {
    id: `utterance-${utteranceIdCounter++}`,
    startTime: now,
    endTime: null,
    pitchSamples: [],
    startingPitch: null,
    expectedNote,
    expectedStartTime,
    expectedDuration,
    checks: {
      isStable: null,
      isExpectedNote: null,
      isExpectedLength: null,
      isAtExpectedTime: null,
    },
    suggestions: [],
  };
}

function addPitchSample(utterance, pitch, confidence, timestamp) {
  if (!utterance || utterance.endTime !== null) {
    return;
  }

  const sample = {
    timestamp: timestamp || Date.now(),
    pitch,
    confidence,
  };

  utterance.pitchSamples.push(sample);

  // Set starting pitch on first valid sample
  if (utterance.startingPitch === null && pitch > 0) {
    utterance.startingPitch = pitch;
  }
}

function detectUtteranceEnd(pitchSamples, rms, silenceThreshold) {
  if (!pitchSamples || pitchSamples.length === 0) {
    return false;
  }

  // Check if we have silence (low RMS)
  if (rms < silenceThreshold) {
    // Check if silence has persisted for required duration
    // Find the most recent valid pitch sample (with pitch > 0 and confidence >= 0.3)
    const now = Date.now();
    const validSamples = pitchSamples.filter(
      (s) => s.pitch > 0 && s.confidence >= 0.3,
    );

    if (validSamples.length === 0) {
      // No valid samples at all, utterance ended
      return true;
    }

    // Check if the most recent valid sample is older than the silence duration threshold
    const mostRecentValidSample = validSamples[validSamples.length - 1];
    const timeSinceLastValidPitch = now - mostRecentValidSample.timestamp;

    // Utterance ended if we've been silent for at least UTTERANCE_SILENCE_DURATION_MS
    return timeSinceLastValidPitch >= UTTERANCE_SILENCE_DURATION_MS;
  }

  return false;
}

function checkStability(
  utterance,
  tonicValue,
  thresholdSemitones = STABILITY_THRESHOLD_SEMITONES,
) {
  if (
    !utterance ||
    !utterance.startingPitch ||
    utterance.pitchSamples.length === 0
  ) {
    return { isStable: null, suggestion: null };
  }

  const variation = calculatePitchVariation(
    utterance.pitchSamples,
    utterance.startingPitch,
    tonicValue,
  );

  const isStable = variation <= thresholdSemitones;
  const suggestion = isStable ? null : `Keep the note stable`;

  return { isStable, suggestion };
}

function checkExpectedNote(utterance, tonicValue, targetLabel) {
  if (!utterance || utterance.pitchSamples.length === 0) {
    return { isExpectedNote: null, suggestion: null };
  }

  // Use average pitch and confidence from all valid samples
  const recentSamples = utterance.pitchSamples.filter(
    (s) => s.pitch > 0 && s.confidence >= 0.3,
  );
  if (recentSamples.length === 0) {
    return { isExpectedNote: null, suggestion: null };
  }

  // Calculate average pitch and average confidence
  const avgPitch =
    recentSamples.reduce((sum, s) => sum + s.pitch, 0) / recentSamples.length;
  const avgConfidence =
    recentSamples.reduce((sum, s) => sum + s.confidence, 0) /
    recentSamples.length;

  const match = getMatchResult({
    pitch: avgPitch,
    pitchConfidence: avgConfidence,
    tonicValue,
    targetLabel,
  });

  if (!match) {
    return {
      isExpectedNote: false,
      suggestion: "Sing louder for a clearer pitch.",
    };
  }

  const isExpectedNote = match.isGood;

  let suggestion = null;
  if (!isExpectedNote) {
    if (match.closest.note.label === targetLabel) {
      const cents = Math.abs(match.closest.cents);
      suggestion = `Adjust pitch by ${cents.toFixed(1)} cents to match ${targetLabel}.`;
    } else {
      // User sang a different note than expected
      const noteValue = toNoteValue(tonicValue, avgPitch); // What they actually sang
      const expectedNote = getNoteByLabel(targetLabel); // What they should sing
      if (!expectedNote) {
        suggestion = `Sing ${targetLabel}.`;
        return { isExpectedNote, suggestion };
      }

      // Compare with the exact expected note octave
      const expectedSemitone = expectedNote.semitone;
      const delta = expectedSemitone - noteValue;
      const notesOff = Math.round(Math.abs(delta) * 10) / 10;
      if (notesOff > 11) {
        // octave off actually
        const direction = delta > 0 ? "higher" : "lower";
        suggestion = `Sing in ${direction} octave`;
      } else {
        const direction = delta > 0 ? "up" : "down";
        suggestion = `Go ${direction} by ${notesOff} semitones to reach ${targetLabel}.`;
      }
    }
  }

  return { isExpectedNote, suggestion };
}

function checkExpectedLength(utterance, toleranceMs = LENGTH_TOLERANCE_MS) {
  if (!utterance) {
    return { isExpectedLength: null, suggestion: null };
  }

  const now = Date.now();
  const actualDuration =
    utterance.endTime !== null
      ? utterance.endTime - utterance.startTime
      : now - utterance.startTime;

  const difference = actualDuration - utterance.expectedDuration;
  const isExpectedLength = Math.abs(difference) <= toleranceMs;

  let suggestion = null;
  if (!isExpectedLength) {
    if (difference > 0) {
      suggestion = `Hold the note shorter`;
    } else {
      suggestion = `Hold the note longer`;
    }
  }

  return { isExpectedLength, suggestion };
}

function checkExpectedTiming(utterance, toleranceMs = TIMING_TOLERANCE_MS) {
  if (!utterance) {
    return { isAtExpectedTime: null, suggestion: null };
  }

  const difference = utterance.startTime - utterance.expectedStartTime;
  const isAtExpectedTime = Math.abs(difference) <= toleranceMs;

  let suggestion = null;
  if (!isAtExpectedTime) {
    if (difference > 0) {
      suggestion = `Start earlier - expected at ${utterance.expectedStartTime}ms, started at ${utterance.startTime}ms (${Math.round(difference)}ms late).`;
    } else {
      suggestion = `Start later - expected at ${utterance.expectedStartTime}ms, started at ${utterance.startTime}ms (${Math.round(Math.abs(difference))}ms early).`;
    }
  }

  return { isAtExpectedTime, suggestion };
}

function generateSuggestions(utterance, checks) {
  const suggestions = [];

  if (checks.stability?.suggestion) {
    suggestions.push(checks.stability.suggestion);
  }

  if (checks.expectedNote?.suggestion) {
    suggestions.push(checks.expectedNote.suggestion);
  }

  if (checks.expectedLength?.suggestion) {
    suggestions.push(checks.expectedLength.suggestion);
  }

  if (checks.expectedTiming?.suggestion) {
    suggestions.push(checks.expectedTiming.suggestion);
  }

  return suggestions;
}

function finalizeUtterance(utterance) {
  if (!utterance || utterance.endTime !== null) {
    return;
  }
  utterance.endTime = Date.now();
}

export {
  createUtterance,
  addPitchSample,
  detectUtteranceEnd,
  checkStability,
  checkExpectedNote,
  checkExpectedLength,
  checkExpectedTiming,
  generateSuggestions,
  finalizeUtterance,
};
