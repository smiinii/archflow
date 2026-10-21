import { get, set } from "idb-keyval";
import { workspaceSchema, type Workspace } from "./model";
export type LocalRecord = {
  data: Workspace;
  revision: number;
  dirty: boolean;
  updatedAt: string;
};
export const cacheKey = (userId: string | null) =>
  `archflow:workspace:v1:${userId || "guest"}`;
export async function loadLocal(userId: string | null) {
  const value = await get(cacheKey(userId));
  if (!value) return null;
  const parsed = workspaceSchema.safeParse(value.data);
  if (!parsed.success)
    throw new Error(
      "저장된 초안을 읽지 못했습니다. 기존 데이터는 보존됩니다. JSON 백업을 확인해 주세요.",
    );
  return { ...value, data: parsed.data } as LocalRecord;
}
export async function saveLocal(userId: string | null, record: LocalRecord) {
  await set(cacheKey(userId), record);
}
export function downloadJson(data: unknown, name: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
