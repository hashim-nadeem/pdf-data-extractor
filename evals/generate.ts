/**
 * Builds the 50 synthetic fixtures: 20 invoices, 20 CVs, 10 contracts.
 *
 * Everything here is invented — the companies, the people, the addresses — and
 * every page carries a visible SAMPLE marker. No real document is ever used.
 * Ground truth is written alongside each PDF as a flat path -> value map.
 */
import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import {
  CERTS, CITIES, COMPANIES, CURRENCIES, DEGREES, ITEMS, LANGUAGES, LAWS,
  OBLIGATIONS, PEOPLE, SKILLS, STREETS, TITLES, UNIVERSITIES,
} from "./data";

const OUT = path.resolve(process.cwd(), "evals/fixtures");
const SAMPLES = path.resolve(process.cwd(), "public/samples");
const MARK = "SAMPLE — NOT A REAL DOCUMENT";

type GT = Record<string, unknown>;

// Deterministic so the fixture set is reproducible by anyone who clones the repo.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
const int = (r: () => number, a: number, b: number) => a + Math.floor(r() * (b - a + 1));
const money = (n: number) => n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

/** Same date, four different renderings — the extractor has to cope with all of them. */
function fmtDate(iso: string, variant: number) {
  const [y, m, d] = iso.split("-") as [string, string, string];
  const mi = Number(m) - 1;
  return [
    iso,
    `${Number(d)} ${MONTHS[mi]} ${y}`,
    `${d}/${m}/${y}`,
    `${MONTHS[mi]!.slice(0, 3)} ${Number(d)}, ${y}`,
  ][variant % 4]!;
}

const isoDate = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

type Doc = InstanceType<typeof PDFDocument>;

async function writePdf(file: string, draw: (doc: Doc) => void) {
  const doc = new PDFDocument({ size: "A4", margin: 50, autoFirstPage: true });
  const stream = fs.createWriteStream(file);
  doc.pipe(stream);
  doc.fontSize(8).fillColor("#999").text(MARK, 50, 28, { align: "right", width: 495 });
  doc.fillColor("#000");
  draw(doc);
  doc.fontSize(8).fillColor("#999").text(MARK, 50, 770, { width: 495, align: "center" });
  doc.end();
  await new Promise<void>((res) => stream.on("finish", () => res()));
}

const h = (doc: Doc, t: string, x: number, y: number, size = 18) =>
  doc.font("Helvetica-Bold").fontSize(size).fillColor("#000").text(t, x, y);
const lab = (doc: Doc, t: string, x: number, y: number) =>
  doc.font("Helvetica").fontSize(9).fillColor("#666").text(t, x, y);
const val = (doc: Doc, t: string, x: number, y: number, size = 10) =>
  doc.font("Helvetica").fontSize(size).fillColor("#000").text(t, x, y, { width: 250 });

// ---------------------------------------------------------------- invoices

