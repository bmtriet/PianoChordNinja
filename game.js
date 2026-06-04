/**
 * game.js
 * Core Game Engine for Piano Chord Ninja.
 * Manages canvas loop, webcam capture, MIDI/QWERTY input, physics, and rendering.
 */

// Game Constants
const GRAVITY = 0.08;             // Slow, floating physics
const SPAWN_INTERVAL = 4000;      // Slow pace (4 seconds between spawns)
const FRUIT_RADIUS = 100;
const MAX_LIVES = 3;

// Game State Variables
let canvas, ctx;
let lastTime = 0;
let gameState = "menu"; // "menu", "playing", "gameover"

// Webcam State
let webcamElement = null;
let webcamStream = null;
let cameraEnabled = true;
let blurAmount = 20;

// Input State
let activeNotes = new Set();      // Set of currently pressed MIDI note numbers
let activeQwertyNotes = new Map(); // Maps key.code -> midiNote (handles release correctly)
let currentChord = null;          // { name: String, root: String, type: String }

// Practice Features State
let noDieEnabled = false;
let autoPlayEnabled = false;
let learnModeEnabled = false;
let keyboardRange = 25; // 25, 49, 88 keys
let currentSongIndex = -1; // -1 = None

// Player Stats
let score = 0;
let highScore = 0;
let combo = 1;
let maxCombo = 1;
let lives = MAX_LIVES;
let slicedChords = new Set();     // Training summary set
let gameLoopId = null;
let spawnTimerId = null;

// Game Entities
let fruits = [];
let particles = [];
let slashes = [];
let floatingTexts = [];
let autoPlayCooldowns = new Set(); // Tracks fruit IDs that are already triggered/sliced by Auto Play

// Available Roots for fruit spawning
const SPAWN_ROOTS = ["C", "D", "E", "F", "G", "A", "B", "C#", "F#", "G#"];

// Custom Neon Colors for fruits
const NEON_COLORS = {
  apple: "#ff007f",      // Hot Pink
  orange: "#ffaa00",     // Bright Orange
  watermelon: "#39ff14", // Lime Green
  banana: "#ffea00",     // Yellow
  berry: "#9d00ff"       // Purple
};

const FRUIT_TYPES = ["apple", "orange", "watermelon", "banana", "berry"];

// --- INITIALIZATION ---

window.addEventListener("DOMContentLoaded", () => {
  initUI();
  setupMIDI();
  setupQWERTY();
});

