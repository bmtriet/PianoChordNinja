import React, { useEffect, useRef, useState } from "react";
import { getChordNotes, detectChord, NOTE_NAMES, getChordVoicingMidiNotes } from "../utils/chordDetector";
import { audioManager, SONGS } from "../utils/audio";
import { WATERFALL_SONGS } from "../utils/musicTracks";

// Physics & spawner constants (Ninja Mode)
const GRAVITY = 0.08;
const SPAWN_INTERVAL = 4000;
const FRUIT_RADIUS = 100;
const NEON_COLORS = {
  apple: "#ff007f",      // Hot Pink
  orange: "#ffaa00",     // Bright Orange
  watermelon: "#39ff14", // Lime Green
  banana: "#ffea00",     // Yellow
  berry: "#9d00ff"       // Purple
};
const FRUIT_TYPES = ["apple", "orange", "watermelon", "banana", "berry"];
const SPAWN_ROOTS = ["C", "D", "E", "F", "G", "A", "B", "C#", "F#", "G#"];

// Waterfall visual settings
const PIXELS_PER_SECOND = 220; // Falling speed

export default function GameCanvas({
  gameState,
  gameMode,
  setGameState,
  keyboardRange,
  chordFamilies,
  noDieEnabled,
  autoPlayEnabled,
  learnModeEnabled,
  cameraEnabled,
  blurAmount,
  
  // Backing track
  currentSongIndex,
  
  // Waterfall options
  waterfallSongIndex,
  waterfallPlayMode,
  customWaterfallSong,

  // Lyric Play-Along Option
  activeLyricChord,
  
  // States to push back up to App.jsx
  onStatsUpdate, // (score, combo, detectedChord, lives, isMuted)
  onInputLog,
  onGameFinished, // (finalScore, maxCombo, slicedChords, notesHit, totalNotes)
  
  // Ref hooks to trigger actions from HUD
  bgVolume,
  isMuted
}) {
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  
  // Local state references for loop (to bypass React re-render lag)
  const stateRef = useRef({
    gameState: "menu",
    score: 0,
    combo: 1,
    maxCombo: 1,
    lives: 3,
    slicedChords: new Set(),
    activeNotes: new Set(),
    activeQwertyNotes: new Map(),
    detectedChordName: "",
    
    // Entity lists
    fruits: [],
    particles: [],
    slashes: [],
    floatingTexts: [],
    autoPlayCooldowns: new Set(),
    
    // Waterfall-specific states
    songPlaybackTime: 0,
    songNotes: [],
    notesHit: 0,
    totalNotesCount: 0,
    activeSimulatedNotes: new Set(),
    
    // Loop controls
    gameLoopId: null,
    spawnTimerId: null,
    lastTime: 0,
    webcamStream: null
  });

  // Keep state sync with props
  useEffect(() => {
    stateRef.current.gameState = gameState;
  }, [gameState]);

  // Handle webcam background toggling
  useEffect(() => {
    if (cameraEnabled) {
      initWebcam();
    } else {
      stopWebcam();
    }
    return () => stopWebcam();
  }, [cameraEnabled]);

  // Handle background music settings
  useEffect(() => {
    if (gameState === "playing") {
      audioManager.setBgVolume(bgVolume);
    }
  }, [bgVolume, gameState]);

  useEffect(() => {
    if (gameState === "playing") {
      if (currentSongIndex >= 0 && gameMode === "ninja") {
        audioManager.startSong(currentSongIndex);
      } else {
        audioManager.stopSong();
      }
    }
  }, [currentSongIndex, gameState, gameMode]);

  // Setup inputs
  useEffect(() => {
    setupMIDI();
    setupQWERTY();
    
    // Clean loops on unmount
    return () => {
      if (stateRef.current.gameLoopId) cancelAnimationFrame(stateRef.current.gameLoopId);
      if (stateRef.current.spawnTimerId) clearInterval(stateRef.current.spawnTimerId);
      audioManager.stopSong();
      stopWebcam();
    };
  }, []);

  // Watch for game start trigger
  useEffect(() => {
    if (gameState === "playing") {
      startGame();
    }
  }, [gameState]);

  // --- WEBCAM MANAGEMENT ---
  async function initWebcam() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: false
      });
      stateRef.current.webcamStream = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err) {
      console.warn("Webcam access denied or unavailable: ", err);
    }
  }

  function stopWebcam() {
    if (stateRef.current.webcamStream) {
      stateRef.current.webcamStream.getTracks().forEach(track => track.stop());
      stateRef.current.webcamStream = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  // --- MIDI INPUT MANAGEMENT ---
  function setupMIDI() {
    if (navigator.requestMIDIAccess) {
      navigator.requestMIDIAccess().then(
        (access) => {
          const inputs = access.inputs.values();
          for (let input of inputs) {
            input.onmidimessage = handleMIDIMessage;
          }
          access.onstatechange = (e) => {
            if (e.port.type === "input") {
              e.port.onmidimessage = e.port.state === "connected" ? handleMIDIMessage : null;
            }
          };
        },
        () => console.warn("MIDI Access Denied")
      );
    }
  }

  function handleMIDIMessage(message) {
    if (autoPlayEnabled && gameMode === "waterfall") return;

    const command = message.data[0] & 0xf0;
    const note = message.data[1];
    const velocity = message.data.length > 2 ? message.data[2] : 0;

    if (command === 144 && velocity > 0) {
      audioManager.init();
      audioManager.noteOn(note);
      stateRef.current.activeNotes.add(note);
      onInputChanged(note, true, "midi", velocity);
    } else if (command === 128 || (command === 144 && velocity === 0)) {
      audioManager.noteOff(note);
      stateRef.current.activeNotes.delete(note);
      onInputChanged(note, false, "midi", velocity);
    }
  }

  // --- QWERTY KEYBOARD INPUT ---
  function setupQWERTY() {
    const qwertyMap = {
      "KeyC": 60, "KeyD": 62, "KeyE": 64, "KeyF": 65, "KeyG": 67, "KeyA": 69, "KeyB": 71
    };

    const handleKeyDown = (e) => {
      if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") return;
      if (gameState !== "playing" && e.code === "Enter") {
        setGameState("playing");
        return;
      }
      if (gameState !== "playing") return;
      if (autoPlayEnabled && gameMode === "waterfall") return;

      if (qwertyMap.hasOwnProperty(e.code)) {
        audioManager.init();
        if (stateRef.current.activeQwertyNotes.has(e.code)) return;

        let midiNote = qwertyMap[e.code];
        if (e.shiftKey) midiNote += 1; // Sharp (#) note modifier

        stateRef.current.activeQwertyNotes.set(e.code, midiNote);
        stateRef.current.activeNotes.add(midiNote);
        audioManager.noteOn(midiNote);
        onInputChanged(midiNote, true, "qwerty", 127);
      }
    };

    const handleKeyUp = (e) => {
      if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") return;
      if (gameState !== "playing") return;
      if (autoPlayEnabled && gameMode === "waterfall") return;

      if (qwertyMap.hasOwnProperty(e.code)) {
        if (stateRef.current.activeQwertyNotes.has(e.code)) {
          const midiNote = stateRef.current.activeQwertyNotes.get(e.code);
          audioManager.noteOff(midiNote);
          stateRef.current.activeNotes.delete(midiNote);
          stateRef.current.activeQwertyNotes.delete(e.code);
          onInputChanged(midiNote, false, "qwerty", 0);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }

  function onInputChanged(noteNumber, isPressed, source = "midi", velocity = 0) {
    const state = stateRef.current;
    
    // Trigger rating hits in Waterfall Mode (Arcade Play)
    if (gameMode === "waterfall" && isPressed && waterfallPlayMode === "arcade") {
      checkWaterfallTileHit(noteNumber);
    }

    if (state.activeNotes.size === 0) {
      state.detectedChordName = "";
      pushStats();
      pushInputLog(noteNumber, isPressed, source, velocity);
      return;
    }

    // Smart Auto-Split: Extract left-hand (bass/chord) notes for matching.
    // Left-hand notes are defined as any active note within 19 semitones (1 octave + 5th) of the lowest active note.
    const getLeftHandNotes = (notesSet) => {
      const notes = Array.from(notesSet);
      if (notes.length === 0) return [];
      const lowestMidi = Math.min(...notes);
      return notes.filter(note => note - lowestMidi <= 19);
    };

    const leftHandNotes = getLeftHandNotes(state.activeNotes);
    const detected = detectChord(leftHandNotes);
    if (detected) {
      state.detectedChordName = detected.name;
      pushStats();
      pushInputLog(noteNumber, isPressed, source, velocity);
      if (state.gameState === "playing" && gameMode === "ninja") {
        checkChordSlicing(detected.name);
      }
    } else {
      state.detectedChordName = "Unknown Chord";
      pushStats();
      pushInputLog(noteNumber, isPressed, source, velocity);
    }
  }

  function pushInputLog(noteNumber, isPressed, source, velocity) {
    if (!onInputLog) return;

    const s = stateRef.current;
    const getLeftHandNotes = (notesSet) => {
      const notes = Array.from(notesSet);
      if (notes.length === 0) return [];
      const lowestMidi = Math.min(...notes);
      return notes.filter(note => note - lowestMidi <= 19);
    };
    onInputLog({
      note: noteNumber,
      isPressed,
      source,
      velocity,
      detectedChord: s.detectedChordName,
      activeNotes: getLeftHandNotes(s.activeNotes)
    });
  }

  function pushStats() {
    const s = stateRef.current;
    const getLeftHandNotes = (notesSet) => {
      const notes = Array.from(notesSet);
      if (notes.length === 0) return [];
      const lowestMidi = Math.min(...notes);
      return notes.filter(note => note - lowestMidi <= 19);
    };
    onStatsUpdate({
      score: s.score,
      combo: s.combo,
      detectedChord: s.detectedChordName,
      lives: s.lives,
      activeNotes: getLeftHandNotes(s.activeNotes)
    });
  }

  // --- GAME START & RESET ---
  function startGame() {
    audioManager.init();
    const s = stateRef.current;
    
    // Reset core states
    s.score = 0;
    s.combo = 1;
    s.maxCombo = 1;
    s.lives = 3;
    s.slicedChords.clear();
    s.fruits = [];
    s.particles = [];
    s.slashes = [];
    s.floatingTexts = [];
    s.activeNotes.clear();
    s.activeQwertyNotes.clear();
    s.autoPlayCooldowns.clear();
    
    // Reset Waterfall states
    s.songPlaybackTime = 0;
    s.notesHit = 0;
    s.activeSimulatedNotes.clear();

    if (gameMode === "waterfall") {
      let selectedSong;
      if (waterfallSongIndex === -2 && customWaterfallSong) {
        selectedSong = customWaterfallSong;
      } else {
        selectedSong = WATERFALL_SONGS[waterfallSongIndex] || WATERFALL_SONGS[0];
      }
      
      // Clone notes so we can mark hit / miss attributes without mutation side-effects
      s.songNotes = selectedSong.notes.map(n => ({
        ...n,
        hit: false,
        missed: false
      }));
      s.totalNotesCount = s.songNotes.length;
    }

    pushStats();
    
    s.lastTime = performance.now();

    if (s.gameLoopId) cancelAnimationFrame(s.gameLoopId);
    if (s.spawnTimerId) clearInterval(s.spawnTimerId);

    if (gameMode === "ninja") {
      s.spawnTimerId = setInterval(spawnFruit, SPAWN_INTERVAL);
      setTimeout(spawnFruit, 1000);
      if (currentSongIndex >= 0) {
        audioManager.startSong(currentSongIndex);
      }
    } else {
      audioManager.stopSong();
    }

    s.gameLoopId = requestAnimationFrame(gameLoop);
  }

  function endGame(manualExit = false) {
    const s = stateRef.current;
    if (s.gameLoopId) cancelAnimationFrame(s.gameLoopId);
    if (s.spawnTimerId) clearInterval(s.spawnTimerId);
    audioManager.stopSong();

    // Release all active simulated notes
    s.activeSimulatedNotes.forEach(n => audioManager.noteOff(n));
    s.activeSimulatedNotes.clear();

    if (manualExit) {
      setGameState("menu");
      return;
    }

    audioManager.playGameOverSFX();
    setGameState("gameover");
    
    let songName = "Custom Track";
    if (waterfallSongIndex !== -2) {
      songName = WATERFALL_SONGS[waterfallSongIndex]?.name || "Waterfall Song";
    } else if (customWaterfallSong) {
      songName = customWaterfallSong.name;
    }

    onGameFinished({
      finalScore: s.score,
      maxCombo: s.maxCombo,
      slicedChords: s.slicedChords,
      notesHit: s.notesHit,
      totalNotes: s.totalNotesCount,
      songName: songName
    });
  }

  // --- NINJA MODE: FRUITS SPAWNER & DETECTOR ---
  function spawnFruit() {
    const s = stateRef.current;
    if (s.gameState !== "playing" || gameMode !== "ninja") return;
    if (learnModeEnabled && s.fruits.some(f => !f.sliced)) return;

    // Chord family list filter
    const enabledFamilies = [];
    if (chordFamilies.major) enabledFamilies.push("Major");
    if (chordFamilies.minor) enabledFamilies.push("Minor");
    if (chordFamilies.power) enabledFamilies.push("5");
    if (chordFamilies.seventh) enabledFamilies.push("seventh");
    if (chordFamilies.suspended) enabledFamilies.push("suspended");

    const familyChoice = enabledFamilies[Math.floor(Math.random() * enabledFamilies.length)] || "Major";
    let suffix = "";
    
    if (familyChoice === "Minor") {
      suffix = " Minor";
    } else if (familyChoice === "5") {
      suffix = "5";
    } else if (familyChoice === "seventh") {
      const sevenths = ["maj7", "min7", "7"];
      suffix = sevenths[Math.floor(Math.random() * sevenths.length)];
    } else if (familyChoice === "suspended") {
      const sus = [" sus4", " sus2"];
      suffix = sus[Math.floor(Math.random() * sus.length)];
    }

    const root = SPAWN_ROOTS[Math.floor(Math.random() * SPAWN_ROOTS.length)];
    const targetChord = `${root}${suffix}`;

    const type = FRUIT_TYPES[Math.floor(Math.random() * FRUIT_TYPES.length)];
    const color = NEON_COLORS[type];

    const radius = FRUIT_RADIUS;
    const x = radius + Math.random() * (canvasRef.current.width - radius * 2);
    const y = canvasRef.current.height + radius;
    
    // Slow parabolic velocity height
    const peakHeight = canvasRef.current.height * 0.45; 
    const distance = y - peakHeight;
    const vy = -Math.sqrt(2 * GRAVITY * distance) * (0.9 + Math.random() * 0.2); 
    const vx = (Math.random() * 2 - 1) * 0.8;

    s.fruits.push({
      id: Math.random().toString(36).substring(2, 9),
      x, y, vx, vy, radius, type, color, targetChord,
      sliced: false,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() * 2 - 1) * 0.015,
      splitProgress: 0,
      sliceAngle: 0,
      opacity: 1,
      isFrozen: false
    });
  }

  function checkChordSlicing(chordName) {
    const s = stateRef.current;
    let hitAny = false;
    
    s.fruits.forEach(fruit => {
      if (!fruit.sliced && fruit.targetChord.toLowerCase().trim() === chordName.toLowerCase().trim()) {
        fruit.sliced = true;
        fruit.isFrozen = false; 
        fruit.sliceAngle = Math.random() * Math.PI + Math.PI / 4;
        
        s.score += 100 * s.combo;
        s.slicedChords.add(fruit.targetChord);
        hitAny = true;

        audioManager.playSliceSFX();
        setTimeout(() => audioManager.playSplashSFX(), 40);
        
        createSlashTrail(fruit.x, fruit.y, fruit.sliceAngle, fruit.color);
        createJuiceExplosion(fruit.x, fruit.y, fruit.color);
        createFloatingText(`+${100 * s.combo}`, fruit.x, fruit.y - 120, fruit.color);
        audioManager.playChordCorrectSFX();

        if (learnModeEnabled) {
          clearInterval(s.spawnTimerId);
          s.spawnTimerId = setInterval(spawnFruit, SPAWN_INTERVAL);
          setTimeout(spawnFruit, 1200);
        }
      }
    });

    if (hitAny) {
      s.combo += 1;
      if (s.combo > s.maxCombo) s.maxCombo = s.combo;
      
      if (s.combo % 4 === 0) {
        audioManager.playComboSFX();
        createFloatingText(`${s.combo}x COMBO!`, canvasRef.current.width / 2, canvasRef.current.height * 0.35, "#ffea00", 2.2);
      }
      pushStats();
    }
  }

  // --- WATERFALL MODE: NOTE ACTIONS ---
  function checkWaterfallTileHit(noteNumber) {
    const s = stateRef.current;
    
    // Look for the closest active note of this pitch
    const tolerance = 0.22; // Seconds
    const currentSongTime = s.songPlaybackTime;
    
    const targetNote = s.songNotes.find(n => 
      n.midi === noteNumber && 
      !n.hit && 
      !n.missed && 
      Math.abs(n.time - currentSongTime) <= tolerance
    );

    if (targetNote) {
      targetNote.hit = true;
      s.notesHit += 1;
      s.score += 100 * s.combo;
      s.combo += 1;
      if (s.combo > s.maxCombo) s.maxCombo = s.combo;

      // Rating text
      const diff = Math.abs(currentSongTime - targetNote.time);
      let rating = "GOOD";
      let ratingColor = "#ffea00";
      
      if (diff < 0.08) {
        rating = "PERFECT!";
        ratingColor = "#00f3ff";
      } else if (diff < 0.15) {
        rating = "GREAT!";
        ratingColor = "#39ff14";
      }

      const layout = getKeyLayout(noteNumber);
      if (layout) {
        createFloatingText(rating, layout.x + layout.width / 2, canvasRef.current.height - 180, ratingColor, 1.3);
        createJuiceExplosion(layout.x + layout.width / 2, canvasRef.current.height - 145, ratingColor);
      }
      
      pushStats();
    }
  }

  // --- MAIN ANIMATION & DRAWING LOOPS ---
  function gameLoop(timestamp) {
    const s = stateRef.current;
    if (s.gameState !== "playing") return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const deltaTime = timestamp - s.lastTime;
    s.lastTime = timestamp;

    // 1. Draw blurred webcam background
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (cameraEnabled && videoRef.current && videoRef.current.readyState >= 2) {
      ctx.save();
      ctx.filter = `blur(${blurAmount}px) brightness(0.65)`;
      // Flipped horizontal mirror view
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    } else {
      // Solid carbon space backing
      ctx.fillStyle = "#0c0c16";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Dynamic keyboard coordinates metrics
    const kbHeight = 110;
    const kbX = (canvas.width - Math.min(canvas.width * 0.85, 1100)) / 2;
    const kbY = canvas.height - kbHeight - 30;

    // --- MODE ROUTINE BRANCHES ---
    if (gameMode === "ninja") {
      updateAndDrawNinja(ctx, deltaTime, kbY);
    } else if (gameMode === "waterfall") {
      updateAndDrawWaterfall(ctx, deltaTime, kbY, kbX);
    }

    // 2. Draw Floating rating/arcade Texts
    s.floatingTexts.forEach((ft, idx) => {
      ft.y += ft.vy;
      ft.alpha -= 0.016;
      if (ft.alpha <= 0) {
        s.floatingTexts.splice(idx, 1);
        return;
      }
      ctx.save();
      ctx.globalAlpha = ft.alpha;
      ctx.font = `italic 900 ${36 * ft.scale}px 'Orbitron', sans-serif`;
      ctx.fillStyle = ft.color;
      ctx.shadowColor = ft.color;
      ctx.shadowBlur = 12;
      ctx.textAlign = "center";
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    });

    // 3. Draw Slashes & Juice Splash particles
    s.particles.forEach((p, idx) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.alpha -= 0.02;
      if (p.alpha <= 0) {
        s.particles.splice(idx, 1);
        return;
      }
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    s.slashes.forEach((sl, idx) => {
      sl.alpha -= 0.04;
      if (sl.alpha <= 0) {
        s.slashes.splice(idx, 1);
        return;
      }
      ctx.save();
      ctx.globalAlpha = sl.alpha;
      ctx.shadowColor = sl.color;
      ctx.shadowBlur = 15;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = sl.width;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(sl.x1, sl.y1);
      ctx.lineTo(sl.x2, sl.y2);
      ctx.stroke();
      
      ctx.strokeStyle = sl.color;
      ctx.lineWidth = sl.width / 2;
      ctx.stroke();
      ctx.restore();
    });

    // 4. Draw Piano visual keyboard
    drawVirtualKeyboard(ctx, kbX, kbY, Math.min(canvas.width * 0.85, 1100), kbHeight);

    s.gameLoopId = requestAnimationFrame(gameLoop);
  }

  // --- NINJA MODE UPDATE/RENDER LOOP ---
  function updateAndDrawNinja(ctx, deltaTime, keyboardLineY) {
    const s = stateRef.current;
    
    // Auto Play (slicing chord fruits automatically)
    if (autoPlayEnabled) {
      const oldestFruit = s.fruits.find(f => !f.sliced);
      if (oldestFruit) {
        const shouldSlice = oldestFruit.isFrozen || (oldestFruit.vy > -1.2 && oldestFruit.y < canvasRef.current.height * 0.65);
        if (shouldSlice) {
          const id = oldestFruit.id;
          if (!s.autoPlayCooldowns.has(id)) {
            s.autoPlayCooldowns.add(id);
            const chordInfo = getChordNotes(oldestFruit.targetChord);
            if (chordInfo) {
              const simulated = chordInfo.notes.map(name => 60 + NOTE_NAMES.indexOf(name));
              simulated.forEach(n => {
                s.activeNotes.add(n);
                audioManager.noteOn(n);
              });
              onInputChanged(60, true); // Trigger check
              setTimeout(() => {
                simulated.forEach(n => {
                  s.activeNotes.delete(n);
                  audioManager.noteOff(n);
                });
                onInputChanged(60, false);
              }, 450);
            }
          }
        }
      }
    }

    // Update and draw fruits
    s.fruits.forEach((f, idx) => {
      // Learn Mode freezing
      if (learnModeEnabled && !f.sliced && f.vy > 0 && f.y >= canvasRef.current.height * 0.45 && !f.isFrozen) {
        f.isFrozen = true;
        f.vx = 0;
        f.vy = 0;
      }

      if (!f.isFrozen) {
        f.x += f.vx;
        f.y += f.vy;
        f.vy += GRAVITY;
        f.rotation += f.rotationSpeed;
      }

      // Check offscreen drop
      if (f.y > canvasRef.current.height + f.radius + 10) {
        s.fruits.splice(idx, 1);
        if (!f.sliced) {
          s.combo = 1;
          if (!noDieEnabled) {
            s.lives -= 1;
            pushStats();
            createFloatingText("MISS!", f.x, canvasRef.current.height - 40, "#ff3333", 1.4);
            if (s.lives <= 0) {
              endGame();
            }
          } else {
            createFloatingText("MISSED (ZEN)", f.x, canvasRef.current.height - 40, "#39ff14", 1.2);
          }
        }
        return;
      }

      // Slicing animation split progress
      if (f.sliced) {
        f.splitProgress += 3.5;
        f.opacity -= 0.025;
        if (f.opacity <= 0) {
          s.fruits.splice(idx, 1);
          return;
        }
      }

      ctx.save();
      ctx.globalAlpha = f.opacity;
      ctx.shadowColor = f.color;
      ctx.shadowBlur = f.isFrozen ? (36 + Math.sin(performance.now() * 0.007) * 14) : 44;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 8;
      ctx.fillStyle = "rgba(10, 10, 15, 0.55)";

      if (f.sliced) {
        const dx = Math.cos(f.sliceAngle + Math.PI / 2) * f.splitProgress;
        const dy = Math.sin(f.sliceAngle + Math.PI / 2) * f.splitProgress;

        ctx.save();
        ctx.translate(f.x + dx, f.y + dy);
        ctx.rotate(f.rotation);
        ctx.beginPath();
        ctx.arc(0, 0, f.radius, 0, Math.PI);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        drawFruitInternalLines(ctx, f.type, f.radius);
        ctx.restore();

        ctx.save();
        ctx.translate(f.x - dx, f.y - dy);
        ctx.rotate(f.rotation);
        ctx.beginPath();
        ctx.arc(0, 0, f.radius, Math.PI, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        drawFruitInternalLines(ctx, f.type, f.radius);
        ctx.restore();
      } else {
        ctx.translate(f.x, f.y);
        ctx.rotate(f.rotation);
        drawFruitShape(ctx, f.type, f.radius);
        ctx.rotate(-f.rotation);
        
        // Draw chord tag
        drawChordTag(ctx, f.targetChord, 0, f.radius + 70, f.color, f.isFrozen);
      }
      ctx.restore();
    });
  }

  // --- WATERFALL MODE UPDATE/RENDER LOOP ---
  function updateAndDrawWaterfall(ctx, deltaTime, landingLineY, kbX) {
    const s = stateRef.current;
    
    // Check if we need to pause the song time (Practice Mode: wait for user notes)
    let waitingForInput = false;
    let targetPitchesNeeded = [];

    if (waterfallPlayMode === "practice" && !autoPlayEnabled) {
      // Find notes that are currently crossing or have crossed the landing line
      const activeUnplayed = s.songNotes.filter(n => n.time <= s.songPlaybackTime && !n.hit);
      if (activeUnplayed.length > 0) {
        waitingForInput = true;
        targetPitchesNeeded = activeUnplayed.map(n => n.midi);
      }
    }

    // Auto Play chord notes trigger automatically
    if (autoPlayEnabled) {
      const currentSongTime = s.songPlaybackTime;
      s.songNotes.forEach(note => {
        // Trigger simulated key down
        if (currentSongTime >= note.time && !note.hit && !note.missed) {
          note.hit = true;
          s.notesHit += 1;
          s.score += 100 * s.combo;
          s.combo += 1;
          if (s.combo > s.maxCombo) s.maxCombo = s.combo;
          pushStats();
          
          // Trigger audio note
          audioManager.noteOn(note.midi);
          s.activeSimulatedNotes.add(note.midi);
          
          // Spawn effects
          const layout = getKeyLayout(note.midi);
          if (layout) {
            createFloatingText("PERFECT", layout.x + layout.width / 2, canvasRef.current.height - 180, "#00f3ff", 1.3);
            createJuiceExplosion(layout.x + layout.width / 2, canvasRef.current.height - 145, "#00f3ff");
          }

          // Schedule release
          setTimeout(() => {
            audioManager.noteOff(note.midi);
            s.activeSimulatedNotes.delete(note.midi);
          }, note.duration * 1000);
        }
      });
    }

    // In Practice mode, if user plays the requested notes, mark them as hit and resume
    if (waitingForInput) {
      const allPressed = targetPitchesNeeded.every(pitch => s.activeNotes.has(pitch));
      if (allPressed) {
        targetPitchesNeeded.forEach(pitch => {
          const note = s.songNotes.find(n => n.midi === pitch && !n.hit);
          if (note) {
            note.hit = true;
            s.notesHit += 1;
            s.score += 100 * s.combo;
            s.combo += 1;
            if (s.combo > s.maxCombo) s.maxCombo = s.combo;
            pushStats();

            const layout = getKeyLayout(pitch);
            if (layout) {
              createFloatingText("PERFECT", layout.x + layout.width / 2, canvasRef.current.height - 180, "#39ff14", 1.3);
              createJuiceExplosion(layout.x + layout.width / 2, canvasRef.current.height - 145, "#39ff14");
            }
          }
        });
        waitingForInput = false;
      }
    }

    // Advance song time if we are not waiting for inputs
    if (!waitingForInput) {
      s.songPlaybackTime += deltaTime / 1000.0;
    }

    // Check misses
    s.songNotes.forEach(note => {
      if (!note.hit && !note.missed && s.songPlaybackTime > note.time + 0.22) {
        note.missed = true;
        s.combo = 1;
        pushStats();
        
        const layout = getKeyLayout(note.midi);
        if (layout) {
          createFloatingText("MISS!", layout.x + layout.width / 2, canvasRef.current.height - 180, "#ff3333", 1.3);
        }

        if (!noDieEnabled) {
          s.lives -= 1;
          pushStats();
          if (s.lives <= 0) {
            endGame();
          }
        }
      }
    });

    // Check if song complete
    const allProcessed = s.songNotes.every(n => n.hit || n.missed);
    if (allProcessed && s.songNotes.length > 0) {
      // Delay gameover slightly for visual completeness
      setTimeout(() => endGame(), 1800);
      s.songNotes = []; // Clear to prevent double calls
    }

    // Draw Waterfall notes landing line bar
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
    ctx.lineWidth = 4;
    ctx.shadowColor = "#00f3ff";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(kbX, landingLineY);
    ctx.lineTo(canvasRef.current.width - kbX, landingLineY);
    ctx.stroke();
    ctx.restore();

    // Render falling note blocks
    s.songNotes.forEach(note => {
      const layout = getKeyLayout(note.midi);
      if (!layout) return;

      const currentSongTime = s.songPlaybackTime;
      
      // Compute heights based on time delta
      const bottomY = landingLineY - (note.time - currentSongTime) * PIXELS_PER_SECOND;
      const topY = landingLineY - (note.time + note.duration - currentSongTime) * PIXELS_PER_SECOND;
      const height = bottomY - topY;

      // Skip drawing if completely offscreen
      if (topY > landingLineY + 20) return; // passed key line
      if (bottomY < 0) return; // not spawned yet

      // Style settings
      const color = note.hit 
        ? "rgba(57, 255, 20, 0.2)" 
        : note.missed 
        ? "rgba(255, 51, 51, 0.12)" 
        : note.midi % 12 in [1, 3, 6, 8, 10] // Black keys
        ? "#9d00ff"
        : "#00f3ff";

      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = color;
      ctx.strokeStyle = note.hit ? "#39ff14" : note.missed ? "#ff3333" : "#ffffff";
      ctx.lineWidth = 2.2;
      ctx.shadowColor = color;
      ctx.shadowBlur = note.hit ? 4 : 12;

      // Draw rounded falling glass block
      ctx.beginPath();
      // Ensure height isn't negative or weird
      ctx.roundRect(layout.x, topY, layout.width, Math.max(10, height), 8);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Show key hint text on the block if in practice wait mode
      if (waitingForInput && targetPitchesNeeded.includes(note.midi) && bottomY >= landingLineY - 10) {
        ctx.save();
        ctx.fillStyle = "#ffea00";
        ctx.font = "bold 15px 'Outfit', sans-serif";
        ctx.textAlign = "center";
        ctx.shadowColor = "#ffea00";
        ctx.shadowBlur = 8;
        ctx.fillText(midiNoteToLetter(note.midi), layout.x + layout.width / 2, bottomY - 15);
        ctx.restore();
      }
    });

    // Share progress fraction
    if (s.totalNotesCount > 0) {
      const processedCount = s.songNotes.filter(n => n.hit || n.missed).length;
      onStatsUpdate({
        score: s.score,
        combo: s.combo,
        detectedChord: s.detectedChordName,
        lives: s.lives,
        songProgress: processedCount / s.totalNotesCount
      });
    }
  }

  function midiNoteToLetter(midi) {
    return NOTE_NAMES[midi % 12];
  }

  // --- COMPONENT KEYBOARD RESOLVER ---
  function getKeyLayout(note) {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const width = Math.min(canvas.width * 0.85, 1100);
    const x = (canvas.width - width) / 2;
    
    let minMidi = 60; 
    let maxMidi = 84; 

    if (keyboardRange === 49) {
      minMidi = 36; 
      maxMidi = 84; 
    } else if (keyboardRange === 88) {
      minMidi = 21; 
      maxMidi = 108; 
    }

    if (note < minMidi || note > maxMidi) return null;

    const whiteMidiNotes = [];
    for (let n = minMidi; n <= maxMidi; n++) {
      if ([0, 2, 4, 5, 7, 9, 11].includes(n % 12)) {
        whiteMidiNotes.push(n);
      }
    }

    const totalWhite = whiteMidiNotes.length;
    const keyWidth = width / totalWhite;
    const isBlack = ![0, 2, 4, 5, 7, 9, 11].includes(note % 12);

    if (!isBlack) {
      const i = whiteMidiNotes.indexOf(note);
      return { x: x + i * keyWidth + 1, width: keyWidth - 2, isBlack: false };
    } else {
      const leftNeighborIdx = whiteMidiNotes.indexOf(note - 1);
      if (leftNeighborIdx === -1) return null;
      const blackWidth = keyWidth * 0.62;
      const bx = x + leftNeighborIdx * keyWidth + keyWidth - blackWidth / 2;
      return { x: bx, width: blackWidth, isBlack: true };
    }
  }

  // --- VIRTUAL KEYBOARD GRAPHICS RENDERER ---
  function drawVirtualKeyboard(ctx, x, y, width, height) {
    const s = stateRef.current;
    let minMidi = 60; 
    let maxMidi = 84; 

    if (keyboardRange === 49) {
      minMidi = 36; 
      maxMidi = 84; 
    } else if (keyboardRange === 88) {
      minMidi = 21; 
      maxMidi = 108; 
    }

    const whiteMidiNotes = [];
    const blackMidiNotes = [];
    for (let n = minMidi; n <= maxMidi; n++) {
      if ([0, 2, 4, 5, 7, 9, 11].includes(n % 12)) {
        whiteMidiNotes.push(n);
      } else {
        blackMidiNotes.push(n);
      }
    }

    const totalWhite = whiteMidiNotes.length;
    const keyWidth = width / totalWhite;

    // Get current chord spelling finger guides
    let guideMidiToFinger = {};
    let targetPitchClasses = [];
    let currentTargetChordName = "";

    if (gameMode === "ninja") {
      const oldestFruit = s.fruits.find(f => !f.sliced);
      if (oldestFruit) {
        currentTargetChordName = oldestFruit.targetChord;
      }
    } else if (gameMode === "lyric" && activeLyricChord) {
      currentTargetChordName = activeLyricChord;
    }

    if (currentTargetChordName) {
      const targetInfo = getChordNotes(currentTargetChordName);
      if (targetInfo) {
        targetPitchClasses = targetInfo.notes.map(name => NOTE_NAMES.indexOf(name));
        const voicingNotes = getChordVoicingMidiNotes(currentTargetChordName, minMidi, maxMidi);
        if (voicingNotes) {
          voicingNotes.forEach((midiNote, idx) => {
            guideMidiToFinger[midiNote] = targetInfo.fingers[idx];
          });
        }
      }
    } else if (gameMode === "waterfall" && waterfallPlayMode === "practice") {
      const activeUnplayed = s.songNotes.filter(n => n.time <= s.songPlaybackTime && !n.hit);
      activeUnplayed.forEach(n => {
        guideMidiToFinger[n.midi] = "?";
      });
    }

    const getPressedKeyStyle = (note, isBlack) => {
      // Find lowest active note in state.activeNotes to determine if this note is melody (right-hand)
      const activeNotesArr = Array.from(s.activeNotes);
      const lowestActiveMidi = activeNotesArr.length > 0 ? Math.min(...activeNotesArr) : null;
      const isMelodyNote = lowestActiveMidi !== null && (note - lowestActiveMidi > 19);

      if (currentTargetChordName && targetPitchClasses.length > 0 && !isMelodyNote) {
        const isCorrect = targetPitchClasses.includes(note % 12);
        if (isCorrect) {
          return {
            fill: "rgba(57, 255, 20, 0.25)",
            stroke: "rgba(57, 255, 20, 0.75)",
            shadow: "#39ff14"
          };
        } else {
          return {
            fill: "rgba(255, 60, 60, 0.25)",
            stroke: "rgba(255, 60, 60, 0.75)",
            shadow: "#ff3c3c"
          };
        }
      }
      // Default playing colors
      if (isBlack) {
        return {
          fill: "rgba(157, 0, 255, 0.4)",
          stroke: "rgba(157, 0, 255, 0.8)",
          shadow: "#9d00ff"
        };
      } else {
        return {
          fill: "rgba(0, 243, 255, 0.25)",
          stroke: "rgba(0, 243, 255, 0.6)",
          shadow: "#00f3ff"
        };
      }
    };

    // Keyboard frame background card
    ctx.save();
    ctx.fillStyle = "rgba(15, 15, 25, 0.7)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.roundRect(x - 15, y - 25, width + 30, height + 40, 15);
    ctx.fill();
    ctx.stroke();
    
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.font = "bold 11px 'Outfit', sans-serif";
    ctx.letterSpacing = "2px";
    ctx.fillText(`${gameMode === "ninja" ? "DOJO INPUT KEYBOARD" : "WATERFALL PLAYER"} (${keyboardRange} KEYS)`, x, y - 10);
    ctx.restore();

    // 1. Draw White Keys
    for (let i = 0; i < totalWhite; i++) {
      const note = whiteMidiNotes[i];
      const kx = x + i * keyWidth;
      const kw = keyWidth;
      const kh = height;

      // Note is pressed if user pressed it OR if Auto Play has it simulated
      const isPressed = s.activeNotes.has(note) || s.activeSimulatedNotes.has(note);
      const isGuide = note in guideMidiToFinger;

      ctx.save();
      if (isPressed) {
        const style = getPressedKeyStyle(note, false);
        ctx.fillStyle = style.fill;
        ctx.strokeStyle = style.stroke;
        ctx.shadowColor = style.shadow;
        ctx.shadowBlur = 10;
      } else {
        ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
        ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
      }
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(kx + 1, y, kw - 2, kh, [0, 0, 6, 6]);
      ctx.fill();
      ctx.stroke();

      // Yellow key guiding indicators (showing finger numbers or help circles)
      if (isGuide && !isPressed) {
        const finger = guideMidiToFinger[note];
        const oldestFruit = s.fruits.find(f => !f.sliced);
        const guideAlpha = oldestFruit?.isFrozen || (gameMode === "waterfall")
          ? 0.8 + Math.sin(performance.now() * 0.01) * 0.15 
          : 0.9;
        
        ctx.fillStyle = `rgba(255, 234, 0, ${guideAlpha})`;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.2;
        ctx.shadowColor = "#ffea00";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        const cx = kx + kw / 2;
        const cy = y + kh * 0.72;
        const rad = Math.min(kw * 0.32, 9.5);
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Draw finger number or guide note letter inside badge
        ctx.fillStyle = "#0c0c16";
        ctx.font = "bold 11px 'Outfit', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowBlur = 0;
        ctx.fillText(finger === "?" ? midiNoteToLetter(note) : finger, cx, cy + 1);
      }

      if (note % 12 === 0) {
        ctx.fillStyle = isPressed ? "#ffffff" : "rgba(255,255,255,0.3)";
        ctx.font = "bold 11px 'Outfit', sans-serif";
        ctx.textAlign = "center";
        const octave = Math.floor(note / 12) - 1;
        ctx.fillText(`C${octave}`, kx + kw / 2, y + kh - 10);
      }
      ctx.restore();
    }

    // 2. Draw Black Keys
    const blackWidth = keyWidth * 0.62;
    const blackHeight = height * 0.62;

    blackMidiNotes.forEach(bkNote => {
      const leftNeighborIdx = whiteMidiNotes.indexOf(bkNote - 1);
      if (leftNeighborIdx === -1) return;

      const kx = x + leftNeighborIdx * keyWidth + keyWidth - blackWidth / 2;

      const isPressed = s.activeNotes.has(bkNote) || s.activeSimulatedNotes.has(bkNote);
      const isGuide = bkNote in guideMidiToFinger;

      ctx.save();
      if (isPressed) {
        const style = getPressedKeyStyle(bkNote, true);
        ctx.fillStyle = style.fill;
        ctx.strokeStyle = style.stroke;
        ctx.shadowColor = style.shadow;
        ctx.shadowBlur = 12;
      } else {
        ctx.fillStyle = "#111116";
        ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
      }
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(kx, y, blackWidth, blackHeight, [0, 0, 4, 4]);
      ctx.fill();
      ctx.stroke();

      // Guide indicators on black keys
      if (isGuide && !isPressed) {
        const finger = guideMidiToFinger[bkNote];
        const oldestFruit = s.fruits.find(f => !f.sliced);
        const guideAlpha = oldestFruit?.isFrozen || (gameMode === "waterfall")
          ? 0.8 + Math.sin(performance.now() * 0.01) * 0.15 
          : 0.9;
        
        ctx.fillStyle = `rgba(255, 234, 0, ${guideAlpha})`;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.2;
        ctx.shadowColor = "#ffea00";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        const cx = kx + blackWidth / 2;
        const cy = y + blackHeight * 0.72;
        const rad = Math.min(blackWidth * 0.35, 8);
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#0c0c16";
        ctx.font = "bold 9px 'Outfit', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowBlur = 0;
        ctx.fillText(finger === "?" ? midiNoteToLetter(bkNote) : finger, cx, cy + 1);
      }
      ctx.restore();
    });
  }

  // --- FLOATING TEXTS & FX SPAWNERS ---
  function createFloatingText(text, x, y, color, scale = 1.2) {
    stateRef.current.floatingTexts.push({
      text, x, y, color, scale,
      vy: -0.65,
      alpha: 1
    });
  }

  function createJuiceExplosion(x, y, color) {
    const count = 28;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 4.5;
      stateRef.current.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.5,
        radius: 2.2 + Math.random() * 4.5,
        gravity: 0.12,
        color,
        alpha: 1
      });
    }
  }

  function createSlashTrail(x, y, angle, color) {
    const length = 180;
    stateRef.current.slashes.push({
      x1: x - Math.cos(angle) * (length / 2),
      y1: y - Math.sin(angle) * (length / 2),
      x2: x + Math.cos(angle) * (length / 2),
      y2: y + Math.sin(angle) * (length / 2),
      width: 14,
      color,
      alpha: 1
    });
  }

  // --- CANVAS ART DESIGN ROUTINES ---
  function drawFruitShape(ctx, type, r) {
    ctx.beginPath();
    switch (type) {
      case "apple":
        ctx.moveTo(0, -r * 0.7);
        ctx.bezierCurveTo(r * 0.5, -r * 1.1, r * 1.1, -r * 0.5, r, 0);
        ctx.bezierCurveTo(r * 0.9, r * 0.7, r * 0.4, r * 1.1, 0, r * 0.95);
        ctx.bezierCurveTo(-r * 0.4, r * 1.1, -r * 0.9, r * 0.7, -r, 0);
        ctx.bezierCurveTo(-r * 1.1, -r * 0.5, -r * 0.5, -r * 1.1, 0, -r * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.save();
        ctx.strokeStyle = "#8b5a2b";
        ctx.lineWidth = 6;
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.75);
        ctx.quadraticCurveTo(r * 0.2, -r * 1.1, r * 0.3, -r * 1.25);
        ctx.stroke();
        ctx.restore();
        break;

      case "orange":
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        drawFruitInternalLines(ctx, "orange", r);
        break;

      case "watermelon":
        ctx.arc(0, 0, r, 0, Math.PI, true);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        drawFruitInternalLines(ctx, "watermelon", r);
        break;

      case "banana":
        ctx.moveTo(-r, -r * 0.2);
        ctx.quadraticCurveTo(0, -r * 0.9, r, -r * 0.2);
        ctx.quadraticCurveTo(0, 0, -r, -r * 0.2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;

      case "berry":
        ctx.moveTo(0, -r * 0.85);
        ctx.bezierCurveTo(r * 0.7, -r * 1.1, r, -r * 0.2, r * 0.8, r * 0.3);
        ctx.quadraticCurveTo(r * 0.3, r * 0.8, 0, r);
        ctx.quadraticCurveTo(-r * 0.3, r * 0.8, -r * 0.8, r * 0.3);
        ctx.bezierCurveTo(-r, -r * 0.2, -r * 0.7, -r * 1.1, 0, -r * 0.85);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.save();
        ctx.fillStyle = NEON_COLORS.watermelon;
        ctx.shadowColor = NEON_COLORS.watermelon;
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.85);
        ctx.lineTo(r * 0.3, -r * 1.05);
        ctx.lineTo(r * 0.1, -r * 0.85);
        ctx.lineTo(0, -r * 1.15);
        ctx.lineTo(-r * 0.1, -r * 0.85);
        ctx.lineTo(-r * 0.3, -r * 1.05);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        break;
    }
  }

  function drawFruitInternalLines(ctx, type, r) {
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = ctx.strokeStyle; 
    ctx.lineWidth = 3;

    if (type === "orange") {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * r * 0.88, Math.sin(a) * r * 0.88);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.stroke();
    } 
    else if (type === "watermelon") {
      ctx.fillStyle = "#ffffff";
      const seedPositions = [
        { x: -r * 0.5, y: r * 0.3 },
        { x: -r * 0.2, y: r * 0.6 },
        { x: 0, y: r * 0.4 },
        { x: r * 0.2, y: r * 0.6 },
        { x: r * 0.5, y: r * 0.3 }
      ];
      seedPositions.forEach(pos => {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.restore();
  }

  function drawChordTag(ctx, chordName, x, y, glowColor, isFrozenPrompt = false) {
    ctx.save();
    
    const info = getChordNotes(chordName);
    const notesText = info ? info.notes.join(" • ") : "";

    ctx.font = "bold 36px 'Outfit', sans-serif";
    const nameWidth = ctx.measureText(chordName).width;
    
    ctx.font = "bold 26px 'Outfit', sans-serif";
    const notesWidth = ctx.measureText(notesText).width;
    
    const textWidth = Math.max(nameWidth, notesWidth);
    const paddingX = 36;
    const paddingY = 16;
    
    const w = textWidth + paddingX * 2;
    const h = 72 + paddingY * 2; 
    const rx = x - w / 2;
    const ry = y - h / 2;

    // Background glass border panel
    ctx.fillStyle = "rgba(10, 10, 18, 0.84)";
    
    if (isFrozenPrompt) {
      const intensity = 0.2 + (Math.sin(performance.now() * 0.01) + 1) * 0.4;
      ctx.strokeStyle = `rgba(255, 234, 0, ${intensity})`;
      ctx.lineWidth = 3.6;
      ctx.shadowColor = "#ffea00";
      ctx.shadowBlur = 16;
    } else {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
      ctx.lineWidth = 2;
      ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
      ctx.shadowBlur = 24;
    }
    
    ctx.beginPath();
    ctx.roundRect(rx, ry, w, h, 28);
    ctx.fill();
    ctx.stroke();

    // Accent line
    ctx.strokeStyle = isFrozenPrompt ? "#ffea00" : glowColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(rx + 6, ry + 2, w - 12, 4, 4);
    ctx.stroke();

    // Font labels
    ctx.fillStyle = "#ffffff";
    ctx.shadowBlur = 0; 
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    
    ctx.font = "bold 34px 'Outfit', sans-serif";
    ctx.fillText(chordName, x, y - 14);

    ctx.fillStyle = isFrozenPrompt ? "#ffea00" : "rgba(255, 255, 255, 0.75)";
    ctx.font = "bold 26px 'Outfit', sans-serif";
    ctx.fillText(notesText, x, y + 22);
    
    ctx.restore();
  }

  // Handle canvas scaling for high DPI displays
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <>
      <video ref={videoRef} id="webcam" autoPlay playsInline muted style={{ display: "none" }} />
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
    </>
  );
}
