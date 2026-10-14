import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getRouteMatcher } from 'next/dist/shared/lib/router/utils/route-matcher';
import { getRouteRegex } from 'next/dist/shared/lib/router/utils/route-regex';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repositoryRoot = process.cwd();
const matchBlogRoute = getRouteMatcher(getRouteRegex('/blog/[slug]'));
let fixtureRoot: string;
let blog: typeof import('./blog');

function writePost(relativePath: string, title: string, date = '2026-10-14') {
  const filename = path.join(fixtureRoot, relativePath);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, `---\ntitle: ${title}\ndate: ${date}\n---\nHarmless owned fixture: ${title}.\n`);
}

beforeEach(async () => {
  fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'athena-blog-boundary-'));
  fs.mkdirSync(path.join(fixtureRoot, 'content/blog'), { recursive: true });
  writePost('content/blog/allowed.md', 'Allowed');
  writePost('outside-audit.md', 'Outside owned fixture');
  writePost('content/sibling.md', 'Sibling owned fixture');
  writePost('content/blog/nested/post.md', 'Nested owned fixture');
  vi.spyOn(process, 'cwd').mockReturnValue(fixtureRoot);
  vi.resetModules();
  blog = await import('./blog');
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

describe('blog slug filesystem boundary', () => {
  it('rejects the traversal decoded by the actual Next blog route matcher', () => {
    const control = matchBlogRoute('/blog/allowed');
    expect(control && control.slug).toBe('allowed');
    expect(control && blog.getPostBySlug(control.slug as string)?.title).toBe('Allowed');

    const traversal = matchBlogRoute('/blog/..%2F..%2Foutside-audit');
    expect(traversal && traversal.slug).toBe('../../outside-audit');
    expect(traversal && blog.getPostBySlug(traversal.slug as string)).toBeNull();
  });

  it.each([
    ['..%2fsibling', '../sibling'],
    ['nested%2Fpost', 'nested/post'],
    ['..%5C..%5Coutside-audit', '..\\..\\outside-audit'],
    ['%2Foutside-audit', '/outside-audit'],
    ['C%3A%5Coutside-audit', 'C:\\outside-audit'],
    ['%00', '\0'],
    ['%2E', '.'],
    ['%2E%2E', '..'],
  ])('rejects router-decoded %s before checking or reading files', (segment, decoded) => {
    const params = matchBlogRoute(`/blog/${segment}`);
    expect(params && params.slug).toBe(decoded);
    const exists = vi.spyOn(fs, 'existsSync');
    const read = vi.spyOn(fs, 'readFileSync');
    expect(params && blog.getPostBySlug(params.slug as string)).toBeNull();
    expect(exists).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it.each(['', '.', '..', '../sibling', '../../outside-audit', 'nested/post', './allowed',
    'nested\\post', '\\outside-audit', 'C:\\outside-audit', 'C:/outside-audit', '\0', 'allowed\0',
  ])('rejects unsafe direct slug %j before filesystem access', (slug) => {
    const exists = vi.spyOn(fs, 'existsSync');
    const read = vi.spyOn(fs, 'readFileSync');
    expect(blog.getPostBySlug(slug)).toBeNull();
    expect(exists).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it('rejects an absolute path to an owned fixture before filesystem access', () => {
    const exists = vi.spyOn(fs, 'existsSync');
    const read = vi.spyOn(fs, 'readFileSync');
    expect(blog.getPostBySlug(path.join(fixtureRoot, 'outside-audit'))).toBeNull();
    expect(exists).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it.each(['AWS', 'CROs', 'café-日本語', "release.v2_+!@()'", '.draft', 'two words',
    '%2F-literal', '%2E%2E-literal',
  ])('preserves supported single filename slug %j', (slug) => {
    writePost(`content/blog/${slug}.mdx`, 'Compatible');
    const params = matchBlogRoute(`/blog/${encodeURIComponent(slug)}`);
    expect(params && params.slug).toBe(slug);
    expect(params && blog.getPostBySlug(params.slug as string)).toMatchObject({ slug, title: 'Compatible' });
  });

  it('prefers MDX, falls back to Markdown, and returns null for missing posts', () => {
    writePost('content/blog/both.md', 'Markdown');
    writePost('content/blog/both.mdx', 'MDX');
    expect(blog.getPostBySlug('both')?.title).toBe('MDX');
    fs.unlinkSync(path.join(fixtureRoot, 'content/blog/both.mdx'));
    expect(blog.getPostBySlug('both')?.title).toBe('Markdown');
    expect(blog.getPostBySlug('missing')).toBeNull();
    fs.rmSync(path.join(fixtureRoot, 'content/blog'), { recursive: true });
    expect(blog.getPostBySlug('allowed')).toBeNull();
    expect(blog.getAllPosts()).toEqual([]);
  });

  it('retains top-level Markdown/MDX enumeration and date ordering', () => {
    writePost('content/blog/older.mdx', 'Older', '2025-01-01');
    fs.writeFileSync(path.join(fixtureRoot, 'content/blog/ignored.txt'), 'Owned non-post');
    expect(blog.getAllPosts().map(({ slug }) => slug)).toEqual(['allowed', 'older']);
  });

  it('reads every existing repository post through its normal slug', async () => {
    vi.mocked(process.cwd).mockReturnValue(repositoryRoot);
    vi.resetModules();
    const existingBlog = await import('./blog');
    const posts = existingBlog.getAllPosts();
    expect(posts.length).toBeGreaterThan(0);
    for (const post of posts) {
      expect(existingBlog.getPostBySlug(post.slug)).toEqual(post);
    }
  });
});
