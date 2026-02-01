const BASE_NOTES = [
  { id: "S", label: "S", semitone: 0 },
  { id: "R1", label: "R1", semitone: 1 },
  { id: "R2", label: "R2", semitone: 2 },
  { id: "G1", label: "G1", semitone: 3 },
  { id: "G2", label: "G2", semitone: 4 },
  { id: "M1", label: "M1", semitone: 5 },
  { id: "M2", label: "M2", semitone: 6 },
  { id: "P", label: "P", semitone: 7 },
  { id: "D1", label: "D1", semitone: 8 },
  { id: "D2", label: "D2", semitone: 9 },
  { id: "N1", label: "N1", semitone: 10 },
  { id: "N2", label: "N2", semitone: 11 },
];

const NOTE_DEFS = [
  ...BASE_NOTES,
  ...BASE_NOTES.map((note) => ({
    ...note,
    id: `${note.id}-low`,
    semitone: note.semitone - 12,
  })),
  ...BASE_NOTES.map((note) => ({
    ...note,
    id: `${note.id}-high`,
    semitone: note.semitone + 12,
  })),
];

const MODE_SEQUENCES = {
  sp: {
    notes: ["S", "P"],
    durations: [1000, 1000],
  },
  sps: {
    notes: ["S", "P", "S'"],
    durations: [1000, 1000, 1000],
  },
  sargam: {
    notes: ["S", "R2", "G2", "M1", "P", "D2", "N2", "S'"],
    durations: [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000],
  },
};

const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

const TONIC_OPTIONS = Array.from({ length: (6 - 3 + 1) * 12 }, (_, index) => {
  const midi = 12 * (3 + Math.floor(index / 12)) + (index % 12);
  const label = `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  return { label, freq };
});

const MAX_HISTORY = 200;
const IN_TUNE_CENTS = 50;
const STABLE_MS = 500;
const ATTEMPT_COUNT = 2;
const YIN_THRESHOLD = 0.15;
const MIN_FREQUENCY = 60;
const MAX_FREQUENCY = 1000;
const SAMPLE_FOLDER = `${import.meta.env.BASE_URL}assets/vocalist`;

// Utterance detection constants
const UTTERANCE_SILENCE_THRESHOLD = 0.01; // RMS threshold for silence detection
const STABILITY_THRESHOLD_SEMITONES = 0.5; // Semitone threshold for stability check
const DEFAULT_TEMPO_BPM = 60; // Default tempo in beats per minute
const TIMING_TOLERANCE_MS = Infinity; // Tolerance for timing check in milliseconds
const LENGTH_TOLERANCE_MS = 1000; // Tolerance for length check in milliseconds
const UTTERANCE_SILENCE_DURATION_MS = 100; // Duration of silence to detect utterance end
const TARGET_NOTE_GAP_MS = 500; // Gap after target note finishes before expected start
const NEXT_TARGET_NOTE_WAIT_DURATION_MS = 500; // Wait duration before playing next target note after utterance ends

export {
  BASE_NOTES,
  NOTE_DEFS,
  MODE_SEQUENCES,
  TONIC_OPTIONS,
  MAX_HISTORY,
  IN_TUNE_CENTS,
  STABLE_MS,
  ATTEMPT_COUNT,
  YIN_THRESHOLD,
  MIN_FREQUENCY,
  MAX_FREQUENCY,
  SAMPLE_FOLDER,
  UTTERANCE_SILENCE_THRESHOLD,
  STABILITY_THRESHOLD_SEMITONES,
  DEFAULT_TEMPO_BPM,
  TIMING_TOLERANCE_MS,
  LENGTH_TOLERANCE_MS,
  UTTERANCE_SILENCE_DURATION_MS,
  TARGET_NOTE_GAP_MS,
  NEXT_TARGET_NOTE_WAIT_DURATION_MS,
};
