/**
 * TimelineSection — a horizontal scrolling timeline component.
 *
 * Renders a horizontal track with:
 * - A continuous hairline running left-to-right
 * - Yellow circular "event markers" above the line at each date
 * - Floating cards below each marker for event details
 * - A "+" pill button at the far right (optional, for creating new entries)
 *
 * Adapted from the cardiology-dashboard aesthetic: the same layout used for
 * patient visit/medication columns is here repurposed for venue booking events.
 *
 * Usage:
 *   <TimelineSection events={myEvents} onAdd={() => {}} />
 */

export interface TimelineEvent {
  /** Unique key */
  id: string;
  /** Label shown above the marker, e.g. "Aug" */
  month: string;
  /** Sub-label below month, e.g. "1 Week" */
  subtitle?: string;
  /** Content cards stacked below the marker */
  cards: TimelineCard[];
}

export interface TimelineCard {
  id: string;
  title: string;
  body?: string;
  /** Optional small badge text, shown top-right like the ⚖ in the reference */
  badge?: string;
  /** If true the card gets the yellow accent bg */
  accent?: boolean;
}

interface TimelineSectionProps {
  events: TimelineEvent[];
  /** Called when the "+" button is clicked */
  onAdd?: () => void;
  className?: string;
}

export function TimelineSection({
  events,
  onAdd,
  className = "",
}: TimelineSectionProps) {
  return (
    <div className={`relative w-full overflow-x-auto ${className}`}>
      {/* Outer track — the horizontal strip containing everything */}
      <div className="relative flex min-w-max items-start gap-0 pb-6">

        {/* Horizontal hairline — sits behind all content */}
        <div
          className="pointer-events-none absolute left-0 right-0 top-[2.15rem] h-px bg-border"
          aria-hidden
        />

        {events.map((event, i) => (
          <TimelineColumn key={event.id} event={event} first={i === 0} />
        ))}

        {/* "+" add button at the end, matching the dark circle in reference */}
        {onAdd && (
          <div className="flex flex-col items-center px-8 pt-0">
            {/* Vertically centred on the track line */}
            <button
              onClick={onAdd}
              aria-label="Add event"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow transition-opacity hover:opacity-90"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Single column (one time-point on the track) ─────────────────── */
function TimelineColumn({
  event,
  first,
}: {
  event: TimelineEvent;
  first: boolean;
}) {
  return (
    <div className={`flex flex-col items-start ${first ? "pr-12" : "pr-12 pl-4"}`}>

      {/* Yellow marker circle + label */}
      <div className="flex flex-col items-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent shadow-sm">
          {/* Calendar icon (same iconography as the reference) */}
          <svg
            className="h-5 w-5 text-accent-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.8}
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </div>
        {/* Connector line down from marker to label */}
        <div className="h-3 w-px bg-border" aria-hidden />
      </div>

      {/* Month label */}
      <div className="mb-4 mt-1">
        <p className="text-sm font-semibold text-foreground">{event.month}</p>
        {event.subtitle && (
          <p className="text-xs text-muted-foreground">{event.subtitle}</p>
        )}
      </div>

      {/* Stacked event cards */}
      <div className="flex flex-col gap-3">
        {event.cards.map((card) => (
          <TimelineCard key={card.id} card={card} />
        ))}
      </div>
    </div>
  );
}

/* ── Individual event card on the timeline ───────────────────────── */
function TimelineCard({ card }: { card: TimelineCard }) {
  return (
    <div
      className={`relative w-52 rounded-2xl p-4 shadow-sm ${
        card.accent
          ? "bg-accent text-accent-foreground"
          : "border border-border bg-card"
      }`}
    >
      {/* Title row */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-tight text-foreground">
          {card.title}
        </p>
        {card.badge && (
          <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {card.badge}
          </span>
        )}
      </div>

      {/* Body text */}
      {card.body && (
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {card.body}
        </p>
      )}
    </div>
  );
}
