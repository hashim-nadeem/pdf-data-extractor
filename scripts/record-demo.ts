/**
 * Records public/demo.gif by driving the real app and encoding the frames in JS.
 *
 *   npm run dev          # in one terminal
 *   npm run demo         # in another
 *
 * Screenshot frames rather than a video export: Playwright's bundled ffmpeg is a
 * minimal build with no GIF encoder, and requiring a full ffmpeg install would
 * make this script unrunnable for anyone who clones the repo.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import { GIFEncoder, applyPalette, quantize } from "gifenc";
import { PNG } from "pngjs";

const URL = process.env.DEMO_URL ?? "http://localhost:3000";
const OUT = path.resolve(process.cwd(), "public/demo.gif");

const WIDTH = 960; // safely above the 900px split-view breakpoint
const HEIGHT = 560;
const FRAME_MS = 130;

async function main() {
  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "no-preference",
  });

  const frames: Buffer[] = [];
  const capture = async (count = 1) => {
    for (let i = 0; i < count; i++) {
      frames.push(await page.screenshot({ type: "png", animations: "allow" }));
      await page.waitForTimeout(FRAME_MS);
    }
  };

  await page.goto(URL);
  await page.getByText("Processed in memory. Nothing is stored.").waitFor();
  await capture(6);

  await page.getByRole("button", { name: "Sample invoice" }).click();
  await capture(8); // the stepper, mid-extraction

  const total = page.getByRole("button", { name: /^Total/ });
  await total.waitFor({ timeout: 120_000 });
  await page.waitForTimeout(1500); // let the PDF text layer settle
  await capture(4);

  // The interaction the project exists for: hover a field, see its source cited.
  for (const name of [/^Total/, /Invoice №/, /^Issue Date/]) {
    const row = page.getByRole("button", { name }).first();
    if (!(await row.count())) continue;
    await row.hover();
    await capture(5);
  }

  const cell = page.getByRole("cell").filter({ hasText: "Freight surcharge" }).first();
  if (await cell.count()) {
    await cell.getByRole("button").hover();
    await capture(5);
  }

  // Click pins the highlight and reveals the verbatim span.
  await page.getByRole("button", { name: /Invoice №/ }).first().click();
  await capture(9);
  await page.keyboard.press("Escape");
  await capture(3);

  await browser.close();
  writeGif(frames);
}

function writeGif(frames: Buffer[]) {
  if (!frames.length) throw new Error("no frames captured");
  const decoded = frames.map((b) => PNG.sync.read(b));
  const { width, height } = decoded[0]!;

  // One palette for the whole clip, sampled from a frame that has the result on
  // screen: per-frame palettes make a UI GIF shimmer between frames.
  const reference = decoded[Math.floor(decoded.length * 0.7)]!;
  const palette = quantize(new Uint8ClampedArray(reference.data), 96);

  const gif = GIFEncoder();
  for (const frame of decoded) {
    const index = applyPalette(new Uint8ClampedArray(frame.data), palette);
    gif.writeFrame(index, width, height, { palette, delay: FRAME_MS });
  }
  gif.finish();

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, gif.bytes());
  process.stdout.write(
    `${OUT}\n${frames.length} frames  ${width}x${height}  ${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB\n`,
  );
}

main();

export type { Page };
