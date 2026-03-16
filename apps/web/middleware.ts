import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // 1. SOVEREIGN (MASTER) PROTECTION
  const sovereignPaths = ['/dashboard', '/vault', '/chats', '/settings'];
  const isSovereignPath = sovereignPaths.some(path => pathname === path || pathname.startsWith(path + '/'));
  
  // Special Case: /dashboard/[id] is NOT a sovereign path, it's a tenant path
  const isTenantDashboard = pathname.startsWith('/dashboard/') && pathname.split('/').length >= 3;

  if (isSovereignPath && !isTenantDashboard) {
    const session = request.cookies.get('sovereign_session');
    if (!session) {
      return NextResponse.redirect(new URL('/auth', request.url));
    }
  }

  // 2. TENANT (MERCHANT) PROTECTION
  if (isTenantDashboard) {
    const session = request.cookies.get('tenant_session');
    if (!session) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    try {
      const tenantData = JSON.parse(session.value);
      const orgIdFromPath = pathname.split('/')[2];
      
      // Simple cross-tenant check at middleware level
      if (tenantData.orgId !== orgIdFromPath) {
         console.warn(`🛡️ [MIDDLEWARE] Tenant mismatch: ${tenantData.orgId} vs ${orgIdFromPath}`);
         return NextResponse.redirect(new URL('/login', request.url));
      }
    } catch (_e) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*', 
    '/vault/:path*', 
    '/chats/:path*', 
    '/settings/:path*'
  ],
};
