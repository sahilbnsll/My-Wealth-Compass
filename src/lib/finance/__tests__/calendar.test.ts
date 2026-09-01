import { describe, expect, it } from "vitest";
import { buildCalendar, committedWithin, nextOccurrence, statutoryDates, toISODate } from "../calendar";

const EMPTY = {
  sips: [],
  goals: [],
  maturities: [],
  custom: [],
  lastReviewedAt: null,
};

describe("nextOccurrence", () => {
  it("returns the anchor when it is still ahead", () => {
    const next = nextOccurrence(new Date(2026, 0, 1), new Date(2026, 0, 10), 1, null);
    expect(toISODate(next!)).toBe("2026-01-10");
  });

  it("rolls a monthly anchor forward to the next due date", () => {
    const next = nextOccurrence(new Date(2026, 4, 20), new Date(2024, 0, 5), 1, null);
    expect(toISODate(next!)).toBe("2026-06-05");
  });

  it("clamps a 31st anchor onto a short month", () => {
    const next = nextOccurrence(new Date(2026, 1, 1), new Date(2025, 0, 31), 1, null);
    expect(toISODate(next!)).toBe("2026-02-28");
  });

  it("respects a quarterly period", () => {
    const next = nextOccurrence(new Date(2026, 0, 15), new Date(2025, 0, 10), 3, null);
    expect(toISODate(next!)).toBe("2026-04-10");
  });

  it("returns null once the end date has passed", () => {
    expect(nextOccurrence(new Date(2026, 5, 1), new Date(2024, 0, 5), 1, new Date(2026, 0, 1))).toBeNull();
  });
});

describe("statutoryDates", () => {
  it("includes the four advance tax instalments and the ITR date", () => {
    const titles = statutoryDates(new Date(2026, 0, 1)).map((d) => d.title);
    expect(titles.filter((t) => t.startsWith("Advance tax")).length).toBe(8);
    expect(titles).toContain("Income tax return due");
  });
});

describe("buildCalendar", () => {
  const today = new Date(2026, 0, 15);

  it("derives the next SIP instalment from the start date", () => {
    const events = buildCalendar({
      ...EMPTY,
      today,
      sips: [
        {
          id: "a",
          name: "Index fund",
          monthlyAmount: 25000,
          frequency: "monthly",
          startDate: "2024-03-05",
          endDate: null,
        },
      ],
    });
    const sip = events.find((e) => e.kind === "sip");
    expect(sip?.date).toBe("2026-02-05");
    expect(sip?.amount).toBe(25000);
  });

  it("scales a quarterly commitment by its period", () => {
    const events = buildCalendar({
      ...EMPTY,
      today,
      sips: [
        { id: "b", name: "NPS", monthlyAmount: 5000, frequency: "quarterly", startDate: "2025-01-10", endDate: null },
      ],
    });
    expect(events.find((e) => e.kind === "sip")?.amount).toBe(15000);
  });

  it("skips SIPs with no recorded start date instead of guessing one", () => {
    const events = buildCalendar({
      ...EMPTY,
      today,
      sips: [{ id: "c", name: "Unknown", monthlyAmount: 1000, frequency: "monthly", startDate: null, endDate: null }],
    });
    expect(events.some((e) => e.kind === "sip")).toBe(false);
  });

  it("schedules the first review immediately when none has been done", () => {
    const events = buildCalendar({ ...EMPTY, today });
    const review = events.find((e) => e.kind === "review");
    expect(review?.date).toBe("2026-01-01");
  });

  it("schedules the next review one month after the last one", () => {
    const events = buildCalendar({ ...EMPTY, today, lastReviewedAt: "2026-01-10T09:00:00.000Z" });
    expect(events.find((e) => e.kind === "review")?.date).toBe("2026-02-10");
  });

  it("returns events in date order", () => {
    const events = buildCalendar({
      ...EMPTY,
      today,
      goals: [{ id: "g", name: "Home", targetDate: "2026-09-01", futureCost: 4000000 }],
    });
    const dates = events.map((e) => e.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it("counts only cash commitments inside the window", () => {
    const events = buildCalendar({
      ...EMPTY,
      today,
      sips: [
        { id: "a", name: "A", monthlyAmount: 20000, frequency: "monthly", startDate: "2025-01-20", endDate: null },
      ],
      goals: [{ id: "g", name: "Home", targetDate: "2026-01-25", futureCost: 4000000 }],
    });
    expect(committedWithin(events, 30)).toBe(20000);
  });
});
