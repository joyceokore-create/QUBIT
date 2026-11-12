import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { Field } from "@/components/ui/drawer";
import { InviteDetailsSchema } from "@/lib/invite-schema";

function Form({ onValid }: { onValid: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const fe = useFieldErrors({ schema: InviteDetailsSchema, values: { name, email }, idPrefix: "t" });
  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); if (fe.validate()) onValid(); }}>
      <Field label="Full Name" htmlFor={fe.idOf("name")} error={fe.errors.name}>
        <input {...fe.bind("name")} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Work Email" htmlFor={fe.idOf("email")} error={fe.errors.email} hint="Domain routes them.">
        <input {...fe.bind("email")} value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <button type="submit">Next</button>
      <button type="button" onClick={() => fe.setServerErrors({ email: "Already in use." })}>Server</button>
    </form>
  );
}

describe("useFieldErrors (docs/08 § Errors)", () => {
  it("submit shows every problem on its field; nothing before the first submit", () => {
    const onValid = vi.fn();
    render(<Form onValid={onValid} />);
    expect(screen.getByText("Domain routes them.")).toBeInTheDocument();
    fireEvent.blur(screen.getByLabelText("Full Name")); // untouched empty field: no error yet
    expect(screen.queryByText("Enter a full name.")).toBeNull();
    fireEvent.click(screen.getByText("Next"));
    expect(onValid).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Full Name")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Full Name")).toHaveAttribute("aria-describedby", "t-name-error");
    expect(document.getElementById("t-name-error")?.textContent).toBe("Enter a full name.");
    expect(document.getElementById("t-email-error")?.textContent).toBe("Enter a work email.");
    expect(screen.queryByText("Domain routes them.")).toBeNull(); // the error replaces the hint
  });

  it("an error clears on the keystroke that fixes it; a new format error waits for a pause", () => {
    vi.useFakeTimers();
    try {
      render(<Form onValid={() => {}} />);
      fireEvent.click(screen.getByText("Next"));
      fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "Jane" } });
      expect(screen.getByLabelText("Full Name")).not.toHaveAttribute("aria-invalid");
      fireEvent.change(screen.getByLabelText("Work Email"), { target: { value: "jane@" } });
      // Still wrong, but the message changes only after the pause.
      expect(document.getElementById("t-email-error")?.textContent).toBe("Enter a work email.");
      act(() => { vi.advanceTimersByTime(1100); });
      expect(document.getElementById("t-email-error")?.textContent).toBe("Enter a work email, like name@company.com.");
      fireEvent.change(screen.getByLabelText("Work Email"), { target: { value: "jane@company.com" } });
      expect(document.getElementById("t-email-error")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("typing a malformed value shows its error after a pause, without a submit", () => {
    vi.useFakeTimers();
    try {
      render(<Form onValid={() => {}} />);
      fireEvent.change(screen.getByLabelText("Work Email"), { target: { value: "jane" } });
      expect(document.getElementById("t-email-error")).toBeNull();
      act(() => { vi.advanceTimersByTime(1100); });
      expect(document.getElementById("t-email-error")?.textContent).toMatch(/like name@company.com/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("server errors land on the field and clear when it changes", () => {
    render(<Form onValid={() => {}} />);
    fireEvent.click(screen.getByText("Server"));
    expect(document.getElementById("t-email-error")?.textContent).toBe("Already in use.");
    fireEvent.change(screen.getByLabelText("Work Email"), { target: { value: "x@y.co" } });
    expect(document.getElementById("t-email-error")).toBeNull();
  });
});

import { z } from "zod";
import { FieldError } from "@/components/ui/drawer";

const BASE = z.object({ note: z.string().max(10, "Too long."), picks: z.array(z.string()) });
const NEEDS_NOTE = z.object({ note: z.string().trim().min(5, "Enter a reason of at least 5 characters."), picks: z.array(z.string()).min(1, "Choose at least one.") });

function ActionForm() {
  const [note, setNote] = useState("");
  const [picks, setPicks] = useState<string[]>([]);
  const fe = useFieldErrors({ schema: BASE, values: { note, picks }, idPrefix: "a" });
  return (
    <div>
      <input aria-label="Note" {...fe.bind("note")} value={note} onChange={(e) => setNote(e.target.value)} />
      {fe.errors.note && <FieldError id="a-note-error">{fe.errors.note}</FieldError>}
      <div {...fe.bindGroup("picks")} aria-label="Picks">
        <button type="button" onClick={() => setPicks(["x"])}>Pick</button>
      </div>
      {fe.errors.picks && <FieldError id="a-picks-error">{fe.errors.picks}</FieldError>}
      <button type="button" onClick={() => fe.validate()}>Approve</button>
      <button type="button" onClick={() => fe.validate(undefined, { schema: NEEDS_NOTE })}>Return</button>
    </div>
  );
}

describe("useFieldErrors — per-action schema and groups", () => {
  it("a reason is required only for the action that needs it, and live re-checks follow it", () => {
    render(<ActionForm />);
    fireEvent.click(screen.getByText("Approve"));
    expect(screen.getByLabelText("Note")).not.toHaveAttribute("aria-invalid");
    fireEvent.click(screen.getByText("Return"));
    expect(document.getElementById("a-note-error")?.textContent).toBe("Enter a reason of at least 5 characters.");
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Needs work" } });
    expect(document.getElementById("a-note-error")).toBeNull();
  });

  it("bindGroup marks the group with data-invalid (not aria-invalid) and links its message", () => {
    render(<ActionForm />);
    fireEvent.click(screen.getByText("Return"));
    const group = screen.getByRole("group", { name: "Picks" });
    expect(group).toHaveAttribute("data-invalid", "true");
    expect(group).not.toHaveAttribute("aria-invalid");
    expect(group).toHaveAttribute("aria-describedby", "a-picks-error");
    expect(group).toHaveAttribute("tabindex", "-1");
    fireEvent.click(screen.getByText("Pick"));
    expect(group).not.toHaveAttribute("data-invalid");
  });
});
