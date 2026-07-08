import { Link, useNavigate } from "react-router-dom";
import { UserPlus } from "lucide-react";
import { useState } from "react";

function Register() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !email.trim() || !password.trim()) {
      alert("Please fill all fields.");
      return;
    }

    const existingUser = JSON.parse(
      localStorage.getItem("user") || "{}"
    );

    if (existingUser.email === email) {
      alert("An account with this email already exists.");
      return;
    }

    localStorage.setItem(
      "user",
      JSON.stringify({
        name,
        email,
        password,
      })
    );

    alert("Account created successfully!");

    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-6">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl">

        <div className="flex justify-center mb-6">
          <div className="bg-cyan-500/10 p-4 rounded-full">
            <UserPlus className="text-cyan-400" size={36} />
          </div>
        </div>

        <h1 className="text-3xl font-bold text-center text-white">
          Create Account
        </h1>

        <p className="text-center text-gray-400 mt-2">
          Join NetRouteAI today
        </p>

        <form
          onSubmit={handleRegister}
          className="mt-8 space-y-5"
        >
          <div>
            <label className="text-gray-300 text-sm">
              Full Name
            </label>

            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Doe"
              className="mt-2 w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label className="text-gray-300 text-sm">
              Email
            </label>

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="john@example.com"
              className="mt-2 w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label className="text-gray-300 text-sm">
              Password
            </label>

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create a password"
              className="mt-2 w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white outline-none focus:border-cyan-400"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-cyan-500 hover:bg-cyan-600 transition py-3 rounded-xl font-semibold"
          >
            Create Account
          </button>
        </form>

        <p className="text-center text-gray-400 mt-6">
          Already have an account?{" "}
          <Link
            to="/login"
            className="text-cyan-400 hover:underline"
          >
            Login
          </Link>
        </p>

      </div>
    </div>
  );
}

export default Register;