function initUI() {
  canvas = document.getElementById("gameCanvas");
  ctx = canvas.getContext("2d");
  webcamElement = document.getElementById("webcam");

  // Load settings from localStorage
  loadSettings();

  // Resize canvas
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  // Setup Event Listeners for HTML Overlays
  document.getElementById("btnStartGame").addEventListener("click", startGame);
  document.getElementById("btnRestartGame").addEventListener("click", startGame);
  
  // Webcam Toggles
  const btnToggleCamera = document.getElementById("btnToggleCamera");
  btnToggleCamera.addEventListener("click", () => {
    cameraEnabled = !cameraEnabled;
    if (cameraEnabled) {
      btnToggleCamera.classList.add("toggle-active");
      btnToggleCamera.innerText = "Webcam Background: Enabled";
      initWebcam();
    } else {
      btnToggleCamera.classList.remove("toggle-active");
      btnToggleCamera.innerText = "Webcam Background: Disabled";
      stopWebcam();
    }
    saveSettings();
  });

  const blurSlider = document.getElementById("blurSlider");
  const blurVal = document.getElementById("blurVal");
  blurSlider.addEventListener("input", (e) => {
    blurAmount = parseInt(e.target.value);
    blurVal.innerText = `${blurAmount}px`;
    saveSettings();
  });

  // Practice Options Listeners (Start Menu)
  const chkNoDie = document.getElementById("chkNoDie");
  chkNoDie.addEventListener("change", (e) => {
    noDieEnabled = e.target.checked;
    saveSettings();
  });

  const chkAutoPlay = document.getElementById("chkAutoPlay");
  const btnHudAuto = document.getElementById("btnHudAuto");
  chkAutoPlay.addEventListener("change", (e) => {
    autoPlayEnabled = e.target.checked;
    btnHudAuto.innerText = autoPlayEnabled ? "AUTO: ON" : "AUTO: OFF";
    if (autoPlayEnabled) {
      btnHudAuto.classList.add("toggle-active");
    } else {
      btnHudAuto.classList.remove("toggle-active");
    }
    saveSettings();
  });

  const chkLearnMode = document.getElementById("chkLearnMode");
  const btnHudLearn = document.getElementById("btnHudLearn");
  chkLearnMode.addEventListener("change", (e) => {
    learnModeEnabled = e.target.checked;
    btnHudLearn.innerText = learnModeEnabled ? "LEARN: ON" : "LEARN: OFF";
    if (learnModeEnabled) {
      btnHudLearn.classList.add("toggle-active");
    } else {
      btnHudLearn.classList.remove("toggle-active");
    }
    saveSettings();
  });

  const selKeyRange = document.getElementById("selKeyRange");
  selKeyRange.addEventListener("change", (e) => {
    keyboardRange = parseInt(e.target.value);
    saveSettings();
  });

  // Backing Track Listeners
  const selSong = document.getElementById("selSong");
  const selHudSong = document.getElementById("selHudSong");
  selSong.addEventListener("change", (e) => {
    currentSongIndex = parseInt(e.target.value);
    selHudSong.value = e.target.value;
    if (gameState === "playing") {
      if (currentSongIndex >= 0) {
        audioManager.startSong(currentSongIndex);
      } else {
        audioManager.stopSong();
      }
    }
    saveSettings();
  });

  // HUD Controls
  document.getElementById("btnHudMute").addEventListener("click", (e) => {
    const muted = audioManager.toggleMute();
    e.target.innerText = muted ? "🔇" : "🔊";
  });

  document.getElementById("btnHudCam").addEventListener("click", () => {
    cameraEnabled = !cameraEnabled;
    const btn = document.getElementById("btnToggleCamera");
    if (cameraEnabled) {
      btn.classList.add("toggle-active");
      btn.innerText = "Webcam Background: Enabled";
      initWebcam();
    } else {
      btn.classList.remove("toggle-active");
      btn.innerText = "Webcam Background: Disabled";
      stopWebcam();
    }
    saveSettings();
  });

  document.getElementById("btnHudExit").addEventListener("click", () => {
    endGame(true);
  });

  // HUD Dynamic Settings (Sync back to Start Menu Toggles)
  btnHudAuto.addEventListener("click", () => {
    autoPlayEnabled = !autoPlayEnabled;
    chkAutoPlay.checked = autoPlayEnabled;
    btnHudAuto.innerText = autoPlayEnabled ? "AUTO: ON" : "AUTO: OFF";
    if (autoPlayEnabled) {
      btnHudAuto.classList.add("toggle-active");
    } else {
      btnHudAuto.classList.remove("toggle-active");
    }
    createFloatingText(autoPlayEnabled ? "AUTO PLAY ENABLED" : "AUTO PLAY DISABLED", canvas.width / 2, canvas.height * 0.3, "#00f3ff", 1.2);
    saveSettings();
  });

  btnHudLearn.addEventListener("click", () => {
    learnModeEnabled = !learnModeEnabled;
    chkLearnMode.checked = learnModeEnabled;
    btnHudLearn.innerText = learnModeEnabled ? "LEARN: ON" : "LEARN: OFF";
    if (learnModeEnabled) {
      btnHudLearn.classList.add("toggle-active");
    } else {
      btnHudLearn.classList.remove("toggle-active");
    }
    createFloatingText(learnModeEnabled ? "LEARN MODE ENABLED" : "LEARN MODE DISABLED", canvas.width / 2, canvas.height * 0.3, "#39ff14", 1.2);
    saveSettings();
  });

  selHudSong.addEventListener("change", (e) => {
    currentSongIndex = parseInt(e.target.value);
    selSong.value = e.target.value;
    if (gameState === "playing") {
      if (currentSongIndex >= 0) {
        audioManager.startSong(currentSongIndex);
      } else {
        audioManager.stopSong();
      }
    }
    saveSettings();
  });

  const sldHudBgVolume = document.getElementById("sldHudBgVolume");
  sldHudBgVolume.addEventListener("input", (e) => {
    audioManager.setBgVolume(parseFloat(e.target.value));
    saveSettings();
  });

  // Watch chord family checklist elements for saves
  const families = ["chkMajor", "chkMinor", "chkPower", "chkSeventh", "chkSuspended"];
  families.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("change", saveSettings);
    }
  });

  // Auto-init webcam
  if (cameraEnabled) {
    initWebcam();
  }
}

