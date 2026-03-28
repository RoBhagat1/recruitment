'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import StatusBanner from '@/components/StatusBanner';

interface AssignmentEntry {
  assignmentId: number;
  applicationId: number;
  rowIndex: number;
  fields: Record<string, string>;
  status: string;
}

interface GraderData {
  id: number;
  name: string;
  email: string;
  total: number;
  completed: number;
  assignments: AssignmentEntry[];
}

interface AssignmentsData {
  graders: GraderData[];
  csvHeaders: string[];
  scoreFields: string[];
  status: string;
}

export default function AssignmentsPage() {
  const [data, setData] = useState<AssignmentsData | null>(null);
  const [error, setError] = useState('');
  const [reassigning, setReassigning] = useState<number | null>(null); // assignmentId
  const [successMsg, setSuccessMsg] = useState('');
  const router = useRouter();

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/assignments');
      if (res.status === 401) { router.push('/admin/login'); return; }
      const json = await res.json();
      if (!res.ok) { setError(json.error); return; }
      setData(json);
    } catch {
      setError('Failed to load assignments');
    }
  }, [router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleReassign = async (assignmentId: number, graderName: string, appLabel: string) => {
    if (!confirm(`Remove "${appLabel}" from ${graderName} and assign it to someone else?`)) return;
    setReassigning(assignmentId);
    setSuccessMsg('');
    try {
      const res = await fetch('/api/admin/assignments/reassign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error); return; }
      setSuccessMsg(`Reassigned to ${json.newGraderName}`);
      await fetchData();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setReassigning(null);
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

  const contextFields = data.csvHeaders.filter((h) => !data.scoreFields.includes(h));
  const nameField =
    data.csvHeaders.find((h) => h === 'Full Name') ??
    data.csvHeaders.find((h) => h === 'First name') ??
    data.csvHeaders.find((h) => h === 'Email') ??
    contextFields[0];

  const getAppLabel = (fields: Record<string, string>, rowIndex: number) =>
    nameField ? (fields[nameField] || `Application #${rowIndex + 1}`) : `Application #${rowIndex + 1}`;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto py-10 px-4 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Edit Assignments</h1>
            <p className="text-gray-500 text-sm mt-1">
              Reassign pending applications between graders. Completed assignments cannot be moved.
            </p>
          </div>
          <Button variant="secondary" onClick={() => router.push('/admin/dashboard')}>← Dashboard</Button>
        </div>

        {successMsg && (
          <StatusBanner message={successMsg} type="success" />
        )}

        {/* Summary row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {data.graders.map((g) => (
            <Card key={g.id} className="p-4 text-center">
              <p className="font-medium text-sm text-gray-800 truncate">{g.name}</p>
              <p className="text-2xl font-bold text-indigo-600 mt-1">{g.total}</p>
              <p className="text-xs text-gray-500">assignments</p>
              {g.completed > 0 && (
                <p className="text-xs text-green-600 mt-1">{g.completed} done</p>
              )}
            </Card>
          ))}
        </div>

        {/* Per-grader assignment lists */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {data.graders.map((grader) => (
            <Card key={grader.id} className="overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-800">{grader.name}</p>
                  <p className="text-xs text-gray-400">{grader.email}</p>
                </div>
                <Badge
                  label={`${grader.total} apps`}
                  color="blue"
                />
              </div>
              <div className="divide-y divide-gray-50">
                {grader.assignments.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-6">No assignments</p>
                )}
                {grader.assignments.map((a) => {
                  const label = getAppLabel(a.fields, a.rowIndex);
                  const isDone = a.status === 'completed';
                  return (
                    <div
                      key={a.assignmentId}
                      className={`flex items-center gap-3 px-4 py-2.5 ${isDone ? 'bg-green-50/40' : ''}`}
                    >
                      <span className="text-xs text-gray-400 w-6 shrink-0">#{a.rowIndex + 1}</span>
                      <span className={`flex-1 text-sm truncate ${isDone ? 'text-gray-400' : 'text-gray-800'}`}>
                        {label}
                      </span>
                      {isDone ? (
                        <Badge label="Done" color="green" />
                      ) : (
                        <button
                          onClick={() => handleReassign(a.assignmentId, grader.name, label)}
                          disabled={reassigning === a.assignmentId}
                          className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-colors disabled:opacity-40 shrink-0"
                          title="Reassign to another grader"
                        >
                          {reassigning === a.assignmentId ? '...' : 'Reassign'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
