import { Schema, model, InferSchemaType } from 'mongoose';

// month stored as "YYYY-MM" so each category has one budget per month per user
const budgetSchema = new Schema({
  user: { type: String, required: true }, // sender's WhatsApp number
  category: { type: String, required: true },
  limit: { type: Number, required: true },
  month: { type: String, required: true }, // e.g. "2026-07"
});

// One budget per user + category + month
budgetSchema.index({ user: 1, category: 1, month: 1 }, { unique: true });

export type BudgetDoc = InferSchemaType<typeof budgetSchema>;

export const Budget = model('Budget', budgetSchema);
