import { describe, it, expect } from 'vitest';
import { CommandParser } from '../core/commands/CommandParser';
import { RawLiveComment } from '../core/types/adapter';

describe('Command Parser & Syntax Validation', () => {
  const makeComment = (comment: string): RawLiveComment => ({
    id: 'test_evt_1',
    userId: 'user_tester',
    userName: 'Tester',
    comment,
    timestamp: Date.now(),
  });

  it('should parse valid Vietnamese commands and aliases', () => {
    expect(CommandParser.parse(makeComment('VÀO'))?.action).toBe('JOIN');
    expect(CommandParser.parse(makeComment('!vao'))?.action).toBe('JOIN');
    expect(CommandParser.parse(makeComment('join'))?.action).toBe('JOIN');

    expect(CommandParser.parse(makeComment('GỖ'))?.action).toBe('WOOD');
    expect(CommandParser.parse(makeComment('!go'))?.action).toBe('WOOD');
    expect(CommandParser.parse(makeComment('chặt gỗ'))?.action).toBe('WOOD');

    expect(CommandParser.parse(makeComment('ĐÁ'))?.action).toBe('STONE');
    expect(CommandParser.parse(makeComment('!da'))?.action).toBe('STONE');
    expect(CommandParser.parse(makeComment('khai thác đá'))?.action).toBe('STONE');

    expect(CommandParser.parse(makeComment('XÂY'))?.action).toBe('BUILD');
    expect(CommandParser.parse(makeComment('!xay'))?.action).toBe('BUILD');
    expect(CommandParser.parse(makeComment('xây nhà'))?.action).toBe('BUILD');

    expect(CommandParser.parse(makeComment('KHÁM PHÁ'))?.action).toBe('EXPLORE');
    expect(CommandParser.parse(makeComment('kham pha'))?.action).toBe('EXPLORE');
    expect(CommandParser.parse(makeComment('!explore'))?.action).toBe('EXPLORE');
  });

  it('should return null for invalid or irrelevant chat comments', () => {
    expect(CommandParser.parse(makeComment('hello streamer'))).toBeNull();
    expect(CommandParser.parse(makeComment('chào cả nhà'))).toBeNull();
    expect(CommandParser.parse(makeComment('123456'))).toBeNull();
    expect(CommandParser.parse(makeComment('???'))).toBeNull();
    expect(CommandParser.parse(makeComment(''))).toBeNull();
  });
});
