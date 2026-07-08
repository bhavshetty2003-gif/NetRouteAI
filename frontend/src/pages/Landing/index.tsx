import { Link } from "react-router-dom";
import {
  ArrowRight,
  Bot,
  Activity,
  Network,
  Shield,
} from "lucide-react";

function Landing() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">

      {/* Navbar */}
      <nav className="border-b border-slate-800">
        <div className="max-w-[1500px] mx-auto flex items-center justify-between px-12 py-5">

          <h1 className="text-3xl font-bold text-cyan-400">
            NetRouteAI
          </h1>

          <div className="flex items-center gap-4">

            <Link
              to="/login"
              className="text-gray-300 hover:text-white transition"
            >
              Login
            </Link>

            <Link
              to="/register"
              className="bg-cyan-500 hover:bg-cyan-600 px-6 py-2 rounded-lg font-semibold transition"
            >
              Sign Up
            </Link>

          </div>

        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-[1500px] mx-auto px-12 pt-14 pb-12 grid lg:grid-cols-[1.2fr_0.8fr] gap-12 items-center">

        {/* Left */}
        <div>

          <span className="inline-block bg-cyan-500/10 text-cyan-400 px-5 py-2 rounded-full text-sm">
            AI Powered Network Optimization
          </span>

          <h1 className="mt-8 text-7xl font-black leading-[1.05]">
            Smarter Routing
            <br />
            With Artificial
            <br />
            <span className="text-cyan-400">
              Intelligence
            </span>
          </h1>

          <p className="mt-8 max-w-xl text-xl text-gray-400 leading-9">
            NetRouteAI predicts congestion, reduces latency,
            intelligently selects the best network path,
            and compares AI routing with traditional OSPF
            decisions in real time.
          </p>

          <div className="flex gap-5 mt-10">

            <Link
              to="/login"
              className="bg-cyan-500 hover:bg-cyan-600 transition px-7 py-4 rounded-xl font-semibold flex items-center gap-2 w-fit"
            >
              Get Started
              <ArrowRight size={20} />
            </Link>

            <button className="border border-slate-700 hover:bg-slate-900 transition px-7 py-4 rounded-xl">
              Live Demo
            </button>

          </div>

        </div>

        {/* Right */}
        <div>

          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-10 shadow-2xl">

            <div className="grid grid-cols-2 gap-6">

              <div className="bg-slate-800 rounded-2xl p-6">
                <Activity
                  className="text-green-400 mb-4"
                  size={30}
                />

                <p className="text-gray-400">
                  Latency
                </p>

                <h2 className="text-4xl font-bold mt-3">
                  8 ms
                </h2>
              </div>

              <div className="bg-slate-800 rounded-2xl p-6">
                <Network
                  className="text-cyan-400 mb-4"
                  size={30}
                />

                <p className="text-gray-400">
                  AI Accuracy
                </p>

                <h2 className="text-4xl font-bold mt-3">
                  96%
                </h2>
              </div>

              <div className="bg-slate-800 rounded-2xl p-6">
                <Bot
                  className="text-purple-400 mb-4"
                  size={30}
                />

                <p className="text-gray-400">
                  AI Decisions
                </p>

                <h2 className="text-4xl font-bold mt-3">
                  124
                </h2>
              </div>

              <div className="bg-slate-800 rounded-2xl p-6">
                <Shield
                  className="text-yellow-400 mb-4"
                  size={30}
                />

                <p className="text-gray-400">
                  Packet Loss
                </p>

                <h2 className="text-4xl font-bold mt-3">
                  0.2%
                </h2>
              </div>

            </div>

          </div>

        </div>

      </section>

      {/* Features */}
      <section className="max-w-[1500px] mx-auto px-12 pb-16">

        <h2 className="text-5xl font-bold text-center mb-12">
          Why NetRouteAI?
        </h2>

        <div className="grid lg:grid-cols-3 gap-8">

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 hover:border-cyan-500 transition">
            <Bot
              className="text-cyan-400 mb-6"
              size={40}
            />

            <h3 className="text-2xl font-semibold mb-4">
              AI Decision Making
            </h3>

            <p className="text-gray-400 leading-7">
              Uses multiple network metrics to predict the
              optimal route instead of relying only on the
              shortest path.
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 hover:border-green-500 transition">
            <Activity
              className="text-green-400 mb-6"
              size={40}
            />

            <h3 className="text-2xl font-semibold mb-4">
              Live Monitoring
            </h3>

            <p className="text-gray-400 leading-7">
              Monitor CPU, memory, latency and packet loss
              across the network with live updates.
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 hover:border-purple-500 transition">
            <Network
              className="text-purple-400 mb-6"
              size={40}
            />

            <h3 className="text-2xl font-semibold mb-4">
              Smart Routing
            </h3>

            <p className="text-gray-400 leading-7">
              Compare traditional OSPF routing with
              AI-selected routing using an interactive
              topology.
            </p>
          </div>

        </div>

      </section>

    </div>
  );
}

export default Landing;