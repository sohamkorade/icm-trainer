import {
  STABILITY_THRESHOLD_SEMITONES,
  TIMING_TOLERANCE_MS,
  LENGTH_TOLERANCE_MS,
  UTTERANCE_SILENCE_DURATION_MS,
} from "../constants";
import {
  getMatchResult,
  calculatePitchVariation,
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
  } else {
    // rate accuracy as one of {perfect, good, ok}
    const centDifference = Math.abs(match.closest.cents);
    if (centDifference < 10) {
      suggestion = `Perfect!`;
    } else if (centDifference < 20) {
      suggestion = `Good!`;
    } else {
      suggestion = `Ok!`;
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

function checkPitchCurveComparison(
  utterance,
  trainerPitchHistory,
  trainerPitchTimestamps,
  targetNotePlayTime,
) {
  if (
    !utterance ||
    !trainerPitchHistory ||
    !trainerPitchTimestamps ||
    trainerPitchHistory.length === 0 ||
    utterance.pitchSamples.length === 0 ||
    targetNotePlayTime === null
  ) {
    return {
      rating: null,
      score: null,
      suggestion: null,
    };
  }

  // Filter valid user pitch samples
  const userSamples = utterance.pitchSamples.filter(
    (s) => s.pitch > 0 && s.confidence >= 0.3,
  );

  if (userSamples.length === 0) {
    return {
      rating: null,
      score: null,
      suggestion: "No valid pitch samples detected.",
    };
  }

  // Extract trainer pitch samples that occurred during the target note playback
  // Trainer pitch starts at targetNotePlayTime and continues for the duration
  const trainerSamples = [];
  for (let i = 0; i < trainerPitchHistory.length; i++) {
    const timestamp = trainerPitchTimestamps[i];
    const pitch = trainerPitchHistory[i];
    if (
      pitch > 0 &&
      timestamp >= targetNotePlayTime &&
      timestamp <= targetNotePlayTime + utterance.expectedDuration + 1000
    ) {
      trainerSamples.push({ timestamp, pitch });
    }
  }

  if (trainerSamples.length === 0) {
    return {
      rating: null,
      score: null,
      suggestion: "No trainer pitch data available for comparison.",
    };
  }

  // Normalize time ranges: align user samples relative to utterance start
  // and trainer samples relative to target note play time
  const userStartTime = userSamples[0].timestamp;
  const trainerStartTime = trainerSamples[0].timestamp;

  // Resample both curves to a common time grid for comparison
  // Use the shorter duration as the comparison window
  const userDuration =
    userSamples[userSamples.length - 1].timestamp - userStartTime;
  const trainerDuration =
    trainerSamples[trainerSamples.length - 1].timestamp - trainerStartTime;
  const comparisonDuration = Math.min(userDuration, trainerDuration);

  if (comparisonDuration < 100) {
    // Too short to compare meaningfully
    return {
      rating: null,
      score: null,
      suggestion: "Utterance too short for comparison.",
    };
  }

  // Create time-aligned pitch arrays
  const numPoints = Math.min(
    50,
    Math.max(10, Math.floor(comparisonDuration / 20)),
  ); // Sample every ~20ms, max 50 points
  const userPitches = [];
  const trainerPitches = [];

  for (let i = 0; i < numPoints; i++) {
    const relativeTime =
      numPoints > 1 ? (i / (numPoints - 1)) * comparisonDuration : 0;
    const userTime = userStartTime + relativeTime;
    const trainerTime = trainerStartTime + relativeTime;

    // Interpolate user pitch
    let userPitch = null;
    for (let j = 0; j < userSamples.length - 1; j++) {
      if (
        userSamples[j].timestamp <= userTime &&
        userSamples[j + 1].timestamp >= userTime
      ) {
        const t =
          (userTime - userSamples[j].timestamp) /
          (userSamples[j + 1].timestamp - userSamples[j].timestamp);
        userPitch =
          userSamples[j].pitch * (1 - t) + userSamples[j + 1].pitch * t;
        break;
      }
    }
    if (userPitch === null && i === 0) {
      userPitch = userSamples[0].pitch;
    } else if (userPitch === null) {
      userPitch = userSamples[userSamples.length - 1].pitch;
    }

    // Interpolate trainer pitch
    let trainerPitch = null;
    for (let j = 0; j < trainerSamples.length - 1; j++) {
      if (
        trainerSamples[j].timestamp <= trainerTime &&
        trainerSamples[j + 1].timestamp >= trainerTime
      ) {
        const t =
          (trainerTime - trainerSamples[j].timestamp) /
          (trainerSamples[j + 1].timestamp - trainerSamples[j].timestamp);
        trainerPitch =
          trainerSamples[j].pitch * (1 - t) + trainerSamples[j + 1].pitch * t;
        break;
      }
    }
    if (trainerPitch === null && i === 0) {
      trainerPitch = trainerSamples[0].pitch;
    } else if (trainerPitch === null) {
      trainerPitch = trainerSamples[trainerSamples.length - 1].pitch;
    }

    if (userPitch !== null && trainerPitch !== null) {
      userPitches.push(userPitch);
      trainerPitches.push(trainerPitch);
    }
  }

  if (userPitches.length === 0 || trainerPitches.length === 0) {
    return {
      rating: null,
      score: null,
      suggestion: "Could not align pitch curves for comparison.",
    };
  }

  // Calculate similarity metrics
  // Use log frequency space for better comparison (pitch perception is logarithmic)
  const logUserPitches = userPitches.map((p) => Math.log2(p));
  const logTrainerPitches = trainerPitches.map((p) => Math.log2(p));

  // Calculate mean squared error in semitones (12 semitones per octave = log2 ratio)
  let mse = 0;
  let validPoints = 0;
  for (
    let i = 0;
    i < Math.min(userPitches.length, trainerPitches.length);
    i++
  ) {
    const diffSemitones =
      Math.abs(logUserPitches[i] - logTrainerPitches[i]) * 12;
    mse += diffSemitones * diffSemitones;
    validPoints++;
  }
  mse = mse / validPoints;

  // Calculate average absolute difference in semitones
  let avgDiff = 0;
  for (
    let i = 0;
    i < Math.min(userPitches.length, trainerPitches.length);
    i++
  ) {
    avgDiff += Math.abs(logUserPitches[i] - logTrainerPitches[i]) * 12;
  }
  avgDiff = avgDiff / validPoints;

  // Convert to a score (0-100, higher is better)
  // Perfect match (0 semitones) = 100, 1 semitone avg = ~80, 2 semitones = ~60, etc.
  const score = Math.max(0, Math.min(100, 100 - avgDiff * 20));

  // Determine rating and suggestion
  let rating;
  let suggestion;
  if (score >= 90) {
    rating = "excellent";
    suggestion = "Very close!";
  } else if (score >= 75) {
    rating = "good";
    suggestion = "Close!";
  } else if (score >= 60) {
    rating = "fair";
    suggestion = `Fair. Try again!`;
  } else if (score >= 40) {
    rating = "poor";
    suggestion = `Needs improvement. Focus!`;
  } else {
    rating = "very_poor";
    suggestion = `Poor. Listen carefully!`;
  }

  return {
    rating,
    score,
    suggestion,
    avgDiffSemitones: avgDiff,
    mse,
  };
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

  // Add pitch curve comparison suggestion if available
  if (checks.pitchCurveComparison?.suggestion) {
    suggestions.push(checks.pitchCurveComparison.suggestion);
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
  checkPitchCurveComparison,
  generateSuggestions,
  finalizeUtterance,
};
