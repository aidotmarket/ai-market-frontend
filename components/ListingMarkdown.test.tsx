// @vitest-environment jsdom
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import ListingMarkdown,{PARITY_CORPUS_SHA256} from './ListingMarkdown';
const bytes=readFileSync('tests/fixtures/listing-markdown-parity.json');
const corpus=JSON.parse(bytes.toString()) as {name:string;source:string;html:string}[];
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
  for(const item of corpus)it(item.name,()=>{
    const root=document.createElement('div');root.innerHTML=renderToStaticMarkup(<ListingMarkdown text={item.source}/>);
    const content=root.firstElementChild!;
    for(const element of content.querySelectorAll('*')) {
      expect(['p','h2','h3','h4','ul','ol','li','strong','em','br']).toContain(element.localName);
      for(const attr of element.attributes){expect(element.localName).toBe('ol');expect(attr.name).toBe('start');expect(attr.value).toMatch(/^[1-9]\d*$/);expect(attr.value).not.toBe('1');}
    }
    expect(content.querySelector('a,img,script')).toBeNull();
    expect(tree(content.innerHTML)).toEqual(tree(item.html));
  });
});

it('keeps following blocks and siblings when an over-depth list becomes literal',()=>{
 const deep=corpus.find(item=>item.name==='list-depth-9-escaped-email')!;
 const root=document.createElement('div');
 root.innerHTML=renderToStaticMarkup(<ListingMarkdown text={deep.source+'\n- sibling\n\n# Following'}/>);
 expect(root.querySelector('p')?.textContent).toBe(deep.source+'\n- sibling');
 expect(root.querySelector('ul')).toBeNull();
 expect(root.querySelector('h2')?.textContent).toBe('Following');
});
it('preserves unsupported block paragraphs inside a tight list',()=>{
 const root=document.createElement('div');
 root.innerHTML=renderToStaticMarkup(<ListingMarkdown text={'- first\n  ```\n  code\n  ```'}/>);
 expect(root.querySelector('li')?.firstChild?.textContent).toBe('first');
 expect(root.querySelector('li > p')?.textContent).toBe('  ```\n  code\n  ```');
});
