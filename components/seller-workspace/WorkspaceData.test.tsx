// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_REFUSALS, sampleUploadRefusal, WorkspaceActivity, WorkspaceData } from './WorkspaceData';
import type { SellerWorkspaceConnection, WorkspaceProfileJob } from '@/api/sellerWorkspace';

const api = vi.hoisted(() => ({
  listWorkspaceObjects: vi.fn(), listWorkspaceProfileJobs: vi.fn(),
  cancelWorkspaceProfileJob: vi.fn(), getWorkspaceProfileEvidence: vi.fn(),
  createIdempotencyKey: vi.fn(() => 'synthetic-cancel-key'),
  uploadWorkspaceSample:vi.fn(),SAMPLE_MAX_FILES:10,SAMPLE_MAX_FILE_BYTES:64*1024*1024,SAMPLE_MAX_TOTAL_BYTES:256*1024*1024,
}));
vi.mock('@/api/sellerWorkspace', () => api);

const connection = {
  id: 'connection-1', bucket: 'seller-data', prefix: 'datasets/', version: 1, status: 'verified',
} as SellerWorkspaceConnection;
const job: WorkspaceProfileJob = {
  id: 'job-1', connection_id: connection.id, runtime_id: 'runtime-1', state: 'running', version: 3,
  attempt: 1, objects_completed: 1, source_bytes_read: 1024, rows_examined: 20,
  field_records_emitted: 3, safe_failure_code: null, evidence_ref: null,
};
const object = { key: 'datasets/one.csv', version_id: null, etag: 'etag-1', size: 1024, last_modified: '2026-09-07T12:00:00Z', format_candidate: 'csv' };
beforeEach(() => { vi.resetAllMocks(); api.createIdempotencyKey.mockReturnValue('synthetic-cancel-key'); });
afterEach(cleanup);

