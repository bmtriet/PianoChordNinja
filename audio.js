/**
 * audio.js
 * Programmatic Web Audio Synthesizer, SFX, and Background Sequencer for Piano Chord Ninja.
 * Loops 10 famous chord progressions and melody tracks programmatically in real-time.
 */

// 10 Famous Songs database with Chords and Melody sequences (in 4/4 beats)
const SONGS = [
  {
    name: "Canon in D (Pachelbel)",
    bpm: 78,
    chords: ["D", "A", "B Minor", "F# Minor", "G", "D", "G", "A"],
    melody: [
      78, 76, 74, 73, 71, 69, 67, 66, 67, 69, 71, 73, 74, 76, 78, 79,
      81, 79, 78, 76, 74, 73, 71, 69, 67, 66, 64, 62, 64, 66, 67, 69
    ]
  },
  {
    name: "Let It Be (The Beatles)",
    bpm: 86,
    chords: ["C", "G", "A Minor", "F", "C", "G", "F", "C"],
    melody: [
      67, 67, 67, 69, 71, 67, null, 67, 69, 69, 67, 67, 65, 64, 62, 60,
      64, 67, 67, 69, 67, 64, 62, null, 60, 62, 64, 62, 60, null, null, null
    ]
  },
  {
    name: "Für Elise (Beethoven)",
    bpm: 110,
    chords: ["A Minor", "E", "A Minor", "E", "A Minor", "C", "G", "A Minor"],
    melody: [
      76, 75, 76, 75, 76, 71, 74, 72, 69, null, 60, 64, 69, 71, null, 64,
      71, 72, 74, null, 64, 76, 75, 76, 75, 76, 71, 74, 72, 69, null, null
    ]
  },
  {
    name: "Imagine (John Lennon)",
    bpm: 76,
    chords: ["C", "F", "C", "F", "C", "F", "A Minor", "D Minor", "G"],
    melody: [
      71, 72, 76, 79, 81, 81, 81, null, 71, 72, 76, 79, 81, 81, 81, null,
      71, 72, 76, 79, 81, 81, 81, 83, 84, 83, 81, 79, 77, 77, 77, 79,
      79, null, null, null
    ]
  },
  {
    name: "Stand by Me (Ben E. King)",
    bpm: 112,
    chords: ["A", "A", "F# Minor", "F# Minor", "D", "E", "A", "A"],
    melody: [
      73, 73, 73, 71, 69, 66, 69, 73, 66, 66, 66, 64, 62, 61, 62, 66,
      66, 66, 68, 69, 71, 71, 73, 71, 69, null, null, null, null, null, null, null
    ]
  },
  {
    name: "Autumn Leaves (Jazz)",
    bpm: 96,
    chords: ["A Minor", "D", "G", "C", "F# Minor", "B", "E Minor", "E Minor"],
    melody: [
      76, 78, 79, 84, 83, 81, 79, 78, 74, 76, 78, 83, 81, 79, 78, 76,
      72, 74, 76, 81, 79, 78, 76, 75, 76, null, null, null, null, null, null, null
    ]
  },
  {
    name: "Yesterday (The Beatles)",
    bpm: 84,
    chords: ["F", "E Minor", "A", "D Minor", "Bb", "C", "F"],
    melody: [
      79, 77, 77, null, null, 78, 79, 81, 83, 85, 86, 88, 86, 84, 82, 81,
      79, 82, 81, 79, 77, 79, 81, 79, 77, null, null, null
    ]
  },
  {
    name: "Fly Me to the Moon",
    bpm: 116,
    chords: ["A Minor", "D Minor", "G", "C", "F", "B Minor", "E", "A Minor"],
    melody: [
      84, 83, 81, 79, 77, 79, 81, 84, 83, 81, 79, 77, 76, 77, 79, 83,
      81, 79, 77, 76, 74, 76, 77, 81, 80, 77, 76, 74, 72, null, null, null
    ]
  },
  {
    name: "Moonlight Sonata",
    bpm: 54,
    chords: ["C# Minor", "C# Minor", "A", "F# Minor", "G#", "C# Minor"],
    melody: [
      68, 68, 68, 68, 68, 68, 68, 68, 69, 69, 69, 69, 66, 66, 66, 66,
      68, 68, 68, 67, 61, null, null, null
    ]
  },
  {
    name: "Clair de Lune (Debussy)",
    bpm: 64,
    chords: ["C# Minor", "F# Minor", "G#", "C# Minor", "A", "E", "B"],
    melody: [
      77, 80, 77, 73, 78, 82, 78, 75, 77, 80, 77, 73, 78, 82, 78, 75,
      78, 82, 85, 82, 84, 87, 84, 80, 85, null, null, null
    ]
  }
];

