export const ANONYMOUS_ALLAI_LOCALES = ['en', 'es', 'zh-Hans'] as const;

export type AnonymousAllAILocale = (typeof ANONYMOUS_ALLAI_LOCALES)[number];

export type AnonymousSafeOutcome =
  | 'no_matches'
  | 'retrieval_unavailable'
  | 'answer_unverified'
  | 'surface_disabled'
  | 'rate_limited'
  | 'unsupported_language';

interface AnonymousAllAIResources {
  assistantLabel: string;
  openAssistant: string;
  closeAssistant: string;
  greeting: string;
  emptyPrompt: string;
  inputPlaceholder: string;
  sendMessage: string;
  languageLabel: string;
  historicalAnswer: string;
  accountRequired: string;
  genericError: string;
  safeOutcomes: Record<AnonymousSafeOutcome, string>;
}

export const ANONYMOUS_ALLAI_RESOURCES: Record<
  AnonymousAllAILocale,
  AnonymousAllAIResources
> = {
  en: {
    assistantLabel: 'allAI · AI assistant',
    openAssistant: 'Open allAI · AI assistant',
    closeAssistant: 'Close allAI · AI assistant',
    greeting: "Hi! I'm allAI, the ai.market AI assistant. How can I help?",
    emptyPrompt: 'How can I help you today?',
    inputPlaceholder: 'Ask allAI anything…',
    sendMessage: 'Send message',
    languageLabel: 'Language',
    historicalAnswer: 'Earlier session — facts will be checked again when you ask a new question.',
    accountRequired: 'An account is required for this step.',
    genericError: 'Sorry, something went wrong. Please try again.',
    safeOutcomes: {
      no_matches: 'No matches were found for this query at this time. Try refining the query or browse the public Request Board.',
      retrieval_unavailable: "I couldn't verify the marketplace results right now. Please try again.",
      answer_unverified: "I couldn't verify that answer against current public information, so I won't show it.",
      surface_disabled: 'The AI assistant is temporarily unavailable.',
      rate_limited: 'The anonymous usage limit has been reached. Please try again later.',
      unsupported_language: "That language isn't supported yet. Please choose English, Spanish, or Simplified Chinese.",
    },
  },
  es: {
    assistantLabel: 'allAI · Asistente de IA',
    openAssistant: 'Abrir allAI · Asistente de IA',
    closeAssistant: 'Cerrar allAI · Asistente de IA',
    greeting: 'Hola. Soy allAI, el asistente de IA de ai.market. ¿En qué puedo ayudarte?',
    emptyPrompt: '¿En qué puedo ayudarte hoy?',
    inputPlaceholder: 'Pregunta a allAI…',
    sendMessage: 'Enviar mensaje',
    languageLabel: 'Idioma',
    historicalAnswer: 'Sesión anterior: los datos se comprobarán de nuevo cuando hagas una pregunta nueva.',
    accountRequired: 'Necesitas una cuenta para realizar este paso.',
    genericError: 'Ha ocurrido un error. Inténtalo de nuevo.',
    safeOutcomes: {
      no_matches: 'No se encontraron resultados para esta consulta en este momento. Prueba a concretar la búsqueda o consulta el tablón público de solicitudes.',
      retrieval_unavailable: 'No pude verificar los resultados del mercado ahora mismo. Inténtalo de nuevo.',
      answer_unverified: 'No pude verificar esa respuesta con la información pública actual, por lo que no la mostraré.',
      surface_disabled: 'El asistente de IA no está disponible temporalmente.',
      rate_limited: 'Se alcanzó el límite de uso anónimo. Inténtalo de nuevo más tarde.',
      unsupported_language: 'Ese idioma aún no es compatible. Elige inglés, español o chino simplificado.',
    },
  },
  'zh-Hans': {
    assistantLabel: 'allAI · AI 助手',
    openAssistant: '打开 allAI · AI 助手',
    closeAssistant: '关闭 allAI · AI 助手',
    greeting: '你好！我是 allAI，ai.market 的 AI 助手。需要什么帮助？',
    emptyPrompt: '今天需要什么帮助？',
    inputPlaceholder: '向 allAI 提问…',
    sendMessage: '发送消息',
    languageLabel: '语言',
    historicalAnswer: '较早的会话——提出新问题时会重新核对事实。',
    accountRequired: '此步骤需要账户。',
    genericError: '抱歉，出现了问题。请重试。',
    safeOutcomes: {
      no_matches: '目前未找到与此查询匹配的结果。请尝试细化查询，或浏览公开的数据请求板。',
      retrieval_unavailable: '目前无法验证市场检索结果，请稍后重试。',
      answer_unverified: '无法根据当前公开信息验证该回答，因此不会显示该回答。',
      surface_disabled: 'AI 助手暂时不可用。',
      rate_limited: '匿名使用额度已达到上限，请稍后重试。',
      unsupported_language: '暂不支持该语言。请选择英语、西班牙语或简体中文。',
    },
  },
};

export function anonymousAllAIResources(locale: AnonymousAllAILocale) {
  return ANONYMOUS_ALLAI_RESOURCES[locale];
}

export function preferredAnonymousAllAILocale(language?: string): AnonymousAllAILocale {
  const normalized = language?.toLowerCase() ?? '';
  if (normalized.startsWith('es')) return 'es';
  if (normalized.startsWith('zh')) return 'zh-Hans';
  return 'en';
}