describe('Seller data browser', () => {
  const savedSource={version:3,connection_current:true,content:{connection_id:connection.id,connection_version:connection.version,version_mode:'current' as const,objects:[{key:object.key,version_id:object.version_id,etag:object.etag,size:object.size}]}};

  it('does not call profile APIs while the profile stage is unavailable', () => {
    render(<><WorkspaceData enabled={false} connections={[connection]} /><WorkspaceActivity enabled={false} connections={[connection]} /></>);
    expect(api.listWorkspaceObjects).not.toHaveBeenCalled();
    expect(api.listWorkspaceProfileJobs).not.toHaveBeenCalled();
    expect(screen.getByText('File browsing is not available yet')).toBeTruthy();
  });

  it('requires a verified connection before browsing', () => {
    render(<WorkspaceData enabled connections={[{ ...connection, status: 'revoked' }]} />);
    expect(screen.getByText('Connect storage to see your data')).toBeTruthy();
    expect(api.listWorkspaceObjects).not.toHaveBeenCalled();
  });

  it('selects source files without starting analysis and clears selection on connection change', async () => {
    api.listWorkspaceObjects.mockResolvedValue({ objects: [object], next_cursor: null });
    render(<WorkspaceData enabled connections={[connection, { ...connection, id: 'connection-2' }]} />);
    fireEvent.click(await screen.findByRole('checkbox', { name: `Select ${object.key}` }));
    expect(screen.getByText('1 file selected · 1 KB')).toBeTruthy();
    expect(api.listWorkspaceProfileJobs).not.toHaveBeenCalled();
    expect(api.getWorkspaceProfileEvidence).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'connection-2' } });
    await screen.findByRole('checkbox', { name: `Select ${object.key}` });
    expect(screen.getByText('0 files selected · 0 B')).toBeTruthy();
  });

  it('uses the pinned prefix, renders source names as text, and preserves pagination during search', async () => {
    api.listWorkspaceObjects.mockResolvedValueOnce({ objects: [object], next_cursor: 'page-2' });
    api.listWorkspaceObjects.mockResolvedValueOnce({ objects: [{ ...object, key: '<script>alert(1)</script>.csv' }], next_cursor: null });
    const { container } = render(<WorkspaceData enabled connections={[connection]} />);
    await screen.findByText('datasets/one.csv');
    expect(api.listWorkspaceObjects).toHaveBeenCalledWith(connection.id, connection.prefix);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'script' } });
    expect(screen.getByText('No loaded files match your search.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Load more files' }));
    await screen.findByText('<script>alert(1)</script>.csv');
    expect(container.querySelector('script')).toBeNull();
    expect(api.listWorkspaceObjects).toHaveBeenLastCalledWith(connection.id, connection.prefix, 'page-2');
  });

  it('discards a late response after switching connections', async () => {
    let resolveOld!: (value: unknown) => void;
    api.listWorkspaceObjects.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }));
    api.listWorkspaceObjects.mockResolvedValueOnce({ objects: [{ ...object, key: 'second/new.csv' }], next_cursor: null });
    render(<WorkspaceData enabled connections={[connection, { ...connection, id: 'connection-2', prefix: 'second/' }]} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'connection-2' } });
    await screen.findByText('second/new.csv');
    await act(async () => resolveOld({ objects: [object], next_cursor: null }));
    expect(screen.queryByText(object.key)).toBeNull();
  });

  it('recovers from a load failure without exposing raw server errors', async () => {
    api.listWorkspaceObjects.mockRejectedValueOnce(new Error('secret-provider-response'));
    api.listWorkspaceObjects.mockResolvedValueOnce({ objects: [object], next_cursor: null });
    render(<WorkspaceData enabled connections={[connection]} />);
    await screen.findByRole('alert');
    expect(screen.queryByText(/secret-provider-response/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText(object.key);
  });

  it('ticks and uploads a saved sample object with the pinned limits and progress',async()=>{
    api.listWorkspaceObjects.mockResolvedValue({objects:[object],next_cursor:null});
    api.uploadWorkspaceSample.mockImplementation(async(_connection:string,_version:number,_index:number,_file:File,_key:string,progress:(loaded:number,total:number)=>void)=>{progress(512,1024);progress(1024,1024);return {index:0,size:1024,sha256:'a'.repeat(64),binding:'size_only'};});
    const saveSamples=vi.fn().mockResolvedValue(undefined);
    render(<WorkspaceData enabled connections={[connection]} savedSource={savedSource} sampleFilesAvailable initialSampleIndices={[]} onSaveSampleSelection={saveSamples}/>);
    expect((await screen.findByText(/Tick up to 10 saved objects/)).textContent).toContain('64 MB');
    expect(screen.getByText(/Tick up to 10 saved objects/).textContent).toContain('256 MB');
    fireEvent.click(screen.getByRole('checkbox',{name:/Offer one.csv.*free sample/}));
    const file=new File([new Uint8Array(1024)],'one.csv');
    fireEvent.change(screen.getByLabelText(/Upload sample one.csv/),{target:{files:[file]}});
    expect(await screen.findByText('Uploaded and saved for review.')).toBeTruthy();
    expect(api.uploadWorkspaceSample).toHaveBeenCalledWith(connection.id,3,0,file,'synthetic-cancel-key',expect.any(Function));
    expect(saveSamples).toHaveBeenCalledWith([0]);
    expect(screen.getByRole('progressbar').getAttribute('value')).toBe('100');
  });

  it('renders every backend sample refusal by its safe name',()=>{
    const cases=[
      ['Sample source not found','saved file selection'],['index 3: invalid sample basename','file name'],
      ['index 3: out of range','no longer in the saved selection'],['index 3: sample size mismatch','exactly the saved file size'],
      ['SAMPLE_MAX_FILE_BYTES: 67108864','per-file sample limit'],['index 3: sample is immutable','already approved or published'],
      ['index 3: upload already in progress','already in progress'],['SAMPLE_MAX_FILES: 10','maximum number'],
      ['SAMPLE_MAX_TOTAL_BYTES: 268435456','total sample size'],['SAMPLE_SELLER_QUOTA_BYTES: 2147483648','storage quota'],
      ['sample upload generation expired','replaced or expired'],['SAMPLE_UPLOAD_TIMEOUT_S: 900','took too long'],
      ['sample_store_unavailable','temporarily unavailable'],['SAMPLE_UPLOAD_RATE: 30','Too many sample uploads'],
      ['sample size mismatch','exactly the saved file size'],
    ];
    for(const [detail,copy] of cases){const result=sampleUploadRefusal(detail);expect(result.copy).toContain(copy);expect(result.code).not.toBe('sample_upload_refused');}
    expect(Object.keys(SAMPLE_REFUSALS)).toEqual(['Sample source not found','invalid sample basename','out of range','sample size mismatch','SAMPLE_MAX_FILE_BYTES','sample is immutable','upload already in progress','SAMPLE_MAX_FILES','SAMPLE_MAX_TOTAL_BYTES','SAMPLE_SELLER_QUOTA_BYTES','sample upload generation expired','SAMPLE_UPLOAD_TIMEOUT_S','sample_store_unavailable','SAMPLE_UPLOAD_RATE']);
  });

  it('shows an over-limit refusal by name',async()=>{
    api.listWorkspaceObjects.mockResolvedValue({objects:[object],next_cursor:null});
    api.uploadWorkspaceSample.mockRejectedValue({isAxiosError:true,response:{status:400,data:{detail:'SAMPLE_MAX_FILE_BYTES: 67108864'}}});
    render(<WorkspaceData enabled connections={[connection]} savedSource={savedSource} sampleFilesAvailable onSaveSampleSelection={vi.fn()}/>);
    fireEvent.click(await screen.findByRole('checkbox',{name:/Offer one.csv.*free sample/}));
    fireEvent.change(screen.getByLabelText(/Upload sample one.csv/),{target:{files:[new File([new Uint8Array(1024)],'one.csv')]}});
    const alert=await screen.findByRole('alert');expect(alert.textContent).toContain('per-file sample limit');expect(alert.textContent).toContain('(SAMPLE_MAX_FILE_BYTES)');
  });

  it('keeps dark markup byte-identical and shows an explicit alert for a deployed-signal 404',async()=>{
    api.listWorkspaceObjects.mockResolvedValue({objects:[object],next_cursor:null});
    const props={enabled:true,connections:[connection],savedSource,onSaveSampleSelection:vi.fn()};
    const legacy=render(<WorkspaceData {...props}/>);
    await screen.findByText(object.key);const legacyMarkup=legacy.container.innerHTML;legacy.unmount();
    const explicitDark=render(<WorkspaceData {...props} sampleFilesAvailable={false}/>);
    await screen.findByText(object.key);expect(explicitDark.container.innerHTML).toBe(legacyMarkup);explicitDark.unmount();
    api.uploadWorkspaceSample.mockRejectedValue({isAxiosError:true,response:{status:404,data:{detail:'Not Found'}}});
    const feature=render(<WorkspaceData {...props} sampleFilesAvailable/>);
    expect(legacyMarkup).not.toContain('Free sample');
    fireEvent.click(await screen.findByRole('checkbox',{name:/Offer one.csv.*free sample/}));
    fireEvent.change(screen.getByLabelText(/Upload sample one.csv/),{target:{files:[new File([new Uint8Array(1024)],'one.csv')]}});
    expect((await screen.findByRole('alert')).textContent).toContain('sample_route_unavailable');
    expect(feature.container.querySelector('[aria-label="Workspace sample files"]')).toBeTruthy();
  });

  it('does not place a full object key in new sample attributes',async()=>{
    api.listWorkspaceObjects.mockResolvedValue({objects:[object],next_cursor:null});
    const {container}=render(<WorkspaceData enabled connections={[connection]} savedSource={savedSource} sampleFilesAvailable onSaveSampleSelection={vi.fn()}/>);
    await screen.findByRole('checkbox',{name:/Offer one.csv.*free sample/});
    const matching=[...container.querySelectorAll('*')].flatMap(node=>[...node.attributes].map(attribute=>attribute.value)).filter(value=>value.includes(object.key));
    expect(matching).toEqual([`Select ${object.key}`]);
  });
});

