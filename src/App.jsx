import React, { useState, useEffect, useRef } from "react";
import StartMenu from "./components/StartMenu";
import GameHud from "./components/GameHud";
import GameOverMenu from "./components/GameOverMenu";
import GameCanvas from "./components/GameCanvas";
import LyricSheet from "./components/LyricSheet";
import { audioManager } from "./utils/audio";
import { getChordNotes, transposeChord, getChordBassNote, getChordRoot } from "./utils/chordDetector";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const LYRIC_RAKE_WINDOW_MS = 1200;
const MIDI_LOG_LIMIT = 400;

const normalizeChordName = (chordName) => (
  chordName
    .replace(/Minor/i, "m")
    .replace(/Major/i, "")
    .replace(/\s+/g, "")
    .toLowerCase()
);

const normalizeNoteName = (noteName) => {
  const flatToSharp = { db: "c#", eb: "d#", gb: "f#", ab: "g#", bb: "a#" };
  const clean = noteName.toLowerCase();
  return flatToSharp[clean] || clean;
};

const midiNoteToLabel = (midiNote) => {
  const noteName = NOTE_NAMES[midiNote % 12];
  const octave = Math.floor(midiNote / 12) - 1;
  return `${noteName}${octave}`;
};

const getPowerChordRootFromNotes = (notes) => {
  const pitchClasses = Array.from(new Set(notes.map(note => note % 12)));
  if (pitchClasses.length < 2) return null;

  for (const root of pitchClasses) {
    const fifth = (root + 7) % 12;
    const hasFifth = pitchClasses.includes(fifth);
    const onlyRootAndFifth = pitchClasses.every(pc => pc === root || pc === fifth);

    if (hasFifth && onlyRootAndFifth) {
      return NOTE_NAMES[root];
    }
  }

  return null;
};

const getAdaptiveStyleMatch = (notes, targetChordName) => {
  const targetRoot = getChordRoot(targetChordName);
  const targetInfo = getChordNotes(targetChordName);
  if (!targetRoot || !targetInfo || !notes || notes.length < 2) return false;

  const targetRootIndex = NOTE_NAMES.indexOf(targetRoot);
  if (targetRootIndex < 0) return false;

  const sortedNotes = [...notes].sort((a, b) => a - b);
  const bassPitch = sortedNotes[0] % 12;
  if (bassPitch !== targetRootIndex) return false;

  const pitchClasses = Array.from(new Set(sortedNotes.map(note => note % 12)));
  const hasRoot = pitchClasses.includes(targetRootIndex);
  const hasFifth = pitchClasses.includes((targetRootIndex + 7) % 12);
  const targetThirdInterval = targetInfo.intervals.find(interval => interval === 3 || interval === 4);
  const hasTargetThird = targetThirdInterval !== undefined
    ? pitchClasses.includes((targetRootIndex + targetThirdInterval) % 12)
    : false;
  const oppositeThirdInterval = targetThirdInterval === 3 ? 4 : targetThirdInterval === 4 ? 3 : null;
  const hasOnlyOppositeThird = oppositeThirdInterval !== null &&
    pitchClasses.includes((targetRootIndex + oppositeThirdInterval) % 12) &&
    !hasTargetThird;

  if (hasOnlyOppositeThird) return false;

  return hasRoot && (hasFifth || hasTargetThird);
};

