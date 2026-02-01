import React from "react";
import PropTypes from "prop-types";

function ControlsPanel({
  audioReady,
  isDroneOn,
  tonic,
  tonicOptions,
  tempo,
  usePitchCurveComparison,
  onStart,
  onStop,
  onToggleDrone,
  onTonicChange,
  onTempoChange,
  onListen,
  onCheckingModeChange,
}) {
  return (
    <section className="panel">
      <div className="controls">
        <button className="primary" onClick={onStart} disabled={audioReady}>
          Start
        </button>
        <button className="ghost" onClick={onStop} disabled={!audioReady}>
          Stop
        </button>
        <button
          className="ghost"
          onClick={onToggleDrone}
          disabled={!audioReady}
        >
          {isDroneOn ? "Stop Drone" : "Start Drone"}
        </button>
        {/* <label className="inline-select">
          <span>Tonic</span>
          <select value={tonic} onChange={onTonicChange}>
            {tonicOptions.map((option) => (
              <option key={option.label} value={option.freq}>
                {option.label}
              </option>
            ))}
          </select>
        </label> */}
        {/* <label className="inline-input">
          <span>Tempo (BPM)</span>
          <input
            type="number"
            min="30"
            max="200"
            value={tempo}
            onChange={onTempoChange}
            disabled={!audioReady}
          />
        </label> */}
        <button onClick={onListen} disabled={!audioReady}>
          Listen
        </button>
        <label className="inline-checkbox">
          <input
            type="checkbox"
            checked={usePitchCurveComparison}
            onChange={onCheckingModeChange}
            disabled={!audioReady}
          />
          <span>Use Pitch Curve Comparison</span>
        </label>
      </div>
    </section>
  );
}

export default ControlsPanel;

ControlsPanel.propTypes = {
  audioReady: PropTypes.bool.isRequired,
  isDroneOn: PropTypes.bool.isRequired,
  tonic: PropTypes.number.isRequired,
  tonicOptions: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      freq: PropTypes.number.isRequired,
    }),
  ).isRequired,
  tempo: PropTypes.number.isRequired,
  usePitchCurveComparison: PropTypes.bool.isRequired,
  onStart: PropTypes.func.isRequired,
  onStop: PropTypes.func.isRequired,
  onListen: PropTypes.func.isRequired,
  onToggleDrone: PropTypes.func.isRequired,
  onTonicChange: PropTypes.func.isRequired,
  onTempoChange: PropTypes.func.isRequired,
  onCheckingModeChange: PropTypes.func.isRequired,
};
