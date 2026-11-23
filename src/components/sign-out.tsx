"use client";
import { signOut } from 'next-auth/react';
import { Icon } from './icon';
export function SignOut() { return <button className="quiet-button" onClick={() => void signOut({ callbackUrl: '/login' })}><Icon name="logout" size={17} />Sign out</button>; }
