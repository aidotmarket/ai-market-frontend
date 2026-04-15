import { collection, config, fields } from '@keystatic/core';

const isDevelopment = process.env.NODE_ENV === 'development';
const hasGitHubStorageEnv = Boolean(
  process.env.KEYSTATIC_GITHUB_CLIENT_ID &&
  process.env.KEYSTATIC_GITHUB_CLIENT_SECRET &&
  process.env.KEYSTATIC_SECRET
);

export default config({
  storage: isDevelopment || !hasGitHubStorageEnv
    ? { kind: 'local' }
    : {
        kind: 'github',
        repo: {
          owner: 'aidotmarket',
          name: 'ai-market-frontend',
        },
      },
  collections: {
    posts: collection({
      label: 'Blog Posts',
      slugField: 'title',
      path: 'content/blog/*',
      format: { contentField: 'content' },
      schema: {
        title: fields.slug({ name: { label: 'Title' } }),
        description: fields.text({ label: 'Description', multiline: true }),
        date: fields.date({ label: 'Publish Date' }),
        image: fields.image({
          label: 'Hero Image',
          directory: 'public/blog',
          publicPath: '/blog/',
        }),
        author: fields.text({ label: 'Author', defaultValue: 'Max Robbins' }),
        tags: fields.array(fields.text({ label: 'Tag' }), {
          label: 'Tags',
          itemLabel: (props) => props.value || 'Tag',
        }),
        content: fields.mdx({
          label: 'Content',
          options: {
            image: {
              directory: 'public/blog',
              publicPath: '/blog/',
            },
          },
        }),
      },
    }),
  },
});
