import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';

// Use /tmp on serverless (Vercel), fallback to OS temp dir
const UPLOAD_DIR = path.join(os.tmpdir(), 'briefly-uploads');

async function ensureUploadDir() {
  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }
}

// Extract text from file buffer directly (no CLI tools needed)
async function extractTextFromBuffer(
  buffer: Uint8Array,
  fileType: string,
  _filePath?: string
): Promise<string> {
  try {
    switch (fileType) {
      case 'txt': {
        return new TextDecoder('utf-8').decode(buffer).trim();
      }
      case 'pdf': {
        // Try to use pdf-parse if available, otherwise read raw text
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const pdfParse = (await import(/* webpackIgnore: true */ 'pdf-parse' as string)).default;
          const data = await pdfParse(buffer);
          return (data.text || '').trim();
        } catch {
          // Fallback: attempt basic text extraction from buffer
          const text = new TextDecoder('utf-8')
            .decode(buffer)
            .replace(/[^\x20-\x7E\n\r\t\u0E00-\u0E7F]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (text.length > 50) return text;
          throw new Error(
            'PDF text extraction is not available. Please upload a .txt file instead, or install pdf-parse.'
          );
        }
      }
      case 'docx': {
        throw new Error(
          'DOCX file processing is not available in serverless environment. Please upload a .txt file instead.'
        );
      }
      default:
        throw new Error(`Unsupported file type: ${fileType}`);
    }
  } catch (error) {
    console.error('Text extraction error:', error);
    throw error instanceof Error
      ? error
      : new Error('Failed to extract text from document');
  }
}

// GET - List all documents
export async function GET() {
  try {
    const documents = await db.document.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        tags: true,
      },
    });
    return NextResponse.json(documents);
  } catch (error) {
    console.error('Failed to fetch documents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch documents' },
      { status: 500 }
    );
  }
}

// POST - Upload a new document
export async function POST(request: NextRequest) {
  try {
    await ensureUploadDir();

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Determine file type
    let fileType = 'txt';
    if (file.type === 'application/pdf') {
      fileType = 'pdf';
    } else if (
      file.type ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      fileType = 'docx';
    } else if (file.type === 'text/plain') {
      fileType = 'txt';
    } else {
      return NextResponse.json(
        { error: 'Unsupported file type' },
        { status: 400 }
      );
    }

    // Check file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File size exceeds 10MB limit' },
        { status: 400 }
      );
    }

    // Read file into buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Extract text directly from buffer (no filesystem needed for txt)
    let content: string;
    let tempFilePath: string | undefined = undefined;

    try {
      content = await extractTextFromBuffer(buffer, fileType);
    } catch (extractError) {
      // If direct extraction fails, try via temp file
      const tempFileName = `${Date.now()}-${file.name}`;
      tempFilePath = path.join(UPLOAD_DIR, tempFileName);
      await writeFile(tempFilePath, buffer);

      try {
        content = await extractTextFromBuffer(buffer, fileType, tempFilePath);
      } catch {
        throw extractError;
      }
    }

    try {
      if (!content || content.length < 10) {
        throw new Error('Could not extract meaningful text from the document');
      }

      // Create document record
      const document = await db.document.create({
        data: {
          filename: file.name,
          fileType,
          fileSize: file.size,
          content,
          status: 'uploaded',
          summaryMode: 'general',
          summaryLength: 'medium',
        },
        include: {
          tags: true,
        },
      });

      return NextResponse.json(document);
    } finally {
      // Clean up temporary file if created
      if (tempFilePath) {
        try {
          await unlink(tempFilePath);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to process document',
      },
      { status: 500 }
    );
  }
}
