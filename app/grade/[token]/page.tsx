'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import ProgressBar from '@/components/ui/ProgressBar';
import StatusBanner from '@/components/StatusBanner';

interface Assignment {
  applicationId: number;
  assignmentId: number;
  rowIndex: number;
  status: string;
}

interface GraderData {
  grader: { id: number; name: string; email: string };
  assignments: Assignment[];
  progress: { completed: number; total: number };
}

export default function GraderHomePage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<GraderData | null>(null);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    fetch(`/api/grader/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError('Network error'));
  }, [token]);

  if (error) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="p-8 max-w-sm w-full text-center">
        <p className="text-4xl mb-4">🔒</p>
        <h2 className="font-semibold text-gray-800 mb-2">Link not found</h2>
        <p className="text-gray-500 text-sm">This grader link is invalid or has expired.</p>
      </Card>
    </div>
  );

  if (!data) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-400 animate-pulse">Loading...</div>
    </div>
  );

  const firstPending = data.assignments.find((a) => a.status === 'pending');
  const allDone = data.progress.completed === data.progress.total;

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-lg mx-auto space-y-6">
        <Card className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xl font-bold">
              {data.grader.name[0].toUpperCase()}
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Hi, {data.grader.name}!</h1>
              <p className="text-sm text-gray-500">{data.grader.email}</p>
            </div>
          </div>
          <ProgressBar value={data.progress.completed} max={data.progress.total} label="Applications graded" />
          {allDone ? (
            <div className="mt-4">
              <StatusBanner message="You've completed all your assigned applications! Thank you." type="success" />
            </div>
          ) : (
            <Button
              className="mt-4 w-full"
              onClick={() => firstPending && router.push(`/grade/${token}/${firstPending.applicationId}`)}
            >
              {data.progress.completed === 0 ? 'Start Grading' : 'Continue Grading'} →
            </Button>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">Your Applications</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {data.assignments.map((a) => (
              <div key={a.assignmentId} className="flex items-center justify-between p-4">
                <span className="text-sm text-gray-700">Application #{a.rowIndex + 1}</span>
                <div className="flex items-center gap-2">
                  <Badge label={a.status === 'completed' ? 'Done' : 'Pending'} color={a.status === 'completed' ? 'green' : 'yellow'} />
                  {a.status === 'pending' && (
                    <Button
                      variant="ghost"
                      className="text-xs py-1 px-2"
                      onClick={() => router.push(`/grade/${token}/${a.applicationId}`)}
                    >
                      Grade →
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
