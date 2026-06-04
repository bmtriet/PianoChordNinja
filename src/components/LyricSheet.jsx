import React from "react";
import { getChordNotes, transposeChord } from "../utils/chordDetector";

export default function LyricSheet({
  active,
  songData, // { id, title, artist, lines, transpose, is_favorite }
  currentChordIndex,
  onPlayChordPreview,
  transposeOffset,
  onTransposeChange,
  isFavorite,
  onFavoriteToggle
}) {
  if (!active || !songData) return null;

  // Split lines dynamically into columns depending on length
  const totalLines = songData.lines.length;
  let numColumns = 1;
  if (totalLines > 28) {
    numColumns = 3;
  } else if (totalLines > 14) {
    numColumns = 2;
  }

  const getColumns = () => {
    const cols = [];
    const linesPerCol = Math.ceil(totalLines / numColumns);
    for (let i = 0; i < numColumns; i++) {
      cols.push(songData.lines.slice(i * linesPerCol, (i + 1) * linesPerCol));
    }
    return cols;
  };

  // Keep a single global counter for chord highlighting across columns
  let globalChordIdx = 0;

  return (
    <div className="lyric-mode-container animate-fade">
      {/* Title Header with Transpose and Favorite Buttons */}
      <div className="song-metadata">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ textAlign: "left" }}>
            <h2 className="glow-text" style={{ fontSize: "1.6rem" }}>{songData.title}</h2>
            <p className="artist">by {songData.artist}</p>
          </div>
          
          <div className="lyric-actions" style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            {/* Transpose Controls */}
            <div className="transpose-controls" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="section-label" style={{ fontSize: "0.8rem", letterSpacing: "1px" }}>KEY:</span>
              <button 
                onClick={() => onTransposeChange(-1)} 
                className="hud-btn mini-btn" 
                style={{ width: "32px", padding: "6px 0", borderRadius: "6px", cursor: "pointer" }}
                title="Transpose Down"
              >
                ♭
              </button>
              <span className="value glow-text font-arcade" style={{ minWidth: "30px", textAlign: "center", color: "var(--neon-yellow)", fontSize: "1.1rem" }}>
                {transposeOffset >= 0 ? `+${transposeOffset}` : transposeOffset}
              </span>
              <button 
                onClick={() => onTransposeChange(1)} 
                className="hud-btn mini-btn" 
                style={{ width: "32px", padding: "6px 0", borderRadius: "6px", cursor: "pointer" }}
                title="Transpose Up"
              >
                ♯
              </button>
            </div>
            
            {/* Favorite Button */}
            <button 
              onClick={onFavoriteToggle} 
              className={`hud-btn favorite-btn ${isFavorite ? "toggle-active" : ""}`}
              style={{ width: "auto", padding: "6px 12px", borderRadius: "6px", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}
            >
              {isFavorite ? "❤️ FAVORITE" : "🖤 ADD FAVORITE"}
            </button>
          </div>
        </div>
      </div>

      {/* Multi-column Lyric sheet panel */}
      <div className="lyric-sheet-columns" style={{ display: "flex", gap: "25px", flex: 1, overflow: "hidden" }}>
        {getColumns().map((colLines, colIdx) => (
          <div 
            key={colIdx} 
            className="lyric-column" 
            style={{ 
              flex: 1, 
              overflowY: "auto", 
              paddingRight: "5px",
              borderRight: colIdx < numColumns - 1 ? "1px solid rgba(255, 255, 255, 0.05)" : "none"
            }}
          >
            {colLines.map((line, lineIdx) => {
              if (line.type === "empty_line") {
                return <div key={lineIdx} className="lyric-line-empty" />;
              }

              if (line.type === "text_only") {
                return (
                  <div key={lineIdx} className="lyric-line-meta">
                    {line.text}
                  </div>
                );
              }

              // Lyric / Chord combination line
              return (
                <div key={lineIdx} className="lyric-line-combo" style={{ fontSize: "1.05rem", lineHeight: "40px" }}>
                  {line.segments.map((seg, segIdx) => {
                    if (seg.type === "lyric") {
                      return (
                        <span key={segIdx} className="lyric-text">
                          {seg.text}
                        </span>
                      );
                    }

                    // Chord segment
                    const currentIdx = globalChordIdx++;
                    const isActive = currentIdx === currentChordIndex;
                    
                    // Apply transposition shift
                    const transposedChord = transposeChord(seg.chord, transposeOffset);
                    
                    return (
                      <span
                        key={segIdx}
                        className={`lyric-chord-tag ${isActive ? "active-pulse" : ""}`}
                        onClick={() => onPlayChordPreview(transposedChord)}
                        title="Click to preview chord sound"
                        style={{ margin: "0 4px" }}
                      >
                        {transposedChord}
                        {isActive && (
                          <span className="tooltip-notes font-arcade">
                            {getChordNotes(transposedChord)?.notes.join(" • ") || ""}
                          </span>
                        )}
                      </span>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
