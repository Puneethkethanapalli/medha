import { File } from 'expo-file-system';
import { extractText, getPageCount, isAvailable } from 'expo-pdf-text-extract';
import PdfThumbnail from 'react-native-pdf-thumbnail';
import * as XLSX from 'xlsx';
import type { Attachment } from '@/types';

// ── PDF extraction ────────────────────────────────────────────────────

export async function extractPdfText(attachment: Attachment): Promise<{ text: string; pageCount: number } | null> {
  if (!isAvailable()) {
    return null;
  }
  try {
    const [text, pages] = await Promise.all([
      extractText(attachment.uri),
      getPageCount(attachment.uri),
    ]);
    return { text, pageCount: pages };
  } catch {
    return null;
  }
}

// ── PDF page-to-image rendering ───────────────────────────────────────

const MAX_RENDERED_PAGES = 10;
const RENDER_QUALITY = 80; // JPEG quality (0-100)

/**
 * Render PDF pages as JPEG images for vision-capable models.
 * Used by OpenAI-compat providers (OpenRouter, MiniMax) that don't support native PDF upload.
 * Anthropic and Gemini handle PDFs natively — this is not needed for them.
 *
 * Caps at MAX_RENDERED_PAGES to keep context window usage reasonable.
 */
export async function renderPdfPagesToImages(
  uri: string,
  pageCount: number
): Promise<string[]> {
  const pagesToRender = Math.min(pageCount, MAX_RENDERED_PAGES);
  const imageUris: string[] = [];

  for (let i = 0; i < pagesToRender; i++) {
    try {
      const result = await PdfThumbnail.generate(uri, i, RENDER_QUALITY);
      imageUris.push(result.uri);
    } catch {
      // Skip failed pages — partial rendering is better than nothing
      continue;
    }
  }

  return imageUris;
}

// ── DOCX extraction ───────────────────────────────────────────────────

async function extractDocxText(attachment: Attachment): Promise<string | null> {
  try {
    const response = await fetch(attachment.uri);
    const arrayBuffer = await response.arrayBuffer();
    const mammoth = await import('mammoth');
    const result = await mammoth.default.extractRawText({ arrayBuffer });
    return result.value || null;
  } catch {
    return null;
  }
}

// ── XLSX extraction ───────────────────────────────────────────────────

function extractXlsxText(attachment: Attachment): string | null {
  try {
    const file = new File(attachment.uri);
    if (!file.exists) return null;
    const base64 = file.base64Sync();
    const workbook = XLSX.read(base64, { type: 'base64' });
    let result = '';
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      result += `--- Sheet: ${sheetName} ---\n${csv}\n\n`;
    }
    return result.trim() || null;
  } catch {
    return null;
  }
}

// ── Unified document text reader ──────────────────────────────────────

export async function readDocumentTextAsync(attachment: Attachment): Promise<{
  text: string | null;
  pageCount?: number;
}> {
  switch (attachment.mimeType) {
    case 'application/pdf': {
      const pdfResult = await extractPdfText(attachment);
      if (pdfResult) {
        return { text: pdfResult.text, pageCount: pdfResult.pageCount };
      }
      return { text: null };
    }

    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
      const docxText = await extractDocxText(attachment);
      return { text: docxText };
    }

    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
      const xlsxText = extractXlsxText(attachment);
      return { text: xlsxText };
    }

    default:
      return { text: null };
  }
}
