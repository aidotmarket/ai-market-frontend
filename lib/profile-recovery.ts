import type { PendingProfileChange, ProfileRecoveryPort } from '@/api/support';

export interface RecoveryView {
  rows: PendingProfileChange[]; readAt: number | null; busy: boolean;
  reconcile: boolean; error: string | null; nextPending: PendingProfileChange | null;
  submitted: PendingProfileChange | null; submittedState: PendingProfileChange['state'] | 'unknown' | null;
}
const empty = (): RecoveryView => ({rows:[],readAt:null,busy:false,reconcile:true,error:null,nextPending:null,submitted:null,submittedState:null});
const key=(r:PendingProfileChange) => JSON.stringify([r.id,r.revision,r.intent.email]);
// Backend cursors use immutable (created_at, UUID). Retain sub-millisecond
// precision when comparing timestamps supplied by PostgreSQL.
function order(a:PendingProfileChange,b:PendingProfileChange) {
  const fraction=(r:PendingProfileChange)=> (r.created_at.match(/\.(\d+)/)?.[1] ?? '').padEnd(9,'0').slice(3,9);
  return Date.parse(a.created_at)-Date.parse(b.created_at) || fraction(a).localeCompare(fraction(b)) || a.id.localeCompare(b.id);
}
export class ProfileRecovery {
  private view=empty(); private generation=0; private retired=false;
  private fresh=new Set<string>();
  private listeners=new Set<() => void>();
  constructor(private port: ProfileRecoveryPort, private current: () => boolean) {}
  subscribe=(fn:()=>void) => {this.listeners.add(fn);return ()=>{this.listeners.delete(fn);};};
  getSnapshot=() => this.view;
  private emit(next:Partial<RecoveryView>) {this.view={...this.view,...next};this.listeners.forEach(fn=>fn());}
  activate=() => {if (this.current()) {this.retired=false;this.generation++;this.fresh.clear();this.emit(empty());}};
  retire=() => {this.retired=true;this.generation++;this.fresh.clear();this.view=empty();this.listeners.forEach(fn=>fn());};
  private alive() {return !this.retired && this.current();}
  isFresh=(row:PendingProfileChange) => this.fresh.has(key(row));
  canDecide=(row:PendingProfileChange) => this.alive() && !this.view.busy && !this.view.reconcile
    && this.fresh.has(key(row)) && row.state==='pending' && row.ready_to_reconfirm
    && this.view.rows.some(r=>key(r)===key(row) && r.state==='pending' && r.ready_to_reconfirm);
  read=() => this.load(false);
  readMore=() => this.load(true);
  private async load(more:boolean) {
    const cursor=more ? this.view.nextPending : null;
    if (!this.alive() || this.view.busy || (more && !cursor)) return;
    const g=++this.generation, submitted=this.view.submitted;
    this.emit({busy:true,reconcile:true,error:null});
    try {
      // At most one pending page and one exact submitted-intent read. No crawl,
      // dispatch or retry follows a response. Apply both reads atomically.
      const results=await Promise.allSettled([
        this.port.read(cursor ? {pending_after:cursor.id} : undefined),
        ...(submitted ? [this.port.read({request_id:submitted.id})] : []),
      ]);
      if (!this.alive() || g!==this.generation) return;
      const failed=results.find(r=>r.status==='rejected');
      if (failed?.status==='rejected') throw failed.reason;
      const page=(results[0] as PromiseFulfilledResult<PendingProfileChange[]>).value;
      const pending=page.filter(r=>r.state==='pending');
      if (new Set(page.map(r=>r.id)).size!==page.length || (cursor && pending.length!==page.length)
          || pending.some((r,i)=>order(r,i ? pending[i-1] : cursor ?? r)<=0 && (i>0 || !!cursor))) throw new Error('Invalid pending page');
      for (const r of page) {
        const previous=this.view.rows.find(old=>old.id===r.id);
        if (previous && ((previous.state!=='pending' && (r.state!==previous.state || r.revision!==previous.revision))
            || r.revision<previous.revision || r.created_at!==previous.created_at
            || (r.revision===previous.revision && r.intent.email!==previous.intent.email))) throw new Error('Conflicting current change');
      }
      let outcome:PendingProfileChange|undefined;
      if (submitted) {
        const exact=(results[1] as PromiseFulfilledResult<PendingProfileChange[]>).value;
        outcome=exact.length===1 ? exact[0] : undefined;
        if (!outcome || outcome.id!==submitted.id || outcome.intent.email!==submitted.intent.email
            || outcome.created_at!==submitted.created_at
            || outcome.revision!==submitted.revision+(outcome.state==='cancelled' ? 1 : 0)) outcome=undefined;
        const previous=this.view.rows.find(r=>r.id===submitted.id);
        if (outcome && previous && (previous.revision>outcome.revision
            || (previous.state!=='pending' && previous.state!==outcome.state))) outcome=undefined;
        const listed=page.find(r=>r.id===submitted.id);
        if (outcome && listed && (listed.revision>outcome.revision || listed.intent.email!==outcome.intent.email
            || (listed.state!=='pending' && listed.state!==outcome.state))) outcome=undefined;
      }
      // Never erase a known pending request just because a bounded page omits
      // it. Omitted rows remain visible but need their own fresh page to act.
      if (!more) this.fresh.clear();
      const rows=new Map(this.view.rows.filter(r=>r.state==='pending').map(r=>[r.id,r]));
      for (const r of page) {rows.set(r.id,r);this.fresh.add(key(r));}
      if (submitted) {
        rows.set(submitted.id,outcome ?? page.find(r=>r.id===submitted.id && r.state==='pending') ?? this.view.rows.find(r=>r.id===submitted.id) ?? submitted);
        if (outcome) this.fresh.add(key(outcome));
        else this.fresh.delete(key(submitted));
      }
      this.emit({rows:[...rows.values()],readAt:Date.now(),reconcile:!!submitted && !outcome,
        nextPending:pending.length===100 ? pending[99] : null,
        submittedState:submitted ? outcome?.state ?? 'unknown' : null,
        error:submitted && !outcome ? 'The submitted change is not present in an exact matching current result. Its outcome remains unknown; read again before deciding.'
          : outcome && outcome.state!=='pending' ? 'Current decision: '+outcome.state+'.' : null});
    } catch (error) {
      const status=(error as {response?:{status?:number}} | null)?.response?.status;
      const known=this.view.rows.some(r=>r.state==='pending') || submitted!==null;
      if (this.alive() && g===this.generation) {
        this.fresh.clear();
        this.emit({reconcile:true,submittedState:submitted ? 'unknown' : null,
          error:!known && (status===403 || status===404) ? null
          : known ? 'Current status could not be read. The last known change is shown; read again before deciding.'
          : 'Account changes could not be checked. You can read again later.'});
      }
    } finally {if (this.alive() && g===this.generation) this.emit({busy:false});}
  }
  async decide(row:PendingProfileChange, action:'reconfirm'|'cancel') {
    if (!this.canDecide(row)) return;
    const g=++this.generation, expected=key(row);
    this.emit({busy:true,reconcile:true,error:null,submitted:row,submittedState:'unknown'});
    const admission=()=>{
      if (!this.alive() || g!==this.generation || !this.fresh.has(expected)
          || !this.view.rows.some(r=>key(r)===expected && r.state==='pending' && r.ready_to_reconfirm)) throw new Error('Action retired');
    };
    try {
      admission(); await this.port.decide(row,action,admission);
      if (this.alive() && g===this.generation) this.emit({error:'Decision acknowledged. Read current changes to confirm.'});
    } catch {
      if (this.alive() && g===this.generation) this.emit({error:'Outcome unavailable or change refused. Read current changes before any explicit retry.'});
    } finally {if (this.alive() && g===this.generation) this.emit({busy:false});}
  }
}
