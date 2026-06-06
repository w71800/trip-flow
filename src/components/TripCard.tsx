type TripCardProps = {
  order: number;
  title: string;
  html: string;
  isLast: boolean;
  isLinkedToNext: boolean;
};

export function TripCard({ 
  order,
  title,
  html,
  isLast,
  isLinkedToNext,
}: TripCardProps) {
  return (
    <li className="timelineItem">
      <div className="timelineRail" aria-hidden="true">
        <span className="timelineNode" />
        {!isLast && (
          <span
            className={`timelineConnector${isLinkedToNext ? " isLinked" : ""}`}
          />
        )}
      </div>
      <article className="card timelineCard">
        <h2>
          {title}
        </h2>
        {html.trim() && (
        <div
          className="content"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
      </article>
    </li>
  );
}
