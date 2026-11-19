import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Gift, Trophy, Users, Ticket } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { drawsAPI, formatCurrency, formatDateTime, handleApiError } from '../api/client';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Table from '../components/ui/Table';
import { StatCard } from '../components/ui/StatCard';

const emptyForm = () => ({
  enabled: false,
  title: 'End of year gift draw',
  reason: 'Christmas and end of year gifts for customers who spend the qualifying amount.',
  min_amount: '5000',
  gifts: [],
});

const GiftDraw = () => {
  const [form, setForm] = useState(emptyForm);
  const [giftDraft, setGiftDraft] = useState('');
  const [liveEnabled, setLiveEnabled] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [recent, setRecent] = useState([]);
  const [stats, setStats] = useState({ participant_count: 0, visit_count: 0, pool_amount: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await drawsAPI.board();
      const campaign = data.campaign || {};
      setForm({
        enabled: Boolean(campaign.enabled),
        title: campaign.title || emptyForm().title,
        reason: campaign.reason || '',
        min_amount: String(campaign.min_amount ?? 5000),
        gifts: Array.isArray(campaign.gifts) ? campaign.gifts : [],
      });
      setLiveEnabled(Boolean(campaign.enabled));
      setParticipants(data.participants || []);
      setRecent(data.recent || []);
      setStats({
        participant_count: data.participant_count || 0,
        visit_count: data.visit_count || 0,
        pool_amount: data.pool_amount || 0,
      });
    } catch (error) {
      const { message } = handleApiError(error);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const chartData = useMemo(
    () =>
      participants.slice(0, 8).map((row) => ({
        name: row.customer_name,
        amount: row.total_amount,
        visits: row.visits,
        share: row.amount_percent,
      })),
    [participants]
  );

  const addGift = () => {
    const name = giftDraft.trim();
    if (!name) return;
    setForm((current) => ({ ...current, gifts: [...current.gifts, name].slice(0, 40) }));
    setGiftDraft('');
  };

  const save = async () => {
    const min = Math.round(Number(form.min_amount));
    if (!Number.isFinite(min) || min < 0) {
      toast.error('Enter a valid minimum amount.');
      return;
    }
    setSaving(true);
    try {
      const { data } = await drawsAPI.save({
        enabled: form.enabled,
        title: form.title,
        reason: form.reason,
        min_amount: min,
        gifts: form.gifts,
      });
      setLiveEnabled(Boolean(data.campaign?.enabled));
      toast.success(data.message || 'Gift draw saved');
      await load();
    } catch (error) {
      const { message } = handleApiError(error);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Gift draw</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">
            Turn this on when you want to record customers for Christmas or end-of-year gifts.
            Sales already in the system stay as they are. Recording starts only after you save with the switch on.
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            liveEnabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {liveEnabled ? 'Live on the till' : 'Off — till is unchanged'}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Users} label="People in the draw" value={stats.participant_count} />
        <StatCard icon={Ticket} label="Qualifying visits" value={stats.visit_count} />
        <StatCard icon={Trophy} label="Recorded spend" value={stats.pool_amount} currency />
      </div>

      <Card>
        <div className="mb-4 flex items-center gap-3">
          <Gift className="h-5 w-5 text-primary-600" />
          <h2 className="text-lg font-semibold text-gray-900">Draw settings</h2>
        </div>
        <label className="mb-4 flex items-center gap-3 text-sm font-medium text-gray-800">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={form.enabled}
            onChange={(e) => setForm((current) => ({ ...current, enabled: e.target.checked }))}
          />
          Record customers on qualifying sales
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Draw name"
            value={form.title}
            onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))}
          />
          <Input
            label="Minimum sale amount (UGX)"
            type="number"
            min="0"
            value={form.min_amount}
            onChange={(e) => setForm((current) => ({ ...current, min_amount: e.target.value }))}
          />
        </div>
        <Input
          label="Reason shown to the cashier"
          multiline
          rows={3}
          value={form.reason}
          onChange={(e) => setForm((current) => ({ ...current, reason: e.target.value }))}
          placeholder="Why these customers are being recorded"
        />
        <div className="mb-4">
          <p className="form-label">Gifts you are putting up</p>
          <div className="flex gap-2">
            <input
              className="form-input"
              value={giftDraft}
              placeholder="Example: 10kg rice"
              onChange={(e) => setGiftDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addGift();
                }
              }}
            />
            <Button type="button" variant="secondary" onClick={addGift}>
              Add
            </Button>
          </div>
          {form.gifts.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {form.gifts.map((gift, index) => (
                <li key={`${gift}-${index}`} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                  <span>{gift}</span>
                  <button
                    type="button"
                    className="text-red-600"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        gifts: current.gifts.filter((_, giftIndex) => giftIndex !== index),
                      }))
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-gray-500">No gifts listed yet.</p>
          )}
        </div>
        <Button type="button" onClick={save} loading={saving}>
          Save draw settings
        </Button>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Highest buyers</h2>
          {chartData.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              {loading ? 'Loading…' : 'No qualifying customers yet. Totals appear after the draw is on and a sale meets the minimum.'}
            </p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" interval={0} angle={-25} textAnchor="end" height={70} />
                  <YAxis />
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Bar dataKey="amount" name="Amount" fill="#1D9E75" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Visits on the same ID</h2>
          {chartData.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              Each time the same ID buys at or above the minimum, that visit is added to their total.
            </p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" interval={0} angle={-25} textAnchor="end" height={70} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="visits" name="Visits" fill="#EAB308" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Customers in the draw</h2>
        <Table
          loading={loading}
          data={participants}
          emptyMessage="No customers recorded yet."
          columns={[
            { header: '#', render: (row) => row.rank },
            { header: 'Name', accessor: 'customer_name' },
            { header: 'ID / token', accessor: 'customer_token' },
            { header: 'Times', accessor: 'visits' },
            { header: 'Amount', render: (row) => formatCurrency(row.total_amount) },
            {
              header: 'Share of spend',
              render: (row) => (
                <div className="min-w-[8rem]">
                  <div className="mb-1 text-xs text-gray-600">{row.amount_percent}%</div>
                  <div className="h-2 rounded-full bg-gray-100">
                    <div
                      className="h-2 rounded-full bg-primary-600"
                      style={{ width: `${Math.min(100, row.amount_percent)}%` }}
                    />
                  </div>
                </div>
              ),
            },
            {
              header: 'Share of visits',
              render: (row) => `${row.visit_percent}%`,
            },
            {
              header: 'Last visit',
              render: (row) => (row.last_visit ? formatDateTime(row.last_visit) : '—'),
            },
          ]}
        />
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Recent qualifying sales</h2>
        <Table
          loading={loading}
          data={recent}
          emptyMessage="No qualifying sales recorded."
          columns={[
            { header: 'When', render: (row) => (row.created_at ? formatDateTime(row.created_at) : '—') },
            { header: 'Name', accessor: 'customer_name' },
            { header: 'ID / token', accessor: 'customer_token' },
            { header: 'Amount', render: (row) => formatCurrency(row.amount) },
          ]}
        />
      </Card>
    </div>
  );
};

export default GiftDraw;
