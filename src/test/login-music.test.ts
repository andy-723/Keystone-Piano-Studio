import { describe, expect, it } from "vitest";
import { FUR_ELISE, FUR_ELISE_LENGTH, noteToMidi } from "@/lib/fur-elise";
import {
  LOGIN_MUSIC_DEFAULT_ON,
  LOGIN_MUSIC_STORAGE_KEY,
  midiToFrequency,
  readMusicPreference,
  writeMusicPreference,
} from "@/lib/login-music";

describe("Für Elise note data", () => {
  it("parses note names to MIDI numbers", () => {
    expect(noteToMidi("A4")).toBe(69);
    expect(noteToMidi("E5")).toBe(76);
    expect(noteToMidi("D#5")).toBe(75);
    expect(noteToMidi("A2")).toBe(45);
    expect(() => noteToMidi("H4")).toThrow();
  });

  it("opens with the famous E–D#–E–D#–E–B–D–C–A", () => {
    const melody = FUR_ELISE.filter((e) => e.hand === "right")
      .slice(0, 9)
      .map((e) => e.midi);
    expect(melody).toEqual(
      ["E5", "D#5", "E5", "D#5", "E5", "B4", "D5", "C5", "A4"].map(noteToMidi),
    );
  });

  it("is sorted, inside the loop and in piano range", () => {
    expect(FUR_ELISE.length).toBeGreaterThan(100);
    const starts = FUR_ELISE.map((e) => e.at);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    for (const e of FUR_ELISE) {
      expect(e.at).toBeLessThan(FUR_ELISE_LENGTH);
      expect(e.midi).toBeGreaterThanOrEqual(21);
      expect(e.midi).toBeLessThanOrEqual(108);
    }
    // Bars of 3/8 are six sixteenths; the short final bar plus the pickup make a whole bar.
    expect(FUR_ELISE_LENGTH % 6).toBe(0);
  });

  it("converts MIDI to concert pitch", () => {
    expect(midiToFrequency(69)).toBeCloseTo(440);
    expect(midiToFrequency(81)).toBeCloseTo(880);
  });
});

describe("login music preference", () => {
  it("defaults to the studio setting when nothing is stored", () => {
    localStorage.removeItem(LOGIN_MUSIC_STORAGE_KEY);
    expect(readMusicPreference()).toBe(LOGIN_MUSIC_DEFAULT_ON);
  });

  it("remembers mute and unmute", () => {
    writeMusicPreference(false);
    expect(readMusicPreference()).toBe(false);
    writeMusicPreference(true);
    expect(readMusicPreference()).toBe(true);
    localStorage.removeItem(LOGIN_MUSIC_STORAGE_KEY);
  });
});
