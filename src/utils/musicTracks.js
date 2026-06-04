/**
 * musicTracks.js
 * Preloaded song notes database for the Song Waterfall / Piano Tiles mode.
 * Each song contains a note list with { time (s), midi (pitch), duration (s) }.
 */

export const WATERFALL_SONGS = [
  {
    name: "Ode to Joy (Beethoven)",
    bpm: 120,
    notes: [
      // Phrase 1
      { time: 0.0, midi: 64, duration: 0.4 },
      { time: 0.5, midi: 64, duration: 0.4 },
      { time: 1.0, midi: 65, duration: 0.4 },
      { time: 1.5, midi: 67, duration: 0.4 },
      
      { time: 2.0, midi: 67, duration: 0.4 },
      { time: 2.5, midi: 65, duration: 0.4 },
      { time: 3.0, midi: 64, duration: 0.4 },
      { time: 3.5, midi: 62, duration: 0.4 },
      
      { time: 4.0, midi: 60, duration: 0.4 },
      { time: 4.5, midi: 60, duration: 0.4 },
      { time: 5.0, midi: 62, duration: 0.4 },
      { time: 5.5, midi: 64, duration: 0.4 },
      
      { time: 6.0, midi: 64, duration: 0.6 },
      { time: 6.5, midi: 62, duration: 0.2 },
      { time: 7.0, midi: 62, duration: 0.8 },
      
      // Phrase 2
      { time: 8.0, midi: 64, duration: 0.4 },
      { time: 8.5, midi: 64, duration: 0.4 },
      { time: 9.0, midi: 65, duration: 0.4 },
      { time: 9.5, midi: 67, duration: 0.4 },
      
      { time: 10.0, midi: 67, duration: 0.4 },
      { time: 10.5, midi: 65, duration: 0.4 },
      { time: 11.0, midi: 64, duration: 0.4 },
      { time: 11.5, midi: 62, duration: 0.4 },
      
      { time: 12.0, midi: 60, duration: 0.4 },
      { time: 12.5, midi: 60, duration: 0.4 },
      { time: 13.0, midi: 62, duration: 0.4 },
      { time: 13.5, midi: 64, duration: 0.4 },
      
      { time: 14.0, midi: 62, duration: 0.6 },
      { time: 14.5, midi: 60, duration: 0.2 },
      { time: 15.0, midi: 60, duration: 0.8 },

      // Phrase 3 (Bridge)
      { time: 16.0, midi: 62, duration: 0.4 },
      { time: 16.5, midi: 62, duration: 0.4 },
      { time: 17.0, midi: 64, duration: 0.4 },
      { time: 17.5, midi: 60, duration: 0.4 },
      
      { time: 18.0, midi: 62, duration: 0.4 },
      { time: 18.5, midi: 64, duration: 0.2 },
      { time: 18.7, midi: 65, duration: 0.2 },
      { time: 19.0, midi: 64, duration: 0.4 },
      { time: 19.5, midi: 60, duration: 0.4 },
      
      { time: 20.0, midi: 62, duration: 0.4 },
      { time: 20.5, midi: 64, duration: 0.2 },
      { time: 20.7, midi: 65, duration: 0.2 },
      { time: 21.0, midi: 64, duration: 0.4 },
      { time: 21.5, midi: 62, duration: 0.4 },
      
      { time: 22.0, midi: 60, duration: 0.4 },
      { time: 22.5, midi: 62, duration: 0.4 },
      { time: 23.0, midi: 55, duration: 0.8 },
      
      // Phrase 4 (Repeat of theme end)
      { time: 24.0, midi: 64, duration: 0.4 },
      { time: 24.5, midi: 64, duration: 0.4 },
      { time: 25.0, midi: 65, duration: 0.4 },
      { time: 25.5, midi: 67, duration: 0.4 },
      
      { time: 26.0, midi: 67, duration: 0.4 },
      { time: 26.5, midi: 65, duration: 0.4 },
      { time: 27.0, midi: 64, duration: 0.4 },
      { time: 27.5, midi: 62, duration: 0.4 },
      
      { time: 28.0, midi: 60, duration: 0.4 },
      { time: 28.5, midi: 60, duration: 0.4 },
      { time: 29.0, midi: 62, duration: 0.4 },
      { time: 29.5, midi: 64, duration: 0.4 },
      
      { time: 30.0, midi: 62, duration: 0.6 },
      { time: 30.5, midi: 60, duration: 0.2 },
      { time: 31.0, midi: 60, duration: 0.8 }
    ]
  },
  {
    name: "Für Elise (Beethoven)",
    bpm: 130,
    notes: [
      // Main theme hook
      { time: 0.0, midi: 76, duration: 0.25 }, // E5
      { time: 0.25, midi: 75, duration: 0.25 }, // D#5
      { time: 0.5, midi: 76, duration: 0.25 }, // E5
      { time: 0.75, midi: 75, duration: 0.25 }, // D#5
      { time: 1.0, midi: 76, duration: 0.25 }, // E5
      { time: 1.25, midi: 71, duration: 0.25 }, // B4
      { time: 1.5, midi: 74, duration: 0.25 }, // D5
      { time: 1.75, midi: 72, duration: 0.25 }, // C5
      { time: 2.0, midi: 69, duration: 0.75 }, // A4
      
      // Left hand bass entries (played automatically or visual hints)
      { time: 2.0, midi: 57, duration: 0.75 }, // A3
      
      { time: 2.75, midi: 60, duration: 0.25 }, // C4
      { time: 3.0, midi: 64, duration: 0.25 }, // E4
      { time: 3.25, midi: 69, duration: 0.25 }, // A4
      { time: 3.5, midi: 71, duration: 0.75 }, // B4
      
      { time: 3.5, midi: 52, duration: 0.75 }, // E3
      
      { time: 4.25, midi: 64, duration: 0.25 }, // E4
      { time: 4.5, midi: 68, duration: 0.25 }, // G#4
      { time: 4.75, midi: 71, duration: 0.25 }, // B4
      { time: 5.0, midi: 72, duration: 0.75 }, // C5
      
      { time: 5.0, midi: 57, duration: 0.75 }, // A3
      
      { time: 5.75, midi: 64, duration: 0.25 }, // E4
      { time: 6.0, midi: 76, duration: 0.25 }, // E5
      { time: 6.25, midi: 75, duration: 0.25 }, // D#5
      
      // Repeat main hook
      { time: 6.5, midi: 76, duration: 0.25 },
      { time: 6.75, midi: 75, duration: 0.25 },
      { time: 7.0, midi: 76, duration: 0.25 },
      { time: 7.25, midi: 71, duration: 0.25 },
      { time: 7.5, midi: 74, duration: 0.25 },
      { time: 7.75, midi: 72, duration: 0.25 },
      { time: 8.0, midi: 69, duration: 0.75 },
      
      { time: 8.0, midi: 57, duration: 0.75 },
      
      { time: 8.75, midi: 60, duration: 0.25 },
      { time: 9.0, midi: 64, duration: 0.25 },
      { time: 9.25, midi: 69, duration: 0.25 },
      { time: 9.5, midi: 71, duration: 0.75 },
      
      { time: 9.5, midi: 52, duration: 0.75 },
      
      { time: 10.25, midi: 64, duration: 0.25 },
      { time: 10.5, midi: 72, duration: 0.25 },
      { time: 10.75, midi: 71, duration: 0.25 },
      { time: 11.0, midi: 69, duration: 1.0 },
      
      { time: 11.0, midi: 57, duration: 1.0 }
    ]
  },
  {
    name: "Canon in D (Pachelbel)",
    bpm: 80,
    notes: [
      // Baseline 1
      { time: 0.0, midi: 78, duration: 0.8 }, // F#5
      { time: 1.0, midi: 76, duration: 0.8 }, // E5
      { time: 2.0, midi: 74, duration: 0.8 }, // D5
      { time: 3.0, midi: 73, duration: 0.8 }, // C#5
      { time: 4.0, midi: 71, duration: 0.8 }, // B4
      { time: 5.0, midi: 69, duration: 0.8 }, // A4
      { time: 6.0, midi: 71, duration: 0.8 }, // B4
      { time: 7.0, midi: 73, duration: 0.8 }, // C#5
      
      // Baseline 2 (In Harmony)
      { time: 8.0, midi: 74, duration: 0.8 }, // D5
      { time: 9.0, midi: 73, duration: 0.8 }, // C#5
      { time: 10.0, midi: 71, duration: 0.8 }, // B4
      { time: 11.0, midi: 69, duration: 0.8 }, // A4
      { time: 12.0, midi: 67, duration: 0.8 }, // G4
      { time: 13.0, midi: 66, duration: 0.8 }, // F#4
      { time: 14.0, midi: 67, duration: 0.8 }, // G4
      { time: 15.0, midi: 69, duration: 0.8 }  // A4
    ]
  }
];
