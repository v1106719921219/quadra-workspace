import { z } from "zod/v4";

export const submissionCreateSchema = z.object({
  gradingCompanyId: z.string().min(1, "グレーディング会社を選択してください"),
  title: z.string().min(1, "タイトルを入力してください"),
  notes: z.string().optional(),
});

export type SubmissionCreateInput = z.infer<typeof submissionCreateSchema>;

export const submissionItemCreateSchema = z.object({
  submissionId: z.string().uuid(),
  setCode: z.string().min(1),
  cardNumber: z.string().min(1),
  nameJa: z.string().optional(),
  gradingName: z.string().min(1, "グレーディング名を入力してください"),
  declaredValue: z.number().optional(),
  notes: z.string().optional(),
});

export type SubmissionItemCreateInput = z.infer<typeof submissionItemCreateSchema>;

export const batchAddItemsSchema = z.object({
  submissionId: z.string().uuid(),
  items: z.array(
    z.object({
      setNumber: z.string().min(1),
      cardName: z.string().min(1),
      year: z.number().int(),
      declaredValue: z.number().optional(),
    })
  ).min(1, "カードを1枚以上追加してください"),
});

export type BatchAddItemsInput = z.infer<typeof batchAddItemsSchema>;
