/**
 * Utterance handling utilities for managing utterance lifecycle
 */

import {
  checkStability,
  checkExpectedNote,
  checkExpectedLength,
  checkExpectedTiming,
  generateSuggestions,
} from "./utterance";
import { getMatchResult } from "./notes";

export function handleUtteranceEnd(
  currentUtteranceRef,
  utterancesRef,
  callAndResponseActiveRef,
  sequenceNotes,
  targetIndexRef,
  resetAttempts,
  setTargetIndex,
  initializeMetronome,
  scheduleNextTargetNote,
  attemptsLeftRef,
  setAttemptsLeft,
  setCurrentUtterance,
  wasSilentRef,
) {
  const utterance = currentUtteranceRef.current;
  if (!utterance) {
    return;
  }

  const allChecksPassed =
    utterance.checks.isStable === true &&
    utterance.checks.isExpectedNote === true &&
    utterance.checks.isExpectedLength === true &&
    utterance.checks.isAtExpectedTime === true;

  if (allChecksPassed && callAndResponseActiveRef.current) {
    const nextIndex = (targetIndexRef.current + 1) % sequenceNotes.length;
    resetAttempts();
    setTargetIndex(nextIndex);
    initializeMetronome();
    scheduleNextTargetNote(sequenceNotes[nextIndex]);
  } else if (callAndResponseActiveRef.current) {
    const newAttemptsLeft = Math.max(0, attemptsLeftRef.current - 1);
    attemptsLeftRef.current = newAttemptsLeft;
    setAttemptsLeft(newAttemptsLeft);
    if (newAttemptsLeft > 0) {
      scheduleNextTargetNote(sequenceNotes[targetIndexRef.current]);
    } else {
      resetAttempts();
      initializeMetronome();
      scheduleNextTargetNote(sequenceNotes[targetIndexRef.current]);
    }
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
) {
  // Run checks after utterance has ended
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
