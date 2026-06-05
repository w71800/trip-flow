const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"] as const;

export function generateDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);

  while (cur <= endDate) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }

  return dates;
}

export function formatTripDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekday = WEEKDAYS[d.getDay()];
  return `${month}/${day}（${weekday}）`;
}

export function formatTripDateShort(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