describe('Seller profiling activity', () => {
  it('requires a seller confirmation and keeps cancellation requested distinct from cancelled', async () => {
    api.listWorkspaceProfileJobs.mockResolvedValue({ jobs: [job], next_cursor: null });
    api.cancelWorkspaceProfileJob.mockResolvedValue({ ...job, state: 'cancel_requested', version: 4 });
    render(<WorkspaceActivity enabled connections={[connection]} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel profile' }));
    expect(api.cancelWorkspaceProfileJob).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }));
    await screen.findByText('Cancellation requested');
    expect(api.cancelWorkspaceProfileJob).toHaveBeenCalledWith(job, 'synthetic-cancel-key');
    expect(screen.queryByRole('button', { name: 'Cancel profile' })).toBeNull();
  });

  it('shows partial evidence and sensitive-data findings without raw field names or rows', async () => {
    api.listWorkspaceProfileJobs.mockResolvedValue({ jobs: [{ ...job, state: 'succeeded', evidence_ref: 'evidence-1' }], next_cursor: null });
    api.getWorkspaceProfileEvidence.mockResolvedValue({ id: 'evidence-1', result: { semantic_evidence: {
      observed: { rows_examined: 20, objects_completed: 1, source_bytes_read: 1024, truncated: true, truncation_reasons: ['field_record_count'] },
      objects: [{ object_ref: 'o0001', format: 'csv', size: 1024, warning_codes: [], fields: [{ position: 'f0001', physical_type: 'string', non_null_count: 18, null_count: 2, pii_classes: ['email'], quality_flags: [] }] }],
    } } });
    render(<WorkspaceActivity enabled connections={[connection]} />);
    fireEvent.click(await screen.findByRole('button', { name: 'View result' }));
    const result = await screen.findByRole('region', { name: 'Profile result' });
    expect(within(result).getByText(/This result is partial/)).toBeTruthy();
    expect(within(result).getByText('Possible email')).toBeTruthy();
    expect(within(result).getByText('f0001')).toBeTruthy();
    fireEvent.click(within(result).getByRole('button', { name: 'Close result' }));
    expect(screen.queryByRole('region', { name: 'Profile result' })).toBeNull();
  });
});
