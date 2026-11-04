// @vitest-environment jsdom
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import MarkdownIt from 'markdown-it';
import ListingMarkdown,{PARITY_CORPUS_SHA256,EXTRA_PARITY_CORPUS_SHA256} from './ListingMarkdown';
const bytes=readFileSync('tests/fixtures/listing-markdown-parity.json');
type Case = {name:string;source:string;html:string};
const corpus=JSON.parse(bytes.toString()) as Case[];
const extraBytes=readFileSync('tests/fixtures/listing-markdown-parity-extra.json');
const extraCorpus=JSON.parse(extraBytes.toString()) as Case[];
function tree(html:string) {
  const root=document.createElement('div');root.innerHTML=html;
  const blocks=new Set(['P','H2','H3','H4','UL','OL','LI']);
  const walk=(node:Node):unknown=>{
    if(node.nodeType===Node.TEXT_NODE)return node.textContent;
    const el=node as Element;
    const children=[...el.childNodes].filter(child=>{
      if(child.nodeType!==Node.TEXT_NODE || child.textContent?.trim())return true;
      const before=child.previousSibling,after=child.nextSibling;
      const beforeBlock=before instanceof Element && blocks.has(before.tagName);
      const afterBlock=after instanceof Element && blocks.has(after.tagName);
      const container=el===root || el.tagName==='UL' || el.tagName==='OL';
      return !(beforeBlock && afterBlock || container && (!before || beforeBlock) && (!after || afterBlock));
    });
    return [el.tagName,el.getAttribute('start'),children.map(walk)];
  };
  return walk(root);
}
describe('backend listing Markdown parity contract',()=>{
  it('pins the byte-identical corpus digest',()=>expect(createHash('sha256').update(bytes).digest('hex')).toBe(PARITY_CORPUS_SHA256));
  it('pins the byte-identical extra corpus digest',()=>expect(createHash('sha256').update(extraBytes).digest('hex')).toBe(EXTRA_PARITY_CORPUS_SHA256));
  for(const item of [...corpus,...extraCorpus])it(item.name,()=>{
    const html=renderToStaticMarkup(<ListingMarkdown text={item.source}/>);
    // Inspect the raw inner HTML before the DOM parser can repair markup.
    const raw=html.slice(html.indexOf('>')+1,-'</div>'.length);
    expect(raw.replace(/<\/?(?:p|h[234]|ul|li|strong|em|br)>|<ol(?: start="(?:[2-9]\d*|1\d+)")?>|<\/ol>/g,'')).not.toMatch(/[<>]/);
    const root=document.createElement('div');root.innerHTML=html;
    const content=root.firstElementChild!;
    for(const element of content.querySelectorAll('*')) {
      expect(['p','h2','h3','h4','ul','ol','li','strong','em','br']).toContain(element.localName);
      for(const attr of element.attributes){expect(element.localName).toBe('ol');expect(attr.name).toBe('start');expect(attr.value).toMatch(/^[1-9]\d*$/);expect(attr.value).not.toBe('1');}
    }
    expect(content.querySelector('a,img,script')).toBeNull();
    expect(tree(content.innerHTML)).toEqual(tree(item.html));
  });
});

it('keeps asterisks visible inside contact text beside an astral symbol',()=>{
  const root=document.createElement('div');
  root.innerHTML=renderToStaticMarkup(<ListingMarkdown text={'x*😀 sales@acme*.io'}/>);
  expect(root.textContent).toBe('x*😀 sales@acme*.io');
  expect(root.textContent).toContain('sales@acme*.io');
  expect(root.textContent).not.toContain('sales@acme.io');
  expect(root.querySelector('em,strong')).toBeNull();
});

it('leaves other markdown-it instances on their original delimiter scanner',()=>{
  const other=new MarkdownIt('commonmark');
  expect(other.render('a*😀*b')).toBe('<p>a<em>😀</em>b</p>\n');
  expect(renderToStaticMarkup(<ListingMarkdown text={'a*😀*b'}/>)).toContain('<p>a*😀*b</p>');
});

it('keeps following blocks and siblings when an over-depth list becomes literal',()=>{
 const deep=corpus.find(item=>item.name==='list-depth-9-escaped-email')!;
 const root=document.createElement('div');
 root.innerHTML=renderToStaticMarkup(<ListingMarkdown text={deep.source+'\n- sibling\n\n# Following'}/>);
 expect(root.querySelector('p')?.textContent).toBe(deep.source+'\n- sibling\n');
 expect(root.querySelector('ul')).toBeNull();
 expect(root.querySelector('h2')?.textContent).toBe('Following');
});
it('preserves unsupported block paragraphs inside a tight list',()=>{
 const root=document.createElement('div');
 root.innerHTML=renderToStaticMarkup(<ListingMarkdown text={'- first\n  ```\n  code\n  ```'}/>);
 expect(root.querySelector('li')?.firstChild?.textContent).toBe('first');
 expect(root.querySelector('li > p')?.textContent).toBe('  ```\n  code\n  ```');
});

// Mirror listing_html_text.VisibleText: strong/em join their surrounding text;
// every other element creates a newline boundary (br only opens).
function visibleText(html:string):string {
  const root=document.createElement('div');root.innerHTML=html;
  const parts:string[]=[];
  function walk(node:Node) {
    if(node.nodeType===Node.TEXT_NODE) {parts.push(node.textContent ?? '');return;}
    const boundary=!['STRONG','EM'].includes((node as Element).tagName);
    if(boundary)parts.push('\n');
    for(const child of node.childNodes)walk(child);
    if(boundary && (node as Element).tagName!=='BR')parts.push('\n');
  }
  for(const child of root.childNodes)walk(child);
  return parts.join('');
}

describe('filter-to-frontend visible-text invariant',()=>{
  for(const item of [...corpus,...extraCorpus])it(item.name,()=>{
    const root=document.createElement('div');
    root.innerHTML=renderToStaticMarkup(<ListingMarkdown text={item.source}/>);
    expect(visibleText(root.firstElementChild!.innerHTML)).toBe(visibleText(item.html));
  });
});

describe('bounded parsing of valid-length adversarial input',()=>{
  for(const item of extraCorpus.filter(item=>item.name.startsWith('r1-deep-')))it(item.name,()=>{
    const start=performance.now();
    expect(()=>renderToStaticMarkup(<ListingMarkdown text={item.source}/>)).not.toThrow();
    expect(performance.now()-start).toBeLessThan(1000);
  });
});
