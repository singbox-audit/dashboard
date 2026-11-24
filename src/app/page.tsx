"use client";

import React, { useState, useEffect, useRef, useTransition, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import * as echarts from "echarts";
import {
  Activity,
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  ArrowUpDown,
  Clock,
  Database,
  Download,
  Filter,
  Globe2,
  HardDrive,
  Languages,
  Layers,
  Loader2,
  Monitor,
  Moon,
  Network,
  Play,
  RefreshCw,
  Search,
  Server,
  Shield,
  ShieldAlert,
  Square,
  Sun,
  Terminal,
  Upload,
  User,
  Users,
  Wifi,
  Zap,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { translations, Language } from "@/lib/i18n";
import { applyTheme, ThemeMode } from "@/lib/theme";
import { cn } from "cn";

const WorldMap = dynamic(() => import("@/components/WorldMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[440px] w-full items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-950/40 text-slate-500 dark:text-slate-400">
      Loading World Telemetry Map...
    </div>
  ),
});

// Dynamic unit helper: returns the optimal unit and divisor (B, KB, MB, GB, TB)
function getOptimalUnit(maxBytes: number): { unit: string; divisor: number } {
  if (maxBytes >= 1024 * 1024 * 1024 * 1024) return { unit: "TB", divisor: 1024 * 1024 * 1024 * 1024 };
  if (maxBytes >= 1024 * 1024 * 1024) return { unit: "GB", divisor: 1024 * 1024 * 1024 };
  if (maxBytes >= 1024 * 1024) return { unit: "MB", divisor: 1024 * 1024 };
  if (maxBytes >= 1024) return { unit: "KB", divisor: 1024 };
  return { unit: "B", divisor: 1 };
}

// Global bytes formatter with automatic unit scaling (B, KB, MB, GB, TB, PB)
function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  const idx = Math.min(i, sizes.length - 1);
  return parseFloat((bytes / Math.pow(k, idx)).toFixed(2)) + " " + sizes[idx];
}

// Format UTC / ISO timestamp into user's current system local timezone
function formatLocalTime(isoOrUtcString: string | number | Date | null | undefined, includeSeconds = true): string {
  if (!isoOrUtcString) return "-";
  try {
    let s = String(isoOrUtcString).trim();
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s)) {
      s = s.replace(" ", "T") + "Z";
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      return s;
    } else if (!s.endsWith("Z") && !s.includes("+") && !s.includes("-", 10)) {
      s = s + "Z";
    }

    const d = new Date(s);
    if (isNaN(d.getTime())) return String(isoOrUtcString);

    const pad = (n: number) => n.toString().padStart(2, "0");
    const y = d.getFullYear();
    const m = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const h = pad(d.getHours());
    const min = pad(d.getMinutes());
    const sec = pad(d.getSeconds());

    if (includeSeconds) {
      return `${y}-${m}-${day} ${h}:${min}:${sec}`;
    }
    return `${m}-${day} ${h}:${min}`;
  } catch (e) {
    return String(isoOrUtcString);
  }
}

// Generic sort helper
function sortList<T>(list: T[], key: keyof T | string, dir: "asc" | "desc"): T[] {
  return [...list].sort((a: any, b: any) => {
    let va = a[key];
    let vb = b[key];
    if (va === null || va === undefined) return 1;
    if (vb === null || vb === undefined) return -1;
    if (typeof va === "string") va = va.toLowerCase();
    if (typeof vb === "string") vb = vb.toLowerCase();
    if (va < vb) return dir === "asc" ? -1 : 1;
    if (va > vb) return dir === "asc" ? 1 : -1;
    return 0;
  });
}

// Reusable column resizer hook with localStorage persistence
function useResizableColumns(defaultWidths: Record<string, number>, storageKey: string) {
  const [widths, setWidths] = useState<Record<string, number>>(defaultWidths);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setWidths((prev) => ({ ...prev, ...JSON.parse(saved) }));
      }
    } catch (e) {}
  }, [storageKey]);

  const startResize = useCallback(
    (colKey: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startWidth = widths[colKey] || defaultWidths[colKey] || 100;

      const onMouseMove = (moveEvt: MouseEvent) => {
        moveEvt.preventDefault();
        const delta = moveEvt.clientX - startX;
        const newWidth = Math.max(45, startWidth + delta);
        setWidths((prev) => {
          const next = { ...prev, [colKey]: newWidth };
          try {
            localStorage.setItem(storageKey, JSON.stringify(next));
          } catch (err) {}
          return next;
        });
      };

      const onMouseUp = () => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [widths, defaultWidths, storageKey]
  );

  return { widths, startResize };
}

interface ResizableHeaderProps {
  width: number;
  onResize?: (e: React.MouseEvent) => void;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}

