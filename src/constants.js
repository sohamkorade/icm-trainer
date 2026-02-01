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
  sp: ["S", "P"],
  sps: ["S", "P", "S'"],
  sargam: ["S", "R2", "G2", "M1", "P", "D2", "N2", "S'"],
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
const YIN_THRESHOLD = 0.15;
const MIN_FREQUENCY = 60;
const MAX_FREQUENCY = 1000;
const SAMPLE_FOLDER = `${import.meta.env.BASE_URL}vocalist`;

export {
  BASE_NOTES,
  NOTE_DEFS,
  MODE_SEQUENCES,
  TONIC_OPTIONS,
  MAX_HISTORY,
  IN_TUNE_CENTS,
  STABLE_MS,
  YIN_THRESHOLD,
  MIN_FREQUENCY,
  MAX_FREQUENCY,
  SAMPLE_FOLDER,
};
