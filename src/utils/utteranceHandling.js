/**
 * Utterance handling utilities for managing utterance lifecycle
 */

import {
  checkStability,
  checkExpectedNote,
  checkExpectedLength,
  checkExpectedTiming,
  checkPitchCurveComparison,
  generateSuggestions,
} from "./utterance";
import { getMatchResult } from "./notes";

export function handleUtteranceEnd(
  currentUtteranceRef,
  utterancesRef,
  callAndResponseActiveRef,
  sequenceNotes,
  targetIndexRef,
  setTargetIndex,
  initializeMetronome,
  scheduleNextTargetNote,
  setCurrentUtterance,
  wasSilentRef,
) {
  const utterance = currentUtteranceRef.current;
  if (!utterance) {
    return;
  }

  // Check if all checks passed - depends on checking mode
  let allChecksPassed = false;
  if (utterance.checks.pitchCurveComparison !== undefined) {
    // Pitch curve comparison mode: check if score is good enough (>= 80)
    allChecksPassed =
      utterance.checks.pitchCurveComparison?.score !== null &&
      utterance.checks.pitchCurveComparison?.score >= 80;
  } else {
    // Traditional checking mode
    allChecksPassed =
      utterance.checks.isStable === true &&
      utterance.checks.isExpectedNote === true &&
      utterance.checks.isExpectedLength === true &&
      utterance.checks.isAtExpectedTime === true;
  }

  if (allChecksPassed && callAndResponseActiveRef.current) {
    const nextIndex = (targetIndexRef.current + 1) % sequenceNotes.length;
    setTargetIndex(nextIndex);
    initializeMetronome();
    scheduleNextTargetNote(sequenceNotes[nextIndex]);
  } else if (callAndResponseActiveRef.current) {
    initializeMetronome();
    scheduleNextTargetNote(sequenceNotes[targetIndexRef.current]);
  }

  currentUtteranceRef.current = null;
  setCurrentUtterance(null);
  wasSilentRef.current = true;
}

export function updateUtteranceChecks(
  utterance,
  tonicValue,
  currentTarget,
  setCurrentUtterance,
  usePitchCurveComparison = false,
  trainerPitchHistory = null,
  trainerPitchTimestamps = null,
  targetNotePlayTime = null,
) {
  if (usePitchCurveComparison) {
    // Pitch curve comparison mode
    const curveCheck = checkPitchCurveComparison(
      utterance,
      trainerPitchHistory,
      trainerPitchTimestamps,
      targetNotePlayTime,
    );

    // Update checks with pitch curve comparison result
    utterance.checks.pitchCurveComparison = curveCheck;

    // Generate suggestions
    utterance.suggestions = generateSuggestions(utterance, {
      pitchCurveComparison: curveCheck,
    });
  } else {
    // Traditional checking mode
    const stabilityCheck = checkStability(utterance, tonicValue);
    const noteCheck = checkExpectedNote(utterance, tonicValue, currentTarget);
    const lengthCheck = checkExpectedLength(utterance);
    const timingCheck = checkExpectedTiming(utterance);

    // Update checks
    utterance.checks.isStable = stabilityCheck.isStable;
    utterance.checks.isExpectedNote = noteCheck.isExpectedNote;
    utterance.checks.isExpectedLength = lengthCheck.isExpectedLength;
    utterance.checks.isAtExpectedTime = timingCheck.isAtExpectedTime;

    // Generate suggestions
    utterance.suggestions = generateSuggestions(utterance, {
      stability: stabilityCheck,
      expectedNote: stabilityCheck.isStable ? noteCheck : null,
      expectedLength: lengthCheck,
      expectedTiming: timingCheck,
    });
  }

  // Update state (only called once after utterance ends)
  setCurrentUtterance({ ...utterance });
}

export function updatePitchMatchUI(
  pitch,
  pitchConfidence,
  tonicValue,
  currentTarget,
  setDetectedNote,
  setCentsOff,
  setInTune,
) {
  const match = getMatchResult({
    pitch,
    pitchConfidence,
    tonicValue,
    targetLabel: currentTarget,
  });

  if (match) {
    setDetectedNote(match.closest.displayLabel || match.closest.note.label);
    setCentsOff(match.closest.cents);
    setInTune(match.isGood);
  } else {
    setDetectedNote("");
    setCentsOff(0);
    setInTune(false);
  }
}
