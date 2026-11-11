import type { ReactNode } from "react";

/** Decorative hardware only; the live screen retains its own controls. */
export function LaptopFrame({ children }: { children: ReactNode }) {
  return (
    <div className="mk-laptop w-full max-w-5xl" data-device="laptop">
      <div className="mk-laptop-lid mk-device">
        <div className="mk-laptop-camera" aria-hidden="true"><span /></div>
        <div className="mk-laptop-display">{children}</div>
        <div className="mk-laptop-chin" aria-hidden="true" />
      </div>
      <div className="mk-laptop-hinge" aria-hidden="true" />
      <div className="mk-laptop-deck" aria-hidden="true">
        <div className="mk-laptop-keyboard">
          {Array.from({ length: 3 }, (_, row) => (
            <div key={row} className="mk-laptop-key-row">
              {Array.from({ length: 14 }, (_, key) => <span key={key} />)}
            </div>
          ))}
          <div className="mk-laptop-key-row mk-laptop-space-row"><span /><span /><span /><span /><span /></div>
        </div>
        <div className="mk-laptop-trackpad" />
      </div>
      <div className="mk-laptop-edge" aria-hidden="true"><span /></div>
    </div>
  );
}