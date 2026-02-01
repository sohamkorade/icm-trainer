import React from "react";
import PropTypes from "prop-types";

function ControlsPanel({
  audioReady,
  isDroneOn,
  tonic,
  tonicOptions,
  onStart,
  onStop,
  onPlayTargetNote,
  onToggleDrone,
  onTonicChange,
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
          onClick={onPlayTargetNote}
          disabled={!audioReady}
        >
          Play Target Note
        </button>
        <button
          className="ghost"
          onClick={onToggleDrone}
          disabled={!audioReady}
        >
          {isDroneOn ? "Stop Drone" : "Start Drone"}
        </button>
        <label className="inline-select">
          <span>Tonic</span>
          <select value={tonic} onChange={onTonicChange}>
            {tonicOptions.map((option) => (
              <option key={option.label} value={option.freq}>
                {option.label}
              </option>
            ))}
          </select>
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
  onStart: PropTypes.func.isRequired,
  onStop: PropTypes.func.isRequired,
  onPlayTargetNote: PropTypes.func.isRequired,
  onToggleDrone: PropTypes.func.isRequired,
  onTonicChange: PropTypes.func.isRequired,
};
