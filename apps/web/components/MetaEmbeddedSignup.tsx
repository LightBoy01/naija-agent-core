'use client';

import { useEffect, useState } from 'react';

interface MetaEmbeddedSignupProps {
  onSuccess: (data: { accessToken: string; wabaId: string; phoneId: string }) => void;
  onError: (error: string) => void;
}

export default function MetaEmbeddedSignup({ onSuccess, onError }: MetaEmbeddedSignupProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // 1. Inject Facebook SDK
    const script = document.createElement('script');
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      // @ts-expect-error - Global FB initialization
      window.fbAsyncInit = function() {
        // @ts-expect-error - Global FB object
        window.FB.init({
          appId: process.env.NEXT_PUBLIC_META_APP_ID || '', // Needs to be set in .env
          cookie: true,
          xfbml: true,
          version: 'v19.0'
        });
        setIsLoaded(true);
      };
    };
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const launchWhatsAppSignup = () => {
    // @ts-expect-error - Global FB login
    window.FB.login((response: { authResponse?: { accessToken: string } }) => {
      if (response.authResponse) {
        console.log('✅ Meta Login Success:', response.authResponse);
        
        // Extract Meta-specific IDs from the response or subsequent graph call
        // In the embedded signup flow, Meta often sends a 'code' or 'accessToken'
        // that we then exchange on the backend for a permanent token.
        
        // For simplicity in this plan, we'll assume we get the accessToken and wabaId.
        // In production, we'd use the Code Exchange flow.
        
        const accessToken = response.authResponse.accessToken;
        // The wabaId and phoneId are usually retrieved from a 'granted_scopes' or
        // by calling /me/accounts on the backend.
        
        onSuccess({
          accessToken,
          wabaId: 'PENDING_EXCHANGE', // We'll resolve these on the backend
          phoneId: 'PENDING_EXCHANGE'
        });
      } else {
        console.error('❌ Meta Login Failed or Cancelled');
        onError('Meta login failed or was cancelled.');
      }
    }, {
      scope: 'whatsapp_business_management,whatsapp_business_messaging',
      extras: {
        feature: 'whatsapp_embedded_signup',
        // Optional: setup_id: '...', 
      }
    });
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        onClick={launchWhatsAppSignup}
        disabled={!isLoaded}
        className={`flex items-center gap-2 bg-[#1877F2] text-white px-6 py-3 rounded-lg font-bold shadow-md hover:bg-[#166fe5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.001 2.002c-5.522 0-9.999 4.477-9.999 9.999 0 4.909 3.538 9.001 8.203 9.803v-6.931h-2.525v-2.872h2.525V9.81c0-2.492 1.483-3.868 3.755-3.868 1.088 0 2.226.194 2.226.194v2.448h-1.254c-1.235 0-1.62.766-1.62 1.554v1.864h2.759l-.441 2.872h-2.318v6.931c4.665-.802 8.203-4.894 8.203-9.803 0-5.522-4.477-9.999-9.999-9.999z" />
        </svg>
        {isLoaded ? 'Connect with WhatsApp' : 'Loading SDK...'}
      </button>
      <p className="text-xs text-zinc-500 text-center max-w-xs">
        Click to authorize your WhatsApp Business Account. This will link your phone number to your AI bot.
      </p>
    </div>
  );
}
