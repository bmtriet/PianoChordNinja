import React, { useState, useEffect } from "react";
import StartMenu from "./components/StartMenu";
import GameHud from "./components/GameHud";
import GameOverMenu from "./components/GameOverMenu";
import GameCanvas from "./components/GameCanvas";
import LyricSheet from "./components/LyricSheet";
import { audioManager } from "./utils/audio";
import { getChordNotes } from "./utils/chordDetector";

export default function App() {
  // Game states
  const [gameState, setGameState] = useState("menu"); // "menu", "playing", "gameover"
  const [gameMode, setGameMode] = useState(() => loadSaved("gameMode", "ninja")); // "ninja", "waterfall", "lyric"
  
  // High scores
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem("pianoChordNinjaHighScore");
    return saved ? parseInt(saved, 10) : 0;
  });

  // Gameplay HUD states
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(1);
  const [maxCombo, setMaxCombo] = useState(1);
  const [detectedChord, setDetectedChord] = useState("");
  const [lives, setLives] = useState(3);
  const [songProgress, setSongProgress] = useState(0);

  // GameOver Stats
  const [gameOverStats, setGameOverStats] = useState({
    finalScore: 0,
    maxCombo: 1,
    slicedChords: new Set(),
    notesHit: 0,
    totalNotes: 0,
    songName: ""
  });

  // Practice & Dojo settings
  const [chordFamilies, setChordFamilies] = useState(() => 
    loadSaved("chordFamilies", { major: true, minor: true, power: false, seventh: false, suspended: false })
  );
  const [noDieEnabled, setNoDieEnabled] = useState(() => loadSaved("noDieEnabled", false));
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(() => loadSaved("autoPlayEnabled", false));
  const [learnModeEnabled, setLearnModeEnabled] = useState(() => loadSaved("learnModeEnabled", false));
  const [keyboardRange, setKeyboardRange] = useState(() => loadSaved("keyboardRange", 25));
  const [currentSongIndex, setCurrentSongIndex] = useState(() => loadSaved("currentSongIndex", -1));
  const [cameraEnabled, setCameraEnabled] = useState(() => loadSaved("cameraEnabled", true));
  const [blurAmount, setBlurAmount] = useState(() => loadSaved("blurAmount", 20));
  
  // Waterfall settings
  const [waterfallSongIndex, setWaterfallSongIndex] = useState(() => loadSaved("waterfallSongIndex", 0));
  const [waterfallPlayMode, setWaterfallPlayMode] = useState(() => loadSaved("waterfallPlayMode", "practice"));
  const [customWaterfallSong, setCustomWaterfallSong] = useState(null);

  // Lyric Play-Along settings
  const [lyricSongUrl, setLyricSongUrl] = useState(() => loadSaved("lyricSongUrl", ""));
  const [isLyricLoading, setIsLyricLoading] = useState(false);
  const [lyricSongData, setLyricSongData] = useState(null);
  const [currentChordIndex, setCurrentChordIndex] = useState(0);
  
  // Sound controls
  const [bgVolume, setBgVolume] = useState(() => loadSaved("bgVolume", 0.22));
  const [isMuted, setIsMuted] = useState(() => loadSaved("isMuted", false));
  const [audioPreset, setAudioPreset] = useState(() => loadSaved("audioPreset", "piano"));

  // Helper to load individual keys from localstorage
  function loadSaved(key, defaultVal) {
    const saved = localStorage.getItem("pianoChordNinjaSettings");
    if (!saved) return defaultVal;
    try {
      const settings = JSON.parse(saved);
      if (settings[key] !== undefined) return settings[key];
    } catch (e) {}
    return defaultVal;
  }

  // Save configurations on changes
  useEffect(() => {
    const settings = {
      gameMode,
      chordFamilies,
      noDieEnabled,
      autoPlayEnabled,
      learnModeEnabled,
      keyboardRange,
      currentSongIndex,
      cameraEnabled,
      blurAmount,
      waterfallSongIndex,
      waterfallPlayMode,
      lyricSongUrl,
      bgVolume,
      isMuted,
      audioPreset
    };
    localStorage.setItem("pianoChordNinjaSettings", JSON.stringify(settings));
  }, [
    gameMode, chordFamilies, noDieEnabled, autoPlayEnabled, learnModeEnabled,
    keyboardRange, currentSongIndex, cameraEnabled, blurAmount,
    waterfallSongIndex, waterfallPlayMode, lyricSongUrl, bgVolume, isMuted, audioPreset
  ]);

  // Sync mute state on startup or changes
  useEffect(() => {
    audioManager.isMuted = isMuted;
  }, [isMuted]);

  // Sync audio instrument preset
  useEffect(() => {
    audioManager.audioPreset = audioPreset;
  }, [audioPreset]);

  // --- LYRIC MODE HELPERS ---
  const getChordsListFromLyricData = () => {
    if (!lyricSongData || !lyricSongData.lines) return [];
    const list = [];
    lyricSongData.lines.forEach(line => {
      if (line.type === "lyric_chords" && line.segments) {
        line.segments.forEach(seg => {
          if (seg.type === "chord") {
            list.push(seg.chord);
          }
        });
      }
    });
    return list;
  };

  const getActiveChordFromLyricData = () => {
    const list = getChordsListFromLyricData();
    if (currentChordIndex >= 0 && currentChordIndex < list.length) {
      return list[currentChordIndex];
    }
    return null;
  };

  // Scrape HopAmChuan songs
  const handleLoadLyricSong = async (url) => {
    if (!url) return;
    setIsLyricLoading(true);
    try {
      const response = await fetch(`/api/scrape?url=${encodeURIComponent(url)}`);
      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }
      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }
      setLyricSongData(data);
      setCurrentChordIndex(0);
    } catch (err) {
      alert("Failed to load song from URL: " + err.message);
    } finally {
      setIsLyricLoading(false);
    }
  };

  // Auto-load last lyric song on startup if present
  useEffect(() => {
    if (lyricSongUrl) {
      handleLoadLyricSong(lyricSongUrl);
    }
  }, []);

  const handlePlayChordPreview = (chordName) => {
    audioManager.init();
    const chordInfo = getChordNotes(chordName);
    if (chordInfo) {
      const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
      const midiNotes = chordInfo.notes.map(name => 60 + NOTE_NAMES.indexOf(name));
      
      // Play notes
      midiNotes.forEach(note => audioManager.noteOn(note));
      // Release notes after 800ms
      setTimeout(() => {
        midiNotes.forEach(note => audioManager.noteOff(note));
      }, 800);
    }
  };

  // --- LYRIC MODE PLAY GAMEPLAY LOOPS ---
  // 1. User chord play match validation
  useEffect(() => {
    if (gameState !== "playing" || gameMode !== "lyric" || !detectedChord || !lyricSongData) return;

    const activeChord = getActiveChordFromLyricData();
    if (!activeChord) return;

    const cleanDetected = detectedChord.replace(/Minor/i, "m").replace(/Major/i, "").replace(/\s+/g, "").toLowerCase();
    const cleanActive = activeChord.replace(/Minor/i, "m").replace(/Major/i, "").replace(/\s+/g, "").toLowerCase();

    if (cleanDetected === cleanActive) {
      audioManager.playChordCorrectSFX();
      
      setScore(prev => prev + 100 * combo);
      setCombo(prev => prev + 1);
      
      setCurrentChordIndex(prev => {
        const nextIdx = prev + 1;
        const total = getChordsListFromLyricData().length;
        if (nextIdx >= total) {
          // Finished song!
          setTimeout(() => {
            handleGameFinished({
              finalScore: score + 100 * combo,
              maxCombo: combo,
              slicedChords: new Set(getChordsListFromLyricData()),
              notesHit: total,
              totalNotes: total,
              songName: lyricSongData.title
            });
          }, 1200);
        }
        return nextIdx;
      });

      // Clear detectedChord immediately to prevent double trigger matches
      setDetectedChord("");
    }
  }, [detectedChord, gameState, gameMode, lyricSongData, combo, score]);

  // 2. Autoplay timer mode
  useEffect(() => {
    if (gameState !== "playing" || gameMode !== "lyric" || !autoPlayEnabled || !lyricSongData) return;

    const chords = getChordsListFromLyricData();
    if (chords.length === 0 || currentChordIndex >= chords.length) return;

    const timer = setTimeout(() => {
      const activeChord = chords[currentChordIndex];
      handlePlayChordPreview(activeChord);

      setScore(prev => prev + 100);
      setCurrentChordIndex(prev => {
        const next = prev + 1;
        if (next >= chords.length) {
          setTimeout(() => {
            handleGameFinished({
              finalScore: score + 100,
              maxCombo: 1,
              slicedChords: new Set(chords),
              notesHit: chords.length,
              totalNotes: chords.length,
              songName: lyricSongData.title
            });
          }, 1200);
        }
        return next;
      });
    }, 3800);

    return () => clearTimeout(timer);
  }, [currentChordIndex, gameState, gameMode, autoPlayEnabled, lyricSongData, score]);

  // Trigger game start
  const handleStartGame = () => {
    setScore(0);
    setCombo(1);
    setLives(3);
    setSongProgress(0);
    setCurrentChordIndex(0);
    setGameState("playing");
  };

  // Sync stat triggers pushed from canvas animation frames
  const handleStatsUpdate = (stats) => {
    setScore(stats.score);
    setCombo(stats.combo);
    setDetectedChord(stats.detectedChord);
    setLives(stats.lives);
    if (stats.songProgress !== undefined) {
      setSongProgress(stats.songProgress);
    }
  };

  // Sync game finished statistics
  const handleGameFinished = (summary) => {
    setGameOverStats({
      finalScore: summary.finalScore,
      maxCombo: summary.maxCombo,
      slicedChords: summary.slicedChords,
      notesHit: summary.notesHit,
      totalNotes: summary.totalNotes,
      songName: summary.songName
    });
    
    // Save high scores
    if (summary.finalScore > highScore) {
      setHighScore(summary.finalScore);
      localStorage.setItem("pianoChordNinjaHighScore", String(summary.finalScore));
    }
    
    setGameState("gameover");
  };

  // Exit trigger
  const handleExitGame = () => {
    setGameState("menu");
  };

  const handleMuteToggle = () => {
    const muted = audioManager.toggleMute();
    setIsMuted(muted);
  };

  const activeLyricChord = gameMode === "lyric" ? getActiveChordFromLyricData() : null;

  return (
    <div id="gameWrapper">
      {/* 3D/2D Visual Canvas */}
      {gameState === "playing" && (
        <GameCanvas
          gameState={gameState}
          gameMode={gameMode}
          setGameState={setGameState}
          keyboardRange={keyboardRange}
          chordFamilies={chordFamilies}
          noDieEnabled={noDieEnabled}
          autoPlayEnabled={autoPlayEnabled}
          learnModeEnabled={learnModeEnabled}
          cameraEnabled={cameraEnabled}
          blurAmount={blurAmount}
          currentSongIndex={currentSongIndex}
          waterfallSongIndex={waterfallSongIndex}
          waterfallPlayMode={waterfallPlayMode}
          customWaterfallSong={customWaterfallSong}
          activeLyricChord={activeLyricChord}
          onStatsUpdate={handleStatsUpdate}
          onGameFinished={handleGameFinished}
          bgVolume={bgVolume}
          isMuted={isMuted}
        />
      )}

      {/* Lyric Sheet scroll panel overlay */}
      {gameState === "playing" && gameMode === "lyric" && (
        <LyricSheet
          active={true}
          songData={lyricSongData}
          currentChordIndex={currentChordIndex}
          setCurrentChordIndex={setCurrentChordIndex}
          onPlayChordPreview={handlePlayChordPreview}
          activeNotes={detectedChord}
          isMuted={isMuted}
        />
      )}

      {/* Start setup Menu overlay */}
      <StartMenu
        active={gameState === "menu"}
        highScore={highScore}
        onStartGame={handleStartGame}
        gameMode={gameMode}
        setGameMode={setGameMode}
        chordFamilies={chordFamilies}
        setChordFamilies={setChordFamilies}
        noDieEnabled={noDieEnabled}
        setNoDieEnabled={setNoDieEnabled}
        autoPlayEnabled={autoPlayEnabled}
        setAutoPlayEnabled={setAutoPlayEnabled}
        learnModeEnabled={learnModeEnabled}
        setLearnModeEnabled={setLearnModeEnabled}
        keyboardRange={keyboardRange}
        setKeyboardRange={setKeyboardRange}
        currentSongIndex={currentSongIndex}
        setCurrentSongIndex={setCurrentSongIndex}
        cameraEnabled={cameraEnabled}
        setCameraEnabled={setCameraEnabled}
        blurAmount={blurAmount}
        setBlurAmount={setBlurAmount}
        waterfallSongIndex={waterfallSongIndex}
        setWaterfallSongIndex={setWaterfallSongIndex}
        waterfallPlayMode={waterfallPlayMode}
        setWaterfallPlayMode={setWaterfallPlayMode}
        customWaterfallSong={customWaterfallSong}
        setCustomWaterfallSong={setCustomWaterfallSong}
        
        // Lyric mode parameters
        lyricSongUrl={lyricSongUrl}
        setLyricSongUrl={setLyricSongUrl}
        onLoadLyricSong={handleLoadLyricSong}
        isLyricLoading={isLyricLoading}
        lyricSongData={lyricSongData}

        // Audio preset parameters
        audioPreset={audioPreset}
        setAudioPreset={setAudioPreset}
      />

      {/* Razor-sharp stats HUD dashboard overlay */}
      <GameHud
        active={gameState === "playing"}
        score={score}
        combo={combo}
        detectedChord={detectedChord}
        lives={lives}
        noDieEnabled={noDieEnabled}
        autoPlayEnabled={autoPlayEnabled}
        setAutoPlayEnabled={setAutoPlayEnabled}
        learnModeEnabled={learnModeEnabled}
        setLearnModeEnabled={setLearnModeEnabled}
        cameraEnabled={cameraEnabled}
        setCameraEnabled={setCameraEnabled}
        bgVolume={bgVolume}
        setBgVolume={setBgVolume}
        currentSongIndex={currentSongIndex}
        setCurrentSongIndex={setCurrentSongIndex}
        onMuteToggle={handleMuteToggle}
        isMuted={isMuted}
        onExitGame={handleExitGame}
        gameMode={gameMode}
        activeSongName={
          gameMode === "lyric"
            ? lyricSongData?.title
            : waterfallSongIndex === -2 
            ? customWaterfallSong?.name 
            : ["Ode to Joy", "Für Elise", "Canon in D"][waterfallSongIndex]
        }
        songProgress={
          gameMode === "lyric"
            ? (getChordsListFromLyricData().length > 0 ? currentChordIndex / getChordsListFromLyricData().length : 0)
            : songProgress
        }
        audioPreset={audioPreset}
        setAudioPreset={setAudioPreset}
      />

      {/* Session completion metrics statistics overview overlay */}
      <GameOverMenu
        active={gameState === "gameover"}
        score={gameOverStats.finalScore}
        maxCombo={gameOverStats.maxCombo}
        slicedChords={gameOverStats.slicedChords}
        onRestartGame={handleStartGame}
        onMainMenu={() => setGameState("menu")}
        gameMode={gameMode}
        playedSongName={gameOverStats.songName}
        notesHit={gameOverStats.notesHit}
        totalNotesCount={gameOverStats.totalNotes}
      />
    </div>
  );
}
