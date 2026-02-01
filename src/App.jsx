import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  MAX_HISTORY,
  MIN_FREQUENCY,
  MAX_FREQUENCY,
  MODE_SEQUENCES,
  BASE_NOTES,
  STABLE_MS,
  SAMPLE_EXTENSIONS,
  SAMPLE_FOLDER,
  TONIC_OPTIONS,
} from "./constants";
import { computeRms, yinPitch } from "./pitch/yin";
import { getMatchResult, getNoteByLabel, toNoteValue } from "./utils/notes";
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

  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const micStreamRef = useRef(null);
  const micSourceRef = useRef(null);
  const droneOscRef = useRef(null);
  const droneGainRef = useRef(null);
  const rafRef = useRef(null);
  const stableSinceRef = useRef(null);
  const pitchHistoryRef = useRef([]);
  const canvasRef = useRef(null);
  const lastUiUpdateRef = useRef(0);
  const pitchErrorRef = useRef(false);
  const samplesLoadedRef = useRef(false);
  const targetIndexRef = useRef(targetIndex);
  const modeRef = useRef(mode);
  const tonicRef = useRef(tonic);

  const sequence = useMemo(() => MODE_SEQUENCES[mode], [mode]);
  const targetLabel = sequence[targetIndex];
  const sequenceOptions = useMemo(
    () =>
      Object.entries(MODE_SEQUENCES).map(([key, notes]) => ({
        key,
        label: notes.join(" "),
      })),
    [],
  );
  const sampleLabels = useMemo(() => {
    const labels = new Set(BASE_NOTES.map((note) => note.label));
    Object.values(MODE_SEQUENCES).forEach((modeSequence) => {
      modeSequence.forEach((label) => labels.add(label));
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
        for (const extension of SAMPLE_EXTENSIONS) {
          const encodedLabel = encodeURIComponent(label);
          const url = `${SAMPLE_FOLDER}/${encodedLabel}.${extension}`;
          try {
            const response = await fetch(url);
            if (!response.ok) {
              continue;
            }
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            return [label, audioBuffer];
          } catch (error) {
            console.warn("Failed to load sample:", url, error);
            continue;
          }
        }
        return null;
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
      return;
    }
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start();
  };

  const playTargetNote = () => {
    const note = getNoteByLabel(targetLabel);
    if (!note) {
      return;
    }
    const targetFreq = tonic * Math.pow(2, note.semitone / 12);
    const buffer = sampleBuffers[targetLabel];
    if (buffer) {
      playSample(buffer);
      return;
    }
    playOscillator(targetFreq, 1.2);
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
    history.push(hasSignal ? Math.max(pitch, 0) : null);
    if (history.length > MAX_HISTORY) {
      history.shift();
    }

    const now = Date.now();
    if (now - lastUiUpdateRef.current > 80) {
      lastUiUpdateRef.current = now;
      setDetectedPitch(pitch);
      setConfidence(pitchConfidence);
    }
  };

  const updateMatchState = (pitch, pitchConfidence) => {
    const tonicValue = tonicRef.current;
    const currentSequence = MODE_SEQUENCES[modeRef.current];
    const currentTarget = currentSequence[targetIndexRef.current];
    const match = getMatchResult({
      pitch,
      pitchConfidence,
      tonicValue,
      targetLabel: currentTarget,
    });
    if (!match) {
      stableSinceRef.current = null;
      setDetectedNote("");
      setCentsOff(0);
      setInTune(false);
      return null;
    }

    setDetectedNote(match.closest.displayLabel || match.closest.note.label);
    setCentsOff(match.closest.cents);
    setInTune(match.isGood);
    if (!match.isGood) {
      stableSinceRef.current = null;
      return match;
    }

    const now = Date.now();
    if (!stableSinceRef.current) {
      stableSinceRef.current = now;
      return;
    }
    if (now - stableSinceRef.current >= STABLE_MS) {
      stableSinceRef.current = null;
      setTargetIndex((prev) => (prev + 1) % currentSequence.length);
    }
    return match;
  };

  const updateSuggestion = ({ pitch, pitchConfidence, rms, match }) => {
    if (rms < 0.01) {
      setSuggestion("Sing louder for a clear pitch.");
      return;
    }
    if (!pitch || pitchConfidence < 0.3) {
      setSuggestion("Sing louder for a clearer pitch.");
      return;
    }
    if (match?.isGood) {
      setSuggestion("In tune. Hold it steady.");
      return;
    }
    if (match?.closest) {
      const tonicValue = tonicRef.current;
      const target = getNoteByLabel(targetLabel);
      if (!target || !tonicValue) {
        setSuggestion("Sing louder for a clearer pitch.");
        return;
      }
      const noteValue = toNoteValue(tonicValue, pitch);
      const nearestTarget =
        target.semitone + 12 * Math.round((noteValue - target.semitone) / 12);
      const delta = nearestTarget - noteValue;
      const notesOff = Math.max(0.1, Math.round(Math.abs(delta) * 10) / 10);
      const direction = delta > 0 ? "up" : "down";
      setSuggestion(`Go ${direction} by ${notesOff} notes.`);
      return;
    }
    setSuggestion("Sing louder for a clearer pitch.");
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
      if (rms < 0.01) {
        pitch = 0;
        pitchConfidence = 0;
      }

      const hasSignal = rms >= 0.01;
      updatePitchUi(pitch, pitchConfidence, hasSignal);
      const match = updateMatchState(pitch, pitchConfidence);
      updateSuggestion({ pitch, pitchConfidence, rms, match });

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
    const currentTargetLabel = currentSequence[targetIndexRef.current];
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

  const drawPitchGraph = () => {
    const metrics = getCanvasMetrics();
    if (!metrics) {
      return;
    }
    const { ctx, width, height } = metrics;
    ctx.clearRect(0, 0, width, height);

    const history = pitchHistoryRef.current;
    const tonicValue = tonicRef.current;
    const { minFreq, maxFreq, minLog, logRange } = getPitchRange(tonicValue);
    const toY = makeYMapper(height, minLog, logRange);
    const currentSequence = MODE_SEQUENCES[modeRef.current];
    const activeLabels = new Set(
      currentSequence.map((label) => label.replace(/[.']+$/, "")),
    );

    drawGridLines(ctx, width, toY, tonicValue, minFreq, maxFreq, activeLabels);
    drawTargetLine(ctx, width, toY, tonicValue, minFreq, maxFreq);
    drawPitchHistory(ctx, width, toY, history);
  };

  useEffect(() => {
    setTargetIndex(0);
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
        onStart={handleStart}
        onStop={handleStop}
        onPlayTargetNote={playTargetNote}
        onToggleDrone={toggleDrone}
        onTonicChange={(event) => setTonic(Number(event.target.value))}
      />

      <PitchPanel
        detectedPitch={detectedPitch}
        detectedNote={detectedNote}
        centsOff={centsOff}
        confidence={confidence}
        inTune={inTune}
        suggestion={suggestion}
        canvasRef={canvasRef}
        status={status}
        targetLabel={targetLabel}
        sequence={sequence}
        targetIndex={targetIndex}
        sequenceOptions={sequenceOptions}
        mode={mode}
        onModeChange={(event) => setMode(event.target.value)}
      />
    </div>
  );
}

export default App;
