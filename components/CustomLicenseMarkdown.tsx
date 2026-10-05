import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';

// Display only: never return rendered/parsed text to storage or hash verification.
type Node = {type:string; children?:Node[]; value?:string; position?:{start:{offset?:number};end:{offset?:number}}};
const allowed = new Set(['root','paragraph','heading','list','listItem','strong','emphasis','text']);
const formatted = new Set(['heading','list','strong','emphasis']);
function restrictedSyntax() {
  return (tree:Node, file:{value:unknown}) => {
    const source=String(file.value);
    let hasFormatting=false;
    const visit=(node:Node):Node=>{
      if(!allowed.has(node.type)) return {type:'text',value:source.slice(node.position?.start.offset,node.position?.end.offset)};
      if(formatted.has(node.type))hasFormatting=true;
      if(node.children)node.children=node.children.map(visit);
      return node;
    };
    visit(tree);
    // Preserve literal plain-text whitespace, escapes and Unicode in older terms.
    if(!hasFormatting)tree.children=[{type:'text',value:source}];
  };
}
const tags=['p','h1','h2','h3','h4','h5','h6','ul','ol','li','strong','em'];
export default function CustomLicenseMarkdown({text}:{text:string}) {
  return <div dir="auto" className="whitespace-pre-wrap break-words text-sm leading-6 [tab-size:4] [&_h1]:text-xl [&_h2]:text-lg [&_h3]:text-base [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_h4]:font-semibold [&_h5]:font-semibold [&_h6]:font-semibold [&_p]:my-2 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6">
    <Markdown remarkRehypeOptions={{handlers:{text:(_state,node)=>({type:'text',value:String(node.value)})}}} remarkPlugins={[restrictedSyntax]} rehypePlugins={[[rehypeSanitize,{tagNames:tags,attributes:{ol:['start']}}]]} allowedElements={tags}>{text}</Markdown>
  </div>;
}
