/**
 * Audio utility functions for playing sounds and managing audio nodes
 */

export function createTrainerAnalyser(audioCtx) {
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.8;
  return analyser;
}

export function playOscillator(
  audioCtx,
  frequency,
  duration,
  trainerAnalyserRef,
  trainerSourceRef,
) {
  if (!audioCtx) {
    return;
  }

  // Clean up previous trainer analyser if it exists
  if (trainerAnalyserRef.current) {
    trainerAnalyserRef.current.disconnect();
    trainerAnalyserRef.current = null;
  }

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const analyser = createTrainerAnalyser(audioCtx);

  osc.type = "sine";
  osc.frequency.value = frequency;
  gain.gain.value = 0.0001;
  osc.connect(gain);
  gain.connect(analyser);
  analyser.connect(audioCtx.destination);
  trainerAnalyserRef.current = analyser;
  trainerSourceRef.current = { type: "oscillator", node: osc };

  const now = audioCtx.currentTime;
  gain.gain.exponentialRampToValueAtTime(0.3, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.start(now);
  osc.stop(now + duration + 0.05);

  // Clean up after playback
  osc.onended = () => {
    if (trainerAnalyserRef.current === analyser) {
      trainerAnalyserRef.current.disconnect();
      trainerAnalyserRef.current = null;
    }
    trainerSourceRef.current = null;
  };
}

export function playSample(
  audioCtx,
  buffer,
  trainerAnalyserRef,
  trainerSourceRef,
) {
  if (!audioCtx || !buffer) {
    return null;
  }

  // Clean up previous trainer analyser if it exists
  if (trainerAnalyserRef.current) {
    trainerAnalyserRef.current.disconnect();
    trainerAnalyserRef.current = null;
  }

  const source = audioCtx.createBufferSource();
  const analyser = createTrainerAnalyser(audioCtx);

  source.buffer = buffer;
  source.connect(analyser);
  analyser.connect(audioCtx.destination);
  trainerAnalyserRef.current = analyser;
  trainerSourceRef.current = { type: "sample", node: source };

  source.start();

  // Clean up after playback
  source.onended = () => {
    if (trainerAnalyserRef.current === analyser) {
      trainerAnalyserRef.current.disconnect();
      trainerAnalyserRef.current = null;
    }
    trainerSourceRef.current = null;
  };

  return buffer.duration * 1000; // Return duration in milliseconds
}
