import { Router, Request, Response } from 'express';
import multer from 'multer';
import { requireUserId, AuthenticatedRequest } from '../middleware/auth.js';
import { ResumeRepository } from '../../repositories/resumeRepository.js';
import { uploadToS3, getPresignedUrl, deleteFromS3 } from '../../storage/s3Client.js';
import { extractResumeText } from '../../storage/resumeParser.js';
import { env } from '../../config/index.js';
import path from 'path';
import crypto from 'crypto';

const router = Router();
const resumeRepo = new ResumeRepository();

// Store file in memory for processing; we'll push it to S3 ourselves
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and DOCX files are accepted.'));
    }
  },
});

/**
 * POST /api/me/resumes
 * Accept a PDF or DOCX upload, store in S3, extract text, save Resume row.
 */
router.post('/', requireUserId, upload.single('file'), async (req: Request, res: Response) => {
  const { userId } = req as AuthenticatedRequest;

  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded. Send a PDF or DOCX in the "file" field.' });
    return;
  }

  try {
    const ext = path.extname(req.file.originalname).toLowerCase();
    const uniqueKey = `resumes/${userId}/${crypto.randomUUID()}${ext}`;

    // 1. Upload to S3/MinIO
    await uploadToS3({
      key: uniqueKey,
      body: req.file.buffer,
      contentType: req.file.mimetype,
    });

    // 2. Extract plain text for AI processing
    const parsedText = await extractResumeText(req.file.buffer, req.file.originalname);

    // 3. Save Resume row (deactivates previous active resume)
    const resume = await resumeRepo.create({
      userId,
      filePath: uniqueKey,
      parsedText,
    });

    res.status(201).json({
      id: resume.id,
      filePath: resume.filePath,
      isActive: resume.isActive,
      createdAt: resume.createdAt,
      // Return a brief text preview so the frontend can confirm extraction
      parsedTextPreview: parsedText.slice(0, 200) + (parsedText.length > 200 ? '...' : ''),
    });
  } catch (err: any) {
    console.error('[ResumeRoute] Upload failed:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/me/resumes
 * List the authenticated user's resume history.
 */
router.get('/', requireUserId, async (req: Request, res: Response) => {
  const { userId } = req as AuthenticatedRequest;
  try {
    const resumes = await resumeRepo.findByUser(userId);
    // Generate pre-signed download URLs for each resume
    const withUrls = await Promise.all(
      resumes.map(async (r) => ({
        id: r.id,
        filePath: r.filePath,
        isActive: r.isActive,
        createdAt: r.createdAt,
        downloadUrl: await getPresignedUrl(r.filePath),
      }))
    );
    res.json(withUrls);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/me/resumes/:id/activate
 * Make an existing resume the active one used for new applications.
 */
router.patch('/:id/activate', requireUserId, async (req: Request, res: Response) => {
  const { userId } = req as AuthenticatedRequest;
  const id = req.params['id'] as string;
  try {
    const resume = await resumeRepo.setActive(userId, id);
    res.json({ id: resume.id, isActive: resume.isActive });
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

/**
 * DELETE /api/me/resumes/:id
 * Remove a resume from history and from S3 storage.
 */
router.delete('/:id', requireUserId, async (req: Request, res: Response) => {
  const { userId } = req as AuthenticatedRequest;
  const id = req.params['id'] as string;
  try {
    const deleted = await resumeRepo.delete(userId, id);
    await deleteFromS3(deleted.filePath).catch((err) => {
      // The DB row is already gone; log and continue rather than failing
      // the request over an orphaned S3 object.
      console.error(`[ResumeRoute] Failed to delete S3 object ${deleted.filePath}:`, err);
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

export default router;
