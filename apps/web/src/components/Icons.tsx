import React from "react";

function NavIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      {children}
    </svg>
  );
}

export function MenuIcon() {
  return (
    <NavIcon>
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </NavIcon>
  );
}

export function DashboardIcon() {
  return (
    <NavIcon>
      <path d="M4 4h7v7H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 13h7v7H4z" stroke="currentColor" strokeWidth="1.8" />
    </NavIcon>
  );
}

export function ProjectsIcon() {
  return (
    <NavIcon>
      <path
        d="M3 7h7l2 2h9v10H3V7z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </NavIcon>
  );
}

export function LegalDocIcon() {
  return (
    <NavIcon>
      <path
        d="M7 3h8l4 4v14H7V3z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M15 3v5h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10 12h6M10 16h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </NavIcon>
  );
}

export function ObligationIcon() {
  return (
    <NavIcon>
      <path
        d="M6 4h12l2 3v13H4V7l2-3z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </NavIcon>
  );
}

export function TasksIcon() {
  return (
    <NavIcon>
      <path d="M8 7h11M8 12h11M8 17h11M4 7h.01M4 12h.01M4 17h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </NavIcon>
  );
}

export function DeadlinesIcon() {
  return (
    <NavIcon>
      <path
        d="M7 4v3M17 4v3M5 8h14M6 6h12a1 1 0 011 1v12a1 1 0 01-1 1H6a1 1 0 01-1-1V7a1 1 0 011-1z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </NavIcon>
  );
}

export function ScopesIcon() {
  return (
    <NavIcon>
      <path d="M3 8l9-5 9 5-9 5-9-5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M3 13l9 5 9-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </NavIcon>
  );
}

export function AdminIcon() {
  return (
    <NavIcon>
      <path
        d="M12 3l2.5 2.2 3.3.3.7 3.2 2 2.6-2 2.6-.7 3.2-3.3.3L12 21l-2.5-2.2-3.3-.3-.7-3.2-2-2.6 2-2.6.7-3.2 3.3-.3L12 3z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    </NavIcon>
  );
}

export function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
      <path
        d="M6 9a6 6 0 1112 0v4l2 3H4l2-3V9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9.5 19a2.5 2.5 0 005 0" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
      <path
        d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
      <path
        d="M4 20h4l10-10-4-4L4 16v4z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M13 6l4 4" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function ArchiveIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
      <path
        d="M4 7h16v3H4z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 10h12v9H6z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 4h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
