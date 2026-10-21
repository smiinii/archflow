import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
const db = new PGlite();
const alice = "11111111-1111-4111-8111-111111111111",
  bob = "22222222-2222-4222-8222-222222222222";
const payload = JSON.stringify({
  schemaVersion: 1,
  folders: [],
  projects: [{ id: "p", name: "private" }],
});
async function asUser(id: string, sql: string, params: unknown[] = []) {
  await db.exec(
    `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`,
  );
  return db.query(sql, params);
}
beforeAll(async () => {
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${alice}'),('${bob}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
  );
  await db.exec(
    readFileSync(
      new URL(
        "../supabase/migrations/202610210001_workspaces.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
}, 30000);
afterAll(() => db.close());
describe("Supabase migration security and CAS", () => {
  it("requires authentication and creates only the caller workspace", async () => {
    const result = await asUser(
      alice,
      "select public.save_workspace(0,$1::jsonb) as revision",
      [payload],
    );
    expect(result.rows).toEqual([{ revision: 1 }]);
    await expect(
      asUser("", "select public.save_workspace(0,$1::jsonb)", [payload]),
    ).rejects.toThrow("authentication_required");
  });
  it("prevents reading another user workspace through RLS", async () => {
    expect(
      (await asUser(bob, "select * from public.workspaces")).rows,
    ).toHaveLength(0);
    expect(
      (await asUser(alice, "select * from public.workspaces")).rows,
    ).toHaveLength(1);
  });
  it("rejects stale saves and prevents direct revision bypass", async () => {
    await expect(
      asUser(alice, "select public.save_workspace(0,$1::jsonb)", [payload]),
    ).rejects.toThrow("revision_conflict");
    expect(
      (
        await asUser(
          alice,
          "select public.save_workspace(1,$1::jsonb) as revision",
          [payload],
        )
      ).rows,
    ).toEqual([{ revision: 2 }]);
    await expect(
      asUser(alice, "update public.workspaces set revision=99"),
    ).rejects.toThrow("permission denied");
  });
  it("rejects invalid payloads and does not let Bob change Alice data", async () => {
    await expect(
      asUser(bob, "select public.save_workspace(0,$1::jsonb)", [
        JSON.stringify({ schemaVersion: 2, projects: [], folders: [] }),
      ]),
    ).rejects.toThrow("invalid_workspace");
    await asUser(bob, "select public.save_workspace(0,$1::jsonb)", [payload]);
    expect(
      (await asUser(alice, "select revision from public.workspaces")).rows,
    ).toEqual([{ revision: 2 }]);
  });
});
