"use client";

import React, { useEffect, useRef, useState } from "react";
import * as echarts from "echarts";

interface WorldDataPoint {
  name: string;
  country_name: string;
  code: string;
  value: number;
  total_bytes: number;
  upload_bytes: number;
  download_bytes: number;
  connections: number;
  top_domain?: string;
}

interface WorldMapProps {
  data: WorldDataPoint[];
  lang?: "zh" | "en";
  isDark?: boolean;
  onSelectCountry?: (countryCode: string) => void;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  const idx = Math.min(i, sizes.length - 1);
  return parseFloat((bytes / Math.pow(k, idx)).toFixed(2)) + " " + sizes[idx];
}

function normalizeCountryName(raw: string): string {
  if (!raw) return "";
  if (raw === "United States of America") return "United States";
  if (raw === "The Netherlands") return "Netherlands";
  if (raw === "South Korea") return "Korea";
  return raw;
}

export default function WorldMap({ data, lang = "zh", isDark = true, onSelectCountry }: WorldMapProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;
    fetch("/geojson/world.json")
      .then((res) => res.json())
      .then((geoJson) => {
        if (!isMounted) return;
        echarts.registerMap("world", geoJson);
        setMapLoaded(true);
      })
      .catch((err) => console.error("Failed to load world map GeoJSON:", err));

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!mapLoaded || !chartRef.current) return;

    const chartInstance = echarts.init(chartRef.current, isDark ? "dark" : undefined);
    
    // Normalize country names and apply Logarithmic scale for visualMap
    const normalizedData = data.map((d) => {
      const bytes = Number(d.total_bytes || d.value || 0);
      // Log10 scaling so countries with varying traffic (from 100B to 2GB) are clearly distinguishable
      const logVal = bytes > 0 ? parseFloat(Math.log10(bytes + 1).toFixed(2)) : 0;
      return {
        ...d,
        name: normalizeCountryName(d.name || d.country_name),
        value: logVal,
        total_bytes: bytes,
      };
    });

    const maxLogVal = Math.max(...normalizedData.map((d) => d.value), 1);
    const isZh = lang === "zh";

    const option: echarts.EChartsOption = {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        backgroundColor: isDark ? "rgba(15, 23, 42, 0.95)" : "rgba(255, 255, 255, 0.97)",
        borderColor: isDark ? "#334155" : "#e2e8f0",
        borderWidth: 1,
        textStyle: { color: isDark ? "#f8fafc" : "#0f172a", fontSize: 12 },
        shadowBlur: 10,
        shadowColor: isDark ? "rgba(0, 0, 0, 0.5)" : "rgba(0, 0, 0, 0.1)",
        formatter: (params: any) => {
          const d = params.data as WorldDataPoint | undefined;
          if (!d || !d.total_bytes) return `<div class="p-1 font-medium text-slate-500">${params.name}: ${isZh ? "无流量记录" : "No Traffic"}</div>`;
          return `
            <div class="p-1 space-y-1">
              <div class="font-bold text-sm ${isDark ? "text-sky-400" : "text-sky-600"}">${d.country_name || params.name} (${d.code || ""})</div>
              <div>${isZh ? "总吞吐流量:" : "Total Volume:"} <b class="${isDark ? "text-white" : "text-slate-900"}">${formatBytes(d.total_bytes)}</b></div>
              <div>${isZh ? "会话总数:" : "Sessions:"} <b class="${isDark ? "text-white" : "text-slate-900"}">${d.connections.toLocaleString()}</b></div>
              <div class="text-xs ${isDark ? "text-slate-400" : "text-slate-500"}">↑ ${formatBytes(d.upload_bytes)} · ↓ ${formatBytes(d.download_bytes)}</div>
              ${d.top_domain ? `<div class="text-xs ${isDark ? "text-slate-300" : "text-slate-600"} mt-1">${isZh ? "热门域名:" : "Top:"} <code class="${isDark ? "text-amber-300" : "text-amber-600"} font-mono">${d.top_domain}</code></div>` : ""}
              <div class="text-[10px] text-slate-400 pt-0.5">${isZh ? "(对数热力着色)" : "(Log-scale colored)"}</div>
            </div>
          `;
        },
      },
      visualMap: {
        min: 0,
        max: Math.ceil(maxLogVal),
        text: [isZh ? "高流量 (对数)" : "High (Log)", isZh ? "低流量" : "Low"],
        realtime: false,
        calculable: true,
        formatter: (val: any) => formatBytes(Math.pow(10, Number(val))),
        inRange: {
          color: isDark
            ? ["#1e293b", "#0369a1", "#0284c7", "#38bdf8", "#34d399"]
            : ["#e2e8f0", "#93c5fd", "#3b82f6", "#0284c7", "#10b981"],
        },
        textStyle: { color: isDark ? "#94a3b8" : "#64748b", fontSize: 11 },
        bottom: 10,
        left: 10,
        orient: "horizontal",
      },
      series: [
        {
          name: isZh ? "全球流量分布" : "Global Traffic",
          type: "map",
          map: "world",
          roam: true,
          zoom: 1.15,
          itemStyle: {
            borderColor: isDark ? "#334155" : "#cbd5e1",
            borderWidth: 0.8,
            areaColor: isDark ? "#0f172a" : "#f1f5f9",
          },
          emphasis: {
            itemStyle: {
              areaColor: isDark ? "#0ea5e9" : "#38bdf8",
              borderColor: isDark ? "#7dd3fc" : "#0284c7",
              borderWidth: 1.5,
            },
            label: {
              show: true,
              color: isDark ? "#ffffff" : "#0f172a",
              fontSize: 11,
              fontWeight: "bold",
            },
          },
          data: normalizedData,
        },
      ],
    };

    chartInstance.setOption(option);

    chartInstance.on("click", (params: any) => {
      const d = params.data as WorldDataPoint | undefined;
      if (d && onSelectCountry) {
        onSelectCountry(d.code);
      }
    });

    // Resize triggers for clean rendering without needing mouse click
    const doResize = () => {
      if (chartRef.current && chartRef.current.clientWidth > 0) {
        chartInstance.resize();
      }
    };

    requestAnimationFrame(doResize);
    const t1 = setTimeout(doResize, 60);
    const t2 = setTimeout(doResize, 250);

    const resizeObserver = new ResizeObserver(() => {
      doResize();
    });
    resizeObserver.observe(chartRef.current);

    window.addEventListener("resize", doResize);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      resizeObserver.disconnect();
      window.removeEventListener("resize", doResize);
      chartInstance.dispose();
    };
  }, [mapLoaded, data, lang, isDark, onSelectCountry]);

  if (!mapLoaded) {
    return (
      <div className="flex h-full min-h-[440px] w-full items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-950/40 text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <span>{lang === "zh" ? "正在加载全球遥测地图..." : "Loading World Telemetry Map..."}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-[440px] w-full">
      <div ref={chartRef} className="h-[440px] w-full min-w-[300px]" />
    </div>
  );
}
