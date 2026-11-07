import type { PendingProfileChange, ProfileRecoveryPort } from '@/api/support';

export interface RecoveryView {
  rows: PendingProfileChange[]; readAt: number | null; busy: boolean;
  reconcile: boolean; error: string | null;
}
const empty = (): RecoveryView => ({rows:[],readAt:null,busy:false,reconcile:true,error:null});
const key=(r:PendingProfileChange) => JSON.stringify([r.id,r.revision,r.intent.email]);
export class ProfileRecovery {
  private view=empty(); private generation=0; private retired=false; private decided:PendingProfileChange|null=null;
  private listeners=new Set<() => void>();
  constructor(private port: ProfileRecoveryPort, private current: () => boolean) {}
  subscribe=(fn:()=>void) => {this.listeners.add(fn);return ()=>{this.listeners.delete(fn);};};
  getSnapshot=() => this.view;
  private emit(next:Partial<RecoveryView>) {this.view={...this.view,...next};this.listeners.forEach(fn=>fn());}
  activate=() => {if (this.current()) {this.retired=false;this.generation++;this.emit(empty());}};
  retire=() => {this.retired=true;this.generation++;this.decided=null;this.view=empty();this.listeners.forEach(fn=>fn());};
  private alive() {return !this.retired && this.current();}
  async read() {
    if (!this.alive() || this.view.busy) return;
    const g=++this.generation;
    this.emit({busy:true,reconcile:true,error:null});
    try {
      const rows=await this.port.read();
      if (!this.alive() || g!==this.generation) return;
      const outcome=rows.find(r=>r.id===this.decided?.id);
      if (this.decided && (!outcome || outcome.intent.email!==this.decided.intent.email || outcome.revision<this.decided.revision)) {
        this.emit({error:'The submitted change is not present in the current result. Its outcome remains unknown; read again before deciding.'});
        return;
      }
      this.emit({rows,readAt:Date.now(),reconcile:false,error:outcome && outcome.state!=='pending' ? 'Current decision: '+outcome.state+'.' : null});
    } catch (error) {
      const status=(error as {response?:{status?:number}} | null)?.response?.status;
      const known=this.view.rows.some(r=>r.state==='pending') || this.decided!==null;
      if (this.alive() && g===this.generation) this.emit({error:!known && (status===403 || status===404) ? null
        : known ? 'Current status could not be read. The last known change is shown; read again before deciding.'
        : 'Account changes could not be checked. You can read again later.'});
    } finally {if (this.alive() && g===this.generation) this.emit({busy:false});}
  }
  async decide(row:PendingProfileChange, action:'reconfirm'|'cancel') {
    if (!this.alive() || this.view.busy || this.view.reconcile || !this.view.rows.some(r=>key(r)===key(row) && r.state==='pending' && r.ready_to_reconfirm)
        || row.state!=='pending' || !row.ready_to_reconfirm) return;
    const g=++this.generation, expected=key(row);
    this.decided=row;
    this.emit({busy:true,reconcile:true,error:null});
    const admission=()=>{
      if (!this.alive() || g!==this.generation || !this.view.rows.some(r=>key(r)===expected)) throw new Error('Action retired');
    };
    try {
      admission(); await this.port.decide(row,action,admission);
      if (this.alive() && g===this.generation) this.emit({error:'Decision acknowledged. Read current changes to confirm.'});
    } catch {
      if (this.alive() && g===this.generation) this.emit({error:'Outcome unavailable or change refused. Read current changes before any explicit retry.'});
    } finally {if (this.alive() && g===this.generation) this.emit({busy:false});}
  }
}
