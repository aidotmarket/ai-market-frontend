import Markdown from 'react-markdown';

export default function AllAIMarkdown({ children, theme = 'dark' }: {
  children: string;
  theme?: 'light' | 'dark';
}) {
  const isDark = theme === 'dark';
  return (
    <Markdown
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        strong: ({ children }) => (
          <strong className={isDark ? 'font-semibold text-white' : 'font-semibold'}>{children}</strong>
        ),
        em: ({ children }) => <em className="italic">{children}</em>,
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={isDark ? 'text-blue-400 underline hover:text-blue-300' : 'text-blue-700 underline hover:text-blue-800'}
          >
            {children}
          </a>
        ),
        ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
        li: ({ children }) => <li>{children}</li>,
        code: ({ children }) => (
          <code className={`rounded px-1 py-0.5 text-xs font-mono ${isDark ? 'bg-white/10' : 'bg-black/5'}`}>
            {children}
          </code>
        ),
      }}
    >
      {children}
    </Markdown>
  );
}
