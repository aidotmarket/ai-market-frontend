import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import {gfmTable} from 'micromark-extension-gfm-table';
import {gfmTableFromMarkdown} from 'mdast-util-gfm-table';
import type {Processor} from 'unified';
import type {ListItem} from 'mdast';
import type {} from 'remark-parse';

export const PARITY_CORPUS_SHA256 = 'b0da0779cf59ab28f09985844070657818985ca0cd9470d7d9d4c1d96e7b657a';
export const MAX_LIST_NESTING = 8;
type Node = {type:string; children?:Node[]; value?:string; depth?:number; start?:number | null; data?:{hName?:string}; position?:{start:{line:number;offset?:number};end:{line:number;offset?:number}}};
const supported = new Set(['root','paragraph','heading','list','listItem','strong','emphasis','text','break']);
const inline = new Set(['text','strong','emphasis','break']);
const tags = ['p','h2','h3','h4','ul','ol','li','strong','em','br'];

function restrictedSyntax(this:Processor) {
  const data = this.data();
  const extensions = data.micromarkExtensions || (data.micromarkExtensions = []);
  // Recognize tables as one unsupported block, matching the backend parser.
  extensions.push({disable:{null:['characterReference']}},gfmTable());
  const mdastExtensions=data.fromMarkdownExtensions || (data.fromMarkdownExtensions=[]);
  mdastExtensions.push(gfmTableFromMarkdown());
  return (tree:Node, file:{value:unknown}) => {
    const source = String(file.value);
    const lines = source.split('\n');
    const literal = (node:Node):Node => ({type:'paragraph',data:{hName:node.type!=='paragraph'?'p':undefined},children:[{type:'text',value:lines.slice((node.position?.start.line ?? 1)-1,node.position?.end.line).join('\n')}]});
    const overflow = (node:Node, depth=0):boolean => {
      const next = depth + (node.type === 'list' ? 1 : 0);
      return next > MAX_LIST_NESTING || !!node.children?.some(child => overflow(child,next));
    };
    // Definitions stay visible and never resolve reference links. Preserve inline
    // formatting in the otherwise ordinary bracket text, as the backend does.
    const references = (node:Node):Node[] => {
      if(node.type === 'linkReference' || node.type === 'imageReference') {
        const raw = source.slice(node.position?.start.offset,node.position?.end.offset);
        const children = node.children ?? [];
        const first = children[0]?.position?.start.offset;
        const last = children.at(-1)?.position?.end.offset;
        if(first !== undefined && last !== undefined) return [
          {type:'text',value:source.slice(node.position?.start.offset,first)},
          ...children.flatMap(references),
          {type:'text',value:source.slice(last,node.position?.end.offset)},
        ];
        return [{type:'text',value:raw}];
      }
      if(node.children)node.children=node.children.flatMap(references);
      return [node];
    };
    references(tree);
    const unsupportedInline = (node:Node):boolean => !inline.has(node.type) || !!node.children?.some(unsupportedInline);
    const visit = (node:Node, top=false):Node => {
      if(!supported.has(node.type) || (top && overflow(node)))return literal(node);
      if(node.type === 'paragraph' || node.type === 'heading') {
        if(node.children?.some(unsupportedInline))return literal(node);
      }
      if(node.type === 'heading')node.depth=Math.min((node.depth ?? 1)+1,4);
      if(node.type === 'list' && (node.start ?? 1) <= 1)node.start=undefined;
      if(node.children)node.children=node.children.map(child=>visit(child,node.type==='root'));
      return node;
    };
    visit(tree);
  };
}

// Display only: never write rendered text back to storage or hash verification.
export default function ListingMarkdown({text}:{text:string}) {
  const source=text.replace(/\r\n?/g,'\n');
  return <div dir="auto" className="break-words text-sm leading-6 [tab-size:4] [&_h2]:text-xl [&_h3]:text-lg [&_h4]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_h4]:font-semibold [&_p]:my-2 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6">
    <Markdown remarkRehypeOptions={{handlers:{
      listItem:(state,node:ListItem,parent)=>{
        const loose=parent?.type==='list' && (parent.spread || parent.children.some(item=>item.spread));
        const children=node.children.flatMap(child=>{
          const result=state.one(child,node);
          const results=Array.isArray(result)?result:result?[result]:[];
          return results.flatMap(result=>!loose && child.type==='paragraph' && child.data?.hName!=='p' && result.type==='element' && result.tagName==='p'?result.children:[result]);
        });
        return {type:'element',tagName:'li',properties:{},children};
      },
      text:(_state,node)=>({type:'text',value:String(node.value)}),
      break:()=>({type:'element',tagName:'br',properties:{},children:[]}),
    }}} remarkPlugins={[restrictedSyntax]} rehypePlugins={[[rehypeSanitize,{tagNames:tags,attributes:{ol:['start']}}]]} allowedElements={tags}>{source}</Markdown>
  </div>;
}