function resizeCanvas() {
  if (canvas) {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
}

// --- LOCALSTORAGE SETTINGS MANAGEMENT ---

function saveSettings() {
  const settings = {
    chordFamilies: {
      major: document.getElementById("chkMajor").checked,
      minor: document.getElementById("chkMinor").checked,
      power: document.getElementById("chkPower").checked,
      seventh: document.getElementById("chkSeventh").checked,
      suspended: document.getElementById("chkSuspended").checked
    },
    noDieEnabled,
    autoPlayEnabled,
    learnModeEnabled,
    keyboardRange,
    currentSongIndex,
    bgVolume: parseFloat(document.getElementById("sldHudBgVolume").value),
    cameraEnabled,
    blurAmount
  };
  localStorage.setItem("pianoChordNinjaSettings", JSON.stringify(settings));
}

function loadSettings() {
  const saved = localStorage.getItem("pianoChordNinjaSettings");
  if (!saved) return;
  try {
    const settings = JSON.parse(saved);
    
    // Restore Chord Families
    if (settings.chordFamilies) {
      document.getElementById("chkMajor").checked = !!settings.chordFamilies.major;
      document.getElementById("chkMinor").checked = !!settings.chordFamilies.minor;
      document.getElementById("chkPower").checked = !!settings.chordFamilies.power;
      document.getElementById("chkSeventh").checked = !!settings.chordFamilies.seventh;
      document.getElementById("chkSuspended").checked = !!settings.chordFamilies.suspended;
    }
    
    // Restore Practice Options
    noDieEnabled = !!settings.noDieEnabled;
    document.getElementById("chkNoDie").checked = noDieEnabled;

    autoPlayEnabled = !!settings.autoPlayEnabled;
    document.getElementById("chkAutoPlay").checked = autoPlayEnabled;

    learnModeEnabled = !!settings.learnModeEnabled;
    document.getElementById("chkLearnMode").checked = learnModeEnabled;

    // Restore Keyboard Range
    keyboardRange = settings.keyboardRange || 25;
    document.getElementById("selKeyRange").value = String(keyboardRange);

    // Restore Backing Song
    currentSongIndex = settings.currentSongIndex !== undefined ? settings.currentSongIndex : -1;
    document.getElementById("selSong").value = String(currentSongIndex);
    document.getElementById("selHudSong").value = String(currentSongIndex);

    // Restore volumes & webcam
    const bgVol = settings.bgVolume !== undefined ? settings.bgVolume : 0.22;
    document.getElementById("sldHudBgVolume").value = bgVol;
    audioManager.setBgVolume(bgVol);

    cameraEnabled = settings.cameraEnabled !== undefined ? settings.cameraEnabled : true;
    const btnToggleCamera = document.getElementById("btnToggleCamera");
    if (cameraEnabled) {
      btnToggleCamera.classList.add("toggle-active");
      btnToggleCamera.innerText = "Webcam Background: Enabled";
    } else {
      btnToggleCamera.classList.remove("toggle-active");
      btnToggleCamera.innerText = "Webcam Background: Disabled";
    }

    blurAmount = settings.blurAmount !== undefined ? settings.blurAmount : 20;
    document.getElementById("blurSlider").value = blurAmount;
    document.getElementById("blurVal").innerText = `${blurAmount}px`;

  } catch (e) {
    console.error("Failed to load settings from localStorage:", e);
  }
}

// --- WEBCAM MANAGEMENT ---

async function initWebcam() {
  if (!cameraEnabled) return;
  try {
    webcamStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: "user"
      },
      audio: false
    });
    webcamElement.srcObject = webcamStream;
    webcamElement.play();
  } catch (err) {
    console.warn("Webcam access denied or unavailable: ", err);
    cameraEnabled = false;
    const btn = document.getElementById("btnToggleCamera");
    btn.classList.remove("toggle-active");
    btn.innerText = "Webcam Background: Unavailable";
  }
}

function stopWebcam() {
  if (webcamStream) {
    webcamStream.getTracks().forEach(track => track.stop());
    webcamStream = null;
  }
  if (webcamElement) {
    webcamElement.srcObject = null;
  }
}

// --- MIDI INPUT MANAGEMENT ---

function setupMIDI() {
  if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess()
      .then(onMIDISuccess, onMIDIFailure);
  } else {
    console.warn("WebMIDI is not supported in this browser.");
  }
}

function onMIDISuccess(midiAccess) {
  const inputs = midiAccess.inputs.values();
  for (let input of inputs) {
    input.onmidimessage = handleMIDIMessage;
  }
  
  midiAccess.onstatechange = (e) => {
    if (e.port.type === "input") {
      e.port.onmidimessage = e.port.state === "connected" ? handleMIDIMessage : null;
    }
  };
}

function onMIDIFailure() {
  console.warn("Could not access your MIDI devices.");
}

function handleMIDIMessage(message) {
  if (autoPlayEnabled) return;

  const command = message.data[0] & 0xf0;
  const note = message.data[1];
  const velocity = message.data.length > 2 ? message.data[2] : 0;

  if (command === 144 && velocity > 0) {
    audioManager.init();
    audioManager.noteOn(note);
    activeNotes.add(note);
    onInputChanged();
  } else if (command === 128 || (command === 144 && velocity === 0)) {
    audioManager.noteOff(note);
    activeNotes.delete(note);
    onInputChanged();
  }
}

// --- QWERTY KEYBOARD INPUT MANAGEMENT ---

