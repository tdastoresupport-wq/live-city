import { CommandAction, ParsedCommand, RawLiveComment } from '../types';

export const MAX_COMMENT_LENGTH = 80;
export const MAX_USERNAME_LENGTH = 36;

const EXACT_SINGLE_WORD_MAP: Record<string, CommandAction> = {
  vao: 'JOIN',
  join: 'JOIN',
  start: 'JOIN',
  choi: 'JOIN',
  thamgia: 'JOIN',

  go: 'WOOD',
  wood: 'WOOD',
  chatgo: 'WOOD',
  forest: 'WOOD',
  cay: 'WOOD',

  da: 'STONE',
  stone: 'STONE',
  mine: 'STONE',
  daoda: 'STONE',
  quarry: 'STONE',

  food: 'FOOD',
  thucpham: 'FOOD',
  luongthuc: 'FOOD',
  haiqua: 'FOOD',
  farm: 'FOOD',

  xay: 'BUILD',
  build: 'BUILD',
  dung: 'BUILD',
  construct: 'BUILD',
  xaynha: 'BUILD',
  xaydung: 'BUILD',

  khampha: 'EXPLORE',
  explore: 'EXPLORE',
  didao: 'EXPLORE',
  scout: 'EXPLORE',

  vote: 'VOTE',
  binhchon: 'VOTE',
  bau: 'VOTE',

  trade: 'TRADE',
  giaothuong: 'TRADE',
  doivang: 'TRADE',

  help: 'HELP',
  trogiup: 'HELP',
  huongdan: 'HELP',

  status: 'STATUS',
  thongtin: 'STATUS',
  diem: 'STATUS',
};

const EXACT_MULTI_WORD_MAP: Record<string, CommandAction> = {
  'tham gia': 'JOIN',
  'vao game': 'JOIN',
  'chat go': 'WOOD',
  'kiem go': 'WOOD',
  'don cui': 'WOOD',
  'khai thac go': 'WOOD',
  'dao da': 'STONE',
  'dap da': 'STONE',
  'kiem da': 'STONE',
  'khai thac da': 'STONE',
  'thu hoach': 'FOOD',
  'hai qua': 'FOOD',
  'luong thuc': 'FOOD',
  'thuc pham': 'FOOD',
  'xay nha': 'BUILD',
  'xay dung': 'BUILD',
  'gop suc': 'BUILD',
  'kham pha': 'EXPLORE',
  'di dao': 'EXPLORE',
  'mo dat': 'EXPLORE',
  'tham hiem': 'EXPLORE',
  'giao thuong': 'TRADE',
  'doi vang': 'TRADE',
  'tro giup': 'HELP',
  'huong dan': 'HELP',
  'thong tin': 'STATUS',
};

export class CommandParser {
  /**
   * Strips control characters and normalizes whitespace.
   */
  public static sanitizeText(input: string, maxLength: number): string {
    return input
      .replace(/[\x00-\x1F\x7F]/g, '')
      .trim()
      .slice(0, maxLength);
  }

  /**
   * Normalizes Vietnamese accents and casing for deterministic command matching.
   */
  public static normalize(text: string): string {
    return text
      .replace(/[\x00-\x1F\x7F]/g, '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'd')
      .replace(/\s+/g, ' ');
  }

  /**
   * Parses a raw live comment into a structured command.
   * Rejects malformed payloads, overly long conversational chat, and false-positive substrings.
   */
  public static parse(rawComment: RawLiveComment): ParsedCommand | null {
    if (!rawComment || typeof rawComment !== 'object') return null;
    if (typeof rawComment.id !== 'string' || !rawComment.id.trim()) return null;
    if (typeof rawComment.userId !== 'string' || !rawComment.userId.trim()) return null;
    if (typeof rawComment.comment !== 'string') return null;

    const cleanRaw = rawComment.comment.replace(/[\x00-\x1F\x7F]/g, '').trim();
    if (!cleanRaw || cleanRaw.length > MAX_COMMENT_LENGTH) {
      return null;
    }

    const sanitizedUserName =
      typeof rawComment.userName === 'string' && rawComment.userName.trim()
        ? this.sanitizeText(rawComment.userName, MAX_USERNAME_LENGTH)
        : rawComment.userId.slice(0, MAX_USERNAME_LENGTH);

    const timestamp =
      typeof rawComment.timestamp === 'number' &&
      Number.isFinite(rawComment.timestamp) &&
      rawComment.timestamp > 0
        ? rawComment.timestamp
        : Date.now();

    const normalized = this.normalize(cleanRaw);
    if (!normalized) return null;

    // Strip optional single leading command prefix (!, /, #)
    const hasPrefix = /^[!/#]/.test(normalized);
    const body = hasPrefix ? normalized.slice(1).trim() : normalized;
    if (!body) return null;

    // Reject if body still contains punctuation typical of ordinary chat sentences
    if (/[^a-z0-9\s_]/.test(body)) {
      return null;
    }

    const tokens = body.split(' ');
    // Game commands are concise (1 to 3 words max)
    if (tokens.length > 3) {
      return null;
    }

    let action: CommandAction | null = null;
    let params: string[] = [];

    // 1. Check voting commands with numeric argument: "vote 1", "bau 2", "binh chon 3"
    if (
      tokens.length === 2 &&
      ['vote', 'bau', 'chon', 'binhchon'].includes(tokens[0]) &&
      /^[1-9]$/.test(tokens[1])
    ) {
      action = 'VOTE';
      params = [tokens[1]];
    } else if (
      tokens.length === 3 &&
      tokens[0] === 'binh' &&
      tokens[1] === 'chon' &&
      /^[1-9]$/.test(tokens[2])
    ) {
      action = 'VOTE';
      params = [tokens[2]];
    }
    // 2. Check trade commands with resource param: "trade wood", "doi vang go"
    else if (
      tokens.length === 2 &&
      ['trade', 'giaothuong', 'doivang'].includes(tokens[0])
    ) {
      action = 'TRADE';
      params = [tokens[1]];
    }
    // 3. Exact single-word match
    else if (tokens.length === 1 && EXACT_SINGLE_WORD_MAP[tokens[0]]) {
      action = EXACT_SINGLE_WORD_MAP[tokens[0]];
    }
    // 4. Exact multi-word phrase match (2 or 3 words)
    else if (EXACT_MULTI_WORD_MAP[body]) {
      action = EXACT_MULTI_WORD_MAP[body];
    }

    if (!action) {
      return null;
    }

    return {
      raw: cleanRaw,
      action,
      params,
      userId: rawComment.userId.trim(),
      userName: sanitizedUserName,
      timestamp,
      eventId: rawComment.id.trim(),
    };
  }
}
