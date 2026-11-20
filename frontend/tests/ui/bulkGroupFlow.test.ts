// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { translate } from "../../src/lib/i18n";
import type { ExerciseGroup } from "../../src/lib/exercise-library/groupExercises";

vi.mock("../../src/lib/exercise-library/examUsage", () => ({ loadExamUsage: vi.fn(async () => Promise.reject(new Error("offline"))) }));

const { default: BulkGroupFlow } = await import("../../src/lib/components/exercise-library/BulkGroupFlow.svelte");

afterEach(cleanup);

const group = (id: string) =>
  ({ groupId: id, name: `Gruppe ${id}`, topicTag: "", maxPoints: 1, minPoints: 1, variants: new Map(), allMembers: [{ ex: { id: `ex-${id}` } }] }) as unknown as ExerciseGroup;

describe("BulkGroupFlow delete (issue #298)", () => {
  it("blocks the delete when the exam usage could not be checked", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { component } = render(BulkGroupFlow, { onSaved: vi.fn(), onNotice: vi.fn() });
    (component as unknown as { open: (k: string, g: ExerciseGroup[]) => void }).open("delete", [group("a"), group("b")]);
    for (let i = 0; i < 5; i++) await tick();
    expect(screen.getByText(translate("exercises.bulk.usageFailed"))).toBeTruthy();
    const confirm = screen.getByRole("button", { name: translate("common.deleteModal.deleteAnyway") });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
  });
});
