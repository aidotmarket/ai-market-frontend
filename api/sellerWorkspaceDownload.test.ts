import {afterEach,expect,it,vi} from 'vitest';
const client=vi.hoisted(() => ({post:vi.fn()}));
vi.mock('./client',() => ({api:client}));
import {requestWorkspaceFile,validateWorkspaceFileGrant} from './sellerWorkspaceDownload';
const grant=() => ({filename:'file.csv',size:42,url:'https://synthetic.s3.eu-west-1.amazonaws.com/file?X-Amz-SignedHeaders=host%3Bif-match',headers:{'If-Match':'"e"'},expires_at:new Date(Date.now()+300000).toISOString()});
const rejected=(status=429,retry:unknown='60') => ({isAxiosError:true,response:{status,headers:{'retry-after':retry}}});
it.each(['','eu.','us.','fedramp.'])('accepts the fixed R2 %s endpoint', jurisdiction => {
  const file={...grant(),url:`https://${'d'.repeat(32)}.${jurisdiction}r2.cloudflarestorage.com/bucket/file?X-Amz-SignedHeaders=host%3Bif-match`};
  expect(validateWorkspaceFileGrant(file)).toBe(file);
});
it.each(['evil.r2.cloudflarestorage.com',`${'d'.repeat(32)}.r2.cloudflarestorage.com.evil.example`,`${'d'.repeat(32)}.evil.r2.cloudflarestorage.com`])('rejects unapproved R2 host %s',host => {
  expect(() => validateWorkspaceFileGrant({...grant(),url:`https://${host}/bucket/file?X-Amz-SignedHeaders=host%3Bif-match`})).toThrow();
});
afterEach(() => {vi.useRealTimers();vi.resetAllMocks();});
it('waits for 429 then retries the same file in the same session without allocating another download',async () => {
  vi.useFakeTimers();client.post.mockRejectedValueOnce(rejected()).mockResolvedValue({data:grant()});
  const waiting=vi.fn();const signal=new AbortController().signal;
  const task=requestWorkspaceFile('order','session',42,signal,waiting);
  await vi.advanceTimersByTimeAsync(59999);expect(client.post).toHaveBeenCalledTimes(1);expect(waiting).toHaveBeenCalledWith(60);
  await vi.advanceTimersByTimeAsync(1);await expect(task).resolves.toMatchObject({filename:'file.csv'});
  expect(client.post.mock.calls[1]).toEqual(client.post.mock.calls[0]);expect(waiting).toHaveBeenLastCalledWith(null);
});
it('cancels a pending wait without another request',async () => {
  vi.useFakeTimers();client.post.mockRejectedValue(rejected());const abort=new AbortController();
  const task=requestWorkspaceFile('order','session',0,abort.signal).catch(error => error);
  await vi.advanceTimersByTimeAsync(0);abort.abort();expect(await task).toBe(abort.signal.reason);
  await vi.advanceTimersByTimeAsync(180000);expect(client.post).toHaveBeenCalledTimes(1);
});
it('stops after three rate retries',async () => {
  vi.useFakeTimers();const error=rejected();client.post.mockRejectedValue(error);
  const task=requestWorkspaceFile('order','session',0,new AbortController().signal).catch(error => error);
  await vi.advanceTimersByTimeAsync(180000);expect(await task).toBe(error);expect(client.post).toHaveBeenCalledTimes(4);
});
it.each([403,404,409,503])('does not replay a %s response',async status => {
  const error=rejected(status);client.post.mockRejectedValue(error);
  await expect(requestWorkspaceFile('order','session',0,new AbortController().signal)).rejects.toBe(error);
  expect(client.post).toHaveBeenCalledTimes(1);
});
it.each(['120','nonsense','-1'])('does not shorten or guess unsupported Retry-After %s',async retry => {
  const error=rejected(429,retry);client.post.mockRejectedValue(error);
  await expect(requestWorkspaceFile('order','session',0,new AbortController().signal)).rejects.toBe(error);
  expect(client.post).toHaveBeenCalledTimes(1);
});
it('honors an HTTP-date Retry-After',async () => {
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-08T12:00:00Z'));
  client.post.mockRejectedValueOnce(rejected(429,'Tue, 08 Sep 2026 12:00:30 GMT')).mockResolvedValue({data:grant()});
  const task=requestWorkspaceFile('order','session',0,new AbortController().signal);
  await vi.advanceTimersByTimeAsync(29999);expect(client.post).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);await task;expect(client.post).toHaveBeenCalledTimes(2);
});
