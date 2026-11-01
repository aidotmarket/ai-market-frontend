import type { AnonymousAllAILocale } from './anonymous-allai';

export const PROMOTE_STRINGS = {
  en: {
    share: 'Share', hide: 'Hide share', copy: 'Copy link', copied: 'Copied', native: 'Native share', kit: 'Share kit', close: 'Close',
    copyText: 'Copy text', paste: 'Text copied, paste it into your post', copyError: 'Could not copy the share link.', unavailable: 'Share controls are unavailable right now.',
    loading: 'Loading share controls...', preview: 'Share card preview', code: 'Code', network: 'Network', other: 'Other', opens: 'Opens', inquiries: 'Inquiries', all: 'All time', d30: '30 days', masked: 'Hidden',
    title: 'OG title', description: 'OG description', caption: 'Caption', regenerate: 'Regenerate', save: 'Save edit',
    regenerateError: 'Could not regenerate the caption.', saveError: 'Could not save the caption.', fallback: 'Fallback caption used. Review before posting.', flagged: 'Caption flagged for review. Public metadata will use the safe fallback.', status: 'Caption status',
  },
  es: {
    share: 'Compartir', hide: 'Ocultar compartir', copy: 'Copiar enlace', copied: 'Copiado', native: 'Compartir en dispositivo', kit: 'Kit para compartir', close: 'Cerrar',
    copyText: 'Copiar texto', paste: 'Texto copiado, pégalo en tu publicación', copyError: 'No se pudo copiar el enlace.', unavailable: 'Los controles no están disponibles ahora.',
    loading: 'Cargando controles...', preview: 'Vista previa de la tarjeta', code: 'Código', network: 'Red', other: 'Otra', opens: 'Aperturas', inquiries: 'Consultas', all: 'Total', d30: '30 días', masked: 'Oculto',
    title: 'Título OG', description: 'Descripción OG', caption: 'Texto', regenerate: 'Regenerar', save: 'Guardar cambios',
    regenerateError: 'No se pudo regenerar el texto.', saveError: 'No se pudo guardar el texto.', fallback: 'Se usó el texto alternativo. Revísalo antes de publicar.', flagged: 'Texto marcado para revisión. Los metadatos públicos usarán la alternativa segura.', status: 'Estado del texto',
  },
  'zh-Hans': {
    share: '分享', hide: '收起分享', copy: '复制链接', copied: '已复制', native: '设备分享', kit: '分享工具', close: '关闭',
    copyText: '复制文本', paste: '文本已复制，请粘贴到帖子中', copyError: '无法复制分享链接。', unavailable: '分享功能暂时不可用。',
    loading: '正在加载分享功能…', preview: '分享卡片预览', code: '代码', network: '平台', other: '其他', opens: '打开次数', inquiries: '咨询次数', all: '全部时间', d30: '30天', masked: '已隐藏',
    title: 'OG 标题', description: 'OG 描述', caption: '文案', regenerate: '重新生成', save: '保存修改',
    regenerateError: '无法重新生成文案。', saveError: '无法保存文案。', fallback: '已使用备用文案。发布前请检查。', flagged: '文案已标记待审核。公开元数据将使用安全的备用内容。', status: '文案状态',
  },
} satisfies Record<AnonymousAllAILocale, Record<string, string>>;

export const PROMOTE_NETWORKS = { x: 'X', li: 'LinkedIn', rd: 'Reddit', bs: 'Bluesky', wa: 'WhatsApp', tg: 'Telegram', em: 'Email' } as const;
