// scripts/restore-uploads.mjs
// 构建后：恢复 data/uploads-backup/ → dist/client/uploads/
import { existsSync, mkdirSync, cpSync } from 'fs';

const src = 'data/uploads-backup';
const dst = 'dist/client/uploads';

if (existsSync(src)) {
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true });
  console.log('[restore] uploads restored from data/uploads-backup/');
} else {
  console.log('[restore] no backup to restore');
}
