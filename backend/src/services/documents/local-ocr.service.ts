import { spawn } from "child_process";
import { mkdtemp, readdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { config } from "../../config/env";
import { DOCX_MIME_TYPE, extractDocxText } from "./docx-text.service";

export interface DocumentOcrResult {
  text: string;
  averageConfidence: number;
}

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/bmp": ".bmp",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/tiff": ".tiff",
  "image/webp": ".webp",
};

const runCommand = (command: string, args: string[]): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", chunk => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", chunk => stderr.push(Buffer.from(chunk)));
    child.once("error", error => {
      const reason = (error as NodeJS.ErrnoException).code === "ENOENT" ? "BINARY_NOT_FOUND" : error.message;
      reject(new Error(`LOCAL_OCR_${reason}: ${command}`));
    });
    child.once("close", code => {
      if (code === 0) return resolve(Buffer.concat(stdout).toString("utf8"));
      const details = Buffer.concat(stderr).toString("utf8").trim();
      reject(new Error(`LOCAL_OCR_COMMAND_FAILED: ${command} exited with code ${code}${details ? ` - ${details}` : ""}`));
    });
  });

const parseTsv = (tsv: string): DocumentOcrResult => {
  const textLines: string[] = [];
  const confidences: number[] = [];
  let currentLine = "";
  let previousLineKey = "";

  for (const row of tsv.split(/\r?\n/).slice(1)) {
    const columns = row.split("\t");
    if (columns.length < 12 || columns[0] !== "5") continue;

    const word = columns.slice(11).join("\t").trim();
    if (!word) continue;

    // page/block/paragraph/line identify a text line; word_num must not be part of this key.
    const lineKey = columns.slice(1, 5).join(":");
    if (previousLineKey && lineKey !== previousLineKey) {
      textLines.push(currentLine);
      currentLine = "";
    }
    currentLine = currentLine ? `${currentLine} ${word}` : word;
    previousLineKey = lineKey;

    const confidence = Number(columns[10]);
    if (Number.isFinite(confidence) && confidence >= 0) confidences.push(confidence / 100);
  }

  if (currentLine) textLines.push(currentLine);
  const averageConfidence = confidences.length
    ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
    : 0;

  return { text: textLines.join("\n"), averageConfidence };
};

const recognizeImage = async (imagePath: string): Promise<DocumentOcrResult> => {
  const tsv = await runCommand(config.tesseractCommand, [
    imagePath,
    "stdout",
    "-l",
    config.ocrLanguages,
    "--oem",
    "1",
    "--psm",
    "6",
    "tsv",
  ]);
  return parseTsv(tsv);
};

const convertPdfToImages = async (pdfPath: string, workDir: string): Promise<string[]> => {
  const outputPrefix = path.join(workDir, "page");
  await runCommand(config.pdftoppmCommand, [
    "-png",
    "-r",
    String(config.ocrPdfDpi),
    "-f",
    "1",
    "-l",
    String(config.ocrMaxPdfPages),
    pdfPath,
    outputPrefix,
  ]);

  const filenames = (await readdir(workDir))
    .filter(filename => /^page-\d+\.png$/i.test(filename))
    .sort((left, right) => Number(left.match(/\d+/)?.[0]) - Number(right.match(/\d+/)?.[0]));
  if (!filenames.length) throw new Error("LOCAL_OCR_PDF_CONVERSION_EMPTY");
  return filenames.map(filename => path.join(workDir, filename));
};

/**
 * Free, local text extraction for the intake pipeline. Images/PDFs go through Tesseract (word
 * confidence from TSV; PDFs are rasterised first because Tesseract does not read PDF directly).
 * .docx uploads (the mau_don templates) carry machine-readable text, so they are read natively with
 * full confidence instead of being OCR'd.
 */
export const runDocumentOcr = async (buffer: Buffer, mimeType: string): Promise<DocumentOcrResult> => {
  const normalizedMimeType = mimeType.toLowerCase().split(";")[0].trim();

  if (normalizedMimeType === DOCX_MIME_TYPE) {
    // Native text: exact, not OCR'd — report full confidence so field extraction trusts it.
    return { text: extractDocxText(buffer), averageConfidence: 1 };
  }

  const isPdf = normalizedMimeType === "application/pdf";
  const imageExtension = IMAGE_EXTENSIONS[normalizedMimeType];
  if (!isPdf && !imageExtension) throw new Error(`LOCAL_OCR_UNSUPPORTED_MIME_TYPE: ${mimeType}`);

  const workDir = await mkdtemp(path.join(tmpdir(), "vaic-ocr-"));
  try {
    const inputPath = path.join(workDir, `input${isPdf ? ".pdf" : imageExtension}`);
    await writeFile(inputPath, buffer);
    const imagePaths = isPdf ? await convertPdfToImages(inputPath, workDir) : [inputPath];
    const pageResults: DocumentOcrResult[] = [];

    // Sequential processing caps CPU/RAM usage for the synchronous upload endpoint.
    for (const imagePath of imagePaths) pageResults.push(await recognizeImage(imagePath));

    const confidencePages = pageResults.filter(result => result.text.trim());
    const averageConfidence = confidencePages.length
      ? confidencePages.reduce((sum, result) => sum + result.averageConfidence, 0) / confidencePages.length
      : 0;
    return {
      text: pageResults.map(result => result.text).filter(Boolean).join("\n\n"),
      averageConfidence,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
};
