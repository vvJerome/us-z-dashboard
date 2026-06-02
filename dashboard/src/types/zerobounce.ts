export interface ZeroBounceJob {
  id: string;
  status: string;
  input_filename: string;
  filter_mode: string;
  email_col: string;
  email_count: number | null;
  processed_count: number | null;
  output_file_key: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}
