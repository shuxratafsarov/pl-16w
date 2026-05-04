import type { SVGProps } from "react";

/** Stylised AK-47 silhouette — marker for automatic (МКО (А)) parties. */
export const AkIcon = ({ className, ...props }: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 64 24"
    fill="currentColor"
    aria-hidden="true"
    className={className}
    {...props}
  >
    {/* barrel */}
    <rect x="38" y="9" width="22" height="2.2" rx="0.4" />
    {/* front sight */}
    <rect x="56" y="7" width="1.6" height="2.2" />
    {/* gas tube / handguard */}
    <rect x="30" y="7.5" width="12" height="3.2" rx="0.6" />
    {/* rear sight */}
    <rect x="28" y="6.5" width="2" height="2" />
    {/* receiver */}
    <rect x="14" y="9.5" width="20" height="5" rx="0.6" />
    {/* magazine — curved AK shape */}
    <path d="M20 14.5 h10 l-1.2 6.5 q-3.8 1.2 -7.6 0 z" />
    {/* pistol grip */}
    <path d="M16.5 14.5 h3.2 l-1 5.5 q-1.6 0.4 -2.6 -0.2 z" />
    {/* trigger guard */}
    <path
      d="M17.8 15 q1.8 1.6 4 0"
      fill="none"
      stroke="currentColor"
      strokeWidth="0.6"
      strokeLinecap="round"
    />
    {/* stock */}
    <path d="M2 11 l12 -1.4 v5.2 l-12 -1.4 z" />
    {/* stock cheek line */}
    <rect x="3" y="12" width="11" height="0.5" opacity="0.55" />
  </svg>
);
