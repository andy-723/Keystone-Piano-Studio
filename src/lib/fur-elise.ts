/**
 * Für Elise (Beethoven, WoO 59, 1810), opening A–A–B–A section, written out as note data.
 * The composition is in the public domain; this arrangement is our own and is played by the
 * browser's Web Audio synth (src/lib/login-music.ts), so no recording is shipped or licensed.
 *
 * Notation: one token per note, space separated. `E5` = a sixteenth note, `A4.2` = two
 * sixteenths, `r` / `r.3` = rests. Each bar of 3/8 is six sixteenths.
 */

export type MusicEvent = {
  /** Start, in sixteenth notes from the top of the loop. */
  at: number;
  midi: number;
  /** Written length, in sixteenths. */
  length: number;
  hand: "right" | "left";
};

const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function noteToMidi(name: string): number {
  const match = /^([A-G])(#?)(-?\d)$/.exec(name);
  if (!match) throw new Error(`Bad note name: ${name}`);
  const [, letter = "", sharp, octave] = match;
  return 12 * (Number(octave) + 1) + (NOTE_INDEX[letter] ?? 0) + (sharp ? 1 : 0);
}

function parseVoice(
  bars: string[],
  hand: MusicEvent["hand"],
): { events: MusicEvent[]; length: number } {
  const events: MusicEvent[] = [];
  let at = 0;
  for (const token of bars.join(" ").split(/\s+/).filter(Boolean)) {
    const [name = "", len] = token.split(".");
    const length = len ? Number(len) : 1;
    if (name !== "r") events.push({ at, midi: noteToMidi(name), length, hand });
    at += length;
  }
  return { events, length: at };
}

// ---- Right hand -------------------------------------------------------------------------
const RH_PICKUP = ["E5 D#5"];
const RH_A = [
  "E5 D#5 E5 B4 D5 C5",
  "A4.2 r C4 E4 A4",
  "B4.2 r E4 G#4 B4",
  "C5.2 r E4 E5 D#5",
  "E5 D#5 E5 B4 D5 C5",
  "A4.2 r C4 E4 A4",
  "B4.2 r E4 C5 B4",
];
const RH_ENDING_1 = ["A4.2 r.2 E5 D#5"];
const RH_ENDING_2 = ["A4.2 r B4 C5 D5"];
const RH_B = [
  "E5.3 G4 F5 E5",
  "D5.3 F4 E5 D5",
  "C5.3 E4 D5 C5",
  "B4.2 r E4 E5 r",
  "r E5 E6 r r D#5",
  "E5 r r D#5 E5 D#5",
  "E5 D#5 E5 D#5 E5 D#5",
];
const RH_FINAL = ["A4.2 r.2"];

// ---- Left hand (broken chords under each bar) -------------------------------------------
const AM = "A2 E3 A3 r.3";
const E7 = "E2 E3 G#3 r.3";
const LH_PICKUP = ["r.2"];
const LH_A = ["r.6", AM, E7, AM, "r.6", AM, E7];
const LH_ENDING_1 = [AM];
const LH_ENDING_2 = [AM];
const LH_B = ["C3 G3 C4 r.3", "G2 G3 B3 r.3", AM, "E2 E3 E4 r.3", "r.6", "r.6", "r.6"];
const LH_FINAL = ["A2 E3 A3 r"];

const right = parseVoice(
  [...RH_PICKUP, ...RH_A, ...RH_ENDING_1, ...RH_A, ...RH_ENDING_2, ...RH_B, ...RH_A, ...RH_FINAL],
  "right",
);
const left = parseVoice(
  [...LH_PICKUP, ...LH_A, ...LH_ENDING_1, ...LH_A, ...LH_ENDING_2, ...LH_B, ...LH_A, ...LH_FINAL],
  "left",
);

if (right.length !== left.length) {
  throw new Error(`Für Elise voices out of step: right ${right.length}, left ${left.length}`);
}

/** All notes of one loop, sorted by start time. */
export const FUR_ELISE: readonly MusicEvent[] = [...right.events, ...left.events].sort(
  (a, b) => a.at - b.at || a.midi - b.midi,
);

/** Loop length in sixteenths; the loop ends where the pickup starts again. */
export const FUR_ELISE_LENGTH = right.length;

/** Seconds per sixteenth note (about 59 dotted-quarter beats a minute, "poco moto"). */
export const FUR_ELISE_SIXTEENTH_SECONDS = 0.17;
