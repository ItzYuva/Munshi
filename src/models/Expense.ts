import { Schema, model, InferSchemaType } from 'mongoose';

const expenseSchema = new Schema({
  user: { type: String, required: true, index: true }, // sender's WhatsApp number
  item: { type: String, required: true },
  amount: { type: Number, required: true },
  category: { type: String, required: true, index: true },
  rawMessage: { type: String, required: true },
  timestamp: { type: Date, default: Date.now, index: true },
});

// Most reads are "this user's expenses in a time window"
expenseSchema.index({ user: 1, timestamp: -1 });

export type ExpenseDoc = InferSchemaType<typeof expenseSchema>;

export const Expense = model('Expense', expenseSchema);
