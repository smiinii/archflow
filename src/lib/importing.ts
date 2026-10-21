import { z } from "zod";
import { graphSchema, type Graph } from "./model";
import { catalogMap } from "./catalog";
export type ImportIssue = { path: (string | number)[]; message: string };
const fields: Record<string, string> = {
  label: "연결 이름",
  name: "이름",
  note: "설명",
  replicas: "서버 대수",
  calls: "호출 횟수",
  hitPercent: "캐시 적중률",
  catalogId: "기술 ID",
  width: "너비",
  height: "높이",
  basis: "수치 근거",
  kind: "연결 방식",
  position: "위치",
};
export function inspectImport(text: string): {
  graph: Graph | null;
  issues: ImportIssue[];
  unsupported: string[];
} {
  try {
    if (
      text.length > 5_000_000 ||
      new TextEncoder().encode(text).byteLength > 5_000_000
    )
      throw new Error("JSON은 5MB 이하로 가져와 주세요.");
    const raw = JSON.parse(
      text
        .trim()
        .replace(/^```(?:json)?\s*/, "")
        .replace(/\s*```$/, ""),
    );
    const parsed = graphSchema.safeParse(raw);
    const unsupported: string[] = [];
    const scan = (value: unknown, schema: z.ZodType, path: string) => {
      // Public style support is intentionally closed: never silently accept unknown design fields.
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      if (schema instanceof z.ZodObject)
        for (const [key, v] of Object.entries(value)) {
          if (!(key in schema.shape)) unsupported.push(`${path}.${key}`);
          else scan(v, schema.shape[key], `${path}.${key}`);
        }
    };
    if (raw && typeof raw === "object" && !Array.isArray(raw))
      for (const key of Object.keys(raw))
        if (!(key in graphSchema.shape)) unsupported.push(`graph.${key}`);
    for (const collection of ["nodes", "edges", "flows"] as const)
      if (Array.isArray(raw?.[collection]))
        raw[collection].forEach((x: unknown, i: number) =>
          scan(x, graphSchema.shape[collection].element, `${collection}[${i}]`),
        );
    if (parsed.success) return { graph: parsed.data, issues: [], unsupported };
    const issues = parsed.error.issues.map((issue) => {
      const path = issue.path as (string | number)[];
      const collection = path[0],
        index = path[1];
      const entity =
        typeof index === "number" && typeof collection === "string"
          ? raw?.[collection]?.[index]
          : null;
      const rawName =
        entity?.data?.name ||
        entity?.data?.label ||
        entity?.name ||
        entity?.id ||
        "구조";
      const name =
        String(rawName).length > 36
          ? String(rawName).slice(0, 36) + `… (${entity?.id || "요소"})`
          : String(rawName);
      const key = String(path.at(-1) || "참조"),
        field = fields[key] || key;
      let value: unknown = raw;
      for (const part of path)
        value = (value as Record<string, unknown> | undefined)?.[part];
      let detail = issue.message;
      if (issue.code === "too_big")
        detail =
          typeof value === "string"
            ? `현재 ${value.length}자, 최대 ${issue.maximum}자입니다.`
            : `최대 ${issue.maximum}까지 허용합니다.`;
      else if (issue.code === "too_small")
        detail = `최소 ${issue.minimum}${typeof value === "string" ? "자" : ""}가 필요합니다.`;
      else if (issue.code === "invalid_type")
        detail = `현재 ${value === null ? "null" : typeof value}, ${issue.expected} 값이 필요합니다.${key === "replicas" || key === "calls" || key === "hitPercent" ? " 이 필드는 null 대신 기본값과 미확인 근거를 사용하세요." : ""}`;
      else if (issue.code === "invalid_value")
        detail = `허용값: ${issue.values.join(", ")}`;
      return { path, message: `${name} · ${field}: ${detail}` };
    });
    return { graph: null, issues, unsupported };
  } catch (e) {
    return {
      graph: null,
      issues: [
        { path: [], message: e instanceof Error ? e.message : String(e) },
      ],
      unsupported: [],
    };
  }
}
export const unknownMappings = (g: Graph) =>
  g.nodes.filter(
    (n) => n.type === "component" && !catalogMap.has(n.data.catalogId),
  );
// Locate a token by JSON object/array nesting, rather than a global string search (keys repeat in every card).
export function jsonFieldRange(
  text: string,
  path: (string | number)[],
): [number, number] {
  const tokens = [
    ...text.matchAll(
      /"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}\[\]:,]/g,
    ),
  ];
  let i = 0,
    found: [number, number] | null = null;
  function value(at: (string | number)[]) {
    const start = i,
      token = tokens[i]?.[0];
    if (!token) return;
    if (token === "{") {
      i++;
      while (i < tokens.length && tokens[i][0] !== "}") {
        let key: string;
        try {
          key = JSON.parse(tokens[i++][0]);
        } catch {
          return;
        }
        if (tokens[i++]?.[0] !== ":") return;
        value([...at, key]);
        if (tokens[i]?.[0] === ",") i++;
        else break;
      }
      i++;
    } else if (token === "[") {
      i++;
      let index = 0;
      while (i < tokens.length && tokens[i][0] !== "]") {
        value([...at, index++]);
        if (tokens[i]?.[0] === ",") i++;
        else break;
      }
      i++;
    } else i++;
    if (JSON.stringify(at) === JSON.stringify(path))
      found = [
        tokens[start].index!,
        tokens[Math.min(i - 1, tokens.length - 1)].index! +
          tokens[Math.min(i - 1, tokens.length - 1)][0].length,
      ];
  }
  value([]);
  return found || [0, Math.min(text.length, 1)];
}
