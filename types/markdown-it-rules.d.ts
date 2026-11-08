// @types/markdown-it omits these built-in rule modules used by our backend port.
declare module 'markdown-it/lib/rules_block/list.mjs' {
  import type {RuleBlock} from 'markdown-it/lib/parser_block.mjs';
  const list: RuleBlock;
  export default list;
}
declare module 'markdown-it/lib/rules_block/paragraph.mjs' {
  import type {RuleBlock} from 'markdown-it/lib/parser_block.mjs';
  const paragraph: RuleBlock;
  export default paragraph;
}
declare module 'markdown-it/lib/rules_block/reference.mjs' {
  import type {RuleBlock} from 'markdown-it/lib/parser_block.mjs';
  const reference: RuleBlock;
  export default reference;
}
declare module 'markdown-it/lib/rules_block/heading.mjs' {
  import type {RuleBlock} from 'markdown-it/lib/parser_block.mjs';
  const heading: RuleBlock;
  export default heading;
}
declare module 'markdown-it/lib/rules_block/lheading.mjs' {
  import type {RuleBlock} from 'markdown-it/lib/parser_block.mjs';
  const lheading: RuleBlock;
  export default lheading;
}
