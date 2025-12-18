import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabaseClient } from '../../lib/supabase';

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const handleAuthCallback = async () => {
      const { error } = await supabaseClient.auth.getSession();

      if (error) {
        console.error('Auth callback error:', error);
        router.push('/login?error=auth_failed');
      } else {
        router.push('/');
      }
    };

    handleAuthCallback();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#d5d5d5' }}>
      <div className="bg-gray-900 rounded-2xl border border-gray-700 p-8">
        <p className="text-white">Completing sign in...</p>
      </div>
    </div>
  );
}