function invoice(i: number) {
  const r = rng(1000 + i);
  const v = i % 3;
  const cur = CURRENCIES[i % 3]!;
  const vendor = COMPANIES[i % COMPANIES.length]!;
  const customer = COMPANIES[(i + 5) % COMPANIES.length]!;
  const issue = isoDate(2024, int(r, 1, 12), int(r, 1, 28));
  const hasDue = i % 4 !== 0;
  const due = isoDate(2024, Number(issue.slice(5, 7)), 28);
  const hasTaxId = i % 3 !== 0;
  const hasTerms = i % 5 !== 0;
  const hasCustAddr = i % 7 !== 0;

  const lines = Array.from({ length: int(r, 2, 4) }, () => {
    const qty = int(r, 1, 12);
    const unit = Number((int(r, 20, 900) + r()).toFixed(2));
    return {
      description: pick(r, ITEMS),
      quantity: qty,
      unitPrice: unit,
      total: Number((qty * unit).toFixed(2)),
    };
  });
  const subtotal = Number(lines.reduce((a, l) => a + l.total, 0).toFixed(2));
  const taxRate = [20, 23, 0, 5][i % 4]!;
  const taxAmount = Number(((subtotal * taxRate) / 100).toFixed(2));
  const total = Number((subtotal + taxAmount).toFixed(2));

  const d = {
    invoiceNumber: `INV-2024-${String(800 + i).padStart(4, "0")}`,
    issueDate: issue,
    dueDate: hasDue ? due : null,
    currency: cur.code,
    vendorName: vendor,
    vendorAddress: `${STREETS[i % STREETS.length]}, ${CITIES[i % CITIES.length]}`,
    vendorTaxId: hasTaxId ? `GB${int(r, 100000000, 999999999)}` : null,
    vendorEmail: `accounts@${vendor.toLowerCase().replace(/[^a-z]/g, "")}.example`,
    customerName: customer,
    customerAddress: hasCustAddr
      ? `${STREETS[(i + 3) % STREETS.length]}, ${CITIES[(i + 2) % CITIES.length]}`
      : null,
    paymentTerms: hasTerms ? ["Net 30", "Net 14", "Due on receipt", "Net 45"][i % 4]! : null,
    lines, subtotal, taxRate, taxAmount, total,
  };

  const gt: GT = {
    invoiceNumber: d.invoiceNumber,
    issueDate: d.issueDate,
    dueDate: d.dueDate,
    currency: d.currency,
    "vendor.name": d.vendorName,
    "vendor.address": d.vendorAddress,
    "vendor.taxId": d.vendorTaxId,
    "vendor.email": d.vendorEmail,
    "customer.name": d.customerName,
    "customer.address": d.customerAddress,
    subtotal: d.subtotal,
    taxRate: d.taxRate,
    taxAmount: d.taxAmount,
    total: d.total,
    paymentTerms: d.paymentTerms,
  };
  lines.forEach((l, n) => {
    gt[`lineItems[${n}].description`] = l.description;
    gt[`lineItems[${n}].quantity`] = l.quantity;
    gt[`lineItems[${n}].unitPrice`] = l.unitPrice;
    gt[`lineItems[${n}].total`] = l.total;
  });

  const draw = (doc: Doc) => {
    const right = v === 1;
    h(doc, v === 2 ? "INVOICE" : "Invoice", 50, 60, v === 2 ? 22 : 18);
    doc.font("Helvetica-Bold").fontSize(11).text(d.vendorName, 50, 95);
    val(doc, d.vendorAddress.replace(", ", "\n"), 50, 112, 9);
    if (d.vendorTaxId) val(doc, `VAT Reg. ${d.vendorTaxId}`, 50, 145, 9);
    val(doc, d.vendorEmail, 50, 158, 9);

    const mx = right ? 340 : 50;
    let my = right ? 95 : 190;
    const meta: [string, string][] = [
      [v === 1 ? "Invoice #" : "Invoice No.", d.invoiceNumber],
      [v === 2 ? "Dated" : "Issue date", fmtDate(d.issueDate, i)],
    ];
    if (d.dueDate) meta.push([v === 1 ? "Payment due" : "Due date", fmtDate(d.dueDate, i + 1)]);
    if (d.paymentTerms) meta.push(["Terms", d.paymentTerms]);
    meta.push(["Currency", `${cur.code} (${cur.symbol})`]);
    for (const [k, t] of meta) {
      lab(doc, k, mx, my);
      val(doc, t, mx + 90, my - 1);
      my += 16;
    }

    let y = right ? 200 : 190 + meta.length * 16 + 10;
    lab(doc, v === 2 ? "BILL TO" : "Billed to", 50, y);
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#000").text(d.customerName, 50, y + 13);
    if (d.customerAddress) val(doc, d.customerAddress.replace(", ", "\n"), 50, y + 28, 9);

    y += 70;
    const cols = [50, 300, 360, 440];
    const heads = right
      ? ["Item", "Qty", "Rate", "Amount"]
      : ["Description", "Quantity", "Unit price", "Total"];
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#000");
    heads.forEach((t, n) =>
      doc.text(t, cols[n]!, y, { width: n ? 90 : 240, align: n ? "right" : "left" }));
    doc.moveTo(50, y + 14).lineTo(545, y + 14).strokeColor("#ccc").stroke();
    y += 22;
    for (const l of d.lines) {
      doc.font("Helvetica").fontSize(9).fillColor("#000");
      doc.text(l.description, cols[0]!, y, { width: 240 });
      doc.text(String(l.quantity), cols[1]!, y, { width: 45, align: "right" });
      doc.text(`${cur.symbol}${money(l.unitPrice)}`, cols[2]!, y, { width: 70, align: "right" });
      doc.text(`${cur.symbol}${money(l.total)}`, cols[3]!, y, { width: 105, align: "right" });
      y += 18;
    }
    doc.moveTo(300, y + 2).lineTo(545, y + 2).strokeColor("#ccc").stroke();
    y += 10;
    const totals: [string, string][] = [
      ["Subtotal", `${cur.symbol}${money(d.subtotal)}`],
      [`VAT ${d.taxRate}%`, `${cur.symbol}${money(d.taxAmount)}`],
      ["Total due", `${cur.symbol}${money(d.total)}`],
    ];
    for (const [k, t] of totals) {
      const bold = k === "Total due";
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 11 : 9).fillColor("#000");
      doc.text(k, 300, y, { width: 130, align: "right" });
      doc.text(t, 440, y, { width: 105, align: "right" });
      y += bold ? 20 : 16;
    }
    if (d.paymentTerms && !right) val(doc, `Payment terms: ${d.paymentTerms}`, 50, y + 20, 9);
  };

  return { gt, draw };
}

