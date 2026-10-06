import type { WeekReviewItem } from "@/app/api/week-review/route";

/** Pro. Printable week review. The word Pro is not shown. */
export function WeekReviewPrint({
  review,
  heading,
  items,
}: {
  review: string;
  heading: string;
  items: WeekReviewItem[];
}) {
  return (
    <article data-print="week-review" className="week-review-print">
      <h1>Week Review</h1>
      <p>{heading}</p>
      <div className="week-review-body">{review}</div>
      {items.length ? (
        <>
          <h2>On your list</h2>
          <ul>
            {items.map((item, index) => (
              <li key={`${index}-${item.title}`}>
                {item.title} · {item.course} · {item.due}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </article>
  );
}
