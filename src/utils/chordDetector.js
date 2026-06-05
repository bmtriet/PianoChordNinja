/**
 * chordDetector.js
 * Music theory chord detection library for Piano Chord Ninja.
 * Handles detection of major, minor, power chords, 7ths, suspended, diminished, and augmented chords,
 * supporting all keyboard inversions and octaves.
 */

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const CHORD_PATTERNS = [
  // Power Chords
  { name: "5", intervals: [0, 7], type: "power" },
  
  // Triads
  { name: "", intervals: [0, 4, 7], type: "triad" },
  { name: " Minor", intervals: [0, 3, 7], type: "triad" },
  { name: " sus4", intervals: [0, 5, 7], type: "sus" },
  { name: " sus2", intervals: [0, 2, 7], type: "sus" },
  { name: " dim", intervals: [0, 3, 6], type: "triad" },
  { name: " aug", intervals: [0, 4, 8], type: "triad" },
  
  // Seventh Chords
  { name: "maj7", intervals: [0, 4, 7, 11], type: "seventh" },
  { name: "min7", intervals: [0, 3, 7, 10], type: "seventh" },
  { name: "7", intervals: [0, 4, 7, 10], type: "seventh" },
  { name: "m7b5", intervals: [0, 3, 6, 10], type: "seventh" },
  { name: "dim7", intervals: [0, 3, 6, 9], type: "seventh" },
  { name: "m(maj7)", intervals: [0, 3, 7, 11], type: "seventh" },
  
  // Sixth Chords
  { name: "6", intervals: [0, 4, 7, 9], type: "sixth" },
  { name: "m6", intervals: [0, 3, 7, 9], type: "sixth" }
];

/**
 * Detects the musical chord represented by a set of active MIDI note numbers.
 * @param {number[]} midiNotes Array of active MIDI note numbers (e.g. [60, 64, 67] for C4, E4, G4)
 * @returns {Object|null} Object containing { name: String, root: String, type: String } or null if no chord is recognized
 */
export function detectChord(midiNotes) {
  if (!midiNotes || midiNotes.length < 2) return null;

  // 1. Get unique pitch classes (0-11)
  const pitchClasses = Array.from(new Set(midiNotes.map(n => n % 12)));
  
  // 2. Try each pitch class as the root note candidate
  for (let candidateRoot of pitchClasses) {
    // 3. Project all other pitch classes relative to this candidate root (modulo 12)
    const relativeIntervals = pitchClasses
      .map(pc => (pc - candidateRoot + 12) % 12)
      .sort((a, b) => a - b);
      
    // 4. Compare relativeIntervals with our patterns
    for (let pattern of CHORD_PATTERNS) {
      if (arraysEqual(relativeIntervals, pattern.intervals)) {
        const rootName = NOTE_NAMES[candidateRoot];
        return {
          name: `${rootName}${pattern.name}`,
          root: rootName,
          type: pattern.type,
          rootIndex: candidateRoot
        };
      }
    }
  }
  
  return null;
}

/**
 * Helper to check if two sorted arrays are equal.
 */
function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Helper to convert a MIDI note number to its note name and octave.
 * @param {number} midiNote 
 * @returns {string} e.g. "C4"
 */
