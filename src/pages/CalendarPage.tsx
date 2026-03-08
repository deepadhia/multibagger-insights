import { DashboardLayout } from "@/components/DashboardLayout";
import { useStocks } from "@/hooks/useStocks";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { differenceInDays, format, parseISO, addDays, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, isSameMonth, isToday, subMonths, addMonths } from "date-fns";
import { CalendarClock, ChevronLeft, ChevronRight, Clock, AlertTriangle, CheckCircle2, ArrowRight } from "lucide-react";

type StockWithDate = {
  id: string;
  company_name: string;
  ticker: string;
  sector: string | null;
  category: string;
  next_results_date: string | null;
};

function getCountdownInfo(dateStr: string | null) {
  if (!dateStr) return { days: null, label: "Not set", urgency: "none" as const };
  const days = differenceInDays(parseISO(dateStr), new Date());
  if (days < 0) return { days, label: `${Math.abs(days)}d ago`, urgency: "past" as const };
  if (days === 0) return { days: 0, label: "Today!", urgency: "critical" as const };
  if (days <= 3) return { days, label: `${days}d`, urgency: "critical" as const };
  if (days <= 7) return { days, label: `${days}d`, urgency: "warning" as const };
  if (days <= 14) return { days, label: `${days}d`, urgency: "soon" as const };
  return { days, label: `${days}d`, urgency: "normal" as const };
}

const urgencyColors = {
  critical: "bg-destructive/20 text-destructive border-destructive/30",
  warning: "bg-accent/20 text-accent border-accent/30",
  soon: "bg-chart-info/20 text-[hsl(var(--chart-info))] border-[hsl(var(--chart-info))]/30",
  normal: "bg-muted text-muted-foreground border-border",
  past: "bg-muted/50 text-muted-foreground/60 border-border/50",
  none: "bg-muted/30 text-muted-foreground/40 border-border/30",
};

