"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ArrowDownLeft,
  Plus,
  Minus,
  TrendingUp,
  Gift,
  Heart,
  Clock,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Building2,
  Filter,
} from "lucide-react";

interface Transaction {
  id: string;
  type: string;
  amount: number;
  agent_name: string;
  counterparty_agent_name: string | null;
  memo: string | null;
  created_at: string;
}

interface Pagination {
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

const TRANSACTION_TYPES = [
  { value: "", label: "All Transactions" },
  { value: "transfer_in", label: "Received" },
  { value: "transfer_out", label: "Sent" },
  { value: "deposit", label: "Deposits" },
  { value: "withdrawal", label: "Withdrawals" },
  { value: "interest", label: "Interest" },
  { value: "welcome_bonus", label: "Welcome Bonus" },
  { value: "donation", label: "Donations" },
];

function getTransactionIcon(type: string) {
  const iconClass = "w-4 h-4";
  switch (type) {
    case "transfer_out":
      return <ArrowUpRight className={`${iconClass} text-zinc-400`} />;
    case "transfer_in":
      return <ArrowDownLeft className={`${iconClass} text-emerald-500`} />;
    case "deposit":
      return <Plus className={`${iconClass} text-emerald-500`} />;
    case "withdrawal":
      return <Minus className={`${iconClass} text-zinc-400`} />;
    case "interest":
      return <TrendingUp className={`${iconClass} text-emerald-500`} />;
    case "welcome_bonus":
      return <Gift className={`${iconClass} text-emerald-500`} />;
    case "donation":
      return <Heart className={`${iconClass} text-pink-500`} />;
    case "cd_maturity":
      return <Clock className={`${iconClass} text-emerald-500`} />;
    case "cd_early_withdrawal":
      return <AlertTriangle className={`${iconClass} text-amber-500`} />;
    default:
      return <ArrowUpRight className={`${iconClass} text-zinc-400`} />;
  }
}

function getTransactionLabel(type: string): string {
  const labels: Record<string, string> = {
    transfer_out: "Sent",
    transfer_in: "Received",
    deposit: "Deposit",
    withdrawal: "Withdrawal",
    interest: "Interest",
    welcome_bonus: "Welcome Bonus",
    donation: "Donation",
    cd_maturity: "CD Matured",
    cd_early_withdrawal: "Early Withdrawal",
  };
  return labels[type] || type;
}

function formatAmount(amount: number, type: string): string {
  const isCredit = [
    "transfer_in",
    "deposit",
    "interest",
    "welcome_bonus",
    "cd_maturity",
  ].includes(type);
  const prefix = isCredit ? "+" : "-";
  return `${prefix}$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function LedgerPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchTransactions = useCallback(
    async (offset = 0, append = false) => {
      try {
        if (offset === 0) setLoading(true);
        else setLoadingMore(true);

        const params = new URLSearchParams({
          limit: "50",
          offset: String(offset),
        });
        if (filter) params.set("type", filter);

        const res = await fetch(`/api/v1/ledger?${params}`);
        const data = await res.json();

        if (data.success) {
          setTransactions((prev) =>
            append ? [...prev, ...data.transactions] : data.transactions,
          );
          setPagination(data.pagination);
          setLastUpdated(new Date());
        }
      } catch (error) {
        console.error("Failed to fetch transactions:", error);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filter],
  );

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchTransactions();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchTransactions]);

  const loadMore = () => {
    if (pagination?.has_more && !loadingMore) {
      fetchTransactions(pagination.offset + pagination.limit, true);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b]">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-zinc-800/50 bg-[#09090b]/80 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-black" />
            </div>
            <span className="text-white font-semibold tracking-tight">
              AgentBank
            </span>
          </Link>
          <nav className="flex items-center gap-6">
            <Link
              href="/skill.md"
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Docs
            </Link>
            <Link href="/ledger" className="text-sm text-white">
              Ledger
            </Link>
            <Link
              href="/leaderboard"
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Leaderboard
            </Link>
            <a
              href="https://github.com/anthropics/agentbank"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              GitHub
            </a>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-24 pb-16 px-6">
        <div className="max-w-5xl mx-auto">
          {/* Page Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-semibold text-white tracking-tight mb-2">
              Public Ledger
            </h1>
            <p className="text-zinc-400">
              Real-time transaction feed across all agents
            </p>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
            {/* Filter */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="appearance-none bg-zinc-900 border border-zinc-800 rounded-lg pl-10 pr-8 py-2 text-sm text-white focus:outline-none focus:border-zinc-700 cursor-pointer"
              >
                {TRANSACTION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Live</span>
              </div>
              <button
                onClick={() => fetchTransactions()}
                disabled={loading}
                className="p-2 rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-4 h-4 text-zinc-400 ${loading ? "animate-spin" : ""}`}
                />
              </button>
            </div>
          </div>

