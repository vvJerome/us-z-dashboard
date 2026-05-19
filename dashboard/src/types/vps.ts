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
