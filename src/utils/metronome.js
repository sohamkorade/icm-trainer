function createMetronome(bpm, startTime = null) {
  const beatsPerSecond = bpm / 60;
  const msPerBeat = 1000 / beatsPerSecond;
  const startTimestamp = startTime || Date.now();

  return {
    bpm,
    beatsPerSecond,
    msPerBeat,
    startTime: startTimestamp,
  };
}

function getExpectedStartTime(metronome, noteIndex, sequenceDurations) {
  if (!metronome || !sequenceDurations || noteIndex < 0) {
    return null;
  }

  let cumulativeDuration = 0;
  for (let i = 0; i < noteIndex && i < sequenceDurations.length; i++) {
    cumulativeDuration += sequenceDurations[i];
  }

  return metronome.startTime + cumulativeDuration;
}

function getCurrentBeatTime(metronome) {
  if (!metronome) {
    return null;
  }

  const now = Date.now();
  const elapsed = now - metronome.startTime;
  const beatsElapsed = elapsed / metronome.msPerBeat;

  return {
    elapsedMs: elapsed,
    beatsElapsed,
    currentBeat: Math.floor(beatsElapsed),
    beatProgress: beatsElapsed % 1,
  };
}

function resetMetronome(metronome, newStartTime = null) {
  if (!metronome) {
    return null;
  }

  return {
    ...metronome,
    startTime: newStartTime || Date.now(),
  };
}

export {
  createMetronome,
  getExpectedStartTime,
  getCurrentBeatTime,
  resetMetronome,
};
