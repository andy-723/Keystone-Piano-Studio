import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { FAMILY_TOUR, SETUP_TOUR, STUDIO_TOUR, tourControl, type TourStep } from "@/lib/tour-steps";
import { getTourProgress, saveTourProgress, tourStorageKey } from "@/services/tour";
import { TourHelpButton, TourProvider } from "@/components/tour/Tour";
import { setSiteLang } from "@/i18n/marketing/site-lang";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "test" ? [] : sourceFiles(path);
    return /\.(tsx?|jsx?)$/.test(name) ? [path] : [];
  });
}

beforeEach(() => {
  window.localStorage.clear();
  setSiteLang("en");
});
afterEach(cleanup);

describe("tour steps", () => {
  it.each([
    ["studio", STUDIO_TOUR],
    ["family", FAMILY_TOUR],
    ["setup", SETUP_TOUR],
  ] as const)("%s tour has unique ids and a short length", (_name, steps) => {
    expect(new Set(steps.map((s) => s.id)).size).toBe(steps.length);
    expect(steps.length).toBeLessThanOrEqual(12);
  });

  it("family and setup tours close with a centred card; the family tour also opens with one", () => {
    expect(FAMILY_TOUR[0]?.target).toBeNull();
    expect(FAMILY_TOUR.at(-1)?.target).toBeNull();
    expect(SETUP_TOUR.at(-1)?.target).toBeNull();
  });

  it("studio tour follows the owner's setup order and ends back on studio details with a setup offer", () => {
    expect(STUDIO_TOUR[0]?.target).toBeNull();
    expect(STUDIO_TOUR.map((s) => s.id)).toEqual([
      "welcome",
      "details",
      "terms",
      "privacy",
      "payments",
      "invoices",
      "enrol",
      "courses",
      "news",
      "chat",
      "offer-setup",
    ]);
    const last = STUDIO_TOUR.at(-1);
    expect(last?.target).toBe(STUDIO_TOUR[1]?.target);
    expect(last?.offer?.starts).toBe("setup");
    expect(STUDIO_TOUR.slice(0, -1).every((s) => !s.offer)).toBe(true);
  });

  it("every highlighted element exists as a data-tour attribute in the app", () => {
    const all = sourceFiles(join(process.cwd(), "src"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    const portal = readFileSync(join(process.cwd(), "src/components/ParentPortal.tsx"), "utf8");
    for (const step of [...STUDIO_TOUR, ...FAMILY_TOUR, ...SETUP_TOUR]) {
      if (!step.target) continue;
      if (step.target.startsWith("family-tab-")) {
        expect(portal).toContain("data-tour={`family-tab-${key}`}");
        expect(portal).toContain(`key: "${step.target.replace("family-tab-", "")}"`);
      } else {
        expect(all, `missing data-tour="${step.target}"`).toContain(`data-tour="${step.target}"`);
      }
    }
  });

  it("family, studio and setup tours are bilingual and studio steps name a route", () => {
    for (const step of [...FAMILY_TOUR, ...STUDIO_TOUR, ...SETUP_TOUR]) {
      expect(step.title["zh-CN"], `${step.id} zh title`).toBeTruthy();
      expect(step.body["zh-CN"], `${step.id} zh body`).toBeTruthy();
      expect(step.title.vi, `${step.id} vi title`).toBeTruthy();
      expect(step.body.vi, `${step.id} vi body`).toBeTruthy();
    }
    const offer = STUDIO_TOUR.at(-1)?.offer;
    expect(offer?.accept["zh-CN"]).toBeTruthy();
    expect(offer?.decline.vi).toBeTruthy();
    for (const step of [...STUDIO_TOUR, ...SETUP_TOUR])
      if (step.target) expect(step.route, step.id).toMatch(/^\//);
    expect(tourControl("stepOf", "zh-CN", { n: 2, total: 8 })).toBe("第 2 步，共 8 步");
    expect(tourControl("start", "zh-CN")).toBe("开始导览");
    expect(tourControl("start", "vi")).toBe("Bắt đầu hướng dẫn");
  });
});

describe("tour progress service", () => {
  it("defaults to not started and round-trips", async () => {
    expect(await getTourProgress("studio")).toEqual({ stepIndex: 0, status: "not_started" });
    await saveTourProgress("studio", { stepIndex: 3, status: "in_progress" });
    expect(await getTourProgress("studio")).toEqual({ stepIndex: 3, status: "in_progress" });
    expect(await getTourProgress("family")).toEqual({ stepIndex: 0, status: "not_started" });
  });

  it("ignores corrupt storage and rejects bad values", async () => {
    window.localStorage.setItem(tourStorageKey("family"), "{not json");
    expect(await getTourProgress("family")).toEqual({ stepIndex: 0, status: "not_started" });
    await expect(
      saveTourProgress("family", { stepIndex: -1, status: "in_progress" }),
    ).rejects.toThrow();
    // @ts-expect-error invalid status on purpose
    await expect(saveTourProgress("family", { stepIndex: 0, status: "done" })).rejects.toThrow();
  });
});

const STEPS: TourStep[] = [
  { id: "welcome", target: null, title: { en: "Welcome" }, body: { en: "Hello" } },
  {
    id: "present",
    target: "present-thing",
    route: "/a",
    title: { en: "Present" },
    body: { en: "Here" },
  },
  {
    id: "missing",
    target: "missing-thing",
    route: "/b",
    title: { en: "Missing" },
    body: { en: "Gone" },
  },
  { id: "done", target: null, title: { en: "Done" }, body: { en: "Bye" } },
];

function renderTour(onStep = vi.fn()) {
  render(
    <TourProvider tourId="studio" steps={STEPS} onStep={onStep}>
      <button type="button" data-tour="present-thing" style={{ width: 10, height: 10 }}>
        Thing
      </button>
      <TourHelpButton />
    </TourProvider>,
  );
  return onStep;
}

describe("TourProvider", () => {
  beforeEach(() => {
    // jsdom has no layout; give elements a size so they count as visible.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      top: 10,
      left: 10,
      width: 40,
      height: 20,
      right: 50,
      bottom: 30,
      x: 10,
      y: 10,
      toJSON: () => ({}),
    } as DOMRect);
  });
  afterEach(() => vi.restoreAllMocks());

  it("offers the tour once, and Not now dismisses it", async () => {
    renderTour();
    expect(await screen.findByRole("dialog", { name: "Welcome" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await getTourProgress("studio")).toEqual({ stepIndex: 0, status: "dismissed" });
    cleanup();
    renderTour();
    await act(async () => {});
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("walks the steps, opens each screen, highlights what exists and finishes", async () => {
    const onStep = renderTour();
    fireEvent.click(await screen.findByRole("button", { name: "Start tour" }));
    expect(screen.getByRole("dialog", { name: "Present" })).toBeInTheDocument();
    expect(onStep).toHaveBeenLastCalledWith(STEPS[1]);
    expect(screen.getByText("Step 2 of 4")).toBeInTheDocument();
    expect(await screen.findByTestId("tour-highlight")).toBeInTheDocument();
    await waitFor(async () =>
      expect(await getTourProgress("studio")).toEqual({ stepIndex: 1, status: "in_progress" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("dialog", { name: "Missing" })).toBeInTheDocument();
    expect(screen.queryByTestId("tour-highlight")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("dialog", { name: "Present" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await getTourProgress("studio")).toEqual({ stepIndex: 0, status: "completed" });
  });

  it("resumes after a reload, Escape skips, and the ? button replays", async () => {
    await saveTourProgress("studio", { stepIndex: 2, status: "in_progress" });
    renderTour();
    expect(await screen.findByRole("dialog", { name: "Missing" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect((await getTourProgress("studio")).status).toBe("dismissed");
    fireEvent.click(screen.getByRole("button", { name: "Take the tour" }));
    expect(screen.getByRole("dialog", { name: "Welcome" })).toBeInTheDocument();
  });

  it("speaks Chinese when the family portal is in Chinese", async () => {
    render(
      <TourProvider tourId="family" steps={FAMILY_TOUR} lang="zh-CN">
        <TourHelpButton />
      </TourProvider>,
    );
    expect(await screen.findByRole("dialog", { name: "欢迎使用家庭门户" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始导览" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看导览" })).toBeInTheDocument();
  });

  it("studio tour follows keystone.siteLang without an explicit lang prop", async () => {
    setSiteLang("zh-CN");
    render(
      <TourProvider tourId="studio" steps={STUDIO_TOUR}>
        <TourHelpButton />
      </TourProvider>,
    );
    expect(await screen.findByRole("dialog", { name: "欢迎使用 Keystone Music HQ" })).toBeInTheDocument();
    expect(screen.getByText("第 1 步，共 11 步")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始导览" })).toBeInTheDocument();
  });

  it("holds the tour back while paused (for example a terms update)", async () => {
    const { rerender } = render(
      <TourProvider tourId="family" steps={STEPS} paused>
        <span />
      </TourProvider>,
    );
    await act(async () => {});
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    rerender(
      <TourProvider tourId="family" steps={STEPS} paused={false}>
        <span />
      </TourProvider>,
    );
    expect(await screen.findByRole("dialog", { name: "Welcome" })).toBeInTheDocument();
  });

  it("a last-card offer starts the next tour, which opens on a real step", async () => {
    const offerSteps: TourStep[] = [
      STEPS[0]!,
      {
        id: "offer",
        target: null,
        title: { en: "Set up now?" },
        body: { en: "Want help?" },
        offer: { accept: { en: "Yes, help me" }, decline: { en: "Not now" }, starts: "setup" },
      },
    ];
    const setupSteps: TourStep[] = [
      { id: "s1", target: null, title: { en: "Fill your profile" }, body: { en: "Name" } },
      { id: "s2", target: null, title: { en: "All set" }, body: { en: "Done" } },
    ];
    function Harness() {
      const [token, setToken] = useState(0);
      return (
        <TourProvider
          tourId="setup"
          steps={setupSteps}
          autoStart={false}
          introCard={false}
          startToken={token}
        >
          <TourProvider tourId="studio" steps={offerSteps} onOffer={() => setToken((t) => t + 1)}>
            <TourHelpButton />
          </TourProvider>
        </TourProvider>
      );
    }
    render(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: "Start tour" }));
    expect(screen.getByRole("dialog", { name: "Set up now?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Yes, help me" }));
    expect(await screen.findByRole("dialog", { name: "Fill your profile" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start tour" })).not.toBeInTheDocument();
    expect(await getTourProgress("studio")).toEqual({ stepIndex: 0, status: "completed" });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await getTourProgress("setup")).toEqual({ stepIndex: 0, status: "completed" });
    // The ? button replays the studio tour, not the setup guide.
    fireEvent.click(screen.getByRole("button", { name: "Take the tour" }));
    expect(screen.getByRole("dialog", { name: "Welcome" })).toBeInTheDocument();
  });

  it("declining the offer just finishes the tour", async () => {
    await saveTourProgress("studio", { stepIndex: 1, status: "in_progress" });
    const onOffer = vi.fn();
    render(
      <TourProvider
        tourId="studio"
        steps={[
          STEPS[0]!,
          {
            id: "offer",
            target: null,
            title: { en: "Set up now?" },
            body: { en: "Want help?" },
            offer: { accept: { en: "Yes, help me" }, decline: { en: "Not now" }, starts: "setup" },
          },
        ]}
        onOffer={onOffer}
      >
        <span />
      </TourProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
    expect(onOffer).not.toHaveBeenCalled();
    expect(await getTourProgress("studio")).toEqual({ stepIndex: 0, status: "completed" });
  });

  it("renders no ? button without a tour", () => {
    render(<TourHelpButton />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
