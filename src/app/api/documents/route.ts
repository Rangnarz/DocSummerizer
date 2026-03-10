import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const execAsync = promisify(exec);

// Ensure upload directory exists
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

async function ensureUploadDir() {
  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }
}

// Extract text from different file types
async function extractTextFromFile(
  filePath: string,
  fileType: string
): Promise<string> {
  try {
    switch (fileType) {
      case 'pdf': {
        // Use pdftotext for PDF extraction
        const { stdout } = await execAsync(`pdftotext -layout "${filePath}" -`);
        return stdout.trim();
      }
      case 'docx': {
        // Use pandoc for DOCX extraction
        const { stdout } = await execAsync(
          `pandoc -f docx -t plain "${filePath}"`
        );
        return stdout.trim();
      }
      case 'txt': {
        // Read text file directly
        const { readFile } = await import('fs/promises');
        const content = await readFile(filePath, 'utf-8');
        return content.trim();
      }
      default:
        throw new Error(`Unsupported file type: ${fileType}`);
    }
  } catch (error) {
    console.error('Text extraction error:', error);
    throw new Error('Failed to extract text from document');
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

    // Save file temporarily
    const buffer = Buffer.from(await file.arrayBuffer());
    const tempFileName = `${Date.now()}-${file.name}`;
    const tempFilePath = path.join(UPLOAD_DIR, tempFileName);

    await writeFile(tempFilePath, buffer);

    try {
      // Extract text from file
      const content = await extractTextFromFile(tempFilePath, fileType);

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
      // Clean up temporary file
      try {
        await unlink(tempFilePath);
      } catch {
        // Ignore cleanup errors
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
