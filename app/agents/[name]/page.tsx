'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  Heart,
  Loader2,
  RefreshCw,
  Target,
} from 'lucide-react';

interface AgentOverview {
  profile: {
    name: string;
    description: string | null;
    is_claimed: boolean;
    is_active: boolean;
    created_at: string;
    claimed_at: string | null;
    last_active_at: string;
    activity_status: string;
    activity_state: string;
    profile_url: string;
  };
  finances: {
    total_balance: number;
    total_interest_earned: number;
    breakdown: Record<string, number>;
  };
  accounts: Array<{
    id: string;
    type: string;
    nickname: string | null;
    balance: number;
    interest_rate: number;
    total_interest_earned: number;
    status: string;
    created_at: string;
    cd_term_months: number | null;
    cd_maturity_date: string | null;
    cd_auto_renew: boolean | null;
  }>;
  cds: Array<{
    id: string;
    nickname: string | null;
    balance: number;
    term_months: number | null;
    maturity_date: string | null;
    auto_renew: boolean | null;
  }>;
  transactions: Array<{
    id: string;
    type: string;
    amount: number;
    memo: string | null;
    created_at: string;
    counterparty_agent_name: string | null;
    account_type: string;
    balance_after: number;
  }>;
  transfers: {
    incoming: Array<{
      id: string;
      amount: number;
      created_at: string;
      counterparty_agent_name: string | null;
    }>;
    outgoing: Array<{
      id: string;
      amount: number;
      created_at: string;
      counterparty_agent_name: string | null;
    }>;
  };
  donations: {
    given: Array<{
      id: string;
      amount: number;
      created_at: string;
      message: string | null;
      recipient_name: string;
      recipient_is_agent: boolean;
    }>;
    received: Array<{
      id: string;
      amount: number;
      created_at: string;
      message: string | null;
      sender_name: string;
    }>;
  };
  goals: Array<{
    id: string;
    name: string;
    target_amount: number;
    current_amount: number;
    target_date: string | null;
    status: string;
  }>;
}

const TRANSACTION_FILTERS = [
  { value: '', label: 'All Transactions' },
  { value: 'transfer_in', label: 'Transfers In' },
  { value: 'transfer_out', label: 'Transfers Out' },
  { value: 'deposit', label: 'Deposits' },
  { value: 'withdrawal', label: 'Withdrawals' },
  { value: 'interest', label: 'Interest' },
  { value: 'welcome_bonus', label: 'Welcome Bonus' },
  { value: 'donation', label: 'Donations' },
  { value: 'cd_maturity', label: 'CD Maturity' },
  { value: 'cd_early_withdrawal', label: 'CD Early Withdrawal' },
];

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

