import React from "react";

export default function GameOverMenu({
  active,
  score,
  maxCombo,
  slicedChords,
  onRestartGame,
  onMainMenu,
  
  // Waterfall specifics
  gameMode,
  playedSongName,
  notesHit,
  totalNotesCount
}) {
  if (!active) return null;

  // Compute accuracy for waterfall
  const accuracy = totalNotesCount > 0 ? Math.round((notesHit / totalNotesCount) * 100) : 0;

  return (
    <div id="gameOverOverlay" className="overlay active">
      <div className="glass-panel text-center">
        <h1 className="neon-title glow-red">GAME OVER</h1>
        <p className="subtitle">
          {gameMode === "ninja"
            ? "Your training session in the Dojo is complete. Respect the chord!"
            : `You finished playing along with "${playedSongName || "Custom Track"}"!`}
        </p>

        {/* Scoring Statistics */}
        <div className="stats-box">
          <div className="stat-card">
            <span className="stat-label">FINAL SCORE</span>
            <span id="finalScore" className="stat-value highlight">
              {score}
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-label">MAX COMBO</span>
            <span id="maxCombo" className="stat-value">
              {maxCombo}x
            </span>
          </div>
        </div>

        {/* Mode specific summary */}
        {gameMode === "ninja" ? (
          <div className="summary-section">
            <p id="summaryText" className="guide-tip">
              {slicedChords && slicedChords.size > 0
                ? "You successfully recognized and sliced these chords:"
                : "No chords sliced this round. Tap the keys to learn chords at a comfortable pace!"}
            </p>
            {slicedChords && slicedChords.size > 0 && (
              <div id="slicedChordsList" className="chord-list">
                {Array.from(slicedChords).map((chord, idx) => (
                  <span key={idx} className="chord-tag">
                    {chord}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="summary-section">
            <div className="stat-card" style={{ maxWidth: "250px", margin: "15px auto" }}>
              <span className="stat-label">NOTES HIT ACCURACY</span>
              <span className="stat-value highlight" style={{ color: "#39ff14" }}>
                {accuracy}%
              </span>
              <span className="font-small" style={{ color: "rgba(255, 255, 255, 0.6)" }}>
                ({notesHit} / {totalNotesCount} notes)
              </span>
            </div>
          </div>
        )}

        {/* Actions buttons */}
        <div className="menu-actions" style={{ display: "flex", gap: "15px", justifyContent: "center", marginTop: "25px" }}>
          <button onClick={onRestartGame} className="neon-btn reset-btn" style={{ padding: "12px 25px", fontSize: "16px" }}>
            🔄 RESTART
          </button>
          <button onClick={onMainMenu} className="neon-btn exit-btn" style={{ padding: "12px 25px", fontSize: "16px" }}>
            🏠 MAIN MENU
          </button>
        </div>
      </div>
    </div>
  );
}