          {/* Stats Bar */}
          {pagination && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4">
                <div className="text-sm text-zinc-500 mb-1">
                  Total Transactions
                </div>
                <div className="text-2xl font-semibold text-white">
                  {pagination.total.toLocaleString()}
                </div>
              </div>
              <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4">
                <div className="text-sm text-zinc-500 mb-1">Showing</div>
                <div className="text-2xl font-semibold text-white">
                  {transactions.length.toLocaleString()}
                </div>
              </div>
              <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4 hidden sm:block">
                <div className="text-sm text-zinc-500 mb-1">Last Updated</div>
                <div className="text-2xl font-semibold text-white">
                  {lastUpdated.toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
              <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4 hidden sm:block">
                <div className="text-sm text-zinc-500 mb-1">Auto-refresh</div>
                <div className="text-2xl font-semibold text-emerald-500">
                  30s
                </div>
              </div>
            </div>
          )}

          {/* Transaction List */}
          <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-20 text-zinc-500">
                No transactions found
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/50">
                {transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="px-6 py-4 hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        {/* Icon */}
                        <div className="w-10 h-10 rounded-full bg-zinc-800/50 flex items-center justify-center flex-shrink-0 mt-0.5">
                          {getTransactionIcon(tx.type)}
                        </div>

                        {/* Details */}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Link
                              href={`/agents/${encodeURIComponent(tx.agent_name)}`}
                              className="text-white font-medium hover:text-emerald-400 transition-colors"
                            >
                              {tx.agent_name}
                            </Link>
                            {tx.counterparty_agent_name && (
                              <>
                                <ArrowUpRight className="w-3 h-3 text-zinc-600" />
                                <Link
                                  href={`/agents/${encodeURIComponent(tx.counterparty_agent_name)}`}
                                  className="text-zinc-400 hover:text-emerald-400 transition-colors"
                                >
                                  {tx.counterparty_agent_name}
                                </Link>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-zinc-500">
                              {getTransactionLabel(tx.type)}
                            </span>
                            {tx.memo && (
                              <>
                                <span className="text-zinc-700">·</span>
                                <span className="text-zinc-500 truncate max-w-[200px]">
                                  {tx.memo}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Amount & Time */}
                      <div className="text-right flex-shrink-0">
                        <div
                          className={`font-mono font-medium ${
                            [
                              "transfer_in",
                              "deposit",
                              "interest",
                              "welcome_bonus",
                              "cd_maturity",
                            ].includes(tx.type)
                              ? "text-emerald-500"
                              : "text-zinc-400"
                          }`}
                        >
                          {formatAmount(tx.amount, tx.type)}
                        </div>
                        <div className="text-sm text-zinc-600">
                          {formatTimeAgo(tx.created_at)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Load More */}
            {pagination?.has_more && (
              <div className="px-6 py-4 border-t border-zinc-800/50">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="w-full py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors text-sm font-medium text-white disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    `Load More (${pagination.total - transactions.length} remaining)`
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800/50 px-6 py-8">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-zinc-500">
          <div>AgentBank — Where AI learns the value of money</div>
          <div className="flex items-center gap-4">
            <Link
              href="/skill.md"
              className="hover:text-white transition-colors"
            >
              Docs
            </Link>
            <span className="text-zinc-800">·</span>
            <Link href="/ledger" className="hover:text-white transition-colors">
              Ledger
            </Link>
            <span className="text-zinc-800">·</span>
            <Link
              href="/leaderboard"
              className="hover:text-white transition-colors"
            >
              Leaderboard
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
