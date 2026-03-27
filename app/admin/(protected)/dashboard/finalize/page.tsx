'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';

interface ApplicationData {
  id: number; rowIndex: number; fields: Record<string, string>;
  finalScore: number | null; rank: number | null;
  assignments: Array<{ graderName: string; total: number | null; status: string }>;
  average: number | null;
}

interface NormalizationFactor {
  graderId: number; graderName: string; rawMean: number; adjustment: number;
}

interface DashboardData {
  status: string; applications: ApplicationData[];
  csvHeaders: string[]; scoreFields: string[];
  normalizationFactors: NormalizationFactor[] | null;
}

export default function FinalizePage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/admin/dashboard')
      .then((r) => r.json())
      .then((d) => {
        if (d.status !== 'finalized') router.push('/admin/dashboard');
        else setData(d);
      });
  }, [router]);

  if (!data) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-400 animate-pulse">Loading...</div>
    </div>
  );

  const ranked = [...data.applications]
    .filter((a) => a.rank !== null)
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));

  const unranked = data.applications.filter((a) => a.rank === null);

  // Detect ties: applications sharing the same rank
  const rankCounts: Record<number, number> = {};
  for (const app of ranked) {
    if (app.rank !== null) rankCounts[app.rank] = (rankCounts[app.rank] ?? 0) + 1;
  }

  const contextFields = data.csvHeaders.filter((h) => !data.scoreFields.includes(h));
  const nameField =
    data.csvHeaders.find((h) => h === 'First name') ??
    data.csvHeaders.find((h) => h === 'Email') ??
    contextFields[0];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-10 px-4 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Final Results</h1>
            <p className="text-gray-500 text-sm mt-1">{ranked.length} applications ranked</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => router.push('/admin/dashboard')}>← Dashboard</Button>
            <a href="/api/admin/export" download>
              <Button variant="secondary">Export CSV</Button>
            </a>
          </div>
        </div>

        {/* Grader calibration */}
        {data.normalizationFactors && data.normalizationFactors.length > 0 && (
          <Card className="p-5">
            <p className="text-sm font-semibold text-gray-700 mb-3">Grader Calibration Applied</p>
            <p className="text-xs text-gray-500 mb-3">
              Scores were normalized so that harder and easier graders are weighted equally.
              Each grader&apos;s scores were shifted by the difference between their personal mean and the group mean.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {data.normalizationFactors.map((f) => (
                <div key={f.graderId} className="bg-gray-50 rounded-lg p-3 text-xs">
                  <p className="font-medium text-gray-800 truncate">{f.graderName}</p>
                  <p className="text-gray-500 mt-0.5">Avg score: {f.rawMean.toFixed(2)}</p>
                  <p className={`font-semibold mt-0.5 ${f.adjustment > 0.05 ? 'text-blue-600' : f.adjustment < -0.05 ? 'text-orange-600' : 'text-gray-500'}`}>
                    {f.adjustment > 0.05 ? `+${f.adjustment.toFixed(2)} (harder grader)` :
                     f.adjustment < -0.05 ? `${f.adjustment.toFixed(2)} (easier grader)` :
                     'No adjustment'}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Tie warning */}
        {Object.values(rankCounts).some((c) => c > 1) && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="font-medium text-yellow-800">Ties detected</p>
              <p className="text-sm text-yellow-700">Highlighted rows share the same score. Manual review may be needed to break ties.</p>
            </div>
          </div>
        )}

        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left p-4 font-medium text-gray-600 w-16">Rank</th>
                <th className="text-left p-4 font-medium text-gray-600">Applicant</th>
                <th className="text-left p-4 font-medium text-gray-600">Graders</th>
                <th className="text-right p-4 font-medium text-gray-600 w-24">Avg Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ranked.map((app) => {
                const isTied = app.rank !== null && (rankCounts[app.rank] ?? 0) > 1;
                return (
                  <tr key={app.id} className={`${isTied ? 'bg-yellow-50' : 'hover:bg-gray-50'} transition-colors`}>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                          ${app.rank === 1 ? 'bg-yellow-400 text-white' :
                            app.rank === 2 ? 'bg-gray-300 text-white' :
                            app.rank === 3 ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                          {app.rank}
                        </span>
                        {isTied && <Badge label="TIE" color="orange" />}
                      </div>
                    </td>
                    <td className="p-4">
                      <p className="font-medium text-gray-800">
                        {nameField ? app.fields[nameField] : `Application #${app.rowIndex + 1}`}
                      </p>
                      {contextFields.filter((f) => f !== nameField).slice(0, 2).map((f) => (
                        <p key={f} className="text-xs text-gray-500">{app.fields[f]}</p>
                      ))}
                    </td>
                    <td className="p-4">
                      <div className="flex gap-2 flex-wrap">
                        {app.assignments.map((a, i) => (
                          <Badge
                            key={i}
                            label={`${a.graderName}: ${a.total ?? '–'}`}
                            color={a.status === 'completed' ? 'green' : 'yellow'}
                          />
                        ))}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <span className="text-lg font-bold text-indigo-700">
                        {app.finalScore !== null ? app.finalScore.toFixed(2) : '–'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        {unranked.length > 0 && (
          <p className="text-sm text-gray-400 text-center">{unranked.length} applications had no scores recorded.</p>
        )}
      </div>
    </div>
  );
}
