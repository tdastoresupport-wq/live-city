import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { IPersistenceAdapter } from '../types/adapter';

/**
 * Node.js File System Persistence Adapter with serialized saves, backup integrity protection,
 * Windows-safe atomic rename retries, and schema-aware corruption recovery.
 */
export class FilePersistenceAdapter implements IPersistenceAdapter {
  private dataDir: string;
  private validator?: (data: unknown) => boolean;
  private saveQueues: Map<string, Promise<void>> = new Map();
  private tempCounter = 0;

  constructor(
    dataDir = path.resolve(process.cwd(), '.data'),
    validator?: (data: unknown) => boolean
  ) {
    this.dataDir = dataDir;
    this.validator = validator;
  }

  private sanitizeKey(key: string): string {
    return key.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
  }

  private getFilePath(key: string): string {
    return path.join(this.dataDir, `${this.sanitizeKey(key)}.json`);
  }

  private getBackupPath(key: string): string {
    return path.join(this.dataDir, `${this.sanitizeKey(key)}.backup.json`);
  }

  private getTempPath(key: string): string {
    this.tempCounter = (this.tempCounter + 1) % 1_000_000;
    return path.join(
      this.dataDir,
      `${this.sanitizeKey(key)}.${process.pid}.${Date.now()}.${this.tempCounter}.tmp.json`
    );
  }

  private isValidData(parsed: unknown): boolean {
    if (!this.validator) return true;
    try {
      return this.validator(parsed);
    } catch {
      return false;
    }
  }

  private enqueueKeyOperation(key: string, op: () => Promise<void>): Promise<void> {
    const safeKey = this.sanitizeKey(key);
    const previous = this.saveQueues.get(safeKey) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(op);
    const tail = next.catch(() => {}).finally(() => {
      if (this.saveQueues.get(safeKey) === tail) {
        this.saveQueues.delete(safeKey);
      }
    });
    this.saveQueues.set(safeKey, tail);
    return next;
  }

  private async renameWithWindowsRetry(srcPath: string, destPath: string): Promise<void> {
    const maxAttempts = 4;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await fs.rename(srcPath, destPath);
        return;
      } catch (err: unknown) {
        const code = err && typeof err === 'object' ? (err as { code?: string }).code : undefined;
        const isTransientLock = code === 'EPERM' || code === 'EACCES' || code === 'EBUSY';
        if (!isTransientLock || attempt === maxAttempts) {
          throw err;
        }
        await new Promise((resolve) => setTimeout(resolve, attempt * 20));
      }
    }
  }

  public async save(key: string, data: unknown): Promise<void> {
    return this.enqueueKeyOperation(key, async () => {
      await this.ensureDir();
      const filePath = this.getFilePath(key);
      const backupPath = this.getBackupPath(key);
      const tempPath = this.getTempPath(key);
      const serialized = JSON.stringify(data, null, 2);

      // 1. Copy current primary to backup ONLY if it is valid JSON and passes optional schema validator
      try {
        const existingContent = await fs.readFile(filePath, 'utf-8');
        const parsedExisting = JSON.parse(existingContent) as unknown;
        if (this.isValidData(parsedExisting)) {
          const backupTempPath = `${backupPath}.${process.pid}.${Date.now()}.tmp.json`;
          try {
            await fs.writeFile(backupTempPath, existingContent, 'utf-8');
            await this.renameWithWindowsRetry(backupTempPath, backupPath);
          } finally {
            await fs.rm(backupTempPath, { force: true }).catch(() => {});
          }
        }
      } catch {
        // Primary missing or corrupt -> do NOT overwrite healthy existing backup!
      }

      // 2. Write to unique temporary file then atomically rename to primary
      try {
        await fs.writeFile(tempPath, serialized, 'utf-8');
        await this.renameWithWindowsRetry(tempPath, filePath);
      } finally {
        await fs.rm(tempPath, { force: true }).catch(() => {});
      }
    });
  }

  public async load<T>(key: string, fallback: T): Promise<T> {
    const filePath = this.getFilePath(key);
    const backupPath = this.getBackupPath(key);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content) as unknown;
      if (this.isValidData(parsed)) {
        return parsed as T;
      }
    } catch {
      // Fall through to backup recovery
    }

    try {
      const backupContent = await fs.readFile(backupPath, 'utf-8');
      const parsedBackup = JSON.parse(backupContent) as unknown;
      if (this.isValidData(parsedBackup)) {
        return parsedBackup as T;
      }
    } catch {
      // Backup missing or invalid
    }

    return fallback;
  }

  public async loadBackup<T>(key: string, fallback: T): Promise<T> {
    const backupPath = this.getBackupPath(key);
    try {
      const backupContent = await fs.readFile(backupPath, 'utf-8');
      const parsed = JSON.parse(backupContent) as unknown;
      if (this.isValidData(parsed)) {
        return parsed as T;
      }
      return fallback;
    } catch {
      return fallback;
    }
  }

  public async remove(key: string): Promise<void> {
    return this.enqueueKeyOperation(key, async () => {
      const filePath = this.getFilePath(key);
      const backupPath = this.getBackupPath(key);
      await fs.rm(filePath, { force: true }).catch(() => {});
      await fs.rm(backupPath, { force: true }).catch(() => {});
    });
  }

  public async clear(): Promise<void> {
    try {
      await Promise.allSettled(Array.from(this.saveQueues.values()));
      await fs.rm(this.dataDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}
