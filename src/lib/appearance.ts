import { z } from "zod";
export const cardPalette = [
  { name: "흰색", value: "#FFFFFF" },
  { name: "연보라", value: "#F5F3FF" },
  { name: "연파랑", value: "#EFF6FF" },
  { name: "연초록", value: "#F0FDF4" },
  { name: "연살구", value: "#FFF7ED" },
  { name: "연회색", value: "#F8FAFC" },
] as const;
export const cardStyleSchema = z
  .object({
    backgroundColor: z
      .enum(["#FFFFFF", "#F5F3FF", "#EFF6FF", "#F0FDF4", "#FFF7ED", "#F8FAFC"])
      .optional(),
    fontSize: z
      .number()
      .refine(
        (n) => [16, 17, 18].includes(n),
        "역할 글씨 크기는 16, 17, 18px 중에서 선택해 주세요.",
      )
      .optional(),
    fontWeight: z
      .number()
      .refine(
        (n) => [600, 700].includes(n),
        "역할 글씨 굵기는 600 또는 700입니다.",
      )
      .optional(),
    iconSize: z
      .number()
      .refine(
        (n) => [28, 32, 36, 40].includes(n),
        "로고 크기는 28, 32, 36, 40px 중에서 선택해 주세요.",
      )
      .optional(),
  })
  .strict();
export type CardStyle = z.infer<typeof cardStyleSchema>;
export const defaultCardStyle = {
  backgroundColor: "#FFFFFF",
  fontSize: 17,
  fontWeight: 600,
  iconSize: 32,
} as const;
export const resolveCardStyle = (style?: CardStyle) => ({
  ...defaultCardStyle,
  ...style,
});
