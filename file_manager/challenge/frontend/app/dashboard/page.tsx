"use client"

import FileManager from '@/components/FileManager'
import { useEffect, useState } from 'react';
import { isAuthenticated } from '@/lib/auth';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const router = useRouter();
  
  useEffect(() => {
    const checkAuth = async (): Promise<void> => {
      const authStatus = isAuthenticated();
      
      if (!authStatus) {
        router.push('/login');
      } else {
        setIsLoading(false);
      }
    };
    
    checkAuth();
  }, [router]);
  
  if (isLoading) {
    return null;
  }
  
  return (
      <FileManager />
  );
}