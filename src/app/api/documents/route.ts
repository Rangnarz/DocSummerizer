import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Determine file type from file extension first, MIME as fallback
function detectFileType(file: File): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'txt') return 'txt';

  // MIME-type fallback
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (file.type === 'text/plain') return 'txt';

  return null;
}

// Extract readable text from a file buffer
async function extractTextFromBuffer(buffer: Buffer, fileType: string): Promise<string> {
  switch (fileType) {
    case 'txt': {
      const text = buffer.toString('utf-8').trim();
      if (!text) throw new Error('ไฟล์ TXT ว่างเปล่า');
      return text;
    }

    case 'pdf': {
      // unpdf is designed for serverless/Node.js and does NOT require browser globals (no DOMMatrix)
      const { extractText } = await import('unpdf');

      let result: { text: string; totalPages: number };
      try {
        result = await extractText(new Uint8Array(buffer), { mergePages: true });
      } catch (parseError) {
        console.error('unpdf extractText failed:', parseError);
        throw new Error('ไม่สามารถอ่านไฟล์ PDF ได้ ไฟล์อาจเสียหายหรือมีรหัสผ่านป้องกัน');
      }

      const text = (result.text || '').trim();

      if (!text || text.length < 50) {
        throw new Error(
          `ไม่สามารถดึงข้อความจาก PDF ได้ (${result.totalPages} หน้า)\n` +
          'PDF นี้อาจเป็นไฟล์สแกน (รูปภาพ) ซึ่งไม่มีข้อความที่อ่านได้\n' +
          'กรุณาแปลงเป็น PDF ที่มีข้อความ หรืออัปโหลดเป็นไฟล์ .txt แทน'
        );
      }

      return text;
    }

    case 'docx': {
      throw new Error(
        'ขณะนี้ยังไม่รองรับไฟล์ DOCX กรุณาแปลงเป็น PDF หรือ TXT ก่อนอัปโหลด'
      );
    }

    default:
      throw new Error(`ประเภทไฟล์ไม่ถูกต้อง: ${fileType}`);
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
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'ไม่พบไฟล์ที่แนบมา' }, { status: 400 });
    }

    // Detect file type from extension (most reliable) then MIME
    const fileType = detectFileType(file);
    if (!fileType) {
      return NextResponse.json(
        { error: 'ประเภทไฟล์ไม่ถูกต้อง รองรับเฉพาะ PDF, DOCX และ TXT' },
        { status: 400 }
      );
    }

    // Check file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'ขนาดไฟล์เกินกำหนด (สูงสุด 10MB)' },
        { status: 400 }
      );
    }

    // Read file into buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract text from the buffer
    let content: string;
    try {
      content = await extractTextFromBuffer(buffer, fileType);
    } catch (extractError) {
      const message =
        extractError instanceof Error
          ? extractError.message
          : 'ไม่สามารถดึงข้อความจากเอกสารได้';
      return NextResponse.json({ error: message }, { status: 422 });
    }

    // Validate extracted content length
    if (!content || content.length < 20) {
      return NextResponse.json(
        { error: 'ไม่สามารถดึงข้อความที่มีความหมายจากเอกสารได้' },
        { status: 422 }
      );
    }

    // Create document record in database
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
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'เกิดข้อผิดพลาดในการประมวลผลเอกสาร',
      },
      { status: 500 }
    );
  }
}