function setupQWERTY() {
  const qwertyMap = {
    "KeyC": 60, // C4
    "KeyD": 62, // D4
    "KeyE": 64, // E4
    "KeyF": 65, // F4
    "KeyG": 67, // G4
    "KeyA": 69, // A4
    "KeyB": 71  // B4
  };

  window.addEventListener("keydown", (e) => {
    if (gameState !== "playing" && e.code === "Enter") {
      startGame();
      return;
    }

    if (autoPlayEnabled) return; 
    
    if (qwertyMap.hasOwnProperty(e.code)) {
      audioManager.init();
      
      if (activeQwertyNotes.has(e.code)) return;

      let midiNote = qwertyMap[e.code];
      if (e.shiftKey) {
        midiNote += 1; // Sharpen note if Shift is held
      }

      activeQwertyNotes.set(e.code, midiNote);
      activeNotes.add(midiNote);
      audioManager.noteOn(midiNote);
      onInputChanged();
    }
  });

  window.addEventListener("keyup", (e) => {
    if (autoPlayEnabled) return;

    if (qwertyMap.hasOwnProperty(e.code)) {
      if (activeQwertyNotes.has(e.code)) {
        const midiNote = activeQwertyNotes.get(e.code);
        audioManager.noteOff(midiNote);
        activeNotes.delete(midiNote);
        activeQwertyNotes.delete(e.code);
        onInputChanged();
      }
    }
  });
}

function onInputChanged() {
  if (activeNotes.size === 0) {
    currentChord = null;
    updateChordHUD("--");
    return;
  }

  const detected = detectChord(Array.from(activeNotes));
  if (detected) {
    currentChord = detected;
    updateChordHUD(detected.name);
    
    if (gameState === "playing") {
      checkChordSlicing(detected.name);
    }
  } else {
    currentChord = null;
    updateChordHUD("Unknown Chord");
  }
}

function updateChordHUD(chordName) {
  const display = document.getElementById("detectedChordName");
  if (display) {
    display.innerText = chordName;
  }
}

// --- GAME LOOP & STATE MANAGERS ---

function startGame() {
  audioManager.init();
  
  // Hide menus
  document.getElementById("startMenu").classList.remove("active");
  document.getElementById("gameOverMenu").classList.remove("active");
  document.getElementById("gameHud").classList.add("active");

  // Read selected chord families
  const families = {
    major: document.getElementById("chkMajor").checked,
    minor: document.getElementById("chkMinor").checked,
    power: document.getElementById("chkPower").checked,
    seventh: document.getElementById("chkSeventh").checked,
    suspended: document.getElementById("chkSuspended").checked
  };

  const hasSelection = Object.values(families).some(v => v);
  if (!hasSelection) families.major = true;
  window.selectedFamilies = families;

  // Sync settings
  noDieEnabled = document.getElementById("chkNoDie").checked;
  autoPlayEnabled = document.getElementById("chkAutoPlay").checked;
  learnModeEnabled = document.getElementById("chkLearnMode").checked;
  keyboardRange = parseInt(document.getElementById("selKeyRange").value);
  currentSongIndex = parseInt(document.getElementById("selSong").value);

  // Sync HUD button styles
  const btnHudAuto = document.getElementById("btnHudAuto");
  btnHudAuto.innerText = autoPlayEnabled ? "AUTO: ON" : "AUTO: OFF";
  if (autoPlayEnabled) {
    btnHudAuto.classList.add("toggle-active");
  } else {
    btnHudAuto.classList.remove("toggle-active");
  }

  const btnHudLearn = document.getElementById("btnHudLearn");
  btnHudLearn.innerText = learnModeEnabled ? "LEARN: ON" : "LEARN: OFF";
  if (learnModeEnabled) {
    btnHudLearn.classList.add("toggle-active");
  } else {
    btnHudLearn.classList.remove("toggle-active");
  }

  // Reset stats
  score = 0;
  combo = 1;
  maxCombo = 1;
  lives = MAX_LIVES;
  slicedChords.clear();
  fruits = [];
  particles = [];
  slashes = [];
  floatingTexts = [];
  activeNotes.clear();
  activeQwertyNotes.clear();
  autoPlayCooldowns.clear();
  
  updateHUDDisplays();

  gameState = "playing";
  lastTime = performance.now();

  // Cancel any old loops
  if (gameLoopId) cancelAnimationFrame(gameLoopId);
  if (spawnTimerId) clearInterval(spawnTimerId);

  // Start background sequencer if song chosen
  if (currentSongIndex >= 0) {
    audioManager.startSong(currentSongIndex);
  }

  // Start spawning fruits and animation loop
  spawnTimerId = setInterval(spawnFruit, SPAWN_INTERVAL);
  setTimeout(spawnFruit, 1000);
  
  gameLoopId = requestAnimationFrame(gameLoop);
}

