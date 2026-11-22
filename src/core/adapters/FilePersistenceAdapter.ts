import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { IPersistenceAdapter } from '../types/adapter';

/**
 * Node.js File System Persistence Adapter with backup creation and corruption recovery.
 */
export class FilePersistenceAdapter implements IPersistenceAdapter {
  private dataDir: string;

  constructor(dataDir = path.resolve(process.cwd(), '.data')) {
    this.dataDir = dataDir;
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
  }

  private getFilePath(key: string): string {
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.dataDir, `${safeKey}.json`);
  }

  private getBackupPath(key: string): string {
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.dataDir, `${safeKey}.backup.json`);
  }

  private getTempPath(key: string): string {
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.dataDir, `${safeKey}.tmp.json`);
  }

  public async save(key: string, data: unknown): Promise<void> {
    await this.ensureDir();
    const filePath = this.getFilePath(key);
    const backupPath = this.getBackupPath(key);
    const tempPath = this.getTempPath(key);
    const serialized = JSON.stringify(data, null, 2);

    // 1. If current file exists, copy it to backup first
    try {
      await fs.access(filePath);
      await fs.copyFile(filePath, backupPath);
    } catch {
      // No existing file yet
    }

    // 2. Write to temporary file then atomically rename
    await fs.writeFile(tempPath, serialized, 'utf-8');
    await fs.rename(tempPath, filePath);
  }

  public async load<T>(key: string, fallback: T): Promise<T> {
    const filePath = this.getFilePath(key);
    const backupPath = this.getBackupPath(key);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as T;
    } catch {
      // Attempt backup recovery if primary file is missing or corrupted
      try {
        const backupContent = await fs.readFile(backupPath, 'utf-8');
        return JSON.parse(backupContent) as T;
      } catch {
        return fallback;
      }
    }
  }

  public async loadBackup<T>(key: string, fallback: T): Promise<T> {
    const backupPath = this.getBackupPath(key);
    try {
      const backupContent = await fs.readFile(backupPath, 'utf-8');
      return JSON.parse(backupContent) as T;
    } catch {
      return fallback;
    }
  }

  public async remove(key: string): Promise<void> {
    const filePath = this.getFilePath(key);
    const backupPath = this.getBackupPath(key);
    await fs.rm(filePath, { force: true }).catch(() => {});
    await fs.rm(backupPath, { force: true }).catch(() => {});
  }

  public async clear(): Promise<void> {
    try {
      await fs.rm(this.dataDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}
