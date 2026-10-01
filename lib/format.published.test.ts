import {expect,it} from 'vitest';
import {formatPublishedDate} from './format';
it('uses the UTC publication date across timezones and timestamp offsets',()=>{
 expect(formatPublishedDate('2026-09-27T23:30:00Z')).toBe('Sep 27, 2026');
 expect(formatPublishedDate('2026-09-28T01:30:00+02:00')).toBe('Sep 27, 2026');
});
