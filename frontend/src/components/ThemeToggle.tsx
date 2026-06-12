import { Sun, Moon } from 'lucide-react';
import { useTheme } from './theme-provider';

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className = '' }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();

  // Resolve system preference if theme is 'system'
  const isDark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  const toggleTheme = () => {
    setTheme(isDark ? 'light' : 'dark');
  };

  return (
    <button
      onClick={toggleTheme}
      className={`p-2 rounded-clay-md border border-clay-hairline text-clay-muted hover:text-clay-ink hover:bg-clay-surface-soft active:scale-95 transition-all duration-300 cursor-pointer flex items-center justify-center ${className}`}
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      aria-label="Toggle theme"
    >
      <div className="relative w-4 h-4 overflow-hidden flex items-center justify-center">
        {/* Sun Icon (displayed in dark mode to switch to light) */}
        <span
          className={`absolute transition-all duration-500 ease-out flex items-center justify-center ${
            isDark 
              ? 'rotate-0 scale-100 opacity-100' 
              : 'rotate-90 scale-0 opacity-0'
          }`}
        >
          <Sun className="w-4 h-4 text-clay-ochre fill-clay-ochre/20" />
        </span>
        {/* Moon Icon (displayed in light mode to switch to dark) */}
        <span
          className={`absolute transition-all duration-500 ease-out flex items-center justify-center ${
            isDark 
              ? '-rotate-90 scale-0 opacity-0' 
              : 'rotate-0 scale-100 opacity-100'
          }`}
        >
          <Moon className="w-4 h-4 text-indigo-500 fill-indigo-500/20" />
        </span>
      </div>
    </button>
  );
}
