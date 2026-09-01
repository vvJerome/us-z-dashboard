export interface VpsInstance {
  id: string;
  name: string;
  is_local: boolean;
  is_active: boolean;
  ssh_host: string | null;
  ssh_user: string;
  ssh_port: number;
  data_dir: string;
  created_at: string;
}

export interface VpsCreate {
  name: string;
  is_local: boolean;
  ssh_host: string | null;
  ssh_user: string;
  ssh_port: number;
  data_dir: string;
  repo_dir: string;
}
