import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from server directory or root directory
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config(); // fallback to current working directory

import authRoutes, { requireAuth } from './routes/auth.js';
import syncRoutes from './routes/sync.js';
import uploadRoutes from './routes/upload.js';
import adminRoutes from './routes/admin.js';

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOAD_ROOT)) {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
}

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(cookieParser());
// Large legacy records can include embedded photos. Authenticate before parsing them.
app.use('/api/sync', requireAuth, express.json({ limit: '150mb' }));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Serve uploaded photos directly
app.use('/uploads', express.static(UPLOAD_ROOT));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/admin', adminRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request is too large to synchronize' });
  }
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 Pronto Server running on http://localhost:${PORT}`);
});

