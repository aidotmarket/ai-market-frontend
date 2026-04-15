import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import getReadingTime from 'reading-time';

const BLOG_DIR = path.join(process.cwd(), 'content', 'blog');

type BlogFrontmatter = {
  title?: string;
  description?: string;
  date?: string;
  image?: string;
  author?: string;
  tags?: string[];
};

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string;
  image?: string;
  author?: string;
  tags: string[];
  content: string;
  readingTime: string;
}

function readPostFile(file: string): BlogPost {
  const slug = file.replace(/\.(mdx|md)$/, '');
  const raw = fs.readFileSync(path.join(BLOG_DIR, file), 'utf-8');
  const { data, content } = matter(raw);
  const frontmatter = data as BlogFrontmatter;

  return {
    slug,
    title: frontmatter.title || slug,
    description: frontmatter.description || '',
    date: frontmatter.date || new Date().toISOString(),
    image: frontmatter.image,
    author: frontmatter.author || 'Max Robbins',
    tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
    content,
    readingTime: getReadingTime(content).text,
  };
}

export function getAllPosts(): BlogPost[] {
  if (!fs.existsSync(BLOG_DIR)) {
    return [];
  }

  const files = fs
    .readdirSync(BLOG_DIR)
    .filter((file) => file.endsWith('.mdx') || file.endsWith('.md'));

  return files
    .map(readPostFile)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getPostBySlug(slug: string): BlogPost | null {
  const candidates = [`${slug}.mdx`, `${slug}.md`];

  for (const file of candidates) {
    const fullPath = path.join(BLOG_DIR, file);
    if (fs.existsSync(fullPath)) {
      return readPostFile(file);
    }
  }

  return null;
}
