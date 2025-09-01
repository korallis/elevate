'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from './ThemeToggle';
import { Logo } from './Logo';
import {
  Menu,
  X,
  Database,
  Sparkles,
  BarChart3,
  Shield,
  Clock,
  Settings,
  Users,
  LogOut,
  User as UserIcon,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { Button } from './ui/design-system';
import { useRBAC, RequirePermission, RequireAnyPermission } from '@/lib/rbac';
import { setAccessToken } from '@/lib/api';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const { user } = useRBAC();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isUserMenuOpen && !event.target) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isUserMenuOpen]);

  const navigation = [
    { name: 'Catalog', href: '/catalog', icon: Database, permission: 'data:read' },
    { name: 'ETL', href: '/etl', icon: Clock, permission: 'data:write' },
    { name: 'Explore', href: '/explore', icon: Sparkles, permission: 'data:read' },
    { name: 'Dashboards', href: '/dashboards', icon: BarChart3, permission: 'reports:view' },
    { name: 'Governance', href: '/governance', icon: Shield, permission: 'governance:read' },
  ];

  const adminNavigation = [
    { name: 'Users', href: '/admin/users', icon: Users, permission: 'users:manage' },
    { name: 'Roles', href: '/admin/roles', icon: Settings, permission: 'roles:manage' },
  ];

  const isActive = (href: string) => pathname === href;

  const handleLogout = () => {
    setAccessToken(null);
    window.location.href = '/';
  };

  return (
    <div className="min-h-dvh relative">
      {/* Modern header with glassmorphism */}
      <header
        className={`sticky top-0 z-50 transition-all duration-300 ${
          isScrolled ? 'glass-card border-b border-border/50 backdrop-blur-2xl' : 'bg-transparent'
        }`}
      >
        <div className="container">
          <div className="h-16 flex items-center justify-between">
            {/* Logo and navigation */}
            <div className="flex items-center gap-8">
              <Link href="/" className="flex items-center gap-2 group">
                <Logo />
                <span className="font-display font-semibold text-lg gradient-text-subtle">
                  Elev8
                </span>
              </Link>

              {/* Desktop navigation */}
              {user && (
                <nav className="hidden lg:flex items-center gap-1">
                  {navigation.map((item) => (
                    <RequirePermission key={item.name} permission={item.permission}>
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                        className={isActive(item.href) ? 'text-primary bg-primary/10' : ''}
                      >
                        <Link href={item.href}>
                          <item.icon className="w-4 h-4" />
                          {item.name}
                        </Link>
                      </Button>
                    </RequirePermission>
                  ))}

                  {/* Admin navigation */}
                  <RequireAnyPermission permissions={['users:manage', 'roles:manage']}>
                    <div className="h-4 w-px bg-border mx-2" />
                    {adminNavigation.map((item) => (
                      <RequirePermission key={item.name} permission={item.permission}>
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                          className={isActive(item.href) ? 'text-primary bg-primary/10' : ''}
                        >
                          <Link href={item.href}>
                            <item.icon className="w-4 h-4" />
                            {item.name}
                          </Link>
                        </Button>
                      </RequirePermission>
                    ))}
                  </RequireAnyPermission>
                </nav>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <ThemeToggle />

              {user ? (
                <div className="hidden lg:flex items-center gap-3 relative">
                  {/* User menu */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                    className="flex items-center gap-2"
                  >
                    <UserIcon className="w-4 h-4" />
                    {user.name || user.email}
                  </Button>

                  {isUserMenuOpen && (
                    <div className="absolute top-full right-0 mt-2 w-64 bg-background border border-border rounded-lg shadow-lg py-2 z-50">
                      <div className="px-4 py-2 border-b border-border">
                        <div className="font-medium">{user.name || user.email}</div>
                        <div className="text-sm text-foreground-muted">{user.email}</div>
                        <div className="text-xs text-foreground-muted mt-1">
                          Roles: {user.roles?.map((r) => r.role_name).join(', ') || 'None'}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleLogout}
                        className="w-full justify-start px-4 py-2 text-red-600"
                      >
                        <LogOut className="w-4 h-4" />
                        Logout
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="hidden lg:flex items-center gap-3">
                  <Button variant="secondary" size="md" asChild>
                    <Link href="/login">Login</Link>
                  </Button>
                  <Button variant="primary" size="md" asChild>
                    <Link href="/signup">Get Started</Link>
                  </Button>
                </div>
              )}

              {/* Mobile menu button */}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="lg:hidden"
              >
                {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {isMobileMenuOpen && (
          <div className="lg:hidden border-t border-border/50">
            <div className="container py-4">
              {user ? (
                <>
                  <nav className="flex flex-col gap-2">
                    {navigation.map((item) => (
                      <RequirePermission key={item.name} permission={item.permission}>
                        <Button
                          variant="ghost"
                          size="md"
                          asChild
                          className={`justify-start ${isActive(item.href) ? 'text-primary bg-primary/10' : ''}`}
                        >
                          <Link href={item.href} onClick={() => setIsMobileMenuOpen(false)}>
                            <item.icon className="w-4 h-4" />
                            {item.name}
                          </Link>
                        </Button>
                      </RequirePermission>
                    ))}

                    {/* Admin navigation */}
                    <RequireAnyPermission permissions={['users:manage', 'roles:manage']}>
                      <div className="my-2 border-t border-border/50" />
                      {adminNavigation.map((item) => (
                        <RequirePermission key={item.name} permission={item.permission}>
                          <Button
                            variant="ghost"
                            size="md"
                            asChild
                            className={`justify-start ${isActive(item.href) ? 'text-primary bg-primary/10' : ''}`}
                          >
                            <Link href={item.href} onClick={() => setIsMobileMenuOpen(false)}>
                              <item.icon className="w-4 h-4" />
                              {item.name}
                            </Link>
                          </Button>
                        </RequirePermission>
                      ))}
                    </RequireAnyPermission>
                  </nav>

                  <div className="mt-4 pt-4 border-t border-border/50">
                    <div className="mb-4 p-3 bg-background-secondary rounded-lg">
                      <div className="font-medium">{user.name || user.email}</div>
                      <div className="text-sm text-foreground-muted">{user.email}</div>
                      <div className="text-xs text-foreground-muted mt-1">
                        Roles: {user.roles?.map((r) => r.role_name).join(', ') || 'None'}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="md"
                      onClick={() => {
                        handleLogout();
                        setIsMobileMenuOpen(false);
                      }}
                      className="w-full justify-start text-red-600"
                    >
                      <LogOut className="w-4 h-4" />
                      Logout
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex flex-col gap-2">
                  <Button variant="secondary" size="md" asChild className="justify-center">
                    <Link href="/login" onClick={() => setIsMobileMenuOpen(false)}>
                      Login
                    </Link>
                  </Button>
                  <Button variant="primary" size="md" asChild className="justify-center">
                    <Link href="/signup" onClick={() => setIsMobileMenuOpen(false)}>
                      Get Started
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="relative z-10">{children}</main>

      {/* Modern footer */}
      <footer className="relative mt-24 border-t border-border/50 bg-background-secondary/50 backdrop-blur-xl">
        <div className="container py-16">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8">
            {/* Brand */}
            <div className="col-span-2 lg:col-span-1">
              <Link href="/" className="flex items-center gap-2 mb-4">
                <Logo />
                <span className="font-display font-semibold gradient-text-subtle">Elev8</span>
              </Link>
              <p className="text-sm text-foreground-muted leading-relaxed">
                Multi-connector analytics platform with AI-powered insights.
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-foreground-muted">
                <li>
                  <Link href="/catalog" className="hover:text-foreground transition-colors">
                    Data Catalog
                  </Link>
                </li>
                <li>
                  <Link href="/explore" className="hover:text-foreground transition-colors">
                    NL→SQL
                  </Link>
                </li>
                <li>
                  <Link href="/dashboards" className="hover:text-foreground transition-colors">
                    Dashboards
                  </Link>
                </li>
                <li>
                  <Link href="/governance" className="hover:text-foreground transition-colors">
                    Governance
                  </Link>
                </li>
              </ul>
            </div>

            {/* Solutions */}
            <div>
              <h4 className="font-semibold mb-4">Solutions</h4>
              <ul className="space-y-2 text-sm text-foreground-muted">
                <li>
                  <Link href="/solutions/saas" className="hover:text-foreground transition-colors">
                    SaaS Analytics
                  </Link>
                </li>
                <li>
                  <Link
                    href="/solutions/ecommerce"
                    className="hover:text-foreground transition-colors"
                  >
                    E-commerce
                  </Link>
                </li>
                <li>
                  <Link
                    href="/solutions/marketing"
                    className="hover:text-foreground transition-colors"
                  >
                    Marketing
                  </Link>
                </li>
                <li>
                  <Link
                    href="/solutions/compliance"
                    className="hover:text-foreground transition-colors"
                  >
                    Compliance
                  </Link>
                </li>
              </ul>
            </div>

            {/* Resources */}
            <div>
              <h4 className="font-semibold mb-4">Resources</h4>
              <ul className="space-y-2 text-sm text-foreground-muted">
                <li>
                  <Link href="/docs" className="hover:text-foreground transition-colors">
                    Documentation
                  </Link>
                </li>
                <li>
                  <Link href="/api" className="hover:text-foreground transition-colors">
                    API Reference
                  </Link>
                </li>
                <li>
                  <Link href="/blog" className="hover:text-foreground transition-colors">
                    Blog
                  </Link>
                </li>
                <li>
                  <Link href="/changelog" className="hover:text-foreground transition-colors">
                    Changelog
                  </Link>
                </li>
              </ul>
            </div>

            {/* Company */}
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-foreground-muted">
                <li>
                  <Link href="/about" className="hover:text-foreground transition-colors">
                    About
                  </Link>
                </li>
                <li>
                  <Link href="/pricing" className="hover:text-foreground transition-colors">
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link href="/contact" className="hover:text-foreground transition-colors">
                    Contact
                  </Link>
                </li>
                <li>
                  <Link href="/careers" className="hover:text-foreground transition-colors">
                    Careers
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="mt-12 pt-8 border-t border-border/50 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-sm text-foreground-muted">
              © {new Date().getFullYear()} Elev8. All rights reserved.
            </div>
            <div className="flex items-center gap-6 text-sm text-foreground-muted">
              <Link href="/privacy" className="hover:text-foreground transition-colors">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-foreground transition-colors">
                Terms
              </Link>
              <Link href="/security" className="hover:text-foreground transition-colors">
                Security
              </Link>
              <Link href="/status" className="hover:text-foreground transition-colors">
                Status
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
