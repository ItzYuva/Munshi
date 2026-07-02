import { Schema, model, InferSchemaType } from 'mongoose';

const expenseSchema = new Schema({
  item: { type: String, required: true },
  amount: { type: Number, required: true },
  category: { type: String, required: true, index: true },
  rawMessage: { type: String, required: true },
  timestamp: { type: Date, default: Date.now, index: true },
});

export type ExpenseDoc = InferSchemaType<typeof expenseSchema>;

export const Expense = model('Expense', expenseSchema);
