import { CommandAction, ParsedCommand, RawLiveComment } from '../types';

export class CommandParser {
  /**
   * Normalizes Vietnamese accents and casing for robust command matching.
   */
  public static normalize(text: string): string {
    return text
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove diacritics
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'd');
  }

  /**
   * Parses a raw live comment into a structured command.
   */
  public static parse(rawComment: RawLiveComment): ParsedCommand | null {
    if (!rawComment || !rawComment.comment) return null;

    const trimmed = rawComment.comment.trim();
    if (!trimmed) return null;

    const clean = this.normalize(trimmed);
    const tokens = clean.split(/\s+/);
    const firstWord = tokens[0].replace(/^!|^\/|^#/, ''); // strip prefix like !, /, #

    let action: CommandAction | null = null;
    const params: string[] = tokens.slice(1);

    // Matching rules
    if (['vao', 'join', 'start', 'choi', 'thamgia'].includes(firstWord)) {
      action = 'JOIN';
    } else if (['go', 'wood', 'chat', 'chatgo', 'forest', 'cay'].includes(firstWord)) {
      action = 'WOOD';
    } else if (['da', 'stone', 'mine', 'dao', 'daoda', 'quarry'].includes(firstWord)) {
      action = 'STONE';
    } else if (['xay', 'build', 'dung', 'construct'].includes(firstWord)) {
      action = 'BUILD';
    } else if (['khampha', 'explore', 'didao', 'scout', 'di'].includes(firstWord)) {
      action = 'EXPLORE';
    } else if (clean.includes('kham pha')) {
      action = 'EXPLORE';
    } else if (clean.includes('chat go') || clean.includes('kiem go')) {
      action = 'WOOD';
    } else if (clean.includes('dao da') || clean.includes('khai thac da') || clean.includes('kiem da')) {
      action = 'STONE';
    } else if (clean.includes('xay dung') || clean.includes('xay nha')) {
      action = 'BUILD';
    } else if (['help', 'trogiup', 'huongdan'].includes(firstWord)) {
      action = 'HELP';
    } else if (['status', 'thongtin', 'diem'].includes(firstWord)) {
      action = 'STATUS';
    }

    if (!action) {
      return null;
    }

    return {
      raw: rawComment.comment,
      action,
      params,
      userId: rawComment.userId,
      userName: rawComment.userName,
      timestamp: rawComment.timestamp || Date.now(),
      eventId: rawComment.id,
    };
  }
}
