'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authService } from '@/lib/api';
import { isAuthenticated } from '@/lib/auth';

export default function Navbar() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    setAuthenticated(isAuthenticated());
  }, []);

  // Optionally render a loading state or nothing until the auth state is determined.
  if (authenticated === null) {
    return null;
  }

  const handleLogout = async () => {
    try {
      await authService.logout();
      router.push('/login');
      setAuthenticated(isAuthenticated());
    } catch (error) {
      console.error('Logout failed', error);
    }
  };

  return (
    <nav className="bg-gray-800 p-4">
      <div className="container mx-auto flex justify-between items-center">
        <Link href="/" className="text-white text-xl font-bold">
          File Manager
        </Link>
        <div className="space-x-4">
          {!authenticated ? (
            <>
              <Link href="/login" className="text-white hover:text-gray-300">
                Login
              </Link>
              <Link href="/register" className="text-white hover:text-gray-300">
                Register
              </Link>
            </>
          ) : (
            <>
              <Link href="/dashboard" className="text-white hover:text-gray-300">
                Dashboard
              </Link>
              <button 
                onClick={handleLogout} 
                className="text-white hover:text-gray-300"
              >
                Logout
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