function endGame(manualQuit = false) {
  gameState = "gameover";
  
  if (gameLoopId) cancelAnimationFrame(gameLoopId);
  if (spawnTimerId) clearInterval(spawnTimerId);

  audioManager.stopSong(); // Stop backing track
  
  document.getElementById("gameHud").classList.remove("active");
  
  if (manualQuit) {
    document.getElementById("startMenu").classList.add("active");
    stopWebcam();
    if (cameraEnabled) initWebcam();
    return;
  }
  
  audioManager.playGameOverSFX();
  
  document.getElementById("finalScore").innerText = score;
  document.getElementById("maxCombo").innerText = `${maxCombo}x`;
  
  const listEl = document.getElementById("slicedChordsList");
  listEl.innerHTML = "";
  if (slicedChords.size > 0) {
    document.getElementById("summaryText").innerText = "You successfully recognized and sliced these chords:";
    slicedChords.forEach(chord => {
      const tag = document.createElement("span");
      tag.className = "chord-tag";
      tag.innerText = chord;
      listEl.appendChild(tag);
    });
  } else {
    document.getElementById("summaryText").innerText = "No chords sliced this round. Tap the keys to learn chords at a comfortable pace!";
  }
  
  if (score > highScore) {
    highScore = score;
  }
  
  document.getElementById("gameOverMenu").classList.add("active");
}

function updateHUDDisplays() {
  document.getElementById("scoreDisplay").innerText = String(score).padStart(5, '0');
  document.getElementById("comboDisplay").innerText = `${combo}x`;
  
  const hearts = document.querySelectorAll("#livesContainer .heart");
  hearts.forEach((heart, idx) => {
    if (noDieEnabled) {
      heart.classList.add("active");
      heart.style.filter = "hue-rotate(120deg) saturate(1.5)"; 
    } else {
      heart.style.filter = "none";
      if (idx < lives) {
        heart.classList.add("active");
      } else {
        heart.classList.remove("active");
      }
    }
  });
}

// --- FRUIT MANAGEMENT ---

function spawnFruit() {
  if (gameState !== "playing") return;

  // In Learn Mode, do not spawn a new fruit if there is already an active chord to slice
  if (learnModeEnabled && fruits.some(f => !f.sliced)) return;

  const enabledFamilies = [];
  const families = window.selectedFamilies;
  if (families.major) enabledFamilies.push("Major");
  if (families.minor) enabledFamilies.push("Minor");
  if (families.power) enabledFamilies.push("5");
  if (families.seventh) enabledFamilies.push("seventh");
  if (families.suspended) enabledFamilies.push("suspended");

  const familyChoice = enabledFamilies[Math.floor(Math.random() * enabledFamilies.length)];
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
  const x = radius + Math.random() * (canvas.width - radius * 2);
  const y = canvas.height + radius;
  
  const peakHeight = canvas.height * 0.45; 
  const distance = y - peakHeight;
  const vy = -Math.sqrt(2 * GRAVITY * distance) * (0.9 + Math.random() * 0.2); 
  
  const vx = (Math.random() * 2 - 1) * 0.8;

  fruits.push({
    id: Math.random().toString(36).substring(2, 9),
    x,
    y,
    vx,
    vy,
    radius,
    type,
    color,
    targetChord,
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
  let hitAny = false;
  
  fruits.forEach(fruit => {
    if (!fruit.sliced && fruit.targetChord.toLowerCase().trim() === chordName.toLowerCase().trim()) {
      fruit.sliced = true;
      fruit.isFrozen = false; // Release frozen state so split halves fall down!
      fruit.sliceAngle = Math.random() * Math.PI + Math.PI / 4;
      
      score += 100 * combo;
      slicedChords.add(fruit.targetChord);
      hitAny = true;

      audioManager.playSliceSFX();
      setTimeout(() => audioManager.playSplashSFX(), 40);
      
      createSlashTrail(fruit.x, fruit.y, fruit.sliceAngle, fruit.color);
      createJuiceExplosion(fruit.x, fruit.y, fruit.color);
      createFloatingText(`+${100 * combo}`, fruit.x, fruit.y - 120, fruit.color);

      audioManager.playChordCorrectSFX();

      // In Learn Mode, trigger the next spawn rapidly (1.2s) instead of waiting for the full SPAWN_INTERVAL
      if (learnModeEnabled) {
        clearInterval(spawnTimerId);
        spawnTimerId = setInterval(spawnFruit, SPAWN_INTERVAL);
        setTimeout(spawnFruit, 1200);
      }
    }
  });

  if (hitAny) {
    combo += 1;
    if (combo > maxCombo) maxCombo = combo;
    
    if (combo % 4 === 0) {
      audioManager.playComboSFX();
      createFloatingText(`${combo}x COMBO!`, canvas.width / 2, canvas.height * 0.35, "#ffea00", 2.2);
    }
    
    updateHUDDisplays();
  }
}

// --- AUTO PLAY LOGIC ---

function updateAutoPlay() {
  if (!autoPlayEnabled) return;

  const oldestFruit = fruits.find(f => !f.sliced);
  if (!oldestFruit) return;

  // Slice near flight peak, or if frozen in Learn Mode
  const shouldSlice = oldestFruit.isFrozen || (oldestFruit.vy > -1.2 && oldestFruit.y < canvas.height * 0.65);
  
  if (shouldSlice) {
    const id = oldestFruit.id;
    if (autoPlayCooldowns.has(id)) return; 

    autoPlayCooldowns.add(id);

    const chordInfo = typeof getChordNotes !== "undefined" ? getChordNotes(oldestFruit.targetChord) : null;
    if (chordInfo) {
      const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
      const simulatedNotes = chordInfo.notes.map(name => {
        const idx = NOTE_NAMES.indexOf(name);
        return 60 + idx; 
      });

      simulatedNotes.forEach(note => {
        activeNotes.add(note);
        audioManager.noteOn(note);
      });
      onInputChanged();

      setTimeout(() => {
        simulatedNotes.forEach(note => {
          activeNotes.delete(note);
          audioManager.noteOff(note);
        });
        onInputChanged();
      }, 400);
    }
  }
}

// --- PARTICLE & TRAIL GENERATORS ---

function createJuiceExplosion(x, y, color) {
  const count = 18 + Math.floor(Math.random() * 8);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 4;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1,
      radius: 2 + Math.random() * 4,
      color,
      alpha: 1,
      decay: 0.015 + Math.random() * 0.015
    });
  }
}

