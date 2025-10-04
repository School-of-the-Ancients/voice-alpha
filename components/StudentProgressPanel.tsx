import React, { useMemo } from 'react';
import type {
  StudentProgressSnapshot,
  Quest,
  QuestProgressRecord,
  SubjectProgressRecord,
  AchievementBadge,
  MasteryLevel,
} from '../types';

interface StudentProgressPanelProps {
  progress: StudentProgressSnapshot;
  quests: Quest[];
  onContinueQuest: (questId: string) => void;
  onCreateQuestFromSteps: (steps: string[], questTitle?: string) => void;
}

const masteryRank: MasteryLevel[] = ['novice', 'apprentice', 'adept', 'master'];

const masteryLabels: Record<MasteryLevel, string> = {
  novice: 'Novice',
  apprentice: 'Apprentice',
  adept: 'Adept',
  master: 'Master',
};

const masteryDescriptions: Record<MasteryLevel, string> = {
  novice: 'Just getting started—keep exploring quests to grow your skills.',
  apprentice: 'Building momentum and applying what you have learned.',
  adept: 'Demonstrating strong understanding across multiple quests.',
  master: 'Consistently mastering objectives with confident expertise.',
};

const StudentProgressPanel: React.FC<StudentProgressPanelProps> = ({
  progress,
  quests,
  onContinueQuest,
  onCreateQuestFromSteps,
}) => {
  const questRecords = useMemo(() => Object.values(progress.quests), [progress.quests]);
  const subjectRecords = useMemo(() => Object.values(progress.subjects), [progress.subjects]);

  const completedCount = questRecords.filter((record) => record.status === 'completed').length;
  const inProgressCount = questRecords.filter((record) => record.status === 'in_progress').length;
  const trackedCount = questRecords.length;

  const questMap = useMemo(() => {
    const map = new Map<string, Quest>();
    quests.forEach((quest) => {
      map.set(quest.id, quest);
    });
    return map;
  }, [quests]);

  const activeNextSteps = questRecords
    .filter((record) => record.status !== 'completed' && record.nextSteps.length > 0)
    .sort((a, b) => b.lastUpdated - a.lastUpdated)
    .slice(0, 3);

  const topSubjects = [...subjectRecords]
    .sort((a, b) => {
      const aRank = masteryRank.indexOf(a.masteryLevel);
      const bRank = masteryRank.indexOf(b.masteryLevel);
      if (aRank !== bRank) {
        return bRank - aRank;
      }
      const aRatio = a.totalQuests > 0 ? a.completedQuests / a.totalQuests : 0;
      const bRatio = b.totalQuests > 0 ? b.completedQuests / b.totalQuests : 0;
      if (aRatio !== bRatio) {
        return bRatio - aRatio;
      }
      return b.lastUpdated - a.lastUpdated;
    })
    .slice(0, 4);

  const achievements = progress.achievements.slice(0, 6);

  const renderSubject = (subject: SubjectProgressRecord) => {
    const completionRatio = subject.totalQuests > 0 ? subject.completedQuests / subject.totalQuests : 0;
    const percentage = Math.round(completionRatio * 100);
    return (
      <div
        key={subject.subjectId}
        className="bg-gray-900/60 border border-amber-400/30 rounded-lg p-4 flex flex-col gap-3"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400">Subject Mastery</p>
            <h4 className="text-lg font-semibold text-amber-200">{subject.subjectName}</h4>
          </div>
          <span className="text-xs font-semibold px-2 py-1 rounded-full bg-emerald-600/20 text-emerald-200">
            {masteryLabels[subject.masteryLevel]}
          </span>
        </div>
        <p className="text-sm text-gray-300 leading-relaxed">
          {masteryDescriptions[subject.masteryLevel]}
        </p>
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide">
            {subject.completedQuests} of {subject.totalQuests} quests completed
          </p>
          <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden mt-1">
            <div
              className="h-full bg-amber-500"
              style={{ width: `${Math.min(100, percentage)}%` }}
            />
          </div>
        </div>
        {subject.nextSteps.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wide text-amber-200 mb-1">Next Focus</p>
            <ul className="list-disc list-inside text-sm text-gray-200 space-y-1">
              {subject.nextSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const renderNextStepCard = (record: QuestProgressRecord) => {
    const quest = questMap.get(record.questId);
    const questTitle = quest?.title ?? record.questTitle;
    return (
      <div
        key={record.questId}
        className="bg-gray-900/50 border border-teal-400/30 rounded-lg p-4 flex flex-col gap-3"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400">Learning Quest</p>
            <h4 className="text-lg font-semibold text-teal-200">{questTitle}</h4>
          </div>
          <span className="text-xs font-semibold px-2 py-1 rounded-full bg-teal-600/30 text-teal-100">
            In Progress
          </span>
        </div>
        <ul className="list-disc list-inside text-sm text-gray-200 space-y-1">
          {record.nextSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={() => onContinueQuest(record.questId)}
            className="flex-1 bg-teal-600 hover:bg-teal-500 text-black font-semibold py-2 px-3 rounded-md transition-colors"
          >
            Continue Quest
          </button>
          <button
            type="button"
            onClick={() => onCreateQuestFromSteps(record.nextSteps, questTitle)}
            className="flex-1 bg-gray-800 hover:bg-gray-700 text-teal-200 font-semibold py-2 px-3 rounded-md border border-teal-500/40 transition-colors"
          >
            Spin New Quest
          </button>
        </div>
      </div>
    );
  };

  const renderAchievement = (badge: AchievementBadge) => {
    const earnedDate = new Date(badge.earnedAt).toLocaleDateString();
    return (
      <div
        key={badge.id}
        className="bg-gray-900/40 border border-amber-500/20 rounded-lg p-4 flex flex-col gap-2"
      >
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-amber-200">{badge.title}</h4>
          <span className="text-xs text-gray-500">{earnedDate}</span>
        </div>
        <p className="text-sm text-gray-300">{badge.description}</p>
      </div>
    );
  };

  if (trackedCount === 0 && achievements.length === 0) {
    return null;
  }

  return (
    <div className="max-w-3xl mx-auto mb-10 space-y-6">
      <div className="bg-gray-900/60 border border-amber-400/40 rounded-xl p-6 shadow-lg shadow-amber-900/20">
        <h3 className="text-xl font-semibold text-amber-200 mb-4">Learning Progress Tracker</h3>
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="bg-gray-800/70 rounded-lg p-4 border border-gray-700">
            <p className="text-xs uppercase tracking-wide text-gray-400">Quests Completed</p>
            <p className="text-3xl font-bold text-emerald-300">{completedCount}</p>
            <p className="text-xs text-gray-500 mt-1">
              {trackedCount > 0 ? `${completedCount} of ${trackedCount} tracked quests` : 'Ready to begin your first quest'}
            </p>
          </div>
          <div className="bg-gray-800/70 rounded-lg p-4 border border-gray-700">
            <p className="text-xs uppercase tracking-wide text-gray-400">Active Journeys</p>
            <p className="text-3xl font-bold text-teal-300">{inProgressCount}</p>
            <p className="text-xs text-gray-500 mt-1">Currently in progress with clear next steps.</p>
          </div>
          <div className="bg-gray-800/70 rounded-lg p-4 border border-gray-700">
            <p className="text-xs uppercase tracking-wide text-gray-400">Achievements</p>
            <p className="text-3xl font-bold text-amber-300">{progress.achievements.length}</p>
            <p className="text-xs text-gray-500 mt-1">Badges earned from your learning victories.</p>
          </div>
        </div>
      </div>

      {topSubjects.length > 0 && (
        <div className="bg-gray-900/60 border border-amber-400/30 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-amber-200">Subject Mastery Highlights</h3>
            <span className="text-xs text-gray-400 uppercase tracking-wide">Top focus areas</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {topSubjects.map((subject) => renderSubject(subject))}
          </div>
        </div>
      )}

      {activeNextSteps.length > 0 && (
        <div className="bg-gray-900/60 border border-teal-400/30 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-teal-200">Next Recommended Actions</h3>
            <span className="text-xs text-gray-400 uppercase tracking-wide">Guided by your mentors</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {activeNextSteps.map((record) => renderNextStepCard(record))}
          </div>
        </div>
      )}

      {achievements.length > 0 && (
        <div className="bg-gray-900/60 border border-amber-500/30 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-amber-200">Badge Showcase</h3>
            <span className="text-xs text-gray-400 uppercase tracking-wide">Celebrating your wins</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {achievements.map((achievement) => renderAchievement(achievement))}
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentProgressPanel;
