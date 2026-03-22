"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { getUser, logout, User } from "@/lib/auth";

export default function Navbar() {
  const router   = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);

  // Doc user chi o client de tranh hydration mismatch
  useEffect(() => {
    setUser(getUser());
  }, []);

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const navItems = [
    { href: "/",          label: "Chat"        },
    { href: "/documents", label: "Tai lieu"    },
    ...(user?.role === "admin" ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  return (
    <nav className="bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
      <div className="flex items-center gap-6">
        <Link href="/" className="text-blue-600 font-bold text-lg flex items-center gap-2">
          <span className="text-xl">AI</span>
          <span className="text-gray-800">IAM</span>
        </Link>
        <div className="flex gap-1">
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
                  ? "bg-blue-50 text-blue-600"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {item.label}
              {item.href === "/admin" && (
                <span className="ml-1.5 bg-purple-100 text-purple-700 text-xs px-1.5 py-0.5 rounded-full">
                  Admin
                </span>
              )}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {user && (
          <>
            <div className="text-right">
              <p className="text-sm font-medium text-gray-700">{user.name}</p>
              <p className="text-xs text-gray-400">{user.email}</p>
            </div>
            {user.role === "admin" && (
              <span className="bg-purple-100 text-purple-700 text-xs px-2 py-1 rounded-full font-medium">
                Admin
              </span>
            )}
          </>
        )}
        <button
          onClick={handleLogout}
          className="text-sm text-gray-400 hover:text-red-500 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50"
        >
          Dang xuat
        </button>
      </div>
    </nav>
  );
}