"use client";

import React, { useEffect, useRef } from "react";
import * as echarts from "echarts";

interface EChartProps {
  options: echarts.EChartsOption;
  height?: string | number;
  className?: string;
}

export const EChart: React.FC<EChartProps> = ({
  options,
  height = "320px",
  className = "",
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current, "dark", {
        renderer: "canvas",
      });
    }

    chartInstance.current.setOption(options, true);

    const handleResize = () => {
      chartInstance.current?.resize();
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [options]);

  useEffect(() => {
    return () => {
      chartInstance.current?.dispose();
      chartInstance.current = null;
    };
  }, []);

  return (
    <div
      ref={chartRef}
      style={{ height, width: "100%" }}
      className={className}
    />
  );
};
