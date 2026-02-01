import React from "react";
import PropTypes from "prop-types";

function PitchPanel({
  detectedPitch,
  detectedNote,
  centsOff,
  confidence,
  inTune,
  suggestion,
  canvasRef,
  status,
  targetLabel,
  sequence,
  targetIndex,
  sequenceOptions,
  mode,
  onModeChange,
}) {
  return (
    <section className="panel">
      <div className="status">
        <div className="target">
          Target: <span className="badge">{targetLabel}</span>
        </div>
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
        <div>Pitch: {detectedPitch ? detectedPitch.toFixed(1) : "--"} Hz</div>
        <div>Detected: {detectedNote || "--"}</div>
        <div>Cents: {detectedPitch ? centsOff.toFixed(1) : "--"}</div>
        <div>Confidence: {confidence.toFixed(2)}</div>
      </div>
      <div className={`tune-indicator ${inTune ? "good" : ""}`}>
        {suggestion}
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
};
