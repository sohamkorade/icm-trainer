import { IN_TUNE_CENTS } from "../constants";

function centsOffFrom(target, actual) {
  return 1200 * Math.log2(actual / target);
}

function toNoteValue(tonicValue, pitch) {
  return 12 * Math.log2(pitch / tonicValue);
}

const NOTE_LABELS = [
  "S",
  "R1",
  "R2",
  "G1",
  "G2",
  "M1",
  "M2",
  "P",
  "D1",
  "D2",
  "N1",
  "N2",
];

function labelForSemitone(semitone) {
  const rounded = semitone;
  const baseIndex = ((rounded % 12) + 12) % 12;
  const octaveOffset = Math.floor(rounded / 12);
  const baseLabel = NOTE_LABELS[baseIndex];
  if (octaveOffset === 0) {
    return baseLabel;
  }
  let suffix = "";
  if (octaveOffset > 0) {
    suffix = "'".repeat(octaveOffset);
  } else {
    suffix = ".".repeat(-octaveOffset);
  }
  return `${baseLabel}${suffix}`;
}

function getNoteByLabel(label) {
  const baseLabel = label.replace(/[.']+$/, "");
  const suffix = label.slice(baseLabel.length);
  const baseIndex = NOTE_LABELS.indexOf(baseLabel);
  if (baseIndex === -1) {
    return null;
  }
  let octaveOffset = 0;
  if (suffix) {
    if (/^'+$/.test(suffix)) {
      octaveOffset = suffix.length;
    } else if (/^\.+$/.test(suffix)) {
      octaveOffset = -suffix.length;
    } else {
      return null;
    }
  }
  return { id: label, label, semitone: baseIndex + 12 * octaveOffset };
}

function getClosestNote(tonicValue, pitch) {
  const noteValue = toNoteValue(tonicValue, pitch);
  if (!Number.isFinite(noteValue)) {
    return null;
  }
  const nearestSemitone = Math.round(noteValue);
  const label = labelForSemitone(nearestSemitone);
  const fractionOffset = noteValue - nearestSemitone;
  let displayLabel = label;
  if (Math.abs(fractionOffset) >= 0.005) {
    const sign = fractionOffset >= 0 ? "+" : "-";
    displayLabel = `${label} ${sign}${Math.abs(fractionOffset).toFixed(2)}`;
  }
  const note = { id: label, label, semitone: nearestSemitone };
  const cents = (noteValue - nearestSemitone) * 100;
  return { note, cents, semitone: nearestSemitone, displayLabel };
}

function getMatchResult({ pitch, pitchConfidence, tonicValue, targetLabel }) {
  if (pitch <= 0 || pitchConfidence < 0.7) {
    return null;
  }
  const closest = getClosestNote(tonicValue, pitch);
  if (!closest) {
    return null;
  }
  const tuned = Math.abs(closest.cents) <= IN_TUNE_CENTS;
  const matchesTarget = closest.note.label === targetLabel;
  const strong = pitchConfidence >= 0.7;
  return {
    closest,
    isGood: tuned && matchesTarget && strong,
  };
}

export {
  centsOffFrom,
  toNoteValue,
  getNoteByLabel,
  getClosestNote,
  getMatchResult,
};
