/*
 * The empty-session tarsier — an idle illustration for /review's NothingDue state, drawn from the
 * brand reference (tarsier.png). Inline SVG on purpose: every fill/stroke is a --tarsier-* var
 * (styles.css), so the one drawing follows the .dark class — an <img src="…svg"> could not.
 * Animation is pure CSS (styles.css keyframes); the loop only runs when reduced motion is off.
 */
import { useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

export function TarsierIdle({
  variant = "outlined",
  className,
}: {
  variant?: "outlined" | "flat";
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <svg
      className={cn("tarsier", !reduced && "tarsier-animate", className)}
      data-variant={variant}
      viewBox="0 0 240 244"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* tail — outline drawn as a wider underlay stroke, since a stroke can't be stroked */}
      <g className="t-tail">
        <path
          className="t-under"
          d="M176 172 C205 195 205 224 176 230 C154 234 146 218 158 210 C166 205 174 211 168 219"
          fill="none"
          stroke="var(--tarsier-line)"
          strokeWidth="17"
          strokeLinecap="round"
        />
        <path
          d="M176 172 C205 195 205 224 176 230 C154 234 146 218 158 210 C166 205 174 211 168 219"
          fill="none"
          stroke="var(--tarsier-body)"
          strokeWidth="10"
          strokeLinecap="round"
        />
      </g>

      <g className="t-body">
        <ellipse data-fill cx="132" cy="148" rx="40" ry="34" fill="var(--tarsier-body)" />
        <circle data-fill className="t-haunch" cx="172" cy="156" r="21" fill="var(--tarsier-body)" />
        <ellipse data-fill cx="130" cy="150" rx="21" ry="25" fill="var(--tarsier-cream)" />
      </g>

      {/* branch + leaf */}
      <g>
        <path
          className="t-under"
          d="M16 166 C80 172 160 186 224 200"
          fill="none"
          stroke="var(--tarsier-line)"
          strokeWidth="27"
          strokeLinecap="round"
        />
        <path
          d="M16 166 C80 172 160 186 224 200"
          fill="none"
          stroke="var(--tarsier-branch)"
          strokeWidth="20"
          strokeLinecap="round"
        />
        <path className="t-detail" d="M52 170 l16 2 M104 178 l14 2 M178 192 l14 2.5" />
        <g className="t-leaf">
          <path
            className="t-under"
            d="M64 166 C56 152 50 138 44 124"
            fill="none"
            stroke="var(--tarsier-line)"
            strokeWidth="9"
            strokeLinecap="round"
          />
          <path
            d="M64 166 C56 152 50 138 44 124"
            fill="none"
            stroke="var(--tarsier-branch)"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <path
            data-fill
            d="M44 124 C22 124 10 104 20 84 C40 88 50 106 44 124 Z"
            fill="var(--tarsier-leaf)"
          />
          <path className="t-detail" d="M40 116 L26 94" strokeWidth="2.5" />
        </g>
      </g>

      {/* paws */}
      <g>
        <rect data-fill x="94" y="168" width="26" height="19" rx="9" fill="var(--tarsier-body)" />
        <path className="t-detail" d="M103 172 v11 M111 172 v11" strokeWidth="2.5" />
        <rect data-fill x="138" y="173" width="26" height="19" rx="9" fill="var(--tarsier-body)" />
        <path className="t-detail" d="M147 177 v11 M155 177 v11" strokeWidth="2.5" />
      </g>

      {/* head — ears ride inside so the tilt carries them */}
      <g className="t-head">
        <g className="t-ear-l">
          <ellipse
            data-fill
            cx="70"
            cy="38"
            rx="26"
            ry="33"
            fill="var(--tarsier-body)"
            transform="rotate(-30 70 38)"
          />
          <ellipse
            cx="74"
            cy="42"
            rx="14"
            ry="21"
            fill="var(--tarsier-body-soft)"
            transform="rotate(-30 74 42)"
          />
        </g>
        <g>
          <ellipse
            data-fill
            cx="190"
            cy="38"
            rx="26"
            ry="33"
            fill="var(--tarsier-body)"
            transform="rotate(30 190 38)"
          />
          <ellipse
            cx="186"
            cy="42"
            rx="14"
            ry="21"
            fill="var(--tarsier-body-soft)"
            transform="rotate(30 186 42)"
          />
        </g>
        <ellipse data-fill cx="130" cy="82" rx="56" ry="50" fill="var(--tarsier-body)" />
        <path
          data-fill
          fill="var(--tarsier-cream)"
          d="M130 60 C122 50 108 48 97 54 C78 64 71 90 81 106 C87 116 99 122 111 120 C115 126 122 130 130 130 C138 130 145 126 149 120 C161 122 173 116 179 106 C189 90 182 64 163 54 C152 48 138 50 130 60 Z"
        />
        <g className="t-blink">
          <circle data-fill cx="105" cy="84" r="23" fill="var(--tarsier-eye)" />
          <g className="t-pupil">
            <circle cx="105" cy="84" r="12" fill="var(--tarsier-pupil)" />
            <circle cx="100.5" cy="79.5" r="3.5" fill="var(--tarsier-highlight)" />
          </g>
        </g>
        <g className="t-blink">
          <circle data-fill cx="155" cy="84" r="23" fill="var(--tarsier-eye)" />
          <g className="t-pupil">
            <circle cx="155" cy="84" r="12" fill="var(--tarsier-pupil)" />
            <circle cx="150.5" cy="79.5" r="3.5" fill="var(--tarsier-highlight)" />
          </g>
        </g>
        <path
          d="M124 100 Q130 95 136 100 Q133 106 130 106 Q127 106 124 100 Z"
          fill="var(--tarsier-body-soft)"
        />
        <circle cx="126.5" cy="100.5" r="1.5" fill="var(--tarsier-line)" />
        <circle cx="133.5" cy="100.5" r="1.5" fill="var(--tarsier-line)" />
        <path className="t-detail" d="M118 111 Q130 121 142 111" />
      </g>
    </svg>
  );
}
