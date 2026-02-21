// src/screens/WebLandingScreen.tsx — Web landing page using raw HTML for reliable scrolling
import React, { useEffect } from 'react';
import { View, Platform } from 'react-native';

interface Props {
  navigation: any;
}

export default function WebLandingScreen({ navigation }: Props) {
  
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    
    const handleClick = (e: any) => {
      const target = e.target.closest('[data-nav]');
      if (target) {
        const route = target.getAttribute('data-nav');
        if (route) {
          try { navigation.navigate(route); } catch { navigation.navigate('Login'); }
        }
      }
    };
    
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [navigation]);

  if (Platform.OS !== 'web') {
    return <View style={{ flex: 1 }} />;
  }

  const html = `
    <div style="width:100%;min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;overflow-y:auto;position:absolute;top:0;left:0;right:0;bottom:0;z-index:9999;background:#F8F9FA;">
      
      <!-- Hero -->
      <div style="background:#212529;padding:48px 24px;text-align:center;">
        <div style="max-width:700px;margin:0 auto;">
          <div style="width:72px;height:72px;border-radius:20px;border:2px solid #F5C542;display:inline-flex;align-items:center;justify-content:center;margin-bottom:20px;font-size:36px;">&#x1F4E6;</div>
          <h1 style="font-size:clamp(32px,5vw,48px);font-weight:900;color:#fff;margin:0 0 8px;">ShareStash</h1>
          <p style="font-size:22px;font-weight:600;color:#F5C542;margin:0 0 16px;">Rent anything from people nearby</p>
          <p style="font-size:17px;color:#9CA3AF;line-height:1.6;max-width:550px;margin:0 auto 32px;">
            Why buy when you can rent? Save money, reduce waste, and connect with your community. Browse thousands of items available in your neighborhood.
          </p>
          <button data-nav="Login" style="background:#F5C542;color:#212529;border:none;padding:16px 32px;border-radius:14px;font-size:17px;font-weight:800;cursor:pointer;margin-bottom:16px;">
            Start Browsing &rarr;
          </button>
          <div style="margin-bottom:24px;">
            <a data-nav="Login" style="color:#F5C542;font-weight:700;cursor:pointer;font-size:15px;">Sign In</a>
            <span style="color:#6B7280;margin:0 12px;">|</span>
            <a data-nav="Register" style="color:#F5C542;font-weight:700;cursor:pointer;font-size:15px;">Create Account</a>
          </div>
          <div style="display:flex;gap:20px;justify-content:center;flex-wrap:wrap;">
            <span style="color:#9CA3AF;font-size:13px;font-weight:600;">&#10003; Verified Users</span>
            <span style="color:#9CA3AF;font-size:13px;font-weight:600;">&#10003; Secure Payments</span>
            <span style="color:#9CA3AF;font-size:13px;font-weight:600;">&#10003; In-App Messaging</span>
          </div>
        </div>
      </div>
      
      <!-- How It Works -->
      <div style="background:#F8F9FA;padding:48px 24px;">
        <div style="max-width:1100px;margin:0 auto;text-align:center;">
          <p style="font-size:12px;font-weight:800;color:#2E86AB;letter-spacing:2px;margin:0 0 8px;">SIMPLE &amp; EASY</p>
          <h2 style="font-size:32px;font-weight:900;color:#212529;margin:0 0 32px;">How It Works</h2>
          <div style="display:flex;gap:20px;justify-content:center;flex-wrap:wrap;">
            <div style="background:#fff;border-radius:16px;padding:24px;max-width:240px;flex:1;min-width:200px;border:1px solid #E9ECEF;text-align:center;">
              <div style="width:36px;height:36px;border-radius:18px;background:#F5C542;color:#fff;font-weight:800;font-size:16px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">1</div>
              <div style="font-size:28px;margin-bottom:8px;">&#x1F50D;</div>
              <h3 style="font-size:18px;font-weight:800;color:#212529;margin:0 0 4px;">Browse</h3>
              <p style="font-size:14px;color:#6C757D;margin:0;">Find items near you</p>
            </div>
            <div style="background:#fff;border-radius:16px;padding:24px;max-width:240px;flex:1;min-width:200px;border:1px solid #E9ECEF;text-align:center;">
              <div style="width:36px;height:36px;border-radius:18px;background:#2E86AB;color:#fff;font-weight:800;font-size:16px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">2</div>
              <div style="font-size:28px;margin-bottom:8px;">&#x1F4C5;</div>
              <h3 style="font-size:18px;font-weight:800;color:#212529;margin:0 0 4px;">Book</h3>
              <p style="font-size:14px;color:#6C757D;margin:0;">Choose dates &amp; pay securely</p>
            </div>
            <div style="background:#fff;border-radius:16px;padding:24px;max-width:240px;flex:1;min-width:200px;border:1px solid #E9ECEF;text-align:center;">
              <div style="width:36px;height:36px;border-radius:18px;background:#46A758;color:#fff;font-weight:800;font-size:16px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">3</div>
              <div style="font-size:28px;margin-bottom:8px;">&#x1F4CD;</div>
              <h3 style="font-size:18px;font-weight:800;color:#212529;margin:0 0 4px;">Meet</h3>
              <p style="font-size:14px;color:#6C757D;margin:0;">Pick up at a safe location</p>
            </div>
            <div style="background:#fff;border-radius:16px;padding:24px;max-width:240px;flex:1;min-width:200px;border:1px solid #E9ECEF;text-align:center;">
              <div style="width:36px;height:36px;border-radius:18px;background:#8B5CF6;color:#fff;font-weight:800;font-size:16px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">4</div>
              <div style="font-size:28px;margin-bottom:8px;">&#x2705;</div>
              <h3 style="font-size:18px;font-weight:800;color:#212529;margin:0 0 4px;">Return</h3>
              <p style="font-size:14px;color:#6C757D;margin:0;">Drop off when you're done</p>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Features -->
      <div style="background:#fff;padding:48px 24px;">
        <div style="max-width:1100px;margin:0 auto;text-align:center;">
          <p style="font-size:12px;font-weight:800;color:#2E86AB;letter-spacing:2px;margin:0 0 8px;">EVERYTHING YOU NEED</p>
          <h2 style="font-size:32px;font-weight:900;color:#212529;margin:0 0 32px;">Built for Trust &amp; Safety</h2>
          <div style="display:flex;gap:16px;justify-content:center;flex-wrap:wrap;">
            <div style="background:#F8F9FA;border-radius:16px;padding:24px;max-width:340px;flex:1;min-width:280px;border:1px solid #E9ECEF;text-align:left;">
              <div style="font-size:28px;margin-bottom:12px;">&#x1F50D;</div>
              <h3 style="font-size:17px;font-weight:800;color:#212529;margin:0 0 6px;">Discover Nearby Items</h3>
              <p style="font-size:14px;color:#6C757D;line-height:1.6;margin:0;">Browse tools, electronics, sports gear, and more available for rent in your area.</p>
            </div>
            <div style="background:#F8F9FA;border-radius:16px;padding:24px;max-width:340px;flex:1;min-width:280px;border:1px solid #E9ECEF;text-align:left;">
              <div style="font-size:28px;margin-bottom:12px;">&#x1F4B0;</div>
              <h3 style="font-size:17px;font-weight:800;color:#212529;margin:0 0 6px;">List &amp; Earn</h3>
              <p style="font-size:14px;color:#6C757D;line-height:1.6;margin:0;">Have items sitting around? List them in minutes and earn money when you're not using them.</p>
            </div>
            <div style="background:#F8F9FA;border-radius:16px;padding:24px;max-width:340px;flex:1;min-width:280px;border:1px solid #E9ECEF;text-align:left;">
              <div style="font-size:28px;margin-bottom:12px;">&#x1F4C5;</div>
              <h3 style="font-size:17px;font-weight:800;color:#212529;margin:0 0 6px;">Flexible Rentals</h3>
              <p style="font-size:14px;color:#6C757D;line-height:1.6;margin:0;">Rent by the hour, day, week, or month. Choose what works for you.</p>
            </div>
            <div style="background:#F8F9FA;border-radius:16px;padding:24px;max-width:340px;flex:1;min-width:280px;border:1px solid #E9ECEF;text-align:left;">
              <div style="font-size:28px;margin-bottom:12px;">&#x1F6E1;&#xFE0F;</div>
              <h3 style="font-size:17px;font-weight:800;color:#212529;margin:0 0 6px;">Safe &amp; Secure</h3>
              <p style="font-size:14px;color:#6C757D;line-height:1.6;margin:0;">Identity verification, secure payments, photo documentation, and dispute protection.</p>
            </div>
            <div style="background:#F8F9FA;border-radius:16px;padding:24px;max-width:340px;flex:1;min-width:280px;border:1px solid #E9ECEF;text-align:left;">
              <div style="font-size:28px;margin-bottom:12px;">&#x1F4F8;</div>
              <h3 style="font-size:17px;font-weight:800;color:#212529;margin:0 0 6px;">Photo Handoffs</h3>
              <p style="font-size:14px;color:#6C757D;line-height:1.6;margin:0;">Document item condition at pickup and return. Both parties are protected.</p>
            </div>
            <div style="background:#F8F9FA;border-radius:16px;padding:24px;max-width:340px;flex:1;min-width:280px;border:1px solid #E9ECEF;text-align:left;">
              <div style="font-size:28px;margin-bottom:12px;">&#x1F4B3;</div>
              <h3 style="font-size:17px;font-weight:800;color:#212529;margin:0 0 6px;">Secure Payments</h3>
              <p style="font-size:14px;color:#6C757D;line-height:1.6;margin:0;">Pay securely through Stripe. Owners get paid directly to their bank account.</p>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Stats -->
      <div style="background:#F8F9FA;padding:48px 24px;">
        <div style="max-width:1100px;margin:0 auto;display:flex;gap:16px;justify-content:center;flex-wrap:wrap;">
          <div style="background:#fff;border-radius:16px;padding:24px;text-align:center;flex:1;min-width:160px;max-width:240px;border:1px solid #E9ECEF;">
            <div style="font-size:28px;margin-bottom:4px;">&#x1F4E6;</div>
            <div style="font-size:32px;font-weight:900;color:#212529;">1000+</div>
            <div style="font-size:14px;color:#6C757D;font-weight:600;">Items Listed</div>
          </div>
          <div style="background:#fff;border-radius:16px;padding:24px;text-align:center;flex:1;min-width:160px;max-width:240px;border:1px solid #E9ECEF;">
            <div style="font-size:28px;margin-bottom:4px;">&#x1F465;</div>
            <div style="font-size:32px;font-weight:900;color:#212529;">500+</div>
            <div style="font-size:14px;color:#6C757D;font-weight:600;">Active Users</div>
          </div>
          <div style="background:#fff;border-radius:16px;padding:24px;text-align:center;flex:1;min-width:160px;max-width:240px;border:1px solid #E9ECEF;">
            <div style="font-size:28px;margin-bottom:4px;">&#x2B50;</div>
            <div style="font-size:32px;font-weight:900;color:#212529;">4.8</div>
            <div style="font-size:14px;color:#6C757D;font-weight:600;">Average Rating</div>
          </div>
          <div style="background:#fff;border-radius:16px;padding:24px;text-align:center;flex:1;min-width:160px;max-width:240px;border:1px solid #E9ECEF;">
            <div style="font-size:28px;margin-bottom:4px;">&#x1F6E1;&#xFE0F;</div>
            <div style="font-size:32px;font-weight:900;color:#212529;">100%</div>
            <div style="font-size:14px;color:#6C757D;font-weight:600;">Secure Payments</div>
          </div>
        </div>
      </div>
      
      <!-- CTA -->
      <div style="background:#212529;padding:48px 24px;text-align:center;">
        <div style="max-width:600px;margin:0 auto;">
          <div style="font-size:40px;margin-bottom:12px;">&#x1F4E6;</div>
          <h2 style="font-size:32px;font-weight:900;color:#fff;margin:0 0 12px;">Ready to get started?</h2>
          <p style="font-size:16px;color:#9CA3AF;line-height:1.6;margin:0 0 24px;">
            Join your neighbors in the sharing economy. Browse items, list your own, and start saving today.
          </p>
          <button data-nav="Login" style="background:#F5C542;color:#212529;border:none;padding:16px 32px;border-radius:14px;font-size:17px;font-weight:800;cursor:pointer;">
            Explore the Marketplace &rarr;
          </button>
        </div>
      </div>
      
      <!-- Footer -->
      <div style="background:#fff;border-top:1px solid #E9ECEF;padding:32px 24px;text-align:center;">
        <div style="margin-bottom:16px;font-size:20px;font-weight:800;color:#212529;">&#x1F4E6; ShareStash</div>
        <div style="display:flex;gap:24px;justify-content:center;margin-bottom:16px;">
          <a data-nav="PrivacyPolicy" style="font-size:14px;color:#2E86AB;font-weight:600;cursor:pointer;text-decoration:none;">Privacy Policy</a>
          <a data-nav="TermsOfService" style="font-size:14px;color:#2E86AB;font-weight:600;cursor:pointer;text-decoration:none;">Terms of Service</a>
          <a data-nav="HelpCenter" style="font-size:14px;color:#2E86AB;font-weight:600;cursor:pointer;text-decoration:none;">Help Center</a>
        </div>
        <p style="font-size:12px;color:#6C757D;margin:0;">&copy; 2026 ShareStash. All rights reserved.</p>
      </div>
    </div>
  `;

  return (
    <View style={{ flex: 1 }}>
      <div 
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'auto' } as any}
        dangerouslySetInnerHTML={{ __html: html }} 
      />
    </View>
  );
}