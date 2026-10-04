// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import SellerSetupProgressBar,{notifyCapabilitiesChanged} from './SellerSetupProgressBar';
import {useAuthStore} from '@/store/auth';
import type {User} from '@/types';
const mocks=vi.hoisted(()=>({getCapabilities:vi.fn(),push:vi.fn(),onboarding:vi.fn(),redirect:vi.fn(),toast:vi.fn(),required:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:mocks.push})}));
vi.mock('@/api/capabilities',()=>({getCapabilities:mocks.getCapabilities}));
vi.mock('@/api/connect',()=>({getConnectOnboarding:mocks.onboarding,redirectToConnectOnboarding:mocks.redirect,isConnectOnboardingTwoFactorRequired:mocks.required}));
vi.mock('@/components/Toast',()=>({useToast:()=>({toast:mocks.toast})}));
const user={totp_enabled:false,auth_methods:['google','password'],primary_auth:'google',two_factor_setup_eligible:false,
 two_factor_setup_reason:'two_factor_managed_by_provider',two_factor_provider:'google',seller_two_factor_satisfied:true} as User;
afterEach(cleanup);
beforeEach(()=>{vi.resetAllMocks();useAuthStore.setState({user,isAuthenticated:true,isLoading:false});
 mocks.getCapabilities.mockResolvedValue({seller:{effective_status:'provisioning',missing_steps:['stripe_payouts_live']},next_action:{capability:'seller',step:'stripe_payouts_live'}});
 mocks.onboarding.mockResolvedValue({data:{url:'https://connect.stripe.com/fixture'}});
});
it('shows provider sign-in completion, routes the actual wizard Next to Stripe, and preserves native state',async()=>{
 render(<SellerSetupProgressBar/>);await screen.findByText('3 of 4 complete');
 const security=screen.getByRole('button',{name:/Provider sign-in/});expect((security as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(security);expect(mocks.push).not.toHaveBeenCalled();expect(mocks.onboarding).not.toHaveBeenCalled();
 act(()=>window.dispatchEvent(new Event('seller-setup:next')));
 await waitFor(()=>expect(mocks.redirect).toHaveBeenCalledWith({url:'https://connect.stripe.com/fixture'}));
 expect(useAuthStore.getState().user?.totp_enabled).toBe(false);
});
it('navigates profile and company steps and refreshes first-publish missing steps',async()=>{
 mocks.getCapabilities.mockResolvedValueOnce({seller:{effective_status:'provisioning',missing_steps:['profile_name','company_name','stripe_payouts_live']},next_action:{capability:'seller',step:'profile_name'}});
 render(<SellerSetupProgressBar/>);fireEvent.click(await screen.findByRole('button',{name:'Continue: Profile name'}));expect(mocks.push).toHaveBeenCalledWith('/dashboard/settings#profile');
 fireEvent.click(screen.getByRole('button',{name:/Company name/}));expect(mocks.push).toHaveBeenCalledWith('/dashboard/settings#company');
 act(()=>notifyCapabilitiesChanged());await screen.findByRole('button',{name:'Continue: Stripe payouts'});
 expect(screen.queryByRole('button',{name:'Continue: 2FA'})).toBeNull();
});
it('preserves legacy native enrollment navigation and all server missing steps',async()=>{
 useAuthStore.setState({user:{totp_enabled:false,auth_methods:['password']} as User});
 mocks.getCapabilities.mockResolvedValue({seller:{effective_status:'provisioning',missing_steps:['totp_enabled','stripe_payouts_live']},next_action:{capability:'seller',step:'totp_enabled'}});
 render(<SellerSetupProgressBar/>);fireEvent.click(await screen.findByRole('button',{name:'Continue: 2FA'}));expect(mocks.push).toHaveBeenCalledWith('/dashboard/settings#security');
});
it('retains server Stripe refusal and refreshes policy instead of forcing readiness',async()=>{
 mocks.onboarding.mockRejectedValue(new Error('403'));mocks.required.mockReturnValue(true);
 render(<SellerSetupProgressBar/>);fireEvent.click(await screen.findByRole('button',{name:'Continue: Stripe payouts'}));
 await waitFor(()=>expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('sign-in security step'),'info'));
 expect(mocks.redirect).not.toHaveBeenCalled();expect(mocks.getCapabilities.mock.calls.length).toBeGreaterThan(1);
});
it.each(['active','suspended','not_requested'])('does not invent provisioning for %s sellers',async status=>{
 mocks.getCapabilities.mockResolvedValue({seller:{effective_status:status,missing_steps:[]},next_action:null});render(<SellerSetupProgressBar/>);
 await act(async()=>{});expect(screen.queryByText('Finish seller setup')).toBeNull();
});
