import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { setImmediate, setInterval, clearInterval } from 'node:timers';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { db, getAllUsersStats, getStorageUsage, runTransaction } from '../db.js';

db.exec(`CREATE TABLE IF NOT EXISTS optimizer_jobs (
  id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL
)`);
function save(job) {
  job.heartbeat = Date.now();
  db.prepare('UPDATE optimizer_jobs SET status = ?, data = ? WHERE id = ?').run(job.status, JSON.stringify(job), job.id);
}

function recoverStaleJobs() {
  for (const row of db.prepare("SELECT data FROM optimizer_jobs WHERE status = 'running'").all()) {
    const job = JSON.parse(row.data);
    let ownerAlive = true;
    try { if (job.ownerPid) process.kill(job.ownerPid, 0); } catch (err) { if (err.code === 'ESRCH') ownerAlive = false; }
    if (!ownerAlive || (!job.ownerPid && Date.now() - (job.heartbeat || job.createdAt) > 120000)) {
      job.status = 'interrupted';
      job.stage = 'interrupted';
      job.finishedAt = Date.now();
      save(job);
    }
  }
}

export function getOptimizerJob() {
  recoverStaleJobs();
  const row = db.prepare('SELECT status, data FROM optimizer_jobs ORDER BY created_at DESC, rowid DESC LIMIT 1').get();
  if (!row) return null;
  return { ...JSON.parse(row.data), status: row.status };
}

export function getOptimizerSummary() {
  const totals = {};
  for (const row of db.prepare("SELECT data FROM optimizer_jobs WHERE status = 'completed' ORDER BY created_at ASC, rowid ASC").all()) {
    const job = JSON.parse(row.data);
    for (const user of job.users || []) {
      const item = totals[user.id] ||= { savedBytes: 0, optimized: 0, estimatedBytes: null, previewAt: null };
      if (job.mode === 'optimize') { item.savedBytes += user.savedBytes || 0; item.optimized += user.optimized || 0; item.estimatedBytes = null; item.previewAt = null; }
      else { item.estimatedBytes = user.estimatedBytes || 0; item.previewAt = job.finishedAt; }
    }
  }
  return totals;
}

function respondWith(handler, userId, body) {
  let status = 200;
  let result;
  const response = {
    status(code) { status = code; return this; },
    json(data) { result = data; return this; },
    sendStatus(code) { status = code; return this; }
  };
  handler({ params: { id: userId }, body }, response);
  if (status >= 400 || !result) throw new Error(`Photo changed or could not be saved (${status})`);
  return result;
}

function userTasks(user) {
  const tasks = [];
  let unsupported = 0;
  for (const row of db.prepare('SELECT date, entries FROM records WHERE user_id = ?').all(user.id)) {
    try {
      JSON.parse(row.entries || '[]').forEach((entry, index) => {
        if (typeof entry?.photo !== 'string' || !entry.photo.startsWith('data:image/')) return;
        if (/^data:image\/(?:jpeg|png|webp);base64,/i.test(entry.photo)) tasks.push({ kind: 'embedded', date: row.date, index });
        else unsupported++;
      });
    } catch { unsupported++; }
  }
  for (const file of db.prepare('SELECT id, filename FROM files WHERE user_id = ?').all(user.id)) {
    if (/\.(?:jpe?g|png|webp)$/i.test(file.filename)) tasks.push({ kind: 'file', fileId: file.id });
    else unsupported++;
  }
  return { tasks, unsupported };
}

