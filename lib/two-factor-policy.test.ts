import {describe,expect,it} from 'vitest';
import type {User} from '@/types';
import {accountReauthMethod,setupRestriction,sellerSecuritySatisfied} from './two-factor-policy';
const user={totp_enabled:false,auth_methods:['google','github','password'],primary_auth:'google'} as User;
describe('current-session policy and explicit legacy compatibility',()=>{
  it('does not infer current provider assurance from account links',()=>{
    expect(setupRestriction(user)).toBeNull();expect(sellerSecuritySatisfied(user)).toBe(false);
    expect(accountReauthMethod(user)).toBe('password');
  });
  it('accepts only the server assurance field, never changing native factor state',()=>{
    expect(sellerSecuritySatisfied({...user,seller_two_factor_satisfied:true})).toBe(true);
    expect(sellerSecuritySatisfied({...user,seller_two_factor_satisfied:false,totp_enabled:true})).toBe(false);
    expect(sellerSecuritySatisfied({...user,seller_two_factor_satisfied:true},['totp_enabled'])).toBe(false);
    expect(sellerSecuritySatisfied(user,['stripe_payouts_live'])).toBe(true);
    expect(user.totp_enabled).toBe(false);
  });
  it('retains native, password, magic-link and enforced SSO fallback flows',()=>{
    expect(accountReauthMethod({...user,totp_enabled:true})).toBe('totp');
    expect(accountReauthMethod({...user,auth_methods:['github']})).toBe('magic_link');
    expect(setupRestriction({...user,sso_enforced:true,auth_methods:['sso']})).toContain("organization's single sign-on");
    expect(setupRestriction({...user,totp_enabled:true,sso_enforced:true,auth_methods:['sso']})).toBeNull();
    expect(setupRestriction({...user,two_factor_setup_eligible:false})).toContain('unavailable for this session');
  });
  it('uses returned credential methods including native-secret fallback',()=>{
    expect(accountReauthMethod({...user,reauth_method:'magic_link'})).toBe('magic_link');
    expect(accountReauthMethod({...user,totp_enabled:true,reauth_method:'password'})).toBe('password');
  });
});
