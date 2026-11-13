/**
 * Keystone Grade Benchmark (ADR-061). Keystone's own description of what each level
 * usually looks like, across four pillars. It is a teaching guide, not any exam board's
 * syllabus: no board text, technical lists or piece lists are copied here (those wait on
 * legal advice). Tempo and length figures are typical ranges, not board rules.
 *
 * Courses store the level id and BENCHMARK_VERSION, so editing this file does not change
 * what an existing family sees until the teacher starts a new course.
 */
import type { Framework } from "@/mocks/types";

export const BENCHMARK_VERSION = "2026-11";

export type PillarId = "repertoire" | "technical" | "theory" | "aural";
export type BenchmarkItemKind = "piece" | "technical" | "checklist";

export const PILLARS: { id: PillarId; name: string; weightPct: number; kind: BenchmarkItemKind }[] = [
  { id: "repertoire", name: "Repertoire", weightPct: 40, kind: "piece" },
  { id: "technical", name: "Technical work", weightPct: 20, kind: "technical" },
  { id: "theory", name: "Theory and reading", weightPct: 20, kind: "checklist" },
  { id: "aural", name: "Ear, sight-reading and pedal", weightPct: 20, kind: "checklist" },
];

export type BenchmarkLevelId =
  | "foundation"
  | "grade-1"
  | "grade-2"
  | "grade-3"
  | "grade-4"
  | "grade-5"
  | "grade-6"
  | "grade-7"
  | "grade-8";

export type BenchmarkLevel = {
  id: BenchmarkLevelId;
  label: string;
  stage: string;
  pieces: number;
  practiceMinPerDay: [number, number];
  pillars: Record<PillarId, { summary: string; items: string[] }>;
};

