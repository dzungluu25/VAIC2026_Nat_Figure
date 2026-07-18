import { inflateRawSync } from "zlib";

/**
 * Native text extraction for .docx uploads (mau_don templates are .docx). A .docx is a ZIP whose
 * `word/document.xml` holds the real, machine-readable text — so unlike a scanned image this needs
 * no OCR and yields exact text. Implemented with the built-in zlib only (no ZIP/docx dependency):
 * we read the ZIP central directory, locate document.xml, inflate it, then strip the WordprocessingML
 * markup to plain text. Paragraphs/line breaks become newlines and tabs are preserved so the
 * downstream form-marker and field extractors see the same line structure as the OCR path.
 */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const DOCX_ENTRY = "word/document.xml";

interface ZipEntry {
  filename: string;
  compressionMethod: number;
  compressedSize: number;
  localHeaderOffset: number;
}

const findEndOfCentralDirectory = (buffer: Buffer): number => {
  // The EOCD record is at the end; scan backwards (past any archive comment) for its signature.
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  throw new Error("DOCX_INVALID_ZIP: end-of-central-directory not found");
};

const readCentralDirectory = (buffer: Buffer): ZipEntry[] => {
  const eocd = findEndOfCentralDirectory(buffer);
  const totalEntries = buffer.readUInt16LE(eocd + 10);
  let pointer = buffer.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];

  for (let index = 0; index < totalEntries; index += 1) {
    if (buffer.readUInt32LE(pointer) !== CENTRAL_DIR_SIGNATURE) break;
    const compressionMethod = buffer.readUInt16LE(pointer + 10);
    const compressedSize = buffer.readUInt32LE(pointer + 20);
    const filenameLength = buffer.readUInt16LE(pointer + 28);
    const extraLength = buffer.readUInt16LE(pointer + 30);
    const commentLength = buffer.readUInt16LE(pointer + 32);
    const localHeaderOffset = buffer.readUInt32LE(pointer + 42);
    const filename = buffer.toString("utf8", pointer + 46, pointer + 46 + filenameLength);
    entries.push({ filename, compressionMethod, compressedSize, localHeaderOffset });
    pointer += 46 + filenameLength + extraLength + commentLength;
  }
  return entries;
};

const readEntryBytes = (buffer: Buffer, entry: ZipEntry): Buffer => {
  if (buffer.readUInt32LE(entry.localHeaderOffset) !== LOCAL_HEADER_SIGNATURE) {
    throw new Error("DOCX_INVALID_ZIP: local file header not found");
  }
  const filenameLength = buffer.readUInt16LE(entry.localHeaderOffset + 26);
  const extraLength = buffer.readUInt16LE(entry.localHeaderOffset + 28);
  const dataStart = entry.localHeaderOffset + 30 + filenameLength + extraLength;
  const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize);
  if (entry.compressionMethod === 0) return compressed; // stored
  if (entry.compressionMethod === 8) return inflateRawSync(compressed); // deflate
  throw new Error(`DOCX_UNSUPPORTED_COMPRESSION: method ${entry.compressionMethod}`);
};

const decodeXmlEntities = (text: string): string =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&"); // last, so a literal "&amp;amp;" is not double-decoded

const documentXmlToText = (xml: string): string => {
  const withBreaks = xml
    .replace(/<w:tab\b[^>]*\/?>/g, "\t")
    .replace(/<w:br\b[^>]*\/?>/g, "\n")
    .replace(/<\/w:p>/g, "\n"); // each paragraph ends a line
  const stripped = withBreaks.replace(/<[^>]+>/g, ""); // drop all remaining tags
  return decodeXmlEntities(stripped)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

export const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Returns the plain text of a .docx buffer. Throws DOCX_* on a malformed archive. */
export const extractDocxText = (buffer: Buffer): string => {
  const entries = readCentralDirectory(buffer);
  const documentEntry = entries.find(entry => entry.filename === DOCX_ENTRY);
  if (!documentEntry) throw new Error("DOCX_MISSING_DOCUMENT_XML: not a Word document");
  const xml = readEntryBytes(buffer, documentEntry).toString("utf8");
  return documentXmlToText(xml);
};
