import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { GoogleGenAI, Type } from '@google/genai';

import type {
  Character,
  Quest,
  ConversationTurn,
  SavedConversation,
  Summary,
  QuestAssessment,
  StudentProgressSnapshot,
  QuestStatus,
  MasteryLevel,
} from './types';

import CharacterSelector from './components/CharacterSelector';
import ConversationView from './components/ConversationView';
import HistoryView from './components/HistoryView';
import CharacterCreator from './components/CharacterCreator';
import QuestsView from './components/QuestsView';
import Instructions from './components/Instructions';
import QuestIcon from './components/icons/QuestIcon';
import QuestCreator from './components/QuestCreator'; // NEW
import StudentProgressPanel from './components/StudentProgressPanel';

import { CHARACTERS, QUESTS } from './constants';

const CUSTOM_CHARACTERS_KEY = 'school-of-the-ancients-custom-characters';
const HISTORY_KEY = 'school-of-the-ancients-history';
const COMPLETED_QUESTS_KEY = 'school-of-the-ancients-completed-quests';
const CUSTOM_QUESTS_KEY = 'school-of-the-ancients-custom-quests';
const STUDENT_PROGRESS_KEY = 'school-of-the-ancients-student-progress';

const masteryOrder: MasteryLevel[] = ['novice', 'apprentice', 'adept', 'master'];

const masteryLabelMap: Record<MasteryLevel, string> = {
  novice: 'Novice',
  apprentice: 'Apprentice',
  adept: 'Adept',
  master: 'Master',
};

const createEmptyProgress = (): StudentProgressSnapshot => ({
  quests: {},
  subjects: {},
  achievements: [],
});

const determineMasteryLevel = (completed: number, total: number): MasteryLevel => {
  if (total <= 0) {
    return 'novice';
  }
  const ratio = completed / total;
  if (ratio >= 1) {
    return 'master';
  }
  if (ratio >= 0.75) {
    return 'adept';
  }
  if (ratio >= 0.5) {
    return 'apprentice';
  }
  return 'novice';
};

// ---- Local storage helpers -------------------------------------------------

const loadConversations = (): SavedConversation[] => {
  try {
    const rawHistory = localStorage.getItem(HISTORY_KEY);
    return rawHistory ? JSON.parse(rawHistory) : [];
  } catch (error) {
    console.error('Failed to load conversation history:', error);
    return [];
  }
};

