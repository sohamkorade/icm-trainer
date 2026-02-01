import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  MAX_HISTORY,
  MODE_SEQUENCES,
  ATTEMPT_COUNT,
  SAMPLE_FOLDER,
  TONIC_OPTIONS,
  DEFAULT_TEMPO_BPM,
  UTTERANCE_SILENCE_THRESHOLD,
  TARGET_NOTE_GAP_MS,
  BASE_NOTES,
  NEXT_TARGET_NOTE_WAIT_DURATION_MS,
  GRAPH_TIME_RANGE_MS,
  MIN_UTTERANCE_MS,
} from "./constants";
import { getNoteByLabel } from "./utils/notes";
import {
  createUtterance,
  addPitchSample,
  detectUtteranceEnd,
  finalizeUtterance,
} from "./utils/utterance";
import {
  handleUtteranceEnd,
  updateUtteranceChecks,
  updatePitchMatchUI,
} from "./utils/utteranceHandling";
import { createMetronome } from "./utils/metronome";
import { playOscillator, playSample } from "./utils/audio";
import { analyzeUserPitch, analyzeTrainerPitch } from "./utils/pitchTracking";
import {
  getCanvasMetrics,
  getPitchRange,
  makeYMapper,
  drawGridLines,
  drawPitchHistory,
  drawSuggestions,
} from "./utils/drawing";
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
  const [attemptsBeforeRepeat, setAttemptsBeforeRepeat] =
    useState(ATTEMPT_COUNT);
  const [currentUtterance, setCurrentUtterance] = useState(null);

  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const trainerAnalyserRef = useRef(null);
  const micStreamRef = useRef(null);
  const micSourceRef = useRef(null);
  const droneOscRef = useRef(null);
  const droneGainRef = useRef(null);
  const trainerSourceRef = useRef(null);
  const rafRef = useRef(null);
  const callAndResponseActiveRef = useRef(false);
  const attemptsLeftRef = useRef(ATTEMPT_COUNT);
  const notePlayCountsRef = useRef({});
  const pitchHistoryRef = useRef([]);
  const pitchHistoryTimestampsRef = useRef([]);
  const trainerPitchHistoryRef = useRef([]);
  const trainerPitchHistoryTimestampsRef = useRef([]);
  const canvasRef = useRef(null);
  const lastUiUpdateRef = useRef(0);
  const pitchErrorRef = useRef(false);
  const samplesLoadedRef = useRef(false);
  const targetIndexRef = useRef(targetIndex);
  const modeRef = useRef(mode);
  const tonicRef = useRef(tonic);
  const tempoRef = useRef(tempo);
  const attemptsBeforeRepeatRef = useRef(attemptsBeforeRepeat);

  // Utterance tracking
  const currentUtteranceRef = useRef(null);
  const utterancesRef = useRef([]);
  const metronomeRef = useRef(null);
  const expectedStartTimesRef = useRef([]);
  const wasSilentRef = useRef(true);
  const targetNotePlayTimeRef = useRef(null);
  const targetNoteDurationRef = useRef(1200); // Default 1.2 seconds for oscillator
  const nextTargetNoteTimeoutRef = useRef(null);
  const suggestionsRef = useRef([]); // Array of {message, timestamp, pitch}

  const sequence = useMemo(() => MODE_SEQUENCES[mode], [mode]);
  const sequenceNotes = useMemo(() => sequence.notes || [], [sequence]);
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

  useEffect(() => {
    attemptsBeforeRepeatRef.current = attemptsBeforeRepeat;
  }, [attemptsBeforeRepeat]);

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
      // startCallAndResponse();
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
    if (trainerAnalyserRef.current) {
      trainerAnalyserRef.current.disconnect();
      trainerAnalyserRef.current = null;
    }
    trainerSourceRef.current = null;
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

  const playOscillatorLocal = (frequency, duration = 1) => {
    playOscillator(
      audioCtxRef.current,
      frequency,
      duration,
      trainerAnalyserRef,
      trainerSourceRef,
    );
  };

  const playSampleLocal = (buffer, playbackRate = 1) => {
    return playSample(
      audioCtxRef.current,
      buffer,
      trainerAnalyserRef,
      trainerSourceRef,
      playbackRate,
    );
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
      // Original tonic of samples is A5
      // Calculate playback rate to detune samples based on current tonic
      // const originalTonic = 440; // A = 440 Hz
      // const playbackRate = tonic / originalTonic;
      const playbackRate = 1;
      const duration = playSampleLocal(buffer, playbackRate);
      targetNoteDurationRef.current = duration || 1200; // Fallback to 1.2s if duration unavailable
    } else {
      playOscillatorLocal(targetFreq, 1.2);
      targetNoteDurationRef.current = 1200; // 1.2 seconds for oscillator
    }
  };

  const scheduleNextTargetNote = (noteToPlay) => {
    // Clear any existing timeout (debounce behavior)
    if (nextTargetNoteTimeoutRef.current !== null) {
      clearTimeout(nextTargetNoteTimeoutRef.current);
      nextTargetNoteTimeoutRef.current = null;
    }
    // Schedule new timeout
    nextTargetNoteTimeoutRef.current = setTimeout(() => {
      playTargetNote(noteToPlay);
      nextTargetNoteTimeoutRef.current = null;
    }, NEXT_TARGET_NOTE_WAIT_DURATION_MS);
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
    // Don't clear trainer pitch history - keep previous occurrences visible
    // Don't clear suggestions - let them scroll off naturally
  };

  const resetAttempts = () => {
    const attempts = attemptsBeforeRepeatRef.current;
    attemptsLeftRef.current = attempts;
    setAttemptsLeft(attempts);
  };

  const initializeMetronome = () => {
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
    if (!audioReady && !audioCtxRef.current) {
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

    // Store user pitch (from microphone)
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

        // Run checks now that utterance has ended
        updateUtteranceChecks(
          currentUtteranceRef.current,
          tonicValue,
          currentTarget,
          setCurrentUtterance,
        );

        // Check if utterance duration is less than minimum threshold
        const utteranceDuration =
          currentUtteranceRef.current.endTime -
          currentUtteranceRef.current.startTime;

        if (utteranceDuration >= MIN_UTTERANCE_MS) {
          utterancesRef.current.push(currentUtteranceRef.current);

          // Add suggestions to graph after utterance ends
          const finalizedUtterance = currentUtteranceRef.current;
          if (
            finalizedUtterance.suggestions &&
            finalizedUtterance.suggestions.length > 0
          ) {
            // Use the average pitch from the utterance for y-position, or current pitch as fallback
            const validSamples = finalizedUtterance.pitchSamples.filter(
              (s) => s.pitch > 0 && s.confidence >= 0.3,
            );
            const avgPitch =
              validSamples.length > 0
                ? validSamples.reduce((sum, s) => sum + s.pitch, 0) /
                  validSamples.length
                : pitch || 0;

            finalizedUtterance.suggestions.forEach((suggestionMsg) => {
              addSuggestionToGraph(suggestionMsg, now, avgPitch);
            });
          }

          handleUtteranceEnd(
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
          );
        } else {
          // Ignore utterances shorter than MIN_UTTERANCE_MS
          // Just clear the current utterance without processing it
          currentUtteranceRef.current = null;
          setCurrentUtterance(null);
          wasSilentRef.current = true;
        }
      }
    }

    // Detect utterance start (transition from silence to pitch)
    if (!currentUtteranceRef.current && hasSignal && wasSilentRef.current) {
      // Clear any pending next target note timeout (debounce behavior)
      if (nextTargetNoteTimeoutRef.current !== null) {
        clearTimeout(nextTargetNoteTimeoutRef.current);
        nextTargetNoteTimeoutRef.current = null;
      }
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

      updatePitchMatchUI(
        pitch,
        pitchConfidence,
        tonicValue,
        currentTarget,
        setDetectedNote,
        setCentsOff,
        setInTune,
      );
    } else if (isSilent) {
      wasSilentRef.current = true;
      setDetectedNote("");
      setCentsOff(0);
      setInTune(false);
    }

    return currentUtteranceRef.current;
  };

  const addSuggestionToGraph = (message, timestamp, pitch) => {
    // Create a suggestion object with message, timestamp, and initial position
    // x and y will be calculated during drawing based on timestamp
    const suggestion = {
      message,
      timestamp: timestamp || Date.now(),
      pitch, // Store pitch for y-position calculation
    };
    suggestionsRef.current.push(suggestion);

    // Keep only recent suggestions (last 50)
    if (suggestionsRef.current.length > 50) {
      suggestionsRef.current.shift();
    }
  };

  const updateSuggestion = (utterance, rms, pitch, pitchConfidence) => {
    // Keep the old suggestion state for fallback display
    // Note: Suggestions are only added to graph after utterance ends
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
      const suggestionText = utterance.suggestions.join(" ");
      setSuggestion(suggestionText);
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
    const trainerBuffer = new Float32Array(4096); // Trainer analyser uses fftSize 4096

    const loop = () => {
      // Analyze microphone input (user pitch)
      analyser.getFloatTimeDomainData(buffer);
      const { pitch, pitchConfidence, rms, hasSignal } = analyzeUserPitch(
        buffer,
        audioCtx,
        pitchErrorRef,
      );

      updatePitchUi(pitch, pitchConfidence, hasSignal);

      // Analyze trainer audio buffer if it's playing
      analyzeTrainerPitch(
        trainerAnalyserRef,
        trainerBuffer,
        audioCtx,
        trainerPitchHistoryRef,
        trainerPitchHistoryTimestampsRef,
      );

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

  const drawPitchGraph = () => {
    const metrics = getCanvasMetrics(canvasRef.current);
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

    // Draw expected timing indicators for all utterances that are still visible
    // (including completed ones that haven't scrolled off the left side)
    if (timestamps.length > 0) {
      const now = Date.now();
      const windowStartTime = now - GRAPH_TIME_RANGE_MS;

      // Clean up utterances that have scrolled off the left side
      utterancesRef.current = utterancesRef.current.filter((utterance) => {
        const expectedEndTime =
          utterance.expectedStartTime + utterance.expectedDuration;
        return expectedEndTime >= windowStartTime; // Keep if still visible
      });

      // Clean up suggestions that have scrolled off the left side
      suggestionsRef.current = suggestionsRef.current.filter((suggestion) => {
        return suggestion.timestamp >= windowStartTime; // Keep if still visible
      });
    }

    // Draw trainer pitch (during target note playback) in orange
    // Break lines on gaps to prevent connecting separate utterances
    const trainerHistory = trainerPitchHistoryRef.current;
    const trainerTimestamps = trainerPitchHistoryTimestampsRef.current;
    if (trainerHistory.length > 0) {
      drawPitchHistory(
        ctx,
        width,
        toY,
        trainerHistory,
        trainerTimestamps,
        "#ff6b35",
        true, // breakOnGaps = true for trainer pitch
        500, // gapThresholdMs = 500ms
      );
    }

    // Draw user pitch in blue
    drawPitchHistory(ctx, width, toY, history, timestamps, "#5b6cff");

    // Draw suggestions on the graph
    drawSuggestions(
      ctx,
      width,
      height,
      toY,
      suggestionsRef.current,
      timestamps,
      tonicValue,
      minFreq,
      maxFreq,
    );
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
        attemptsBeforeRepeat={attemptsBeforeRepeat}
        onStart={handleStart}
        onStop={handleStop}
        onToggleDrone={toggleDrone}
        onTonicChange={(event) => setTonic(Number(event.target.value))}
        onTempoChange={(event) => setTempo(Number(event.target.value))}
        onAttemptsBeforeRepeatChange={(event) =>
          setAttemptsBeforeRepeat(Number(event.target.value))
        }
        onListen={startCallAndResponse}
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
