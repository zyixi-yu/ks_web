export function formatTimeCN(isoOrMs: string | number | null | undefined): string {
  try {
    const d =
      typeof isoOrMs === "number"
        ? new Date(isoOrMs)
        : new Date(String(isoOrMs || ""));
    if (Number.isNaN(d.getTime())) return "--";
    return d.toLocaleString("zh-CN", {
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "--";
  }
}

export function formatTimeBeijingYYYYMMDDHHmm(isoOrMs: string | number | null | undefined): string {
  try {
    const d =
      typeof isoOrMs === "number"
        ? new Date(isoOrMs)
        : new Date(String(isoOrMs || ""));
    if (Number.isNaN(d.getTime())) return "--";

    const parts = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(d);

    const get = (type: string) => parts.find((p) => p.type === type)?.value || "00";
    return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
  } catch {
    return "--";
  }
}
