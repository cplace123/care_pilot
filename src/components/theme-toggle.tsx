"use client";
import { useEffect, useSyncExternalStore } from 'react';
import { Icon } from './icon';
function subscribe(callback: () => void) { window.addEventListener('carepilot-theme', callback); window.addEventListener('storage', callback); return () => { window.removeEventListener('carepilot-theme', callback); window.removeEventListener('storage', callback); }; }
function snapshot() { try { return localStorage.getItem('carepilot-theme') === 'dark' ? 'dark' : 'light'; } catch { return 'light'; } }
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, snapshot, () => 'light');
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  function toggle() { try { localStorage.setItem('carepilot-theme', theme === 'light' ? 'dark' : 'light'); window.dispatchEvent(new Event('carepilot-theme')); } catch { document.documentElement.dataset.theme = theme === 'light' ? 'dark' : 'light'; } }
  return <button type="button" className="icon-button" onClick={toggle} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}><Icon name={theme === 'light' ? 'moon' : 'sun'} /></button>;
}
