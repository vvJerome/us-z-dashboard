export type JobStatus =
  "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface Job {
  id: string;
  status: JobStatus;
  name: string | null;
  input_filename: string;
  config: Record<string, boolean>;
  worker_session: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  output_file_key: string | null;
  vps_id: string | null;
}

export interface JobListResponse {
  jobs: Job[];
  total: number;
}

export interface JobLogsResponse {
  lines: string[];
}

export interface JobDownloadResponse {
  url: string;
}

export interface JobConfig {
  enable_proxy: boolean;
  skip_duplicates: boolean;
}
