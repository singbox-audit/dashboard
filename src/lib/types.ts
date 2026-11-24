export interface KPI {
  today_upload_bytes: number;
  today_download_bytes: number;
  total_upload_bytes: number;
  total_download_bytes: number;
  total_volumes: number;
  total_disk_bytes: number;
  total_connections: number;
  active_connections: number;
  today_connections: number;
  total_dns_requests: number;
  total_users: number;
}

export interface DistributionItem {
  name: string;
  connections: number;
  upload_bytes: number;
  download_bytes: number;
  total_bytes: number;
}

export interface PortDistributionItem {
  port: number;
  service: string;
  connections: number;
  total_bytes: number;
}

export interface AnalyticsSummary {
  kpi: KPI;
  network_distribution: DistributionItem[];
  inbound_distribution: DistributionItem[];
  outbound_distribution: DistributionItem[];
  port_distribution: PortDistributionItem[];
}

export interface TrafficTrendItem {
  day: string;
  upload_bytes: number;
  download_bytes: number;
  total_bytes: number;
}

export interface TopTalker {
  user: string;
  inbound_tag: string;
  connections: number;
  upload_bytes: number;
  download_bytes: number;
  total_bytes: number;
  avg_conn_bytes: number;
}

export interface TopDestination {
  target: string;
  connections: number;
  upload_bytes: number;
  download_bytes: number;
  total_bytes: number;
  outbound: string;
  port: number;
}

export interface DNSAnalytics {
  total_queries: number;
  cache_hit_rate: number;
  error_rate: number;
  hits: number;
  errors: number;
  qtypes: { type: string; count: number }[];
  rcodes: { rcode: number; name: string; count: number }[];
  top_domains: { domain: string; count: number }[];
  top_failed_domains: { domain: string; rcode: number; count: number }[];
  resolvers: { resolver: string; count: number }[];
}

export interface ConnectionItem {
  conn_id: string;
  first_seen_time: string;
  last_event_time: string;
  inbound_tag: string;
  auth_user: string;
  network: string;
  requested_host: string;
  requested_port: number;
  target_ip: string;
  sniffed_domain: string;
  route_rule: string;
  route_outbound: string;
  outbound_chain: string;
  upload_bytes: number;
  download_bytes: number;
  state: "end" | "unfinished" | "interrupted" | string;
  error?: string;
}

export interface DNSItem {
  request_id: string;
  request_time: string;
  inbound_tag: string;
  auth_user: string;
  network: string;
  qname: string;
  qtype: string | number;
  resolver: string;
  cache_hit: boolean;
  upstreams: string;
  rcode: number;
  answers: string;
  upload_bytes: number;
  download_bytes: number;
  state: string;
  error?: string;
}

export interface ServerConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_type: "key" | "password";
  password?: string | null;
  private_key?: string | null;
  remote_path: string;
  auto_sync: boolean;
  sync_interval_minutes: number;
  remove_source: boolean;
  last_sync_time?: number | null;
  last_sync_status?: "success" | "error" | "running" | null;
  last_sync_message?: string | null;
}

export interface SyncTaskLog {
  task_id: string;
  server_id: string;
  server_name: string;
  start_time: number;
  end_time?: number | null;
  status: "running" | "success" | "error";
  files_found: number;
  files_pulled: number;
  files_ingested: number;
  message: string;
  logs: string[];
}