export const BENCHMARK_LEVELS: BenchmarkLevel[] = [
  {
    id: "foundation",
    label: "Foundation",
    stage: "Beginner (also called Preliminary or Initial)",
    pieces: 3,
    practiceMinPerDay: [10, 15],
    pillars: {
      repertoire: {
        summary: "Short pieces of about 8 to 16 bars. Single-line melodies moving towards simple hands together, with the hands staying in one position.",
        items: [],
      },
      technical: {
        summary: "Five-finger patterns and one-octave major scales, hands separately then together, plus simple triads.",
        items: ["Five-finger patterns", "C major scale, 1 octave", "G major scale, 1 octave", "D major scale, 1 octave", "F major scale, 1 octave", "Simple triads"],
      },
      theory: {
        summary: "Finding notes on the grand staff, the main note values, 4/4 and 3/4 time, and soft and loud.",
        items: ["Grand staff note names", "Crotchets, minims, semibreves and quavers", "4/4 and 3/4 time", "p and f dynamics"],
      },
      aural: {
        summary: "Clapping simple rhythms and hearing high and low. Little or no pedal yet.",
        items: ["Claps back a simple rhythm", "Hears high and low", "Reads a short line at sight"],
      },
    },
  },
  {
    id: "grade-1",
    label: "Grade 1",
    stage: "Elementary",
    pieces: 3,
    practiceMinPerDay: [15, 20],
    pillars: {
      repertoire: {
        summary: "Pieces of about one page (16 to 28 bars). Thumb-under passages and a melody over a simple accompaniment.",
        items: [],
      },
      technical: {
        summary: "Major and minor scales over one to two octaves in keys with up to one or two sharps or flats, hands together, plus broken chords and contrary motion.",
        items: ["Major scales, hands together", "Minor scales, hands together", "Broken chords", "Contrary-motion scale"],
      },
      theory: {
        summary: "Semiquavers, dotted rhythms and ties; staccato and legato; crescendo and diminuendo; keys up to two sharps or flats.",
        items: ["Semiquavers and dotted rhythms", "Ties", "Staccato and legato", "Crescendo and diminuendo", "Keys up to 2 sharps or flats"],
      },
      aural: {
        summary: "Simple pedalling, sight-reading 4 to 8 bars in a five-finger position, and singing back short intervals.",
        items: ["Simple direct pedalling", "Sight-reads 4 to 8 bars", "Sings back a short interval"],
      },
    },
  },
  {
    id: "grade-2",
    label: "Grade 2",
    stage: "Late elementary",
    pieces: 3,
    practiceMinPerDay: [20, 25],
    pillars: {
      repertoire: {
        summary: "Pieces of one to two pages. The melody sings over the accompaniment, with syncopation, swing rhythms and hand crossing.",
        items: [],
      },
      technical: {
        summary: "Two-octave scales in keys with up to two or three sharps or flats, arpeggios, and a chromatic scale.",
        items: ["Major scales, 2 octaves", "Minor scales, 2 octaves", "Arpeggios", "Chromatic scale"],
      },
      theory: {
        summary: "6/8 time, the primary triads (I, IV, V) and their inversions, and tempo changes such as ritenuto and a tempo.",
        items: ["6/8 time", "Primary triads I, IV and V", "Triad inversions", "Tempo change markings"],
      },
      aural: {
        summary: "Legato (overlapping) pedalling and hearing whether a chord is major or minor.",
        items: ["Legato pedalling", "Hears major or minor chords", "Sight-reads with hands together"],
      },
    },
  },
  {
    id: "grade-3",
    label: "Grade 3",
    stage: "Early intermediate",
    pieces: 3,
    practiceMinPerDay: [30, 30],
    pillars: {
      repertoire: {
        summary: "Pieces of about two pages, such as Classical sonatinas, with wider left-hand leaps and two-voice playing.",
        items: [],
      },
      technical: {
        summary: "Scales over two to four octaves in keys with up to three or four sharps or flats, hands-together arpeggios over two octaves, and legato thirds in one hand.",
        items: ["Major scales, hands together", "Minor scales, hands together", "Arpeggios, 2 octaves hands together", "Legato thirds"],
      },
      theory: {
        summary: "Keys up to four sharps or flats, ornaments (trills, mordents, grace notes), and binary and ternary form.",
        items: ["Keys up to 4 sharps or flats", "Ornaments", "Binary and ternary form"],
      },
      aural: {
        summary: "Pedalling by ear for a clear sound, and sight-reading with key signatures and position shifts.",
        items: ["Pedals by ear", "Sight-reads with a key signature", "Sight-reads with position shifts"],
      },
    },
  },
  {
    id: "grade-4",
    label: "Grade 4",
    stage: "Intermediate",
    pieces: 3,
    practiceMinPerDay: [30, 45],
    pillars: {
      repertoire: {
        summary: "Pieces of two to three pages: early Baroque preludes, Romantic character pieces and contemporary syncopated styles.",
        items: [],
      },
      technical: {
        summary: "Four-octave scales and arpeggios and dominant 7th chords, at faster tempos (typically about 88 to 104 beats a minute).",
        items: ["Major scales, 4 octaves", "Minor scales, 4 octaves", "Arpeggios, 4 octaves", "Dominant 7th chords"],
      },
      theory: {
        summary: "Double sharps and flats, the four main cadences, and changing to the relative key.",
        items: ["Double sharps and flats", "Perfect, plagal, imperfect and interrupted cadences", "Modulation to the relative key"],
      },
      aural: {
        summary: "Expressive rubato, pedalling for tone colour, and hearing intervals up to an octave and cadences.",
        items: ["Expressive rubato", "Pedals for tone colour", "Hears intervals up to an octave", "Hears cadences"],
      },
    },
  },
  {
    id: "grade-5",
    label: "Grade 5",
    stage: "Upper intermediate",
    pieces: 3,
    practiceMinPerDay: [45, 45],
    pillars: {
      repertoire: {
        summary: "Pieces of two to four pages, such as two-part inventions, first movements of Classical sonatas, and Romantic waltzes and preludes.",
        items: [],
      },
      technical: {
        summary: "Scales and arpeggios in all 12 major and minor keys over four octaves, diminished 7ths, staccato scales, and scales in thirds or sixths.",
        items: ["All major scales", "All minor scales", "All arpeggios", "Diminished 7ths", "Staccato scales", "Scales in thirds or sixths"],
      },
      theory: {
        summary: "Theory at Grade 5 level. Some exam boards need a Grade 5 theory or musicianship result before the higher practical grades, so check your board's current rules.",
        items: ["Grade 5 theory topics", "Theory worksheet or exam done"],
      },
      aural: {
        summary: "Bringing out inner voices, fluent sight-reading in keys with three or four sharps or flats, and secure rhythm subdivision.",
        items: ["Brings out inner voices", "Sight-reads in 3 to 4 sharps or flats", "Secure rhythm subdivision"],
      },
    },
  },
  ...(["grade-6", "grade-7", "grade-8"] as const).map((id, index): BenchmarkLevel => ({
    id,
    label: `Grade ${6 + index}`,
    stage: "Advanced",
    pieces: index === 2 ? 4 : 3,
    practiceMinPerDay: index === 0 ? [60, 75] : index === 1 ? [60, 90] : [75, 90],
    pillars: {
      repertoire: {
        summary: [
          "Pieces of four pages or more: preludes and fugues, full sonata movements, Impressionist works and concert studies.",
          "A longer program of contrasting periods, with fugues, sonatas and concert studies played with stylistic confidence.",
          "A full recital-length program across Baroque, Classical, Romantic and 20th/21st-century styles, ready for diploma work.",
        ][index]!,
        items: [],
      },
      technical: {
        summary: "Fast scales, octaves, double thirds, polyrhythms (3 against 2, 4 against 3) and the stamina for a full program.",
        items: ["Fast scales", "Octaves", "Double thirds", "Polyrhythms", "Program stamina"],
      },
      theory: {
        summary: "Harmonic analysis, counterpoint and a clear sense of each period's style.",
        items: ["Harmonic analysis", "Counterpoint", "Period style"],
      },
      aural: {
        summary: "Half-pedalling and una corda, stage presence, and an authentic sense of style.",
        items: ["Half-pedalling", "Una corda", "Stage presence", "Fluent sight-reading"],
      },
    },
  })),
];

