import { getChordNotes, transposeChord, getChordBassNote, getChordRoot, parseRootAndSuffix } from "/Users/triet.bui/Desktop/projects/PianoChordNinja/src/utils/chordDetector.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
  console.log("✓ " + message);
}

console.log("Starting chordDetector verification tests...");

// Test parseRootAndSuffix
const p1 = parseRootAndSuffix("Db");
assert(p1.root === "C#" && p1.suffix === "", "parseRootAndSuffix('Db') -> C#");

const p2 = parseRootAndSuffix("C#m");
assert(p2.root === "C#" && p2.suffix === "m", "parseRootAndSuffix('C#m') -> C# m");

const p3base = parseRootAndSuffix("Dbm");
assert(p3base.root === "C#" && p3base.suffix === "m", "parseRootAndSuffix('Dbm') -> C# m");

// Test getChordRoot
assert(getChordRoot("C/E") === "C", "getChordRoot('C/E') -> C");
assert(getChordRoot("Db/F") === "C#", "getChordRoot('Db/F') -> C#");
assert(getChordRoot("Am/G") === "A", "getChordRoot('Am/G') -> A");
assert(getChordRoot("F#maj7") === "F#", "getChordRoot('F#maj7') -> F#");

// Test getChordBassNote
assert(getChordBassNote("C/E") === "E", "getChordBassNote('C/E') -> E");
assert(getChordBassNote("Db/F") === "F", "getChordBassNote('Db/F') -> F");
assert(getChordBassNote("Am/Gb") === "F#", "getChordBassNote('Am/Gb') -> Gb (F#)");
assert(getChordBassNote("C") === "C", "getChordBassNote('C') -> C");
assert(getChordBassNote("Db") === "C#", "getChordBassNote('Db') -> C#");

// Test transposeChord
assert(transposeChord("C", 2) === "D", "transposeChord('C', 2) -> D");
assert(transposeChord("Db", 2) === "D#", "transposeChord('Db', 2) -> D# (Eb + 2 = F but here Db maps to C# + 2 = D#)");
assert(transposeChord("C/E", 2) === "D/F#", "transposeChord('C/E', 2) -> D/F#");

// ----------------------------------------------------
// Mock checkChordMatch to test target combinations
// ----------------------------------------------------
const checkChordMatch = (activeNotes, detectedChord, targetChordName) => {
  if (!targetChordName) return false;
  if (!activeNotes || activeNotes.length === 0) return false;

  const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const normalizeChordName = (chordName) => chordName.replace(/Minor/i, "m").replace(/Major/i, "").replace(/\s+/g, "").toLowerCase();
  const normalizeNoteName = (noteName) => {
    const flatToSharp = { db: "c#", eb: "d#", gb: "f#", ab: "g#", bb: "a#" };
    const clean = noteName.toLowerCase();
    return flatToSharp[clean] || clean;
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

  const cleanTarget = normalizeChordName(targetChordName);
  const targetRoot = getChordRoot(targetChordName);

  if (detectedChord && detectedChord !== "Unknown Chord") {
    const cleanDetected = normalizeChordName(detectedChord);
    if (cleanDetected === cleanTarget) {
      return true;
    }

    if (cleanDetected.endsWith("5")) {
      const powerRoot = cleanDetected.substring(0, cleanDetected.length - 1);
      if (targetRoot) {
        if (powerRoot === normalizeNoteName(targetRoot)) {
          return true;
        }
      }
    }
  }

  const playedPowerRoot = getPowerChordRootFromNotes(activeNotes);
  if (playedPowerRoot && targetRoot && normalizeNoteName(playedPowerRoot) === normalizeNoteName(targetRoot)) {
    return true;
  }

  if (getAdaptiveStyleMatch(activeNotes, targetChordName)) {
    return true;
  }

  if (!targetChordName.includes("/")) {
    return false;
  }

  const lowestMidi = Math.min(...activeNotes);
  const playedBassName = NOTE_NAMES[lowestMidi % 12];
  
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

console.log("\nStarting checkChordMatch verification tests...");

// Test Power Chord matches
assert(checkChordMatch([60, 67, 72], "C5", "C") === true, "C5 matches target 'C'");
assert(checkChordMatch([60, 67, 72], "C5", "Cm") === true, "C5 matches target 'Cm'");
assert(checkChordMatch([60, 67, 72], "C5", "C/E") === true, "C5 matches target 'C/E'");
assert(checkChordMatch([60, 67, 72], "C5", "Cmaj7") === true, "C5 matches target 'Cmaj7'");
assert(checkChordMatch([60, 67, 72], "", "C") === true, "Raked C-G-C matches target 'C' from notes");
assert(checkChordMatch([65, 72, 77], "", "F") === true, "Raked F-C-F matches target 'F' from notes");
assert(checkChordMatch([36, 43, 48, 50], "C sus2", "C") === true, "Bass-anchored C-G plus passing D matches target 'C'");
assert(checkChordMatch([38, 45, 50, 64], "D sus2", "D Minor") === true, "Bass-anchored D-A plus passing E matches target 'Dm'");

// Test non-matching power chord root
assert(checkChordMatch([60, 67, 72], "C5", "F") === false, "C5 does NOT match target 'F'");
assert(checkChordMatch([41, 57, 48], "F", "C") === false, "F-bass voicing does NOT match target 'C' just because C is present");

// Test exact matching (Major shouldn't match Minor directly without power chord helper)
assert(checkChordMatch([60, 64, 67], "C", "Cm") === false, "C Major does NOT match target 'Cm'");
assert(checkChordMatch([60, 63, 67], "Cm", "Cm") === true, "C Minor matches target 'Cm' exactly");

// Test Bass Note matches
assert(checkChordMatch([60], "", "C") === false, "Single note 'C' (60) does NOT prematurely match target 'C'");
assert(checkChordMatch([64], "", "C/E") === true, "Single note 'E' (64) matches target 'C/E' via bass note");
assert(checkChordMatch([67], "", "C") === false, "Single note 'G' (67) does NOT match target 'C'");

console.log("All checkChordMatch tests passed successfully!");