async function preparePhoto(userId, task) {
  let source, original, mime;
  if (task.kind === 'embedded') {
    const row = db.prepare('SELECT entries FROM records WHERE user_id = ? AND date = ?').get(userId, task.date);
    original = row && JSON.parse(row.entries || '[]')[task.index]?.photo;
    const match = typeof original === 'string' && /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(original);
    if (!match) throw new Error('Photo changed');
    source = Buffer.from(match[1], 'base64');
    mime = 'image/webp';
  } else {
    const file = db.prepare('SELECT filename FROM files WHERE user_id = ? AND id = ?').get(userId, task.fileId);
    if (!file || path.basename(file.filename) !== file.filename || path.basename(userId) !== userId) throw new Error('Photo not found');
    const extension = path.extname(file.filename).toLowerCase();
    mime = ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' })[extension];
    if (!mime) throw new Error('Unsupported image');
    const root = path.resolve(process.env.UPLOAD_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '../uploads'));
    source = await fs.promises.readFile(path.join(root, userId, file.filename));
    original = source;
  }
  const expectedHash = createHash('sha256').update(original).digest('hex');
  if (task.kind === 'file') {
    const previous = db.prepare('SELECT content_hash FROM optimizer_processed_files WHERE user_id = ? AND file_id = ?').get(userId, task.fileId);
    if (previous?.content_hash === expectedHash) return { smaller: false, estimated: 0 };
  }
  let result;
  for (let attempt = 0; attempt < 4; attempt++) {
    const size = Math.round(1024 * Math.pow(0.8, attempt));
    const quality = Math.max(55, 75 - 7 * attempt);
    let pipeline = sharp(source, { limitInputPixels: 80000000 }).rotate().resize(size, size, { fit: 'inside', withoutEnlargement: true });
    pipeline = mime === 'image/jpeg' ? pipeline.jpeg({ quality }) : mime === 'image/png' ? pipeline.png({ palette: true, quality }) : pipeline.webp({ quality });
    result = await pipeline.toBuffer();
    if (result.length <= 200 * 1024) break;
  }
  if (result.length > 200 * 1024) throw new Error('Could not reduce photo below the size limit');
  const dataUrl = `data:${mime};base64,${result.toString('base64')}`;
  const smaller = task.kind === 'embedded' ? dataUrl.length < original.length : result.length < source.length;
  const estimated = task.kind === 'embedded' ? Math.max(0, Buffer.byteLength(original) - result.length - 150) : Math.max(0, source.length - result.length);
  return { expectedHash, dataUrl, smaller, estimated };
}

async function run(job, handler, users) {
  const heartbeat = setInterval(() => { if (job.status === 'running') save(job); }, 15000);
  try {
    const work = [];
    for (const user of users) {
      const { tasks, unsupported } = userTasks(user);
      const usage = getStorageUsage(user.id).totalBytes;
      const summary = { id: user.id, name: user.name, email: user.email, beforeBytes: usage, afterBytes: usage, total: tasks.length, processed: 0, optimized: 0, skipped: unsupported, failed: 0, savedBytes: 0, estimatedBytes: 0 };
      job.users.push(summary);
      job.total += tasks.length;
      work.push({ user, tasks, summary });
    }
    job.stage = 'processing';
    save(job);
    for (const { user, tasks, summary } of work) {
      job.currentUserId = user.id;
      for (const task of tasks) {
        try {
          const photo = await preparePhoto(user.id, task);
          if (!photo.smaller) summary.skipped++;
          else if (job.mode === 'preview') { summary.optimized++; summary.estimatedBytes += photo.estimated; }
          else {
            const result = respondWith(handler, user.id, { ...task, expectedHash: photo.expectedHash, dataUrl: photo.dataUrl });
            if (result.optimized) { summary.optimized++; summary.savedBytes += result.savedBytes; }
            else summary.skipped++;
          }
        } catch (err) { summary.failed++; console.warn('Optimizer skipped photo:', err.message); }
        summary.processed++;
        job.processed++;
        if (job.mode === 'optimize') summary.afterBytes = getStorageUsage(user.id).totalBytes;
        save(job);
      }
    }
    job.status = 'completed';
    job.stage = 'completed';
    job.currentUserId = null;
  } catch (err) {
    console.error('Optimizer job failed:', err);
    job.status = 'failed';
    job.stage = 'failed';
  }
  clearInterval(heartbeat);
  job.finishedAt = Date.now();
  save(job);
}

export function startOptimizerJob({ mode, userId, requestedBy }, handler) {
  const job = { id: randomUUID(), mode, userId, requestedBy, ownerPid: process.pid, status: 'running', stage: 'scanning', createdAt: Date.now(), heartbeat: Date.now(), total: 0, processed: 0, users: [], currentUserId: null };
  const users = getAllUsersStats().filter(user => !userId || user.id === userId);
  runTransaction(() => {
    recoverStaleJobs();
    if (db.prepare("SELECT 1 FROM optimizer_jobs WHERE status = 'running'").get()) throw new Error('An optimizer job is already running');
    db.prepare('INSERT INTO optimizer_jobs (id, created_at, status, data) VALUES (?, ?, ?, ?)').run(job.id, job.createdAt, job.status, JSON.stringify(job));
  });
  setImmediate(() => run(job, handler, users));
  return job;
}
