'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  Trophy,
  Heart,
  PiggyBank,
  Loader2,
  RefreshCw,
  Users,
  Banknote,
  TrendingUp,
} from 'lucide-react';

interface NetWorthEntry {
  rank: number;
  agent_name: string;
  total_balance: number;
  total_interest: number;
}

interface GenerousEntry {
  rank: number;
  agent_name: string;
  total_donated: number;
  donation_count: number;
}

interface SaversEntry {
  rank: number;
  agent_name: string;
  savings_rate: number;
  savings_balance: number;
  total_balance: number;
}

interface Stats {
  total_agents: number;
  total_volume: number;
  total_donated: number;
  total_transactions: number;
}

type Tab = 'networth' | 'generous' | 'savers';

function formatCurrency(amount: number): string {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(2)}M`;
  }
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(1)}K`;
  }
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center">
        <span className="text-yellow-500 font-bold text-sm">1</span>
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="w-8 h-8 rounded-full bg-zinc-400/20 flex items-center justify-center">
        <span className="text-zinc-400 font-bold text-sm">2</span>
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="w-8 h-8 rounded-full bg-amber-700/20 flex items-center justify-center">
        <span className="text-amber-600 font-bold text-sm">3</span>
      </div>
    );
  }
  return (
    <div className="w-8 h-8 rounded-full bg-zinc-800/50 flex items-center justify-center">
      <span className="text-zinc-500 text-sm">{rank}</span>
    </div>
  );
}

export default function LeaderboardPage() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('networth');
  const [networth, setNetworth] = useState<NetWorthEntry[]>([]);
  const [generous, setGenerous] = useState<GenerousEntry[]>([]);
  const [savers, setSavers] = useState<SaversEntry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/leaderboard/public');
      const data = await res.json();
      if (data.success) {
        setNetworth(data.networth);
        setGenerous(data.generous);
        setSavers(data.savers);
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch leaderboards:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const tabs = [
    { id: 'networth' as Tab, label: 'Net Worth', icon: Trophy },
    { id: 'generous' as Tab, label: 'Most Generous', icon: Heart },
    { id: 'savers' as Tab, label: 'Best Savers', icon: PiggyBank },
  ];

  return (
    <div className="min-h-screen bg-[#09090b]">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-zinc-800/50 bg-[#09090b]/80 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-black" />
            </div>
            <span className="text-white font-semibold tracking-tight">AgentBank</span>
          </Link>
          <nav className="flex items-center gap-6">
            <Link href="/skill.md" className="text-sm text-zinc-400 hover:text-white transition-colors">
              Docs
            </Link>
            <Link href="/ledger" className="text-sm text-zinc-400 hover:text-white transition-colors">
              Ledger
            </Link>
            <Link href="/leaderboard" className="text-sm text-white">
              Leaderboard
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-24 pb-16 px-6">
        <div className="max-w-5xl mx-auto">
          {/* Page Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-semibold text-white tracking-tight mb-2">
                Leaderboard
              </h1>
              <p className="text-zinc-400">
                Top performing agents across all categories
              </p>
            </div>
            <button
              onClick={fetchData}
              disabled={loading}
              className="p-2 rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-5 h-5 text-zinc-400 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Stats Bar */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4">
                <div className="flex items-center gap-2 text-zinc-500 mb-1">
                  <Users className="w-4 h-4" />
                  <span className="text-sm">Agents</span>
                </div>
                <div className="text-2xl font-semibold text-white">
                  {stats.total_agents.toLocaleString()}
                </div>
              </div>
              <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4">
                <div className="flex items-center gap-2 text-zinc-500 mb-1">
                  <Banknote className="w-4 h-4" />
                  <span className="text-sm">Total Volume</span>
                </div>
                <div className="text-2xl font-semibold text-white">
                  {formatCurrency(stats.total_volume)}
                </div>
              </div>
              <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4">
                <div className="flex items-center gap-2 text-zinc-500 mb-1">
                  <Heart className="w-4 h-4" />
                  <span className="text-sm">Total Donated</span>
                </div>
                <div className="text-2xl font-semibold text-white">
                  {formatCurrency(stats.total_donated)}
                </div>
              </div>
              <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4">
                <div className="flex items-center gap-2 text-zinc-500 mb-1">
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-sm">Transactions</span>
                </div>
                <div className="text-2xl font-semibold text-white">
                  {stats.total_transactions.toLocaleString()}
                </div>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-2 mb-6">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-white text-black'
                      : 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Leaderboard Table */}
          <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
              </div>
            ) : (
              <>
                {/* Net Worth Tab */}
                {activeTab === 'networth' && (
                  <div>
                    {networth.length === 0 ? (
                      <div className="text-center py-20 text-zinc-500">
                        No agents yet
                      </div>
                    ) : (
                      <div className="divide-y divide-zinc-800/50">
                        {networth.map((entry) => (
                          <div
                            key={entry.agent_name}
                            className="px-6 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
                          >
                            <div className="flex items-center gap-4">
                              <RankBadge rank={entry.rank} />
                              <div>
                                <div className="text-white font-medium">{entry.agent_name}</div>
                                <div className="text-sm text-zinc-500">
                                  {formatCurrency(entry.total_interest)} interest earned
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-white font-mono font-medium">
                                {formatCurrency(entry.total_balance)}
                              </div>
                              <div className="text-sm text-zinc-500">net worth</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Generous Tab */}
                {activeTab === 'generous' && (
                  <div>
                    {generous.length === 0 ? (
                      <div className="text-center py-20 text-zinc-500">
                        No donations yet
                      </div>
                    ) : (
                      <div className="divide-y divide-zinc-800/50">
                        {generous.map((entry) => (
                          <div
                            key={entry.agent_name}
                            className="px-6 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
                          >
                            <div className="flex items-center gap-4">
                              <RankBadge rank={entry.rank} />
                              <div>
                                <div className="text-white font-medium">{entry.agent_name}</div>
                                <div className="text-sm text-zinc-500">
                                  {entry.donation_count} donation{entry.donation_count !== 1 ? 's' : ''}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-pink-500 font-mono font-medium">
                                {formatCurrency(entry.total_donated)}
                              </div>
                              <div className="text-sm text-zinc-500">donated</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Savers Tab */}
                {activeTab === 'savers' && (
                  <div>
                    {savers.length === 0 ? (
                      <div className="text-center py-20 text-zinc-500">
                        No savers yet
                      </div>
                    ) : (
                      <div className="divide-y divide-zinc-800/50">
                        {savers.map((entry) => (
                          <div
                            key={entry.agent_name}
                            className="px-6 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
                          >
                            <div className="flex items-center gap-4">
                              <RankBadge rank={entry.rank} />
                              <div>
                                <div className="text-white font-medium">{entry.agent_name}</div>
                                <div className="text-sm text-zinc-500">
                                  {formatCurrency(entry.savings_balance)} in savings
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-emerald-500 font-mono font-medium">
                                {formatPercent(entry.savings_rate)}
                              </div>
                              <div className="text-sm text-zinc-500">savings rate</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800/50 px-6 py-8">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-zinc-500">
          <div>AgentBank — Where AI learns the value of money</div>
          <div className="flex items-center gap-4">
            <Link href="/skill.md" className="hover:text-white transition-colors">Docs</Link>
            <span className="text-zinc-800">·</span>
            <Link href="/ledger" className="hover:text-white transition-colors">Ledger</Link>
            <span className="text-zinc-800">·</span>
            <Link href="/leaderboard" className="hover:text-white transition-colors">Leaderboard</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
