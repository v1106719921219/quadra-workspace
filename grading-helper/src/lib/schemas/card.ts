import { z } from "zod/v4";

export const cardSearchSchema = z.object({
  query: z.string().optional(),
  tcgGameId: z.string().optional(),
  setCode: z.string().optional(),
  page: z.number().int().min(1).default(1),
  perPage: z.number().int().min(1).max(100).default(50),
});

export type CardSearchInput = z.infer<typeof cardSearchSchema>;

export const cardCreateSchema = z.object({
  tcgGameId: z.string().min(1, "TCGゲームを選択してください"),
  setCode: z.string().min(1, "セットコードを入力してください"),
  cardNumber: z.string().min(1, "カード番号を入力してください"),
  nameJa: z.string().optional(),
  nameEn: z.string().optional(),
  gradingName: z.string().optional(),
  rarity: z.string().optional(),
  year: z.number().int().optional(),
});

export type CardCreateInput = z.infer<typeof cardCreateSchema>;

export const generateNameSchema = z.object({
  setNumber: z.string().min(1, "型番を入力してください"),
  cardName: z.string().min(1, "カード名を入力してください"),
  year: z.number().int().min(1996).max(2030),
  gradingCompanyId: z.string().optional(),
});

export type GenerateNameInput = z.infer<typeof generateNameSchema>;

export const csvImportRowSchema = z.object({
  setCode: z.string(),
  cardNumber: z.string(),
  nameJa: z.string().optional(),
  nameEn: z.string().optional(),
  rarity: z.string().optional(),
  year: z.number().optional(),
});

export type CsvImportRow = z.infer<typeof csvImportRowSchema>;
