// Marks for the Extensions cards that have no logo file to load. Google Sheets
// and Square are drawn here in their brand colours.

// Google Sheets: a green page with a folded corner and a white grid.
export function SheetsLogo({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#0F9D58" d="M14.5 1H6a2 2 0 0 0-2 2v18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6.5L14.5 1Z" />
      <path fill="#87CEAC" d="M14.5 1v4.5a1 1 0 0 0 1 1H20L14.5 1Z" />
      <path fill="#fff" d="M7.5 10.5v6.5h9v-6.5h-9Zm1.2 1.2h2.3v1.3H8.7v-1.3Zm3.5 0h3.1v1.3h-3.1v-1.3ZM8.7 14.1H11v1.3H8.7v-1.3Zm3.5 0h3.1v1.3h-3.1v-1.3Z" />
    </svg>
  );
}

// Square: a black rounded square with a hollow square inside and a dot at its
// centre. Black in light mode; the dark theme turns text-slate-900 white.
export function SquareLogo({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="text-slate-900">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M6 1.5h12A4.5 4.5 0 0 1 22.5 6v12a4.5 4.5 0 0 1-4.5 4.5H6A4.5 4.5 0 0 1 1.5 18V6A4.5 4.5 0 0 1 6 1.5Zm.6 5.1v10.8h10.8V6.6H6.6Zm3.3 3.3h4.2v4.2H9.9V9.9Z"
      />
    </svg>
  );
}
