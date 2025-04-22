// components/navbar.tsx
import Link from 'next/link';
import React from 'react';
import Image from 'next/image';

export function Navbar() {
  return (
    <nav className="w-full bg-background border-b sticky top-0 z-50 shadow-sm">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center">
          <Link href="/" className="relative flex items-center">
          
            <Image
              src="/logo.png"
              alt="Logo"
              width={150}
              height={150}
              priority
              className="object-contain"
            />
          </Link>
        </div>

        <div className="flex items-center space-x-4">
          {/* Navigation links can be added here */}
        </div>
      </div>
    </nav>
  );
}