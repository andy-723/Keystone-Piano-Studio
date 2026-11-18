import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  addressDetailsFn,
  searchAddressFn,
  type AddressDetails,
  type AddressSuggestion,
} from "@/server/address-search";

function newSessionToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Text box that suggests Australian addresses and suburbs as you type.
 * Falls back to a plain text box when the server has no Places key or the lookup fails,
 * so the owner can always type the address by hand.
 */
export function AddressAutocomplete({
  value,
  onChange,
  onPick,
  onBlur,
  className,
  autoFocus,
  id,
  placeholder = "Start typing your street address or suburb",
}: {
  value: string;
  onChange: (value: string) => void;
  onPick?: (details: AddressDetails) => void;
  onBlur?: (value: string) => void;
  className?: string;
  autoFocus?: boolean;
  id?: string;
  placeholder?: string;
}) {
  const listId = useId();
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [enabled, setEnabled] = useState(true);
  const session = useRef(newSessionToken());
  const typed = useRef(false);
  const latest = useRef(0);

  useEffect(() => {
    if (!enabled || !typed.current) return;
    const query = value.trim();
    if (query.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const request = ++latest.current;
    const timer = setTimeout(() => {
      searchAddressFn({ data: { query, sessionToken: session.current } })
        .then((result) => {
          if (request !== latest.current) return;
          if (!result.enabled) {
            setEnabled(false);
            setOpen(false);
            return;
          }
          setSuggestions(result.suggestions);
          setActive(-1);
          setOpen(result.suggestions.length > 0);
        })
        .catch(() => {
          if (request === latest.current) setOpen(false);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [value, enabled]);

  const pick = async (suggestion: AddressSuggestion) => {
    typed.current = false;
    setOpen(false);
    onChange(suggestion.label);
    try {
      const details = await addressDetailsFn({
        data: { placeId: suggestion.placeId, sessionToken: session.current },
      });
      if (details) {
        onChange(details.formatted);
        onPick?.(details);
      }
    } finally {
      session.current = newSessionToken();
    }
  };

  return (
    <div className="relative">
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        className={className}
        value={value}
        placeholder={enabled ? placeholder : undefined}
        autoFocus={autoFocus}
        onChange={(event) => {
          typed.current = true;
          onChange(event.target.value);
        }}
        onBlur={(event) => {
          // Leave time for a click on a suggestion to land first.
          const current = event.target.value;
          setTimeout(() => setOpen(false), 150);
          onBlur?.(current);
        }}
        onKeyDown={(event) => {
          if (!open || suggestions.length === 0) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((index) => (index + 1) % suggestions.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
          } else if (event.key === "Enter" && active >= 0) {
            event.preventDefault();
            void pick(suggestions[active]!);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-md border border-border bg-card shadow-lg"
        >
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.placeId}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={`cursor-pointer px-4 py-3 text-base ${index === active ? "bg-muted" : ""}`}
              onMouseDown={(event) => {
                event.preventDefault();
                void pick(suggestion);
              }}
            >
              <span className="font-semibold">{suggestion.main}</span>
              {suggestion.secondary && (
                <span className="ml-2 text-muted-foreground">{suggestion.secondary}</span>
              )}
            </li>
          ))}
          <li className="px-4 py-2 text-xs text-muted-foreground" aria-hidden>
            Address suggestions by Google
          </li>
        </ul>
      )}
    </div>
  );
}
