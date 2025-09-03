// src/components/Navbar.tsx
import React from "react";
import upsrtc from "../assets/upsrtc.png";

interface NavbarProps {
  orgName?: string;
  orgLogo?: string;
}

const Navbar: React.FC<NavbarProps> = ({ orgName = "FuelSafe", orgLogo }) => {
  return (
    <header
      role="banner"
      aria-label={`${orgName} Navigation`}
      className="w-full bg-gradient-to-r from-[#1e3a8a] to-[#2563eb] dark:from-gray-900 dark:to-gray-800 shadow-md px-4 py-3 flex items-center justify-between"
    >
      {/* Left Section (Future use: e.g., user profile, org details) */}
      <div className="w-48 flex items-center gap-4">
        {/* Reserved for backend-driven content */}
      </div>

      {/* Center: App Title */}
      <div className="text-center flex-1">
        <h1 className="text-2xl font-signord font-extrabold text-white dark:text-gray-100 truncate">
          {orgName}
        </h1>
      </div>

      {/* Right: Logo */}
      <div className="flex items-center gap-4">
        <img
          src={orgLogo || upsrtc}
          alt={orgName}
          className="h-10 sm:h-12 w-auto object-contain"
          title={orgName}
        />
      </div>
    </header>
  );
};

export default Navbar;
