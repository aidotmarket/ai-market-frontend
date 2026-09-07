// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StorageSetupGuide } from './StorageSetupGuide';

afterEach(cleanup);
describe('storage setup guidance', () => {
  it('lets an existing AWS customer proceed only through the enabled connection action', () => {
    const connect = vi.fn();
    render(<StorageSetupGuide provider="aws" canConnectAWS onConnectAWS={connect} onClose={() => {}} />);
    fireEvent.click(screen.getByText('I already have storage and files'));
    expect(connect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Continue to AWS connection'));
    expect(connect).toHaveBeenCalledTimes(1);
  });
  it('does not bypass unavailable connections after walking through setup', () => {
    const connect = vi.fn();
    render(<StorageSetupGuide provider="aws" canConnectAWS={false} onConnectAWS={connect} onClose={() => {}} />);
    for (let index = 0; index < 3; index++) fireEvent.click(screen.getByText('Continue guide'));
    fireEvent.click(screen.getByText('Continue to AWS connection'));
    expect(connect).not.toHaveBeenCalled();
    expect(screen.getByText(/AWS connection setup is currently unavailable/)).toBeTruthy();
  });
  it('keeps R2 setup separate from account verification and opens provider help in another tab', () => {
    render(<StorageSetupGuide provider="r2" canConnectAWS onConnectAWS={vi.fn()} onClose={() => {}} />);
    expect(screen.getByText('Open Cloudflare (new tab)').getAttribute('target')).toBe('_blank');
    fireEvent.click(screen.getByText('I already have storage and files'));
    expect(screen.getByText(/R2 connection to ai.market is still being completed/)).toBeTruthy();
    expect(screen.queryByText('Continue to AWS connection')).toBeNull();
  });
});
