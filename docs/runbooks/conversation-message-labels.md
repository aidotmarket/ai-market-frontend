# Conversation message labels

`components/ConversationThread.tsx` renders speaker labels from each message’s role and the caller’s `viewerRole`. When those roles match, the own-message branch displays **You** for either a buyer or a seller. Counterparty buyer messages display **Buyer**; counterparty seller messages display **Seller**. The `allai` and `system` roles display **allAI** and **System**. The optional typing indicator also displays **allAI**.

Normal callers are `app/dashboard/seller/inquiries/page.tsx`, which passes `viewerRole="seller"`; `app/dashboard/inquiries/[id]/page.tsx`, which derives the viewer role by comparing the user ID with the conversation’s seller ID; and both thread instances in `components/InquiryWidget.tsx`, which pass `viewerRole="buyer"`.

These are source-level presentation labels. They do not establish whether a message was persisted, delivered, or received. Changing the buyer counterparty label does not change message content, timestamps, styling, alignment, typing behavior, or the mechanisms responsible for saving and delivering messages.