function createSlashTrail(cx, cy, angle, color) {
  const length = 180;
  const x1 = cx - Math.cos(angle) * length / 2;
  const y1 = cy - Math.sin(angle) * length / 2;
  const x2 = cx + Math.cos(angle) * length / 2;
  const y2 = cy + Math.sin(angle) * length / 2;

  slashes.push({
    x1, y1, x2, y2,
    color,
    alpha: 1,
    width: 6
  });
}

function createFloatingText(text, x, y, color, scale = 1.2) {
  floatingTexts.push({
    text,
    x,
    y,
    vy: -1.2,
    color,
    scale,
    alpha: 1,
    age: 0,
    maxAge: 70
  });
}

// --- MAIN GAME LOOP (UPDATERS & DRAWERS) ---

function gameLoop(time) {
  if (gameState !== "playing") return;

  const dt = time - lastTime;
  lastTime = time;

  updatePhysics();
  updateAutoPlay(); 
  drawGame();

  gameLoopId = requestAnimationFrame(gameLoop);
}

function updatePhysics() {
  for (let i = fruits.length - 1; i >= 0; i--) {
    const f = fruits[i];
    
    // In Learn Mode, if the fruit reaches its peak (vy becomes >= 0), freeze it!
    if (!f.sliced && learnModeEnabled) {
      if (f.vy >= 0 || f.isFrozen) {
        f.isFrozen = true;
        f.vx = 0;
        f.vy = 0;
      }
    }

    if (f.sliced) {
      f.splitProgress += 3.5;
      f.opacity -= 0.02;
      
      if (f.opacity <= 0) {
        fruits.splice(i, 1);
        continue;
      }
    } else {
      if (f.isFrozen) {
        // Slow rotation spin while suspended in the air waiting for chord press
        f.rotation += f.rotationSpeed * 0.35;
      } else {
        // Standard physics
        f.vy += GRAVITY;
        f.x += f.vx;
        f.y += f.vy;
        f.rotation += f.rotationSpeed;

        // Falling off bottom
        if (f.vy > 0 && f.y > canvas.height + f.radius) {
          fruits.splice(i, 1);
          
          combo = 1;

          if (noDieEnabled) {
            createFloatingText("MISSED (ZEN)", f.x, canvas.height - 40, "#39ff14", 1.2);
          } else {
            lives -= 1;
            createFloatingText("MISS!", f.x, canvas.height - 40, "#ff3333", 1.4);
            updateHUDDisplays();

            if (lives <= 0) {
              endGame();
            }
          }
        }
      }
    }
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += GRAVITY * 0.6;
    p.alpha -= p.decay;
    if (p.alpha <= 0) {
      particles.splice(i, 1);
    }
  }

  for (let i = slashes.length - 1; i >= 0; i--) {
    const s = slashes[i];
    s.alpha -= 0.05;
    if (s.alpha <= 0) {
      slashes.splice(i, 1);
    }
  }

  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i];
    ft.y += ft.vy;
    ft.age++;
    ft.alpha = 1 - (ft.age / ft.maxAge);
    if (ft.age >= ft.maxAge) {
      floatingTexts.splice(i, 1);
    }
  }
}

