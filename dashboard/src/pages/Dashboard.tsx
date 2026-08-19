import { Link } from "react-router-dom";
import { JobList } from "../components/JobList";

export function Dashboard() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-4 flex justify-end">
        <Link
          to="/inspect"
          className="text-sm text-slate-500 hover:text-slate-800"
        >
          Inspect DB →
        </Link>
      </div>
      <JobList />
    </div>
  );
}
