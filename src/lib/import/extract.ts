/**
 * File extraction for the import centre (browser only).
 *
 * Turns an uploaded CSV, XLSX or PDF into delimited text the existing parsers
 * already understand, and reports honestly how reliable that extraction was.
 * PDFs are best-effort: a text-layer PDF usually reads well, a scanned image
 * cannot be read at all here and is reported as such rather than guessed at.
 */

export type ExtractionMethod = "csv" | "xlsx" | "pdf-text" | "paste";

export type Extraction = {
  text: string;
  method: ExtractionMethod;
  /** How much of the original document survived the conversion. */
  confidence: "high" | "medium" | "low" | "none";
  notes: string[];
  sheetNames?: string[];
  pageCount?: number;
};

const DELIMITED = /\.(csv|tsv|txt)$/i;
const SHEET = /\.(xlsx|xls|xlsm|ods)$/i;
const PDF = /\.pdf$/i;

export function isSupportedFile(file: File): boolean {
  return DELIMITED.test(file.name) || SHEET.test(file.name) || PDF.test(file.name);
}

export async function extractFile(file: File): Promise<Extraction> {
  if (SHEET.test(file.name)) return extractSheet(file);
  if (PDF.test(file.name)) return extractPdf(file);
  const text = await file.text();
  return {
    text,
    method: "csv",
    confidence: "high",
    notes: ["Delimited text read directly — no conversion was needed."],
  };
}

async function extractSheet(file: File): Promise<Extraction> {
  const XLSX = await import("xlsx");
  const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheetNames = book.SheetNames;
  // Pick the sheet with the most rows; broker workbooks put summary tabs first.
  let best = "";
  let bestText = "";
  for (const name of sheetNames) {
    const sheet = book.Sheets[name];
    if (!sheet) continue;
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    if (csv.split("\n").length > bestText.split("\n").length) {
      best = name;
      bestText = csv;
    }
  }
  return {
    text: bestText,
    method: "xlsx",
    confidence: bestText.trim() === "" ? "none" : "high",
    notes:
      bestText.trim() === ""
        ? ["The workbook had no readable rows."]
        : [
            `Read sheet "${best}"${sheetNames.length > 1 ? ` of ${sheetNames.length}` : ""}. Formulas were read as their last saved values.`,
          ],
    sheetNames,
  };
}

/** Group PDF text items into lines, then into pipe-delimited columns by x-gap. */
export async function extractPdf(file: File): Promise<Extraction> {
  const notes: string[] = [];
  try {
    const pdfjs = await import("pdfjs-dist");
    const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default as string;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const lines: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const items = (content.items as unknown[])
        .filter((i): i is { str: string; transform: number[] } => {
          const candidate = i as { str?: unknown; transform?: unknown };
          return typeof candidate.str === "string" && Array.isArray(candidate.transform);
        })
        .map((i) => ({ str: i.str, x: i.transform[4] ?? 0, y: Math.round((i.transform[5] ?? 0) / 3) }));

      const byLine = new Map<number, { str: string; x: number }[]>();
      for (const item of items) {
        if (item.str.trim() === "") continue;
        const list = byLine.get(item.y) ?? [];
        list.push(item);
        byLine.set(item.y, list);
      }
      const ordered = [...byLine.entries()].sort((a, b) => b[0] - a[0]);
      for (const [, cells] of ordered) {
        cells.sort((a, b) => a.x - b.x);
        let line = "";
        let prevEnd = -Infinity;
        for (const cell of cells) {
          if (prevEnd !== -Infinity && cell.x - prevEnd > 6) line += "|";
          else if (line !== "") line += " ";
          line += cell.str.trim();
          prevEnd = cell.x + cell.str.length * 4;
        }
        if (line.trim() !== "") lines.push(line.replace(/\s*\|\s*/g, "|"));
      }
    }

    const text = lines.join("\n");
    if (text.trim() === "") {
      return {
        text: "",
        method: "pdf-text",
        confidence: "none",
        notes: [
          "This PDF has no text layer — it is most likely a scan or an image.",
          "Nothing can be extracted from it here. Export a CSV or XLSX from your broker, or type the rows in manually.",
        ],
        pageCount: doc.numPages,
      };
    }

    const columnar = lines.filter((l) => l.includes("|")).length;
    const ratio = columnar / lines.length;
    notes.push(`Read ${doc.numPages} page${doc.numPages === 1 ? "" : "s"} of embedded text.`);
    notes.push(
      ratio > 0.5
        ? "Column boundaries were inferred from spacing. Check the preview — a shifted column changes every amount."
        : "Column boundaries were hard to infer from this layout. Treat every row as needing review.",
    );
    if (file.size > 0) notes.push("If the PDF is password protected or a scan, a CSV/XLSX export will always be more accurate.");

    return {
      text,
      method: "pdf-text",
      confidence: ratio > 0.6 ? "medium" : "low",
      notes,
      pageCount: doc.numPages,
    };
  } catch (error) {
    return {
      text: "",
      method: "pdf-text",
      confidence: "none",
      notes: [
        error instanceof Error && /password/i.test(error.message)
          ? "This PDF is password protected. Remove the password and try again."
          : "This PDF could not be opened for text extraction.",
        "Export a CSV or XLSX from your broker instead — those import exactly.",
      ],
    };
  }
}