function drawGame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. Draw blurred webcam background
  if (cameraEnabled && webcamElement.readyState === webcamElement.HAVE_ENOUGH_DATA) {
    ctx.filter = `blur(${blurAmount}px) brightness(0.45) contrast(1.15)`;
    const scale = Math.max(canvas.width / webcamElement.videoWidth, canvas.height / webcamElement.videoHeight);
    const w = webcamElement.videoWidth * scale;
    const h = webcamElement.videoHeight * scale;
    const x = (canvas.width - w) / 2;
    const y = (canvas.height - h) / 2;
    ctx.drawImage(webcamElement, x, y, w, h);
    ctx.filter = "none";
  } else {
    const grad = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 50, canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height));
    grad.addColorStop(0, "#121228");
    grad.addColorStop(1, "#040409");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.strokeStyle = "rgba(0, 243, 255, 0.02)";
    ctx.lineWidth = 1;
    const gridSize = 80;
    for (let x = 0; x < canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  }

  // 2. Draw active slashes
  slashes.forEach(s => {
    ctx.save();
    ctx.globalAlpha = s.alpha;
    ctx.shadowColor = s.color;
    ctx.shadowBlur = 15;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = s.width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
    
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width / 2;
    ctx.stroke();
    ctx.restore();
  });

  // 3. Draw fruits
  fruits.forEach(f => {
    ctx.save();
    ctx.globalAlpha = f.opacity;
    ctx.shadowColor = f.color;
    
    // In Learn Mode, make frozen fruits pulse with neon glow as a prompt to play
    if (f.isFrozen) {
      const pulse = 36 + Math.sin(performance.now() * 0.007) * 14;
      ctx.shadowBlur = pulse;
    } else {
      ctx.shadowBlur = 44;
    }
    
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
      drawFruitInternalLines(f.type, f.radius);
      ctx.restore();

      ctx.save();
      ctx.translate(f.x - dx, f.y - dy);
      ctx.rotate(f.rotation);
      ctx.beginPath();
      ctx.arc(0, 0, f.radius, Math.PI, Math.PI * 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      drawFruitInternalLines(f.type, f.radius);
      ctx.restore();

    } else {
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rotation);
      drawFruitShape(f.type, f.radius);
      ctx.rotate(-f.rotation);
      
      // Draw tag. In Learn Mode, if frozen, draw tag with a border blink
      drawChordTag(f.targetChord, 0, f.radius + 70, f.color, f.isFrozen);
    }
    ctx.restore();
  });

  // 4. Draw particles
  particles.forEach(p => {
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

  // 5. Draw floating texts
  floatingTexts.forEach(ft => {
    ctx.save();
    ctx.globalAlpha = ft.alpha;
    ctx.font = `italic 900 ${36 * ft.scale}px 'Orbitron', sans-serif`;
    ctx.fillStyle = ft.color;
    ctx.shadowColor = ft.color;
    ctx.shadowBlur = 10;
    ctx.textAlign = "center";
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  });

  // 6. Draw on-screen virtual keyboard
  drawVirtualKeyboard();
}

// --- CANVAS VECTOR ART ROUTINES ---

function drawFruitShape(type, r) {
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
      drawFruitInternalLines("orange", r);
      break;

    case "watermelon":
      ctx.arc(0, 0, r, 0, Math.PI, true);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      drawFruitInternalLines("watermelon", r);
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

function drawFruitInternalLines(type, r) {
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
    ctx.arc(0, 0, 8, 0, Math.PI*2);
    ctx.stroke();
  } 
  else if (type === "watermelon") {
    ctx.fillStyle = "#ffffff";
    const seedPositions = [
      {x: -r * 0.5, y: r * 0.3},
      {x: -r * 0.2, y: r * 0.6},
      {x: 0, y: r * 0.4},
      {x: r * 0.2, y: r * 0.6},
      {x: r * 0.5, y: r * 0.3}
    ];
    seedPositions.forEach(pos => {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.restore();
}

function drawChordTag(chordName, x, y, glowColor, isFrozenPrompt = false) {
  ctx.save();
  
  const info = typeof getChordNotes !== "undefined" ? getChordNotes(chordName) : null;
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

  // Background acrylic layer
  ctx.fillStyle = "rgba(10, 10, 18, 0.84)";
  
  // If frozen and waiting for user input, blink the border to attract attention!
  if (isFrozenPrompt) {
    const intensity = 0.2 + (Math.sin(performance.now() * 0.01) + 1) * 0.4;
    ctx.strokeStyle = `rgba(255, 234, 0, ${intensity})`;
    ctx.lineWidth = 3.6;
    ctx.shadowColor = "var(--neon-yellow)";
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

  // Subtle highlight accent top border
  ctx.strokeStyle = isFrozenPrompt ? "var(--neon-yellow)" : glowColor;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(rx + 6, ry + 2, w - 12, 4, 4);
  ctx.stroke();

  // Text rendering (Line 1: Chord Name)
  ctx.fillStyle = "#ffffff";
  ctx.shadowBlur = 0; 
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 34px 'Outfit', sans-serif";
  ctx.fillText(chordName, x, y - 14);

  // Text rendering (Line 2: Target Helper Notes)
  ctx.fillStyle = isFrozenPrompt ? "var(--neon-yellow)" : "rgba(255, 255, 255, 0.75)";
  ctx.font = "bold 26px 'Outfit', sans-serif";
  ctx.fillText(notesText, x, y + 22);
  
  ctx.restore();
}

// --- DYNAMIC VIRTUAL KEYBOARD RENDERER ---

function drawVirtualKeyboard() {
  const width = Math.min(canvas.width * 0.85, 1100);
  const height = 110;
  const x = (canvas.width - width) / 2;
  const y = canvas.height - height - 30;

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
    const pc = n % 12;
    if ([0, 2, 4, 5, 7, 9, 11].includes(pc)) {
      whiteMidiNotes.push(n);
    } else {
      blackMidiNotes.push(n);
    }
  }

  const totalWhite = whiteMidiNotes.length;
  const keyWidth = width / totalWhite;

  const oldestFruit = fruits.find(f => !f.sliced);
  let guidePitchClassToFinger = {};
  if (oldestFruit) {
    const guideInfo = typeof getChordNotes !== "undefined" ? getChordNotes(oldestFruit.targetChord) : null;
    if (guideInfo) {
      const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
      guideInfo.notes.forEach((name, idx) => {
        const pc = NOTE_NAMES.indexOf(name);
        guidePitchClassToFinger[pc] = guideInfo.fingers[idx];
      });
    }
  }

  // Draw Keyboard backing card
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
  ctx.fillText(`DOJO INPUT KEYBOARD (${keyboardRange} KEYS)`, x, y - 10);
  ctx.restore();

  // 1. Draw White Keys
  for (let i = 0; i < totalWhite; i++) {
    const note = whiteMidiNotes[i];
    const kx = x + i * keyWidth;
    const ky = y;
    const kw = keyWidth;
    const kh = height;

    const isPressed = activeNotes.has(note);
    const isGuide = (note % 12) in guidePitchClassToFinger;

    ctx.save();
    if (isPressed) {
      ctx.fillStyle = "rgba(0, 243, 255, 0.25)";
      ctx.strokeStyle = "rgba(0, 243, 255, 0.6)";
      ctx.shadowColor = "var(--neon-cyan)";
      ctx.shadowBlur = 10;
    } else {
      ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    }
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(kx + 1, ky, kw - 2, kh, [0, 0, 6, 6]);
    ctx.fill();
    ctx.stroke();

    // Dual Guide Highlight (showing finger index 1-5)
    if (isGuide && !isPressed) {
      const finger = guidePitchClassToFinger[note % 12];
      const guideAlpha = oldestFruit && oldestFruit.isFrozen ? 0.8 + Math.sin(performance.now() * 0.01) * 0.15 : 0.9;
      
      ctx.fillStyle = `rgba(255, 234, 0, ${guideAlpha})`;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.2;
      ctx.shadowColor = "var(--neon-yellow)";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      const cx = kx + kw / 2;
      const cy = ky + kh * 0.72;
      const rad = Math.min(kw * 0.32, 9.5);
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Draw finger number inside the badge
      ctx.fillStyle = "#0c0c16";
      ctx.font = "bold 11px 'Outfit', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowBlur = 0;
      ctx.fillText(finger, cx, cy + 1);
    }

    if (note % 12 === 0) {
      ctx.fillStyle = isPressed ? "#ffffff" : "rgba(255,255,255,0.3)";
      ctx.font = "bold 11px 'Outfit', sans-serif";
      ctx.textAlign = "center";
      const octave = Math.floor(note / 12) - 1;
      ctx.fillText(`C${octave}`, kx + kw / 2, ky + kh - 10);
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
    const ky = y;

    const isPressed = activeNotes.has(bkNote);
    const isGuide = (bkNote % 12) in guidePitchClassToFinger;

    ctx.save();
    if (isPressed) {
      ctx.fillStyle = "rgba(157, 0, 255, 0.4)";
      ctx.strokeStyle = "rgba(157, 0, 255, 0.8)";
      ctx.shadowColor = "var(--neon-purple)";
      ctx.shadowBlur = 12;
    } else {
      ctx.fillStyle = "#111116";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    }
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(kx, ky, blackWidth, blackHeight, [0, 0, 4, 4]);
    ctx.fill();
    ctx.stroke();

    // Dual Guide Highlight (showing finger index 1-5)
    if (isGuide && !isPressed) {
      const finger = guidePitchClassToFinger[bkNote % 12];
      const guideAlpha = oldestFruit && oldestFruit.isFrozen ? 0.8 + Math.sin(performance.now() * 0.01) * 0.15 : 0.9;
      
      ctx.fillStyle = `rgba(255, 234, 0, ${guideAlpha})`;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.2;
      ctx.shadowColor = "var(--neon-yellow)";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      const cx = kx + blackWidth / 2;
      const cy = ky + blackHeight * 0.72;
      const rad = Math.min(blackWidth * 0.35, 8);
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Draw finger number inside the badge
      ctx.fillStyle = "#0c0c16";
      ctx.font = "bold 9px 'Outfit', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowBlur = 0;
      ctx.fillText(finger, cx, cy + 1);
    }
    ctx.restore();
  });
}
