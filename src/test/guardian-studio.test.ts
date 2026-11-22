import { describe, expect, it } from "vitest";
import { guardianStudioForUser } from "@/server/guardian-studio";

/* eslint-disable @typescript-eslint/no-explicit-any */
function fake(tables: Record<string, any[]>) {
  return {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      const rows = () =>
        (tables[table] ?? []).filter((row) => filters.every(([k, v]) => row[k] === v));
      const q: any = {
        select: () => q,
        eq: (k: string, v: unknown) => {
          filters.push([k, v]);
          return q;
        },
        order: () => q,
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => void) => resolve({ data: rows(), error: null }),
      };
      return q;
    },
  } as never;
}

const tables = {
  guardian: [
    { id: "g-a", studio_id: "s-a", user_id: "u-1" },
    { id: "g-b", studio_id: "s-b", user_id: "u-1" },
    { id: "g-x", studio_id: "s-x", user_id: "someone-else" },
  ],
  studio: [
    {
      id: "s-a",
      name: "Studio A",
      is_demo: false,
      profile: { teacher: { name: "Ms A" }, termsDraft: { switches: {} } },
    },
    { id: "s-b", name: "Studio B", is_demo: false, profile: {} },
    { id: "s-x", name: "Not yours", is_demo: false, profile: {} },
  ],
};

describe("guardianStudioForUser", () => {
  it("returns the parent's own studio without the owner's terms draft", async () => {
    const found = await guardianStudioForUser(fake(tables), "u-1");
    expect(found).toEqual({
      id: "s-a",
      name: "Studio A",
      is_demo: false,
      profile: { teacher: { name: "Ms A" } },
      guardianId: "g-a",
    });
  });

  it("uses the asked-for studio only when the parent belongs to it", async () => {
    expect((await guardianStudioForUser(fake(tables), "u-1", "s-b"))?.id).toBe("s-b");
    expect((await guardianStudioForUser(fake(tables), "u-1", "s-x"))?.id).toBe("s-a");
  });

  it("returns null for someone who isn't a parent", async () => {
    expect(await guardianStudioForUser(fake(tables), "nobody")).toBeNull();
  });
});
