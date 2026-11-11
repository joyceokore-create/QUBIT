// UX fidelity F1 (plan D-F2b): shared labels are Title Case. Pins the label sets that every
// screen reads — menus, Viewing As homes, report tabs, PM and access-request tabs — so a
// sentence-case label can't slip back in.
import { describe, expect, it } from "vitest";
import { ROLE_MENUS } from "@/lib/role-menus";
import { VIEW_ROLE_HOME } from "@/lib/view-roles";
import { AR_TAB_LABEL } from "@/lib/admin-home";
import { todoTabs } from "@/lib/pm-today";
import { CUSTOM_ONLY_TABS } from "@/lib/reports-view";
import { isTitleCase, toTitleCase } from "@/lib/title-case";

describe("the casing rule", () => {
  it("capitalises words, keeps minor words lower case inside, and leaves acronyms", () => {
    expect(toTitleCase("access requests")).toBe("Access Requests");
    expect(toTitleCase("due in the next 7 days")).toBe("Due in the Next 7 Days");
    expect(toTitleCase("viewing as")).toBe("Viewing As");
    expect(toTitleCase("past roll-ups")).toBe("Past Roll-Ups");
    expect(toTitleCase("users without MFA")).toBe("Users Without MFA");
    expect(toTitleCase("risks & issues")).toBe("Risks & Issues");
  });
});

describe("shared labels are Title Case", () => {
  const all: [string, string][] = [
    ...Object.values(ROLE_MENUS).flatMap((groups) => groups.flatMap((g) => [["menu group", g.label] as [string, string], ...g.items.map((i) => ["menu item", i.label] as [string, string])])),
    ...Object.values(VIEW_ROLE_HOME).map((l) => ["home", l] as [string, string]),
    ...Object.values(AR_TAB_LABEL).map((l) => ["access request tab", l] as [string, string]),
    ...todoTabs([]).map((t) => ["PM tab", t.label] as [string, string]),
    ...CUSTOM_ONLY_TABS.map((t) => ["report tab", t.label] as [string, string]),
  ];
  it.each(all)("%s “%s”", (_kind, label) => {
    expect(isTitleCase(label), `${label} → ${toTitleCase(label)}`).toBe(true);
  });
});
