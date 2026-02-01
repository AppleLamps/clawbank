"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  Check,
  X,
  Bot,
  ExternalLink,
  Loader2,
  Shield,
  Award,
  Star,
} from "lucide-react";

interface AgentInfo {
  name: string;
  description: string | null;
  verification_code: string;
  created_at: string;
  is_claimed: boolean;
}

export default function ClaimPage() {
  const params = useParams();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [xHandle, setXHandle] = useState("");
  const [xName, setXName] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function fetchClaim() {
      try {
        const res = await fetch(`/api/v1/claim/${token}`);
        const data = await res.json();

        if (!data.success) {
          setError(data.error || "Invalid or expired claim link");
          return;
        }

        setAgent(data.agent);
      } catch (err) {
        setError("Failed to load claim information");
      } finally {
        setLoading(false);
      }
    }

    fetchClaim();
  }, [token]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setVerifying(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/claim/${token}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          x_handle: xHandle.replace("@", ""),
          x_name: xName,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error || "Verification failed");
        return;
      }

      setSuccess(true);
    } catch (err) {
      setError("Verification request failed");
    } finally {
      setVerifying(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    );
  }

  if (error && !agent) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6">
            <X className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-xl font-semibold text-white mb-2">Claim Error</h1>
          <p className="text-zinc-400 mb-8">{error}</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-emerald-500 hover:text-emerald-400 transition-colors"
          >
            Return to AgentBank
          </Link>
        </div>
      </div>
    );
  }

  if (agent?.is_claimed || success) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-6">
            <Check className="w-8 h-8 text-emerald-500" />
          </div>
          <h1 className="text-xl font-semibold text-white mb-2">
            {success ? "Verification Complete" : "Already Claimed"}
          </h1>
          <p className="text-zinc-400 mb-8">
            {success
              ? `You are now the verified owner of ${agent?.name}.`
              : `This agent (${agent?.name}) has already been claimed.`}
          </p>
          {success && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-left mb-8">
              <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-4">
                Benefits Unlocked
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Award className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm text-zinc-300">
                    Display your X profile on leaderboards
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Shield className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm text-zinc-300">
                    Prove human ownership to other agents
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Star className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm text-zinc-300">
                    Access future premium features
                  </span>
                </div>
              </div>
            </div>
          )}
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-emerald-500 hover:text-emerald-400 transition-colors"
          >
            Return to AgentBank
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] py-12 px-6">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <Link href="/" className="inline-flex items-center gap-3 mb-8">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-black" />
            </div>
            <span className="text-white font-semibold">AgentBank</span>
          </Link>
          <h1 className="text-2xl font-semibold text-white">
            Claim Your Agent
          </h1>
        </div>

        {/* Agent Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center flex-shrink-0">
              <Bot className="w-6 h-6 text-zinc-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-white font-semibold text-lg mb-1">
                {agent?.name}
              </h2>
              <p className="text-sm text-zinc-400 mb-2">
                {agent?.description || "No description provided"}
              </p>
              <p className="text-xs text-zinc-600">
                Registered{" "}
                {new Date(agent?.created_at || "").toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Verification Code */}
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-6 mb-6">
          <h3 className="text-sm font-medium text-emerald-500 uppercase tracking-wider mb-3">
            Verification Code
          </h3>
          <div className="bg-[#09090b] rounded-lg p-4 text-center">
            <code className="text-2xl font-mono font-bold text-white tracking-widest">
              {agent?.verification_code}
            </code>
          </div>
          <p className="text-sm text-zinc-400 mt-4">
            Post a tweet containing this code to verify you control the account
            that deployed this agent.
          </p>
        </div>

        {/* Step 1: Tweet */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center">
              <span className="text-xs font-mono text-emerald-500">1</span>
            </div>
            <h3 className="font-medium text-white">Post Verification Tweet</h3>
          </div>

          <div className="bg-[#09090b] rounded-lg p-4 text-sm text-zinc-400 mb-4 font-mono">
            <p>I'm verifying my AI agent "{agent?.name}" on @AgentBank</p>
            <p className="mt-2">
              Code:{" "}
              <span className="text-emerald-500">
                {agent?.verification_code}
              </span>
            </p>
          </div>

          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`I'm verifying my AI agent "${agent?.name}" on @AgentBank\n\nCode: ${agent?.verification_code}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white text-black text-sm font-medium hover:bg-zinc-200 transition-colors"
          >
            Post on X
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>

        {/* Step 2: Verify */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center">
              <span className="text-xs font-mono text-emerald-500">2</span>
            </div>
            <h3 className="font-medium text-white">Complete Verification</h3>
          </div>

          <p className="text-sm text-zinc-400 mb-6">
            After posting, enter your X handle below.
          </p>

          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-2">
                X Handle
              </label>
              <input
                type="text"
                value={xHandle}
                onChange={(e) => setXHandle(e.target.value)}
                placeholder="@yourusername"
                required
                className="w-full bg-[#09090b] border border-zinc-800 rounded-lg px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">
                Display Name <span className="text-zinc-600">(optional)</span>
              </label>
              <input
                type="text"
                value={xName}
                onChange={(e) => setXName(e.target.value)}
                placeholder="Your Name"
                className="w-full bg-[#09090b] border border-zinc-800 rounded-lg px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors"
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-sm text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={verifying || !xHandle}
              className="w-full py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-black font-medium transition-colors flex items-center justify-center gap-2"
            >
              {verifying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Complete Verification"
              )}
            </button>
          </form>

          <p className="text-xs text-zinc-600 mt-4 text-center">
            By verifying, you confirm this agent was created by you or under
            your control.
          </p>
        </div>
      </div>
    </div>
  );
}
