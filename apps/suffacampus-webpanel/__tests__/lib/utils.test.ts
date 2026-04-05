import { PAGE_SIZE_OPTIONS, toDate, getErrorMessage } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  PAGE_SIZE_OPTIONS                                                  */
/* ------------------------------------------------------------------ */

describe('PAGE_SIZE_OPTIONS', () => {
  it('contains exactly [10, 20, 50]', () => {
    expect(PAGE_SIZE_OPTIONS).toEqual([10, 20, 50]);
  });

  it('is a tuple with 3 elements', () => {
    expect(PAGE_SIZE_OPTIONS).toHaveLength(3);
  });
});

/* ------------------------------------------------------------------ */
/*  toDate                                                             */
/* ------------------------------------------------------------------ */

describe('toDate', () => {
  it('returns epoch for null', () => {
    expect(toDate(null).getTime()).toBe(0);
  });

  it('returns epoch for undefined', () => {
    expect(toDate(undefined).getTime()).toBe(0);
  });

  it('returns epoch for empty string', () => {
    expect(toDate('').getTime()).toBe(0);
  });

  it('returns epoch for 0', () => {
    expect(toDate(0).getTime()).toBe(0);
  });

  it('passes through Date instances', () => {
    const d = new Date('2025-06-15T12:00:00Z');
    expect(toDate(d)).toBe(d);
  });

  it('parses ISO strings', () => {
    const result = toDate('2025-01-01T00:00:00Z');
    expect(result.toISOString()).toBe('2025-01-01T00:00:00.000Z');
  });

  it('parses Unix-ms numbers', () => {
    const ms = 1700000000000; // ~Nov 2023
    const result = toDate(ms);
    expect(result.getTime()).toBe(ms);
  });

  it('handles Firestore Timestamp with seconds', () => {
    const ts = { seconds: 1700000000, nanoseconds: 0 };
    expect(toDate(ts).getTime()).toBe(1700000000000);
  });

  it('handles Firestore Timestamp with _seconds', () => {
    const ts = { _seconds: 1700000000 };
    expect(toDate(ts).getTime()).toBe(1700000000000);
  });

  it('returns epoch for unrecognised object', () => {
    expect(toDate({ foo: 'bar' }).getTime()).toBe(0);
  });

  it('returns epoch for boolean', () => {
    // boolean is falsy for `false`, truthy for `true` but not a Date/string/number
    expect(toDate(false).getTime()).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  getErrorMessage                                                    */
/* ------------------------------------------------------------------ */

describe('getErrorMessage', () => {
  it('extracts message from Error instance', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('extracts message from TypeError', () => {
    expect(getErrorMessage(new TypeError('type fail'))).toBe('type fail');
  });

  it('returns string as-is', () => {
    expect(getErrorMessage('raw error')).toBe('raw error');
  });

  it('extracts message from object with .message', () => {
    expect(getErrorMessage({ message: 'obj error' })).toBe('obj error');
  });

  it('coerces non-string message to string', () => {
    expect(getErrorMessage({ message: 42 })).toBe('42');
  });

  it('returns fallback for null', () => {
    expect(getErrorMessage(null)).toBe('An unexpected error occurred');
  });

  it('returns fallback for undefined', () => {
    expect(getErrorMessage(undefined)).toBe('An unexpected error occurred');
  });

  it('returns fallback for number', () => {
    expect(getErrorMessage(404)).toBe('An unexpected error occurred');
  });

  it('returns fallback for plain object without message', () => {
    expect(getErrorMessage({ code: 'ERR' })).toBe('An unexpected error occurred');
  });

  it('returns fallback for empty object', () => {
    expect(getErrorMessage({})).toBe('An unexpected error occurred');
  });
});
