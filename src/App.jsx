import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  MAX_HISTORY,
  MIN_FREQUENCY,
  MAX_FREQUENCY,
  MODE_SEQUENCES,
  BASE_NOTES,
  STABLE_MS,
  ATTEMPT_COUNT,
  SAMPLE_FOLDER,
  TONIC_OPTIONS,
  DEFAULT_TEMPO_BPM,
  UTTERANCE_SILENCE_THRESHOLD,
  TARGET_NOTE_GAP_MS,
} from "./constants";
import { computeRms, yinPitch } from "./pitch/yin";
import { getMatchResult, getNoteByLabel, toNoteValue } from "./utils/notes";
import {
  createUtterance,
  addPitchSample,
  detectUtteranceEnd,
  checkStability,
  checkExpectedNote,
  checkExpectedLength,
  checkExpectedTiming,
  generateSuggestions,
  finalizeUtterance,
} from "./utils/utterance";
import {
  createMetronome,
  getExpectedStartTime,
  resetMetronome,
} from "./utils/metronome";
import ControlsPanel from "./components/ControlsPanel";
import PitchPanel from "./components/PitchPanel";

function App() {
  const [audioReady, setAudioReady] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isDroneOn, setIsDroneOn] = useState(false);
  const [mode, setMode] = useState("sargam");
  const [tonic, setTonic] = useState(TONIC_OPTIONS[21].freq);
  const [targetIndex, setTargetIndex] = useState(0);
  const [detectedPitch, setDetectedPitch] = useState(0);
  const [detectedNote, setDetectedNote] = useState("");
  const [centsOff, setCentsOff] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const [inTune, setInTune] = useState(false);
  const [suggestion, setSuggestion] = useState(
    "Start listening to get feedback.",
  );
  const [status, setStatus] = useState("Click Start to initialize audio.");
  const [sampleBuffers, setSampleBuffers] = useState({});
  const [isCallAndResponseActive, setIsCallAndResponseActive] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState(ATTEMPT_COUNT);
  const [tempo, setTempo] = useState(DEFAULT_TEMPO_BPM);
  const [currentUtterance, setCurrentUtterance] = useState(null);

  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const micStreamRef = useRef(null);
  const micSourceRef = useRef(null);
  const droneOscRef = useRef(null);
  const droneGainRef = useRef(null);
  const rafRef = useRef(null);
  const callAndResponseActiveRef = useRef(false);
  const attemptsLeftRef = useRef(ATTEMPT_COUNT);
  const notePlayCountsRef = useRef({});
  const pitchHistoryRef = useRef([]);
  const pitchHistoryTimestampsRef = useRef([]);
  const canvasRef = useRef(null);
  const lastUiUpdateRef = useRef(0);
  const pitchErrorRef = useRef(false);
  const samplesLoadedRef = useRef(false);
  const targetIndexRef = useRef(targetIndex);
  const modeRef = useRef(mode);
  const tonicRef = useRef(tonic);
  const tempoRef = useRef(tempo);

  // Utterance tracking
  const currentUtteranceRef = useRef(null);
  const utterancesRef = useRef([]);
  const metronomeRef = useRef(null);
  const expectedStartTimesRef = useRef([]);
  const wasSilentRef = useRef(true);
  const targetNotePlayTimeRef = useRef(null);
  const targetNoteDurationRef = useRef(1200); // Default 1.2 seconds for oscillator

  const sequence = useMemo(() => MODE_SEQUENCES[mode], [mode]);
  const sequenceNotes = useMemo(() => sequence.notes || [], [sequence]);
  const sequenceDurations = useMemo(() => sequence.durations || [], [sequence]);
  const targetLabel = sequenceNotes[targetIndex];
  const sequenceOptions = useMemo(
    () =>
      Object.entries(MODE_SEQUENCES).map(([key, seq]) => ({
        key,
        label: (seq.notes || seq).join(" "),
      })),
    [],
  );
  const sampleLabels = useMemo(() => {
    const labels = new Set(BASE_NOTES.map((note) => note.label));
    Object.values(MODE_SEQUENCES).forEach((modeSequence) => {
      const notes = modeSequence.notes || modeSequence;
      notes.forEach((label) => labels.add(label));
    });
    return Array.from(labels);
  }, []);

  useEffect(() => {
    targetIndexRef.current = targetIndex;
  }, [targetIndex]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    tonicRef.current = tonic;
  }, [tonic]);

  useEffect(() => {
    callAndResponseActiveRef.current = isCallAndResponseActive;
  }, [isCallAndResponseActive]);

  useEffect(() => {
    tempoRef.current = tempo;
  }, [tempo]);

  const ensureAudioContext = async () => {
    if (audioCtxRef.current) {
      if (audioCtxRef.current.state === "suspended") {
        await audioCtxRef.current.resume();
      }
      return audioCtxRef.current;
    }
    const audioCtxCtor =
      globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!audioCtxCtor) {
      throw new Error("AudioContext is not supported in this browser.");
    }
    const audioCtx = new audioCtxCtor();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0.8;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);
    audioCtxRef.current = audioCtx;
    analyserRef.current = analyser;
    micStreamRef.current = stream;
    micSourceRef.current = source;
    setAudioReady(true);
    return audioCtx;
  };

  const loadVocalSamples = async (audioCtx) => {
    if (samplesLoadedRef.current) {
      return;
    }
    setStatus("Loading vocalist samples...");
    const entries = await Promise.all(
      sampleLabels.map(async (label) => {
        const extension = "mp3";
        const encodedLabel = encodeURIComponent(label);
        const url = `${SAMPLE_FOLDER}/${encodedLabel}.${extension}`;
        const response = await fetch(url);
        if (!response.ok) {
          return null;
        }
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        return [label, audioBuffer];
      }),
    );
    setSampleBuffers((prev) => {
      const next = { ...prev };
      entries.forEach((entry) => {
        if (!entry) {
          return;
        }
        const [label, buffer] = entry;
        next[label] = buffer;
      });
      return next;
    });
    samplesLoadedRef.current = true;
  };

  const handleStart = async () => {
    try {
      setStatus("Requesting microphone access...");
      const audioCtx = await ensureAudioContext();
      await loadVocalSamples(audioCtx);
      setIsListening(true);
      setStatus("Audio ready. Play the target note and sing.");
    } catch (error) {
      console.error("Microphone access error:", error);
      setStatus("Microphone access denied.");
    }
  };

  const handleStop = () => {
    setIsListening(false);
    setIsDroneOn(false);
    setIsCallAndResponseActive(false);
    callAndResponseActiveRef.current = false;
    resetUtterance();
    if (droneOscRef.current) {
      droneOscRef.current.stop();
      droneOscRef.current.disconnect();
      droneOscRef.current = null;
    }
    if (droneGainRef.current) {
      droneGainRef.current.disconnect();
      droneGainRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    setAudioReady(false);
    setStatus("Audio stopped.");
  };

  const playOscillator = (frequency, duration = 1) => {
    const audioCtx = audioCtxRef.current;
    if (!audioCtx) {
      return;
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.3, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  };

  const playSample = (buffer) => {
    const audioCtx = audioCtxRef.current;
    if (!audioCtx || !buffer) {
      return null;
    }
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start();
    return buffer.duration * 1000; // Return duration in milliseconds
  };

  const playTargetNote = (label = targetLabel) => {
    const note = getNoteByLabel(label);
    if (!note) {
      return;
    }
    const targetFreq = tonic * Math.pow(2, note.semitone / 12);
    const buffer = sampleBuffers[label];
    const now = Date.now();
    targetNotePlayTimeRef.current = now;

    notePlayCountsRef.current = {
      ...notePlayCountsRef.current,
      [label]: (notePlayCountsRef.current[label] || 0) + 1,
    };

    if (buffer) {
      const duration = playSample(buffer);
      targetNoteDurationRef.current = duration || 1200; // Fallback to 1.2s if duration unavailable
    } else {
      playOscillator(targetFreq, 1.2);
      targetNoteDurationRef.current = 1200; // 1.2 seconds for oscillator
    }
  };

  const resetUtterance = () => {
    if (currentUtteranceRef.current) {
      finalizeUtterance(currentUtteranceRef.current);
      utterancesRef.current.push(currentUtteranceRef.current);
    }
    currentUtteranceRef.current = null;
    setCurrentUtterance(null);
    wasSilentRef.current = true;
    targetNotePlayTimeRef.current = null;
  };

  const resetAttempts = () => {
    attemptsLeftRef.current = ATTEMPT_COUNT;
    setAttemptsLeft(ATTEMPT_COUNT);
  };

  const initializeMetronome = () => {
    const currentSequence = MODE_SEQUENCES[modeRef.current];
    const durations =
      currentSequence.durations || currentSequence.notes.map(() => 1000);
    metronomeRef.current = createMetronome(tempoRef.current);

    // Expected start times will be calculated when target note is played
    // based on: target note play time + duration + gap
    expectedStartTimesRef.current = [];
  };

  const getExpectedStartTimeForCurrentNote = () => {
    if (targetNotePlayTimeRef.current === null) {
      return Date.now();
    }
    // Expected start = when target note was played + note duration + gap
    return (
      targetNotePlayTimeRef.current +
      targetNoteDurationRef.current +
      TARGET_NOTE_GAP_MS
    );
  };

  const startCallAndResponse = () => {
    if (!audioReady) {
      return;
    }
    callAndResponseActiveRef.current = true;
    setIsCallAndResponseActive(true);
    resetAttempts();
    resetUtterance();
    initializeMetronome();
    playTargetNote();
  };

  const toggleDrone = () => {
    const audioCtx = audioCtxRef.current;
    if (!audioCtx) {
      return;
    }
    if (isDroneOn) {
      if (droneOscRef.current) {
        droneOscRef.current.stop();
        droneOscRef.current.disconnect();
      }
      if (droneGainRef.current) {
        droneGainRef.current.disconnect();
      }
      droneOscRef.current = null;
      droneGainRef.current = null;
      setIsDroneOn(false);
      return;
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = tonic;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    droneOscRef.current = osc;
    droneGainRef.current = gain;
    setIsDroneOn(true);
  };

  const updatePitchUi = (pitch, pitchConfidence, hasSignal) => {
    const history = pitchHistoryRef.current;
    const timestamps = pitchHistoryTimestampsRef.current;
    const now = Date.now();

    history.push(hasSignal ? Math.max(pitch, 0) : null);
    timestamps.push(now);

    if (history.length > MAX_HISTORY) {
      history.shift();
      timestamps.shift();
    }

    if (now - lastUiUpdateRef.current > 80) {
      lastUiUpdateRef.current = now;
      setDetectedPitch(pitch);
      setConfidence(pitchConfidence);
    }
  };

  const updateUtteranceState = (pitch, pitchConfidence, rms) => {
    const tonicValue = tonicRef.current;
    const currentSequence = MODE_SEQUENCES[modeRef.current];
    const sequenceNotes = currentSequence.notes || currentSequence;
    const sequenceDurations =
      currentSequence.durations || sequenceNotes.map(() => 1000);
    const currentTarget = sequenceNotes[targetIndexRef.current];
    const now = Date.now();

    const hasSignal =
      rms >= UTTERANCE_SILENCE_THRESHOLD && pitch > 0 && pitchConfidence >= 0.3;
    const isSilent = !hasSignal;

    // Detect utterance end
    if (currentUtteranceRef.current && isSilent) {
      const ended = detectUtteranceEnd(
        currentUtteranceRef.current.pitchSamples,
        rms,
        UTTERANCE_SILENCE_THRESHOLD,
      );
      if (ended) {
        finalizeUtterance(currentUtteranceRef.current);
        utterancesRef.current.push(currentUtteranceRef.current);

        // Check if utterance was successful and move to next note
        const utterance = currentUtteranceRef.current;
        const allChecksPassed =
          utterance.checks.isStable === true &&
          utterance.checks.isExpectedNote === true &&
          utterance.checks.isExpectedLength === true &&
          utterance.checks.isAtExpectedTime === true;

        if (allChecksPassed && callAndResponseActiveRef.current) {
          const nextIndex = (targetIndexRef.current + 1) % sequenceNotes.length;
          resetAttempts();
          setTargetIndex(nextIndex);
          initializeMetronome(); // Reset metronome for next sequence
          playTargetNote(sequenceNotes[nextIndex]);
        } else if (callAndResponseActiveRef.current) {
          const newAttemptsLeft = Math.max(0, attemptsLeftRef.current - 1);
          attemptsLeftRef.current = newAttemptsLeft;
          setAttemptsLeft(newAttemptsLeft);
          if (newAttemptsLeft > 0) {
            playTargetNote(sequenceNotes[targetIndexRef.current]);
          } else {
            resetAttempts();
            initializeMetronome();
            playTargetNote(sequenceNotes[targetIndexRef.current]);
          }
        }

        currentUtteranceRef.current = null;
        setCurrentUtterance(null);
        wasSilentRef.current = true;
      }
    }

    // Detect utterance start (transition from silence to pitch)
    if (!currentUtteranceRef.current && hasSignal && wasSilentRef.current) {
      // Calculate expected start time based on when target note was played + duration + gap
      const expectedStartTime = getExpectedStartTimeForCurrentNote();
      const expectedDuration =
        sequenceDurations[targetIndexRef.current] || 1000;
      currentUtteranceRef.current = createUtterance(
        currentTarget,
        expectedStartTime,
        expectedDuration,
      );
      setCurrentUtterance({ ...currentUtteranceRef.current });
      wasSilentRef.current = false;
    }

    // Update current utterance with pitch sample
    if (currentUtteranceRef.current && hasSignal) {
      addPitchSample(currentUtteranceRef.current, pitch, pitchConfidence, now);

      // Run checks in real-time
      const stabilityCheck = checkStability(
        currentUtteranceRef.current,
        tonicValue,
      );
      const noteCheck = checkExpectedNote(
        currentUtteranceRef.current,
        tonicValue,
        currentTarget,
      );
      const lengthCheck = checkExpectedLength(currentUtteranceRef.current);
      const timingCheck = checkExpectedTiming(currentUtteranceRef.current);

      // Update checks
      currentUtteranceRef.current.checks.isStable = stabilityCheck.isStable;
      currentUtteranceRef.current.checks.isExpectedNote =
        noteCheck.isExpectedNote;
      currentUtteranceRef.current.checks.isExpectedLength =
        lengthCheck.isExpectedLength;
      currentUtteranceRef.current.checks.isAtExpectedTime =
        timingCheck.isAtExpectedTime;

      // Generate suggestions
      currentUtteranceRef.current.suggestions = generateSuggestions(
        currentUtteranceRef.current,
        {
          stability: stabilityCheck,
          expectedNote: noteCheck,
          expectedLength: lengthCheck,
          expectedTiming: timingCheck,
        },
      );

      // Update state periodically (throttled to avoid too many re-renders)
      if (now - lastUiUpdateRef.current > 200) {
        setCurrentUtterance({ ...currentUtteranceRef.current });
      }

      // Update UI state for display
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
    } else if (isSilent) {
      wasSilentRef.current = true;
      setDetectedNote("");
      setCentsOff(0);
      setInTune(false);
    }

    return currentUtteranceRef.current;
  };

  const updateSuggestion = (utterance, rms, pitch, pitchConfidence) => {
    if (rms < UTTERANCE_SILENCE_THRESHOLD) {
      setSuggestion("Sing louder for a clear pitch.");
      return;
    }
    if (!pitch || pitchConfidence < 0.3) {
      setSuggestion("Sing louder for a clearer pitch.");
      return;
    }

    // Use utterance-based suggestions if available
    if (utterance && utterance.suggestions.length > 0) {
      setSuggestion(utterance.suggestions.join(" "));
      return;
    }

    // Fallback to basic suggestion
    if (utterance) {
      const allChecksPassed =
        utterance.checks.isStable === true &&
        utterance.checks.isExpectedNote === true &&
        utterance.checks.isExpectedLength === true &&
        utterance.checks.isAtExpectedTime === true;

      if (allChecksPassed) {
        setSuggestion("Perfect! All checks passed.");
        return;
      }
    }

    setSuggestion("Start listening to get feedback.");
  };

  useEffect(() => {
    if (!isListening || !analyserRef.current || !audioCtxRef.current) {
      return () => {};
    }
    const analyser = analyserRef.current;
    const audioCtx = audioCtxRef.current;
    const buffer = new Float32Array(analyser.fftSize);

    const loop = () => {
      analyser.getFloatTimeDomainData(buffer);
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

      const hasSignal = rms >= UTTERANCE_SILENCE_THRESHOLD;
      updatePitchUi(pitch, pitchConfidence, hasSignal);
      const utterance = updateUtteranceState(pitch, pitchConfidence, rms);
      updateSuggestion(utterance, rms, pitch, pitchConfidence);

      drawPitchGraph();
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isListening]);

  useEffect(() => {
    if (!audioReady) {
      return;
    }
    setStatus(
      isListening ? "Listening for your pitch..." : "Listening paused.",
    );
  }, [isListening, audioReady]);

  const getCanvasMetrics = () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return null;
    }
    const ctx = canvas.getContext("2d");
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const dpr = globalThis.devicePixelRatio || 1;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    }
    return { canvas, ctx, width, height };
  };

  const getPitchRange = (tonicValue) => {
    const minFreq = tonicValue * Math.pow(2, -1);
    const maxFreq = tonicValue * Math.pow(2, 1.5);
    const minLog = Math.log2(minFreq);
    const maxLog = Math.log2(maxFreq);
    return { minFreq, maxFreq, minLog, maxLog, logRange: maxLog - minLog };
  };

  const makeYMapper = (height, minLog, logRange) => (freq) => {
    const normalized = (Math.log2(freq) - minLog) / logRange;
    return height - Math.min(Math.max(normalized, 0), 1) * height;
  };

  const drawGridLines = (
    ctx,
    width,
    toY,
    tonicValue,
    minFreq,
    maxFreq,
    activeLabels,
  ) => {
    ctx.lineWidth = 1;
    const octaveOffsets = [-24, -12, 0, 12, 24];
    octaveOffsets.forEach((offset) => {
      BASE_NOTES.forEach((note) => {
        const freq = tonicValue * Math.pow(2, (note.semitone + offset) / 12);
        if (freq < minFreq || freq > maxFreq) {
          return;
        }
        ctx.strokeStyle = activeLabels.has(note.label)
          ? "#22293a"
          : "rgba(34, 41, 58, 0.5)";
        const y = toY(freq);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      });
    });
  };

  const drawTargetLine = (ctx, width, toY, tonicValue, minFreq, maxFreq) => {
    const currentSequence = MODE_SEQUENCES[modeRef.current];
    const sequenceNotes = currentSequence.notes || currentSequence;
    const currentTargetLabel = sequenceNotes[targetIndexRef.current];
    const targetNote = getNoteByLabel(currentTargetLabel);
    if (!targetNote) {
      return;
    }
    const targetSemitone = targetNote.semitone;
    const targetFreq = tonicValue * Math.pow(2, targetSemitone / 12);
    if (targetFreq < minFreq || targetFreq > maxFreq) {
      return;
    }
    const y = toY(targetFreq);
    ctx.strokeStyle = "#ffb347";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  const drawPitchHistory = (ctx, width, toY, history) => {
    ctx.strokeStyle = "#5b6cff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    let hasStarted = false;
    history.forEach((freq, index) => {
      if (freq === null || freq <= 0) {
        hasStarted = false;
        return;
      }
      const x = (index / (MAX_HISTORY - 1)) * width;
      const y = toY(freq);
      if (hasStarted) {
        ctx.lineTo(x, y);
      } else {
        ctx.moveTo(x, y);
        hasStarted = true;
      }
    });
    ctx.stroke();
  };

  const drawExpectedTiming = (
    ctx,
    width,
    height,
    toY,
    utterance,
    timestamps,
    tonicValue,
    minFreq,
    maxFreq,
  ) => {
    if (!utterance || timestamps.length === 0) {
      return;
    }

    const now = Date.now();
    const oldestTimestamp = timestamps[0];
    const timeRange = Math.max(now - oldestTimestamp, 1000); // Minimum 1 second range

    // Check if utterance has scrolled off the left side - if so, don't draw it
    // We check if the expected end time is before the oldest timestamp
    const expectedEndTime =
      utterance.expectedStartTime + utterance.expectedDuration;
    if (expectedEndTime < oldestTimestamp) {
      return; // Utterance has scrolled off, don't draw
    }

    // Get target note frequency
    const targetNote = getNoteByLabel(utterance.expectedNote);
    if (!targetNote) {
      return;
    }
    const targetFreq = tonicValue * Math.pow(2, targetNote.semitone / 12);
    if (targetFreq < minFreq || targetFreq > maxFreq) {
      return;
    }
    const targetY = toY(targetFreq);

    // Draw expected start time (vertical line) - green dashed line
    // Only draw if it's still visible (not scrolled off the left)
    const expectedStartRelativeTime =
      utterance.expectedStartTime - oldestTimestamp;
    if (
      expectedStartRelativeTime >= -timeRange * 0.1 &&
      expectedStartRelativeTime <= timeRange * 1.1
    ) {
      const x = Math.max(
        0,
        Math.min(width, (expectedStartRelativeTime / timeRange) * width),
      );
      ctx.strokeStyle = "#90EE90";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label at top (only if not too close to left edge)
      if (x > 80) {
        ctx.fillStyle = "#90EE90";
        ctx.font = "11px sans-serif";
        ctx.textAlign = "left";
        const labelX = Math.max(2, Math.min(x + 2, width - 80));
        ctx.fillText("Expected Start", labelX, 14);
      }
    }

    // Draw expected duration bar (horizontal bar showing expected time range)
    // Only draw if any part of it is still visible
    const expectedStartX = Math.max(
      0,
      Math.min(
        width,
        ((utterance.expectedStartTime - oldestTimestamp) / timeRange) * width,
      ),
    );
    const expectedDurationWidth =
      (utterance.expectedDuration / timeRange) * width;
    const expectedEndX = Math.min(
      width,
      expectedStartX + expectedDurationWidth,
    );

    // Only draw if the expected duration bar is at least partially visible
    if (expectedEndX > 0 && expectedStartX < width) {
      // Draw expected duration outline (green dashed rectangle)
      ctx.strokeStyle = "#90EE90";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(expectedStartX, targetY - 8, expectedDurationWidth, 16);
      ctx.setLineDash([]);

      // Fill with semi-transparent green
      ctx.fillStyle = "rgba(144, 238, 144, 0.15)";
      ctx.fillRect(expectedStartX, targetY - 8, expectedDurationWidth, 16);

      // Label for expected duration (only if visible)
      if (expectedStartX > 100) {
        ctx.fillStyle = "#90EE90";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "left";
        const durationLabelX = Math.max(
          2,
          Math.min(expectedStartX + 2, width - 100),
        );
        ctx.fillText(
          `Expected: ${utterance.expectedDuration}ms`,
          durationLabelX,
          targetY - 12,
        );
      }
    }

    // Draw actual utterance duration (if it exists and is visible)
    const currentTime = utterance.endTime || now;
    const actualStartRelativeTime = utterance.startTime - oldestTimestamp;
    const actualEndRelativeTime = currentTime - oldestTimestamp;

    // Only draw if actual utterance is at least partially visible
    if (
      actualEndRelativeTime > 0 &&
      actualStartRelativeTime < timeRange * 1.1
    ) {
      const actualStartX = Math.max(
        0,
        Math.min(width, (actualStartRelativeTime / timeRange) * width),
      );
      const actualEndX = Math.max(
        0,
        Math.min(width, (actualEndRelativeTime / timeRange) * width),
      );
      const actualWidth = Math.max(2, actualEndX - actualStartX);

      // Only draw if width is positive and visible
      if (actualWidth > 0 && actualEndX > 0 && actualStartX < width) {
        // Calculate pitch extents from utterance pitch samples
        let minPitch = 0;
        let maxPitch = 0;
        let minY = targetY;
        let maxY = targetY;

        if (utterance.pitchSamples && utterance.pitchSamples.length > 0) {
          // Get valid pitch samples (with pitch > 0)
          const validSamples = utterance.pitchSamples.filter(
            (s) => s.pitch > 0,
          );
          if (validSamples.length > 0) {
            // Find min and max pitch
            const pitches = validSamples.map((s) => s.pitch);
            minPitch = Math.min(...pitches);
            maxPitch = Math.max(...pitches);

            // Convert to Y positions, clamping to visible range
            if (minPitch >= minFreq && minPitch <= maxFreq) {
              maxY = toY(minPitch); // Lower pitch = higher Y on canvas
            }
            if (maxPitch >= minFreq && maxPitch <= maxFreq) {
              minY = toY(maxPitch); // Higher pitch = lower Y on canvas
            }

            // Ensure minY < maxY (minY should be above maxY visually)
            if (minY > maxY) {
              const temp = minY;
              minY = maxY;
              maxY = temp;
            }
          } else if (utterance.startingPitch) {
            // Fallback to starting pitch with small range
            const pitch = utterance.startingPitch;
            if (pitch >= minFreq && pitch <= maxFreq) {
              const centerY = toY(pitch);
              minY = centerY - 6;
              maxY = centerY + 6;
            }
          }
        } else if (utterance.startingPitch) {
          // Fallback to starting pitch with small range
          const pitch = utterance.startingPitch;
          if (pitch >= minFreq && pitch <= maxFreq) {
            const centerY = toY(pitch);
            minY = centerY - 6;
            maxY = centerY + 6;
          }
        }

        // Ensure minimum height for visibility
        const boxHeight = Math.max(12, maxY - minY);
        const centerY = (minY + maxY) / 2;
        minY = centerY - boxHeight / 2;
        maxY = centerY + boxHeight / 2;

        // Draw actual duration bar (orange/blue) covering pitch extents
        ctx.fillStyle = utterance.endTime
          ? "rgba(255, 179, 71, 0.4)"
          : "rgba(91, 108, 255, 0.4)";
        ctx.fillRect(actualStartX, minY, actualWidth, boxHeight);

        // Draw border
        ctx.strokeStyle = utterance.endTime ? "#ffb347" : "#5b6cff";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(actualStartX, minY, actualWidth, boxHeight);
      }
    }
  };

  const drawPitchGraph = () => {
    const metrics = getCanvasMetrics();
    if (!metrics) {
      return;
    }
    const { ctx, width, height } = metrics;
    ctx.clearRect(0, 0, width, height);

    const history = pitchHistoryRef.current;
    const timestamps = pitchHistoryTimestampsRef.current;
    const tonicValue = tonicRef.current;
    const { minFreq, maxFreq, minLog, logRange } = getPitchRange(tonicValue);
    const toY = makeYMapper(height, minLog, logRange);
    const currentSequence = MODE_SEQUENCES[modeRef.current];
    const sequenceNotes = currentSequence.notes || currentSequence;
    const activeLabels = new Set(
      sequenceNotes.map((label) => label.replace(/[.']+$/, "")),
    );

    drawGridLines(ctx, width, toY, tonicValue, minFreq, maxFreq, activeLabels);
    drawTargetLine(ctx, width, toY, tonicValue, minFreq, maxFreq);

    // Draw expected timing indicators for all utterances that are still visible
    // (including completed ones that haven't scrolled off the left side)
    if (timestamps.length > 0) {
      const oldestTimestamp = timestamps[0];

      // Clean up utterances that have scrolled off the left side
      utterancesRef.current = utterancesRef.current.filter((utterance) => {
        const expectedEndTime =
          utterance.expectedStartTime + utterance.expectedDuration;
        return expectedEndTime >= oldestTimestamp; // Keep if still visible
      });

      // Draw all completed utterances
      utterancesRef.current.forEach((utterance) => {
        drawExpectedTiming(
          ctx,
          width,
          height,
          toY,
          utterance,
          timestamps,
          tonicValue,
          minFreq,
          maxFreq,
        );
      });

      // Draw current utterance if it exists
      if (currentUtteranceRef.current) {
        drawExpectedTiming(
          ctx,
          width,
          height,
          toY,
          currentUtteranceRef.current,
          timestamps,
          tonicValue,
          minFreq,
          maxFreq,
        );
      }
    }

    drawPitchHistory(ctx, width, toY, history);
  };

  useEffect(() => {
    setTargetIndex(0);
    resetAttempts();
  }, [mode]);

  return (
    <div className="app">
      <header className="header">
        <h1>Indian Classical Music Trainer</h1>
      </header>

      <ControlsPanel
        audioReady={audioReady}
        isDroneOn={isDroneOn}
        tonic={tonic}
        tonicOptions={TONIC_OPTIONS}
        tempo={tempo}
        onStart={handleStart}
        onStop={handleStop}
        onPlayTargetNote={startCallAndResponse}
        onToggleDrone={toggleDrone}
        onTonicChange={(event) => setTonic(Number(event.target.value))}
        onTempoChange={(event) => setTempo(Number(event.target.value))}
      />

      <PitchPanel
        detectedPitch={detectedPitch}
        detectedNote={detectedNote}
        centsOff={centsOff}
        confidence={confidence}
        inTune={inTune}
        suggestion={suggestion}
        attemptsLeft={attemptsLeft}
        canvasRef={canvasRef}
        status={status}
        targetLabel={targetLabel}
        sequence={sequenceNotes}
        targetIndex={targetIndex}
        sequenceOptions={sequenceOptions}
        mode={mode}
        onModeChange={(event) => setMode(event.target.value)}
        currentUtterance={currentUtterance}
      />
    </div>
  );
}

export default App;
