'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import ProgressBar from '@/components/ui/ProgressBar';
import StatusBanner from '@/components/StatusBanner';

interface GraderProgress { id: number; name: string; email: string; total: number; completed: number }
interface AssignmentData { assignmentId: number; graderId: number; graderName: string; status: string; scores: Record<string, number>; total: number | null; comment: string | null }
interface ApplicationData {
  id: number; rowIndex: number; fields: Record<string, string>;
  adminNote: string | null; finalScore: number | null; rank: number | null;
  assignments: AssignmentData[];
  average: number | null;
}
interface DashboardData {
  status: string; progress: { total: number; completed: number };
  graders: GraderProgress[]; applications: ApplicationData[];
  scoreFields: string[]; csvHeaders: string[];
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState<'rowIndex' | 'average'>('rowIndex');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [topN, setTopN] = useState('');
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState('');
  const [resetting, setResetting] = useState(false);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [savingNote, setSavingNote] = useState<number | null>(null);
  const router = useRouter();

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/dashboard');
      if (res.status === 401) { router.push('/admin/login'); return; }
      const json = await res.json();
      if (!res.ok) { setError(json.error); return; }
      setData(json);
      // Seed local note state from server (only for apps not currently being edited)
      setNotes((prev) => {
        const next = { ...prev };
        for (const app of json.applications ?? []) {
          if (!(app.id in next)) next[app.id] = app.adminNote ?? '';
        }
        return next;
      });
    } catch {
      setError('Failed to load data');
    }
  }, [router]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSaveNote = async (appId: number) => {
    setSavingNote(appId);
    await fetch(`/api/admin/applications/${appId}/note`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: notes[appId] ?? '' }),
    });
    setSavingNote(null);
  };

  const handleFinalize = async (force = false) => {
    const n = parseInt(topN, 10);
    if (!n || n < 1) { setFinalizeError('Enter a valid number'); return; }
    setFinalizing(true);
    setFinalizeError('');
    const res = await fetch('/api/admin/finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topN: n, force }),
    });
    const json = await res.json();
    if (!res.ok) {
      if (json.incompleteCount && !force) {
        if (confirm(`${json.incompleteCount} assignments are incomplete. Finalize anyway?`)) {
          setFinalizing(false);
          handleFinalize(true);
          return;
        }
      } else {
        setFinalizeError(json.error);
      }
    } else {
      await fetchData();
      router.push('/admin/dashboard/finalize');
    }
    setFinalizing(false);
  };

  const handleReset = async () => {
    if (!confirm('Reset all data and start a new round? This cannot be undone.')) return;
    setResetting(true);
    const res = await fetch('/api/admin/reset', { method: 'POST' });
    if (res.ok) {
      router.push('/setup');
    } else {
      setResetting(false);
    }
  };

  if (error) return (
    <div className="min-h-screen bg-gray-50 p-8">
      <StatusBanner message={error} type="error" />
    </div>
  );

  if (!data) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-400 animate-pulse">Loading...</div>
    </div>
  );

  const sorted = [...data.applications].sort((a, b) =>
    sortBy === 'average'
      ? (b.average ?? -1) - (a.average ?? -1)
      : a.rowIndex - b.rowIndex
  );

  const contextFields = data.csvHeaders.filter((h) => !data.scoreFields.includes(h));
  const previewField =
    data.csvHeaders.find((h) => h === 'First name') ??
    data.csvHeaders.find((h) => h === 'Email') ??
    contextFields[0] ??
    data.scoreFields[0];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto py-10 px-4 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-gray-500 text-sm mt-1">Monitor grading progress and finalize results</p>
          </div>
          <div className="flex gap-2">
            <Badge label={data.status} color={data.status === 'active' ? 'blue' : data.status === 'finalized' ? 'green' : 'gray'} />
            {data.status === 'active' && (
              <Button variant="ghost" onClick={() => router.push('/admin/assignments')}>Edit Assignments</Button>
            )}
            {data.status === 'finalized' && (
              <Button variant="ghost" onClick={() => router.push('/admin/dashboard/finalize')}>View Results</Button>
            )}
            {data.status === 'finalized' && (
              <Button variant="danger" onClick={handleReset} loading={resetting}>New Round</Button>
            )}
          </div>
        </div>

        {/* Progress */}
        <Card className="p-6">
          <h2 className="font-semibold text-gray-800 mb-4">Overall Progress</h2>
          <ProgressBar value={data.progress.completed} max={data.progress.total} label="Assignments completed" />
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {data.graders.map((g) => (
              <div key={g.id} className="text-center p-3 bg-gray-50 rounded-lg">
                <p className="font-medium text-sm text-gray-800 truncate">{g.name}</p>
                <p className="text-2xl font-bold text-indigo-600 mt-1">{g.completed}<span className="text-sm text-gray-400">/{g.total}</span></p>
                <p className="text-xs text-gray-500">completed</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Applications table */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">Applications ({data.applications.length})</h2>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500">Sort by:</span>
              <button onClick={() => setSortBy('rowIndex')} className={`px-2 py-1 rounded ${sortBy === 'rowIndex' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-100'}`}>Row #</button>
              <button onClick={() => setSortBy('average')} className={`px-2 py-1 rounded ${sortBy === 'average' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-100'}`}>Score</button>
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            {sorted.map((app) => (
              <div key={app.id}>
                <button
                  onClick={() => toggleExpand(app.id)}
                  className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 text-left transition-colors"
                >
                  <span className="text-xs text-gray-400 w-8">#{app.rowIndex + 1}</span>
                  <span className="flex-1 text-sm text-gray-700 truncate">
                    {previewField ? app.fields[previewField] : `Application ${app.rowIndex + 1}`}
                  </span>
                  {app.assignments.map((a) => (
                    <Badge key={a.assignmentId} label={`${a.graderName}: ${a.total !== null ? a.total : '–'}`} color={a.status === 'completed' ? 'green' : 'yellow'} />
                  ))}
                  <span className={`text-sm font-semibold w-16 text-right ${app.average !== null ? 'text-indigo-700' : 'text-gray-300'}`}>
                    {app.average !== null ? app.average.toFixed(2) : '–'}
                  </span>
                  <span className="text-gray-400 text-xs">{expanded.has(app.id) ? '▲' : '▼'}</span>
                </button>
                {expanded.has(app.id) && (
                  <div className="px-4 pb-4 bg-gray-50">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3">
                      {/* Context fields */}
                      {contextFields.length > 0 && (
                        <div className="sm:col-span-2 grid grid-cols-2 gap-2">
                          {contextFields.map((f) => {
                            const val = app.fields[f] || '';
                            const isUrl = val.startsWith('http://') || val.startsWith('https://');
                            return (
                              <div key={f} className="text-xs">
                                <span className="text-gray-400 font-medium">{f}: </span>
                                {isUrl ? (
                                  <a href={val} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">{val}</a>
                                ) : (
                                  <span className="text-gray-700">{val}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {/* Score breakdown per grader */}
                      {app.assignments.map((a) => (
                        <div key={a.assignmentId} className="bg-white rounded-lg p-3 border border-gray-200">
                          <p className="text-xs font-medium text-gray-700 mb-2">{a.graderName} — {a.status === 'completed' ? <span className="text-green-600">Done</span> : <span className="text-yellow-600">Pending</span>}</p>
                          {data.scoreFields.map((field) => (
                            <div key={field} className="flex justify-between text-xs py-0.5">
                              <span className="text-gray-500 truncate mr-2">{field}</span>
                              <span className="font-medium text-gray-800">{a.scores[field] ?? '–'}</span>
                            </div>
                          ))}
                          {a.comment && (
                            <div className="mt-2 pt-2 border-t border-gray-100">
                              <p className="text-xs text-gray-400 font-medium mb-0.5">Comment</p>
                              <p className="text-xs text-gray-700 whitespace-pre-wrap">{a.comment}</p>
                            </div>
                          )}
                        </div>
                      ))}

                      {/* Admin note */}
                      <div className="sm:col-span-2 bg-white rounded-lg p-3 border border-gray-200">
                        <p className="text-xs font-medium text-gray-500 mb-1.5">Admin notes</p>
                        <textarea
                          value={notes[app.id] ?? ''}
                          onChange={(e) => setNotes((prev) => ({ ...prev, [app.id]: e.target.value }))}
                          onBlur={() => handleSaveNote(app.id)}
                          placeholder="Add context or notes about this applicant…"
                          rows={2}
                          className="w-full text-xs text-gray-800 border border-gray-200 rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-400"
                        />
                        {savingNote === app.id && <p className="text-xs text-gray-400 mt-1">Saving…</p>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* Finalize panel */}
        {data.status !== 'finalized' && (
          <Card className="p-6">
            <h2 className="font-semibold text-gray-800 mb-4">Finalize Results</h2>
            {finalizeError && <div className="mb-3"><StatusBanner message={finalizeError} type="error" /></div>}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Select top</label>
                <input
                  type="number"
                  min="1"
                  value={topN}
                  onChange={(e) => setTopN(e.target.value)}
                  placeholder="N"
                  className="w-20 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-600">applicants</span>
              </div>
              <Button onClick={() => handleFinalize(false)} loading={finalizing}>Finalize</Button>
            </div>
            {data.progress.completed < data.progress.total && (
              <p className="text-xs text-yellow-600 mt-2">
                ⚠ {data.progress.total - data.progress.completed} assignments still pending — you can finalize anyway.
              </p>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
