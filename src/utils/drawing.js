/**
 * Drawing utilities for the pitch graph canvas
 */

import { BASE_NOTES, MODE_SEQUENCES, MAX_HISTORY } from "../constants";
import { getNoteByLabel } from "./notes";

export function getCanvasMetrics(canvas) {
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
}

export function getPitchRange(tonicValue) {
  const minFreq = tonicValue * Math.pow(2, -1);
  const maxFreq = tonicValue * Math.pow(2, 1.5);
  const minLog = Math.log2(minFreq);
  const maxLog = Math.log2(maxFreq);
  return { minFreq, maxFreq, minLog, maxLog, logRange: maxLog - minLog };
}

export function makeYMapper(height, minLog, logRange) {
  return (freq) => {
    const normalized = (Math.log2(freq) - minLog) / logRange;
    return height - Math.min(Math.max(normalized, 0), 1) * height;
  };
}

export function drawGridLines(
  ctx,
  width,
  toY,
  tonicValue,
  minFreq,
  maxFreq,
  activeLabels,
) {
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
}

export function drawTargetLine(
  ctx,
  width,
  toY,
  tonicValue,
  minFreq,
  maxFreq,
  modeRef,
  targetIndexRef,
) {
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
}

export function drawPitchHistory(
  ctx,
  width,
  toY,
  history,
  timestamps,
  color,
  referenceTimestamps,
  breakOnGaps = false,
  gapThresholdMs = 500,
) {
  if (history.length === 0 || timestamps.length === 0) {
    return;
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  let hasStarted = false;
  let lastTimestamp = null;
  const now = Date.now();
  // Use reference timestamps (main timeline) for positioning
  const oldestTimestamp =
    referenceTimestamps && referenceTimestamps.length > 0
      ? referenceTimestamps[0]
      : timestamps[0];
  const timeRange = Math.max(now - oldestTimestamp, 1000);

  history.forEach((freq, index) => {
    if (freq === null || freq <= 0) {
      hasStarted = false;
      lastTimestamp = null;
      return;
    }
    const timestamp = timestamps[index];

    // Break line if gap is too large (for trainer pitch)
    if (breakOnGaps && lastTimestamp !== null) {
      const gap = timestamp - lastTimestamp;
      if (gap > gapThresholdMs) {
        hasStarted = false;
      }
    }

    const relativeTime = timestamp - oldestTimestamp;
    // Only draw if within visible range
    if (relativeTime < 0 || relativeTime > timeRange * 1.1) {
      return;
    }
    const x = Math.max(0, Math.min(width, (relativeTime / timeRange) * width));
    const y = toY(freq);
    if (hasStarted) {
      ctx.lineTo(x, y);
    } else {
      ctx.moveTo(x, y);
      hasStarted = true;
    }
    lastTimestamp = timestamp;
  });
  ctx.stroke();
}

function drawExpectedStartLine(
  ctx,
  width,
  height,
  utterance,
  oldestTimestamp,
  timeRange,
) {
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
}

function drawExpectedDurationBar(
  ctx,
  width,
  targetY,
  utterance,
  oldestTimestamp,
  timeRange,
) {
  const expectedStartX = Math.max(
    0,
    Math.min(
      width,
      ((utterance.expectedStartTime - oldestTimestamp) / timeRange) * width,
    ),
  );
  const expectedDurationWidth =
    (utterance.expectedDuration / timeRange) * width;
  const expectedEndX = Math.min(width, expectedStartX + expectedDurationWidth);

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
}

function calculatePitchExtents(utterance, toY, minFreq, maxFreq, targetY) {
  let minPitch = 0;
  let maxPitch = 0;
  let minY = targetY;
  let maxY = targetY;

  if (utterance.pitchSamples && utterance.pitchSamples.length > 0) {
    // Get valid pitch samples (with pitch > 0)
    const validSamples = utterance.pitchSamples.filter((s) => s.pitch > 0);
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
  return {
    minY: centerY - boxHeight / 2,
    maxY: centerY + boxHeight / 2,
  };
}

function drawActualUtteranceBar(
  ctx,
  width,
  utterance,
  timestamps,
  toY,
  tonicValue,
  minFreq,
  maxFreq,
) {
  const now = Date.now();
  const oldestTimestamp = timestamps[0];
  const timeRange = Math.max(now - oldestTimestamp, 1000);
  const currentTime = utterance.endTime || now;
  const actualStartRelativeTime = utterance.startTime - oldestTimestamp;
  const actualEndRelativeTime = currentTime - oldestTimestamp;

  // Only draw if actual utterance is at least partially visible
  if (actualEndRelativeTime > 0 && actualStartRelativeTime < timeRange * 1.1) {
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
      // Get target note frequency for positioning
      const targetNote = getNoteByLabel(utterance.expectedNote);
      if (!targetNote) {
        return;
      }
      const targetFreq = tonicValue * Math.pow(2, targetNote.semitone / 12);
      if (targetFreq < minFreq || targetFreq > maxFreq) {
        return;
      }
      const targetY = toY(targetFreq);

      const { minY, maxY } = calculatePitchExtents(
        utterance,
        toY,
        minFreq,
        maxFreq,
        targetY,
      );

      // Draw actual duration bar (orange/blue) covering pitch extents
      ctx.fillStyle = utterance.endTime
        ? "rgba(255, 179, 71, 0.4)"
        : "rgba(91, 108, 255, 0.4)";
      ctx.fillRect(actualStartX, minY, actualWidth, maxY - minY);

      // Draw border
      ctx.strokeStyle = utterance.endTime ? "#ffb347" : "#5b6cff";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(actualStartX, minY, actualWidth, maxY - minY);
    }
  }
}

export function drawExpectedTiming(
  ctx,
  width,
  height,
  toY,
  utterance,
  timestamps,
  tonicValue,
  minFreq,
  maxFreq,
) {
  if (!utterance || timestamps.length === 0) {
    return;
  }

  const now = Date.now();
  const oldestTimestamp = timestamps[0];
  const timeRange = Math.max(now - oldestTimestamp, 1000);

  // Check if utterance has scrolled off the left side - if so, don't draw it
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

  // drawExpectedStartLine(ctx, width, height, utterance, oldestTimestamp, timeRange);
  drawExpectedDurationBar(
    ctx,
    width,
    targetY,
    utterance,
    oldestTimestamp,
    timeRange,
  );
  drawActualUtteranceBar(
    ctx,
    width,
    utterance,
    timestamps,
    toY,
    tonicValue,
    minFreq,
    maxFreq,
  );
}
