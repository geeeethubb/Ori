/**
 * Add to home screen: the steps match the platform the person is on, a local-only address is called
 * out instead of being offered "on your phone" (audit P0-04), and the offer after the first saved
 * action is made once.
 */
import { describe, expect, it } from 'vitest';
import { installSteps, installTarget, isLocalOnlyHost, shouldOfferInstall, showsLinkField } from './InstallGuide.tsx';

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',
  iphoneFirefox: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15',
  ipadDesktopMode: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  androidChrome: 'Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.81 Mobile Safari/537.36',
  androidSamsung: 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  androidWebView: 'Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.6778.81 Mobile Safari/537.36',
  windowsChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
};

describe('installTarget', () => {
  it('tells iOS Safari from other iOS browsers (which must open the link in Safari first)', () => {
    expect(installTarget({ ua: UA.iphoneSafari })).toBe('ios-safari');
    expect(installTarget({ ua: UA.iphoneChrome })).toBe('ios-other');
    expect(installTarget({ ua: UA.iphoneFirefox })).toBe('ios-other');
    // iPadOS asks for desktop pages but has a touch screen.
    expect(installTarget({ ua: UA.ipadDesktopMode, maxTouchPoints: 5 })).toBe('ios-safari');
    expect(installTarget({ ua: UA.macSafari, maxTouchPoints: 0 })).toBe('desktop');
  });

  it('tells Android Chrome from other Android browsers and web views', () => {
    expect(installTarget({ ua: UA.androidChrome })).toBe('android-chrome');
    expect(installTarget({ ua: UA.androidSamsung })).toBe('android-other');
    expect(installTarget({ ua: UA.androidWebView })).toBe('android-other');
  });

  it('puts the Ori Android app and an app already opened from the home screen first', () => {
    expect(installTarget({ ua: UA.androidWebView, native: true })).toBe('native-shell');
    expect(installTarget({ ua: UA.iphoneSafari, standalone: true })).toBe('standalone');
    expect(installTarget({ ua: UA.windowsChrome })).toBe('desktop');
  });
});

describe('installSteps', () => {
  it('uses the platform’s own words', () => {
    expect(installSteps('ios-safari')).toEqual(['Open this link in Safari', 'Tap Share', 'Choose Add to Home Screen']);
    expect(installSteps('ios-other')[1]).toBe('Open it in Safari');
    expect(installSteps('android-chrome')).toEqual(['Tap ⋮', 'Add to Home screen or Install app']);
    expect(installSteps('desktop')[0]).toBe('Open this link on your phone');
    expect(installSteps('standalone')).toEqual([]);
  });

  it('never tells a computer on a local-only address to open its link on a phone', () => {
    const steps = installSteps('desktop', { localOnly: true });
    expect(steps[0]).not.toMatch(/this link/i);
    expect(steps[0]).toMatch(/address it can reach/);
  });
});

describe('isLocalOnlyHost', () => {
  it('flags addresses a phone cannot reach', () => {
    for (const h of ['localhost', 'LOCALHOST', 'app.localhost', '127.0.0.1', '127.0.0.2', '[::1]', '::1', '0.0.0.0']) expect(isLocalOnlyHost(h), h).toBe(true);
  });
  it('leaves network and hosted addresses alone', () => {
    for (const h of ['192.168.0.69', '10.0.2.2', 'ori.example.com', 'localhost.example.com', '127.example.com']) expect(isLocalOnlyHost(h), h).toBe(false);
  });
});

describe('showsLinkField', () => {
  it('shows the link where the steps open it elsewhere, and everywhere once copying failed (reviewer finding 2)', () => {
    expect(showsLinkField('desktop', false)).toBe(true);
    expect(showsLinkField('ios-other', false)).toBe(true);
    expect(showsLinkField('ios-safari', false)).toBe(false);
    expect(showsLinkField('android-chrome', false)).toBe(false);
    for (const target of ['ios-safari', 'android-chrome', 'native-shell', 'standalone'] as const) expect(showsLinkField(target, true), target).toBe(true);
  });
});

describe('shouldOfferInstall', () => {
  const base = { preview: false, standalone: false, native: false, offeredBefore: false };
  it('offers once, in the browser, outside previews', () => {
    expect(shouldOfferInstall(base)).toBe(true);
    expect(shouldOfferInstall({ ...base, offeredBefore: true })).toBe(false);
    expect(shouldOfferInstall({ ...base, standalone: true })).toBe(false);
    expect(shouldOfferInstall({ ...base, native: true })).toBe(false);
    expect(shouldOfferInstall({ ...base, preview: true })).toBe(false);
  });
});
