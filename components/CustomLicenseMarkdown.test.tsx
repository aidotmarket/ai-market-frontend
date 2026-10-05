// @vitest-environment jsdom
import {cleanup,render} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import CustomLicenseMarkdown from './CustomLicenseMarkdown';
afterEach(cleanup);
it('renders only headings, lists, bold and italic',()=>{
 const {container}=render(<CustomLicenseMarkdown text={'# Terms\n\n## Scope\n\n- **Bold** and *italic*\n- Next\n\n1. First\n2. Second\n'}/>);
 expect(container.querySelector('h1')?.textContent).toBe('Terms');
 expect(container.querySelector('h2')?.textContent).toBe('Scope');
 expect(container.querySelector('strong')?.textContent).toBe('Bold');
 expect(container.querySelector('em')?.textContent).toBe('italic');
 expect(container.querySelectorAll('li')).toHaveLength(4);
});
it('preserves literal plain text, Unicode, whitespace and escapes',()=>{
 const text='  Café 🧑🏽‍💻 e\u0301\n\tPlain   text\n\n\\escaped & entity;\n';
 const {container}=render(<CustomLicenseMarkdown text={text}/>);
 expect(container.textContent).toBe(text);
});
it.each([
 '<script>alert(1)</script>\n<img src="https://evil.test/x" onerror="alert(1)">',
 '![remote](https://evil.test/image) [unsafe](javascript:alert(1))',
 '[external](https://evil.test/) <https://evil.test/>',
 '![reference][img]\n\n[img]: https://evil.test/image',
 '`code`\n\n> quote\n\n---',
])('shows unsupported syntax literally without executable or network elements: %s',text=>{
 const {container}=render(<CustomLicenseMarkdown text={'# Terms\n\n'+text}/>);
 expect(container.querySelector('h1')).toBeTruthy();
 expect(container.querySelector('script,img,a,iframe,object,video,source,code,blockquote,hr')).toBeNull();
 expect(container.textContent).toContain(text.split('\n\n')[0]);
});
