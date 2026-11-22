import type { IPersistenceAdapter } from '../types/adapter';

export class LocalStoragePersistence implements IPersistenceAdapter {
  private prefix: string;
  private memoryStore: Map<string, string> = new Map();

  constructor(prefix = 'live_city_') {
    this.prefix = prefix;
  }

  private hasBrowserStorage(): boolean {
    try {
      return typeof globalThis !== 'undefined' && typeof globalThis.localStorage !== 'undefined';
    } catch {
      return false;
    }
  }

  private getRaw(fullKey: string): string | null {
    if (this.hasBrowserStorage()) {
      return globalThis.localStorage.getItem(fullKey);
    }
    return this.memoryStore.get(fullKey) ?? null;
  }

  private setRaw(fullKey: string, value: string): void {
    if (this.hasBrowserStorage()) {
      globalThis.localStorage.setItem(fullKey, value);
    } else {
      this.memoryStore.set(fullKey, value);
    }
  }

  private removeRaw(fullKey: string): void {
    if (this.hasBrowserStorage()) {
      globalThis.localStorage.removeItem(fullKey);
    } else {
      this.memoryStore.delete(fullKey);
    }
  }

  public async save(key: string, data: unknown): Promise<void> {
    try {
      const fullKey = this.prefix + key;
      const backupKey = `${fullKey}_backup`;
      const serialized = JSON.stringify(data);

      // Keep backup of previous valid data before overwriting
      const existing = this.getRaw(fullKey);
      if (existing) {
        this.setRaw(backupKey, existing);
      }

      this.setRaw(fullKey, serialized);
    } catch (err) {
      console.warn('Persistence save failed:', err);
    }
  }

  public async load<T>(key: string, fallback: T): Promise<T> {
    const fullKey = this.prefix + key;
    const backupKey = `${fullKey}_backup`;

    try {
      const raw = this.getRaw(fullKey);
      if (raw) {
        return JSON.parse(raw) as T;
      }
    } catch (err) {
      console.warn('Primary snapshot corrupted, attempting backup recovery:', err);
      try {
        const backupRaw = this.getRaw(backupKey);
        if (backupRaw) {
          return JSON.parse(backupRaw) as T;
        }
      } catch (backupErr) {
        console.warn('Backup recovery also failed:', backupErr);
      }
    }

    return fallback;
  }

  public async loadBackup<T>(key: string, fallback: T): Promise<T> {
    try {
      const backupKey = `${this.prefix}${key}_backup`;
      const raw = this.getRaw(backupKey);
      if (!raw) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  public async remove(key: string): Promise<void> {
    try {
      const fullKey = this.prefix + key;
      const backupKey = `${fullKey}_backup`;
      this.removeRaw(fullKey);
      this.removeRaw(backupKey);
    } catch (err) {
      console.warn('Persistence remove failed:', err);
    }
  }

  public async clear(): Promise<void> {
    try {
      if (this.hasBrowserStorage()) {
        const keysToRemove: string[] = [];
        for (let i = 0; i < globalThis.localStorage.length; i++) {
          const k = globalThis.localStorage.key(i);
          if (k && k.startsWith(this.prefix)) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach((k) => globalThis.localStorage.removeItem(k));
      }
      this.memoryStore.clear();
    } catch (err) {
      console.warn('Persistence clear failed:', err);
    }
  }
}
