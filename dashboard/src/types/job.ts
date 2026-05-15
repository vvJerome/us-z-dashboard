export type JobStatus =
  | "QUEUED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface Job {
  id: string;
  status: JobStatus;
  input_filename: string;
  config: Record<string, boolean>;
  kestra_execution_id: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  output_file_key: string | null;
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

export interface ApiError {
  detail: string;
}