const checkChordMatch = (activeNotes, detectedChord, targetChordName) => {
  if (!targetChordName) return false;
  if (!activeNotes || activeNotes.length === 0) return false;

  // Transpose target chord for clean comparison
  const cleanTarget = normalizeChordName(targetChordName);
  const targetRoot = getChordRoot(targetChordName);

  // 1. Check if the full chord matches
  if (detectedChord && detectedChord !== "Unknown Chord") {
    const cleanDetected = normalizeChordName(detectedChord);
    if (cleanDetected === cleanTarget) {
      return true;
    }

    // Smart Power Chord matching: if the played chord is a power chord (ends with 5),
    // it matches if its root note matches the root note of the target chord.
    if (cleanDetected.endsWith("5")) {
      const powerRoot = cleanDetected.substring(0, cleanDetected.length - 1);
      if (targetRoot) {
        if (powerRoot === normalizeNoteName(targetRoot)) {
          return true;
        }
      }
    }
  }

  // 2. Detect power-chord voicings directly from held/raked notes, e.g. C-G-C or F-C-F.
  const playedPowerRoot = getPowerChordRootFromNotes(activeNotes);
  if (playedPowerRoot && targetRoot && normalizeNoteName(playedPowerRoot) === normalizeNoteName(targetRoot)) {
    return true;
  }

  // 3. Adapt to the user's bass-anchor style: root/fifth first, third later,
  // with passing tones ignored as long as the bass is the target root.
  if (getAdaptiveStyleMatch(activeNotes, targetChordName)) {
    return true;
  }

  // 4. Check explicit slash-chord bass notes. Avoid matching a normal chord too early on
  // the first root note of a raked power chord.
  if (!targetChordName.includes("/")) {
    return false;
  }

  const lowestMidi = Math.min(...activeNotes);
  const playedBassName = NOTE_NAMES[lowestMidi % 12];
  
  // Get expected bass note name for the target chord
  const expectedBassName = getChordBassNote(targetChordName);

  if (expectedBassName) {
    const cleanExpected = normalizeNoteName(expectedBassName);
    const cleanPlayed = normalizeNoteName(playedBassName);
    
    if (cleanPlayed === cleanExpected) {
      return true;
    }
  }

  return false;
};

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
  const [midiLogs, setMidiLogs] = useState([]);
  const midiLogStartRef = useRef(0);
  const lastMidiLogSignatureRef = useRef({ signature: "", time: 0 });

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

  // SQLite DB & Library states
  const [savedSongsList, setSavedSongsList] = useState([]);
  const [songSearchQuery, setSongSearchQuery] = useState("");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [transposeOffset, setTransposeOffset] = useState(0);
  const [pianoSoundEnabled, setPianoSoundEnabled] = useState(true);

  // Advanced Live Chord/Bass follow states
  const [activeNotes, setActiveNotes] = useState([]);
  const [lyricInputNotes, setLyricInputNotes] = useState([]);
  const [estimatedBpm, setEstimatedBpm] = useState(0);
  const previousActiveNotesRef = useRef([]);
  const lyricRakeNotesRef = useRef([]);
  const lyricRakeTimerRef = useRef(null);
  const lastMatchTimeRef = useRef(0);
  const matchIntervalsRef = useRef([]);
  const lastMatchedNotesRef = useRef([]);

  const formatMidiLogLines = (logs = midiLogs) => {
    if (!logs || logs.length === 0) return "";

    return logs.map(entry => {
      const active = entry.activeNotes.length > 0 ? entry.activeNotes.map(midiNoteToLabel).join(" ") : "-";
      const detected = entry.detectedChord || "-";
      const target = entry.targetChord || "-";
      return [
        `${entry.relativeTime.toFixed(3)}s`,
        entry.action,
        entry.noteName,
        `midi=${entry.note}`,
        `vel=${entry.velocity}`,
        `src=${entry.source}`,
        `active=[${active}]`,
        `detected=${detected}`,
        `target=${target}`,
        `idx=${entry.chordIndex}`
      ].join(" | ");
    }).join("\n");
  };

  const handleInputLog = (event) => {
    const now = performance.now();
    if (!midiLogStartRef.current) {
      midiLogStartRef.current = now;
    }

    const activeSignature = (event.activeNotes || []).join(",");
    const signature = [
      event.isPressed ? "ON" : "OFF",
      event.note,
      event.velocity ?? 0,
      event.source || "midi",
      activeSignature,
      event.detectedChord || ""
    ].join("|");

    if (
      lastMidiLogSignatureRef.current.signature === signature &&
      now - lastMidiLogSignatureRef.current.time < 12
    ) {
      return;
    }
    lastMidiLogSignatureRef.current = { signature, time: now };

    const noteName = midiNoteToLabel(event.note);
    const entry = {
      id: `${now}-${event.note}-${event.isPressed ? "on" : "off"}`,
      timestamp: new Date().toISOString(),
      relativeTime: (now - midiLogStartRef.current) / 1000,
      action: event.isPressed ? "ON" : "OFF",
      note: event.note,
      noteName,
      velocity: event.velocity ?? 0,
      source: event.source || "midi",
      activeNotes: event.activeNotes || [],
      detectedChord: event.detectedChord || "",
      targetChord: activeLyricChord || "",
      chordIndex: currentChordIndex
    };

    setMidiLogs(prev => [...prev, entry].slice(-MIDI_LOG_LIMIT));
  };

  const handleClearMidiLogs = () => {
    midiLogStartRef.current = performance.now();
    lastMidiLogSignatureRef.current = { signature: "", time: 0 };
    setMidiLogs([]);
  };

  const handleCopyMidiLogs = async () => {
    const text = formatMidiLogLines();
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      console.warn("Clipboard API failed, falling back to prompt", e);
      window.prompt("Copy MIDI logs", text);
    }
  };

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

  // Fetch saved songs from SQLite
  const fetchSavedSongs = async () => {
    try {
      const res = await fetch(`/api/db/songs?search=${encodeURIComponent(songSearchQuery)}&favorites=${showFavoritesOnly ? 1 : 0}`);
      if (res.ok) {
        const list = await res.json();
        setSavedSongsList(list.map(s => normalizeSongData(s)));
      }
    } catch (e) {
      console.error("Failed to fetch saved songs", e);
    }
  };

  const normalizeSongData = (data) => {
    if (!data) return null;
    const lines = data.lines || (typeof data.content === 'string' ? JSON.parse(data.content) : data.content);
    return {
      id: data.id,
      url: data.url,
      title: data.title,
      artist: data.artist,
      lines: lines || [],
      transpose: data.transpose || 0,
      is_favorite: !!data.is_favorite
    };
  };

  // Fetch saved library on search/filter query changes
  useEffect(() => {
    fetchSavedSongs();
  }, [songSearchQuery, showFavoritesOnly]);

  // Load pianoSoundEnabled setting from SQLite
  useEffect(() => {
    fetch('/api/db/settings?key=pianoSoundEnabled&default=true')
      .then(res => res.json())
      .then(data => {
        const enabled = data.value !== 'false';
        setPianoSoundEnabled(enabled);
        audioManager.pianoSoundEnabled = enabled;
      })
      .catch(e => console.error("Failed to load setting", e));
  }, []);

  // Save pianoSoundEnabled setting to SQLite on change
  useEffect(() => {
    audioManager.pianoSoundEnabled = pianoSoundEnabled;
    fetch('/api/db/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'pianoSoundEnabled', value: String(pianoSoundEnabled) })
    }).catch(e => console.error("Failed to save setting", e));
  }, [pianoSoundEnabled]);

  // Sync transposeOffset whenever lyricSongData changes (a song is loaded)
  useEffect(() => {
    if (lyricSongData) {
      setTransposeOffset(lyricSongData.transpose || 0);
    } else {
      setTransposeOffset(0);
    }
  }, [lyricSongData]);

  // SQLite Database Action Handlers
  const handleSelectSavedSong = (song) => {
    const normalized = normalizeSongData(song);
    setLyricSongData(normalized);
    setLyricSongUrl(normalized.url);
    setCurrentChordIndex(0);
  };

  const handleDeleteSavedSong = async (songId) => {
    try {
      const res = await fetch(`/api/db/songs/${songId}`, { method: 'DELETE' });
      if (res.ok) {
        if (lyricSongData && lyricSongData.id === songId) {
          setLyricSongData(null);
        }
        fetchSavedSongs();
      }
    } catch (e) {
      console.error("Failed to delete song", e);
    }
  };

  const handleToggleFavoriteSong = async (song) => {
    const newFav = song.is_favorite ? 0 : 1;
    try {
      const res = await fetch(`/api/db/songs/${song.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_favorite: newFav })
      });
      if (res.ok) {
        if (lyricSongData && lyricSongData.id === song.id) {
          setLyricSongData(prev => ({ ...prev, is_favorite: !!newFav }));
        }
        fetchSavedSongs();
      }
    } catch (e) {
      console.error("Failed to toggle favorite", e);
    }
  };

  const handleTransposeChange = async (diff) => {
    if (!lyricSongData) return;
    const newTranspose = transposeOffset + diff;
    setTransposeOffset(newTranspose);
    
    // Update local state
    setLyricSongData(prev => ({ ...prev, transpose: newTranspose }));

    // Save to SQLite
    try {
      await fetch(`/api/db/songs/${lyricSongData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transpose: newTranspose })
      });
      fetchSavedSongs();
    } catch (e) {
      console.error("Failed to save transpose", e);
    }
  };

  const handleFavoriteToggleActive = async () => {
    if (!lyricSongData) return;
    const newFav = lyricSongData.is_favorite ? 0 : 1;
    setLyricSongData(prev => ({ ...prev, is_favorite: !!newFav }));
    
    try {
      await fetch(`/api/db/songs/${lyricSongData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_favorite: newFav })
      });
      fetchSavedSongs();
    } catch (e) {
      console.error("Failed to save favorite toggle", e);
    }
  };

  // --- LYRIC MODE HELPERS ---
  const getChordsListFromLyricData = () => {
    if (!lyricSongData || !lyricSongData.lines) return [];
    const list = [];
    lyricSongData.lines.forEach(line => {
      if (!line.skipped && line.type === "lyric_chords" && line.segments) {
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

  const getLyricLineRanges = () => {
    if (!lyricSongData || !lyricSongData.lines) return [];

    let chordIndex = 0;
    return lyricSongData.lines.map((line, lineIndex) => {
      const chordCount = !line.skipped && line.type === "lyric_chords" && line.segments
        ? line.segments.filter(seg => seg.type === "chord").length
        : 0;
      const range = {
        lineIndex,
        startChordIndex: chordIndex,
        endChordIndex: chordIndex + chordCount,
        chordCount
      };
      chordIndex += chordCount;
      return range;
    });
  };

  const handleSkipCurrentLyricLine = async () => {
    if (!lyricSongData || !lyricSongData.lines) return;

    const chords = getChordsListFromLyricData();
    if (chords.length === 0) return;

    const currentLine = getLyricLineRanges().find(range => (
      range.chordCount > 0 &&
      currentChordIndex >= range.startChordIndex &&
      currentChordIndex < range.endChordIndex
    ));

    if (!currentLine) {
      setCurrentChordIndex(prev => Math.min(prev + 1, chords.length));
      return;
    }

    const updatedLines = lyricSongData.lines.map((line, lineIndex) => (
      lineIndex === currentLine.lineIndex ? { ...line, skipped: true } : line
    ));
    const remainingChordCount = updatedLines.reduce((total, line) => {
      if (line.skipped || line.type !== "lyric_chords" || !line.segments) return total;
      return total + line.segments.filter(seg => seg.type === "chord").length;
    }, 0);
    const nextIndex = currentLine.startChordIndex >= remainingChordCount ? 0 : currentLine.startChordIndex;

    setLyricSongData(prev => ({ ...prev, lines: updatedLines }));
    setCurrentChordIndex(nextIndex);

    if (!lyricSongData.id) return;

    try {
      await fetch(`/api/db/songs/${lyricSongData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: updatedLines })
      });
      fetchSavedSongs();
    } catch (e) {
      console.error("Failed to save skipped lyric line", e);
    }
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
      const normalized = normalizeSongData(data);
      setLyricSongData(normalized);
      setCurrentChordIndex(0);
      fetchSavedSongs(); // Refresh list to show newly scraped song!
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

  const handleSelectLyricChord = (chordIndex, chordName) => {
    setCurrentChordIndex(chordIndex);
    lastMatchedNotesRef.current = [];
    lyricRakeNotesRef.current = [];
    setLyricInputNotes([]);
    setDetectedChord("");

    if (chordName) {
      handlePlayChordPreview(chordName);
    }
  };

  // --- LYRIC MODE PLAY GAMEPLAY LOOPS ---
  // Keep a short strike buffer so raked voicings like C-G-C still read as C5
  // even if the player releases each note quickly.
  useEffect(() => {
    if (lyricRakeTimerRef.current) {
      clearTimeout(lyricRakeTimerRef.current);
      lyricRakeTimerRef.current = null;
    }

    if (gameState !== "playing" || gameMode !== "lyric") {
      previousActiveNotesRef.current = [];
      lyricRakeNotesRef.current = [];
      setLyricInputNotes([]);
      return;
    }

    const now = performance.now();
    const currentNotes = activeNotes || [];
    const previousNotes = previousActiveNotesRef.current || [];
    const newlyPressedNotes = currentNotes.filter(note => !previousNotes.includes(note));

    if (newlyPressedNotes.length > 0) {
      lyricRakeNotesRef.current = [
        ...lyricRakeNotesRef.current,
        ...newlyPressedNotes.map(note => ({ note, time: now }))
      ];
    }

    lyricRakeNotesRef.current = lyricRakeNotesRef.current.filter(({ time }) => now - time <= LYRIC_RAKE_WINDOW_MS);
    previousActiveNotesRef.current = currentNotes;

    const rakedNotes = lyricRakeNotesRef.current.map(({ note }) => note);
    const mergedNotes = Array.from(new Set([...currentNotes, ...rakedNotes]));
    setLyricInputNotes(mergedNotes);

    if (mergedNotes.length > currentNotes.length) {
      lyricRakeTimerRef.current = setTimeout(() => {
        lyricRakeNotesRef.current = [];
        setLyricInputNotes(activeNotes || []);
      }, LYRIC_RAKE_WINDOW_MS);
    }

    return () => {
      if (lyricRakeTimerRef.current) {
        clearTimeout(lyricRakeTimerRef.current);
        lyricRakeTimerRef.current = null;
      }
    };
  }, [activeNotes, gameState, gameMode]);

  // Debounce raw MIDI activeNotes and detectedChord by 60ms to prevent double/triple skips from sequential keypresses.
  const [debouncedNotes, setDebouncedNotes] = useState([]);
  const [debouncedChord, setDebouncedChord] = useState("");

  useEffect(() => {
    if (gameState !== "playing" || gameMode !== "lyric") {
      setDebouncedNotes([]);
      setDebouncedChord("");
      return;
    }

    const timer = setTimeout(() => {
      setDebouncedNotes(lyricInputNotes || []);
      setDebouncedChord(detectedChord || "");
    }, 60);

    return () => clearTimeout(timer);
  }, [lyricInputNotes, detectedChord, gameState, gameMode]);

  // 1. User chord/bass note play match validation and auto-seeking
  useEffect(() => {
    if (gameState !== "playing" || gameMode !== "lyric" || !lyricSongData) return;

    // If debouncedNotes is empty, reset match history checks to allow next keys strike
    if (!debouncedNotes || debouncedNotes.length === 0) {
      lastMatchedNotesRef.current = [];
      return;
    }

    // Prevent double-matching the same key presses
    if (lastMatchedNotesRef.current && lastMatchedNotesRef.current.length > 0) {
      const isSubset = debouncedNotes.every(note => lastMatchedNotesRef.current.includes(note));
      if (isSubset) return;
    }

    // Get list of all chords in the song
    const chords = getChordsListFromLyricData();
    if (chords.length === 0 || currentChordIndex >= chords.length) return;

    // Match strictly from top to bottom, then left to right inside the current lyric line.
    // The small two-chord window lets the player catch up within the line without jumping globally.
    let matchedIndex = -1;
    const currentLine = getLyricLineRanges().find(range => (
      range.chordCount > 0 &&
      currentChordIndex >= range.startChordIndex &&
      currentChordIndex < range.endChordIndex
    ));
    const matchStart = currentChordIndex;
    const matchEnd = currentLine
      ? Math.min(currentLine.endChordIndex, currentChordIndex + 2)
      : Math.min(chords.length, currentChordIndex + 1);

    for (let i = matchStart; i < matchEnd; i++) {
      const targetChord = chords[i];
      const transposedTarget = transposeChord(targetChord, transposeOffset);
      if (checkChordMatch(debouncedNotes, debouncedChord, transposedTarget)) {
        matchedIndex = i;
        break;
      }
    }

    // If we found a match, execute match actions and transposition-aware advancement!
    if (matchedIndex !== -1) {
      // Record these notes to prevent repeat matches until keys are lifted/changed
      lastMatchedNotesRef.current = [...debouncedNotes];
      lyricRakeNotesRef.current = [];

      audioManager.playChordCorrectSFX();
      
      // Calculate BPM prediction based on intervals between chord changes
      const now = performance.now();
      if (lastMatchTimeRef.current > 0) {
        const interval = (now - lastMatchTimeRef.current) / 1000;
        // Tempo delta boundaries: 0.4s to 6.0s
        if (interval >= 0.4 && interval <= 6.0) {
          const updatedIntervals = [...matchIntervalsRef.current, interval].slice(-6);
          matchIntervalsRef.current = updatedIntervals;
          const avgInterval = updatedIntervals.reduce((a, b) => a + b, 0) / updatedIntervals.length;
          // Assume 2 beats per chord tag in nominal speed
          const calculatedBpm = Math.min(220, Math.max(50, (60 / avgInterval) * 2));
          setEstimatedBpm(calculatedBpm);
        }
      }
      lastMatchTimeRef.current = now;

      // Update score and combo
      setScore(prev => prev + 100 * combo);
      setCombo(prev => prev + 1);

      // Advance index to the matched chord's NEXT index
      const nextIdx = matchedIndex + 1;
      setCurrentChordIndex(nextIdx);

      if (nextIdx >= chords.length) {
        // Finished song! Loop back to the beginning to play again
        setTimeout(() => {
          setCurrentChordIndex(0);
        }, 1500);
      }

      // Clear detectedChord immediately to prevent double trigger matches
      setDetectedChord("");
    }
  }, [debouncedNotes, debouncedChord, gameState, gameMode, lyricSongData, currentChordIndex, combo, score, transposeOffset]);

  // 2. Autoplay timer mode
  useEffect(() => {
    if (gameState !== "playing" || gameMode !== "lyric" || !autoPlayEnabled || !lyricSongData) return;

    const chords = getChordsListFromLyricData();
    if (chords.length === 0 || currentChordIndex >= chords.length) return;

    const timer = setTimeout(() => {
      const activeChord = chords[currentChordIndex];
      // Apply transposition to play preview sound
      const transposedActive = transposeChord(activeChord, transposeOffset);
      handlePlayChordPreview(transposedActive);

      setScore(prev => prev + 100);
      setCurrentChordIndex(prev => {
        const next = prev + 1;
        if (next >= chords.length) {
          // Finished song in autoplay! Loop back to the beginning
          setTimeout(() => {
            setCurrentChordIndex(0);
          }, 1500);
        }
        return next;
      });
    }, 3800);

    return () => clearTimeout(timer);
  }, [currentChordIndex, gameState, gameMode, autoPlayEnabled, lyricSongData, score, transposeOffset]);

  // Trigger game start
  const handleStartGame = () => {
    setScore(0);
    setCombo(1);
    setLives(3);
    setSongProgress(0);
    setCurrentChordIndex(0);
    setEstimatedBpm(0);
    setLyricInputNotes([]);
    previousActiveNotesRef.current = [];
    lyricRakeNotesRef.current = [];
    lastMatchTimeRef.current = 0;
    matchIntervalsRef.current = [];
    lastMatchedNotesRef.current = [];
    setActiveNotes([]);
    midiLogStartRef.current = performance.now();
    lastMidiLogSignatureRef.current = { signature: "", time: 0 };
    setMidiLogs([]);
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
    if (stats.activeNotes) {
      setActiveNotes(stats.activeNotes);
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

  const activeLyricChord = gameMode === "lyric" 
    ? (getActiveChordFromLyricData() ? transposeChord(getActiveChordFromLyricData(), transposeOffset) : null)
    : null;

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
          onInputLog={handleInputLog}
          onGameFinished={handleGameFinished}
          bgVolume={bgVolume}
          isMuted={isMuted}
        />
      )}

      {/* Lyric Sheet columns panel overlay */}
      {gameState === "playing" && gameMode === "lyric" && (
        <LyricSheet
          active={true}
          songData={lyricSongData}
          currentChordIndex={currentChordIndex}
          onSelectChord={handleSelectLyricChord}
          transposeOffset={transposeOffset}
          onTransposeChange={handleTransposeChange}
          isFavorite={!!lyricSongData?.is_favorite}
          onFavoriteToggle={handleFavoriteToggleActive}
          onSkipCurrentLine={handleSkipCurrentLyricLine}
          
          // Library drawer controls
          savedSongsList={savedSongsList}
          onSelectSavedSong={handleSelectSavedSong}
          onDeleteSavedSong={handleDeleteSavedSong}
          onToggleFavoriteSong={handleToggleFavoriteSong}
          songSearchQuery={songSearchQuery}
          setSongSearchQuery={setSongSearchQuery}
          showFavoritesOnly={showFavoritesOnly}
          setShowFavoritesOnly={setShowFavoritesOnly}
          lyricSongUrl={lyricSongUrl}
          setLyricSongUrl={setLyricSongUrl}
          onLoadLyricSong={handleLoadLyricSong}
          isLyricLoading={isLyricLoading}
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

        // SQLite DB & Library options
        savedSongsList={savedSongsList}
        onSelectSavedSong={handleSelectSavedSong}
        onDeleteSavedSong={handleDeleteSavedSong}
        onToggleFavoriteSong={handleToggleFavoriteSong}
        songSearchQuery={songSearchQuery}
        setSongSearchQuery={setSongSearchQuery}
        showFavoritesOnly={showFavoritesOnly}
        setShowFavoritesOnly={setShowFavoritesOnly}

        // Piano sound state parameters
        pianoSoundEnabled={pianoSoundEnabled}
        setPianoSoundEnabled={setPianoSoundEnabled}
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
        pianoSoundEnabled={pianoSoundEnabled}
        setPianoSoundEnabled={setPianoSoundEnabled}
        estimatedBpm={estimatedBpm}
        midiLogs={midiLogs}
        onCopyMidiLogs={handleCopyMidiLogs}
        onClearMidiLogs={handleClearMidiLogs}
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
