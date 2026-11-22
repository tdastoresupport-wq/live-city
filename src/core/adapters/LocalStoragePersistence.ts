import { IPersistenceAdapter } from '../types/adapter';

export class LocalStoragePersistence implements IPersistenceAdapter {
  private prefix: string;

  constructor(prefix = 'live_city_') {
    this.prefix = prefix;
  }

  public async save(key: string, data: unknown): Promise<void> {
    try {
      const fullKey = this.prefix + key;
      const serialized = JSON.stringify(data);
      localStorage.setItem(fullKey, serialized);
    } catch (err) {
      console.warn('LocalStorage save failed:', err);
    }
  }

  public async load<T>(key: string, fallback: T): Promise<T> {
    try {
      const fullKey = this.prefix + key;
      const raw = localStorage.getItem(fullKey);
      if (!raw) return fallback;
      return JSON.parse(raw) as T;
    } catch (err) {
      console.warn('LocalStorage load failed, using fallback:', err);
      return fallback;
    }
  }

  public async remove(key: string): Promise<void> {
    try {
      const fullKey = this.prefix + key;
      localStorage.removeItem(fullKey);
    } catch (err) {
      console.warn('LocalStorage remove failed:', err);
    }
  }

  public async clear(): Promise<void> {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(this.prefix)) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch (err) {
      console.warn('LocalStorage clear failed:', err);
    }
  }
}
