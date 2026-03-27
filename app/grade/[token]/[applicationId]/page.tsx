'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import ScoreSelector from '@/components/ScoreSelector';
import StatusBanner from '@/components/StatusBanner';

interface AppData {
  applicationId: number;
  assignmentId: number;
  rowIndex: number;
  fields: Record<string, string>;
  existingScores: Record<string, number>;
  existingComment: string;
  csvHeaders: string[];
  scoreFields: string[];
}

export default function GraderScoringPage() {
  const { token, applicationId } = useParams<{ token: string; applicationId: string }>();
  const [appData, setAppData] = useState<AppData | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const router = useRouter();

  useEffect(() => {
    fetch(`/api/grader/${token}/${applicationId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); return; }
        setAppData(d);
        setScores(d.existingScores ?? {});
        setComment(d.existingComment ?? '');
      })
      .catch(() => setError('Network error'));
  }, [token, applicationId]);

  const handleSubmit = async () => {
    if (!appData) return;
    const missing = appData.scoreFields.filter((f) => scores[f] === undefined);
    if (missing.length > 0) {
      setSubmitError(`Please score all fields before submitting.`);
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await fetch(`/api/grader/${token}/${applicationId}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scores, comment }),
      });
      const data = await res.json();
      if (!res.ok) { setSubmitError(data.error); return; }
      if (data.nextApplicationId) {
        router.push(`/grade/${token}/${data.nextApplicationId}`);
      } else {
        router.push(`/grade/${token}`);
      }
    } catch {
      setSubmitError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (error) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="p-8 max-w-sm w-full text-center">
        <p className="text-4xl mb-4">❌</p>
        <p className="text-gray-700">{error}</p>
        <Button className="mt-4" onClick={() => router.push(`/grade/${token}`)}>← Back</Button>
      </Card>
    </div>
  );

  if (!appData) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-400 animate-pulse">Loading...</div>
    </div>
  );

  const contextFields = appData.csvHeaders.filter((h) => !appData.scoreFields.includes(h));
  const scoredCount = appData.scoreFields.filter((f) => scores[f] !== undefined).length;
  const totalScored = appData.scoreFields.length;
  const allScored = scoredCount === totalScored;

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => router.push(`/grade/${token}`)} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
            ← Back
          </button>
          <span className="text-sm font-medium text-gray-700">
            Application #{appData.rowIndex + 1}
          </span>
          <span className="text-xs text-gray-400">{scoredCount}/{totalScored} scored</span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Context fields */}
        {contextFields.length > 0 && (
          <Card className="p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Applicant Info</p>
            <div className="space-y-2">
              {contextFields.map((field) => {
                const val = appData.fields[field] || '—';
                const isUrl = val.startsWith('http://') || val.startsWith('https://');
                return (
                  <div key={field} className="flex gap-2">
                    <span className="text-sm font-medium text-gray-500 min-w-24">{field}:</span>
                    {isUrl ? (
                      <a href={val} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-600 underline break-all">{val}</a>
                    ) : (
                      <span className="text-sm text-gray-800">{val}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Scoreable fields */}
        {appData.scoreFields.map((field) => (
          <Card key={field} className="p-4">
            <div className="mb-3">
              <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-1">{field}</p>
              <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                {appData.fields[field] || <span className="text-gray-400 italic">No response</span>}
              </p>
            </div>
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-500 mb-2">Score (1 = poor, 5 = excellent)</p>
              <ScoreSelector
                value={scores[field] ?? null}
                onChange={(n) => setScores((prev) => ({ ...prev, [field]: n }))}
              />
            </div>
          </Card>
        ))}

        {/* Flags / comments */}
        <Card className="p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Flags / Comments</p>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Any comments or flags for this application"
            rows={3}
            className="w-full text-sm text-gray-800 border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </Card>

        {submitError && <StatusBanner message={submitError} type="error" />}
      </div>

      {/* Sticky submit bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-10">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
          <div className="flex-1">
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div
                className="bg-indigo-600 h-1.5 rounded-full transition-all"
                style={{ width: `${(scoredCount / totalScored) * 100}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">{scoredCount} of {totalScored} fields scored</p>
          </div>
          <Button
            onClick={handleSubmit}
            loading={submitting}
            disabled={!allScored}
            className="min-w-32"
          >
            {allScored ? 'Submit →' : `${totalScored - scoredCount} remaining`}
          </Button>
        </div>
      </div>
    </div>
  );
}