export default function CalendarPage() {
  const { data: stocks } = useStocks();
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const stocksWithDates = useMemo(() => {
    if (!stocks) return [];
    return (stocks as StockWithDate[])
      .map((s) => ({ ...s, countdown: getCountdownInfo(s.next_results_date) }))
      .sort((a, b) => {
        if (!a.next_results_date) return 1;
        if (!b.next_results_date) return -1;
        return parseISO(a.next_results_date).getTime() - parseISO(b.next_results_date).getTime();
      });
  }, [stocks]);

  const upcoming = useMemo(() => stocksWithDates.filter(s => s.countdown.days !== null && s.countdown.days >= 0), [stocksWithDates]);
  const past = useMemo(() => stocksWithDates.filter(s => s.countdown.days !== null && s.countdown.days < 0), [stocksWithDates]);
  const unset = useMemo(() => stocksWithDates.filter(s => s.countdown.days === null), [stocksWithDates]);

  // Calendar grid
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPadding = getDay(monthStart); // 0=Sun

  const dateStockMap = useMemo(() => {
    const map = new Map<string, StockWithDate[]>();
    stocksWithDates.forEach(s => {
      if (s.next_results_date) {
        const key = s.next_results_date;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(s);
      }
    });
    return map;
  }, [stocksWithDates]);

  const criticalCount = upcoming.filter(s => s.countdown.urgency === "critical").length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-mono text-xl font-bold text-foreground flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-primary" /> Earnings Calendar
            </h1>
            <p className="font-mono text-xs text-muted-foreground mt-1">
              {upcoming.length} upcoming · {criticalCount > 0 && <span className="text-destructive">{criticalCount} within 3 days</span>}
            </p>
          </div>
        </div>

        {/* Alert banner for critical */}
        {criticalCount > 0 && (
          <Card className="p-3 bg-destructive/10 border-destructive/20">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="font-mono text-xs text-destructive">
                {criticalCount} stock{criticalCount > 1 ? "s" : ""} reporting within 3 days — prep your analysis!
              </span>
            </div>
          </Card>
        )}

        {/* Calendar Grid */}
        <Card className="p-4 bg-card border-border card-glow">
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="h-7 px-2">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h3 className="font-mono text-sm font-semibold text-foreground">
              {format(currentMonth, "MMMM yyyy")}
            </h3>
            <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="h-7 px-2">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-7 gap-px">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
              <div key={d} className="text-center font-mono text-[10px] text-muted-foreground py-1">{d}</div>
            ))}
            {Array.from({ length: startPadding }).map((_, i) => (
              <div key={`pad-${i}`} className="min-h-[60px]" />
            ))}
            {calendarDays.map(day => {
              const key = format(day, "yyyy-MM-dd");
              const dayStocks = dateStockMap.get(key) || [];
              const today = isToday(day);

              return (
                <div
                  key={key}
                  className={`min-h-[60px] p-1 border border-border/30 rounded-sm ${
                    today ? "bg-primary/10 border-primary/30" : "bg-card"
                  } ${dayStocks.length > 0 ? "bg-accent/5" : ""}`}
                >
                  <div className={`font-mono text-[10px] mb-0.5 ${today ? "text-primary font-bold" : "text-muted-foreground"}`}>
                    {format(day, "d")}
                  </div>
                  {dayStocks.slice(0, 3).map(s => (
                    <button
                      key={s.id}
                      onClick={() => navigate(`/stocks/${s.id}`)}
                      className="block w-full text-left font-mono text-[9px] px-1 py-0.5 rounded bg-primary/15 text-primary hover:bg-primary/25 truncate mb-0.5 transition-colors"
                    >
                      {s.ticker}
                    </button>
                  ))}
                  {dayStocks.length > 3 && (
                    <span className="font-mono text-[8px] text-muted-foreground">+{dayStocks.length - 3}</span>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* Upcoming List */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4 bg-card border-border card-glow">
            <h3 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <Clock className="h-3 w-3" /> Upcoming Results
            </h3>
            <div className="space-y-2">
              {upcoming.length === 0 && (
                <p className="text-xs text-muted-foreground italic">No upcoming dates set.</p>
              )}
              {upcoming.map(s => (
                <button
                  key={s.id}
                  onClick={() => navigate(`/stocks/${s.id}`)}
                  className="w-full flex items-center justify-between p-2 rounded bg-muted/30 hover:bg-muted/60 transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-foreground">{s.ticker}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{s.company_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {s.next_results_date && format(parseISO(s.next_results_date), "dd MMM")}
                    </span>
                    <Badge className={`font-mono text-[10px] px-1.5 py-0 ${urgencyColors[s.countdown.urgency]}`}>
                      {s.countdown.label}
                    </Badge>
                    <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              ))}
            </div>
          </Card>

          <div className="space-y-4">
            {/* Past results */}
            <Card className="p-4 bg-card border-border card-glow">
              <h3 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                <CheckCircle2 className="h-3 w-3" /> Recently Reported
              </h3>
              <div className="space-y-2">
                {past.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">None.</p>
                )}
                {past.slice(0, 5).map(s => (
                  <button
                    key={s.id}
                    onClick={() => navigate(`/stocks/${s.id}`)}
                    className="w-full flex items-center justify-between p-2 rounded bg-muted/20 hover:bg-muted/40 transition-colors"
                  >
                    <span className="font-mono text-xs text-muted-foreground">{s.ticker}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground/60">
                        {s.next_results_date && format(parseISO(s.next_results_date), "dd MMM")}
                      </span>
                      <Badge className={`font-mono text-[10px] px-1.5 py-0 ${urgencyColors.past}`}>
                        {s.countdown.label}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            </Card>

            {/* Unset */}
            {unset.length > 0 && (
              <Card className="p-4 bg-card border-border card-glow">
                <h3 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3 text-accent" /> No Date Set
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {unset.map(s => (
                    <Badge
                      key={s.id}
                      variant="secondary"
                      className="font-mono text-[10px] cursor-pointer hover:bg-muted"
                      onClick={() => navigate(`/stocks/${s.id}`)}
                    >
                      {s.ticker}
                    </Badge>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
