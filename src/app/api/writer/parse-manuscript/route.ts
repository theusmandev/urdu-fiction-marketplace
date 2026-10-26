import { NextRequest, NextResponse } from 'next/server';
import { requireWriter } from '@/lib/auth/requireRole';
import { extractTextFromBuffer, splitManuscriptIntoChapters } from '@/lib/text/manuscript-parser';
import { checkRateLimit } from '@/lib/writer/rate-limit';

// Strict 5 MB file size limit
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

// Rate limit: max 10 manuscript parse requests per user per minute
const MAX_REQUESTS_PER_MINUTE = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    // 1. Authorize writer and ensure approved status
    const authContext = await requireWriter();
    const { user, profile, writerProfile } = authContext;

    // Enforce approved writer status (admins also permitted)
    if (profile.role !== 'admin' && writerProfile.status !== 'approved') {
      return NextResponse.json(
        {
          success: false,
          error: 'Only approved writers can upload and parse manuscripts.',
        },
        { status: 403 }
      );
    }

    // 2. Per-user rate limiting
    const rateCheck = checkRateLimit(user.id, MAX_REQUESTS_PER_MINUTE, RATE_LIMIT_WINDOW_MS);
    if (!rateCheck.allowed) {
      const retryAfterSeconds = Math.max(1, Math.ceil((rateCheck.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        {
          success: false,
          error: `Upload rate limit exceeded. Please wait ${retryAfterSeconds} seconds before uploading another manuscript.`,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfterSeconds),
          },
        }
      );
    }

    // 3. Extract uploaded file
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file uploaded.' },
        { status: 400 }
      );
    }

    // 4. Validate file size (strict 5 MB limit)
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        {
          success: false,
          error: `File size exceeds the 5 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB). Please upload a smaller file.`,
        },
        { status: 400 }
      );
    }

    // 5. Validate file extension (accepts ONLY .docx and .txt)
    const lowerName = file.name.toLowerCase();
    const isDocx = lowerName.endsWith('.docx');
    const isTxt = lowerName.endsWith('.txt');

    if (!isDocx && !isTxt) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unsupported file format. Only Microsoft Word (.docx) and plain text (.txt) files are accepted.',
        },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 6. Magic bytes verification for .docx
    if (isDocx) {
      // DOCX files are ZIP archives starting with PK (0x50 0x4B)
      if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4B) {
        return NextResponse.json(
          {
            success: false,
            error: 'The uploaded file does not match a valid Microsoft Word (.docx) package.',
          },
          { status: 400 }
        );
      }
    }

    // 7. Extract raw text in memory (never written to disk or storage)
    const rawText = await extractTextFromBuffer(buffer, file.name);

    if (!rawText || rawText.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Uploaded manuscript is empty or contains no extractable text.',
        },
        { status: 400 }
      );
    }

    // 8. Split text into chapter previews (safe cleaning only; no silent Arabic letter conversion)
    const chapters = splitManuscriptIntoChapters(rawText);

    return NextResponse.json({
      success: true,
      fileName: file.name,
      fileSize: file.size,
      rawText: rawText,
      totalChaptersDetected: chapters.length,
      chapters,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to parse manuscript file.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