export function midiNoteToName(midiNote) {
  const noteIndex = midiNote % 12;
  const octave = Math.floor(midiNote / 12) - 1;
  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

/**
 * Takes a chord name (e.g. "C", "F#maj7", "G5") and returns its root index, relative intervals,
 * and list of note names.
 * @param {string} chordName 
 * @returns {Object|null} { notes: String[], intervals: number[], rootIndex: number }
 */
export function getChordNotes(chordName) {
  if (!chordName) return null;
  
  // Strip slash chord parts (e.g. C/E -> C, Am/G -> Am)
  const baseChord = chordName.split("/")[0].trim();
  
  const parsed = parseRootAndSuffix(baseChord);
  if (!parsed.root) return null;
  
  const rootIndex = NOTE_NAMES.indexOf(parsed.root);
  const suffix = parsed.suffix.trim();
  
  // Normalize suffix
  let normalizedSuffix = suffix;
  const lowerSuffix = suffix.toLowerCase();
  
  if (lowerSuffix === "m" || lowerSuffix === "min" || lowerSuffix === "minor") {
    normalizedSuffix = " Minor";
  } else if (lowerSuffix === "sus" || lowerSuffix === "sus4") {
    normalizedSuffix = " sus4";
  } else if (lowerSuffix === "sus2") {
    normalizedSuffix = " sus2";
  } else if (lowerSuffix === "dim") {
    normalizedSuffix = " dim";
  } else if (lowerSuffix === "aug") {
    normalizedSuffix = " aug";
  } else if (lowerSuffix === "" || lowerSuffix === "maj" || lowerSuffix === "major") {
    normalizedSuffix = "";
  } else if (lowerSuffix === "m7" || lowerSuffix === "min7") {
    normalizedSuffix = "min7";
  } else if (lowerSuffix === "maj7") {
    normalizedSuffix = "maj7";
  }
  
  const pattern = CHORD_PATTERNS.find(p => p.name === normalizedSuffix);
  if (!pattern) return null;
  
  const notes = pattern.intervals.map(interval => {
    const noteIdx = (rootIndex + interval) % 12;
    return NOTE_NAMES[noteIdx];
  });
  
  const fingers = getChordFingerings(pattern.intervals);
  
  return {
    notes,
    intervals: pattern.intervals,
    rootIndex,
    fingers
  };
}

/**
 * Resolves standard right-hand piano fingerings (1 = Thumb, 2 = Index, 3 = Middle, 4 = Ring, 5 = Pinky)
 * for a set of chord intervals.
 * @param {number[]} intervals Array of semitone intervals (e.g. [0, 4, 7] for Major)
 * @returns {number[]} Array of finger numbers matching notes in sequence.
 */
export function getChordFingerings(intervals) {
  if (!intervals || intervals.length === 0) return [];
  
  if (intervals.length === 2) {
    return [1, 5];
  }
  
  if (intervals.length === 3) {
    const d1 = intervals[1] - intervals[0];
    const d2 = intervals[2] - intervals[1];
    
    if (d1 <= 2) {
      return [1, 2, 5]; // Sus2 style
    } else if (d2 <= 2) {
      return [1, 4, 5]; // Sus4 style
    } else {
      return [1, 3, 5]; // Standard Major/Minor Triad
    }
  }
  
  if (intervals.length === 4) {
    return [1, 2, 3, 5]; // Standard 7th Chord
  }
  
  // Fallback for custom chord sizes
  const fingers = [];
  for (let i = 0; i < intervals.length; i++) {
    fingers.push(i === 0 ? 1 : i === intervals.length - 1 ? 5 : 2 + Math.min(i - 1, 2));
  }
  return fingers;
}

/**
 * Transposes a chord name by a given number of semitones.
 * e.g., transposeChord("C", 2) => "D"
 * e.g., transposeChord("Am/G", 2) => "Bm/A"
 * @param {string} chordName 
 * @param {number} semitones 
 * @returns {string} The transposed chord name
 */
export function transposeChord(chordName, semitones) {
  if (!chordName || !semitones) return chordName;

  // Split slash chords (e.g. C/E -> C and E)
  return chordName.split("/").map(part => {
    part = part.trim();
    if (!part) return "";

    const parsed = parseRootAndSuffix(part);
    if (!parsed.root) return part;

    const rootIndex = NOTE_NAMES.indexOf(parsed.root);
    const transposedIndex = (rootIndex + semitones + 12) % 12;
    const transposedRoot = NOTE_NAMES[transposedIndex];

    return transposedRoot + parsed.suffix;
  }).join("/");
}

/**
 * Gets the expected bass note name for a given chord name.
 * e.g., getChordBassNote("C/E") => "E"
 * e.g., getChordBassNote("Am") => "A"
 * @param {string} chordName 
 * @returns {string|null} The bass note name
 */
export function getChordBassNote(chordName) {
  if (!chordName) return null;
  const parts = chordName.split("/");
  if (parts.length > 1) {
    const bassPart = parts[1].trim();
    const parsed = parseRootAndSuffix(bassPart);
    return parsed.root || null;
  }
  
  // No slash: parse the root note name of base chord
  const baseChord = parts[0].trim();
  const parsed = parseRootAndSuffix(baseChord);
  return parsed.root || null;
}

/**
 * Helper to parse root and suffix from a chord part.
 * Maps flat notes (Db, Eb, Gb, Ab, Bb) to their sharp equivalents.
 * @param {string} part 
 * @returns {Object} { root: string, suffix: string }
 */
export function parseRootAndSuffix(part) {
  let root = "";
  let suffix = "";
  
  if (part.length >= 2) {
    const twoChars = part.substring(0, 2);
    if (NOTE_NAMES.includes(twoChars)) {
      root = twoChars;
      suffix = part.substring(2);
    } else if (["Db", "Eb", "Gb", "Ab", "Bb"].includes(twoChars)) {
      const flatToSharpMap = { "Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#" };
      root = flatToSharpMap[twoChars];
      suffix = part.substring(2);
    }
  }
  
  if (!root && part.length >= 1) {
    const oneChar = part.substring(0, 1);
    if (NOTE_NAMES.includes(oneChar)) {
      root = oneChar;
      suffix = part.substring(1);
    }
  }
  
  return { root, suffix };
}

/**
 * Gets the root note name for a given chord name, ignoring any slash parts.
 * Maps flat roots to their sharp equivalents.
 * e.g., getChordRoot("C/E") => "C"
 * e.g., getChordRoot("Am/G") => "A"
 * @param {string} chordName 
 * @returns {string} The root note name
 */
export function getChordRoot(chordName) {
  if (!chordName) return "";
  const baseChord = chordName.split("/")[0].trim();
  const parsed = parseRootAndSuffix(baseChord);
  return parsed.root;
}

/**
 * Resolves a specific midi note voicing (around Middle C) for a given chord name.
 * Shifts octaves to fit within [minMidi, maxMidi] if needed.
 * @param {string} chordName
 * @param {number} minMidi
 * @param {number} maxMidi
 * @returns {number[]|null} Array of midi note numbers
 */
export function getChordVoicingMidiNotes(chordName, minMidi = 60, maxMidi = 84) {
  const guideInfo = getChordNotes(chordName);
  if (!guideInfo) return null;

  let rootMidi = 60 + ((guideInfo.rootIndex - 0 + 6) % 12) - 6;
  let chordMidiNotes = guideInfo.intervals.map(interval => rootMidi + interval);

  let attempts = 0;
  while (chordMidiNotes.some(n => n < minMidi) && attempts < 4) {
    rootMidi += 12;
    chordMidiNotes = guideInfo.intervals.map(interval => rootMidi + interval);
    attempts++;
  }
  attempts = 0;
  while (chordMidiNotes.some(n => n > maxMidi) && attempts < 4) {
    rootMidi -= 12;
    chordMidiNotes = guideInfo.intervals.map(interval => rootMidi + interval);
    attempts++;
  }

  return chordMidiNotes;
}

