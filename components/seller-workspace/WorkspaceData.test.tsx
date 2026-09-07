// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceActivity, WorkspaceData } from './WorkspaceData';
import type { SellerWorkspaceConnection, WorkspaceProfileJob } from '@/api/sellerWorkspace';

const api = vi.hoisted(() => ({
  listWorkspaceObjects: vi.fn(), listWorkspaceProfileJobs: vi.fn(),
  cancelWorkspaceProfileJob: vi.fn(), getWorkspaceProfileEvidence: vi.fn(),
  createIdempotencyKey: vi.fn(() => 'synthetic-cancel-key'),
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
  it('does not call profile APIs while the profile stage is unavailable', () => {
    render(<><WorkspaceData enabled={false} connections={[connection]} /><WorkspaceActivity enabled={false} connections={[connection]} /></>);
    expect(api.listWorkspaceObjects).not.toHaveBeenCalled();
    expect(api.listWorkspaceProfileJobs).not.toHaveBeenCalled();
    expect(screen.getByText('Data profiling is not available yet')).toBeTruthy();
  });

  it('requires a verified connection before browsing', () => {
    render(<WorkspaceData enabled connections={[{ ...connection, status: 'revoked' }]} />);
    expect(screen.getByText('Connect storage to see your data')).toBeTruthy();
    expect(api.listWorkspaceObjects).not.toHaveBeenCalled();
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
