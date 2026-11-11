import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { requireAuth } from './auth.js';
import { addFileRecord, getStorageUsage, getUserById } from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();
const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads');

// Ensure root upload directory exists
if (!fs.existsSync(UPLOAD_ROOT)) {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
}

// Multer storage engine per user
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userDir = path.join(UPLOAD_ROOT, req.user.id);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    cb(null, `photo_${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5 MB max (client optimizes to ~50KB anyway)
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are permitted'));
    }
  }
});

// Upload image
router.post('/', requireAuth, upload.single('photo'), (req, res) => {
  try {
    const user = getUserById(req.user.id);
    if (user?.is_banned) {
      if (req.file) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      return res.status(403).json({ 
        error: `Account suspended. Photo uploads are disabled: ${user.ban_reason || 'Contact administrator.'}`,
        isBanned: true
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No photo provided' });
    }

    const currentUsage = getStorageUsage(req.user.id);
    if (currentUsage.totalBytes + req.file.size > currentUsage.storageLimitBytes) {
      // Remove uploaded file if quota is exceeded
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        console.warn('Failed to delete rejected file:', e);
      }
      return res.status(400).json({ 
        error: `Storage quota exceeded (${currentUsage.storageLimitMb} MB limit). Please contact an administrator.` 
      });
    }

    const fileId = `file_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const relativeUrl = `/uploads/${req.user.id}/${req.file.filename}`;

    addFileRecord(
      fileId,
      req.user.id,
      req.file.filename,
      req.file.originalname,
      req.file.size
    );

    const storageUsage = getStorageUsage(req.user.id);

    res.json({
      url: relativeUrl,
      sizeBytes: req.file.size,
      filename: req.file.filename,
      storageUsage
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to process photo upload' });
  }
});

export default router;