// --------------------------------------------------------------------- CVs

function cv(i: number) {
  const r = rng(2000 + i);
  const v = i % 3;
  const name = PEOPLE[i % PEOPLE.length]!;
  const slug = name.toLowerCase().replace(/[^a-z]/g, ".");
  const hasSummary = i % 3 !== 0;
  const hasCerts = i % 2 === 1;
  const hasLangs = i % 4 !== 3;

  const roles = Array.from({ length: int(r, 2, 3) }, (_, n) => {
    const start = 2024 - (n + 1) * int(r, 2, 4);
    const current = n === 0;
    return {
      company: COMPANIES[(i + n * 3) % COMPANIES.length]!,
      title: TITLES[(i + n) % TITLES.length]!,
      startDate: isoDate(start, int(r, 1, 12), 1),
      endDate: current ? null : isoDate(start + 2, 6, 30),
      current,
      highlights: [
        `Cut ${pick(r, ["batch runtime", "page load", "error rate", "onboarding time"])} by ${int(r, 20, 70)}%.`,
        `Led a team of ${int(r, 3, 9)} across ${int(r, 2, 5)} services.`,
      ],
    };
  });
  const [deg, fieldOfStudy] = DEGREES[i % DEGREES.length]!;
  const edu = {
    institution: UNIVERSITIES[i % UNIVERSITIES.length]!,
    degree: deg!,
    field: fieldOfStudy!,
    startDate: isoDate(2012 + (i % 4), 9, 1),
    endDate: isoDate(2015 + (i % 4), 6, 30),
    grade: i % 3 === 0 ? "First class honours" : null,
  };
  const skills = SKILLS.slice(i % 5, (i % 5) + 5);
  const langs = hasLangs ? LANGUAGES.slice(i % 3, (i % 3) + 2) : null;
  const certs = hasCerts ? [CERTS[i % CERTS.length]!] : null;
  const d = {
    fullName: name,
    email: `${slug}@mailbox.example`,
    phone: `+44 7700 ${String(900000 + i * 137).slice(0, 6)}`,
    location: CITIES[i % CITIES.length]!.split(" ")[0]!,
    headline: TITLES[i % TITLES.length]!,
    summary: hasSummary
      ? `${TITLES[i % TITLES.length]} with ${int(r, 6, 15)} years building data-heavy products in regulated settings.`
      : null,
    roles, edu, skills, langs, certs,
  };

  const gt: GT = {
    fullName: d.fullName, email: d.email, phone: d.phone, location: d.location,
    headline: d.headline, summary: d.summary,
    skills: d.skills, languages: d.langs, certifications: d.certs,
    "education[0].institution": edu.institution, "education[0].degree": edu.degree,
    "education[0].field": edu.field, "education[0].startDate": edu.startDate,
    "education[0].endDate": edu.endDate, "education[0].grade": edu.grade,
  };
  roles.forEach((e, n) => {
    gt[`experience[${n}].company`] = e.company;
    gt[`experience[${n}].title`] = e.title;
    gt[`experience[${n}].startDate`] = e.startDate;
    gt[`experience[${n}].endDate`] = e.endDate;
    gt[`experience[${n}].current`] = e.current;
    gt[`experience[${n}].highlights`] = e.highlights;
  });

  const draw = (doc: Doc) => {
    h(doc, d.fullName, 50, 60, v === 2 ? 24 : 20);
    doc.font("Helvetica").fontSize(11).fillColor("#333").text(d.headline, 50, v === 2 ? 92 : 86);
    val(doc, `${d.email}  ·  ${d.phone}  ·  ${d.location}`, 50, 110, 9);
    let y = 135;
    const section = (t: string) => {
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#000")
        .text(v === 1 ? t.toUpperCase() : t, 50, y);
      doc.moveTo(50, y + 15).lineTo(545, y + 15).strokeColor("#ddd").stroke();
      y += 24;
    };
    if (d.summary) {
      section("Summary");
      doc.font("Helvetica").fontSize(9.5).fillColor("#000").text(d.summary, 50, y, { width: 495 });
      y += 34;
    }
    section("Experience");
    for (const e of d.roles) {
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#000")
        .text(`${e.title}, ${e.company}`, 50, y);
      const period = `${fmtDate(e.startDate, i)} – ${e.current ? "Present" : fmtDate(e.endDate!, i)}`;
      doc.font("Helvetica").fontSize(9).fillColor("#666")
        .text(period, 350, y, { width: 195, align: "right" });
      y += 15;
      for (const hl of e.highlights) {
        doc.font("Helvetica").fontSize(9).fillColor("#000").text(`• ${hl}`, 60, y, { width: 480 });
        y += 13;
      }
      y += 8;
    }
    section("Education");
    doc.font("Helvetica").fontSize(9.5).fillColor("#000")
      .text(`${edu.degree} ${edu.field}, ${edu.institution}`, 50, y);
    doc.fontSize(9).fillColor("#666")
      .text(`${fmtDate(edu.startDate, i)} – ${fmtDate(edu.endDate, i)}`, 350, y,
        { width: 195, align: "right" });
    y += 14;
    if (edu.grade) {
      doc.fontSize(9).fillColor("#000").text(`Grade: ${edu.grade}`, 50, y);
      y += 14;
    }
    y += 10;
    section("Skills");
    doc.font("Helvetica").fontSize(9.5).fillColor("#000").text(d.skills.join(", "), 50, y, { width: 495 });
    y += 26;
    if (d.langs) {
      section("Languages");
      doc.font("Helvetica").fontSize(9.5).fillColor("#000").text(d.langs.join(", "), 50, y);
      y += 26;
    }
    if (d.certs) {
      section("Certifications");
      doc.font("Helvetica").fontSize(9.5).fillColor("#000").text(d.certs.join(", "), 50, y, { width: 495 });
    }
  };

  return { gt, draw };
}

