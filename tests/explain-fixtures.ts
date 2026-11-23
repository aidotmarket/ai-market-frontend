import type { ExplainAnswer, ExplainQuestion, ExplainRequest } from '@/api/explain';
import { explainCopy } from '@/lib/i18n/explain';
import type { User } from '@/types';

export const ids = {
  draft: '11111111-1111-4111-8111-111111111111',
  listing: '22222222-2222-4222-8222-222222222222',
  order: '33333333-3333-4333-8333-333333333333',
  conversation: '44444444-4444-4444-8444-444444444444',
  session: '55555555-5555-4555-8555-555555555555',
  successor: '66666666-6666-4666-8666-666666666666',
};

export const explainUser = {
  id: 'synthetic-user', status: 'active', role: 'seller', email_verified_at: '2026-11-01T00:00:00Z',
} as User;

export function bearer(id: string | null = ids.session, organization = 'synthetic-organization', subject = explainUser.id) {
  return `fixture.${btoa(JSON.stringify({
    type: 'access', sub: subject, organization_id: organization, auth_generation: 0, session_id: id ?? undefined,
  })).replace(/=+$/, '')}.fixture`;
}

const saved = { draft_id: ids.draft, draft_version: 2, source_version: 4 };
export const questions = {
  publish: { kind: 'workspace', ...saved },
  storage: { kind: 'workspace', ...saved },
  where_am_i: {
    kind: 'step', ...saved, visible_step: 'data', visible_step_state: 'current',
    visible_reason_code: 'files_pending_save', files_pending: true, licence_unsaved: true,
  },
  listing_status: { kind: 'listing', listing_id: ids.listing },
  order_status: { kind: 'order', role: 'buyer', order_id: ids.order },
} as const;

const facts = {
  publish: {
    availability: 'known', next_action: 'open_review', saved_step: 'review',
    publication_state: 'draft', blocking_reason_codes: ['review_approval_required'],
  },
  storage: {
    availability: 'known', next_action: 'open_files', connection_status: 'verified',
    connection_version: 7, verification_status: 'current', selected_source_matches_current_version: true,
  },
  where_am_i: { availability: 'known', next_action: 'save_files', saved_step: 'review',
    visible_step: 'data', visible_step_state: 'current', visible_reason_code: 'files_pending_save',
    files_pending: true, licence_unsaved: true },
  listing_status: {
    availability: 'known', next_action: 'view_listing', view_kind: 'selected',
    review_state: 'approved', listing_state: 'published',
  },
  order_status: {
    availability: 'known', next_action: 'view_order', view_kind: 'selected',
    order_state: 'delivered', participant_role: 'buyer', fulfillment_state: 'delivered',
  },
} as const;

const answers = {
  publish: 'The listing is still a draft. Open Review and complete the approval before publishing.',
  storage: 'The selected storage connection is verified and matches saved version 7. Continue to Files.',
  where_am_i: 'You are choosing files. Your last saved step was Review. Your file and licence changes are unsaved.',
  listing_status: 'This listing is published. Open Seller Workspace to view it.',
  order_status: 'This order is delivered. Open the order page to view delivery details.',
} satisfies Record<ExplainQuestion, string>;

export function answerFixture(request: ExplainRequest): ExplainAnswer {
  const { question, locale } = request;
  const localStep = {
    en: answers.where_am_i,
    es: 'Estás eligiendo archivos. El último paso guardado fue Revisar. Los cambios en archivos y licencia están sin guardar.',
    'zh-Hans': '你正在选择文件。 上次保存的步骤是“审核”。 文件和许可证的更改尚未保存。',
  };
  return {
    outcome: 'answered', conversation_id: ids.conversation, expires_at: '2099-01-01T00:00:00Z',
    turn: {
      id: crypto.randomUUID(), question, locale, label: explainCopy(locale).question(question),
      answer: question === 'where_am_i' ? localStep[locale] : answers[question], created_at: '2026-11-23T00:00:00Z',
    },
    facts: facts[question],
  };
}
