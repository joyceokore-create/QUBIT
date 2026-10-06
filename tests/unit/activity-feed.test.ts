import { describe, expect, it } from "vitest";
import { formatActivity } from "@/server/activity-feed";

describe("formatActivity", () => {
  it("narrates the common event types", () => {
    expect(formatActivity("task.completed", {})).toBe("completed a task");
    expect(formatActivity("blocker.opened", {})).toBe("flagged a blocker");
    // Milestone A vocabulary: the weekly act is a "status update", sent in the same breath.
    expect(formatActivity("checkin.confirmed", { rag: "Green" })).toBe("confirmed the weekly status update (Green)");
    expect(formatActivity("checkin.submitted_to_head", {})).toBe("sent the status update to the Head of PMs");
    expect(formatActivity("task.nudged", {})).toBe("nudged the assignee of a blocked task");
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
