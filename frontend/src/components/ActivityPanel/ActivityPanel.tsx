const activities = [
  {
    device: "Router R1",
    status: "Online",
    color: "text-green-400",
  },
  {
    device: "Router R3",
    status: "High CPU Usage",
    color: "text-yellow-400",
  },
  {
    device: "Host PC-12",
    status: "Offline",
    color: "text-red-400",
  },
  {
    device: "Switch S2",
    status: "Healthy",
    color: "text-green-400",
  },
];

function ActivityPanel() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mt-8">
      <h2 className="text-xl font-semibold text-white mb-5">
        Recent Network Activity
      </h2>

      <div className="space-y-4">
        {activities.map((activity) => (
          <div
            key={activity.device}
            className="flex justify-between items-center border-b border-slate-800 pb-3"
          >
            <span className="text-gray-300">
              {activity.device}
            </span>

            <span className={`font-medium ${activity.color}`}>
              {activity.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ActivityPanel;