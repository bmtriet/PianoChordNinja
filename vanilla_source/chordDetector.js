/**
 * chordDetector.js
 * Music theory chord detection library for Piano Chord Ninja.
 * Handles detection of major, minor, power chords, 7ths, suspended, diminished, and augmented chords,
 * supporting all keyboard inversions and octaves.
 */

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const CHORD_PATTERNS = [
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
function detectChord(midiNotes) {
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
function midiNoteToName(midiNote) {
  const noteIndex = midiNote % 12;
  const octave = Math.floor(midiNote / 12) - 1;
  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

/**
 * Takes a chord name (e.g. "C Major", "F#maj7", "G5") and returns its root index, relative intervals,
 * and list of note names.
 * @param {string} chordName 
 * @returns {Object|null} { notes: String[], intervals: number[], rootIndex: number }
 */
function getChordNotes(chordName) {
  if (!chordName) return null;
  
  let root = "";
  if (chordName.length >= 2 && NOTE_NAMES.includes(chordName.substring(0, 2))) {
    root = chordName.substring(0, 2);
  } else if (NOTE_NAMES.includes(chordName.substring(0, 1))) {
    root = chordName.substring(0, 1);
  } else {
    return null;
  }
  
  const rootIndex = NOTE_NAMES.indexOf(root);
  const suffix = chordName.substring(root.length);
  
  const pattern = CHORD_PATTERNS.find(p => p.name === suffix);
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
function getChordFingerings(intervals) {
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

// Export for module/global usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { detectChord, getChordNotes, getChordFingerings, midiNoteToName, NOTE_NAMES, CHORD_PATTERNS };
}


