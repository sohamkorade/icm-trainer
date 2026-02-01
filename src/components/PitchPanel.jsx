import React from "react";
import PropTypes from "prop-types";

function PitchPanel({
  detectedPitch,
  detectedNote,
  centsOff,
  confidence,
  inTune,
  suggestion,
  attemptsLeft,
  canvasRef,
  status,
  targetLabel,
  sequence,
  targetIndex,
  sequenceOptions,
  mode,
  onModeChange,
  currentUtterance,
}) {
  const checks = currentUtterance?.checks || {};

  return (
    <section className="panel">
      <div className="status">
        <div className="target">
          Target: <span className="badge">{targetLabel}</span>
        </div>
        <div className="attempts">Attempts left: {attemptsLeft}</div>
        <label className="sequence-select">
          <span>Sequence</span>
          <select value={mode} onChange={onModeChange}>
            {sequenceOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="status-text">{status}</div>
      </div>

      <div className="progress">
        {sequence.map((note, index) => (
          <div
            key={`${note}-${index}`}
            className={`progress-note ${index === targetIndex ? "active" : ""}`}
          >
            {note}
          </div>
        ))}
      </div>

      <div className="pitch-info">
        {/* <div>Pitch: {detectedPitch ? detectedPitch.toFixed(1) : "--"} Hz</div> */}
        <div>Detected: {detectedNote || "--"}</div>
        {/* <div>Cents: {detectedPitch ? centsOff.toFixed(1) : "--"}</div> */}
        <div>Confidence: {confidence.toFixed(2)}</div>
      </div>

      {currentUtterance && (
        <div className="utterance-checks">
          <div className="check-item">
            <span className="check-label">Stability:</span>
            <span
              className={`check-status ${checks.isStable === true ? "pass" : checks.isStable === false ? "fail" : "pending"}`}
            >
              {checks.isStable === true
                ? "✓"
                : checks.isStable === false
                  ? "✗"
                  : "—"}
            </span>
            {checks.isStable === false &&
              currentUtterance.suggestions.some((s) =>
                s.includes("stable"),
              ) && (
                <span className="check-suggestion">⚠️ Keep pitch stable</span>
              )}
          </div>
          <div className="check-item">
            <span className="check-label">Expected Note:</span>
            <span
              className={`check-status ${checks.isExpectedNote === true ? "pass" : checks.isExpectedNote === false ? "fail" : "pending"}`}
            >
              {checks.isExpectedNote === true
                ? "✓"
                : checks.isExpectedNote === false
                  ? "✗"
                  : "—"}
            </span>
            {checks.isExpectedNote === false &&
              currentUtterance.suggestions.some(
                (s) => s.includes("Go") || s.includes("semitone"),
              ) && <span className="check-suggestion">🎵 Adjust pitch</span>}
          </div>
          <div className="check-item">
            <span className="check-label">Expected Length:</span>
            <span
              className={`check-status ${checks.isExpectedLength === true ? "pass" : checks.isExpectedLength === false ? "fail" : "pending"}`}
            >
              {checks.isExpectedLength === true
                ? "✓"
                : checks.isExpectedLength === false
                  ? "✗"
                  : "—"}
            </span>
            {checks.isExpectedLength === false &&
              currentUtterance.suggestions.some(
                (s) =>
                  s.includes("Hold") ||
                  s.includes("longer") ||
                  s.includes("shorter"),
              ) && <span className="check-suggestion">⏱️ Adjust duration</span>}
          </div>
          <div className="check-item">
            <span className="check-label">Expected Timing:</span>
            <span
              className={`check-status ${checks.isAtExpectedTime === true ? "pass" : checks.isAtExpectedTime === false ? "fail" : "pending"}`}
            >
              {checks.isAtExpectedTime === true
                ? "✓"
                : checks.isAtExpectedTime === false
                  ? "✗"
                  : "—"}
            </span>
            {checks.isAtExpectedTime === false &&
              currentUtterance.suggestions.some(
                (s) =>
                  s.includes("Start") ||
                  s.includes("earlier") ||
                  s.includes("later"),
              ) && <span className="check-suggestion">⏰ Adjust timing</span>}
          </div>
        </div>
      )}

      <div className={`tune-indicator ${inTune ? "good" : ""}`}>
        {currentUtterance && currentUtterance.suggestions.length > 0 ? (
          <div className="suggestions-list">
            {currentUtterance.suggestions.map((suggestionText, index) => (
              <div key={index} className="suggestion-item">
                {suggestionText}
              </div>
            ))}
          </div>
        ) : (
          suggestion
        )}
      </div>
      <div className="graph-wrapper">
        <canvas ref={canvasRef} />
      </div>
    </section>
  );
}

export default PitchPanel;

PitchPanel.propTypes = {
  detectedPitch: PropTypes.number.isRequired,
  detectedNote: PropTypes.string.isRequired,
  centsOff: PropTypes.number.isRequired,
  confidence: PropTypes.number.isRequired,
  inTune: PropTypes.bool.isRequired,
  suggestion: PropTypes.string.isRequired,
  attemptsLeft: PropTypes.number.isRequired,
  canvasRef: PropTypes.shape({ current: PropTypes.any }),
  status: PropTypes.string.isRequired,
  targetLabel: PropTypes.string.isRequired,
  sequence: PropTypes.arrayOf(PropTypes.string).isRequired,
  targetIndex: PropTypes.number.isRequired,
  sequenceOptions: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
    }),
  ).isRequired,
  mode: PropTypes.string.isRequired,
  onModeChange: PropTypes.func.isRequired,
  currentUtterance: PropTypes.shape({
    checks: PropTypes.shape({
      isStable: PropTypes.bool,
      isExpectedNote: PropTypes.bool,
      isExpectedLength: PropTypes.bool,
      isAtExpectedTime: PropTypes.bool,
    }),
    suggestions: PropTypes.arrayOf(PropTypes.string),
  }),
};
