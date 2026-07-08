import MetricCard from "../../components/MetricCard/MetricCard";
import ActivityPanel from "../../components/ActivityPanel/ActivityPanel";
import { dashboardMetrics } from "../../data/dashboardData";

function Dashboard() {
  const user = JSON.parse(
    localStorage.getItem("user") || "{}"
  );

  return (
    <div className="h-full">

      {/* Page Title */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">
          Welcome, {user.name || "User"} 👋
        </h1>

        <p className="text-gray-400 mt-2">
          Here's an overview of your AI-powered network.
        </p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {dashboardMetrics.map((metric) => {
          const Icon = metric.icon;

          return (
            <MetricCard
              key={metric.title}
              title={metric.title}
              value={metric.value}
              icon={<Icon size={32} />}
            />
          );
        })}
      </div>

      <div className="mt-8">
        <ActivityPanel />
      </div>

    </div>
  );
}

export default Dashboard;