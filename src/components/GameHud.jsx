import React from "react";

export default function GameHud({
  active,
  score,
  combo,
  detectedChord,
  lives,
  noDieEnabled,
  autoPlayEnabled,
  setAutoPlayEnabled,
  learnModeEnabled,
  setLearnModeEnabled,
  cameraEnabled,
  setCameraEnabled,
  bgVolume,
  setBgVolume,
  currentSongIndex,
  setCurrentSongIndex,
  onMuteToggle,
  isMuted,
  onExitGame,
  
  // Waterfall specifics
  gameMode,
  activeSongName,
  songProgress, // 0.0 to 1.0 representing song playback progress

  // Audio preset parameters
  audioPreset,
  setAudioPreset,

  // Piano sound state parameters
  pianoSoundEnabled,
  setPianoSoundEnabled,
  
    // BPM prediction
  estimatedBpm,

  // MIDI input diagnostics
  midiLogs = [],
  onCopyMidiLogs,
  onClearMidiLogs
}) {
  if (!active) return null;

  return (
    <div id="gameHud" className="hud-overlay active">
      {/* HUD Stats */}
      <div className="hud-left">
        <div className="hud-stat">
          <span className="label">SCORE</span>
          <span id="scoreDisplay" className="value glow-text">
            {String(score).padStart(5, "0")}
          </span>
        </div>
        <div className="hud-stat">
          <span className="label">COMBO</span>
          <span id="comboDisplay" className="value highlight combo-glow">
            {combo}x
          </span>
        </div>
      </div>

      <div className="hud-center">
        {gameMode === "ninja" ? (
          <>
            <span className="label">DETECTED CHORD</span>
            <span id="detectedChordName" className="value glow-text font-arcade">
              {detectedChord || "--"}
            </span>
          </>
        ) : gameMode === "waterfall" ? (
          <>
            <span className="label">PLAYING SONG</span>
            <span className="value glow-text font-arcade" style={{ fontSize: "20px" }}>
              {activeSongName || "Custom Track"}
            </span>
            {songProgress !== undefined && (
              <div className="progress-bar-container">
                <div 
                  className="progress-bar-fill" 
                  style={{ width: `${Math.min(100, Math.max(0, songProgress * 100))}%` }}
                ></div>
              </div>
            )}
          </>
        ) : null}
      </div>

      {/* Right: Hearts lives container */}
      <div className="hud-right">
        <div id="livesContainer" className="lives-row">
          {[0, 1, 2].map((idx) => {
            const isActive = noDieEnabled || idx < lives;
            return (
              <span
                key={idx}
                className={`heart ${isActive ? "active" : ""}`}
                style={noDieEnabled ? { filter: "hue-rotate(120deg) saturate(1.5)" } : {}}
              >
                ❤️
              </span>
            );
          })}
        </div>
      </div>

      {/* Quick Controls Console drawer */}
      <div className="hud-controls-drawer">
        <div className="drawer-handle">⚙️ CORE UTILITIES</div>
        <div className="drawer-content">
          <button
            onClick={() => setAutoPlayEnabled(!autoPlayEnabled)}
            className={`hud-btn ${autoPlayEnabled ? "toggle-active" : ""}`}
          >
            AUTO: {autoPlayEnabled ? "ON" : "OFF"}
          </button>
          
          {(gameMode === "ninja" || gameMode === "lyric") && (
            <button
              onClick={() => setLearnModeEnabled(!learnModeEnabled)}
              className={`hud-btn ${learnModeEnabled ? "toggle-active" : ""}`}
            >
              LEARN: {learnModeEnabled ? "ON" : "OFF"}
            </button>
          )}

          <button onClick={onMuteToggle} className="hud-btn sfx-toggle">
            {isMuted ? "🔇 Muted" : "🔊 Sound"}
          </button>

          <button
            onClick={() => setPianoSoundEnabled(!pianoSoundEnabled)}
            className={`hud-btn ${pianoSoundEnabled ? "toggle-active" : ""}`}
          >
            🎹 Piano: {pianoSoundEnabled ? "ON" : "OFF"}
          </button>

          <button
            onClick={() => setCameraEnabled(!cameraEnabled)}
            className={`hud-btn ${cameraEnabled ? "toggle-active" : ""}`}
          >
            📷 Cam: {cameraEnabled ? "ON" : "OFF"}
          </button>

          {gameMode === "ninja" && (
            <div className="control-group">
              <label>Track:</label>
              <select
                value={currentSongIndex}
                onChange={(e) => setCurrentSongIndex(parseInt(e.target.value))}
                className="hud-select"
              >
                <option value={-1}>None</option>
                <option value={0}>Canon</option>
                <option value={1}>Let It Be</option>
                <option value={2}>Für Elise</option>
                <option value={3}>Imagine</option>
                <option value={4}>Stand By</option>
                <option value={5}>Autumn</option>
                <option value={6}>Yesterday</option>
                <option value={7}>Fly Me</option>
                <option value={8}>Moonlight</option>
                <option value={9}>Clair</option>
              </select>
            </div>
          )}

          <div className="control-group font-small">
            <label>Bg Vol:</label>
            <input
              type="range"
              min="0"
              max="0.5"
              step="0.02"
              value={bgVolume}
              onChange={(e) => setBgVolume(parseFloat(e.target.value))}
              className="hud-slider"
            />
          </div>

          <div className="control-group font-small">
            <label>Sound Preset:</label>
            <select
              value={audioPreset}
              onChange={(e) => setAudioPreset(e.target.value)}
              className="hud-select"
            >
              <option value="piano">🎹 Grand Piano</option>
              <option value="rhodes">🔮 Rhodes EP</option>
              <option value="synth">⚡ Retro Synth</option>
              <option value="musicbox">✨ Music Box</option>
            </select>
          </div>

          <button onClick={onExitGame} className="hud-btn exit-btn">
            🚪 EXIT DOJO
          </button>

          <div className="midi-log-panel">
            <div className="midi-log-header">
              <span>MIDI LOGS</span>
              <span>{midiLogs.length}</span>
            </div>
            <div className="midi-log-actions">
              <button
                type="button"
                className="hud-btn mini-action"
                onClick={onCopyMidiLogs}
                disabled={midiLogs.length === 0}
              >
                COPY
              </button>
              <button
                type="button"
                className="hud-btn mini-action"
                onClick={onClearMidiLogs}
                disabled={midiLogs.length === 0}
              >
                CLEAR
              </button>
            </div>
            <div className="midi-log-list">
              {midiLogs.length === 0 ? (
                <div className="midi-log-empty">Play MIDI notes to log input.</div>
              ) : (
                midiLogs.slice(-24).map(entry => (
                  <div key={entry.id} className={`midi-log-row ${entry.action === "ON" ? "note-on" : "note-off"}`}>
                    <span className="midi-log-time">{entry.relativeTime.toFixed(2)}s</span>
                    <span className="midi-log-action">{entry.action}</span>
                    <span className="midi-log-note">{entry.noteName}</span>
                    <span className="midi-log-extra">
                      v{entry.velocity} · {entry.detectedChord || "-"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
