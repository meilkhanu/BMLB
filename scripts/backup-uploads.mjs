// scripts/backup-uploads.mjs
// 构建前：备份 dist/client/uploads/ → data/uploads-backup/
import { existsSync, mkdirSync, cpSync } from 'fs';

const src = 'dist/client/uploads';
const dst = 'data/uploads-backup';

if (existsSync(src)) {
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true });
  console.log('[backup] uploads backed up to data/uploads-backup/');
} else {
  console.log('[backup] no uploads to back up');
}
