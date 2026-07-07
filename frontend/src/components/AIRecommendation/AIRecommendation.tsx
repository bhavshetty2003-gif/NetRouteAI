function AIRecommendation() {
  return (
    <div className="bg-slate-900 border border-cyan-500 rounded-2xl p-6 mt-8">
      <h2 className="text-xl font-semibold text-cyan-400 mb-4">
        AI Routing Recommendation
      </h2>

      <p className="text-gray-300">
        AI recommends routing traffic through
        <span className="text-cyan-400 font-semibold">
          {" "}Router R5
        </span>
        {" "}instead of the shortest OSPF path because it has lower latency,
        lower CPU usage, and no predicted congestion.
      </p>
    </div>
  );
}

export default AIRecommendation;