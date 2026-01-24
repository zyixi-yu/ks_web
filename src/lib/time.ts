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

