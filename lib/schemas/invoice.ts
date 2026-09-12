import { z } from "zod";
import { num, str } from "./field";

export const invoiceSchema = z.object({
  invoiceNumber: str(),
  issueDate: str(),
  dueDate: str(),
  currency: str(),
  vendor: z.object({ name: str(), address: str(), taxId: str(), email: str() }),
  customer: z.object({ name: str(), address: str() }),
  lineItems: z
    .array(
      z.object({
        description: str(),
        quantity: num(),
        unitPrice: num(),
        total: num(),
      }),
    )
    .default([]),
  subtotal: num(),
  /** percentage points, e.g. 20 for 20% VAT */
  taxRate: num(),
  taxAmount: num(),
  total: num(),
  paymentTerms: str(),
});
