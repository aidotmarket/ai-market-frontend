import type { ExplainAction, ExplainQuestion } from "@/api/explain";
import { preferredAnonymousAllAILocale } from "./anonymous-allai";

// Labels, aliases and local suggestion copy from the Stage A backend registry.
const LABELS = {
  publish: ["Why can't I publish?", "¿Por qué no puedo publicar?", "为什么我无法发布？"],
  storage: ["Is my storage connected?", "¿Está conectado mi almacenamiento?", "我的存储连接了吗？"],
  where_am_i: ["Where am I?", "¿En qué paso estoy?", "我在哪一步？"],
  listing_status: ["What is the status of my listing?", "¿Cuál es el estado de mi anuncio?", "我的商品是什么状态？"],
  order_status: ["What is the status of my order?", "¿Cuál es el estado de mi pedido?", "我的订单是什么状态？"],
} as const;

const ALIASES = {
  publish: [["why can't i publish", "why can i not publish", "why cant i publish", "unable to publish", "what is blocking publication", "what is blocking my publish", "why won't my listing publish"], ["por qué no puedo publicar", "qué impide publicar", "no puedo publicar"], ["为什么我无法发布", "为什么不能发布", "为什么我不能发布", "发布不了", "无法发布"]],
  storage: [["is my storage connected", "is my storage connection verified", "is my bucket connected", "storage connection status"], ["está conectado mi almacenamiento", "mi almacenamiento está conectado", "conexión de mi almacenamiento"], ["我的存储连接了吗", "存储是否已连接", "存储已连接吗", "存储连接状态"]],
  where_am_i: [["where am i", "which step am i on", "what step am i on", "what is my current step"], ["en qué paso estoy", "cuál es mi paso actual", "dónde estoy"], ["我在哪一步", "现在进行到哪一步", "当前步骤"]],
  listing_status: [["status of my listing", "my listing status", "is my listing published", "status of my listings"], ["estado de mi anuncio", "estado de mis anuncios", "mi anuncio está publicado"], ["我的商品是什么状态", "商品状态", "我的商品发布了吗", "我的商品上架了吗"]],
  order_status: [["status of my order", "my order status", "where is my order", "has my order been delivered", "status of my orders"], ["estado de mi pedido", "estado de mis pedidos", "dónde está mi pedido", "se ha entregado mi pedido"], ["我的订单是什么状态", "订单状态", "我的订单到哪了", "我的订单交付了吗"]],
} as const;

const suggestions = ["Choose a question to explain this page.", "Elige una pregunta para entender esta página.", "请选择一个问题来了解此页面。"] as const;
const select_context = ["Open the relevant page and choose its role or item.", "Abre la página correspondiente y elige su rol o elemento.", "请打开相关页面并选择角色或项目。"] as const;
const unavailable = ["I couldn't verify the current status. Try again from the page.", "No pude verificar el estado actual. Vuelve a intentarlo desde la página.", "暂时无法核实当前状态，请在相关页面重试。"] as const;

const actions: Record<ExplainAction, readonly [string, string, string]> = {
  open_workspace: ['Focus Seller Workspace', 'Poner el foco en el espacio de trabajo del vendedor', '将焦点移至卖家工作区'],
  open_storage: ['Focus Storage', 'Poner el foco en Almacenamiento', '将焦点移至存储'],
  open_files: ['Focus Choose your files', 'Poner el foco en Elegir archivos', '将焦点移至“选择文件”'],
  save_files: ['Focus Save selected files', 'Poner el foco en Guardar archivos seleccionados', '将焦点移至“保存所选文件”'],
  open_license: ['Focus Licence', 'Poner el foco en Licencia', '将焦点移至许可证'],
  open_listing: ['Focus Describe and price', 'Poner el foco en Describir y fijar precio', '将焦点移至“描述与定价”'],
  open_review: ['Focus Review', 'Poner el foco en Revisar', '将焦点移至审核'],
  publish: ['Focus Publish this listing', 'Poner el foco en Publicar este anuncio', '将焦点移至“发布此商品”'],
  view_listing: ['Focus the listing', 'Poner el foco en el anuncio', '将焦点移至商品'],
  view_listings: ['Focus the listings', 'Poner el foco en los anuncios', '将焦点移至商品列表'],
  view_order: ['Focus the order', 'Poner el foco en el pedido', '将焦点移至订单'],
  view_orders: ['Focus the orders', 'Poner el foco en los pedidos', '将焦点移至订单列表'],
};

export const explainQuestions = Object.keys(LABELS) as ExplainQuestion[];
const localeIndex = { en: 0, es: 1, 'zh-Hans': 2 } as const;

export function explainCopy(language?: string) {
  const locale = preferredAnonymousAllAILocale(language);
  const index = localeIndex[locale];
  return {
    locale,
    title: ['Explain', 'Explicar', '解释'][index],
    question: (question: ExplainQuestion) => LABELS[question][index],
    action: (action: ExplainAction) => actions[action][index],
    input: ['Ask about this page', 'Pregunta sobre esta página', '询问有关此页面的问题'][index],
    send: ['Ask', 'Preguntar', '提问'][index],
    buyer: ['Buyer', 'Comprador', '买家'][index],
    seller: ['Seller', 'Vendedor', '卖家'][index],
    busy: ['Checking current status…', 'Consultando el estado actual…', '正在核实当前状态…'][index],
    suggestions: suggestions[index],
    selectContext: select_context[index],
    unavailable: unavailable[index],
    possibleMatch: [
      'I checked this session’s history. I couldn’t verify which turn came from this request.',
      'Consulté el historial de esta sesión. No pude verificar qué respuesta correspondía a esta solicitud.',
      '已检查此会话的历史记录，无法确认哪条回复对应此次请求。',
    ][index],
    noMatch: [
      'No new matching turn appeared in this session’s recent history yet.',
      'Todavía no aparece una respuesta nueva que coincida en el historial reciente de esta sesión.',
      '此会话的近期历史记录中尚未出现匹配的新回复。',
    ][index],
    uncertain: [
      'I couldn’t confirm whether your question was saved.',
      'No pude confirmar si se guardó tu pregunta.',
      '无法确认你的问题是否已保存。',
    ][index],
  };
}

export function matchExplainQuestion(text: string, language: string): ExplainQuestion | undefined {
  const locale = preferredAnonymousAllAILocale(language);
  const index = localeIndex[locale];
  const normalized = text.normalize('NFKC').toLowerCase().replaceAll('’', "'")
    .replace(/[^\p{L}\p{N}\p{M}_' ]/gu, ' ').trim().replace(/\s+/g, ' ');
  const matches = explainQuestions.filter(question => ALIASES[question][index].some(alias => {
    if (locale === 'zh-Hans') return normalized.includes(alias);
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![\\p{L}\\p{N}\\p{M}_])${escaped}(?![\\p{L}\\p{N}\\p{M}_])`, 'u').test(normalized);
  }));
  return matches.length === 1 ? matches[0] : undefined;
}
