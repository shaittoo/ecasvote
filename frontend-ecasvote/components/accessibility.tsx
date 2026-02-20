"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AccessibilityIcon, X } from "lucide-react";

type TextSize = "small" | "normal" | "large";
type ColorBlindMode = "none" | "protanopia" | "deuteranopia" | "tritanopia";

export default function AccessibilityPanel({ sizeClass = "h-20 w-20" }: { sizeClass?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [textSize, setTextSize] = useState<TextSize>("normal");
  const [highContrast, setHighContrast] = useState(false);
  const [colorBlindMode, setColorBlindMode] = useState<ColorBlindMode>("none");
  const [dyslexiaFont, setDyslexiaFont] = useState(false);

  // Load preferences from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("accessibilityPreferences");
    if (saved) {
      const prefs = JSON.parse(saved);
      setTextSize(prefs.textSize || "normal");
      setHighContrast(prefs.highContrast || false);
      setColorBlindMode(prefs.colorBlindMode || "none");
      setDyslexiaFont(prefs.dyslexiaFont || false);
    }
    applyPreferences({
      textSize: "normal",
      highContrast: false,
      colorBlindMode: "none",
      dyslexiaFont: false,
      ...saved ? JSON.parse(saved) : {}
    });
  }, []);

  const applyPreferences = (prefs: {
    textSize: TextSize;
    highContrast: boolean;
    colorBlindMode: ColorBlindMode;
    dyslexiaFont: boolean;
  }) => {
    // Text size
    const fontSizeMap = {
      small: "0.875rem",
      normal: "1rem",
      large: "1.25rem",
    };
    document.documentElement.style.fontSize = fontSizeMap[prefs.textSize];

    // High contrast
    if (prefs.highContrast) {
      document.documentElement.classList.add("high-contrast");
    } else {
      document.documentElement.classList.remove("high-contrast");
    }

    // Dyslexia font
    if (prefs.dyslexiaFont) {
      document.documentElement.classList.add("dyslexia-font");
    } else {
      document.documentElement.classList.remove("dyslexia-font");
    }

    // Color blind mode
    document.documentElement.setAttribute("data-color-blind-mode", prefs.colorBlindMode);

    // Save to localStorage
    localStorage.setItem("accessibilityPreferences", JSON.stringify(prefs));
  };

  const handleTextSizeChange = (size: TextSize) => {
    setTextSize(size);
    applyPreferences({ textSize: size, highContrast, colorBlindMode, dyslexiaFont });
  };

  const handleHighContrastToggle = () => {
    const newState = !highContrast;
    setHighContrast(newState);
    applyPreferences({ textSize, highContrast: newState, colorBlindMode, dyslexiaFont });
  };

  const handleColorBlindModeChange = (mode: ColorBlindMode) => {
    setColorBlindMode(mode);
    applyPreferences({ textSize, highContrast, colorBlindMode: mode, dyslexiaFont });
  };

  const handleDyslexiaFontToggle = () => {
    const newState = !dyslexiaFont;
    setDyslexiaFont(newState);
    applyPreferences({ textSize, highContrast, colorBlindMode, dyslexiaFont: newState });
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        title="Accessibility options"
        className={`text-gray-700 hover:bg-gray-100 ${sizeClass}`}
      >
        <AccessibilityIcon className={sizeClass} />
      </Button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg p-6 z-50">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Accessibility</h2>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-gray-600"
              aria-label="Close accessibility panel"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Text Size */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Text Size
            </label>
            <div className="flex gap-2">
              {(["small", "normal", "large"] as const).map((size) => (
                <button
                  key={size}
                  onClick={() => handleTextSizeChange(size)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    textSize === size
                      ? "bg-[#7A0019] text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {size.charAt(0).toUpperCase() + size.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* High Contrast */}
          <div className="mb-6">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={highContrast}
                onChange={handleHighContrastToggle}
                className="w-4 h-4 rounded border-gray-300"
              />
              <span className="text-sm font-medium text-gray-700">
                High Contrast Mode
              </span>
            </label>
          </div>

          {/* Dyslexia Font */}
          <div className="mb-6">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={dyslexiaFont}
                onChange={handleDyslexiaFontToggle}
                className="w-4 h-4 rounded border-gray-300"
              />
              <span className="text-sm font-medium text-gray-700">
                Dyslexia-Friendly Font
              </span>
            </label>
          </div>

          {/* Color Blind Mode */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Color Blind Mode
            </label>
            <select
              value={colorBlindMode}
              onChange={(e) => handleColorBlindModeChange(e.target.value as ColorBlindMode)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7A0019]"
            >
              <option value="none">Off</option>
              <option value="protanopia">Protanopia (Red-Blind)</option>
              <option value="deuteranopia">Deuteranopia (Green-Blind)</option>
              <option value="tritanopia">Tritanopia (Blue-Yellow-Blind)</option>
            </select>
          </div>
        </div>
      )}

      <style jsx global>{`
        /* High Contrast Mode */
        html.high-contrast {
          --border-color: #000;
          --text-color: #000;
          --bg-color: #fff;
        }

        html.high-contrast,
        html.high-contrast * {
          border-color: #000 !important;
          color: #000 !important;
          background-color: #fff !important;
        }

        html.high-contrast a {
          text-decoration: underline;
        }

        /* Dyslexia Font */
        html.dyslexia-font,
        html.dyslexia-font * {
          font-family: "OpenDyslexic", "Comic Sans MS", cursive, sans-serif !important;
        }

        /* Color Blind Filters */
        html[data-color-blind-mode="protanopia"] {
          filter: url(#protanopia-filter);
        }

        html[data-color-blind-mode="deuteranopia"] {
          filter: url(#deuteranopia-filter);
        }

        html[data-color-blind-mode="tritanopia"] {
          filter: url(#tritanopia-filter);
        }
      `}</style>

      {/* SVG Filters for Color Blind Modes */}
      <svg style={{ display: "none" }}>
        <defs>
          {/* Protanopia (Red-Blind) */}
          <filter id="protanopia-filter">
            <feColorMatrix
              type="matrix"
              values="0.567 0.433 0     0 0
                      0.558 0.442 0     0 0
                      0     0.242 0.758 0 0
                      0     0     0     1 0"
            />
          </filter>
          {/* Deuteranopia (Green-Blind) */}
          <filter id="deuteranopia-filter">
            <feColorMatrix
              type="matrix"
              values="0.625 0.375 0     0 0
                      0.7   0.3   0     0 0
                      0     0.3   0.7   0 0
                      0     0     0     1 0"
            />
          </filter>
          {/* Tritanopia (Blue-Yellow-Blind) */}
          <filter id="tritanopia-filter">
            <feColorMatrix
              type="matrix"
              values="0.95  0.05  0     0 0
                      0     0.433 0.567 0 0
                      0     0.475 0.525 0 0
                      0     0     0     1 0"
            />
          </filter>
        </defs>
      </svg>
    </div>
  );
}