class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.bgGain = null; // Gain node specifically for backing track
    this.activeVoices = new Map();
    this.noiseBuffer = null;
    this.isMuted = false;

    // Sequencer properties
    this.currentSong = null;
    this.sequencerTimer = null;
    this.nextNoteTime = 0.0;
    this.currentBeat = 0; // Ticks 0 to 3 for 4/4 beats
    this.currentChordIndex = -1;
  }

  /**
   * Initializes the AudioContext. Must be called after a user gesture.
   */
  init() {
    if (this.ctx) return;
    
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContextClass();
    
    // Create master gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.5, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    // Create background gain node
    this.bgGain = this.ctx.createGain();
    this.bgGain.gain.setValueAtTime(0.22, this.ctx.currentTime); // Default background volume
    this.bgGain.connect(this.masterGain);
    
    // Generate white noise buffer for SFX & drums
    this.createNoiseBuffer();
  }

  createNoiseBuffer() {
    const bufferSize = this.ctx.sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }

  setVolume(volume) {
    if (!this.ctx) return;
    this.masterGain.gain.setValueAtTime(volume, this.ctx.currentTime);
  }

  setBgVolume(volume) {
    if (!this.ctx || !this.bgGain) return;
    this.bgGain.gain.setValueAtTime(volume, this.ctx.currentTime);
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.5, this.ctx.currentTime);
    }
    return this.isMuted;
  }

  midiNoteToFreq(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  // --- POLYPHONIC ACOUSTIC PIANO SYNTH ---
 
  noteOn(midiNote) {
    if (!this.ctx || this.isMuted) return;
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
 
    if (this.activeVoices.has(midiNote)) {
      this.noteOff(midiNote);
    }
 
    const freq = this.midiNoteToFreq(midiNote);
    const now = this.ctx.currentTime;
 
    // Create a voice gain node to control overall note volume and damper release
    const voiceGain = this.ctx.createGain();
    voiceGain.gain.setValueAtTime(1.0, now);
 
    // Create a dynamic lowpass filter to mimic string damping (loss of high harmonics)
    const voiceFilter = this.ctx.createBiquadFilter();
    voiceFilter.type = "lowpass";
    voiceFilter.Q.setValueAtTime(0.8, now);
    voiceFilter.frequency.setValueAtTime(3200, now);
    voiceFilter.frequency.setTargetAtTime(320, now, 0.22); // Sweet warm sweep
 
    // 1. HAMMER STRIKE TRANSIENT (Noise Burst)
    const hammerSource = this.ctx.createBufferSource();
    hammerSource.buffer = this.noiseBuffer;
    
    const hammerFilter = this.ctx.createBiquadFilter();
    hammerFilter.type = "bandpass";
    hammerFilter.frequency.setValueAtTime(1000, now);
    hammerFilter.Q.setValueAtTime(3.5, now);
 
    const hammerGain = this.ctx.createGain();
    hammerGain.gain.setValueAtTime(0.24, now);
    hammerGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.015);
 
    hammerSource.connect(hammerFilter);
    hammerFilter.connect(hammerGain);
    hammerGain.connect(voiceGain);
 
    // 2. RESONANT PIANO STRINGS (Detuned fundamental oscillators for unison chorusing)
    const osc1 = this.ctx.createOscillator();
    osc1.type = "triangle";
    osc1.frequency.setValueAtTime(freq, now);
    const osc1Gain = this.ctx.createGain();
    osc1Gain.gain.setValueAtTime(0, now);
    osc1Gain.gain.linearRampToValueAtTime(0.18, now + 0.003); // Quick pluck attack
    osc1Gain.gain.setTargetAtTime(0, now + 0.003, 0.85);      // Long acoustic decay
 
    const osc2 = this.ctx.createOscillator();
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(freq * 1.002, now); // Detune string B
    const osc2Gain = this.ctx.createGain();
    osc2Gain.gain.setValueAtTime(0, now);
    osc2Gain.gain.linearRampToValueAtTime(0.14, now + 0.003);
    osc2Gain.gain.setTargetAtTime(0, now + 0.003, 0.72);
 
    // 3. OVERTONE STRINGS (Additive Harmonics with progressively faster decay rates)
    // 2nd Harmonic (2f)
    const osc3 = this.ctx.createOscillator();
    osc3.type = "sine";
    osc3.frequency.setValueAtTime(freq * 2, now);
    const osc3Gain = this.ctx.createGain();
    osc3Gain.gain.setValueAtTime(0, now);
    osc3Gain.gain.linearRampToValueAtTime(0.08, now + 0.002);
    osc3Gain.gain.setTargetAtTime(0, now + 0.002, 0.38);
 
    // 3rd Harmonic (3f)
    const osc4 = this.ctx.createOscillator();
    osc4.type = "sine";
    osc4.frequency.setValueAtTime(freq * 3, now);
    const osc4Gain = this.ctx.createGain();
    osc4Gain.gain.setValueAtTime(0, now);
    osc4Gain.gain.linearRampToValueAtTime(0.05, now + 0.002);
    osc4Gain.gain.setTargetAtTime(0, now + 0.002, 0.22);
 
    // 4th Harmonic (4f)
    const osc5 = this.ctx.createOscillator();
    osc5.type = "sine";
    osc5.frequency.setValueAtTime(freq * 4, now);
    const osc5Gain = this.ctx.createGain();
    osc5Gain.gain.setValueAtTime(0, now);
    osc5Gain.gain.linearRampToValueAtTime(0.03, now + 0.002);
    osc5Gain.gain.setTargetAtTime(0, now + 0.002, 0.1);
 
    // Route string oscillators
    osc1.connect(osc1Gain); osc1Gain.connect(voiceGain);
    osc2.connect(osc2Gain); osc2Gain.connect(voiceGain);
    osc3.connect(osc3Gain); osc3Gain.connect(voiceGain);
    osc4.connect(osc4Gain); osc4Gain.connect(voiceGain);
    osc5.connect(osc5Gain); osc5Gain.connect(voiceGain);
 
    // Voice routing
    voiceGain.connect(voiceFilter);
    voiceFilter.connect(this.masterGain);
 
    // Start all sound components
    hammerSource.start(now);
    osc1.start(now);
    osc2.start(now);
    osc3.start(now);
    osc4.start(now);
    osc5.start(now);
 
    // Keep references to clean up later
    this.activeVoices.set(midiNote, {
      oscs: [osc1, osc2, osc3, osc4, osc5, hammerSource],
      gain: voiceGain,
      filter: voiceFilter,
      startTime: now
    });
  }
 
  noteOff(midiNote) {
    if (!this.ctx || !this.activeVoices.has(midiNote)) return;
 
    const voice = this.activeVoices.get(midiNote);
    this.activeVoices.delete(midiNote);
 
    const now = this.ctx.currentTime;
    const releaseTime = 0.1; // Acoustic damper drop duration
 
    // Damper dampens string vibration
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + releaseTime);
 
    // Dispose of audio nodes after damping is complete
    setTimeout(() => {
      voice.oscs.forEach(osc => {
        try {
          osc.stop();
          osc.disconnect();
        } catch (e) {}
      });
      try {
        voice.gain.disconnect();
        voice.filter.disconnect();
      } catch (e) {}
    }, releaseTime * 1000 + 50);
  }

  // --- BACKGROUND MUSIC SEQUENCER ---

  startSong(songIndex) {
    this.init();
    this.stopSong();
    
    if (songIndex < 0 || songIndex >= SONGS.length) return;

    this.currentSong = SONGS[songIndex];
    this.currentBeat = 0;
    this.currentChordIndex = -1;
    this.nextNoteTime = this.ctx.currentTime + 0.1;

    // Run scheduler clock
    this.scheduler();
  }

  stopSong() {
    if (this.sequencerTimer) {
      clearTimeout(this.sequencerTimer);
      this.sequencerTimer = null;
    }
    this.currentSong = null;
  }

  scheduler() {
    if (!this.currentSong) return;

    // Check if any notes need scheduling
    while (this.nextNoteTime < this.ctx.currentTime + 0.12) {
      this.schedulePlay(this.currentBeat, this.nextNoteTime);
      const secondsPerBeat = 60.0 / this.currentSong.bpm;
      this.nextNoteTime += secondsPerBeat;
      this.currentBeat = (this.currentBeat + 1) % 4; // 4/4 time
    }
    this.sequencerTimer = setTimeout(() => this.scheduler(), 25);
  }

  schedulePlay(beat, time) {
    const secondsPerBeat = 60.0 / this.currentSong.bpm;

    // 1. Trigger chord pads and bass on Beat 0 (duration of chord is 4 beats)
    if (beat === 0) {
      this.currentChordIndex = (this.currentChordIndex + 1) % this.currentSong.chords.length;
      const targetChord = this.currentSong.chords[this.currentChordIndex];
      
      const chordInfo = typeof getChordNotes !== "undefined" ? getChordNotes(targetChord) : null;
      if (chordInfo) {
        // Trigger pad (4 beats) and Bass
        this.playPadChord(chordInfo, time, secondsPerBeat * 4 - 0.05);
        this.playBassNote(chordInfo.rootIndex, time, secondsPerBeat * 4 - 0.05);
      }
    }

    // 2. Play Background Melody Note (Ticked on each beat)
    if (this.currentSong.melody) {
      const cycleLength = this.currentSong.chords.length * 4;
      const absoluteBeat = ((this.currentChordIndex >= 0 ? this.currentChordIndex : 0) * 4 + beat) % cycleLength;
      const melodyNote = this.currentSong.melody[absoluteBeat];
      
      if (melodyNote !== undefined && melodyNote !== null) {
        this.playMelodyNote(melodyNote, time, secondsPerBeat * 0.9);
      }
    }

    // 3. Play backing drums rhythm
    if (beat === 0 || beat === 2) {
      this.playKick(time);
    }
    if (beat === 1 || beat === 3) {
      this.playSnare(time);
    }
  }

  playPadChord(chordInfo, time, duration) {
    const baseOctave = 3;
    const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    
    const midiNotes = chordInfo.notes.map(noteName => {
      const idx = NOTE_NAMES.indexOf(noteName);
      return 12 * (baseOctave + 1) + idx;
    });

    midiNotes.forEach(note => {
      const freq = this.midiNoteToFreq(note);
      
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, time);

      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(800, time);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.06, time + 0.2); // Slow attack
      gain.gain.setValueAtTime(0.06, time + duration - 0.2);
      gain.gain.linearRampToValueAtTime(0, time + duration); // Slow release

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.bgGain);

      osc.start(time);
      osc.stop(time + duration);
    });
  }

  playBassNote(rootIndex, time, duration) {
    const midiNote = 24 + 12 + rootIndex; 
    const freq = this.midiNoteToFreq(midiNote);

    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.1, time + 0.05);
    gain.gain.setTargetAtTime(0.04, time + 0.05, 0.4);
    gain.gain.setValueAtTime(0.04, time + duration - 0.1);
    gain.gain.linearRampToValueAtTime(0, time + duration);

    osc.connect(gain);
    gain.connect(this.bgGain);

    osc.start(time);
    osc.stop(time + duration);
  }

  playMelodyNote(midiNote, time, duration) {
    const freq = this.midiNoteToFreq(midiNote);
    
    // Create lead oscillator (warm sine wave with subtle flute vibrato)
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, time);

    // Pitch vibrato (6Hz frequency LFO)
    const lfo = this.ctx.createOscillator();
    lfo.frequency.setValueAtTime(5.8, time); 
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(3.2, time); // Subtle depth

    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.12, time + 0.04); // Fast attack
    gain.gain.setValueAtTime(0.12, time + duration - 0.08);
    gain.gain.linearRampToValueAtTime(0, time + duration); // Fast decay

    osc.connect(gain);
    gain.connect(this.bgGain);

    lfo.start(time);
    osc.start(time);
    
    lfo.stop(time + duration);
    osc.stop(time + duration);
  }

  playKick(time) {
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.1);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

    osc.connect(gain);
    gain.connect(this.bgGain);

    osc.start(time);
    osc.stop(time + 0.13);
  }

  playSnare(time) {
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1200, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.03, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.06);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgGain);

    source.start(time);
    source.stop(time + 0.07);
  }

  // --- GAME OVER & HUD ARCADE SFX ---

  playSliceSFX() {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.setValueAtTime(5, now);
    filter.frequency.setValueAtTime(3500, now);
    filter.frequency.exponentialRampToValueAtTime(300, now + 0.12);

    const sfxGain = this.ctx.createGain();
    sfxGain.gain.setValueAtTime(0.4, now);
    sfxGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    noiseSource.connect(filter);
    filter.connect(sfxGain);
    sfxGain.connect(this.masterGain);

    noiseSource.start(now);
    noiseSource.stop(now + 0.18);
  }

  playSplashSFX() {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;

    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(1500, now);

    const sfxGain = this.ctx.createGain();
    sfxGain.gain.setValueAtTime(0.2, now);
    sfxGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    noiseSource.connect(filter);
    filter.connect(sfxGain);
    sfxGain.connect(this.masterGain);

    noiseSource.start(now);
    noiseSource.stop(now + 0.1);
  }

  playChordCorrectSFX() {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    
    const pitches = [1046.5, 1318.51, 1567.98, 1975.53];
    const chimeGain = this.ctx.createGain();
    chimeGain.gain.setValueAtTime(0.12, now);
    chimeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);

    const delay = this.ctx.createDelay();
    delay.delayTime.setValueAtTime(0.15, now);
    const feedback = this.ctx.createGain();
    feedback.gain.setValueAtTime(0.35, now);

    chimeGain.connect(this.masterGain);
    chimeGain.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    feedback.connect(this.masterGain);

    pitches.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + idx * 0.02);
      
      const oscGain = this.ctx.createGain();
      oscGain.gain.setValueAtTime(0.15, now);
      oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
      
      osc.connect(oscGain);
      oscGain.connect(chimeGain);
      
      osc.start(now);
      osc.stop(now + 0.9);
    });
  }

  playComboSFX() {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const frequencies = [523.25, 659.25, 783.99, 1046.5];
    
    frequencies.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);

      const oscGain = this.ctx.createGain();
      oscGain.gain.setValueAtTime(0.15, now + idx * 0.08);
      oscGain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.35);

      osc.connect(oscGain);
      oscGain.connect(this.masterGain);

      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.4);
    });
  }

  playGameOverSFX() {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const frequencies = [392.00, 311.13, 261.63];
    
    frequencies.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, now + idx * 0.15);
      osc.frequency.linearRampToValueAtTime(freq * 0.85, now + idx * 0.15 + 1.2);

      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(800, now);
      filter.frequency.exponentialRampToValueAtTime(100, now + 1.5);

      const oscGain = this.ctx.createGain();
      oscGain.gain.setValueAtTime(0.18, now + idx * 0.15);
      oscGain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.15 + 1.2);

      osc.connect(filter);
      filter.connect(oscGain);
      oscGain.connect(this.masterGain);

      osc.start(now + idx * 0.15);
      osc.stop(now + idx * 0.15 + 1.3);
    });
  }
}

const audioManager = new AudioManager();
if (typeof module !== 'undefined' && module.exports) {
  module.exports = audioManager;
}
