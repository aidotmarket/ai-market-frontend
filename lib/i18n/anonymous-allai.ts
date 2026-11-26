export const ANONYMOUS_ALLAI_LOCALES = ['en', 'es', 'zh-Hans'] as const;

export type AnonymousAllAILocale = (typeof ANONYMOUS_ALLAI_LOCALES)[number];

export type AnonymousSafeOutcome =
  | 'no_matches'
  | 'retrieval_unavailable'
  | 'answer_unverified'
  | 'surface_disabled'
  | 'rate_limited'
  | 'message_too_long'
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
  homepageFallbackGuidance: string;
  gatewayFallback: { guidance: string; link: string };
  listingRecovery: {
    error: string;
    timeout: string;
    guidance: string;
    search: string;
    support: string;
    signIn: string;
  };
  recoveryLinks: {
    searchListings: string;
    postRequest: string;
    postRequestWithSellers: string;
  };
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
    homepageFallbackGuidance: "I couldn't verify that answer against current listings. Try asking about a specific sector.",
    gatewayFallback: {
      guidance: 'Start with a free ai.market account. Once signed in, go to Sell Data, open Gateways, and choose Add a gateway.',
      link: 'Read the AIM Data setup guide',
    },
    listingRecovery: {
      error: "We couldn't get an answer.",
      timeout: 'This is taking longer than expected.',
      guidance: 'Try a narrower question about the listing description, data format, or license.',
      search: 'Search the catalogue',
      support: 'Contact support',
      signIn: 'Sign in to ask the seller.',
    },
    recoveryLinks: {
      searchListings: 'Search listings directly',
      postRequest: 'Post a request',
      postRequestWithSellers: 'Post a request and sellers will come to you',
    },
    safeOutcomes: {
      no_matches: 'No listings match yet. Try different words, or post a request so sellers can find you.',
      retrieval_unavailable: "I couldn't check the marketplace results right now, so I won't guess. You can search listings directly, or post a request and sellers will come to you.",
      answer_unverified: "I couldn't check that answer against current listings, so I won't guess. You can search listings directly, or post a request and sellers will come to you.",
      surface_disabled: 'The AI assistant is temporarily unavailable.',
      rate_limited: "You've reached the chat limit for now. Please try again later. Meanwhile you can search listings directly, or post a request and sellers will come to you.",
      message_too_long: 'That message is too long. Please shorten it and send it again.',
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
    homepageFallbackGuidance: 'No pude contrastar esa respuesta con los anuncios actuales. Prueba a preguntar por un sector concreto.',
    gatewayFallback: {
      guidance: 'Empieza con una cuenta gratuita de ai.market. Tras iniciar sesión, ve a Sell Data, abre Gateways y selecciona Add a gateway.',
      link: 'Leer la guía de configuración de AIM Data',
    },
    listingRecovery: {
      error: 'No pudimos obtener una respuesta.',
      timeout: 'La respuesta está tardando más de lo esperado.',
      guidance: 'Prueba con una pregunta más concreta sobre la descripción del anuncio, el formato de los datos o la licencia.',
      search: 'Buscar en el catálogo',
      support: 'Contactar con soporte',
      signIn: 'Inicia sesión para preguntar al vendedor.',
    },
    recoveryLinks: {
      searchListings: 'Buscar anuncios directamente',
      postRequest: 'Publicar una solicitud',
      postRequestWithSellers: 'Publicar una solicitud para que los vendedores contacten contigo',
    },
    safeOutcomes: {
      no_matches: 'Todavía no hay anuncios que coincidan. Prueba con otras palabras o publica una solicitud para que los vendedores te encuentren.',
      retrieval_unavailable: 'No pude comprobar los resultados del mercado ahora mismo, así que no voy a adivinar. Puedes buscar anuncios directamente o publicar una solicitud para que los vendedores contacten contigo.',
      answer_unverified: 'No pude contrastar esa respuesta con los anuncios actuales, así que no voy a adivinar. Puedes buscar anuncios directamente o publicar una solicitud para que los vendedores contacten contigo.',
      surface_disabled: 'El asistente de IA no está disponible temporalmente.',
      rate_limited: 'Has alcanzado el límite del chat por ahora. Inténtalo de nuevo más tarde. Mientras tanto, puedes buscar anuncios directamente o publicar una solicitud para que los vendedores contacten contigo.',
      message_too_long: 'Ese mensaje es demasiado largo. Acórtalo y envíalo de nuevo.',
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
    homepageFallbackGuidance: '无法根据当前商品核实该回答。请尝试询问具体行业。',
    gatewayFallback: {
      guidance: '先创建一个免费的 ai.market 账户。登录后，前往 Sell Data，打开 Gateways，然后选择 Add a gateway。',
      link: '阅读 AIM Data 设置指南',
    },
    listingRecovery: {
      error: '暂时无法获取答案。',
      timeout: '回答所需的时间比预期更长。',
      guidance: '请尝试就商品描述、数据格式或许可提出更具体的问题。',
      search: '搜索目录',
      support: '联系支持',
      signIn: '登录后向卖家提问。',
    },
    recoveryLinks: {
      searchListings: '直接搜索商品',
      postRequest: '发布需求',
      postRequestWithSellers: '发布需求，让卖家联系你',
    },
    safeOutcomes: {
      no_matches: '暂时没有匹配的商品。请尝试其他关键词，或发布需求，让卖家找到你。',
      retrieval_unavailable: '目前无法核实市场搜索结果，所以我不会猜测。你可以直接搜索商品，或发布需求，让卖家联系你。',
      answer_unverified: '无法根据当前商品核实该回答，所以我不会猜测。你可以直接搜索商品，或发布需求，让卖家联系你。',
      surface_disabled: 'AI 助手暂时不可用。',
      rate_limited: '你目前已达到聊天使用上限，请稍后重试。在此期间，你可以直接搜索商品，或发布需求，让卖家联系你。',
      message_too_long: '这条消息太长了。请缩短后重新发送。',
      unsupported_language: '暂不支持该语言。请选择英语、西班牙语或简体中文。',
    },
  },
};

export function anonymousAllAIResources(locale: AnonymousAllAILocale) {
  return ANONYMOUS_ALLAI_RESOURCES[locale];
}

export function isAnonymousSafeOutcome(value: unknown): value is AnonymousSafeOutcome {
  return typeof value === 'string' && Object.hasOwn(ANONYMOUS_ALLAI_RESOURCES.en.safeOutcomes, value);
}

export function preferredAnonymousAllAILocale(language?: string): AnonymousAllAILocale {
  const normalized = language?.toLowerCase() ?? '';
  if (normalized.startsWith('es')) return 'es';
  if (normalized.startsWith('zh')) return 'zh-Hans';
  return 'en';
}