/** Pathways change the repertoire slot labels only; the benchmark text stays Keystone's. */
export type BenchmarkPathway = "recreational" | "AMEB" | "ABRSM" | "Trinity";
export const PATHWAYS: { id: BenchmarkPathway; label: string; framework: Framework }[] = [
  { id: "recreational", label: "Studio custom / recreational", framework: "Custom" },
  { id: "AMEB", label: "AMEB", framework: "AMEB" },
  { id: "ABRSM", label: "ABRSM", framework: "ABRSM" },
  { id: "Trinity", label: "Trinity", framework: "Trinity" },
];

export function repertoireSlotLabels(pathway: BenchmarkPathway, pieces: number): string[] {
  return Array.from({ length: pieces }, (_, i) =>
    pathway === "recreational" ? `Piece ${i + 1}` : pathway === "Trinity" ? `Piece ${i + 1}` : `List ${String.fromCharCode(65 + i)}`,
  );
}

export function benchmarkLevel(id: string | undefined): BenchmarkLevel | undefined {
  return BENCHMARK_LEVELS.find((level) => level.id === id);
}

/** Matches a free-text grade ("Grade 2", "AMEB Grade 2", "Preliminary") to a level. */
export function benchmarkLevelForGrade(grade: string | undefined): BenchmarkLevel | undefined {
  if (!grade) return undefined;
  const match = grade.match(/grade\s*(\d)/i);
  if (match) return benchmarkLevel(`grade-${match[1]}`);
  return /prelim|foundation|initial|prep|beginner/i.test(grade) ? benchmarkLevel("foundation") : undefined;
}
