import { formatDistanceToNow } from "date-fns";

export default function convertDateToRelativeTime(date: Date) {
  if (date.toString().toLowerCase() === "invalid date") return "";

  return formatDistanceToNow(date, { addSuffix: true });
}