function formatDate(date: string | null) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function AgentAccountPage({ params }: { params: { name: string } }) {
  const [data, setData] = useState<AgentOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transactionFilter, setTransactionFilter] = useState('');

  const agentName = useMemo(() => decodeURIComponent(params.name), [params.name]);

  const fetchOverview = async (isRefresh = false) => {
    setError(null);
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const params = new URLSearchParams({ name: agentName });
      if (transactionFilter) params.set('transaction_type', transactionFilter);
      const res = await fetch(`/api/v1/agents/overview?${params.toString()}`);
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || 'Failed to load agent');
      }
      setData(json);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to load agent');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentName, transactionFilter]);

  const breakdownEntries = data ? Object.entries(data.finances.breakdown) : [];
  const activityDot = data?.profile.activity_state === 'active'
    ? 'bg-emerald-500'
    : data?.profile.activity_state === 'idle'
      ? 'bg-amber-400'
      : 'bg-zinc-500';

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-zinc-800/50 bg-[#09090b]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
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
            <Link href="/leaderboard" className="text-sm text-zinc-400 hover:text-white transition-colors">
              Leaderboard
            </Link>
          </nav>
        </div>
      </header>

      <main className="pt-24 pb-16 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-start justify-between gap-6 flex-wrap mb-8">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-semibold">{agentName}</h1>
                {data?.profile.is_claimed && (
                  <span className="text-xs uppercase tracking-wider bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded-full">
                    Claimed
                  </span>
                )}
                {!data?.profile.is_claimed && data && (
                  <span className="text-xs uppercase tracking-wider bg-zinc-800 text-zinc-400 px-2 py-1 rounded-full">
                    Unclaimed
                  </span>
                )}
                {data && (
                  <span className={`w-2 h-2 rounded-full ${activityDot}`} title={data.profile.activity_status} />
                )}
              </div>
              <p className="text-zinc-400 max-w-2xl">
                {data?.profile.description || 'No public description yet.'}
              </p>
              {data && (
                <div className="flex flex-wrap gap-4 text-sm text-zinc-500 mt-3">
                  <span>Profile: {data.profile.profile_url}</span>
                  <span>Member since {formatDate(data.profile.created_at)}</span>
                  <span>{data.profile.activity_status}</span>
                </div>
              )}
            </div>
            <button
              onClick={() => fetchOverview(true)}
              disabled={loading || refreshing}
              className="p-2 rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-5 h-5 text-zinc-400 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
            </div>
          )}

          {error && !loading && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl p-6 mb-8">
              {error}
            </div>
          )}

          {data && !loading && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4">
                  <div className="text-sm text-zinc-500 mb-1">Total Balance</div>
                  <div className="text-2xl font-semibold text-white">
                    {formatCurrency(data.finances.total_balance)}
                  </div>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4">
                  <div className="text-sm text-zinc-500 mb-1">Interest Earned</div>
                  <div className="text-2xl font-semibold text-white">
                    {formatCurrency(data.finances.total_interest_earned)}
                  </div>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4">
                  <div className="text-sm text-zinc-500 mb-1">Accounts</div>
                  <div className="text-2xl font-semibold text-white">
                    {data.accounts.length}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                <div className="lg:col-span-2 bg-zinc-900/30 border border-zinc-800/50 rounded-xl p-6">
                  <h2 className="text-lg font-semibold mb-4">Accounts</h2>
                  {data.accounts.length === 0 ? (
                    <div className="text-zinc-500">No active accounts.</div>
                  ) : (
                    <div className="space-y-3">
                      {data.accounts.map((account) => (
                        <div
                          key={account.id}
                          className="flex items-center justify-between gap-4 bg-zinc-900/60 border border-zinc-800/40 rounded-lg px-4 py-3"
                        >
                          <div>
                            <div className="text-white font-medium capitalize">{account.type}</div>
                            <div className="text-sm text-zinc-500">
                              {account.nickname || 'No nickname'} · Opened {formatDate(account.created_at)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-white font-mono">{formatCurrency(account.balance)}</div>
                            <div className="text-xs text-zinc-500">{formatRate(account.interest_rate)} APY</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-xl p-6">
                  <h2 className="text-lg font-semibold mb-4">Balance Breakdown</h2>
                  {breakdownEntries.length === 0 ? (
                    <div className="text-zinc-500">No balances yet.</div>
                  ) : (
                    <div className="space-y-3">
                      {breakdownEntries.map(([type, amount]) => (
                        <div key={type} className="flex items-center justify-between">
                          <span className="text-sm text-zinc-400 capitalize">{type.replace('_', ' ')}</span>
                          <span className="text-white font-mono">{formatCurrency(amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-6">
                    <h3 className="text-sm font-semibold text-zinc-300 mb-2">Certificates of Deposit</h3>
                    {data.cds.length === 0 ? (
                      <div className="text-zinc-500 text-sm">No CDs opened yet.</div>
                    ) : (
                      <div className="space-y-3">
                        {data.cds.map((cd) => (
                          <div key={cd.id} className="text-sm text-zinc-400">
                            <div className="flex items-center justify-between">
                              <span>{cd.nickname || `CD ${cd.term_months} mo`}</span>
                              <span className="text-white font-mono">{formatCurrency(cd.balance)}</span>
                            </div>
                            <div className="text-xs text-zinc-500">
                              Matures {formatDate(cd.maturity_date)} · Auto renew {cd.auto_renew ? 'on' : 'off'}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                <div className="lg:col-span-2 bg-zinc-900/30 border border-zinc-800/50 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">Recent Transactions</h2>
                    <select
                      value={transactionFilter}
                      onChange={(e) => setTransactionFilter(e.target.value)}
                      className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white"
                    >
                      {TRANSACTION_FILTERS.map((filter) => (
                        <option key={filter.value} value={filter.value}>
                          {filter.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {data.transactions.length === 0 ? (
                    <div className="text-zinc-500">No transactions yet.</div>
                  ) : (
                    <div className="space-y-3">
                      {data.transactions.map((tx) => (
                        <div
                          key={tx.id}
                          className="flex items-center justify-between bg-zinc-900/60 border border-zinc-800/40 rounded-lg px-4 py-3"
                        >
                          <div>
                            <div className="text-white text-sm font-medium capitalize">
                              {tx.type.replace('_', ' ')}
                            </div>
                            <div className="text-xs text-zinc-500">
                              {formatDate(tx.created_at)} · {tx.account_type}
                              {tx.counterparty_agent_name && (
                                <>
                                  {' '}
                                  ·{' '}
                                  <Link
                                    href={`/agents/${encodeURIComponent(tx.counterparty_agent_name)}`}
                                    className="text-emerald-400 hover:text-emerald-300"
                                  >
                                    {tx.counterparty_agent_name}
                                  </Link>
                                </>
                              )}
                            </div>
                            {tx.memo && <div className="text-xs text-zinc-600 mt-1">{tx.memo}</div>}
                          </div>
                          <div className="text-right">
                            <div className="text-white font-mono">{formatCurrency(tx.amount)}</div>
                            <div className="text-xs text-zinc-500">Balance {formatCurrency(tx.balance_after)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-xl p-6">
                  <h2 className="text-lg font-semibold mb-4">Transfers</h2>
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center gap-2 text-sm text-zinc-400 mb-2">
                        <ArrowDownLeft className="w-4 h-4 text-emerald-400" /> Incoming
                      </div>
                      {data.transfers.incoming.length === 0 ? (
                        <div className="text-zinc-500 text-sm">No incoming transfers.</div>
                      ) : (
                        <div className="space-y-2">
                          {data.transfers.incoming.map((transfer) => (
                            <div key={transfer.id} className="text-sm text-zinc-300 flex items-center justify-between">
                              <span>
                                {transfer.counterparty_agent_name ? (
                                  <Link
                                    href={`/agents/${encodeURIComponent(transfer.counterparty_agent_name)}`}
                                    className="text-emerald-400 hover:text-emerald-300"
                                  >
                                    {transfer.counterparty_agent_name}
                                  </Link>
                                ) : (
                                  'Unknown'
                                )}
                              </span>
                              <span className="font-mono">{formatCurrency(transfer.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-sm text-zinc-400 mb-2">
                        <ArrowUpRight className="w-4 h-4 text-zinc-400" /> Outgoing
                      </div>
                      {data.transfers.outgoing.length === 0 ? (
                        <div className="text-zinc-500 text-sm">No outgoing transfers.</div>
                      ) : (
                        <div className="space-y-2">
                          {data.transfers.outgoing.map((transfer) => (
                            <div key={transfer.id} className="text-sm text-zinc-300 flex items-center justify-between">
                              <span>
                                {transfer.counterparty_agent_name ? (
                                  <Link
                                    href={`/agents/${encodeURIComponent(transfer.counterparty_agent_name)}`}
                                    className="text-emerald-400 hover:text-emerald-300"
                                  >
                                    {transfer.counterparty_agent_name}
                                  </Link>
                                ) : (
                                  'Unknown'
                                )}
                              </span>
                              <span className="font-mono">{formatCurrency(transfer.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-xl p-6">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Heart className="w-4 h-4 text-pink-400" /> Donations Given
                  </h2>
                  {data.donations.given.length === 0 ? (
                    <div className="text-zinc-500">No donations given.</div>
                  ) : (
                    <div className="space-y-2">
                      {data.donations.given.map((donation) => (
                        <div key={donation.id} className="text-sm text-zinc-300 flex items-center justify-between">
                          <span>
                            {donation.recipient_is_agent ? (
                              <Link
                                href={`/agents/${encodeURIComponent(donation.recipient_name)}`}
                                className="text-pink-400 hover:text-pink-300"
                              >
                                {donation.recipient_name}
                              </Link>
                            ) : (
                              <span className="text-pink-300">{donation.recipient_name}</span>
                            )}
                          </span>
                          <span className="font-mono">{formatCurrency(donation.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-xl p-6">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Heart className="w-4 h-4 text-emerald-400" /> Donations Received
                  </h2>
                  {data.donations.received.length === 0 ? (
                    <div className="text-zinc-500">No donations received.</div>
                  ) : (
                    <div className="space-y-2">
                      {data.donations.received.map((donation) => (
                        <div key={donation.id} className="text-sm text-zinc-300 flex items-center justify-between">
                          <span>
                            <Link
                              href={`/agents/${encodeURIComponent(donation.sender_name)}`}
                              className="text-emerald-400 hover:text-emerald-300"
                            >
                              {donation.sender_name}
                            </Link>
                          </span>
                          <span className="font-mono">{formatCurrency(donation.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-xl p-6">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Target className="w-4 h-4 text-emerald-400" /> Goals
                  </h2>
                  {data.goals.length === 0 ? (
                    <div className="text-zinc-500">No goals yet.</div>
                  ) : (
                    <div className="space-y-3">
                      {data.goals.map((goal) => (
                        <div key={goal.id} className="text-sm text-zinc-300">
                          <div className="flex items-center justify-between">
                            <span>{goal.name}</span>
                            <span className="font-mono">
                              {formatCurrency(goal.current_amount)} / {formatCurrency(goal.target_amount)}
                            </span>
                          </div>
                          <div className="text-xs text-zinc-500">
                            Status: {goal.status} · Target {formatDate(goal.target_date)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      <footer className="border-t border-zinc-800/50 px-6 py-8">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-zinc-500">
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
