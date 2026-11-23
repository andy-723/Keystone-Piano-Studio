import { useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { lessonPricesQuery } from "@/lib/billing-queries";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { lessonPricesProblem, setLessonPrices } from "@/services/roster";
import type { LessonType } from "@/mocks/types";


type Row = { key: string; id?: string; minutes: string; dollars: string };

const toRows = (types: LessonType[]): Row[] =>
  types.map((type) => ({
    key: type.id,
    id: type.id,
    minutes: String(type.durationMin),
    dollars: type.priceCents ? (type.priceCents / 100).toFixed(2) : "",
  }));

/**
 * The studio's price per lesson length (real studios). Bill next term prices each student's
 * weekly lesson by its length in the calendar.
 */
export function LessonPrices() {
  const { data } = useSuspenseQuery(lessonPricesQuery);
  const [rows, setRows] = useState<Row[]>(() => toRows(data));
  const client = useQueryClient();
  const parsed = rows.map((row) => ({
    ...(row.id ? { id: row.id } : {}),
    durationMin: Number(row.minutes),
    priceCents: Math.round(Number(row.dollars || "0") * 100),
  }));
  const problem = lessonPricesProblem(parsed);
  const save = useMutation({
    mutationFn: () => setLessonPrices(parsed),
    onSuccess: async (saved) => {
      setRows(toRows(saved));
      await Promise.all([
        client.invalidateQueries({ queryKey: ["lesson-prices"] }),
        client.invalidateQueries({ queryKey: ["live-term-billing"] }),
      ]);
      toast.success("Lesson prices saved");
    },
    onError: (error: Error) => toast.error(error.message || "Lesson prices could not be saved."),
  });
  const set = (key: string, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  return (
    <section
      className="border-b border-border py-6"
      id="lesson-prices"
      aria-labelledby="lesson-prices-title"
    >
      <h2 id="lesson-prices-title" className="text-2xl font-semibold">
        Lesson prices
      </h2>
      <p className="mt-2 text-base text-muted-foreground">
        The price of one lesson of each length. Bill next term uses the length of each student's
        weekly lesson in your calendar.
      </p>
      <form
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!problem && !save.isPending) save.mutate();
        }}
      >
        {rows.map((row) => (
          <div key={row.key} className="flex flex-wrap items-end gap-3">
            <label className="block text-base">
              Minutes
              <input
                type="number"
                inputMode="numeric"
                min={10}
                max={240}
                value={row.minutes}
                onChange={(event) => set(row.key, { minutes: event.target.value })}
                className="mt-1 block min-h-12 w-28 rounded-md border border-input bg-card px-3 text-lg"
              />
            </label>
            <label className="block text-base">
              Price per lesson (A$)
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={2000}
                step="0.01"
                value={row.dollars}
                placeholder="0.00"
                onChange={(event) => set(row.key, { dollars: event.target.value })}
                className="mt-1 block min-h-12 w-40 rounded-md border border-input bg-card px-3 text-lg"
              />
            </label>
            <Button
              type="button"
              variant="ghost"
              aria-label={`Remove ${row.minutes || "this"} minute lesson`}
              disabled={rows.length === 1}
              onClick={() => setRows((current) => current.filter((entry) => entry.key !== row.key))}
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setRows((current) => [
                ...current,
                { key: crypto.randomUUID(), minutes: "", dollars: "" },
              ])
            }
          >
            <Plus aria-hidden /> Add a lesson length
          </Button>
          <Button type="submit" disabled={Boolean(problem) || save.isPending}>
            {save.isPending ? "Saving…" : "Save prices"}
          </Button>
        </div>
        {problem && rows.every((row) => row.minutes) && (
          <p className="text-base text-destructive">{problem}</p>
        )}
      </form>
    </section>
  );
}