const saveConversationToLocalStorage = (conversation: SavedConversation) => {
  try {
    const history = loadConversations();
    const existingIndex = history.findIndex((c) => c.id === conversation.id);
    if (existingIndex > -1) {
      history[existingIndex] = conversation;
    } else {
      history.unshift(conversation);
    }
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (error) {
    console.error('Failed to save conversation:', error);
  }
};

const loadCompletedQuests = (): string[] => {
  try {
    const stored = localStorage.getItem(COMPLETED_QUESTS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Failed to load completed quests:', error);
    return [];
  }
};

const saveCompletedQuests = (questIds: string[]) => {
  try {
    localStorage.setItem(COMPLETED_QUESTS_KEY, JSON.stringify(questIds));
  } catch (error) {
    console.error('Failed to save completed quests:', error);
  }
};

const loadCustomQuests = (): Quest[] => {
  try {
    const stored = localStorage.getItem(CUSTOM_QUESTS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Failed to load custom quests:', error);
    return [];
  }
};

const saveCustomQuests = (quests: Quest[]) => {
  try {
    localStorage.setItem(CUSTOM_QUESTS_KEY, JSON.stringify(quests));
  } catch (error) {
    console.error('Failed to save custom quests:', error);
  }
};

const loadStudentProgress = (): StudentProgressSnapshot => {
  try {
    const stored = localStorage.getItem(STUDENT_PROGRESS_KEY);
    if (!stored) {
      return createEmptyProgress();
    }
    const parsed = JSON.parse(stored);
    return {
      quests: parsed?.quests ?? {},
      subjects: parsed?.subjects ?? {},
      achievements: Array.isArray(parsed?.achievements) ? parsed.achievements : [],
    };
  } catch (error) {
    console.error('Failed to load student progress:', error);
    return createEmptyProgress();
  }
};

const saveStudentProgress = (progress: StudentProgressSnapshot) => {
  try {
    localStorage.setItem(STUDENT_PROGRESS_KEY, JSON.stringify(progress));
  } catch (error) {
    console.error('Failed to save student progress:', error);
  }
};

interface ProgressUpdateParams {
  status?: QuestStatus;
  assessment?: QuestAssessment | null;
  transcriptLength?: number;
  nextSteps?: string[];
}

const QUEST_COMPLETION_MILESTONES = [
  {
    count: 1,
    id: 'milestone-quest-1',
    title: 'First Footsteps',
    description: 'Completed your first learning quest.',
  },
  {
    count: 3,
    id: 'milestone-quest-3',
    title: 'Quest Explorer',
    description: 'Completed three quests guided by the ancients.',
  },
  {
    count: 5,
    id: 'milestone-quest-5',
    title: 'Quest Champion',
    description: 'Completed five quests and unlocked deeper wisdom.',
  },
];

// ---- App -------------------------------------------------------------------

const App: React.FC = () => {
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [view, setView] = useState<
    'selector' | 'conversation' | 'history' | 'creator' | 'quests' | 'questCreator'
  >('selector');

  const [customCharacters, setCustomCharacters] = useState<Character[]>([]);
  const [customQuests, setCustomQuests] = useState<Quest[]>([]);
  const [environmentImageUrl, setEnvironmentImageUrl] = useState<string | null>(null);
  const [activeQuest, setActiveQuest] = useState<Quest | null>(null);
  const [resumeConversationId, setResumeConversationId] = useState<string | null>(null);

  // end-conversation save/AI-eval flag
  const [isSaving, setIsSaving] = useState(false);

  const [completedQuests, setCompletedQuests] = useState<string[]>([]);
  const [lastQuestOutcome, setLastQuestOutcome] = useState<QuestAssessment | null>(null);
  const [inProgressQuestIds, setInProgressQuestIds] = useState<string[]>([]);
  const [questCreatorPrefill, setQuestCreatorPrefill] = useState<string | null>(null);
  const [studentProgress, setStudentProgress] = useState<StudentProgressSnapshot>(createEmptyProgress());

  const allQuests = useMemo(() => [...customQuests, ...QUESTS], [customQuests]);
  const subjectQuestCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allQuests.forEach((quest) => {
      const key = quest.objective.trim().toLowerCase() || quest.id;
      counts[key] = (counts[key] ?? 0) + 1;
    });
    return counts;
  }, [allQuests]);

  useEffect(() => {
    setStudentProgress(loadStudentProgress());
  }, []);

  const updateStudentProgress = useCallback(
    (updater: (prev: StudentProgressSnapshot) => StudentProgressSnapshot) => {
      setStudentProgress((prev) => {
        const next = updater(prev);
        if (next === prev) {
          return prev;
        }
        saveStudentProgress(next);
        return next;
      });
    },
    []
  );

  useEffect(() => {
    updateStudentProgress((prev) => {
      let changed = false;
      const subjects = { ...prev.subjects };
      Object.entries(subjects).forEach(([key, subject]) => {
        const updatedTotal = subjectQuestCounts[key];
        if (typeof updatedTotal === 'number' && updatedTotal > 0 && updatedTotal !== subject.totalQuests) {
          subjects[key] = {
            ...subject,
            totalQuests: Math.max(updatedTotal, subject.completedQuests),
          };
          changed = true;
        }
      });
      if (!changed) {
        return prev;
      }
      return {
        ...prev,
        subjects,
      };
    });
  }, [subjectQuestCounts, updateStudentProgress]);

  const applyQuestProgressUpdate = useCallback(
    (quest: Quest, params: ProgressUpdateParams) => {
      updateStudentProgress((prev) => {
        const now = Date.now();
        const objectiveKey = quest.objective.trim().toLowerCase() || quest.id;
        const previousRecord = prev.quests[quest.id];
        const previousSubject = prev.subjects[objectiveKey];

        const transcriptStatus =
          params.transcriptLength && params.transcriptLength > 1 ? 'in_progress' : previousRecord?.status ?? 'not_started';

        let computedStatus: QuestStatus = params.status
          ? params.status
          : params.assessment?.passed
            ? 'completed'
            : params.assessment
              ? 'in_progress'
              : transcriptStatus;

        if (previousRecord?.status === 'completed' && computedStatus !== 'completed') {
          computedStatus = 'completed';
        }

        const normalizedSteps = (params.assessment
          ? params.assessment.improvements
          : params.nextSteps ?? previousRecord?.nextSteps ?? [])
          .map((step) => step.trim())
          .filter(Boolean);

        const quests = { ...prev.quests };
        const record = {
          questId: quest.id,
          questTitle: quest.title,
          characterId: quest.characterId,
          objective: quest.objective,
          objectiveKey,
          status: computedStatus,
          lastUpdated: now,
          lastAssessment: params.assessment ?? previousRecord?.lastAssessment,
          nextSteps: computedStatus === 'completed' ? [] : normalizedSteps,
        };
        quests[quest.id] = record;

        const subjectRecords = Object.values(quests).filter((entry) => entry.objectiveKey === objectiveKey);
        const completedForSubject = subjectRecords.filter((entry) => entry.status === 'completed').length;
        const baseTotal = subjectQuestCounts[objectiveKey] ?? (subjectRecords.length || 1);
        const resolvedTotal = Math.max(baseTotal, subjectRecords.length || 1, completedForSubject || 1);
        const aggregatedNextSteps = Array.from(
          new Set(
            subjectRecords
              .filter((entry) => entry.status !== 'completed')
              .flatMap((entry) => entry.nextSteps)
              .filter((step) => step && step.trim().length > 0)
          )
        );

        const subjects = { ...prev.subjects };
        const subject = {
          subjectId: objectiveKey,
          subjectName: quest.objective,
          totalQuests: resolvedTotal,
          completedQuests: completedForSubject,
          masteryLevel: determineMasteryLevel(completedForSubject, resolvedTotal),
          lastUpdated: now,
          nextSteps: aggregatedNextSteps,
          recentQuestTitle: quest.title,
        };
        subjects[objectiveKey] = subject;

        let achievements = [...prev.achievements];
        const pushAchievement = (
          id: string,
          title: string,
          description: string,
          questId?: string,
          subjectId?: string
        ) => {
          if (achievements.some((existing) => existing.id === id)) {
            return;
          }
          achievements = [
            ...achievements,
            {
              id,
              title,
              description,
              earnedAt: now,
              questId,
              subjectId,
            },
          ];
        };

        if (params.assessment?.passed) {
          const description = params.assessment.summary?.trim()
            ? params.assessment.summary.trim()
            : `Mastered the quest objective: ${quest.objective}.`;
          pushAchievement(
            `quest-${quest.id}-completed`,
            `Conquered: ${quest.title}`,
            description,
            quest.id,
            objectiveKey
          );
        } else if (params.assessment && params.assessment.improvements.length > 0) {
          pushAchievement(
            `quest-${quest.id}-growth`,
            `Growth Path: ${quest.title}`,
            'Mapped out clear next steps with your mentor for continued progress.',
            quest.id,
            objectiveKey
          );
        }

        const previousMastery = previousSubject?.masteryLevel ?? 'novice';
        if (masteryOrder.indexOf(subject.masteryLevel) > masteryOrder.indexOf(previousMastery)) {
          const masteryTitle =
            subject.masteryLevel === 'master'
              ? `${subject.subjectName} Master`
              : `${subject.subjectName} ${masteryLabelMap[subject.masteryLevel]}`;
          pushAchievement(
            `subject-${objectiveKey}-${subject.masteryLevel}`,
            masteryTitle,
            `Advanced to the ${masteryLabelMap[subject.masteryLevel]} tier in ${subject.subjectName}.`,
            undefined,
            objectiveKey
          );
        }

        const totalCompleted = Object.values(quests).filter((entry) => entry.status === 'completed').length;
        QUEST_COMPLETION_MILESTONES.forEach((milestone) => {
          if (totalCompleted >= milestone.count) {
            pushAchievement(milestone.id, milestone.title, milestone.description);
          }
        });

        achievements.sort((a, b) => b.earnedAt - a.earnedAt);

        return {
          ...prev,
          quests,
          subjects,
          achievements,
        };
      });
    },
    [subjectQuestCounts, updateStudentProgress]
  );

  const markQuestInProgress = useCallback(
    (quest: Quest) => {
      applyQuestProgressUpdate(quest, { status: 'in_progress' });
    },
    [applyQuestProgressUpdate]
  );

  const syncQuestProgress = useCallback(() => {
    const history = loadConversations();
    const inProgress = new Set<string>();
    history.forEach((conversation) => {
      if (!conversation.questId) return;
      if (conversation.questAssessment?.passed) return;
      if (conversation.transcript && conversation.transcript.length > 1) {
        inProgress.add(conversation.questId);
      }
    });
    setInProgressQuestIds(Array.from(inProgress));
  }, []);

  // On mount: load saved characters, url param character, and progress
  useEffect(() => {
    let loadedCustomCharacters: Character[] = [];
    let loadedCustomQuests: Quest[] = [];
    try {
      const storedCharacters = localStorage.getItem(CUSTOM_CHARACTERS_KEY);
      if (storedCharacters) {
        loadedCustomCharacters = JSON.parse(storedCharacters);
        setCustomCharacters(loadedCustomCharacters);
      }
    } catch (e) {
      console.error('Failed to load custom characters:', e);
    }

    loadedCustomQuests = loadCustomQuests();
    if (loadedCustomQuests.length > 0) {
      setCustomQuests(loadedCustomQuests);
    }

    const urlParams = new URLSearchParams(window.location.search);
    const characterId = urlParams.get('character');
    if (characterId) {
      const allCharacters = [...loadedCustomCharacters, ...CHARACTERS];
      const characterFromUrl = allCharacters.find((c) => c.id === characterId);
      if (characterFromUrl) {
        setSelectedCharacter(characterFromUrl);
        setView('conversation');
      }
    }

    setCompletedQuests(loadCompletedQuests());
    syncQuestProgress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncQuestProgress]);

  // ---- Navigation helpers ----

  const handleSelectCharacter = (character: Character) => {
    setSelectedCharacter(character);
    setView('conversation');
    setActiveQuest(null); // clear any quest when directly picking a character
    setResumeConversationId(null);
    const url = new URL(window.location.href);
    url.searchParams.set('character', character.id);
    window.history.pushState({}, '', url);
  };

  const handleSelectQuest = (quest: Quest) => {
    const allCharacters = [...customCharacters, ...CHARACTERS];
    const characterForQuest = allCharacters.find((c) => c.id === quest.characterId);
    if (characterForQuest) {
      setActiveQuest(quest);
      setSelectedCharacter(characterForQuest);
      setView('conversation');
      setResumeConversationId(null);
      markQuestInProgress(quest);
      const url = new URL(window.location.href);
      url.searchParams.set('character', characterForQuest.id);
      window.history.pushState({}, '', url);
    } else {
      console.error(`Character with ID ${quest.characterId} not found for the selected quest.`);
    }
  };

  const handleContinueQuest = (questId: string | undefined) => {
    if (!questId) {
      return;
    }
    const questToResume = allQuests.find((quest) => quest.id === questId);
    if (!questToResume) {
      console.warn(`Quest with ID ${questId} could not be found for continuation.`);
      return;
    }
    markQuestInProgress(questToResume);
    handleSelectQuest(questToResume);
  };

  const handleProgressQuestContinue = useCallback(
    (questId: string) => {
      handleContinueQuest(questId);
    },
    [handleContinueQuest]
  );

  const handleResumeConversation = (conversation: SavedConversation) => {
    const allCharacters = [...customCharacters, ...CHARACTERS];
    const characterToResume = allCharacters.find((c) => c.id === conversation.characterId);

    if (!characterToResume) {
      console.error(`Unable to resume conversation: character with ID ${conversation.characterId} not found.`);
      return;
    }

    setResumeConversationId(conversation.id);
    setSelectedCharacter(characterToResume);
    setEnvironmentImageUrl(conversation.environmentImageUrl || null);

    if (conversation.questId) {
      const questToResume = allQuests.find((quest) => quest.id === conversation.questId);
      if (questToResume) {
        setActiveQuest(questToResume);
        markQuestInProgress(questToResume);
      } else {
        console.warn(`Quest with ID ${conversation.questId} not found while resuming conversation.`);
        setActiveQuest(null);
      }
    } else {
      setActiveQuest(null);
    }

    setView('conversation');

    const url = new URL(window.location.href);
    url.searchParams.set('character', characterToResume.id);
    window.history.pushState({}, '', url);
  };

  const handleCharacterCreated = (newCharacter: Character) => {
    const updatedCharacters = [newCharacter, ...customCharacters];
    setCustomCharacters(updatedCharacters);
    try {
      localStorage.setItem(CUSTOM_CHARACTERS_KEY, JSON.stringify(updatedCharacters));
    } catch (e) {
      console.error('Failed to save custom character:', e);
    }
    handleSelectCharacter(newCharacter);
  };

  const handleDeleteCharacter = (characterId: string) => {
    if (window.confirm('Are you sure you want to permanently delete this ancient?')) {
      const updatedCharacters = customCharacters.filter((c) => c.id !== characterId);
      setCustomCharacters(updatedCharacters);
      try {
        localStorage.setItem(CUSTOM_CHARACTERS_KEY, JSON.stringify(updatedCharacters));
      } catch (e) {
        console.error('Failed to delete custom character:', e);
      }
    }
  };

  const handleDeleteQuest = (questId: string) => {
    const questToDelete = customQuests.find((quest) => quest.id === questId);
    if (!questToDelete) {
      return;
    }

    const confirmed = window.confirm('Are you sure you want to permanently delete this quest? This cannot be undone.');
    if (!confirmed) {
      return;
    }

    setCustomQuests((prev) => {
      const updated = prev.filter((quest) => quest.id !== questId);
      saveCustomQuests(updated);
      return updated;
    });

    setCompletedQuests((prev) => {
      if (!prev.includes(questId)) {
        return prev;
      }
      const updated = prev.filter((id) => id !== questId);
      saveCompletedQuests(updated);
      return updated;
    });

    setInProgressQuestIds((prev) => prev.filter((id) => id !== questId));

    setActiveQuest((current) => (current?.id === questId ? null : current));

    updateStudentProgress((prev) => {
      if (!prev.quests[questId]) {
        return prev;
      }

      const quests = { ...prev.quests };
      const record = quests[questId];
      delete quests[questId];

      const subjects = { ...prev.subjects };
      let achievements = prev.achievements.filter((achievement) => achievement.questId !== questId);

      if (record) {
        const objectiveKey = record.objectiveKey;
        const remainingRecords = Object.values(quests).filter((entry) => entry.objectiveKey === objectiveKey);
        if (remainingRecords.length === 0) {
          delete subjects[objectiveKey];
        } else {
          const completedForSubject = remainingRecords.filter((entry) => entry.status === 'completed').length;
          const aggregatedNextSteps = Array.from(
            new Set(
              remainingRecords
                .filter((entry) => entry.status !== 'completed')
                .flatMap((entry) => entry.nextSteps)
                .filter((step) => step && step.trim().length > 0)
            )
          );
          const updatedTotal = subjectQuestCounts[objectiveKey] ?? (remainingRecords.length || 1);
          const resolvedTotal = Math.max(updatedTotal, remainingRecords.length || 1, completedForSubject || 1);
          const existingSubject = subjects[objectiveKey];
          subjects[objectiveKey] = {
            subjectId: objectiveKey,
            subjectName: existingSubject?.subjectName ?? record.objective,
            totalQuests: resolvedTotal,
            completedQuests: completedForSubject,
            masteryLevel: determineMasteryLevel(completedForSubject, resolvedTotal),
            lastUpdated: Date.now(),
            nextSteps: aggregatedNextSteps,
            recentQuestTitle: remainingRecords[0]?.questTitle ?? existingSubject?.recentQuestTitle,
          };
        }
        achievements = achievements.filter((achievement) => achievement.subjectId !== objectiveKey || subjects[objectiveKey]);
      }

      return {
        ...prev,
        quests,
        subjects,
        achievements,
      };
    });
  };

  const openQuestCreator = (goal?: string | null) => {
    setQuestCreatorPrefill(goal ?? null);
    setView('questCreator');
  };

  const handleCreateQuestFromNextSteps = (steps: string[], questTitle?: string) => {
    const trimmedSteps = steps.map((step) => step.trim()).filter(Boolean);
    if (trimmedSteps.length === 0) {
      openQuestCreator();
      return;
    }

    const bulletList = trimmedSteps.map((step) => `- ${step}`).join('\n');
    const intro = questTitle
      ? `I need a follow-up quest to improve at "${questTitle}".`
      : 'I need a new quest to improve my understanding.';
    const prefill = `${intro}\nFocus on:\n${bulletList}`;

    openQuestCreator(prefill);
  };

  // NEW: handle a freshly-generated quest & mentor from QuestCreator
  const startGeneratedQuest = (quest: Quest, mentor: Character) => {
    setQuestCreatorPrefill(null);
    setCustomQuests((prev) => {
      const existingIndex = prev.findIndex((q) => q.id === quest.id);
      let updated: Quest[];
      if (existingIndex > -1) {
        updated = [...prev];
        updated[existingIndex] = quest;
      } else {
        updated = [quest, ...prev];
      }
      saveCustomQuests(updated);
      return updated;
    });
    setActiveQuest(quest);
    setSelectedCharacter(mentor);
    setView('conversation');
    setResumeConversationId(null);
    markQuestInProgress(quest);
    const url = new URL(window.location.href);
    url.searchParams.set('character', mentor.id);
    window.history.pushState({}, '', url);
  };

  // ---- End conversation: summarize & (if quest) evaluate mastery ----
  const handleEndConversation = async (transcript: ConversationTurn[], sessionId: string) => {
    if (!selectedCharacter) return;
    setIsSaving(true);
    let questAssessment: QuestAssessment | null = null;

    try {
      const conversationHistory = loadConversations();
      const existingConversation = conversationHistory.find((c) => c.id === sessionId);

      let updatedConversation: SavedConversation =
        existingConversation ??
        ({
          id: sessionId,
          characterId: selectedCharacter.id,
          characterName: selectedCharacter.name,
          portraitUrl: selectedCharacter.portraitUrl,
          timestamp: Date.now(),
          transcript,
          environmentImageUrl: environmentImageUrl || undefined,
        } as SavedConversation);

      updatedConversation = {
        ...updatedConversation,
        transcript,
        environmentImageUrl: environmentImageUrl || undefined,
        timestamp: Date.now(),
      };

      if (activeQuest) {
        updatedConversation = {
          ...updatedConversation,
          questId: activeQuest.id,
          questTitle: activeQuest.title,
        };
      }

      let ai: GoogleGenAI | null = null;
      if (!process.env.API_KEY) {
        console.error('API_KEY not set, skipping summary and quest assessment.');
      } else {
        ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      }

      // Conversation summary (skip first system/greeting turn)
      if (ai && transcript.length > 1) {
        const transcriptText = transcript
          .slice(1)
          .map((turn) => `${turn.speakerName}: ${turn.text}`)
          .join('\n\n');

        if (transcriptText.trim()) {
          const prompt = `Please summarize the following educational dialogue with ${selectedCharacter.name}. Provide a concise one-paragraph overview of the key topics discussed, and then list 3-5 of the most important takeaways or concepts as bullet points.

Dialogue:
${transcriptText}`;

          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  overview: { type: Type.STRING, description: 'A one-paragraph overview of the conversation.' },
                  takeaways: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: 'A list of 3-5 key takeaways from the conversation.',
                  },
                },
                required: ['overview', 'takeaways'],
              },
            },
          });

          const summary: Summary = JSON.parse(response.text);
          updatedConversation = {
            ...updatedConversation,
            summary,
            timestamp: Date.now(),
          };
        }
      }

      // If this was a quest session, evaluate mastery
      if (ai && activeQuest) {
        const questTranscriptText = transcript.map((turn) => `${turn.speakerName}: ${turn.text}`).join('\n\n');

        if (questTranscriptText.trim()) {
          const evaluationPrompt = `You are a meticulous mentor evaluating whether a student has mastered the quest "${activeQuest.title}". Review the conversation transcript between the mentor and student. Determine if the student demonstrates a working understanding of the quest objective: "${activeQuest.objective}".

Return a JSON object with this structure:
{
  "passed": boolean,
  "summary": string,          // one or two sentences explaining your verdict in plain language
  "evidence": string[],       // bullet-friendly phrases citing what the student said that shows understanding
  "improvements": string[]    // actionable suggestions if the student has gaps (empty if passed)
}

Focus only on the student's contributions. Mark passed=true only if the learner clearly articulates key ideas from the objective.`;

          const evaluationResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: evaluationPrompt + `\n\nTranscript:\n${questTranscriptText}`,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  passed: { type: Type.BOOLEAN },
                  summary: { type: Type.STRING },
                  evidence: { type: Type.ARRAY, items: { type: Type.STRING } },
                  improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ['passed', 'summary', 'evidence', 'improvements'],
              },
            },
          });

          const evaluation = JSON.parse(evaluationResponse.text);
          questAssessment = {
            questId: activeQuest.id,
            questTitle: activeQuest.title,
            passed: Boolean(evaluation.passed),
            summary: evaluation.summary || '',
            evidence: Array.isArray(evaluation.evidence) ? evaluation.evidence : [],
            improvements: Array.isArray(evaluation.improvements) ? evaluation.improvements : [],
          };

          updatedConversation = {
            ...updatedConversation,
            questAssessment,
          };

          if (questAssessment.passed) {
            setCompletedQuests((prev) => {
              if (prev.includes(activeQuest.id)) {
                saveCompletedQuests(prev);
                return prev;
              }
              const updated = [...prev, activeQuest.id]; // FIX
              saveCompletedQuests(updated);
              return updated;
            });
          } else {
            setCompletedQuests((prev) => {
              if (!prev.includes(activeQuest.id)) {
                saveCompletedQuests(prev);
                return prev;
              }
              const updated = prev.filter((id) => id !== activeQuest.id);
              saveCompletedQuests(updated);
              return updated;
            });
          }
        }
      } else if (activeQuest) {
        // Ensure quest metadata is retained even without AI assistance.
        updatedConversation = {
          ...updatedConversation,
          questId: activeQuest.id,
          questTitle: activeQuest.title,
        };
      }

      saveConversationToLocalStorage(updatedConversation);
      if (activeQuest) {
        applyQuestProgressUpdate(activeQuest, {
          assessment: questAssessment,
          transcriptLength: transcript.length,
        });
      }
      syncQuestProgress();
    } catch (error) {
      console.error('Failed to finalize conversation:', error);
    } finally {
      setIsSaving(false);
      if (questAssessment) {
        setLastQuestOutcome(questAssessment);
      } else if (activeQuest) {
        setLastQuestOutcome(null);
      }
      setSelectedCharacter(null);
      setView('selector');
      setEnvironmentImageUrl(null);
      setActiveQuest(null);
      setResumeConversationId(null);
      window.history.pushState({}, '', window.location.pathname);
    }
  };

  // ---- View switcher ----

  const renderContent = () => {
    switch (view) {
      case 'conversation':
        return selectedCharacter ? (
          <ConversationView
            character={selectedCharacter}
            onEndConversation={handleEndConversation}
            environmentImageUrl={environmentImageUrl}
            onEnvironmentUpdate={setEnvironmentImageUrl}
            activeQuest={activeQuest}
            isSaving={isSaving} // pass saving state
            resumeConversationId={resumeConversationId}
          />
        ) : null;
      case 'history':
        return (
          <HistoryView
            onBack={() => setView('selector')}
            onResumeConversation={handleResumeConversation}
            onCreateQuestFromNextSteps={handleCreateQuestFromNextSteps}
          />
        );
      case 'creator':
        return <CharacterCreator onCharacterCreated={handleCharacterCreated} onBack={() => setView('selector')} />;
      case 'quests': {
        const allCharacters = [...customCharacters, ...CHARACTERS];
        return (
          <QuestsView
            onBack={() => setView('selector')}
            onSelectQuest={handleSelectQuest}
            quests={allQuests}
            characters={allCharacters}
            completedQuestIds={completedQuests}
            onCreateQuest={() => openQuestCreator()}
            inProgressQuestIds={inProgressQuestIds}
            onDeleteQuest={handleDeleteQuest}
            deletableQuestIds={customQuests.map((quest) => quest.id)}
          />
        );
      }
      case 'questCreator': {
        const allChars = [...customCharacters, ...CHARACTERS];
        const handleBack = () => {
          setQuestCreatorPrefill(null);
          setView('selector');
        };
        const handleQuestReady = (quest: Quest, character: Character) => {
          setQuestCreatorPrefill(null);
          startGeneratedQuest(quest, character);
        };
        return (
          <QuestCreator
            characters={allChars}
            onBack={handleBack}
            onQuestReady={handleQuestReady}
            onCharacterCreated={(newChar) => {
              const updated = [newChar, ...customCharacters];
              setCustomCharacters(updated);
              try {
                localStorage.setItem(CUSTOM_CHARACTERS_KEY, JSON.stringify(updated));
              } catch {}
            }}
            initialGoal={questCreatorPrefill ?? undefined}
          />
        );
      }
      case 'selector':
      default:
        return (
          <div className="text-center animate-fade-in">
            <p className="max-w-3xl mx-auto mb-8 text-gray-400 text-lg">
              Engage in real-time voice conversations with legendary minds from history, or embark on a guided Learning
              Quest to master a new subject.
            </p>

            <div className="max-w-3xl mx-auto mb-8 bg-gray-800/50 border border-gray-700 rounded-lg p-4 text-left">
              <p className="text-sm text-gray-300 mb-2 font-semibold">Quest Progress</p>
              <p className="text-xs uppercase tracking-wide text-gray-400 mb-3">
                {completedQuests.length} of {allQuests.length} quests completed
              </p>
              <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 transition-all duration-500"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round(
                        (completedQuests.length / Math.max(allQuests.length, 1)) * 100
                      )
                    )}%`,
                  }}
                />
              </div>
            </div>

            <StudentProgressPanel
              progress={studentProgress}
              quests={allQuests}
              onContinueQuest={handleProgressQuestContinue}
              onCreateQuestFromSteps={handleCreateQuestFromNextSteps}
            />

            {lastQuestOutcome && (
              <div
                className={`max-w-3xl mx-auto mb-8 rounded-lg border p-5 text-left shadow-lg ${
                  lastQuestOutcome.passed ? 'bg-emerald-900/40 border-emerald-700' : 'bg-red-900/30 border-red-700'
                }`}
              >
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-300 font-semibold">Latest Quest Review</p>
                    <h3 className="text-2xl font-bold text-amber-200 mt-1">{lastQuestOutcome.questTitle}</h3>
                  </div>
                  <span
                    className={`text-sm font-semibold px-3 py-1 rounded-full ${
                      lastQuestOutcome.passed ? 'bg-emerald-600 text-emerald-50' : 'bg-red-600 text-red-50'
                    }`}
                  >
                    {lastQuestOutcome.passed ? 'Completed' : 'Needs Review'}
                  </span>
                </div>

                <p className="text-gray-200 mt-4 leading-relaxed">{lastQuestOutcome.summary}</p>

                {lastQuestOutcome.evidence.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-semibold text-emerald-200 uppercase tracking-wide mb-1">Highlights</p>
                    <ul className="list-disc list-inside text-gray-100 space-y-1 text-sm">
                      {lastQuestOutcome.evidence.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {!lastQuestOutcome.passed && lastQuestOutcome.improvements.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-semibold text-red-200 uppercase tracking-wide mb-1">Next Steps</p>
                    <ul className="list-disc list-inside text-red-100 space-y-1 text-sm">
                      {lastQuestOutcome.improvements.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={() =>
                        handleCreateQuestFromNextSteps(
                          lastQuestOutcome.improvements,
                          lastQuestOutcome.questTitle
                        )
                      }
                      className="mt-3 inline-flex items-center text-sm font-semibold text-teal-200 border border-teal-500/60 px-3 py-1.5 rounded-md hover:bg-teal-600/20 focus:outline-none focus:ring-2 focus:ring-teal-400/60"
                    >
                      Turn next steps into a new quest
                    </button>
                  </div>
                )}

                {!lastQuestOutcome.passed && lastQuestOutcome.questId && (
                  <button
                    type="button"
                    onClick={() => handleContinueQuest(lastQuestOutcome.questId)}
                    className="mt-4 inline-flex items-center text-sm font-semibold text-amber-200 hover:text-amber-100 hover:underline focus:outline-none"
                  >
                    Continue quest?
                  </button>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row justify-center items-center gap-4 mb-12">
              <button
                onClick={() => setView('quests')}
                className="flex items-center gap-3 bg-amber-600 hover:bg-amber-500 text-black font-bold py-3 px-8 rounded-lg transition-colors duration-300 text-lg w-full sm:w-auto"
              >
                <QuestIcon className="w-6 h-6" />
                <span>Learning Quests</span>
              </button>

              <button
                onClick={() => setView('history')}
                className="bg-gray-700 hover:bg-gray-600 text-amber-300 font-bold py-3 px-8 rounded-lg transition-colors duration-300 border border-gray-600 w-full sm:w-auto"
              >
                View Conversation History
              </button>

              {/* NEW CTA */}
              <button
                onClick={() => openQuestCreator()}
                className="bg-teal-700 hover:bg-teal-600 text-white font-bold py-3 px-8 rounded-lg transition-colors duration-300 w-full sm:w-auto"
              >
                Create Your Quest
              </button>
            </div>

            <Instructions />

            <CharacterSelector
              characters={[...customCharacters, ...CHARACTERS]}
              onSelectCharacter={handleSelectCharacter}
              onStartCreation={() => setView('creator')}
              onDeleteCharacter={handleDeleteCharacter}
            />
          </div>
        );
    }
  };

  return (
    <div className="relative min-h-screen bg-[#1a1a1a]">
      <div
        className="absolute inset-0 bg-cover bg-center transition-opacity duration-1000 z-0"
        style={{ backgroundImage: environmentImageUrl ? `url(${environmentImageUrl})` : 'none' }}
      />
      {environmentImageUrl && <div className="absolute inset-0 bg-black/50 z-0" />}

      <div
        className="relative z-10 min-h-screen flex flex-col text-gray-200 font-serif p-4 sm:p-6 lg:p-8"
        style={{ background: environmentImageUrl ? 'transparent' : 'linear-gradient(to bottom right, #1a1a1a, #2b2b2b)' }}
      >
        <header className="text-center mb-8">
          <h1
            className="text-4xl sm:text-5xl md:text-6xl font-bold text-amber-300 tracking-wider"
            style={{ textShadow: '0 0 10px rgba(252, 211, 77, 0.5)' }}
          >
            School of the Ancients
          </h1>
          <p className="text-gray-400 mt-2 text-lg">Old world wisdom. New world classroom.</p>
        </header>

        <main className="max-w-7xl w-full mx-auto flex-grow flex flex-col">{renderContent()}</main>
      </div>
    </div>
  );
};

export default App;
