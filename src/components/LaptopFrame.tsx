import type { ReactNode } from "react";

/** Decorative hardware only; the live screen retains its own controls. */
export function LaptopFrame({ children }: { children: ReactNode }) {
  return (
    <div className="mk-laptop w-full max-w-5xl" data-device="laptop">
      <div className="mk-laptop-lid mk-device">
        <div className="mk-laptop-camera" aria-hidden="true">
          <span />
        </div>
        <div className="mk-laptop-display">{children}</div>
        <div className="mk-laptop-chin" aria-hidden="true" />
      </div>
      <div className="mk-laptop-hinge" aria-hidden="true" />
      <div className="mk-laptop-deck" aria-hidden="true">
        <span />
      </div>
      <div className="mk-laptop-edge" aria-hidden="true">
        <span />
      </div>
    </div>
  );
}
