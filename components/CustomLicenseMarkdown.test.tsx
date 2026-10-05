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

it('keeps named, numeric, unsupported glyph and bidi entities literal beside emphasis',()=>{
 const entities='&copy; &#169; &#x1F600; &#x1D504; &#x4E2D; &#x202E; &#8238; &rlm; &amp; &lt; &unknown;';
 const {container}=render(<CustomLicenseMarkdown text={'# Terms\n\nLiteral '+entities+' **'+entities+'** and *'+entities+'* end.'}/>);
 expect(container.querySelector('h1')?.textContent).toBe('Terms');
 expect(container.querySelector('p')?.textContent).toBe('Literal '+entities+' '+entities+' and '+entities+' end.');
 expect(container.querySelector('strong')?.textContent).toBe(entities);
 expect(container.querySelector('em')?.textContent).toBe(entities);
});
it('retains all six heading levels and nested lists with literal entities',()=>{
 const {container}=render(<CustomLicenseMarkdown text={'# &copy;\n\n## &#169;\n\n### &#x1F600;\n\n#### &#x4E2D;\n\n##### &rlm;\n\n###### &#8238;\n\n- **&copy;**\n  - *&#x1D504;*\n\n3. &#x202E;\n'}/>);
 for(const [index,value] of ['&copy;','&#169;','&#x1F600;','&#x4E2D;','&rlm;','&#8238;'].entries())expect(container.querySelector('h'+(index+1))?.textContent).toBe(value);
 expect(container.querySelector('ul ul em')?.textContent).toBe('&#x1D504;');
 expect(container.querySelector('ol')?.getAttribute('start')).toBe('3');
 expect(container.querySelector('ol li')?.textContent).toBe('&#x202E;');
});
it.each([
 'Plain   terms\n\\*literal\\* &copy; &#x1F600; end.\n\tCafé e\u0301 🦊\n',
 '  \\# Terms\n\t\\*\\*literal\\*\\* &rlm; &#x202E;\n',
])('keeps unformatted source exactly, including escapes and entities',text=>{
 const {container}=render(<CustomLicenseMarkdown text={text}/>);
 expect(container.textContent).toBe(text);
 expect(container.querySelector('h1,strong,em')).toBeNull();
});
it('keeps formatted whitespace and Unicode while applying supported Markdown escapes',()=>{
 const {container}=render(<CustomLicenseMarkdown text={'# Terms\n\nCafé e\u0301 🦊   A\tB \\*literal\\* \\&copy; **rights** and *&#x202E;*'}/>);
 expect(container.querySelector('p')?.textContent).toBe('Café e\u0301 🦊   A\tB *literal* &copy; rights and &#x202E;');
 expect(container.querySelector('strong')?.textContent).toBe('rights');
});
it('keeps reference definitions and unsupported source spans literal after entities',()=>{
 const unsupported='[link][ref] ![image][ref]\n\n[ref]: https://evil.test/a "&copy;"\n\n<script>&copy;</script>';
 const {container}=render(<CustomLicenseMarkdown text={'# Terms &copy;\n\n'+unsupported}/>);
 expect(container.querySelector('h1')?.textContent).toBe('Terms &copy;');
 for(const span of unsupported.split('\n\n'))expect(container.textContent).toContain(span);
 expect(container.querySelector('a,img,script')).toBeNull();
});