function ResizableHeader({
  width,
  onResize,
  onClick,
  children,
  className = "",
}: ResizableHeaderProps) {
  return (
    <TableHead
      style={{ width: `${width}px`, minWidth: `${width}px` }}
      className={cn(
        "relative p-0 h-10 select-none group border-r border-slate-200/60 dark:border-slate-800/60 last:border-r-0",
        className
      )}
    >
      <div
        onClick={onClick}
        className={cn(
          "flex items-center gap-1.5 px-3 py-2 h-full w-full overflow-hidden text-xs font-semibold",
          onClick && "cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors"
        )}
      >
        {children}
      </div>
      {onResize && (
        <div
          onMouseDown={onResize}
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-0 bottom-0 w-3 cursor-col-resize z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
          title="拖动调整列宽 / Drag to resize"
        >
          <div className="w-[2px] h-4 bg-slate-300 dark:bg-slate-600 rounded-full group-hover:bg-emerald-500" />
        </div>
      )}
    </TableHead>
  );
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("overview");

  // Theme state ("auto" | "light" | "dark")
  const [themeMode, setThemeMode] = useState<ThemeMode>("auto");
  const [isDark, setIsDark] = useState<boolean>(true);

  useEffect(() => {
    const saved = (localStorage.getItem("dashboard_theme") as ThemeMode) || "auto";
    setThemeMode(saved);
    const darkActive = applyTheme(saved);
    setIsDark(darkActive);

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleMediaChange = () => {
      const cur = (localStorage.getItem("dashboard_theme") as ThemeMode) || "auto";
      if (cur === "auto") {
        const d = applyTheme("auto");
        setIsDark(d);
      }
    };

    mediaQuery.addEventListener("change", handleMediaChange);
    return () => mediaQuery.removeEventListener("change", handleMediaChange);
  }, []);

  const handleThemeChange = (mode: ThemeMode) => {
    setThemeMode(mode);
    localStorage.setItem("dashboard_theme", mode);
    const darkActive = applyTheme(mode);
    setIsDark(darkActive);
  };

  // Language state (default Chinese, with localStorage persistence)
  const [lang, setLang] = useState<Language>("zh");
  useEffect(() => {
    const saved = localStorage.getItem("dashboard_lang") as Language;
    if (saved && (saved === "zh" || saved === "en")) {
      setLang(saved);
    }
  }, []);

  const handleLangToggle = () => {
    const nextLang = lang === "zh" ? "en" : "zh";
    setLang(nextLang);
    localStorage.setItem("dashboard_lang", nextLang);
  };

  const t = translations[lang];

  // Auto-resize charts on tab switch to prevent blank charts
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 60);
    return () => clearTimeout(timer);
  }, [activeTab]);

  // Global User Filter State
  const [userList, setUserList] = useState<string[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>("");

  // Independent Limit States for individual sections
  const [talkersLimit, setTalkersLimit] = useState<string>("all");
  const [destinationsLimit, setDestinationsLimit] = useState<string>("20");
  const [asnLimit, setAsnLimit] = useState<string>("10");
  const [dnsRecentLimit, setDnsRecentLimit] = useState<string>("50");

  // Table Sorting States
  const [connSortKey, setConnSortKey] = useState<string>("last_time");
  const [connSortDir, setConnSortDir] = useState<"asc" | "desc">("desc");

  const [destSortKey, setDestSortKey] = useState<string>("total_bytes");
  const [destSortDir, setDestSortDir] = useState<"asc" | "desc">("desc");

  const [dailySortKey, setDailySortKey] = useState<string>("day");
  const [dailySortDir, setDailySortDir] = useState<"asc" | "desc">("desc");

  const [dnsSortKey, setDnsSortKey] = useState<string>("event_time");
  const [dnsSortDir, setDnsSortDir] = useState<"asc" | "desc">("desc");

  // Resizable Column Width States with LocalStorage Persistence
  const { widths: connColWidths, startResize: startResizeConn } = useResizableColumns(
    {
      last_time: 150,
      user: 95,
      network: 70,
      domain: 175,   // 目标端点稍稍窄点
      target_ip: 390, // IPLocationASN宽点（一行放下）
      outbound: 90,
      total_bytes: 165,
      duration_sec: 80,
      status: 80,
    },
    "singbox_conn_col_widths"
  );
  const totalConnTableWidth = useMemo(
    () => Object.values(connColWidths).reduce((a, b) => a + b, 0),
    [connColWidths]
  );

  const { widths: destColWidths, startResize: startResizeDest } = useResizableColumns(
    {
      domain: 230,
      country_code: 130,
      target_ips: 160,
      upload_bytes: 110,
      download_bytes: 110,
      total_bytes: 120,
      connections: 90,
    },
    "singbox_dest_col_widths"
  );
  const totalDestTableWidth = useMemo(
    () => Object.values(destColWidths).reduce((a, b) => a + b, 0),
    [destColWidths]
  );

  const { widths: dailyColWidths, startResize: startResizeDaily } = useResizableColumns(
    {
      day: 120,
      user: 110,
      upload_bytes: 120,
      download_bytes: 120,
      total_bytes: 130,
      connections: 90,
    },
    "singbox_daily_col_widths"
  );
  const totalDailyTableWidth = useMemo(
    () => Object.values(dailyColWidths).reduce((a, b) => a + b, 0),
    [dailyColWidths]
  );

  const { widths: dnsColWidths, startResize: startResizeDns } = useResizableColumns(
    {
      event_time: 155,
      user: 100,
      qname: 220,
      qtype_name: 80,
      resolver: 130,
      cache_hit: 90,
      answers: 220,
    },
    "singbox_dns_col_widths"
  );
  const totalDnsTableWidth = useMemo(
    () => Object.values(dnsColWidths).reduce((a, b) => a + b, 0),
    [dnsColWidths]
  );

  // Time Range
  const [timeRange, setTimeRange] = useState<string>("7d");

  // Loading States
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);

  // Data states
  const [summary, setSummary] = useState<any>(null);
  const [talkersData, setTalkersData] = useState<any>({ talkers: [], heatmap: [], daily: [] });
  const [destinationsData, setDestinationsData] = useState<any[]>([]);
  const [geoAsnData, setGeoAsnData] = useState<any>({ world: [], asns: [], cross_border: {} });
  const [dnsData, setDnsData] = useState<any>(null);

  // GeoIP Database Status & Manual Update State
  const [geoipStatus, setGeoipStatus] = useState<any>(null);
  const [updatingGeoIP, setUpdatingGeoIP] = useState(false);

  const fetchGeoIPStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/geoip");
      const d = await res.json();
      if (d.success && d.status) {
        setGeoipStatus(d.status);
      }
    } catch (e) {
      console.error("Failed to fetch GeoIP status:", e);
    }
  }, []);

  const handleManualUpdateGeoIP = async () => {
    if (updatingGeoIP) return;
    setUpdatingGeoIP(true);
    try {
      const res = await fetch("/api/geoip", { method: "POST" });
      const d = await res.json();
      if (d.success && d.status) {
        setGeoipStatus(d.status);
        alert(lang === "zh" ? "GeoIP & ASN 离线库更新成功并已热重载生效！" : "GeoIP & ASN databases updated and reloaded successfully!");
      } else {
        alert((lang === "zh" ? "更新失败: " : "Update failed: ") + (d.message || d.error));
      }
    } catch (e: any) {
      alert((lang === "zh" ? "更新请求异常: " : "Update error: ") + e.message);
    } finally {
      setUpdatingGeoIP(false);
      fetchGeoAsn();
    }
  };

  // Connections Stream & Lazy Loading State
  const [connections, setConnections] = useState<any[]>([]);
  const [totalConns, setTotalConns] = useState<number>(0);
  const [connSearch, setConnSearch] = useState("");
  const [connNetwork, setConnNetwork] = useState("");
  const [connStatus, setConnStatus] = useState("");
  const [loadingConns, setLoadingConns] = useState(false);
  const [streamingAll, setStreamingAll] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [selectedConn, setSelectedConn] = useState<any>(null);

  const streamingRef = useRef(false);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);

  // Servers State
  const [servers, setServers] = useState<any[]>([]);
  const [showAddServer, setShowAddServer] = useState(false);
  const [syncingServerId, setSyncingServerId] = useState<string | null>(null);
  const [newServerForm, setNewServerForm] = useState({
    name: "",
    host: "",
    port: 22,
    username: "root",
    auth_type: "key",
    private_key: "/root/.ssh/id_ed25519",
    password: "",
    remote_path: "/opt/singbox/audit",
    auto_sync: true,
    remove_source: false,
  });

  // SQL Studio State
  const [sqlQuery, setSqlQuery] = useState("SELECT auth_user, count() AS conns, sum(total_bytes) AS bytes FROM audit.v_connections GROUP BY auth_user ORDER BY bytes DESC");
  const [sqlResult, setSqlResult] = useState<any>(null);
  const [sqlLoading, setSqlLoading] = useState(false);

  // Chart refs
  const timelineChartRef = useRef<HTMLDivElement>(null);
  const protoChartRef = useRef<HTMLDivElement>(null);
  const portChartRef = useRef<HTMLDivElement>(null);
  const asnChartRef = useRef<HTMLDivElement>(null);
  const dnsQtypeChartRef = useRef<HTMLDivElement>(null);

  // Fetch Users & GeoIP Status once on mount
  useEffect(() => {
    fetch("/api/users")
      .then((res) => res.json())
      .then((d) => {
        if (d.users) setUserList(d.users);
      })
      .catch((err) => console.error("Error fetching users:", err));
    fetchGeoIPStatus();
  }, [fetchGeoIPStatus]);

  // Fetch Overview Summary
  const fetchSummary = useCallback(async () => {
    const userParam = selectedUser ? `&user=${encodeURIComponent(selectedUser)}` : "";
    const rangeParam = `&range=${timeRange}`;
    try {
      const res = await fetch(`/api/analytics/summary?dummy=1${userParam}${rangeParam}`);
      const data = await res.json();
      setSummary(data);
    } catch (err) {
      console.error("Error fetching summary:", err);
    }
  }, [selectedUser, timeRange]);

  // Fetch Talkers (Independently bound to talkersLimit)
  const fetchTalkers = useCallback(async () => {
    const userParam = selectedUser ? `&user=${encodeURIComponent(selectedUser)}` : "";
    const limitParam = `&limit=${talkersLimit}`;
    try {
      const res = await fetch(`/api/analytics/top-talkers?dummy=1${userParam}${limitParam}`);
      const data = await res.json();
      setTalkersData(data);
    } catch (err) {
      console.error("Error fetching talkers:", err);
    }
  }, [selectedUser, talkersLimit]);

  // Fetch Destinations (Independently bound to destinationsLimit)
  const fetchDestinations = useCallback(async () => {
    const userParam = selectedUser ? `&user=${encodeURIComponent(selectedUser)}` : "";
    const limitParam = `&limit=${destinationsLimit}`;
    try {
      const res = await fetch(`/api/analytics/top-destinations?dummy=1${userParam}${limitParam}`);
      const data = await res.json();
      setDestinationsData(data.destinations || []);
    } catch (err) {
      console.error("Error fetching destinations:", err);
    }
  }, [selectedUser, destinationsLimit]);

  // Fetch Geo & ASN (Independently bound to asnLimit)
  const fetchGeoAsn = useCallback(async () => {
    const userParam = selectedUser ? `&user=${encodeURIComponent(selectedUser)}` : "";
    const limitParam = `&limit=${asnLimit}`;
    try {
      const res = await fetch(`/api/analytics/geo-asn?dummy=1${userParam}${limitParam}`);
      const data = await res.json();
      setGeoAsnData(data);
    } catch (err) {
      console.error("Error fetching geo-asn:", err);
    }
  }, [selectedUser, asnLimit]);

  // Fetch DNS Telemetry (Independently bound to dnsRecentLimit)
  const fetchDns = useCallback(async () => {
    const userParam = selectedUser ? `&user=${encodeURIComponent(selectedUser)}` : "";
    const rangeParam = `&range=${timeRange}`;
    const limitParam = `&limit=${dnsRecentLimit}`;
    try {
      const res = await fetch(`/api/analytics/dns?dummy=1${userParam}${rangeParam}${limitParam}`);
      const data = await res.json();
      setDnsData(data);
    } catch (err) {
      console.error("Error fetching DNS:", err);
    }
  }, [selectedUser, timeRange, dnsRecentLimit]);

  // Fetch Servers
  const fetchServers = useCallback(async () => {
    try {
      const res = await fetch("/api/servers");
      const data = await res.json();
      setServers(data.servers || []);
    } catch (err) {
      console.error("Failed to load servers:", err);
    }
  }, []);

  // Master Refresh
  const handleRefreshAll = async () => {
    setLoading(true);
    await Promise.all([
      fetchSummary(),
      fetchTalkers(),
      fetchDestinations(),
      fetchGeoAsn(),
      fetchDns(),
      fetchServers(),
    ]);
    setLoading(false);
  };

  useEffect(() => {
    startTransition(() => {
      fetchSummary();
      fetchTalkers();
      fetchDestinations();
      fetchGeoAsn();
      fetchDns();
      fetchServers();
    });
  }, [fetchSummary, fetchTalkers, fetchDestinations, fetchGeoAsn, fetchDns, fetchServers]);

  // Load Connections Chunk
  const loadConnectionsChunk = useCallback(async (offset: number, limit = 50, isAppend = false) => {
    setLoadingConns(true);
    const userParam = selectedUser ? `&user=${encodeURIComponent(selectedUser)}` : "";
    const qParam = connSearch ? `&query=${encodeURIComponent(connSearch)}` : "";
    const netParam = connNetwork ? `&network=${encodeURIComponent(connNetwork)}` : "";
    const statusParam = connStatus ? `&status=${encodeURIComponent(connStatus)}` : "";

    try {
      const res = await fetch(`/api/connections?limit=${limit}&offset=${offset}${userParam}${qParam}${netParam}${statusParam}`);
      const data = await res.json();
      setTotalConns(data.total || 0);
      if (isAppend) {
        setConnections((prev) => [...prev, ...(data.connections || [])]);
      } else {
        setConnections(data.connections || []);
      }
      return data;
    } catch (err) {
      console.error("Error loading connections:", err);
      return null;
    } finally {
      setLoadingConns(false);
    }
  }, [selectedUser, connSearch, connNetwork, connStatus]);

  // Initial load / Filter reset for Connections
  useEffect(() => {
    streamingRef.current = false;
    setStreamingAll(false);
    loadConnectionsChunk(0, 50, false);
  }, [loadConnectionsChunk]);

  // Stream Load All connections in consecutive chunks
  const handleToggleStreamAll = async () => {
    if (streamingAll) {
      streamingRef.current = false;
      setStreamingAll(false);
      return;
    }

    streamingRef.current = true;
    setStreamingAll(true);

    let currentOffset = connections.length;
    const chunkSize = 100;

    while (streamingRef.current && currentOffset < totalConns) {
      const data = await loadConnectionsChunk(currentOffset, chunkSize, true);
      if (!data || !data.connections || data.connections.length === 0) {
        break;
      }
      currentOffset += data.connections.length;
      await new Promise((r) => setTimeout(r, 60));
    }

    streamingRef.current = false;
    setStreamingAll(false);
  };

  // Robust window scroll listener + IntersectionObserver for reliable infinite scroll without requiring re-checking
  useEffect(() => {
    if (activeTab !== "connections" || !autoScroll) return;

    const checkAndLoadMore = () => {
      if (loadingConns || streamingRef.current || connections.length >= totalConns) return;
      const scrollHeight = document.documentElement.scrollHeight;
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const clientHeight = window.innerHeight || document.documentElement.clientHeight;

      if (scrollTop + clientHeight >= scrollHeight - 350) {
        loadConnectionsChunk(connections.length, 50, true);
      }
    };

    window.addEventListener("scroll", checkAndLoadMore, { passive: true });
    checkAndLoadMore();

    const sentinel = bottomSentinelRef.current;
    let observer: IntersectionObserver | null = null;
    if (sentinel) {
      observer = new IntersectionObserver(
        (entries) => {
          const first = entries[0];
          if (first.isIntersecting && connections.length < totalConns && !loadingConns && !streamingRef.current) {
            loadConnectionsChunk(connections.length, 50, true);
          }
        },
        { rootMargin: "250px" }
      );
      observer.observe(sentinel);
    }

    return () => {
      window.removeEventListener("scroll", checkAndLoadMore);
      if (observer) observer.disconnect();
    };
  }, [activeTab, autoScroll, loadingConns, connections.length, totalConns, loadConnectionsChunk]);

  // ECharts: Throughput Timeline with Auto Unit (KB, MB, GB, TB) and Total Traffic Line
  // DEPENDS ON activeTab TO PREVENT BLANK SCREEN ON RETURNING TO OVERVIEW
  useEffect(() => {
    if (activeTab !== "overview" || !summary?.timeline || !timelineChartRef.current) return;
    const chart = echarts.init(timelineChartRef.current, isDark ? "dark" : undefined);
    
    // Calculate optimal dynamic unit based on maximum volume across all timeline buckets
    const maxTimelineBytes = Math.max(
      ...summary.timeline.map((r: any) => (r.upload_bytes || 0) + (r.download_bytes || 0)),
      1024
    );
    const { unit, divisor } = getOptimalUnit(maxTimelineBytes);

    // Format time axis into current system local timezone
    const times = summary.timeline.map((r: any) => formatLocalTime(r.time, false));
    const upData = summary.timeline.map((r: any) => ((r.upload_bytes || 0) / divisor).toFixed(2));
    const downData = summary.timeline.map((r: any) => ((r.download_bytes || 0) / divisor).toFixed(2));
    const totalData = summary.timeline.map((r: any) => (((r.upload_bytes || 0) + (r.download_bytes || 0)) / divisor).toFixed(2));

    const option: echarts.EChartsOption = {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: isDark ? "rgba(15, 23, 42, 0.95)" : "rgba(255, 255, 255, 0.97)",
        borderColor: isDark ? "#334155" : "#e2e8f0",
        borderWidth: 1,
        textStyle: { color: isDark ? "#f8fafc" : "#0f172a" },
        shadowBlur: 8,
        shadowColor: isDark ? "rgba(0, 0, 0, 0.5)" : "rgba(0, 0, 0, 0.08)",
        formatter: (params: any) => {
          let s = `<div class="font-bold text-xs mb-1 ${isDark ? "text-slate-300" : "text-slate-700"}">${params[0]?.axisValue}</div>`;
          params.forEach((p: any) => {
            s += `<div class="flex items-center gap-2 text-xs">
                    <span style="color:${p.color}">●</span>
                    <span class="${isDark ? "text-slate-300" : "text-slate-600"}">${p.seriesName}:</span>
                    <b class="${isDark ? "text-white" : "text-slate-900"}">${p.value} ${unit}</b>
                  </div>`;
          });
          return s;
        },
      },
      legend: {
        data: [t.totalTrafficSeries, t.ingressDown, t.egressUp],
        textStyle: { color: isDark ? "#94a3b8" : "#64748b" },
        top: 0,
      },
      grid: { left: "3%", right: "4%", bottom: "3%", top: "15%", containLabel: true },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: times,
        axisLine: { lineStyle: { color: isDark ? "#334155" : "#e2e8f0" } },
        axisLabel: { color: isDark ? "#64748b" : "#94a3b8", fontSize: 11 },
      },
      yAxis: {
        type: "value",
        name: `${t.trafficUnit} (${unit})`,
        nameTextStyle: { color: isDark ? "#64748b" : "#94a3b8", fontSize: 11 },
        splitLine: { lineStyle: { color: isDark ? "#1e293b" : "#f1f5f9", type: "dashed" } },
        axisLabel: { color: isDark ? "#64748b" : "#94a3b8" },
      },
      series: [
        {
          name: t.totalTrafficSeries,
          type: "line",
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2.5, color: "#8b5cf6" }, // Purple/Violet for Total Traffic
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: "rgba(139, 92, 246, 0.25)" },
              { offset: 1, color: "rgba(139, 92, 246, 0.0)" },
            ]),
          },
          data: totalData,
        },
        {
          name: t.ingressDown,
          type: "line",
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2, color: "#10b981" }, // Emerald for Ingress
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: "rgba(16, 185, 129, 0.35)" },
              { offset: 1, color: "rgba(16, 185, 129, 0.0)" },
            ]),
          },
          data: downData,
        },
        {
          name: t.egressUp,
          type: "line",
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2, color: "#0ea5e9" }, // Sky for Egress
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: "rgba(14, 165, 233, 0.35)" },
              { offset: 1, color: "rgba(14, 165, 233, 0.0)" },
            ]),
          },
          data: upData,
        },
      ],
    };

    chart.setOption(option);
    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      chart.dispose();
    };
  }, [summary, t, isDark, activeTab]);

  // ECharts: Protocol & Ports Donut with Logarithmic scale and Explicit Percentages
  // DEPENDS ON activeTab TO PREVENT BLANK SCREEN ON RETURNING TO OVERVIEW
  useEffect(() => {
    if (activeTab !== "overview" || !summary?.protocols || !protoChartRef.current) return;
    const protoChart = echarts.init(protoChartRef.current, isDark ? "dark" : undefined);
    
    const totalProtoBytes = summary.protocols.reduce((acc: number, p: any) => acc + (p.total_bytes || 0), 0) || 1;
    const protoData = summary.protocols.map((p: any) => {
      const bytes = Number(p.total_bytes || 0);
      // Logarithmic scaling for angle so small protocols aren't invisible
      const logVal = bytes > 0 ? parseFloat(Math.log10(bytes + 1).toFixed(2)) : 0.1;
      const realPct = ((bytes / totalProtoBytes) * 100).toFixed(1);
      return {
        name: p.network.toUpperCase(),
        value: logVal,
        real_bytes: bytes,
        real_percent: realPct,
      };
    });

    protoChart.setOption({
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        formatter: (p: any) => {
          const d = p.data;
          return `
            <div class="p-1 text-xs">
              <div class="font-bold mb-1">${p.name}</div>
              <div>${lang === "zh" ? "实际流量:" : "Volume:"} <b>${formatBytes(d.real_bytes)}</b></div>
              <div>${lang === "zh" ? "占比比例:" : "Percentage:"} <b class="text-emerald-500">${d.real_percent}%</b></div>
              <div class="text-[10px] text-slate-400 mt-0.5">${lang === "zh" ? "(对数比例展示)" : "(Log Scaled Display)"}</div>
            </div>
          `;
        },
      },
      series: [
        {
          type: "pie",
          radius: ["42%", "68%"],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 6, borderColor: isDark ? "#0f172a" : "#ffffff", borderWidth: 2 },
          label: {
            show: true,
            position: "outside",
            formatter: (p: any) => `${p.name}\n${p.data.real_percent}%`,
            color: isDark ? "#94a3b8" : "#64748b",
            fontSize: 11,
          },
          data: protoData,
        },
      ],
    });

    let portChart: echarts.ECharts | null = null;
    if (summary?.ports && portChartRef.current) {
      portChart = echarts.init(portChartRef.current, isDark ? "dark" : undefined);
      const totalPortBytes = summary.ports.reduce((acc: number, p: any) => acc + (p.total_bytes || 0), 0) || 1;
      const portData = summary.ports.map((p: any) => {
        const bytes = Number(p.total_bytes || 0);
        // Logarithmic radius scaling so all ports are visible and interactive
        const logVal = bytes > 0 ? parseFloat(Math.log10(bytes + 1).toFixed(2)) : 0.1;
        const realPct = ((bytes / totalPortBytes) * 100).toFixed(1);
        return {
          name: `Port ${p.port}`,
          value: logVal,
          real_bytes: bytes,
          real_percent: realPct,
        };
      });

      portChart.setOption({
        backgroundColor: "transparent",
        tooltip: {
          trigger: "item",
          formatter: (p: any) => {
            const d = p.data;
            return `
              <div class="p-1 text-xs">
                <div class="font-bold mb-1">${p.name}</div>
                <div>${lang === "zh" ? "实际流量:" : "Volume:"} <b>${formatBytes(d.real_bytes)}</b></div>
                <div>${lang === "zh" ? "占比比例:" : "Percentage:"} <b class="text-emerald-500">${d.real_percent}%</b></div>
                <div class="text-[10px] text-slate-400 mt-0.5">${lang === "zh" ? "(对数半径展示)" : "(Log Scaled Display)"}</div>
              </div>
            `;
          },
        },
        series: [
          {
            type: "pie",
            roseType: "radius",
            radius: ["20%", "72%"],
            itemStyle: { borderRadius: 4, borderColor: isDark ? "#0f172a" : "#ffffff", borderWidth: 1 },
            label: {
              show: true,
              formatter: (p: any) => `${p.name}\n${p.data.real_percent}%`,
              fontSize: 10,
              color: isDark ? "#94a3b8" : "#64748b",
            },
            data: portData,
          },
        ],
      });
    }

    const handleResize = () => {
      protoChart.resize();
      if (portChart) portChart.resize();
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      protoChart.dispose();
      if (portChart) portChart.dispose();
    };
  }, [summary, isDark, lang, activeTab]);

  // ECharts: Top ASNs Chart (Depends on activeTab to prevent blank chart)
  useEffect(() => {
    if (activeTab !== "destinations" || !geoAsnData?.asns || !asnChartRef.current) return;
    const chart = echarts.init(asnChartRef.current, isDark ? "dark" : undefined);
    const asns = [...geoAsnData.asns].reverse();
    chart.setOption({
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: isDark ? "rgba(15, 23, 42, 0.95)" : "rgba(255, 255, 255, 0.97)",
        borderColor: isDark ? "#334155" : "#e2e8f0",
        borderWidth: 1,
        textStyle: { color: isDark ? "#f8fafc" : "#0f172a" },
        formatter: (params: any) => {
          const item = asns[params[0].dataIndex];
          return `
            <div class="text-xs p-1">
              <div class="font-bold ${isDark ? "text-sky-400" : "text-sky-600"}">AS${item.asn_number} (${item.asn_org})</div>
              <div>${lang === "zh" ? "总流量:" : "Total:"} <b>${formatBytes(item.total_bytes)}</b></div>
              <div>${lang === "zh" ? "会话数:" : "Sessions:"} <b>${item.connections}</b></div>
            </div>
          `;
        },
      },
      grid: { left: "3%", right: "6%", bottom: "3%", top: "5%", containLabel: true },
      xAxis: {
        type: "value",
        splitLine: { lineStyle: { color: isDark ? "#1e293b" : "#f1f5f9", type: "dashed" } },
        axisLabel: {
          formatter: (v: number) => formatBytes(v),
          color: isDark ? "#64748b" : "#94a3b8",
          fontSize: 10,
        },
      },
      yAxis: {
        type: "category",
        data: asns.map((a: any) => `AS${a.asn_number} ${a.asn_org.slice(0, 16)}`),
        axisLabel: { color: isDark ? "#94a3b8" : "#475569", fontSize: 11 },
        axisLine: { lineStyle: { color: isDark ? "#334155" : "#e2e8f0" } },
      },
      series: [
        {
          type: "bar",
          data: asns.map((a: any) => a.total_bytes),
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: "#10b981" },
              { offset: 1, color: "#38bdf8" },
            ]),
            borderRadius: [0, 4, 4, 0],
          },
        },
      ],
    });

    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      chart.dispose();
    };
  }, [geoAsnData, lang, isDark, activeTab]);

  // ECharts: DNS QType breakdown with Percentages (Depends on activeTab to prevent blank chart)
  useEffect(() => {
    if (activeTab !== "dns" || !dnsData?.qtypes || !dnsQtypeChartRef.current) return;
    const chart = echarts.init(dnsQtypeChartRef.current, isDark ? "dark" : undefined);
    chart.setOption({
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        formatter: "{b}: {c} ({d}%)",
      },
      series: [
        {
          type: "pie",
          radius: ["40%", "70%"],
          itemStyle: { borderRadius: 4, borderColor: isDark ? "#0f172a" : "#ffffff", borderWidth: 2 },
          label: {
            show: true,
            formatter: "{b}: {d}%",
            fontSize: 11,
            color: isDark ? "#94a3b8" : "#64748b",
          },
          data: dnsData.qtypes.map((q: any) => ({
            name: q.name,
            value: q.count,
          })),
        },
      ],
    });

    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      chart.dispose();
    };
  }, [dnsData, isDark, activeTab]);

  // Trigger SSH Sync
  const handleSyncServer = async (serverId: string) => {
    setSyncingServerId(serverId);
    try {
      const res = await fetch("/api/servers/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server_id: serverId }),
      });
      const data = await res.json();
      alert(data.message || (data.success ? "Sync completed!" : "Sync failed"));
      handleRefreshAll();
    } catch (err: any) {
      alert("Sync error: " + err.message);
    } finally {
      setSyncingServerId(null);
    }
  };

  // Add Server Form Submit
  const handleAddServer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newServerForm),
      });
      if (res.ok) {
        setShowAddServer(false);
        fetchServers();
      } else {
        const err = await res.json();
        alert("Failed to add server: " + err.error);
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  // Run SQL in Studio
  const handleRunSql = async () => {
    setSqlLoading(true);
    try {
      const res = await fetch("/api/sql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: sqlQuery }),
      });
      const data = await res.json();
      setSqlResult(data);
    } catch (err: any) {
      alert("SQL execution failed: " + err.message);
    } finally {
      setSqlLoading(false);
    }
  };

  // Export Table to CSV
  const exportConnectionsCSV = () => {
    if (!connections || connections.length === 0) return;
    const headers = [t.colTime, t.colUser, t.colProtocol, t.colTargetEndpoint, "Target IP", "Country Code", "Country Name", "ASN Number", "ASN Org", "Port", t.colRoute, t.colUpload, t.colDownload, t.colTotalTraffic, t.colStatus];
    const rows = connections.map((c: any) => [
      formatLocalTime(c.last_time),
      c.user,
      c.network,
      c.domain,
      c.target_ip,
      c.country_code || "",
      c.country_name || "",
      c.asn_number || 0,
      c.asn_org || "",
      c.port,
      c.outbound,
      c.upload_bytes,
      c.download_bytes,
      c.total_bytes,
      c.status,
    ]);
    const csvContent = [headers.join(","), ...rows.map((r: any) => r.map((f: any) => `"${f || ""}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `connections-audit-${Date.now()}.csv`;
    a.click();
  };

  // Interactive sorting handlers
  const handleSortConn = (key: string) => {
    if (connSortKey === key) {
      setConnSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setConnSortKey(key);
      setConnSortDir("desc");
    }
  };

  const handleSortDest = (key: string) => {
    if (destSortKey === key) {
      setDestSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setDestSortKey(key);
      setDestSortDir("desc");
    }
  };

  const handleSortDaily = (key: string) => {
    if (dailySortKey === key) {
      setDailySortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setDailySortKey(key);
      setDailySortDir("desc");
    }
  };

  const handleSortDns = (key: string) => {
    if (dnsSortKey === key) {
      setDnsSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setDnsSortKey(key);
      setDnsSortDir("desc");
    }
  };

  // Sorted views
  const sortedConnections = useMemo(() => sortList(connections, connSortKey, connSortDir), [connections, connSortKey, connSortDir]);
  const sortedDestinations = useMemo(() => sortList(destinationsData, destSortKey, destSortDir), [destinationsData, destSortKey, destSortDir]);
  const sortedDaily = useMemo(() => sortList(talkersData?.daily || [], dailySortKey, dailySortDir), [talkersData?.daily, dailySortKey, dailySortDir]);
  const sortedDns = useMemo(() => sortList(dnsData?.recent || [], dnsSortKey, dnsSortDir), [dnsData?.recent, dnsSortKey, dnsSortDir]);

  // Sort indicator renderer
  const renderSortIcon = (currentKey: string, activeKey: string, activeDir: "asc" | "desc") => {
    if (currentKey !== activeKey) {
      return <ArrowUpDown className="h-3 w-3 inline ml-1 opacity-30 group-hover:opacity-70 transition-opacity" />;
    }
    return activeDir === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5 inline ml-1 text-emerald-500 font-bold" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 inline ml-1 text-emerald-500 font-bold" />
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0c1017] text-slate-900 dark:text-slate-100 flex flex-col selection:bg-emerald-500/30 transition-colors duration-200">
      {/* Top Header */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-[#0c1017]/80 backdrop-blur-md px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 transition-colors">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-600 to-sky-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-slate-900 via-slate-700 to-slate-500 dark:from-white dark:via-slate-200 dark:to-slate-400 bg-clip-text text-transparent">
                {t.title}
              </span>
              <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-mono px-1.5 py-0">
                ClickHouse OLAP
              </Badge>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{t.subtitle}</p>
          </div>
        </div>

        {/* Global Toolbar Controls (User Scope, Time Range, Theme, i18n, Refresh) */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Global User Scope Filter */}
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 px-2.5 py-1.5 shadow-xs">
            <User className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t.userLabel}</span>
            <Select value={selectedUser || "ALL"} onValueChange={(val) => setSelectedUser(val === "ALL" || !val ? "" : val)}>
              <SelectTrigger className="h-7 border-0 bg-transparent text-xs font-semibold focus:ring-0 p-0 text-slate-900 dark:text-white min-w-[110px]">
                <SelectValue placeholder={t.allUsers} />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-200 shadow-md">
                <SelectItem value="ALL" className="font-medium text-emerald-600 dark:text-emerald-400">
                  {t.allUsers}
                </SelectItem>
                {userList.map((u) => (
                  <SelectItem key={u} value={u}>
                    👤 {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Time Range Selector */}
          <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/80 p-0.5 shadow-xs">
            {[
              { id: "24h", label: t.timeRange24h },
              { id: "7d", label: t.timeRange7d },
              { id: "30d", label: t.timeRange30d },
            ].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setTimeRange(id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                  timeRange === id
                    ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Theme Mode Switcher */}
          <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/80 p-0.5 shadow-xs">
            <button
              onClick={() => handleThemeChange("auto")}
              title={t.themeAuto}
              className={`p-1.5 rounded-md transition-all ${
                themeMode === "auto"
                  ? "bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs"
                  : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
            >
              <Monitor className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => handleThemeChange("light")}
              title={t.themeLight}
              className={`p-1.5 rounded-md transition-all ${
                themeMode === "light"
                  ? "bg-white dark:bg-slate-800 text-amber-500 shadow-xs"
                  : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
            >
              <Sun className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => handleThemeChange("dark")}
              title={t.themeDark}
              className={`p-1.5 rounded-md transition-all ${
                themeMode === "dark"
                  ? "bg-white dark:bg-slate-800 text-indigo-500 dark:text-indigo-400 shadow-xs"
                  : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
            >
              <Moon className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Language Switcher Toggle */}
          <Button
            size="sm"
            variant="outline"
            className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-emerald-600 dark:text-emerald-400 font-medium h-9 gap-1.5 shadow-xs"
            onClick={handleLangToggle}
          >
            <Languages className="h-4 w-4" />
            {t.langToggle}
          </Button>

          {/* Refresh Button */}
          <Button
            size="sm"
            variant="outline"
            className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 h-9 shadow-xs"
            onClick={handleRefreshAll}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin text-emerald-500" : ""}`} />
            {t.refresh}
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-6 max-w-[1720px] w-full mx-auto space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-slate-200/70 dark:bg-slate-900/90 border border-slate-300/70 dark:border-slate-800/80 p-1 rounded-xl flex flex-wrap gap-1 shadow-xs">
            <TabsTrigger value="overview" className="gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-slate-900 dark:data-[state=active]:text-white data-[state=active]:shadow-xs text-slate-600 dark:text-slate-400 font-medium">
              <Activity className="h-4 w-4 text-emerald-500" /> {t.tabOverview}
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-slate-900 dark:data-[state=active]:text-white data-[state=active]:shadow-xs text-slate-600 dark:text-slate-400 font-medium">
              <Users className="h-4 w-4 text-amber-500" /> {t.tabUsers}
            </TabsTrigger>
            <TabsTrigger value="destinations" className="gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-slate-900 dark:data-[state=active]:text-white data-[state=active]:shadow-xs text-slate-600 dark:text-slate-400 font-medium">
              <Globe2 className="h-4 w-4 text-sky-500" /> {t.tabDestinations}
            </TabsTrigger>
            <TabsTrigger value="dns" className="gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-slate-900 dark:data-[state=active]:text-white data-[state=active]:shadow-xs text-slate-600 dark:text-slate-400 font-medium">
              <Network className="h-4 w-4 text-purple-500" /> {t.tabDns}
            </TabsTrigger>
            <TabsTrigger value="connections" className="gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-slate-900 dark:data-[state=active]:text-white data-[state=active]:shadow-xs text-slate-600 dark:text-slate-400 font-medium">
              <Layers className="h-4 w-4 text-teal-500" /> {t.tabConnections}
            </TabsTrigger>
            <TabsTrigger value="servers" className="gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-slate-900 dark:data-[state=active]:text-white data-[state=active]:shadow-xs text-slate-600 dark:text-slate-400 font-medium">
              <Server className="h-4 w-4 text-indigo-500" /> {t.tabServers}
            </TabsTrigger>
            <TabsTrigger value="sql" className="gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-slate-900 dark:data-[state=active]:text-white data-[state=active]:shadow-xs text-slate-600 dark:text-slate-400 font-medium">
              <Terminal className="h-4 w-4 text-emerald-500" /> {t.tabSql}
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: OVERVIEW */}
          <TabsContent value="overview" className="space-y-6">
            {/* Offline Forensic KPI Cards (Symmetric 3 columns) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/40 backdrop-blur-sm shadow-xs">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t.kpiTotalThroughput}</CardTitle>
                  <ArrowDownUp className="h-4 w-4 text-sky-500 dark:text-sky-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                    {formatBytes((summary?.kpi?.total_upload_bytes || 0) + (summary?.kpi?.total_download_bytes || 0))}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
                    <span className="text-emerald-600 dark:text-emerald-400">↑ {formatBytes(summary?.kpi?.total_upload_bytes || 0)}</span>
                    <span className="text-sky-600 dark:text-sky-400">↓ {formatBytes(summary?.kpi?.total_download_bytes || 0)}</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/40 backdrop-blur-sm shadow-xs">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t.kpiTotalSessions}</CardTitle>
                  <Database className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                    {(summary?.kpi?.total_connections || 0).toLocaleString()}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {t.kpiToday} <b className="text-emerald-600 dark:text-emerald-400">{(summary?.kpi?.today_connections || 0).toLocaleString()}</b>
                  </p>
                </CardContent>
              </Card>

              <Card className="border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/40 backdrop-blur-sm shadow-xs">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t.kpiEntities}</CardTitle>
                  <Users className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{summary?.kpi?.total_users || 0}</div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {t.kpiScope} <span className="text-amber-600 dark:text-amber-300 font-semibold">{selectedUser || (lang === "zh" ? "全部账号" : "All Accounts")}</span>
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Throughput Area Timeline with Dynamic Unit & Total Traffic Line */}
            <Card className="border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/40 backdrop-blur-sm shadow-xs">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Zap className="h-4 w-4 text-emerald-500" />
                    {t.bandwidthDynamics}
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                    {t.bandwidthDesc}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <div ref={timelineChartRef} className="h-[320px] w-full" />
              </CardContent>
            </Card>

            {/* Protocols, Ports, and Outbounds Distribution with Logarithmic Scaling & Percentages */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/40 shadow-xs">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-slate-900 dark:text-white">{t.protoDist}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div ref={protoChartRef} className="h-[230px] w-full" />
                </CardContent>
              </Card>

              <Card className="border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/40 shadow-xs">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-slate-900 dark:text-white">{t.portDist}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div ref={portChartRef} className="h-[230px] w-full" />
                </CardContent>
              </Card>

              <Card className="border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/40 shadow-xs">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-slate-900 dark:text-white">{t.outboundChains}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 pt-2">
                    {summary?.outbounds?.map((o: any) => {
                      const totalOutbound = summary?.kpi?.total_upload_bytes + summary?.kpi?.total_download_bytes || 1;
                      const pct = Math.round((o.total_bytes / totalOutbound) * 100);
                      return (
                        <div key={o.outbound} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="font-mono text-slate-700 dark:text-slate-300">{o.outbound}</span>
                            <span className="text-slate-500 dark:text-slate-400 font-semibold">
                              {formatBytes(o.total_bytes)} <span className="text-emerald-500 font-bold ml-1">({pct}%)</span>
                            </span>
                          </div>
                          <Progress
                            value={pct}
                            className="h-1.5 bg-slate-100 dark:bg-slate-800"
                          />
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* TAB 2: USERS & BEHAVIOR */}
          <TabsContent value="users" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Top Talkers List with Independent Limit & "All" Option */}
              <Card className="border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/40 lg:col-span-2 shadow-xs">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div>
                    <CardTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Users className="h-4 w-4 text-amber-500" />
                      {t.topTalkersTitle}
                      <span className="text-xs font-normal text-emerald-600 dark:text-emerald-400 ml-1">
                        ({talkersLimit === "all" ? t.showAll : `Top ${talkersLimit}`})
                      </span>
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                      {t.topTalkersDesc}
                    </CardDescription>
                  </div>

                  {/* Independent Limit Selector for Talkers */}
                  <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2 py-1 rounded-lg text-xs">
                    <span className="text-slate-500 dark:text-slate-400 text-[11px]">{t.showCount}</span>
                    <Select value={talkersLimit} onValueChange={(val) => setTalkersLimit(val || "all")}>
                      <SelectTrigger className="h-6 border-0 bg-transparent text-xs font-semibold focus:ring-0 p-0 text-emerald-600 dark:text-emerald-400 min-w-[55px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-md">
                        <SelectItem value="5">Top 5</SelectItem>
                        <SelectItem value="10">Top 10</SelectItem>
                        <SelectItem value="20">Top 20</SelectItem>
                        <SelectItem value="50">Top 50</SelectItem>
                        <SelectItem value="all" className="font-semibold text-emerald-600 dark:text-emerald-400">
                          {t.showAll}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 pt-2">
                    {talkersData?.talkers?.map((talker: any, idx: number) => {
                      const maxBytes = talkersData.talkers[0]?.total_bytes || 1;
                      const pct = Math.round((talker.total_bytes / maxBytes) * 100);
                      return (
                        <div
                          key={talker.user}
                          onClick={() => setSelectedUser(talker.user)}
                          className="p-3 rounded-lg border border-slate-200/80 dark:border-slate-800/60 bg-slate-50/70 dark:bg-slate-900/60 hover:border-emerald-500/50 hover:bg-slate-100/80 dark:hover:bg-slate-800/40 transition-all cursor-pointer space-y-2 shadow-2xs"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <span className="h-6 w-6 rounded-md bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-bold text-xs text-slate-600 dark:text-slate-400">
                                #{idx + 1}
                              </span>
                              <span className="font-semibold text-sm text-slate-900 dark:text-white">{talker.user}</span>
                              {talker.exfiltration_alert && (
                                <Badge variant="destructive" className="text-[10px] gap-1 px-1.5 py-0 bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                                  <ShieldAlert className="h-3 w-3" /> {t.highEgressAlert}
                                </Badge>
                              )}
                            </div>
                            <div className="text-right">
                              <span className="font-bold text-sm text-emerald-600 dark:text-emerald-400">{formatBytes(talker.total_bytes)}</span>
                              <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">({talker.connections.toLocaleString()} {t.sessionsCount})</span>
                            </div>
                          </div>
                          <Progress value={pct} className="h-2 bg-slate-200 dark:bg-slate-800" />
                          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-mono">
                            <span>
                              <span className="text-emerald-600 dark:text-emerald-400">↑ {formatBytes(talker.upload_bytes)}</span>
                              <span className="mx-1">·</span>
                              <span className="text-sky-600 dark:text-sky-400">↓ {formatBytes(talker.download_bytes)}</span>
                            </span>
                            <span>{t.ratioUpDown} <b className={talker.up_down_ratio > 1.5 ? "text-rose-600 dark:text-rose-400" : "text-slate-700 dark:text-slate-300"}>{talker.up_down_ratio}x</b></span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* User Profile Quick Info */}
              <Card className="border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/40 shadow-xs">
                <CardHeader>
                  <CardTitle className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Shield className="h-4 w-4 text-emerald-500" />
                    {t.policyTitle}
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                    {t.policyDesc} {selectedUser || t.allUsers}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-xs">
                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 space-y-2">
                    <div className="text-slate-500 dark:text-slate-400 font-medium">{t.policyNoticeTitle}</div>
                    <ul className="list-disc list-inside space-y-1 text-slate-700 dark:text-slate-300">
                      <li>{t.policyRule1}</li>
                      <li>{t.policyRule2}</li>
                      <li>{t.policyRule3}</li>
                    </ul>
                  </div>

                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 space-y-2">
                    <div className="font-semibold text-slate-700 dark:text-slate-300">{t.filterShortcut}</div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        variant={selectedUser === "" ? "default" : "outline"}
                        className="h-6 text-xs px-2"
                        onClick={() => setSelectedUser("")}
                      >
                        {lang === "zh" ? "全部" : "All"}
                      </Button>
                      {userList.map((u) => (
                        <Button
                          key={u}
                          size="sm"
                          variant={selectedUser === u ? "default" : "outline"}
                          className="h-6 text-xs px-2"
                          onClick={() => setSelectedUser(u)}
                        >
                          {u}
                        </Button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Daily Usage Breakdown Table with Interactive Sorting */}
            <Card className="border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/40 shadow-xs">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-semibold text-slate-900 dark:text-white">{t.dailyLedgerTitle}</CardTitle>
                <span className="text-xs text-slate-400 font-mono">{sortedDaily.length} rows</span>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <Table className="table-fixed" style={{ width: `${totalDailyTableWidth}px`, minWidth: "100%" }}>
                    <TableHeader className="bg-slate-50 dark:bg-slate-900 sticky top-0 z-10">
                      <TableRow className="border-slate-200 dark:border-slate-800">
                        <ResizableHeader
                          width={dailyColWidths.day}
                          onResize={(e) => startResizeDaily("day", e)}
                          onClick={() => handleSortDaily("day")}
                        >
                          <span className="truncate">{t.colDate}</span>
                          {renderSortIcon("day", dailySortKey, dailySortDir)}
                        </ResizableHeader>
                        <ResizableHeader
                          width={dailyColWidths.user}
                          onResize={(e) => startResizeDaily("user", e)}
                          onClick={() => handleSortDaily("user")}
                        >
                          <span className="truncate">{t.colUser}</span>
                          {renderSortIcon("user", dailySortKey, dailySortDir)}
                        </ResizableHeader>
                        <ResizableHeader
                          width={dailyColWidths.upload_bytes}
                          onResize={(e) => startResizeDaily("upload_bytes", e)}
                          onClick={() => handleSortDaily("upload_bytes")}
                        >
                          <span className="truncate">{t.colUpload}</span>
                          {renderSortIcon("upload_bytes", dailySortKey, dailySortDir)}
                        </ResizableHeader>
                        <ResizableHeader
                          width={dailyColWidths.download_bytes}
                          onResize={(e) => startResizeDaily("download_bytes", e)}
                          onClick={() => handleSortDaily("download_bytes")}
                        >
                          <span className="truncate">{t.colDownload}</span>
                          {renderSortIcon("download_bytes", dailySortKey, dailySortDir)}
                        </ResizableHeader>
                        <ResizableHeader
                          width={dailyColWidths.total_bytes}
                          onResize={(e) => startResizeDaily("total_bytes", e)}
                          onClick={() => handleSortDaily("total_bytes")}
                        >
                          <span className="truncate">{t.colTotalTraffic}</span>
                          {renderSortIcon("total_bytes", dailySortKey, dailySortDir)}
                        </ResizableHeader>
                        <ResizableHeader
                          width={dailyColWidths.connections}
                          onResize={(e) => startResizeDaily("connections", e)}
                          onClick={() => handleSortDaily("connections")}
                        >
                          <span className="truncate">{t.colSessions}</span>
                          {renderSortIcon("connections", dailySortKey, dailySortDir)}
                        </ResizableHeader>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedDaily.map((d: any, idx: number) => (
                        <TableRow key={idx} className="border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <TableCell className="font-mono text-xs px-3 py-2 truncate">{d.day}</TableCell>
                          <TableCell className="font-medium text-xs text-slate-900 dark:text-white px-3 py-2 truncate">{d.user}</TableCell>
                          <TableCell className="text-xs text-emerald-600 dark:text-emerald-400 font-mono px-3 py-2 truncate">{formatBytes(d.upload_bytes)}</TableCell>
                          <TableCell className="text-xs text-sky-600 dark:text-sky-400 font-mono px-3 py-2 truncate">{formatBytes(d.download_bytes)}</TableCell>
                          <TableCell className="text-xs font-bold font-mono text-slate-900 dark:text-white px-3 py-2 truncate">{formatBytes(d.total_bytes)}</TableCell>
                          <TableCell className="text-xs font-mono px-3 py-2 truncate">{d.connections.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3: DESTINATIONS & GEO / ASN */}
          <TabsContent value="destinations" className="space-y-6">
            {/* GeoIP & ASN Database Status & Manual Update Banner */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/60 shadow-xs backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Database className="h-4.5 w-4.5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-xs text-slate-900 dark:text-white">{t.geoipTitle}</span>
                    <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-mono px-1.5 py-0">
                      {t.geoipAutoDaily} (24h)
                    </Badge>
                    {geoipStatus?.status === "updating" && (
                      <span className="text-[11px] text-amber-500 font-semibold animate-pulse flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {t.geoipUpdating}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span>
                      {t.geoipLastUpdated} <b className="text-slate-700 dark:text-slate-300 font-mono">{formatLocalTime(geoipStatus?.last_updated || geoipStatus?.country_file_time)}</b>
                    </span>
                    <span>·</span>
                    <span>Country: <b className="font-mono text-slate-700 dark:text-slate-300">{formatBytes(geoipStatus?.country_size || 0)}</b></span>
                    <span>·</span>
                    <span>ASN: <b className="font-mono text-slate-700 dark:text-slate-300">{formatBytes(geoipStatus?.asn_size || 0)}</b></span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={updatingGeoIP || geoipStatus?.status === "updating"}
                  onClick={handleManualUpdateGeoIP}
                  className="h-8 text-xs gap-1.5 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium text-slate-800 dark:text-slate-200 shadow-xs"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${updatingGeoIP ? "animate-spin text-emerald-500" : "text-slate-500"}`} />
                  {updatingGeoIP ? t.geoipUpdating : t.geoipManualUpdate}
                </Button>
              </div>
            </div>

            {/* World Map & Cross-border */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/40 lg:col-span-2 shadow-xs">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div>
                    <CardTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Globe2 className="h-4 w-4 text-emerald-500" />
                      {t.worldMapTitle}
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                      {t.worldMapDesc}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <WorldMap
                    data={geoAsnData?.world || []}
                    lang={lang}
                    isDark={isDark}
                    onSelectCountry={(code) => setConnSearch(code)}
                  />
                </CardContent>
              </Card>

              {/* Cross-border & ASN Stats with Independent ASN Limit */}
              <Card className="border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/40 space-y-4 shadow-xs">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-slate-900 dark:text-white">{t.crossBorderRatio}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-xs">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">{t.overseasTraffic}</span>
                      <span className="font-bold text-sky-600 dark:text-sky-400">{formatBytes(geoAsnData?.cross_border?.oversea_bytes || 0)}</span>
                    </div>
                    <Progress
                      value={((geoAsnData?.cross_border?.oversea_bytes || 0) / (geoAsnData?.cross_border?.total_bytes || 1)) * 100}
                      className="h-2 bg-slate-100 dark:bg-slate-800"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">{t.mainlandTraffic}</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatBytes(geoAsnData?.cross_border?.cn_bytes || 0)}</span>
                    </div>
                    <Progress
                      value={((geoAsnData?.cross_border?.cn_bytes || 0) / (geoAsnData?.cross_border?.total_bytes || 1)) * 100}
                      className="h-2 bg-slate-100 dark:bg-slate-800"
                    />
                  </div>

                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">{t.topAsnTitle}</div>
                      <Select value={asnLimit} onValueChange={(val) => setAsnLimit(val || "10")}>
                        <SelectTrigger className="h-6 border-0 bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold px-2 text-emerald-600 dark:text-emerald-400 rounded">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-md">
                          <SelectItem value="5">Top 5</SelectItem>
                          <SelectItem value="10">Top 10</SelectItem>
                          <SelectItem value="20">Top 20</SelectItem>
                          <SelectItem value="all">{t.showAll}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div ref={asnChartRef} className="h-[240px] w-full" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Top Destinations Table with ASN Badges & Interactive Column Sorting */}
            <Card className="border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/40 shadow-xs">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-indigo-500" />
                    {t.topDestinationsTitle}
                    <span className="text-xs font-normal text-emerald-600 dark:text-emerald-400 ml-1">
                      ({destinationsLimit === "all" ? t.showAll : `Top ${destinationsLimit}`})
                    </span>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                    {t.topDestinationsDesc}
                  </CardDescription>
                </div>

                {/* Independent Destinations Limit Selector */}
                <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2 py-1 rounded-lg text-xs">
                  <span className="text-slate-500 dark:text-slate-400 text-[11px]">{t.showCount}</span>
                  <Select value={destinationsLimit} onValueChange={(val) => setDestinationsLimit(val || "20")}>
                    <SelectTrigger className="h-6 border-0 bg-transparent text-xs font-semibold focus:ring-0 p-0 text-emerald-600 dark:text-emerald-400 min-w-[55px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-md">
                      <SelectItem value="10">Top 10</SelectItem>
                      <SelectItem value="20">Top 20</SelectItem>
                      <SelectItem value="50">Top 50</SelectItem>
                      <SelectItem value="100">Top 100</SelectItem>
                      <SelectItem value="all" className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {t.showAll}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <Table className="table-fixed" style={{ width: `${totalDestTableWidth}px`, minWidth: "100%" }}>
                    <TableHeader className="bg-slate-50 dark:bg-slate-900 sticky top-0 z-10">
                      <TableRow className="border-slate-200 dark:border-slate-800">
                        <ResizableHeader
                          width={destColWidths.domain}
                          onResize={(e) => startResizeDest("domain", e)}
                          onClick={() => handleSortDest("domain")}
                        >
                          <span className="truncate">{t.colDomain}</span>
                          {renderSortIcon("domain", destSortKey, destSortDir)}
                        </ResizableHeader>
                        <ResizableHeader
                          width={destColWidths.country_code}
                          onResize={(e) => startResizeDest("country_code", e)}
                          onClick={() => handleSortDest("country_code")}
                        >
                          <span className="truncate">{t.colGeoAsn}</span>
                          {renderSortIcon("country_code", destSortKey, destSortDir)}
                        </ResizableHeader>
                        <ResizableHeader
                          width={destColWidths.target_ips}
                          onResize={(e) => startResizeDest("target_ips", e)}
                        >
                          <span className="truncate">{t.colTargetIps}</span>
                        </ResizableHeader>
                        <ResizableHeader
                          width={destColWidths.upload_bytes}
                          onResize={(e) => startResizeDest("upload_bytes", e)}
                          onClick={() => handleSortDest("upload_bytes")}
                        >
                          <span className="truncate">{t.colUpload}</span>
                          {renderSortIcon("upload_bytes", destSortKey, destSortDir)}
                        </ResizableHeader>
                        <ResizableHeader
                          width={destColWidths.download_bytes}
                          onResize={(e) => startResizeDest("download_bytes", e)}
                          onClick={() => handleSortDest("download_bytes")}
                        >
                          <span className="truncate">{t.colDownload}</span>
                          {renderSortIcon("download_bytes", destSortKey, destSortDir)}
                        </ResizableHeader>
                        <ResizableHeader
                          width={destColWidths.total_bytes}
                          onResize={(e) => startResizeDest("total_bytes", e)}
                          onClick={() => handleSortDest("total_bytes")}
                        >
                          <span className="truncate">{t.colTotalTraffic}</span>
                          {renderSortIcon("total_bytes", destSortKey, destSortDir)}
                        </ResizableHeader>
                        <ResizableHeader
                          width={destColWidths.connections}
                          onResize={(e) => startResizeDest("connections", e)}
                          onClick={() => handleSortDest("connections")}
                        >
                          <span className="truncate">{t.colSessions}</span>
                          {renderSortIcon("connections", destSortKey, destSortDir)}
                        </ResizableHeader>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedDestinations.map((dest: any, idx: number) => (
                        <TableRow key={idx} className="border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <TableCell className="font-mono text-xs font-medium text-emerald-600 dark:text-emerald-400 px-3 py-2 truncate" title={dest.domain}>
                            {dest.domain}
                          </TableCell>
                          <TableCell className="px-3 py-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge variant="outline" className="border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-700 dark:text-slate-200">
                                {dest.country_code}
                              </Badge>
                              {dest.asn_number > 0 && (
                                <Badge variant="outline" className="border-indigo-500/40 bg-indigo-500/10 text-[10px] text-indigo-600 dark:text-indigo-300">
                                  AS{dest.asn_number} {dest.asn_org.slice(0, 14)}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-[11px] text-slate-500 dark:text-slate-400 px-3 py-2 truncate" title={dest.resolved_ips?.join(", ")}>
                            {dest.resolved_ips?.slice(0, 2).join(", ")}
                          </TableCell>
                          <TableCell className="text-xs text-emerald-600 dark:text-emerald-400 font-mono px-3 py-2 truncate">{formatBytes(dest.upload_bytes)}</TableCell>
                          <TableCell className="text-xs text-sky-600 dark:text-sky-400 font-mono px-3 py-2 truncate">{formatBytes(dest.download_bytes)}</TableCell>
                          <TableCell className="text-xs font-bold text-slate-900 dark:text-white font-mono px-3 py-2 truncate">{formatBytes(dest.total_bytes)}</TableCell>
                          <TableCell className="text-xs font-mono px-3 py-2 truncate">{dest.connections.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 4: DNS TELEMETRY */}
          <TabsContent value="dns" className="space-y-6">
            {/* DNS KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/40 shadow-xs">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t.dnsQueries}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-slate-900 dark:text-white">{dnsData?.kpi?.total_queries?.toLocaleString() || 0}</div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t.dnsCaptured}</p>
                </CardContent>
              </Card>

              <Card className="border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/40 shadow-xs">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t.cacheHitRate}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{dnsData?.kpi?.hit_rate || 0}%</div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{dnsData?.kpi?.cache_hits || 0} {t.cacheServed}</p>
                </CardContent>
              </Card>

              <Card className="border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/40 shadow-xs">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t.avgLatency}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-sky-600 dark:text-sky-400">{dnsData?.kpi?.avg_latency_ms || 0} ms</div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t.upstreamSpeed}</p>
                </CardContent>
              </Card>

              <Card className="border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/40 shadow-xs">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t.nxdomainTitle}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">{dnsData?.kpi?.nxdomain_count || 0}</div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t.nxdomainDesc}</p>
                </CardContent>
              </Card>
            </div>

            {/* DNS Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/40 shadow-xs">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-slate-900 dark:text-white">{t.qtypeDist}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div ref={dnsQtypeChartRef} className="h-[220px] w-full" />
                </CardContent>
              </Card>

              <Card className="border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/40 shadow-xs">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-slate-900 dark:text-white">{t.rcodeDist}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 pt-2">
                    {dnsData?.rcodes?.map((r: any) => (
                      <div key={r.rcode} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-mono text-slate-700 dark:text-slate-300">{r.name}</span>
                          <span className="text-slate-500 dark:text-slate-400 font-semibold">{r.count}</span>
                        </div>
                        <Progress
                          value={(r.count / (dnsData?.kpi?.total_queries || 1)) * 100}
                          className="h-1.5 bg-slate-100 dark:bg-slate-800"
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent DNS Queries Table with Limit Selector & Interactive Sorting */}
            <Card className="border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/40 shadow-xs">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-semibold text-slate-900 dark:text-white">{t.liveDnsTitle}</CardTitle>
                <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2 py-1 rounded-lg text-xs">
                  <span className="text-slate-500 dark:text-slate-400 text-[11px]">{t.showCount}</span>
                  <Select value={dnsRecentLimit} onValueChange={(val) => setDnsRecentLimit(val || "50")}>
                    <SelectTrigger className="h-6 border-0 bg-transparent text-xs font-semibold focus:ring-0 p-0 text-emerald-600 dark:text-emerald-400 min-w-[50px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-md">
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                      <SelectItem value="all">{t.showAll}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <Table className="table-fixed" style={{ width: `${totalDnsTableWidth}px`, minWidth: "100%" }}>
                    <TableHeader className="bg-slate-50 dark:bg-slate-900 sticky top-0 z-10">
                      <TableRow className="border-slate-200 dark:border-slate-800">
                        <ResizableHeader
                          width={dnsColWidths.event_time}
                          onResize={(e) => startResizeDns("event_time", e)}
                          onClick={() => handleSortDns("event_time")}
                        >
                          <span className="truncate">{t.colTime}</span>
                          {renderSortIcon("event_time", dnsSortKey, dnsSortDir)}
                        </ResizableHeader>
                        <ResizableHeader
                          width={dnsColWidths.user}
                          onResize={(e) => startResizeDns("user", e)}
                          onClick={() => handleSortDns("user")}
                        >
                          <span className="truncate">{t.colUser}</span>
                          {renderSortIcon("user", dnsSortKey, dnsSortDir)}
                        </ResizableHeader>
                        <ResizableHeader
                          width={dnsColWidths.qname}
                          onResize={(e) => startResizeDns("qname", e)}
                          onClick={() => handleSortDns("qname")}
                        >
                          <span className="truncate">{t.colQname}</span>
                          {renderSortIcon("qname", dnsSortKey, dnsSortDir)}
                        </ResizableHeader>
                        <ResizableHeader
                          width={dnsColWidths.qtype_name}
                          onResize={(e) => startResizeDns("qtype_name", e)}
                          onClick={() => handleSortDns("qtype_name")}
                        >
                          <span className="truncate">{t.colQtype}</span>
                          {renderSortIcon("qtype_name", dnsSortKey, dnsSortDir)}
                        </ResizableHeader>
                        <ResizableHeader
                          width={dnsColWidths.resolver}
                          onResize={(e) => startResizeDns("resolver", e)}
                          onClick={() => handleSortDns("resolver")}
                        >
                          <span className="truncate">{t.colResolver}</span>
                          {renderSortIcon("resolver", dnsSortKey, dnsSortDir)}
                        </ResizableHeader>
                        <ResizableHeader
                          width={dnsColWidths.cache_hit}
                          onResize={(e) => startResizeDns("cache_hit", e)}
                          onClick={() => handleSortDns("cache_hit")}
                        >
                          <span className="truncate">{t.colStatus}</span>
                          {renderSortIcon("cache_hit", dnsSortKey, dnsSortDir)}
                        </ResizableHeader>
                        <ResizableHeader
                          width={dnsColWidths.answers}
                          onResize={(e) => startResizeDns("answers", e)}
                        >
                          <span className="truncate">{t.colAnswers}</span>
                        </ResizableHeader>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedDns.map((d: any, idx: number) => (
                        <TableRow key={idx} className="border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <TableCell className="font-mono text-xs text-slate-500 dark:text-slate-400 px-3 py-2 truncate">{formatLocalTime(d.event_time)}</TableCell>
                          <TableCell className="font-medium text-xs text-slate-900 dark:text-white px-3 py-2 truncate">{d.user}</TableCell>
                          <TableCell className="font-mono text-xs text-emerald-600 dark:text-emerald-400 px-3 py-2 truncate" title={d.qname}>{d.qname}</TableCell>
                          <TableCell className="px-3 py-2">
                            <Badge variant="outline" className="text-[10px]">{d.qtype_name}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-slate-500 dark:text-slate-400 px-3 py-2 truncate">{d.resolver}</TableCell>
                          <TableCell className="px-3 py-2">
                            {d.cache_hit ? (
                              <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px]">HIT</Badge>
                            ) : (
                              <Badge variant="outline" className="border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px]">MISS</Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-[11px] text-slate-600 dark:text-slate-300 px-3 py-2 truncate" title={d.answers?.join(", ")}>
                            {d.answers?.join(", ")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 5: SESSIONS FORENSICS (STREAMING, LAZY LOADING & INTERACTIVE SORTING) */}
          <TabsContent value="connections" className="space-y-4">
            {/* Filter & Stream Control Bar */}
            <div className="flex flex-col gap-3 p-3 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                  <Search className="h-4 w-4 text-slate-400" />
                  <Input
                    placeholder={t.searchPlaceholder}
                    value={connSearch}
                    onChange={(e) => setConnSearch(e.target.value)}
                    className="h-8 border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs"
                  />
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={connNetwork || "ALL"} onValueChange={(v) => setConnNetwork(v === "ALL" || !v ? "" : v)}>
                    <SelectTrigger className="h-8 w-[100px] border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs">
                      <SelectValue placeholder={t.allProto} />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-md">
                      <SelectItem value="ALL">{t.allProto}</SelectItem>
                      <SelectItem value="tcp">TCP</SelectItem>
                      <SelectItem value="udp">UDP</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={connStatus || "ALL"} onValueChange={(v) => setConnStatus(v === "ALL" || !v ? "" : v)}>
                    <SelectTrigger className="h-8 w-[110px] border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs">
                      <SelectValue placeholder={t.allStatus} />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-md">
                      <SelectItem value="ALL">{t.allStatus}</SelectItem>
                      <SelectItem value="active">{t.statusActive}</SelectItem>
                      <SelectItem value="closed">{t.statusClosed}</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button size="sm" variant="outline" className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 h-8 gap-1.5 shadow-xs" onClick={exportConnectionsCSV}>
                    <Download className="h-3.5 w-3.5" /> {t.exportCsv}
                  </Button>
                </div>
              </div>

              {/* Streaming & Lazy Load Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800/60 text-xs">
                {/* Progress / Counts */}
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono text-[11px] py-0.5">
                    {t.loadedCount} {connections.length.toLocaleString()} / {totalConns.toLocaleString()} {t.totalSessions} ({Math.round((connections.length / (totalConns || 1)) * 100)}%)
                  </Badge>
                  {streamingAll && (
                    <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-xs font-semibold animate-pulse">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {t.streamProgress}
                    </span>
                  )}
                </div>

                {/* Stream Controls */}
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 cursor-pointer text-slate-600 dark:text-slate-400 select-none text-xs mr-2">
                    <input
                      type="checkbox"
                      checked={autoScroll}
                      onChange={(e) => setAutoScroll(e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-700 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
                    />
                    <span>{t.infiniteScrollToggle}</span>
                  </label>

                  {/* Manual Load More (+50) */}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800"
                    disabled={loadingConns || connections.length >= totalConns || streamingAll}
                    onClick={() => loadConnectionsChunk(connections.length, 50, true)}
                  >
                    <ArrowDown className={`h-3 w-3 mr-1 ${loadingConns ? "animate-bounce" : ""}`} />
                    {t.loadMore}
                  </Button>

                  {/* Stream Load All / Stop */}
                  <Button
                    size="sm"
                    className={`h-7 text-xs gap-1.5 ${
                      streamingAll
                        ? "bg-rose-600 hover:bg-rose-500 text-white"
                        : "bg-emerald-600 hover:bg-emerald-500 text-white"
                    }`}
                    disabled={connections.length >= totalConns && !streamingAll}
                    onClick={handleToggleStreamAll}
                  >
                    {streamingAll ? (
                      <>
                        <Square className="h-3 w-3 fill-current" />
                        {t.stopStream}
                      </>
                    ) : (
                      <>
                        <Play className="h-3 w-3 fill-current" />
                        {t.streamLoadAll}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {/* Sessions Table with Embedded Geolocation, Resizable Columns and Interactive Column Sorting */}
            <div className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/40 overflow-hidden shadow-xs">
              <Table className="table-fixed" style={{ width: `${totalConnTableWidth}px`, minWidth: "100%" }}>
                <TableHeader className="bg-slate-50 dark:bg-slate-900 sticky top-0 z-10">
                  <TableRow className="border-slate-200 dark:border-slate-800">
                    <ResizableHeader
                      width={connColWidths.last_time}
                      onResize={(e) => startResizeConn("last_time", e)}
                      onClick={() => handleSortConn("last_time")}
                    >
                      <span className="truncate">{t.colTime}</span>
                      {renderSortIcon("last_time", connSortKey, connSortDir)}
                    </ResizableHeader>
                    <ResizableHeader
                      width={connColWidths.user}
                      onResize={(e) => startResizeConn("user", e)}
                      onClick={() => handleSortConn("user")}
                    >
                      <span className="truncate">{t.colUser}</span>
                      {renderSortIcon("user", connSortKey, connSortDir)}
                    </ResizableHeader>
                    <ResizableHeader
                      width={connColWidths.network}
                      onResize={(e) => startResizeConn("network", e)}
                      onClick={() => handleSortConn("network")}
                    >
                      <span className="truncate">{t.colProtocol}</span>
                      {renderSortIcon("network", connSortKey, connSortDir)}
                    </ResizableHeader>
                    <ResizableHeader
                      width={connColWidths.domain}
                      onResize={(e) => startResizeConn("domain", e)}
                      onClick={() => handleSortConn("domain")}
                    >
                      <span className="truncate">{t.colTargetEndpoint}</span>
                      {renderSortIcon("domain", connSortKey, connSortDir)}
                    </ResizableHeader>
                    <ResizableHeader
                      width={connColWidths.target_ip}
                      onResize={(e) => startResizeConn("target_ip", e)}
                      onClick={() => handleSortConn("target_ip")}
                    >
                      <span className="truncate">{t.colIpAsn}</span>
                      {renderSortIcon("target_ip", connSortKey, connSortDir)}
                    </ResizableHeader>
                    <ResizableHeader
                      width={connColWidths.outbound}
                      onResize={(e) => startResizeConn("outbound", e)}
                      onClick={() => handleSortConn("outbound")}
                    >
                      <span className="truncate">{t.colRoute}</span>
                      {renderSortIcon("outbound", connSortKey, connSortDir)}
                    </ResizableHeader>
                    <ResizableHeader
                      width={connColWidths.total_bytes}
                      onResize={(e) => startResizeConn("total_bytes", e)}
                      onClick={() => handleSortConn("total_bytes")}
                    >
                      <span className="truncate">{t.colUpload} / {t.colDownload}</span>
                      {renderSortIcon("total_bytes", connSortKey, connSortDir)}
                    </ResizableHeader>
                    <ResizableHeader
                      width={connColWidths.duration_sec}
                      onResize={(e) => startResizeConn("duration_sec", e)}
                      onClick={() => handleSortConn("duration_sec")}
                    >
                      <span className="truncate">{t.colDuration}</span>
                      {renderSortIcon("duration_sec", connSortKey, connSortDir)}
                    </ResizableHeader>
                    <ResizableHeader
                      width={connColWidths.status}
                      onResize={(e) => startResizeConn("status", e)}
                      onClick={() => handleSortConn("status")}
                    >
                      <span className="truncate">{t.colStatus}</span>
                      {renderSortIcon("status", connSortKey, connSortDir)}
                    </ResizableHeader>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedConnections.map((c: any) => (
                    <TableRow
                      key={c.conn_id}
                      onClick={() => setSelectedConn(c)}
                      className="border-slate-100 dark:border-slate-800/60 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 cursor-pointer"
                    >
                      <TableCell className="font-mono text-xs text-slate-500 dark:text-slate-400 px-3 py-2 truncate">
                        {formatLocalTime(c.last_time)}
                      </TableCell>
                      <TableCell className="font-semibold text-xs text-slate-900 dark:text-white px-3 py-2 truncate">
                        {c.user}
                      </TableCell>
                      <TableCell className="px-3 py-2">
                        <Badge variant="outline" className="text-[10px] font-mono">{c.network.toUpperCase()}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs font-medium text-emerald-600 dark:text-emerald-400 px-3 py-2 truncate" title={`${c.domain}:${c.port}`}>
                        {c.domain}:{c.port}
                      </TableCell>
                      <TableCell className="px-3 py-2 overflow-hidden">
                        <div className="flex items-center gap-2 whitespace-nowrap overflow-hidden">
                          <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200 shrink-0">
                            {c.target_ip}
                          </span>
                          {c.country_code && c.country_code !== "LOCAL" && (
                            <Badge variant="outline" className="shrink-0 border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400 text-[10px] px-1.5 py-0 font-medium">
                              {c.country_code} {c.country_name ? `· ${c.country_name}` : ""}
                            </Badge>
                          )}
                          {c.asn_number > 0 && (
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1 shrink-0 overflow-hidden">
                              <Badge variant="outline" className="border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-[9px] px-1 py-0 shrink-0">
                                AS{c.asn_number}
                              </Badge>
                              <span className="truncate max-w-[160px] text-slate-600 dark:text-slate-300" title={c.asn_org}>
                                {c.asn_org}
                              </span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-500 dark:text-slate-400 px-3 py-2 truncate">
                        {c.outbound}
                      </TableCell>
                      <TableCell className="text-xs px-3 py-2 whitespace-nowrap">
                        <span className="text-emerald-600 dark:text-emerald-400 font-mono">↑{formatBytes(c.upload_bytes)}</span>
                        <span className="mx-1 text-slate-400">·</span>
                        <span className="text-sky-600 dark:text-sky-400 font-mono">↓{formatBytes(c.download_bytes)}</span>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-slate-500 dark:text-slate-400 px-3 py-2 truncate">
                        {c.duration_sec}s
                      </TableCell>
                      <TableCell className="px-3 py-2">
                        {c.status === "active" ? (
                          <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px]">{t.statusActive}</Badge>
                        ) : (
                          <Badge variant="outline" className="border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px]">{t.statusClosed}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Bottom Sentinel Trigger for Infinite Scroll */}
              <div ref={bottomSentinelRef} className="py-4 flex items-center justify-center text-xs text-slate-400">
                {loadingConns ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                    <span>Loading more sessions...</span>
                  </div>
                ) : connections.length >= totalConns && totalConns > 0 ? (
                  <span className="text-slate-400 dark:text-slate-500">✓ All {totalConns.toLocaleString()} sessions loaded</span>
                ) : null}
              </div>
            </div>

            {/* Session Context Drawer */}
            <Sheet open={Boolean(selectedConn)} onOpenChange={(open) => !open && setSelectedConn(null)}>
              <SheetContent className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 sm:max-w-lg overflow-y-auto">
                <SheetHeader>
                  <SheetTitle className="text-slate-900 dark:text-white flex items-center gap-2">
                    <Shield className="h-5 w-5 text-emerald-500" />
                    {t.drawerTitle}
                  </SheetTitle>
                  <SheetDescription className="text-xs font-mono text-slate-500 dark:text-slate-400">
                    {t.drawerDesc} {selectedConn?.conn_id}
                  </SheetDescription>
                </SheetHeader>
                {selectedConn && (
                  <div className="space-y-4 py-4 text-xs font-mono">
                    <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 space-y-2">
                      <div className="text-slate-500 dark:text-slate-400 font-sans font-semibold">{t.clientContext}</div>
                      <div>{t.colUser}: <b className="text-slate-900 dark:text-white">{selectedConn.user}</b></div>
                      <div>{t.colProtocol}: <b className="text-slate-900 dark:text-white">{selectedConn.network.toUpperCase()}</b></div>
                      <div>{t.colStatus}: <Badge variant="outline">{selectedConn.status}</Badge></div>
                      <div>{t.colTime}: <span className="text-slate-700 dark:text-slate-300">{formatLocalTime(selectedConn.last_time)}</span></div>
                    </div>

                    <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 space-y-2">
                      <div className="text-slate-500 dark:text-slate-400 font-sans font-semibold">{t.networkDest}</div>
                      <div>{t.colTargetEndpoint}: <span className="text-emerald-600 dark:text-emerald-400">{selectedConn.domain}:{selectedConn.port}</span></div>
                      <div>{t.colIpAsn}: <span className="text-slate-900 dark:text-white">{selectedConn.target_ip}</span></div>
                      <div>{t.colGeoAsn}: <span className="text-slate-900 dark:text-white">{selectedConn.country_name} ({selectedConn.country_code})</span></div>
                      <div>ASN: <span className="text-indigo-600 dark:text-indigo-400">AS{selectedConn.asn_number} {selectedConn.asn_org}</span></div>
                    </div>

                    <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 space-y-2">
                      <div className="text-slate-500 dark:text-slate-400 font-sans font-semibold">{t.routingPerf}</div>
                      <div>{t.colRoute}: <span className="text-emerald-600 dark:text-emerald-400">{selectedConn.outbound}</span></div>
                      <div>{t.matchedRule}: <span className="text-amber-600 dark:text-amber-400">{selectedConn.rule || t.defaultFallback}</span></div>
                      <div>{t.colDuration}: <span className="text-slate-900 dark:text-white">{selectedConn.duration_sec}s</span></div>
                      <div>{t.colUpload}: <span className="text-emerald-600 dark:text-emerald-400">{formatBytes(selectedConn.upload_bytes)}</span></div>
                      <div>{t.colDownload}: <span className="text-sky-600 dark:text-sky-400">{formatBytes(selectedConn.download_bytes)}</span></div>
                    </div>
                  </div>
                )}
              </SheetContent>
            </Sheet>
          </TabsContent>

          {/* TAB 6: CLUSTER SYNC */}
          <TabsContent value="servers" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">{t.nodesTitle}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t.nodesDesc}</p>
              </div>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs" onClick={() => setShowAddServer(true)}>
                {t.addNodeBtn}
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {servers.map((s) => (
                <Card key={s.id} className="border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/40 shadow-xs">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Server className="h-4 w-4 text-emerald-500" />
                      {s.name} ({s.host})
                    </CardTitle>
                    <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400 text-[10px]">
                      Port {s.port}
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-3 text-xs">
                    <div className="text-slate-500 dark:text-slate-400">
                      {t.remotePath} <code className="text-slate-800 dark:text-slate-200">{s.remote_path}</code>
                    </div>
                    <div className="text-slate-500 dark:text-slate-400">
                      {t.autoSync} <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{s.auto_sync ? t.autoSyncEnabled : t.autoSyncDisabled}</span>
                    </div>
                    {s.last_sync_message && (
                      <div className="p-2 rounded bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                        {s.last_sync_message}
                      </div>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 shadow-xs"
                      onClick={() => handleSyncServer(s.id)}
                      disabled={syncingServerId === s.id}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncingServerId === s.id ? "animate-spin text-emerald-500" : ""}`} />
                      {syncingServerId === s.id ? t.syncing : t.syncNow}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Add Server Dialog */}
            <Dialog open={showAddServer} onOpenChange={setShowAddServer}>
              <DialogContent className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>{t.dialogAddTitle}</DialogTitle>
                  <DialogDescription>{t.dialogAddDesc}</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAddServer} className="space-y-3 text-xs">
                  <div>
                    <label className="text-slate-500 dark:text-slate-400">{t.nodeNameLabel}</label>
                    <Input
                      value={newServerForm.name}
                      onChange={(e) => setNewServerForm({ ...newServerForm, name: e.target.value })}
                      placeholder="e.g. vps-tokyo"
                      className="border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 h-8 mt-1"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="text-slate-500 dark:text-slate-400">{t.sshHostLabel}</label>
                      <Input
                        value={newServerForm.host}
                        onChange={(e) => setNewServerForm({ ...newServerForm, host: e.target.value })}
                        placeholder="1.2.3.4"
                        className="border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 h-8 mt-1"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 dark:text-slate-400">{t.portLabel}</label>
                      <Input
                        type="number"
                        value={newServerForm.port}
                        onChange={(e) => setNewServerForm({ ...newServerForm, port: Number(e.target.value) })}
                        className="border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 h-8 mt-1"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-slate-500 dark:text-slate-400">{t.remoteDirLabel}</label>
                    <Input
                      value={newServerForm.remote_path}
                      onChange={(e) => setNewServerForm({ ...newServerForm, remote_path: e.target.value })}
                      className="border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 h-8 mt-1"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-slate-500 dark:text-slate-400">{t.privateKeyLabel}</label>
                    <Input
                      value={newServerForm.private_key}
                      onChange={(e) => setNewServerForm({ ...newServerForm, private_key: e.target.value })}
                      className="border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 h-8 mt-1 font-mono"
                    />
                  </div>
                  <DialogFooter className="pt-2">
                    <Button type="button" variant="outline" onClick={() => setShowAddServer(false)}>{t.cancelBtn}</Button>
                    <Button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white">{t.saveNodeBtn}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* TAB 7: SQL STUDIO */}
          <TabsContent value="sql" className="space-y-4">
            <Card className="border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/40 shadow-xs">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Terminal className="h-4 w-4 text-emerald-500" />
                    {t.sqlTitle}
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                    {t.sqlDesc}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Select onValueChange={(val: any) => setSqlQuery(String(val || ""))}>
                    <SelectTrigger className="h-8 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs w-[180px]">
                      <SelectValue placeholder={t.presetPlaceholder} />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-md">
                      <SelectItem value="SELECT auth_user, count() AS conns, sum(total_bytes) AS bytes FROM audit.v_connections GROUP BY auth_user ORDER BY bytes DESC">
                        {t.presetTalkers}
                      </SelectItem>
                      <SelectItem value="SELECT domain, country_name, asn_org, count() AS conns, sum(total_bytes) AS bytes FROM audit.v_connections GROUP BY domain, country_name, asn_org ORDER BY bytes DESC LIMIT 20">
                        {t.presetDestinations}
                      </SelectItem>
                      <SelectItem value="SELECT toHour(start_time) AS hour, count() AS conns, sum(total_bytes) AS bytes FROM audit.v_connections GROUP BY hour ORDER BY hour ASC">
                        {t.presetHourly}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 gap-1.5 shadow-xs" onClick={handleRunSql} disabled={sqlLoading}>
                    <Play className="h-3.5 w-3.5" /> {sqlLoading ? t.executingBtn : t.executeBtn}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <textarea
                  value={sqlQuery}
                  onChange={(e) => setSqlQuery(e.target.value)}
                  className="w-full h-24 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 font-mono text-xs text-emerald-600 dark:text-emerald-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />

                {sqlResult && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
                      <span>{t.rowsCount} <b className="text-slate-900 dark:text-white">{sqlResult.count}</b> · {t.elapsedTime} <b className="text-emerald-600 dark:text-emerald-400">{sqlResult.elapsed_ms}ms</b></span>
                    </div>
                    {sqlResult.error ? (
                      <div className="p-3 rounded-lg border border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 text-xs font-mono">
                        {sqlResult.error}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-slate-200 dark:border-slate-800 max-h-[360px] overflow-auto">
                        <Table>
                          <TableHeader className="bg-slate-50 dark:bg-slate-900 sticky top-0">
                            <TableRow className="border-slate-200 dark:border-slate-800">
                              {sqlResult.columns?.map((col: string) => (
                                <TableHead key={col} className="font-mono text-xs">{col}</TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sqlResult.rows?.map((row: any[], rIdx: number) => (
                              <TableRow key={rIdx} className="border-slate-100 dark:border-slate-800/60 font-mono text-xs">
                                {row.map((cell: any, cIdx: number) => (
                                  <TableCell key={cIdx}>{typeof cell === "number" && cell > 100000 ? formatBytes(cell) : String(cell ?? "")}</TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
