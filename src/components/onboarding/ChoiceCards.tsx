import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export type ChoiceOption = { key: string; letter: string; label: string };

export function ChoiceCards({
  options,
  value,
  onSelect,
  autoAdvanceMs = 400,
}: {
  options: ChoiceOption[];
  value?: string | undefined;
  onSelect: (key: string) => void;
  autoAdvanceMs?: number | undefined;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const match = options.find(
        (option) => option.letter.toLowerCase() === event.key.toLowerCase(),
      );
      if (match) onSelect(match.key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [options, onSelect]);

  return (
    <div className="grid gap-3" role="listbox">
      {options.map((option) => (
        <Button
          key={option.key}
          type="button"
          role="option"
          aria-selected={value === option.key}
          variant={value === option.key ? "default" : "outline"}
          className="min-h-16 justify-start gap-4 whitespace-normal px-4 text-left text-lg"
          onClick={() => {
            onSelect(option.key);
            if (autoAdvanceMs > 0) {
              window.setTimeout(() => {
                /* parent advances on value change */
              }, autoAdvanceMs);
            }
          }}
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-current text-base font-semibold">
            {option.letter}
          </span>
          <span>{option.label}</span>
        </Button>
      ))}
    </div>
  );
}
