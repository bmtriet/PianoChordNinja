import React, { useState, useEffect } from "react";
import { transposeChord } from "../utils/chordDetector";

export default function LyricSheet({
  active,
  songData, // { id, title, artist, lines, transpose, is_favorite }
  currentChordIndex,
  onSelectChord,
  transposeOffset,
  onTransposeChange,
  isFavorite,
  onFavoriteToggle,
  onSkipCurrentLine,
  onResetLyric,

  // Library drawer controls
  savedSongsList,
  onSelectSavedSong,
  onDeleteSavedSong,
  onToggleFavoriteSong,
  songSearchQuery,
  setSongSearchQuery,
  showFavoritesOnly,
  setShowFavoritesOnly,
  lyricSongUrl,
  setLyricSongUrl,
  onLoadLyricSong,
  isLyricLoading,
  waitingForSpaceLineIndex
}) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [localUrl, setLocalUrl] = useState("");

  // Sync local URL input when lyricSongUrl changes from outside
  useEffect(() => {
    if (lyricSongUrl) {
      setLocalUrl(lyricSongUrl);
    }
  }, [lyricSongUrl]);

  // Keyboard shortcut listener to toggle drawer
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger shortcut if typing in input fields
      if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") return;
      
      if (e.code === "KeyL" || e.code === "KeyP") {
        e.preventDefault();
        setIsDrawerOpen(prev => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Auto-close drawer when song changes (successfully loads)
  useEffect(() => {
    setIsDrawerOpen(false);
  }, [songData?.id]);

  if (!active || !songData) return null;

  // Pre-calculate absolute chord index for every chord segment in all lines
  let chordCounter = 0;
  const linesWithAbsoluteChords = songData.lines.map((line) => {
    if (line.skipped) return line;
    if (line.type !== "lyric_chords" || !line.segments) return line;

    const segments = line.segments.map(seg => {
      if (seg.type !== "chord") return seg;
      return {
        ...seg,
        chordIndex: chordCounter++
      };
    });

    return {
      ...line,
      segments
    };
  });

  const visibleLines = linesWithAbsoluteChords.filter(line => !line.skipped);
  
  const activeVisibleIdx = visibleLines.findIndex(line => {
    if (line.type !== "lyric_chords" || !line.segments) return false;
    return line.segments.some(seg => seg.type === "chord" && seg.chordIndex === currentChordIndex);
  });
  
  const currentActiveVisibleIdx = activeVisibleIdx !== -1 ? activeVisibleIdx : 0;
  
  const startIdx = Math.max(0, currentActiveVisibleIdx - 1);
  const endIdx = Math.min(visibleLines.length, currentActiveVisibleIdx + 2);
  const displayedLines = visibleLines.slice(startIdx, endIdx);

  const renderLyricText = (text, isActive) => (
    text.split(/(\s+)/).map((token, tokenIdx) => {
      if (token.trim() === "") {
        return token;
      }

      return (
        <span
          key={tokenIdx}
          className={`lyric-word ${isActive ? "active-word-glow" : ""}`}
        >
          {token}
        </span>
      );
    })
  );

  return (
    <div className="lyric-mode-container animate-fade" style={{ overflow: "hidden" }}>
      {/* Playlist Slide-out Drawer */}
      <div className={`playlist-drawer ${isDrawerOpen ? "open" : ""}`}>
        {/* Toggle Sticking Tab on the right edge */}
        <button 
          onClick={() => setIsDrawerOpen(!isDrawerOpen)}
          className="drawer-toggle-tab"
          title="Toggle Song Library (Shortcut: L or P)"
        >
          <span>🎵</span>
          <span style={{ fontSize: "10px", marginTop: "4px" }}>{isDrawerOpen ? "❮" : "❯"}</span>
        </button>

        {/* Drawer Header */}
        <div className="drawer-header">
          <h3>📂 SONG LIBRARY</h3>
          <button onClick={() => setIsDrawerOpen(false)} className="drawer-close-btn" title="Close Library">
            ✕
          </button>
        </div>

        {/* URL Scraper input directly inside screen */}
        <div className="settings-section" style={{ padding: 0, border: "none", background: "none", margin: 0 }}>
          <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "5px", display: "block", textTransform: "uppercase", letterSpacing: "0.5px" }}>Import Song URL</label>
          <form 
            onSubmit={(e) => { e.preventDefault(); if (localUrl.trim()) onLoadLyricSong(localUrl); }}
            style={{ display: "flex", gap: "8px" }}
          >
            <input
              type="text"
              value={localUrl}
              onChange={(e) => setLocalUrl(e.target.value)}
              placeholder="Paste HopAmChuan link..."
              className="glass-select"
              style={{ flex: 1, padding: "8px 12px", fontSize: "0.85rem", cursor: "text" }}
              disabled={isLyricLoading}
            />
            <button 
              type="submit" 
              className="control-btn toggle-active" 
              style={{ minWidth: "65px", padding: "8px", fontSize: "0.8rem", cursor: "pointer", borderRadius: "8px" }}
              disabled={isLyricLoading}
            >
              {isLyricLoading ? "..." : "LOAD"}
            </button>
          </form>

          {/* Quick Presets */}
          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            <button
              type="button"
              className="hud-btn"
              style={{ width: "auto", borderRadius: "6px", fontSize: "0.75rem", padding: "3px 8px" }}
              onClick={() => { setLocalUrl("https://hopamchuan.com/song/54/co-gai-den-tu-hom-qua/LNTguitar"); onLoadLyricSong("https://hopamchuan.com/song/54/co-gai-den-tu-hom-qua/LNTguitar"); }}
              disabled={isLyricLoading}
            >
              Cô Gái...
            </button>
            <button
              type="button"
              className="hud-btn"
              style={{ width: "auto", borderRadius: "6px", fontSize: "0.75rem", padding: "3px 8px" }}
              onClick={() => { setLocalUrl("https://hopamchuan.com/song/8889/la-lung/oneduck"); onLoadLyricSong("https://hopamchuan.com/song/8889/la-lung/oneduck"); }}
              disabled={isLyricLoading}
            >
              Lạ Lùng
            </button>
          </div>
        </div>

        {/* Search and Filters */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", margin: "10px 0 5px 0" }}>
          <input
            type="text"
            value={songSearchQuery}
            onChange={(e) => setSongSearchQuery(e.target.value)}
            placeholder="🔍 Search saved library..."
            className="glass-select"
            style={{ padding: "8px 12px", fontSize: "0.85rem", cursor: "text", width: "100%" }}
          />
          <label className="checkbox-container" style={{ paddingLeft: "25px", fontSize: "0.8rem", width: "auto", margin: 0 }}>
            <input
              type="checkbox"
              checked={showFavoritesOnly}
              onChange={(e) => setShowFavoritesOnly(e.target.checked)}
            />
            <span className="custom-checkbox" style={{ height: "14px", width: "14px" }}></span>
            Favorites Only ❤️
          </label>
        </div>

        {/* Saved Songs Scrollable List */}
        <h4 style={{ color: "var(--neon-cyan)", fontSize: "0.8rem", margin: "5px 0 2px 0", textTransform: "uppercase", letterSpacing: "1px" }}>
          Songs Grid ({savedSongsList.length})
        </h4>
        <div className="drawer-songs-list" style={{ overflowY: "auto", background: "rgba(0, 0, 0, 0.25)", padding: "8px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.04)", maxHeight: "calc(100% - 220px)" }}>
          {savedSongsList.length === 0 ? (
            <div style={{ padding: "20px", color: "var(--text-secondary)", fontSize: "0.8rem", textAlign: "center" }}>
              No songs found.
            </div>
          ) : (
            savedSongsList.map((song) => {
              const isCurrent = song.id === songData.id;
              return (
                <div 
                  key={song.id} 
                  style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    justifyContent: "space-between", 
                    background: isCurrent ? "rgba(0, 243, 255, 0.08)" : "rgba(255, 255, 255, 0.02)", 
                    padding: "8px 10px", 
                    borderRadius: "6px", 
                    border: isCurrent ? "1px solid rgba(0, 243, 255, 0.2)" : "1px solid rgba(255,255,255,0.03)",
                    transition: "all 0.2s",
                    marginBottom: "4px"
                  }}
                >
                  <div 
                    style={{ textAlign: "left", cursor: "pointer", flex: 1 }} 
                    onClick={() => { onSelectSavedSong(song); setIsDrawerOpen(false); }}
                  >
                    <strong style={{ fontSize: "0.85rem", color: isCurrent ? "var(--neon-cyan)" : "#fff", display: "block" }}>{song.title}</strong>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{song.artist}</span>
                    {song.transpose !== 0 && (
                      <span style={{ fontSize: "0.7rem", color: "var(--neon-yellow)", background: "rgba(255,234,0,0.1)", padding: "0 3px", borderRadius: "3px", marginLeft: "5px" }}>
                        {song.transpose >= 0 ? `+${song.transpose}` : song.transpose}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <button 
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onToggleFavoriteSong(song); }}
                      style={{ background: "transparent", border: "none", fontSize: "0.95rem", cursor: "pointer" }}
                      title="Toggle Favorite"
                    >
                      {song.is_favorite ? "❤️" : "🖤"}
                    </button>
                    <button 
                      type="button"
                      onClick={(e) => { e.stopPropagation(); if (confirm("Delete this song?")) onDeleteSavedSong(song.id); }}
                      style={{ background: "transparent", border: "none", color: "var(--neon-red)", fontSize: "0.85rem", cursor: "pointer", padding: "2px" }}
                      title="Delete Song"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      {/* Title Header with Transpose and Favorite Buttons */}
      <div className="song-metadata">
        <div className="song-metadata-row">
          <div style={{ textAlign: "left" }}>
            <h2 className="glow-text" style={{ fontSize: "1.6rem" }}>{songData.title}</h2>
            <p className="artist">by {songData.artist}</p>
          </div>
          
          <div className="lyric-actions">
            {/* Library Toggle Button */}
            <button 
              onClick={() => setIsDrawerOpen(true)} 
              className="hud-btn"
              style={{ width: "auto", padding: "6px 12px", borderRadius: "6px", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", border: "1px solid var(--neon-cyan)", color: "var(--neon-cyan)" }}
              title="Open Song Library (Shortcut: L or P)"
            >
              🎵 LIBRARY
            </button>

            <button
              type="button"
              onClick={onSkipCurrentLine}
              className="hud-btn"
              style={{ width: "auto", padding: "6px 12px", borderRadius: "6px", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", border: "1px solid var(--neon-yellow)", color: "var(--neon-yellow)" }}
              title="Skip every chord in the current lyric line"
            >
              SKIP LINE
            </button>

            <button
              type="button"
              onClick={onResetLyric}
              className="hud-btn"
              style={{ width: "auto", padding: "6px 12px", borderRadius: "6px", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", border: "1px solid var(--neon-cyan)", color: "var(--neon-cyan)" }}
              title="Reset the song playback to the very first line"
            >
              RESET LYRIC
            </button>

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

      {/* Teleprompter / Karaoke Viewport */}
      <div className="karaoke-viewport">
        {displayedLines.map((line, idx) => {
          const absoluteIdx = startIdx + idx;
          let positionClass = "next";
          if (absoluteIdx < currentActiveVisibleIdx) {
            positionClass = "previous";
          } else if (absoluteIdx === currentActiveVisibleIdx) {
            positionClass = "active";
          }

          if (line.type === "empty_line") {
            return (
              <div key={idx} className={`karaoke-line-wrapper ${positionClass}`}>
                <div className="lyric-line-empty" />
              </div>
            );
          }

          if (line.type === "text_only") {
            return (
              <div key={idx} className={`karaoke-line-wrapper ${positionClass}`}>
                <div className="lyric-line-meta">{line.text}</div>
              </div>
            );
          }

          return (
            <div key={idx} className={`karaoke-line-wrapper ${positionClass}`}>
              <div className={`lyric-line-combo ${positionClass === "active" ? "active-line-glow" : ""}`}>
                {line.segments.map((seg, segIdx) => {
                  if (seg.type === "lyric") {
                    const previousChord = [...line.segments]
                      .slice(0, segIdx)
                      .reverse()
                      .find(item => item.type === "chord");
                    const nextChord = line.segments
                      .slice(segIdx + 1)
                      .find(item => item.type === "chord");
                    const isActiveLyric = previousChord?.chordIndex === currentChordIndex ||
                      (!previousChord && nextChord?.chordIndex === currentChordIndex);

                    return (
                      <span key={segIdx} className={`lyric-text ${isActiveLyric ? "active-phrase" : ""}`}>
                        {renderLyricText(seg.text, isActiveLyric)}
                      </span>
                    );
                  }

                  // Chord segment
                  const transposedChord = transposeChord(seg.chord, transposeOffset);
                  const isChordActive = seg.chordIndex === currentChordIndex;

                  return (
                    <span
                      key={segIdx}
                      className={`lyric-chord-tag ${isChordActive ? "active-pulse" : ""}`}
                      onClick={() => onSelectChord(seg.chordIndex, transposedChord)}
                      title="Start from this chord"
                    >
                      {transposedChord}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {waitingForSpaceLineIndex !== null && (
        <div className="space-prompt-overlay animate-pulse" style={{
          textAlign: "center",
          margin: "15px auto 0 auto",
          padding: "8px 16px",
          background: "rgba(255, 234, 0, 0.15)",
          border: "1px dashed var(--neon-yellow)",
          borderRadius: "8px",
          width: "fit-content",
          color: "var(--neon-yellow)",
          fontWeight: "bold",
          fontSize: "0.85rem",
          letterSpacing: "1px",
          boxShadow: "0 0 10px rgba(255, 234, 0, 0.2)"
        }}>
          Press [SPACEBAR] to advance to the next line ⬇️
        </div>
      )}
    </div>
  );
}
