import { z } from "zod";
import { bool, str, strArr } from "./field";

export const cvSchema = z.object({
  fullName: str(),
  email: str(),
  phone: str(),
  location: str(),
  headline: str(),
  summary: str(),
  experience: z
    .array(
      z.object({
        company: str(),
        title: str(),
        startDate: str(),
        endDate: str(),
        current: bool(),
        highlights: strArr(),
      }),
    )
    .default([]),
  education: z
    .array(
      z.object({
        institution: str(),
        degree: str(),
        field: str(),
        startDate: str(),
        endDate: str(),
        grade: str(),
      }),
    )
    .default([]),
  skills: strArr(),
  languages: strArr(),
  certifications: strArr(),
});
