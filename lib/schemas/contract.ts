import { z } from "zod";
import { bool, str, strArr } from "./field";

export const contractSchema = z.object({
  title: str(),
  parties: z
    .array(z.object({ name: str(), role: str(), address: str() }))
    .default([]),
  effectiveDate: str(),
  expiryDate: str(),
  term: str(),
  governingLaw: str(),
  jurisdiction: str(),
  paymentTerms: str(),
  terminationNotice: str(),
  autoRenew: bool(),
  obligations: strArr(),
  keyDates: z
    .array(z.object({ date: str(), description: str() }))
    .default([]),
});
