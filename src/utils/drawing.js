/**
 * Drawing utilities for the pitch graph canvas
 */

import { BASE_NOTES, MODE_SEQUENCES, GRAPH_TIME_RANGE_MS } from "../constants";
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
  const minFreq = tonicValue * Math.pow(2, -1.5);
  const maxFreq = tonicValue * Math.pow(2, 1.5);
  const minLog = Math.log2(minFreq);
  const maxLog = Math.log2(maxFreq);
  return { minFreq, maxFreq, minLog, maxLog, logRange: maxLog - minLog };
}

export function makeYMapper(height, minLog, logRange) {
  return (freq) => {
    const normalized = (Math.log2(freq) - minLog) / logRange;
    return height - normalized * height;
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
        : "rgba(34, 41, 58, 0.2)";

      // bright line for tonic
      if (note.semitone === 0) {
        ctx.strokeStyle = "#eee";
      }

      const y = toY(freq);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    });
  });
}

export function drawPitchHistory(
  ctx,
  width,
  toY,
  history,
  timestamps,
  color,
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
  // Use fixed time range to control scroll speed (larger = slower scroll)
  // Show a sliding window of the last N seconds
  const timeRange = GRAPH_TIME_RANGE_MS;
  const windowStartTime = now - timeRange;

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

    // Calculate relative time from the sliding window start
    const relativeTime = timestamp - windowStartTime;
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

export function drawSuggestions(
  ctx,
  width,
  height,
  toY,
  suggestions,
  timestamps,
  minFreq,
  maxFreq,
) {
  if (!suggestions || suggestions.length === 0 || timestamps.length === 0) {
    return;
  }

  const now = Date.now();
  // Use fixed time range to control scroll speed (larger = slower scroll)
  const timeRange = GRAPH_TIME_RANGE_MS;
  const windowStartTime = now - timeRange;

  suggestions.forEach((suggestion) => {
    // Calculate x position based on timestamp (moves left as time passes)
    const relativeTime = suggestion.timestamp - windowStartTime;

    // Only draw if within visible range
    if (relativeTime < 0 || relativeTime > timeRange * 1.1) {
      return;
    }

    let x = (relativeTime / timeRange) * width;

    // Calculate y position based on pitch (or use middle if no pitch)
    let y;
    if (
      suggestion.pitch &&
      suggestion.pitch >= minFreq &&
      suggestion.pitch <= maxFreq
    ) {
      y = toY(suggestion.pitch);
    } else {
      // Default to middle of graph if no valid pitch
      y = height / 2;
    }

    // Draw suggestion text with background for readability
    ctx.font = "12px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    // Measure text width for background
    const textMetrics = ctx.measureText(suggestion.message);
    const textWidth = textMetrics.width;
    const textHeight = 16;
    const padding = 6;

    // Draw background rectangle
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.fillRect(
      x - padding,
      y - textHeight / 2 - padding / 2,
      textWidth + padding * 2,
      textHeight + padding,
    );

    // Draw border
    ctx.strokeStyle = "#ff6b35";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
      x - padding,
      y - textHeight / 2 - padding / 2,
      textWidth + padding * 2,
      textHeight + padding,
    );

    // Draw text
    ctx.fillStyle = "#333";
    ctx.fillText(suggestion.message, x, y);
  });
}
