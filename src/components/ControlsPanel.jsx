import React from "react";
import PropTypes from "prop-types";

function ControlsPanel({
  audioReady,
  isDroneOn,
  tonic,
  tonicOptions,
  tempo,
  attemptsBeforeRepeat,
  onStart,
  onStop,
  onToggleDrone,
  onTonicChange,
  onTempoChange,
  onAttemptsBeforeRepeatChange,
  onListen,
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
        <label className="inline-input">
          <span>Attempts Before Repeat</span>
          <input
            type="number"
            min="1"
            max="10"
            value={attemptsBeforeRepeat}
            onChange={onAttemptsBeforeRepeatChange}
            disabled={!audioReady}
          />
        </label>
        <button onClick={onListen} disabled={!audioReady}>
          Listen
        </button>
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
  attemptsBeforeRepeat: PropTypes.number.isRequired,
  onStart: PropTypes.func.isRequired,
  onStop: PropTypes.func.isRequired,
  onListen: PropTypes.func.isRequired,
  onToggleDrone: PropTypes.func.isRequired,
  onTonicChange: PropTypes.func.isRequired,
  onTempoChange: PropTypes.func.isRequired,
  onAttemptsBeforeRepeatChange: PropTypes.func.isRequired,
};
