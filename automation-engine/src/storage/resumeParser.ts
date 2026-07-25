import path from 'path';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

/**
 * Extract plain text from an uploaded resume file (PDF or DOCX) so the brain
 * engine can use it for scoring/tailoring. Throws on unsupported extensions
 * or unreadable files.
 */
export async function extractResumeText(buffer: Buffer, originalFilename: string): Promise<string> {
  const ext = path.extname(originalFilename).toLowerCase();

  try {
    if (ext === '.pdf') {
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        return result.text.trim();
      } finally {
        await parser.destroy();
      }
    }

    if (ext === '.docx') {
      const result = await mammoth.extractRawText({ buffer });
      return result.value.trim();
    }

    throw new Error(`Unsupported resume file type: "${ext}". Only .pdf and .docx are supported.`);
  } catch (err: any) {
    throw new Error(`Failed to extract text from resume: ${err.message}`);
  }
}