// --------------------------------------------------------------- contracts

function contract(i: number) {
  const r = rng(3000 + i);
  const supplier = COMPANIES[i % COMPANIES.length]!;
  const client = COMPANIES[(i + 4) % COMPANIES.length]!;
  const eff = isoDate(2024, int(r, 1, 11), int(r, 1, 28));
  const months = [12, 24, 36][i % 3]!;
  const exp = isoDate(2024 + Math.floor(months / 12), Number(eff.slice(5, 7)), Number(eff.slice(8)));
  const [law, court] = LAWS[i % LAWS.length]!;
  const hasExpiry = i % 5 !== 0;
  const autoRenew = i % 2 === 0;
  const notice = `${[30, 60, 90][i % 3]} days`;
  const terms = ["Net 30", "Net 45", "Within 21 days of invoice"][i % 3]!;
  const obligations = OBLIGATIONS.slice(i % 3, (i % 3) + 3);
  const keyDates = [
    { date: eff, description: "Commencement Date" },
    { date: isoDate(2024, ((Number(eff.slice(5, 7)) + 1) % 12) + 1, 15), description: "First review meeting" },
  ];
  const title = ["Master Services Agreement", "Supply Agreement", "Consultancy Agreement"][i % 3]!;

  const gt: GT = {
    title,
    "parties[0].name": supplier,
    "parties[0].role": "Supplier",
    "parties[0].address": `${STREETS[i % STREETS.length]}, ${CITIES[i % CITIES.length]}`,
    "parties[1].name": client,
    "parties[1].role": "Client",
    "parties[1].address": `${STREETS[(i + 2) % STREETS.length]}, ${CITIES[(i + 3) % CITIES.length]}`,
    effectiveDate: eff,
    expiryDate: hasExpiry ? exp : null,
    term: `${months} months`,
    governingLaw: law,
    jurisdiction: court,
    paymentTerms: terms,
    terminationNotice: notice,
    autoRenew,
    obligations,
    "keyDates[0].date": keyDates[0]!.date,
    "keyDates[0].description": keyDates[0]!.description,
    "keyDates[1].date": keyDates[1]!.date,
    "keyDates[1].description": keyDates[1]!.description,
  };

  const draw = (doc: Doc) => {
    h(doc, title.toUpperCase(), 50, 60, 15);
    let y = 92;
    const para = (t: string, gap = 10) => {
      doc.font("Helvetica").fontSize(9.5).fillColor("#000").text(t, 50, y, { width: 495, align: "left" });
      y = doc.y + gap;
    };
    const clause = (n: string, t: string) => {
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#000").text(n, 50, y);
      y = doc.y + 3;
      para(t);
    };
    para(`This ${title} is made on ${fmtDate(eff, i)} between:`);
    para(`(1) ${supplier}, of ${gt["parties[0].address"]} ("the Supplier"); and`, 4);
    para(`(2) ${client}, of ${gt["parties[1].address"]} ("the Client").`);
    clause("1. Term",
      `This Agreement takes effect on the Commencement Date of ${fmtDate(eff, i)} and continues for a term of ${months} months${hasExpiry ? `, expiring on ${fmtDate(exp, i + 1)}` : ""}.`);
    clause("2. Renewal", autoRenew
      ? "This Agreement renews automatically for successive periods of twelve months unless either party gives notice."
      : "This Agreement does not renew automatically and ends at the expiry of the term.");
    clause("3. Payment", `The Client shall pay all undisputed invoices ${terms}.`);
    clause("4. Termination",
      `Either party may terminate this Agreement on ${notice} written notice to the other.`);
    clause("5. Obligations", obligations.map((o, n) => `5.${n + 1} ${o}`).join("\n"));
    clause("6. Governing law",
      `This Agreement is governed by ${law} and the parties submit to the exclusive jurisdiction of ${court}.`);
    clause("7. Key dates",
      `Commencement Date: ${fmtDate(keyDates[0]!.date, i)}. First review meeting: ${fmtDate(keyDates[1]!.date, i)}.`);
    void r;
  };

  return { gt, draw };
}

// ------------------------------------------------------------------- main

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(SAMPLES, { recursive: true });

  const jobs = [
    ...Array.from({ length: 20 }, (_, i) => ({ type: "invoice" as const, i, make: invoice })),
    ...Array.from({ length: 20 }, (_, i) => ({ type: "cv" as const, i, make: cv })),
    ...Array.from({ length: 10 }, (_, i) => ({ type: "contract" as const, i, make: contract })),
  ];

  for (const { type, i, make } of jobs) {
    const name = `${type}-${String(i + 1).padStart(2, "0")}`;
    const { gt, draw } = make(i);
    await writePdf(path.join(OUT, `${name}.pdf`), draw);
    fs.writeFileSync(
      path.join(OUT, `${name}.json`),
      JSON.stringify({ type, file: `${name}.pdf`, fields: gt }, null, 2),
    );
    if (i === 0) fs.copyFileSync(path.join(OUT, `${name}.pdf`), path.join(SAMPLES, `${type}.pdf`));
  }
  process.stdout.write(`${jobs.length} fixtures in evals/fixtures, 3 samples in public/samples\n`);
}

main();
