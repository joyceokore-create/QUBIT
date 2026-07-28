import { describe, expect, it } from "vitest";
import { formatActivity } from "@/server/activity-feed";

describe("formatActivity", () => {
  it("narrates the common event types", () => {
    expect(formatActivity("task.completed", {})).toBe("completed a task");
    expect(formatActivity("blocker.opened", {})).toBe("flagged a blocker");
    expect(formatActivity("checkin.confirmed", { rag: "Green" })).toBe("confirmed the Friday check-in (Green)");
    expect(formatActivity("project.status_changed", { from: "OnTrack", to: "AtRisk" })).toBe(
      "moved the project OnTrack → AtRisk",
    );
    expect(formatActivity("decision.recorded", { title: "Adopt Postgres 17" })).toBe(
      "recorded a decision: “Adopt Postgres 17”",
    );
  });

  it("distinguishes plain comments, replies and mentions", () => {
    expect(formatActivity("comment.posted", {})).toBe("commented");
    expect(formatActivity("comment.posted", { reply: true })).toBe("replied to a comment");
    expect(formatActivity("comment.posted", { mentions: 2 })).toBe("commented, mentioning teammates");
  });

  it("falls back readably for unknown types", () => {
    expect(formatActivity("something.new_thing", {})).toBe("something new thing");
  });
});
