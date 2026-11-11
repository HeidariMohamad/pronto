import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { migrateLocalHistory } from '../services/sync';
import { CloudUpload, CheckCircle2, AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';

export const MigrationProgressModal = () => {
  const { setNeedsMigration, refreshStorage } = useAuth();
  const { t } = useTranslation();
  const [inProgress, setInProgress] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, stage: 'idle', current: 0, total: 0 });
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const startMigration = async () => {
    setInProgress(true);
    setError('');

    try {
      await migrateLocalHistory((status) => {
        setProgress(status);
      });
      setDone(true);
      await refreshStorage();
    } catch (err) {
      console.error('Migration error:', err);
      setError(err.message || 'Failed to complete migration');
    } finally {
      setInProgress(false);
    }
  };

  const handleFinish = () => {
    setNeedsMigration(false);
  };

  const getStageText = () => {
    switch (progress.stage) {
      case 'scanning':
        return `Scanning local history (${progress.totalRecords || 0} days found)...`;
      case 'uploading_records':
        return `Uploading records: ${progress.current || 0} of ${progress.total || 0}...`;
      case 'saving_settings':
        return 'Synchronizing schedules and preferences...';
      case 'done':
        return 'All records successfully backed up!';
      default:
        return 'Preparing sync...';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-md bg-[#0d1520] border border-white/10 rounded-3xl p-6 shadow-2xl text-center space-y-6">
        
        {/* Header Icon */}
        <div className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center transition-all ${
          done ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-[var(--primary)]/20 text-[var(--primary)] border border-[var(--primary)]/30'
        }`}>
          {done ? <CheckCircle2 size={36} /> : inProgress ? <Loader2 size={36} className="animate-spin" /> : <CloudUpload size={36} />}
        </div>

        {/* Title */}
        <div className="space-y-2">
          <h2 className="text-xl font-bold tracking-tight text-white">
            {done ? 'Migration Complete!' : 'Sync Previous History'}
          </h2>
          <p className="text-sm text-slate-300/80 leading-relaxed">
            {done
              ? 'Your past shift records have been saved to your private server.'
              : 'We detected shift history on this device. Upload them now to back them up to your account.'}
          </p>
        </div>

        {/* Progress Bar */}
        {(inProgress || done) && (
          <div className="space-y-2 text-left bg-white/5 p-4 rounded-2xl border border-white/5">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-300 font-medium">{getStageText()}</span>
              <span className="text-[var(--primary)] font-bold">{progress.percent}%</span>
            </div>
            <div className="w-full h-2.5 bg-black/40 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[var(--primary)] to-emerald-400 transition-all duration-300 rounded-full"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-center gap-2 text-xs text-red-300 text-left">
            <AlertTriangle size={16} className="shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="pt-2">
          {!done ? (
            <div className="space-y-3">
              <button
                onClick={startMigration}
                disabled={inProgress}
                className="w-full py-3.5 px-4 bg-[var(--primary)] hover:opacity-90 active:scale-[0.99] text-white font-medium rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-[var(--primary)]/20"
              >
                {inProgress ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Backing Up History...
                  </>
                ) : (
                  <>
                    <CloudUpload size={18} />
                    Back Up History Now
                  </>
                )}
              </button>

              {!inProgress && (
                <button
                  onClick={handleFinish}
                  className="text-xs text-slate-400 hover:text-white transition-colors"
                >
                  Skip for now
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={handleFinish}
              className="w-full py-3.5 px-4 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
            >
              Continue to Pronto
              <ArrowRight size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

